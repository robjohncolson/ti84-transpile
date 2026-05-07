#!/usr/bin/env node

/**
 * Phase 231 — Verify 0x030100 transpiled key lookup path
 *
 * Architecture discovery:
 *   - 0x03013A is a high-level key event dispatcher (IY flag gates).
 *   - 0x0300F1 is the key lookup function body (0x0300F1-0x030172).
 *   - 0x030100 is a SYNTHETIC seed block — it overlaps the CALL instruction
 *     bytes at 0x0300FF (cd f2 fb 03). The transpiler treats 0x030100 as
 *     "JP P, 0xFD03FB" which is an alternate decoding of those bytes.
 *     Block 0x030100 is never reached by normal control flow.
 *   - The actual table lookup is at block 0x030117:
 *       ADD A, 0x38 / LD L,A / LD H,0 / LD DE,0x09F79B / ADD HL,DE /
 *       LD A,(HL) / CP 0xE2 / JR C, 0x030134 (normal key code path)
 *   - For no-modifier, the path from 0x0300F1 goes to 0x030074 (JP 0x02FF0B),
 *     bypassing block 0x030117 entirely.
 *
 * This probe verifies:
 *   (A) Block 0x030100 EXISTS in PRELIFTED_BLOCKS (transpiler seed worked).
 *   (B) Block 0x030100 CAN EXECUTE without crash (direct entry, like phase 230).
 *   (C) The table lookup at 0x030117 produces correct key codes for 4 scan codes,
 *       cross-referenced against phase230-09f79b-full-table.json.
 *   (D) The full function at 0x0300F1 executes for a representative scan code.
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

const TARGET_BLOCK = 0x030100;
const TABLE_LOOKUP_ENTRY = 0x030117;
const FUNC_ENTRY = 0x0300F1;
const TABLE_ADDR = 0x09F79B;

// Test cases for the table lookup at 0x030117.
// The block at 0x030117 does: ADD A,0x38 then looks up table[A] at 0x09F79B.
// So for noMod section (offset 0), we need A = scanCode - 0x38 on entry to 0x030117,
// because the block adds 0x38 back. But actually the noMod section starts at index 0,
// and the code reaches 0x030117 only through 0x03010B which adds 0x70 first.
// For 2nd-modifier path: offset = scanCode + 0x38, read at 0x030117.
// For alpha path: offset = scanCode + 0x70, goes through 0x030074 if BIT 5 clear.
// For alpha+2nd path: offset = scanCode + 0x70 + 0x38 = scanCode + 0xA8.
//
// The simplest test: enter at 0x030117 directly with A already set to the desired
// table offset. The block does ADD A,0x38, so A on entry should be (tableIndex - 0x38).
// For noMod section indices 0-55: entry A = index - 0x38. But index < 0x38 would underflow.
//
// Actually, let's just enter at the instruction AFTER the ADD A,0x38.
// Block 0x030117 source shows the ADD A,0x38 is the first instruction.
// The LD L,A is at 0x030119. But there's no block at 0x030119.
//
// Alternative: set A so that after ADD A,0x38, we get the desired index.
// For noMod table index N: A_entry = (N - 0x38) & 0xFF.
// For index 0x22 (digit 1, keyCode 0x8F): A_entry = (0x22 - 0x38) & 0xFF = 0xEA.
// After ADD A,0x38: 0xEA + 0x38 = 0x122 => 0x22 (low byte), carry set.
// But LD L,A takes low 8 bits, LD H,0x00, so HL = 0x22. Then ADD HL,DE = 0x09F79B + 0x22 = 0x09F7BD.
// ROM[0x09F7BD] should be 0x8F.

const TABLE_LOOKUP_TESTS = [
  { tableIndex: 0x22, expectedKeyCode: 0x8F, label: 'digit 1 (noMod[0x22])' },
  { tableIndex: 0x0A, expectedKeyCode: 0x80, label: '+ key (noMod[0x0A])' },
  { tableIndex: 0x1A, expectedKeyCode: 0x90, label: 'digit 2 (noMod[0x1A])' },
  // Note: noMod[0x32] = 0x5A (MODE key) hits a special CP 0x5A branch at 0x02FF8D
  // that transforms A downstream. Use GRAPH key (noMod[0x37] = 0x45) instead, which
  // is a normal key code that passes through without transformation.
  { tableIndex: 0x37, expectedKeyCode: 0x45, label: 'kClrTable (noMod[0x37])' },
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

/**
 * Run a trace from a given entry point, returning detailed results.
 */
