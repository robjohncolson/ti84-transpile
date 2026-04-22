#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const ROM_LABEL = 'TI-84_Plus_CE/ROM.rom';

const WINDOW_START = 0x03e180;
const WINDOW_END = 0x03e200;

const ENTRIES = [
  { address: 0x03e180, bytes: [0x02], mnemonic: 'ld (bc), a', comment: 'preceding helper tail' },
  { address: 0x03e181, bytes: [0x08], mnemonic: "ex af, af'" },
  { address: 0x03e182, bytes: [0xcd, 0xac, 0x1c, 0x0a], mnemonic: 'call 0x0a1cac', comment: 'preceding helper call' },
  { address: 0x03e186, bytes: [0xc9], mnemonic: 'ret' },
  { address: 0x03e187, bytes: [0x00], mnemonic: 'nop', comment: 'call target lands on a 4-byte NOP sled' },
  { address: 0x03e188, bytes: [0x00], mnemonic: 'nop' },
  { address: 0x03e189, bytes: [0x00], mnemonic: 'nop' },
  { address: 0x03e18a, bytes: [0x00], mnemonic: 'nop' },
  { address: 0x03e18b, bytes: [0xf5], mnemonic: 'push af', comment: '0x03e187 operational body begins here' },
  { address: 0x03e18c, bytes: [0xaf], mnemonic: 'xor a' },
  { address: 0x03e18d, bytes: [0xf3], mnemonic: 'di', comment: 'force interrupts off' },
  { address: 0x03e18e, bytes: [0x18, 0x00], mnemonic: 'jr 0x03e190' },
  { address: 0x03e190, bytes: [0xf3], mnemonic: 'di' },
  { address: 0x03e191, bytes: [0xed, 0x7e], mnemonic: 'rsmix', comment: 'clear MADL / leave mixed ADL mode' },
  { address: 0x03e193, bytes: [0xed, 0x56], mnemonic: 'im 1', comment: 'interrupt mode 1' },
  { address: 0x03e195, bytes: [0xed, 0x39, 0x28], mnemonic: 'out0 (0x28), a', comment: 'port 0x28 handshake begins' },
  { address: 0x03e198, bytes: [0xed, 0x38, 0x28], mnemonic: 'in0 a, (0x28)', comment: 'read back port 0x28 status' },
  { address: 0x03e19b, bytes: [0xcb, 0x57], mnemonic: 'bit 2, a', comment: 'flag test only, no branch follows' },
  { address: 0x03e19d, bytes: [0xed, 0x38, 0x06], mnemonic: 'in0 a, (0x06)', comment: 'read port 0x06' },
  { address: 0x03e1a0, bytes: [0xcb, 0x97], mnemonic: 'res 2, a', comment: 'clear bit 2 in the port 0x06 value' },
  { address: 0x03e1a2, bytes: [0xed, 0x39, 0x06], mnemonic: 'out0 (0x06), a', comment: 'write port 0x06 with bit 2 cleared' },
  { address: 0x03e1a5, bytes: [0x00], mnemonic: 'nop' },
  { address: 0x03e1a6, bytes: [0x00], mnemonic: 'nop' },
  { address: 0x03e1a7, bytes: [0x3e, 0x88], mnemonic: 'ld a, 0x88' },
  { address: 0x03e1a9, bytes: [0xed, 0x39, 0x24], mnemonic: 'out0 (0x24), a', comment: 'write 0x88 to port 0x24' },
  { address: 0x03e1ac, bytes: [0xfe, 0x88], mnemonic: 'cp 0x88' },
  { address: 0x03e1ae, bytes: [0xc2, 0x66, 0x00, 0x00], mnemonic: 'jp nz, 0x000066', comment: 'statically not taken after cp 0x88' },
  { address: 0x03e1b2, bytes: [0xf1], mnemonic: 'pop af', comment: 'restore original A/F for caller' },
  { address: 0x03e1b3, bytes: [0xc9], mnemonic: 'ret' },
  { address: 0x03e1b4, bytes: [0x32, 0x42, 0x05, 0xd0], mnemonic: 'ld (0xd00542), a', comment: 'scratch temporary at 0xd00542' },
  { address: 0x03e1b8, bytes: [0xed, 0x57], mnemonic: 'ld a, i', comment: 'P/V mirrors pre-entry IFF2' },
  { address: 0x03e1ba, bytes: [0xea, 0xc0, 0xe1, 0x03], mnemonic: 'jp pe, 0x03e1c0', comment: 'if prior IFF2=1, skip the second ld a, i' },
  { address: 0x03e1be, bytes: [0xed, 0x57], mnemonic: 'ld a, i', comment: 'refresh A/PV on the prior-IFF2=0 path' },
  { address: 0x03e1c0, bytes: [0xf3], mnemonic: 'di' },
  { address: 0x03e1c1, bytes: [0xf5], mnemonic: 'push af', comment: 'save flags with the original IFF2 snapshot in P/V' },
  { address: 0x03e1c2, bytes: [0x3a, 0x42, 0x05, 0xd0], mnemonic: 'ld a, (0xd00542)', comment: 'reload caller A from scratch temporary' },
  { address: 0x03e1c6, bytes: [0xcd, 0x87, 0xe1, 0x03], mnemonic: 'call 0x03e187', comment: 'interrupt-safe cleanup helper' },
  { address: 0x03e1ca, bytes: [0x32, 0x42, 0x05, 0xd0], mnemonic: 'ld (0xd00542), a', comment: 'preserve helper return A in scratch' },
  { address: 0x03e1ce, bytes: [0xf1], mnemonic: 'pop af' },
  { address: 0x03e1cf, bytes: [0xe2, 0xd4, 0xe1, 0x03], mnemonic: 'jp po, 0x03e1d4', comment: 'if prior IFF2=0, leave interrupts disabled' },
  { address: 0x03e1d3, bytes: [0xfb], mnemonic: 'ei', comment: 'restore interrupts when prior IFF2=1' },
  { address: 0x03e1d4, bytes: [0x3a, 0x42, 0x05, 0xd0], mnemonic: 'ld a, (0xd00542)', comment: 'restore A from scratch temporary' },
  { address: 0x03e1d8, bytes: [0xc9], mnemonic: 'ret' },
  { address: 0x03e1d9, bytes: [0xcd, 0xbd, 0xf7, 0x07], mnemonic: 'call 0x07f7bd', comment: 'adjacent helper, not used by 0x03e1b4' },
  { address: 0x03e1dd, bytes: [0xe6, 0x3f], mnemonic: 'and 0x3f' },
  { address: 0x03e1df, bytes: [0xfe, 0x15], mnemonic: 'cp 0x15' },
  { address: 0x03e1e1, bytes: [0xd0], mnemonic: 'ret nc' },
  { address: 0x03e1e2, bytes: [0xd6, 0x0f], mnemonic: 'sub 0x0f' },
  { address: 0x03e1e4, bytes: [0x3f], mnemonic: 'ccf' },
  { address: 0x03e1e5, bytes: [0xc9], mnemonic: 'ret' },
  { address: 0x03e1e6, bytes: [0xfd, 0xcb, 0x12, 0xd6], mnemonic: 'set 2, (iy+18)', comment: '0xd00092 (?shiftFlagsLoc, IY+18)' },
  { address: 0x03e1ea, bytes: [0xc9], mnemonic: 'ret' },
  { address: 0x03e1eb, bytes: [0xf5], mnemonic: 'push af', comment: 'adjacent helper, not used by 0x03e1b4' },
  { address: 0x03e1ec, bytes: [0xf3], mnemonic: 'di' },
  { address: 0x03e1ed, bytes: [0x3e, 0x8c], mnemonic: 'ld a, 0x8c' },
  { address: 0x03e1ef, bytes: [0xed, 0x39, 0x24], mnemonic: 'out0 (0x24), a', comment: 'write 0x8c to port 0x24' },
  { address: 0x03e1f2, bytes: [0xfe, 0x8c], mnemonic: 'cp 0x8c' },
  { address: 0x03e1f4, bytes: [0xc2, 0x66, 0x00, 0x00], mnemonic: 'jp nz, 0x000066', comment: 'statically not taken after cp 0x8c' },
  { address: 0x03e1f8, bytes: [0xed, 0x38, 0x06], mnemonic: 'in0 a, (0x06)', comment: 'read port 0x06' },
  { address: 0x03e1fb, bytes: [0xcb, 0xd7], mnemonic: 'set 2, a', comment: 'set bit 2 in the port 0x06 value' },
  { address: 0x03e1fd, bytes: [0xed, 0x39, 0x06], mnemonic: 'out0 (0x06), a', comment: 'write port 0x06 with bit 2 set' },
  { address: 0x03e200, bytes: [0x00], mnemonic: 'nop' },
];

