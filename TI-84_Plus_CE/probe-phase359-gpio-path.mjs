#!/usr/bin/env node

/**
 * probe-phase359-gpio-path.mjs
 *
 * Compare boot paths for GPIO port 0x03 bit 4:
 *   - GPIO=0xFF (bit 4=1): LD IX,0x001008; CALL 0x000D7E → E008xx MMIO routine
 *   - GPIO=0xEF (bit 4=0): LD IX,0x001259; CALL 0x000D7E → different code-copy
 *
 * For each GPIO value, run boot for 10,000 steps and compare:
 *   - Unique blocks visited
 *   - Missing blocks (RAM execution walls)
 *   - Whether 0x001D37, 0x000D82, 0x000D7E are entered
 *   - IX register and parameter block at the code-copy call
 *
 * Also disassembles the IX=0x001259 parameter block to identify the routine.
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
const BOOT_MAX_STEPS = 10000;
const MAX_LOOP_ITERATIONS = 100000;

// Key addresses
const BRANCH_BLOCK_PC = 0x001D37;   // GPIO bit 4 branch point
const CODE_COPY_ENTRY = 0x000D7E;   // code-copy function entry
const CODE_COPY_INNER = 0x000D82;   // code-copy inner entry (alt call site)
const RAM_EXEC_WALL = 0xD18C22;     // known RAM execution missing_block

// Parameter block addresses for each GPIO path
const IX_GPIO_FF = 0x001008;        // E008xx MMIO routine (591 bytes)
const IX_GPIO_EF = 0x001259;        // unknown routine — to be disassembled

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read16LE(rom, offset) {
  return ((rom[offset] ?? 0) | ((rom[offset + 1] ?? 0) << 8)) >>> 0;
}

function read24LE(rom, offset) {
  return (
    (rom[offset] ?? 0) |
    ((rom[offset + 1] ?? 0) << 8) |
    ((rom[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesAt(rom, start, length) {
  return Array.from(
    rom.subarray(start, start + Math.max(0, length)),
    (byte) => hexByte(byte),
  ).join(' ');
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function safeDecode(rom, pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc, mode);
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  const idx = (reg, disp) => `(${(reg ?? 'ix').toUpperCase()}${(disp ?? 0) >= 0 ? '+' : ''}${disp ?? 0})`;

  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${inst.indirectRegister.toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${(inst.dest ?? inst.dst).toUpperCase()}, ${hex(inst.value ?? 0, 2)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${(inst.dest ?? inst.dst).toUpperCase()}, (${(inst.src ?? inst.ptr).toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${(inst.dest ?? inst.ptr).toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${(inst.dest ?? inst.dst).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
      return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-special': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-pair': return `LD SP, ${inst.pair.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${inst.dest.toUpperCase()}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `LD ${idx(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm': return `LD ${idx(inst.indexRegister, inst.displacement)}, ${hex(inst.value ?? 0, 2)}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'alu-reg':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? `${inst.op.toUpperCase()} A, ${inst.src.toUpperCase()}`
        : `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? `${inst.op.toUpperCase()} A, ${hex(inst.value ?? 0, 2)}`
        : `${inst.op.toUpperCase()} ${hex(inst.value ?? 0, 2)}`;
    case 'add-pair': return `ADD ${(inst.dest ?? 'HL').toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-set': return `SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-res': return `RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-res-ind': return `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'daa': return 'DAA';
    case 'neg': return 'NEG';
    case 'in0': return `IN0 ${(inst.reg ?? 'A').toUpperCase()}, (${hex(inst.port ?? 0, 2)})`;
    case 'out0': return `OUT0 (${hex(inst.port ?? 0, 2)}), ${(inst.reg ?? 'A').toUpperCase()}`;
    case 'in-reg': return `IN ${(inst.reg ?? 'A').toUpperCase()}, (C)`;
    case 'out-reg': return `OUT (C), ${(inst.reg ?? 'A').toUpperCase()}`;
    case 'in-imm': return `IN A, (${hex(inst.port ?? 0, 2)})`;
    case 'out-imm': return `OUT (${hex(inst.port ?? 0, 2)}), A`;
    case 'rra': return 'RRA';
    case 'rla': return 'RLA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'rst': return `RST ${hex(inst.target ?? 0, 2)}`;
    case 'rsmix': return 'RSMIX';
    case 'stmix': return 'STMIX';
    case 'im': return `IM ${inst.value}`;
    case 'slp': return 'SLP';
    default: {
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['tag', 'length', 'pc', 'nextPc', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key)) continue;
        if (value === undefined || value === null) continue;
        fields.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${String(value)}`);
      }
      return fields.length > 0 ? `${inst.tag} ${fields.join(' ')}` : inst.tag;
    }
  }
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) return false;

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

function disassembleFromRom(romBytes, startPc, maxInstructions = 30) {
  const rows = [];
  let pc = startPc;
  const terminators = new Set(['ret', 'reti', 'retn', 'ret-conditional', 'jp', 'jp-conditional', 'jp-indirect', 'jr', 'jr-conditional']);

  for (let i = 0; i < maxInstructions; i++) {
    if (pc >= romBytes.length) break;
    const inst = safeDecode(romBytes, pc);
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: formatInstruction(inst),
      tag: inst?.tag ?? null,
      inst,
    });

    if (terminators.has(inst?.tag)) break;
    pc += length;
  }

  return rows;
}

// ---------- Boot execution ----------

function runBootWithGpio(gpioValue, PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus) {
  const label = `GPIO=0x${hexByte(gpioValue)}`;
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

  const trace = {
    uniqueBlocks: new Map(),
    missingBlocks: [],
    codeCopyCalls: [],
    ixAtCodeCopy: null,
  };

  // Track IX when entering the code-copy function
  const origOnBlock = cpu.onBlock;

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const key = blockKey(normalizedPc, normalizedMode);

      if (!trace.uniqueBlocks.has(key)) {
        trace.uniqueBlocks.set(key, {
          pc: normalizedPc,
          mode: normalizedMode,
          firstStep: step + 1,
        });
      }

      // Capture IX when we enter code-copy blocks
      if (normalizedPc === CODE_COPY_ENTRY || normalizedPc === CODE_COPY_INNER) {
        const ixValue = (cpu.ix ?? 0) & 0xFFFFFF;
        trace.codeCopyCalls.push({
          step: step + 1,
          pc: normalizedPc,
          ix: ixValue,
        });
        if (trace.ixAtCodeCopy === null) {
          trace.ixAtCodeCopy = ixValue;
        }
      }
    },
    onMissingBlock(pc, mode, step) {
      trace.missingBlocks.push({
        step: step + 1,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      });
    },
  });

  // Check key blocks
  const enteredBranch = trace.uniqueBlocks.has(blockKey(BRANCH_BLOCK_PC, 'adl'))
    || trace.uniqueBlocks.has(blockKey(BRANCH_BLOCK_PC, 'z80'));
  const enteredD7E = trace.uniqueBlocks.has(blockKey(CODE_COPY_ENTRY, 'adl'))
    || trace.uniqueBlocks.has(blockKey(CODE_COPY_ENTRY, 'z80'));
  const enteredD82 = trace.uniqueBlocks.has(blockKey(CODE_COPY_INNER, 'adl'))
    || trace.uniqueBlocks.has(blockKey(CODE_COPY_INNER, 'z80'));
  const hitRamWall = trace.missingBlocks.some((mb) => mb.pc === RAM_EXEC_WALL);

  return {
    label,
    gpioValue,
    result,
    trace,
    enteredBranch,
    enteredD7E,
    enteredD82,
    hitRamWall,
  };
}

// ---------- Parameter block analysis ----------

function analyzeParameterBlock(romBytes, ixAddr) {
  if (ixAddr >= romBytes.length - 2) {
    return { error: `IX=0x${ixAddr.toString(16)} is outside ROM range` };
  }

  const length = read16LE(romBytes, ixAddr);
  const codeStart = ixAddr + 2;
  const ramDest = (0xD18C7C - length) >>> 0;

  const codeBytes = romBytes.subarray(codeStart, codeStart + length);
  const disasm = disassembleFromRom(romBytes, codeStart, 30);

  // Pattern detection
  const hasE008 = codeBytes.some((_, i) =>
    i + 2 < codeBytes.length &&
    codeBytes[i] === 0x00 && codeBytes[i + 1] === 0x08 && codeBytes[i + 2] === 0xE0
  );

  const hasFlashUnlock =
    containsPattern(codeBytes, [0x32, 0xAA, 0x0A, 0x00]) &&
    containsPattern(codeBytes, [0x32, 0x55, 0x05, 0x00]);

  const hasEraseCmd = containsPattern(codeBytes, [0x3E, 0x30, 0x77]);
  const hasIdCmd = containsPattern(codeBytes, [0x3E, 0x90]);
  const hasResetCmd = containsPattern(codeBytes, [0x3E, 0xF0]);

  let identification = 'unknown';
  if (hasE008) identification = 'E008xx MMIO routine';
  if (hasFlashUnlock && hasIdCmd) identification = 'flash autoselect/ID reader';
  if (hasFlashUnlock && hasEraseCmd) identification = 'flash erase routine';
  if (hasFlashUnlock && !hasEraseCmd && !hasIdCmd) identification = 'flash unlock/access routine';

  return {
    ixAddr,
    length,
    codeStart,
    ramDest,
    identification,
    disasm,
    hasE008,
    hasFlashUnlock,
    hasEraseCmd,
    hasIdCmd,
    hasResetCmd,
  };
}

function containsPattern(bytes, pattern) {
  for (let offset = 0; offset <= bytes.length - pattern.length; offset++) {
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      if (bytes[offset + i] !== pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

// ---------- Output ----------

function printDisassembly(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }
  console.log('');
}

function printBootSummary(run) {
  const title = `Boot with ${run.label}`;
  console.log(title);
  console.log('='.repeat(title.length));
  console.log(`  termination:       ${run.result.termination}`);
  console.log(`  steps:             ${run.result.steps}`);
  console.log(`  unique blocks:     ${run.trace.uniqueBlocks.size}`);
  console.log(`  last pc:           ${hex(run.result.lastPc)}:${run.result.lastMode}`);
  console.log(`  entered 0x001D37:  ${run.enteredBranch}`);
  console.log(`  entered 0x000D7E:  ${run.enteredD7E}`);
  console.log(`  entered 0x000D82:  ${run.enteredD82}`);
  console.log(`  hit RAM wall:      ${run.hitRamWall} (${hex(RAM_EXEC_WALL)})`);
  console.log('');

  if (run.trace.codeCopyCalls.length > 0) {
    console.log(`  Code-copy calls:`);
    for (const cc of run.trace.codeCopyCalls) {
      console.log(`    step=${String(cc.step).padStart(5)}  entry=${hex(cc.pc)}  IX=${hex(cc.ix)}`);
    }
    console.log('');
  }

  if (run.trace.missingBlocks.length > 0) {
    console.log(`  Missing blocks (${run.trace.missingBlocks.length}):`);
    const seen = new Set();
    for (const mb of run.trace.missingBlocks) {
      const key = `${hex(mb.pc)}:${mb.mode}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.log(`    step=${String(mb.step).padStart(5)}  pc=${hex(mb.pc)}:${mb.mode}`);
    }
    console.log('');
  }
}

function printParameterBlock(title, info) {
  console.log(title);
  console.log('-'.repeat(title.length));

  if (info.error) {
    console.log(`  ERROR: ${info.error}`);
    console.log('');
    return;
  }

  console.log(`  IX address:        ${hex(info.ixAddr)}`);
  console.log(`  length (2 bytes):  ${info.length} (${hex(info.length, 4)})`);
  console.log(`  code starts at:    ${hex(info.codeStart)}`);
  console.log(`  RAM destination:   ${hex(info.ramDest)}`);
  console.log(`  identification:    ${info.identification}`);
  console.log(`  patterns:`);
  console.log(`    E008xx MMIO:     ${info.hasE008}`);
  console.log(`    flash unlock:    ${info.hasFlashUnlock}`);
  console.log(`    erase cmd:       ${info.hasEraseCmd}`);
  console.log(`    ID cmd:          ${info.hasIdCmd}`);
  console.log(`    reset cmd:       ${info.hasResetCmd}`);
  console.log('');

  if (info.disasm.length > 0) {
    printDisassembly(`  Disassembly (first ${info.disasm.length} instructions from ${hex(info.codeStart)})`, info.disasm);
  }
}

// ---------- Main ----------

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

  console.log('Phase 359: GPIO Bit 4 Path Analysis — GPIO=0xFF vs GPIO=0xEF');
  console.log('==============================================================');
  console.log(`ROM:                 ${ROM_PATH}`);
  console.log(`Transpiled ROM:      ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:         entry=${hex(BOOT_ENTRY)}:${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} timerInterrupt=false`);
  console.log(`Branch point:        ${hex(BRANCH_BLOCK_PC)}`);
  console.log(`Code-copy function:  ${hex(CODE_COPY_ENTRY)} / ${hex(CODE_COPY_INNER)}`);
  console.log(`RAM exec wall:       ${hex(RAM_EXEC_WALL)}`);
  console.log('');

  // Part 1: Run boot with both GPIO values
  console.log('Part 1: Boot execution comparison');
  console.log('=================================');
  console.log('');

  const runFF = runBootWithGpio(0xFF, PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus);
  const runEF = runBootWithGpio(0xEF, PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus);

  printBootSummary(runFF);
  printBootSummary(runEF);

  // Part 2: Code-copy IX values
  console.log('Part 2: Code-copy call comparison');
  console.log('=================================');
  console.log('');

  console.log(`GPIO=0xFF first IX at code-copy: ${runFF.trace.ixAtCodeCopy !== null ? hex(runFF.trace.ixAtCodeCopy) : 'not reached'}`);
  console.log(`GPIO=0xEF first IX at code-copy: ${runEF.trace.ixAtCodeCopy !== null ? hex(runEF.trace.ixAtCodeCopy) : 'not reached'}`);
  console.log('');

  // Part 3: Disassemble both parameter blocks
  console.log('Part 3: Parameter block analysis');
  console.log('================================');
  console.log('');

  const blockFF = analyzeParameterBlock(romBytes, IX_GPIO_FF);
  const blockEF = analyzeParameterBlock(romBytes, IX_GPIO_EF);

  printParameterBlock(`Parameter block at IX=${hex(IX_GPIO_FF)} (GPIO=0xFF path)`, blockFF);
  printParameterBlock(`Parameter block at IX=${hex(IX_GPIO_EF)} (GPIO=0xEF path)`, blockEF);

  // Part 4: Path comparison and RAM wall analysis
  console.log('Part 4: Path comparison and RAM execution wall');
  console.log('==============================================');
  console.log('');

  // Find blocks unique to each path
  const keysFF = new Set(runFF.trace.uniqueBlocks.keys());
  const keysEF = new Set(runEF.trace.uniqueBlocks.keys());

  const onlyFF = [...keysFF].filter((k) => !keysEF.has(k)).sort();
  const onlyEF = [...keysEF].filter((k) => !keysFF.has(k)).sort();
  const shared = [...keysFF].filter((k) => keysEF.has(k)).sort();

  console.log(`Shared blocks:       ${shared.length}`);
  console.log(`Only in GPIO=0xFF:   ${onlyFF.length}`);
  console.log(`Only in GPIO=0xEF:   ${onlyEF.length}`);
  console.log('');

  if (onlyFF.length > 0) {
    console.log('Blocks unique to GPIO=0xFF:');
    for (const key of onlyFF.slice(0, 30)) {
      const info = runFF.trace.uniqueBlocks.get(key);
      console.log(`  ${key}  first_step=${info.firstStep}`);
    }
    if (onlyFF.length > 30) console.log(`  ... and ${onlyFF.length - 30} more`);
    console.log('');
  }

  if (onlyEF.length > 0) {
    console.log('Blocks unique to GPIO=0xEF:');
    for (const key of onlyEF.slice(0, 30)) {
      const info = runEF.trace.uniqueBlocks.get(key);
      console.log(`  ${key}  first_step=${info.firstStep}`);
    }
    if (onlyEF.length > 30) console.log(`  ... and ${onlyEF.length - 30} more`);
    console.log('');
  }

  // Missing blocks comparison
  const missingFF = [...new Set(runFF.trace.missingBlocks.map((mb) => hex(mb.pc)))];
  const missingEF = [...new Set(runEF.trace.missingBlocks.map((mb) => hex(mb.pc)))];

  console.log(`Missing blocks (GPIO=0xFF): ${missingFF.length > 0 ? missingFF.join(', ') : 'none'}`);
  console.log(`Missing blocks (GPIO=0xEF): ${missingEF.length > 0 ? missingEF.join(', ') : 'none'}`);
  console.log('');

  // Verdict
  console.log('Verdict');
  console.log('-------');

  const ffHitsWall = runFF.hitRamWall;
  const efHitsWall = runEF.hitRamWall;

  if (!ffHitsWall && !efHitsWall) {
    console.log('  Neither path hits the RAM execution wall at ' + hex(RAM_EXEC_WALL) + '.');
    console.log('  Both paths may proceed further with more steps.');
  } else if (ffHitsWall && !efHitsWall) {
    console.log('  GPIO=0xFF hits the RAM wall at ' + hex(RAM_EXEC_WALL) + ', but GPIO=0xEF does NOT.');
    console.log('  GPIO=0xEF may be the better path for continued boot.');
  } else if (!ffHitsWall && efHitsWall) {
    console.log('  GPIO=0xEF hits the RAM wall at ' + hex(RAM_EXEC_WALL) + ', but GPIO=0xFF does NOT.');
    console.log('  GPIO=0xFF may be the better path for continued boot.');
  } else {
    console.log('  BOTH paths hit the RAM execution wall at ' + hex(RAM_EXEC_WALL) + '.');
    console.log('  The RAM-copied code must be handled regardless of GPIO value.');
  }

  // Step comparison
  console.log('');
  console.log(`  GPIO=0xFF: ${runFF.result.steps} steps, ${runFF.trace.uniqueBlocks.size} unique blocks, termination=${runFF.result.termination}`);
  console.log(`  GPIO=0xEF: ${runEF.result.steps} steps, ${runEF.trace.uniqueBlocks.size} unique blocks, termination=${runEF.result.termination}`);

  if (runFF.result.steps !== runEF.result.steps) {
    const diff = runFF.result.steps - runEF.result.steps;
    console.log(`  Difference: GPIO=0xFF runs ${diff > 0 ? diff + ' more' : Math.abs(diff) + ' fewer'} steps.`);
  }

  console.log('');
  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
