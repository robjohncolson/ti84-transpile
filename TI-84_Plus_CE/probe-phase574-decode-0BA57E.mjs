#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
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

const START = 0x0BA57E;
const MAX_BYTES = 64;
const WATCH_ADDRESSES = [0xD02A76, 0xD02A7C];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(bytes) {
  return [...bytes].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

const ALU_NAMES = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const CC_NAMES = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const ROTATE_NAMES = { rlc: 'RLC', rrc: 'RRC', rl: 'RL', rr: 'RR', sla: 'SLA', sra: 'SRA', srl: 'SRL' };

function formatInstruction(d) {
  const tag = d.tag;
  const h = (v, w) => hex(v, w);
  const disp = (v) => v >= 0 ? `+${v}` : `${v}`;

  switch (tag) {
    // Simple instructions
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-pair': return `EX (SP), ${d.pair.toUpperCase()}`;
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'neg': return 'NEG';
    case 'rrd': return 'RRD';
    case 'rld': return 'RLD';
    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'ini': return 'INI';
    case 'outi': return 'OUTI';
    case 'ind': return 'IND';
    case 'outd': return 'OUTD';
    case 'inir': return 'INIR';
    case 'otir': return 'OTIR';
    case 'indr': return 'INDR';
    case 'otdr': return 'OTDR';
    case 'otimr': return 'OTIMR';
    case 'rsmix': return 'RSMIX';
    case 'stmix': return 'STMIX';
    case 'slp': return 'SLP';
    case 'im': return `IM ${d.value}`;

    // LD variants
    case 'ld-reg-reg': return `LD ${d.dest.toUpperCase()}, ${d.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${d.dest.toUpperCase()}, ${h(d.value, 2)}`;
    case 'ld-reg-ind': return `LD ${d.dest.toUpperCase()}, (${d.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${d.dest.toUpperCase()}), ${d.src.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (${d.dest.toUpperCase()}), ${h(d.value, 2)}`;
    case 'ld-pair-imm': return `LD ${d.pair.toUpperCase()}, ${h(d.value)}`;
    case 'ld-pair-mem': return `LD ${d.pair.toUpperCase()}, (${h(d.addr)})`;
    case 'ld-mem-pair': return `LD (${h(d.addr)}), ${d.pair.toUpperCase()}`;
    case 'ld-mem-reg': return `LD (${h(d.addr)}), A`;
    case 'ld-reg-mem': return `LD A, (${h(d.addr)})`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-pair': return `LD SP, ${d.pair.toUpperCase()}`;
    case 'ld-special': return `LD ${d.dest.toUpperCase()}, ${d.src.toUpperCase()}`;
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-pair-ind': return `LD ${d.pair.toUpperCase()}, (${d.src.toUpperCase()})`;
    case 'ld-ind-pair': return `LD (${d.dest.toUpperCase()}), ${d.pair.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${d.dest.toUpperCase()}, (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;
    case 'ld-ixd-reg': return `LD (${d.indexRegister.toUpperCase()}${disp(d.displacement)}), ${d.src.toUpperCase()}`;
    case 'ld-ixd-imm': return `LD (${d.indexRegister.toUpperCase()}${disp(d.displacement)}), ${h(d.value, 2)}`;
    case 'ld-pair-indexed': return `LD ${d.pair.toUpperCase()}, (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;
    case 'ld-indexed-pair': return `LD (${d.indexRegister.toUpperCase()}${disp(d.displacement)}), ${d.pair.toUpperCase()}`;
    case 'ld-ixiy-indexed': return `LD ${d.dest.toUpperCase()}, (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;
    case 'ld-indexed-ixiy': return `LD (${d.indexRegister.toUpperCase()}${disp(d.displacement)}), ${d.src.toUpperCase()}`;

    // Arithmetic
    case 'inc-reg': return `INC ${d.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${d.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${d.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${d.pair.toUpperCase()}`;
    case 'inc-ixd': return `INC (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;
    case 'dec-ixd': return `DEC (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;
    case 'add-pair': return `ADD ${d.dest.toUpperCase()}, ${d.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${d.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${d.src.toUpperCase()}`;
    case 'alu-reg': return `${ALU_NAMES[d.op]} ${d.src.toUpperCase()}`;
    case 'alu-imm': return `${ALU_NAMES[d.op]} ${h(d.value, 2)}`;
    case 'alu-ixd': return `${ALU_NAMES[d.op]} (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;
    case 'mlt': return `MLT ${d.reg.toUpperCase()}`;

    // Bit operations
    case 'bit-test': return `BIT ${d.bit}, ${d.reg.toUpperCase()}`;
    case 'bit-res': return `RES ${d.bit}, ${d.reg.toUpperCase()}`;
    case 'bit-set': return `SET ${d.bit}, ${d.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${d.bit}, (HL)`;
    case 'bit-res-ind': return `RES ${d.bit}, (HL)`;
    case 'bit-set-ind': return `SET ${d.bit}, (HL)`;
    case 'rotate-reg': return `${(ROTATE_NAMES[d.operation] || d.operation).toUpperCase()} ${d.reg.toUpperCase()}`;
    case 'rotate-ind': return `${(ROTATE_NAMES[d.operation] || d.operation).toUpperCase()} (HL)`;
    case 'indexed-cb-rotate': return `${(ROTATE_NAMES[d.operation] || d.operation).toUpperCase()} (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;
    case 'indexed-cb-bit': return `BIT ${d.bit}, (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;
    case 'indexed-cb-res': return `RES ${d.bit}, (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;
    case 'indexed-cb-set': return `SET ${d.bit}, (${d.indexRegister.toUpperCase()}${disp(d.displacement)})`;

    // Jumps/calls
    case 'jp': return `JP ${h(d.target)}`;
    case 'jp-conditional': return `JP ${CC_NAMES[d.condition]}, ${h(d.target)}`;
    case 'jp-indirect': return `JP (${(d.indirectRegister || 'hl').toUpperCase()})`;
    case 'jr': return `JR ${h(d.target)}`;
    case 'jr-conditional': return `JR ${CC_NAMES[d.condition]}, ${h(d.target)}`;
    case 'djnz': return `DJNZ ${h(d.target)}`;
    case 'call': return `CALL ${h(d.target)}`;
    case 'call-conditional': return `CALL ${CC_NAMES[d.condition]}, ${h(d.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${CC_NAMES[d.condition]}`;
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'rst': return `RST ${h(d.vector, 2)}`;

    // Stack
    case 'push': return `PUSH ${d.pair.toUpperCase()}`;
    case 'pop': return `POP ${d.pair.toUpperCase()}`;

    // I/O
    case 'in-imm': return `IN A, (${h(d.port, 2)})`;
    case 'out-imm': return `OUT (${h(d.port, 2)}), A`;
    case 'in-reg': return `IN ${d.reg.toUpperCase()}, (C)`;
    case 'out-reg': return `OUT (C), ${d.reg.toUpperCase()}`;
    case 'in0': return `IN0 ${d.reg.toUpperCase()}, (${h(d.port, 2)})`;
    case 'out0': return `OUT0 (${h(d.port, 2)}), ${d.reg.toUpperCase()}`;

    // Misc
    case 'tst-reg': return `TST ${d.reg.toUpperCase()}`;
    case 'tst-ind': return 'TST (HL)';
    case 'tst-imm': return `TST ${h(d.value, 2)}`;
    case 'tstio': return `TSTIO ${h(d.value, 2)}`;
    case 'lea': return `LEA ${d.dest.toUpperCase()}, ${d.base.toUpperCase()}${disp(d.displacement)}`;
    case 'pea': return `PEA ${d.base.toUpperCase()}${disp(d.displacement)}`;

    default: return `??? [tag=${tag}]`;
  }
}

function isTerminator(d) {
  if (d.terminates) return true;
  const tag = d.tag;
  if (tag === 'ret' || tag === 'reti' || tag === 'retn') return true;
  // Unconditional JP/JR
  if (tag === 'jp' || tag === 'jr' || tag === 'jp-indirect') return true;
  return false;
}

function countPattern(buffer, pattern) {
  let count = 0;
  for (let i = 0; i <= buffer.length - pattern.length; i++) {
    let matched = true;
    for (let j = 0; j < pattern.length; j++) {
      if (buffer[i + j] !== pattern[j]) { matched = false; break; }
    }
    if (matched) count++;
  }
  return count;
}

// --- Boot using the golden probe pattern ---
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Cold boot
executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
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

console.log('=== Phase 574 - Decode function at 0x0BA57E ===');
console.log(`Boot complete. Disassembly from ${hex(START)}:`);
console.log('');

const writes = new Map();
const calls = [];
let address = START;
const end = START + MAX_BYTES;
let hitTerminator = false;

while (address < end) {
  const decoded = decodeInstruction(romBytes, address, 'adl');
  const length = decoded.length || 1;
  const bytes = romBytes.subarray(address, address + length);
  const rendered = formatInstruction(decoded);

  console.log(`${hex(address)}  ${byteHex(bytes).padEnd(17)}  ${rendered}`);

  // Track CALL targets
  if (decoded.tag === 'call' || decoded.tag === 'call-conditional') {
    calls.push({ address, target: decoded.target });
  }

  // Track RAM writes from LD (addr), ... instructions
  if (decoded.tag === 'ld-mem-reg' || decoded.tag === 'ld-mem-pair') {
    const addr = decoded.addr;
    if (addr != null) writes.set(addr, (writes.get(addr) ?? 0) + 1);
  }

  // Also check for ED-prefixed LD (nn), rr
  if (decoded.addr != null && (decoded.tag === 'ld-mem-pair' || decoded.tag === 'ld-mem-reg')) {
    // already handled above
  }

  if (isTerminator(decoded)) {
    hitTerminator = true;
    address += length;
    break;
  }

  address += length;
}

const functionSize = address - START;
console.log('');
console.log(`Function size: ${functionSize} bytes (${hex(START)} - ${hex(address - 1)})`);
console.log(`Terminated: ${hitTerminator ? 'yes' : `no (reached ${MAX_BYTES}-byte limit)`}`);

console.log('');
console.log('RAM writes identified:');
if (writes.size === 0) {
  console.log('  (none from decoded LD instructions -- checking raw bytes)');
  // Fallback: scan raw bytes for LD (nn),A (0x32) and LD (nn),HL (0x22) patterns
  for (let a = START; a < address - 3; a++) {
    const op = romBytes[a];
    if (op === 0x32 || op === 0x22) {
      const target = romBytes[a + 1] | (romBytes[a + 2] << 8) | (romBytes[a + 3] << 16);
      if (target >= 0xD00000) {
        const watched = WATCH_ADDRESSES.includes(target) ? ' <= watched' : '';
        console.log(`  ${hex(a)}: ${op === 0x32 ? 'LD (nn),A' : 'LD (nn),HL'} -> ${hex(target)}${watched}`);
      }
    }
  }
} else {
  for (const [target, count] of [...writes.entries()].sort((a, b) => a[0] - b[0])) {
    const watched = WATCH_ADDRESSES.includes(target) ? ' <= watched' : '';
    console.log(`  ${hex(target)} (${count})${watched}`);
  }
}

// Also scan for raw absolute stores in the function body
console.log('');
console.log('Raw byte scan for absolute stores in function body:');
for (let a = START; a < address - 3; a++) {
  const op = romBytes[a];
  if (op === 0x32) {
    const target = romBytes[a + 1] | (romBytes[a + 2] << 8) | (romBytes[a + 3] << 16);
    if (target >= 0xD00000) {
      const watched = WATCH_ADDRESSES.includes(target) ? ' <= watched' : '';
      console.log(`  ${hex(a)}: LD (${hex(target)}), A${watched}`);
    }
  }
  // ED 43/53/63/73 = LD (nn), BC/DE/HL/SP
  if (op === 0xED) {
    const next = romBytes[a + 1];
    if (next === 0x43 || next === 0x53 || next === 0x63 || next === 0x73) {
      const pairNames = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
      const target = romBytes[a + 2] | (romBytes[a + 3] << 8) | (romBytes[a + 4] << 16);
      if (target >= 0xD00000) {
        const watched = WATCH_ADDRESSES.includes(target) ? ' <= watched' : '';
        console.log(`  ${hex(a)}: LD (${hex(target)}), ${pairNames[next]}${watched}`);
      }
    }
  }
}

console.log('');
console.log('CALL targets:');
if (calls.length === 0) {
  console.log('  (none from decoded instructions -- checking raw bytes)');
  // Scan for CD xx xx xx (CALL nn)
  for (let a = START; a < address - 3; a++) {
    if (romBytes[a] === 0xCD) {
      const target = romBytes[a + 1] | (romBytes[a + 2] << 8) | (romBytes[a + 3] << 16);
      if (target < 0x400000) {
        console.log(`  ${hex(a)}: CALL ${hex(target)}`);
      }
    }
  }
} else {
  for (const call of calls) {
    console.log(`  ${hex(call.address)} -> ${hex(call.target)}`);
  }
}

console.log('');
console.log('Cross-reference counts in ROM:');
for (const target of WATCH_ADDRESSES) {
  const pattern = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  console.log(`  ${hex(target)} (${byteHex(pattern)}): ${countPattern(romBytes, pattern)} occurrences`);
}