function hex(value, width = 6) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function formatBytes(bytes) {
  return bytes.map((value) => value.toString(16).padStart(2, '0')).join(' ');
}

function verifyRangeCoverage() {
  if (ENTRIES[0].address !== WINDOW_START) {
    throw new Error(`First entry starts at ${hex(ENTRIES[0].address)}, expected ${hex(WINDOW_START)}`);
  }

  const lastEntry = ENTRIES[ENTRIES.length - 1];
  const lastByteAddress = lastEntry.address + lastEntry.bytes.length - 1;
  if (lastByteAddress !== WINDOW_END) {
    throw new Error(`Last entry ends at ${hex(lastByteAddress)}, expected ${hex(WINDOW_END)}`);
  }
}

function verifyBytes(romBytes) {
  for (const entry of ENTRIES) {
    const actual = Array.from(romBytes.slice(entry.address, entry.address + entry.bytes.length));
    const mismatch =
      actual.length !== entry.bytes.length ||
      actual.some((value, index) => value !== entry.bytes[index]);

    if (mismatch) {
      throw new Error(
        `ROM mismatch at ${hex(entry.address)}: expected [${formatBytes(entry.bytes)}], got [${formatBytes(actual)}]`,
      );
    }
  }
}

function printListing() {
  for (const entry of ENTRIES) {
    const bytesText = formatBytes(entry.bytes).padEnd(20);
    const comment = entry.comment ? ` ; ${entry.comment}` : '';
    console.log(`${hex(entry.address)}: ${bytesText} ${entry.mnemonic}${comment}`);
  }
}

