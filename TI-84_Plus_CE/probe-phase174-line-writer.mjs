#!/usr/bin/env node

/**
 * Phase 174 — 0x0A2133 Line-Writer Source Trace
 *
 * The function at ROM 0x0A2133 writes exactly 26 bytes (one screen line) to
 * the display buffer at 0xD006C0 via LDIR. This probe determines WHERE the
 * source bytes come from — specifically what HL points to when the LDIR
 * executes.
 *
 * Three parts:
 *   A) Static disassembly of 0x0A2100-0x0A2160
 *   B) Caller scan — find CALL/JP targeting 0x0A2120-0x0A2140 in the entire ROM
 *   C) Dynamic trace — run stage 3 and trap entries to block 0x0A2133
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

// ── Constants ────────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const RAM_START = 0x400000;
const RAM_END = 0xE00000;
const ADDRESS_MASK = 0xFFFFFF;

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
const MODE_BUF_START = 0xD020A6;
const MODE_TEXT = 'Normal Float Radian       ';

// Disassembly region for Part A
const DISASM_START = 0x0A2100;
const DISASM_END = 0x0A2160;

// Caller scan target range for Part B
const CALLER_TARGET_LO = 0x0A2120;
const CALLER_TARGET_HI = 0x0A2140;

// Block address to trap for Part C
const TRAP_BLOCK = 0x0A2133;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// ── Load ROM ─────────────────────────────────────────────────────────────────

const romBytes = fs.readFileSync(ROM_PATH);

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

function formatBytes(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

function safeChar(b) {
  return (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
}

function formatAscii(bytes) {
  return bytes.map(safeChar).join('');
}

function mnemonicOf(inst) {
  if (!inst) return '<null>';
  // Prefer the dasm field (from newer decoder), then mnemonic, then tag
  if (inst.dasm) return inst.dasm;
  if (inst.mnemonic) return inst.mnemonic;

  const { tag, pair, value, addr, src, dest, target } = inst;
  if (tag === 'ld-pair-imm') return `LD ${(pair || '??').toUpperCase()},${hex(value)}`;
  if (tag === 'ld-mem-reg') return `LD (${hex(addr)}),${(src || '?').toUpperCase()}`;
  if (tag === 'ld-mem-pair') return `LD (${hex(addr)}),${(pair || '?').toUpperCase()}`;
  if (tag === 'ld-reg-mem') return `LD ${(dest || '?').toUpperCase()},(${hex(addr)})`;
  if (tag === 'ld-pair-mem') return `LD ${(pair || '?').toUpperCase()},(${hex(addr)})`;
  if (tag === 'ldir') return 'LDIR';
  if (tag === 'lddr') return 'LDDR';
  if (tag === 'ldi') return 'LDI';
  if (tag === 'ldd') return 'LDD';
  if (tag === 'ret') return 'RET';
  if (tag === 'call') return `CALL ${hex(target)}`;
  if (tag === 'jp') return `JP ${hex(target)}`;
  if (tag === 'jr') return `JR ${hex(target)}`;
  if (tag === 'push') return `PUSH ${(pair || '?').toUpperCase()}`;
  if (tag === 'pop') return `POP ${(pair || '?').toUpperCase()}`;
  if (tag === 'nop') return 'NOP';
  if (tag === 'halt') return 'HALT';
  if (tag === 'di') return 'DI';
  if (tag === 'ei') return 'EI';
  return tag ? tag.toUpperCase() : '<unknown>';
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem, stackBytes = 12) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function seedAscii(mem, addr, text) {
  for (let i = 0; i < text.length; i++) {
    mem[addr + i] = text.charCodeAt(i) & 0xFF;
  }
}

function read24LE(buf, offset) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16);
}

// ── Part A: Static Disassembly ───────────────────────────────────────────────

function runPartA() {
  console.log('=== Part A: Static Disassembly 0x0A2100-0x0A2160 ===');
  console.log('');

  const disasmRows = [];
  let pc = DISASM_START;

  while (pc < DISASM_END && pc < romBytes.length) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      const bytes = romBytes.subarray(pc, pc + 1);
      disasmRows.push({ addr: pc, hex: formatBytes(bytes), mnemonic: '<decode-error>' });
      pc += 1;
      continue;
    }

    if (!inst || !inst.length || inst.length <= 0) {
      const bytes = romBytes.subarray(pc, pc + 1);
      disasmRows.push({ addr: pc, hex: formatBytes(bytes), mnemonic: '<bad>' });
      pc += 1;
      continue;
    }

    const bytes = romBytes.subarray(pc, pc + inst.length);
    const mnemonic = mnemonicOf(inst);
    const marker = (pc === TRAP_BLOCK) ? '  <<<< TRAP TARGET' : '';

    disasmRows.push({
      addr: pc,
      hex: formatBytes(bytes),
      mnemonic: mnemonic + marker,
    });

    console.log(`  ${hex(pc)}: ${formatBytes(bytes).padEnd(20)} ${mnemonic}${marker}`);
    pc = inst.nextPc;
  }

  // Identify the function containing 0x0A2133
  console.log('');
  console.log('  Function boundary analysis:');

  // Look for RET/JP backwards from 0x0A2133 to find function start
  let funcStart = DISASM_START;
  for (const row of disasmRows) {
    if (row.addr >= TRAP_BLOCK) break;
    if (row.mnemonic === 'RET' || row.mnemonic.startsWith('JP ')) {
      // The function starts after this instruction
      const idx = disasmRows.indexOf(row);
      if (idx + 1 < disasmRows.length && disasmRows[idx + 1].addr <= TRAP_BLOCK) {
        funcStart = disasmRows[idx + 1].addr;
      }
    }
  }
  console.log(`  Likely function start: ${hex(funcStart)}`);

  // Identify LDIR, register setup
  const ldirRows = disasmRows.filter((r) => r.mnemonic === 'LDIR' || r.mnemonic === 'LDDR');
  console.log(`  LDIR/LDDR in region: ${ldirRows.map((r) => hex(r.addr)).join(', ') || 'none'}`);

  const regSetups = disasmRows.filter((r) =>
    r.mnemonic.match(/^LD (HL|DE|BC),0x/)
  );
  console.log(`  Register loads (HL/DE/BC immediate):`);
  for (const rs of regSetups) {
    console.log(`    ${hex(rs.addr)}: ${rs.mnemonic}`);
  }

  console.log('');
  return disasmRows;
}

// ── Part B: Caller Identification ────────────────────────────────────────────

function runPartB() {
  console.log('=== Part B: Caller Scan (CALL/JP targeting 0x0A2120-0x0A2140) ===');
  console.log('');

  const callers = [];

  // Scan entire ROM for CD xx xx xx (CALL) and C3 xx xx xx (JP)
  // In ADL mode, these are 4-byte instructions: opcode + 3-byte LE address
  for (let i = 0; i < ROM_LIMIT - 3; i++) {
    const opcode = romBytes[i];

    // CALL nn = CD, JP nn = C3
    // Also check conditional variants:
    //   CALL NZ = C4, CALL Z = CC, CALL NC = D4, CALL C = DC
    //   JP NZ = C2, JP Z = CA, JP NC = D2, JP C = DA
    const isCall = (opcode === 0xCD || opcode === 0xC4 || opcode === 0xCC ||
                    opcode === 0xD4 || opcode === 0xDC);
    const isJp = (opcode === 0xC3 || opcode === 0xC2 || opcode === 0xCA ||
                  opcode === 0xD2 || opcode === 0xDA);

    if (!isCall && !isJp) continue;

    const target = read24LE(romBytes, i + 1);

    if (target >= CALLER_TARGET_LO && target <= CALLER_TARGET_HI) {
      const type = isCall ? 'CALL' : 'JP';
      const condMap = {
        0xCD: '', 0xC3: '',
        0xC4: ' NZ', 0xC2: ' NZ',
        0xCC: ' Z', 0xCA: ' Z',
        0xD4: ' NC', 0xD2: ' NC',
        0xDC: ' C', 0xDA: ' C',
      };
      const cond = condMap[opcode] || '';

      callers.push({
        callerAddr: i,
        targetAddr: target,
        type: `${type}${cond}`,
        hex: formatBytes(romBytes.subarray(i, i + 4)),
      });

      console.log(`  ${hex(i)}: ${type}${cond} ${hex(target)}  [${formatBytes(romBytes.subarray(i, i + 4))}]`);
    }
  }

  if (callers.length === 0) {
    console.log('  No callers found in this range.');
  } else {
    console.log(`  Total callers found: ${callers.length}`);
  }

  // Group by target
  const byTarget = new Map();
  for (const c of callers) {
    if (!byTarget.has(c.targetAddr)) byTarget.set(c.targetAddr, []);
    byTarget.get(c.targetAddr).push(c);
  }

  console.log('');
  console.log('  Callers grouped by target:');
  for (const [target, group] of byTarget) {
    console.log(`    ${hex(target)}: ${group.length} caller(s) at ${group.map((c) => hex(c.callerAddr)).join(', ')}`);
  }

  console.log('');
  return callers;
}

// ── Part C: Dynamic Trace ────────────────────────────────────────────────────

async function runPartC() {
  console.log('=== Part C: Dynamic Trace — Trap Entries to Block 0x0A2133 ===');
  console.log('');

  // Load transpiled blocks
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;

  // Initialize environment
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, ROM_LIMIT)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Step 1: Cold boot
  console.log('  Step 1: Cold boot...');
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });
  console.log(`    steps=${boot.steps} term=${boot.termination}`);

  // Step 2: OS init
  console.log('  Step 2: OS init (0x08C331)...');
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
  });
  console.log(`    steps=${kernelInit.steps} term=${kernelInit.termination}`);

  // Step 3: Post-init
  console.log('  Step 3: Post-init (0x0802B2)...');
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOPS,
  });
  console.log(`    steps=${postInit.steps} term=${postInit.termination}`);

  // Step 4: CPU snapshot
  console.log('  Step 4: Saving CPU snapshot...');
  const cpuSnap = snapshotCpu(cpu);
  const ramSnap = new Uint8Array(mem.subarray(RAM_START, RAM_END));

  // Step 5: Seed mode buffer
  console.log('  Step 5: Seeding mode buffer at 0xD020A6...');
  seedAscii(mem, MODE_BUF_START, MODE_TEXT);

  // Step 6: Seed display buffer
  console.log('  Step 6: Seeding display buffer at 0xD006C0...');
  seedAscii(mem, DISPLAY_BUF_START, MODE_TEXT);

  // Verify seeds
  const modeBufCheck = [];
  const dispBufCheck = [];
  for (let i = 0; i < 26; i++) {
    modeBufCheck.push(mem[MODE_BUF_START + i]);
    dispBufCheck.push(mem[DISPLAY_BUF_START + i]);
  }
  console.log(`    Mode buffer: "${formatAscii(modeBufCheck)}"`);
  console.log(`    Display buffer: "${formatAscii(dispBufCheck)}"`);

  // Step 7: Run stage 3 with trap on block 0x0A2133
  console.log('  Step 7: Running stage 3 (0x0A29EC) with block trap...');

  const dynamicHits = [];
  let stepCounter = 0;

  // Prepare for run
  restoreCpu(cpu, cpuSnap, mem, 12);

  // Re-seed after restore (restore overwrites RAM)
  seedAscii(mem, MODE_BUF_START, MODE_TEXT);
  seedAscii(mem, DISPLAY_BUF_START, MODE_TEXT);

  let stage3Result;
  try {
    stage3Result = executor.runFrom(STAGE3_ENTRY, 'adl', {
      maxSteps: STAGE3_MAX_STEPS,
      maxLoopIterations: STAGE3_MAX_LOOPS,
      onBlock(pc, mode, meta, step) {
        stepCounter = step;

        if (pc !== TRAP_BLOCK) return;

        // Capture register state at entry to this block
        const hl = cpu._hl & ADDRESS_MASK;
        const de = cpu._de & ADDRESS_MASK;
        const bc = cpu._bc & ADDRESS_MASK;
        const a = cpu.a & 0xFF;
        const ix = cpu._ix & ADDRESS_MASK;

        // Read the first 26 bytes at HL (the LDIR source)
        const sourceBytes = [];
        for (let i = 0; i < 26; i++) {
          const addr = (hl + i) & ADDRESS_MASK;
          sourceBytes.push(mem[addr]);
        }

        const hit = {
          step,
          hl,
          de,
          bc,
          a,
          ix,
          pc: cpu.pc,
          sourceBytes,
          sourceAscii: formatAscii(sourceBytes),
          sourceHex: formatBytes(sourceBytes),
        };

        dynamicHits.push(hit);

        console.log(`    HIT #${dynamicHits.length} at step ${step}:`);
        console.log(`      HL=${hex(hl)} DE=${hex(de)} BC=${hex(bc)} A=${hex(a, 2)} IX=${hex(ix)}`);
        console.log(`      Source (26 bytes at HL): ${formatBytes(sourceBytes)}`);
        console.log(`      ASCII: "${formatAscii(sourceBytes)}"`);

        // Classify source region
        if (hl >= 0xD00000 && hl < 0xE00000) {
          console.log(`      Region: RAM (${hex(hl)})`);
          if (hl >= MODE_BUF_START && hl < MODE_BUF_START + 26) {
            console.log(`      NOTE: Source is the MODE BUFFER (0xD020A6)!`);
          }
        } else if (hl < ROM_LIMIT) {
          console.log(`      Region: ROM (${hex(hl)})`);
        } else {
          console.log(`      Region: UNMAPPED (${hex(hl)})`);
        }

        // Classify destination
        if (de >= DISPLAY_BUF_START && de < DISPLAY_BUF_START + 260) {
          const lineOffset = de - DISPLAY_BUF_START;
          const lineNum = Math.floor(lineOffset / 26);
          console.log(`      DE targets display buffer line ${lineNum} (offset ${lineOffset})`);
        }
      },
    });

    console.log('');
    console.log(`  Stage 3 completed: steps=${stage3Result.steps} term=${stage3Result.termination} lastPc=${hex(stage3Result.lastPc)}`);
  } catch (err) {
    console.log(`  Stage 3 threw: ${err.message}`);
    stage3Result = { steps: stepCounter, termination: 'error', lastPc: 0 };
  }

  // Post-run: check display buffer
  const postBuf = [];
  for (let i = 0; i < 260; i++) {
    postBuf.push(mem[DISPLAY_BUF_START + i]);
  }
  console.log('');
  console.log('  Display buffer after stage 3 (10 lines x 26 chars):');
  for (let line = 0; line < 10; line++) {
    const lineBytes = postBuf.slice(line * 26, (line + 1) * 26);
    const lineAscii = formatAscii(lineBytes);
    const lineHex = formatBytes(lineBytes.slice(0, 8));
    console.log(`    Line ${line}: "${lineAscii}"  [${lineHex} ...]`);
  }

  console.log('');
  console.log(`  Total hits on block ${hex(TRAP_BLOCK)}: ${dynamicHits.length}`);

  return dynamicHits;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 174 — 0x0A2133 Line-Writer Source Trace ===');
  console.log(`ROM bytes: ${romBytes.length}`);
  console.log('');

  // Part A: Static disassembly
  const disasmRows = runPartA();

  // Part B: Caller scan
  const callers = runPartB();

  // Part C: Dynamic trace
  const dynamicHits = await runPartC();

  // ── JSON Summary ───────────────────────────────────────────────────────────

  const summary = {
    disassembly: disasmRows.map((r) => ({
      addr: hex(r.addr),
      hex: r.hex,
      mnemonic: r.mnemonic.replace(/\s+<<<< TRAP TARGET$/, ''),
    })),
    callers: callers.map((c) => ({
      callerAddr: hex(c.callerAddr),
      targetAddr: hex(c.targetAddr),
      type: c.type,
    })),
    dynamicHits: dynamicHits.map((h) => ({
      step: h.step,
      hl: hex(h.hl),
      de: hex(h.de),
      bc: hex(h.bc),
      a: hex(h.a, 2),
      ix: hex(h.ix),
      sourceAscii: h.sourceAscii,
      sourceHex: h.sourceHex,
    })),
  };

  console.log('');
  console.log('=== JSON SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
