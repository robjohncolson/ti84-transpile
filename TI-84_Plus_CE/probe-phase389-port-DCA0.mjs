#!/usr/bin/env node
/**
 * probe-phase389-port-DCA0.mjs
 *
 * Investigate port 0xDCA0 — session 388 found that the universal key event
 * builder at 0x0236F9 reads this port (IN A,(0xDCA0)) just before returning.
 *
 * Goals:
 *   1. Decode the exact IN instruction near the end of 0x0236F9-0x023716
 *   2. Scan the entire 4MB ROM for all I/O references to port 0xDCA0
 *   3. Identify what peripheral lives at 0xDCA0
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const periphSrc = fs.readFileSync(path.join(__dirname, 'peripherals.js'), 'utf8');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(n, digits = 2) {
  return '0x' + n.toString(16).toUpperCase().padStart(digits, '0');
}

function hexDump(start, len) {
  const bytes = [];
  for (let i = 0; i < len && start + i < rom.length; i++) {
    bytes.push(rom[start + i].toString(16).padStart(2, '0'));
  }
  return bytes.join(' ');
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

// ---------------------------------------------------------------------------
// 1. Check peripherals.js for existing 0xDCA0 handling
// ---------------------------------------------------------------------------
console.log('=== 1. peripherals.js check for 0xDCA0 ===\n');

const dcRefs = periphSrc.match(/.*[Dd][Cc][Aa]0.*/g);
if (dcRefs && dcRefs.length > 0) {
  console.log('Found references:');
  dcRefs.forEach(line => console.log('  ' + line.trim()));
} else {
  console.log('No existing handler for port 0xDCA0 in peripherals.js.');
}

// Also check for any 0xDC__ range
const dcRange = periphSrc.match(/.*0x[Dd][Cc][0-9A-Fa-f]{2}.*/g);
if (dcRange && dcRange.length > 0) {
  console.log('\nReferences to 0xDCxx range:');
  const unique = [...new Set(dcRange.map(l => l.trim()))];
  unique.forEach(line => console.log('  ' + line));
} else {
  console.log('No references to 0xDCxx range at all.');
}

// ---------------------------------------------------------------------------
// 2. Decode the exact instruction at 0x0236F9 function end
// ---------------------------------------------------------------------------
console.log('\n=== 2. Decode instructions near end of 0x0236F9 block ===\n');

const FUNC_START = 0x0236F9;
const FUNC_END = 0x023716;

console.log(`Function range: ${hex(FUNC_START, 6)}-${hex(FUNC_END, 6)} (${FUNC_END - FUNC_START + 1} bytes)`);
console.log(`Hex dump ${hex(FUNC_START, 6)}-${hex(FUNC_END + 10, 6)}:`);
console.log('  ' + hexDump(FUNC_START, FUNC_END - FUNC_START + 11));
console.log();

// Focus on the area around the IN instruction — read 0x023700..0x023720
console.log('Focus area 0x023700-0x023720:');
console.log('  ' + hexDump(0x023700, 0x21));
console.log();

// Try to find IN instructions in the function body
// eZ80 IN patterns:
//   0xDB nn       -> IN A,(nn)  (8-bit port, z80-compat)
//   0xED 0x78     -> IN A,(C)   (port from BC)
//   0xED 0x38 nn  -> IN0 A,(nn) (internal I/O)

const inRefs = [];
for (let addr = FUNC_START; addr <= FUNC_END; addr++) {
  const b = rom[addr];

  // IN A,(nn)
  if (b === 0xDB && addr + 1 <= FUNC_END) {
    inRefs.push({
      addr,
      type: 'IN A,(n)',
      port: rom[addr + 1],
      len: 2,
      bytes: hexDump(addr, 2),
    });
  }

  // ED-prefixed
  if (b === 0xED && addr + 1 <= FUNC_END) {
    const b2 = rom[addr + 1];
    // IN r,(C) = ED 40+r*8: A=78, B=40, C=48, D=50, E=58, H=60, L=68, F=70
    if ((b2 & 0xC7) === 0x40) {
      const regIdx = (b2 >> 3) & 7;
      const regNames = ['B', 'C', 'D', 'E', 'H', 'L', 'F', 'A'];
      inRefs.push({
        addr,
        type: `IN ${regNames[regIdx]},(C)`,
        len: 2,
        bytes: hexDump(addr, 2),
      });
    }
    // IN0 A,(nn) = ED 38 nn
    if (b2 === 0x38 && addr + 2 <= FUNC_END) {
      inRefs.push({
        addr,
        type: 'IN0 A,(n)',
        port: rom[addr + 2],
        len: 3,
        bytes: hexDump(addr, 3),
      });
    }
  }
}

