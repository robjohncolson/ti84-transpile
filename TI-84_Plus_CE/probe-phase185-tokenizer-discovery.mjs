#!/usr/bin/env node

/**
 * Phase 185: Tokenizer Discovery — ConvKeyToTok at 0x05C52C
 *
 * Disassembles the OS tokenizer, validates it against the hand-rolled
 * EVAL_TOKEN_MAP in browser-shell.html, and documents the calling convention.
 *
 * ConvKeyToTok is OS jump table entry 847 at 0x020E40 -> 0x05C52C.
 * Called from 0x087643 with key code in A.
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
const CONV_KEY_TO_TOK = 0x05C52C;
const STACK_TOP = 0xD1A87E;
const FAKE_RET = 0x7FFFFE;
const SENTINEL_STOP = '__PHASE185_SENTINEL__';
const TOKEN_BUF_ADDR = 0xD0230E;

// Boot addresses
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT = 0x08C331;
const POST_INIT = 0x0802B2;
const MEM_INIT = 0x09DEE0;

// Jump table region
const JT_START = 0x020000;
const JT_END = 0x021000;

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

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

// ─── Instruction Formatter (from phase 184) ──────────────────────────────────

function formatInstruction(inst) {
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

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  return `${prefix}${text}`;
}

// ─── Part 1: Static Disassembly of ConvKeyToTok ─────────────────────────────

function disassembleConvKeyToTok() {
  console.log('=== PART 1: Static Disassembly of ConvKeyToTok (0x05C52C) ===\n');

  let pc = CONV_KEY_TO_TOK;
  const rows = [];
  let retCount = 0;

  for (let i = 0; i < 80 && retCount < 2; i++) {
    try {
      const decoded = decodeInstruction(romBytes, pc, 'adl');
      const rawBytes = hexBytes(romBytes, pc, decoded.length);
      const formatted = formatInstruction(decoded);
      rows.push({
        addr: pc,
        bytes: rawBytes,
        mnemonic: formatted,
        decoded,
      });

      if (decoded.tag === 'ret' || decoded.tag === 'ret-conditional') {
        retCount++;
      }

      // Annotate table references
      if (decoded.tag === 'ld-pair-imm' && decoded.value < 0x400000 && decoded.value > 0x050000) {
        rows.push({ annotation: `  ^^ possible table/code reference at ${hex(decoded.value)}` });
      }

      pc += decoded.length;
    } catch (err) {
      rows.push({ addr: pc, bytes: hexByte(romBytes[pc]), mnemonic: `DECODE ERROR: ${err.message}` });
      pc += 1;
    }
  }

  for (const row of rows) {
    if (row.annotation) {
      console.log(row.annotation);
    } else {
      console.log(`${hex(row.addr)}: ${row.bytes.padEnd(24, ' ')} ${row.mnemonic}`);
    }
  }

  console.log(`\n(decoded ${rows.length} lines, ended at ${hex(pc)})\n`);
  return rows.filter(r => r.addr !== undefined);
}

// ─── Part 2: Jump Table Search ──────────────────────────────────────────────

function searchJumpTable() {
  console.log('=== PART 2: Jump Table Search for 0x05C52C ===\n');

  // Search for little-endian encoding: 0x2C, 0xC5, 0x05
  const target = [0x2C, 0xC5, 0x05];
  const matches = [];

  for (let addr = JT_START; addr < JT_END - 2; addr++) {
    if (romBytes[addr] === target[0] &&
        romBytes[addr + 1] === target[1] &&
        romBytes[addr + 2] === target[2]) {
      matches.push(addr);
    }
  }

  if (matches.length > 0) {
    console.log(`Found ${matches.length} reference(s) to 0x05C52C in jump table region:`);
    for (const addr of matches) {
      // The JT uses 4-byte entries (JP instruction = 1 byte opcode + 3 byte addr)
      // or just 3-byte address entries. Check context.
      const context = hexBytes(romBytes, addr - 4, 12);
      const entryIndex = Math.floor((addr - JT_START) / 4);
      console.log(`  ${hex(addr)}: ${context}  (approx entry ~${entryIndex})`);
    }
  } else {
    console.log('No direct byte match in 0x020000-0x021000.');
  }

  // Also check the known JT entry from phase25h report
  const knownJTAddr = 0x020E40;
  const jtValue = read24(romBytes, knownJTAddr);
  console.log(`\nKnown JT entry 847 at ${hex(knownJTAddr)}:`);
  console.log(`  Bytes: ${hexBytes(romBytes, knownJTAddr, 4)}`);
  console.log(`  Read as 24-bit LE: ${hex(jtValue)}`);

  // Check the actual JT structure — entries are JP instructions (0xC3 + 3-byte addr)
  const opcode = romBytes[knownJTAddr];
  if (opcode === 0xC3) {
    const jpTarget = read24(romBytes, knownJTAddr + 1);
    console.log(`  JP opcode detected: JP ${hex(jpTarget)}`);
    console.log(`  Match: ${jpTarget === CONV_KEY_TO_TOK ? 'YES' : 'NO'}`);
  } else {
    // Might be raw address entries
    console.log(`  First byte: ${hex(opcode, 2)} (not JP opcode 0xC3)`);
    console.log(`  As raw 24-bit: ${hex(jtValue)} — match: ${jtValue === CONV_KEY_TO_TOK ? 'YES' : 'NO'}`);
  }

  // Also check ConvFCKeyToTok at 0x020E44
  const fcAddr = 0x020E44;
  const fcOpcode = romBytes[fcAddr];
  if (fcOpcode === 0xC3) {
    const fcTarget = read24(romBytes, fcAddr + 1);
    console.log(`\nConvFCKeyToTok (entry 848) at ${hex(fcAddr)}: JP ${hex(fcTarget)}`);
  } else {
    const fcValue = read24(romBytes, fcAddr);
    console.log(`\nConvFCKeyToTok (entry 848) at ${hex(fcAddr)}: raw = ${hex(fcValue)}`);
  }

  console.log('');
  return matches;
}

// ─── Part 3 & 4: Dynamic Test of ConvKeyToTok ──────────────────────────────

function coldBoot(executor, cpu, mem) {
  // Phase 1: z80-mode cold boot
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 2: kernel init
  executor.runFrom(KERNEL_INIT, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 3: post-init
  executor.runFrom(POST_INIT, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  // Phase 4: MEM_INIT with sentinel return
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  try {
    executor.runFrom(MEM_INIT, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 10000,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === FAKE_RET) throw new Error('__MEM_INIT_DONE__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === FAKE_RET) throw new Error('__MEM_INIT_DONE__');
      },
    });
  } catch (err) {
    if (!err.message.includes('MEM_INIT_DONE')) throw err;
  }

  console.log('Boot complete: cold boot + kernel init + post-init + MEM_INIT\n');
}

function testConvKeyToTok(executor, cpu, mem, keyCode, label) {
  // Save token buffer area before call
  const tokenBufBefore = mem[TOKEN_BUF_ADDR];

  // Reset CPU for OS-level call
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP;
  cpu.f = 0x40;

  // Push fake return
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Key code in A
  cpu.a = keyCode & 0xFF;

  // Clear token buffer to detect writes
  mem[TOKEN_BUF_ADDR] = 0x00;
  mem[TOKEN_BUF_ADDR + 1] = 0x00;

  let hit = null;
  let termination = null;
  let errorMsg = null;
  let totalSteps = 0;
  const blocksVisited = [];

  try {
    const result = executor.runFrom(CONV_KEY_TO_TOK, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 64,
      onBlock(pc) {
        const npc = pc & 0xFFFFFF;
        blocksVisited.push(npc);
        if (npc === FAKE_RET) {
          hit = 'sentinel';
          throw new Error(SENTINEL_STOP);
        }
      },
      onMissingBlock(pc) {
        const npc = pc & 0xFFFFFF;
        blocksVisited.push(npc);
        if (npc === FAKE_RET) {
          hit = 'sentinel';
          throw new Error(SENTINEL_STOP);
        }
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

  const resultA = cpu.a & 0xFF;
  const tokenBufAfter = mem[TOKEN_BUF_ADDR];
  const tokenBufAfter1 = mem[TOKEN_BUF_ADDR + 1];

  // Also read HL (some OS calls return values in HL)
  const resultHL = cpu._hl & 0xFFFFFF;
  const resultDE = cpu._de & 0xFFFFFF;
  const resultBC = cpu._bc & 0xFFFFFF;
  const resultF = cpu.f & 0xFF;

  return {
    label,
    keyCode,
    keyCodeHex: hex(keyCode, 2),
    resultA,
    resultAHex: hex(resultA, 2),
    resultHL: hex(resultHL),
    resultDE: hex(resultDE),
    resultBC: hex(resultBC),
    flagsCarry: !!(resultF & 0x01),
    flagsZero: !!(resultF & 0x40),
    tokenBuf: hex(tokenBufAfter, 2),
    tokenBuf1: hex(tokenBufAfter1, 2),
    termination,
    steps: totalSteps,
    hit,
    blocksVisited: blocksVisited.slice(0, 15).map(pc => hex(pc)),
    error: errorMsg,
  };
}

// ─── Part 5: Comparison with EVAL_TOKEN_MAP ─────────────────────────────────

function compareWithHandRolled(testResults) {
  console.log('\n=== PART 5: Comparison with hand-rolled EVAL_TOKEN_MAP ===\n');

  // Hand-rolled map from browser-shell.html line ~1543
  const EVAL_TOKEN_MAP = {
    '0': 0x30, '1': 0x31, '2': 0x32, '3': 0x33, '4': 0x34,
    '5': 0x35, '6': 0x36, '7': 0x37, '8': 0x38, '9': 0x39,
    '+': 0x70, '-': 0x71, '*': 0x82, '/': 0x83,
    '.': 0x3A, '(': 0x10, ')': 0x11,
    'E': 0x3B, '^': 0x0F, ',': 0x2B,
  };

  // Map key codes to character labels for comparison
  const keyCodeToChar = {
    0x8E: '0', 0x8F: '1', 0x92: '2', 0x93: '3', 0x94: '4',
    0x95: '5', 0x96: '6', 0x97: '7', 0x98: '8', 0x99: '9',
    // Note: the task spec has different key code mappings
    // Using the spec: k0=0x8E, k1=0x8F, k2=0x92, k3=0x93, k9=0x97
    0x9B: '+', 0x9C: '-', 0x9D: '*', 0x9E: '/',
    0x99: '.', 0x9A: 'neg',
  };

  // Expected token from EVAL_TOKEN_MAP
  const comparisons = [];

  for (const result of testResults) {
    const char = keyCodeToChar[result.keyCode];
    if (!char) continue;

    const expectedToken = char === 'neg' ? 0xB0 : EVAL_TOKEN_MAP[char];
    if (expectedToken === undefined) continue;

    const actualToken = result.resultA;
    const match = actualToken === expectedToken;

    comparisons.push({
      key: char === 'neg' ? '(-) negation' : char,
      keyCode: result.keyCodeHex,
      expectedToken: hex(expectedToken, 2),
      actualA: result.resultAHex,
      tokenBuf: result.tokenBuf,
      match: match ? 'OK' : 'MISMATCH',
      termination: result.termination,
    });
  }

  if (comparisons.length > 0) {
    console.log('Key     | Code   | Expected | A result | TokenBuf | Match    | Term');
    console.log('--------|--------|----------|----------|----------|----------|----------');
    for (const c of comparisons) {
      const keyStr = c.key.padEnd(7);
      const codeStr = c.keyCode.padEnd(6);
      const expStr = c.expectedToken.padEnd(8);
      const actStr = c.actualA.padEnd(8);
      const tbStr = c.tokenBuf.padEnd(8);
      const matchStr = c.match.padEnd(8);
      console.log(`${keyStr} | ${codeStr} | ${expStr} | ${actStr} | ${tbStr} | ${matchStr} | ${c.termination}`);
    }
  } else {
    console.log('No matching key codes found in test results for comparison.');
  }

  return comparisons;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  // Part 1: Static disassembly
  const disasmRows = disassembleConvKeyToTok();

  // Part 2: Jump table search
  const jtMatches = searchJumpTable();

  // Parts 3 & 4: Dynamic testing
  console.log('=== PARTS 3 & 4: Dynamic Test of ConvKeyToTok ===\n');
  console.log('Booting...');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  // Part 3: Test with TI-OS key codes from the task spec
  const specTestKeys = [
    { code: 0x8E, label: 'k0', expectedToken: 0x30 },
    { code: 0x8F, label: 'k1', expectedToken: 0x31 },
    { code: 0x92, label: 'k2', expectedToken: 0x32 },
    { code: 0x93, label: 'k3', expectedToken: 0x33 },
    { code: 0x97, label: 'k9', expectedToken: 0x39 },
    { code: 0x9B, label: 'kAdd', expectedToken: 0x70 },
    { code: 0x9C, label: 'kSub', expectedToken: 0x71 },
    { code: 0x9D, label: 'kMul', expectedToken: 0x82 },
    { code: 0x9E, label: 'kDiv', expectedToken: 0x83 },
    { code: 0x99, label: 'kDecPt', expectedToken: 0x3A },
    { code: 0x9A, label: 'kChs (negation)', expectedToken: 0xB0 },
  ];

  // Part 4: Additional keys from keyboard-matrix.md
  const additionalKeys = [
    { code: 0x85, label: 'kLParen (OS code guess)' },
    { code: 0x86, label: 'kRParen (OS code guess)' },
    { code: 0x87, label: 'kComma (OS code guess)' },
    { code: 0x05, label: 'kEnter (OS code 0x05)' },
    { code: 0x09, label: 'kUp (OS code 0x09)' },
    { code: 0xFC, label: 'kQuit (OS code 0xFC)' },
    { code: 0x00, label: 'null key' },
    { code: 0xFF, label: 'key 0xFF' },
    // Also test all digit key codes in sequence to find the full mapping
    { code: 0x90, label: 'k? (0x90)' },
    { code: 0x91, label: 'k? (0x91)' },
    { code: 0x94, label: 'k4? (0x94)' },
    { code: 0x95, label: 'k5? (0x95)' },
    { code: 0x96, label: 'k6? (0x96)' },
    { code: 0x98, label: 'k8? (0x98)' },
  ];

  const allTestKeys = [...specTestKeys, ...additionalKeys];
  const allResults = [];

  console.log('Running ConvKeyToTok for each key code...\n');

  for (const testKey of allTestKeys) {
    const result = testConvKeyToTok(executor, cpu, mem, testKey.code, testKey.label);
    allResults.push(result);
  }

  // Print results table
  console.log('Key Code | A result | TokenBuf | Term       | Label');
  console.log('---------|----------|----------|------------|------');
  for (const r of allResults) {
    const codeStr = r.keyCodeHex.padEnd(8);
    const aStr = r.resultAHex.padEnd(8);
    const tbStr = r.tokenBuf.padEnd(8);
    const termStr = (r.termination ?? '').padEnd(10);
    console.log(`${codeStr} | ${aStr} | ${tbStr} | ${termStr} | ${r.label}`);
  }

  // Print spec test results with expected token comparison
  console.log('\n--- Spec Test Results (with expected token) ---\n');
  console.log('Label         | Code | Expected | A result | Match | TokenBuf | Term');
  console.log('--------------|------|----------|----------|-------|----------|-----');
  for (let i = 0; i < specTestKeys.length; i++) {
    const spec = specTestKeys[i];
    const r = allResults[i];
    const match = r.resultA === spec.expectedToken ? 'OK' : 'MISS';
    const lbl = spec.label.padEnd(13);
    const code = r.keyCodeHex.padEnd(4);
    const exp = hex(spec.expectedToken, 2).padEnd(8);
    const act = r.resultAHex.padEnd(8);
    const matchStr = match.padEnd(5);
    const tb = r.tokenBuf.padEnd(8);
    console.log(`${lbl} | ${code} | ${exp} | ${act} | ${matchStr} | ${tb} | ${r.termination}`);
  }

  // Print block execution paths for a few results
  console.log('\n--- Execution Paths (first 5 results) ---\n');
  for (const r of allResults.slice(0, 5)) {
    console.log(`${r.label} (code=${r.keyCodeHex}):`);
    console.log(`  A=${r.resultAHex}, HL=${r.resultHL}, DE=${r.resultDE}, BC=${r.resultBC}`);
    console.log(`  Carry=${r.flagsCarry}, Zero=${r.flagsZero}`);
    console.log(`  TokenBuf[0]=${r.tokenBuf}, TokenBuf[1]=${r.tokenBuf1}`);
    console.log(`  Blocks: ${r.blocksVisited.join(' -> ')}`);
    if (r.error) console.log(`  ERROR: ${r.error}`);
    console.log('');
  }

  // Part 5: Comparison with hand-rolled map
  const comparisons = compareWithHandRolled(allResults);

  // ─── JSON Summary ──────────────────────────────────────────────────────────

  console.log('\n=== JSON SUMMARY ===');
  console.log(JSON.stringify({
    probe: 'phase185-tokenizer-discovery',
    function: 'ConvKeyToTok',
    address: '0x05C52C',
    jumpTableEntry: {
      index: 847,
      jtAddress: '0x020E40',
      target: '0x05C52C',
    },
    disassembly: {
      startAddress: '0x05C52C',
      instructionCount: disasmRows.length,
      instructions: disasmRows.slice(0, 30).map(r => ({
        address: hex(r.addr),
        bytes: r.bytes,
        mnemonic: r.mnemonic,
      })),
    },
    jtSearchResults: {
      region: '0x020000-0x021000',
      matchCount: jtMatches.length,
      matchAddresses: jtMatches.map(a => hex(a)),
    },
    testResults: allResults.map(r => ({
      label: r.label,
      keyCode: r.keyCodeHex,
      resultA: r.resultAHex,
      tokenBuf: r.tokenBuf,
      termination: r.termination,
      blocksVisited: r.blocksVisited.length,
    })),
    specComparison: specTestKeys.map((spec, i) => ({
      label: spec.label,
      keyCode: hex(spec.code, 2),
      expectedToken: hex(spec.expectedToken, 2),
      actualA: allResults[i].resultAHex,
      match: allResults[i].resultA === spec.expectedToken,
    })),
    handRolledComparison: comparisons,
  }, null, 2));
}

main();
