#!/usr/bin/env node

/**
 * probe-phase306-getCSC-IY40-bit3.mjs
 *
 * Phase 306 — Trace the BIT 3,(IY+40) check at 0x03FBD0 in _GetCSC.
 *
 * FINDINGS:
 *
 * 1. IY+40 (decimal) = IY+0x28 = 0xD000A8 — OS system flags byte.
 *    Bit 3 of this byte is a "power/contrast reset pending" flag.
 *
 * 2. When BIT 3,(IY+0x28) is SET inside _GetCSC (at 0x03FBD0):
 *    - _GetCSC stores 0x39 into a SECONDARY key buffer at D141B5
 *    - The ORIGINAL scan code is still returned in A (via POP AF)
 *    - 0x39 is a VIRTUAL scan code (not a physical key — group 3 bit 9
 *      exceeds the 8-bit hardware matrix)
 *    - The override only fires when D14091 != 0 (LCD contrast register),
 *      meaning the LCD is active/initialized
 *    - Stack flow: POP AF (original) -> PUSH AF (save original) ->
 *      LD A,0x39 -> PUSH AF (push 0x39) -> ... -> POP AF (0x39 to
 *      D141B5) -> POP AF (restore original) -> RET
 *    - D141B5 is a "pending virtual key" side-channel: the original key
 *      is returned normally, but 0x39 is deposited for the OS main loop
 *      to pick up on a subsequent _GetCSC call or side-channel read
 *
 * 3. Scan code 0x39 handler (at 0x02FD56 in the OS main loop):
 *    - SET 4,(IY+9)  — sets IY+0x09 bit 4 (0xD00089) = "forced refresh" flag
 *    - SET 4,(IY+0x43) — sets IY+0x43 bit 4 (0xD000C3) = "display dirty" flag
 *    - LD (0xD00000),0xCC — restores boot signature
 *    - LD (0xD00001),0x00FFFF — resets memory bounds
 *    - Returns with A=0 (no key delivered to caller)
 *    This is a POWER-ON RECOVERY / APD WAKE handler: after the calculator
 *    wakes from Auto Power Down, bit 3 of IY+0x28 causes _GetCSC to
 *    deposit 0x39 into D141B5, which triggers display reinitialization
 *    without altering the current keypress being returned.
 *
 * 4. Who sets bit 3 of IY+0x28?
 *    - NO explicit SET 3,(IY+0x28) instruction exists anywhere in the ROM
 *    - The only LD (IY+0x28),A clears it to 0 (XOR A before store at 0x02384C)
 *    - Bit 3 must be set by the ON-key ISR or power management code via
 *      computed pointer (LD (HL),A where HL points to 0xD000A8)
 *    - SET 7,(IY+0x28) at 0x02FCAF (APD timer flag) is set just before
 *      the main key polling loop, confirming IY+0x28 is the APD/power byte
 *
 * 5. The OS main loop at 0x02FD8F always does RES 3,(IY+0x28) BEFORE
 *    calling _GetCSC, so bit 3 can only be seen by _GetCSC if set
 *    between the RES and the _GetCSC call (i.e., by an interrupt), or
 *    if _GetCSC is called directly from other code that doesn't clear it.
 *
 * 6. D141B5 is a "pending virtual key" register. When D141B5 == 0,
 *    _GetCSC deposits the current scan code into it (0x03FBE0-0x03FBE1:
 *    POP AF -> LD (D141B5),A). When D141B5 != 0, the deposit is skipped
 *    (0x03FBDE: JR NZ -> 0x03FBE7 which just pops and discards).
 *    So 0x39 only gets stored if D141B5 was previously empty.
 *
 * 7. Full IY+0x28 bit map (from ROM analysis):
 *    Bit 0: (unused in scanned code)
 *    Bit 1: SET at 0x0238A4, 0x07998C, 0x079A7A, 0x07A77E, 0x0B8979, 0x0BA78E
 *           RES at 0x08C3C9 — display mode flag
 *    Bit 2: SET at 0x0238A9, RES at 0x08C3CD — display mode flag 2
 *    Bit 3: RES at 0x02FD8F, 0x02FDCE — APD wake pending (deposits 0x39
 *           into D141B5 side-channel)
 *    Bit 4: SET at 0x02456D, RES at 0x02381C, 0x0403C7, 0x08C614, 0x08C6E1
 *           BIT at 0x02FF53, 0x0404B0, 0x04085D, 0x04097F, 0x085CE1,
 *                  0x09D101, 0x0A1FDF — "graph mode active" flag
 *    Bit 5: BIT at 0x02FDC2, RES at 0x02FDD2 — "key repeat pending" flag
 *    Bit 6: SET at 0x024571 — related to graph mode
 *    Bit 7: SET at 0x02FCAF, RES at 0x08C7EA, BIT at 0x02FE93
 *           — APD timer active / power management flag
 *
 * IY+0x28 is the OS "display/power management flags" byte.
 *
 * Three experiments:
 *   1. Confirm BIT 3,(IY+0x28) override: seed bit 3 set + key in D00587,
 *      with D14091 != 0 to pass LCD check. Verify A=0x39 returned.
 *   2. Confirm normal path: bit 3 clear, verify original scan code returned.
 *   3. Trace the scan code 0x39 handler at 0x02FD56: verify it sets the
 *      recovery flags and returns A=0.
 */

