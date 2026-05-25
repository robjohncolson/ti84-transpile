#!/usr/bin/env node
/**
 * Phase 443: Trace D176FB — gate flag written by D14078/D14079 consumers
 *
 * Scans the entire 4MB ROM for all references to address 0xD176FB,
 * classifies each as read/write, finds co-accessed D1xxxx addresses,
 * and prints a full reference map.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MODE = 'adl';

const TARGET_ADDR = 0xD176FB;
const TARGET_NAME = 'D176FB';

// Also scan nearby addresses to check if this is part of a multi-byte field
const TARGETS = [
  { name: 'D176FB', addr: 0xD176FB },
  { name: 'D176FC', addr: 0xD176FC },
  { name: 'D176FD', addr: 0xD176FD },
];

const CONTEXT_RADIUS = 12;
const FUNCTION_SCAN_BACK = 0x800;
const CO_ACCESS_WINDOW = 80; // bytes around a hit to scan for other D1xxxx refs

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM image: ${ROM_PATH}`);
}

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesHex(start, length) {
  return Array.from(rom.slice(start, start + length))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function contextHex(hit, radius = CONTEXT_RADIUS) {
  const start = Math.max(0, hit - radius);
  const end = Math.min(rom.length, hit + 3 + radius);
  const pieces = [];
  for (let i = start; i < end; i++) {
    const text = rom[i].toString(16).toUpperCase().padStart(2, '0');
    if (i >= hit && i < hit + 3) {
      pieces.push(`[${text}]`);
    } else {
      pieces.push(text);
    }
  }
  return pieces.join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('invalid decode');
    }
    return inst;
  } catch (error) {
    return {
      pc,
      nextPc: pc + 1,
      length: 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: String(error?.message ?? error),
    };
  }
}

function renderInstruction(inst) {
  switch (inst.tag) {
    case 'db': return `DB ${hexByte(inst.value)}`;
    case 'ret': return 'RET';
    case 'retn': return 'RETN';
    case 'reti': return 'RETI';
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()},${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()},${hex(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-pair-indexed':
      return `LD ${inst.pair.toUpperCase()},(${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-indexed-pair':
      return `LD ${inst.pair.toUpperCase()},(${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ixd-reg':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${inst.src.toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()},(${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ind-reg':
      return `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `LEA ${inst.dest.toUpperCase()},${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'lea':
      return `LEA ${inst.dest.toUpperCase()},${inst.base.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'add-pair':
      return `ADD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL,${inst.src.toUpperCase()}`;
    case 'rla': return 'RLA';
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') return 'XOR A';
      return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm':
      return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function classifyInstruction(inst) {
  switch (inst.tag) {
    case 'ld-pair-mem':
    case 'ld-reg-mem':
      return 'READ';
    case 'ld-mem-pair':
    case 'ld-mem-reg':
      return 'WRITE';
    default:
      return 'UNKNOWN';
  }
}

function scanRawHits(targetAddr) {
  const pattern = [targetAddr & 0xFF, (targetAddr >> 8) & 0xFF, (targetAddr >> 16) & 0xFF];
  const hits = [];
  for (let i = 0; i <= rom.length - 3; i++) {
    if (rom[i] === pattern[0] && rom[i + 1] === pattern[1] && rom[i + 2] === pattern[2]) {
      hits.push(i);
    }
  }
  return hits;
}

function resolveInstructionForHit(hit, targetAddr) {
  for (const delta of [0, -1, -2, -3, -4, -5]) {
    const pc = hit + delta;
    if (pc < 0) continue;
    const inst = safeDecode(pc);
    if (inst.addr === targetAddr) {
      return inst;
    }
  }
  return null;
}

/** Scan backwards from a hit to estimate the containing function start */
function estimateFunction(hitPc) {
  const scanStart = Math.max(0, hitPc - FUNCTION_SCAN_BACK);
  let bestCandidate = null;

  // Look for PUSH IX/IY or PUSH AF patterns that typically start functions
  for (let pc = scanStart; pc < hitPc; ) {
    const inst = safeDecode(pc);

    // Common function prologue patterns
    if (inst.tag === 'push' && (inst.pair === 'ix' || inst.pair === 'iy' || inst.pair === 'af')) {
      bestCandidate = pc;
    }
    // RET/RETN/RETI likely ends a previous function
    if (inst.tag === 'ret' || inst.tag === 'retn' || inst.tag === 'reti') {
      bestCandidate = null; // reset — next push will be the real function start
    }

    if (inst.nextPc <= pc) break;
    pc = inst.nextPc;
  }
  return bestCandidate;
}

