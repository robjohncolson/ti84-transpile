#!/usr/bin/env node
// Phase 444: Trace D02658 (24-bit timer countdown) and D02651 (8-bit timer countdown)
// Pure ROM byte scan — no boot sequence needed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase444-trace-D02658-D02651-report.md');
const MODE = 'adl';

const TARGETS = [
  { name: 'D02658', addr: 0xD02658, le: [0x58, 0x26, 0xD0], width: 24 },
  { name: 'D02651', addr: 0xD02651, le: [0x51, 0x26, 0xD0], width: 8 },
];

// Adjacent addresses to scan for context
const ADJACENT = [
  { name: 'D02652', addr: 0xD02652, le: [0x52, 0x26, 0xD0] },
  { name: 'D02653', addr: 0xD02653, le: [0x53, 0x26, 0xD0] },
  { name: 'D02654', addr: 0xD02654, le: [0x54, 0x26, 0xD0] },
  { name: 'D02655', addr: 0xD02655, le: [0x55, 0x26, 0xD0] },
  { name: 'D02656', addr: 0xD02656, le: [0x56, 0x26, 0xD0] },
  { name: 'D02657', addr: 0xD02657, le: [0x57, 0x26, 0xD0] },
  { name: 'D02659', addr: 0xD02659, le: [0x59, 0x26, 0xD0] },
  { name: 'D0265A', addr: 0xD0265A, le: [0x5A, 0x26, 0xD0] },
];