if (inRefs.length === 0) {
  console.log('No IN instructions found in function body — expanding search window...');
  // Search a wider window
  for (let addr = FUNC_START - 5; addr <= FUNC_END + 10; addr++) {
    const b = rom[addr];
    if (b === 0xDB) {
      console.log(`  ${hex(addr, 6)}: DB ${hex(rom[addr + 1])} — IN A,(${hex(rom[addr + 1])})`);
    }
    if (b === 0xED) {
      const b2 = rom[addr + 1];
      if ((b2 & 0xC7) === 0x40) {
        const regIdx = (b2 >> 3) & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', 'F', 'A'];
        console.log(`  ${hex(addr, 6)}: ED ${hex(b2)} — IN ${regNames[regIdx]},(C)`);
      }
      if (b2 === 0x38) {
        console.log(`  ${hex(addr, 6)}: ED 38 ${hex(rom[addr + 2])} — IN0 A,(${hex(rom[addr + 2])})`);
      }
    }
  }
} else {
  console.log('IN instructions found in function body:');
  for (const ref of inRefs) {
    let portInfo = '';
    if (ref.port !== undefined) {
      portInfo = ` port=${hex(ref.port)}`;
    }
    if (ref.type.includes('(C)')) {
      // Look backwards for LD BC,nnnn (0x01 nn nn nn in ADL mode, 0x01 nn nn in z80)
      portInfo = ' — port from BC register, searching for LD BC...';
      for (let scan = ref.addr - 20; scan < ref.addr; scan++) {
        if (rom[scan] === 0x01) {
          const lo = rom[scan + 1];
          const hi = rom[scan + 2];
          const ext = rom[scan + 3];
          // ADL mode: 4-byte LD BC,nnnnnn (01 ll hh ee)
          const port24 = lo | (hi << 8) | (ext << 16);
          const port16 = lo | (hi << 8);
          portInfo += `\n    Candidate LD BC at ${hex(scan, 6)}: ${hexDump(scan, 4)}`;
          portInfo += ` -> BC = ${hex(port24, 6)} (24-bit) or ${hex(port16, 4)} (16-bit)`;
        }
      }
    }
    console.log(`  ${hex(ref.addr, 6)}: [${ref.bytes}] ${ref.type}${portInfo}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Full ROM scan for port 0xDCA0 references
// ---------------------------------------------------------------------------
console.log('\n=== 3. Full ROM scan for port 0xDCA0 I/O references ===\n');

const results = [];
let inCount = 0;
let outCount = 0;

for (let addr = 0; addr < rom.length - 4; addr++) {
  const b = rom[addr];

  // --- Pattern A: IN A,(0xA0) = DB A0 ---
  if (b === 0xDB && rom[addr + 1] === 0xA0) {
    inCount++;
    results.push({
      addr,
      type: 'IN A,(0xA0)',
      bytes: hexDump(addr, 2),
      context: hexDump(Math.max(0, addr - 8), 20),
      contextStart: Math.max(0, addr - 8),
    });
  }

  // --- Pattern B: OUT (0xA0),A = D3 A0 ---
  if (b === 0xD3 && rom[addr + 1] === 0xA0) {
    outCount++;
    results.push({
      addr,
      type: 'OUT (0xA0),A',
      bytes: hexDump(addr, 2),
      context: hexDump(Math.max(0, addr - 8), 20),
      contextStart: Math.max(0, addr - 8),
    });
  }

  // --- Pattern C: IN A,(C) = ED 78 with nearby LD BC,0x00DCA0 = 01 A0 DC 00 ---
  if (b === 0xED && (rom[addr + 1] & 0xC7) === 0x40) {
    const regIdx = (rom[addr + 1] >> 3) & 7;
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', 'F', 'A'];
    // Search backwards up to 30 bytes for LD BC
    for (let scan = addr - 30; scan < addr; scan++) {
      if (scan < 0) continue;
      if (rom[scan] === 0x01) {
        const lo = rom[scan + 1];
        const hi = rom[scan + 2];
        const ext = rom[scan + 3];
        // Check for 0xDCA0 in 16-bit (lo=A0 hi=DC) or 24-bit (lo=A0 hi=DC ext=00)
        if (lo === 0xA0 && hi === 0xDC) {
          inCount++;
          results.push({
            addr,
            type: `IN ${regNames[regIdx]},(C) with LD BC,${hex(lo | (hi << 8) | (ext << 16), 6)} at ${hex(scan, 6)}`,
            bytes: hexDump(addr, 2),
            ldAddr: scan,
            context: hexDump(scan, addr - scan + 4),
            contextStart: scan,
          });
          break;
        }
      }
    }
  }

  // --- Pattern D: OUT (C),r = ED (41+r*8) with nearby LD BC,0x00DCA0 ---
  if (b === 0xED && (rom[addr + 1] & 0xC7) === 0x41) {
    const regIdx = (rom[addr + 1] >> 3) & 7;
    const regNames = ['B', 'C', 'D', 'E', 'H', 'L', 'F', 'A'];
    for (let scan = addr - 30; scan < addr; scan++) {
      if (scan < 0) continue;
      if (rom[scan] === 0x01) {
        const lo = rom[scan + 1];
        const hi = rom[scan + 2];
        const ext = rom[scan + 3];
        if (lo === 0xA0 && hi === 0xDC) {
          outCount++;
          results.push({
            addr,
            type: `OUT (C),${regNames[regIdx]} with LD BC,${hex(lo | (hi << 8) | (ext << 16), 6)} at ${hex(scan, 6)}`,
            bytes: hexDump(addr, 2),
            ldAddr: scan,
            context: hexDump(scan, addr - scan + 4),
            contextStart: scan,
          });
          break;
        }
      }
    }
  }

  // --- Pattern E: IN0 A,(0xA0) = ED 38 A0 ---
  if (b === 0xED && rom[addr + 1] === 0x38 && rom[addr + 2] === 0xA0) {
    inCount++;
    results.push({
      addr,
      type: 'IN0 A,(0xA0)',
      bytes: hexDump(addr, 3),
      context: hexDump(Math.max(0, addr - 8), 20),
      contextStart: Math.max(0, addr - 8),
    });
  }

  // --- Pattern F: OUT0 (0xA0),A = ED 39 A0 ---
  if (b === 0xED && rom[addr + 1] === 0x39 && rom[addr + 2] === 0xA0) {
    outCount++;
    results.push({
      addr,
      type: 'OUT0 (0xA0),A',
      bytes: hexDump(addr, 3),
      context: hexDump(Math.max(0, addr - 8), 20),
      contextStart: Math.max(0, addr - 8),
    });
  }
}

console.log(`Total I/O references found: ${results.length} (${inCount} IN reads, ${outCount} OUT writes)\n`);

for (const r of results) {
  console.log(`${hex(r.addr, 6)}: ${r.type}`);
  console.log(`  Bytes: ${r.bytes}`);
  console.log(`  Context from ${hex(r.contextStart, 6)}: ${r.context}`);
  console.log();
}

// ---------------------------------------------------------------------------
// 4. Broader scan: LD BC,0x00DCxx patterns (anything in the 0xDC00 range)
// ---------------------------------------------------------------------------
console.log('=== 4. All LD BC,0x00DCxx patterns (0xDC00-0xDCFF port range) ===\n');

const dcPorts = new Map(); // port -> [addrs]
for (let addr = 0; addr < rom.length - 4; addr++) {
  if (rom[addr] === 0x01 && rom[addr + 2] === 0xDC && rom[addr + 3] === 0x00) {
    const lo = rom[addr + 1];
    const port = 0xDC00 | lo;
    if (!dcPorts.has(port)) dcPorts.set(port, []);
    dcPorts.get(port).push(addr);
  }
}

if (dcPorts.size === 0) {
  console.log('No LD BC,0x00DCxx patterns found.');
} else {
  const sorted = [...dcPorts.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`Found ${sorted.length} distinct ports in 0xDC00-0xDCFF range:\n`);
  for (const [port, addrs] of sorted) {
    console.log(`  Port ${hex(port, 4)}: ${addrs.length} reference(s)`);
    for (const a of addrs.slice(0, 10)) {
      console.log(`    LD BC at ${hex(a, 6)} — context: ${hexDump(a, 12)}`);
      // Look ahead for IN/OUT (C)
      for (let scan = a + 4; scan < a + 30 && scan < rom.length - 1; scan++) {
        if (rom[scan] === 0xED) {
          const b2 = rom[scan + 1];
          if ((b2 & 0xC7) === 0x40) {
            const regIdx = (b2 >> 3) & 7;
            const regNames = ['B', 'C', 'D', 'E', 'H', 'L', 'F', 'A'];
            console.log(`      -> IN ${regNames[regIdx]},(C) at ${hex(scan, 6)}`);
            break;
          }
          if ((b2 & 0xC7) === 0x41) {
            const regIdx = (b2 >> 3) & 7;
            const regNames = ['B', 'C', 'D', 'E', 'H', 'L', 'F', 'A'];
            console.log(`      -> OUT (C),${regNames[regIdx]} at ${hex(scan, 6)}`);
            break;
          }
        }
      }
    }
    if (addrs.length > 10) console.log(`    ... and ${addrs.length - 10} more`);
    console.log();
  }
}

// ---------------------------------------------------------------------------
// 5. Peripheral identification
// ---------------------------------------------------------------------------
console.log('=== 5. Peripheral identification for 0xDCA0 ===\n');

console.log('Known TI-84 Plus CE (eZ80-based) I/O port ranges:');
console.log('  0x0000-0x00FF  — CPU control, GPIO, PLL, flash, timers');
console.log('  0x1000-0x1FFF  — LCD controller');
console.log('  0x2000-0x2FFF  — Flash controller');
console.log('  0x3000-0x3FFF  — Misc: RTC (0x3161-0x318D), interrupt controller');
console.log('  0x4000-0x4FFF  — USB controller');
console.log('  0x5000-0x5FFF  — Interrupt controller (INTC)');
console.log('  0x8000-0x8FFF  — SPI / LCD data');
console.log('  0xA000-0xA0FF  — Keyboard controller');
console.log('  0xB000-0xB0FF  — Backlight');
console.log('  0xC000-0xCFFF  — Crypto engine / SHA accelerator (CE-specific)');
console.log('  0xD000-0xDFFF  — Extended peripherals');
console.log();

const portAddr = 0xDCA0;
console.log(`Port ${hex(portAddr, 4)} falls in the 0xDC00-0xDCFF sub-range.`);
console.log();
console.log('Possible identifications:');
console.log('  1. SHA-256 hardware accelerator status/data register');
console.log('     (CE has crypto hardware in 0xC000-0xDFFF range)');
console.log('  2. DMA controller status register');
console.log('  3. USB-related extended register');
console.log('  4. Hardware random number generator (HRNG)');
console.log('  5. Power management / voltage regulator status');
console.log();

// Check if reads always happen in a "poll until bit set" pattern
console.log('=== 6. Instruction pattern analysis around each reference ===\n');

for (const r of results) {
  const addr = r.addr;
  console.log(`--- ${hex(addr, 6)}: ${r.type} ---`);

  // Dump 32 bytes before and 16 after for context
  const before = Math.max(0, addr - 32);
  const after = Math.min(rom.length, addr + 16);
  console.log(`  Before (${hex(before, 6)}): ${hexDump(before, addr - before)}`);
  console.log(`  At     (${hex(addr, 6)}):   ${hexDump(addr, Math.min(16, after - addr))}`);

  // Look for common patterns after the IN:
  // - AND n (E6 nn) — mask bits
  // - BIT n,A (CB 47/4F/57/5F/67/6F/77) — test specific bit
  // - JR NZ / JR Z — conditional branch (poll loop)
  // - CP n (FE nn) — compare
  // - RET (C9) — immediate return
  let scan = addr + (r.bytes.split(' ').length);
  const postBytes = [];
  for (let i = 0; i < 10 && scan + i < rom.length; i++) {
    postBytes.push(rom[scan + i]);
  }

  const postHex = postBytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
  console.log(`  Post-IN bytes: ${postHex}`);

  if (postBytes[0] === 0xE6) {
    console.log(`  -> AND ${hex(postBytes[1])}: masking to bits ${postBytes[1].toString(2).padStart(8, '0')}`);
  }
  if (postBytes[0] === 0xCB && (postBytes[1] & 0xC0) === 0x40) {
    const bit = (postBytes[1] >> 3) & 7;
    console.log(`  -> BIT ${bit},${['B','C','D','E','H','L','(HL)','A'][postBytes[1] & 7]}: testing bit ${bit}`);
  }
  if (postBytes[0] === 0xFE) {
    console.log(`  -> CP ${hex(postBytes[1])}: comparing with ${postBytes[1]}`);
  }
  if (postBytes[0] === 0xC9) {
    console.log(`  -> RET: value returned immediately (not tested/masked)`);
  }
  if (postBytes[0] === 0x20) {
    console.log(`  -> JR NZ,${postBytes[1] > 127 ? postBytes[1] - 256 : postBytes[1]}: poll loop if non-zero`);
  }
  if (postBytes[0] === 0x28) {
    console.log(`  -> JR Z,${postBytes[1] > 127 ? postBytes[1] - 256 : postBytes[1]}: poll loop if zero`);
  }
  console.log();
}

// ---------------------------------------------------------------------------
// 7. Summary
// ---------------------------------------------------------------------------
console.log('=== 7. Summary ===\n');
console.log(`Port 0xDCA0 references: ${results.length} total (${inCount} reads, ${outCount} writes)`);
console.log(`Ports in 0xDC00-0xDCFF range: ${dcPorts.size} distinct ports`);
if (dcPorts.size > 0) {
  console.log(`  Ports: ${[...dcPorts.keys()].sort().map(p => hex(p, 4)).join(', ')}`);
}
console.log();
console.log('The key event builder at 0x0236F9 reads port 0xDCA0 near its end.');
console.log('This is likely a hardware status register consulted during key event');
console.log('processing — possibly for timing, debounce state, or crypto/DMA status.');
