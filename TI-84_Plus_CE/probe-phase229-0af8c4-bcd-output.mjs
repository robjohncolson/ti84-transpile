#!/usr/bin/env node
// Phase 229 probe: Investigate 0x0AF8C4 BCD formatter — does it write key codes
// to D00604 in BCD format?
//
// 0x0AF8C4 is called from the common tail of 0x03FC1C (key code converter):
//   PUSH HL / CALL 0x03FA09 / POP HL / PUSH AF / CALL 0x0AF8C4 / POP AF / RET
//
// At 0x0AF8FC it does LD HL,0xD00604 and writes BCD digits via an RLD loop.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

// Ensure ROM.transpiled.js exists
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
if (!fs.existsSync(transpiledPath)) {
  console.log('ROM.transpiled.js not found, generating...');
  execSync('node scripts/transpile-ti84-rom.mjs', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit',
  });
}

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

// ---------------------------------------------------------------------------
// Part 1: Static disassembly of 0x0AF8C0 - 0x0AF960
// ---------------------------------------------------------------------------

console.log('=== Part 1: Static ROM bytes 0x0AF8C0 - 0x0AF960 ===\n');

function read24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function disasmRange(buf, start, end) {
  const lines = [];
  let pc = start;
  const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const r16 = ['BC', 'DE', 'HL', 'SP'];
  const r16af = ['BC', 'DE', 'HL', 'AF'];
  const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

  while (pc < end && pc < buf.length) {
    const startPc = pc;
    const b0 = buf[pc++];
    let text = '';
    const rawBytes = [b0];

    if (b0 === 0x00) { text = 'NOP'; }
    else if (b0 === 0xC9) { text = 'RET'; }
    else if (b0 === 0x76) { text = 'HALT'; }
    else if (b0 === 0xF3) { text = 'DI'; }
    else if (b0 === 0xFB) { text = 'EI'; }
    else if (b0 === 0xD9) { text = 'EXX'; }
    else if (b0 === 0xEB) { text = 'EX DE,HL'; }
    else if (b0 === 0x37) { text = 'SCF'; }
    else if (b0 === 0x3F) { text = 'CCF'; }
    else if (b0 === 0x2F) { text = 'CPL'; }
    else if (b0 === 0x27) { text = 'DAA'; }
    else if (b0 === 0x17) { text = 'RLA'; }
    else if (b0 === 0x1F) { text = 'RRA'; }
    else if (b0 === 0x07) { text = 'RLCA'; }
    else if (b0 === 0x0F) { text = 'RRCA'; }
    else if (b0 === 0xE9) { text = 'JP (HL)'; }
    else if (b0 === 0xF9) { text = 'LD SP,HL'; }
    else if (b0 === 0xE3) { text = 'EX (SP),HL'; }
    else if (b0 >= 0x40 && b0 <= 0x7F && b0 !== 0x76) {
      text = `LD ${r8[(b0 >> 3) & 7]},${r8[b0 & 7]}`;
    }
    else if (b0 >= 0x80 && b0 <= 0xBF) {
      const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
      text = `${ops[(b0 >> 3) & 7]}${r8[b0 & 7]}`;
    }
    else if ((b0 & 0xC7) === 0x04) { text = `INC ${r8[(b0 >> 3) & 7]}`; }
    else if ((b0 & 0xC7) === 0x05) { text = `DEC ${r8[(b0 >> 3) & 7]}`; }
    else if ((b0 & 0xC7) === 0x06) {
      const imm = buf[pc++]; rawBytes.push(imm);
      text = `LD ${r8[(b0 >> 3) & 7]},${hex(imm, 2)}`;
    }
    else if ((b0 & 0xCF) === 0x01) {
      const val = read24LE(buf, pc); pc += 3;
      rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
      text = `LD ${r16[(b0 >> 4) & 3]},${hex(val)}`;
    }
    else if ((b0 & 0xCF) === 0xC5) { text = `PUSH ${r16af[(b0 >> 4) & 3]}`; }
    else if ((b0 & 0xCF) === 0xC1) { text = `POP ${r16af[(b0 >> 4) & 3]}`; }
    else if ((b0 & 0xCF) === 0x09) { text = `ADD HL,${r16[(b0 >> 4) & 3]}`; }
    else if ((b0 & 0xCF) === 0x03) { text = `INC ${r16[(b0 >> 4) & 3]}`; }
    else if ((b0 & 0xCF) === 0x0B) { text = `DEC ${r16[(b0 >> 4) & 3]}`; }
    else if (b0 === 0xC3) {
      const addr = read24LE(buf, pc); pc += 3;
      rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
      text = `JP ${hex(addr)}`;
    }
    else if ((b0 & 0xC7) === 0xC2) {
      const addr = read24LE(buf, pc); pc += 3;
      rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
      text = `JP ${cc[(b0 >> 3) & 7]},${hex(addr)}`;
    }
    else if (b0 === 0xCD) {
      const addr = read24LE(buf, pc); pc += 3;
      rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
      text = `CALL ${hex(addr)}`;
    }
    else if ((b0 & 0xC7) === 0xC4) {
      const addr = read24LE(buf, pc); pc += 3;
      rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
      text = `CALL ${cc[(b0 >> 3) & 7]},${hex(addr)}`;
    }
    else if ((b0 & 0xC7) === 0xC0) { text = `RET ${cc[(b0 >> 3) & 7]}`; }
    else if (b0 === 0x18) {
      const e = buf[pc++]; rawBytes.push(e);
      const offset = e < 128 ? e : e - 256;
      text = `JR ${hex(pc + offset)}`;
    }
    else if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
      const e = buf[pc++]; rawBytes.push(e);
      const offset = e < 128 ? e : e - 256;
      const ccNames = ['NZ', 'Z', 'NC', 'C'];
      text = `JR ${ccNames[(b0 >> 3) & 3]},${hex(pc + offset)}`;
    }
    else if (b0 === 0x10) {
      const e = buf[pc++]; rawBytes.push(e);
      const offset = e < 128 ? e : e - 256;
      text = `DJNZ ${hex(pc + offset)}`;
    }
    else if ((b0 & 0xC7) === 0xC7) { text = `RST ${hex(b0 & 0x38, 2)}`; }
    else if (b0 === 0x3A) {
      const addr = read24LE(buf, pc); pc += 3;
      rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
      text = `LD A,(${hex(addr)})`;
    }
    else if (b0 === 0x32) {
      const addr = read24LE(buf, pc); pc += 3;
      rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
      text = `LD (${hex(addr)}),A`;
    }
    else if (b0 === 0x36) {
      const imm = buf[pc++]; rawBytes.push(imm);
      text = `LD (HL),${hex(imm, 2)}`;
    }
    else if (b0 === 0x0A) { text = 'LD A,(BC)'; }
    else if (b0 === 0x1A) { text = 'LD A,(DE)'; }
    else if (b0 === 0x02) { text = 'LD (BC),A'; }
    else if (b0 === 0x12) { text = 'LD (DE),A'; }
    else if ((b0 & 0xC7) === 0xC6) {
      const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
      const imm = buf[pc++]; rawBytes.push(imm);
      text = `${ops[(b0 >> 3) & 7]}${hex(imm, 2)}`;
    }
    else if (b0 === 0x22) {
      const addr = read24LE(buf, pc); pc += 3;
      rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
      text = `LD (${hex(addr)}),HL`;
    }
    else if (b0 === 0x2A) {
      const addr = read24LE(buf, pc); pc += 3;
      rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
      text = `LD HL,(${hex(addr)})`;
    }
    else if (b0 === 0xD0) { text = 'RET NC'; }
    else if (b0 === 0xD8) { text = 'RET C'; }
    else if (b0 === 0xF5) { text = 'PUSH AF'; }
    else if (b0 === 0xF1) { text = 'POP AF'; }
    else if (b0 === 0xED) {
      const b1 = buf[pc++]; rawBytes.push(b1);
      if (b1 === 0x6F) { text = 'RLD'; }
      else if (b1 === 0x67) { text = 'RRD'; }
      else if (b1 === 0xB0) { text = 'LDIR'; }
      else if (b1 === 0xB8) { text = 'LDDR'; }
      else if (b1 === 0xA0) { text = 'LDI'; }
      else if (b1 === 0xA8) { text = 'LDD'; }
      else if (b1 === 0x44) { text = 'NEG'; }
      else if (b1 === 0x4D) { text = 'RETI'; }
      else if (b1 === 0x45) { text = 'RETN'; }
      else if ((b1 & 0xCF) === 0x4B) {
        const addr = read24LE(buf, pc); pc += 3;
        rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
        text = `LD ${r16[(b1 >> 4) & 3]},(${hex(addr)})`;
      }
      else if ((b1 & 0xCF) === 0x43) {
        const addr = read24LE(buf, pc); pc += 3;
        rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
        text = `LD (${hex(addr)}),${r16[(b1 >> 4) & 3]}`;
      }
      else if ((b1 & 0xCF) === 0x42) { text = `SBC HL,${r16[(b1 >> 4) & 3]}`; }
      else if ((b1 & 0xCF) === 0x4A) { text = `ADC HL,${r16[(b1 >> 4) & 3]}`; }
      else { text = `ED ${hex(b1, 2)}`; }
    }
    else if (b0 === 0xDD || b0 === 0xFD) {
      const prefix = b0 === 0xDD ? 'IX' : 'IY';
      const b1 = buf[pc++]; rawBytes.push(b1);
      if (b1 === 0x21) {
        const val = read24LE(buf, pc); pc += 3;
        rawBytes.push(buf[pc-3], buf[pc-2], buf[pc-1]);
        text = `LD ${prefix},${hex(val)}`;
      }
      else if (b1 === 0xE5) { text = `PUSH ${prefix}`; }
      else if (b1 === 0xE1) { text = `POP ${prefix}`; }
      else if (b1 === 0xE9) { text = `JP (${prefix})`; }
      else if (b1 === 0x23) { text = `INC ${prefix}`; }
      else if (b1 === 0x2B) { text = `DEC ${prefix}`; }
      else { text = `${b0 === 0xDD ? 'DD' : 'FD'} ${hex(b1, 2)}`; }
    }
    else if (b0 === 0xCB) {
      const b1 = buf[pc++]; rawBytes.push(b1);
      const bit = (b1 >> 3) & 7;
      const reg = b1 & 7;
      if ((b1 & 0xC0) === 0x00) {
        const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        text = `${ops[bit]} ${r8[reg]}`;
      }
      else if ((b1 & 0xC0) === 0x40) { text = `BIT ${bit},${r8[reg]}`; }
      else if ((b1 & 0xC0) === 0x80) { text = `RES ${bit},${r8[reg]}`; }
      else if ((b1 & 0xC0) === 0xC0) { text = `SET ${bit},${r8[reg]}`; }
    }
    else {
      text = `DB ${hex(b0, 2)}`;
    }

    const bytesStr = rawBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
    lines.push(`  ${hex(startPc)}: ${bytesStr.padEnd(16)} ${text}`);
  }
  return lines;
}