/** Find co-accessed D1xxxx addresses near a hit */
function findCoAccesses(hitOffset) {
  const windowStart = Math.max(0, hitOffset - CO_ACCESS_WINDOW);
  const windowEnd = Math.min(rom.length - 3, hitOffset + CO_ACCESS_WINDOW);
  const coAddrs = new Set();

  for (let i = windowStart; i <= windowEnd; i++) {
    if (rom[i + 2] === 0xD1) {
      const addr = rom[i] | (rom[i + 1] << 8) | (0xD1 << 16);
      if (addr !== TARGET_ADDR && addr >= 0xD10000 && addr <= 0xD1FFFF) {
        coAddrs.add(addr);
      }
    }
  }
  return [...coAddrs].sort((a, b) => a - b);
}

/** Disassemble a window around a hit for context */
function disassembleWindow(hitPc, before = 5, after = 5) {
  // Find a start point ~before instructions back
  let startPc = Math.max(0, hitPc - before * 4);
  const rows = [];
  let pc = startPc;
  const endPc = hitPc + after * 4;

  while (pc < endPc && pc < rom.length) {
    const inst = safeDecode(pc);
    rows.push(inst);
    if (inst.nextPc <= pc) break;
    pc = inst.nextPc;
  }
  return rows;
}

function findRefs(target) {
  return scanRawHits(target.addr).map((hit) => {
    const inst = resolveInstructionForHit(hit, target.addr);
    const sitePc = inst?.pc ?? hit;
    const funcStart = estimateFunction(sitePc);
    const coAccesses = findCoAccesses(hit);
    return {
      hit,
      inst,
      sitePc,
      classification: inst ? classifyInstruction(inst) : 'UNKNOWN',
      rendered: inst ? renderInstruction(inst) : '(unresolved raw hit)',
      funcStart,
      coAccesses,
      context: contextHex(hit),
    };
  });
}

function printRefs(target, refs) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${target.name} (${hex(target.addr)})`);
  console.log('='.repeat(60));
  console.log(`Raw byte hits: ${refs.length}`);
  if (refs.length === 0) {
    console.log('No literal hits found.\n');
    return;
  }

  const counts = refs.reduce((acc, ref) => {
    acc[ref.classification] = (acc[ref.classification] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `Classification: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ')}`,
  );
  console.log('');

  for (const ref of refs) {
    const funcInfo = ref.funcStart ? ` (in func ~${hex(ref.funcStart)})` : '';
    console.log(`${hex(ref.sitePc)}  ${ref.classification.padEnd(7)}  ${ref.rendered}${funcInfo}`);
    console.log(`  hit:     ${hex(ref.hit)}`);
    console.log(`  bytes:   ${bytesHex(ref.sitePc, ref.inst?.length ?? 1)}`);
    console.log(`  context: ${ref.context}`);
    if (ref.coAccesses.length > 0) {
      console.log(`  co-D1:   ${ref.coAccesses.map((a) => hex(a)).join(', ')}`);
    }
    console.log('');
  }
}

/** Print disassembly context around each write site */
function printWriteContexts(refs) {
  const writes = refs.filter((r) => r.classification === 'WRITE');
  if (writes.length === 0) return;

  console.log('\n--- Write-site disassembly context ---');
  for (const ref of writes) {
    console.log(`\nWrite at ${hex(ref.sitePc)}:`);
    const rows = disassembleWindow(ref.sitePc, 8, 6);
    for (const inst of rows) {
      const marker = inst.pc === ref.sitePc ? ' <<<' : '';
      console.log(`  ${hex(inst.pc)}  ${bytesHex(inst.pc, inst.length).padEnd(18)}  ${renderInstruction(inst)}${marker}`);
    }
  }
}

