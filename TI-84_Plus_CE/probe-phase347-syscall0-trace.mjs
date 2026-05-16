#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const MAX_RUN_STEPS = 200;
const MAX_LOOP_ITERATIONS = 500000;
const FIRST_TRACE_STEPS = 35;

const RST38 = 0x000038;
const RST38_END = 0x000080;
const GENERAL_HELPER = 0x0006F3;
const GENERAL_HELPER_END = 0x00071D;
const CALLER_START = 0x0006A9;
const CALLER_END = 0x0006D0;
const CALLER_RST = 0x0006C1;
const CALLER_FALLTHROUGH = 0x0006C2;
const TABLE_SLOT0 = 0x000080;
const TABLE_SLOT0_END = 0x000084;
const SYSCALL0 = 0x001768;
const SYSCALL0_END = 0x00176D;
const CONTINUATION_800 = 0x000800;
const CONTINUATION_800_END = 0x000840;
const POST_PORT_BLOCK = 0x000066;
const POST_PORT_END = 0x000072;
const CHECK_CALLER = 0x000047;
const CHECK_CALLER_END = 0x000055;
const CHECK_HELPER = 0x0008BB;
const CHECK_HELPER_END = 0x0008C8;
const HALT_PC = 0x0019B5;

const INTERESTING_PCS = new Set([
  0x000000,
  0x000003,
  CALLER_START,
  RST38,
  TABLE_SLOT0,
  SYSCALL0,
  CONTINUATION_800,
  0x000804,
  POST_PORT_BLOCK,
  CHECK_CALLER,
  0x00004C,
  HALT_PC,
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function padRight(text, width) {
  return String(text).padEnd(width);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => (value ?? 0).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function signedByte(value) {
  const byte = (value ?? 0) & 0xFF;
  return byte < 0x80 ? byte : byte - 0x100;
}

function signedDisp(value) {
  const signed = signedByte(value);
  const magnitude = hex(Math.abs(signed), 2);
  return signed < 0 ? `-${magnitude}` : `+${magnitude}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix.toUpperCase()} ${text}` : text;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

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

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const rom = new Uint8Array(fs.readFileSync(ROM_PATH));
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

function readROM(addr, len) {
  return rom.slice(addr, Math.min(addr + len, rom.length));
}

function safeDecode(pc, mode = BOOT_MODE) {
  try {
    const inst = decodeInstruction(rom, pc, mode);
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {
    // Fall through to a raw-byte placeholder.
  }

  return {
    pc,
    length: 1,
    tag: 'db',
    value: rom[pc] ?? 0,
    mode,
    modePrefix: null,
  };
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    case 'ex-af':
      return "EX AF, AF'";
    case 'exx':
      return 'EXX';
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? `LD ${upper(inst.pair)}, (${hex(inst.addr)})`
        : `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)}, (${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
    case 'ld-indexed-pair':
      return `LD (${upper(inst.indexRegister)}${signedDisp(inst.displacement)}), ${upper(inst.pair)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)}, (${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `LD (${upper(inst.indexRegister)}${signedDisp(inst.displacement)}), ${upper(inst.src)}`;
    case 'ld-a-mb':
      return 'LD A, MB';
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'adc-pair':
      return withPrefix(inst, `ADC HL, ${upper(inst.src)}`);
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL, ${upper(inst.src)}`);
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
    case 'in0':
      return `IN0 ${upper(inst.reg)}, (${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}), ${upper(inst.reg)}`;
    case 'out-reg':
      return `OUT (C), ${upper(inst.reg)}`;
    case 'in-reg':
      return `IN ${upper(inst.reg)}, (C)`;
    case 'rra':
      return 'RRA';
    case 'ccf':
      return 'CCF';
    case 'di':
      return 'DI';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'im':
      return `IM ${inst.value}`;
    case 'rsmix':
      return `RSMIX -> ${upper(inst.nextMode)}`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    default:
      return JSON.stringify(inst);
  }
}

function decodeWindow(start, end, mode = BOOT_MODE) {
  const rows = [];
  let pc = start;

  while (pc < end && pc < rom.length) {
    const inst = safeDecode(pc, mode);
    rows.push(inst);
    pc += inst.length;
  }

  return rows;
}

function printWindow(title, start, end, mode = BOOT_MODE) {
  console.log(`\n=== ${title} (${mode}) ===`);

  for (const inst of decodeWindow(start, end, mode)) {
    const bytes = bytesToHex(readROM(inst.pc, inst.length));
    console.log(`${hex(inst.pc)}  ${padRight(bytes, 18)}  ${formatInstruction(inst)}`);
  }
}

function captureEntry(cpu, pc, mode, step) {
  return {
    step,
    pc: pc & 0xFFFFFF,
    mode: mode ?? 'adl',
    a: cpu.a & 0xFF,
    b: cpu.b & 0xFF,
    c: cpu.c & 0xFF,
    d: cpu.d & 0xFF,
    e: cpu.e & 0xFF,
    h: cpu.h & 0xFF,
    l: cpu.l & 0xFF,
    f: cpu.f & 0xFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
  };
}

function formatTraceEntry(entry, nextEntry) {
  const marker = INTERESTING_PCS.has(entry.pc) ? '*' : ' ';
  const nextText = nextEntry ? `${hex(nextEntry.pc)}:${nextEntry.mode}` : 'end';
  return [
    `${marker}[${String(entry.step).padStart(2, '0')}]`,
    `pc=${hex(entry.pc)}:${entry.mode}`,
    `next=${nextText}`,
    `A=${hexByte(entry.a)}`,
    `B=${hexByte(entry.b)}`,
    `C=${hexByte(entry.c)}`,
    `D=${hexByte(entry.d)}`,
    `E=${hexByte(entry.e)}`,
    `H=${hexByte(entry.h)}`,
    `L=${hexByte(entry.l)}`,
    `F=${hexByte(entry.f)}`,
    `IX=${hex(entry.ix)}`,
    `IY=${hex(entry.iy)}`,
    `SP=${hex(entry.sp)}`,
  ].join('  ');
}

function printTrace(title, entries) {
  console.log(`\n=== ${title} ===`);
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const nextEntry = entries[index + 1] ?? null;
    console.log(formatTraceEntry(entry, nextEntry));
  }
}

function findSequence(entries, pcs) {
  for (let index = 0; index <= entries.length - pcs.length; index += 1) {
    let match = true;
    for (let offset = 0; offset < pcs.length; offset += 1) {
      if (entries[index + offset].pc !== pcs[offset]) {
        match = false;
        break;
      }
    }
    if (match) {
      return index;
    }
  }

  return -1;
}

function findEntryAfter(entries, startStep, pc) {
  return entries.find((entry) => entry.step > startStep && entry.pc === pc) ?? null;
}

const regeneratedTranspiledRom = ensureTranspiledRom();

const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const executor = createExecutor(PRELIFTED_BLOCKS, createMemoryBus(rom), {
  peripherals: createPeripheralBus({ timerInterrupt: false }),
});

const allEntries = [];
const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
  maxSteps: MAX_RUN_STEPS,
  maxLoopIterations: MAX_LOOP_ITERATIONS,
  onBlock(pc, mode, _meta, steps) {
    allEntries.push(captureEntry(executor.cpu, pc, mode, steps));
  },
});

const first35 = allEntries.slice(0, FIRST_TRACE_STEPS);
const focusEntries = allEntries.filter((entry) => INTERESTING_PCS.has(entry.pc));

const firstDispatcherVisit = allEntries.find((entry) => entry.pc === RST38) ?? null;
const secondDispatcherVisit = allEntries.find((entry) => entry.pc === RST38 && entry.step !== firstDispatcherVisit?.step) ?? null;
const syscallPathIndex = findSequence(allEntries, [RST38, TABLE_SLOT0, SYSCALL0, CONTINUATION_800]);

const actualCaller = syscallPathIndex > 0 ? allEntries[syscallPathIndex - 1] : null;
const actualDispatcher = syscallPathIndex >= 0 ? allEntries[syscallPathIndex] : null;
const actualSlot = syscallPathIndex >= 0 ? allEntries[syscallPathIndex + 1] : null;
const actualStub = syscallPathIndex >= 0 ? allEntries[syscallPathIndex + 2] : null;
const actualContinuation = syscallPathIndex >= 0 ? allEntries[syscallPathIndex + 3] : null;

const postSbc = actualContinuation ? findEntryAfter(allEntries, actualContinuation.step, 0x000804) : null;
const portBlock = actualContinuation ? findEntryAfter(allEntries, actualContinuation.step, POST_PORT_BLOCK) : null;
const checkCaller = actualContinuation ? findEntryAfter(allEntries, actualContinuation.step, CHECK_CALLER) : null;
const checkHelper = actualContinuation ? findEntryAfter(allEntries, actualContinuation.step, CHECK_HELPER) : null;
const checkReturn = actualContinuation ? findEntryAfter(allEntries, actualContinuation.step, 0x00004C) : null;
const haltEntry = actualContinuation ? findEntryAfter(allEntries, actualContinuation.step, HALT_PC) : null;

const byteAfterRst = rom[CALLER_FALLTHROUGH] ?? 0;
const fallthroughInst = safeDecode(CALLER_FALLTHROUGH, BOOT_MODE);

console.log('Phase 347: syscall[0] boot-context trace');
console.log('========================================');
console.log(`ROM:                     ${path.basename(ROM_PATH)}`);
console.log(`Boot entry:              ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Timer interrupt:         disabled`);
console.log(`Max run steps:           ${MAX_RUN_STEPS}`);
console.log(`Transpiled ROM:          ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
console.log(`Termination:             ${run.termination}`);
console.log(`Final PC:                ${hex(run.lastPc)}:${run.lastMode ?? 'adl'}`);

printWindow('Caller block around the real RST 0x38 site', CALLER_START, CALLER_END, BOOT_MODE);
printWindow('RST 0x38 vector body in ROM low page', RST38, RST38_END, BOOT_MODE);
printWindow('Carry-set helper reached via JP 0x0006F3 (not taken in the boot fast path)', GENERAL_HELPER, GENERAL_HELPER_END, BOOT_MODE);
printWindow('Syscall table slot [0]', TABLE_SLOT0, TABLE_SLOT0_END, BOOT_MODE);
printWindow('Syscall [0] stub', SYSCALL0, SYSCALL0_END, BOOT_MODE);
printWindow('Continuation block that consumes the return registers', CONTINUATION_800, CONTINUATION_800_END, BOOT_MODE);
printWindow('Post-port gate after the continuation', POST_PORT_BLOCK, POST_PORT_END, BOOT_MODE);
printWindow('Caller-side check path after the port gate', CHECK_CALLER, CHECK_CALLER_END, BOOT_MODE);
printWindow('Check helper reached from 0x000049', CHECK_HELPER, CHECK_HELPER_END, BOOT_MODE);

printTrace(`First ${FIRST_TRACE_STEPS} block transitions (* = directly relevant PCs)`, first35);
printTrace('Focused block transitions around the syscall[0] path', focusEntries);

console.log('\n=== Dispatcher Analysis ===');
console.log(
  `Byte after the real RST site ${hex(CALLER_RST)} is ${hex(byteAfterRst, 2)}, and ${hex(CALLER_FALLTHROUGH)} decodes as ${formatInstruction(fallthroughInst)}.`
);
console.log(
  'That rules out the common "RST opcode followed by an immediate syscall byte" pattern for this boot caller.'
);

if (firstDispatcherVisit && secondDispatcherVisit) {
  console.log(
    `First RST 0x38 visit: step ${firstDispatcherVisit.step}, IY=${hex(firstDispatcherVisit.iy)}, SP=${hex(firstDispatcherVisit.sp)}.`
  );
  console.log(
    `Second RST 0x38 visit: step ${secondDispatcherVisit.step}, IY=${hex(secondDispatcherVisit.iy)}, SP=${hex(secondDispatcherVisit.sp)}.`
  );
  console.log(
    'On the first visit, PUSH IY / RET NC returns to 0x000000 because the incoming IY is still zero. On the second visit, the incoming IY is already 0x000080, so the same RET NC lands on syscall slot [0].'
  );
}

console.log(
  `The carry-clear fast path is intentional: ${hex(0x0006BA)} executes XOR A just before ${hex(CALLER_RST)}, so C=0 and ${hex(0x000042)} = RET NC is taken.`
);
console.log(
  `The carry-set path at ${hex(0x000043)} jumps to ${hex(GENERAL_HELPER)} and is not used here.`
);

console.log('\n=== Key Frames ===');
if (actualCaller) {
  console.log(`Caller entry:            ${formatTraceEntry(actualCaller, actualDispatcher)}`);
}
if (actualDispatcher) {
  console.log(`RST 0x38 fast path:      ${formatTraceEntry(actualDispatcher, actualSlot)}`);
}
if (actualSlot) {
  console.log(`Table slot [0]:          ${formatTraceEntry(actualSlot, actualStub)}`);
}
if (actualStub) {
  console.log(`Syscall [0] body:        ${formatTraceEntry(actualStub, actualContinuation)}`);
}
if (actualContinuation) {
  console.log(`After syscall return:    ${formatTraceEntry(actualContinuation, postSbc)}`);
}
if (portBlock) {
  console.log(`A gets clobbered here:   ${formatTraceEntry(portBlock, checkCaller)}`);
}
if (checkCaller) {
  console.log(`Caller-side check path:  ${formatTraceEntry(checkCaller, checkHelper)}`);
}
if (checkHelper) {
  console.log(`Check helper entry:      ${formatTraceEntry(checkHelper, checkReturn)}`);
}
if (checkReturn) {
  console.log(`Return from check call:  ${formatTraceEntry(checkReturn, haltEntry)}`);
}
if (haltEntry) {
  console.log(`Observed terminal path:  ${formatTraceEntry(haltEntry, null)}`);
}

console.log('\n=== Interpretation ===');
if (actualCaller && actualContinuation && portBlock) {
  console.log(
    `The real caller is ${hex(CALLER_RST)} inside the block starting at ${hex(CALLER_START)}. It seeds C=${hexByte(actualCaller.c)} and HL=${hex((0x00 << 16) | (0xC0 << 8) | 0x00, 6)} before the RST.`
  );
  console.log(
    `Syscall [0] changes B from ${hexByte(actualCaller.b)} to ${hexByte(actualContinuation.b)} while leaving C=${hexByte(actualContinuation.c)}, so BC becomes ${hex((actualContinuation.b << 8) | actualContinuation.c, 4)}.`
  );
  console.log(
    `The continuation at ${hex(CONTINUATION_800)} immediately uses that BC value in SBC HL,BC. In the observed trace, HL=${hex((actualContinuation.h << 8) | actualContinuation.l, 4)} becomes ${hex((postSbc.h << 8) | postSbc.l, 4)} with no borrow, so the path falls through into the second compare and then jumps to ${hex(POST_PORT_BLOCK)}.`
  );
  console.log(
    `The RET at ${hex(SYSCALL0 + 4)} does not return to ${hex(CALLER_FALLTHROUGH)} directly. It first pops the stacked IX=${hex(actualContinuation.pc)} into PC, so ${hex(CALLER_FALLTHROUGH)} is left on the stack and later consumed by POP HL at ${hex(0x000804)}.`
  );
  console.log(
    `A=${hexByte(actualContinuation.a)} survives until ${hex(POST_PORT_BLOCK)}, but ${hex(0x000067)} = IN0 A,(0x3D) overwrites it before any branch tests it. The saved AF is never restored in this run because ${hex(0x00004F)} jumps straight to ${hex(HALT_PC)} on NZ.`
  );
  console.log(
    `The only concrete branch decision tied to the syscall result in this boot path is the BC-based threshold compare. A=0x05 does not drive a branch here; B=0x06 acts as the high byte of the compare constant 0x063E.`
  );
}

console.log('\n=== Verdict ===');
console.log(
  'This does not look like a CPU-speed or hardware-revision probe in the observed boot path.'
);
console.log(
  'The boot code treats B=0x06 as arithmetic input immediately, folding it together with caller-seeded C=0x3E to form 0x063E. A=0x05 is preserved briefly, then overwritten by port I/O before it influences control flow.'
);
console.log(
  'Best inference: syscall[0] is returning a small parameter tuple, and in this path only the BC-derived threshold matters. The boot decision is "does the continuation compare pass with BC=0x063E?"; when it does, execution proceeds to 0x000066 and then into the 0x0008BB check path.'
);
