#!/usr/bin/env node

/**
 * Phase 210 Probe: ConvKeyToTok 0x05E620 reachability for digit tokens
 *
 * Goals:
 *   1. Statically disassemble 0x05E5E0..0x05E6D0 in ADL mode.
 *   2. Report lifted-block availability around 0x05E620 / 0x05E6A6.
 *   3. Boot a minimal runtime, seed digit-token staging variants, and trace
 *      exact/nearby entry requests for 500 steps while logging every block
 *      visited and every BufInsert call.
 *   4. Summarize whether a staged digit token can practically reach the
 *      0x05E620 / 0x05E6A6 BufInsert calls.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const STATIC_START = 0x05E5E0;
const STATIC_END = 0x05E6D0;

const BUF_INSERT = 0x05E2A0;
const CALL_SITE_620 = 0x05E620;
const CALL_SITE_6A6 = 0x05E6A6;
const ENTRY_630 = 0x05E630;
const ENTRY_6A4 = 0x05E6A4;

const TOKEN_STAGING_ADDR = 0xD0230E;
const OP3_AREA_ADDR = 0xD0060E;
const TOKEN_WINDOW_LENGTH = 9;
const DIGIT_TOKEN = 0x30; // token byte for "0"
const DIGIT_KEY_CODE = 0x92; // existing probe seed for a digit key
const SAVED_AF_SEED = 0x000040;

const KBD_RAW_SCAN_ADDR = 0xD00587;
const KBD_KEY_ADDR = 0xD0058C;
const KBD_GETKY_ADDR = 0xD0058D;
const KBD_GETCSC_SCAN_ADDR = 0xD0058E;

const EDIT_TOP_ADDR = 0xD02437;
const EDIT_CURSOR_ADDR = 0xD0243A;
const EDIT_TAIL_ADDR = 0xD0243D;
const EDIT_BTM_ADDR = 0xD02440;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MAX_LOOP_ITERATIONS = 8192;
const TRACE_STEP_LIMIT = 500;

const DISASM_WINDOWS = [
  { label: '0x05E620 local loop', start: 0x05E619, end: 0x05E62F },
  { label: '0x05E6A6 gating routine', start: 0x05E630, end: 0x05E6AE },
];

const TRACE_REQUESTS = [
  {
    id: 'request-05e620',
    label: 'Requested 0x05E620',
    entry: CALL_SITE_620,
    stackProfile: 'plain',
  },
  {
    id: 'near-05e630',
    label: 'Nearby 0x05E630',
    entry: ENTRY_630,
    stackProfile: 'plain',
  },
  {
    id: 'near-05e6a4',
    label: 'Nearby 0x05E6A4',
    entry: ENTRY_6A4,
    stackProfile: 'precall',
  },
];

const SEED_SCENARIOS = [
  {
    id: 'd0230e-stream',
    label: '0xD0230E raw stream',
    description: 'Write 0x30,0x00 at 0xD0230E and point HL at 0xD0230E.',
    apply(mem, cpu) {
      mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + TOKEN_WINDOW_LENGTH);
      mem[TOKEN_STAGING_ADDR] = DIGIT_TOKEN;
      mem[TOKEN_STAGING_ADDR + 1] = 0x00;
      cpu.hl = TOKEN_STAGING_ADDR;
    },
  },
  {
    id: 'd0230e-record',
    label: '0xD0230E record view',
    description: 'Write [0x00,0x30,0x00...] at 0xD0230E and point HL at 0xD0230F.',
    apply(mem, cpu) {
      mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + TOKEN_WINDOW_LENGTH);
      mem[TOKEN_STAGING_ADDR] = 0x00;
      mem[TOKEN_STAGING_ADDR + 1] = DIGIT_TOKEN;
      cpu.hl = TOKEN_STAGING_ADDR + 1;
    },
  },
  {
    id: 'd0060e-stream',
    label: '0xD0060E raw stream',
    description: 'Write 0x30,0x00 at 0xD0060E and point HL at 0xD0060E.',
    apply(mem, cpu) {
      mem.fill(0x00, OP3_AREA_ADDR, OP3_AREA_ADDR + TOKEN_WINDOW_LENGTH);
      mem[OP3_AREA_ADDR] = DIGIT_TOKEN;
      mem[OP3_AREA_ADDR + 1] = 0x00;
      cpu.hl = OP3_AREA_ADDR;
    },
  },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function blockKey(addr, mode = 'adl') {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
}

function effectiveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(effectiveMemAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(effectiveMemAddr(inst) ?? inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'from-mem') {
        return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(effectiveMemAddr(inst) ?? inst.addr)})`;
      }
      return `${prefix}LD (${hex(effectiveMemAddr(inst) ?? inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-load-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-store-reg':
      return `${prefix}LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-store-imm':
      return `${prefix}LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'indexed-alu':
      return `${prefix}${String(inst.op).toUpperCase()} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'rst': return `${prefix}RST ${hexByte(inst.target)}`;
    default:
      return `${prefix}[${inst.tag}]`;
  }
}

function disassembleRange(startPc, endPc) {
  const rows = [];
  let pc = startPc;

  while (pc < endPc) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst.length ?? 1);
    const key = blockKey(pc, 'adl');
    const markers = [];
    if (BLOCKS[key]) markers.push('BLOCK');
    if (pc === CALL_SITE_620) markers.push('CALLSITE_05E620');
    if (pc === CALL_SITE_6A6) markers.push('CALLSITE_05E6A6');
    if (inst.tag === 'call' && inst.target === BUF_INSERT) markers.push('BUFINSERT_CALL');
    rows.push({
      pc,
      pcHex: hex(pc),
      bytes: bytesToHex(rom, pc, length),
      text: formatInstruction(inst),
      tag: inst.tag,
      markers,
    });
    pc += length;
  }

  return rows;
}

function sliceDisasmRows(rows, start, endInclusive) {
  return rows.filter((row) => row.pc >= start && row.pc <= endInclusive);
}

function printRows(rows) {
  for (const row of rows) {
    const markerText = row.markers.length > 0 ? ` [${row.markers.join(', ')}]` : '';
    console.log(`${row.pcHex}: ${row.bytes.padEnd(18)} ${row.text}${markerText}`);
  }
}

function nearbyBlocks(target, radius = 0x10) {
  const start = target - radius;
  const end = target + radius;
  return Object.keys(BLOCKS)
    .filter((key) => key.endsWith(':adl'))
    .map((key) => Number.parseInt(key.slice(0, 6), 16))
    .filter((addr) => addr >= start && addr <= end)
    .sort((left, right) => left - right)
    .map((addr) => hex(addr));
}

function blockExistenceReport() {
  const allInRange = Object.keys(BLOCKS)
    .filter((key) => key.endsWith(':adl'))
    .map((key) => Number.parseInt(key.slice(0, 6), 16))
    .filter((addr) => addr >= STATIC_START && addr <= STATIC_END)
    .sort((left, right) => left - right)
    .map((addr) => hex(addr));

  return {
    exact: [
      { address: hex(CALL_SITE_620), exists: Boolean(BLOCKS[blockKey(CALL_SITE_620)]) },
      { address: hex(CALL_SITE_6A6), exists: Boolean(BLOCKS[blockKey(CALL_SITE_6A6)]) },
      { address: hex(ENTRY_630), exists: Boolean(BLOCKS[blockKey(ENTRY_630)]) },
      { address: hex(ENTRY_6A4), exists: Boolean(BLOCKS[blockKey(ENTRY_6A4)]) },
    ],
    nearby05E620: nearbyBlocks(CALL_SITE_620, 0x10),
    nearby05E6A6: nearbyBlocks(CALL_SITE_6A6, 0x10),
    allInRange,
  };
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x60), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc ?? 0) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc ?? 0) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc ?? 0) },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    steps: result?.steps ?? null,
    termination: returned ? 'sentinel' : (result?.termination ?? null),
  };
}

function createBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    boot,
    memInit,
    memory: new Uint8Array(mem),
  };
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR_ADDR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL_ADDR, EDIT_BUF_END);
  write24(mem, EDIT_BTM_ADDR, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

function seedKeyboardContext(mem, cpu) {
  cpu.a = DIGIT_KEY_CODE;
  mem[KBD_RAW_SCAN_ADDR] = DIGIT_KEY_CODE;
  mem[KBD_KEY_ADDR] = DIGIT_KEY_CODE;
  mem[KBD_GETKY_ADDR] = DIGIT_KEY_CODE;
  mem[KBD_GETCSC_SCAN_ADDR] = DIGIT_KEY_CODE;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function seedStack(cpu, mem, profile) {
  cpu.sp = STACK_TOP;
  if (profile === 'precall') {
    push24(cpu, mem, RETURN_SENTINEL);
    push24(cpu, mem, SAVED_AF_SEED);
    push24(cpu, mem, DIGIT_TOKEN);
    return;
  }
  push24(cpu, mem, RETURN_SENTINEL);
}

function snapshotCpu(cpu) {
  return {
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    sp: hex(cpu.sp),
  };
}

function traceEntry(baselineMem, scenario, request) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedEditBuffer(mem);
  seedKeyboardContext(mem, cpu);
  scenario.apply(mem, cpu);
  cpu.de = DIGIT_TOKEN;
  cpu.bc = 0x000001;
  seedStack(cpu, mem, request.stackProfile);

  const visited = [];
  const missingBlocks = [];
  const bufInsertCalls = [];
  let firstExecutableBlock = null;
  let termination = null;
  let errorMessage = null;

  try {
    const result = executor.runFrom(request.entry, 'adl', {
      maxSteps: TRACE_STEP_LIMIT,
      maxLoopIterations: 100,
      onBlock(pc, mode, meta, step) {
        const addr = pc & 0xFFFFFF;
        if (firstExecutableBlock === null) firstExecutableBlock = addr;
        visited.push(hex(addr));

        if (addr === BUF_INSERT) {
          bufInsertCalls.push({
            step: (step ?? 0) + 1,
            a: hexByte(cpu.a),
            bc: hex(cpu.bc),
            de: hex(cpu.de),
            d: hexByte(cpu.d),
            e: hexByte(cpu.e),
            hl: hex(cpu.hl),
            sp: hex(cpu.sp),
          });
        }

        if (addr === RETURN_SENTINEL) throw new Error('__TRACE_STOP__');
      },
      onMissingBlock(pc) {
        const addr = pc & 0xFFFFFF;
        missingBlocks.push(hex(addr));
        visited.push(`MISSING:${hex(addr)}`);
        if (addr === RETURN_SENTINEL) throw new Error('__TRACE_STOP__');
      },
    });
    termination = result.termination ?? 'unknown';
    if (result.error) errorMessage = result.error?.stack ?? String(result.error);
  } catch (error) {
    if (error?.message === '__TRACE_STOP__') {
      termination = 'sentinel';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  }

  return {
    requestId: request.id,
    requestLabel: request.label,
    requestedEntry: hex(request.entry),
    exactBlockExists: Boolean(BLOCKS[blockKey(request.entry)]),
    firstExecutableBlock: firstExecutableBlock === null ? null : hex(firstExecutableBlock),
    scenarioId: scenario.id,
    scenarioLabel: scenario.label,
    scenarioDescription: scenario.description,
    termination,
    errorMessage,
    blocksVisited: visited,
    totalBlocksVisited: visited.length,
    missingBlocks,
    bufInsertCalls,
    editCursor: hex(read24(mem, EDIT_CURSOR_ADDR)),
    editBufferHead: bytesToHex(mem, EDIT_BUF_START, 16),
    d0230eBytes: bytesToHex(mem, TOKEN_STAGING_ADDR, TOKEN_WINDOW_LENGTH),
    d0060eBytes: bytesToHex(mem, OP3_AREA_ADDR, TOKEN_WINDOW_LENGTH),
    finalCpu: snapshotCpu(cpu),
  };
}

function summarize(traceResults, blockReport) {
  const request620 = traceResults.filter((trace) => trace.requestId === 'request-05e620');
  const near630 = traceResults.filter((trace) => trace.requestId === 'near-05e630');
  const near6a4 = traceResults.filter((trace) => trace.requestId === 'near-05e6a4');

  const any620BufInsert = [...request620, ...near630].some((trace) => trace.bufInsertCalls.length > 0);
  const any6a4BufInsert = near6a4.some((trace) => trace.bufInsertCalls.length > 0);
  const anyD0230EHit = traceResults
    .filter((trace) => trace.scenarioId.startsWith('d0230e'))
    .some((trace) => trace.bufInsertCalls.length > 0);
  const anyD0060EHit = traceResults
    .filter((trace) => trace.scenarioId.startsWith('d0060e'))
    .some((trace) => trace.bufInsertCalls.length > 0);

  const exact620 = blockReport.exact.find((row) => row.address === hex(CALL_SITE_620));
  const exact6a6 = blockReport.exact.find((row) => row.address === hex(CALL_SITE_6A6));

  const lines = [];
  lines.push(
    `${hex(CALL_SITE_620)} exact lifted block: ${exact620?.exists ? 'YES' : 'NO'}; nearest ADL entries in-range: ${blockReport.nearby05E620.join(', ') || '(none)'}.`
  );
  lines.push(
    `${hex(CALL_SITE_6A6)} exact lifted block: ${exact6a6?.exists ? 'YES' : 'NO'}; nearest ADL entries in-range: ${blockReport.nearby05E6A6.join(', ') || '(none)'}.`
  );
  lines.push(
    `${hex(CALL_SITE_620)} is a byte-loop call site: LD A,(HL); INC HL; OR A; JR Z exits; the immediate prelude does not reload DE before CALL BufInsert.`
  );
  lines.push(
    `${hex(CALL_SITE_6A6)} is behind ${hex(ENTRY_630)} and multiple gates: BIT 4,(IY+5), CALL 0x05E37D flag checks, CP 0x3F, CALL 0x05E307, BIT 1,(IY+42), CALL 0x0A2C2A, and mem[0xD007E0] == 0x49.`
  );

  if (!any620BufInsert && any6a4BufInsert) {
    lines.push(
      'Runtime verdict: the direct pre-call block near 0x05E6A6 can hit BufInsert once the internal stack/register state is already primed, but staging a digit token alone does not drive the ConvKeyToTok-side entry path into 0x05E620/0x05E630.'
    );
  } else if (any620BufInsert) {
    lines.push(
      'Runtime verdict: at least one 0x05E620/0x05E630-side trace reached BufInsert, so a staged digit token can flow through this ConvKeyToTok region under the reported setup.'
    );
  } else {
    lines.push(
      'Runtime verdict: none of the 0x05E620/0x05E630-side traces reached BufInsert within 500 steps, so this region is not a demonstrated digit insertion path under the tested minimal setups.'
    );
  }

  lines.push(
    `Seed comparison: 0xD0230E scenarios reached BufInsert = ${anyD0230EHit ? 'YES' : 'NO'}; 0xD0060E scenario reached BufInsert = ${anyD0060EHit ? 'YES' : 'NO'}.`
  );

  return lines;
}

function main() {
  const allRows = disassembleRange(STATIC_START, STATIC_END);
  const blockReport = blockExistenceReport();
  const baseline = createBaseline();

  console.log('=== Static Disassembly ===');
  console.log(`Range: ${hex(STATIC_START)}..${hex(STATIC_END)}`);
  printRows(allRows);

  console.log('\n=== Call Windows ===');
  for (const window of DISASM_WINDOWS) {
    console.log(`-- ${window.label} (${hex(window.start)}..${hex(window.end)}) --`);
    printRows(sliceDisasmRows(allRows, window.start, window.end));
  }

  console.log('\n=== Static Notes ===');
  console.log(`- ${hex(CALL_SITE_620)} sits in the tail of the pre-${hex(ENTRY_630)} routine. The local loop starts at 0x05E619 after the RET at 0x05E618.`);
  console.log(`- ${hex(CALL_SITE_620)} consumes a null-terminated byte stream from HL; zero terminates before the BufInsert call.`);
  console.log(`- ${hex(CALL_SITE_6A6)} is not the start of a routine. The visible lifted pre-call entry is ${hex(ENTRY_6A4)}.`);
  console.log(`- ${hex(ENTRY_630)} begins with CALL ${hex(0x05C52C)} (= ConvKeyToTok), so the 0x05E6A6 call is downstream of ConvKeyToTok and several later gates.`);

  console.log('\n=== Block Existence ===');
  console.log(JSON.stringify(blockReport, null, 2));

  console.log('\n=== Boot Baseline ===');
  console.log(JSON.stringify({
    bootSequence: `${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`,
    boot: baseline.boot,
    memInit: baseline.memInit,
  }, null, 2));

  const traceResults = [];
  console.log('\n=== Execution Trace ===');
  for (const scenario of SEED_SCENARIOS) {
    console.log(`\n-- Seed Scenario: ${scenario.label} --`);
    console.log(`   ${scenario.description}`);
    for (const request of TRACE_REQUESTS) {
      const result = traceEntry(baseline.memory, scenario, request);
      traceResults.push(result);
      console.log(JSON.stringify(result, null, 2));
    }
  }

  console.log('\n=== Conclusion ===');
  for (const line of summarize(traceResults, blockReport)) {
    console.log(`- ${line}`);
  }
}

main();
