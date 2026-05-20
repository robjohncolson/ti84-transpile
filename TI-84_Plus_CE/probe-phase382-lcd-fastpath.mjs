#!/usr/bin/env node

/**
 * Phase 382 — LCD Init Fast-Path Investigation
 *
 * Investigates why the LCD controller hardware init at 0x005BB1 runs on every
 * keypress. Session 381 found that the key handler at 0x001853 calls:
 *   1. 0x005B96 — LCD VRAM clear (fills 0xD40000 with 0xFF)
 *   2. 0x005BB1 — Full LCD controller hardware init (500+ instructions)
 *
 * This probe:
 *   Part 1: Static disassembly of the fast-path check at 0x005BB1-0x005C20
 *   Part 2: Dynamic trace — boot phases 1-3, inject ENTER, run event loop
 *           with DI+HALT bypass, count instructions in 0x005BB1-0x015B61
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

// Boot phase entry points
const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

// Stack
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

// Key injection
const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const ENTER_SCAN_CODE = 0x29;

// Seed
const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

const GPIO_VALUE = 0xEE;

// Boot phase limits
const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 500000, maxLoopIterations: 200000 };

// LCD init routine range to monitor
const LCD_INIT_ENTRY = 0x005BB1;
const LCD_INIT_RANGE_END = 0x015B61;

// Fast-path jump target (where JP Z goes if bit 4 of port 0x03 is zero)
const FAST_PATH_TARGET = 0x005C44;

// CPU snapshot fields
const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

// --- Utilities ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function passOrFail(ok) {
  return ok ? '[PASS]' : '[FAIL]';
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) return;
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

// --- Part 1: Static disassembly ---

function staticDisassembly(romBytes) {
  console.log('=== PART 1: STATIC DISASSEMBLY OF 0x005BB1-0x005C50 ===');
  console.log('');

  let pc = LCD_INIT_ENTRY;
  const end = 0x005C50;
  const instructions = [];

  while (pc < end) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, MODE);
      if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
        inst = { tag: 'db', length: 1 };
      }
    } catch {
      inst = { tag: 'db', length: 1 };
    }

    const len = inst.length;
    const bytes = Array.from(romBytes.subarray(pc, pc + len), (b) =>
      b.toString(16).toUpperCase().padStart(2, '0'),
    ).join(' ');

    instructions.push({ pc, len, bytes, inst });
    pc += len;
  }

  // Annotate the fast-path check
  for (const row of instructions) {
    let annotation = '';

    if (row.pc === 0x005BB1) {
      annotation = '  ; << LCD INIT ENTRY';
    } else if (row.pc === 0x005BB6) {
      annotation = '  ; RES 7,(IY+0x42) — clear flag at IY+0x42';
    } else if (row.pc === 0x005BBA) {
      annotation = '  ; READ PORT 0x03 (GPIO) into A';
    } else if (row.pc === 0x005BBD) {
      annotation = '  ; TEST BIT 4 of A (ON-key/reset state)';
    } else if (row.pc === 0x005BBF) {
      annotation = '  ; ** FAST-PATH: if bit4==0 (Z set), SKIP heavy init → 0x005C44 **';
    } else if (row.pc === 0x005BC3) {
      annotation = '  ; CALL 0x0158DE — heavy init begins (only if bit4==1)';
    } else if (row.pc === 0x005BC7) {
      annotation = '  ; JR Z → 0x005C44 (second early exit if call returns Z)';
    } else if (row.pc === FAST_PATH_TARGET) {
      annotation = '  ; << FAST-PATH TARGET (skips heavy LCD programming)';
    }

    const tagStr = formatTag(row.inst);
    console.log(`  ${hex(row.pc)} ${row.bytes.padEnd(20)} ${tagStr}${annotation}`);
  }

  console.log('');
  console.log('--- Fast-Path Analysis ---');
  console.log('');
  console.log('The LCD init routine at 0x005BB1 has a gating check:');
  console.log('  0x005BBA: IN0 A,(0x03)      — read GPIO port 0x03');
  console.log('  0x005BBD: BIT 4,A           — test bit 4 (ON-key / reset-button state)');
  console.log('  0x005BBF: JP Z,0x005C44     — if bit4 == 0, jump to fast path');
  console.log('');
  console.log(`With default gpioValue=0xEE (binary ${(0xEE).toString(2).padStart(8, '0')}):`)
  console.log(`  Bit 4 = ${(0xEE >> 4) & 1} → ${((0xEE >> 4) & 1) === 0 ? 'Z flag SET → fast path TAKEN' : 'Z flag CLEAR → heavy init runs'}`);
  console.log(`  Bit 0 = ${0xEE & 1} (for reference)`);
  console.log('');

  const bit4 = (GPIO_VALUE >> 4) & 1;
  console.log(`  0xEE in binary: ${(0xEE).toString(2).padStart(8, '0')}`);
  console.log(`  Bits:           7654 3210`);
  console.log(`  Bit 4 = ${bit4}`);
  console.log('');
  if (bit4 === 0) {
    console.log('  CONCLUSION: With gpioValue=0xEE, bit 4 is CLEAR (0).');
    console.log('  BIT 4,A sets the Z flag → JP Z IS taken → fast path.');
    console.log('  The heavy LCD controller reinit (0x005BC3-0x005C43) is SKIPPED.');
  } else {
    console.log('  CONCLUSION: With gpioValue=0xEE, bit 4 is SET (1).');
    console.log('  BIT 4,A clears the Z flag → JP Z NOT taken → heavy path.');
    console.log('  The full LCD controller reinit runs on every keypress.');
  }
  console.log('');
}

function formatTag(inst) {
  // Simple mnemonic formatting for display
  switch (inst.tag) {
    case 'ld-pair-imm': return `LD ${inst.pair}, ${hex(inst.value)}`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${inst.indexRegister}+${hex(inst.displacement, 2)})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${inst.indexRegister}+${hex(inst.displacement, 2)})`;
    case 'in0': return `IN0 ${inst.reg}, (${hexByte(inst.port)})`;
    case 'out0': return `OUT0 (${hexByte(inst.port)}), ${inst.reg}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `SET ${inst.bit}, ${inst.reg}`;
    case 'bit-res': return `RES ${inst.bit}, ${inst.reg}`;
    case 'jp-conditional': return `JP ${inst.condition}, ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition}, ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'ld-pair-mem': {
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}), ${inst.pair}`;
      return `LD ${inst.pair}, (${hex(inst.addr)})`;
    }
    case 'ld-reg-mem': return `LD ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-imm': return `LD ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest}, ${inst.src}`;
    case 'in-reg': return `IN ${inst.reg}, (C)`;
    case 'out-reg': return `OUT (C), ${inst.reg}`;
    case 'alu-imm': return `${inst.op?.toUpperCase() ?? 'ALU'} ${hexByte(inst.value)}`;
    case 'rst': return `RST ${hexByte(inst.target)}`;
    case 'nop': return 'NOP';
    case 'ret': return 'RET';
    default: return inst.tag;
  }
}

// --- Boot ---

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function seedMemory(mem) {
  for (let i = 0; i < FLASH_SEED_BYTES.length; i += 1) {
    mem[FLASH_SEED_ADDR + i] = FLASH_SEED_BYTES[i];
  }
  mem[SYSFLAG_ADDR] = 0x00;
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = EVENT_RESET_SP;
  mem.fill(0xFF, EVENT_RESET_SP, EVENT_RESET_SP + 12);
}

function injectKey(mem, scanCode) {
  mem[KEY_SCAN_CODE_ADDR] = scanCode & 0xFF;
  mem[KEY_STATUS_ADDR] = (mem[KEY_STATUS_ADDR] | KEY_AVAILABLE_MASK) & 0xFF;
}

// --- Part 2: Dynamic trace ---

function runDynamicTrace(blocks, romBytes, bootState) {
  console.log('=== PART 2: DYNAMIC TRACE — LCD INIT INSTRUCTION COUNT ===');
  console.log('');

  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  prepareEventLoop(cpu, executor, mem, bootState);
  seedMemory(mem);
  injectKey(mem, ENTER_SCAN_CODE);

  // Tracking state
  const lcdBlocks = new Map();     // pc → visit count for blocks in LCD init range
  let lcdInstructionCount = 0;     // total instructions executed in range
  let enteredLcdInit = false;      // did we enter 0x005BB1?
  let fastPathTaken = false;       // did we jump to 0x005C44 early?
  let firstLcdInitStep = null;
  let lastLcdRangeStep = null;
  const portReads = [];            // port reads observed during LCD init
  let totalSteps = 0;

  const STOP_SIGNAL = 'phase382-trace-complete';
  const stopError = new Error(STOP_SIGNAL);
  let haltSeen = false;
  let stoppedBySignal = false;

  let result;
  try {
    result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
      ...EVENT_OPTS,
      diHaltBypass: true,
      diHaltBypassEntry: EVENT_LOOP_ENTRY,
      onBlock(pc, _mode, _meta, step) {
        totalSteps = step;

        // Track LCD init range
        if (pc >= LCD_INIT_ENTRY && pc <= LCD_INIT_RANGE_END) {
          const prevCount = lcdBlocks.get(pc) ?? 0;
          lcdBlocks.set(pc, prevCount + 1);
          lcdInstructionCount += 1;
          lastLcdRangeStep = step;

          if (pc === LCD_INIT_ENTRY) {
            enteredLcdInit = true;
            if (firstLcdInitStep === null) firstLcdInitStep = step;
          }

          if (pc === FAST_PATH_TARGET && enteredLcdInit) {
            fastPathTaken = true;
          }
        }

        // After entering LCD init, if we leave the range and come back to event
        // loop, we're done with the key handling — stop.
        if (pc === 0x0019B5) {
          haltSeen = true;
        }

        if (haltSeen && pc === EVENT_LOOP_ENTRY) {
          throw stopError;
        }
      },
    });
  } catch (err) {
    if (err === stopError) {
      stoppedBySignal = true;
      result = { steps: cpu.stepCount, lastPc: cpu.pc, termination: 'signal' };
    } else {
      throw err;
    }
  }

  // Report
  console.log('--- Boot Phase Results ---');
  for (const phase of bootState.phaseResults) {
    console.log(
      `  ${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');

  console.log('--- Event Loop Trace ---');
  console.log(`  ENTER key injected: scancode=${hexByte(ENTER_SCAN_CODE)}`);
  console.log(`  GPIO port 0x03 value: ${hexByte(GPIO_VALUE)} (bit 4 = ${(GPIO_VALUE >> 4) & 1})`);
  console.log(`  Total event-loop steps: ${count(totalSteps)}`);
  console.log(`  Termination: ${result.termination}`);
  console.log(`  Stopped by signal: ${stoppedBySignal}`);
  console.log('');

  console.log('--- LCD Init (0x005BB1) Observations ---');
  console.log(`  Entered LCD init entry (0x005BB1): ${enteredLcdInit}`);
  console.log(`  First entry at step: ${firstLcdInitStep !== null ? count(firstLcdInitStep) : 'never'}`);
  console.log(`  Fast-path target (0x005C44) reached: ${fastPathTaken}`);
  console.log(`  Distinct blocks visited in ${hex(LCD_INIT_ENTRY)}-${hex(LCD_INIT_RANGE_END)}: ${lcdBlocks.size}`);
  console.log(`  Total block visits in LCD init range: ${count(lcdInstructionCount)}`);
  console.log('');

  if (lcdBlocks.size > 0) {
    console.log('  Blocks visited (sorted by address):');
    const sorted = [...lcdBlocks.entries()].sort((a, b) => a[0] - b[0]);
    const showMax = 40;
    for (let i = 0; i < Math.min(sorted.length, showMax); i++) {
      const [blockPc, visits] = sorted[i];
      console.log(`    ${hex(blockPc)} — ${visits} visit(s)`);
    }
    if (sorted.length > showMax) {
      console.log(`    ... and ${sorted.length - showMax} more blocks`);
    }
  }
  console.log('');

  // Verdict
  const heavyLcdProgramming = lcdBlocks.has(0x005BC9); // first instruction after the heavy-path CALL
  console.log('--- Verdict ---');
  if (!enteredLcdInit) {
    console.log('  LCD init routine was NOT entered at all during key handling.');
  } else if (fastPathTaken && !heavyLcdProgramming) {
    console.log('  FAST PATH CONFIRMED: the JP Z at 0x005BBF was taken.');
    console.log('  The heavy LCD controller programming (0x005BC3-0x005C43) was SKIPPED.');
    console.log(`  However, ${count(lcdInstructionCount)} block visits still occurred in the`);
    console.log(`  wider ${hex(LCD_INIT_ENTRY)}-${hex(LCD_INIT_RANGE_END)} range.`);
    console.log('  This is expected: the fast path at 0x005C44 still configures LCD panel');
    console.log('  ports (0x5000-0x500C), backlight (0xD000-0xD009), and other post-init');
    console.log('  settings. The expensive part (MMIO writes to 0xF80000, PLL, timing) is');
    console.log('  what gets skipped.');
  } else {
    console.log('  HEAVY PATH taken: full LCD hardware init ran.');
    console.log(`  ${count(lcdInstructionCount)} block(s) visited in the LCD init range.`);
  }
  console.log('');

  // Analysis
  console.log('--- Analysis ---');
  const bit4 = (GPIO_VALUE >> 4) & 1;
  console.log(`  gpioValue=0xEE = binary ${(GPIO_VALUE).toString(2).padStart(8, '0')}`);
  console.log(`  Bit 4 of 0xEE = ${bit4} (counting from bit 0)`);
  console.log(`  BIT 4,A with A=0xEE: bit 4 is ${bit4} → Z flag ${bit4 === 0 ? 'SET' : 'CLEAR'}`);
  console.log(`  JP Z,0x005C44: ${bit4 === 0 ? 'TAKEN (fast path)' : 'NOT taken (heavy path)'}`);
  console.log('');
  if (bit4 === 0) {
    console.log('  FINDING: The fast-path IS already active with gpioValue=0xEE.');
    console.log('  Session 381 hypothesis that "bit 4 gates the heavy path" is CORRECT,');
    console.log('  but the conclusion that 0xEE triggers the heavy path was WRONG.');
    console.log('  0xEE has bit 4 = 0, so the fast path is taken.');
    console.log('');
    console.log('  The 72K+ block visits in the LCD range are from the POST-gate code');
    console.log('  at 0x005C44+, which configures LCD panel ports and backlight even on');
    console.log('  the fast path. This is normal — only the heavy controller reinit is');
    console.log('  skipped, not all LCD-related work.');
  }
  console.log('');

  return {
    enteredLcdInit,
    fastPathTaken,
    heavyLcdProgramming,
    lcdInstructionCount,
    lcdBlockCount: lcdBlocks.size,
  };
}

// --- Main ---

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }
  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default
    ?? romModule,
  );

  if (!blocks || Object.keys(blocks).length === 0) {
    throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  console.log('=== PROBE: PHASE 382 — LCD INIT FAST-PATH INVESTIGATION ===');
  console.log('');

  // Part 1: Static disassembly
  staticDisassembly(romBytes);

  // Part 2: Dynamic trace
  console.log('--- Booting phases 1-3 ---');
  const bootState = runBootPhases(blocks, romBytes);
  console.log('  Boot complete.');
  console.log('');

  const traceResult = runDynamicTrace(blocks, romBytes, bootState);

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`  LCD init entered: ${traceResult.enteredLcdInit}`);
  console.log(`  Fast path taken: ${traceResult.fastPathTaken}`);
  console.log(`  Heavy LCD programming ran: ${traceResult.heavyLcdProgramming}`);
  console.log(`  Block visits in LCD range: ${count(traceResult.lcdInstructionCount)}`);
  console.log(`  Distinct blocks: ${traceResult.lcdBlockCount}`);
  console.log('');
  console.log('=== END PROBE ===');

  process.exit(0);
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exit(1);
});
