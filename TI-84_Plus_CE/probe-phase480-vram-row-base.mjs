/*
=== PROBE OUTPUT (phase 480 — VRAM row base variable search) ===

=== References to 0xD00598 ===
  Total: 0

=== References to 0xD00599 ===
  Total: 0

=== References to 0xD0059A ===
  Total: 0

=== References to 0xD0059B ===
  Total: 0

=== References to 0xD0059C ===
  0x04D179: LD HL,(0xD0059C)
  0x04D182: LD (0xD0059C),HL
  0x04D1E9: LD HL,(0xD0059C)
  0x04D1F2: LD (0xD0059C),HL
  0x04D229: LD HL,(0xD0059C)
  0x04D232: LD (0xD0059C),HL
  0x04D261: LD HL,(0xD0059C)
  0x04D26A: LD (0xD0059C),HL
  0x04D2D8: LD HL,(0xD0059C)
  0x04D2E1: LD (0xD0059C),HL
  0x04D310: LD HL,(0xD0059C)
  0x04D319: LD (0xD0059C),HL
  0x04D370: LD HL,(0xD0059C)
  0x04D379: LD (0xD0059C),HL
  0x04D3A0: LD HL,(0xD0059C)
  0x04D3A9: LD (0xD0059C),HL
  0x09150C: LD HL,(0xD0059C)
  0x09154D: LD HL,(0xD0059C)
  0x091553: LD (0xD0059C),HL
  0x091581: LD (0xD0059C),HL
  0x091638: LD HL,(0xD0059C)
  0x091672: LD HL,(0xD0059C)
  0x09167B: LD (0xD0059C),HL
  0x09EF7A: LD (0xD0059C),HL
  0x09EFA2: LD HL,(0xD0059C)
  0x09EFAB: LD (0xD0059C),HL
  0x09EFC0: LD (0xD0059C),HL
  0x09EFF0: LD HL,(0xD0059C)
  0x09EFF9: LD (0xD0059C),HL
  0x09F0A5: LD (0xD0059C),HL
  0x09F0EA: LD HL,(0xD0059C)
  0x09F0F3: LD (0xD0059C),HL
  0x09F141: LD (0xD0059C),HL
  0x09F18C: LD HL,(0xD0059C)
  0x09F195: LD (0xD0059C),HL
  0x0A17FA: LD (0xD0059C),HL
  0x0A1854: LD HL,(0xD0059C)
  0x0A185D: LD (0xD0059C),HL
  0x0A1866: LD HL,(0xD0059C)
  0x0A190F: LD HL,(0xD0059C)
  0x0A251C: LD (0xD0059C),HL
  0x0A2533: LD HL,(0xD0059C)
  0x0A2660: LD HL,(0xD0059C)
  0x0A2669: LD (0xD0059C),HL
  0x0A26B4: LD HL,(0xD0059C)
  0x0A26BD: LD (0xD0059C),HL
  Total: 46

=== References to 0xD0059D ===
  Total: 0

=== References to 0xD0059E ===
  Total: 0

=== References to 0xD0059F ===
  Total: 0

=== References to 0xD005A0 ===
  Total: 0

=== Renderer near D00595 read (0x005A8E) ===
0x005A80: 3e d0 6f 26 1c ed 6c cd 6e 59 00 e5 dd e1 3a 95
0x005A90: 05 d0 cd 48 5a 00 32 a0 05 d0 3a 96 05 d0 cd 53
0x005AA0: 5a 00 1e 0c fd cb 05 5e 28 04 2b 2b 1e 0e 16 00

=== D0059C write area (0x09EFC8) ===
0x09EFB0: 3d 20 d2 c3 01 f0 09 29 11 00 00 d4 19 c1 09 09
0x09EFC0: 22 9c 05 d0 c1 f1 40 ed 5b c0 2a cb 41 f5 c5 cb
0x09EFD0: 38 cb 19 41 20 08 73 23 72 23 c1 f1 18 11 73 23
0x09EFE0: 72 23 73 23 72 23 10 f6 c1 f1 28 03 73 23 72 c5
0x09EFF0: 2a 9c 05 d0 01 80 02 00 09 22 9c 05 d0 c1 3d 20

=== D0059C write area (0x09F139) ===
0x09F130: 00 00 60 2e a0 ed 6c 29 29 11 00 00 d4 19 c1 09
0x09F140: 09 22 9c 05 d0 c1 f1 40 ed 5b c0 2a cb 41 f5 c5
0x09F150: cb 38 cb 19 41 7e bb 20 4f 23 7e ba 20 06 2b 36

=== ANALYSIS ===
Key finding: D0059C has 46 references (confirming it as column pixel offset).
Addresses D00598-D0059B and D0059D-D005A0 have ZERO LD HL/DE references.
The VRAM row base is NOT stored as a standalone 3-byte variable in D00598-D005A0.

At 0x09EFB7-0x09EFBF: "29 11 00 00 D4 19 C1 09 09 22 9C 05 D0"
  This is: ADD HL,HL; LD DE,0xD40000; ADD HL,DE; POP BC; ADD HL,BC; ADD HL,BC; LD (D0059C),HL
  -> Row base is COMPUTED ON THE FLY: row * 2 * 320 + D40000 + 2*col_offset -> D0059C
  -> D0059C is actually an ABSOLUTE VRAM POINTER (computed from row + VRAM base + column)!

At 0x09F137-0x09F141: same pattern "11 00 00 D4 19 C1 09 09 22 9C 05 D0"
  -> LD DE,0xD40000; ADD HL,DE; POP BC; ADD HL,BC; ADD HL,BC; LD (D0059C),HL
  -> Confirms: D0059C = VRAM_BASE + row_offset + col_offset (absolute pointer)

CONCLUSION: There is NO separate VRAM row base variable. The row base is computed
inline each time from D40000 + row*640, and the result (including column offset)
is stored directly into D0059C. D0059C is therefore an ABSOLUTE VRAM POINTER,
not just a relative column offset as previously believed.
*/

