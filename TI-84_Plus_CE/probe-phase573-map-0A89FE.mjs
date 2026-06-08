/*
 * Phase 573 P3: MAP 0x0A89FE LCD parameter computation
 *
 * Static findings encoded in this probe:
 * - 0x0A89F2 is treated as a possible sibling/alternate entry point and is
 *   disassembled before 0x0A89FE so fall-through is visible in the output.
 * - 0x0A89FE is the primary LCD parameter computation entry from session 572.
 * - The probe highlights .SIS-prefixed instructions, IY-relative operands,
 *   and 0x2xxx LCD register immediates, especially 0x2A75.
 * - CALL sites are found by scanning for the ADL CALL byte pattern
 *   CD FE 89 0A.
 * - Boot-time IY+0x51 is reported when the local runtime exposes enough API
 *   surface to boot the ROM to idle; otherwise the probe reports the missing
 *   runtime hook and still emits the static ROM evidence.
 *
 * Expected LCD relationship under investigation:
 * - Session 572 observed the parent 0x0BA561 LCD window reset calling
 *   0x0A89FE, and noted reads from LCD register 0x2A75 plus IY+0x51.
 * - This probe prints those exact instruction bytes and annotates any decoded
 *   IY+0x51 or 0x2A75 references so the relationship can be confirmed from
 *   the live ROM image.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, "ROM.rom");
const rom = fs.readFileSync(romPath);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const START = 0x0a89f2;
const PRIMARY = 0x0a89fe;
const END = 0x0a8a40;
const CALL_PATTERN = [0xcd, 0xfe, 0x89, 0x0a];

function hex(value, width = 2) {
  return value.toString(16).toUpperCase().padStart(width, "0");
}

function addr(value) {
  return `0x${hex(value, 6)}`;
}

function readU24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function readU16(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

function dumpBytes(start, end) {
  for (let base = start; base < end; base += 16) {
    const bytes = [];
    for (let i = 0; i < 16 && base + i < end; i += 1) {
      bytes.push(hex(rom[base + i]));
    }
    console.log(`${addr(base)}  ${bytes.join(" ")}`);
  }
}

function findCallers() {
  const callers = [];
  for (let i = 0; i <= rom.length - CALL_PATTERN.length; i += 1) {
    let matches = true;
    for (let j = 0; j < CALL_PATTERN.length; j += 1) {
      if (rom[i + j] !== CALL_PATTERN[j]) {
        matches = false;
        break;
      }
    }
    if (matches) callers.push(i);
  }
  return callers;
}

function signedDisp(byte) {
  return byte < 0x80 ? `+0x${hex(byte)}` : `-0x${hex(0x100 - byte)}`;
}

function iyOperand(disp) {
  return `(IY${signedDisp(disp)})`;
}

function lcdTag(value) {
  if (value >= 0x2000 && value <= 0x2fff) {
    return value === 0x2a75 ? " ; LCD register 0x2A75" : " ; LCD register range";
  }
  return "";
}

function decodeAt(pc) {
  const start = pc;
  let sis = false;
  let iy = false;
  if (rom[pc] === 0x40) {
    sis = true;
    pc += 1;
  }
  if (rom[pc] === 0xfd) {
    iy = true;
    pc += 1;
  }

  const op = rom[pc];
  const prefix = sis ? ".SIS " : "";
  const bytesEnd = (len) => start + len;
  const withPrefixLen = pc - start + 1;

  if (iy) {
    if (op === 0x7e) {
      const d = rom[pc + 1];
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD A,${iyOperand(d)}${d === 0x51 ? " ; IY+0x51" : ""}` };
    }
    if (op === 0x77) {
      const d = rom[pc + 1];
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD ${iyOperand(d)},A${d === 0x51 ? " ; IY+0x51" : ""}` };
    }
    if (op === 0x46 || op === 0x4e || op === 0x56 || op === 0x5e || op === 0x66 || op === 0x6e) {
      const regs = { 0x46: "B", 0x4e: "C", 0x56: "D", 0x5e: "E", 0x66: "H", 0x6e: "L" };
      const d = rom[pc + 1];
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD ${regs[op]},${iyOperand(d)}${d === 0x51 ? " ; IY+0x51" : ""}` };
    }
    if (op === 0x70 || op === 0x71 || op === 0x72 || op === 0x73 || op === 0x74 || op === 0x75) {
      const regs = { 0x70: "B", 0x71: "C", 0x72: "D", 0x73: "E", 0x74: "H", 0x75: "L" };
      const d = rom[pc + 1];
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD ${iyOperand(d)},${regs[op]}${d === 0x51 ? " ; IY+0x51" : ""}` };
    }
    if (op === 0xcb) {
      const d = rom[pc + 1];
      const cb = rom[pc + 2];
      return { next: bytesEnd(withPrefixLen + 2), text: `${prefix}IY-CB ${hex(d)} ${hex(cb)}${d === 0x51 ? " ; IY+0x51" : ""}` };
    }
  }

  switch (op) {
    case 0x00:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}NOP` };
    case 0x01:
      return { next: bytesEnd(withPrefixLen + 2), text: `${prefix}LD BC,0x${hex(readU16(pc + 1), 4)}${lcdTag(readU16(pc + 1))}` };
    case 0x06:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD B,0x${hex(rom[pc + 1])}` };
    case 0x0e:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD C,0x${hex(rom[pc + 1])}` };
    case 0x11:
      return { next: bytesEnd(withPrefixLen + 2), text: `${prefix}LD DE,0x${hex(readU16(pc + 1), 4)}${lcdTag(readU16(pc + 1))}` };
    case 0x16:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD D,0x${hex(rom[pc + 1])}` };
    case 0x1e:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD E,0x${hex(rom[pc + 1])}` };
    case 0x21:
      return { next: bytesEnd(withPrefixLen + 3), text: `${prefix}LD HL,${addr(readU24(pc + 1))}${lcdTag(readU24(pc + 1))}` };
    case 0x26:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD H,0x${hex(rom[pc + 1])}` };
    case 0x2e:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD L,0x${hex(rom[pc + 1])}` };
    case 0x32:
      return { next: bytesEnd(withPrefixLen + 3), text: `${prefix}LD (${addr(readU24(pc + 1))}),A${lcdTag(readU24(pc + 1))}` };
    case 0x3a:
      return { next: bytesEnd(withPrefixLen + 3), text: `${prefix}LD A,(${addr(readU24(pc + 1))})${lcdTag(readU24(pc + 1))}` };
    case 0x3e:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}LD A,0x${hex(rom[pc + 1])}` };
    case 0x7e:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}LD A,(HL)` };
    case 0x77:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}LD (HL),A` };
    case 0xaf:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}XOR A` };
    case 0xb7:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}OR A` };
    case 0xc0:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}RET NZ`, stop: true };
    case 0xc2:
      return { next: bytesEnd(withPrefixLen + 3), text: `${prefix}JP NZ,${addr(readU24(pc + 1))}` };
    case 0xc3:
      return { next: bytesEnd(withPrefixLen + 3), text: `${prefix}JP ${addr(readU24(pc + 1))}`, stop: true };
    case 0xc8:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}RET Z`, stop: true };
    case 0xc9:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}RET`, stop: true };
    case 0xca:
      return { next: bytesEnd(withPrefixLen + 3), text: `${prefix}JP Z,${addr(readU24(pc + 1))}` };
    case 0xcd:
      return { next: bytesEnd(withPrefixLen + 3), text: `${prefix}CALL ${addr(readU24(pc + 1))}` };
    case 0xd0:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}RET NC`, stop: true };
    case 0xd2:
      return { next: bytesEnd(withPrefixLen + 3), text: `${prefix}JP NC,${addr(readU24(pc + 1))}` };
    case 0xd8:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}RET C`, stop: true };
    case 0xda:
      return { next: bytesEnd(withPrefixLen + 3), text: `${prefix}JP C,${addr(readU24(pc + 1))}` };
    case 0xe6:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}AND 0x${hex(rom[pc + 1])}` };
    case 0xf6:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}OR 0x${hex(rom[pc + 1])}` };
    case 0xfe:
      return { next: bytesEnd(withPrefixLen + 1), text: `${prefix}CP 0x${hex(rom[pc + 1])}` };
    default:
      return { next: bytesEnd(withPrefixLen), text: `${prefix}DB 0x${hex(op)}` };
  }
}

function disassemble(start, limit) {
  let pc = start;
  while (pc < limit) {
    const decoded = decodeAt(pc);
    const raw = [];
    for (let i = pc; i < decoded.next; i += 1) raw.push(hex(rom[i]));
    console.log(`${addr(pc)}  ${raw.join(" ").padEnd(14)} ${decoded.text}`);
    pc = decoded.next;
    if (decoded.stop) break;
  }
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

function tryBootAndReadIy51() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${addr(bootResult.lastPc)}`);

  const iy = cpu._iy;
  const iy51Addr = iy + 0x51;
  const iy51Value = mem[iy51Addr];
  console.log(`IY=${addr(iy)} IY+0x51=${addr(iy51Addr)} value=0x${hex(iy51Value)}`);
}

console.log("=== ROM bytes 0x0A89F2-0x0A8A40 ===");
dumpBytes(START, END);

console.log("");
console.log("=== Disassembly from 0x0A89F2 ===");
disassemble(START, END);

console.log("");
console.log("=== Disassembly from 0x0A89FE ===");
disassemble(PRIMARY, END);

console.log("");
console.log("=== CALL 0x0A89FE scan (CD FE 89 0A) ===");
const callers = findCallers();
if (callers.length === 0) {
  console.log("none");
} else {
  for (const caller of callers) console.log(addr(caller));
}

console.log("");
console.log("=== Boot/IY+0x51 ===");
tryBootAndReadIy51();
