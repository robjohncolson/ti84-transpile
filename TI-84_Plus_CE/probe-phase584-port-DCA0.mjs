#!/usr/bin/env node
// Phase 584 — Map all I/O port references to 0xDCA0 and the 0xDCxx range
// across the entire ROM. Session 583 found 0x0236F9 reads port 0xDCA0 via
// IN A,(C) with BC=0x00DCA0 (event posting ack). This probe finds every
// IN/OUT instruction and traces backwards to identify the target port.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const PERIPH_PATH = path.join(__dirname, 'peripherals.js');

const rom = fs.readFileSync(ROM_PATH);
const periphSrc = fs.readFileSync(PERIPH_PATH, 'utf-8');

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function hex16(v) {
  return '0x' + v.toString(16).toUpperCase().padStart(4, '0');
}

// --- Step 1: Find all IN/OUT instructions ---

// ED-prefixed IN r,(C) and OUT (C),r opcodes
// IN r,(C):  ED 40/48/50/58/60/68/78  (r = B/C/D/E/H/L/-/A)
// OUT (C),r: ED 41/49/51/59/61/69/79  (r = B/C/D/E/H/L/-/A)
const REGS = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

const edInOpcodes = new Set([0x40, 0x48, 0x50, 0x58, 0x60, 0x68, 0x78]);
const edOutOpcodes = new Set([0x41, 0x49, 0x51, 0x59, 0x61, 0x69, 0x79]);

const ioInstructions = []; // { addr, type: 'IN'|'OUT', asm, reg }

for (let addr = 0; addr < rom.length - 1; addr++) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];

  // ED-prefixed IN/OUT
  if (b0 === 0xED) {
    if (edInOpcodes.has(b1)) {
      const regIdx = (b1 >> 3) & 7;
      const reg = REGS[regIdx];
      ioInstructions.push({
        addr,
        type: 'IN',
        asm: `IN ${reg},(C)`,
        reg,
        edPrefixed: true,
      });
    } else if (edOutOpcodes.has(b1)) {
      const regIdx = (b1 >> 3) & 7;
      const reg = REGS[regIdx];
      ioInstructions.push({
        addr,
        type: 'OUT',
        asm: `OUT (C),${reg}`,
        reg,
        edPrefixed: true,
      });
    }
  }

  // IN A,(n) = DB nn
  if (b0 === 0xDB) {
    ioInstructions.push({
      addr,
      type: 'IN',
      asm: `IN A,(${hex(b1, 2)})`,
      reg: 'A',
      edPrefixed: false,
      immediatePort: b1,
    });
  }

  // OUT (n),A = D3 nn
  if (b0 === 0xD3) {
    ioInstructions.push({
      addr,
      type: 'OUT',
      asm: `OUT (${hex(b1, 2)}),A`,
      reg: 'A',
      edPrefixed: false,
      immediatePort: b1,
    });
  }
}

console.log(`Total I/O instructions found in ROM: ${ioInstructions.length}`);
console.log(`  ED-prefixed (IN r,(C) / OUT (C),r): ${ioInstructions.filter(i => i.edPrefixed).length}`);
console.log(`  Direct (IN A,(n) / OUT (n),A): ${ioInstructions.filter(i => !i.edPrefixed).length}`);
console.log('');

// --- Step 2: For ED-prefixed IN/OUT, trace backwards to find BC load ---

// Look for LD BC,nnnnnn (01 nn nn nn in ADL) or LD C,nn (0E nn) or LD B,nn (06 nn)
// within 40 bytes before the instruction.

