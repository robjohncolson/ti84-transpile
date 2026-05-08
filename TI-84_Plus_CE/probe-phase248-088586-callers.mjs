#!/usr/bin/env node

/**
 * Phase 248 summary (captured from ROM bytes while authoring this probe):
 * - Confirmed entry: 0x088586.
 * - Raw RET-like bytes in 0x088570-0x088620 include many embedded 0xC0/0xC8/0xD0
 *   immediates, but the bracketing unconditional RETs are 0x088585 and 0x088613.
 * - Static CALL/JP scan for 0x088585..0x088590 found exactly one direct xref:
 *   0x085D4B: JP Z, 0x088586
 * - Caller gate near 0x085D3F:
 *   CALL 0x086C45
 *   JR NZ, 0x085D51
 *   LD HL, 0xD02661
 *   BIT 7, (HL)
 *   JP Z, 0x088586
 * - Function body 0x088586-0x0885ED:
 *   LD A,0x49 -> (0xD00824), computes 0x11 - B in A, copies 0x0104 bytes from
 *   0xD02437 to 0xD02663, sets IY+76 bit 5, samples 0xD000C4 bit 2 and IY+5 bit 6,
 *   writes 0xD01128/0xD0112E/0xD0112F, clears IY+68 bit 2 and IY+13 bit 6,
 *   CALL 0x07F984, POP AF, JP 0x0AF1DC.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const WINDOW_START = 0x088570;
const WINDOW_END = 0x088620;
const TARGET_START = 0x088585;
const TARGET_END = 0x088590;
const CONFIRMED_ENTRY = 0x088586;
const FUNCTION_END_EXCLUSIVE = 0x0885EE;
const CALLER_CONTEXT_BYTES = 16;
const ALIGNED_LOOKBACK_BYTES = 24;
const ALIGNED_AFTER_BYTES = 12;

const RET_OPS = new Map([
  [0xC0, 'RET NZ'],
  [0xC8, 'RET Z'],
  [0xC9, 'RET'],
  [0xD0, 'RET NC'],
  [0xD8, 'RET C'],
  [0xE0, 'RET PO'],
  [0xE8, 'RET PE'],
  [0xF0, 'RET P'],
  [0xF8, 'RET M'],
]);

const BRANCH_OPS = new Map([
  [0xC2, 'JP NZ'],
  [0xC3, 'JP'],
  [0xC4, 'CALL NZ'],
  [0xCA, 'JP Z'],
  [0xCC, 'CALL Z'],
  [0xCD, 'CALL'],
  [0xD2, 'JP NC'],
  [0xD4, 'CALL NC'],
  [0xDA, 'JP C'],
  [0xDC, 'CALL C'],
  [0xE2, 'JP PO'],
  [0xE4, 'CALL PO'],
  [0xEA, 'JP PE'],
  [0xEC, 'CALL PE'],
  [0xF2, 'JP P'],
  [0xF4, 'CALL P'],
  [0xFA, 'JP M'],
  [0xFC, 'CALL M'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind':
      return `SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind':
      return `RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-reg':
      return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'push':
      return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'ldir':
      return 'LDIR';
    case 'scf':
      return 'SCF';
    case 'nop':
      return 'NOP';
    default: {
      let text = inst.tag;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
      if (inst.addr !== undefined) text += ` addr=${hex(inst.addr)}`;
      return text;
    }
  }
}

function disassembleRange(romBytes, start, end) {
  const rows = [];

  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = inst.length || 1;
      rows.push({
        pc,
        length,
        bytes: bytesToHex(romBytes.subarray(pc, Math.min(pc + length, end))),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        length: 1,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }

  return rows;
}

function findRetBytes(romBytes, start, end) {
  const rows = [];

  for (let addr = start; addr < end; addr += 1) {
    const opcode = romBytes[addr];
    if (!RET_OPS.has(opcode)) continue;
    rows.push({
      addr,
      opcode,
      mnemonic: RET_OPS.get(opcode),
    });
  }

  return rows;
}

function scanDirectBranches(romBytes, targetStart, targetEnd) {
  const hits = [];

  for (let addr = 0; addr <= romBytes.length - 4; addr += 1) {
    const opcode = romBytes[addr];
    const type = BRANCH_OPS.get(opcode);
    if (!type) continue;

    const target = romBytes[addr + 1] | (romBytes[addr + 2] << 8) | (romBytes[addr + 3] << 16);
    if (target < targetStart || target > targetEnd) continue;

    hits.push({ addr, type, target });
  }

  hits.sort((left, right) => {
    if (left.addr !== right.addr) return left.addr - right.addr;
    return left.target - right.target;
  });

  return hits;
}

function findContextRows(romBytes, hitAddr) {
  const preferredStart = Math.max(0, hitAddr - CALLER_CONTEXT_BYTES);
  const searchStart = Math.max(0, hitAddr - ALIGNED_LOOKBACK_BYTES);
  const end = Math.min(romBytes.length, hitAddr + ALIGNED_AFTER_BYTES);
  let best = null;

  for (let start = searchStart; start <= hitAddr; start += 1) {
    const rows = [];
    let pc = start;
    let sawHit = false;
    let valid = true;
    let guard = 0;

    while (pc < end && guard < 64) {
      guard += 1;

      try {
        const inst = decodeInstruction(romBytes, pc, 'adl');
        const length = inst.length || 1;
        rows.push({
          pc,
          length,
          bytes: bytesToHex(romBytes.subarray(pc, Math.min(pc + length, end))),
          text: formatInstruction(inst),
        });

        if (pc === hitAddr) sawHit = true;
        pc += length;

        if (!sawHit && pc > hitAddr) {
          valid = false;
          break;
        }
      } catch {
        valid = false;
        break;
      }
    }

    if (!valid || !sawHit) continue;

    const score = Math.abs(start - preferredStart);
    if (!best || score < best.score) best = { score, start, rows };
  }

  return best;
}

function printSection(title) {
  console.log(title);
  console.log('-'.repeat(title.length));
}

function main() {
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const retBytes = findRetBytes(romBytes, WINDOW_START, WINDOW_END);
  const bodyRows = disassembleRange(romBytes, CONFIRMED_ENTRY, FUNCTION_END_EXCLUSIVE);
  const bodyBoundarySet = new Set(bodyRows.map((row) => row.pc));
  const directHits = scanDirectBranches(romBytes, TARGET_START, TARGET_END);
  const unconditionalRets = retBytes.filter((row) => row.opcode === 0xC9);
  const previousRet = [...unconditionalRets].reverse().find((row) => row.addr < CONFIRMED_ENTRY) ?? null;
  const nextRet = unconditionalRets.find((row) => row.addr > FUNCTION_END_EXCLUSIVE) ?? null;

  console.log('Phase 248: 0x088586 caller hunt');
  console.log('='.repeat(32));
  console.log(`ROM loaded: ${romBytes.length} bytes`);
  console.log('');

  printSection('1. Boundary scan 0x088570-0x088620');
  console.log('Raw RET-like bytes in this window:');
  for (const row of retBytes) {
    let note = 'embedded immediate / not a 0x088586 body boundary';
    if (previousRet && row.addr === previousRet.addr) note = 'previous unconditional RET before candidate entry';
    else if (nextRet && row.addr === nextRet.addr) note = 'next unconditional RET after the tail-jump body';
    else if (bodyBoundarySet.has(row.addr)) note = 'actual instruction boundary inside 0x088586 body';

    console.log(`  ${hex(row.addr)}: ${row.mnemonic.padEnd(6)} (${hexByte(row.opcode)})  ${note}`);
  }
  console.log('');
  console.log(`Boundary guess: ${hex(CONFIRMED_ENTRY)} starts immediately after ${previousRet ? hex(previousRet.addr) : 'n/a'},`);
  console.log(`and the next bracketing unconditional RET in the window is ${nextRet ? hex(nextRet.addr) : 'n/a'}.`);
  console.log('');

  printSection('2. Static CALL/JP scan for 0x088585..0x088590');
  const hitsByTarget = new Map();
  for (let target = TARGET_START; target <= TARGET_END; target += 1) {
    hitsByTarget.set(target, []);
  }
  for (const hit of directHits) {
    hitsByTarget.get(hit.target)?.push(hit);
  }

  for (let target = TARGET_START; target <= TARGET_END; target += 1) {
    const hits = hitsByTarget.get(target) ?? [];
    if (hits.length === 0) {
      console.log(`  ${hex(target)}: no direct CALL/JP hits`);
      continue;
    }

    console.log(`  ${hex(target)}: ${hits.length} hit(s)`);
    for (const hit of hits) {
      console.log(`    ${hex(hit.addr)}: ${hit.type} ${hex(hit.target)}`);
    }
  }
  console.log('');
  console.log(`Confirmed entry by xref count: ${hex(CONFIRMED_ENTRY)} is the only address in the range with any direct hit.`);
  console.log('');

  printSection('3. Caller contexts');
  if (directHits.length === 0) {
    console.log('  No direct callers found.');
  } else {
    for (const hit of directHits) {
      const rawStart = Math.max(0, hit.addr - CALLER_CONTEXT_BYTES);
      const rawEnd = Math.min(romBytes.length, hit.addr + 4);
      const rawBytes = romBytes.subarray(rawStart, rawEnd);
      const aligned = findContextRows(romBytes, hit.addr);

      console.log(`  ${hex(hit.addr)}: ${hit.type} ${hex(hit.target)}`);
      console.log(`    raw bytes @ ${hex(rawStart)}-${hex(rawEnd - 1)}: ${bytesToHex(rawBytes)}`);

      if (!aligned) {
        console.log('    aligned decode: (no exact boundary found)');
      } else {
        console.log(`    aligned decode from ${hex(aligned.start)}:`);
        for (const row of aligned.rows) {
          const marker = row.pc === hit.addr ? '  <-- direct caller' : '';
          console.log(`      ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${marker}`);
        }
      }

      console.log('');
    }
  }

  printSection('4. Function body disassembly 0x088586-0x0885EE');
  for (const row of bodyRows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}`);
  }
  console.log('');

  printSection('Summary');
  console.log(`  Confirmed entry point: ${hex(CONFIRMED_ENTRY)}`);
  console.log(`  Direct callers in 0x088585..0x088590 scan: ${directHits.length}`);
  if (directHits.length > 0) {
    console.log(`  Only direct caller: ${hex(directHits[0].addr)} (${directHits[0].type})`);
  }
  console.log('  Trigger condition from caller context:');
  console.log('    CALL 0x086C45 must leave NZ clear, then BIT 7,(0xD02661) must be zero.');
  console.log('    The JP Z at 0x085D4B then enters 0x088586 to arm the pending-display path.');
}

main();