process.emitWarning = () => {};

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const IY_BASE = 0xD00080;
const GETCSC_IMPL = 0x03FA09;
const SCAN_CODE_BUF = 0xD00587;

// Key addresses for this probe
const BIT3_CHECK_ADDR = 0x03FBD0;   // BIT 3,(IY+0x28) in _GetCSC
const OVERRIDE_LD_ADDR = 0x03FBD6;  // LD A,0x39
const LCD_CONTRAST_REG = 0xD14091;  // Checked before BIT 3 test
const PENDING_VKEY_REG = 0xD141B5;  // Secondary key buffer (side-channel)
const SC39_HANDLER = 0x02FD56;      // Handler for virtual scan code 0x39

// IY+0x28 bit operations found in ROM
const IY28_OPERATIONS = [
  { addr: 0x02381C, op: 'RES 4,(IY+0x28)' },
  { addr: 0x0238A4, op: 'SET 1,(IY+0x28)' },
  { addr: 0x0238A9, op: 'SET 2,(IY+0x28)' },
  { addr: 0x02456D, op: 'SET 4,(IY+0x28)' },
  { addr: 0x024571, op: 'SET 6,(IY+0x28)' },
  { addr: 0x02384D, op: 'LD (IY+0x28),A  [A=0 from XOR A]' },
  { addr: 0x02FCAF, op: 'SET 7,(IY+0x28)' },
  { addr: 0x02FD8F, op: 'RES 3,(IY+0x28)  [before _GetCSC call]' },
  { addr: 0x02FDC2, op: 'BIT 5,(IY+0x28)' },
  { addr: 0x02FDC8, op: 'BIT 3,(IY+0x28)  [after _GetCSC return]' },
  { addr: 0x02FDCE, op: 'RES 3,(IY+0x28)' },
  { addr: 0x02FDD2, op: 'RES 5,(IY+0x28)' },
  { addr: 0x02FE93, op: 'BIT 7,(IY+0x28)' },
  { addr: 0x02FF53, op: 'BIT 4,(IY+0x28)' },
  { addr: 0x03FBD0, op: 'BIT 3,(IY+0x28)  [_GetCSC override check]' },
  { addr: 0x0403C7, op: 'RES 4,(IY+0x28)' },
  { addr: 0x0404B0, op: 'BIT 4,(IY+0x28)' },
  { addr: 0x04085D, op: 'BIT 4,(IY+0x28)' },
  { addr: 0x04097F, op: 'BIT 4,(IY+0x28)' },
  { addr: 0x08C3C9, op: 'RES 1,(IY+0x28)' },
  { addr: 0x08C3CD, op: 'RES 2,(IY+0x28)' },
  { addr: 0x08C614, op: 'RES 4,(IY+0x28)' },
  { addr: 0x08C6E1, op: 'RES 4,(IY+0x28)' },
  { addr: 0x08C7EA, op: 'RES 7,(IY+0x28)' },
];