function tracePortBackward(ioAddr) {
  const searchStart = Math.max(0, ioAddr - 40);
  let bcValue = null;
  let cValue = null;
  let bValue = null;
  let bcLoadAddr = null;
  let cLoadAddr = null;
  let bLoadAddr = null;

  // Scan forward from searchStart to ioAddr, picking up the LAST load before ioAddr
  for (let a = searchStart; a < ioAddr; a++) {
    const byte = rom[a];

    // LD BC,nnnnnn (ADL mode, 4 bytes: 01 lo mid hi)
    if (byte === 0x01 && a + 3 < ioAddr) {
      bcValue = rom[a + 1] | (rom[a + 2] << 8) | (rom[a + 3] << 16);
      bcLoadAddr = a;
      // Derive C and B from BC
      cValue = bcValue & 0xFF;
      bValue = (bcValue >> 8) & 0xFF;
      cLoadAddr = a;
      bLoadAddr = a;
      a += 3; // skip past the immediate
      continue;
    }

    // LD C,nn (2 bytes: 0E nn)
    if (byte === 0x0E && a + 1 < ioAddr) {
      cValue = rom[a + 1];
      cLoadAddr = a;
      a += 1;
      continue;
    }

    // LD B,nn (2 bytes: 06 nn)
    if (byte === 0x06 && a + 1 < ioAddr) {
      bValue = rom[a + 1];
      bLoadAddr = a;
      a += 1;
      continue;
    }

    // LD BC,(nnnnnn) — ED 4B nn nn nn — can't resolve statically
    if (byte === 0xED && a + 1 < ioAddr && rom[a + 1] === 0x4B) {
      bcValue = 'indirect';
      bcLoadAddr = a;
      a += 4;
      continue;
    }
  }

  // Reconstruct port from C (low byte) and B (high byte) if we have them
  let port = null;
  if (bcValue !== null && bcValue !== 'indirect') {
    port = bcValue & 0xFFFF; // Port is 16-bit
  } else if (cValue !== null) {
    // Port address uses C as low byte; B as high byte if known
    if (bValue !== null) {
      port = (bValue << 8) | cValue;
    } else {
      port = cValue; // Only know low byte
    }
  }

  return { port, bcValue, cValue, bValue, bcLoadAddr, cLoadAddr, bLoadAddr };
}

// --- Step 3: Classify all I/O instructions by resolved port ---

const dca0Refs = [];       // Port 0xDCA0 specifically
const dcxxRefs = [];       // Port 0xDCxx range (0xDC00-0xDCFF)
const portA0Direct = [];   // IN A,(0xA0) or OUT (0xA0),A direct
const allPortCounts = {};  // port -> count for statistics
const unresolvedIO = [];   // Could not determine port

for (const io of ioInstructions) {
  if (!io.edPrefixed) {
    // Direct IN/OUT with immediate byte
    const lowByte = io.immediatePort;
    if (lowByte === 0xA0) {
      portA0Direct.push(io);
    }
    const key = `direct:${hex(lowByte, 2)}`;
    allPortCounts[key] = (allPortCounts[key] || 0) + 1;
    continue;
  }

  // ED-prefixed: trace backward for BC
  const trace = tracePortBackward(io.addr);
  io.trace = trace;

  if (trace.port === null || trace.bcValue === 'indirect') {
    unresolvedIO.push(io);
    continue;
  }

  const port16 = trace.port & 0xFFFF;
  const key = hex16(port16);
  allPortCounts[key] = (allPortCounts[key] || 0) + 1;

  if (port16 === 0xDCA0) {
    dca0Refs.push(io);
  }

  if ((port16 & 0xFF00) === 0xDC00) {
    dcxxRefs.push(io);
  }
}

// --- Step 4: Print results ---

console.log('=== PORT 0xDCA0 REFERENCES ===');
console.log(`Found ${dca0Refs.length} I/O instructions targeting port 0xDCA0:\n`);

for (const io of dca0Refs) {
  const t = io.trace;
  let loadInfo = '';
  if (t.bcLoadAddr !== null) {
    loadInfo = ` (BC loaded at ${hex(t.bcLoadAddr)} = ${hex(t.bcValue, 6)})`;
  }
  console.log(`  ${hex(io.addr)}  ${io.type.padEnd(3)}  ${io.asm}${loadInfo}`);
}

console.log('');
console.log('=== ALL 0xDCxx RANGE REFERENCES ===');
console.log(`Found ${dcxxRefs.length} I/O instructions in 0xDC00-0xDCFF range:\n`);

// Group by port
const dcxxByPort = {};
for (const io of dcxxRefs) {
  const port = hex16(io.trace.port & 0xFFFF);
  if (!dcxxByPort[port]) dcxxByPort[port] = [];
  dcxxByPort[port].push(io);
}

for (const [port, ios] of Object.entries(dcxxByPort).sort()) {
  console.log(`  Port ${port}: ${ios.length} references`);
  for (const io of ios) {
    const t = io.trace;
    let loadInfo = '';
    if (t.bcLoadAddr !== null) {
      const bcStr = t.bcValue !== 'indirect' ? hex(t.bcValue, 6) : 'indirect';
      loadInfo = ` (BC @ ${hex(t.bcLoadAddr)})`;
    }
    console.log(`    ${hex(io.addr)}  ${io.type.padEnd(3)}  ${io.asm}${loadInfo}`);
  }
}