import { readFileSync } from "node:fs";

const rom = readFileSync(new URL("./ROM.rom", import.meta.url));
const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, "0")}`;

const ROM_LIMIT = Math.min(0x400000, rom.length);
const cursorRefs = new Map();

function byteHex(v) {
  return v.toString(16).toUpperCase().padStart(2, "0");
}

function opcodeAt(offset, length) {
  return Array.from(rom.subarray(offset, offset + length), byteHex).join(" ");
}

function makeRef(offset, length, direction, target, mnemonic) {
  return {
    offset,
    opcode: opcodeAt(offset, length),
    direction,
    target,
    mnemonic,
  };
}

function collectLdHlFromAddr(ramAddr, label) {
  if (cursorRefs.has(ramAddr)) {
    return cursorRefs.get(ramAddr);
  }

  const lo = ramAddr & 0xff;
  const mid = (ramAddr >> 8) & 0xff;
  const hi = (ramAddr >> 16) & 0xff;
  const refs = [];

  for (let i = 0; i < ROM_LIMIT - 3; i++) {
    // LD HL,(addr) = 2A lo mid hi in ADL mode.
    if (rom[i] === 0x2a && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      refs.push(makeRef(i, 4, "read", ramAddr, `LD HL,(${label})`));
    }

    // LD (addr),HL = 22 lo mid hi.
    if (rom[i] === 0x22 && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      refs.push(makeRef(i, 4, "write", ramAddr, `LD (${label}),HL`));
    }

    if (i < ROM_LIMIT - 4) {
      // ED 27 variant with a 24-bit operand in mixed-mode code.
      if (rom[i] === 0xed && rom[i + 1] === 0x27 && rom[i + 2] === lo && rom[i + 3] === mid && rom[i + 4] === hi) {
        refs.push(makeRef(i, 5, "read", ramAddr, `ED 27 (${label})`));
      }

      // ED 6B variant: related indexed memory read form, included as a nearby candidate.
      if (rom[i] === 0xed && rom[i + 1] === 0x6b && rom[i + 2] === lo && rom[i + 3] === mid && rom[i + 4] === hi) {
        refs.push(makeRef(i, 5, "read", ramAddr, `ED 6B (${label})`));
      }
    }
  }

  cursorRefs.set(ramAddr, refs);
  return refs;
}

function printRef(ref) {
  console.log(`  ${hex(ref.offset)}: ${ref.opcode.padEnd(14)} ${ref.direction.padEnd(5)} target=${hex(ref.target)} ${ref.mnemonic}`);
}

function searchLdHlFromAddr(ramAddr, label) {
  const refs = collectLdHlFromAddr(ramAddr, label);
  console.log(`\n=== LD HL,(${label}) and LD (${label}),HL references ===`);
  for (const ref of refs) {
    printRef(ref);
  }
  console.log(`  Total: ${refs.length} references`);
}

function isD005xxRefAt(offset) {
  return offset >= 0 && offset + 2 < ROM_LIMIT && rom[offset + 1] === 0x05 && rom[offset + 2] === 0xd0;
}

function collectVramFragmentsNearD005xx() {
  const hits = [];
  const seen = new Set();
  const patterns = [
    { label: "D4 00 00", bytes: [0xd4, 0x00, 0x00] },
    { label: "00 00 D4", bytes: [0x00, 0x00, 0xd4] },
  ];

  for (let refOffset = 0; refOffset < ROM_LIMIT - 2; refOffset++) {
    if (!isD005xxRefAt(refOffset)) {
      continue;
    }

    const target = 0xd00500 | rom[refOffset];
    const start = Math.max(0, refOffset - 10);
    const end = Math.min(ROM_LIMIT - 3, refOffset + 10);

    for (let fragOffset = start; fragOffset <= end; fragOffset++) {
      for (const pattern of patterns) {
        if (rom[fragOffset] === pattern.bytes[0] && rom[fragOffset + 1] === pattern.bytes[1] && rom[fragOffset + 2] === pattern.bytes[2]) {
          const key = `${fragOffset}:${refOffset}:${pattern.label}`;
          if (!seen.has(key)) {
            hits.push({
              fragOffset,
              refOffset,
              target,
              pattern: pattern.label,
              distance: fragOffset - refOffset,
            });
            seen.add(key);
          }
        }
      }
    }
  }

  return hits;
}

function dumpHex(start, end) {
  for (let addr = start; addr < end; addr += 16) {
    const lineEnd = Math.min(addr + 16, end, rom.length);
    const bytes = Array.from(rom.subarray(addr, lineEnd), byteHex).join(" ");
    console.log(`  ${hex(addr)}: ${bytes}`);
  }
}

const cursorTargets = [];
for (let addr = 0xd00598; addr <= 0xd005a0; addr++) {
  const label = hex(addr);
  const refs = collectLdHlFromAddr(addr, label);
  cursorTargets.push({ addr, label, refs });
}

const vramNearD005xx = collectVramFragmentsNearD005xx();
const cursorRefCount = cursorTargets.reduce((sum, item) => sum + item.refs.length, 0);

console.log("=== Output Summary ===");
console.log(`ROM bytes scanned: ${hex(0)}-${hex(ROM_LIMIT - 1)} (${ROM_LIMIT} bytes)`);
console.log(`Cursor-area LD HL/(HL store) refs D00598-D005A0: ${cursorRefCount}`);
for (const { label, refs } of cursorTargets) {
  const readCount = refs.filter((ref) => ref.direction === "read").length;
  const writeCount = refs.filter((ref) => ref.direction === "write").length;
  console.log(`  ${label}: ${refs.length} total (${readCount} read, ${writeCount} write)`);
}
console.log(`VRAM base fragments within 10 bytes of D005xx references: ${vramNearD005xx.length}`);
console.log("Renderer dump: 0x005A80-0x005AB0");
console.log("D0059C write-site dump: 0x09EFB0-0x09F000");

// Search cursor-area variables D00598-D005A0.
for (const { addr, label } of cursorTargets) {
  searchLdHlFromAddr(addr, label);
}

console.log("\n=== VRAM base fragments near D005xx references ===");
for (const hit of vramNearD005xx) {
  console.log(
    `  ${hex(hit.fragOffset)}: ${hit.pattern.padEnd(8)} near ref=${hex(hit.refOffset)} ` +
      `delta=${hit.distance} target=${hex(hit.target)}`
  );
}
console.log(`  Total: ${vramNearD005xx.length} nearby VRAM fragments`);

// Hex dump key renderer areas.
console.log("\n=== 0x005A80-0x005AB0 (renderer at D00595 read site) ===");
dumpHex(0x005a80, 0x005ab0);

console.log("\n=== 0x09EFB0-0x09F000 (D0059C write sites) ===");
dumpHex(0x09efb0, 0x09f000);
