#!/usr/bin/env node

/**
 * Phase 378 — Scan Code Table Probe
 *
 * Dynamically traces the OS scan code computation at 0x003D34-0x003D45.
 * For each keyboard group, presses one key in the matrix, lets the OS
 * scan routine at 0x003C63 run naturally, and captures:
 *   - The H register value at block 0x003D36 (LD A,H)
 *   - The final scan code written to 0xD00587 by block 0x003D4B
 *
 * Formula: scancode = (H-1)*8 + bit_position + 1
 *
 * Uses the natural keyboard scan path (setMatrixKey), NOT RAM injection.
 * Boot sequence copied from probe-phase377-natural-key-scan.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

// ── Boot addresses (from probe-phase377) ────────────────────────────────────

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };

const PERIPHERAL_OPTS = { timerInterrupt: false, gpioValue: 0xEE };

// ── Key addresses ───────────────────────────────────────────────────────────

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

// ── Scan code computation blocks ────────────────────────────────────────────
//
// Disassembly at the scan code computation path:
//   0x003D34: OR L           — check if any key found (block 003d34:adl)
//   0x003D35: RET Z          — no key -> return
//   ---block boundary---
//   0x003D36: LD A, H        — A = group counter (block 003d36:adl)
//   0x003D37: DEC A           — A = H-1
//   0x003D38: BIT 0,(IY+2C)  — check system flag
//   0x003D3C: RET NZ          — return if flag set
//   ---block boundary---
//   0x003D3D: RLA; RLA; RLA  — A = (H-1)*8  (block 003d3d:adl)
//   ---block boundary---
//   0x003D40: INC A           — A += 1       (block 003d40:adl)
//   0x003D41: RR L            — shift L right
//   0x003D43: JR NC, 003D40   — loop until bit found
//   ---block boundary---
//   0x003D45: CCF             — complement carry
//   0x003D46: RET Z
//   0x003D47: SCF; LD A,0xFF; RET  — multi-key error
//   ---
//   0x003D4B: LD (0xD00587),A — store scan code

const SCAN_ENTRY = 0x003C63;
const COMPUTATION_LD_A_H = 0x003D36;
const STORE_BLOCK = 0x003D4B;

// ── CPU snapshot fields (from probe-phase377) ───────────────────────────────

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

// ── Keyboard matrix layout from keyboard-matrix.md ──────────────────────────

const MATRIX_LAYOUT = [
  // keyMatrix[0] = SDK Group 7 (arrows)
  ['DOWN', 'LEFT', 'RIGHT', 'UP', null, null, null, null],
  // keyMatrix[1] = SDK Group 6 (operators)
  ['ENTER', '+', '-', 'x', '/', '^', 'CLEAR', null],
  // keyMatrix[2] = SDK Group 5
  ['(-)', '3', '6', '9', ')', 'TAN', 'VARS', null],
  // keyMatrix[3] = SDK Group 4
  ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  // keyMatrix[4] = SDK Group 3
  ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'X,T,0,n'],
  // keyMatrix[5] = SDK Group 2
  [null, 'STO>', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  // keyMatrix[6] = SDK Group 1 (function keys)
  ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', 'DEL'],
];

// ── Helpers ─────────────────────────────────────────────────────────────────

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

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
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
  if (!snapshot || !executor?.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function preparePhase(cpu, mem, sp, stackFillBytes) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
}

function seedGates(mem) {
  for (let i = 0; i < FLASH_SEED_BYTES.length; i++) {
    mem[FLASH_SEED_ADDR + i] = FLASH_SEED_BYTES[i];
  }
  mem[SYSFLAG_ADDR] = 0x00;
}

function resetKeyboard(peripherals) {
  if (peripherals.keyboard?.keyMatrix) {
    peripherals.keyboard.keyMatrix.fill(0xFF);
    peripherals.keyboard.groupSelect = 0xFF;
  }
  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
}

function wrapBlock(executor, blockKey, factory) {
  const original = executor.compiledBlocks[blockKey];
  if (!original) {
    return false;
  }
  executor.compiledBlocks[blockKey] = factory(original);
  return true;
}

// ── Boot phases (from probe-phase377) ───────────────────────────────────────

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus(PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
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

// ── Run one key scenario and trace the computation ──────────────────────────

function runKeyTrace(blocks, bootState, keyGroup, keyBit) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus(PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  prepareEventLoop(cpu, executor, mem, bootState);
  seedGates(mem);
  resetKeyboard(peripherals);

  // Clear key state
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;

  // Press key via matrix (natural scan path, NOT RAM injection)
  if (typeof peripherals.setMatrixKey !== 'function') {
    throw new Error('peripherals.setMatrixKey not available');
  }
  peripherals.setMatrixKey(keyGroup, keyBit, true);

  const trace = {
    scanCalls: 0,
    computationHits: [],
    storeHits: [],
    wrappedComputation: false,
    wrappedStore: false,
  };

  // Wrap block 003d36:adl — this is where LD A,H happens.
  // At entry, cpu.h still holds the group counter value before LD A,H executes.
  trace.wrappedComputation = wrapBlock(
    executor,
    makeKey(COMPUTATION_LD_A_H),
    (original) => function wrappedLdAH(cpuRef) {
      const h = cpuRef.h;
      const l = cpuRef.l;
      trace.computationHits.push({ h, l, step: cpuRef.stepCount });
      return original(cpuRef);
    },
  );

  // Wrap store block 003d4b:adl — captures the scan code being stored.
  trace.wrappedStore = wrapBlock(
    executor,
    makeKey(STORE_BLOCK),
    (original) => function wrappedStore(cpuRef) {
      const aBefore = cpuRef.a & 0xFF;
      const memBefore = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
      const result = original(cpuRef);
      const memAfter = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
      trace.storeHits.push({
        aBefore,
        memBefore,
        memAfter,
        step: cpuRef.stepCount,
      });
      return result;
    },
  );

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    maxSteps: 500000,
    maxLoopIterations: 500000,
    onBlock(pc) {
      if ((pc & 0xFFFFFF) === SCAN_ENTRY) {
        trace.scanCalls++;
      }
    },
  });

  return {
    result,
    trace,
    finalScanCode: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    finalKeyStatus: mem[KEY_STATUS_ADDR] & 0xFF,
  };
}

// ── Scan code formula ───────────────────────────────────────────────────────

function computeFormulaCode(h, bitPos) {
  return (h - 1) * 8 + bitPos + 1;
}

// ── Main ────────────────────────────────────────────────────────────────────

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

  console.log('=== PROBE: PHASE 378 SCAN CODE TABLE ===');
  console.log(`computation block (LD A,H): ${hex(COMPUTATION_LD_A_H)}`);
  console.log(`store block: ${hex(STORE_BLOCK)}`);
  console.log(`formula: scancode = (H-1)*8 + bit_position + 1`);
  console.log('');

  // ── Boot ──────────────────────────────────────────────────────────────

  console.log('=== BOOT PHASES ===');
  const bootState = runBootPhases(blocks, romBytes);

  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');

  // ── Trace ENTER key first (group=1, bit=0) as validation ──────────────

  console.log('=== ENTER KEY TRACE (group=1, bit=0, expected OS code=0x29) ===');
  const enterResult = runKeyTrace(blocks, bootState, 1, 0);

  console.log(`block wrapping: computation=${enterResult.trace.wrappedComputation} store=${enterResult.trace.wrappedStore}`);
  console.log(`scan calls: ${count(enterResult.trace.scanCalls)}`);
  console.log(`computation block hits: ${enterResult.trace.computationHits.length}`);

  if (enterResult.trace.computationHits.length > 0) {
    const entry = enterResult.trace.computationHits[0];
    const computed = computeFormulaCode(entry.h, 0);
    console.log(
      `  first hit: step=${count(entry.step)} H=${entry.h} L=${hexByte(entry.l)} `
      + `formula=(${entry.h}-1)*8+0+1=${computed} (${hex(computed, 2)})`,
    );
  } else {
    console.log('  (computation block not reached)');
  }

  console.log(`store block hits: ${enterResult.trace.storeHits.length}`);

  if (enterResult.trace.storeHits.length > 0) {
    const entry = enterResult.trace.storeHits[0];
    console.log(
      `  first hit: step=${count(entry.step)} A=${hexByte(entry.aBefore)} `
      + `mem: ${hexByte(entry.memBefore)} -> ${hexByte(entry.memAfter)}`,
    );
  } else {
    console.log('  (store block not reached)');
  }

  console.log(`final: scanCode=${hexByte(enterResult.finalScanCode)} status=${hexByte(enterResult.finalKeyStatus)}`);

  const enterValid = enterResult.finalScanCode === 0x29;
  console.log(`ENTER validation: ${enterValid ? 'PASS (0x29)' : 'FAIL (expected 0x29, got ' + hexByte(enterResult.finalScanCode) + ')'}`);
  console.log('');

  // ── Trace one key per group to find H values ──────────────────────────

  console.log('=== GROUP H-VALUE DISCOVERY ===');
  console.log('Pressing one key per group and tracing H at computation block entry.');
  console.log('');

  const hValues = new Array(7).fill(null);
  const storedCodes = new Array(7).fill(null);

  for (let group = 0; group < 7; group++) {
    // Find first valid key bit in this group
    let testBit = -1;
    for (let bit = 0; bit < 8; bit++) {
      if (MATRIX_LAYOUT[group][bit]) {
        testBit = bit;
        break;
      }
    }
    if (testBit < 0) {
      console.log(`group ${group}: no valid keys, skipping`);
      continue;
    }

    const keyName = MATRIX_LAYOUT[group][testBit];
    const result = runKeyTrace(blocks, bootState, group, testBit);

    storedCodes[group] = result.finalScanCode;

    if (result.trace.computationHits.length > 0) {
      const entry = result.trace.computationHits[0];
      hValues[group] = entry.h;
      const computed = computeFormulaCode(entry.h, testBit);
      console.log(
        `group ${group} (${keyName.padEnd(8)}): H=${entry.h} L=${hexByte(entry.l)} `
        + `formula=(${entry.h}-1)*8+${testBit}+1=${computed} (${hex(computed, 2)}) `
        + `stored=${hexByte(result.finalScanCode)} `
        + `match=${computed === result.finalScanCode ? 'YES' : 'NO'}`,
      );
    } else if (result.trace.storeHits.length > 0) {
      // Computation block not reached but store was — reverse-engineer H
      const stored = result.finalScanCode;
      const inferredH = Math.floor((stored - testBit - 1) / 8) + 1;
      hValues[group] = inferredH;
      console.log(
        `group ${group} (${keyName.padEnd(8)}): computation block missed, `
        + `store wrote ${hexByte(stored)} -> inferred H=${inferredH} `
        + `(scans=${result.trace.scanCalls})`,
      );
    } else {
      // Neither reached — try to infer from final scan code
      if (result.finalScanCode !== 0) {
        const stored = result.finalScanCode;
        const inferredH = Math.floor((stored - testBit - 1) / 8) + 1;
        hValues[group] = inferredH;
        console.log(
          `group ${group} (${keyName.padEnd(8)}): no hooks reached, `
          + `but scanCode=${hexByte(stored)} -> inferred H=${inferredH} `
          + `(scans=${result.trace.scanCalls} steps=${count(result.result.steps)})`,
        );
      } else {
        console.log(
          `group ${group} (${keyName.padEnd(8)}): no computation/store reached, scanCode=0 `
          + `(scans=${result.trace.scanCalls} steps=${count(result.result.steps)})`,
        );
      }
    }
  }
  console.log('');

  // ── H-value summary ───────────────────────────────────────────────────

  console.log('=== H-VALUE MAPPING ===');
  for (let group = 0; group < 7; group++) {
    const sdkGroup = 7 - group;
    const h = hValues[group];
    console.log(
      `keyMatrix[${group}] (SDK Group ${sdkGroup}): H=${h !== null ? h : '?'} `
      + `=> base OS code = ${h !== null ? computeFormulaCode(h, 0) + ' (' + hex(computeFormulaCode(h, 0), 2) + ')' : '?'}`,
    );
  }
  console.log('');

  // ── Full scan code table ──────────────────────────────────────────────

  console.log('=== FULL SCAN CODE TABLE ===');
  console.log('formula: OS_scancode = (H-1)*8 + bit + 1');
  console.log('');
  console.log(
    'Group  Bit  Key          Matrix   H   OS Code  OS Hex',
  );
  console.log(
    '-----  ---  -----------  ------  ---  -------  ------',
  );

  const allRows = [];

  for (let group = 0; group < 7; group++) {
    const h = hValues[group];

    for (let bit = 0; bit < 8; bit++) {
      const keyName = MATRIX_LAYOUT[group][bit];
      if (!keyName) {
        continue;
      }

      const matrixCode = (group << 4) | bit;
      const osScanCode = h !== null ? computeFormulaCode(h, bit) : null;

      allRows.push({ group, bit, keyName, matrixCode, osScanCode, h });

      const matrixHex = hex(matrixCode, 2);
      const hStr = h !== null ? String(h).padStart(3) : '  ?';
      const osCodeStr = osScanCode !== null ? String(osScanCode).padStart(7) : '      ?';
      const osHexStr = osScanCode !== null ? hex(osScanCode, 2) : '     ?';

      console.log(
        `  ${String(group).padStart(3)}  `
        + `${String(bit).padStart(3)}  `
        + `${keyName.padEnd(11)}  `
        + `${matrixHex.padStart(6)}  `
        + `${hStr}  `
        + `${osCodeStr}  `
        + `${osHexStr}`,
      );
    }
  }
  console.log('');

  // ── Cross-reference: matrix code vs OS code ───────────────────────────

  console.log('=== CROSS-REFERENCE: Matrix Code vs OS Scan Code ===');
  console.log('');
  console.log(
    'Key          Grp:Bit  Matrix   OS Code  Relation',
  );
  console.log(
    '-----------  -------  ------   -------  --------',
  );

  for (const row of allRows) {
    const matrixHex = hex(row.matrixCode, 2);
    const osHex = row.osScanCode !== null ? hex(row.osScanCode, 2) : '   ?  ';
    const relation = row.osScanCode !== null
      ? (row.matrixCode === row.osScanCode ? 'SAME' : 'DIFF')
      : '?';

    console.log(
      `${row.keyName.padEnd(11)}  `
      + `${row.group}:${row.bit}      `
      + `${matrixHex}     `
      + `${osHex}     `
      + `${relation}`,
    );
  }
  console.log('');

  // ── Spot-check: verify a few specific keys independently ──────────────

  console.log('=== SPOT CHECK: Individual Key Verification ===');

  const spotChecks = [
    { group: 1, bit: 0, name: 'ENTER', expected: 0x29 },
    { group: 0, bit: 3, name: 'UP' },
    { group: 4, bit: 0, name: '0' },
    { group: 6, bit: 7, name: 'DEL' },
    { group: 1, bit: 6, name: 'CLEAR' },
    { group: 5, bit: 7, name: 'ALPHA' },
  ];

  for (const check of spotChecks) {
    const result = runKeyTrace(blocks, bootState, check.group, check.bit);
    const h = result.trace.computationHits.length > 0
      ? result.trace.computationHits[0].h
      : null;
    const predicted = h !== null ? computeFormulaCode(h, check.bit) : null;
    const expectedStr = check.expected ? ` expected=${hex(check.expected, 2)}` : '';
    const matchStr = check.expected
      ? (result.finalScanCode === check.expected ? 'PASS' : 'FAIL')
      : (predicted !== null && predicted === result.finalScanCode ? 'CONSISTENT' : '?');

    console.log(
      `${check.name.padEnd(8)}: group=${check.group} bit=${check.bit} `
      + `H=${h !== null ? h : '?'} `
      + `predicted=${predicted !== null ? hex(predicted, 2) : '?'} `
      + `stored=${hexByte(result.finalScanCode)} `
      + `${matchStr}${expectedStr}`,
    );
  }
  console.log('');

  // ── Summary ───────────────────────────────────────────────────────────

  console.log('=== SUMMARY ===');

  const discoveredGroups = hValues.filter((h) => h !== null).length;
  const totalKeys = allRows.length;
  const mappedKeys = allRows.filter((r) => r.osScanCode !== null).length;

  console.log(`groups with H discovered: ${discoveredGroups}/7`);
  console.log(`keys with OS scan codes: ${mappedKeys}/${totalKeys}`);

  const enterH = hValues[1];
  if (enterH !== null) {
    console.log('');
    console.log('ENTER path explained:');
    console.log(`  keyMatrix[1] (SDK Group 6), bit 0`);
    console.log(`  H=${enterH} at computation entry`);
    console.log(`  scancode = (${enterH}-1)*8 + 0 + 1 = ${computeFormulaCode(enterH, 0)} = ${hex(computeFormulaCode(enterH, 0), 2)}`);

    if (computeFormulaCode(enterH, 0) === 0x29) {
      console.log('  Confirmed: OS scan code for ENTER is 0x29.');
    }
  }

  console.log('');
  console.log('H-value pattern (scan loop iteration order):');
  for (let group = 0; group < 7; group++) {
    const h = hValues[group];
    if (h !== null) {
      console.log(`  keyMatrix[${group}] (SDK Group ${7 - group}): H=${h}`);
    }
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
