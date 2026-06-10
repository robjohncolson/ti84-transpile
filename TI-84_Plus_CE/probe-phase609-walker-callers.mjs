import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const WALKER_TARGETS = [
  { name: 'forward walker', addr: 0x090917 },
  { name: 'backward walker', addr: 0x09092e },
];
const FLAG_TEST_ADDR = 0x08f3dc;
const RES_3_IY_23 = [0xfd, 0xcb, 0x23, 0x9e];

let externalDecodeInstruction = null;
try {
  const decoder = await import('./ez80-decoder.js');
  if (typeof decoder.decodeInstruction === 'function') {
    externalDecodeInstruction = decoder.decodeInstruction;
  }
} catch (err) {
  console.log(`decoder import unavailable, using local fallback: ${err.message}`);
}

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function addrBytes(addr) {
  return [addr & 0xff, (addr >> 8) & 0xff, (addr >> 16) & 0xff];
}

function patternFor(opcode, addr) {
  return [opcode, ...addrBytes(addr)];
}

function bytesAt(rom, offset, length) {
  return Array.from(rom.subarray(offset, Math.min(rom.length, offset + length)), byteHex).join(' ');
}

function findPattern(rom, pattern) {
  const hits = [];
  const last = rom.length - pattern.length;
  for (let i = 0; i <= last; i += 1) {
    let matched = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }
  return hits;
}

function findCallJpTo(rom, addr) {
  return [
    ...findPattern(rom, patternFor(0xcd, addr)).map((offset) => ({ offset, addr: offset, mnemonic: 'CALL', target: addr })),
    ...findPattern(rom, patternFor(0xc3, addr)).map((offset) => ({ offset, addr: offset, mnemonic: 'JP', target: addr })),
  ].sort((a, b) => a.offset - b.offset);
}

function classifyRegion(addr) {
  const high = addr & 0xff0000;
  if (high === 0x080000) return '0x08xxxx';
  if (high === 0x090000) return '0x09xxxx';
  return 'other';
}

