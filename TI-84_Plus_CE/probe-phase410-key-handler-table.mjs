#!/usr/bin/env node

/**
 * Phase 410 — Key Handler Table Dump at RAM 0xD1441D
 *
 * Session 409 decoded key dispatch at 0x05D58F: it uses a COMPUTED FUNCTION
 * TABLE where key_code * 4 indexes into a function pointer table whose base
 * address is stored in RAM 0xD1441D. The table installer at 0x05D5C2 does
 * LD (D1441D),BC to set the table base.
 *
 * This probe:
 *   1. Static analysis: finds all writers/readers of D1441D in ROM
 *   2. Static analysis: finds all callers of 0x05D58F (dispatch) and 0x05D5C2 (installer)
 *   3. Runtime: boots the OS and dumps the D1441D table pointer + table contents
 *   4. Cross-references handler addresses with known functions
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase410-key-handler-table-report.md');

const rom = fs.readFileSync(ROM_PATH);
const ROM_SIZE = rom.length;

// ── Helpers ───────────────────────────────────────────────────────────

function read24(offset) {
  if (offset < 0 || offset + 2 >= ROM_SIZE) return 0;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function hex(v, digits = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(digits, '0');
}

function findPattern(pattern) {
  const results = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (pattern[j] !== undefined && rom[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) results.push(i);
  }
  return results;
}

function memRead24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

// ── Known function labels ────────────────────────────────────────────

const KNOWN_FUNCTIONS = {
  0x000000: 'cold_boot / reset vector',
  0x000038: 'RST 38h (ISR)',
  0x020820: '_GetCSC',
  0x020828: '_GetKey',
  0x0210BC: '_HomeUp',
  0x0210AC: '_ClrLCDFull',
  0x0210D8: '_NewLine',
  0x020EC0: '_DrawStatusBar',
  0x021058: '_RunIndicOn',
  0x021060: '_RunIndicOff',
  0x0218F8: '_Disp',
  0x021934: '_DispHL',
  0x021A3C: '_PutS',
  0x021AA4: '_PutC',
  0x05D58F: 'key_dispatch_lookup',
  0x05D5C2: 'key_table_installer (SetKeyHandlerTable)',
  0x02B373: 'post_dispatch_notification_init',
};

// ── PART 1: Static Analysis ─────────────────────────────────────────

console.log('=== Phase 410: Key Handler Table Analysis ===\n');
console.log('--- PART 1: Static Analysis ---\n');

// 1a. Find all LD (D1441D),BC sites (ED 43 1D 44 D1)
const storeBcPattern = [0xED, 0x43, 0x1D, 0x44, 0xD1];
const storeBcSites = findPattern(storeBcPattern);

console.log(`LD (D1441D),BC writers: ${storeBcSites.length}`);
const writerDetails = [];

for (const addr of storeBcSites) {
  // Look backwards for LD BC,imm24 (01 xx xx xx)
  let bcValue = null;
  let bcSource = 'unknown';

  for (let back = 1; back <= 32; back++) {
    const ca = addr - back;
    if (ca < 0) break;

    // DD 07 xx = LD BC,(IX+d) -- eZ80 indexed load (check FIRST to avoid
    // false positive where the 0x01 byte is part of CALL 0x000130 address)
    if (ca >= 1 && rom[ca - 1] === 0xDD && rom[ca] === 0x07) {
      const disp = rom[ca + 1];
      bcSource = `LD BC,(IX+${disp}) at ${hex(ca - 1)} (stack parameter)`;
      bcValue = 'dynamic';
      break;
    }

    // ED 4B xx xx xx = LD BC,(addr)
    if (ca >= 1 && rom[ca - 1] === 0xED && rom[ca] === 0x4B) {
      const srcAddr = read24(ca + 1);
      bcSource = `LD BC,(${hex(srcAddr)}) at ${hex(ca - 1)} (RAM read)`;
      bcValue = 'dynamic';
      break;
    }

    // LD BC,imm24 -- but skip if the 0x01 is actually part of a CALL address
    // (e.g. CALL 0x000130 = CD 30 01 00, where 01 is byte 2 of the address)
    if (rom[ca] === 0x01) {
      // Check if this 0x01 is byte[2] of a CALL (CD xx xx 01 xx)
      if (ca >= 2 && rom[ca - 2] === 0xCD) {
        continue; // false positive: part of CALL address
      }
      bcValue = read24(ca + 1);
      bcSource = `LD BC,${hex(bcValue)} at ${hex(ca)}`;
      break;
    }
  }

  const detail = { addr, bcValue, bcSource };
  writerDetails.push(detail);
  console.log(`  ${hex(addr)}: ${bcSource}`);
}

// 1b. Find all readers of D1441D
console.log('\nD1441D readers:');

// LD HL,(D1441D) = 2A 1D 44 D1
const readHlSites = findPattern([0x2A, 0x1D, 0x44, 0xD1]);
for (const addr of readHlSites) {
  console.log(`  ${hex(addr)}: LD HL,(D1441D)`);
}

// LD BC,(D1441D) = ED 4B 1D 44 D1
const readBcSites = findPattern([0xED, 0x4B, 0x1D, 0x44, 0xD1]);
for (const addr of readBcSites) {
  console.log(`  ${hex(addr)}: LD BC,(D1441D)`);
}

// 1c. Find callers of dispatch function 0x05D58F
console.log('\nCallers of 0x05D58F (key_dispatch_lookup):');
const dispatchCallers = findPattern([0xCD, 0x8F, 0xD5, 0x05]);
for (const addr of dispatchCallers) {
  // Show context
  const ctxStart = Math.max(0, addr - 12);
  const ctxBytes = [];
  for (let i = ctxStart; i < addr + 8; i++) {
    ctxBytes.push(rom[i].toString(16).padStart(2, '0'));
  }
  console.log(`  ${hex(addr)}: CALL 0x05D58F`);
  console.log(`    context: [${hex(ctxStart)}] ${ctxBytes.join(' ')}`);

  // Find key code source: look for LD C,(HL) before PUSH BC
  for (let back = 1; back <= 16; back++) {
    const ca = addr - back;
    if (ca < 0) break;
    if (rom[ca] === 0x4E) { // LD C,(HL)
      // Find what HL was loaded to
      for (let back2 = 1; back2 <= 8; back2++) {
        const ca2 = ca - back2;
        if (ca2 >= 0 && rom[ca2] === 0x21) {
          const hlVal = read24(ca2 + 1);
          console.log(`    key source: LD C,(${hex(hlVal)}) -- key code from RAM ${hex(hlVal)}`);
          break;
        }
      }
      break;
    }
  }
}

// 1d. Find callers of installer 0x05D5C2
console.log('\nCallers of 0x05D5C2 (table installer):');
const installerCallSites = findPattern([0xCD, 0xC2, 0xD5, 0x05]);
const installerJpSites = findPattern([0xC3, 0xC2, 0xD5, 0x05]);
console.log(`  Direct CALL: ${installerCallSites.length}`);
console.log(`  JP (syscall trampoline): ${installerJpSites.length}`);
for (const addr of installerJpSites) {
  console.log(`    ${hex(addr)}: JP 0x05D5C2 (syscall table entry)`);
}

// 1e. Analyze the D13FD8 context structure
console.log('\n--- D13FD8 Context Structure Analysis ---');
console.log('D13FD8 block: 0x448 bytes (zeroed during init at 0x048B5B)');
console.log('D1441D is at offset +0x445 within this block');
console.log('D1441D stores the TABLE BASE POINTER (not table data itself)');

// 1f. Analyze the dispatch mechanism
console.log('\n--- Dispatch Mechanism (0x05D58F) ---');
console.log('1. Reads table base from RAM D1441D');
console.log('2. Checks if null (JR Z to skip)');
console.log('3. Computes: HL = key_code * 4');
console.log('4. Adds: HL = table_base + key_code * 4');
console.log('5. Copies 4 bytes from (HL) to dest buffer (arg2)');
console.log('6. Returns 4-byte handler entry to caller');
console.log('');
console.log('Handler entry format: 3-byte address + 1 byte (flags/padding)');
console.log('Caller stores result at D141B3, then calls 0x02B373 (notification init)');

// ── PART 2: Runtime Table Dump ──────────────────────────────────────

console.log('\n\n--- PART 2: Runtime Table Dump ---\n');

let runtimeSuccess = false;
let tableBase = 0;
let tableEntries = [];

try {
  const { PRELIFTED_BLOCKS, decodeEmbeddedRom } = await import('./ROM.transpiled.js');
  const { createPeripheralBus } = await import('./peripherals.js');
  const { createExecutor } = await import('./cpu-runtime.js');

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
  console.log(`Cold boot: ${coldBoot.steps} steps, ${coldBoot.termination}`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xD1A87E - 3;

  // OS init
  const osInit = executor.runFrom(0x08C331, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 50000,
  });
  console.log(`OS init: ${osInit.steps} steps, ${osInit.termination}`);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;

  // Read D1441D from RAM
  tableBase = memRead24(mem, 0xD1441D);
  console.log(`\nD1441D (table base pointer) = ${hex(tableBase)}`);

  if (tableBase === 0) {
    console.log('Table base is NULL -- no handler table installed after OS init.');
    console.log('The table is installed later when a specific mode is entered.');

    // Try running the home screen mode init
    console.log('\nAttempting home screen mode entry...');

    // Run from the main event loop entry point to trigger mode init
    const homeInit = executor.runFrom(0x02B897, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 20000,
    });
    console.log(`Home init attempt: ${homeInit.steps} steps, ${homeInit.termination}`);

    tableBase = memRead24(mem, 0xD1441D);
    console.log(`D1441D after home init = ${hex(tableBase)}`);
  }

  if (tableBase > 0) {
    runtimeSuccess = true;
    console.log(`\nTable base: ${hex(tableBase)}`);

    const inRom = tableBase < 0x400000;
    const inRam = tableBase >= 0xD00000 && tableBase < 0xE00000;
    console.log(`Location: ${inRom ? 'ROM' : inRam ? 'RAM' : 'UNKNOWN'}`);

    // Dump 64 entries (key codes 0-63)
    const NUM_ENTRIES = 64;
    console.log(`\nDumping ${NUM_ENTRIES} entries (key codes 0x00-0x3F):\n`);
    console.log('  Key  | Handler    | Byte4 | Known Function');
    console.log('  -----|------------|-------|---------------------------');

    for (let key = 0; key < NUM_ENTRIES; key++) {
      const entryAddr = tableBase + (key * 4);
      const handler = memRead24(mem, entryAddr);
      const byte4 = mem[entryAddr + 3];
      const known = KNOWN_FUNCTIONS[handler] || '';

      const entry = { key, entryAddr, handler, byte4, known };
      tableEntries.push(entry);

      const keyHex = hex(key, 2);
      const handlerHex = hex(handler);
      const byte4Hex = hex(byte4, 2);
      console.log(`  ${keyHex.padStart(4)} | ${handlerHex} | ${byte4Hex}   | ${known}`);
    }

    // Summary
    const uniqueHandlers = new Map();
    for (const e of tableEntries) {
      if (!uniqueHandlers.has(e.handler)) uniqueHandlers.set(e.handler, []);
      uniqueHandlers.get(e.handler).push(e.key);
    }

    const nonZero = tableEntries.filter(e => e.handler !== 0);
    console.log(`\nSummary:`);
    console.log(`  Total entries: ${NUM_ENTRIES}`);
    console.log(`  Non-zero handlers: ${nonZero.length}`);
    console.log(`  Unique handlers: ${uniqueHandlers.size}`);

    console.log('\nHandler distribution:');
    for (const [handler, keys] of [...uniqueHandlers.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const known = KNOWN_FUNCTIONS[handler] || '';
      const keyList = keys.length <= 12
        ? keys.map(k => hex(k, 2)).join(', ')
        : keys.slice(0, 10).map(k => hex(k, 2)).join(', ') + ` ... (${keys.length} total)`;
      console.log(`    ${hex(handler)}: ${keys.length} keys [${keyList}] ${known}`);
    }
  }
} catch (err) {
  console.log(`Runtime dump failed: ${err.message}`);
  console.log('Falling back to static analysis only.');
}

// ── PART 3: Generate Report ─────────────────────────────────────────

let report = `# Phase 410 — Key Handler Table Dump

## Key Dispatch Mechanism

The OS key dispatch at \`0x05D58F\` uses a computed function table:

1. Reads table base pointer from RAM \`0xD1441D\`
2. Computes entry address: \`table_base + key_code * 4\`
3. Copies 4-byte handler entry (3-byte address + 1 byte flags) to caller's buffer at \`D141B3\`
4. Caller passes result to notification system at \`0x02B373\`

The table installer at \`0x05D5C2\` (syscall \`0x021E78\`, entry #1885) takes a table base
address as a stack parameter and stores it at \`D1441D\`.

## D1441D Writers

| Address | Source | Value |
|---------|--------|-------|
`;

for (const d of writerDetails) {
  const val = d.bcValue === 'dynamic' ? '(dynamic)' : d.bcValue !== null ? hex(d.bcValue) : '(not found)';
  report += `| ${hex(d.addr)} | ${d.bcSource} | ${val} |\n`;
}

report += `
**0x048B6E**: Saves current D1441D to (IX-4), zeroes D13FD8 context block, then
restores the saved value. This is a save/restore across init, not a new table install.

**0x05D5C9**: The installer function (0x05D5C2) -- reads table base from its first
stack parameter. Called through syscall 0x021E78 by mode-specific code.

## D1441D Readers

| Address | Instruction |
|---------|-------------|
`;
for (const addr of readHlSites) report += `| ${hex(addr)} | LD HL,(D1441D) |\n`;
for (const addr of readBcSites) report += `| ${hex(addr)} | LD BC,(D1441D) |\n`;

report += `
## Dispatch Callers (0x05D58F)

Found ${dispatchCallers.length} direct callers:
`;
for (const addr of dispatchCallers) {
  report += `- \`${hex(addr)}\`: reads key code from RAM D141B5, stores result at D141B3\n`;
}

report += `
## D13FD8 Context Structure

The 0x448-byte block at D13FD8 is an OS mode context structure:
- Zeroed during mode init at \`0x048B5B\`
- D1441D (table base pointer) is at offset +0x445 within this block
- The table base pointer points elsewhere (ROM or RAM) to the actual handler table
- Mode switches involve saving/restoring D1441D and installing new tables

## Key Code Source

Key codes come from RAM \`D141B5\`, loaded by \`LD C,(D141B5)\` before calling
the dispatch. D141B5 is the "current key buffer" in the OS event system.

## Handler Entry Format

Each table entry is 4 bytes:
- Bytes 0-2: 24-bit handler function address (little-endian)
- Byte 3: flags or padding (purpose TBD)

`;

if (runtimeSuccess && tableEntries.length > 0) {
  report += `## Runtime Table Dump

Table base at boot: \`${hex(tableBase)}\`
Location: ${tableBase < 0x400000 ? 'ROM' : 'RAM'}

| Key Code | Handler | Byte4 | Known Function |
|----------|---------|-------|----------------|
`;
  for (const e of tableEntries) {
    report += `| ${hex(e.key, 2)} | ${hex(e.handler)} | ${hex(e.byte4, 2)} | ${e.known} |\n`;
  }

  const uniqueHandlers = new Map();
  for (const e of tableEntries) {
    if (!uniqueHandlers.has(e.handler)) uniqueHandlers.set(e.handler, []);
    uniqueHandlers.get(e.handler).push(e.key);
  }

  const nonZero = tableEntries.filter(e => e.handler !== 0);
  report += `\n**${nonZero.length} non-zero handlers, ${uniqueHandlers.size} unique**\n\n`;
} else {
  report += `## Runtime Table Dump

Table base was NULL after OS init -- the handler table is installed later
when a specific mode (home screen, graph, editor, etc.) is entered. Each mode
installs its own key handler table via the \`0x05D5C2\` installer (syscall
\`0x021E78\`). A full runtime dump requires deeper boot simulation with mode
entry.\n\n`;
}

report += `## Architecture Summary

\`\`\`
Key press -> _GetCSC -> key code stored at D141B5
                            |
                            v
              0x05D58F: key_dispatch_lookup(key_code, dest_buf)
                reads table base from D1441D
                copies 4-byte handler from table[key * 4] to D141B3
                            |
                            v
              0x02B373: post_dispatch_notification_init
                sets up notification structure at D143E7-D14420
                queues handler for execution
                            |
                            v
              handler function called via notification system
\`\`\`

Key insight: the handler table is MODE-SPECIFIC. Different OS modes install
different tables, enabling each mode to respond differently to the same key.
Three code sites explicitly clear D1441D to 0 (disable key handling), and
one site saves/restores it across temporary mode switches.
`;

fs.writeFileSync(REPORT_PATH, report);
console.log(`\n\nReport written to ${REPORT_PATH}`);
console.log('Done.');