const disasm = disasmRange(rom, 0x0AF8C0, 0x0AF960);
for (const line of disasm) console.log(line);

// Also disassemble the caller 0x03FC1C
console.log('\n=== Caller function 0x03FC1C disassembly ===\n');
const callerDisasm = disasmRange(rom, 0x03FC1C, 0x03FC42);
for (const line of callerDisasm) console.log(line);

// Dump key code table
console.log('\n=== Key code table at 0x03FC41 (56 entries) ===\n');
for (let i = 0; i < 56; i++) {
  const val = rom[0x03FC41 + i];
  process.stdout.write(` [${i.toString().padStart(2)}]=${hex(val, 2)}`);
  if ((i + 1) % 8 === 0) process.stdout.write('\n');
}
console.log('');

// ---------------------------------------------------------------------------
// Part 2: Dynamic trace — call 0x03FC1C with various D0058D values
// ---------------------------------------------------------------------------

console.log('\n=== Part 2: Dynamic trace — 0x03FC1C with test D0058D indices ===\n');

const { PRELIFTED_BLOCKS, decodeEmbeddedRom } = await import('./ROM.transpiled.js');
const { createPeripheralBus } = await import('./peripherals.js');
const { createExecutor } = await import('./cpu-runtime.js');

const SENTINEL = 0x7FFFFE;
const D0058D = 0xD0058D;
const D00604 = 0xD00604;

