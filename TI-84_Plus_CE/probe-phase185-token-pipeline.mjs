#!/usr/bin/env node

/**
 * Phase 185: Token Pipeline Probe
 *
 * Investigates the token conversion pipeline in the home handler:
 *   1. Static disassembly of key processing section (0x058460..0x0584B0)
 *   2. ConvKeyToTok (0x05C52C) disassembly and calling convention
 *   3. Dynamic tests of ConvKeyToTok with digit/operator key codes
 *   4. Execution trace from 0x058483 with pre-seeded token data
 *
 * Key question: what populates 0xD0230E with token data before the
 * copy helper at 0x0584A3 copies 9 bytes from 0xD0230E -> OP1 (0xD005F8)?
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ─── Constants ───────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const FAKE_RET = 0x7FFFFE;
const MEMINIT_RET = 0x7FFFF6;
const MBASE = 0xD0;
const IY = 0xD00080;
const IX = 0xD1A860;

const BOOT = 0x000000;
const KERNEL_INIT = 0x08C331;
const POST_INIT = 0x0802B2;
const MEM_INIT = 0x09DEE0;

const CONV_KEY_TO_TOK = 0x05C52C;
const HOME_HANDLER_KEY = 0x058483;
const COPY_HELPER = 0x0584A3;
const KEY_CLASSIFIER = 0x07F7BD;
const BUF_INSERT = 0x05E2A0;
const OP1 = 0xD005F8;
const TOKEN_STAGING = 0xD0230E;
const KBD_SCAN_CODE = 0xD0008C;
const LCD_STALL = 0x09EFDE;

const SENTINEL_STOP = '__PHASE185_SENTINEL__';
const EVENT_LIMIT = 512;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (v) => hexByte(v)).join(' ');
}

function read24(buf, addr) {
  return ((buf[addr] & 0xFF) | ((buf[addr + 1] & 0xFF) << 8) | ((buf[addr + 2] & 0xFF) << 16)) >>> 0;
}

function write24(buf, addr, value) {
  buf[addr] = value & 0xFF;
  buf[addr + 1] = (value >>> 8) & 0xFF;
  buf[addr + 2] = (value >>> 16) & 0xFF;
}

function cap(arr, item) {
  if (arr.length < EVENT_LIMIT) arr.push(item);
}

// ─── Instruction Formatter ───────────────────────────────────────────────────

function memAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const d = (n) => (n >= 0 ? `+${n}` : `${n}`);
  const m = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const h = (v, w = 6) => hex(v, w);

  switch (inst.tag) {
    case 'nop': return `${m}nop`;
    case 'call': return `${m}call ${h(inst.target)}`;
    case 'call-conditional': return `${m}call ${inst.condition}, ${h(inst.target)}`;
    case 'jp': return `${m}jp ${h(inst.target)}`;
    case 'jp-conditional': return `${m}jp ${inst.condition}, ${h(inst.target)}`;
    case 'jp-indirect': return `${m}jp (${inst.indirectRegister})`;
    case 'jr': return `${m}jr ${h(inst.target)}`;
    case 'jr-conditional': return `${m}jr ${inst.condition}, ${h(inst.target)}`;
    case 'djnz': return `${m}djnz ${h(inst.target)}`;
    case 'ret': return `${m}ret`;
    case 'ret-conditional': return `${m}ret ${inst.condition}`;
    case 'push': return `${m}push ${inst.pair}`;
    case 'pop': return `${m}pop ${inst.pair}`;
    case 'inc-pair': return `${m}inc ${inst.pair}`;
    case 'dec-pair': return `${m}dec ${inst.pair}`;
    case 'inc-reg': return `${m}inc ${inst.reg}`;
    case 'dec-reg': return `${m}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${m}ld ${inst.pair}, ${h(inst.value)}`;
    case 'ld-pair-mem': return `${m}ld ${inst.pair}, (${h(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${m}ld (${h(memAddr(inst) ?? inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${m}ld ${inst.dest}, ${h(inst.value, 2)}`;
    case 'ld-reg-reg': return `${m}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${m}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${m}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${m}ld ${inst.dest}, (${h(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${m}ld (${h(memAddr(inst) ?? inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': return `${m}ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'ld-ixd-reg': return `${m}ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `${m}ld (${inst.indexRegister}${d(inst.displacement)}), ${h(inst.value, 2)}`;
    case 'ld-ind-imm': return `${m}ld (hl), ${h(inst.value, 2)}`;
    case 'alu-imm': return `${m}${inst.op} ${h(inst.value, 2)}`;
    case 'alu-reg': return `${m}${inst.op} ${inst.src}`;
    case 'alu-ixd': return `${m}${inst.op} (${inst.indexRegister}${d(inst.displacement)})`;
    case 'add-pair': return `${m}add ${inst.dest}, ${inst.src}`;
    case 'sbc-pair': return `${m}sbc hl, ${inst.src}`;
    case 'adc-pair': return `${m}adc hl, ${inst.src}`;
    case 'bit-test': return `${m}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${m}bit ${inst.bit}, (hl)`;
    case 'bit-set': return `${m}set ${inst.bit}, ${inst.reg}`;
    case 'bit-reset': return `${m}res ${inst.bit}, ${inst.reg}`;
    case 'rotate': case 'rotate-reg': return `${m}${inst.op} ${inst.reg}`;
    case 'shift': return `${m}${inst.op} ${inst.reg}`;
    case 'ldir': return `${m}ldir`;
    case 'lddr': return `${m}lddr`;
    case 'rst': return `${m}rst ${h(inst.target, 2)}`;
    case 'di': return `${m}di`;
    case 'ei': return `${m}ei`;
    case 'halt': return `${m}halt`;
    case 'ld-sp-hl': return `${m}ld sp, hl`;
    case 'ld-sp-ix': return `${m}ld sp, ${inst.indexRegister || 'ix'}`;
    case 'ex-af': return `${m}ex af, af'`;
    case 'ex-de-hl': return `${m}ex de, hl`;
    case 'exx': return `${m}exx`;
    case 'jp-hl': return `${m}jp (hl)`;
    case 'jp-ix': return `${m}jp (${inst.indexRegister || 'ix'})`;
    case 'ld-a-i': return `${m}ld a, i`;
    case 'ld-i-a': return `${m}ld i, a`;
    case 'neg': return `${m}neg`;
    case 'rla': return `${m}rla`;
    case 'rra': return `${m}rra`;
    case 'rlca': return `${m}rlca`;
    case 'rrca': return `${m}rrca`;
    case 'cpl': return `${m}cpl`;
    case 'scf': return `${m}scf`;
    case 'ccf': return `${m}ccf`;
    case 'daa': return `${m}daa`;
    case 'reti': return `${m}reti`;
    case 'retn': return `${m}retn`;
    case 'im': return `${m}im ${inst.mode ?? inst.value}`;
    case 'inc-ixd': return `${m}inc (${inst.indexRegister}${d(inst.displacement)})`;
    case 'dec-ixd': return `${m}dec (${inst.indexRegister}${d(inst.displacement)})`;
    case 'in': return `${m}in ${inst.dest}, (${inst.port !== undefined ? h(inst.port, 2) : 'c'})`;
    case 'out': return `${m}out (${inst.port !== undefined ? h(inst.port, 2) : 'c'}), ${inst.src}`;
    case 'in0': return `${m}in0 ${inst.reg}, (${h(inst.port, 2)})`;
    case 'out0': return `${m}out0 (${h(inst.port, 2)}), ${inst.reg}`;
    case 'rsmix': return `${m}rsmix`;
    case 'stmix': return `${m}stmix`;
    default: return `${m}${inst.tag}`;
  }
}

// ─── Disassembly ─────────────────────────────────────────────────────────────

function disassembleRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end; ) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const raw = hexBytes(romBytes, pc, inst.length);
      const text = formatInstruction(inst);
      rows.push({ pc, raw, text, inst });
      pc += inst.length;
    } catch (err) {
      rows.push({ pc, raw: hexBytes(romBytes, pc, 1), text: `DECODE ERROR: ${err.message}`, inst: null });
      pc += 1;
    }
  }
  return rows;
}

function disassembleCount(start, count) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < count; i++) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const raw = hexBytes(romBytes, pc, inst.length);
      const text = formatInstruction(inst);
      rows.push({ pc, raw, text, inst });
      pc += inst.length;
    } catch (err) {
      rows.push({ pc, raw: hexBytes(romBytes, pc, 1), text: `DECODE ERROR: ${err.message}`, inst: null });
      pc += 1;
    }
  }
  return rows;
}

function printDisassembly(label, rows) {
  console.log(`\n=== ${label} ===\n`);
  for (const row of rows) {
    const annotation = annotate(row);
    const line = `${hex(row.pc)}: ${row.raw.padEnd(24)} ${row.text}`;
    console.log(annotation ? `${line}  ; ${annotation}` : line);
  }
  console.log(`\n(${rows.length} instructions, ended at ${hex(rows[rows.length - 1].pc + (rows[rows.length - 1].inst?.length ?? 1))})`);
}

function annotate(row) {
  const inst = row.inst;
  if (!inst) return null;

  // Annotate known call targets
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    const target = inst.target >>> 0;
    if (target === CONV_KEY_TO_TOK) return 'ConvKeyToTok';
    if (target === KEY_CLASSIFIER) return 'KeyClassifier';
    if (target === BUF_INSERT) return 'BufInsert';
    if (target === COPY_HELPER) return 'CopyHelper (0x0584A3)';
    if (target === 0x07F9FB) return 'Copy9Bytes helper';
  }

  // Annotate known memory addresses
  const addr = memAddr(inst);
  if (addr === TOKEN_STAGING) return 'tokenStaging (0xD0230E)';
  if (addr === OP1) return 'OP1 (0xD005F8)';
  if (addr === KBD_SCAN_CODE) return 'kbdScanCode';

  return null;
}

// ─── Environment Setup ──────────────────────────────────────────────────────

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu._iy = IY; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return { boot, kernel, post };
}

function prepCpu(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY;
  cpu._ix = IX;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runMemInit(executor, cpu, mem) {
  prepCpu(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let returned = false;
  try {
    executor.runFrom(MEM_INIT, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 4096,
      onBlock(pc) { if ((pc & 0xFFFFFF) === MEMINIT_RET) throw new Error('__MEMINIT_RET__'); },
      onMissingBlock(pc) { if ((pc & 0xFFFFFF) === MEMINIT_RET) throw new Error('__MEMINIT_RET__'); },
    });
  } catch (err) {
    if (err?.message === '__MEMINIT_RET__') returned = true;
    else throw err;
  }
  return returned;
}

// ─── Part 1: Home Handler Key Processing Disassembly ─────────────────────────

function part1_homeHandlerDisasm() {
  console.log('\n' + '='.repeat(70));
  console.log('PART 1: Home Handler Key Processing Section (0x058460..0x0584B0)');
  console.log('='.repeat(70));

  const rows = disassembleRange(0x058460, 0x0584B0);
  printDisassembly('Home handler key processing', rows);

  // Identify interesting references
  const callTargets = [];
  const memRefs = [];
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push({ pc: hex(row.pc), target: hex(inst.target), annotation: annotate(row) || 'unknown' });
    }

    const addr = memAddr(inst);
    if (addr !== null && addr >= 0xD00000) {
      memRefs.push({ pc: hex(row.pc), addr: hex(addr), text: row.text, annotation: annotate(row) || '' });
    }
  }

  console.log('\nCall targets found:');
  for (const ct of callTargets) {
    console.log(`  ${ct.pc}: call ${ct.target} (${ct.annotation})`);
  }

  console.log('\nRAM memory references:');
  for (const mr of memRefs) {
    console.log(`  ${mr.pc}: ${mr.text} ${mr.annotation ? `(${mr.annotation})` : ''}`);
  }

  return { rows: rows.map(r => ({ pc: hex(r.pc), text: r.text })), callTargets, memRefs };
}

// ─── Part 2: ConvKeyToTok Disassembly ────────────────────────────────────────

function part2_convKeyToTokDisasm() {
  console.log('\n' + '='.repeat(70));
  console.log('PART 2: ConvKeyToTok (0x05C52C) Disassembly');
  console.log('='.repeat(70));

  const rows = disassembleCount(CONV_KEY_TO_TOK, 50);
  printDisassembly('ConvKeyToTok at 0x05C52C', rows);

  // Look for table references (ld pair, imm with ROM addresses)
  const tableRefs = [];
  const ramRefs = [];
  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    if (inst.tag === 'ld-pair-imm' && inst.value >= 0x050000 && inst.value < 0x400000) {
      tableRefs.push({ pc: hex(row.pc), value: hex(inst.value), pair: inst.pair });
      console.log(`\n  >> Table reference: ${inst.pair} = ${hex(inst.value)}`);
      console.log(`     ROM bytes at ${hex(inst.value)}: ${hexBytes(romBytes, inst.value, 32)}`);
    }

    const addr = memAddr(inst);
    if (addr !== null && addr >= 0xD00000) {
      ramRefs.push({ pc: hex(row.pc), addr: hex(addr), text: row.text });
    }
  }

  // Check for writes to TOKEN_STAGING area
  const stagingWrites = rows.filter(r => {
    const addr = memAddr(r.inst);
    return addr !== null && addr >= TOKEN_STAGING && addr < TOKEN_STAGING + 16;
  });

  if (stagingWrites.length > 0) {
    console.log('\nWrites near TOKEN_STAGING (0xD0230E):');
    for (const sw of stagingWrites) {
      console.log(`  ${hex(sw.pc)}: ${sw.text}`);
    }
  }

  return {
    rows: rows.map(r => ({ pc: hex(r.pc), text: r.text })),
    tableRefs,
    ramRefs,
    stagingWrites: stagingWrites.map(r => ({ pc: hex(r.pc), text: r.text })),
  };
}

// ─── Part 3: Dynamic ConvKeyToTok Tests ──────────────────────────────────────

function part3_convKeyToTokTests() {
  console.log('\n' + '='.repeat(70));
  console.log('PART 3: Dynamic ConvKeyToTok Tests');
  console.log('='.repeat(70));

  const testKeys = [
    { code: 0x8E, label: 'k0' },
    { code: 0x8F, label: 'k1' },
    { code: 0x92, label: 'k2' },
    { code: 0x97, label: 'k9' },
    { code: 0x9B, label: 'kAdd' },
    { code: 0x9C, label: 'kSub' },
    { code: 0x9D, label: 'kMul' },
    { code: 0x9E, label: 'kDiv' },
  ];

  const results = [];

  for (const tk of testKeys) {
    const { mem, executor, cpu } = createEnv();

    // Boot
    coldBoot(executor, cpu, mem);
    const memInitOk = runMemInit(executor, cpu, mem);

    // Snapshot TOKEN_STAGING before
    const stagingBefore = hexBytes(mem, TOKEN_STAGING, 12);
    const op1Before = hexBytes(mem, OP1, 12);

    // Prepare CPU for ConvKeyToTok call
    prepCpu(cpu, mem);
    cpu.a = tk.code & 0xFF;
    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    // Track blocks visited and memory writes to staging area
    const blocksVisited = [];
    const stagingWrites = [];
    let hit = null;
    let totalSteps = 0;
    let termination = 'unknown';
    let errorMsg = null;

    const origWrite8 = cpu.write8.bind(cpu);
    cpu.write8 = (addr, value) => {
      const a = Number(addr) & 0xFFFFFF;
      if (a >= TOKEN_STAGING && a < TOKEN_STAGING + 16) {
        cap(stagingWrites, { addr: hex(a), value: hexByte(value), pc: hex(cpu._currentBlockPc & 0xFFFFFF) });
      }
      origWrite8(addr, value);
    };

    try {
      const result = executor.runFrom(CONV_KEY_TO_TOK, 'adl', {
        maxSteps: 200,
        maxLoopIterations: 64,
        onBlock(pc) {
          const p = pc & 0xFFFFFF;
          cap(blocksVisited, hex(p));
          if (p === FAKE_RET) { hit = 'sentinel'; throw new Error(SENTINEL_STOP); }
        },
        onMissingBlock(pc) {
          const p = pc & 0xFFFFFF;
          cap(blocksVisited, `MISSING:${hex(p)}`);
          if (p === FAKE_RET) { hit = 'sentinel'; throw new Error(SENTINEL_STOP); }
        },
      });
      totalSteps = result.steps ?? 0;
      termination = result.termination ?? 'completed';
    } catch (err) {
      if (err?.message === SENTINEL_STOP) {
        termination = 'sentinel';
      } else {
        errorMsg = err?.message ?? String(err);
        termination = 'exception';
      }
    }

    // Restore write8
    cpu.write8 = origWrite8;

    const resultA = cpu.a & 0xFF;
    const stagingAfter = hexBytes(mem, TOKEN_STAGING, 12);
    const op1After = hexBytes(mem, OP1, 12);

    const entry = {
      label: tk.label,
      keyCode: hex(tk.code, 2),
      resultA: hex(resultA, 2),
      resultADecimal: resultA,
      termination,
      steps: totalSteps,
      hit,
      memInitOk,
      stagingBefore,
      stagingAfter,
      stagingChanged: stagingBefore !== stagingAfter,
      op1Before,
      op1After,
      op1Changed: op1Before !== op1After,
      stagingWrites: stagingWrites.slice(0, 20),
      blocksVisited: blocksVisited.slice(0, 25),
      error: errorMsg,
    };

    results.push(entry);

    console.log(`\n  ${tk.label} (${hex(tk.code, 2)}): A_out=${hex(resultA, 2)} term=${termination} steps=${totalSteps}`);
    console.log(`    staging before: ${stagingBefore}`);
    console.log(`    staging after:  ${stagingAfter} ${entry.stagingChanged ? '** CHANGED **' : '(unchanged)'}`);
    console.log(`    op1 before:     ${op1Before}`);
    console.log(`    op1 after:      ${op1After} ${entry.op1Changed ? '** CHANGED **' : '(unchanged)'}`);
    if (stagingWrites.length > 0) {
      console.log(`    staging writes: ${JSON.stringify(stagingWrites.slice(0, 5))}`);
    }
    console.log(`    blocks: ${blocksVisited.slice(0, 10).join(' -> ')}`);
  }

  return results;
}

// ─── Part 4: Execution Trace from 0x058483 ──────────────────────────────────

function part4_homeHandlerTrace() {
  console.log('\n' + '='.repeat(70));
  console.log('PART 4: Execution Trace from 0x058483 (Home Handler Key Section)');
  console.log('='.repeat(70));

  const { mem, executor, cpu } = createEnv();

  // Full boot
  coldBoot(executor, cpu, mem);
  const memInitOk = runMemInit(executor, cpu, mem);
  console.log(`\n  Boot complete, MEM_INIT returned: ${memInitOk}`);

  // Pre-seed kbdScanCode
  mem[KBD_SCAN_CODE] = 0x31; // scan code for digit '2'

  // Pre-seed TOKEN_STAGING (0xD0230E) with digit-2 token data
  // TI-OS token for '2' is 0x32 (1-byte token), type byte = 0x00
  mem[TOKEN_STAGING + 0] = 0x00; // type byte
  mem[TOKEN_STAGING + 1] = 0x32; // token byte for '2'
  mem[TOKEN_STAGING + 2] = 0x00; // padding
  mem[TOKEN_STAGING + 3] = 0x00;
  mem[TOKEN_STAGING + 4] = 0x00;
  mem[TOKEN_STAGING + 5] = 0x00;
  mem[TOKEN_STAGING + 6] = 0x00;
  mem[TOKEN_STAGING + 7] = 0x00;
  mem[TOKEN_STAGING + 8] = 0x00;

  console.log(`  Pre-seeded kbdScanCode = 0x31, TOKEN_STAGING = ${hexBytes(mem, TOKEN_STAGING, 9)}`);
  console.log(`  OP1 before: ${hexBytes(mem, OP1, 9)}`);

  // Prepare CPU
  prepCpu(cpu, mem);
  cpu.a = 0x92; // k2 key code
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Instrumentation
  const blockLog = [];
  const callsToConvKeyToTok = [];
  const callsToBufInsert = [];
  const callsToKeyClassifier = [];
  const callsToCopyHelper = [];
  const stagingWrites = [];
  const op1Writes = [];
  let lcdStallSkips = 0;
  let hit = null;
  let termination = 'unknown';
  let errorMsg = null;
  let totalStepsUsed = 0;

  // Known LCD-related addresses to force-return from (they enter deep rendering loops)
  const LCD_SKIP_SET = new Set([
    LCD_STALL,
    0x09EF20,  // LCD rendering entry (observed in trace)
  ]);

  // Hook write8 to watch for writes to TOKEN_STAGING and OP1
  const origRead8 = cpu.read8.bind(cpu);
  const origWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    const a = Number(addr) & 0xFFFFFF;
    if (a >= TOKEN_STAGING && a < TOKEN_STAGING + 16) {
      cap(stagingWrites, { addr: hex(a), value: hexByte(value), pc: hex(cpu._currentBlockPc & 0xFFFFFF) });
    }
    if (a >= OP1 && a < OP1 + 16) {
      cap(op1Writes, { addr: hex(a), value: hexByte(value), pc: hex(cpu._currentBlockPc & 0xFFFFFF) });
    }
    origWrite8(addr, value);
  };

  // Run in a loop: each LCD skip throws to abort runFrom, then we resume
  // from the return address popped off the stack.
  let resumePc = HOME_HANDLER_KEY;
  let remainingSteps = 2000;
  const MAX_RESUMES = 20;

  for (let attempt = 0; attempt < MAX_RESUMES && remainingSteps > 0; attempt++) {
    let lcdSkipped = false;
    let resumeAddr = null;

    try {
      const result = executor.runFrom(resumePc, 'adl', {
        maxSteps: remainingSteps,
        maxLoopIterations: 256,
        onBlock(pc, mode, meta, step) {
          const p = pc & 0xFFFFFF;

          // Skip LCD rendering functions by forcing a return
          if (LCD_SKIP_SET.has(p)) {
            lcdStallSkips++;
            // Pop return address and resume from there
            resumeAddr = read24(mem, cpu.sp);
            cpu.sp += 3;
            lcdSkipped = true;
            throw new Error('__LCD_SKIP__');
          }

          cap(blockLog, { step: totalStepsUsed + step, pc: hex(p), a: cpu.a & 0xFF, hl: cpu.hl & 0xFFFFFF, sp: cpu.sp & 0xFFFFFF });

          if (p === CONV_KEY_TO_TOK) {
            cap(callsToConvKeyToTok, { step: totalStepsUsed + step, a: cpu.a & 0xFF, hl: cpu.hl & 0xFFFFFF, sp: cpu.sp & 0xFFFFFF });
          }
          if (p === BUF_INSERT) {
            cap(callsToBufInsert, { step: totalStepsUsed + step, a: cpu.a & 0xFF, hl: cpu.hl & 0xFFFFFF, de: (cpu._de ?? 0) & 0xFFFFFF, sp: cpu.sp & 0xFFFFFF });
          }
          if (p === KEY_CLASSIFIER) {
            cap(callsToKeyClassifier, { step: totalStepsUsed + step, a: cpu.a & 0xFF });
          }
          if (p === 0x07F9FB) {
            cap(callsToCopyHelper, { step: totalStepsUsed + step, hl: cpu.hl & 0xFFFFFF, de: (cpu._de ?? 0) & 0xFFFFFF });
          }

          if (p === FAKE_RET) { hit = 'sentinel'; throw new Error(SENTINEL_STOP); }
        },
        onMissingBlock(pc, mode, step) {
          const p = pc & 0xFFFFFF;
          cap(blockLog, { step: totalStepsUsed + step, pc: hex(p), a: cpu.a & 0xFF, missing: true });
          if (p === FAKE_RET) { hit = 'sentinel'; throw new Error(SENTINEL_STOP); }
        },
      });
      totalStepsUsed += result.steps ?? 0;
      termination = result.termination ?? 'completed';
      break; // Normal completion
    } catch (err) {
      if (err?.message === SENTINEL_STOP) {
        termination = 'sentinel';
        break;
      } else if (err?.message === '__LCD_SKIP__' && lcdSkipped && resumeAddr !== null) {
        // Resume from the return address
        remainingSteps -= blockLog.length; // approximate
        resumePc = resumeAddr & 0xFFFFFF;
        continue;
      } else {
        errorMsg = err?.message ?? String(err);
        termination = 'exception';
        break;
      }
    }
  }

  // Restore hooks
  cpu.write8 = origWrite8;
  cpu.read8 = origRead8;

  const stagingAfter = hexBytes(mem, TOKEN_STAGING, 9);
  const op1After = hexBytes(mem, OP1, 9);

  console.log(`\n  Termination: ${termination}, hit: ${hit}`);
  console.log(`  Block log entries: ${blockLog.length}`);
  console.log(`  LCD stall skips: ${lcdStallSkips}`);
  console.log(`  Calls to ConvKeyToTok: ${callsToConvKeyToTok.length}`);
  console.log(`  Calls to KeyClassifier: ${callsToKeyClassifier.length}`);
  console.log(`  Calls to BufInsert: ${callsToBufInsert.length}`);
  console.log(`  Calls to CopyHelper (0x07F9FB): ${callsToCopyHelper.length}`);
  console.log(`  Writes to TOKEN_STAGING: ${stagingWrites.length}`);
  console.log(`  Writes to OP1: ${op1Writes.length}`);
  console.log(`  TOKEN_STAGING after: ${stagingAfter}`);
  console.log(`  OP1 after: ${op1After}`);

  if (callsToConvKeyToTok.length > 0) {
    console.log('\n  ConvKeyToTok calls:');
    for (const c of callsToConvKeyToTok) {
      console.log(`    step=${c.step} A=${hex(c.a, 2)} HL=${hex(c.hl)} SP=${hex(c.sp)}`);
    }
  }

  if (callsToKeyClassifier.length > 0) {
    console.log('\n  KeyClassifier calls:');
    for (const c of callsToKeyClassifier) {
      console.log(`    step=${c.step} A=${hex(c.a, 2)}`);
    }
  }

  if (callsToBufInsert.length > 0) {
    console.log('\n  BufInsert calls:');
    for (const c of callsToBufInsert) {
      console.log(`    step=${c.step} A=${hex(c.a, 2)} HL=${hex(c.hl)} DE=${hex(c.de)} SP=${hex(c.sp)}`);
    }
  }

  if (callsToCopyHelper.length > 0) {
    console.log('\n  CopyHelper (0x07F9FB) calls:');
    for (const c of callsToCopyHelper) {
      console.log(`    step=${c.step} HL=${hex(c.hl)} DE=${hex(c.de)}`);
    }
  }

  if (stagingWrites.length > 0) {
    console.log('\n  TOKEN_STAGING writes (first 20):');
    for (const w of stagingWrites.slice(0, 20)) {
      console.log(`    ${w.pc}: [${w.addr}] = ${w.value}`);
    }
  }

  if (op1Writes.length > 0) {
    console.log('\n  OP1 writes (first 20):');
    for (const w of op1Writes.slice(0, 20)) {
      console.log(`    ${w.pc}: [${w.addr}] = ${w.value}`);
    }
  }

  console.log('\n  Block trace (first 40):');
  for (const b of blockLog.slice(0, 40)) {
    console.log(`    step=${b.step} pc=${b.pc} A=${hex(b.a, 2)}${b.missing ? ' MISSING' : ''}`);
  }

  if (errorMsg) {
    console.log(`\n  Error: ${errorMsg}`);
  }

  return {
    termination,
    hit,
    memInitOk,
    lcdStallSkips,
    callsToConvKeyToTok,
    callsToKeyClassifier,
    callsToBufInsert,
    callsToCopyHelper,
    stagingWrites: stagingWrites.slice(0, 30),
    op1Writes: op1Writes.slice(0, 30),
    stagingAfter,
    op1After,
    blockLog: blockLog.slice(0, 60).map(b => ({ step: b.step, pc: b.pc, a: hex(b.a, 2) })),
    error: errorMsg,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  console.log('Phase 185: Token Pipeline Probe');
  console.log('================================\n');

  const results = {};

  // Part 1: Static disassembly of home handler key processing
  results.part1_homeHandlerDisasm = part1_homeHandlerDisasm();

  // Part 2: ConvKeyToTok disassembly
  results.part2_convKeyToTokDisasm = part2_convKeyToTokDisasm();

  // Part 3: Dynamic ConvKeyToTok tests
  results.part3_convKeyToTokTests = part3_convKeyToTokTests();

  // Part 4: Execution trace from home handler
  results.part4_homeHandlerTrace = part4_homeHandlerTrace();

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('SUMMARY');
  console.log('='.repeat(70));

  console.log('\nPart 1: Home handler disasm');
  console.log(`  Instructions: ${results.part1_homeHandlerDisasm.rows.length}`);
  console.log(`  Calls found: ${results.part1_homeHandlerDisasm.callTargets.length}`);
  console.log(`  RAM refs: ${results.part1_homeHandlerDisasm.memRefs.length}`);

  console.log('\nPart 2: ConvKeyToTok disasm');
  console.log(`  Instructions: ${results.part2_convKeyToTokDisasm.rows.length}`);
  console.log(`  Table refs: ${results.part2_convKeyToTokDisasm.tableRefs.length}`);

  console.log('\nPart 3: ConvKeyToTok dynamic tests');
  for (const r of results.part3_convKeyToTokTests) {
    console.log(`  ${r.label} (${r.keyCode}): A_out=${r.resultA} staging_changed=${r.stagingChanged} term=${r.termination}`);
  }

  console.log('\nPart 4: Home handler trace');
  const p4 = results.part4_homeHandlerTrace;
  console.log(`  Termination: ${p4.termination}`);
  console.log(`  ConvKeyToTok calls: ${p4.callsToConvKeyToTok.length}`);
  console.log(`  KeyClassifier calls: ${p4.callsToKeyClassifier.length}`);
  console.log(`  BufInsert calls: ${p4.callsToBufInsert.length}`);
  console.log(`  CopyHelper calls: ${p4.callsToCopyHelper.length}`);
  console.log(`  TOKEN_STAGING writes: ${p4.stagingWrites.length}`);
  console.log(`  OP1 writes: ${p4.op1Writes.length}`);

  // Write JSON results
  const jsonPath = path.join(__dirname, 'phase185-token-pipeline-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2));
  console.log(`\nResults written to: ${jsonPath}`);
}

main();
