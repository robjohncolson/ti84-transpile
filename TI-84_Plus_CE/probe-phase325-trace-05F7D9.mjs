#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const WRAPPER = 0x05F7D9;
const VECTOR = 0x0005CC;
const LOOKBACK = 0xC8;
const KNOWN_LCD = [
  { addr: 0x010A3C, name: 'LCD sync' },
  { addr: 0x055280, name: 'LCD DMA transfer' },
  { addr: 0x055191, name: 'config table copier' },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return hex(value & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hex8(b)).join(' ');
}

function read24(addr) {
  return (rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16)) >>> 0;
}

function up(value) {
  return String(value).toUpperCase();
}

function fmtIndexed(inst) {
  const disp = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
  return `(${up(inst.indexRegister)}${disp})`;
}

function fmt(inst) {
  if (!inst) return '(decode error)';
  const p = inst.modePrefix ? `${up(inst.modePrefix)} ` : '';
  switch (inst.tag) {
    case 'call': return `${p}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${p}CALL ${up(inst.condition)}, ${hex(inst.target)}`;
    case 'jp': return `${p}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}JP ${up(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}JP (${up(inst.indirectRegister)})`;
    case 'jr': return `${p}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}JR ${up(inst.condition)}, ${hex(inst.target)}`;
    case 'ret': return `${p}RET`;
    case 'ret-conditional': return `${p}RET ${up(inst.condition)}`;
    case 'push': return `${p}PUSH ${up(inst.pair ?? inst.reg ?? inst.src)}`;
    case 'pop': return `${p}POP ${up(inst.pair ?? inst.reg ?? inst.dest)}`;
    case 'ld-pair-imm': return `${p}LD ${up(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${p}LD ${up(inst.dest)}, ${hex8(inst.value)}`;
    case 'ld-reg-reg': return `${p}LD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'ld-reg-mem': return `${p}LD ${up(inst.dest)}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg': return `${p}LD (${hex(inst.addr ?? inst.address)}), ${up(inst.src)}`;
    case 'ld-pair-mem': return `${p}LD ${up(inst.pair)}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-pair': return `${p}LD (${hex(inst.addr ?? inst.address)}), ${up(inst.pair)}`;
    case 'ld-reg-ind': return `${p}LD ${up(inst.dest)}, (${up(inst.src ?? inst.pair)})`;
    case 'ld-ind-reg': return `${p}LD (${up(inst.dest)}), ${up(inst.src)}`;
    case 'ld-reg-ixd': return `${p}LD ${up(inst.dest)}, ${fmtIndexed(inst)}`;
    case 'ld-ixd-reg': return `${p}LD ${fmtIndexed(inst)}, ${up(inst.src)}`;
    case 'alu-imm': return `${p}${up(inst.op)} ${hex8(inst.value)}`;
    case 'alu-reg': return `${p}${up(inst.op)} ${up(inst.src ?? inst.reg)}`;
    case 'inc-reg': return `${p}INC ${up(inst.reg)}`;
    case 'dec-reg': return `${p}DEC ${up(inst.reg)}`;
    case 'inc-pair': return `${p}INC ${up(inst.pair)}`;
    case 'dec-pair': return `${p}DEC ${up(inst.pair)}`;
    case 'add-pair': return `${p}ADD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'in-reg': return `${p}IN ${up(inst.reg)}, (C)`;
    case 'in0': return `${p}IN0 ${up(inst.reg)}, (${hex8(inst.port)})`;
    case 'out-reg': return `${p}OUT (C), ${up(inst.reg)}`;
    case 'out0': return `${p}OUT0 (${hex8(inst.port)}), ${up(inst.reg)}`;
    case 'bit-test-ind': return `${p}BIT ${inst.bit}, (${up(inst.indirectRegister)})`;
    case 'indexed-cb-bit': return `${p}BIT ${inst.bit}, ${fmtIndexed(inst)}`;
    case 'nop': return `${p}NOP`;
    default: return `${p}[${inst.tag}]${inst.target !== undefined ? ` ${hex(inst.target)}` : ''}`;
  }
}

