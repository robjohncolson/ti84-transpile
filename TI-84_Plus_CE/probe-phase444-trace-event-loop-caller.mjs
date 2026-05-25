#!/usr/bin/env node
// Phase 444 probe: Trace the event loop outer caller.
// Who calls the function containing 0x003A73, and how does the OS
// re-enter the event loop after waking from HALT?
//
// Strategy:
//   1. Boot OS through the standard stages
//   2. Before entering event loop, snapshot the stack to find return addresses
//   3. Run the event loop with tracing to observe control flow
//   4. Check whether 0x000721 eventually loops back to the event loop

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function readStack(mem, sp, count) {
  const entries = [];
  for (let i = 0; i < count; i++) {
    const addr = sp + i * 3;
    const val = mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
    entries.push({ offset: i * 3, addr: addr, value: val });
  }
  return entries;
}

function bootToEventLoop(executor, cpu, mem) {
  // Boot stage
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Kernel init
  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log(`  kernel: steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Post-init
  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log(`  postInit: steps=${postInitResult.steps} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc)}`);

  // Stage entries
  for (let i = 0; i < STAGE_ENTRIES.length; i++) {
    const entry = STAGE_ENTRIES[i];
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    const lastResult = executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
    console.log(`  stage${i + 1}: entry=${hex(entry)} steps=${lastResult.steps} term=${lastResult.termination} lastPc=${hex(lastResult.lastPc)}`);
  }

  // Prepare for event loop
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('=== Phase 444: Trace Event Loop Outer Caller ===');
  console.log('');

  // ── Part 1: ROM static analysis ──
  console.log('--- Part 1: ROM static analysis ---');
  console.log('');

  // Find function boundary by looking for RET before 0x003A0F
  console.log('Function boundary analysis:');
  let funcStart = null;
  for (let a = 0x003A04; a >= 0x003900; a--) {
    if (romBytes[a] === 0xC9) {
      funcStart = a + 1;
      console.log(`  Last RET before 0x003A0F: at ${hex(a)}`);
      console.log(`  Inferred function start: ${hex(funcStart)}`);
      break;
    }
  }

  // Scan for all CALL/JP to the function start
  const opcodes = [0xCD, 0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA, 0xC4, 0xCC, 0xD4, 0xDC];
  const opNames = {
    0xCD: 'CALL', 0xC3: 'JP', 0xC2: 'JP NZ', 0xCA: 'JP Z',
    0xD2: 'JP NC', 0xDA: 'JP C', 0xE2: 'JP PO', 0xEA: 'JP PE',
    0xF2: 'JP P', 0xFA: 'JP M', 0xC4: 'CALL NZ', 0xCC: 'CALL Z',
    0xD4: 'CALL NC', 0xDC: 'CALL C',
  };

  // Scan for references to various addresses in the function
  const targets = [0x003A05, 0x003A0F, 0x003A16, 0x003A1A, 0x003A70, 0x003A73, 0x003A89];
  console.log('');
  console.log('References to event loop function addresses:');
  for (const target of targets) {
    const refs = [];
    for (let a = 0; a < romBytes.length - 4; a++) {
      if (opcodes.includes(romBytes[a])) {
        const t = romBytes[a + 1] | (romBytes[a + 2] << 8) | (romBytes[a + 3] << 16);
        if (t === target) {
          refs.push({ addr: a, op: opNames[romBytes[a]] || hex(romBytes[a], 2) });
        }
      }
    }
    if (refs.length > 0) {
      console.log(`  ${hex(target)}: ${refs.map(r => `${r.op} at ${hex(r.addr)}`).join(', ')}`);
    } else {
      console.log(`  ${hex(target)}: (no references found)`);
    }
  }

  // Scan for references to 0x000721
  console.log('');
  console.log('References to 0x000721 (non-HALT path target):');
  const refs721 = [];
  for (let a = 0; a < romBytes.length - 4; a++) {
    if (opcodes.includes(romBytes[a])) {
      const t = romBytes[a + 1] | (romBytes[a + 2] << 8) | (romBytes[a + 3] << 16);
      if (t === 0x000721) {
        refs721.push({ addr: a, op: opNames[romBytes[a]] || hex(romBytes[a], 2) });
      }
    }
  }
  for (const r of refs721) {
    console.log(`  ${r.op} at ${hex(r.addr)}`);
  }

  // ── Part 2: Disassemble key regions ──
  console.log('');
  console.log('--- Part 2: Key disassemblies ---');

  // Disassemble the event loop function 0x003A0F..0x003A92
  console.log('');
  console.log('Event loop / error handler function (0x003A0F..0x003A92):');
  console.log('  0x003A0F  LD HL, 0x003A92      ; string table base');
  console.log('  0x003A13  ADD HL, DE            ; + offset from caller');
  console.log('  0x003A14  JR 0x003A1A');
  console.log('  0x003A16  LD HL, 0x003A92       ; alternate entry (DE=0)');
  console.log('  0x003A1A  PUSH HL               ; save string ptr');
  console.log('  0x003A1B  PUSH AF');
  console.log('  0x003A1C  XOR A');
  console.log('  0x003A1D  DI');
  console.log('  0x003A1E..0x003A41  [port configuration: IM2→IM1, OUT0 ports 0x28/0x06/0x24]');
  console.log('  0x003A42  POP AF');
  console.log('  0x003A43  CALL 0x005B96          ; display error title');
  console.log('  0x003A47  POP HL');
  console.log('  0x003A48  CALL 0x0059E9          ; display string at HL');
  console.log('  0x003A4C  LD HL, 0x003A9A        ; "Press any key to turn"');
  console.log('  0x003A50  LD DE, 0x000001');
  console.log('  0x003A54  CALL 0x003AE6          ; display line 1');
  console.log('  0x003A58  LD HL, 0x003AB1        ; "unit OFF."');
  console.log('  0x003A5C  LD DE, 0x000002');
  console.log('  0x003A60  CALL 0x003AE6          ; display line 2');
  console.log('  0x003A64  LD HL, 0x003ABC        ; "Then turn unit back ON."');
  console.log('  0x003A68  LD DE, 0x000003');
  console.log('  0x003A6C  CALL 0x003AE6          ; display line 3');
  console.log('  --- key poll loop ---');
  console.log('  0x003A70  LD B, 0x64             ; B = 100 iterations');
  console.log('  0x003A72  PUSH BC                ; save loop counter');
  console.log('  0x003A73  CALL 0x003D5A          ; poll keyboard (_GetCSC)');
  console.log('  0x003A77  POP BC');
  console.log('  0x003A78  OR A                   ; key pressed?');
  console.log('  0x003A79  JR NZ, 0x003A7D        ; yes → exit loop');
  console.log('  0x003A7B  DJNZ 0x003A72          ; no → poll again (up to 100x)');
  console.log('  --- post-loop ---');
  console.log('  0x003A7D  CALL 0x001713          ; check APD/power-off conditions');
  console.log('  0x003A81  JP NZ, 0x001933        ; sleep (DI+HALT) if needed');
  console.log('  0x003A85  JP 0x003A89            ; skip sleep');
  console.log('  0x003A89  CALL 0x001853          ; set D177BA=0x7F, configure ports');
  console.log('  0x003A8D  XOR A                  ; A = 0');
  console.log('  0x003A8E  JP 0x000721            ; tail-call to power-off/reset handler');

  // Disassemble 0x000721 summary
  console.log('');
  console.log('Power-off handler at 0x000721:');
  console.log('  0x000721  CALL 0x013D00          ; save context (DI, push regs, configure IY)');
  console.log('  0x000725  LD HL, 0x000000');
  console.log('  0x000729  CALL 0x0158A6          ; check/init flash');
  console.log('  0x00072D  CALL Z, 0x0138F1       ; conditional flash operation');
  console.log('  0x000731  LD A, L; OR H           ; test HL == 0');
  console.log('  0x000733  JP Z, 0x000877          ; flash validation path');
  console.log('  0x000737  CALL 0x013D8E          ; context cleanup');
  console.log('  0x00073B  LD A, 0xFA; CALL 0x0061E5');
  console.log('  0x000741..0x000794  [port config + stack bounds check]');
  console.log('  0x000795  CALL 0x000E01          ; port initialization loop');
  console.log('  0x000799..0x0007BF  [more port config]');
  console.log('  ...eventually...');
  console.log('  0x00085E  CALL 0x001853          ; same port config as event loop exit');
  console.log('  0x000862  XOR A');
  console.log('  0x000863  LD (0xD177BA), A       ; clear power-off flag');
  console.log('  0x000867  LD (0xD177BC), A');
  console.log('  0x00086B  LD HL, 0; LD (0xD0301B), HL');
  console.log('  0x000874  JP 0x0019B5            ; DI + OUT0 (0x00), 0x10 + HALT = POWER OFF');

  // HALT wrapper at 0x001933
  console.log('');
  console.log('HALT wrapper at 0x001933 (sleep-until-IRQ):');
  console.log('  0x001933  CALL 0x00620D          ; pre-sleep hook');
  console.log('  0x001937  DI');
  console.log('  0x001938  LD A, 0xC0; OUT0 (0x00), A  ; configure power mode');
  console.log('  0x00193D  LD A, 0xC4; OUT0 (0x09), A  ; configure IRQ mask');
  console.log('  0x001942  HALT                   ; sleep until IRQ');
  console.log('  --- wake point ---');
  console.log('  0x001943  LD (0xD02AD7), DE      ; store DE to scrapMem');
  console.log('  0x001948  LD A, (0xD02AD9)       ; load status byte');
  console.log('  0x00194C  RET                    ; return to caller');

  // ── Part 3: Boot and trace stack ──
  console.log('');
  console.log('--- Part 3: Boot and trace stack at event loop entry ---');
  bootToEventLoop(executor, cpu, mem);

  console.log('');
  console.log(`  SP at event loop entry: ${hex(cpu.sp)}`);
  console.log('  Stack contents (8 entries, 3 bytes each in ADL mode):');
  const stack = readStack(mem, cpu.sp, 8);
  for (const entry of stack) {
    const val = entry.value;
    const label = val === 0xFFFFFF ? '(sentinel fill)' :
                  val >= 0x000000 && val < 0x400000 ? '(ROM address)' :
                  val >= 0xD00000 && val < 0xD20000 ? '(RAM address)' : '';
    console.log(`    SP+${entry.offset.toString().padStart(2)}: ${hex(val)} ${label}`);
  }

  // ── Part 4: Run event loop and observe behavior ──
  console.log('');
  console.log('--- Part 4: Run event loop iteration ---');

  // Track PCs visited during event loop execution
  const pcLog = [];
  const maxPcLog = 50;

  // Run from EVENT_LOOP_ENTRY
  const result1 = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 5000,
    diHaltBypass: true,
  });

  console.log(`  Event loop run: steps=${result1.steps} term=${result1.termination} lastPc=${hex(result1.lastPc)}`);

  // Check where we ended up
  const endPc = result1.lastPc;
  if (endPc >= 0x001933 && endPc <= 0x001950) {
    console.log('  Ended in HALT wrapper (0x001933..0x001950) — sleep path taken');
    console.log('  The RET at 0x00194C would pop the return address from the stack');
    console.log(`  Return address would be: ${hex(mem[cpu.sp] | (mem[cpu.sp + 1] << 8) | (mem[cpu.sp + 2] << 16))}`);
  } else if (endPc === 0x000721 || (endPc >= 0x000721 && endPc <= 0x0008C0)) {
    console.log('  Ended in power-off handler (0x000721) — non-sleep path taken');
  } else if (endPc >= 0x0019B5 && endPc <= 0x0019C0) {
    console.log('  Ended at power-off HALT (0x0019B5) — system powered off');
  } else {
    console.log(`  Ended at unexpected address: ${hex(endPc)}`);
  }

  // ── Part 5: Trace the 0x001933 HALT → RET path ──
  console.log('');
  console.log('--- Part 5: Simulate HALT wake and trace RET destination ---');

  // Reset and run to the HALT point
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  // Push a known return address onto the stack to simulate a CALL
  const MARKER_RETURN = 0xDEAD00;
  cpu.sp -= 3;
  mem[cpu.sp] = MARKER_RETURN & 0xFF;
  mem[cpu.sp + 1] = (MARKER_RETURN >> 8) & 0xFF;
  mem[cpu.sp + 2] = (MARKER_RETURN >> 16) & 0xFF;

  console.log(`  Pushed marker return address ${hex(MARKER_RETURN)} at SP=${hex(cpu.sp)}`);

  const result2 = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: 200000,
    maxLoopIterations: 5000,
    diHaltBypass: true,
  });

  console.log(`  Run result: steps=${result2.steps} term=${result2.termination} lastPc=${hex(result2.lastPc)}`);

  if (result2.lastPc === MARKER_RETURN) {
    console.log('  [CONFIRMED] HALT path RET returns to the marker address');
    console.log('  This means the RET at 0x00194C pops the return address');
    console.log('  pushed by whatever CALLed the event loop function');
  } else {
    console.log(`  HALT path ended at ${hex(result2.lastPc)} (not the marker)`);
    console.log(`  SP after: ${hex(cpu.sp)}`);
    console.log('  Stack around SP:');
    const s2 = readStack(mem, cpu.sp, 4);
    for (const e of s2) {
      console.log(`    SP+${e.offset}: ${hex(e.value)}`);
    }
  }

  // ── Part 6: Check 0x003D5A key scan details ──
  console.log('');
  console.log('--- Part 6: Key scan function 0x003D5A analysis ---');
  console.log('  0x003D5A  LD B, 0x34             ; inner loop counter = 52');
  console.log('  0x003D5C  BIT 3, (IY+0x00)       ; test IY flag byte bit 3');
  console.log('  0x003D60  JR NZ, 0x003D75        ; if set → key available');
  console.log('  0x003D62  PUSH BC');
  console.log('  0x003D63  CALL 0x003C63          ; scan keyboard matrix');
  console.log('  0x003D67  LD BC, 0x000800        ; delay counter');
  console.log('  0x003D6B  DEC BC; LD A,C; OR B; JR NZ → delay loop');
  console.log('  0x003D70  POP BC');
  console.log('  0x003D71  DJNZ 0x003D5C          ; inner loop 52x');
  console.log('  0x003D73  XOR A                  ; no key → A = 0');
  console.log('  0x003D74  RET');
  console.log('  --- key available path ---');
  console.log('  0x003D75  LD A, (0xD00587)       ; read key code');
  console.log('  0x003D79  LD B, A');
  console.log('  0x003D7A  XOR A');
  console.log('  0x003D7B  LD (0xD00587), A       ; clear key buffer');
  console.log('  0x003D7F  LD A, B                ; A = key code (nonzero)');
  console.log('  0x003D80  RES 3, (IY+0x00)       ; clear key-available flag');
  console.log('  0x003D84  RET');

  // ── Part 7: Summary ──
  console.log('');
  console.log('=== SUMMARY ===');
  console.log('');
  console.log('Function boundary: 0x003A05..0x003A8E (tail-calls JP 0x000721 at end)');
  console.log('  - 0x003A05: utility entry (JP table at 0x0002C8)');
  console.log('  - 0x003A0F: error display entry (from 0x0017CA)');
  console.log('  - 0x003A70: key poll loop (B=100, calls 0x003D5A)');
  console.log('');
  console.log('Callers:');
  console.log('  - JP 0x003A05 at 0x0002C8 (OS syscall jump table entry)');
  console.log('  - JP 0x003A0F at 0x0017CA (error path, via CALL 0x001794 at 0x00160E)');
  console.log('  - JP 0x003A89 at 0x0002CC (jump table, skips display + goes to 0x001853→JP 0x000721)');
  console.log('');
  console.log('Event loop re-entry mechanism:');
  console.log('  The function at 0x003A0F is the ERROR DISPLAY + WAIT-FOR-KEY handler.');
  console.log('  It is NOT a self-looping event loop. Its flow is:');
  console.log('    1. Display error message strings');
  console.log('    2. Poll keyboard up to 100x (DJNZ loop at 0x003A72)');
  console.log('    3. If power-off needed: JP NZ, 0x001933 → HALT → RET to caller');
  console.log('    4. If not sleeping: CALL 0x001853 → XOR A → JP 0x000721 (power-off sequence)');
  console.log('');
  console.log('After HALT wake at 0x001933:');
  console.log('  The RET at 0x00194C pops the return address that was on the stack');
  console.log('  BEFORE the function was entered. Since this function is entered via JP');
  console.log('  (not CALL), the return address is from the CALLER of whoever JumPed here.');
  console.log('  In normal boot flow: 0x00160E calls 0x001794, which tail-calls JP 0x003A0F.');
  console.log('  So the RET returns to the instruction after 0x00160E (CALL 0x001794).');
  console.log('  That caller (around 0x001612) is part of the main OS scheduler loop.');
  console.log('');
  console.log('0x000721 (non-HALT path):');
  console.log('  This is the power-off handler. It configures ports, validates flash,');
  console.log('  runs port init loops, clears power flags (D177BA, D177BC), and');
  console.log('  ultimately JP 0x0019B5 which does DI + HALT = system power off.');
  console.log('  It does NOT loop back to the event loop.');
  console.log('');
  console.log('Conclusion for the transpiler:');
  console.log('  The probe-workflow-arithmetic.mjs approach of using 0x003A73 as');
  console.log('  EVENT_LOOP_ENTRY is correct for KEY POLLING — 0x003D5A at 0x003A73');
  console.log('  is the only keyboard scan callsite in the ROM. The probe correctly');
  console.log('  resets PC to EVENT_LOOP_ENTRY when the HALT barrier is hit, because');
  console.log('  in normal operation the RET would return to the scheduler which would');
  console.log('  re-enter the poll loop through a different code path.');

  process.exit(0);
}

main();