const CONTEXT_RADIUS = 10;
const FUNCTION_SCAN_BACK = 0x800;
const FUNCTION_SCAN_AHEAD = 0x400;
const CO_ACCESS_RADIUS = 40;
const D0_REGEX = /0xD0[0-9A-F]{4}/g;

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM image: ${ROM_PATH}`);
}

const rom = fs.readFileSync(ROM_PATH);

// ── helpers ──

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
  const parts = [];
  for (let i = start; i < end; i++) {
    const text = rom[i].toString(16).toUpperCase().padStart(2, '0');
    if (i >= hit && i < hit + 3) {
      parts.push(`[${text}]`);
    } else {
      parts.push(text);
    }
  }
  return parts.join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0 || inst.nextPc <= pc) {
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
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`;
      return `LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-pair-indexed':
      return `LD ${inst.pair.toUpperCase()},(${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-indexed-pair':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${inst.pair.toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()},(${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ixd-reg':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD (${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${hexByte(inst.value)}`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `LEA ${inst.dest.toUpperCase()},${inst.indexRegister.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'lea':
      return `LEA ${inst.dest.toUpperCase()},${inst.base.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL,${inst.src.toUpperCase()}`;
    case 'inc-pair': return `INC ${(inst.pair ?? '?').toUpperCase()}`;
    case 'dec-pair': return `DEC ${(inst.pair ?? '?').toUpperCase()}`;
    case 'inc-reg': return `INC ${(inst.dest ?? inst.reg ?? '?').toUpperCase()}`;
    case 'dec-reg': return `DEC ${(inst.dest ?? inst.reg ?? '?').toUpperCase()}`;
    case 'rla': return 'RLA';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'nop': return 'NOP';
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') return 'XOR A';
      return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ind': return `${inst.op.toUpperCase()} (HL)`;
    case 'bit-reg': return `BIT ${inst.bit},${inst.src.toUpperCase()}`;
    case 'set-reg': return `SET ${inst.bit},${inst.dest.toUpperCase()}`;
    case 'res-reg': return `RES ${inst.bit},${inst.dest.toUpperCase()}`;
    case 'ex-sp-pair': return `EX (SP),${inst.pair.toUpperCase()}`;
    case 'ex-de-hl': return 'EX DE,HL';
    default: return `[${inst.tag}]`;
  }
}

function classifyInstruction(inst) {
  switch (inst.tag) {
    case 'ld-pair-mem':
      // Decoder uses 'ld-pair-mem' for both directions; check direction field
      if (inst.direction === 'to-mem') return 'WRITE';
      return 'READ';
    case 'ld-reg-mem':
      return 'READ';
    case 'ld-mem-pair':
    case 'ld-mem-reg':
      return 'WRITE';
    default:
      return 'UNKNOWN';
  }
}

// ── scanning ──

function scanRawHits(le) {
  const hits = [];
  for (let i = 0; i <= rom.length - 3; i++) {
    if (rom[i] === le[0] && rom[i + 1] === le[1] && rom[i + 2] === le[2]) {
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

function prologueAt(pc) {
  if (rom[pc] === 0xDD && rom[pc + 1] === 0xE5) return 'PUSH IX';
  if (rom[pc] === 0xFD && rom[pc + 1] === 0xE5) return 'PUSH IY';
  if (rom[pc] === 0xED && rom[pc + 1] === 0x57 && rom[pc + 2] === 0xF5 && rom[pc + 3] === 0xF3) {
    return 'LD A,I; PUSH AF; DI';
  }
  if (rom[pc] === 0xF5 && rom[pc + 1] === 0xF3) return 'PUSH AF; DI';
  if (rom[pc] === 0xCD && rom[pc + 1] === 0x8A && rom[pc + 2] === 0x21 && rom[pc + 3] === 0x00) {
    return 'CALL __frameset0';
  }
  if (rom[pc] === 0xCD && rom[pc + 1] === 0x97 && rom[pc + 2] === 0x21 && rom[pc + 3] === 0x00) {
    return 'CALL __frameset';
  }
  return null;
}

function retLengthAt(pc) {
  if (rom[pc] === 0xC9) return 1;
  if (rom[pc] === 0xED && (rom[pc + 1] === 0x45 || rom[pc + 1] === 0x4D)) return 2;
  return 0;
}

function normalizeAfterRetStart(start) {
  let pc = start;
  while (pc < rom.length && rom[pc] === 0xFF) pc++;
  return pc;
}

function findContainingFunction(sitePc) {
  const low = Math.max(0, sitePc - FUNCTION_SCAN_BACK);
  for (let pc = sitePc; pc >= low; pc--) {
    const retLen = retLengthAt(pc);
    if (retLen) {
      return {
        start: normalizeAfterRetStart(pc + retLen),
        marker: 'after RET fallback',
      };
    }
    const marker = prologueAt(pc);
    if (marker) {
      return { start: pc, marker };
    }
  }
  return { start: null, marker: 'not found' };
}

function estimateFunctionEnd(start) {
  if (start === null) return null;
  for (let pc = start; pc < Math.min(start + FUNCTION_SCAN_AHEAD, rom.length); ) {
    const inst = safeDecode(pc);
    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
      return inst.nextPc;
    }
    if (!Number.isInteger(inst.nextPc) || inst.nextPc <= pc) {
      return Math.min(start + 0x200, rom.length);
    }
    pc = inst.nextPc;
  }
  return Math.min(start + 0x200, rom.length);
}

function scanFunctionD0Refs(start, end) {
  if (start === null || end === null) return [];
  const refs = new Set();
  for (let pc = start; pc < end; ) {
    const inst = safeDecode(pc);
    for (const match of renderInstruction(inst).match(D0_REGEX) || []) {
      refs.add(match);
    }
    if (!Number.isInteger(inst.nextPc) || inst.nextPc <= pc) {
      pc++;
    } else {
      pc = inst.nextPc;
    }
  }
  return [...refs].sort();
}

// ── co-access: scan nearby bytes for other D0xxxx addresses ──

function findCoAccessAddresses(hit, targetAddr) {
  const start = Math.max(0, hit - CO_ACCESS_RADIUS);
  const end = Math.min(rom.length - 2, hit + 3 + CO_ACCESS_RADIUS);
  const found = new Set();
  for (let i = start; i <= end; i++) {
    if (rom[i + 2] === 0xD0) {
      const addr = rom[i] | (rom[i + 1] << 8) | (rom[i + 2] << 16);
      if (addr !== targetAddr && addr >= 0xD00000 && addr <= 0xD0FFFF) {
        found.add(hex(addr));
      }
    }
  }
  return [...found].sort();
}

// ── post-read analysis: what happens after reading the value? ──

function analyzeReadGate(sitePc) {
  const parts = [];
  for (let pc = sitePc + 1; pc <= Math.min(sitePc + 18, rom.length - 1); pc++) {
    const byte = rom[pc];
    if (byte === 0xB7) { parts.push('OR A'); continue; }
    if (byte === 0xA7) { parts.push('AND A'); continue; }
    if (byte === 0xFE && pc + 1 < rom.length) {
      parts.push(`CP ${hexByte(rom[pc + 1])}`);
      pc++;
      continue;
    }
    // DEC A
    if (byte === 0x3D) { parts.push('DEC A'); continue; }
    // INC A
    if (byte === 0x3C) { parts.push('INC A'); continue; }
    // OR H / OR L (check if HL is zero)
    if (byte === 0x7C) { parts.push('LD A,H'); continue; }
    if (byte === 0x7D) { parts.push('LD A,L'); continue; }
    if (byte === 0xB4) { parts.push('OR H'); continue; }
    if (byte === 0xB5) { parts.push('OR L'); continue; }
    // SBC HL,xx pattern (test HL == 0 or compare)
    if (byte === 0xED) {
      if (pc + 1 < rom.length && rom[pc + 1] === 0x62) {
        parts.push('SBC HL,HL');
        pc++;
        continue;
      }
    }

    const branches = {
      0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C',
      0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C',
      0xC0: 'RET NZ', 0xC8: 'RET Z', 0xD0: 'RET NC', 0xD8: 'RET C',
    };
    if (branches[byte]) {
      parts.push(branches[byte]);
      break;
    }
  }
  return parts.join('; ');
}

function inferWriteValue(sitePc) {
  for (let pc = sitePc - 1; pc >= Math.max(0, sitePc - 24); pc--) {
    const byte = rom[pc];
    // XOR A or SUB A => 0
    if (byte === 0xAF || byte === 0x97) return '0x00';
    // LD A, imm
    if (byte === 0x3E && pc + 1 < rom.length) return hexByte(rom[pc + 1]);
    // LD HL, imm24 — look for 0x21 xx yy zz pattern
    if (byte === 0x21 && pc + 3 < rom.length) {
      const val = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
      return hex(val);
    }
    // DEC A or DEC HL
    if (byte === 0x3D) return 'DEC A (decrement)';
    if (byte === 0x2B) return 'DEC HL (decrement)';
    // Control flow — stop scanning
    if ([0xC9, 0xC3, 0xCD, 0x18, 0x20, 0x28, 0x30, 0x38].includes(byte)) break;
  }
  return '?';
}

// ── disassemble range around a site ──

function disassembleAround(sitePc, before = 20, after = 20) {
  // Find a reasonable start before the site
  let start = Math.max(0, sitePc - before);
  const rows = [];
  const endExclusive = sitePc + after;
  for (let pc = start; pc < endExclusive; ) {
    const inst = safeDecode(pc);
    rows.push(inst);
    if (!Number.isInteger(inst.nextPc) || inst.nextPc <= pc) break;
    pc = inst.nextPc;
  }
  return rows;
}

// ── main analysis ──

function buildRefs(target) {
  return scanRawHits(target.le)
    .map((hit) => {
      const inst = resolveInstructionForHit(hit, target.addr);
      const site = inst?.pc ?? hit;
      const kind = inst ? classifyInstruction(inst) : 'UNKNOWN';
      const fn = findContainingFunction(site);
      const fnEnd = estimateFunctionEnd(fn.start);
      return {
        hit,
        site,
        inst,
        kind,
        mnemonic: inst ? renderInstruction(inst) : '(unresolved raw hit)',
        function: fn,
        functionEnd: fnEnd,
        sameFunctionD0Refs: scanFunctionD0Refs(fn.start, fnEnd),
        coAccess: findCoAccessAddresses(hit, target.addr),
        valueOrGate: kind === 'WRITE' ? inferWriteValue(site) : analyzeReadGate(site),
        context: contextHex(hit),
      };
    })
    .sort((a, b) => a.site - b.site);
}

function formatFunction(fn) {
  if (fn.start === null) return '-';
  return `${hex(fn.start)} (${fn.marker})`;
}

// ── output ──

const lines = [];
function log(msg = '') {
  console.log(msg);
  lines.push(msg);
}

function printTargetAnalysis(target, refs) {
  log(`\n${'='.repeat(60)}`);
  log(`=== ${target.name} (${hex(target.addr)}) — ${target.width}-bit ===`);
  log(`${'='.repeat(60)}`);

  const counts = refs.reduce((acc, ref) => {
    acc[ref.kind] = (acc[ref.kind] ?? 0) + 1;
    return acc;
  }, {});

  log(`\nTotal references: ${refs.length}`);
  log(`  Reads:   ${counts.READ ?? 0}`);
  log(`  Writes:  ${counts.WRITE ?? 0}`);
  log(`  Unknown: ${counts.UNKNOWN ?? 0}`);

  // Write value summary
  const writes = refs.filter((r) => r.kind === 'WRITE');
  if (writes.length > 0) {
    log('\nWrite value summary:');
    const valueCounts = {};
    for (const r of writes) {
      valueCounts[r.valueOrGate] = (valueCounts[r.valueOrGate] ?? 0) + 1;
    }
    for (const [val, count] of Object.entries(valueCounts)) {
      log(`  ${val}: ${count}`);
    }
  }

  // Read gate summary
  const reads = refs.filter((r) => r.kind === 'READ');
  if (reads.length > 0) {
    log('\nRead gate summary:');
    for (const r of reads) {
      log(`  ${hex(r.site)}  ${r.valueOrGate || '-'}`);
    }
  }

  // Reference table
  log('\n--- Reference Table ---');
  for (const ref of refs) {
    log(`\n${hex(ref.site)}  ${ref.kind.padEnd(7)}  ${ref.mnemonic}`);
    log(`  function:  ${formatFunction(ref.function)}`);
    log(`  value:     ${ref.valueOrGate || '-'}`);
    log(`  co-access: ${ref.coAccess.join(', ') || '-'}`);
    log(`  D0xxxx:    ${ref.sameFunctionD0Refs.join(', ') || '-'}`);
    log(`  context:   ${ref.context}`);
  }

  // Function groups
  const groups = new Map();
  for (const ref of refs) {
    const key = ref.function.start === null
      ? `site:${hex(ref.site)}`
      : `${hex(ref.function.start)} (${ref.function.marker})`;
    if (!groups.has(key)) {
      groups.set(key, { sites: [], d0Refs: ref.sameFunctionD0Refs });
    }
    groups.get(key).sites.push({ site: ref.site, kind: ref.kind });
  }

  log('\n--- Grouped by Function ---');
  for (const [key, group] of groups) {
    const siteStr = group.sites.map((s) => `${hex(s.site)}[${s.kind}]`).join(', ');
    log(`\n${key}`);
    log(`  sites:  ${siteStr}`);
    log(`  D0xx:   ${group.d0Refs.join(', ') || '-'}`);
  }

  // Disassemble key sites
  log('\n--- Key Site Disassembly ---');
  const keySites = refs.slice(0, 10); // first 10
  for (const ref of keySites) {
    log(`\n  --- ${hex(ref.site)} (${ref.kind}) ---`);
    const rows = disassembleAround(ref.site, 15, 20);
    for (const inst of rows) {
      const marker = inst.pc === ref.site ? ' <<<' : '';
      log(`  ${hex(inst.pc)}  ${bytesHex(inst.pc, inst.length).padEnd(18)} ${renderInstruction(inst)}${marker}`);
    }
  }
}

function main() {
  log('=== Phase 444: Trace D02658 and D02651 (Timer ISR Countdown Targets) ===');
  log(`ROM: ${ROM_PATH}`);
  log(`Scan date: ${new Date().toISOString()}`);

  // Main targets
  for (const target of TARGETS) {
    const refs = buildRefs(target);
    printTargetAnalysis(target, refs);
  }

  // Adjacent address scan
  log(`\n${'='.repeat(60)}`);
  log('=== Adjacent Address Scan (D02652-D0265A) ===');
  log(`${'='.repeat(60)}`);

  for (const adj of ADJACENT) {
    const hits = scanRawHits(adj.le);
    if (hits.length > 0) {
      log(`\n${adj.name}: ${hits.length} hits at ${hits.map((h) => hex(h)).join(', ')}`);
      // Decode each hit
      for (const hit of hits) {
        const inst = resolveInstructionForHit(hit, adj.addr);
        if (inst) {
          const kind = classifyInstruction(inst);
          log(`  ${hex(inst.pc)}  ${kind.padEnd(7)}  ${renderInstruction(inst)}`);
        } else {
          log(`  ${hex(hit)}  (unresolved)  context: ${contextHex(hit)}`);
        }
      }
    } else {
      log(`\n${adj.name}: 0 hits`);
    }
  }

  // ISR context: disassemble 0x001ACF timer service routine
  log(`\n${'='.repeat(60)}`);
  log('=== Timer ISR (0x001ACF) Disassembly ===');
  log(`${'='.repeat(60)}`);
  const isrRows = disassembleAround(0x001ACF, 0, 80);
  for (const inst of isrRows) {
    log(`${hex(inst.pc)}  ${bytesHex(inst.pc, inst.length).padEnd(18)} ${renderInstruction(inst)}`);
  }

  // D02658 init function at 0x001778
  log(`\n${'='.repeat(60)}`);
  log('=== D02658 Init Function (0x001778) Disassembly ===');
  log(`${'='.repeat(60)}`);
  const initRows = disassembleAround(0x001778, 5, 30);
  for (const inst of initRows) {
    log(`${hex(inst.pc)}  ${bytesHex(inst.pc, inst.length).padEnd(18)} ${renderInstruction(inst)}`);
  }

  // Write report
  const report = lines.join('\n');
  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  log(`\nReport written to: ${REPORT_PATH}`);
}

main();