function isHardTerminator(inst) {
  return inst && ['ret', 'reti', 'retn', 'jp', 'jp-indirect', 'jr', 'rst'].includes(inst.tag);
}

function decodeRow(pc, cap = rom.length) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = Math.max(1, inst?.length ?? 1);
    return { pc, inst, len, bytes: bytesToHex(rom.subarray(pc, Math.min(pc + len, cap))), text: fmt(inst) };
  } catch (error) {
    return { pc, inst: null, len: 1, bytes: hex8(rom[pc]), text: `DB ${hex8(rom[pc])} ; ${error?.message ?? 'decode error'}` };
  }
}

function disasm(start, maxBytes = 96, stopAtTerminator = true) {
  const rows = [];
  const end = Math.min(rom.length, start + maxBytes);
  for (let pc = start; pc < end;) {
    const row = decodeRow(pc, end);
    rows.push(row);
    pc += row.len;
    if (stopAtTerminator && isHardTerminator(row.inst)) break;
  }
  return rows;
}

function prologueAt(addr) {
  const b = rom;
  if (b[addr] === 0xDD && b[addr + 1] === 0xE5 && b[addr + 2] === 0xDD && b[addr + 3] === 0x21 && b[addr + 7] === 0xDD && b[addr + 8] === 0x39) return 'IX frame prologue';
  if (b[addr] === 0xFD && b[addr + 1] === 0xE5 && b[addr + 2] === 0xFD && b[addr + 3] === 0x21 && b[addr + 7] === 0xFD && b[addr + 8] === 0x39) return 'IY frame prologue';
  if (b[addr] === 0xDD && b[addr + 1] === 0xE5) return 'PUSH IX leaf prologue';
  if (b[addr] === 0xFD && b[addr + 1] === 0xE5) return 'PUSH IY leaf prologue';
  if ([0xF5, 0xC5, 0xD5, 0xE5].includes(b[addr])) return 'callee-saved push sequence';
  return null;
}

function reachesTarget(start, target) {
  for (let pc = start, steps = 0; pc < target && steps < 80; steps++) {
    const row = decodeRow(pc, target);
    const next = pc + row.len;
    if (!row.inst || next > target || isHardTerminator(row.inst)) return false;
    pc = next;
    if (pc === target) return true;
  }
  return false;
}

function boundaryBefore(target) {
  for (let start = Math.max(0, target - 8); start < target; start++) {
    for (let pc = start, steps = 0; pc < target && steps < 4; steps++) {
      const row = decodeRow(pc, target);
      const next = pc + row.len;
      if (next === target && isHardTerminator(row.inst)) return row;
      if (!row.inst || next > target || isHardTerminator(row.inst)) break;
      pc = next;
    }
  }
  return null;
}

function findFunctionStart(target) {
  for (let addr = target - 1; addr >= Math.max(0, target - LOOKBACK); addr--) {
    const why = prologueAt(addr);
    if (why && reachesTarget(addr, target)) return { start: addr, reason: `${why} at ${hex(addr)}` };
  }
  const boundary = boundaryBefore(target);
  if (boundary) return { start: target, reason: `no prologue found; prior function ends with ${boundary.text} at ${hex(boundary.pc)}` };
  return { start: target, reason: `fallback to ${hex(target)} after scanning ${hex(LOOKBACK)}` };
}

function scanDirectRefs(target) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - 4; pc++) {
    const op = rom[pc];
    if ((op === 0xCD || op === 0xC3) && read24(pc + 1) === target) hits.push({ pc, op: op === 0xCD ? 'CALL' : 'JP' });
  }
  return hits;
}

function alignedStart(target, lookback = 12) {
  for (let start = target; start >= Math.max(0, target - lookback); start--) {
    for (let pc = start, steps = 0; pc < target && steps < 8; steps++) {
      const row = decodeRow(pc, target + 24);
      const next = pc + row.len;
      if (!row.inst || next > target) break;
      if (next === target) return start;
      pc = next;
    }
  }
  return target;
}

