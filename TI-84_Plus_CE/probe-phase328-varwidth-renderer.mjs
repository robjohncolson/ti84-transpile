#!/usr/bin/env node
// Phase 328 — Trace the variable-width text renderer at ROM 0x054FC6
//
// Called from font descriptor table record 0 at 0x0525D4 (bytes 3-5).
// Uses the font lookup at 0x0A5424 which copies a 25-byte glyph record
// to RAM 0xD005C5 (byte 0 = pixel width, bytes 3-24 = bitmap).
//
// Questions to answer:
//   1. How many instructions / basic blocks?
//   2. What VRAM addresses does it write to? (framebuffer at 0xD40000)
//   3. How does it use the width byte from the font record?
//   4. Where does it get the current screen X,Y position?
//   5. Does it call 0x0A5424 (font lookup) internally?
//   6. Does it advance the cursor after drawing?

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

// ── helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

// ── constants ────────────────────────────────────────────────────────

const FUNC_START = 0x054FC6;
const FONT_LOOKUP = 0x0A5424;
const FONT_TABLE_BASE = 0x0A3AFA;
const RECORD_SIZE = 25;
const DEST_RAM = 0xD005C5;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65FFF;  // 320*240*2 = 153600 = 0x25800 bytes

// ── Section 1: Static disassembly ────────────────────────────────────

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function disassembleFunction(start, maxInstructions = 200) {
  const instructions = [];
  const queue = [start];
  const visited = new Set();
  const basicBlocks = [];
  let currentBlockStart = null;

  while (queue.length > 0 && instructions.length < maxInstructions) {
    let pc = queue.shift();
    if (visited.has(pc)) continue;

    currentBlockStart = pc;

    while (!visited.has(pc) && instructions.length < maxInstructions) {
      visited.add(pc);
      const inst = decodeSafe(pc);
      if (!inst || !inst.length) break;
      instructions.push(inst);

      // Queue conditional branch targets
      if (inst.target !== undefined && !['jp', 'jr'].includes(inst.tag)) {
        // Conditional jump — queue both paths
        if (inst.tag.includes('conditional') ||
            inst.tag === 'call-conditional' ||
            inst.tag === 'jr-conditional' ||
            inst.tag === 'jp-conditional') {
          queue.push(inst.target);
        }
      }

      // Unconditional jump — queue target, stop linear walk
      if (inst.tag === 'jp' || inst.tag === 'jr') {
        if (inst.target !== undefined) {
          queue.push(inst.target);
        }
        break;
      }

      // RET/RETI/RETN — end of block
      if (['ret', 'reti', 'retn'].includes(inst.tag)) break;

      // Unconditional CALL — queue the fallthrough (call returns)
      // but also note the call target
      if (inst.tag === 'call' && inst.target !== undefined) {
        // Don't follow calls — just note them
      }

      pc = inst.nextPc ?? (pc + inst.length);
    }
  }

  return instructions.sort((a, b) => a.pc - b.pc);
}

function identifyBasicBlocks(instructions) {
  if (instructions.length === 0) return [];

  const blockStarts = new Set([instructions[0].pc]);

  for (const inst of instructions) {
    // Branch targets start new blocks
    if (inst.target !== undefined) {
      blockStarts.add(inst.target);
    }
    // Instruction after a branch starts a new block
    if (inst.tag.includes('conditional') || inst.tag === 'call' ||
        inst.tag === 'call-conditional') {
      const next = inst.nextPc ?? (inst.pc + inst.length);
      blockStarts.add(next);
    }
  }

  const blocks = [];
  let currentBlock = null;

  for (const inst of instructions) {
    if (blockStarts.has(inst.pc)) {
      if (currentBlock) blocks.push(currentBlock);
      currentBlock = { start: inst.pc, instructions: [inst] };
    } else if (currentBlock) {
      currentBlock.instructions.push(inst);
    }
  }
  if (currentBlock) blocks.push(currentBlock);

  return blocks;
}

