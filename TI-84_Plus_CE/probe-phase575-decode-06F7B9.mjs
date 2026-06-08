/**
 * probe-phase575-decode-06F7B9.mjs
 *
 * Decode the shared tail at 0x06F7B9 that all font param writer paths
 * (0x06F6E7, 0x06F6FF, 0x06F717, 0x06F75C) converge to via JP.
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROM_PATH = join(__dirname, 'ROM.rom');
const REPORT_PATH = join(__dirname, 'phase575p4-decode-06F7B9-report.md');

const rom = readFileSync(ROM_PATH);
const START = 0x06F7B9;

// ── helpers ──

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function bytesHex(start, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(rom[start + i].toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function formatInsn(r) {
  const parts = [];
  if (r.modePrefix) parts.push('.' + r.modePrefix.toUpperCase());

  const tag = r.tag;

  // Build human-readable mnemonic from decoder tag + fields
  if (tag === 'indexed-cb-set') return `SET ${r.bit},(IY+${r.displacement})`;
  if (tag === 'indexed-cb-res') return `RES ${r.bit},(IY+${r.displacement})`;
  if (tag === 'indexed-cb-bit') return `BIT ${r.bit},(IY+${r.displacement})`;
  if (tag === 'ret') return 'RET';
  if (tag === 'ret-conditional') return `RET ${r.condition.toUpperCase()}`;
  if (tag === 'call') return `CALL ${hex(r.target)}`;
  if (tag === 'call-conditional') return `CALL ${r.condition.toUpperCase()},${hex(r.target)}`;
  if (tag === 'jp') return r.condition ? `JP ${r.condition.toUpperCase()},${hex(r.target)}` : `JP ${hex(r.target)}`;
  if (tag === 'jr-conditional') return `JR ${r.condition.toUpperCase()},${hex(r.target)}`;
  if (tag === 'ld-reg-mem') {
    const pfx = r.modePrefix ? `.${r.modePrefix.toUpperCase()} ` : '';
    return `${pfx}LD ${r.dest.toUpperCase()},(${hex(r.addr)})`;
  }
  if (tag === 'ld-mem-reg') {
    const pfx = r.modePrefix ? `.${r.modePrefix.toUpperCase()} ` : '';
    return `${pfx}LD (${hex(r.addr)}),${r.src.toUpperCase()}`;
  }
  if (tag === 'ld-pair-mem') {
    const pfx = r.modePrefix ? `.${r.modePrefix.toUpperCase()} ` : '';
    if (r.direction === 'to-mem') return `${pfx}LD (${hex(r.addr)}),${r.pair.toUpperCase()}`;
    return `${pfx}LD ${r.pair.toUpperCase()},(${hex(r.addr)})`;
  }
  if (tag === 'ld-pair-imm') {
    return `LD ${r.pair.toUpperCase()},${hex(r.value)}`;
  }
  if (tag === 'ld-reg-imm') {
    return `LD ${r.dest.toUpperCase()},0x${r.value.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  if (tag === 'ld-reg-reg') return `LD ${r.dest.toUpperCase()},${r.src.toUpperCase()}`;
  if (tag === 'alu-imm') return `${r.op.toUpperCase()} 0x${r.value.toString(16).toUpperCase().padStart(2, '0')}`;
  if (tag === 'alu-reg') return `${r.op.toUpperCase()} ${r.src.toUpperCase()}`;
  if (tag === 'push') return `PUSH ${r.pair.toUpperCase()}`;
  if (tag === 'pop') return `POP ${r.pair.toUpperCase()}`;
  if (tag === 'ex-de-hl') return 'EX DE,HL';
  if (tag === 'inc-pair') return `INC ${r.pair.toUpperCase()}`;
  if (tag === 'dec-pair') return `DEC ${r.pair.toUpperCase()}`;

  // fallback: show tag + all non-standard fields
  const extras = Object.entries(r)
    .filter(([k]) => !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates'].includes(k))
    .map(([k, v]) => `${k}=${v}`)
    .join(' ');
  return extras;
}

// ── 1. Decode the function at 0x06F7B9 ──

console.log('=== Decoding shared tail at', hex(START), '===\n');

const instructions = [];
let pc = START;
for (let i = 0; i < 64 && pc < rom.length; i++) {
  const r = decodeInstruction(rom, pc, 'adl');
  if (!r || !r.length) {
    console.log(`  DECODE FAIL at ${hex(pc)}`);
    break;
  }
  const row = {
    address: pc,
    bytes: bytesHex(pc, r.length),
    mnemonic: formatInsn(r),
    decoded: r,
  };
  instructions.push(row);
  console.log(`  ${hex(pc)}  ${row.bytes.padEnd(20)}  ${row.mnemonic}`);

  if (r.tag === 'ret' || (r.tag === 'jp' && !r.condition)) break;
  pc = r.nextPc;
}

const functionSize = pc + (instructions.length ? instructions[instructions.length - 1].decoded.length : 0) - START;
console.log(`\nFunction size: ${functionSize} bytes (${instructions.length} instructions)\n`);

// ── 2. Identify RAM addresses ──

console.log('=== RAM References ===\n');
const ramRefs = [];
for (const row of instructions) {
  const r = row.decoded;
  if (r.addr !== undefined && r.addr >= 0xD00000) {
    const access = r.tag.includes('mem-reg') ? 'write' : (r.tag.includes('reg-mem') || r.tag.includes('pair-mem')) ? 'read' : 'access';
    ramRefs.push({ addr: hex(r.addr), access, insn: row.mnemonic });
    console.log(`  ${hex(r.addr)} ${access}: ${row.mnemonic}`);
  }
}
if (!ramRefs.length) console.log('  (none)');

// ── 3. IY flag operations ──

console.log('\n=== IY Flag Operations ===\n');
const iyOps = [];
for (const row of instructions) {
  const r = row.decoded;
  if (r.tag && r.tag.startsWith('indexed-cb-')) {
    iyOps.push({ op: r.tag.replace('indexed-cb-', '').toUpperCase(), bit: r.bit, disp: r.displacement, insn: row.mnemonic });
    console.log(`  ${row.mnemonic}`);
  }
}
if (!iyOps.length) console.log('  (none)');

// ── 4. Sub-calls ──

console.log('\n=== Sub-Calls ===\n');
const calls = [];
for (const row of instructions) {
  const r = row.decoded;
  if (r.tag === 'call' || r.tag === 'call-conditional') {
    calls.push(hex(r.target));
    console.log(`  ${row.mnemonic}`);
  }
}
if (!calls.length) console.log('  (none)');

// ── 5. Scan ROM for references to 0x06F7B9 ──

console.log('\n=== References to', hex(START), '(pattern B9 F7 06) ===\n');
const b0 = START & 0xFF;
const b1 = (START >> 8) & 0xFF;
const b2 = (START >> 16) & 0xFF;
const refs = [];
for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === b0 && rom[i + 1] === b1 && rom[i + 2] === b2) {
    const prevByte = i > 0 ? rom[i - 1] : 0;
    let context = '(unknown)';
    if (prevByte === 0xC3) context = 'JP (unconditional)';
    else if (prevByte === 0xCA) context = 'JP Z';
    else if (prevByte === 0xC2) context = 'JP NZ';
    else if (prevByte === 0xCD) context = 'CALL';
    else if (prevByte === 0xCC) context = 'CALL Z';
    else if (prevByte === 0xC4) context = 'CALL NZ';
    refs.push({ addr: hex(i - 1), context });
    console.log(`  ${hex(i - 1)}: ${context} -> ${hex(START)}`);
  }
}
if (!refs.length) console.log('  (none found)');

// ── 6. Also decode the 3 entry paths briefly for the report ──

console.log('\n=== Convergence paths summary ===\n');
const entryPoints = [
  { addr: 0x06F6E7, name: 'Path A (direct copy)' },
  { addr: 0x06F6FF, name: 'Path B (.SIS copy)' },
  { addr: 0x06F717, name: 'Path C (multi-field copy)' },
];
const pathSummaries = [];

for (const entry of entryPoints) {
  let p = entry.addr;
  const insns = [];
  for (let i = 0; i < 30; i++) {
    const r = decodeInstruction(rom, p, 'adl');
    if (!r || !r.length) break;
    insns.push({ address: p, bytes: bytesHex(p, r.length), mnemonic: formatInsn(r), decoded: r });
    if (r.tag === 'ret' || (r.tag === 'jp' && !r.condition)) break;
    p = r.nextPc;
  }
  const last = insns[insns.length - 1];
  const endsAtTarget = last && last.decoded.tag === 'jp' && last.decoded.target === START;
  const size = insns.length ? (insns[insns.length - 1].address + insns[insns.length - 1].decoded.length - entry.addr) : 0;
  pathSummaries.push({ ...entry, insns, size, convergesToTarget: endsAtTarget });
  console.log(`  ${entry.name}: ${hex(entry.addr)} (${size}B, ${insns.length} insns, converges=${endsAtTarget})`);
}

// Also check path from 0x06F75C — session 574 said it was the 4th path
{
  const addr = 0x06F75C;
  let p = addr;
  const insns = [];
  for (let i = 0; i < 50; i++) {
    const r = decodeInstruction(rom, p, 'adl');
    if (!r || !r.length) break;
    insns.push({ address: p, bytes: bytesHex(p, r.length), mnemonic: formatInsn(r), decoded: r });
    if (r.tag === 'ret' || (r.tag === 'jp' && !r.condition)) break;
    p = r.nextPc;
  }
  // Check if any JR Z/JR targets land at 0x06F7B9
  const convergences = insns.filter(i => i.decoded.target === START);
  console.log(`  Path D (extended): ${hex(addr)} (${insns.length} insns, direct JR/JP to target: ${convergences.length})`);
}

// ── 7. Write report ──

const lines = [];
lines.push('# Phase 575 P4: Decode 0x06F7B9 — Font Param Writer Shared Tail');
lines.push('');
lines.push('## Summary');
lines.push('');
lines.push('`0x06F7B9` is the convergence point (shared tail) for all paths of the font');
lines.push('param writer function group starting at `0x06F6E7`. All paths set bit 1 of');
lines.push('`(IY+2)` (= `grfModeFlags` at `0xD00082`) as a "font param write in progress"');
lines.push('flag, do their work, then JP to `0x06F7B9` which clears that flag and returns.');
lines.push('');
lines.push(`- **Start**: ${hex(START)}`);
lines.push(`- **End**: ${hex(START + functionSize - 1)}`);
lines.push(`- **Size**: ${functionSize} bytes (${instructions.length} instructions)`);
lines.push(`- **Function**: RES 1,(IY+2) ; RET`);
lines.push('');
lines.push('## Full Disassembly');
lines.push('');
lines.push('| Address | Bytes | Instruction |');
lines.push('|---------|-------|-------------|');
for (const row of instructions) {
  lines.push(`| ${hex(row.address)} | \`${row.bytes}\` | \`${row.mnemonic}\` |`);
}
lines.push('');
lines.push('## IY Flag Operations');
lines.push('');
if (iyOps.length) {
  for (const op of iyOps) {
    lines.push(`- \`${op.insn}\` — ${op.op} bit ${op.bit} of (IY+${op.disp}) = grfModeFlags at 0xD00082`);
  }
} else {
  lines.push('(none)');
}
lines.push('');
lines.push('## RAM References');
lines.push('');
if (ramRefs.length) {
  lines.push('| Address | Access | Instruction |');
  lines.push('|---------|--------|-------------|');
  for (const ref of ramRefs) {
    lines.push(`| ${ref.addr} | ${ref.access} | \`${ref.insn}\` |`);
  }
} else {
  lines.push('No D0xxxx RAM references in the shared tail itself (all RAM work is in the');
  lines.push('convergence paths before the JP).');
}
lines.push('');
lines.push('## Sub-Calls');
lines.push('');
if (calls.length) {
  for (const c of calls) lines.push(`- ${c}`);
} else {
  lines.push('None — the shared tail is a pure flag-clear + return.');
}
lines.push('');
lines.push('## References To 0x06F7B9');
lines.push('');
lines.push('Scan pattern: `B9 F7 06` (little-endian)');
lines.push('');
if (refs.length) {
  lines.push('| Instruction Address | Type |');
  lines.push('|---------------------|------|');
  for (const ref of refs) {
    lines.push(`| ${ref.addr} | ${ref.context} |`);
  }
} else {
  lines.push('(no references found)');
}
lines.push('');
lines.push('## Convergence Paths');
lines.push('');
lines.push('All paths in the font param writer group (0x06F6E7-0x06F7B8) converge here:');
lines.push('');
lines.push('| Path | Entry | Size | Instructions | Converges via JP? |');
lines.push('|------|-------|------|--------------|-------------------|');
for (const p of pathSummaries) {
  lines.push(`| ${p.name} | ${hex(p.addr)} | ${p.size}B | ${p.insns.length} | ${p.convergesToTarget ? 'Yes' : 'No (inline RES+RET)'} |`);
}
lines.push('');
lines.push('### Path A: 0x06F6E7 (Direct A-register Copy)');
lines.push('');
lines.push('```');
for (const row of pathSummaries[0].insns) {
  lines.push(`${hex(row.address)}  ${row.bytes.padEnd(20)}  ${row.mnemonic}`);
}
lines.push('```');
lines.push('');
lines.push('Copies `(D0146E)` → `A` → writes to `(D02A65)` and `(D01471)`, calls');
lines.push('`0x07B222`, then JP to shared tail.');
lines.push('');
lines.push('### Path B: 0x06F6FF (.SIS 16-bit Copy)');
lines.push('');
lines.push('```');
for (const row of pathSummaries[1].insns) {
  lines.push(`${hex(row.address)}  ${row.bytes.padEnd(20)}  ${row.mnemonic}`);
}
lines.push('```');
lines.push('');
lines.push('Uses `.SIS` prefix to copy 16-bit values: `(D0146F)` → `(D02A65)` and');
lines.push('`(D01472)`, calls `0x07B232`, then JP to shared tail.');
lines.push('');
lines.push('### Path C: 0x06F717 (Multi-field Copy with Comparison)');
lines.push('');
lines.push('```');
for (const row of pathSummaries[2].insns) {
  lines.push(`${hex(row.address)}  ${row.bytes.padEnd(20)}  ${row.mnemonic}`);
}
lines.push('```');
lines.push('');
lines.push('Calls `0x07022C`, copies D01471→D02A68 and D0146E→D02A65 via `0x07F984`,');
lines.push('then loads font metrics from .SIS addresses, calls `0x07B245`, does inline');
lines.push('RES 1,(IY+2), and JP `0x070241`.');
lines.push('');
lines.push('**Note**: Path C does its own inline `RES 1,(IY+2)` at 0x06F754 before');
lines.push('jumping to `0x070241` — it does NOT JP to 0x06F7B9. This path is the only');
lines.push('one that exits via a different route.');
lines.push('');
lines.push('## Functional Analysis');
lines.push('');
lines.push('### What (IY+2) bit 1 means');
lines.push('');
lines.push('`(IY+2)` = `grfModeFlags` at RAM address `0xD00082`. Bit 1 is used as a');
lines.push('"font parameter write in progress" guard flag:');
lines.push('');
lines.push('1. **SET 1,(IY+2)** at entry of each path — marks font param writing active');
lines.push('2. Path does its font parameter copying work');
lines.push('3. **RES 1,(IY+2)** at 0x06F7B9 (shared tail) — marks font param writing complete');
lines.push('4. **RET** — returns to caller');
lines.push('');
lines.push('This is a classic "busy flag" pattern: set on entry, clear on exit. Other');
lines.push('code can check `BIT 1,(IY+2)` to determine if font parameters are being');
lines.push('updated and should not be read yet.');
lines.push('');
lines.push('### RAM workspace addresses touched by convergence paths');
lines.push('');
lines.push('| Address | Purpose |');
lines.push('|---------|---------|');
lines.push('| D0146E | Font param source (read) |');
lines.push('| D0146F | Font param source, 16-bit (read via .SIS) |');
lines.push('| D01471 | Font param (read/write) |');
lines.push('| D01472 | Font param, 16-bit (write via .SIS) |');
lines.push('| D02A65 | Pixel renderer workspace: font param copy (write) |');
lines.push('| D02A68 | Pixel renderer workspace: font param copy (write) |');
lines.push('| D02AC8 | New RAM discovered session 574 (write, path D only) |');
lines.push('');

writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
console.log('\nReport written to', REPORT_PATH);
process.exit(0);
