#!/usr/bin/env node
// Phase 433 — Trace and decode function at 0x01253F
// Sibling of 0x0125EA (port-ready gate). Called in the 0x98 re-enumeration branch.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------------------------------------------------------------------------
// Minimal eZ80 disassembler (handles mixed ADL/Z80 sequences in this function)
// ---------------------------------------------------------------------------

function signedDisp(b) {
  return b >= 128 ? b - 256 : b;
}

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

// Decode one instruction. Returns descriptor object.
function decodeOne(buf, pc) {
  const b0 = buf[pc];
  let size = 1;
  let mnemonic = '';
  let isRet = false;
  let isCALL = false;
  let callTarget = 0;

  if (b0 === 0xDD) {
    const b1 = buf[pc + 1];
    if (b1 === 0x36) {
      mnemonic = `LD (IX+${signedDisp(buf[pc+2])}),0x${buf[pc+3].toString(16).padStart(2,'0')}`;
      size = 4;
    } else if (b1 === 0x7E) {
      mnemonic = `LD A,(IX+${signedDisp(buf[pc+2])})`;
      size = 3;
    } else if (b1 === 0x77) {
      mnemonic = `LD (IX+${signedDisp(buf[pc+2])}),A`;
      size = 3;
    } else if (b1 === 0x4E) {
      mnemonic = `LD C,(IX+${signedDisp(buf[pc+2])})`;
      size = 3;
    } else if (b1 === 0x46) {
      mnemonic = `LD B,(IX+${signedDisp(buf[pc+2])})`;
      size = 3;
    } else if (b1 === 0x35) {
      mnemonic = `DEC (IX+${signedDisp(buf[pc+2])})`;
      size = 3;
    } else if (b1 === 0xF9) { mnemonic = 'LD SP,IX'; size = 2; }
    else if (b1 === 0xE1) { mnemonic = 'POP IX'; size = 2; }
    else if (b1 === 0xE3) { mnemonic = 'EX (SP),IX'; size = 2; }
    else { mnemonic = `DD.${b1.toString(16)}`; size = 2; }

  } else if (b0 === 0xFD) {
    const b1 = buf[pc + 1];
    if (b1 === 0x21) {
      mnemonic = `LD IY,0x${read24(buf, pc+2).toString(16).padStart(6,'0')}`;
      size = 5;
    } else if (b1 === 0xCB) {
      const d = signedDisp(buf[pc+2]);
      const b3 = buf[pc+3];
      const bit = (b3 >> 3) & 7;
      const op = b3 >= 0xC0 ? 'SET' : b3 >= 0x80 ? 'RES' : 'BIT';
      mnemonic = `${op} ${bit},(IY+${d})`;
      size = 4;
    } else if (b1 === 0xF9) { mnemonic = 'LD SP,IY'; size = 2; }
    else if (b1 === 0xE1) { mnemonic = 'POP IY'; size = 2; }
    else { mnemonic = `FD.${b1.toString(16)}`; size = 2; }

  } else if (b0 === 0xED) {
    const b1 = buf[pc + 1];
    if (b1 === 0x78) { mnemonic = 'IN A,(C)'; size = 2; }
    else if (b1 === 0x79) { mnemonic = 'OUT (C),A'; size = 2; }
    else if (b1 === 0x57) { mnemonic = 'LD A,I'; size = 2; }
    else { mnemonic = `ED.${b1.toString(16)}`; size = 2; }

  } else if (b0 === 0xCB) {
    const b1 = buf[pc + 1];
    const bit = (b1 >> 3) & 7;
    const reg = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
    const op = b1 >= 0xC0 ? 'SET' : b1 >= 0x80 ? 'RES' : 'BIT';
    mnemonic = `${op} ${bit},${reg}`;
    size = 2;

  } else if (b0 === 0xC9) { mnemonic = 'RET'; isRet = true; }
  else if (b0 === 0xC8) { mnemonic = 'RET Z'; }
  else if (b0 === 0xC0) { mnemonic = 'RET NZ'; }
  else if (b0 === 0xD0) { mnemonic = 'RET NC'; }

  else if (b0 === 0xCD) {
    callTarget = read24(buf, pc+1);
    mnemonic = `CALL 0x${callTarget.toString(16).padStart(6,'0')}`;
    isCALL = true;
    size = 4;
  } else if (b0 === 0xC3) {
    const t = read24(buf, pc+1);
    mnemonic = `JP 0x${t.toString(16).padStart(6,'0')}`;
    isRet = true; // end of linear flow
    size = 4;
  } else if (b0 === 0xCA) {
    mnemonic = `JP Z,0x${read24(buf, pc+1).toString(16).padStart(6,'0')}`;
    size = 4;
  } else if (b0 === 0xC2) {
    mnemonic = `JP NZ,0x${read24(buf, pc+1).toString(16).padStart(6,'0')}`;
    size = 4;

  } else if (b0 === 0x18) {
    const rs = signedDisp(buf[pc+1]);
    mnemonic = `JR ${rs} -> 0x${(pc+2+rs).toString(16)}`;
    isRet = true; // end of linear flow
    size = 2;
  } else if (b0 === 0x28) {
    const rs = signedDisp(buf[pc+1]);
    mnemonic = `JR Z,${rs} -> 0x${(pc+2+rs).toString(16)}`;
    size = 2;
  } else if (b0 === 0x20) {
    const rs = signedDisp(buf[pc+1]);
    mnemonic = `JR NZ,${rs} -> 0x${(pc+2+rs).toString(16)}`;
    size = 2;

  } else if (b0 === 0x21) {
    mnemonic = `LD HL,0x${read24(buf, pc+1).toString(16).padStart(6,'0')}`;
    size = 4;
  } else if (b0 === 0x01) {
    // Port-polling loop uses Z80-mode 16-bit LD BC (3 bytes, not 4).
    // Detect by checking if buf[pc+3] == 0xED (start of IN A,(C)).
    if (buf[pc + 3] === 0xED) {
      const portAddr = (buf[pc+2] << 8) | buf[pc+1];
      mnemonic = `LD BC,0x${portAddr.toString(16).padStart(4,'0')}  ; Z80-mode 16-bit`;
      size = 3;
    } else {
      mnemonic = `LD BC,0x${read24(buf, pc+1).toString(16).padStart(6,'0')}`;
      size = 4;
    }
  } else if (b0 === 0x11) {
    mnemonic = `LD DE,0x${read24(buf, pc+1).toString(16).padStart(6,'0')}`;
    size = 4;
  } else if (b0 === 0x3A) {
    mnemonic = `LD A,(0x${read24(buf, pc+1).toString(16).padStart(6,'0')})`;
    size = 4;
  } else if (b0 === 0x32) {
    mnemonic = `LD (0x${read24(buf, pc+1).toString(16).padStart(6,'0')}),A`;
    size = 4;
  } else if (b0 === 0x3E) { mnemonic = `LD A,0x${buf[pc+1].toString(16).padStart(2,'0')}`; size = 2; }
  else if (b0 === 0x06) { mnemonic = `LD B,0x${buf[pc+1].toString(16).padStart(2,'0')}`; size = 2; }
  else if (b0 === 0x0E) { mnemonic = `LD C,0x${buf[pc+1].toString(16).padStart(2,'0')}`; size = 2; }
  else if (b0 === 0xFE) { mnemonic = `CP 0x${buf[pc+1].toString(16).padStart(2,'0')}`; size = 2; }
  else if (b0 === 0xE6) { mnemonic = `AND 0x${buf[pc+1].toString(16).padStart(2,'0')}`; size = 2; }
  else if (b0 === 0xF6) { mnemonic = `OR 0x${buf[pc+1].toString(16).padStart(2,'0')}`; size = 2; }
  else if (b0 === 0xFB) { mnemonic = 'EI'; }
  else if (b0 === 0xF3) { mnemonic = 'DI'; }
  else if (b0 === 0xAF) { mnemonic = 'XOR A'; }
  else if (b0 === 0xB7) { mnemonic = 'OR A'; }
  else if (b0 === 0xA7) { mnemonic = 'AND A'; }
  else if (b0 === 0xC5) { mnemonic = 'PUSH BC'; }
  else if (b0 === 0xC1) { mnemonic = 'POP BC'; }
  else if (b0 === 0x78) { mnemonic = 'LD A,B'; }
  else if (b0 === 0x79) { mnemonic = 'LD A,C'; }
  else if (b0 === 0x47) { mnemonic = 'LD B,A'; }
  else if (b0 === 0x4F) { mnemonic = 'LD C,A'; }
  else if (b0 === 0x40) { mnemonic = 'LD B,B  ; NOP'; }
  else if (b0 === 0x00) { mnemonic = 'NOP'; }
  else if (b0 === 0xCF) { mnemonic = 'RST 08h'; }
  else if (b0 === 0xE9) { mnemonic = 'JP (HL)'; isRet = true; }
  else if (b0 === 0xEB) { mnemonic = 'EX DE,HL'; }
  else { mnemonic = `?? 0x${b0.toString(16).padStart(2,'0')}`; }

  const hexBytes = Array.from(buf.slice(pc, pc + size))
    .map(b => b.toString(16).padStart(2, '0')).join(' ');

  return { size, mnemonic, hexBytes, isRet, isCALL, callTarget };
}