function formatInst(inst) {
  const bytes = bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length)).padEnd(20);
  const parts = [inst.tag.toUpperCase()];
  if (inst.dest) parts.push(inst.dest.toUpperCase());
  if (inst.src) parts.push(inst.src.toUpperCase());
  if (inst.pair) parts.push(inst.pair.toUpperCase());
  if (inst.reg) parts.push(inst.reg.toUpperCase());
  if (inst.op) parts.push(`op=${inst.op}`);
  if (inst.target !== undefined) parts.push(`-> ${hex(inst.target)}`);
  if (inst.value !== undefined) parts.push(`val=${hex(inst.value, inst.value > 0xFF ? 6 : 2)}`);
  if (inst.bit !== undefined) parts.push(`bit=${inst.bit}`);
  if (inst.condition) parts.push(`cond=${inst.condition}`);
  if (inst.displacement !== undefined) parts.push(`disp=${inst.displacement}`);
  if (inst.indexRegister) parts.push(`idx=${inst.indexRegister}`);
  if (inst.indirectRegister) parts.push(`ind=${inst.indirectRegister}`);
  if (inst.addr !== undefined) parts.push(`addr=${hex(inst.addr)}`);
  if (inst.address !== undefined) parts.push(`address=${hex(inst.address)}`);

  return `${hex(inst.pc)}: ${bytes} ${parts.join(' ')}`;
}

console.log('Phase 328: Variable-width text renderer at 0x054FC6');
console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
console.log();

// ── Disassemble ──────────────────────────────────────────────────────

console.log('=== Static disassembly of 0x054FC6 ===');
console.log();

const instructions = disassembleFunction(FUNC_START, 200);

for (const inst of instructions) {
  console.log(`  ${formatInst(inst)}`);
}
console.log();

// ── Basic block analysis ─────────────────────────────────────────────

const blocks = identifyBasicBlocks(instructions);
console.log(`=== Basic block summary ===`);
console.log(`  Total instructions: ${instructions.length}`);
console.log(`  Basic blocks: ${blocks.length}`);
console.log();

for (const block of blocks) {
  const last = block.instructions[block.instructions.length - 1];
  const exitType = last.tag.includes('ret') ? 'RET' :
    last.tag.includes('jp') || last.tag.includes('jr') ? 'JUMP' :
    last.tag.includes('call') ? 'CALL' : 'FALLTHROUGH';
  console.log(`  Block at ${hex(block.start)}: ${block.instructions.length} instructions, exits via ${exitType}`);
}
console.log();

// ── Analysis: calls, VRAM refs, cursor reads ─────────────────────────

console.log('=== Key instruction analysis ===');
console.log();

// Find calls
const calls = instructions.filter(i =>
  i.tag === 'call' || i.tag === 'call-conditional');
console.log('  Calls made:');
for (const c of calls) {
  const target = c.target !== undefined ? hex(c.target) : '(indirect)';
  const isFontLookup = c.target === FONT_LOOKUP;
  console.log(`    ${hex(c.pc)}: CALL ${target}${isFontLookup ? ' *** FONT LOOKUP ***' : ''}`);
}
console.log();

// Check for calls to 0x0A5424
const callsFontLookup = calls.filter(c => c.target === FONT_LOOKUP);
console.log(`  Calls font lookup 0x0A5424: ${callsFontLookup.length > 0 ? 'YES' : 'NO'} (${callsFontLookup.length} calls)`);
console.log();

// Find memory references that could be VRAM
const memRefs = instructions.filter(i =>
  (i.addr !== undefined && i.addr >= VRAM_START && i.addr <= VRAM_END) ||
  (i.address !== undefined && i.address >= VRAM_START && i.address <= VRAM_END));
console.log(`  Direct VRAM address references: ${memRefs.length}`);
for (const m of memRefs) {
  console.log(`    ${hex(m.pc)}: ${m.tag} addr=${hex(m.addr ?? m.address)}`);
}
console.log();

