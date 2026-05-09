#!/usr/bin/env node

/**
 * Phase 278: Investigate 10-byte vs 9-byte stride discrepancy in dispatch table
 *
 * Session 271 decoded 0x084711 polling loop with 10-byte stride.
 * Session 277 decoded 0x08267D insertion with BC=9 (9-byte entries).
 * Session 275 says table size = (D3FFFF - D0259A) / 9.
 *
 * This probe:
 *   1. Re-disassembles 0x082BE2 (DEC helper) — count exact DEC HL instructions
 *   2. Re-disassembles 0x084711-0x084740 (polling loop) — map HL movement
 *   3. Re-disassembles 0x08267D insertion area and 0x08262B shift area
 *   4. Proposes entry format
 *   5. Dynamic verification: boots, seeds entry, traces HL movement
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

// Boot config
const BOOT_PC = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_STEPS = 50000;
const BOOT_LOOP_LIMIT = 10000;

// Runtime constants
const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const FLAG_C = 0x01;
const FLAG_Z = 0x40;

// Key addresses
const DEC_HELPER = 0x082BE2;           // DEC HL helper called by polling loop
const POLLING_LOOP_START = 0x084711;   // Polling loop start
const POLLING_LOOP_END = 0x084750;     // Extended range for safety
const INSERTION_ENTRY = 0x08267D;      // Insertion entry point
const INSERTION_SHIFT = 0x08262B;      // LDIR/LDDR shift area
const TABLE_TOP_PTR = 0xD0259A;       // 24-bit pointer to table top
const D005F8 = 0xD005F8;              // Key bytes start
const D005F9 = 0xD005F9;
const D005FA = 0xD005FA;
const D005FB = 0xD005FB;

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (v) => hexByte(v)).join(' ');
}

function up(name) {
  return name === '(hl)' ? '(HL)' : String(name).toUpperCase();
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0) |
    ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) |
    ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function readWidth(mem, addr, width) {
  if (width === 1) return mem[addr & MEM_MASK] ?? 0;
  if (width === 2) {
    const base = addr & MEM_MASK;
    return ((mem[base] ?? 0) | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8)) >>> 0;
  }
  return read24(mem, addr);
}

function bytesAt(mem, addr, count) {
  return Array.from({ length: count }, (_, i) => mem[(addr + i) & MEM_MASK] ?? 0);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot) {
  for (const f of CPU_FIELDS) cpu[f] = snapshot[f];
}

function snapshotRuntime(cpu, mem) {
  return { cpu: snapshotCpu(cpu), memory: new Uint8Array(mem) };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  restoreCpu(cpu, snapshot.cpu);
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase278-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function formatDecoded(inst) {
  switch (inst.tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'push': return `PUSH ${up(inst.pair)}`;
    case 'pop': return `POP ${up(inst.pair)}`;
    case 'ld-pair-imm': return `LD ${up(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${up(inst.pair)}`
        : `LD ${up(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-reg-mem': return `LD ${up(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-reg-ind': return `LD ${up(inst.dest)}, (${up(inst.src)})`;
    case 'ld-ind-reg': return `LD (${up(inst.dest)}), ${up(inst.src)}`;
    case 'ld-reg-reg': return `LD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'ld-reg-imm': return `LD ${up(inst.dest)}, ${hexByte(inst.value)}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${up(inst.src)}`;
    case 'add-pair': return `ADD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'sbc-pair': return `SBC HL, ${up(inst.src)}`;
    case 'inc-pair': return `INC ${up(inst.pair)}`;
    case 'dec-pair': return `DEC ${up(inst.pair)}`;
    case 'inc-reg': return `INC ${up(inst.reg)}`;
    case 'dec-reg': return `DEC ${up(inst.reg)}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'bit-test': return `BIT ${inst.bit ?? '?'}, ${up(inst.reg ?? '?')}`;
    case 'lddr': return 'LDDR';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'ldi': return 'LDI';
    case 'cpl': return 'CPL';
    case 'nop': return 'NOP';
    case 'or-pair': return `OR A, ${up(inst.src)}`;
    case 'cp-ind': return `CP (${up(inst.src)})`;
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'daa': return 'DAA';
    case 'halt': return 'HALT';
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'out': return `OUT (${hexByte(inst.port)}), A`;
    case 'in': return `IN A, (${hexByte(inst.port)})`;
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-ix': return 'EX (SP), IX';
    case 'ex-sp-iy': return 'EX (SP), IY';
    default: return inst.tag ?? 'UNKNOWN';
  }
}

function disassembleRange(rom, start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst?.length ?? 1);
    const bytes = rom.subarray(pc, pc + length);
    rows.push({
      pc,
      bytes,
      length,
      inst,
      text: inst ? formatDecoded(inst) : `DB ${hexByte(rom[pc])}`,
    });
    pc += length;
  }
  return rows;
}

function printDisassembly(title, rows) {
  console.log(`=== ${title} ===`);
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${formatBytes(row.bytes).padEnd(24)}  ${row.text}`);
  }
  console.log('');
}

function captureRegs(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    c: !!(cpu.f & FLAG_C),
    z: !!(cpu.f & FLAG_Z),
  };
}

function formatRegs(regs) {
  return [
    `A=${hexByte(regs.a)}`,
    `F=${hexByte(regs.f)}`,
    `BC=${hex(regs.bc)}`,
    `DE=${hex(regs.de)}`,
    `HL=${hex(regs.hl)}`,
    `SP=${hex(regs.sp)}`,
    `C=${regs.c ? 1 : 0}`,
    `Z=${regs.z ? 1 : 0}`,
  ].join(' ');
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    console.log('=== Phase 278: Stride Discrepancy Investigation ===');
    console.log(`ROM=${ROM_PATH}`);
    console.log('');

    // ===================================================================
    // PART 1: Re-disassemble 0x082BE2 (DEC helper)
    // Count exact DEC HL instructions before RET
    // ===================================================================
    console.log('=====================================================');
    console.log('PART 1: DEC helper at 0x082BE2');
    console.log('=====================================================');

    // Disassemble enough to find the RET
    const decHelperRows = disassembleRange(rom, DEC_HELPER, DEC_HELPER + 0x20);
    printDisassembly('DEC helper 0x082BE2', decHelperRows);

    // Count DEC HL instructions before RET
    let decHlCount = 0;
    let foundRet = false;
    for (const row of decHelperRows) {
      if (row.inst?.tag === 'ret') {
        foundRet = true;
        break;
      }
      if (row.inst?.tag === 'dec-pair' && row.inst?.pair === 'hl') {
        decHlCount++;
      }
    }
    console.log(`DEC HL count before RET: ${decHlCount}`);
    console.log(`RET found: ${foundRet}`);

    // Also check if there are other instructions mixed in
    let otherInsts = 0;
    for (const row of decHelperRows) {
      if (row.inst?.tag === 'ret') break;
      if (!(row.inst?.tag === 'dec-pair' && row.inst?.pair === 'hl')) {
        otherInsts++;
        console.log(`  Non-DEC-HL instruction: ${hex(row.pc)} ${row.text}`);
      }
    }
    console.log(`Other instructions before RET: ${otherInsts}`);
    console.log('');

    // Also check raw bytes at 0x082BE2 to confirm
    console.log('Raw bytes at 0x082BE2 (first 20):');
    console.log(formatBytes(bytesAt(rom, DEC_HELPER, 20)));
    // eZ80 DEC HL in ADL mode = 0x2B, RET = 0xC9
    let byteDecCount = 0;
    for (let i = 0; i < 20; i++) {
      const b = rom[DEC_HELPER + i];
      if (b === 0xC9) { // RET
        console.log(`  Byte offset ${i}: RET (0xC9) - end of helper`);
        break;
      }
      if (b === 0x2B) { // DEC HL
        byteDecCount++;
      } else {
        console.log(`  Byte offset ${i}: 0x${b.toString(16).padStart(2, '0')} (NOT DEC HL)`);
      }
    }
    console.log(`Raw byte count of 0x2B (DEC HL) before 0xC9 (RET): ${byteDecCount}`);
    console.log('');

    // ===================================================================
    // PART 2: Polling loop at 0x084711
    // Map out exactly how HL moves through the table
    // ===================================================================
    console.log('=====================================================');
    console.log('PART 2: Polling loop at 0x084711');
    console.log('=====================================================');

    // Disassemble a wider range to capture the full loop
    const pollingRows = disassembleRange(rom, POLLING_LOOP_START, POLLING_LOOP_END);
    printDisassembly('Polling loop 0x084711-0x084750', pollingRows);

    // Also look at the context before 0x084711 to see how HL is initialized
    const preLoopRows = disassembleRange(rom, POLLING_LOOP_START - 0x30, POLLING_LOOP_START);
    printDisassembly('Pre-loop context 0x0846E1-0x084711', preLoopRows);

    // Analyze HL movement per iteration
    console.log('--- HL Movement Analysis ---');
    console.log('In each iteration of the polling loop:');
    console.log(`  1. CALL 0x082BE2 -> DEC HL x ${byteDecCount} (HL -= ${byteDecCount})`);

    // Count additional HL decrements in the loop body itself
    let loopBodyDecHL = 0;
    let loopBodyIncHL = 0;
    let ldAhlCount = 0;
    let cpCount = 0;
    for (const row of pollingRows) {
      if (row.inst?.tag === 'dec-pair' && row.inst?.pair === 'hl') loopBodyDecHL++;
      if (row.inst?.tag === 'inc-pair' && row.inst?.pair === 'hl') loopBodyIncHL++;
      if (row.inst?.tag === 'ld-reg-ind' && row.inst?.dest === 'a' && row.inst?.src === 'hl') ldAhlCount++;
      if (row.inst?.tag === 'alu-reg' && row.inst?.op === 'cp') cpCount++;
      if (row.inst?.tag === 'alu-imm' && row.inst?.op === 'cp') cpCount++;
    }
    console.log(`  Loop body DEC HL: ${loopBodyDecHL}`);
    console.log(`  Loop body INC HL: ${loopBodyIncHL}`);
    console.log(`  LD A,(HL) count: ${ldAhlCount}`);
    console.log(`  CP count: ${cpCount}`);
    console.log('');

    // ===================================================================
    // PART 3: Insertion at 0x08267D and shift at 0x08262B
    // ===================================================================
    console.log('=====================================================');
    console.log('PART 3: Insertion code (0x08262B and 0x08267D)');
    console.log('=====================================================');

    // Disassemble the shift area
    const shiftRows = disassembleRange(rom, INSERTION_SHIFT, INSERTION_SHIFT + 0x60);
    printDisassembly('Shift/insertion area 0x08262B-0x08268B', shiftRows);

    // Disassemble wider insertion entry area
    const insertionRows = disassembleRange(rom, INSERTION_ENTRY, INSERTION_ENTRY + 0x30);
    printDisassembly('Insertion entry 0x08267D-0x0826AD', insertionRows);

    // Look for LD BC,imm to find the stride/size constants
    console.log('--- Size constants found ---');
    for (const row of [...shiftRows, ...insertionRows]) {
      if (row.inst?.tag === 'ld-pair-imm') {
        console.log(`  ${hex(row.pc)}: LD ${up(row.inst.pair)}, ${hex(row.inst.value)} (=${row.inst.value})`);
      }
    }
    console.log('');

    // Look for LDIR/LDDR
    console.log('--- Block transfer instructions found ---');
    for (const row of [...shiftRows, ...insertionRows]) {
      if (['ldir', 'lddr', 'ldi', 'ldd'].includes(row.inst?.tag)) {
        console.log(`  ${hex(row.pc)}: ${row.text}`);
      }
    }
    console.log('');

    // ===================================================================
    // PART 4: Entry format hypothesis
    // ===================================================================
    console.log('=====================================================');
    console.log('PART 4: Entry Format Analysis');
    console.log('=====================================================');

    // Check what D005F9/FA/FB are used for (key comparison bytes)
    // Look at the CP instructions in the polling loop to see which bytes are compared
    console.log('Examining key comparison in polling loop:');
    for (const row of pollingRows) {
      const text = row.text;
      if (text.includes('CP') || text.includes('LD A,') || text.includes('DEC HL') || text.includes('INC HL')) {
        console.log(`  ${hex(row.pc)}: ${row.text}`);
      }
    }
    console.log('');

    // Check what 0x04C885 does with the entry (handler reader)
    console.log('--- Handler reader at 0x04C885 ---');
    const handlerRows = disassembleRange(rom, 0x04C885, 0x04C885 + 0x30);
    printDisassembly('Handler reader 0x04C885-0x04C8B5', handlerRows);

    // ===================================================================
    // PART 5: Dynamic verification
    // ===================================================================
    console.log('=====================================================');
    console.log('PART 5: Dynamic Verification');
    console.log('=====================================================');

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const executor = createExecutor(blocks, mem, {
      peripherals: createPeripheralBus({ timerInterrupt: false }),
    });
    const cpu = executor.cpu;

    // Boot
    const bootResult = executor.runFrom(BOOT_PC, BOOT_MODE, {
      maxSteps: BOOT_STEPS,
      maxLoopIterations: BOOT_LOOP_LIMIT,
    });
    console.log(`Boot: termination=${bootResult.termination} steps=${bootResult.steps}`);
    console.log('');

    const baseline = snapshotRuntime(cpu, mem);

    // Read table-top pointer after boot
    const tableTop = read24(mem, TABLE_TOP_PTR);
    console.log(`Table-top pointer D0259A after boot: ${hex(tableTop)}`);
    console.log(`D3FFFF region bytes (last 32):`);
    console.log(formatBytes(bytesAt(mem, 0xD3FFE0, 32)));
    console.log('');

    // ----- Experiment A: Trace the DEC helper directly -----
    console.log('--- Exp A: Direct trace of DEC helper 0x082BE2 ---');
    restoreRuntime(cpu, mem, baseline);
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = 1;
    cpu.mbase = MBASE;
    cpu._ix = IX_BASE;
    cpu._iy = IY_BASE;
    cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;
    write24(mem, cpu.sp, RETURN_SENTINEL);
    cpu.hl = 0xD3FFFF; // Set HL to top of table
    cpu.a = 0x00;
    cpu.f = 0x00;

    const hlBefore = cpu.hl & 0xFFFFFF;
    const decResult = executor.runFrom(DEC_HELPER, 'adl', {
      maxSteps: 20,
      maxLoopIterations: 100,
      onBlock(pc, mode, meta, step) {
        const regs = captureRegs(cpu);
        console.log(`  step=${step} pc=${hex(pc)} HL=${hex(regs.hl)}`);
      },
    });
    const hlAfter = cpu.hl & 0xFFFFFF;
    console.log(`  HL before: ${hex(hlBefore)} -> HL after: ${hex(hlAfter)}`);
    console.log(`  HL delta: ${hlBefore - hlAfter} (HL decreased by ${hlBefore - hlAfter})`);
    console.log(`  Termination: ${decResult.termination}`);
    console.log('');

    // ----- Experiment B: Seed a known entry and trace polling loop -----
    console.log('--- Exp B: Seed entry and trace polling loop 0x084711 ---');
    restoreRuntime(cpu, mem, baseline);

    // Seed a known 10-byte entry at D3FFF6 (10 bytes ending at D3FFFF)
    // Entry format hypothesis: [key3][key2][key1][data0..data6] = 10 bytes
    // But let's try seeding with different sizes to see what the loop actually reads
    const ENTRY_TOP = 0xD3FFFF;

    // Seed key bytes at D005F9, D005FA, D005FB (the comparison values)
    const KEY1 = 0xAA;
    const KEY2 = 0xBB;
    const KEY3 = 0xCC;
    mem[D005F9] = KEY1;
    mem[D005FA] = KEY2;
    mem[D005FB] = KEY3;

    // Seed a matching entry in the table at the top
    // We'll try 10-byte stride first: entry at D3FFF6-D3FFFF
    // Hypothesis: HL starts at D3FFFF+1, DEC helper subtracts N, then comparison
    // After DEC x N: HL points to key byte position
    // Let's seed various positions and see which the loop matches

    // Write known bytes at the top of the table
    // Fill D3FFF0-D3FFFF with a pattern
    for (let i = 0; i < 16; i++) {
      mem[0xD3FFF0 + i] = 0x00;
    }

    // Set table-top pointer to D3FFFF (one past last entry)
    write24(mem, TABLE_TOP_PTR, ENTRY_TOP);

    // Seed entry: try putting key bytes at specific offsets from D3FFFF
    // If DEC HL x N, then HL = D3FFFF - N, and CP (HL) compares key
    // So key byte 1 at D3FFFF - N, key byte 2 at D3FFFF - N + 1 (after DEC HL),
    // or maybe after INC HL or DEC HL adjustments in the comparison code

    // Let's just plant the key bytes everywhere and trace
    // Place KEY1 at D3FFFF-6 = D3FFF9, KEY2 at D3FFF8, KEY3 at D3FFF7
    // (If DEC HL x 6, HL goes from 0xD40000 to D3FFFA... or from D3FFFF to D3FFF9)
    const decN = byteDecCount; // from Part 1
    console.log(`DEC count from Part 1: ${decN}`);
    console.log(`If HL starts at ${hex(ENTRY_TOP)}, after DEC x ${decN}: HL = ${hex(ENTRY_TOP - decN)}`);

    // Seed the key at the position HL would land after DEC x N
    const keyPos = ENTRY_TOP - decN;
    mem[keyPos] = KEY1;       // First key byte comparison position
    mem[keyPos - 1] = KEY2;   // Second (after another DEC HL in loop body?)
    mem[keyPos - 2] = KEY3;   // Third
    // Also try other arrangements
    mem[keyPos + 1] = KEY1;
    mem[keyPos + 2] = KEY2;
    mem[keyPos + 3] = KEY3;

    console.log(`Key bytes seeded at multiple positions around ${hex(keyPos)}`);
    console.log(`Table region D3FFF0-D3FFFF: ${formatBytes(bytesAt(mem, 0xD3FFF0, 16))}`);
    console.log('');

    // Set up CPU for polling loop
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = 1;
    cpu.mbase = MBASE;
    cpu._ix = IX_BASE;
    cpu._iy = IY_BASE;
    cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;
    write24(mem, cpu.sp, RETURN_SENTINEL);
    cpu.hl = ENTRY_TOP + 1; // HL typically starts one past the top
    cpu.a = 0x00;
    cpu.f = 0x00;
    cpu.bc = 0x000000;
    cpu.de = 0x000000;

    // Also try starting HL at D3FFFF itself
    cpu.hl = ENTRY_TOP;

    const pollingTrace = [];
    const pollResult = executor.runFrom(POLLING_LOOP_START, 'adl', {
      maxSteps: 100,
      maxLoopIterations: 50,
      onBlock(pc, mode, meta, step) {
        const regs = captureRegs(cpu);
        const instTexts = (meta?.instructions ?? []).map((inst) => inst.dasm || formatDecoded(inst)).join(' | ');
        pollingTrace.push({ step, pc: pc & 0xFFFFFF, regs, instTexts });
      },
    });

    console.log('Polling loop trace:');
    for (const t of pollingTrace) {
      console.log(`  step=${String(t.step).padStart(3)} pc=${hex(t.pc)} ${formatRegs(t.regs)} :: ${t.instTexts}`);
    }
    console.log(`  Termination: ${pollResult.termination} lastPc=${hex(pollResult.lastPc)}`);
    console.log('');

    // ----- Experiment C: Trace the insertion at 0x08267D -----
    console.log('--- Exp C: Trace insertion at 0x08267D ---');
    restoreRuntime(cpu, mem, baseline);

    // Seed FindSym result: D005F8 descriptor
    const DESCRIPTOR_BYTES = [0x03, 0x58, 0x59, 0x5A, 0xD0, 0x81, 0x42, 0x7F];
    for (let i = 0; i < DESCRIPTOR_BYTES.length; i++) {
      mem[D005F8 + i] = DESCRIPTOR_BYTES[i];
    }

    // Set table-top to D3FFFF (empty table)
    write24(mem, TABLE_TOP_PTR, 0xD3FFFF);

    // Set up CPU
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = 1;
    cpu.mbase = MBASE;
    cpu._ix = IX_BASE;
    cpu._iy = IY_BASE;
    cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;
    write24(mem, cpu.sp, RETURN_SENTINEL);
    cpu.a = 0x00;
    cpu.f = 0x00; // carry clear (NC path taken)
    cpu.bc = 0x000000;
    cpu.de = 0xD3FFF0; // point DE at a valid entry area
    cpu.hl = 0xD3FFF0;

    const insertionTrace = [];
    const insertWrites = [];
    const origW8 = cpu.write8.bind(cpu);
    const origW16 = cpu.write16.bind(cpu);
    const origW24 = cpu.write24.bind(cpu);
    let insertStep = 0;

    cpu.write8 = (addr, val) => {
      const a = addr & 0xFFFFFF;
      if (a >= 0xD3F000 && a <= 0xD3FFFF) {
        insertWrites.push({ step: insertStep, addr: a, val: val & 0xFF, width: 1 });
      }
      if (a >= 0xD02590 && a <= 0xD025A0) {
        insertWrites.push({ step: insertStep, addr: a, val: val & 0xFF, width: 1, label: 'tablePtr' });
      }
      return origW8(addr, val);
    };
    cpu.write16 = (addr, val) => {
      const a = addr & 0xFFFFFF;
      if (a >= 0xD3F000 && a <= 0xD3FFFF) {
        insertWrites.push({ step: insertStep, addr: a, val: val & 0xFFFF, width: 2 });
      }
      return origW16(addr, val);
    };
    cpu.write24 = (addr, val) => {
      const a = addr & 0xFFFFFF;
      if (a >= 0xD3F000 && a <= 0xD3FFFF) {
        insertWrites.push({ step: insertStep, addr: a, val: val & 0xFFFFFF, width: 3 });
      }
      if (a >= 0xD02590 && a <= 0xD025A0) {
        insertWrites.push({ step: insertStep, addr: a, val: val & 0xFFFFFF, width: 3, label: 'tablePtr' });
      }
      return origW24(addr, val);
    };

    const insertResult = executor.runFrom(INSERTION_ENTRY, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 256,
      onBlock(pc, mode, meta, step) {
        insertStep = step;
        const regs = captureRegs(cpu);
        const instTexts = (meta?.instructions ?? []).map((inst) => inst.dasm || formatDecoded(inst)).join(' | ');
        insertionTrace.push({ step, pc: pc & 0xFFFFFF, regs, instTexts });
      },
    });

    // Restore original write functions
    cpu.write8 = origW8;
    cpu.write16 = origW16;
    cpu.write24 = origW24;

    console.log('Insertion trace:');
    for (const t of insertionTrace) {
      console.log(`  step=${String(t.step).padStart(3)} pc=${hex(t.pc)} ${formatRegs(t.regs)} :: ${t.instTexts}`);
    }
    console.log(`  Termination: ${insertResult.termination} lastPc=${hex(insertResult.lastPc)}`);
    console.log('');

    console.log('D3Fxxx writes during insertion:');
    for (const w of insertWrites) {
      const label = w.label ? ` [${w.label}]` : '';
      console.log(`  step=${w.step} write${w.width * 8}@${hex(w.addr)} = ${hex(w.val, w.width * 2)}${label}`);
    }
    console.log('');

    // Dump table region after insertion
    const tableTopAfter = read24(mem, TABLE_TOP_PTR);
    console.log(`Table-top pointer after insertion: ${hex(tableTopAfter)}`);
    console.log(`Table region D3FFF0-D3FFFF after insertion:`);
    console.log(formatBytes(bytesAt(mem, 0xD3FFF0, 16)));
    console.log(`Table region D3FFE0-D3FFEF after insertion:`);
    console.log(formatBytes(bytesAt(mem, 0xD3FFE0, 16)));
    console.log('');

    // ===================================================================
    // PART 6: Summary and hypothesis
    // ===================================================================
    console.log('=====================================================');
    console.log('PART 6: Summary');
    console.log('=====================================================');
    console.log(`DEC helper at 0x082BE2: ${byteDecCount} DEC HL instructions`);
    console.log(`Effective HL decrement per CALL 0x082BE2: ${byteDecCount}`);
    console.log('');
    console.log('Stride analysis:');
    console.log(`  Search stride (from polling loop): DEC helper (${byteDecCount}) + loop body adjustments`);
    console.log('  Insertion size: BC=9 from LD BC,imm at insertion code');
    console.log('');
    console.log('If search stride != insertion size, possible explanations:');
    console.log('  1. The DEC helper is NOT 6 DECs (may be 7 or 9)');
    console.log('  2. The loop body has additional HL adjustments (DEC/INC) for key comparison');
    console.log('  3. Search and insertion operate on different table formats');
    console.log('  4. Off-by-one: search counts a terminator/separator byte that insertion does not');

    console.log('');
    console.log(JSON.stringify({
      phase: 278,
      decHelper: {
        address: hex(DEC_HELPER),
        decHlCount: byteDecCount,
        rawByteScan: byteDecCount,
      },
      pollingLoop: {
        address: hex(POLLING_LOOP_START),
        bodyDecHL: loopBodyDecHL,
        bodyIncHL: loopBodyIncHL,
      },
    }, null, 2));

  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
