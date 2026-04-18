#!/usr/bin/env node
// Phase 173 — 0x0A2xxx Rendering Cluster Analysis
//
// Analyzes 9 ROM addresses in the 0x0A2xxx region that reference the display
// buffer at 0xD006C0.  Three parts:
//   A) Static disassembly map — hex bytes, instruction decode, direction, nearby LDIR/LDDR/CALL/JP
//   B) Dynamic trace — run stage 3 renderer and diff the display buffer before/after
//   C) Transpiled-block check — which addresses exist in PRELIFTED_BLOCKS

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

// ── Constants ────────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE3_ENTRY = 0x0A29EC;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOPS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOPS = 10000;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOPS = 32;
const STAGE3_MAX_STEPS = 50000;
const STAGE3_MAX_LOOPS = 500;

const STACK_RESET_TOP = 0xD1A87E;

const DISPLAY_BUF_START = 0xD006C0;
const DISPLAY_BUF_END = 0xD006FF;
const DISPLAY_BUF_LEN = DISPLAY_BUF_END - DISPLAY_BUF_START + 1; // 64

const MODE_BUF_START = 0xD020A6;
const MODE_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = MODE_TEXT.length; // 26

// The 9 ROM addresses from Phase 169 that reference 0xD006C0
const REFERENCE_ADDRESSES = [
  0x0A2000, 0x0A20B2, 0x0A2133, 0x0A21FF,
  0x0A2203, 0x0A22A4, 0x0A231D, 0x0A2394,
  0x0A2969,
];

const SCAN_RADIUS = 64;
const CONTEXT_BYTES_BEFORE = 10;
const CONTEXT_BYTES_TOTAL = 80;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function formatHexBytes(bytes) {
  return bytes.map(hexByte).join(' ');
}