// Find references to D005C5 (glyph record RAM)
const glyphRamRefs = instructions.filter(i =>
  (i.value === DEST_RAM) ||
  (i.addr === DEST_RAM) ||
  (i.address === DEST_RAM));
console.log(`  References to glyph RAM 0xD005C5: ${glyphRamRefs.length}`);
for (const m of glyphRamRefs) {
  console.log(`    ${formatInst(m)}`);
}
console.log();

// Find IY-indexed accesses (cursor position often stored via IY offsets)
const iyRefs = instructions.filter(i => i.indexRegister === 'iy');
console.log(`  IY-indexed accesses (OS system vars via IY+offset):`);
for (const m of iyRefs) {
  const offset = m.displacement;
  const sysAddr = offset !== undefined ? hex(0xD00080 + offset) : '?';
  console.log(`    ${hex(m.pc)}: ${m.tag} IY+${offset} (${sysAddr})`);
}
console.log();

// Find IX-indexed accesses
const ixRefs = instructions.filter(i => i.indexRegister === 'ix');
if (ixRefs.length > 0) {
  console.log(`  IX-indexed accesses:`);
  for (const m of ixRefs) {
    console.log(`    ${hex(m.pc)}: ${m.tag} IX+${m.displacement}`);
  }
  console.log();
}

// Find LDIR/LDI instructions (block copies, likely VRAM writes)
const blockCopies = instructions.filter(i =>
  i.tag === 'ldir' || i.tag === 'ldi' || i.tag === 'lddr');
console.log(`  Block copy instructions (LDIR/LDI/LDDR): ${blockCopies.length}`);
for (const m of blockCopies) {
  console.log(`    ${hex(m.pc)}: ${m.tag}`);
}
console.log();

// Look for known cursor position OS variables
// TI-84 CE common: curRow at (IY+0Ch), curCol at (IY+0Dh),
// penCol at D008D2 (2 bytes), penRow at D008D5 (1 byte)
console.log('=== Cursor / position references ===');

const knownCursorAddrs = [
  { addr: 0xD008D2, name: 'penCol (2 bytes)' },
  { addr: 0xD008D5, name: 'penRow (1 byte)' },
  { addr: 0xD008D4, name: 'penCol high byte' },
];

for (const { addr, name } of knownCursorAddrs) {
  const refs = instructions.filter(i =>
    i.value === addr || i.addr === addr || i.address === addr);
  if (refs.length > 0) {
    console.log(`  ${hex(addr)} (${name}): ${refs.length} references`);
    for (const r of refs) {
      console.log(`    ${formatInst(r)}`);
    }
  }
}

// Also check for nearby addresses that might be cursor-related
const nearbyRefs = instructions.filter(i => {
  const v = i.value ?? i.addr ?? i.address;
  return v !== undefined && v >= 0xD008D0 && v <= 0xD008E0;
});
if (nearbyRefs.length > 0) {
  console.log('  Addresses in D008D0-D008E0 range (likely cursor/pen state):');
  for (const r of nearbyRefs) {
    const v = r.value ?? r.addr ?? r.address;
    console.log(`    ${hex(r.pc)}: ref to ${hex(v)} — ${formatInst(r)}`);
  }
}
console.log();

// Check for references to text color or drawing state
const drawStateAddrs = [
  { addr: 0xD008CE, name: 'textFGColor' },
  { addr: 0xD008D0, name: 'textBGColor' },
  { addr: 0xD005C5, name: 'glyphRecord' },
  { addr: 0xD005DE, name: 'glyphRecord+25' },
];

console.log('=== Drawing state references ===');
for (const { addr, name } of drawStateAddrs) {
  const refs = instructions.filter(i =>
    i.value === addr || i.addr === addr || i.address === addr);
  if (refs.length > 0) {
    console.log(`  ${hex(addr)} (${name}): ${refs.length} references`);
    for (const r of refs) {
      console.log(`    ${formatInst(r)}`);
    }
  }
}
console.log();

