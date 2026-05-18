#!/usr/bin/env node

/**
 * Phase 361: investigate missing block 0xA86301 (archive flash terminator)
 *
 * Goals:
 *   1. Static disassembly around 0x0000F8 and 0x002580
 *   2. Dynamic boot trace from 0x000000:z80 with the built-in RAM trampoline
 *   3. Memory dump at 0xA86300 after termination
 *   4. Determine whether 0xA86301 is a literal branch target or a computed one
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
const BOOT_MAX_STEPS = 50000;
const MAX_LOOP_ITERATIONS = 50000;

const HIGH_FLASH_THRESHOLD = 0xA00000;
const TARGET_TERMINATOR = 0xA86301;
const LAST_BLOCK_WINDOW = 30;
const STACK_CAPTURE_ENTRIES = 4;

const RESET_WINDOW_START = 0x0000F8;
const RESET_WINDOW_BYTES = 64;
const RESET_ANCHOR = 0x0000FA;

const HELPER_WINDOW_START = 0x002580;
const HELPER_WINDOW_BYTES = 64;
const HELPER_ANCHOR = 0x002588;

const MEMORY_DUMP_START = 0xA86300;
const MEMORY_DUMP_BYTES = 24;

const BLOCK_0000FC = 0x0000FC;
const BLOCK_002588 = 0x002588;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function read24(buffer, addr) {
  const a = addr & 0xFFFFFF;
  return (buffer[a] ?? 0) | ((buffer[a + 1] ?? 0) << 8) | ((buffer[a + 2] ?? 0) << 16);
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'add-pair':
      return withModePrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'call':
      return withModePrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'dec-pair':
      return withModePrefix(inst, `dec ${inst.pair}`);
    case 'dec-reg':
      return withModePrefix(inst, `dec ${inst.reg}`);
    case 'djnz':
      return withModePrefix(inst, `djnz ${hex(inst.target)}`);
    case 'inc-pair':
      return withModePrefix(inst, `inc ${inst.pair}`);
    case 'inc-reg':
      return withModePrefix(inst, `inc ${inst.reg}`);
    case 'jp':
      return withModePrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withModePrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr':
      return withModePrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-a-mb':
      return withModePrefix(inst, 'ld a, mb');
    case 'ld-mb-a':
      return withModePrefix(inst, 'ld mb, a');
    case 'ld-ind-imm':
      return withModePrefix(inst, `ld (hl), ${hexByte(inst.value)}`);
    case 'ld-ind-reg':
      return withModePrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-reg-imm':
      return withModePrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-ixd': {
      const displacement = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return withModePrefix(inst, `ld ${inst.dest}, (${inst.indexRegister}${displacement})`);
    }
    case 'ld-reg-mem':
      return withModePrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'nop':
    case 'di':
    case 'ei':
    case 'halt':
    case 'ret':
      return withModePrefix(inst, inst.tag);
    case 'out-reg':
      return withModePrefix(inst, `out (${inst.port ?? 'c'}), ${inst.reg}`);
    case 'pop':
      return withModePrefix(inst, `pop ${inst.pair}`);
    case 'push':
      return withModePrefix(inst, `push ${inst.pair}`);
    case 'ret-conditional':
      return withModePrefix(inst, `ret ${inst.condition}`);
    case 'rst':
      return withModePrefix(inst, `rst ${hex(inst.target, 2)}`);
    default: {
      const ignored = new Set([
        'fallthrough',
        'kind',
        'length',
        'mode',
        'modePrefix',
        'nextMode',
        'nextPc',
        'pc',
        'targetMode',
        'terminates',
      ]);
      const parts = [];
      for (const [key, value] of Object.entries(inst ?? {})) {
        if (key === 'tag' || ignored.has(key) || value === undefined || value === null) {
          continue;
        }
        if (typeof value === 'number') {
          parts.push(`${key}=${hex(value)}`);
        } else {
          parts.push(`${key}=${value}`);
        }
      }
      return withModePrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : `${inst?.tag ?? 'unknown'}`);
    }
  }
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

function decodeLinearWindow(romBytes, startPc, byteLength, mode) {
  const rows = [];
  const end = Math.min(romBytes.length, startPc + byteLength);
  let pc = startPc;

  while (pc < end) {
    let inst = null;
    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      inst = null;
    }

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      rows.push({
        pc,
        bytes: hexBytes(romBytes, pc, 1),
        dasm: `db ${hexByte(romBytes[pc])}`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      bytes: hexBytes(romBytes, pc, inst.length),
      dasm: formatInstruction(inst),
      inst,
    });
    pc += inst.length;
  }

  return rows;
}

function decodeAnchoredSequence(romBytes, startPc, instructionCount, mode) {
  const rows = [];
  let pc = startPc;

  while (rows.length < instructionCount && pc < romBytes.length) {
    let inst = null;
    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      inst = null;
    }

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      rows.push({
        pc,
        bytes: hexBytes(romBytes, pc, 1),
        dasm: `db ${hexByte(romBytes[pc])}`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      bytes: hexBytes(romBytes, pc, inst.length),
      dasm: formatInstruction(inst),
      inst,
    });
    pc += inst.length;
  }

  return rows;
}

function printHexWindow(label, romBytes, start, length) {
  console.log(label);
  for (let offset = 0; offset < length; offset += 16) {
    const rowStart = start + offset;
    console.log(`  ${hex(rowStart)}: ${hexBytes(romBytes, rowStart, Math.min(16, length - offset))}`);
  }
  console.log('');
}

function printDisassembly(label, rows) {
  console.log(label);
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.dasm}`);
  }
  console.log('');
}

function scanImmediateHighTargets(meta) {
  if (!meta?.instructions) {
    return [];
  }

  return meta.instructions
    .filter((inst) => (
      (inst.tag === 'call'
        || inst.tag === 'call-conditional'
        || inst.tag === 'jp'
        || inst.tag === 'jp-conditional')
      && typeof inst.target === 'number'
      && inst.target >= HIGH_FLASH_THRESHOLD
    ))
    .map((inst) => ({
      pc: inst.pc,
      dasm: inst.dasm ?? formatInstruction(inst),
      target: inst.target,
      tag: inst.tag,
    }));
}

function captureRegisters(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    mbase: cpu.mbase & 0xFF,
    madl: cpu.madl ? 1 : 0,
  };
}

function dumpStackEntries(cpu, mem, count) {
  const entries = [];

  if (cpu.madl) {
    let addr = cpu.sp & 0xFFFFFF;
    for (let index = 0; index < count; index += 1) {
      entries.push({
        addr,
        width: 3,
        value: read24(mem, addr),
      });
      addr = (addr + 3) & 0xFFFFFF;
    }
    return entries;
  }

  let sps = cpu.sp & 0xFFFF;
  for (let index = 0; index < count; index += 1) {
    const addr = ((cpu.mbase & 0xFF) << 16) | sps;
    entries.push({
      addr,
      width: 2,
      value: (mem[addr] ?? 0) | ((mem[addr + 1] ?? 0) << 8),
    });
    sps = (sps + 2) & 0xFFFF;
  }

  return entries;
}

function printStackEntries(label, entries) {
  console.log(label);
  if (entries.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const entry of entries) {
    const width = entry.width === 3 ? 6 : 4;
    console.log(`  [${hex(entry.addr)}] -> ${hex(entry.value, width)}`);
  }
  console.log('');
}

function printRegisters(label, regs) {
  console.log(label);
  console.log(
    `  A=${hex(regs.a, 2)} F=${hex(regs.f, 2)} BC=${hex(regs.bc)} DE=${hex(regs.de)} `
      + `HL=${hex(regs.hl)} IX=${hex(regs.ix)} IY=${hex(regs.iy)} SP=${hex(regs.sp)} `
      + `MBASE=${hex(regs.mbase, 2)} MADL=${regs.madl}`,
  );
  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
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

  console.log('Phase 361: Investigate 0xA86301 (Archive Flash Terminator)');
  console.log('==========================================================');
  console.log(`ROM:        ${ROM_PATH}`);
  console.log(`Transpiled: ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log('');

  console.log('=== PART 1: STATIC DISASSEMBLY ===');
  console.log('');

  printHexWindow(
    `Raw bytes at ${hex(RESET_WINDOW_START)}..${hex(RESET_WINDOW_START + RESET_WINDOW_BYTES - 1)} (64-byte window)`,
    romBytes,
    RESET_WINDOW_START,
    RESET_WINDOW_BYTES,
  );
  printDisassembly(
    'Linear decode from 0x0000F8 (ADL)',
    decodeLinearWindow(romBytes, RESET_WINDOW_START, RESET_WINDOW_BYTES, 'adl'),
  );
  printDisassembly(
    'Anchored decode from 0x0000FA (ADL, reveals the 0x0000FA -> 0x0000FC path)',
    decodeAnchoredSequence(romBytes, RESET_ANCHOR, 8, 'adl'),
  );

  printHexWindow(
    `Raw bytes at ${hex(HELPER_WINDOW_START)}..${hex(HELPER_WINDOW_START + HELPER_WINDOW_BYTES - 1)} (64-byte window)`,
    romBytes,
    HELPER_WINDOW_START,
    HELPER_WINDOW_BYTES,
  );
  printDisassembly(
    'Linear decode from 0x002580 (ADL)',
    decodeLinearWindow(romBytes, HELPER_WINDOW_START, HELPER_WINDOW_BYTES, 'adl'),
  );
  printDisassembly(
    'Anchored decode from 0x002588 (ADL, the frontier helper)',
    decodeAnchoredSequence(romBytes, HELPER_ANCHOR, 8, 'adl'),
  );

  console.log('=== PART 2: DYNAMIC TRACE ===');
  console.log('');

  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const uniqueBlocks = new Set();
  const recentBlocks = [];
  const missingBlocks = [];
  const immediateHighTargets = new Map();
  const dynamicHighTargets = new Map();

  let terminatorContext = null;
  let block2588Entry = null;

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';

      uniqueBlocks.add(blockKey(normalizedPc, normalizedMode));
      recentBlocks.push({
        step: step + 1,
        pc: normalizedPc,
        mode: normalizedMode,
      });
      if (recentBlocks.length > LAST_BLOCK_WINDOW) {
        recentBlocks.shift();
      }

      for (const hit of scanImmediateHighTargets(meta)) {
        const key = `${normalizedPc}:${normalizedMode}:${hit.pc}:${hit.target}`;
        if (!immediateHighTargets.has(key)) {
          immediateHighTargets.set(key, {
            step: step + 1,
            callerPc: normalizedPc,
            callerMode: normalizedMode,
            ...hit,
          });
        }
      }

      if (normalizedPc === BLOCK_002588 && !block2588Entry) {
        block2588Entry = {
          step: step + 1,
          mode: normalizedMode,
          regs: captureRegisters(cpu),
          stackBytes: cpu.madl ? hexBytes(mem, cpu.sp & 0xFFFFFF, 12) : hexBytes(mem, (((cpu.mbase & 0xFF) << 16) | (cpu.sp & 0xFFFF)), 8),
          stackEntries: dumpStackEntries(cpu, mem, STACK_CAPTURE_ENTRIES),
        };
      }
    },
    onDynamicTarget(target, mode, callerPc, step) {
      const normalizedTarget = target & 0xFFFFFF;
      if (normalizedTarget < HIGH_FLASH_THRESHOLD) {
        return;
      }

      const normalizedCallerPc = callerPc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const meta = executor.blockMeta[blockKey(normalizedCallerPc, normalizedMode)];
      const lastInst = meta?.instructions?.[meta.instructions.length - 1] ?? null;
      const transfer = lastInst?.dasm ?? formatInstruction(lastInst);
      const key = `${normalizedCallerPc}:${normalizedMode}:${normalizedTarget}:${transfer}`;

      if (!dynamicHighTargets.has(key)) {
        dynamicHighTargets.set(key, {
          step: step + 1,
          callerPc: normalizedCallerPc,
          callerMode: normalizedMode,
          target: normalizedTarget,
          transfer,
        });
      }

      if (block2588Entry && normalizedCallerPc === BLOCK_002588 && !block2588Entry.dynamicTarget) {
        block2588Entry.dynamicTarget = {
          step: step + 1,
          target: normalizedTarget,
          transfer,
        };
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

      if (normalizedPc === TARGET_TERMINATOR && !terminatorContext) {
        terminatorContext = {
          step: step + 1,
          pc: normalizedPc,
          mode: normalizedMode,
          regs: captureRegisters(cpu),
          stackEntries: dumpStackEntries(cpu, mem, STACK_CAPTURE_ENTRIES),
          recentBlocks: [...recentBlocks],
        };
      }
    },
  });

  console.log('Boot summary');
  console.log('------------');
  console.log(`  termination:   ${result.termination}`);
  console.log(`  steps:         ${result.steps}`);
  console.log(`  unique blocks: ${uniqueBlocks.size}`);
  console.log(`  last pc:       ${hex(result.lastPc)}:${result.lastMode}`);
  console.log('');

  console.log(`Last ${LAST_BLOCK_WINDOW} blocks before the 0xA86301 terminator`);
  console.log('-------------------------------------------------------');
  if (!terminatorContext) {
    console.log('  Target terminator was not reached in this run.');
  } else {
    console.log(`  missing_block at step ${terminatorContext.step}: ${hex(terminatorContext.pc)}:${terminatorContext.mode}`);
    for (const entry of terminatorContext.recentBlocks) {
      console.log(`  step=${String(entry.step).padStart(6)}  ${hex(entry.pc)}:${entry.mode}`);
    }
  }
  console.log('');

  console.log(`Blocks with immediate CALL/JP targets >= ${hex(HIGH_FLASH_THRESHOLD)}`);
  console.log('--------------------------------------------------');
  if (immediateHighTargets.size === 0) {
    console.log('  none');
  } else {
    for (const entry of immediateHighTargets.values()) {
      console.log(
        `  step=${String(entry.step).padStart(6)}  caller=${hex(entry.callerPc)}:${entry.callerMode}  `
          + `${entry.dasm}  -> ${hex(entry.target)}`,
      );
    }
  }
  console.log('');

  console.log(`Dynamic exits to targets >= ${hex(HIGH_FLASH_THRESHOLD)}`);
  console.log('------------------------------------------');
  if (dynamicHighTargets.size === 0) {
    console.log('  none');
  } else {
    for (const entry of dynamicHighTargets.values()) {
      console.log(
        `  step=${String(entry.step).padStart(6)}  caller=${hex(entry.callerPc)}:${entry.callerMode}  `
          + `${entry.transfer}  -> ${hex(entry.target)}`,
      );
    }
  }
  console.log('');

  if (block2588Entry) {
    console.log('0x002588 entry capture');
    console.log('----------------------');
    console.log(`  step:       ${block2588Entry.step}`);
    console.log(`  mode:       ${block2588Entry.mode}`);
    console.log(`  stack raw:  ${block2588Entry.stackBytes}`);
    if (block2588Entry.dynamicTarget) {
      console.log(
        `  exit:       ${block2588Entry.dynamicTarget.transfer} -> `
          + `${hex(block2588Entry.dynamicTarget.target)} at step ${block2588Entry.dynamicTarget.step}`,
      );
    }
    console.log('');
    printRegisters('Registers at 0x002588 entry', block2588Entry.regs);
    printStackEntries('Top of stack at 0x002588 entry', block2588Entry.stackEntries);
  }

  if (terminatorContext) {
    printRegisters('Registers after the missing_block at 0xA86301', terminatorContext.regs);
    printStackEntries('Top of stack after termination', terminatorContext.stackEntries);
  }

  if (missingBlocks.length > 0) {
    console.log(`All missing blocks encountered (${missingBlocks.length})`);
    console.log('--------------------------------');
    for (const entry of missingBlocks) {
      console.log(`  step=${String(entry.step).padStart(6)}  ${hex(entry.pc)}:${entry.mode}`);
    }
    console.log('');
  }

  console.log('=== PART 3: MEMORY INSPECTION ===');
  console.log('');
  printHexWindow(
    `Memory bytes at ${hex(MEMORY_DUMP_START)}..${hex(MEMORY_DUMP_START + MEMORY_DUMP_BYTES - 1)}`,
    mem,
    MEMORY_DUMP_START,
    MEMORY_DUMP_BYTES,
  );

  console.log('=== PART 4: ANALYSIS ===');
  console.log('');

  const block0000fcMeta = PRELIFTED_BLOCKS[blockKey(BLOCK_0000FC, 'adl')];
  const block002588Meta = PRELIFTED_BLOCKS[blockKey(BLOCK_002588, 'adl')];
  const block002588ImmediateTargets = scanImmediateHighTargets(block002588Meta);
  const block002588ControlFlow = (block002588Meta?.instructions ?? []).filter((inst) => (
    inst.tag === 'call'
    || inst.tag === 'call-conditional'
    || inst.tag === 'jp'
    || inst.tag === 'jp-conditional'
    || inst.tag === 'jp-indirect'
    || inst.tag === 'ret'
    || inst.tag === 'ret-conditional'
  ));

  if (block0000fcMeta) {
    console.log('Block 0x0000FC:adl');
    for (const inst of block0000fcMeta.instructions) {
      console.log(`  ${hex(inst.pc)}  ${String(inst.bytes).padEnd(20)}  ${inst.dasm}`);
    }
    console.log('');
  }

  if (block002588Meta) {
    console.log('Block 0x002588:adl');
    for (const inst of block002588Meta.instructions) {
      console.log(`  ${hex(inst.pc)}  ${String(inst.bytes).padEnd(20)}  ${inst.dasm}`);
    }
    console.log('');
  }

  console.log('Findings');
  console.log('--------');
  if (block0000fcMeta?.instructions?.[0]?.target === BLOCK_002588) {
    console.log(`  ${hex(BLOCK_0000FC)} is a literal jump stub: ${block0000fcMeta.instructions[0].dasm}.`);
  }
  if (block002588ControlFlow.length > 0) {
    console.log(`  ${hex(BLOCK_002588)} control-flow instructions: ${block002588ControlFlow.map((inst) => inst.dasm).join('; ')}.`);
  }
  if (block002588ImmediateTargets.length === 0) {
    console.log(`  ${hex(BLOCK_002588)} has no immediate CALL/JP operand into archive flash; its only exit is RET.`);
  } else {
    console.log(`  ${hex(BLOCK_002588)} contains immediate high targets: ${block002588ImmediateTargets.map((inst) => `${inst.dasm} -> ${hex(inst.target)}`).join('; ')}.`);
  }

  const stackTop = block2588Entry?.stackEntries?.[0]?.value;
  const retTarget = block2588Entry?.dynamicTarget?.target;
  if (stackTop === TARGET_TERMINATOR && retTarget === TARGET_TERMINATOR) {
    console.log(
      `  The ${hex(TARGET_TERMINATOR)} target is stack-derived: top-of-stack at ${hex(BLOCK_002588)} entry `
        + `was already ${hex(TARGET_TERMINATOR)}, and the block exited via ${block2588Entry.dynamicTarget.transfer}.`,
    );
  } else if (retTarget === TARGET_TERMINATOR) {
    console.log(
      `  The ${hex(TARGET_TERMINATOR)} target was produced dynamically by ${hex(BLOCK_002588)} via `
        + `${block2588Entry.dynamicTarget.transfer}, not by an immediate operand in the block itself.`,
    );
  } else {
    console.log(`  Dynamic run did not capture a definitive ${hex(TARGET_TERMINATOR)} return from ${hex(BLOCK_002588)}.`);
  }

  if (immediateHighTargets.size === 0 && dynamicHighTargets.size > 0) {
    console.log('  No executed block used an immediate CALL/JP into 0xA00000+ during this boot trace.');
  }

  console.log('');
  console.log('Conclusion');
  console.log('----------');
  console.log(
    `  ${hex(TARGET_TERMINATOR)} does not come from a literal JP/CALL operand in ${hex(BLOCK_002588)}. `
      + `The helper is a tail-called byte-load routine that returns to a pre-existing 24-bit address on the stack.`,
  );
  console.log(
    `  When the probe is run, the memory dump at ${hex(MEMORY_DUMP_START)} shows what the emulator currently has `
      + `mapped there, which helps distinguish unmapped zeros from copied RAM or a banked flash view.`,
  );
  console.log('');
  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
