#!/usr/bin/env node
// Find ROM sites that reference OP1 (0xD005F8) / OP2 (0xD00601) / ANS area
// and ALSO call the text loop 0x0a1cac within a small window. These are
// candidates for _DispHL / _DispOP1 / _DispAns numeric-display helpers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).padStart(w, '0')}`;

// Look for 24-bit immediate loads that point at OP1/OP2/ANS range.
// Encodings:
//   21 lo mi hi  = LD HL, imm24    (ADL)
//   11 lo mi hi  = LD DE, imm24
//   01 lo mi hi  = LD BC, imm24
//   dd 21 ...    = LD IX, imm24
//   fd 21 ...    = LD IY, imm24
// And MBASE-short forms via .SIS/.LIS prefix — harder to detect statically.

// We focus on direct LD HL/DE/BC imm24 for now.
const OP1 = 0xD005F8;
const OP2 = 0xD00601;
const ANS = 0xD00589;

function matches24(i, addr) {
  return rom[i] === (addr & 0xff)
    && rom[i + 1] === ((addr >> 8) & 0xff)
    && rom[i + 2] === ((addr >> 16) & 0xff);
}

function scanLoadImm24(addr, label) {
  const hits = [];
  for (let i = 0; i < rom.length - 4; i++) {
    const op = rom[i];
    if (op === 0x21 || op === 0x11 || op === 0x01) {
      if (matches24(i + 1, addr)) {
        const reg = op === 0x21 ? 'HL' : op === 0x11 ? 'DE' : 'BC';
        hits.push({ addr: i, reg });
      }
    }
  }
  return hits;
}

// Find all 0x0a1cac callers
function scanCall0a1cac() {
  const hits = [];
  for (let i = 0; i < rom.length - 4; i++) {
    const op = rom[i];
    if ((op === 0xcd || op === 0xc3) && rom[i + 1] === 0xac && rom[i + 2] === 0x1c && rom[i + 3] === 0x0a) {
      hits.push(i);
    }
  }
  return hits;
}

const callers = scanCall0a1cac();
console.log(`text-loop callers: ${callers.length}`);

for (const target of [
  { addr: OP1, name: 'OP1 (0xD005F8)' },
  { addr: OP2, name: 'OP2 (0xD00601)' },
  { addr: ANS, name: 'ANS (0xD00589)' },
]) {
  const refs = scanLoadImm24(target.addr, target.name);
  console.log(`\n=== LD HL/DE/BC, ${target.name}: ${refs.length} sites ===`);
  // Find any caller within ±128 bytes of a ref — these are likely DispX functions
  const pairs = [];
  for (const ref of refs) {
    for (const caller of callers) {
      const distance = Math.abs(caller - ref.addr);
      if (distance <= 256) {
        pairs.push({ ref: ref.addr, reg: ref.reg, caller, distance });
      }
    }
  }
  pairs.sort((a, b) => a.distance - b.distance);
  console.log(`  ${pairs.length} caller<->ref pairs within 256 bytes`);
  for (const p of pairs.slice(0, 15)) {
    console.log(`    ref ${hex(p.ref)} (LD ${p.reg}) ... call_0a1cac ${hex(p.caller)} (distance ${p.distance})`);
  }
}

// Also scan for MBASE short-addr forms (ED 5B lo mi = .SIS LD DE, (imm16))
// OP1 low 16 bits = 0x05F8
console.log(`\n=== .SIS short-addr refs to OP1 (0x05F8) ===`);
const shortHits = [];
for (let i = 0; i < rom.length - 4; i++) {
  if (rom[i] === 0xed && rom[i + 1] === 0x5b && rom[i + 2] === 0xf8 && rom[i + 3] === 0x05) {
    shortHits.push(i);
  }
}
console.log(`  ${shortHits.length} .SIS LD DE, (0x05F8) sites (first 10):`);
for (const h of shortHits.slice(0, 10)) console.log(`    ${hex(h)}`);
