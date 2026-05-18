#!/usr/bin/env node

/**
 * Phase 361: Trace the 0x002126 <-> 0x002136 tight loop
 *
 * Boot terminates inside a loop between blocks 0x002126 and 0x002136.
 * This probe:
 *   1. Static disassembly: 64 bytes at 0x002120-0x002160 (ADL mode)
 *   2. Dynamic trace: boot with RAM trampoline, count visits to each loop block,
 *      capture first 5 register snapshots per block
 *   3. Port I/O tracking: record all IN/OUT ops that occur inside these blocks
 *   4. Exit analysis: what block is visited after the last loop pair visit
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

const RAM_TRAMPOLINE_PC = 0xD18C22;
const RAM_THRESHOLD = 0xD00000;

// The loop blocks we are investigating
const LOOP_BLOCK_A = 0x002126;
const LOOP_BLOCK_B = 0x002136;
const LOOP_BLOCKS = new Set([LOOP_BLOCK_A, LOOP_BLOCK_B]);

// How many register snapshots to keep per block
const SNAPSHOT_LIMIT = 5;

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function bit(value) {
  return value ? '1' : '0';
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

// ---------------------------------------------------------------------------
// Register snapshot
// ---------------------------------------------------------------------------
function decodeFlags(f) {
  const value = f & 0xff;
  return {
    S: !!(value & 0x80),
    Z: !!(value & 0x40),
    Y: !!(value & 0x20),
    H: !!(value & 0x10),
    X: !!(value & 0x08),
    PV: !!(value & 0x04),
    N: !!(value & 0x02),
    C: !!(value & 0x01),
  };
}

function formatFlags(flags) {
  return `S=${bit(flags.S)} Z=${bit(flags.Z)} Y=${bit(flags.Y)} H=${bit(flags.H)} X=${bit(flags.X)} PV=${bit(flags.PV)} N=${bit(flags.N)} C=${bit(flags.C)}`;
}

function snapRegisters(cpu, pc, mode) {
  return {
    A: cpu.a & 0xff,
    F: cpu.f & 0xff,
    BC: cpu.bc & 0xffffff,
    DE: cpu.de & 0xffffff,
    HL: cpu.hl & 0xffffff,
    IX: cpu.ix & 0xffffff,
    IY: cpu.iy & 0xffffff,
    SP: cpu.sp & 0xffffff,
    PC: pc & 0xffffff,
    MBASE: cpu.mbase & 0xff,
    mode: mode ?? (cpu.madl ? 'adl' : 'z80'),
    flags: decodeFlags(cpu.f),
  };
}

function printSnapshot(label, snap) {
  console.log(`  ${label}`);
  console.log(`    A=${hexByte(snap.A)}  F=${hexByte(snap.F)}  BC=${hex(snap.BC)}  DE=${hex(snap.DE)}  HL=${hex(snap.HL)}`);
  console.log(`    IX=${hex(snap.IX)}  IY=${hex(snap.IY)}  SP=${hex(snap.SP)}  PC=${hex(snap.PC)}:${snap.mode}`);
  console.log(`    MBASE=${hexByte(snap.MBASE)}  FLAGS=${formatFlags(snap.flags)}`);
}

// ---------------------------------------------------------------------------
// Instruction formatter (copied from probe-phase360-disasm-frontier.mjs)
// ---------------------------------------------------------------------------
function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;
  const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);

  let text = t;
  switch (t) {
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
    case 'ld-pair-mem': text = `ld ${inst.pair}, (${hex(inst.addr)})`; break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
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
    default: break;
  }

  return prefix + text;
}

// ---------------------------------------------------------------------------
// Static disassembly
// ---------------------------------------------------------------------------
function disassembleLinear(romBytes, startPc, maxBytes = 64, mode = 'adl') {
  const rows = [];
  let pc = startPc;
  const end = startPc + maxBytes;

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, mode);
    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (v) => v.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({ pc: inst.pc, bytes: rawBytes, dasm: formatInstruction(inst), inst });
    pc += inst.length;
  }

  return rows;
}

function printDisassembly(label, rows, highlightPcs = new Set()) {
  console.log(`--- ${label} ---`);
  for (const row of rows) {
    const addr = hex(row.pc);
    const bytes = row.bytes.padEnd(20);
    const marker = highlightPcs.has(row.pc) ? ' <-- LOOP BLOCK' : '';
    console.log(`  ${addr}  ${bytes}  ${row.dasm}${marker}`);
  }
  console.log('');
}

// ---------------------------------------------------------------------------
// Port op detection in a disassembly range
// ---------------------------------------------------------------------------
function extractPortOps(rows) {
  const portOps = [];
  for (const row of rows) {
    const t = row.inst.tag;
    if (t === 'in-imm' || t === 'in-reg' || t === 'in0' ||
        t === 'out-imm' || t === 'out-reg' || t === 'out0') {
      portOps.push({ pc: row.pc, dasm: row.dasm, port: row.inst.port, tag: t });
    }
  }
  return portOps;
}

// ---------------------------------------------------------------------------
// Transpiled ROM helpers
// ---------------------------------------------------------------------------
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
    return Object.fromEntries(
      rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]),
    );
  }
  return rawBlocks ?? {};
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function describeExitCondition(lastLoopPc, exitBlock, termination, missingBlockEvents, lastLoopStep) {
  if (lastLoopStep < 0) {
    return {
      summary: 'Loop blocks were not visited before termination.',
      missingAfterLoop: null,
    };
  }

  const missingAfterLoop = missingBlockEvents.find((event) => event.step > lastLoopStep) ?? null;

  if (!exitBlock && termination === 'max_steps') {
    return {
      summary: 'Loop exhausted the step budget before a post-loop block was visited.',
      missingAfterLoop,
    };
  }

  if (exitBlock?.pc === 0x002147 && lastLoopPc === LOOP_BLOCK_A) {
    return {
      summary: 'Exited via the match path: `JR Z, 0x002147` at 0x002134 was taken after `SBC HL, BC` found equality.',
      missingAfterLoop,
    };
  }

  if (exitBlock?.pc === 0x002147 && lastLoopPc === LOOP_BLOCK_B) {
    return {
      summary: 'Exited via the count-exhaustion path: `JR NZ, 0x002126` at 0x002145 was not taken after the `DEC DE` / zero-test sequence.',
      missingAfterLoop,
    };
  }

  if (exitBlock) {
    return {
      summary: `Left the loop from ${hex(lastLoopPc)} and continued at ${hex(exitBlock.pc)}:${exitBlock.mode}.`,
      missingAfterLoop,
    };
  }

  return {
    summary: `Last loop block was ${hex(lastLoopPc)}, but no following block was recorded before termination.`,
    missingAfterLoop,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regenerated = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  console.log('Phase 361: Trace the 0x002126 <-> 0x002136 Loop');
  console.log('=================================================');
  console.log(`ROM:            ${ROM_PATH}`);
  console.log(`Transpiled ROM: ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log('');

  // =========================================================================
  // PART 1: Static disassembly
  // =========================================================================
  console.log('=== PART 1: STATIC DISASSEMBLY (0x002120 - 0x002160, ADL mode) ===');
  console.log('');

  // Disassemble in z80 mode too since boot starts in z80
  const disasmRowsAdl = disassembleLinear(romBytes, 0x002120, 64, 'adl');
  const disasmRowsZ80 = disassembleLinear(romBytes, 0x002120, 64, 'z80');

  printDisassembly('ADL mode', disasmRowsAdl, LOOP_BLOCKS);
  printDisassembly('Z80 mode', disasmRowsZ80, LOOP_BLOCKS);

  const portOpsAdl = extractPortOps(disasmRowsAdl);
  const portOpsZ80 = extractPortOps(disasmRowsZ80);

  if (portOpsAdl.length > 0 || portOpsZ80.length > 0) {
    console.log('Port I/O in this region (static):');
    const allOps = [...new Map([...portOpsAdl, ...portOpsZ80].map(o => [o.pc + o.dasm, o])).values()];
    for (const op of allOps) {
      console.log(`  ${hex(op.pc)}  ${op.dasm}  (tag=${op.tag}  port=${op.port !== undefined ? hexByte(op.port) : 'C-reg'})`);
    }
    console.log('');
  } else {
    console.log('No port I/O instructions in this region (static).');
    console.log('');
  }

  // =========================================================================
  // PART 2: Dynamic trace
  // =========================================================================
  console.log('=== PART 2: DYNAMIC TRACE (boot from 0x000000, z80 mode, RAM trampoline) ===');
  console.log('');

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

  // Inject RAM trampolines
  function injectRamTrampoline(targetPc) {
    const key = blockKey(targetPc, 'adl');
    if (executor.compiledBlocks[key]) return;
    executor.compiledBlocks[key] = (cpu) => {
      const sp = cpu.sp & 0xFFFFFF;
      const retAddr = cpu.mem[sp] | (cpu.mem[sp + 1] << 8) | (cpu.mem[sp + 2] << 16);
      cpu.sp = (sp + 3) & 0xFFFFFF;
      return retAddr;
    };
  }

  injectRamTrampoline(RAM_TRAMPOLINE_PC);

  // Tracking state
  const visitCounts  = { [LOOP_BLOCK_A]: 0, [LOOP_BLOCK_B]: 0 };
  const snapshots    = { [LOOP_BLOCK_A]: [], [LOOP_BLOCK_B]: [] };
  const portActivity = [];       // { step, blockPc, port, dir, value }
  const blockHistory = [];       // every block visited (pc, mode, step)
  const missingBlockEvents = []; // { step, pc, mode }

  // Instrument port I/O via peripheral bus wrapper
  // Wrap the peripheral bus read/write to record activity when we're in loop blocks
  let currentBlockPc = -1;
  let currentStep = -1;

  const origRead  = cpu._ioRead.bind(cpu);
  const origWrite = cpu._ioWrite.bind(cpu);

  cpu._ioRead = (port) => {
    const value = origRead(port);
    if (LOOP_BLOCKS.has(currentBlockPc)) {
      portActivity.push({ step: currentStep, blockPc: currentBlockPc, port, dir: 'IN', value });
    }
    return value;
  };

  cpu._ioWrite = (port, value) => {
    origWrite(port, value);
    if (LOOP_BLOCKS.has(currentBlockPc)) {
      portActivity.push({ step: currentStep, blockPc: currentBlockPc, port, dir: 'OUT', value });
    }
  };

  // Track what comes after the last visit to either loop block
  let lastLoopStep = -1;
  let lastLoopPc   = -1;
  let lastLoopMode = 'adl';

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,

    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      currentBlockPc = normalizedPc;
      currentStep    = step + 1;

      blockHistory.push({ step: step + 1, pc: normalizedPc, mode: mode ?? 'adl' });

      if (LOOP_BLOCKS.has(normalizedPc)) {
        visitCounts[normalizedPc]++;
        lastLoopStep = step + 1;
        lastLoopPc   = normalizedPc;
        lastLoopMode = mode ?? 'adl';

        if (snapshots[normalizedPc].length < SNAPSHOT_LIMIT) {
          snapshots[normalizedPc].push({
            visitNum: visitCounts[normalizedPc],
            step: step + 1,
            regs: snapRegisters(cpu, normalizedPc, mode ?? 'adl'),
          });
        }
      }
    },

    onMissingBlock(pc, mode, step) {
      const normalizedPc = pc & 0xFFFFFF;
       missingBlockEvents.push({
        step: step + 1,
        pc: normalizedPc,
        mode: mode ?? 'adl',
      });
      if (normalizedPc >= RAM_THRESHOLD) {
        injectRamTrampoline(normalizedPc);
      }
    },
  });

  // Find the first block visited after the last loop-block visit
  let exitBlock = null;
  for (let i = 0; i < blockHistory.length; i++) {
    if (blockHistory[i].step === lastLoopStep && LOOP_BLOCKS.has(blockHistory[i].pc)) {
      // The exit is the next entry in history
      if (i + 1 < blockHistory.length) {
        exitBlock = blockHistory[i + 1];
      }
      break;
    }
  }

  const exitAnalysis = describeExitCondition(
    lastLoopPc,
    exitBlock,
    result.termination,
    missingBlockEvents,
    lastLoopStep,
  );

  // =========================================================================
  // PART 2 Output
  // =========================================================================
  console.log('Boot summary');
  console.log('------------');
  console.log(`  termination:   ${result.termination}`);
  console.log(`  steps:         ${result.steps}`);
  console.log(`  unique blocks: ${new Set(blockHistory.map(b => blockKey(b.pc, b.mode))).size}`);
  console.log(`  last pc:       ${hex(result.lastPc)}:${result.lastMode}`);
  console.log('');

  console.log('Loop visit counts');
  console.log('-----------------');
  console.log(`  ${hex(LOOP_BLOCK_A)}: ${visitCounts[LOOP_BLOCK_A]} visits`);
  console.log(`  ${hex(LOOP_BLOCK_B)}: ${visitCounts[LOOP_BLOCK_B]} visits`);
  console.log('');

  // Register snapshots for each loop block
  for (const blockPc of [LOOP_BLOCK_A, LOOP_BLOCK_B]) {
    const snaps = snapshots[blockPc];
    console.log(`Register snapshots at ${hex(blockPc)} (first ${snaps.length} of ${visitCounts[blockPc]} visits)`);
    console.log('-'.repeat(60));
    if (snaps.length === 0) {
      console.log('  (block was never reached)');
    } else {
      for (const snap of snaps) {
        printSnapshot(`Visit #${snap.visitNum}  step=${snap.step}`, snap.regs);
      }
    }
    console.log('');
  }

  // =========================================================================
  // PART 3: Port I/O
  // =========================================================================
  console.log('=== PART 3: PORT I/O TRACKING ===');
  console.log('');
  if (portActivity.length === 0) {
    console.log('No port I/O detected while executing loop blocks.');
  } else {
    console.log(`Port I/O events inside loop blocks (${portActivity.length} total, showing first 40):`);
    for (const ev of portActivity.slice(0, 40)) {
      console.log(
        `  step=${String(ev.step).padStart(6)}  block=${hex(ev.blockPc)}  ${ev.dir}  port=${hexByte(ev.port)}  value=${hexByte(ev.value)}`
      );
    }
    if (portActivity.length > 40) {
      console.log(`  ... and ${portActivity.length - 40} more`);
    }
  }
  console.log('');

  // =========================================================================
  // PART 4: Exit analysis
  // =========================================================================
  console.log('=== PART 4: EXIT ANALYSIS ===');
  console.log('');
  if (lastLoopStep < 0) {
    console.log('Loop blocks were never reached during this boot trace.');
  } else {
    console.log('Last visit to a loop block:');
    console.log(`  step=${lastLoopStep}  pc=${hex(lastLoopPc)}:${lastLoopMode}`);
  }
  console.log('');

  if (exitBlock) {
    console.log('Block visited immediately after last loop visit:');
    console.log(`  step=${exitBlock.step}  pc=${hex(exitBlock.pc)}:${exitBlock.mode}`);
  } else if (lastLoopStep >= 0) {
    console.log('No post-loop block was recorded before termination.');
  }
  console.log('');

  console.log('Exit condition:');
  console.log(`  ${exitAnalysis.summary}`);
  if (exitAnalysis.missingAfterLoop) {
    console.log(`  first missing block after loop: step=${exitAnalysis.missingAfterLoop.step}  pc=${hex(exitAnalysis.missingAfterLoop.pc)}:${exitAnalysis.missingAfterLoop.mode}`);
  }
  console.log('');

  // Last 30 blocks for context
  const last30 = blockHistory.slice(-30);
  console.log(`Last 30 blocks before termination:`);
  for (const entry of last30) {
    const inLoop = LOOP_BLOCKS.has(entry.pc) ? '  <-- LOOP' : '';
    console.log(`  step=${String(entry.step).padStart(6)}  ${hex(entry.pc)}:${entry.mode}${inLoop}`);
  }
  console.log('');

  if (missingBlockEvents.length > 0) {
    console.log('Missing blocks encountered:');
    for (const entry of missingBlockEvents.slice(0, 20)) {
      console.log(`  step=${String(entry.step).padStart(6)}  ${hex(entry.pc)}:${entry.mode}${entry.pc >= RAM_THRESHOLD ? '  (RAM trampoline)' : ''}`);
    }
    if (missingBlockEvents.length > 20) {
      console.log(`  ... and ${missingBlockEvents.length - 20} more`);
    }
    console.log('');
  }

  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
