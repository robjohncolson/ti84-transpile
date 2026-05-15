#!/usr/bin/env node

/**
 * probe-phase330-deref-helper.mjs
 *
 * Fully trace the deref helper at 0x025758.
 *
 * Session 329 found that 12+ font translation sub-functions (0x02398E-0x023AD1)
 * call this helper. Each sub-function loads a D025xx pointer slot into HL and
 * calls 0x025758. This probe:
 *
 * 1. Disassembles 0x025758 and documents the deref logic step by step.
 * 2. Maps the full registration stub table at 0x023B31-0x023BDC (19 stubs).
 * 3. Creates synthetic descriptors in RAM and calls 0x025758 to verify behavior.
 * 4. Tests both valid (type != 0x83) and invalid (type == 0x83) descriptors.
 * 5. Boots to home screen and checks whether any slots are populated after boot.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const DEREF_HELPER = 0x025758;
const ERROR_HANDLER = 0x025762;
const ERROR_CLEANUP = 0x023955;
const IX_TRAMPOLINE = 0x025774;
const ERROR_COUNTER = 0xD0265B;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0x7FFFFE;

// Scratch RAM area for synthetic descriptors (safe area in upper RAM)
const SCRATCH_BASE = 0xD18000;

// Complete registration stub table at 0x023B31-0x023BDC
// Each stub: LD (slot), HL ; SET bit, (IY+disp) ; RET
const REGISTRATION_STUBS = [
  { entry: 0x023B31, slot: 0xD025D8, iyDisp: 52, bit: 1 },
  { entry: 0x023B3A, slot: 0xD0260B, iyDisp: 52, bit: 6 },
  { entry: 0x023B43, slot: 0xD025DE, iyDisp: 52, bit: 0 },
  { entry: 0x023B4C, slot: 0xD025D5, iyDisp: 52, bit: 7 },
  { entry: 0x023B55, slot: 0xD025DB, iyDisp: 52, bit: 5 },
  { entry: 0x023B5E, slot: 0xD0260E, iyDisp: 53, bit: 0 },
  { entry: 0x023B67, slot: 0xD02611, iyDisp: 53, bit: 1 },
  { entry: 0x023B70, slot: 0xD025E1, iyDisp: 52, bit: 4 },
  { entry: 0x023B79, slot: 0xD025E4, iyDisp: 53, bit: 2 },
  { entry: 0x023B82, slot: 0xD025E7, iyDisp: 53, bit: 3 },
  { entry: 0x023B8B, slot: 0xD025EA, iyDisp: 53, bit: 4 },
  { entry: 0x023B94, slot: 0xD025ED, iyDisp: 53, bit: 5 },
  { entry: 0x023B9D, slot: 0xD025F0, iyDisp: 53, bit: 6 },
  { entry: 0x023BA6, slot: 0xD025F6, iyDisp: 54, bit: 0 },
  { entry: 0x023BAF, slot: 0xD025F9, iyDisp: 54, bit: 1 },
  { entry: 0x023BB8, slot: 0xD025FC, iyDisp: 54, bit: 2 },
  { entry: 0x023BC1, slot: 0xD025F3, iyDisp: 53, bit: 7 },
  { entry: 0x023BCA, slot: 0xD025FF, iyDisp: 54, bit: 3 },
  { entry: 0x023BD3, slot: 0xD02602, iyDisp: 54, bit: 4 },
];

// ── Helpers ──

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hb(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24(buf, addr) {
  return (buf[addr] | (buf[addr + 1] << 8) | (buf[addr + 2] << 16)) >>> 0;
}

function write24(buf, addr, value) {
  buf[addr] = value & 0xFF;
  buf[addr + 1] = (value >>> 8) & 0xFF;
  buf[addr + 2] = (value >>> 16) & 0xFF;
}

function bytesHex(buf, start, length) {
  const parts = [];
  for (let i = 0; i < length; i++) {
    parts.push(hb(buf[start + i]));
  }
  return parts.join(' ');
}

function decodeSafe(pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc, mode);
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function mnemonic(inst) {
  const p = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'push': return `${p}PUSH ${String(inst.pair ?? inst.reg ?? '?').toUpperCase()}`;
    case 'pop': return `${p}POP ${String(inst.pair ?? inst.reg ?? '?').toUpperCase()}`;
    case 'ld-pair-imm': return `${p}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-ind': return `${p}LD ${String(inst.pair).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-pair-mem': {
      const addr = inst.addr ?? 0;
      if (inst.direction === 'to-mem') return `${p}LD (${hex(addr)}), ${String(inst.pair).toUpperCase()}`;
      return `${p}LD ${String(inst.pair).toUpperCase()}, (${hex(addr)})`;
    }
    case 'ld-reg-ind': return `${p}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${p}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${p}${String(inst.op).toUpperCase()} ${hb(inst.value)}`;
    case 'inc-pair': return `${p}INC ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${p}INC (HL)`;
    case 'dec-reg': return `${p}DEC (HL)`;
    case 'ret': return `${p}RET`;
    case 'call': return `${p}CALL ${hex(inst.target)}`;
    case 'jp': return `${p}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}JP (${String(inst.indirectRegister ?? 'IX').toUpperCase()})`;
    case 'indexed-cb-set': return `${p}SET ${inst.bit}, (IY+${inst.displacement})`;
    case 'indexed-cb-res': return `${p}RES ${inst.bit}, (IY+${inst.displacement})`;
    case 'nop': return `${p}NOP`;
    default: return `${p}[${inst.tag}]`;
  }
}

function formatLine(inst) {
  const bytes = bytesHex(rom, inst.pc, inst.length).padEnd(18);
  return `  ${hex(inst.pc)}: ${bytes} ${mnemonic(inst)}`;
}

// ── Part 1: Static Disassembly ──

function disassembleDerefHelper() {
  console.log('================================================================');
  console.log('  PART 1: Static Disassembly of Deref Helper 0x025758');
  console.log('================================================================');
  console.log();

  // Main helper
  console.log('--- Deref Helper 0x025758 (7 instructions, 10 bytes) ---');
  let pc = DEREF_HELPER;
  for (let i = 0; i < 16; i++) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) break;
    console.log(formatLine(inst));
    pc = nextPc(inst);
    if (inst.tag === 'ret') break;
  }
  console.log();

  console.log('Step-by-step protocol:');
  console.log('  Entry: HL = address of a D025xx slot (3-byte RAM pointer)');
  console.log();
  console.log('  0x025758  LD HL, (HL)   HL = *(slot) = descriptor address');
  console.log('  0x02575A  LD A, (HL)    A = descriptor[0] = type byte');
  console.log('  0x02575B  INC HL        HL = descriptor + 1');
  console.log('  0x02575C  PUSH HL');
  console.log('  0x02575D  POP IX        IX = descriptor + 1 = payload pointer');
  console.log('  0x02575F  CP 0x83       Z=1 if type==0x83 (invalid), Z=0 if valid');
  console.log('  0x025761  RET');
  console.log();
  console.log('  Exit: A = type byte');
  console.log('         IX = descriptor + 1 (payload pointer)');
  console.log('         Z flag = 1 if invalid (type==0x83), 0 if valid');
  console.log();

  // Error handler
  console.log('--- Error Handler 0x025762 (entered when Z=1, type==0x83) ---');
  pc = ERROR_HANDLER;
  for (let i = 0; i < 16; i++) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) break;
    console.log(formatLine(inst));
    pc = nextPc(inst);
    if (inst.tag === 'call') break;
  }
  console.log();

  // After the CALL 0x025774 returns
  console.log('--- After CALL 0x025774 (JP (IX) trampoline) ---');
  pc = 0x02576E;
  for (let i = 0; i < 8; i++) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) break;
    console.log(formatLine(inst));
    pc = nextPc(inst);
    if (inst.tag === 'jp' || inst.tag === 'ret') break;
  }
  console.log();

  // JP (IX) trampoline
  console.log('--- JP (IX) Trampoline 0x025774 ---');
  pc = IX_TRAMPOLINE;
  for (let i = 0; i < 4; i++) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) break;
    console.log(formatLine(inst));
    pc = nextPc(inst);
    if (inst.tag === 'jp-indirect' || inst.tag === 'ret') break;
  }
  console.log();

  // Cleanup at 0x023955
  console.log('--- Error Counter Cleanup 0x023955 ---');
  pc = ERROR_CLEANUP;
  for (let i = 0; i < 16; i++) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) break;
    console.log(formatLine(inst));
    pc = nextPc(inst);
    if (inst.tag === 'ret') break;
  }
  console.log();

  console.log('Error path summary:');
  console.log('  1. POP AF (discard caller\'s saved AF)');
  console.log('  2. INC (D0265B) — increment error counter');
  console.log('  3. CALL 0x025774 = JP (IX) — jump through IX (descriptor+1)');
  console.log('     This executes the code at the descriptor payload even on error.');
  console.log('     The descriptor payload is expected to be a valid code address.');
  console.log('  4. After JP (IX) returns: POP IX, JP 0x023955');
  console.log('  5. 0x023955: DEC (D0265B) — decrement error counter, then RET');
  console.log();
}

// ── Part 2: Registration Stub Table ──

function mapRegistrationStubs() {
  console.log('================================================================');
  console.log('  PART 2: Hook Registration Stub Table (0x023B31-0x023BDC)');
  console.log('================================================================');
  console.log();
  console.log('  19 registration stubs, each 9 bytes:');
  console.log('    LD (slot), HL   — store the descriptor pointer');
  console.log('    SET bit, (IY+d) — set the "hook installed" flag');
  console.log('    RET');
  console.log();
  console.log('  Entry Addr   Slot Addr   IY+disp   Bit   Flag Addr    Flag Mask');
  console.log('  ----------   ---------   -------   ---   ---------    ---------');

  for (const stub of REGISTRATION_STUBS) {
    const flagAddr = IY_BASE + stub.iyDisp;
    const mask = 1 << stub.bit;
    console.log(
      `  ${hex(stub.entry)}     ${hex(stub.slot)}   IY+${stub.iyDisp}      ${stub.bit}` +
      `     ${hex(flagAddr)}    0x${mask.toString(16).padStart(2, '0').toUpperCase()}`
    );
  }
  console.log();

  // Group by IY displacement
  const byDisp = new Map();
  for (const stub of REGISTRATION_STUBS) {
    if (!byDisp.has(stub.iyDisp)) byDisp.set(stub.iyDisp, []);
    byDisp.get(stub.iyDisp).push(stub);
  }

  console.log('  Grouped by IY flag byte:');
  for (const [disp, stubs] of [...byDisp].sort((a, b) => a[0] - b[0])) {
    const flagAddr = IY_BASE + disp;
    const bits = stubs.map((s) => s.bit).sort();
    console.log(`    IY+${disp} (${hex(flagAddr)}): bits ${bits.join(', ')} (${stubs.length} hooks)`);
  }
  console.log();
}

// ── Part 3: Synthetic Descriptor Tests ──

function testWithSyntheticDescriptors() {
  console.log('================================================================');
  console.log('  PART 3: Synthetic Descriptor Tests');
  console.log('================================================================');
  console.log();

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  const cpu = executor.cpu;

  // Test cases: [label, typeByte, payloadBytes]
  const testCases = [
    {
      label: 'Valid descriptor (type=0x01)',
      typeByte: 0x01,
      payload: [0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99],
    },
    {
      label: 'Valid descriptor (type=0x00)',
      typeByte: 0x00,
      payload: [0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x10, 0x20, 0x30],
    },
    {
      label: 'Invalid descriptor (type=0x83)',
      typeByte: 0x83,
      payload: [0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0x00, 0x00, 0x00, 0x00],
    },
    {
      label: 'Valid descriptor (type=0x82, just below invalid)',
      typeByte: 0x82,
      payload: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09],
    },
    {
      label: 'Valid descriptor (type=0x84, just above invalid)',
      typeByte: 0x84,
      payload: [0xF1, 0xF2, 0xF3, 0xF4, 0xF5, 0xF6, 0xF7, 0xF8, 0xF9],
    },
  ];

  // The slot address we'll use for all tests
  const testSlotAddr = SCRATCH_BASE;       // 3-byte pointer slot
  const descriptorBase = SCRATCH_BASE + 8; // descriptor starts here

  let testNum = 0;
  for (const tc of testCases) {
    testNum++;
    const descAddr = descriptorBase + testNum * 32; // space each descriptor apart

    // Write the descriptor into RAM
    mem[descAddr] = tc.typeByte;
    for (let i = 0; i < tc.payload.length; i++) {
      mem[descAddr + 1 + i] = tc.payload[i];
    }

    // Write the pointer slot: slot -> descriptor address
    write24(mem, testSlotAddr, descAddr);

    // Set up CPU state
    cpu.madl = 1;
    cpu.mbase = 0xD0;
    cpu.sp = STACK_RESET_TOP - 6;
    cpu._iy = IY_BASE;
    cpu._ix = 0xBADBAD; // sentinel to verify IX gets overwritten
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.f = 0;
    cpu.a = 0;

    // Push return sentinel
    write24(mem, cpu.sp, RETURN_SENTINEL);

    // HL = slot address
    cpu._hl = testSlotAddr;

    const result = executor.runFrom(DEREF_HELPER, 'adl', {
      maxSteps: 16,
      maxLoopIterations: 4,
    });

    const zFlag = !!(cpu.f & 0x40);
    const expectedIX = (descAddr + 1) & 0xFFFFFF;

    console.log(`  Test ${testNum}: ${tc.label}`);
    console.log(`    Descriptor at:  ${hex(descAddr)}`);
    console.log(`    Raw bytes:      ${hb(tc.typeByte)} ${tc.payload.map(b => hb(b)).join(' ')}`);
    console.log(`    A (type byte):  ${hb(cpu.a)}  (expected: ${hb(tc.typeByte)})`);
    console.log(`    IX (payload):   ${hex(cpu.ix)}  (expected: ${hex(expectedIX)})`);
    console.log(`    IX correct:     ${cpu.ix === expectedIX}`);
    console.log(`    Z flag:         ${zFlag}  (expected: ${tc.typeByte === 0x83})`);
    console.log(`    Z correct:      ${zFlag === (tc.typeByte === 0x83)}`);
    console.log(`    Status:         ${zFlag ? 'INVALID (type==0x83)' : 'VALID (type!=0x83)'}`);
    console.log(`    Steps:          ${result.steps}`);

    // Verify payload accessibility through IX
    if (!zFlag && cpu.ix > 0 && cpu.ix < MEM_SIZE - 9) {
      const hook0 = read24(mem, cpu.ix);
      const hook1 = read24(mem, cpu.ix + 3);
      const hook2 = read24(mem, cpu.ix + 6);
      console.log(`    IX+0 (hook 0):  ${hex(hook0)}`);
      console.log(`    IX+3 (hook 1):  ${hex(hook1)}`);
      console.log(`    IX+6 (hook 2):  ${hex(hook2)}`);
    }
    console.log();
  }

  // Summary pass/fail
  console.log('  All tests verify that:');
  console.log('    - A receives the type byte from descriptor[0]');
  console.log('    - IX = descriptor + 1 (points past the type byte to the payload)');
  console.log('    - Z flag = 1 only when type == 0x83');
  console.log();
}

// ── Part 4: Boot and Check Slot Population ──

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function checkBootSlots() {
  console.log('================================================================');
  console.log('  PART 4: Slot Population After OS Boot');
  console.log('================================================================');
  console.log();

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  // Check all slots
  const allSlots = REGISTRATION_STUBS.map((s) => s.slot);
  // Deduplicate and sort
  const uniqueSlots = [...new Set(allSlots)].sort();

  let nonNull = 0;
  for (const slotAddr of uniqueSlots) {
    const ptr = read24(mem, slotAddr);
    if (ptr !== 0) {
      nonNull++;
      const typeByte = ptr < MEM_SIZE ? mem[ptr] : 0xFF;
      console.log(`  ${hex(slotAddr)}: ptr=${hex(ptr)} type=${hb(typeByte)}`);
    }
  }

  if (nonNull === 0) {
    console.log('  All 19 hook pointer slots are NULL (0x000000) after cold boot.');
    console.log('  This is expected: these are hook registration slots that only');
    console.log('  get populated when external code (apps, flash apps, OS hooks)');
    console.log('  calls the registration stubs at 0x023B31-0x023BDC.');
  }
  console.log();

  // Check IY flag bytes
  const iy52 = mem[IY_BASE + 52];
  const iy53 = mem[IY_BASE + 53];
  const iy54 = mem[IY_BASE + 54];
  console.log('  IY flag bytes after boot:');
  console.log(`    IY+52 (${hex(IY_BASE + 52)}): ${hb(iy52)} = ${iy52.toString(2).padStart(8, '0')}b`);
  console.log(`    IY+53 (${hex(IY_BASE + 53)}): ${hb(iy53)} = ${iy53.toString(2).padStart(8, '0')}b`);
  console.log(`    IY+54 (${hex(IY_BASE + 54)}): ${hb(iy54)} = ${iy54.toString(2).padStart(8, '0')}b`);
  console.log();
  console.log('  When a hook is registered, its IY flag bit is SET.');
  console.log('  When the deref helper finds type==0x83 (invalid), the caller clears');
  console.log('  the corresponding IY flag bit via RES instructions.');
  console.log();
}

// ── Part 5: Descriptor Format Summary ──

function printDescriptorFormat() {
  console.log('================================================================');
  console.log('  PART 5: Descriptor Format and Deref Protocol Summary');
  console.log('================================================================');
  console.log();

  console.log('  Descriptor layout (pointed to by D025xx slots):');
  console.log('  +-------+------+-------------------------------------------+');
  console.log('  | Off   | Size | Field                                     |');
  console.log('  +-------+------+-------------------------------------------+');
  console.log('  | +0    |  1   | Type byte                                 |');
  console.log('  |       |      |   0x83 = invalid/uninitialized            |');
  console.log('  |       |      |   Any other value = valid descriptor      |');
  console.log('  +-------+------+-------------------------------------------+');
  console.log('  | +1..  | var  | Payload (IX points here after deref)      |');
  console.log('  |       |      |   For font hook descriptors:              |');
  console.log('  |       |      |     +1..+3 = draw hook address (3 bytes)  |');
  console.log('  |       |      |     +4..+6 = width hook address (3 bytes) |');
  console.log('  |       |      |     +7..+9 = metric hook address (3 bytes)|');
  console.log('  +-------+------+-------------------------------------------+');
  console.log();

  console.log('  Deref helper 0x025758 protocol:');
  console.log('    Input:  HL = address of 3-byte pointer slot in D025xx region');
  console.log('    Output: A = type byte from descriptor[0]');
  console.log('            IX = descriptor + 1 (payload start)');
  console.log('            Z = 1 if type==0x83 (invalid), 0 if valid');
  console.log();

  console.log('  Caller pattern (all 12+ font translation sub-functions):');
  console.log('    PUSH IX           ; save caller\'s IX');
  console.log('    PUSH AF           ; save caller\'s A/flags');
  console.log('    PUSH HL           ; save caller\'s HL');
  console.log('    LD HL, D025xx     ; load slot address');
  console.log('    CALL 0x025758     ; deref helper');
  console.log('    POP HL            ; restore HL');
  console.log('    JP Z, 0x025762    ; if invalid -> error handler');
  console.log('    POP AF            ; restore AF (valid path)');
  console.log('    CP A              ; set Z flag (for caller?)');
  console.log('    POP IX            ; restore IX');
  console.log('    RES bit, (IY+d)   ; clear the hook flag');
  console.log('    RET');
  console.log();

  console.log('  Error handler 0x025762:');
  console.log('    POP AF');
  console.log('    INC (D0265B)      ; bump error counter');
  console.log('    CALL 0x025774     ; JP (IX) trampoline');
  console.log('    POP IX            ; restore original IX');
  console.log('    JP 0x023955       ; DEC (D0265B) and RET');
  console.log();

  console.log('  Key insight: On the error path (type==0x83), the handler still');
  console.log('  executes JP (IX) which jumps to descriptor+1. This means even');
  console.log('  an "invalid" descriptor must contain executable code at +1.');
  console.log('  The 0x83 type byte is used as a signal to:');
  console.log('    1. Increment the error counter');
  console.log('    2. Clear the hook-installed flag bit');
  console.log('    3. Execute the hook code anyway');
  console.log('  This suggests 0x83 means "pending uninstall" rather than truly');
  console.log('  invalid. The hook still runs one final time before being cleared.');
  console.log();

  console.log('  Sibling helper 0x0238B2 (from session 329):');
  console.log('    Same logic but uses DE register instead of HL:');
  console.log('    DE = *(slot), A = *(DE), D025D2 = DE+1, CP 0x83');
  console.log('    This variant publishes the post-header pointer to D025D2.');
  console.log();
}

// ── Main ──

async function main() {
  console.log('probe-phase330-deref-helper.mjs');
  console.log('================================');
  console.log();

  disassembleDerefHelper();
  mapRegistrationStubs();
  testWithSyntheticDescriptors();
  checkBootSlots();
  printDescriptorFormat();

  console.log('Done.');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
