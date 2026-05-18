#!/usr/bin/env node

/**
 * Phase 363: disassemble and trace 0x014C63 / 0x014C6B / 0x002197
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase363-disasm-014C63.mjs
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
const MAX_LOOP_ITERATIONS = 50000;

const BLOCK_14C63 = 0x014C63;
const BLOCK_14C6B = 0x014C6B;
const BLOCK_2197 = 0x002197;
const RANGE_14C_START = 0x014C00;
const RANGE_14C_END = 0x014CFF;
const SP_WINDOW_START = 2670;
const SP_WINDOW_END = 2690;

const TRANSFER_TAGS = new Set([
  'call',
  'call-conditional',
  'ret',
  'ret-conditional',
  'reti',
  'retn',
  'rst',
  'jp',
  'jp-conditional',
  'jp-indirect',
  'jr',
  'jr-conditional',
]);

const TARGET_KEYS = new Map([
  ['014c63:adl', '0x014C63'],
  ['014c6b:adl', '0x014C6B'],
  ['002197:adl', '0x002197'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hb(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function bytesAt(buffer, start, length) {
  const safeStart = start & 0xFFFFFF;
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.subarray(safeStart, safeEnd), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) return false;
  const hint = fs.existsSync(TRANSPILED_GZ_PATH) ? `${path.basename(TRANSPILED_GZ_PATH)} is present; ` : '';
  console.log(`${hint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });
  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }
  return true;
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ${text}` : text;
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  switch (inst.tag) {
    case 'nop': return withModePrefix(inst, 'NOP');
    case 'di': return withModePrefix(inst, 'DI');
    case 'ei': return withModePrefix(inst, 'EI');
    case 'ret': return withModePrefix(inst, 'RET');
    case 'reti': return withModePrefix(inst, 'RETI');
    case 'retn': return withModePrefix(inst, 'RETN');
    case 'ret-conditional': return withModePrefix(inst, `RET ${String(inst.condition).toUpperCase()}`);
    case 'call': return withModePrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional': return withModePrefix(inst, `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'jp': return withModePrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional': return withModePrefix(inst, `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'jp-indirect': return withModePrefix(inst, `JP (${String(inst.indirectRegister).toUpperCase()})`);
    case 'jr': return withModePrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional': return withModePrefix(inst, `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'rst': return withModePrefix(inst, `RST ${hex(inst.target ?? 0, 2)}`);
    case 'push': return withModePrefix(inst, `PUSH ${String(inst.pair).toUpperCase()}`);
    case 'pop': return withModePrefix(inst, `POP ${String(inst.pair).toUpperCase()}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`);
    case 'ld-sp-hl':
      return withModePrefix(inst, 'LD SP, HL');
    case 'ld-sp-pair':
      return withModePrefix(inst, `LD SP, ${String(inst.pair).toUpperCase()}`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`);
    case 'ld-reg-imm':
      return withModePrefix(inst, `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value, 2)}`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`);
    case 'ld-ind-reg':
      return withModePrefix(inst, `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`);
    case 'ld-ixd-reg':
      return withModePrefix(inst, `LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${String(inst.src).toUpperCase()}`);
    case 'ld-reg-ixd':
      return withModePrefix(inst, `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`);
    case 'ld-ixd-imm':
      return withModePrefix(inst, `LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${hex(inst.value, 2)}`);
    case 'ld-indexed-pair':
      return withModePrefix(inst, `LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${String(inst.pair).toUpperCase()}`);
    case 'ld-pair-indexed':
      return withModePrefix(inst, `LD ${String(inst.pair).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`);
    case 'ld-indexed-ixiy':
      return withModePrefix(inst, `LD (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)}), ${String(inst.src).toUpperCase()}`);
    case 'ld-ixiy-indexed':
      return withModePrefix(inst, `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${signedDisp(inst.displacement)})`);
    case 'lea':
      return withModePrefix(inst, `LEA ${String(inst.dest).toUpperCase()}, ${String(inst.base).toUpperCase()}${signedDisp(inst.displacement)}`);
    case 'add-pair':
      return withModePrefix(inst, `ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`);
    case 'adc-pair':
      return withModePrefix(inst, `ADC HL, ${String(inst.src).toUpperCase()}`);
    case 'sbc-pair':
      return withModePrefix(inst, `SBC HL, ${String(inst.src).toUpperCase()}`);
    case 'ex-sp-hl':
      return withModePrefix(inst, 'EX (SP), HL');
    case 'ex-sp-pair':
      return withModePrefix(inst, `EX (SP), ${String(inst.pair).toUpperCase()}`);
    case 'ex-de-hl':
      return withModePrefix(inst, 'EX DE, HL');
    case 'ex-af':
      return withModePrefix(inst, "EX AF, AF'");
    default: {
      const extras = Object.entries(inst)
        .filter(([key, value]) => !['tag', 'pc', 'nextPc', 'length', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value, value > 0xFF ? 6 : 2) : String(value)}`)
        .join(' ');
      return withModePrefix(inst, extras ? `${inst.tag} ${extras}` : inst.tag);
    }
  }
}

function annotationFor(inst) {
  switch (inst?.tag) {
    case 'push': return 'stack: PUSH';
    case 'pop': return 'stack: POP';
    case 'ld-sp-hl':
    case 'ld-sp-pair': return 'stack: LD SP';
    case 'call':
    case 'call-conditional': return 'control: CALL';
    case 'ret':
    case 'ret-conditional':
    case 'reti':
    case 'retn': return 'control: RET';
    case 'jp':
    case 'jp-conditional':
    case 'jp-indirect':
    case 'jr':
    case 'jr-conditional':
    case 'rst': return 'control: JP';
    default: return '';
  }
}

function disassembleWindow(romBytes, startPc, maxBytes, mode = 'adl') {
  const rows = [];
  const endPc = Math.min(romBytes.length, startPc + maxBytes);
  let pc = startPc;

  while (pc < endPc) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      inst = null;
    }

    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: inst ? formatInstruction(inst) : `DB ${hb(romBytes[pc])}`,
      annotation: annotationFor(inst),
    });
    pc += length;
  }

  return rows;
}

function printDisassembly(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    const suffix = row.annotation ? `    ; ${row.annotation}` : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}${suffix}`);
  }
  console.log('');
}

function flagsString(f) {
  const flags = [
    ['S', 0x80],
    ['Z', 0x40],
    ['Y', 0x20],
    ['H', 0x10],
    ['X', 0x08],
    ['P', 0x04],
    ['N', 0x02],
    ['C', 0x01],
  ];
  return flags.map(([name, mask]) => ((f & mask) !== 0 ? name : '-')).join('');
}

function snapshotRegs(cpu, pc, mode) {
  return {
    pc: pc & 0xFFFFFF,
    mode,
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

function printRegs(prefix, regs) {
  console.log(prefix);
  console.log(`  PC=${hex(regs.pc)} MODE=${regs.mode} A=${hb(regs.a)} BC=${hex(regs.bc)} DE=${hex(regs.de)} HL=${hex(regs.hl)} IX=${hex(regs.ix)} IY=${hex(regs.iy)} SP=${hex(regs.sp)}`);
  console.log(`  F=${hb(regs.f)} [${flagsString(regs.f)}] MBASE=${hb(regs.mbase)} MADL=${regs.madl}`);
  console.log('');
}

function signedDelta24(before, after) {
  let delta = ((after - before) & 0xFFFFFF) >>> 0;
  if (delta & 0x800000) delta -= 0x1000000;
  return delta;
}

function formatDelta(delta) {
  if (delta === undefined || delta === null || Number.isNaN(delta)) return 'n/a';
  const sign = delta >= 0 ? '+' : '-';
  return `${sign}0x${Math.abs(delta).toString(16).toUpperCase()}`;
}

function transferInstructionFor(meta) {
  if (!Array.isArray(meta?.instructions)) return null;
  for (let index = meta.instructions.length - 1; index >= 0; index -= 1) {
    const inst = meta.instructions[index];
    if (TRANSFER_TAGS.has(inst?.tag)) return inst;
  }
  return null;
}

function installTargetWrappers(executor, postEvents, getContext) {
  for (const [key, label] of TARGET_KEYS.entries()) {
    const original = executor.compiledBlocks[key];
    if (typeof original !== 'function') continue;

    executor.compiledBlocks[key] = function wrappedTargetBlock(cpu) {
      const context = getContext();
      const before = snapshotRegs(cpu, context?.pc ?? 0, context?.mode ?? 'adl');
      const result = original(cpu);
      const after = snapshotRegs(cpu, context?.pc ?? 0, context?.mode ?? 'adl');
      postEvents.push({
        label,
        key,
        step: context?.step ?? null,
        before,
        after,
        result: typeof result === 'number' ? (result & 0xFFFFFF) : result,
      });
      return result;
    };
  }
}

function findFirst(history, startIndex, predicate) {
  for (let index = Math.max(0, startIndex); index < history.length; index += 1) {
    if (predicate(history[index], index)) return { entry: history[index], index };
  }
  return null;
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');

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

  console.log('Phase 363: Disassemble and Trace 0x014C63 / 0x014C6B');
  console.log('======================================================');
  console.log(`ROM:            ${ROM_PATH}`);
  console.log(`Transpiled ROM: ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:    entry=${hex(BOOT_ENTRY)} mode=${BOOT_MODE} timerInterrupt=false maxSteps=${BOOT_MAX_STEPS}`);
  console.log('');

  console.log('=== PART 1: STATIC DISASSEMBLY ===');
  console.log('');
  printDisassembly(`Block ${hex(BLOCK_14C63)} (+0x40 bytes)`, disassembleWindow(romBytes, BLOCK_14C63, 0x40, 'adl'));
  printDisassembly(`Block ${hex(BLOCK_14C6B)} (+0x20 bytes)`, disassembleWindow(romBytes, BLOCK_14C6B, 0x20, 'adl'));
  printDisassembly(`Block ${hex(BLOCK_2197)} (+0x20 bytes)`, disassembleWindow(romBytes, BLOCK_2197, 0x20, 'adl'));

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

  const blockHistory = [];
  const interestingEntries = [];
  const postEvents = [];
  const missingBlocks = [];
  let currentContext = null;

  installTargetWrappers(executor, postEvents, () => currentContext);

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, step) {
      const humanStep = step + 1;
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const prev = blockHistory.length > 0 ? blockHistory[blockHistory.length - 1] : null;
      const regs = snapshotRegs(cpu, normalizedPc, normalizedMode);

      currentContext = {
        step: humanStep,
        pc: normalizedPc,
        mode: normalizedMode,
        key: blockKey(normalizedPc, normalizedMode),
      };

      blockHistory.push({
        step: humanStep,
        pc: normalizedPc,
        mode: normalizedMode,
        key: currentContext.key,
        sp: regs.sp,
        prevPc: prev?.pc ?? null,
        prevMode: prev?.mode ?? null,
      });

      if (normalizedPc === BLOCK_2197 || (normalizedPc >= RANGE_14C_START && normalizedPc <= RANGE_14C_END)) {
        interestingEntries.push({
          step: humanStep,
          pc: normalizedPc,
          mode: normalizedMode,
          prevPc: prev?.pc ?? null,
          prevMode: prev?.mode ?? null,
          regs,
          transfer: transferInstructionFor(meta),
        });
      }
    },
    onMissingBlock(pc, mode, step) {
      missingBlocks.push({
        step: step + 1,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      });
    },
  });

  console.log('Boot summary');
  console.log('------------');
  console.log(`  termination: ${result.termination}`);
  console.log(`  steps:       ${result.steps}`);
  console.log(`  last pc:     ${hex(result.lastPc)}:${result.lastMode}`);
  console.log('');

  console.log('Interesting block entries');
  console.log('------------------------');
  if (interestingEntries.length === 0) {
    console.log('  (no 0x014Cxx / 0x002197 entries observed)');
    console.log('');
  } else {
    for (const entry of interestingEntries) {
      const from = entry.prevPc === null ? 'start' : `${hex(entry.prevPc)}:${entry.prevMode}`;
      const transfer = entry.transfer ? formatInstruction(entry.transfer) : 'n/a';
      console.log(`  step=${String(entry.step).padStart(4, ' ')} enter ${hex(entry.pc)}:${entry.mode} from ${from}`);
      console.log(`    caller-tail: ${transfer}`);
      console.log(`    A=${hb(entry.regs.a)} BC=${hex(entry.regs.bc)} DE=${hex(entry.regs.de)} HL=${hex(entry.regs.hl)} IX=${hex(entry.regs.ix)} IY=${hex(entry.regs.iy)} SP=${hex(entry.regs.sp)}`);
      console.log(`    F=${hb(entry.regs.f)} [${flagsString(entry.regs.f)}] MBASE=${hb(entry.regs.mbase)} MADL=${entry.regs.madl}`);
    }
    console.log('');
  }

  console.log('Target block post-state');
  console.log('-----------------------');
  if (postEvents.length === 0) {
    console.log('  (no wrapped target blocks executed)');
    console.log('');
  } else {
    for (const event of postEvents) {
      console.log(`  step=${String(event.step ?? 0).padStart(4, ' ')} ${event.label}`);
      console.log(`    result/next=${typeof event.result === 'number' ? hex(event.result) : String(event.result)}`);
      console.log(`    before: HL=${hex(event.before.hl)} IX=${hex(event.before.ix)} SP=${hex(event.before.sp)}`);
      console.log(`    after:  HL=${hex(event.after.hl)} IX=${hex(event.after.ix)} SP=${hex(event.after.sp)}`);
      if (event.key === '002197:adl') {
        console.log(`    JP(HL) target=${typeof event.result === 'number' ? hex(event.result) : String(event.result)} (HL after block=${hex(event.after.hl)})`);
      }
    }
    console.log('');
  }

  console.log(`SP window: steps ${SP_WINDOW_START}-${SP_WINDOW_END}`);
  console.log('--------------------------------');
  const windowEntries = blockHistory.filter((entry) => entry.step >= SP_WINDOW_START && entry.step <= SP_WINDOW_END);
  if (windowEntries.length === 0) {
    console.log('  (window not reached)');
    console.log('');
  } else {
    for (const entry of windowEntries) {
      const prev = blockHistory.find((candidate) => candidate.step === entry.step - 1) ?? null;
      const delta = prev ? signedDelta24(prev.sp, entry.sp) : null;
      console.log(`  step=${String(entry.step).padStart(4, ' ')} pc=${hex(entry.pc)}:${entry.mode} sp=${hex(entry.sp)} delta=${formatDelta(delta)}`);
    }
    console.log('');
  }

  console.log('=== PART 3: CALLER TRACE ===');
  console.log('');

  const hit14C63 = findFirst(blockHistory, 0, (entry) => entry.pc === BLOCK_14C63);
  const hit2197 = findFirst(blockHistory, (hit14C63?.index ?? -1) + 1, (entry) => entry.pc === BLOCK_2197);
  const hit14C6B = findFirst(blockHistory, (hit2197?.index ?? -1) + 1, (entry) => entry.pc === BLOCK_14C6B);

  const preCaller = hit14C63 && hit14C63.index >= 2 ? blockHistory[hit14C63.index - 2] : null;
  const caller = hit14C63 && hit14C63.index >= 1 ? blockHistory[hit14C63.index - 1] : null;
  const after2197 = hit2197 && (hit2197.index + 1) < blockHistory.length ? blockHistory[hit2197.index + 1] : null;
  const after14C6B = hit14C6B && (hit14C6B.index + 1) < blockHistory.length ? blockHistory[hit14C6B.index + 1] : null;

  const callerMeta = caller ? PRELIFTED_BLOCKS[caller.key] : null;
  const callerTransfer = transferInstructionFor(callerMeta);
  const block14C63Meta = PRELIFTED_BLOCKS['014c63:adl'];
  const block14C63Transfer = transferInstructionFor(block14C63Meta);
  const block14C6BMeta = PRELIFTED_BLOCKS['014c6b:adl'];
  const block14C6BTransfer = transferInstructionFor(block14C6BMeta);
  const jpEvent = postEvents.find((event) => event.key === '002197:adl') ?? null;
  const retEvent = postEvents.find((event) => event.key === '014c6b:adl') ?? null;

  if (caller) {
    console.log(`Caller of ${hex(BLOCK_14C63)}: step ${caller.step} ${hex(caller.pc)}:${caller.mode}`);
    console.log(`  tail instruction: ${callerTransfer ? formatInstruction(callerTransfer) : 'n/a'}`);
  } else {
    console.log(`Caller of ${hex(BLOCK_14C63)}: not observed`);
  }
  console.log('');

  if (after14C6B) {
    console.log(`Block after ${hex(BLOCK_14C6B)} RET: step ${after14C6B.step} ${hex(after14C6B.pc)}:${after14C6B.mode}`);
    console.log(`  RET result: ${retEvent ? hex(retEvent.result) : 'n/a'}`);
  } else {
    console.log(`Block after ${hex(BLOCK_14C6B)} RET: not observed`);
  }
  console.log('');

  const chainParts = [];
  if (preCaller) chainParts.push(`${hex(preCaller.pc)}[s${preCaller.step}]`);
  if (caller) chainParts.push(`${hex(caller.pc)}[s${caller.step}]`);
  if (hit14C63) chainParts.push(`${hex(hit14C63.entry.pc)}[s${hit14C63.entry.step}]`);
  if (hit2197) chainParts.push(`${hex(hit2197.entry.pc)}[s${hit2197.entry.step}]`);
  if (jpEvent) chainParts.push(`JP(HL=${hex(jpEvent.result)})`);
  if (after2197 && (!hit14C6B || after2197.pc !== hit14C6B.entry.pc || after2197.step !== hit14C6B.entry.step)) {
    chainParts.push(`${hex(after2197.pc)}[s${after2197.step}]`);
  }
  if (hit14C6B) chainParts.push(`${hex(hit14C6B.entry.pc)}[s${hit14C6B.entry.step}]`);
  if (retEvent) chainParts.push(`RET=>${hex(retEvent.result)}`);
  if (after14C6B) chainParts.push(`${hex(after14C6B.pc)}[s${after14C6B.step}]`);

  console.log('Mini call chain');
  console.log('---------------');
  console.log(`  ${chainParts.length > 0 ? chainParts.join(' -> ') : '(chain not observed)'}`);
  console.log('');

  console.log('Static transfer summary');
  console.log('-----------------------');
  console.log(`  ${hex(BLOCK_14C63)} tail: ${block14C63Transfer ? formatInstruction(block14C63Transfer) : 'n/a'}`);
  console.log(`  ${hex(BLOCK_2197)} target: ${jpEvent ? `JP(HL=${hex(jpEvent.result)})` : 'not executed'}`);
  console.log(`  ${hex(BLOCK_14C6B)} tail: ${block14C6BTransfer ? formatInstruction(block14C6BTransfer) : 'n/a'}`);
  console.log('');

  if (missingBlocks.length > 0) {
    console.log('Missing blocks');
    console.log('--------------');
    for (const entry of missingBlocks) {
      console.log(`  step=${String(entry.step).padStart(4, ' ')} ${hex(entry.pc)}:${entry.mode}`);
    }
    console.log('');
  }
}

await main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