// ── Section 2: Dynamic trace ─────────────────────────────────────────

// ── Sub-function 0x0553F0 disassembly ────────────────────────────────

console.log('=== Static disassembly of pixel writer 0x0553F0 ===');
console.log();

const pixWriterInsts = disassembleFunction(0x0553F0, 100);
for (const inst of pixWriterInsts) {
  console.log(`  ${formatInst(inst)}`);
}
console.log();

const pixWriterBlocks = identifyBasicBlocks(pixWriterInsts);
console.log(`  Sub-function 0x0553F0: ${pixWriterInsts.length} instructions, ${pixWriterBlocks.length} basic blocks`);
console.log();

// Also disassemble 0x000154 (called for VRAM address computation)
console.log('=== Static disassembly of VRAM calculator 0x000154 ===');
console.log();

const vramCalcInsts = disassembleFunction(0x000154, 60);
for (const inst of vramCalcInsts) {
  console.log(`  ${formatInst(inst)}`);
}
console.log();

console.log('=== Dynamic trace: 0x054FC6 with char \'A\' (0x41) ===');

const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    const r = spawnSync(process.execPath, [path.join(repoRoot, 'scripts', 'transpile-ti84-rom.mjs')], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    if (r.status !== 0) process.exit(r.status ?? 1);
  }
  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