function safeChar(b) {
  return (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
}

function formatAscii(bytes) {
  return bytes.map(safeChar).join('');
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem, stackBytes = 12) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function dumpDisplayBuffer(mem) {
  const bytes = [];
  for (let addr = DISPLAY_BUF_START; addr <= DISPLAY_BUF_END; addr++) {
    bytes.push(mem[addr]);
  }
  return bytes;
}

function seedModeBuffer(mem) {
  for (let i = 0; i < MODE_BUF_LEN; i++) {
    mem[MODE_BUF_START + i] = MODE_TEXT.charCodeAt(i);
  }
}

function seedDisplayBuffer(mem) {
  for (let i = 0; i < MODE_BUF_LEN && i < DISPLAY_BUF_LEN; i++) {
    mem[DISPLAY_BUF_START + i] = MODE_TEXT.charCodeAt(i);
  }
}

// ── eZ80 ADL mode opcode lookup tables ──────────────────────────────────────
// In ADL mode, LD rr,nnnnnn is a 4-byte instruction: opcode + 3-byte LE imm.
// The reference address bytes C0 06 D0 appear as the 3-byte LE form of 0xD006C0.

const LD_PAIR_IMM_OPCODES = {
  0x01: { mnemonic: 'LD BC', pair: 'BC' },
  0x11: { mnemonic: 'LD DE', pair: 'DE' },
  0x21: { mnemonic: 'LD HL', pair: 'HL' },
  0x31: { mnemonic: 'LD SP', pair: 'SP' },
};

const MEMORY_OPCODES = {
  0x22: 'LD (nn),HL',
  0x2A: 'LD HL,(nn)',
  0x32: 'LD (nn),A',
  0x3A: 'LD A,(nn)',
};

const CONTROL_FLOW_OPCODES = {
  0xCD: 'CALL',
  0xC3: 'JP',
  0xCA: 'JP Z',
  0xC2: 'JP NZ',
  0xDA: 'JP C',
  0xD2: 'JP NC',
  0xCC: 'CALL Z',
  0xC4: 'CALL NZ',
  0xDC: 'CALL C',
  0xD4: 'CALL NC',
};

// ── Load ROM ────────────────────────────────────────────────────────────────

const romBytes = fs.readFileSync(ROM_PATH);

// ── Part A: Static Disassembly Map ──────────────────────────────────────────

function classifyReference(rom, refAddr) {
  // The reference address is where bytes C0 06 D0 appear.
  // The instruction opcode is at refAddr - 1.
  const opcodeAddr = refAddr - 1;
  if (opcodeAddr < 0 || opcodeAddr >= rom.length) {
    return { instruction: 'OUT OF BOUNDS', direction: 'OTHER' };
  }

  const opcode = rom[opcodeAddr];

  // Check LD pair,imm24
  if (LD_PAIR_IMM_OPCODES[opcode]) {
    const info = LD_PAIR_IMM_OPCODES[opcode];
    let direction = 'OTHER';
    if (info.pair === 'HL') direction = 'READ (HL=source for LDIR)';
    if (info.pair === 'DE') direction = 'WRITE (DE=dest for LDIR)';
    if (info.pair === 'BC') direction = 'COUNT (BC=length for LDIR)';
    return {
      instruction: `${info.mnemonic},0xD006C0`,
      direction,
      opcode,
    };
  }

  // Check memory-mapped ops
  if (MEMORY_OPCODES[opcode]) {
    const mnem = MEMORY_OPCODES[opcode];
    const direction = mnem.startsWith('LD (') ? 'WRITE' : 'READ';
    return { instruction: `${mnem} [addr=0xD006C0]`, direction, opcode };
  }

  // Check control flow
  if (CONTROL_FLOW_OPCODES[opcode]) {
    return {
      instruction: `${CONTROL_FLOW_OPCODES[opcode]} 0xD006C0`,
      direction: 'CONTROL FLOW',
      opcode,
    };
  }

  // Check for ED-prefixed instructions (2 bytes before the imm24)
  if (opcodeAddr >= 1) {
    const prefix = rom[opcodeAddr - 1];
    if (prefix === 0xED) {
      const edOps = {
        0x43: 'LD (nn),BC',
        0x53: 'LD (nn),DE',
        0x63: 'LD (nn),HL',
        0x73: 'LD (nn),SP',
        0x4B: 'LD BC,(nn)',
        0x5B: 'LD DE,(nn)',
        0x6B: 'LD HL,(nn)',
        0x7B: 'LD SP,(nn)',
      };
      if (edOps[opcode]) {
        const direction = opcode < 0x4B ? 'WRITE (mem store)' : 'READ (mem load)';
        return { instruction: `${edOps[opcode]} [addr=0xD006C0]`, direction, opcode };
      }
    }
  }

  return {
    instruction: `UNKNOWN (preceding byte=${hexByte(opcode)})`,
    direction: 'OTHER',
    opcode,
  };
}

function scanNearby(rom, refAddr, radius) {
  const start = Math.max(0, refAddr - radius);
  const end = Math.min(rom.length - 1, refAddr + radius);

  const ldirAddrs = [];
  const lddrAddrs = [];
  const callAddrs = [];
  const jpAddrs = [];

  for (let addr = start; addr <= end - 1; addr++) {
    // LDIR = ED B0
    if (rom[addr] === 0xED && rom[addr + 1] === 0xB0) {
      ldirAddrs.push(addr);
    }
    // LDDR = ED B8
    if (rom[addr] === 0xED && rom[addr + 1] === 0xB8) {
      lddrAddrs.push(addr);
    }
    // CALL nn = CD xx xx xx (4 bytes in ADL)
    if (rom[addr] === 0xCD && addr + 3 <= end) {
      const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
      callAddrs.push({ addr, target });
    }
    // JP nn = C3 xx xx xx (4 bytes in ADL)
    if (rom[addr] === 0xC3 && addr + 3 <= end) {
      const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
      jpAddrs.push({ addr, target });
    }
  }

  return { ldirAddrs, lddrAddrs, callAddrs, jpAddrs };
}

function runPartA() {
  console.log('PHASE 173 RESULTS');
  console.log('=================');
  console.log('');
  console.log('Part A: Static classification');
  console.log('');

  // Target bytes: 0xD006C0 in LE = C0 06 D0
  const targetLo = 0xC0;
  const targetMid = 0x06;
  const targetHi = 0xD0;

  for (const refAddr of REFERENCE_ADDRESSES) {
    // Read context bytes
    const contextStart = Math.max(0, refAddr - CONTEXT_BYTES_BEFORE);
    const contextEnd = Math.min(romBytes.length, contextStart + CONTEXT_BYTES_TOTAL);
    const contextBytes = Array.from(romBytes.subarray(contextStart, contextEnd));

    // Verify the C0 06 D0 pattern at refAddr
    const byteAtRef = romBytes[refAddr];
    const byteAtRef1 = romBytes[refAddr + 1];
    const byteAtRef2 = romBytes[refAddr + 2];
    const patternMatch = (byteAtRef === targetLo && byteAtRef1 === targetMid && byteAtRef2 === targetHi);

    // Classify instruction
    const classification = classifyReference(romBytes, refAddr);

    // Scan nearby for LDIR/LDDR/CALL/JP
    const nearby = scanNearby(romBytes, refAddr, SCAN_RADIUS);

    console.log(`  ${hex(refAddr)}:`);
    console.log(`    Pattern C0 06 D0 at address: ${patternMatch ? 'YES' : 'NO'}`);
    if (!patternMatch) {
      console.log(`    Actual bytes: ${hexByte(byteAtRef)} ${hexByte(byteAtRef1)} ${hexByte(byteAtRef2)}`);
    }
    console.log(`    Context (${hex(contextStart)}..${hex(contextStart + contextBytes.length - 1)}):`);

    // Print context in 16-byte rows
    for (let i = 0; i < contextBytes.length; i += 16) {
      const chunk = contextBytes.slice(i, Math.min(i + 16, contextBytes.length));
      const addr = contextStart + i;
      const hexStr = chunk.map(hexByte).join(' ');
      const asciiStr = chunk.map(safeChar).join('');
      // Mark the reference address
      const marker = (addr <= refAddr && refAddr < addr + 16) ? ' <-- ref' : '';
      console.log(`      ${hex(addr)}: ${hexStr.padEnd(47)}  ${asciiStr}${marker}`);
    }

    console.log(`    Instruction: ${classification.instruction}`);
    console.log(`    Direction: ${classification.direction}`);

    // LDIR/LDDR
    if (nearby.ldirAddrs.length > 0) {
      console.log(`    LDIR within +/-${SCAN_RADIUS}: YES at ${nearby.ldirAddrs.map((a) => hex(a)).join(', ')}`);
    } else {
      console.log(`    LDIR within +/-${SCAN_RADIUS}: NO`);
    }
    if (nearby.lddrAddrs.length > 0) {
      console.log(`    LDDR within +/-${SCAN_RADIUS}: YES at ${nearby.lddrAddrs.map((a) => hex(a)).join(', ')}`);
    } else {
      console.log(`    LDDR within +/-${SCAN_RADIUS}: NO`);
    }

    // CALL/JP
    if (nearby.callAddrs.length > 0) {
      console.log(`    CALL within +/-${SCAN_RADIUS}:`);
      for (const c of nearby.callAddrs) {
        console.log(`      ${hex(c.addr)}: CALL ${hex(c.target)}`);
      }
    } else {
      console.log(`    CALL within +/-${SCAN_RADIUS}: none`);
    }
    if (nearby.jpAddrs.length > 0) {
      console.log(`    JP within +/-${SCAN_RADIUS}:`);
      for (const j of nearby.jpAddrs) {
        console.log(`      ${hex(j.addr)}: JP ${hex(j.target)}`);
      }
    } else {
      console.log(`    JP within +/-${SCAN_RADIUS}: none`);
    }

    console.log('');
  }
}

// ── Part B: Dynamic Trace During Stage 3 ────────────────────────────────────

async function runPartB() {
  console.log('Part B: Dynamic trace during stage 3');
  console.log('');

  // Load transpiled blocks
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;

  // Allocate memory and peripherals
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  console.log('  Cold boot...');
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: BOOT_MAX_LOOPS });

  // OS init
  console.log('  OS init (0x08C331)...');
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: KERNEL_INIT_MAX_STEPS, maxLoopIterations: KERNEL_INIT_MAX_LOOPS });

  // Post-init
  console.log('  Post-init (0x0802B2)...');
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: POST_INIT_MAX_STEPS, maxLoopIterations: POST_INIT_MAX_LOOPS });

  console.log('  Boot complete.');

  // Save snapshot
  const cpuSnap = snapshotCpu(cpu);
  const ramSnap = new Uint8Array(mem.length);
  ramSnap.set(mem);

  // Restore from snapshot
  restoreCpu(cpu, cpuSnap, mem);
  mem.set(ramSnap);

  // Seed display buffer with mode text
  seedDisplayBuffer(mem);
  console.log(`  Seeded display buffer (0xD006C0) with: "${MODE_TEXT}"`);

  // Seed mode buffer
  seedModeBuffer(mem);
  console.log(`  Seeded mode buffer (0xD020A6) with: "${MODE_TEXT}"`);

  // Snapshot display buffer BEFORE
  const bufBefore = dumpDisplayBuffer(mem);
  console.log(`  Buffer BEFORE stage 3:`);
  console.log(`    Hex: ${formatHexBytes(bufBefore.slice(0, 32))}`);
  console.log(`         ${formatHexBytes(bufBefore.slice(32))}`);
  console.log(`    ASCII: ${formatAscii(bufBefore)}`);

  // Run stage 3 renderer
  console.log(`  Running stage 3 (${hex(STAGE3_ENTRY)}) maxSteps=${STAGE3_MAX_STEPS}...`);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, 12);

  let stage3Result;
  try {
    stage3Result = executor.runFrom(STAGE3_ENTRY, 'adl', {
      maxSteps: STAGE3_MAX_STEPS,
      maxLoopIterations: STAGE3_MAX_LOOPS,
    });
    console.log(`  Stage 3 result: steps=${stage3Result.steps} termination=${stage3Result.termination} lastPc=${hex(stage3Result.lastPc)}`);
  } catch (err) {
    console.log(`  Stage 3 threw: ${err.message}`);
    stage3Result = { steps: 0, termination: 'error' };
  }

  // Snapshot display buffer AFTER
  const bufAfter = dumpDisplayBuffer(mem);
  console.log(`  Buffer AFTER stage 3:`);
  console.log(`    Hex: ${formatHexBytes(bufAfter.slice(0, 32))}`);
  console.log(`         ${formatHexBytes(bufAfter.slice(32))}`);
  console.log(`    ASCII: ${formatAscii(bufAfter)}`);

  // Diff
  const changedOffsets = [];
  for (let i = 0; i < bufBefore.length; i++) {
    if (bufBefore[i] !== bufAfter[i]) {
      changedOffsets.push(i);
    }
  }

  console.log(`  Changed: ${changedOffsets.length > 0 ? 'YES' : 'NO'}`);
  if (changedOffsets.length > 0) {
    console.log(`  Changed byte count: ${changedOffsets.length}`);
    console.log(`  Changed offsets (from 0xD006C0): ${changedOffsets.map((o) => `+${hex(o, 2)}`).join(', ')}`);
    console.log(`  Stage 3 WRITES to the display buffer.`);
    for (const off of changedOffsets.slice(0, 20)) {
      const addr = DISPLAY_BUF_START + off;
      console.log(`    ${hex(addr)}: ${hexByte(bufBefore[off])} -> ${hexByte(bufAfter[off])} (${safeChar(bufBefore[off])} -> ${safeChar(bufAfter[off])})`);
    }
    if (changedOffsets.length > 20) {
      console.log(`    ... and ${changedOffsets.length - 20} more`);
    }
  } else {
    console.log(`  Stage 3 READS the display buffer (no changes).`);
  }

  console.log('');

  return BLOCKS;
}

