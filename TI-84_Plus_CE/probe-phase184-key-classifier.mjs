#!/usr/bin/env node

/**
 * Phase 184: Key Classifier Probe
 *
 * Traces the key classifier function at ROM 0x07F7BD.
 * Called from home handler at 0x0584A7 to classify key codes.
 * Returns type in A:
 *   CP 0x06 -> JP 0x061D42 (error/special)
 *   CP 0x05 -> special handling
 *   Otherwise -> falls through to BufInsert (character insertion)
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

const MEM_SIZE = 0x1000000;
const KEY_CLASSIFIER_ENTRY = 0x07F7BD;
const STACK_TOP = 0xD1A87E;
const FAKE_RET = 0x7FFFFE;
const RUN_SENTINEL_STOP = '__PHASE184_SENTINEL_STOP__';

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

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

// ─── Static Disassembly ───────────────────────────────────────────────────────

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (v) => (v >= 0 ? `+${v}` : `${v}`);
  let text = inst.tag;

  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hex(inst.value, 2)}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hex(inst.value, 2)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'rst': text = `rst ${hex(inst.target, 2)}`; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'halt': text = 'halt'; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-reset': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'rotate': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'shift': text = `${inst.op} ${inst.reg}`; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-ix': text = `ld sp, ${inst.indexRegister || 'ix'}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'exx': text = 'exx'; break;
    case 'jp-hl': text = 'jp (hl)'; break;
    case 'jp-ix': text = `jp (${inst.indexRegister || 'ix'})`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'neg': text = 'neg'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'cpl': text = 'cpl'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'daa': text = 'daa'; break;
    case 'reti': text = 'reti'; break;
    case 'retn': text = 'retn'; break;
    case 'im': text = `im ${inst.mode ?? inst.value}`; break;
    case 'alu-ixd': text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'inc-ixd': text = `inc (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'dec-ixd': text = `dec (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'in': text = `in ${inst.dest}, (${inst.port !== undefined ? hex(inst.port, 2) : 'c'})`; break;
    case 'out': text = `out (${inst.port !== undefined ? hex(inst.port, 2) : 'c'}), ${inst.src}`; break;
    case 'in0': text = `in0 ${inst.reg}, (${hex(inst.port, 2)})`; break;
    case 'out0': text = `out0 (${hex(inst.port, 2)}), ${inst.reg}`; break;
    case 'rsmix': text = 'rsmix'; break;
    case 'stmix': text = 'stmix'; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function staticDisassembly() {
  console.log('=== STATIC DISASSEMBLY of 0x07F7BD (key classifier) ===\n');

  let pc = KEY_CLASSIFIER_ENTRY;
  const rows = [];
  let retCount = 0;

  for (let i = 0; i < 100 && retCount < 3; i++) {
    try {
      const decoded = decodeInstruction(romBytes, pc, 'adl');
      const rawBytes = hexBytes(romBytes, pc, decoded.length);
      const formatted = formatInstruction(decoded);
      rows.push(`${hex(pc)}: ${rawBytes.padEnd(20, ' ')} ${formatted}`);

      if (decoded.tag === 'ret' || decoded.tag === 'ret-conditional') {
        retCount++;
      }

      // Check if this instruction references a ROM table
      if (decoded.tag === 'ld-pair-imm' && decoded.value < 0x400000 && decoded.value > 0x07F000) {
        rows.push(`        ^^ possible table reference at ${hex(decoded.value)}`);
      }
      if (decoded.tag === 'ld-pair-mem' && decoded.addr < 0x400000 && decoded.addr > 0x07F000) {
        rows.push(`        ^^ memory read from ROM at ${hex(decoded.addr)}`);
      }

      pc += decoded.length;
    } catch (err) {
      rows.push(`${hex(pc)}: DECODE ERROR: ${err.message}`);
      pc += 1;
    }
  }

  for (const row of rows) {
    console.log(row);
  }
  console.log(`\n(decoded ${rows.length} lines, ended at ${hex(pc)})\n`);

  return rows;
}

// ─── Dynamic Trace ────────────────────────────────────────────────────────────

function runKeyClassifier(executor, cpu, mem, keyCode, label) {
  // Reset CPU state for OS-level call
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP;
  cpu.f = 0x40;

  // Push return sentinel on stack
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Set A to key code being tested
  cpu.a = keyCode & 0xFF;

  // Run until we hit sentinel or max steps
  let hit = null;
  let lastPc = KEY_CLASSIFIER_ENTRY;
  let totalSteps = 0;
  let termination = null;
  let errorMsg = null;
  const blocksVisited = [];

  try {
    const result = executor.runFrom(KEY_CLASSIFIER_ENTRY, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 64,
      onBlock(pc) {
        const normalizedPc = pc & 0xFFFFFF;
        blocksVisited.push(hex(normalizedPc));
        if (normalizedPc === FAKE_RET) {
          hit = 'sentinel';
          throw new Error(RUN_SENTINEL_STOP);
        }
      },
      onMissingBlock(pc) {
        const normalizedPc = pc & 0xFFFFFF;
        blocksVisited.push(`MISSING:${hex(normalizedPc)}`);
        if (normalizedPc === FAKE_RET) {
          hit = 'sentinel';
          throw new Error(RUN_SENTINEL_STOP);
        }
      },
    });

    totalSteps = result.steps ?? 0;
    lastPc = result.lastPc ?? lastPc;
    termination = result.termination ?? 'completed';
  } catch (err) {
    if (err?.message === RUN_SENTINEL_STOP) {
      termination = 'sentinel';
    } else {
      errorMsg = err?.message ?? String(err);
      termination = 'exception';
    }
  }

  const resultA = cpu.a & 0xFF;

  return {
    label,
    keyCode: hex(keyCode, 2),
    resultA: hex(resultA, 2),
    resultADecimal: resultA,
    termination,
    steps: totalSteps,
    lastPc: hex(lastPc & 0xFFFFFF),
    hit,
    blocksVisited: blocksVisited.slice(0, 20),
    error: errorMsg,
  };
}

// ─── ROM Table Dump ───────────────────────────────────────────────────────────

function dumpRomTableNear(addr, count = 64) {
  console.log(`\n  Table at ${hex(addr)} (${count} bytes):`);
  for (let offset = 0; offset < count; offset += 16) {
    const lineAddr = addr + offset;
    const bytes = hexBytes(romBytes, lineAddr, Math.min(16, count - offset));
    const ascii = Array.from(romBytes.slice(lineAddr, lineAddr + Math.min(16, count - offset)))
      .map(b => (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.')
      .join('');
    console.log(`    ${hex(lineAddr)}: ${bytes.padEnd(48, ' ')} ${ascii}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Part 1: Static disassembly
  const disasm = staticDisassembly();

  // Look for table references in the disassembly region
  const tableSearchStart = KEY_CLASSIFIER_ENTRY;
  const tableSearchEnd = tableSearchStart + 200;
  const potentialTables = [];

  for (let pc = tableSearchStart; pc < tableSearchEnd; ) {
    try {
      const decoded = decodeInstruction(romBytes, pc, 'adl');
      if (decoded.tag === 'ld-pair-imm' && decoded.value >= 0x070000 && decoded.value < 0x090000) {
        potentialTables.push(decoded.value);
      }
      pc += decoded.length;
    } catch {
      pc += 1;
    }
  }

  if (potentialTables.length > 0) {
    console.log('=== POTENTIAL TABLE REFERENCES FOUND ===');
    for (const tAddr of potentialTables) {
      dumpRomTableNear(tAddr, 64);
    }
    console.log('');
  }

  // Part 2: Dynamic trace
  console.log('=== DYNAMIC TRACE: Key Classifier at 0x07F7BD ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Test a broad range of key codes.
  // The home handler may pass TI-OS _GetKey codes (not raw scan codes).
  // TI-OS key codes: digits 0x8E-0x97, ops 0x80-0x8D, arrows 0x01-0x04, etc.
  const testKeys = [
    // Raw scan codes (in case the handler passes these directly)
    { code: 0x31, label: "scan: digit '2'" },
    { code: 0x32, label: "scan: digit '5'" },
    { code: 0x10, label: "scan: ENTER" },
    { code: 0x37, label: "scan: STAT" },
    { code: 0x11, label: "scan: '+'" },
    { code: 0x64, label: "scan: Y=" },
    { code: 0x16, label: "scan: CLEAR" },
    { code: 0x67, label: "scan: DEL" },
    { code: 0x40, label: "scan: '0'" },
    { code: 0x43, label: "scan: '7'" },
    // TI-OS _GetKey codes (the more likely format for home handler)
    { code: 0x8E, label: "OS: k0 (0x8E)" },
    { code: 0x8F, label: "OS: k1 (0x8F)" },
    { code: 0x90, label: "OS: k2 (0x90)" },
    { code: 0x93, label: "OS: k5 (0x93)" },
    { code: 0x95, label: "OS: k7 (0x95)" },
    { code: 0x97, label: "OS: k9 (0x97)" },
    { code: 0x05, label: "OS: kEnter (0x05)" },
    { code: 0x85, label: "OS: kAdd (0x85)" },
    { code: 0x86, label: "OS: kSub (0x86)" },
    { code: 0xFC, label: "OS: kQuit (0xFC)" },
    { code: 0x09, label: "OS: kUp (0x09)" },
    { code: 0x01, label: "OS: kRight (0x01)" },
    { code: 0x45, label: "OS: kSin (0x45)" },
    { code: 0x30, label: "OS: kStat (0x30)" },
    { code: 0x00, label: "null key (0x00)" },
    { code: 0xFF, label: "key 0xFF" },
  ];

  const results = [];
  for (const { code, label } of testKeys) {
    const result = runKeyClassifier(executor, cpu, mem, code, label);
    results.push(result);
  }

  // Print results table
  console.log('Key Code  | Result A | Dec | Termination | Label');
  console.log('----------|----------|-----|-------------|------');
  for (const r of results) {
    const codeStr = r.keyCode.padEnd(9);
    const resStr = r.resultA.padEnd(8);
    const decStr = String(r.resultADecimal).padEnd(3);
    const termStr = (r.termination ?? '').padEnd(11);
    console.log(`${codeStr} | ${resStr} | ${decStr} | ${termStr} | ${r.label}`);
  }

  // Analysis
  console.log('\n=== CLASSIFICATION ANALYSIS ===\n');

  const byResult = {};
  for (const r of results) {
    const key = r.resultADecimal;
    if (!byResult[key]) byResult[key] = [];
    byResult[key].push(`${r.label} (${r.keyCode})`);
  }

  for (const [resultVal, labels] of Object.entries(byResult).sort((a, b) => Number(a[0]) - Number(b[0]))) {
    const val = Number(resultVal);
    let meaning = '';
    if (val >= 6) meaning = ' -> JP 0x061D42 (error/special)';
    else if (val === 5) meaning = ' -> special handling';
    else meaning = ' -> falls through to BufInsert';
    console.log(`  A=${hex(val, 2)} (${val})${meaning}:`);
    for (const l of labels) {
      console.log(`    - ${l}`);
    }
  }

  // Print block paths for first few results
  console.log('\n=== EXECUTION PATHS (selected results) ===\n');
  for (const r of results.slice(0, 8)) {
    console.log(`${r.label} (code=${r.keyCode}):`);
    console.log(`  Result: A=${r.resultA}, termination=${r.termination}, lastPc=${r.lastPc}`);
    console.log(`  Blocks: ${r.blocksVisited.join(' -> ')}`);
    if (r.error) console.log(`  ERROR: ${r.error}`);
    console.log('');
  }

  // JSON summary
  console.log('\n=== JSON SUMMARY ===');
  console.log(JSON.stringify({
    function: '0x07F7BD',
    description: 'Key classifier called from home handler at 0x0584A7',
    results: results.map(r => ({
      keyCode: r.keyCode,
      label: r.label,
      classValue: r.resultADecimal,
      termination: r.termination,
    })),
    classifications: byResult,
  }, null, 2));
}

main();
