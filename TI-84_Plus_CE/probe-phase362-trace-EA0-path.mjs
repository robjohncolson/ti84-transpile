#!/usr/bin/env node

/**
 * Phase 362: Trace 0x000EA0 alternate boot path
 *
 * Run output (2026-05-18):
 * - The GPIO decision is at 0x000E92: `JR NZ, 0x000EA0` after `IN0 A,(0x03)` / `BIT 4,A`.
 *   GPIO=0xEF (bit 4 clear) falls through to 0x000E94. GPIO=0xFF (bit 4 set) jumps to 0x000EA0.
 * - 0x000E94 loads IX=0x000EB9 and copies a 90-byte ROM routine (0x000EBB..0x000F13) to RAM 0xD18C22.
 *   That copied routine is classified "unknown" (no flash-unlock or E008xx MMIO detected in the
 *   first block; the routine checks boot flag bit 6 at 0x00007E and branches).
 * - 0x000EA0 tests boot flag bit 6 at 0x00007E; when set it jumps to 0x000EAD, loads IX=0x000F15,
 *   and copies a 153-byte ROM routine (0x000F17..0x000FAF) to RAM 0xD18BE3.
 *   That copied routine writes/polls 0xE008xx keyboard-controller MMIO (9 registers), so the
 *   alternate path is a keyboard-controller MMIO setup path.
 * - GPIO=0xFF boot: 499 unique blocks, 3692 steps, termination `missing_block` at 0x4C7B21.
 *   GPIO=0xEF boot: 476 unique blocks, 2688 steps, termination `missing_block` at 0x4C7B21.
 * - FF-only blocks: 32 (includes 0x000EA0, 0x000EAD, 0xD18BE3, plus 0x015930..0x0159BB range).
 *   EF-only blocks: 9 (includes 0x000E94, 0x000E9D, 0xD18C22).
 * - Both paths terminate at the same frontier (0x4C7B21). GPIO=0xFF explores 23 more unique blocks.
 * - With the current RAM trampoline enabled, the copied RAM blocks at 0xD18BE3 / 0xD18C22 are not
 *   executed dynamically; the executor injects a synthetic RET at the first RAM miss. The branch
 *   function is therefore inferred from static ROM disassembly plus the block-level boot trace.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 100000;
const IO_TRACE_STEP_LIMIT = 200;
const RAM_COPY_TOP = 0xD18C7C;

const CONTEXT_ENTRY_PC = 0x000E77;
const CONTEXT_DECISION_PC = 0x000E7F;
const GPIO_BRANCH_PC = 0x000E92;
const STANDARD_PATH_PC = 0x000E94;
const STANDARD_RETURN_PC = 0x000E9D;
const ALTERNATE_PATH_PC = 0x000EA0;
const ALTERNATE_COPY_PC = 0x000EAD;
const ALTERNATE_RETURN_PC = 0x000EB6;
const STANDARD_PARAM_ADDR = 0x000EB9;
const ALTERNATE_PARAM_ADDR = 0x000F15;
const CODE_COPY_HELPER_PC = 0x000D7E;
const STANDARD_RAM_DEST = 0xD18C22;
const ALTERNATE_RAM_DEST = 0xD18BE3;

const INTERESTING_PATH_PCS = new Set([
  CONTEXT_ENTRY_PC,
  CONTEXT_DECISION_PC,
  STANDARD_PATH_PC,
  STANDARD_RETURN_PC,
  ALTERNATE_PATH_PC,
  ALTERNATE_COPY_PC,
  ALTERNATE_RETURN_PC,
  STANDARD_RAM_DEST,
  ALTERNATE_RAM_DEST,
]);

const E008_MMIO_LABELS = new Map([
  [0xE00800, 'kbd.ctrl00-02'],
  [0xE00803, 'kbd.mode'],
  [0xE00804, 'kbd.ctrl04-06'],
  [0xE00807, 'kbd.enable'],
  [0xE00808, 'kbd.column'],
  [0xE0080B, 'kbd.ctrl0b'],
  [0xE0080C, 'kbd.groupSelect'],
  [0xE0080F, 'kbd.interval'],
  [0xE00818, 'kbd.status'],
  [0xE00824, 'kbd.ready'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${((Number(value) >>> 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function bytesAt(romBytes, start, length) {
  return Array.from(
    romBytes.subarray(start, start + Math.max(1, length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read16LE(romBytes, offset) {
  return ((romBytes[offset] ?? 0) | ((romBytes[offset + 1] ?? 0) << 8)) >>> 0;
}

function safeDecode(romBytes, pc, mode = 'adl') {
  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch {
    return null;
  }
}

function formatAddr(addr) {
  if (addr === undefined || addr === null) {
    return 'n/a';
  }
  return hex(addr, addr > 0xFFFF ? 6 : 4);
}

function formatIndexedOperand(indexRegister, displacement = 0) {
  const prefix = (indexRegister ?? 'ix').toUpperCase();
  const disp = Number(displacement) | 0;
  if (disp === 0) {
    return `(${prefix})`;
  }
  return `(${prefix}${disp >= 0 ? '+' : ''}${disp})`;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode failed)';
  }

  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${inst.indirectRegister.toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'im': return `IM ${inst.value}`;
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-reg-imm': return `LD ${(inst.dest ?? inst.dst).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${(inst.dest ?? inst.dst).toUpperCase()}, (${formatAddr(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${formatAddr(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${(inst.dest ?? inst.dst).toUpperCase()}, (${(inst.src ?? inst.ptr).toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${(inst.dest ?? inst.ptr).toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-mem-pair':
      return `LD (${formatAddr(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${formatAddr(inst.addr)}), ${inst.pair.toUpperCase()}`;
      }
      return `LD ${inst.pair.toUpperCase()}, (${formatAddr(inst.addr)})`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'add-pair': return `ADD ${(inst.dest ?? 'HL').toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'in0': return `IN0 ${(inst.reg ?? 'A').toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0': return `OUT0 (${hexByte(inst.port)}), ${(inst.reg ?? 'A').toUpperCase()}`;
    case 'in-reg': return `IN ${(inst.reg ?? 'A').toUpperCase()}, (C)`;
    case 'out-reg': return `OUT (C), ${(inst.reg ?? 'A').toUpperCase()}`;
    case 'alu-reg':
      if (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc') {
        return `${inst.op.toUpperCase()} A, ${inst.src.toUpperCase()}`;
      }
      return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm':
      if (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc') {
        return `${inst.op.toUpperCase()} A, ${hexByte(inst.value)}`;
      }
      return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    default: {
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key)) {
          continue;
        }
        if (value === undefined || value === null) {
          continue;
        }
        fields.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${String(value)}`);
      }
      return fields.length > 0 ? `${inst.tag} ${fields.join(' ')}` : inst.tag;
    }
  }
}

function isStopInstruction(inst) {
  if (!inst) {
    return true;
  }
  if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn' || inst.tag === 'ret-conditional') {
    return true;
  }
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jp-indirect') {
    return true;
  }
  if (inst.tag === 'jr') {
    return true;
  }
  return false;
}

function disassembleBlock(romBytes, startPc, maxBytes = 128) {
  const rows = [];
  let pc = startPc;
  const endPc = Math.min(romBytes.length, startPc + Math.max(1, maxBytes));

  while (pc < endPc) {
    const inst = safeDecode(romBytes, pc, 'adl');
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: formatInstruction(inst),
      inst,
    });

    pc += length;
    if (isStopInstruction(inst)) {
      break;
    }
  }

  return rows;
}

function containsWriteTo(rows, address) {
  return rows.some(
    (row) => (row.inst?.tag === 'ld-mem-reg' || row.inst?.tag === 'ld-mem-pair' || row.inst?.tag === 'ld-pair-mem')
      && row.inst?.addr === address,
  );
}

function collectMmioTouchSummary(rows) {
  const writes = [];
  const reads = [];

  for (const row of rows) {
    const addr = row.inst?.addr;
    if (typeof addr !== 'number' || addr < 0xE00800 || addr >= 0xE00920) {
      continue;
    }

    const label = E008_MMIO_LABELS.get(addr) ?? `kbd.mmio+${hex(addr - 0xE00800, 2)}`;
    const entry = `${hex(addr)} (${label})`;

    if (
      row.inst?.tag === 'ld-mem-reg'
      || row.inst?.tag === 'ld-mem-pair'
      || (row.inst?.tag === 'ld-pair-mem' && row.inst?.direction === 'to-mem')
    ) {
      writes.push(entry);
      continue;
    }

    if (row.inst?.tag === 'ld-reg-mem' || row.inst?.tag === 'ld-pair-mem') {
      reads.push(entry);
    }
  }

  return {
    writes: [...new Set(writes)],
    reads: [...new Set(reads)],
  };
}

function classifyCopiedRoutine(rows) {
  const mmio = collectMmioTouchSummary(rows);
  const flashUnlock = containsWriteTo(rows, 0x000AAA) && containsWriteTo(rows, 0x000555);
  const pollsReady = rows.some((row) => row.inst?.tag === 'ld-reg-mem' && row.inst?.addr === 0xE00824);
  const pollsStatus = rows.some((row) => row.inst?.tag === 'ld-reg-mem' && row.inst?.addr === 0xE00818);
  const writesE00900 = containsWriteTo(rows, 0xE00900);
  const writesE008 = mmio.writes.length > 0;

  let verdict = 'unknown copied routine';
  if (writesE008 && (pollsReady || pollsStatus || writesE00900)) {
    verdict = 'keyboard-controller MMIO setup routine';
  } else if (flashUnlock) {
    verdict = 'flash self-test / autoselect routine';
  }

  return {
    verdict,
    flashUnlock,
    pollsReady,
    pollsStatus,
    writesE00900,
    mmio,
  };
}

function analyzeCopiedRoutine(romBytes, paramAddr) {
  const length = read16LE(romBytes, paramAddr);
  const codeStart = paramAddr + 2;
  const ramDest = (RAM_COPY_TOP - length) >>> 0;
  const rows = disassembleBlock(romBytes, codeStart, length + 8);
  const classification = classifyCopiedRoutine(rows);

  return {
    paramAddr,
    length,
    codeStart,
    ramDest,
    rows,
    ...classification,
  };
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function runBoot(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus, gpioValue) {
  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const uniqueBlocks = new Set();
  const missingBlocks = [];
  const pathHits = [];
  const ioTrace = [];
  let blockStep = 0;

  cpu.onIoRead = (port, value) => {
    if (blockStep < IO_TRACE_STEP_LIMIT) {
      ioTrace.push({
        step: blockStep + 1,
        dir: 'IN',
        port: port & 0xFFFF,
        value: value & 0xFF,
        pc: cpu._currentBlockPc & 0xFFFFFF,
        mode: cpu.madl ? 'adl' : 'z80',
      });
    }
  };

  cpu.onIoWrite = (port, value) => {
    if (blockStep < IO_TRACE_STEP_LIMIT) {
      ioTrace.push({
        step: blockStep + 1,
        dir: 'OUT',
        port: port & 0xFFFF,
        value: value & 0xFF,
        pc: cpu._currentBlockPc & 0xFFFFFF,
        mode: cpu.madl ? 'adl' : 'z80',
      });
    }
  };

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      blockStep = step;
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      uniqueBlocks.add(blockKey(normalizedPc, normalizedMode));

      if (INTERESTING_PATH_PCS.has(normalizedPc)) {
        pathHits.push({
          step: step + 1,
          pc: normalizedPc,
          mode: normalizedMode,
          kind: 'block',
        });
      }
    },
    onMissingBlock(pc, mode, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      missingBlocks.push({
        step: step + 1,
        pc: normalizedPc,
        mode: normalizedMode,
      });

      if (INTERESTING_PATH_PCS.has(normalizedPc)) {
        pathHits.push({
          step: step + 1,
          pc: normalizedPc,
          mode: normalizedMode,
          kind: 'missing_block',
        });
      }
    },
  });

  return {
    gpioValue,
    result,
    uniqueBlocks: [...uniqueBlocks].sort(),
    uniqueBlockCount: uniqueBlocks.size,
    missingBlocks,
    pathHits,
    ioTrace,
  };
}

function compareRuns(ffRun, efRun) {
  const ffOnly = ffRun.uniqueBlocks.filter((key) => !efRun.uniqueBlocks.includes(key));
  const efOnly = efRun.uniqueBlocks.filter((key) => !ffRun.uniqueBlocks.includes(key));

  return {
    ffOnly,
    efOnly,
  };
}

function describeBranchContext() {
  return [
    `- ${hex(CONTEXT_ENTRY_PC)} is a short setup stub that jumps to ${hex(CONTEXT_DECISION_PC)}.`,
    `- ${hex(GPIO_BRANCH_PC)} is the key branch: after \`IN0 A,(0x03)\` and \`BIT 4,A\`,`,
    `  \`JR NZ, ${hex(ALTERNATE_PATH_PC)}\` takes the alternate path when GPIO bit 4 is set.`,
    `- GPIO bit 4 clear falls through to ${hex(STANDARD_PATH_PC)}.`,
  ];
}

function printDisassembly(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(18)} ${row.text}`);
  }
  console.log('');
}

function printLines(title, lines) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const line of lines) {
    console.log(line);
  }
  console.log('');
}

function printCopiedRoutine(title, info) {
  console.log(title);
  console.log('-'.repeat(title.length));
  console.log(`  parameter block: ${hex(info.paramAddr)}`);
  console.log(`  byte length:     ${info.length} (${hex(info.length, 4)})`);
  console.log(`  ROM start:       ${hex(info.codeStart)}`);
  console.log(`  RAM destination: ${hex(info.ramDest)}`);
  console.log(`  classification:  ${info.verdict}`);
  console.log(`  flash unlock:    ${info.flashUnlock}`);
  console.log(`  polls ready:     ${info.pollsReady}`);
  console.log(`  polls status:    ${info.pollsStatus}`);
  console.log(`  writes E00900:   ${info.writesE00900}`);
  console.log('');

  if (info.mmio.writes.length > 0) {
    console.log('  MMIO writes:');
    for (const entry of info.mmio.writes) {
      console.log(`    ${entry}`);
    }
    console.log('');
  }

  if (info.mmio.reads.length > 0) {
    console.log('  MMIO reads:');
    for (const entry of info.mmio.reads) {
      console.log(`    ${entry}`);
    }
    console.log('');
  }

  printDisassembly(`  Disassembly from ${hex(info.codeStart)}`, info.rows);
}

function printBootSummary(label, run) {
  console.log(label);
  console.log('-'.repeat(label.length));
  console.log(`  GPIO:            ${hexByte(run.gpioValue)}`);
  console.log(`  steps:           ${run.result.steps}`);
  console.log(`  termination:     ${run.result.termination}`);
  console.log(`  last pc:         ${hex(run.result.lastPc)}:${run.result.lastMode}`);
  console.log(`  unique blocks:   ${run.uniqueBlockCount}`);
  console.log(`  missing blocks:  ${run.missingBlocks.length}`);
  console.log('');

  const firstPathWindow = run.pathHits.slice(0, 12);
  if (firstPathWindow.length > 0) {
    console.log('  First branch-window hits:');
    for (const hit of firstPathWindow) {
      const suffix = hit.kind === 'missing_block' ? ' (RAM trampoline site)' : '';
      console.log(`    step=${String(hit.step).padStart(5)}  ${hex(hit.pc)}:${hit.mode}${suffix}`);
    }
    console.log('');
  }

  if (run.missingBlocks.length > 0) {
    console.log('  Missing blocks:');
    for (const miss of run.missingBlocks.slice(0, 8)) {
      console.log(`    step=${String(miss.step).padStart(5)}  ${hex(miss.pc)}:${miss.mode}`);
    }
    console.log('');
  }
}

function printComparison(comparison) {
  console.log('GPIO Path Comparison');
  console.log('--------------------');
  console.log(`  FF-only blocks: ${comparison.ffOnly.length}`);
  for (const block of comparison.ffOnly) {
    console.log(`    ${block}`);
  }
  console.log('');
  console.log(`  EF-only blocks: ${comparison.efOnly.length}`);
  for (const block of comparison.efOnly) {
    console.log(`    ${block}`);
  }
  console.log('');
}

function printIoTrace(title, ioTrace) {
  console.log(title);
  console.log('-'.repeat(title.length));
  if (ioTrace.length === 0) {
    console.log('  (no IN/OUT activity recorded)');
    console.log('');
    return;
  }

  for (const entry of ioTrace) {
    console.log(
      `  step=${String(entry.step).padStart(4)}  ${entry.dir.padEnd(3)}  `
      + `port=${hex(entry.port, 4)}  value=${hexByte(entry.value)}  `
      + `at=${hex(entry.pc)}:${entry.mode}`,
    );
  }
  console.log('');
}

function printVerdict(altRoutine, stdRoutine, ffRun, efRun) {
  console.log('Function Verdict');
  console.log('----------------');
  console.log(`- Standard path (${hex(STANDARD_PATH_PC)}) selects the ${stdRoutine.verdict} copied to ${hex(stdRoutine.ramDest)}.`);
  console.log(`- Alternate path (${hex(ALTERNATE_PATH_PC)} -> ${hex(ALTERNATE_COPY_PC)}) selects the ${altRoutine.verdict} copied to ${hex(altRoutine.ramDest)}.`);
  console.log(`- The alternate copied routine touches ${altRoutine.mmio.writes.length} E008xx MMIO locations and polls the keyboard-ready/status window, which matches keyboard controller configuration.`);
  console.log(`- Both boots terminate at the same final missing block (${hex(ffRun.result.lastPc)}), but GPIO=0xFF explores ${ffRun.uniqueBlockCount - efRun.uniqueBlockCount} more unique blocks before that point.`);
  console.log(`- Because the executor's RAM trampoline converts the first RAM miss into a synthetic RET, the copied code is not executed dynamically in this probe. The hardware role comes from the ROM disassembly, not from runtime side effects at ${hex(altRoutine.ramDest)}.`);
  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regenerated = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  const entryRows = disassembleBlock(romBytes, CONTEXT_ENTRY_PC);
  const decisionRows = disassembleBlock(romBytes, CONTEXT_DECISION_PC);
  const standardRows = disassembleBlock(romBytes, STANDARD_PATH_PC);
  const alternateRows = disassembleBlock(romBytes, ALTERNATE_PATH_PC);
  const alternateCopyRows = disassembleBlock(romBytes, ALTERNATE_COPY_PC);

  const standardRoutine = analyzeCopiedRoutine(romBytes, STANDARD_PARAM_ADDR);
  const alternateRoutine = analyzeCopiedRoutine(romBytes, ALTERNATE_PARAM_ADDR);

  const ffRun = runBoot(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus, 0xFF);
  const efRun = runBoot(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus, 0xEF);
  const comparison = compareRuns(ffRun, efRun);

  console.log('Phase 362: Trace 0x000EA0 Alternate Path');
  console.log('=========================================');
  console.log(`ROM:                ${ROM_PATH}`);
  console.log(`Transpiled ROM:     ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:        entry=${hex(BOOT_ENTRY)}:${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} timerInterrupt=false RAM-trampoline=enabled`);
  console.log(`Code-copy helper:   ${hex(CODE_COPY_HELPER_PC)}`);
  console.log('');

  printLines('Branch Context', describeBranchContext().map((line) => `  ${line}`));
  printDisassembly(`Context block ${hex(CONTEXT_ENTRY_PC)}`, entryRows);
  printDisassembly(`Decision block ${hex(CONTEXT_DECISION_PC)}`, decisionRows);
  printDisassembly(`Standard-path block ${hex(STANDARD_PATH_PC)}`, standardRows);
  printDisassembly(`Alternate block ${hex(ALTERNATE_PATH_PC)}`, alternateRows);
  printDisassembly(`Alternate copy-selector block ${hex(ALTERNATE_COPY_PC)}`, alternateCopyRows);

  printCopiedRoutine(`Standard copied routine (${hex(STANDARD_PARAM_ADDR)} header)`, standardRoutine);
  printCopiedRoutine(`Alternate copied routine (${hex(ALTERNATE_PARAM_ADDR)} header)`, alternateRoutine);

  printBootSummary('Boot with GPIO=0xFF', ffRun);
  printBootSummary('Boot with GPIO=0xEF', efRun);
  printComparison(comparison);
  printIoTrace('GPIO=0xFF port I/O for the first 200 block steps', ffRun.ioTrace);
  printVerdict(alternateRoutine, standardRoutine, ffRun, efRun);
}

main().catch((error) => {
  console.error('[probe-phase362-trace-EA0-path] fatal:', error?.stack ?? error);
  process.exitCode = 1;
});
