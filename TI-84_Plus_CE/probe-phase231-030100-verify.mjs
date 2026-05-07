#!/usr/bin/env node

/**
 * Phase 231 — Verify 0x030100 transpiled key lookup path
 *
 * Tests 4 representative scan codes through the key lookup function
 * at 0x0300F1-0x030172, entering at the CALL target 0x03013A.
 * Confirms that block 0x030100 is visited (proving transpilation works)
 * and that the output key codes match the 09F79B table.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const runtimeModule = await import('../TI-84_Plus_CE/cpu-runtime.js');
const {
  createCPU: importedCreateCPU,
  createMemory: importedCreateMemory,
  loadROM: importedLoadROM,
  createExecutor,
} = runtimeModule;

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TABLE_JSON_PATH = path.join(__dirname, 'phase230-09f79b-full-table.json');

const romBytes = fs.readFileSync(ROM_PATH);
const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  {};

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const KEY_EVENT_ADDR = 0xD0058E;

const FUNC_ENTRY = 0x03013A;
const TARGET_BLOCK = 0x030100;
const TABLE_ADDR = 0x09F79B;

// Test cases: { scanCode, expectedKeyCode, label }
// These are input scan codes (table indices within the noMod section)
const TEST_CASES = [
  { scanCode: 0x22, expectedKeyCode: 0x8F, label: 'digit 1 (no modifier)' },
  { scanCode: 0x0A, expectedKeyCode: 0x80, label: '+ key (no modifier)' },
  { scanCode: 0x1A, expectedKeyCode: 0x90, label: 'digit 2 (no modifier)' },
  { scanCode: 0x32, expectedKeyCode: 0x5A, label: 'MODE key (no modifier)' },
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(addr, mode = 'adl') {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function makeStop(kind, extra = {}) {
  const error = new Error('__PHASE231_STOP__');
  error.phase231Stop = { kind, ...extra };
  return error;
}

function createMemoryCompat() {
  if (typeof importedCreateMemory === 'function') {
    return importedCreateMemory();
  }
  return new Uint8Array(MEM_SIZE);
}

function loadROMCompat(mem, romPath = ROM_PATH) {
  if (typeof importedLoadROM === 'function') {
    return importedLoadROM(mem, romPath);
  }
  const bytes = fs.readFileSync(romPath);
  mem.set(bytes.subarray(0, Math.min(mem.length, bytes.length)));
  return bytes.length;
}

function createCPUCompat(mem, peripherals) {
  if (typeof importedCreateCPU === 'function') {
    const created = importedCreateCPU(mem, peripherals);
    if (created?.cpu && created?.executor) return created;
    if (created?.cpu) {
      return {
        cpu: created.cpu,
        executor: created.executor ?? createExecutor(PRELIFTED_BLOCKS, mem, { peripherals }),
      };
    }
    if (created?.cpu === undefined && created?.runFrom && created?.compiledBlocks) {
      return { cpu: created.cpu, executor: created };
    }
    if (created) {
      return {
        cpu: created,
        executor: createExecutor(PRELIFTED_BLOCKS, mem, { peripherals }),
      };
    }
  }

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function createRuntime() {
  const mem = createMemoryCompat();
  const romBytesLoaded = loadROMCompat(mem, ROM_PATH);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPUCompat(mem, peripherals);
  return { mem, cpu, executor, romBytesLoaded };
}

function resetOsState(cpu, mem, stackTop = STACK_TOP) {
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
  cpu.sp = stackTop;
  mem.fill(0xFF, Math.max(0, stackTop - 0x80), Math.min(mem.length, stackTop + 0x20));
}

function coldBoot(runtime) {
  const { cpu, executor, mem } = runtime;

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
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

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function runMemInit(runtime) {
  const { cpu, executor, mem } = runtime;
  resetOsState(cpu, mem);
  push24(cpu, mem, MEM_INIT_RET);

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw makeStop('mem_init_return');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw makeStop('mem_init_return');
        }
      },
    });
  } catch (error) {
    if (!error?.phase231Stop || error.phase231Stop.kind !== 'mem_init_return') {
      throw error;
    }
  }
}

function runKeyLookup(runtime, baselineMem, scanCode) {
  const { cpu, executor, mem } = runtime;

  // Restore baseline memory state
  mem.set(baselineMem);
  resetOsState(cpu, mem);

  // Set up function inputs
  cpu.a = scanCode;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.f = 0x40; // Z flag set, no sign/carry

  // Write scan code to D0058E (the function reads it from here)
  mem[KEY_EVENT_ADDR] = scanCode & 0xFF;

  // Clear modifier flags: IY+0x12 (decimal 18) controls alpha/2nd modifiers
  mem[(IY_ADDR + 0x12) & 0xFFFFFF] = 0x00;

  // Set IY+12 (0x0C) bit 2 — required for the function to proceed to table lookup.
  // Without this, the function skips the key code lookup entirely (JR Z,0x03015E).
  mem[(IY_ADDR + 0x0C) & 0xFFFFFF] |= 0x04;

  // Set IY+21 (0x15) bit 1 — required to pass the RET Z gate at 0x030157.
  // This flag indicates a key event is pending/ready for processing.
  mem[(IY_ADDR + 0x15) & 0xFFFFFF] |= 0x02;

  // Push return sentinel
  cpu.sp = STACK_TOP;
  push24(cpu, mem, RETURN_SENTINEL);

  let steps = 0;
  let lastPc = FUNC_ENTRY;
  let lastMode = 'adl';
  let termination = 'unknown';
  let errorMessage = null;

  const visitedBlocks = [];
  const seenBlocks = new Set();
  const missingBlocks = [];
  let visited030100 = false;

  try {
    const result = executor.runFrom(FUNC_ENTRY, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 32,
      onBlock(pc, mode, _meta, step) {
        const normalizedPc = pc & 0xFFFFFF;
        lastPc = normalizedPc;
        lastMode = mode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);

        const key = blockKey(normalizedPc, lastMode);
        if (!seenBlocks.has(key)) {
          seenBlocks.add(key);
          visitedBlocks.push(key);
        }

        // Check if we visited the target block
        if (normalizedPc === TARGET_BLOCK) {
          visited030100 = true;
        }

        if (normalizedPc === RETURN_SENTINEL) {
          throw makeStop('returned', { pc: normalizedPc });
        }
      },
      onMissingBlock(pc, mode, step) {
        const normalizedPc = pc & 0xFFFFFF;
        lastPc = normalizedPc;
        lastMode = mode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        missingBlocks.push(blockKey(normalizedPc, lastMode));
        throw makeStop('missing_block', { pc: normalizedPc });
      },
    });

    termination = result.termination ?? 'completed';
    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
    lastMode = result.lastMode ?? lastMode;
  } catch (error) {
    if (error?.phase231Stop) {
      termination = error.phase231Stop.kind;
      if (typeof error.phase231Stop.pc === 'number') {
        lastPc = error.phase231Stop.pc & 0xFFFFFF;
      }
    } else {
      termination = 'exception';
      errorMessage = error?.stack || String(error);
    }
  }

  const d0058eAfter = mem[KEY_EVENT_ADDR];

  return {
    scanCode: hexByte(scanCode),
    termination,
    steps,
    lastPc: hex(lastPc),
    lastMode,
    visited030100,
    d0058eAfter: hexByte(d0058eAfter),
    visitedBlocks,
    missingBlocks,
    registersAfter: {
      a: hexByte(cpu.a),
      f: hexByte(cpu.f),
      hl: hex(cpu.hl),
      de: hex(cpu.de),
      sp: hex(cpu.sp),
    },
    errorMessage,
  };
}

function loadExpectedTable() {
  try {
    const raw = fs.readFileSync(TABLE_JSON_PATH, 'utf8');
    const table = JSON.parse(raw);
    const noMod = table.sections.noMod;
    const lookup = {};
    for (const entry of noMod) {
      lookup[entry.index] = parseInt(entry.keyCode, 16);
    }
    return lookup;
  } catch {
    return null;
  }
}

function main() {
  console.log('=== Phase 231 — Verify 0x030100 Transpiled Key Lookup Path ===');
  console.log();

  // Check that block 0x030100 exists in transpiled output
  const targetKey = blockKey(TARGET_BLOCK);
  const blockExists = Boolean(PRELIFTED_BLOCKS[targetKey]);
  console.log(`Block ${targetKey} exists in PRELIFTED_BLOCKS: ${blockExists}`);

  if (!blockExists) {
    console.log('FAIL: Block 0x030100 not found in transpiled output. Cannot verify.');
    process.exitCode = 1;
    return;
  }

  // Boot and initialize
  console.log('Cold booting...');
  const runtime = createRuntime();
  coldBoot(runtime);
  console.log('Running memInit...');
  runMemInit(runtime);
  const baselineMem = new Uint8Array(runtime.mem);
  console.log('Baseline memory captured.');
  console.log();

  // Load expected table for cross-reference
  const expectedTable = loadExpectedTable();
  if (expectedTable) {
    console.log(`Loaded 09F79B table JSON with ${Object.keys(expectedTable).length} noMod entries.`);
  } else {
    console.log('WARNING: Could not load phase230-09f79b-full-table.json for cross-reference.');
  }
  console.log();

  // Run test cases
  const results = [];
  let passCount = 0;
  let totalCount = TEST_CASES.length;

  for (const testCase of TEST_CASES) {
    console.log(`--- Test: ${testCase.label} (scanCode=${hexByte(testCase.scanCode)}) ---`);

    const result = runKeyLookup(runtime, baselineMem, testCase.scanCode);

    // Cross-reference with table
    const expectedFromTable = expectedTable ? expectedTable[testCase.scanCode] : null;
    const expectedKeyCode = testCase.expectedKeyCode;

    // The function writes the key code to D0058E
    const actualKeyCode = parseInt(result.d0058eAfter.replace('0x', ''), 16);

    const keyCodeMatch = actualKeyCode === expectedKeyCode;
    const tableMatch = expectedFromTable !== null ? actualKeyCode === expectedFromTable : null;
    const blockVisited = result.visited030100;
    const noMissing = result.missingBlocks.length === 0;
    const returned = result.termination === 'returned';

    const passed = keyCodeMatch && blockVisited && noMissing && returned;
    if (passed) passCount++;

    console.log(`  Termination: ${result.termination}`);
    console.log(`  Steps: ${result.steps}`);
    console.log(`  Last PC: ${result.lastPc}`);
    console.log(`  Block 0x030100 visited: ${blockVisited ? 'YES' : 'NO'}`);
    console.log(`  D0058E after: ${result.d0058eAfter} (expected: ${hexByte(expectedKeyCode)})`);
    console.log(`  Key code match: ${keyCodeMatch ? 'PASS' : 'FAIL'}`);
    if (tableMatch !== null) {
      console.log(`  Table JSON match: ${tableMatch ? 'PASS' : 'FAIL'} (table says: ${hexByte(expectedFromTable)})`);
    }
    console.log(`  Missing blocks: ${result.missingBlocks.length === 0 ? 'none' : result.missingBlocks.join(', ')}`);
    console.log(`  Registers: A=${result.registersAfter.a} F=${result.registersAfter.f} HL=${result.registersAfter.hl}`);
    console.log(`  Visited blocks (${result.visitedBlocks.length}): ${result.visitedBlocks.join(', ')}`);
    console.log(`  RESULT: ${passed ? 'PASS' : 'FAIL'}`);
    console.log();

    results.push({
      label: testCase.label,
      scanCode: hexByte(testCase.scanCode),
      expectedKeyCode: hexByte(expectedKeyCode),
      actualD0058E: result.d0058eAfter,
      keyCodeMatch,
      tableMatch,
      blockVisited,
      noMissing,
      returned,
      passed,
      ...result,
    });
  }

  // Summary
  console.log('=== SUMMARY ===');
  console.log(`${passCount}/${totalCount} tests passed`);
  for (const r of results) {
    console.log(`  ${r.label}: ${r.passed ? 'PASS' : 'FAIL'} (scanCode=${r.scanCode} -> D0058E=${r.actualD0058E}, expected=${r.expectedKeyCode}, block030100=${r.blockVisited ? 'yes' : 'no'})`);
  }

  console.log();
  console.log(JSON.stringify({
    probe: 'phase231-030100-verify',
    generatedAt: new Date().toISOString(),
    block030100Exists: blockExists,
    testResults: results.map(r => ({
      label: r.label,
      scanCode: r.scanCode,
      expectedKeyCode: r.expectedKeyCode,
      actualD0058E: r.actualD0058E,
      keyCodeMatch: r.keyCodeMatch,
      tableMatch: r.tableMatch,
      blockVisited: r.blockVisited,
      termination: r.termination,
      steps: r.steps,
      missingBlocks: r.missingBlocks,
      passed: r.passed,
    })),
    summary: {
      total: totalCount,
      passed: passCount,
      allPassed: passCount === totalCount,
    },
  }, null, 2));

  process.exitCode = passCount === totalCount ? 0 : 1;
}

main();