function bootEnvironment() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  // OS init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3;

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;

  return { mem, peripherals, executor, cpu };
}

// Test indices covering various key code ranges
const testIndices = [1, 9, 20, 34, 40, 55];

for (const idx of testIndices) {
  const { mem, executor, cpu } = bootEnvironment();

  // Zero out D00604-D0060D
  for (let i = 0; i < 10; i++) mem[D00604 + i] = 0x00;

  // Set D0058D = test index
  mem[D0058D] = idx;

  // Reset CPU state for subroutine call
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.a = 0;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.sp = 0xD1A87E;

  // Push sentinel return address
  cpu.sp -= 3;
  mem[cpu.sp] = SENTINEL & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL >> 16) & 0xFF;

  const blockPath = [];
  const run = executor.runFrom(0x03FC1C, 'adl', {
    maxSteps: 200,
    maxLoopIterations: 64,
    onBlock: (pc) => {
      if (blockPath.length < 40) blockPath.push(hex(pc));
    },
  });

  const expectedKeyCode = idx < 56 ? rom[0x03FC41 + idx] : 0;

  // Dump D00604-D0060D
  const d604 = [];
  for (let i = 0; i < 10; i++) d604.push(mem[D00604 + i]);

  // Interpret as BCD: each nibble is a digit
  const bcdStr = d604.slice(0, 4).map(b => {
    const hi = (b >> 4) & 0xF;
    const lo = b & 0xF;
    return `${hi}${lo}`;
  }).join('');

  console.log(`--- D0058D = ${idx} (table[${idx}] = ${hex(expectedKeyCode, 2)}, decimal ${expectedKeyCode}) ---`);
  console.log(`  HL after  = ${hex(cpu._hl)}`);
  console.log(`  A after   = ${hex(cpu.a, 2)}`);
  console.log(`  D00604-0D = ${d604.map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
  console.log(`  BCD interp= ${bcdStr}`);
  console.log(`  Steps=${run.steps} term=${run.termination} lastPC=${hex(run.lastPc ?? 0)}`);
  if (run.missingBlocks && run.missingBlocks.length > 0) {
    console.log(`  Missing   = ${run.missingBlocks.slice(0, 5).join(', ')}`);
  }
  console.log(`  Path      = ${blockPath.slice(0, 15).join(' -> ')}`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Part 3: Direct test of 0x0AF8C4 in isolation with known HL values
// ---------------------------------------------------------------------------

console.log('=== Part 3: Direct call to 0x0AF8C4 with known HL values ===\n');

const testHLValues = [0x00, 0x05, 0x22, 0x34, 0x8F, 0x9A, 0xFF];

for (const hlVal of testHLValues) {
  const { mem, executor, cpu } = bootEnvironment();

  // Zero D00604-D0060D
  for (let i = 0; i < 10; i++) mem[D00604 + i] = 0x00;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.sp = 0xD1A87E;
  cpu._hl = hlVal;
  cpu.a = 0;

  // Push sentinel
  cpu.sp -= 3;
  mem[cpu.sp] = SENTINEL & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL >> 16) & 0xFF;

  const run = executor.runFrom(0x0AF8C4, 'adl', {
    maxSteps: 200,
    maxLoopIterations: 64,
  });

  const d604 = [];
  for (let i = 0; i < 10; i++) d604.push(mem[D00604 + i]);

  const bcdStr = d604.slice(0, 4).map(b => {
    const hi = (b >> 4) & 0xF;
    const lo = b & 0xF;
    return `${hi}${lo}`;
  }).join('');

  console.log(`  HL=${hex(hlVal, 2)}: D00604-0D = ${d604.map(b => b.toString(16).padStart(2, '0')).join(' ')}  BCD=${bcdStr}  HL_after=${hex(cpu._hl)}  A=${hex(cpu.a, 2)}  steps=${run.steps} term=${run.termination}`);
}

// ---------------------------------------------------------------------------
// Part 4: Cross-reference D00604 — scan ROM for references
// ---------------------------------------------------------------------------

console.log('\n=== Part 4: ROM cross-reference scan for D00604 ===\n');

const target = [0x04, 0x06, 0xD0];
const hits = [];

for (let i = 1; i < rom.length - 3; i++) {
  if (rom[i] !== target[0] || rom[i + 1] !== target[1] || rom[i + 2] !== target[2]) continue;

  const pre = rom[i - 1];
  let context = '';

  if (pre === 0x21) context = 'LD HL,0xD00604';
  else if (pre === 0x11) context = 'LD DE,0xD00604';
  else if (pre === 0x01) context = 'LD BC,0xD00604';
  else if (pre === 0x3A) context = 'LD A,(0xD00604)';
  else if (pre === 0x32) context = 'LD (0xD00604),A';
  else if (pre === 0x2A) context = 'LD HL,(0xD00604)';
  else if (pre === 0x22) context = 'LD (0xD00604),HL';
  else if (pre === 0xCD) context = 'CALL 0xD00604';
  else if (pre === 0xC3) context = 'JP 0xD00604';
  else if (i >= 2 && rom[i - 2] === 0xED) {
    const edOp = pre;
    const r16n = ['BC', 'DE', 'HL', 'SP'];
    if ((edOp & 0xCF) === 0x4B) context = `LD ${r16n[(edOp >> 4) & 3]},(0xD00604)`;
    else if ((edOp & 0xCF) === 0x43) context = `LD (0xD00604),${r16n[(edOp >> 4) & 3]}`;
    else continue;
  }
  else if (i >= 2 && (rom[i - 2] === 0xDD || rom[i - 2] === 0xFD) && pre === 0x21) {
    const prefix = rom[i - 2] === 0xDD ? 'IX' : 'IY';
    context = `LD ${prefix},0xD00604`;
  }
  else continue;

  hits.push({ addr: hex(i - 1), context });
}

console.log(`Found ${hits.length} instruction references to 0xD00604:`);
for (const hit of hits) {
  console.log(`  ${hit.addr}: ${hit.context}`);
}

// Also check D00605-D00608
console.log('');
for (let targetAddr = 0xD00605; targetAddr <= 0xD00608; targetAddr++) {
  const t0 = targetAddr & 0xFF;
  const t1 = (targetAddr >> 8) & 0xFF;
  const t2 = (targetAddr >> 16) & 0xFF;
  const refs = [];

  for (let i = 1; i < rom.length - 3; i++) {
    if (rom[i] !== t0 || rom[i + 1] !== t1 || rom[i + 2] !== t2) continue;
    const pre = rom[i - 1];
    if ([0x21, 0x11, 0x01, 0x3A, 0x32, 0x2A, 0x22, 0xCD, 0xC3].includes(pre)) {
      refs.push(hex(i - 1));
    } else if (i >= 2 && rom[i - 2] === 0xED) {
      refs.push(hex(i - 2));
    }
  }

  if (refs.length > 0) {
    console.log(`  ${hex(targetAddr)}: ${refs.length} refs — ${refs.slice(0, 5).join(', ')}${refs.length > 5 ? ' ...' : ''}`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n=== Summary ===\n');
console.log('Results above show:');
console.log('1. Full disassembly of 0x0AF8C4 (BCD formatter) and 0x03FC1C (caller)');
console.log('2. D00604-D0060D state after 0x03FC1C calls with various D0058D indices');
console.log('3. D00604-D0060D state after direct 0x0AF8C4 calls with known HL values');
console.log('4. All ROM instruction references to D00604 (consumer sites)');