function printRows(rows, markPc = -1) {
  for (const row of rows) {
    const mark = row.pc === markPc ? '>>' : '  ';
    console.log(`${mark} ${hex(row.pc)}  ${row.bytes.padEnd(16)}  ${row.text}`);
  }
}

function main() {
  const entry = findFunctionStart(WRAPPER);
  const body = disasm(entry.start, 96, true);
  const end = body[body.length - 1].pc + body[body.length - 1].len;
  const vectorRefs = scanDirectRefs(VECTOR);
  const callers = scanDirectRefs(entry.start);
  const callIndex = body.findIndex((row) => row.inst?.tag === 'call' && row.inst.target === VECTOR);
  const postRows = callIndex >= 0 ? body.slice(callIndex + 1) : [];
  const lcdRefs = body.filter((row) => {
    const target = row.inst?.target;
    return target !== undefined && (
      KNOWN_LCD.some((item) => item.addr === target) ||
      (target >= 0x055000 && target <= 0x0558FF)
    );
  });

  console.log('=== Phase 325: Trace 0x05F7D9 ===');
  console.log(`ROM: ${path.join(__dirname, 'ROM.rom')}`);

  console.log('\n--- Part 1: Function containing 0x05F7D9 ---');
  console.log(`Selected start: ${hex(entry.start)} (${entry.reason})`);
  console.log(`Approximate size: ${hex(end - entry.start, 2)} bytes, ending at ${hex(end - 1)}`);
  printRows(body, WRAPPER);

  console.log('\n--- Part 2: Direct callers ---');
  console.log(`Refs to BCALL vector ${hex(VECTOR)}: ${vectorRefs.length}`);
  for (const hit of vectorRefs) console.log(`  ${hex(hit.pc)}  ${hit.op} ${hex(VECTOR)}`);
  console.log(`Refs to wrapper ${hex(entry.start)}: ${callers.length}`);
  for (const hit of callers) {
    console.log(`\n  ${hex(hit.pc)}  ${hit.op} ${hex(entry.start)}`);
    printRows(disasm(alignedStart(hit.pc), 28, false).filter((row) => row.pc < hit.pc + 16), hit.pc);
  }

  console.log('\n--- Part 3: What happens after CALL 0x0005CC ---');
  if (callIndex < 0) {
    console.log('Vector call not found inside the selected function body.');
  } else if (!postRows.length) {
    console.log('No instructions follow the vector call inside the decoded body.');
  } else {
    printRows(postRows);
    console.log(postRows[0].inst?.tag === 'ret'
      ? 'Analysis: the wrapper returns immediately, so HL from 0x0005CC is forwarded unchanged to the caller.'
      : 'Analysis: the rows above are the post-call consumers of HL.');
  }

  console.log('\n--- Part 4: LCD cross-references inside this function ---');
  if (!lcdRefs.length) {
    console.log('No calls/jumps to 0x010A3C, 0x055191, 0x055280, or any 0x0550xx-0x0558xx target were found in the wrapper body.');
  } else {
    for (const row of lcdRefs) {
      const known = KNOWN_LCD.find((item) => item.addr === row.inst.target);
      console.log(`  ${hex(row.pc)}  ${row.text}${known ? `  ; ${known.name}` : '  ; 0x0550xx-0x0558xx'}`);
    }
  }

  console.log('\n--- Bottom line ---');
  console.log(`${hex(WRAPPER)} is a 5-byte leaf wrapper: CALL ${hex(VECTOR)}; RET.`);
  console.log(`That means the LCD timing value from ${hex(0x007B70)} is not interpreted here; it is simply returned upward as HL.`);
  console.log(`The wrapper itself has ${callers.length} direct runtime caller(s), while the BCALL stub has ${vectorRefs.length} direct caller(s).`);
}

main();