// Linear disassembly — stops at RET or unconditional JP/JR, or after maxBytes.
function disassemble(startAddr, maxBytes) {
  const instrs = [];
  let pc = startAddr;
  const limit = startAddr + maxBytes;

  while (pc < limit) {
    const dec = decodeOne(rom, pc);
    instrs.push({ addr: pc, ...dec });
    pc += dec.size;
    if (dec.isRet) break;
  }

  return instrs;
}

// ---------------------------------------------------------------------------
// Print helpers
// ---------------------------------------------------------------------------

function bar(title) {
  console.log('');
  console.log('='.repeat(70));
  console.log(title);
  console.log('='.repeat(70));
}

function printInstrs(instrs) {
  for (const i of instrs) {
    const addrStr = `0x${i.addr.toString(16).padStart(6, '0')}`;
    console.log(`  ${addrStr}  ${i.hexBytes.padEnd(22)}${i.mnemonic}`);
  }
}

// ---------------------------------------------------------------------------
// Disassemble the three code segments that together form 0x01253F
//
// Segment A: primary entry 0x01253F – ends at JP 0x0125D2 (bit6-set path)
// Segment B: 0x01259D – notification / poll loop (bit6-clear path)
// Segment C: 0x0125D2 – shared tail (endpoint submit + RET)
// ---------------------------------------------------------------------------

