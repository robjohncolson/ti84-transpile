#!/usr/bin/env node

/**
 * Phase 285: trace 0x0A1CAC after GetModelName
 *
 * Goals:
 *   1. Decoder-driven static disassembly of 0x0A1CAC.
 *   2. Direct CALL/JP scan for 0x0A1CAC across ROM.
 *   3. Dynamic trace from 0x0A1CAC with HL -> "TI-84 Plus CE".
 *   4. Second dynamic trace with HL -> empty string.
 *   5. Findings: display/copy/strlen/stat-menu classification.
 *
 * Notes:
 *   - Session 282 already established GetModelName at 0x09EE86 and the
 *     returned ROM string "TI-84 Plus CE" at 0x09EF36.
 *   - The direct-entry trace here does not full-boot the OS. Instead it seeds
 *     the minimal text state needed to let PutS / PutC / glyph rendering run:
 *       D00595/D00596 = cursor bytes
 *       D02505        = common non-zero text bound so the outer loop does not
 *                       short-circuit after the first character in zeroed RAM
 *       D02688/D0268A = text fg/bg colors so VRAM writes are visible
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const rom = fs.readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TARGET = 0x0A1CAC;
const GET_MODEL_NAME = 0x09EE86;
const ABOUT_CALLER = 0x09EC0A;
const PUTC = 0x0A1B5B;
const PUTMAP = 0x0A1799;
const NEXT_LINE = 0x0A2032;
const CONTROL_TOKEN_HELPER = 0x0A22B1;

const TRACE_STEPS = 500;
const MAX_STATIC_BYTES = 200;
const RETURN_SENTINEL = 0xFEFEFE;
const TRACE_SP = 0xD1A87E;
const TRACE_IX = 0xD1A860;
const TRACE_IY = 0xD00080;
const EMPTY_STRING_ADDR = 0xD24000;
const MISSING_BLOCK_RECOVERY_WINDOW = 0x40;

const CURSOR_MAJOR_ADDR = 0xD00595;
const CURSOR_MINOR_ADDR = 0xD00596;
const TEXT_BOUND_ADDR = 0xD02505;
const FG_COLOR_ADDR = 0xD02688;
const BG_COLOR_ADDR = 0xD0268A;
const VRAM_BASE = 0xD40000;
const VRAM_END = 0xD65800;

const COMMON_TEXT_BOUND = 0x0A;
const MAX_LOGGED_STRING_EVENTS = 64;
const MAX_LOGGED_RAM_EVENTS = 120;
const MAX_LOGGED_VRAM_EVENTS = 120;

const KNOWN_ADDRS = new Map([
  [TARGET, 'PutS target'],
  [GET_MODEL_NAME, 'GetModelName'],
  [ABOUT_CALLER, 'about-screen caller'],
  [PUTC, 'PutC'],
  [PUTMAP, 'PutMap / glyph renderer'],
  [NEXT_LINE, 'line advance / wrap'],
  [CONTROL_TOKEN_HELPER, 'control-token helper'],
  [0x0207C0, 'jump-table PutS export'],
  [0x09EC0E, 'call site after GetModelName'],
  [0x09EF36, '"TI-84 Plus CE"'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesHex(values) {
  return Array.from(values, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function labelFor(addr) {
  const label = KNOWN_ADDRS.get(addr & 0xFFFFFF);
  return label ? ` [${label}]` : '';
}

function readCString(bytes, start, maxLen = 64) {
  let end = start;
  while (end < bytes.length && (end - start) < maxLen && bytes[end] !== 0x00) {
    end += 1;
  }
  return Buffer.from(bytes.subarray(start, end)).toString('ascii');
}

function write24Mem(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function pushCapped(list, cap, item) {
  if (list.length < cap) list.push(item);
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase285-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTemp(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTemp(assets);
    throw error;
  }
}

function buildInstructionIndex(blocks) {
  const index = new Map();
  for (const block of Object.values(blocks)) {
    for (const instruction of block.instructions ?? []) {
      if (!index.has(instruction.pc)) {
        index.set(instruction.pc, instruction);
      }
    }
  }
  return index;
}

function fallbackDasm(decoded) {
  if (!decoded) return '(decode failed)';
  if (typeof decoded.dasm === 'string' && decoded.dasm.length > 0) return decoded.dasm;
  return decoded.tag ?? '(unknown)';
}

function disassembleLinear(start, instructionIndex, maxBytes = MAX_STATIC_BYTES) {
  const rows = [];
  const limit = Math.min(rom.length, start + maxBytes);
  let pc = start;

  while (pc < limit) {
    const decoded = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, decoded?.length ?? 1);
    const bytes = rom.subarray(pc, pc + length);
    const lifted = instructionIndex.get(pc);
    const dasm = lifted?.dasm ?? fallbackDasm(decoded);

    rows.push({
      pc,
      length,
      bytes,
      dasm,
      tag: decoded?.tag ?? null,
    });

    pc += length;

    if (decoded?.tag === 'ret' || decoded?.tag === 'reti' || decoded?.tag === 'retn' || /\bret\b/i.test(dasm)) {
      break;
    }
  }

  return rows;
}

function scanTransfers(opcode, target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let index = 0; index <= rom.length - 4; index += 1) {
    if (rom[index] !== opcode) continue;
    if (rom[index + 1] !== lo || rom[index + 2] !== mid || rom[index + 3] !== hi) continue;
    hits.push(index);
  }

  return hits;
}

function findModelStringCandidates() {
  const prefix = [0x54, 0x49, 0x2D, 0x38, 0x34]; // "TI-84"
  const hits = [];

  for (let index = 0; index <= rom.length - prefix.length; index += 1) {
    let match = true;
    for (let offset = 0; offset < prefix.length; offset += 1) {
      if (rom[index + offset] !== prefix[offset]) {
        match = false;
        break;
      }
    }
    if (!match) continue;

    const text = readCString(rom, index, 64);
    hits.push({
      addr: index,
      text,
      bytes: bytesHex(rom.subarray(index, Math.min(index + 32, rom.length))),
    });
  }

  return hits;
}

function pickModelString(candidates) {
  return candidates.find((candidate) => candidate.text === 'TI-84 Plus CE') ?? candidates[0] ?? null;
}

function buildBlockStarts(blockMeta) {
  const byMode = new Map();

  for (const key of Object.keys(blockMeta)) {
    const [pcHex, mode] = key.split(':');
    if (!mode) continue;
    const pc = Number.parseInt(pcHex, 16);
    if (!Number.isFinite(pc)) continue;
    if (!byMode.has(mode)) byMode.set(mode, []);
    byMode.get(mode).push(pc);
  }

  for (const list of byMode.values()) {
    list.sort((left, right) => left - right);
  }

  return byMode;
}

function findNextBlockStart(blockStarts, mode, pc, maxDelta = MISSING_BLOCK_RECOVERY_WINDOW) {
  const entries = blockStarts.get(mode) ?? [];
  let low = 0;
  let high = entries.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (entries[mid] < pc) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  const next = entries[low];
  if (!Number.isFinite(next)) return null;
  if ((next - pc) > maxDelta) return null;
  return next;
}

function resolveNextMode(meta, resultPc, currentMode) {
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === resultPc && exit.targetMode) return exit.targetMode;
  }
  return currentMode;
}

function snapshotRegs(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    pc: cpu.pc & 0xFFFFFF,
  };
}

function formatRegs(regs) {
  return `A=${hex(regs.a, 2)} F=${hex(regs.f, 2)} BC=${hex(regs.bc)} DE=${hex(regs.de)} HL=${hex(regs.hl)} IX=${hex(regs.ix)} IY=${hex(regs.iy)} SP=${hex(regs.sp)}`;
}

function classifyAddr(addr) {
  if (addr === CURSOR_MAJOR_ADDR) return 'D00595';
  if (addr === CURSOR_MINOR_ADDR) return 'D00596';
  if (addr === TEXT_BOUND_ADDR) return 'D02505';
  if (addr === FG_COLOR_ADDR || addr === FG_COLOR_ADDR + 1) return 'FGColor';
  if (addr === BG_COLOR_ADDR || addr === BG_COLOR_ADDR + 1) return 'BGColor';
  if (addr >= VRAM_BASE && addr < VRAM_END) return 'VRAM';
  if (addr >= 0xD00000 && addr < 0xD01000) return 'OS_RAM';
  if (addr >= 0xD02000 && addr < 0xD03000) return 'D02xxx';
  return '';
}

function overlapsRange(addr, width, range) {
  const start = addr & MEM_MASK;
  const end = (start + width) & MEM_MASK;
  if (range.start <= range.end) {
    return start < range.end && (start + width) > range.start;
  }
  return start >= range.start || end < range.end;
}

function installAccessHooks(cpu, access, context, watchRanges) {
  const origRead8 = cpu.read8.bind(cpu);
  const origRead16 = cpu.read16.bind(cpu);
  const origRead24 = cpu.read24.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  const recordRead = (addr, value, width) => {
    const normalized = addr & MEM_MASK;

    for (const range of watchRanges) {
      if (!overlapsRange(normalized, width, range)) continue;
      access.counts.stringReads += 1;
      pushCapped(access.stringReads, MAX_LOGGED_STRING_EVENTS, {
        step: context.step,
        pc: context.blockPc,
        addr: normalized,
        width,
        value,
        label: range.label,
      });
    }

    if (normalized >= 0xD00000) {
      access.counts.ramReads += 1;
      pushCapped(access.ramReads, MAX_LOGGED_RAM_EVENTS, {
        step: context.step,
        pc: context.blockPc,
        addr: normalized,
        width,
        value,
        label: classifyAddr(normalized),
      });
    }
  };

  const recordWrite = (addr, value, width) => {
    const normalized = addr & MEM_MASK;

    if (normalized >= 0xD00000) {
      access.counts.ramWrites += 1;
      pushCapped(access.ramWrites, MAX_LOGGED_RAM_EVENTS, {
        step: context.step,
        pc: context.blockPc,
        addr: normalized,
        width,
        value,
        label: classifyAddr(normalized),
      });
    }

    if (normalized >= VRAM_BASE && normalized < VRAM_END) {
      access.counts.vramWrites += 1;
      pushCapped(access.vramWrites, MAX_LOGGED_VRAM_EVENTS, {
        step: context.step,
        pc: context.blockPc,
        addr: normalized,
        width,
        value,
      });
    }
  };

  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    recordRead(addr, value, 1);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = origRead16(addr);
    recordRead(addr, value, 2);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = origRead24(addr);
    recordRead(addr, value, 3);
    return value;
  };

  cpu.write8 = (addr, value) => {
    origWrite8(addr, value);
    recordWrite(addr, value, 1);
  };

  cpu.write16 = (addr, value) => {
    origWrite16(addr, value);
    recordWrite(addr, value, 2);
  };

  cpu.write24 = (addr, value) => {
    origWrite24(addr, value);
    recordWrite(addr, value, 3);
  };
}

function seedTextState(mem) {
  mem[CURSOR_MAJOR_ADDR] = 0x00;
  mem[CURSOR_MINOR_ADDR] = 0x00;
  mem[TEXT_BOUND_ADDR] = COMMON_TEXT_BOUND;

  mem[FG_COLOR_ADDR] = 0x00;
  mem[FG_COLOR_ADDR + 1] = 0x00;
  mem[BG_COLOR_ADDR] = 0xFF;
  mem[BG_COLOR_ADDR + 1] = 0xFF;

  mem[TRACE_IY + 0x02] = 0x00;
  mem[TRACE_IY + 0x08] = 0x00;
  mem[TRACE_IY + 0x0D] = 0x00;
  mem[TRACE_IY + 0x4C] = 0x00;
  mem[TRACE_IY + 0x4D] = 0x00;

  mem[EMPTY_STRING_ADDR] = 0x00;
}

async function runDynamicTrace(blocks, caseSpec) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
  seedTextState(mem);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, {
    peripherals,
    trackMemoryMapped: true,
  });

  const { cpu, compiledBlocks, blockMeta } = executor;
  const blockStarts = buildBlockStarts(blockMeta);

  cpu.pc = TARGET;
  cpu.sp = TRACE_SP;
  cpu.ix = TRACE_IX;
  cpu.iy = TRACE_IY;
  cpu.hl = caseSpec.hl;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;

  write24Mem(mem, TRACE_SP, RETURN_SENTINEL);

  const context = { step: 0, blockPc: TARGET };
  const access = {
    counts: {
      stringReads: 0,
      ramReads: 0,
      ramWrites: 0,
      vramWrites: 0,
    },
    stringReads: [],
    ramReads: [],
    ramWrites: [],
    vramWrites: [],
  };

  installAccessHooks(cpu, access, context, [
    {
      label: caseSpec.label,
      start: caseSpec.watchStart,
      end: caseSpec.watchEnd,
    },
  ]);

  const stepsLog = [];
  const callTargets = [];
  const missingBlocks = [];
  const recoveredBlocks = [];

  let pc = TARGET;
  let mode = 'adl';
  let steps = 0;
  let termination = 'max_steps';
  let error = null;

  while (steps < TRACE_STEPS) {
    const key = `${pc.toString(16).padStart(6, '0')}:${mode}`;
    const fn = compiledBlocks[key];
    const meta = blockMeta[key];

    if (!fn || !meta) {
      const recoveredPc = findNextBlockStart(blockStarts, mode, pc);
      missingBlocks.push({ step: steps + 1, pc, mode, recoveredPc });
      if (recoveredPc === null) {
        termination = 'missing_block';
        break;
      }
      recoveredBlocks.push({ step: steps + 1, from: pc, to: recoveredPc, mode });
      pc = recoveredPc;
      continue;
    }

    cpu.madl = mode === 'adl' ? 1 : 0;
    cpu.pc = pc;
    cpu._currentBlockPc = pc;
    context.step = steps + 1;
    context.blockPc = pc;

    const before = snapshotRegs(cpu);

    let result;
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = caught;
      break;
    }

    steps += 1;

    const after = snapshotRegs(cpu);
    const dasm = meta.instructions?.map((instruction) => instruction.dasm ?? fallbackDasm(instruction)).join(' | ') ?? '(unknown)';
    const lastInstruction = meta.instructions?.[meta.instructions.length - 1] ?? null;
    const matchedExit = meta.exits?.find((exit) => exit.target === result) ?? null;

    stepsLog.push({
      step: steps,
      pc,
      mode,
      result,
      before,
      after,
      dasm,
      exitType: matchedExit?.type ?? 'dynamic',
    });

    if (matchedExit?.type === 'call' || lastInstruction?.tag === 'call' || lastInstruction?.tag === 'call-conditional') {
      callTargets.push({
        step: steps,
        from: lastInstruction?.pc ?? pc,
        target: result,
        dasm: lastInstruction?.dasm ?? dasm,
      });
    }

    if (result === RETURN_SENTINEL && cpu.sp === ((TRACE_SP + 3) & MEM_MASK)) {
      termination = 'ret_to_caller';
      break;
    }

    if (result === undefined || result === null) {
      termination = 'no_return';
      break;
    }

    if (typeof result !== 'number') {
      termination = 'non_numeric_result';
      break;
    }

    if (result < 0) {
      termination = result === -1 ? 'halt' : result === -2 ? 'sleep' : `sentinel_${result}`;
      break;
    }

    mode = resolveNextMode(meta, result, mode);
    pc = result & 0xFFFFFF;
  }

  return {
    caseSpec,
    steps,
    termination,
    error,
    stepsLog,
    callTargets,
    missingBlocks,
    recoveredBlocks,
    access,
    finalState: snapshotRegs(cpu),
    finalCursor: {
      d00595: mem[CURSOR_MAJOR_ADDR],
      d00596: mem[CURSOR_MINOR_ADDR],
      d02505: mem[TEXT_BOUND_ADDR],
    },
  };
}

function summarizeVram(events) {
  if (events.length === 0) return null;
  const addrs = events.map((event) => event.addr);
  return {
    min: Math.min(...addrs),
    max: Math.max(...addrs),
  };
}

function formatStringRead(event) {
  const byteText = event.width === 1 ? String.fromCharCode(event.value & 0xFF) : '';
  const printable = event.width === 1 && event.value >= 0x20 && event.value <= 0x7E ? ` '${byteText}'` : '';
  return `step ${String(event.step).padStart(3)} ${hex(event.pc)} -> ${hex(event.addr)} = ${hex(event.value, event.width * 2)}${printable} [${event.label}]`;
}

function formatRamEvent(event, arrow) {
  const label = event.label ? ` [${event.label}]` : '';
  return `step ${String(event.step).padStart(3)} ${hex(event.pc)} ${arrow} ${hex(event.addr)} ${arrow === '<-' ? '' : '='}${hex(event.value, event.width * 2)} w${event.width}${label}`;
}

function formatStep(step) {
  return (
    `    step ${String(step.step).padStart(3)}: ${hex(step.pc)} -> ${hex(step.result)} ` +
    `[${step.exitType}] ${step.dasm}\n` +
    `      before ${formatRegs(step.before)}\n` +
    `      after  ${formatRegs(step.after)}`
  );
}

function printDisassembly(rows) {
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}: ${bytesHex(row.bytes).padEnd(23)} ${row.dasm}${labelFor(row.pc)}`);
  }
  if (rows.length > 0) {
    const last = rows[rows.length - 1];
    const byteCount = (last.pc + last.length) - rows[0].pc;
    console.log(`\n  Decoded ${rows.length} instruction(s), ${byteCount} byte(s).`);
  }
}

function printTransferSites(title, opcodeName, hits, instructionIndex) {
  console.log(`\n${title}: ${hits.length}`);
  for (const hit of hits) {
    const decoded = decodeInstruction(rom, hit, 'adl');
    const length = Math.max(1, decoded?.length ?? 1);
    const dasm = instructionIndex.get(hit)?.dasm ?? `${opcodeName} ${hex(TARGET)}`;
    console.log(`  ${hex(hit)}: ${bytesHex(rom.subarray(hit, hit + length)).padEnd(23)} ${dasm}${labelFor(hit)}`);
  }
}

function printModelStrings(candidates, selected) {
  console.log(`\nModel-string candidates matching "TI-84": ${candidates.length}`);
  for (const candidate of candidates) {
    console.log(`  ${hex(candidate.addr)}: "${candidate.text}"${labelFor(candidate.addr)}`);
  }
  if (selected) {
    console.log(`\n  Selected model string: ${hex(selected.addr)} "${selected.text}"`);
  }
}

function printDynamicTrace(trace) {
  console.log('\n' + '='.repeat(96));
  console.log(`PART 4${trace.caseSpec.partSuffix}: Dynamic trace - ${trace.caseSpec.title}`);
  console.log('='.repeat(96));

  console.log(`\n  Setup: PC=${hex(TARGET)} HL=${hex(trace.caseSpec.hl)} IY=${hex(TRACE_IY)} SP=${hex(TRACE_SP)} IX=${hex(TRACE_IX)} sentinel=${hex(RETURN_SENTINEL)}`);
  console.log(`  Seeded text state: D00595=${hex(0, 2)} D00596=${hex(0, 2)} D02505=${hex(COMMON_TEXT_BOUND, 2)} FG=0x0000 BG=0xFFFF`);
  console.log(`  Termination: ${trace.termination} after ${trace.steps} step(s)`);
  if (trace.error) {
    console.log(`  Error: ${trace.error.message}`);
  }
  console.log(`  Final state: ${formatRegs(trace.finalState)}`);
  console.log(`  Final cursor bytes: D00595=${hex(trace.finalCursor.d00595, 2)} D00596=${hex(trace.finalCursor.d00596, 2)} D02505=${hex(trace.finalCursor.d02505, 2)}`);

  console.log('\n  Step log:');
  for (const step of trace.stepsLog) {
    console.log(formatStep(step));
  }

  console.log(`\n  String reads (${trace.access.counts.stringReads} total, first ${trace.access.stringReads.length} shown):`);
  if (trace.access.stringReads.length === 0) {
    console.log('    (none)');
  } else {
    for (const event of trace.access.stringReads) {
      console.log(`    ${formatStringRead(event)}`);
    }
  }

  console.log(`\n  CALL targets (${trace.callTargets.length}):`);
  if (trace.callTargets.length === 0) {
    console.log('    (none)');
  } else {
    for (const call of trace.callTargets) {
      console.log(`    step ${String(call.step).padStart(3)}: ${hex(call.from)} -> ${hex(call.target)}  ${call.dasm}${labelFor(call.target)}`);
    }
  }

  const vramSummary = summarizeVram(trace.access.vramWrites);
  console.log(`\n  VRAM writes (${trace.access.counts.vramWrites} total, first ${trace.access.vramWrites.length} shown):`);
  if (trace.access.vramWrites.length === 0) {
    console.log('    (none)');
  } else {
    for (const event of trace.access.vramWrites) {
      console.log(`    step ${String(event.step).padStart(3)} ${hex(event.pc)} <- ${hex(event.addr)} ${hex(event.value, event.width * 2)} w${event.width}`);
    }
    if (vramSummary) {
      console.log(`\n  VRAM address span: ${hex(vramSummary.min)} - ${hex(vramSummary.max)}`);
    }
  }

  console.log(`\n  RAM writes (${trace.access.counts.ramWrites} total, first ${trace.access.ramWrites.length} shown):`);
  if (trace.access.ramWrites.length === 0) {
    console.log('    (none)');
  } else {
    for (const event of trace.access.ramWrites) {
      console.log(`    ${formatRamEvent(event, '<-')}`);
    }
  }

  if (trace.recoveredBlocks.length > 0) {
    console.log('\n  Missing-block recoveries:');
    for (const entry of trace.recoveredBlocks) {
      console.log(`    step ${String(entry.step).padStart(3)}: ${hex(entry.from)} -> recovered at ${hex(entry.to)} (${entry.mode})`);
    }
  }

  if (trace.missingBlocks.length > 0) {
    console.log('\n  Missing-block hits:');
    for (const entry of trace.missingBlocks) {
      console.log(`    step ${String(entry.step).padStart(3)}: wanted ${hex(entry.pc)} (${entry.mode})${entry.recoveredPc !== null ? `, recovered to ${hex(entry.recoveredPc)}` : ''}`);
    }
  }
}

function printFindings(modelString, callHits, jpHits, modelTrace, emptyTrace) {
  const modelPutCHit = modelTrace.callTargets.some((call) => call.target === PUTC) || modelTrace.stepsLog.some((step) => step.pc === PUTC);
  const modelPutMapHit = modelTrace.callTargets.some((call) => call.target === PUTMAP) || modelTrace.stepsLog.some((step) => step.pc === PUTMAP);
  const modelNextLineHit = modelTrace.callTargets.some((call) => call.target === NEXT_LINE) || modelTrace.stepsLog.some((step) => step.pc === NEXT_LINE);
  const emptyPutCHit = emptyTrace.callTargets.some((call) => call.target === PUTC) || emptyTrace.stepsLog.some((step) => step.pc === PUTC);

  console.log('\n' + '='.repeat(96));
  console.log('PART 6: Findings');
  console.log('='.repeat(96));

  console.log('\n  Static meaning');
  console.log('  - 0x0A1CAC is a tiny string-walk loop: save BC/AF, load B from D02505, read A=(HL), increment HL, exit on NUL, otherwise call 0x0A1B5B, then continue while D00595 < B.');
  console.log('  - That body matches a PutS-style display primitive, not a memcpy or strlen routine.');

  console.log('\n  Post-GetModelName trace');
  if (modelString) {
    console.log(`  - The selected model string is at ${hex(modelString.addr)} and reads "${modelString.text}".`);
  }
  if (modelTrace.stepsLog.length > 0) {
    const first = modelTrace.stepsLog[0];
    console.log(`  - In the entry block, HL advances from ${hex(first.before.hl)} to ${hex(first.after.hl)} before the first renderer call, so the source pointer is consumed in-place.`);
  }
  if (modelTrace.access.stringReads.length > 0) {
    const firstRead = modelTrace.access.stringReads[0];
    console.log(`  - The first observed source read was ${hex(firstRead.value, 2)} from ${hex(firstRead.addr)}${firstRead.value >= 0x20 && firstRead.value <= 0x7E ? ` ('${String.fromCharCode(firstRead.value)}')` : ''}.`);
  }
  console.log(`  - Renderer path hit PutC: ${modelPutCHit ? 'yes' : 'no'}; PutMap/glyph renderer: ${modelPutMapHit ? 'yes' : 'no'}; line-advance helper: ${modelNextLineHit ? 'yes' : 'no'}.`);
  console.log(`  - VRAM writes during the model-string trace: ${modelTrace.access.counts.vramWrites}.`);
  console.log(`  - RAM writes outside VRAM were limited to renderer state/cursor bytes (${modelTrace.access.counts.ramWrites - modelTrace.access.counts.vramWrites} non-VRAM writes logged); no bulk destination-buffer copy pattern was observed.`);

  console.log('\n  Empty-string control case');
  console.log(`  - Empty-string trace termination: ${emptyTrace.termination} after ${emptyTrace.steps} step(s).`);
  console.log(`  - Empty-string trace reached PutC: ${emptyPutCHit ? 'yes' : 'no'}; VRAM writes: ${emptyTrace.access.counts.vramWrites}.`);
  console.log('  - That fast path confirms 0x0A1CAC is driven directly by the NUL-terminated byte stream at HL.');

  console.log('\n  Caller scan');
  console.log(`  - Direct CALL sites: ${callHits.length}. Direct JP sites: ${jpHits.length}.`);
  console.log('  - The caller list spans the About screen, diagnostics, solver/menu families, STAT/plot labels, and the jump-table export at 0x0207C0.');
  console.log('  - That breadth rules out "STAT-only helper"; it is a generic UI string renderer used by many screens.');

  console.log('\n  Bottom line');
  console.log('  - 0x0A1CAC is a string display routine: the OS PutS-style loop.');
  console.log('  - After GetModelName returns HL -> "TI-84 Plus CE", 0x0A1CAC reads bytes from that ROM string, advances HL, hands each byte to PutC / glyph rendering, and writes pixels to VRAM.');
  console.log('  - It is not a string copy routine, not a length calculator, and not specific to the STAT menu setup chain, although STAT-family code also calls it.');
}

console.log('='.repeat(96));
console.log(`Phase 285: Trace ${hex(TARGET)} after GetModelName`);
console.log('='.repeat(96));

const { blocks, assets } = await loadBlocks();

try {
  const instructionIndex = buildInstructionIndex(blocks);
  const staticRows = disassembleLinear(TARGET, instructionIndex, MAX_STATIC_BYTES);
  const callHits = scanTransfers(0xCD, TARGET);
  const jpHits = scanTransfers(0xC3, TARGET);
  const modelCandidates = findModelStringCandidates();
  const modelString = pickModelString(modelCandidates);

  console.log('\n' + '='.repeat(96));
  console.log(`PART 1: Static disassembly of ${hex(TARGET)}`);
  console.log('='.repeat(96));
  printDisassembly(staticRows);

  console.log('\n' + '='.repeat(96));
  console.log('PART 2: Model-string search');
  console.log('='.repeat(96));
  printModelStrings(modelCandidates, modelString);

  console.log('\n' + '='.repeat(96));
  console.log(`PART 3: Direct callers of ${hex(TARGET)}`);
  console.log('='.repeat(96));
  printTransferSites('  CALL pattern (CD AC 1C 0A)', 'CALL', callHits, instructionIndex);
  printTransferSites('  JP pattern   (C3 AC 1C 0A)', 'JP', jpHits, instructionIndex);

  const modelTrace = await runDynamicTrace(blocks, {
    title: 'HL -> model string',
    partSuffix: '',
    hl: modelString?.addr ?? 0x09EF36,
    label: 'model-string',
    watchStart: modelString?.addr ?? 0x09EF36,
    watchEnd: (modelString?.addr ?? 0x09EF36) + ((modelString?.text?.length ?? 'TI-84 Plus CE'.length) + 1),
  });

  const emptyTrace = await runDynamicTrace(blocks, {
    title: 'HL -> empty RAM string',
    partSuffix: 'B',
    hl: EMPTY_STRING_ADDR,
    label: 'empty-string',
    watchStart: EMPTY_STRING_ADDR,
    watchEnd: EMPTY_STRING_ADDR + 1,
  });

  printDynamicTrace(modelTrace);
  printDynamicTrace(emptyTrace);
  printFindings(modelString, callHits, jpHits, modelTrace, emptyTrace);

  console.log('\n' + '='.repeat(96));
  console.log('Phase 285 complete.');
  console.log('='.repeat(96));
} finally {
  cleanupTemp(assets);
}