// ── Part C: Transpiled Block Check ──────────────────────────────────────────

function runPartC(BLOCKS) {
  console.log('Part C: Transpiled block check');
  console.log('');

  for (const addr of REFERENCE_ADDRESSES) {
    const keyAdl = `${addr.toString(16)}:adl`;
    const keyZ80 = `${addr.toString(16)}:z80`;
    const foundAdl = BLOCKS[keyAdl] !== undefined;
    const foundZ80 = BLOCKS[keyZ80] !== undefined;

    let status;
    if (foundAdl && foundZ80) {
      status = 'IN PRELIFTED_BLOCKS (adl + z80)';
    } else if (foundAdl) {
      status = 'IN PRELIFTED_BLOCKS (adl)';
    } else if (foundZ80) {
      status = 'IN PRELIFTED_BLOCKS (z80)';
    } else {
      status = 'NOT transpiled';
    }

    console.log(`  ${hex(addr)}: ${status}`);
  }

  // Also check nearby block keys in the 0x0A2xxx range
  console.log('');
  console.log('  Nearby transpiled blocks in 0x0A2000-0x0A2FFF:');
  const nearbyBlocks = Object.keys(BLOCKS)
    .filter((key) => {
      const addrHex = key.split(':')[0];
      const addr = parseInt(addrHex, 16);
      return addr >= 0x0A2000 && addr <= 0x0A2FFF;
    })
    .sort((a, b) => {
      const addrA = parseInt(a.split(':')[0], 16);
      const addrB = parseInt(b.split(':')[0], 16);
      return addrA - addrB;
    });

  if (nearbyBlocks.length === 0) {
    console.log('    (none)');
  } else {
    for (const key of nearbyBlocks) {
      const addrHex = key.split(':')[0];
      const addr = parseInt(addrHex, 16);
      console.log(`    ${hex(addr)} (${key})`);
    }
  }

  console.log('');
}

// ── Verdict ─────────────────────────────────────────────────────────────────

function printVerdict() {
  console.log('VERDICT:');
  console.log('  See above for per-address classification (READ/WRITE/OTHER),');
  console.log('  dynamic buffer mutation results, and transpiled block coverage.');
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  try {
    runPartA();
    const BLOCKS = await runPartB();
    runPartC(BLOCKS);
    printVerdict();
  } catch (err) {
    console.error('FATAL:', err);
    process.exit(1);
  }
}

main();