bar('Segment A — primary entry 0x01253F (bit6-SET path)');
const segA = disassemble(0x01253F, 512);
printInstrs(segA);

bar('Segment B — 0x01259D: bit6-CLEAR path (notification + poll loop)');
const segB = disassemble(0x01259D, 512);
printInstrs(segB);

bar('Segment C — 0x0125D2: shared tail (endpoint submit + RET)');
const segC = disassemble(0x0125D2, 512);
printInstrs(segC);

// ---------------------------------------------------------------------------
// CALL targets
// ---------------------------------------------------------------------------

bar('CALL targets');
const allInstrs = [...segA, ...segB, ...segC];
const calls = allInstrs.filter(i => i.isCALL);
const knownFunctions = {
  0x002197: '__frameset variant (same family as 0x00218A)',
  0x0061E3: 'spin-delay / yield helper',
  0x014E3F: 'notification installer (arg BC = timeout ticks)',
  0x00883C: 'USB endpoint submit (reads D177B9, writes D177B9, calls 0x0085E3)',
};
for (const i of calls) {
  const label = knownFunctions[i.callTarget] ?? '(unknown)';
  console.log(`  0x${i.addr.toString(16).padStart(6,'0')}  CALL 0x${i.callTarget.toString(16).padStart(6,'0')}  ${label}`);
}