async function main() {
  const blocks = await loadBlocks();
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);

  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  // ── Pre-populate font record for 'A' at D005C5 ────────────────────
  // The renderer may expect the font lookup to have already run,
  // or it may call 0x0A5424 itself. We'll pre-populate AND trace.
  const charCode = 0x41;
  const glyphAddr = FONT_TABLE_BASE + charCode * RECORD_SIZE;
  const glyphRecord = rom.subarray(glyphAddr, glyphAddr + RECORD_SIZE);
  const glyphWidth = glyphRecord[0];

  console.log(`  Glyph 'A' at ROM ${hex(glyphAddr)}: width=${glyphWidth}`);
  console.log(`  Raw: ${bytesToHex(glyphRecord)}`);
  console.log();

  // Copy glyph record to RAM (as if font lookup already ran)
  for (let i = 0; i < RECORD_SIZE; i++) {
    mem[DEST_RAM + i] = glyphRecord[i];
  }
  // Zero byte at D005DE + trailing bytes (as font lookup does)
  mem[0xD005DE] = 0x00;
  mem[0xD005DF] = 0x00;
  mem[0xD005E0] = 0x00;
  mem[0xD005E1] = 0x00;

  // ── Set up CPU state ───────────────────────────────────────────────
  // Entry code: PUSH IX; LD IX,0; ADD IX,SP → IX = frame pointer
  // Then loads char from (IX+6) = [original SP + 3] (above saved IX + ret addr)
  //
  // Stack layout at entry (before PUSH IX):
  //   [SP+0..2] = return address (3 bytes, pushed by CALL)
  //   [SP+3..5] = character argument (3 bytes, pushed by caller before CALL)
  //
  // After PUSH IX: IX = SP, so:
  //   (IX+0..2) = saved IX
  //   (IX+3..5) = return address
  //   (IX+6..8) = character argument
  //
  // We also check what other args might be at (IX+9), (IX+12) etc.
  // from the disassembly: (IX+9) is read at 0x05509B, (IX+12) bit test at 0x0550A1

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.a = 0;
  cpu._hl = 0;
  cpu._iy = 0xD00080;       // OS base pointer
  cpu.sp = 0xD1A87E;

  // Set pen position: penCol=0x0028 (40px from left), penRow=0x14 (20px from top)
  // penCol is 2 bytes LE at D008D2, penRow is 1 byte at D008D5
  mem[0xD008D2] = 0x28;     // penCol low
  mem[0xD008D3] = 0x00;     // penCol high
  mem[0xD008D5] = 0x14;     // penRow = 20

  // Set text colors: FG=black (0x0000), BG=white (0xFFFF) in RGB565
  mem[0xD008CE] = 0x00;     // textFGColor low
  mem[0xD008CF] = 0x00;     // textFGColor high
  mem[0xD008D0] = 0xFF;     // textBGColor low
  mem[0xD008D1] = 0xFF;     // textBGColor high

  // IY+0Ch = curRow, IY+0Dh = curCol (for large font mode)
  mem[0xD00080 + 0x0C] = 2; // curRow
  mem[0xD00080 + 0x0D] = 0; // curCol

  // Clear various flags
  mem[0xD000B5] = 0x00;     // (IY+53) — font mode flags
  // (IY+70) = D000C6 — bit 2 tested frequently (single/double height mode?)
  mem[0xD000C6] = 0x00;

  // Set up LCD / drawing state vars used by the renderer
  // D02FD6 — loaded at 0x054FF7, stored to (IX-18)
  mem[0xD02FD6] = 0x00;
  // D02FDC — compared against at 0x055065 (max row?)
  mem[0xD02FDC] = 0xEF;     // 239 = last row
  // D02FD9 — loaded at 0x055086, 3-byte value (screen width?)
  mem[0xD02FD9] = 0x40;     // 320 low
  mem[0xD02FDA] = 0x01;     // 320 high
  mem[0xD02FDB] = 0x00;
  // D02FE0 — loaded at 0x05501F and 0x055142, 3-byte (row stride in VRAM)
  // 320 pixels * 2 bytes = 640 = 0x280
  mem[0xD02FE0] = 0x80;
  mem[0xD02FE1] = 0x02;
  mem[0xD02FE2] = 0x00;
  // D02FE3 — loaded at 0x055033, 3-byte (VRAM base?)
  mem[0xD02FE3] = 0x00;
  mem[0xD02FE4] = 0x00;
  mem[0xD02FE5] = 0xD4;     // 0xD40000

  // D005F4 — loaded at 0x0550B2, 0x0550F9 (alpha/opacity for pixel writer)
  // 0xFF = fully opaque, 0x00 = transparent
  mem[0xD005F4] = 0xFF;

  // D026AA — loaded at 0x0550AD (SIS LD BC,(0x26AA) → D026AA), foreground color RGB565
  // Also loaded at 0x0550BC as single-byte write: LD A,(D026AA); LD (HL),A
  // Black = 0x0000 in RGB565
  mem[0xD026AA] = 0x00;    // FG color low byte
  mem[0xD026AB] = 0x00;    // FG color high byte
  // D026AC — loaded at 0x0550E1 (SIS LD BC,(0x26AC) → D026AC), background color RGB565
  // White = 0xFFFF in RGB565
  mem[0xD026AC] = 0xFF;    // BG color low byte
  mem[0xD026AD] = 0xFF;    // BG color high byte

  // Build the stack: push args then the simulated CALL return address
  // Arg at (IX+12) — flags byte, bit 0 tested. Set to 0 for now.
  cpu.sp -= 3;
  mem[cpu.sp] = 0x00; mem[cpu.sp + 1] = 0x00; mem[cpu.sp + 2] = 0x00;
  // Arg at (IX+9) — another parameter (checked at 0x05509B). Set to 0x01 (draw mode?)
  cpu.sp -= 3;
  mem[cpu.sp] = 0x01; mem[cpu.sp + 1] = 0x00; mem[cpu.sp + 2] = 0x00;
  // Arg at (IX+6) — character code
  cpu.sp -= 3;
  mem[cpu.sp] = charCode; mem[cpu.sp + 1] = 0x00; mem[cpu.sp + 2] = 0x00;
  // Push sentinel return address (simulating the CALL that got us here)
  const sentinel = 0xFEFEFE;
  cpu.sp -= 3;
  mem[cpu.sp] = sentinel & 0xFF;
  mem[cpu.sp + 1] = (sentinel >> 8) & 0xFF;
  mem[cpu.sp + 2] = (sentinel >> 16) & 0xFF;

  console.log(`  Initial CPU state:`);
  console.log(`    A=${hexByte(cpu.a)}, HL=${hex(cpu._hl)}, SP=${hex(cpu.sp)}`);
  console.log(`    IY=${hex(cpu._iy)}, (IY+53)=${hexByte(mem[0xD000B5])}`);
  console.log(`    penCol=${mem[0xD008D2] | (mem[0xD008D3] << 8)}, penRow=${mem[0xD008D5]}`);
  console.log();

  // ── Hook write8 to log VRAM writes ─────────────────────────────────
  const vramWrites = [];
  const allRamWrites = [];  // track ALL writes to D-range RAM
  const ramStateReads = [];
  const origWrite8 = cpu.write8.bind(cpu);
  const origRead8 = cpu.read8.bind(cpu);

  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    if (addr >= VRAM_START && addr <= VRAM_END) {
      vramWrites.push({ addr, value: value & 0xFF, width: 8 });
    }
    // Also track all D-range writes to find where pixels actually go
    if (addr >= 0xD00000 && addr < 0xE00000 && allRamWrites.length < 5000) {
      allRamWrites.push({ addr, value: value & 0xFF, width: 8 });
    }
    origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    if (addr >= VRAM_START && addr <= VRAM_END) {
      vramWrites.push({ addr, value: value & 0xFFFF, width: 16 });
    }
    if (addr >= 0xD00000 && addr < 0xE00000 && allRamWrites.length < 5000) {
      allRamWrites.push({ addr, value: value & 0xFFFF, width: 16 });
    }
    origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    if (addr >= VRAM_START && addr <= VRAM_END) {
      vramWrites.push({ addr, value: value & 0xFFFFFF, width: 24 });
    }
    if (addr >= 0xD00000 && addr < 0xE00000 && allRamWrites.length < 5000) {
      allRamWrites.push({ addr, value: value & 0xFFFFFF, width: 24 });
    }
    origWrite24(addr, value);
  };

  // Track reads from key RAM state areas
  cpu.read8 = (addr) => {
    const val = origRead8(addr);
    if (addr >= 0xD005C5 && addr < 0xD005E2) {
      ramStateReads.push({ addr, value: val, label: 'glyphRecord' });
    } else if (addr >= 0xD008CE && addr <= 0xD008D6) {
      ramStateReads.push({ addr, value: val, label: 'cursorOrColor' });
    }
    return val;
  };

  // ── Run the function ───────────────────────────────────────────────
  const blockLog = [];
  const missingLog = [];
  const pixWriterCalls = [];  // track state at entry to 0x0553F0

  try {
    const result = ex.runFrom(FUNC_START, 'adl', {
      maxSteps: 2000,
      maxLoopIterations: 64,
      onBlock: (pc, mode, meta, steps) => {
        blockLog.push({ pc, mode, steps });
        // Capture state when entering pixel writer or direct-write blocks
        if (pc === 0x0553F0 || pc === 0x0550BC || pc === 0x055103) {
          pixWriterCalls.push({
            pc, steps,
            hl: cpu._hl, de: cpu._de, bc: cpu._bc, a: cpu.a,
            sp: cpu.sp,
          });
        }
      },
      onMissingBlock: (pc, mode, steps) => {
        missingLog.push({ pc, mode, steps });
      },
    });

    console.log('  Execution result:');
    console.log(`    Steps (blocks executed): ${result.steps}`);
    console.log(`    Termination: ${result.termination}`);
    console.log(`    Last PC: ${hex(result.lastPc)}`);
    console.log(`    Final HL: ${hex(cpu._hl)}`);
    console.log(`    Final A: ${hexByte(cpu.a)}`);
    console.log(`    Final SP: ${hex(cpu.sp)}`);
    console.log(`    Final DE: ${hex(cpu._de)}`);
    console.log(`    Final BC: ${hex(cpu._bc)}`);
    console.log(`    Loops forced: ${result.loopsForced}`);
    console.log();

    // Block execution trace
    console.log('  Block execution trace (first 80):');
    for (const b of blockLog.slice(0, 80)) {
      console.log(`    step ${String(b.steps).padStart(4)}: ${hex(b.pc)} (${b.mode})`);
    }
    if (blockLog.length > 80) {
      console.log(`    ... (${blockLog.length - 80} more blocks)`);
    }
    console.log();

    // Missing blocks
    if (missingLog.length > 0) {
      console.log(`  Missing blocks: ${missingLog.length}`);
      for (const m of missingLog) {
        console.log(`    step ${m.steps}: ${hex(m.pc)} (${m.mode})`);
      }
      console.log();
    }

    // All RAM writes analysis — find where pixels actually land
    console.log(`  All RAM writes (D00000-DFFFFF): ${allRamWrites.length} total`);
    if (allRamWrites.length > 0) {
      // Group writes by 4K page
      const pages = new Map();
      for (const w of allRamWrites) {
        const page = w.addr & 0xFFF000;
        pages.set(page, (pages.get(page) || 0) + 1);
      }
      console.log('    Writes by 4K page:');
      for (const [page, count] of [...pages.entries()].sort((a, b) => a - b)) {
        console.log(`      ${hex(page)}: ${count} writes`);
      }

      // Show first 50 non-stack writes
      const nonStackWrites = allRamWrites.filter(w => w.addr < 0xD1A800 || w.addr > 0xD1A900);
      console.log(`    First 50 non-stack writes:`);
      for (const w of nonStackWrites.slice(0, 50)) {
        console.log(`      ${hex(w.addr)}: ${hexByte(w.value)}`);
      }
      if (nonStackWrites.length > 50) {
        console.log(`      ... (${nonStackWrites.length - 50} more)`);
      }
    }
    console.log();

    // VRAM writes analysis
    console.log(`  VRAM writes (D40000-D65FFF): ${vramWrites.length} total`);
    if (vramWrites.length > 0) {
      const minAddr = Math.min(...vramWrites.map(w => w.addr));
      const maxAddr = Math.max(...vramWrites.map(w => w.addr));
      console.log(`    Address range: ${hex(minAddr)} - ${hex(maxAddr)}`);

      // Convert to pixel coordinates
      // Each pixel is 2 bytes (RGB565), stride = 320*2 = 640
      const stride = 320 * 2;
      const pixelCoords = new Set();
      for (const w of vramWrites) {
        const offset = w.addr - VRAM_START;
        const row = Math.floor(offset / stride);
        const col = Math.floor((offset % stride) / 2);
        pixelCoords.add(`${col},${row}`);
      }
      console.log(`    Unique pixel positions touched: ${pixelCoords.size}`);

      // Show first 30 writes
      console.log('    First 30 writes:');
      for (const w of vramWrites.slice(0, 30)) {
        const offset = w.addr - VRAM_START;
        const row = Math.floor(offset / stride);
        const col = Math.floor((offset % stride) / 2);
        const byteInPixel = offset % 2 === 0 ? 'lo' : 'hi';
        console.log(`      ${hex(w.addr)}: ${hexByte(w.value)} (pixel ${col},${row} ${byteInPixel})`);
      }
      if (vramWrites.length > 30) {
        console.log(`      ... (${vramWrites.length - 30} more)`);
      }
    }
    console.log();

    // RAM state reads
    console.log(`  Key RAM state reads: ${ramStateReads.length}`);
    const glyphReads = ramStateReads.filter(r => r.label === 'glyphRecord');
    const cursorReads = ramStateReads.filter(r => r.label === 'cursorOrColor');
    if (glyphReads.length > 0) {
      console.log(`    Glyph record reads (D005C5-D005E1): ${glyphReads.length}`);
      // Show unique addresses read
      const uniqueGlyph = [...new Set(glyphReads.map(r => r.addr))].sort();
      for (const addr of uniqueGlyph) {
        const count = glyphReads.filter(r => r.addr === addr).length;
        const offset = addr - DEST_RAM;
        const meaning = offset === 0 ? 'WIDTH BYTE' :
          offset <= 2 ? 'padding' :
          offset <= 24 ? `bitmap row data (offset ${offset})` :
          `trailing (offset ${offset})`;
        console.log(`      ${hex(addr)} (offset ${offset}, ${meaning}): read ${count}x, value=${hexByte(mem[addr])}`);
      }
    }
    if (cursorReads.length > 0) {
      console.log(`    Cursor/color reads (D008CE-D008D6): ${cursorReads.length}`);
      const uniqueCursor = [...new Set(cursorReads.map(r => r.addr))].sort();
      for (const addr of uniqueCursor) {
        const count = cursorReads.filter(r => r.addr === addr).length;
        const name =
          addr === 0xD008CE ? 'textFGColor.lo' :
          addr === 0xD008CF ? 'textFGColor.hi' :
          addr === 0xD008D0 ? 'textBGColor.lo' :
          addr === 0xD008D1 ? 'textBGColor.hi' :
          addr === 0xD008D2 ? 'penCol.lo' :
          addr === 0xD008D3 ? 'penCol.hi' :
          addr === 0xD008D4 ? 'penCol.hi2' :
          addr === 0xD008D5 ? 'penRow' :
          addr === 0xD008D6 ? 'penRow+1' :
          `offset +${addr - 0xD008CE}`;
        console.log(`      ${hex(addr)} (${name}): read ${count}x, value=${hexByte(mem[addr])}`);
      }
    }
    console.log();

    // Check if cursor was advanced
    const finalPenCol = mem[0xD008D2] | (mem[0xD008D3] << 8);
    const finalPenRow = mem[0xD008D5];
    console.log('=== Cursor advancement check ===');
    console.log(`  penCol: before=40, after=${finalPenCol} (delta=${finalPenCol - 40})`);
    console.log(`  penRow: before=20, after=${finalPenRow} (delta=${finalPenRow - 20})`);
    console.log(`  Glyph width was: ${glyphWidth}`);
    if (finalPenCol !== 40) {
      console.log(`  >>> Cursor was advanced by ${finalPenCol - 40} pixels (glyph width=${glyphWidth})`);
    } else {
      console.log('  >>> Cursor NOT advanced (or renderer does not manage cursor)');
    }
    console.log();

    // Pixel writer call details
    console.log(`=== Pixel writer / direct write entries: ${pixWriterCalls.length} ===`);
    for (const c of pixWriterCalls.slice(0, 20)) {
      console.log(`  step ${String(c.steps).padStart(4)}: PC=${hex(c.pc)} HL=${hex(c.hl)} DE=${hex(c.de)} BC=${hex(c.bc)} A=${hexByte(c.a)}`);
    }
    if (pixWriterCalls.length > 20) {
      console.log(`  ... (${pixWriterCalls.length - 20} more)`);
    }
    console.log();

    // Block visit histogram
    console.log('=== Block visit counts ===');
    const visits = Object.entries(result.blockVisits).sort((a, b) => b[1] - a[1]);
    for (const [key, count] of visits.slice(0, 20)) {
      console.log(`  ${key}: ${count} visits`);
    }
    console.log();

  } catch (err) {
    console.log(`  Execution error: ${err.message}`);
    console.log(`  Stack: ${err.stack}`);
    console.log();
  }

  console.log('=== Summary ===');
  console.log(`  Function: ${hex(FUNC_START)} (variable-width text renderer)`);
  console.log(`  Static analysis: ${instructions.length} instructions, ${identifyBasicBlocks(instructions).length} basic blocks`);
  console.log();

  console.log('=== Done ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