function printSummary() {
  console.log('\n=== 0x03E1B4 side effects ===');
  console.log('- Direct RAM writes inside the wrapper: 0xd00542 only (scratch temporary). errNo is written earlier by 0x061db2.');
  console.log('- Interrupt-state wrapper: ld a, i snapshots IFF2 into P/V, di forces interrupts off for the call, and jp po / ei restores the pre-entry interrupt-enable state on exit.');
  console.log('- Helper 0x03e187 touches CPU execution state: di, rsmix (MADL=0), and im 1.');
  console.log('- Helper 0x03e187 touches ports: out0 (0x28), a with A=0x00, in0 a, (0x28), clear bit 2 and rewrite port 0x06, then out0 (0x24), a with A=0x88.');
  console.log('- Not modified in 0x03e1b4/0x03e187: errSP (0xd008e0) and the later JError IY-flag clears at 0x061dba..0x061dc6.');
  console.log('- Nearby but not on this call path: 0x03e1e6 sets bit 2 at IY+18 -> 0xd00092 (?shiftFlagsLoc).');
}

function main() {
  verifyRangeCoverage();

  const romBytes = fs.readFileSync(ROM_PATH);
  verifyBytes(romBytes);

  console.log('=== Phase 25AB: Error routine static disassembly ===');
  console.log(`ROM: ${ROM_LABEL}`);
  console.log(`Window: ${hex(WINDOW_START)}..${hex(WINDOW_END)}`);
  console.log('Focus: 0x03e187 helper entry/body and 0x03e1b4 wrapper');
  console.log('Manual byte verification against ROM.rom: passed\n');

  printListing();
  printSummary();
}

main();