function hasPattern(rom, start, end, pattern) {
  const first = Math.max(0, start);
  const last = Math.min(rom.length, end) - pattern.length;
  for (let i = first; i <= last; i += 1) {
    let matched = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

function fallbackDecode(rom, pc) {
  const b0 = rom[pc];
  const b1 = rom[pc + 1];
  const b2 = rom[pc + 2];
  const b3 = rom[pc + 3];
  const imm24 = b1 | (b2 << 8) | (b3 << 16);
  const imm16 = b1 | (b2 << 8);

  if (b0 === 0xcd) return { length: 4, text: `CALL ${hex(imm24)}` };
  if (b0 === 0xc3) return { length: 4, text: `JP ${hex(imm24)}` };
  if (b0 === 0xc9) return { length: 1, text: 'RET' };
  if (b0 === 0xfd && b1 === 0xcb && b3 === 0x9e) return { length: 4, text: `RES 3,(IY+${hex(b2, 2)})` };
  if (b0 === 0xfd && b1 === 0xcb && b3 === 0x5e) return { length: 4, text: `BIT 3,(IY+${hex(b2, 2)})` };
  if (b0 === 0xfd && b1 === 0xcb && b3 === 0xde) return { length: 4, text: `SET 3,(IY+${hex(b2, 2)})` };
  if (b0 === 0x18) return { length: 2, text: `JR ${signedTarget(pc, b1)}` };
  if (b0 === 0x20) return { length: 2, text: `JR NZ,${signedTarget(pc, b1)}` };
  if (b0 === 0x28) return { length: 2, text: `JR Z,${signedTarget(pc, b1)}` };
  if (b0 === 0x30) return { length: 2, text: `JR NC,${signedTarget(pc, b1)}` };
  if (b0 === 0x38) return { length: 2, text: `JR C,${signedTarget(pc, b1)}` };
  if (b0 === 0x21) return { length: 3, text: `LD HL,${hex(imm16, 4)}` };
  if (b0 === 0x11) return { length: 3, text: `LD DE,${hex(imm16, 4)}` };
  if (b0 === 0x01) return { length: 3, text: `LD BC,${hex(imm16, 4)}` };
  if (b0 === 0x3e) return { length: 2, text: `LD A,${hex(b1, 2)}` };
  if (b0 === 0x32) return { length: 4, text: `LD (${hex(imm24)}),A` };
  if (b0 === 0x3a) return { length: 4, text: `LD A,(${hex(imm24)})` };
  if (b0 === 0xe5) return { length: 1, text: 'PUSH HL' };
  if (b0 === 0xd5) return { length: 1, text: 'PUSH DE' };
  if (b0 === 0xc5) return { length: 1, text: 'PUSH BC' };
  if (b0 === 0xf5) return { length: 1, text: 'PUSH AF' };
  if (b0 === 0xe1) return { length: 1, text: 'POP HL' };
  if (b0 === 0xd1) return { length: 1, text: 'POP DE' };
  if (b0 === 0xc1) return { length: 1, text: 'POP BC' };
  if (b0 === 0xf1) return { length: 1, text: 'POP AF' };
  return { length: 1, text: `DB ${hex(b0, 2)}` };
}

function signedTarget(pc, displacement) {
  const signed = displacement < 0x80 ? displacement : displacement - 0x100;
  return hex((pc + 2 + signed) & 0xffffff);
}

function normalizeDecoded(raw, rom, pc) {
  if (!raw) return null;
  if (typeof raw === 'string') return { length: 1, text: raw };
  const length = raw.length ?? raw.size ?? raw.bytes ?? raw.instructionLength ?? 1;
  const text = raw.text ?? raw.asm ?? raw.mnemonic ?? raw.disasm ?? JSON.stringify(raw);
  return { length: Math.max(1, Number(length) || 1), text };
}

function decodeOne(rom, pc) {
  if (externalDecodeInstruction) {
    try {
      const decoded = normalizeDecoded(externalDecodeInstruction(rom, pc, pc), rom, pc);
      if (decoded) return decoded;
    } catch {
      try {
        const decoded = normalizeDecoded(externalDecodeInstruction(rom.subarray(pc), pc), rom, pc);
        if (decoded) return decoded;
      } catch {
        // Fall back below.
      }
    }
  }
  return fallbackDecode(rom, pc);
}

function decodeWindow(rom, start, length) {
  const lines = [];
  let pc = Math.max(0, start);
  const end = Math.min(rom.length, start + length);
  while (pc < end) {
    const decoded = decodeOne(rom, pc);
    const size = Math.min(decoded.length, Math.max(1, end - pc));
    lines.push(`${hex(pc)}  ${bytesAt(rom, pc, size).padEnd(12)}  ${decoded.text}`);
    pc += size;
  }
  return lines;
}

function logHits(title, hits, contextBytes) {
  console.log(`\n${title}: ${hits.length}`);
  for (const hit of hits) {
    const start = Math.max(0, hit.offset - contextBytes);
    const length = contextBytes + 4 + contextBytes;
    console.log(`  ${hit.mnemonic} ${hex(hit.target)} at ${hex(hit.addr)}`);
    console.log(`    context ${hex(start)}: ${bytesAt(rom, start, length)}`);
  }
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const rom = fs.readFileSync(ROM_PATH);
console.log(`Loaded ROM: ${ROM_PATH} (${rom.length} bytes)`);

const walkerHits = new Map();
for (const target of WALKER_TARGETS) {
  const hits = findCallJpTo(rom, target.addr);
  walkerHits.set(target.addr, hits);
  logHits(`${target.name} ${hex(target.addr)} direct CALL/JP sites`, hits, 32);
}

const flagTestCallers = findPattern(rom, patternFor(0xcd, FLAG_TEST_ADDR))
  .map((offset) => ({ offset, addr: offset, mnemonic: 'CALL', target: FLAG_TEST_ADDR }));
logHits(`flag test ${hex(FLAG_TEST_ADDR)} CALL sites`, flagTestCallers, 16);

const regionCounts = new Map();
for (const caller of flagTestCallers) {
  const region = classifyRegion(caller.addr);
  regionCounts.set(region, (regionCounts.get(region) ?? 0) + 1);
}

console.log('\nFlag-test callers by region:');
for (const region of ['0x08xxxx', '0x09xxxx', 'other']) {
  console.log(`  ${region}: ${regionCounts.get(region) ?? 0}`);
}

const directWalkerCallers = [...walkerHits.values()].flat();
console.log('\nImmediate walker caller decode windows:');
for (const caller of directWalkerCallers) {
  const start = Math.max(0, caller.addr - 16);
  const clearsBeforeCall = hasPattern(rom, caller.addr - 64, caller.addr, RES_3_IY_23);
  const clearsInDecodeWindow = hasPattern(rom, start, start + 64, RES_3_IY_23);
  console.log(`\n${caller.mnemonic} ${hex(caller.target)} at ${hex(caller.addr)}`);
  console.log(`  clears D000A3 bit 3 before CALL: ${clearsBeforeCall ? 'yes' : 'no'}`);
  console.log(`  clears D000A3 bit 3 in 64-byte decode window: ${clearsInDecodeWindow ? 'yes' : 'no'}`);
  for (const line of decodeWindow(rom, start, 64)) {
    console.log(`  ${line}`);
  }
}

console.log('\nSecond-level callers of immediate walker caller addresses:');
const uniqueCallerAddrs = [...new Set(directWalkerCallers.map((caller) => caller.addr))].sort((a, b) => a - b);
const secondLevel = new Map();
for (const addr of uniqueCallerAddrs) {
  const hits = findCallJpTo(rom, addr);
  secondLevel.set(addr, hits);
  console.log(`  callers of ${hex(addr)}: ${hits.length}`);
  for (const hit of hits) {
    console.log(`    ${hit.mnemonic} at ${hex(hit.addr)} -> ${hex(addr)}  context: ${bytesAt(rom, Math.max(0, hit.addr - 8), 20)}`);
  }
}

console.log('\nSummary:');
console.log(`  direct callers of ${hex(0x090917)} (forward walker): ${walkerHits.get(0x090917).length}`);
console.log(`  direct callers of ${hex(0x09092e)} (backward walker): ${walkerHits.get(0x09092e).length}`);
console.log(`  callers of ${hex(FLAG_TEST_ADDR)} (flag test): ${flagTestCallers.length}`);
for (const caller of directWalkerCallers) {
  const clears = hasPattern(rom, caller.addr - 64, caller.addr, RES_3_IY_23);
  console.log(`  ${hex(caller.addr)} -> ${hex(caller.target)} clears bit 3 before call: ${clears ? 'yes' : 'no'}`);
}

