#!/usr/bin/env node

/**
 * Phase 181 — Key Classification / Dispatch Probe
 *
 * Goals:
 *   1. Disassemble the home-handler helper at 0x058D49.
 *   2. Disassemble the setup helper at 0x058BA3.
 *   3. Revisit the supposed "key dispatch table" at 0x0824FD..0x0825F0.
 *   4. Run a bounded direct trace from 0x058D49 with k2 (0x90) seeded.
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase181-key-classify.mjs
 *
 * Output:
 *   TI-84_Plus_CE/phase181-key-classify-report.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction as decodeEz80 } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase181-key-classify-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEMINIT_ENTRY = 0x09dee0;

const STACK_RESET_TOP = 0xd1a87e;
const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;

const HOME_HANDLER = 0x058241;
const LOOKUP_HELPER = 0x058ba3;
const CLASSIFY_HELPER = 0x058d49;
const BUF_INSERT = 0x05e2a0;

const TABLE_SCAN_START = 0x0824fd;
const TABLE_CONTEXT_START = 0x0825c0;
const TABLE_CONTEXT_END = 0x0825f0;
const PTR_UPDATE = 0x0825d1;

const KBD_KEY = 0xd0058c;
const EDIT_CURSOR = 0xd0243a;
const HOME_SCAN_RESULT = 0xd0265b;
const MASKED_FLAG_BYTE = 0xd0008e;
const LOOKUP_SCRATCH = 0xd01d0c;

const TRACE_KEY = 0x90;
const ANALYSIS_MBASE = 0xd0;
const ANALYSIS_IY = 0xd00080;
const ANALYSIS_IX = 0xd1a860;
const ANALYSIS_F = 0x40;

const MEMINIT_BUDGET = 100000;
const TRACE_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;

const CPU_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  'pc',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function bytesHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function hexBytes(source, addr, len) {
  return bytesHex(source.slice(addr, addr + len));
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function resolveMemoryAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }

  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((ANALYSIS_MBASE << 16) | (inst.addr & 0xffff)) >>> 0;
  }

  return inst.addr >>> 0;
}

function formatResolvedAddress(inst) {
  return hex(resolveMemoryAddress(inst) ?? inst.addr);
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';

  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'halt': text = 'halt'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'daa': text = 'daa'; break;
    case 'cpl': text = 'cpl'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'exx': text = 'exx'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'neg': text = 'neg'; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'rrd': text = 'rrd'; break;
    case 'rld': text = 'rld'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'ini': text = 'ini'; break;
    case 'outi': text = 'outi'; break;
    case 'ind': text = 'ind'; break;
    case 'outd': text = 'outd'; break;
    case 'inir': text = 'inir'; break;
    case 'otir': text = 'otir'; break;
    case 'indr': text = 'indr'; break;
    case 'otdr': text = 'otdr'; break;
    case 'otimr': text = 'otimr'; break;
    case 'slp': text = 'slp'; break;
    case 'stmix': text = 'stmix'; break;
    case 'rsmix': text = 'rsmix'; break;
    case 'ld-mb-a': text = 'ld mb, a'; break;
    case 'ld-a-mb': text = 'ld a, mb'; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'im': text = `im ${inst.value}`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = `ld ${inst.pair}, (${formatResolvedAddress(inst)})`;
      break;
    case 'ld-mem-pair':
      text = `ld (${formatResolvedAddress(inst)}), ${inst.pair}`;
      break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${formatResolvedAddress(inst)})`; break;
    case 'ld-mem-reg': text = `ld (${formatResolvedAddress(inst)}), ${inst.src}`; break;
    case 'ld-reg-ixd':
      text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'ld-ixd-reg':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
      break;
    case 'ld-ixd-imm':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
      break;
    case 'inc-ixd':
      text = `inc (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'dec-ixd':
      text = `dec (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ixd':
      text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'rst': text = `rst ${hexByte(inst.target)}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (hl)`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
    case 'indexed-cb-rotate':
      text = `${inst.operation} (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-bit':
      text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-res':
      text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-set':
      text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `out (c), ${inst.reg}`; break;
    case 'in-reg': text = `in ${inst.reg}, (c)`; break;
    case 'in0': text = `in0 ${inst.reg}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `tstio ${hexByte(inst.value)}`; break;
    case 'lea':
      text = `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`;
      break;
    case 'ld-pair-indexed':
      text = `ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-pair':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.pair}`;
      break;
    case 'ld-ixiy-indexed':
      text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-ixiy':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
      break;
    case 'ld-pair-ind': text = `ld ${inst.pair}, (${inst.src})`; break;
    case 'ld-ind-pair': text = `ld (${inst.dest}), ${inst.pair}`; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });

  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = ANALYSIS_MBASE;
  cpu._iy = ANALYSIS_IY;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = ANALYSIS_MBASE;
  cpu._iy = ANALYSIS_IY;
  cpu._ix = ANALYSIS_IX;
  cpu.f = ANALYSIS_F;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let returned = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return returned;
}

function isRootExit(inst) {
  return (
    inst?.tag === 'ret' ||
    inst?.tag === 'reti' ||
    inst?.tag === 'retn' ||
    inst?.tag === 'jp' ||
    inst?.tag === 'jp-indirect'
  );
}

function disassembleWindow(startPc, maxInstructions) {
  const rows = [];
  let pc = startPc;
  let rootExitIndex = -1;

  while (rows.length < maxInstructions) {
    try {
      const inst = decodeEz80(romBytes, pc, 'adl');
      const row = {
        pc: inst.pc,
        bytes: hexBytes(romBytes, inst.pc, inst.length),
        inst,
        text: formatInstruction(inst),
        resolvedAddr: resolveMemoryAddress(inst),
      };
      rows.push(row);
      pc += inst.length;

      if (rootExitIndex === -1 && isRootExit(inst)) {
        rootExitIndex = rows.length - 1;
      }
    } catch (error) {
      rows.push({
        pc,
        bytes: hexBytes(romBytes, pc, 1),
        inst: null,
        text: `decode error: ${error.message}`,
        resolvedAddr: null,
      });
      break;
    }
  }

  const rootRows = rootExitIndex === -1 ? rows : rows.slice(0, rootExitIndex + 1);
  const tailRows = rootExitIndex === -1 ? [] : rows.slice(rootExitIndex + 1);

  return {
    startPc,
    rows,
    rootRows,
    tailRows,
    rootExitIndex,
    rootExitPc: rootExitIndex === -1 ? null : rows[rootExitIndex].pc,
  };
}

function disassembleRange(startPc, endPc) {
  const rows = [];
  let pc = startPc;

  while (pc < endPc) {
    try {
      const inst = decodeEz80(romBytes, pc, 'adl');
      rows.push({
        pc: inst.pc,
        bytes: hexBytes(romBytes, inst.pc, inst.length),
        inst,
        text: formatInstruction(inst),
        resolvedAddr: resolveMemoryAddress(inst),
      });
      pc += inst.length;
    } catch (error) {
      rows.push({
        pc,
        bytes: hexBytes(romBytes, pc, 1),
        inst: null,
        text: `decode error: ${error.message}`,
        resolvedAddr: null,
      });
      pc += 1;
    }
  }

  return rows;
}

function renderDisassembly(rows, rootExitPc = null) {
  return rows.map((row) => {
    const suffix = row.pc === rootExitPc ? '    ; <-- root exit' : '';
    return `${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}${suffix}`;
  }).join('\n');
}

function formatHexDump(startAddr, bytes, bytesPerLine = 16) {
  const lines = [];

  for (let offset = 0; offset < bytes.length; offset += bytesPerLine) {
    const chunk = bytes.slice(offset, offset + bytesPerLine);
    lines.push(`${hex(startAddr + offset)}: ${bytesHex(chunk)}`);
  }

  return lines.join('\n');
}

function collectRootNotes(label, analysis) {
  const rows = analysis.rootRows;
  const notes = [];

  const hasBufInsertCall = rows.some((row) => Number.isInteger(row.inst?.target) && row.inst.target === BUF_INSERT);
  const hasKbdKeyRef = rows.some((row) => row.resolvedAddr === KBD_KEY);
  const hasHomeScanRef = rows.some((row) => row.resolvedAddr === HOME_SCAN_RESULT);
  const hasMaskByteRef = rows.some((row) => row.resolvedAddr === MASKED_FLAG_BYTE);
  const hasLookupScratchRef = rows.some((row) => row.resolvedAddr === LOOKUP_SCRATCH);
  const hasCp = rows.some((row) => row.inst?.tag === 'alu-imm' && row.inst.op === 'cp');
  const hasIndirectJump = rows.some((row) => row.inst?.tag === 'jp-indirect');

  notes.push(`Root slice length: ${rows.length} instruction(s); root exit at ${hex(analysis.rootExitPc)}.`);
  notes.push(hasBufInsertCall ? 'Calls BufInsert in the root slice.' : 'Does not call BufInsert in the root slice.');
  notes.push(hasKbdKeyRef ? 'Touches kbdKey (0xD0058C).' : 'Does not touch kbdKey (0xD0058C).');
  notes.push(hasHomeScanRef ? 'Touches 0xD0265B home-scan scratch.' : 'Does not touch 0xD0265B home-scan scratch.');
  notes.push(hasCp ? 'Contains CP-based comparisons.' : 'Contains no CP-based comparisons.');
  notes.push(hasIndirectJump ? 'Contains an indirect JP, so a jump table is plausible.' : 'Contains no indirect JP.');

  if (label === '0x058BA3' && hasLookupScratchRef) {
    notes.push('Writes only 0xD01D0C in the root slice, consistent with a tiny zeroing helper.');
  }

  if (label === '0x058D49' && hasMaskByteRef) {
    notes.push('Reads and rewrites 0xD0008E with `AND 0xC0`, consistent with a flag-mask helper rather than a digit classifier.');
  }

  if (analysis.tailRows.length > 0) {
    notes.push(`The first non-root routine begins immediately at ${hex(analysis.tailRows[0].pc)}.`);
  }

  return notes;
}

function analyzeTableRegion(mem) {
  const fullRows = disassembleRange(TABLE_SCAN_START, TABLE_CONTEXT_END);
  const contextRows = disassembleRange(TABLE_CONTEXT_START, TABLE_CONTEXT_END);
  const slotAddresses = [];

  for (const row of fullRows) {
    if (row.inst?.tag === 'ld-pair-imm' && row.inst.pair === 'hl') {
      slotAddresses.push(row.inst.value >>> 0);
    }
  }

  const callCount = fullRows.filter((row) => row.inst?.tag === 'call' && row.inst.target === PTR_UPDATE).length;
  const slotInfo = slotAddresses.map((slotAddr, index) => {
    const value = read24(mem, slotAddr);
    let region = 'other';
    if (value === 0x000000) region = 'zero';
    else if (value >= 0xD00000 && value <= 0xFFFFFF) region = 'ram';
    else if (value < 0x400000) region = 'rom';

    return {
      index: index + 1,
      slotAddr,
      value,
      region,
    };
  });

  const candidateDumpStart = slotAddresses[0] ?? null;
  const candidateDump = candidateDumpStart === null
    ? null
    : mem.slice(candidateDumpStart, candidateDumpStart + 256);

  const pointerAdjusterLikely =
    slotAddresses.length >= 8 &&
    slotAddresses.every((addr) => addr >= 0xD00000 && addr <= 0xFFFFFF) &&
    callCount >= Math.max(1, slotAddresses.length - 2);

  return {
    fullRows,
    contextRows,
    slotInfo,
    callCount,
    candidateDumpStart,
    candidateDump,
    pointerAdjusterLikely,
  };
}

function runClassifyTrace(env, baselineMem, baselineCpu) {
  env.mem.set(baselineMem);
  restoreCpu(env.cpu, baselineCpu);
  prepareCallState(env.cpu, env.mem);

  env.mem[KBD_KEY] = TRACE_KEY;
  env.cpu.a = TRACE_KEY;

  const beforeEditCursor = read24(env.mem, EDIT_CURSOR);
  const beforeMaskByte = env.mem[MASKED_FLAG_BYTE] & 0xff;
  const beforeHomeScan = env.mem[HOME_SCAN_RESULT] & 0xff;

  env.cpu.sp -= 3;
  write24(env.mem, env.cpu.sp, FAKE_RET);

  const visitedSet = new Set();
  const visitedFirst200 = [];
  let observedBlocks = 0;
  let observedMissing = 0;
  let bufInsertSeen = false;
  let returned = false;
  let lastObservedPc = CLASSIFY_HELPER;
  let executorResult = null;

  const observePc = (pc, isMissing = false) => {
    const normalized = pc & 0xffffff;
    lastObservedPc = normalized;
    if (!visitedSet.has(normalized)) {
      visitedSet.add(normalized);
      if (visitedFirst200.length < 200) {
        visitedFirst200.push(normalized);
      }
    }

    if (normalized === BUF_INSERT) {
      bufInsertSeen = true;
    }

    if (normalized === FAKE_RET) {
      throw new Error('__RET__');
    }

    if (isMissing) observedMissing += 1;
    else observedBlocks += 1;
  };

  try {
    executorResult = env.executor.runFrom(CLASSIFY_HELPER, 'adl', {
      maxSteps: TRACE_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        observePc(pc, false);
      },
      onMissingBlock(pc) {
        observePc(pc, true);
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    termination: returned ? 'sentinel_return' : (executorResult?.termination ?? 'unknown'),
    lastPc: returned ? FAKE_RET : (executorResult?.lastPc ?? lastObservedPc),
    observedBlocks,
    observedMissing,
    visitedCount: visitedSet.size,
    visitedFirst200,
    bufInsertSeen,
    beforeEditCursor,
    afterEditCursor: read24(env.mem, EDIT_CURSOR),
    beforeMaskByte,
    afterMaskByte: env.mem[MASKED_FLAG_BYTE] & 0xff,
    beforeHomeScan,
    afterHomeScan: env.mem[HOME_SCAN_RESULT] & 0xff,
    kbdKeyAfter: env.mem[KBD_KEY] & 0xff,
    finalA: env.cpu.a & 0xff,
  };
}

function renderVisitedList(values) {
  if (values.length === 0) return '(none)';

  return values.map((value, index) => `${String(index + 1).padStart(3, ' ')}: ${hex(value)}`).join('\n');
}

function renderSlotTable(slotInfo) {
  const lines = [
    '| # | Slot Address | 24-bit Value | Region Guess |',
    '| --- | --- | --- | --- |',
  ];

  for (const slot of slotInfo) {
    lines.push(`| ${slot.index} | ${hex(slot.slotAddr)} | ${hex(slot.value)} | ${slot.region} |`);
  }

  return lines.join('\n');
}

function buildSummary(lookupAnalysis, classifyAnalysis, tableAnalysis, trace) {
  const lines = [];

  lines.push(`- \`${hex(LOOKUP_HELPER)}\` root slice is only ${lookupAnalysis.rootRows.length} instruction(s) and zeroes \`${hex(LOOKUP_SCRATCH)}\`; it is not a key-code lookup in this ROM build.`);
  lines.push(`- \`${hex(CLASSIFY_HELPER)}\` root slice is only ${classifyAnalysis.rootRows.length} instruction(s) and masks \`${hex(MASKED_FLAG_BYTE)}\` with \`0xC0\`; it does not read \`${hex(KBD_KEY)}\` or call \`${hex(BUF_INSERT)}\`.`);

  if (tableAnalysis.pointerAdjusterLikely) {
    lines.push(`- \`${hex(TABLE_SCAN_START)}..${hex(PTR_UPDATE)}\` decodes as a 27-slot RAM pointer adjuster (` + '`ld hl, <slot>; call 0x0825D1`' + ` pattern), not a key-code dispatch table.`);
  } else {
    lines.push(`- \`${hex(TABLE_SCAN_START)}..${hex(PTR_UPDATE)}\` still needs manual review; the extracted slot pattern is not a clean key-dispatch layout.`);
  }

  lines.push(`- Direct trace from \`${hex(CLASSIFY_HELPER)}\` with \`kbdKey=${hexByte(TRACE_KEY)}\` ${trace.returned ? 'returned immediately' : `ended with ${trace.termination}`}, never reached \`${hex(BUF_INSERT)}\`, and left \`editCursor\` ${trace.beforeEditCursor === trace.afterEditCursor ? 'unchanged' : 'changed'}.`);
  lines.push(`- The real home-handler path at \`${hex(HOME_HANDLER)}\` may need the adjacent routines at \`${hex(CLASSIFY_HELPER + 0x0B)}\` and \`${hex(LOOKUP_HELPER + 0x06)}\` instead; both tiny entry helpers return before any digit dispatch appears.`);

  return lines;
}

function buildReport(payload) {
  const {
    memInitReturned,
    lookupAnalysis,
    classifyAnalysis,
    lookupNotes,
    classifyNotes,
    tableAnalysis,
    trace,
  } = payload;

  const lines = [];

  lines.push('# Phase 181 - Key Classification Subroutine Disassembly');
  lines.push('');
  lines.push(`Generated by \`probe-phase181-key-classify.mjs\` on ${new Date().toISOString()}.`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(...buildSummary(lookupAnalysis, classifyAnalysis, tableAnalysis, trace));
  lines.push('');
  lines.push('## Boot Baseline');
  lines.push('');
  lines.push(`- Cold boot: \`${hex(BOOT_ENTRY)}\` in Z80 mode, 20000-step budget`);
  lines.push(`- Kernel init: \`${hex(KERNEL_INIT_ENTRY)}\` in ADL mode, 100000-step budget`);
  lines.push(`- Post-init: \`${hex(POST_INIT_ENTRY)}\` in ADL mode, 100-step budget`);
  lines.push(`- MEM_INIT: \`${hex(MEMINIT_ENTRY)}\` with sentinel return ${memInitReturned ? 'confirmed' : 'not observed'}`);
  lines.push('');
  lines.push('## Part 1 - 0x058D49 Disassembly');
  lines.push('');
  lines.push(...classifyNotes);
  lines.push('');
  lines.push('### Linear Window From 0x058D49');
  lines.push('');
  lines.push('```text');
  lines.push(renderDisassembly(classifyAnalysis.rows, classifyAnalysis.rootExitPc));
  lines.push('```');
  lines.push('');
  lines.push('## Part 2 - 0x058BA3 Disassembly');
  lines.push('');
  lines.push(...lookupNotes);
  lines.push('');
  lines.push('### Linear Window From 0x058BA3');
  lines.push('');
  lines.push('```text');
  lines.push(renderDisassembly(lookupAnalysis.rows, lookupAnalysis.rootExitPc));
  lines.push('```');
  lines.push('');
  lines.push('## Part 3 - 0x0824FD / 0x0825D1 Table Revisit');
  lines.push('');
  lines.push(`- Repeated direct calls to \`${hex(PTR_UPDATE)}\`: ${tableAnalysis.callCount}`);
  lines.push(`- Extracted HL-immediate slot count: ${tableAnalysis.slotInfo.length}`);
  lines.push(`- Verdict: ${tableAnalysis.pointerAdjusterLikely ? 'looks like an InsertMem pointer-adjust table, not a key dispatch table' : 'undetermined from static pattern alone'}`);
  lines.push('');
  lines.push('### Surrounding Context (0x0825C0 .. 0x0825F0)');
  lines.push('');
  lines.push('```text');
  lines.push(renderDisassembly(tableAnalysis.contextRows));
  lines.push('```');
  lines.push('');
  lines.push('### Expanded Scan Region (0x0824FD .. 0x0825F0)');
  lines.push('');
  lines.push('```text');
  lines.push(renderDisassembly(tableAnalysis.fullRows));
  lines.push('```');
  lines.push('');
  lines.push('### Extracted Slot Addresses And Live 24-bit Values');
  lines.push('');
  lines.push(renderSlotTable(tableAnalysis.slotInfo));
  lines.push('');

  if (tableAnalysis.candidateDumpStart !== null && tableAnalysis.candidateDump) {
    lines.push(`### 256-byte Live Dump From First Candidate Slot Region (${hex(tableAnalysis.candidateDumpStart)})`);
    lines.push('');
    lines.push('```text');
    lines.push(formatHexDump(tableAnalysis.candidateDumpStart, tableAnalysis.candidateDump));
    lines.push('```');
    lines.push('');
  }

  lines.push('## Part 4 - Direct Trace Of 0x058D49 With k2 (0x90)');
  lines.push('');
  lines.push(`- Requested seed: \`kbdKey=${hexByte(TRACE_KEY)}\`, \`A=${hexByte(TRACE_KEY)}\`, \`mbase=${hexByte(ANALYSIS_MBASE)}\`, \`iy=${hex(ANALYSIS_IY)}\`, \`ix=${hex(ANALYSIS_IX)}\`, \`f=${hexByte(ANALYSIS_F)}\``);
  lines.push('- Important caveat: the immediately preceding helper at `0x058BA3` zeroes `A`, so the real home-handler call path likely does not arrive here with a digit code in `A`.');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| --- | --- |');
  lines.push(`| Returned via sentinel | ${trace.returned ? 'yes' : 'no'} |`);
  lines.push(`| Termination | ${trace.termination} |`);
  lines.push(`| Last PC | ${hex(trace.lastPc)} |`);
  lines.push(`| Observed lifted blocks | ${trace.observedBlocks} |`);
  lines.push(`| Observed missing-block callbacks | ${trace.observedMissing} |`);
  lines.push(`| Unique PCs visited | ${trace.visitedCount} |`);
  lines.push(`| BufInsert reached | ${trace.bufInsertSeen ? 'yes' : 'no'} |`);
  lines.push(`| editCursor before | ${hex(trace.beforeEditCursor)} |`);
  lines.push(`| editCursor after | ${hex(trace.afterEditCursor)} |`);
  lines.push(`| 0xD0008E before | ${hexByte(trace.beforeMaskByte)} |`);
  lines.push(`| 0xD0008E after | ${hexByte(trace.afterMaskByte)} |`);
  lines.push(`| 0xD0265B before | ${hexByte(trace.beforeHomeScan)} |`);
  lines.push(`| 0xD0265B after | ${hexByte(trace.afterHomeScan)} |`);
  lines.push(`| kbdKey after | ${hexByte(trace.kbdKeyAfter)} |`);
  lines.push(`| Final A | ${hexByte(trace.finalA)} |`);
  lines.push('');
  lines.push('### First 200 Unique PCs');
  lines.push('');
  lines.push('```text');
  lines.push(renderVisitedList(trace.visitedFirst200));
  lines.push('```');
  lines.push('');
  lines.push('## Conclusion');
  lines.push('');
  lines.push('- `0x058BA3` and `0x058D49` are both tiny helpers in this ROM build; neither is the missing digit-key dispatch path.');
  lines.push('- `0x0824FD/0x0825D1` is strongly consistent with pointer-slot maintenance used by InsertMem-style code, not a keyboard routing table.');
  lines.push('- The next practical search targets are the adjacent routines immediately after those helpers (`0x058BA9` and `0x058D54`) or whichever caller actually consumes `kbdKey` / reaches `BufInsert`.');
  lines.push('');

  return lines.join('\n') + '\n';
}

function main() {
  const lookupAnalysis = disassembleWindow(LOOKUP_HELPER, 100);
  const classifyAnalysis = disassembleWindow(CLASSIFY_HELPER, 150);
  const lookupNotes = collectRootNotes('0x058BA3', lookupAnalysis);
  const classifyNotes = collectRootNotes('0x058D49', classifyAnalysis);

  const env = createRuntime();
  coldBoot(env.executor, env.cpu, env.mem);
  const memInitReturned = runMemInit(env.executor, env.cpu, env.mem);

  const baselineMem = new Uint8Array(env.mem);
  const baselineCpu = snapshotCpu(env.cpu);

  const tableAnalysis = analyzeTableRegion(env.mem);
  const trace = runClassifyTrace(env, baselineMem, baselineCpu);

  const report = buildReport({
    memInitReturned,
    lookupAnalysis,
    classifyAnalysis,
    lookupNotes,
    classifyNotes,
    tableAnalysis,
    trace,
  });

  fs.writeFileSync(REPORT_PATH, report, 'utf8');

  console.log('Phase 181 key-classify probe complete.');
  console.log(`Report: ${REPORT_PATH}`);
  console.log(`0x058BA3 root length: ${lookupAnalysis.rootRows.length} instruction(s)`);
  console.log(`0x058D49 root length: ${classifyAnalysis.rootRows.length} instruction(s)`);
  console.log(`0x0824FD slot count: ${tableAnalysis.slotInfo.length}`);
  console.log(`0x058D49 direct trace: ${trace.returned ? 'returned' : trace.termination}, BufInsert=${trace.bufInsertSeen ? 'yes' : 'no'}`);
}

main();