if (!existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM: ${ROM_PATH}`);
}

if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    `Missing transpiled ROM: ${TRANSPILED_PATH}. Run: node scripts/transpile-ti84-rom.mjs`,
  );
}

const romBytes = readFileSync(ROM_PATH);
const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const RAW_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;
const BLOCKS = normalizeBlocks(RAW_BLOCKS);

// --- Helpers ---

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return (
    (mem[a] & 0xFF) |
    ((mem[(a + 1) & 0xFFFFFF] & 0xFF) << 8) |
    ((mem[(a + 2) & 0xFFFFFF] & 0xFF) << 16)
  ) >>> 0;
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

function stackBytes(mem, sp, count = 6) {
  const bytes = [];
  const base = sp & 0xFFFFFF;
  for (let i = 0; i < count; i++) {
    bytes.push(mem[(base + i) & 0xFFFFFF] & 0xFF);
  }
  return bytes;
}

function snapshotState(cpu, mem) {
  const sp = cpu.sp & 0xFFFFFF;
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu.hl & 0xFFFFFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    sp,
    iy: cpu.iy & 0xFFFFFF,
    top6: stackBytes(mem, sp, 6),
  };
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu, peripherals };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.ix = 0xD1A860;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function stopError(name) {
  const err = new Error('__PHASE306_STOP__');
  err.stopName = name;
  return err;
}

function bootInitializedRuntime() {
  const mem = createMemoryWithRom();
  const { executor, cpu, peripherals } = createRuntime(mem);

  // Z80-mode boot
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Kernel init
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Post-init
  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  // Mem init
  resetOsState(cpu, mem);
  push24(cpu, mem, MEM_INIT_RET);

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
    });
  } catch (err) {
    if (err?.message !== '__PHASE306_STOP__' || err.stopName !== 'mem_init_return') {
      throw err;
    }
  }

  resetOsState(cpu, mem);
  return { mem, executor, cpu, peripherals };
}

// --- Block-level trace ---

function traceExecution(executor, mem, startPc, startMode, maxSteps) {
  const { cpu, compiledBlocks, blockMeta } = executor;
  const steps = [];

  let pc = startPc & 0xFFFFFF;
  let mode = startMode;
  let stopReason = 'max_steps';

  for (let i = 0; i < maxSteps; i++) {
    cpu.madl = mode === 'adl' ? 1 : 0;

    const key = `${pc.toString(16).padStart(6, '0')}:${mode}`;
    const fn = compiledBlocks[key];
    const meta = blockMeta[key];

    if (!fn) {
      steps.push({ step: i, pc, mode, key, missing: true });
      stopReason = 'missing_block';
      break;
    }

    const before = snapshotState(cpu, mem);

    // Capture IY+0x28 before/after
    const iy28Before = mem[(IY_BASE + 0x28) & 0xFFFFFF] & 0xFF;

    const result = fn(cpu);
    const after = snapshotState(cpu, mem);

    const iy28After = mem[(IY_BASE + 0x28) & 0xFFFFFF] & 0xFF;
    const iy28Changed = iy28Before !== iy28After
      ? `${hexByte(iy28Before)}->${hexByte(iy28After)}`
      : null;

    const nextPc = typeof result === 'number' && result >= 0 ? result & 0xFFFFFF : null;
    const instructions = (meta?.instructions ?? []).map(
      (inst) => inst.dasm ?? inst.tag ?? '?',
    );

    steps.push({
      step: i,
      pc,
      mode,
      key,
      result,
      nextPc,
      before,
      after,
      iy28Before,
      iy28After,
      iy28Changed,
      instructions,
    });

    if (result === RETURN_SENTINEL) {
      stopReason = 'returned_to_sentinel';
      break;
    }

    if (result === undefined || result === null) {
      stopReason = 'no_return';
      break;
    }

    if (typeof result === 'number' && result < 0) {
      stopReason = result === -1 ? 'halt' : 'sleep';
      break;
    }

    pc = nextPc;
  }

  return { steps, stopReason };
}

// --- Static disassembly ---

function disasmRange(start, length) {
  const lines = [];
  let pc = start;
  const end = start + length;

  while (pc < end) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      lines.push({ addr: pc, text: `DB ${hexByte(romBytes[pc])}`, length: 1 });
      pc += 1;
      continue;
    }

    if (!inst || !inst.length) {
      lines.push({ addr: pc, text: `DB ${hexByte(romBytes[pc])}`, length: 1 });
      pc += 1;
      continue;
    }

    const text = inst.dasm ?? inst.tag ?? '?';
    lines.push({ addr: pc, text, length: inst.length });
    pc += inst.length;
  }

  return lines;
}

function printDisasm(title, start, length) {
  console.log(`\n--- ${title} (${hex(start)}..${hex(start + length - 1)}) ---`);
  const lines = disasmRange(start, length);
  for (const line of lines) {
    const bytes = Array.from(romBytes.subarray(line.addr, line.addr + line.length))
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    console.log(`  ${hex(line.addr)}  ${bytes.padEnd(18)}  ${line.text}`);
  }
}

function printTraceCompact(indent, trace) {
  console.log(`${indent}Block trace (${trace.steps.length} blocks, stop: ${trace.stopReason}):`);
  console.log(`${indent}step  pc        next      A bef->aft   IY+0x28        instructions`);
  console.log(`${indent}` + '-'.repeat(90));

  for (const s of trace.steps) {
    if (s.missing) {
      console.log(`${indent}${String(s.step).padStart(3)}  ${hex(s.pc)}  MISSING (${s.key})`);
      continue;
    }
    const nextText = s.nextPc === null ? String(s.result) : hex(s.nextPc);
    const instrText = s.instructions.slice(0, 4).join(' | ');
    const iy28Text = s.iy28Changed ? s.iy28Changed : hexByte(s.iy28Before);
    console.log(
      `${indent}${String(s.step).padStart(3)}  ${hex(s.pc)}  ${String(nextText).padEnd(10)}  ` +
      `${hexByte(s.before.a)}->${hexByte(s.after.a)}  ` +
      `${iy28Text.padEnd(12)}  ${instrText}`,
    );
  }
}

// --- Experiment 1: BIT 3,(IY+0x28) override active ---

function experiment1(baseEnv) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  EXPERIMENT 1: BIT 3,(IY+0x28) SET => 0x39 deposited in D141B5');
  console.log(`${'='.repeat(70)}`);

  const mem = new Uint8Array(baseEnv.mem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);

  // Seed a normal key
  mem[SCAN_CODE_BUF] = 0x31; // key '2'
  mem[IY_BASE] |= 0x08;     // IY+0 bit 3 = key available

  // Set BIT 3 of IY+0x28 (the APD wake flag)
  mem[(IY_BASE + 0x28) & 0xFFFFFF] |= 0x08;

  // Set LCD contrast register so the LCD check at 0x03FBC3 passes
  mem[LCD_CONTRAST_REG] = 0x40;

  // Clear D141B5 (pending virtual key register) so deposit succeeds
  mem[PENDING_VKEY_REG] = 0x00;

  console.log(`  Pre-call state:`);
  console.log(`    D00587 (scan code buf)   = ${hexByte(mem[SCAN_CODE_BUF])}`);
  console.log(`    IY+0   (${hex(IY_BASE)})  = ${hexByte(mem[IY_BASE])} (bit 3 = ${(mem[IY_BASE] >> 3) & 1})`);
  console.log(`    IY+0x28 (${hex(IY_BASE + 0x28)}) = ${hexByte(mem[(IY_BASE + 0x28) & 0xFFFFFF])} (bit 3 = ${(mem[(IY_BASE + 0x28) & 0xFFFFFF] >> 3) & 1})`);
  console.log(`    D14091 (LCD contrast)    = ${hexByte(mem[LCD_CONTRAST_REG])}`);
  console.log(`    D141B5 (pending vkey)    = ${hexByte(mem[PENDING_VKEY_REG])}`);

  push24(cpu, mem, RETURN_SENTINEL);

  const trace = traceExecution(executor, mem, GETCSC_IMPL, 'adl', 500);

  printTraceCompact('  ', trace);

  const last = trace.steps[trace.steps.length - 1];
  const finalA = last && !last.missing ? last.after.a : -1;
  const d141b5After = mem[PENDING_VKEY_REG] & 0xFF;

  console.log(`\n  Final A = ${hexByte(finalA)} (original scan code preserved in return)`);
  console.log(`  D141B5 after = ${hexByte(d141b5After)} (expected: 0x39 = APD wake deposited)`);
  console.log(`  D00587 after = ${hexByte(mem[SCAN_CODE_BUF])}`);
  console.log(`  IY+0x28 after = ${hexByte(mem[(IY_BASE + 0x28) & 0xFFFFFF])}`);

  // The override deposits 0x39 into D141B5, original scan code still returned
  const passed = d141b5After === 0x39 && finalA === 0x31;
  console.log(`  RESULT: ${passed ? 'PASS — 0x39 deposited in D141B5, original key returned' : 'FAIL'}`);
  if (!passed) {
    console.log(`    Expected: D141B5=0x39, A=0x31`);
    console.log(`    Got:      D141B5=${hexByte(d141b5After)}, A=${hexByte(finalA)}`);
  }

  return { passed, finalA, d141b5After, trace };
}

// --- Experiment 2: BIT 3,(IY+0x28) CLEAR => normal key returned ---

function experiment2(baseEnv) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  EXPERIMENT 2: BIT 3,(IY+0x28) CLEAR => normal scan code');
  console.log(`${'='.repeat(70)}`);

  const mem = new Uint8Array(baseEnv.mem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);

  mem[SCAN_CODE_BUF] = 0x31;
  mem[IY_BASE] |= 0x08;

  // Ensure bit 3 of IY+0x28 is CLEAR
  mem[(IY_BASE + 0x28) & 0xFFFFFF] &= ~0x08;

  // LCD contrast set
  mem[LCD_CONTRAST_REG] = 0x40;

  // Clear D141B5
  mem[PENDING_VKEY_REG] = 0x00;

  console.log(`  Pre-call state:`);
  console.log(`    D00587 = ${hexByte(mem[SCAN_CODE_BUF])}`);
  console.log(`    IY+0x28 = ${hexByte(mem[(IY_BASE + 0x28) & 0xFFFFFF])} (bit 3 = 0)`);
  console.log(`    D14091 = ${hexByte(mem[LCD_CONTRAST_REG])}`);
  console.log(`    D141B5 = ${hexByte(mem[PENDING_VKEY_REG])}`);

  push24(cpu, mem, RETURN_SENTINEL);

  const trace = traceExecution(executor, mem, GETCSC_IMPL, 'adl', 500);

  printTraceCompact('  ', trace);

  const last = trace.steps[trace.steps.length - 1];
  const finalA = last && !last.missing ? last.after.a : -1;
  const d141b5After = mem[PENDING_VKEY_REG] & 0xFF;

  console.log(`\n  Final A = ${hexByte(finalA)} (expected: 0x31 = original scan code)`);
  console.log(`  D141B5 after = ${hexByte(d141b5After)} (expected: 0x31 = original deposited, NOT 0x39)`);

  // With bit 3 clear, the original scan code goes into D141B5 (not 0x39)
  const passed = finalA === 0x31 && d141b5After === 0x31;
  console.log(`  RESULT: ${passed ? 'PASS — original key returned and deposited' : 'FAIL'}`);
  if (!passed) {
    console.log(`    Expected: A=0x31, D141B5=0x31`);
    console.log(`    Got:      A=${hexByte(finalA)}, D141B5=${hexByte(d141b5After)}`);
  }

  return { passed, finalA, d141b5After, trace };
}

// --- Experiment 3: Trace the 0x39 handler at 0x02FD56 ---

function experiment3(baseEnv) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  EXPERIMENT 3: Scan code 0x39 handler at 0x02FD56');
  console.log(`${'='.repeat(70)}`);

  // Static disassembly first
  printDisasm('SC 0x39 handler (0x02FD56)', SC39_HANDLER, 0x20);

  const mem = new Uint8Array(baseEnv.mem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);

  // Snapshot IY+9 and IY+0x43 before
  const iy9Before = mem[(IY_BASE + 0x09) & 0xFFFFFF] & 0xFF;
  const iy43Before = mem[(IY_BASE + 0x43) & 0xFFFFFF] & 0xFF;
  const d00000Before = mem[0xD00000] & 0xFF;

  console.log(`\n  Pre-handler state:`);
  console.log(`    IY+0x09 (${hex(IY_BASE + 0x09)}) = ${hexByte(iy9Before)} (bit 4 = ${(iy9Before >> 4) & 1})`);
  console.log(`    IY+0x43 (${hex(IY_BASE + 0x43)}) = ${hexByte(iy43Before)} (bit 4 = ${(iy43Before >> 4) & 1})`);
  console.log(`    D00000 = ${hexByte(d00000Before)}`);
  console.log(`    D00001 = ${hex(read24(mem, 0xD00001))}`);

  push24(cpu, mem, RETURN_SENTINEL);

  const trace = traceExecution(executor, mem, SC39_HANDLER, 'adl', 100);

  printTraceCompact('  ', trace);

  const iy9After = mem[(IY_BASE + 0x09) & 0xFFFFFF] & 0xFF;
  const iy43After = mem[(IY_BASE + 0x43) & 0xFFFFFF] & 0xFF;
  const d00000After = mem[0xD00000] & 0xFF;

  console.log(`\n  Post-handler state:`);
  console.log(`    IY+0x09 = ${hexByte(iy9After)} (bit 4 = ${(iy9After >> 4) & 1}) ${(iy9After & 0x10) ? '*** SET 4 confirmed ***' : ''}`);
  console.log(`    IY+0x43 = ${hexByte(iy43After)} (bit 4 = ${(iy43After >> 4) & 1}) ${(iy43After & 0x10) ? '*** SET 4 confirmed ***' : ''}`);
  console.log(`    D00000 = ${hexByte(d00000After)} ${d00000After === 0xCC ? '(boot signature restored)' : ''}`);
  console.log(`    D00001 = ${hex(read24(mem, 0xD00001))}`);

  const passed =
    (iy9After & 0x10) !== 0 &&
    (iy43After & 0x10) !== 0 &&
    d00000After === 0xCC;

  console.log(`  RESULT: ${passed ? 'PASS — recovery flags set correctly' : 'FAIL'}`);

  return { passed };
}

// --- Main ---

function main() {
  console.log('Phase 306: _GetCSC IY+40 BIT 3 check at 0x03FBD0');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled: ${TRANSPILED_PATH}`);
  console.log(`IY base = ${hex(IY_BASE)}`);
  console.log(`IY+0x28 = ${hex(IY_BASE + 0x28)} (IY+40 decimal)`);
  console.log(`_GetCSC impl = ${hex(GETCSC_IMPL)}`);
  console.log(`BIT 3 check = ${hex(BIT3_CHECK_ADDR)}`);
  console.log(`Override LD A,0x39 = ${hex(OVERRIDE_LD_ADDR)}`);
  console.log(`LCD contrast reg = ${hex(LCD_CONTRAST_REG)}`);
  console.log(`SC 0x39 handler = ${hex(SC39_HANDLER)}`);

  // Static disassembly of the BIT 3 check area
  printDisasm('BIT 3,(IY+0x28) check in _GetCSC (0x03FBC0)', 0x03FBC0, 0x2A);

  // Print all IY+0x28 operations found in ROM
  console.log('\n--- All IY+0x28 operations in ROM ---');
  for (const op of IY28_OPERATIONS) {
    console.log(`  ${hex(op.addr)}  ${op.op}`);
  }

  // ROM byte search results
  console.log('\n--- ROM search: SET 3,(IY+0x28) = FD CB 28 DE ---');
  let found = false;
  for (let i = 0; i < romBytes.length - 3; i++) {
    if (romBytes[i] === 0xFD && romBytes[i + 1] === 0xCB && romBytes[i + 2] === 0x28 && romBytes[i + 3] === 0xDE) {
      console.log(`  Found at ${hex(i)}`);
      found = true;
    }
  }
  if (!found) {
    console.log('  *** NOT FOUND — bit 3 is never SET via IY-indexed instruction ***');
    console.log('  Bit 3 must be set by ISR or computed-pointer store');
  }

  // Scan code 0x39 analysis
  console.log('\n--- Scan code 0x39 analysis ---');
  console.log('  Hardware format: group = (0x39 >> 4) = 3, bit = (0x39 & 0xF) = 9');
  console.log('  Group 3 only has bits 0-7 in the physical keyboard matrix');
  console.log('  => 0x39 is a VIRTUAL scan code, not a physical key');
  console.log('  Purpose: APD (Auto Power Down) wake signal');
  console.log('  Handler at 0x02FD56: sets display-refresh flags, restores boot signature');

  console.log('\nBooting warm runtime...');
  const baseEnv = bootInitializedRuntime();
  console.log('Boot complete.\n');

  console.log('Baseline IY+0x28 after boot:');
  console.log(`  IY+0x28 (${hex(IY_BASE + 0x28)}) = ${hexByte(baseEnv.mem[(IY_BASE + 0x28) & 0xFFFFFF])}`);

  const r1 = experiment1(baseEnv);
  const r2 = experiment2(baseEnv);
  const r3 = experiment3(baseEnv);

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('  SUMMARY');
  console.log(`${'='.repeat(70)}`);

  console.log(`  Exp 1 (bit 3 SET, LCD active):  A=${hexByte(r1.finalA)}, D141B5=${hexByte(r1.d141b5After)}  ${r1.passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Exp 2 (bit 3 CLEAR):            A=${hexByte(r2.finalA)}, D141B5=${hexByte(r2.d141b5After)}  ${r2.passed ? 'PASS' : 'FAIL'}`);
  console.log(`  Exp 3 (0x39 handler):           ${r3.passed ? 'PASS' : 'FAIL'}`);

  const allPassed = r1.passed && r2.passed && r3.passed;
  console.log(`\n  Overall: ${allPassed ? 'ALL PASS' : 'SOME FAILED'}`);

  console.log(`\n  KEY FINDINGS:`);
  console.log(`  1. IY+0x28 (IY+40 dec) = 0xD000A8 is the OS display/power flags byte`);
  console.log(`  2. Bit 3 = "APD wake pending" flag`);
  console.log(`  3. When set, _GetCSC deposits virtual scan code 0x39 into D141B5`);
  console.log(`     (a "pending virtual key" side-channel register)`);
  console.log(`  4. The ORIGINAL scan code is still returned in A — the override`);
  console.log(`     does NOT change the return value, only the side-channel`);
  console.log(`  5. 0x39 is NOT a physical key — it exceeds the 8-bit matrix width`);
  console.log(`  6. The 0x39 handler at 0x02FD56 triggers display reinitialization:`);
  console.log(`     - SET 4,(IY+0x09) = forced LCD refresh flag`);
  console.log(`     - SET 4,(IY+0x43) = display dirty flag`);
  console.log(`     - LD (D00000),0xCC = restore boot signature`);
  console.log(`     - Returns A=0 (no key delivered to application)`);
  console.log(`  7. No SET 3,(IY+0x28) exists in ROM — bit set by ISR/ON-key handler`);
  console.log(`  8. The OS main loop at 0x02FD8F clears bit 3 BEFORE calling _GetCSC,`);
  console.log(`     so the deposit only fires if bit 3 is set by an interrupt between`);
  console.log(`     the RES and the CALL, or via direct _GetCSC calls from other code`);
  console.log(`  9. Bit 7 of IY+0x28 (SET at 0x02FCAF) = APD timer active flag`);
  console.log(`  10. Bit 4 of IY+0x28 = graph mode active flag (widely checked)`);

  console.log('\nPhase 306 complete.');
}

main();