// ---------------------------------------------------------------------------
// RAM variable references
// ---------------------------------------------------------------------------

bar('RAM variable references (addr >= 0xD00000)');
const ramLabels = {
  0xD00080: 'USB state block base (IY base)',
  0xD0009B: 'USB state block offset 0x1B — bit 6 = controller-active flag  (IY+27)',
  0xD1440E: 'notification-active counter — cleared to 0 after processing',
  0xD1440F: 'notification-pending flag   — non-zero means outstanding notification',
  0xD177B7: 'USB ready sentinel          — 0x55 = controller ready for traffic',
};
const seenRam = new Set();
for (const i of allInstrs) {
  const m = i.mnemonic.match(/0x([0-9a-fA-F]{6})/);
  if (!m) continue;
  const addr = parseInt(m[1], 16);
  if (addr < 0xD00000) continue;
  if (seenRam.has(addr)) continue;
  seenRam.add(addr);
  const label = ramLabels[addr] ?? '(unknown RAM)';
  console.log(`  0x${addr.toString(16).padStart(6,'0')}  ${label}`);
}

// ---------------------------------------------------------------------------
// Port I/O
// ---------------------------------------------------------------------------

bar('Port I/O');
console.log('  Port 0x3082 — USB controller status register');
console.log('    Bit 1 (AND 0x02): 0 = idle/ready, 1 = busy');
console.log('');
console.log('  Polling pattern (appears in both bit6-SET and bit6-CLEAR paths):');
console.log('    LD B,B          ; NOP — alignment / mode marker');
console.log('    LD BC,0x3082    ; Z80-mode 16-bit (body runs in Z80 not ADL)');
console.log('    IN A,(C)        ; read USB controller status');
console.log('    AND 0x02        ; test busy bit');
console.log('    JR Z,...        ; branch if idle');

// ---------------------------------------------------------------------------
// Caller search
// ---------------------------------------------------------------------------

bar('Caller search — CALL 0x01253F (bytes: CD 3F 25 01)');
let callerCount = 0;
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i]===0xCD && rom[i+1]===0x3F && rom[i+2]===0x25 && rom[i+3]===0x01) {
    console.log(`  Caller at 0x${i.toString(16).padStart(6,'0')}`);
    callerCount++;
  }
}
console.log(`Total callers: ${callerCount}`);

console.log('');
console.log('Sibling 0x0125EA callers (CD EA 25 01):');
let siblingCount = 0;
for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i]===0xCD && rom[i+1]===0xEA && rom[i+2]===0x25 && rom[i+3]===0x01) {
    console.log(`  Caller at 0x${i.toString(16).padStart(6,'0')}`);
    siblingCount++;
  }
}
console.log(`Total sibling callers: ${siblingCount}`);

// ---------------------------------------------------------------------------
// Function size summary
// ---------------------------------------------------------------------------

bar('Summary');
const funcStart = 0x01253F;
const funcEnd   = 0x0125EA; // exclusive (next function starts here)
const funcSize  = funcEnd - funcStart;
console.log(`  Function:      0x01253F — USB endpoint status-submit gate (re-enum variant)`);
console.log(`  Address range: 0x${funcStart.toString(16).padStart(6,'0')} – 0x${(funcEnd-1).toString(16).padStart(6,'0')}`);
console.log(`  Total size:    ${funcSize} bytes (0x${funcSize.toString(16).toUpperCase()})`);
console.log(`  Callers:       ${callerCount} (0x0085AE only, inside 0x98 re-enum branch)`);
console.log(`  Sibling size:  191 bytes (0x0125EA); ${siblingCount} callers (normal USB path)`);
