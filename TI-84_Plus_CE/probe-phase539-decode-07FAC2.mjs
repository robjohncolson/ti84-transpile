#!/usr/bin/env node
// Phase 539: Decode 0x07FAC2 — Zero OP1 Handler
// Static disassembly of the region 0x07FAC2-0x07FAF0 from raw ROM.

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load the eZ80 decoder
async function loadDecoder() {
  try {
    const maybe = require('./ez80-decoder.js');
    if (typeof maybe?.decodeInstruction === 'function') return maybe.decodeInstruction;
  } catch (_) {
    // fall through
  }
  const decoderUrl = pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href;
  const maybe = await import(decoderUrl);
  if (typeof maybe?.decodeInstruction === 'function') return maybe.decodeInstruction;
  throw new Error('Could not load decodeInstruction from ez80-decoder.js');
}

const decodeInstruction = await loadDecoder();
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const REGION_START = 0x07FAC2;
const REGION_END = 0x07FAF5;  // a bit past 0x07FAF0 to capture tail

// --- Hex dump ---
console.log('=== HEX DUMP: 0x07FAC2 - 0x07FAF4 ===\n');
for (let addr = REGION_START; addr < REGION_END; addr += 16) {
  const end = Math.min(addr + 16, REGION_END);
  const hexParts = [];
  const asciiParts = [];
  for (let i = addr; i < end; i++) {
    const b = rom[i];
    hexParts.push(b.toString(16).padStart(2, '0'));
    asciiParts.push(b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.');
  }
  const addrStr = '0x' + addr.toString(16).padStart(6, '0');
  console.log(`${addrStr}  ${hexParts.join(' ').padEnd(48)}  ${asciiParts.join('')}`);
}

// --- Disassembly ---
console.log('\n=== DISASSEMBLY: 0x07FAC2 - 0x07FAF4 (ADL mode) ===\n');

let pc = REGION_START;
while (pc < REGION_END) {
  const inst = decodeInstruction(rom, pc, 'adl');
  if (!inst) {
    const byte = rom[pc];
    console.log(`0x${pc.toString(16).padStart(6, '0')}  DB 0x${byte.toString(16).padStart(2, '0')}`);
    pc += 1;
    continue;
  }

  const bytes = [];
  for (let i = 0; i < inst.length; i++) {
    bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
  }
  const bytesStr = bytes.join(' ').padEnd(20);
  const dasm = inst.dasm || inst.mnemonic || '???';
  console.log(`0x${pc.toString(16).padStart(6, '0')}  ${bytesStr}  ${dasm}`);

  pc += inst.length;
}

// --- Known context ---
console.log('\n=== KNOWN CONTEXT ===\n');
console.log('Known callers of 0x07FAC2:');
console.log('  0x07FF03: JP Z,0x07FAC2  (OP1 mantissa is zero)');
console.log('  0x07C9BD: JP Z,0x07FAC2  (normalization overflow -> zero OP1)');
console.log('  0x07C9D0: JP C,0x07FAC2  (exponent underflow -> zero)');
console.log('  0x07CA5D: JR -> JP 0x07FAC2  (out-of-range -> reinit as zero BCD)');
console.log('  0x07CAA0: POP BC; JP 0x07FAC2  (alternate exit)');
console.log('  0x07DF66: CALL 0x07F8FA + 0x07FAC2  (BCD division post-loop)');
console.log('');
console.log('Nearby known functions:');
console.log('  0x07FAE7: generic B-count zero fill (LD (HL),0; INC HL; DJNZ; RET)');
console.log('  0x07FADB: clear 3 bytes at D0060E');
console.log('  0x07FADF: XOR A -> zero fill -> JR 0x07FA7F');
console.log('  0x07FAED: RRA x4 -> AND 0x0F -> RET (nibble extract)');

// --- Also scan for references to key addresses ---
console.log('\n=== ADDRESS ANALYSIS ===\n');

// Check what addresses appear as operands in the decoded instructions
pc = REGION_START;
while (pc < REGION_END) {
  const inst = decodeInstruction(rom, pc, 'adl');
  if (!inst) { pc += 1; continue; }

  const dasm = inst.dasm || '';
  // Look for 24-bit address references (0xD005xx = OP1 area)
  const addrMatch = dasm.match(/0x([0-9a-fA-F]{6})/g);
  if (addrMatch) {
    for (const m of addrMatch) {
      const addr = parseInt(m, 16);
      let label = '';
      if (addr >= 0xD005F8 && addr <= 0xD00606) label = ' [OP1 register]';
      else if (addr >= 0xD00607 && addr <= 0xD00615) label = ' [OP2 register]';
      else if (addr >= 0xD00616 && addr <= 0xD00624) label = ' [OP3 register]';
      else if (addr >= 0xD00625 && addr <= 0xD00633) label = ' [OP4 register]';
      else if (addr >= 0xD00634 && addr <= 0xD00642) label = ' [OP5 register]';
      else if (addr >= 0xD00643 && addr <= 0xD00651) label = ' [OP6 register]';
      if (label) {
        console.log(`  At 0x${pc.toString(16).padStart(6, '0')}: references ${m}${label}`);
      }
    }
  }
  pc += inst.length;
}

// --- Wider scan: also decode 0x07FA7F (the JR target from 0x07FADF) ---
console.log('\n=== BONUS: 0x07FA7F region (JR target from 0x07FADF) ===\n');
pc = 0x07FA7F;
const bonusEnd = 0x07FAC2;
while (pc < bonusEnd) {
  const inst = decodeInstruction(rom, pc, 'adl');
  if (!inst) {
    const byte = rom[pc];
    console.log(`0x${pc.toString(16).padStart(6, '0')}  DB 0x${byte.toString(16).padStart(2, '0')}`);
    pc += 1;
    continue;
  }
  const bytes = [];
  for (let i = 0; i < inst.length; i++) {
    bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
  }
  const bytesStr = bytes.join(' ').padEnd(20);
  const dasm = inst.dasm || inst.mnemonic || '???';
  console.log(`0x${pc.toString(16).padStart(6, '0')}  ${bytesStr}  ${dasm}`);
  pc += inst.length;
}

console.log('\n=== DONE ===');