/** Print disassembly context around each read site */
function printReadContexts(refs) {
  const reads = refs.filter((r) => r.classification === 'READ');
  if (reads.length === 0) return;

  console.log('\n--- Read-site disassembly context ---');
  for (const ref of reads) {
    console.log(`\nRead at ${hex(ref.sitePc)}:`);
    const rows = disassembleWindow(ref.sitePc, 8, 6);
    for (const inst of rows) {
      const marker = inst.pc === ref.sitePc ? ' <<<' : '';
      console.log(`  ${hex(inst.pc)}  ${bytesHex(inst.pc, inst.length).padEnd(18)}  ${renderInstruction(inst)}${marker}`);
    }
  }
}

/** Build co-access frequency map across all refs */
function printCoAccessSummary(refs) {
  const freq = new Map();
  for (const ref of refs) {
    for (const addr of ref.coAccesses) {
      freq.set(addr, (freq.get(addr) ?? 0) + 1);
    }
  }
  if (freq.size === 0) return;

  console.log('\n--- Co-accessed D1xxxx addresses (frequency) ---');
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]);
  for (const [addr, count] of sorted) {
    console.log(`  ${hex(addr)}  appears near ${count}/${refs.length} sites`);
  }
}

function main() {
  console.log('=== Phase 443: Trace D176FB ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes`);
  console.log(`Target: ${TARGET_NAME} (${hex(TARGET_ADDR)})`);

  // Main target
  const mainRefs = findRefs(TARGETS[0]);
  printRefs(TARGETS[0], mainRefs);

  // Check adjacent addresses (multi-byte field test)
  for (let i = 1; i < TARGETS.length; i++) {
    const refs = findRefs(TARGETS[i]);
    if (refs.length > 0) {
      printRefs(TARGETS[i], refs);
    } else {
      console.log(`\n${TARGETS[i].name}: 0 hits (not independently addressed)`);
    }
  }

  // Detailed disassembly contexts
  printWriteContexts(mainRefs);
  printReadContexts(mainRefs);

  // Co-access summary
  printCoAccessSummary(mainRefs);

  // Summary
  const reads = mainRefs.filter((r) => r.classification === 'READ').length;
  const writes = mainRefs.filter((r) => r.classification === 'WRITE').length;
  const unknown = mainRefs.filter((r) => r.classification === 'UNKNOWN').length;

  console.log('\n--- Summary ---');
  console.log(`Total D176FB refs: ${mainRefs.length}`);
  console.log(`  Reads:   ${reads}`);
  console.log(`  Writes:  ${writes}`);
  console.log(`  Unknown: ${unknown}`);

  // Value characterization hint
  const writeValues = mainRefs.filter((r) => r.classification === 'WRITE').map((r) => {
    // Check if the instruction before is LD A,imm (3E xx) or XOR A
    const prevPc = Math.max(0, r.sitePc - 2);
    const prev = safeDecode(prevPc);
    if (prev.tag === 'ld-reg-imm' && prev.dest === 'a') {
      return hexByte(prev.value);
    }
    const prevPc2 = Math.max(0, r.sitePc - 1);
    const prev2 = safeDecode(prevPc2);
    if (prev2.tag === 'alu-reg' && prev2.op === 'xor' && prev2.src === 'a') {
      return '0x00 (XOR A)';
    }
    return '?';
  });
  if (writeValues.length > 0) {
    console.log(`  Written values: ${writeValues.join(', ')}`);
  }

  // Unique functions
  const funcSet = new Set(mainRefs.filter((r) => r.funcStart).map((r) => hex(r.funcStart)));
  console.log(`  Containing functions (~estimate): ${[...funcSet].join(', ') || 'none found'}`);
}

main();
