#!/usr/bin/env node
// Phase 584 — Event Consumer Analysis for 0x0236F9
//
// 0x0236F9 is the EVENT POSTING CENTRAL DISPATCH (30B leaf, 42 callers).
// It writes a 3-byte event record [type, mode, context] into the buffer
// pointed to by HL, then reads port 0xDCA0 via IN A,(C) as an ack.
//
// Key finding from initial analysis: HL is almost always loaded via
// LEA HL,IX+disp (stack-allocated buffer), NOT a fixed ROM/RAM address.
// So the "consumer" of each event record is the caller itself, which
// reads back from its stack frame after the CALL returns.
//
// This probe:
// 1. Finds all 42 CALL 0x0236F9 sites
// 2. Decodes the pre-call context to extract: event type (A), HL source
// 3. Decodes the post-call context to find who reads the event record
// 4. Looks for any fixed RAM addresses used as buffers (non-stack cases)
// 5. Scans for references to the key RAM addresses 0xD007E0 and 0xD0058E
//    that the function itself reads

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const TARGET = 0x0236F9;
const BACKTRACK = 30;  // bytes before CALL to scan
const FORWARD = 40;    // bytes after CALL to scan

function hex(v, w = 6) {
  if (v === null || v === undefined) return 'n/a';
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hex2(v) {
  return '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function safeDecode(offset) {
  if (offset < 0 || offset >= rom.length) return null;
  try {
    const insn = decodeInstruction(rom, offset, 'adl');
    if (!insn || !Number.isFinite(insn.length) || insn.length <= 0) return null;
    return insn;
  } catch {
    return null;
  }
}

// Decode a window of instructions forward from start to end
function decodeWindow(start, end) {
  const out = [];
  let offset = Math.max(0, start);
  const limit = Math.min(rom.length, end);
  while (offset < limit) {
    const insn = safeDecode(offset);
    if (!insn) { offset++; continue; }
    out.push(insn);
    offset += insn.length;
  }
  return out;
}

// Format a decoded instruction as a readable string
function formatInsn(insn) {
  const tag = insn.tag || '???';
  switch (tag) {
    case 'ld-reg-imm': return `LD ${insn.dest.toUpperCase()},${hex2(insn.value)}`;
    case 'ld-pair-imm': return `LD ${insn.pair.toUpperCase()},${hex(insn.value)}`;
    case 'lea': return `LEA ${insn.dest.toUpperCase()},${insn.base.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement}`;
    case 'call': return `CALL ${hex(insn.target)}`;
    case 'push': return `PUSH ${insn.pair.toUpperCase()}`;
    case 'pop': return `POP ${insn.pair.toUpperCase()}`;
    case 'ret': return 'RET';
    case 'jr': return `JR ${hex(insn.target)}`;
    case 'jr-conditional': return `JR ${insn.condition.toUpperCase()},${hex(insn.target)}`;
    case 'jp': return `JP ${hex(insn.target)}`;
    case 'jp-conditional': return `JP ${insn.condition.toUpperCase()},${hex(insn.target)}`;
    case 'ld-ind-reg': return `LD (${insn.dest.toUpperCase()}),${insn.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${insn.dest.toUpperCase()},(${insn.src.toUpperCase()})`;
    case 'ld-reg-reg': return `LD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${insn.dest.toUpperCase()},(${hex(insn.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(insn.addr)}),${insn.src.toUpperCase()}`;
    case 'ld-pair-indexed': return `LD ${insn.pair.toUpperCase()},(${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'ld-indexed-pair': return `LD (${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement}),${insn.pair.toUpperCase()}`;
    case 'ld-ixd-reg': return `LD (${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement}),${insn.src.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${insn.dest.toUpperCase()},(${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'ld-ixd-imm': return `LD (${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement}),${hex2(insn.value)}`;
    case 'alu-imm': return `${insn.op.toUpperCase()} ${hex2(insn.value)}`;
    case 'alu-reg': return `${insn.op.toUpperCase()} ${insn.src.toUpperCase()}`;
    case 'inc-pair': return `INC ${insn.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${insn.pair.toUpperCase()}`;
    case 'inc-reg': return `INC ${insn.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${insn.reg.toUpperCase()}`;
    case 'add-pair': return `ADD ${insn.dest.toUpperCase()},${insn.src.toUpperCase()}`;
    case 'xor-reg': return `XOR ${insn.src?.toUpperCase() || 'A'}`;
    case 'alu-ixd': return `${insn.op.toUpperCase()} (${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'bit-ixd': return `BIT ${insn.bit},(${insn.indexRegister.toUpperCase()}${insn.displacement >= 0 ? '+' : ''}${insn.displacement})`;
    case 'ld-sp-pair': return `LD SP,${insn.pair.toUpperCase()}`;
    case 'in-reg': return `IN A,(C)`;
    case 'mlt': return `MLT ${insn.reg.toUpperCase()}`;
    case 'ld-pair-ind': return `LD ${insn.pair.toUpperCase()},(${insn.src?.toUpperCase() || 'HL'})`;
    case 'ldir': return 'LDIR';
    case 'ldi': return 'LDI';
    default: return `[${tag}]`;
  }
}

// ============================================================
// Step 1: Find all CALL 0x0236F9 sites
// ============================================================

const callSites = [];
for (let offset = 0; offset <= rom.length - 4; offset++) {
  if (rom[offset] === 0xCD &&
      rom[offset + 1] === (TARGET & 0xFF) &&
      rom[offset + 2] === ((TARGET >> 8) & 0xFF) &&
      rom[offset + 3] === ((TARGET >> 16) & 0xFF)) {
    callSites.push(offset);
  }
}

console.log('=== Phase 584: Event Consumer Analysis for ' + hex(TARGET) + ' ===');
console.log('ROM size: ' + rom.length + ' bytes');
console.log('CALL sites found: ' + callSites.length);
console.log();

// ============================================================
// Step 2: For each call site, analyze pre-call and post-call context
// ============================================================

const results = [];

for (const callAddr of callSites) {
  // Decode backwards: try multiple start offsets to find valid decode chain
  const preInsns = [];
  const bestStart = callAddr - BACKTRACK;
  const window = decodeWindow(bestStart, callAddr);
  preInsns.push(...window);

  // Decode forward after the CALL (4 bytes for CALL instruction)
  const postInsns = decodeWindow(callAddr + 4, callAddr + 4 + FORWARD);

  // Extract event type (A register) from pre-call
  let eventType = null;
  let eventTypeSource = 'unknown';
  for (let i = preInsns.length - 1; i >= 0; i--) {
    const insn = preInsns[i];
    if (insn.tag === 'ld-reg-imm' && insn.dest === 'a') {
      eventType = insn.value;
      eventTypeSource = hex(insn.pc) + ': ' + formatInsn(insn);
      break;
    }
    if (insn.tag === 'xor-reg' && (insn.src === 'a' || !insn.src)) {
      eventType = 0;
      eventTypeSource = hex(insn.pc) + ': XOR A';
      break;
    }
    if (insn.tag === 'ld-reg-reg' && insn.dest === 'a') {
      eventTypeSource = hex(insn.pc) + ': LD A,' + insn.src.toUpperCase() + ' (dynamic)';
      break;
    }
    if (insn.tag === 'ld-reg-ixd' && insn.dest === 'a') {
      eventTypeSource = hex(insn.pc) + ': ' + formatInsn(insn) + ' (dynamic from stack)';
      break;
    }
    if (insn.tag === 'ld-reg-mem' && insn.dest === 'a') {
      eventTypeSource = hex(insn.pc) + ': LD A,(' + hex(insn.addr) + ') (dynamic from RAM)';
      break;
    }
    // Stop at a CALL or RET (A might be clobbered)
    if (insn.tag === 'call' || insn.tag === 'ret') break;
  }

  // Extract HL source from pre-call
  let hlSource = 'unknown';
  let hlFixedAddr = null;
  for (let i = preInsns.length - 1; i >= 0; i--) {
    const insn = preInsns[i];
    if (insn.tag === 'lea' && insn.dest === 'hl') {
      hlSource = hex(insn.pc) + ': LEA HL,' + insn.base.toUpperCase() +
                 (insn.displacement >= 0 ? '+' : '') + insn.displacement + ' (stack-local)';
      break;
    }
    if (insn.tag === 'ld-pair-imm' && insn.pair === 'hl') {
      hlSource = hex(insn.pc) + ': LD HL,' + hex(insn.value) + ' (fixed address)';
      hlFixedAddr = insn.value;
      break;
    }
    if (insn.tag === 'add-pair' && insn.dest === 'hl') {
      // HL was computed dynamically
      hlSource = hex(insn.pc) + ': ADD HL,' + insn.src.toUpperCase() + ' (computed)';
      break;
    }
    if (insn.tag === 'call' || insn.tag === 'ret') break;
  }

  // Analyze post-call: what does the caller do after 0x0236F9 returns?
  const postOps = [];
  for (const insn of postInsns) {
    if (insn.tag === 'ret' || insn.tag === 'jp' || insn.tag === 'call') {
      postOps.push(formatInsn(insn));
      break;
    }
    postOps.push(formatInsn(insn));
  }

  // Look for post-call reads from the buffer (HL, or IX+disp)
  const bufferReads = [];
  for (const insn of postInsns) {
    if (insn.tag === 'ret' || (insn.tag === 'call' && insn.target !== TARGET)) break;

    // Reading from (HL) after the function restored it
    if (insn.tag === 'ld-reg-ind' && insn.src === 'hl') {
      bufferReads.push(hex(insn.pc) + ': ' + formatInsn(insn));
    }
    // Reading from IX-relative (same stack frame)
    if (insn.tag === 'ld-reg-ixd') {
      bufferReads.push(hex(insn.pc) + ': ' + formatInsn(insn));
    }
    if (insn.tag === 'ld-pair-indexed') {
      bufferReads.push(hex(insn.pc) + ': ' + formatInsn(insn));
    }
  }

  results.push({
    callAddr,
    eventType,
    eventTypeSource,
    hlSource,
    hlFixedAddr,
    postOps,
    bufferReads,
  });
}

// ============================================================
// Step 3: Print structured results
// ============================================================

console.log('=== Per-Caller Analysis ===\n');

// Group by event type
const byType = new Map();
for (const r of results) {
  const key = r.eventType !== null ? hex2(r.eventType) : 'dynamic';
  if (!byType.has(key)) byType.set(key, []);
  byType.get(key).push(r);
}

for (const [typeLabel, callers] of [...byType.entries()].sort()) {
  console.log(`Event type ${typeLabel} (${callers.length} caller(s)):`);
  for (const r of callers) {
    console.log(`  CALL at ${hex(r.callAddr)}`);
    console.log(`    A source: ${r.eventTypeSource}`);
    console.log(`    HL source: ${r.hlSource}`);
    if (r.bufferReads.length > 0) {
      console.log(`    Post-call buffer reads:`);
      for (const rd of r.bufferReads) {
        console.log(`      ${rd}`);
      }
    }
    console.log(`    Post-call ops: ${r.postOps.slice(0, 5).join(' | ')}`);
  }
  console.log();
}

// ============================================================
// Step 4: Fixed address analysis
// ============================================================

const fixedAddrs = results.filter(r => r.hlFixedAddr !== null);
console.log('=== Fixed RAM Buffer Addresses (non-stack) ===');
if (fixedAddrs.length === 0) {
  console.log('None found — all callers use stack-local buffers via LEA HL,IX+disp');
} else {
  for (const r of fixedAddrs) {
    console.log(`  ${hex(r.hlFixedAddr)} from CALL at ${hex(r.callAddr)}`);
  }
}
console.log();

// ============================================================
// Step 5: Scan for references to D007E0 (mode byte) and D0058E (key/context byte)
// These are the RAM addresses that 0x0236F9 itself reads
// ============================================================

const KEY_RAM_ADDRS = [
  { addr: 0xD007E0, label: 'mode byte (read by 0x0236F9 into event[1])' },
  { addr: 0xD0058E, label: 'context/key byte (read by 0x0236F9 into event[2] when mode==0x4E)' },
];

console.log('=== RAM Address Reference Scan ===\n');

for (const { addr, label } of KEY_RAM_ADDRS) {
  const lo = addr & 0xFF;
  const mid = (addr >> 8) & 0xFF;
  const hi = (addr >> 16) & 0xFF;

  const refs = [];
  for (let offset = 0; offset < rom.length - 2; offset++) {
    if (rom[offset] !== lo || rom[offset + 1] !== mid || rom[offset + 2] !== hi) continue;

    // Classify by preceding opcode byte
    const insn = offset > 0 ? safeDecode(offset - 1) : null;
    if (insn && insn.length >= 4) {
      refs.push({ instrAddr: offset - 1, insn });
    } else {
      // Try offset-4 for ED-prefixed instructions
      const insn2 = offset > 1 ? safeDecode(offset - 2) : null;
      if (insn2 && insn2.length >= 5) {
        refs.push({ instrAddr: offset - 2, insn: insn2 });
      } else {
        refs.push({ instrAddr: offset, insn: null });
      }
    }
  }

  console.log(`${hex(addr)} — ${label}`);
  console.log(`  Total references: ${refs.length}`);

  // Classify into reads and writes
  const reads = [];
  const writes = [];
  const other = [];

  for (const ref of refs) {
    if (!ref.insn) { other.push(ref); continue; }
    const tag = ref.insn.tag;
    if (tag === 'ld-reg-mem') {
      reads.push(ref);
    } else if (tag === 'ld-mem-reg') {
      writes.push(ref);
    } else if (tag === 'ld-pair-imm' || tag === 'call' || tag === 'jp' || tag === 'jp-conditional') {
      other.push(ref);
    } else {
      other.push(ref);
    }
  }

  if (reads.length > 0) {
    console.log(`  READS (${reads.length}):`);
    for (const r of reads.slice(0, 20)) {
      console.log(`    ${hex(r.instrAddr)}: ${formatInsn(r.insn)}`);
    }
    if (reads.length > 20) console.log(`    ... and ${reads.length - 20} more`);
  }
  if (writes.length > 0) {
    console.log(`  WRITES (${writes.length}):`);
    for (const r of writes.slice(0, 20)) {
      console.log(`    ${hex(r.instrAddr)}: ${formatInsn(r.insn)}`);
    }
    if (writes.length > 20) console.log(`    ... and ${writes.length - 20} more`);
  }
  if (other.length > 0) {
    console.log(`  OTHER (${other.length}):`);
    for (const r of other.slice(0, 10)) {
      console.log(`    ${hex(r.instrAddr)}: ${r.insn ? formatInsn(r.insn) : 'unclassified'}`);
    }
    if (other.length > 10) console.log(`    ... and ${other.length - 10} more`);
  }
  console.log();
}

// ============================================================
// Step 6: Scan for port 0xDCA0 references (the ack port)
// IN A,(C) with BC=0xDCA0 means searching for LD BC,0x00DCA0
// ============================================================

console.log('=== Port 0xDCA0 References ===\n');
const portBytes = [0xA0, 0xDC, 0x00]; // LE for 0x00DCA0
const portRefs = [];
for (let offset = 0; offset < rom.length - 3; offset++) {
  if (rom[offset] === portBytes[0] && rom[offset + 1] === portBytes[1] && rom[offset + 2] === portBytes[2]) {
    const prev = offset > 0 ? rom[offset - 1] : null;
    if (prev === 0x01) { // LD BC,nnnn
      portRefs.push({ addr: offset - 1, type: 'LD BC,0x00DCA0' });
    }
  }
}
console.log(`LD BC,0x00DCA0 occurrences: ${portRefs.length}`);
for (const ref of portRefs) {
  console.log(`  ${hex(ref.addr)}: ${ref.type}`);
}
console.log();

// ============================================================
// Step 7: Look at what calls the 42 callers (parent functions)
// The real "event consumer" might be the parent that called into
// the 0x022xxx key processor suite
// ============================================================

console.log('=== Parent Function Analysis ===\n');

// Find the entry points of the functions containing the CALL sites
// Look for the containing function by searching backwards for a common prologue
const functionEntries = new Set();
for (const callAddr of callSites) {
  // The callers are all in 0x022xxx-0x0236xx range
  // Look backward for PUSH IX (prologue) or JP targets
  let pc = callAddr;
  let found = false;
  for (let back = 0; back < 200 && pc > 0; back++) {
    pc--;
    const insn = safeDecode(pc);
    if (!insn) continue;
    // PUSH IX = DD E5
    if (insn.tag === 'push' && insn.pair === 'ix') {
      functionEntries.add(pc);
      found = true;
      break;
    }
  }
  if (!found) {
    // Try the call site address range block start
    functionEntries.add(callAddr & ~0xFF);
  }
}

// For each potential function entry, find who calls it
console.log(`Approximate function entries containing CALL ${hex(TARGET)}:`);
const sortedEntries = [...functionEntries].sort((a, b) => a - b);
for (const entry of sortedEntries) {
  // Scan ROM for CALL <entry>
  const lo = entry & 0xFF;
  const mid = (entry >> 8) & 0xFF;
  const hi = (entry >> 16) & 0xFF;

  const callers = [];
  for (let offset = 0; offset < rom.length - 3; offset++) {
    if (rom[offset] === 0xCD && rom[offset + 1] === lo && rom[offset + 2] === mid && rom[offset + 3] === hi) {
      callers.push(offset);
    }
  }

  // Count how many CALL 0x0236F9 sites are in this function
  const containedCalls = callSites.filter(cs => cs > entry && cs < entry + 500);

  console.log(`  ${hex(entry)} — ${callers.length} caller(s), contains ${containedCalls.length} event post(s)`);
  for (const c of callers.slice(0, 5)) {
    console.log(`    called from ${hex(c)}`);
  }
  if (callers.length > 5) console.log(`    ... and ${callers.length - 5} more`);
}

// ============================================================
// Summary
// ============================================================

console.log('\n=== Summary ===');
console.log(`Total CALL ${hex(TARGET)} sites: ${callSites.length}`);
console.log(`Event types posted:`);

const typeFreq = new Map();
for (const r of results) {
  const key = r.eventType !== null ? hex2(r.eventType) : 'dynamic';
  typeFreq.set(key, (typeFreq.get(key) || 0) + 1);
}
for (const [t, count] of [...typeFreq.entries()].sort()) {
  console.log(`  ${t}: ${count} caller(s)`);
}

console.log(`\nBuffer allocation pattern:`);
const stackLocal = results.filter(r => r.hlFixedAddr === null && r.hlSource.includes('stack'));
const computed = results.filter(r => r.hlFixedAddr === null && !r.hlSource.includes('stack'));
console.log(`  Stack-local (LEA HL,IX+disp): ${stackLocal.length}`);
console.log(`  Fixed RAM address: ${fixedAddrs.length}`);
console.log(`  Computed/unknown: ${computed.length}`);

console.log(`\nKey RAM addresses used by ${hex(TARGET)}:`);
console.log(`  D007E0 = current mode byte`);
console.log(`  D0058E = key/context byte (only when mode == 0x4E)`);
console.log(`  Port 0xDCA0 = hardware ack (IN A,(C))`);