console.log('');
console.log('=== DIRECT IN/OUT WITH PORT BYTE 0xA0 ===');
console.log(`Found ${portA0Direct.length} direct IN A,(0xA0) / OUT (0xA0),A:\n`);

for (const io of portA0Direct) {
  console.log(`  ${hex(io.addr)}  ${io.type.padEnd(3)}  ${io.asm}`);
}

console.log('');
console.log(`=== UNRESOLVED I/O (no BC/C load found within 40 bytes) ===`);
console.log(`Count: ${unresolvedIO.length}`);
if (unresolvedIO.length <= 50) {
  for (const io of unresolvedIO) {
    console.log(`  ${hex(io.addr)}  ${io.type.padEnd(3)}  ${io.asm}`);
  }
}

// --- Step 5: Top ports by reference count ---

console.log('');
console.log('=== TOP 30 PORTS BY REFERENCE COUNT ===');

const sorted = Object.entries(allPortCounts)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);

for (const [port, count] of sorted) {
  console.log(`  ${port}: ${count} refs`);
}

// --- Step 6: Check peripherals.js coverage ---

console.log('');
console.log('=== PERIPHERALS.JS COVERAGE CHECK ===');

// Collect all unique DC-range ports found
const uniqueDCPorts = new Set();
for (const io of dcxxRefs) {
  uniqueDCPorts.add(io.trace.port & 0xFFFF);
}

console.log('Unique ports in 0xDCxx range found in ROM:');
for (const p of [...uniqueDCPorts].sort((a, b) => a - b)) {
  console.log(`  ${hex16(p)}`);
}

console.log('');
console.log('Checking if peripherals.js handles these ports:');

// Simple text search for each port in peripherals.js
for (const p of [...uniqueDCPorts].sort((a, b) => a - b)) {
  const hexLower = p.toString(16).toLowerCase();
  const hexUpper = p.toString(16).toUpperCase();
  const found = periphSrc.includes(`0x${hexLower}`) ||
                periphSrc.includes(`0x${hexUpper}`) ||
                periphSrc.includes(`0X${hexLower}`) ||
                periphSrc.includes(`0X${hexUpper}`);
  console.log(`  ${hex16(p)}: ${found ? 'HANDLED' : 'NOT HANDLED'}`);
}

// Also check 0xDCA0 explicitly
const dca0InPeriph = periphSrc.toLowerCase().includes('dca0');
console.log(`\n  Port 0xDCA0 in peripherals.js: ${dca0InPeriph ? 'YES' : 'NO'}`);

// --- Step 7: Context around 0x0236F9 (known event posting function) ---

console.log('');
console.log('=== CONTEXT: 0x0236F9 EVENT POSTING (session 583 reference) ===');

const knownAddr = 0x0236F9;
const nearby = dca0Refs.filter(io => Math.abs(io.addr - knownAddr) < 0x40);
if (nearby.length > 0) {
  console.log(`Found ${nearby.length} DCA0 ref(s) near 0x0236F9:`);
  for (const io of nearby) {
    console.log(`  ${hex(io.addr)}  ${io.asm}`);
  }
} else {
  console.log('No DCA0 refs found within 0x40 of 0x0236F9.');
  // Check wider range
  const wider = dca0Refs.filter(io => Math.abs(io.addr - knownAddr) < 0x100);
  if (wider.length > 0) {
    console.log(`Found ${wider.length} within 0x100:`);
    for (const io of wider) {
      console.log(`  ${hex(io.addr)}  ${io.asm}`);
    }
  }
}

console.log('');
console.log('=== SUMMARY ===');
console.log(`Total I/O instructions in ROM: ${ioInstructions.length}`);
console.log(`Port 0xDCA0 refs: ${dca0Refs.length}`);
console.log(`0xDCxx range refs: ${dcxxRefs.length}`);
console.log(`Direct port 0xA0 refs: ${portA0Direct.length}`);
console.log(`Unresolved port refs: ${unresolvedIO.length}`);
console.log(`Unique 0xDCxx ports: ${uniqueDCPorts.size}`);
console.log(`Port 0xDCA0 in peripherals.js: ${dca0InPeriph ? 'YES' : 'NO'}`);
console.log('');
console.log('Probe complete.');