function runTrace(runtime, baselineMem, entryPc, setupFn, maxSteps = 200) {
  const { cpu, executor, mem } = runtime;

  mem.set(baselineMem);
  resetOsState(cpu, mem);

  // Apply test-specific setup
  setupFn(cpu, mem);

  // Push return sentinel
  cpu.sp = STACK_TOP;
  push24(cpu, mem, RETURN_SENTINEL);

  let steps = 0;
  let lastPc = entryPc;
  let lastMode = 'adl';
  let termination = 'unknown';
  let errorMessage = null;

  const visitedBlocks = [];
  const seenBlocks = new Set();
  const missingBlocks = [];

  try {
    const result = executor.runFrom(entryPc, 'adl', {
      maxSteps,
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

        if (normalizedPc === RETURN_SENTINEL) {
          throw makeStop('returned', { pc: normalizedPc });
        }
      },
      onMissingBlock(pc, mode, step) {
        const normalizedPc = pc & 0xFFFFFF;
        lastPc = normalizedPc;
        lastMode = mode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);

        // Treat sentinel as a return, not a missing block
        if (normalizedPc === RETURN_SENTINEL) {
          throw makeStop('returned', { pc: normalizedPc });
        }

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

  return {
    termination,
    steps,
    lastPc: hex(lastPc),
    lastMode,
    visitedBlocks,
    seenBlocks,
    missingBlocks,
    registersAfter: {
      a: hexByte(cpu.a),
      f: hexByte(cpu.f),
      hl: hex(cpu.hl),
      de: hex(cpu.de),
      sp: hex(cpu.sp),
    },
    d0058eAfter: hexByte(mem[KEY_EVENT_ADDR]),
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

  // ========== (A) Block existence check ==========
  const targetKey = blockKey(TARGET_BLOCK);
  const blockExists = Boolean(PRELIFTED_BLOCKS[targetKey]);
  console.log(`(A) Block ${targetKey} exists in PRELIFTED_BLOCKS: ${blockExists}`);

  if (!blockExists) {
    console.log('FAIL: Block 0x030100 not found in transpiled output.');
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

  // ========== (B) Block 0x030100 direct execution ==========
  console.log('(B) Testing block 0x030100 direct execution (synthetic seed)...');
  const directResult = runTrace(runtime, baselineMem, TARGET_BLOCK, (cpu, mem) => {
    // Set up like probe-phase230: A = scan code, sign flag set
    cpu.a = 0x22;
    cpu.f = 0x80; // S=1 to make JP P fall through
    cpu.hl = TABLE_ADDR;
    mem[(IY_ADDR + 0x12) & 0xFFFFFF] = 0x00;
    mem[KEY_EVENT_ADDR] = 0x00;
  }, 64);

  const directVisited = directResult.seenBlocks.has(targetKey);
  const directOk = directVisited && directResult.missingBlocks.length === 0;
  console.log(`  Entry block visited: ${directVisited ? 'YES' : 'NO'}`);
  console.log(`  Termination: ${directResult.termination}`);
  console.log(`  Steps: ${directResult.steps}`);
  console.log(`  Missing blocks: ${directResult.missingBlocks.length === 0 ? 'none' : directResult.missingBlocks.join(', ')}`);
  console.log(`  Visited blocks: ${directResult.visitedBlocks.join(', ')}`);
  console.log(`  Result: ${directOk ? 'PASS' : 'FAIL'}`);
  console.log();

  // ========== (C) Table lookup at 0x030117 ==========
  console.log('(C) Testing table lookup at 0x030117 with 4 scan codes...');
  console.log();

  const expectedTable = loadExpectedTable();
  if (expectedTable) {
    console.log(`  Loaded 09F79B table JSON with ${Object.keys(expectedTable).length} noMod entries.`);
  } else {
    console.log('  WARNING: Could not load phase230-09f79b-full-table.json.');
  }
  console.log();

  // Verify ROM bytes match the table at the expected offsets
  console.log('  ROM byte verification (direct read from 0x09F79B + index):');
  for (const tc of TABLE_LOOKUP_TESTS) {
    const romByte = romBytes[TABLE_ADDR + tc.tableIndex];
    const match = romByte === tc.expectedKeyCode;
    console.log(`    index=${hexByte(tc.tableIndex)} ROM[${hex(TABLE_ADDR + tc.tableIndex)}]=${hexByte(romByte)} expected=${hexByte(tc.expectedKeyCode)} ${match ? 'MATCH' : 'MISMATCH'}`);
  }
  console.log();

  // Run the table lookup block directly
  let tableLookupPassCount = 0;
  const tableLookupResults = [];

  for (const tc of TABLE_LOOKUP_TESTS) {
    // Block 0x030117 does: ADD A,0x38 / LD L,A / LD H,0 / LD DE,0x09F79B /
    // ADD HL,DE / LD A,(HL) / CP 0xE2 / JR C, 0x030134
    // We want the final table offset to be tc.tableIndex.
    // After ADD A,0x38: result = (entryA + 0x38) & 0xFF
    // We need (entryA + 0x38) & 0xFF = tc.tableIndex
    // So entryA = (tc.tableIndex - 0x38) & 0xFF
    const entryA = (tc.tableIndex - 0x38) & 0xFF;

    console.log(`  --- ${tc.label} (entryA=${hexByte(entryA)}, tableIndex=${hexByte(tc.tableIndex)}) ---`);

    const result = runTrace(runtime, baselineMem, TABLE_LOOKUP_ENTRY, (cpu, mem) => {
      cpu.a = entryA;
      cpu.f = 0x40;
      cpu.d = 0x01; // D=1 flag as set by upstream code
      mem[KEY_EVENT_ADDR] = tc.tableIndex & 0xFF;
    }, 50);

    const lookupBlockVisited = result.seenBlocks.has(blockKey(TABLE_LOOKUP_ENTRY));
    const actualA = parseInt(result.registersAfter.a.replace('0x', ''), 16);
    const keyCodeMatch = actualA === tc.expectedKeyCode;
    const tableMatch = expectedTable ? actualA === expectedTable[tc.tableIndex] : null;
    const noMissing = result.missingBlocks.length === 0;

    // For normal key codes (< 0xE2), the path goes to 0x030134 which writes D0058E
    const d0058eVal = parseInt(result.d0058eAfter.replace('0x', ''), 16);

    const passed = keyCodeMatch && noMissing;
    if (passed) tableLookupPassCount++;

    console.log(`    Termination: ${result.termination}`);
    console.log(`    Steps: ${result.steps}`);
    console.log(`    A after lookup: ${result.registersAfter.a} (expected: ${hexByte(tc.expectedKeyCode)})`);
    console.log(`    Key code in A: ${keyCodeMatch ? 'PASS' : 'FAIL'}`);
    if (tableMatch !== null) {
      console.log(`    Table JSON cross-ref: ${tableMatch ? 'PASS' : 'FAIL'}`);
    }
    console.log(`    D0058E: ${result.d0058eAfter}`);
    console.log(`    Missing blocks: ${noMissing ? 'none' : result.missingBlocks.join(', ')}`);
    console.log(`    Visited: ${result.visitedBlocks.join(', ')}`);
    console.log(`    Result: ${passed ? 'PASS' : 'FAIL'}`);
    console.log();

    tableLookupResults.push({
      label: tc.label,
      tableIndex: hexByte(tc.tableIndex),
      entryA: hexByte(entryA),
      expectedKeyCode: hexByte(tc.expectedKeyCode),
      actualA: result.registersAfter.a,
      d0058eAfter: result.d0058eAfter,
      keyCodeMatch,
      tableMatch,
      noMissing,
      passed,
      termination: result.termination,
      steps: result.steps,
      visitedBlocks: result.visitedBlocks,
      missingBlocks: result.missingBlocks,
    });
  }

  // ========== (D) Full function 0x0300F1 smoke test ==========
  console.log('(D) Full function 0x0300F1 smoke test (scanCode=0x22, no modifier)...');
  const fullResult = runTrace(runtime, baselineMem, FUNC_ENTRY, (cpu, mem) => {
    cpu.a = 0x22; // scan code for digit 1
    cpu.f = 0x40;
    mem[KEY_EVENT_ADDR] = 0x22;
    mem[(IY_ADDR + 0x12) & 0xFFFFFF] = 0x00; // no alpha/2nd modifiers
  }, 200);

  console.log(`  Termination: ${fullResult.termination}`);
  console.log(`  Steps: ${fullResult.steps}`);
  console.log(`  A: ${fullResult.registersAfter.a}`);
  console.log(`  D0058E: ${fullResult.d0058eAfter}`);
  console.log(`  Missing blocks: ${fullResult.missingBlocks.length === 0 ? 'none' : fullResult.missingBlocks.join(', ')}`);
  console.log(`  Visited blocks (${fullResult.visitedBlocks.length}): ${fullResult.visitedBlocks.join(', ')}`);
  console.log();

  // ========== Summary ==========
  console.log('=== SUMMARY ===');
  console.log(`(A) Block 0x030100 exists: ${blockExists ? 'PASS' : 'FAIL'}`);
  console.log(`(B) Block 0x030100 direct exec: ${directOk ? 'PASS' : 'FAIL'}`);
  console.log(`(C) Table lookup: ${tableLookupPassCount}/${TABLE_LOOKUP_TESTS.length} passed`);
  for (const r of tableLookupResults) {
    console.log(`    ${r.label}: ${r.passed ? 'PASS' : 'FAIL'} (A=${r.actualA}, expected=${r.expectedKeyCode})`);
  }
  console.log(`(D) Full function smoke: termination=${fullResult.termination}, steps=${fullResult.steps}`);
  console.log();

  const allCPassed = tableLookupPassCount === TABLE_LOOKUP_TESTS.length;
  const overallPass = blockExists && directOk && allCPassed;
  console.log(`OVERALL: ${overallPass ? 'PASS' : 'FAIL'}`);

  // JSON output
  console.log();
  console.log(JSON.stringify({
    probe: 'phase231-030100-verify',
    generatedAt: new Date().toISOString(),
    testA_blockExists: blockExists,
    testB_directExec: {
      visited: directVisited,
      termination: directResult.termination,
      steps: directResult.steps,
      missingBlocks: directResult.missingBlocks,
      passed: directOk,
    },
    testC_tableLookup: {
      total: TABLE_LOOKUP_TESTS.length,
      passed: tableLookupPassCount,
      results: tableLookupResults,
    },
    testD_fullFunction: {
      termination: fullResult.termination,
      steps: fullResult.steps,
      a: fullResult.registersAfter.a,
      d0058e: fullResult.d0058eAfter,
      visitedBlocks: fullResult.visitedBlocks,
      missingBlocks: fullResult.missingBlocks,
    },
    overall: overallPass,
  }, null, 2));

  process.exitCode = overallPass ? 0 : 1;
}

main();
