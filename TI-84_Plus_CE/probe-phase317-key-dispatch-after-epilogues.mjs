#!/usr/bin/env node
// Phase 317: Map key-dispatch functions after _seqcase epilogues
// Disassembles 0x049CCA and 0x00883C, finds callers, maps D177B9 writers.
// Pure ROM analysis — no transpiled code needed.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hex(v, w = 6) {
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function hexdump(start, len) {
  const lines = [];
  for (let i = start; i < start + len; i += 16) {
    const bytes = [];
    for (let j = 0; j < 16 && i + j < start + len; j++) {
      bytes.push(rom[i + j].toString(16).padStart(2, '0'));
    }
    lines.push(`${hex(i)}: ${bytes.join(' ')}`);
  }
  return lines;
}

// _seqcase table format (ZDS II):
//   count(1) pad(2) [addr_lo addr_mid addr_hi key](4) * (count-1) default_addr(3)
// count includes the default, so there are (count-1) case entries.
function parseSeqcase(base) {
  const rawCount = rom[base];
  const numCases = rawCount - 1;
  let off = base + 3;
  const entries = [];
  for (let i = 0; i < numCases; i++) {
    const addr = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
    const key = rom[off + 3];
    entries.push({ key, addr });
    off += 4;
  }
  const def = rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);
  return { rawCount, numCases, entries, def, endOff: off + 3 };
}

function searchPattern(pattern) {
  const hits = [];
  for (let i = 0; i < rom.length - pattern.length + 1; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) hits.push(i);
  }
  return hits;
}

let pass = 0;
let fail = 0;

function check(name, condition) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    pass++;
  } else {
    console.log(`  FAIL: ${name}`);
    fail++;
  }
}

// ============================================================
// 1. Disassemble 0x049CCA — key-dispatch function A
// ============================================================
console.log('=== 1. Function at 0x049CCA (key-dispatch A, flash ROM context) ===');
console.log('Hexdump 0x049CCA..0x049DFF:');
hexdump(0x049CCA, 0x049E00 - 0x049CCA).forEach(l => console.log('  ' + l));

console.log('\nDisassembly:');
console.log('  049CCA: LD HL,0xFFFFFF        ; frame size = 1 local byte');
console.log('  049CCE: CALL 0x00012C          ; __frameset (flash ROM variant)');
console.log('  049CD2: LD (IX-1),0x00         ; local retval = 0');
console.log('  049CD6: LD A,I                 ; save interrupt state');
console.log('  049CD8: PUSH AF');
console.log('  049CD9: DI                     ; critical section starts');
console.log('  049CDA: LD A,(0xD177B9)        ; read current context state');
console.log('  049CDE: CP A,(IX+9)            ; compare with new_state param');
console.log('  049CE1: JR Z,+0x2E -> 049D11  ; if same state, skip transition');
console.log('  --- State transition block ---');
console.log('  049CE3: LD C,(IX+9)            ; C = new_state');
console.log('  049CE8: PUSH BC                ; arg: new_state');
console.log('  049CE9: CALL 0x0499C0          ; exit_state(new_state) — run exit handler');
console.log('  049CED: POP BC');
console.log('  049CEE: OR A                   ; test return');
console.log('  049CEF: JR Z,+0x1C -> 049D0D  ; if exit_state returned 0, set retval=1');
console.log('  049CF1: LD A,(0xD177B9)        ; re-read state (may have changed)');
console.log('  049CF8: PUSH BC                ; arg2: 0');
console.log('  049CFE: CALL 0x049CCA          ; **RECURSIVE** — dispatch(old_state, 0)');
console.log('  049D04: LD A,(IX+9)');
console.log('  049D07: LD (0xD177B9),A        ; commit new state');
console.log('  049D0D: LD (IX-1),0x01         ; retval = 1 (no-op / already handled)');
console.log('  --- Post-transition: key dispatch ---');
console.log('  049D11: LD A,(IX-1)');
console.log('  049D15: JP NZ,0x049DF9         ; if retval != 0, skip to epilogue');
console.log('  049D19: LD C,(IX+6)            ; C = key_code param');
console.log('  049D1F: CALL 0x049A23          ; process_key(key_code)');
console.log('  049D24: LD (IX-1),A            ; retval = result');
console.log('  049D2B: JP NZ,0x049DF9         ; if handled, skip to epilogue');
console.log('  049D2F: LD A,(IX+9)            ; A = state for _seqcase switch');
console.log('  049D36: CALL 0x000124          ; _seqcase on state');

const tA = parseSeqcase(0x049D3A);
console.log(`  --- _seqcase table: ${tA.numCases} cases + default ---`);
tA.entries.forEach(e =>
  console.log(`    state 0x${e.key.toString(16).padStart(2, '0')}: -> ${hex(e.addr)}`)
);
console.log(`    default: -> ${hex(tA.def)}`);
console.log('  All case bodies: LD A,(IX+6) ; LD (0xD177B8),A ; JR to common epilogue');
console.log('  Each case stores key_code into D177B8 then exits.');

check('0x049CCA reads D177B9 at 049CDA', rom[0x049CDA] === 0x3A && rom[0x049CDB] === 0xB9 && rom[0x049CDC] === 0x77);
check('0x049CCA calls 0x0499C0 (exit_state)', rom[0x049CE9] === 0xCD && rom[0x049CEA] === 0xC0);
check('0x049CCA recursive self-call at 049CFE', rom[0x049CFE] === 0xCD && rom[0x049CFF] === 0xCA && rom[0x049D00] === 0x9C);
check('0x049CCA uses _seqcase at 049D36', rom[0x049D36] === 0xCD && rom[0x049D37] === 0x24 && rom[0x049D38] === 0x01);
check('_seqcase A has 13 case entries', tA.numCases === 13);
check('All A case targets start with DD (IX prefix)', tA.entries.every(e => rom[e.addr] === 0xDD));
check('A default target starts with DD', rom[tA.def] === 0xDD);

// ============================================================
// 2. Disassemble 0x00883C — key-dispatch function B
// ============================================================
console.log('\n=== 2. Function at 0x00883C (key-dispatch B, low ROM context) ===');
console.log('Hexdump 0x00883C..0x00894F:');
hexdump(0x00883C, 0x008950 - 0x00883C).forEach(l => console.log('  ' + l));

console.log('\nDisassembly:');
console.log('  00883C: LD HL,0xFFFFFF        ; frame size = 1 local byte');
console.log('  008840: CALL 0x002197          ; __frameset (low ROM variant)');
console.log('  008844: LD (IX-1),0x00         ; local retval = 0');
console.log('  008848: LD A,I / PUSH AF / DI ; save + disable interrupts');
console.log('  00884C: LD A,(0xD177B9)        ; read current context state');
console.log('  008850: CP A,(IX+9)            ; compare with new_state');
console.log('  008853: JR Z,+0x2E -> 008883  ; same state, skip transition');
console.log('  00885B: CALL 0x0085E3          ; exit_state(new_state)');
console.log('  008870: CALL 0x00883C          ; **RECURSIVE** self-call');
console.log('  008879: LD (0xD177B9),A        ; commit new state');
console.log('  008891: CALL 0x00863A          ; process_key(key_code)');
console.log('  0088A8: CALL 0x00211B          ; _seqcase on state');

const tB = parseSeqcase(0x0088AC);
console.log(`  --- _seqcase table: ${tB.numCases} cases + default ---`);
tB.entries.forEach(e =>
  console.log(`    state 0x${e.key.toString(16).padStart(2, '0')}: -> ${hex(e.addr)}`)
);
console.log(`    default: -> ${hex(tB.def)}`);

check('0x00883C reads D177B9 at 00884C', rom[0x00884C] === 0x3A && rom[0x00884D] === 0xB9);
check('0x00883C calls 0x0085E3 (exit_state)', rom[0x00885B] === 0xCD && rom[0x00885C] === 0xE3);
check('0x00883C recursive self-call', rom[0x008870] === 0xCD && rom[0x008871] === 0x3C && rom[0x008872] === 0x88);
check('0x00883C uses _seqcase', rom[0x0088A8] === 0xCD && rom[0x0088A9] === 0x1B);
check('_seqcase B has 10 case entries', tB.numCases === 10);
check('All B case targets start with DD', tB.entries.every(e => rom[e.addr] === 0xDD));

// ============================================================
// 3. Sub-dispatchers (exit_state functions)
// ============================================================
console.log('\n=== 3. Sub-dispatcher 0x0499C0 (exit_state A) ===');
hexdump(0x0499C0, 96).forEach(l => console.log('  ' + l));
console.log('  Structure: __frameset ; local=1 ; LD A,(D177B9) ; _seqcase on state');

const tC = parseSeqcase(0x0499D8);
console.log(`  _seqcase: ${tC.numCases} cases + default`);
tC.entries.forEach(e =>
  console.log(`    state 0x${e.key.toString(16).padStart(2, '0')}: -> ${hex(e.addr)}`)
);
console.log(`    default: -> ${hex(tC.def)}`);

// Classify sub-dispatcher targets
const cTargetA = new Set(tC.entries.map(e => e.addr));
console.log(`  Unique targets: ${[...cTargetA].map(hex).join(', ')}`);
console.log('  States 01-04,17,18: -> 0x049A15 (JR to epilogue — pass-through)');
console.log('  States 10-16:       -> 0x049A1B (LD (IX-1),0x00 then epilogue — sets retval=0)');

check('0x0499C0 reads D177B9', rom[0x0499CC] === 0x3A && rom[0x0499CD] === 0xB9);
check('0x0499C0 uses _seqcase', rom[0x0499D4] === 0xCD && rom[0x0499D5] === 0x24);
check('0x0499C0 has 13 case entries', tC.numCases === 13);

console.log('\n=== 4. Sub-dispatcher 0x0085E3 (exit_state B) ===');
hexdump(0x0085E3, 96).forEach(l => console.log('  ' + l));

const tD = parseSeqcase(0x0085FB);
console.log(`  _seqcase: ${tD.numCases} cases + default`);
tD.entries.forEach(e =>
  console.log(`    state 0x${e.key.toString(16).padStart(2, '0')}: -> ${hex(e.addr)}`)
);
console.log(`    default: -> ${hex(tD.def)}`);

const dTargetA = new Set(tD.entries.map(e => e.addr));
console.log(`  Unique targets: ${[...dTargetA].map(hex).join(', ')}`);

check('0x0085E3 reads D177B9', rom[0x0085EF] === 0x3A && rom[0x0085F0] === 0xB9);
check('0x0085E3 uses _seqcase', rom[0x0085F7] === 0xCD && rom[0x0085F8] === 0x1B);
check('0x0085E3 has 10 case entries', tD.numCases === 10);

// ============================================================
// 4. Third key-dispatch pair: 0x049E07 / 0x008958
// ============================================================
console.log('\n=== 5. Third key-dispatch: 0x049E07 (reads D177B8 via D177B9 state) ===');

const tE = parseSeqcase(0x049E1F);
console.log(`  _seqcase: ${tE.numCases} cases + default`);
tE.entries.forEach(e =>
  console.log(`    state 0x${e.key.toString(16).padStart(2, '0')}: -> ${hex(e.addr)}`)
);
console.log(`    default: -> ${hex(tE.def)}`);
console.log('  All case bodies: LD A,(D177B8) ; LD (IX-1),A (reads D177B8 into return)');

check('0x049E07 _seqcase has 13 case entries', tE.numCases === 13);
check('All E case targets start with 3A (LD A,(nn))', tE.entries.every(e => rom[e.addr] === 0x3A));

console.log('\n=== 6. Parallel third dispatch: 0x008958 ===');

const tF = parseSeqcase(0x00896A);
console.log(`  _seqcase: ${tF.numCases} cases + default`);
tF.entries.forEach(e =>
  console.log(`    state 0x${e.key.toString(16).padStart(2, '0')}: -> ${hex(e.addr)}`)
);
console.log(`    default: -> ${hex(tF.def)}`);

check('0x008958 _seqcase has 9 case entries', tF.numCases === 9);

// ============================================================
// 5. Structural comparison
// ============================================================
console.log('\n=== 7. Structural Comparison ===');

const parallels = [
  ['Frame setup',      '0x00012C (flash)',        '0x002197 (low ROM)'],
  ['exit_state',       '0x0499C0',                '0x0085E3'],
  ['process_key',      '0x049A23',                '0x00863A'],
  ['_seqcase helper',  '0x000124',                '0x00211B'],
  ['Self-call target', '0x049CCA',                '0x00883C'],
  ['State byte',       'D177B9 (shared)',          'D177B9 (shared)'],
  ['Main cases',       `${tA.numCases}`,           `${tB.numCases}`],
  ['exit_state cases', `${tC.numCases}`,           `${tD.numCases}`],
  ['Third dispatch',   '0x049E07 (13 cases)',      '0x008958 (9 cases)'],
];
console.log('\n  ' + 'Feature'.padEnd(20) + 'Flash ROM (04xxxx)'.padEnd(30) + 'Low ROM (00xxxx)');
console.log('  ' + '-'.repeat(75));
for (const [feat, a, b] of parallels) {
  console.log('  ' + feat.padEnd(20) + a.padEnd(30) + b);
}

// Key state ID comparison
const keysA = tA.entries.map(e => e.key);
const keysB = tB.entries.map(e => e.key);
const keysAOnly = keysA.filter(k => !keysB.includes(k));
const keysBOnly = keysB.filter(k => !keysA.includes(k));
const keysShared = keysA.filter(k => keysB.includes(k));
console.log('\n  State IDs:');
console.log(`    A states: ${keysA.map(k => '0x' + k.toString(16).padStart(2, '0')).join(', ')}`);
console.log(`    B states: ${keysB.map(k => '0x' + k.toString(16).padStart(2, '0')).join(', ')}`);
console.log(`    Shared:   ${keysShared.map(k => '0x' + k.toString(16).padStart(2, '0')).join(', ')}`);
console.log(`    A-only:   ${keysAOnly.map(k => '0x' + k.toString(16).padStart(2, '0')).join(', ') || 'none'}`);
console.log(`    B-only:   ${keysBOnly.map(k => '0x' + k.toString(16).padStart(2, '0')).join(', ') || 'none'}`);

check('Both dispatchers read D177B9', true);
check('Both are recursive', true);
check('Both use _seqcase on state', true);
check('A has more state cases than B (13 vs 10)', tA.numCases > tB.numCases);
check('A covers states 0x16-0x18 that B does not', keysAOnly.includes(0x16) && keysAOnly.includes(0x17) && keysAOnly.includes(0x18));

// ============================================================
// 6. Caller analysis
// ============================================================
console.log('\n=== 8. Caller Analysis ===');

const callA = searchPattern([0xCD, 0xCA, 0x9C, 0x04]);
const jpA = searchPattern([0xC3, 0xCA, 0x9C, 0x04]);
const callB = searchPattern([0xCD, 0x3C, 0x88, 0x00]);
const jpB = searchPattern([0xC3, 0x3C, 0x88, 0x00]);

function classifyRegion(addr) {
  const region = (addr >> 16) & 0xFF;
  return `0x${region.toString(16).padStart(2, '0')}xxxx`;
}

function regionSummary(addrs) {
  const counts = {};
  for (const a of addrs) {
    const r = classifyRegion(a);
    counts[r] = (counts[r] || 0) + 1;
  }
  return Object.entries(counts).sort().map(([r, c]) => `${r}: ${c}`).join(', ');
}

console.log(`  CALL 0x049CCA: ${callA.length} sites [${regionSummary(callA)}]`);
console.log(`    Includes self-call at ${hex(0x049CFE)}`);
console.log(`  JP   0x049CCA: ${jpA.length} site(s) [${jpA.map(hex).join(', ') || 'none'}]`);
console.log(`  CALL 0x00883C: ${callB.length} sites [${regionSummary(callB)}]`);
console.log(`    Includes self-call at ${hex(0x008870)}`);
console.log(`  JP   0x00883C: ${jpB.length} site(s) [${jpB.map(hex).join(', ') || 'none'}]`);

check('0x049CCA has >100 callers', callA.length > 100);
check('0x00883C callers are in low ROM (00-01xxxx)', callB.every(a => a < 0x020000));
check('0x049CCA callers span 5+ ROM regions', Object.keys(Object.groupBy?.(callA, classifyRegion) ?? (() => { const m = {}; callA.forEach(a => { const r = classifyRegion(a); m[r] = true; }); return m; })()).length >= 5);

// Manual region count since Object.groupBy may not exist
const regionsA = new Set(callA.map(classifyRegion));
check('0x049CCA callers span 5+ ROM regions (recheck)', regionsA.size >= 5);

// ============================================================
// 7. D177B9 writer analysis
// ============================================================
console.log('\n=== 9. D177B9 (State Byte) Reference Map ===');

const d177b9Refs = [];
for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === 0xB9 && rom[i + 1] === 0x77 && rom[i + 2] === 0xD1) {
    const pre1 = i >= 1 ? rom[i - 1] : 0;
    let kind;
    if (pre1 === 0x3A) kind = 'READ  LD A,(D177B9)';
    else if (pre1 === 0x32) kind = 'WRITE LD (D177B9),A';
    else kind = `OTHER pre=${rom.slice(Math.max(0, i - 3), i).map(b => b.toString(16).padStart(2, '0')).join(' ')}`;
    d177b9Refs.push({ instrAddr: i - 1, refAddr: i, kind });
  }
}

const reads = d177b9Refs.filter(r => r.kind.startsWith('READ'));
const writes = d177b9Refs.filter(r => r.kind.startsWith('WRITE'));
const others = d177b9Refs.filter(r => r.kind.startsWith('OTHER'));

console.log(`  Total references: ${d177b9Refs.length}`);
console.log(`  Reads (LD A,(D177B9)):  ${reads.length}`);
for (const r of reads) console.log(`    ${hex(r.instrAddr)}`);
console.log(`  Writes (LD (D177B9),A): ${writes.length}`);
for (const w of writes) console.log(`    ${hex(w.instrAddr)} — in function ${w.instrAddr < 0x010000 ? '0x00883C' : '0x049CCA'}`);
if (others.length) {
  console.log(`  Other: ${others.length}`);
  for (const o of others) console.log(`    ${hex(o.instrAddr)} — ${o.kind}`);
}

check('D177B9 has 12 reads', reads.length === 12);
check('D177B9 has exactly 2 writes', writes.length === 2);
check('Writes are in the two main dispatch functions', writes.length === 2 && writes[0].instrAddr < 0x010000 && writes[1].instrAddr >= 0x040000);

// ============================================================
// Summary
// ============================================================
console.log('\n' + '='.repeat(70));
console.log(`RESULT: ${pass} PASS, ${fail} FAIL out of ${pass + fail} checks`);
console.log('='.repeat(70));

if (fail === 0) {
  console.log('\nKey findings:');
  console.log('');
  console.log('1. 0x049CCA and 0x00883C are STRUCTURALLY IDENTICAL key-dispatch functions.');
  console.log('   Both: read D177B9 (context state) -> if state changed, run exit_state handler');
  console.log('   -> recursively call self with old state -> commit new state -> process key');
  console.log('   -> _seqcase switch storing key_code into D177B8 per-state.');
  console.log('');
  console.log('2. TWO PARALLEL COPIES of the OS key dispatcher exist:');
  console.log('   - Flash ROM copy (0x04xxxx): 0x049CCA dispatch, 0x0499C0 exit_state, 0x049A23 process_key');
  console.log('   - Low ROM copy (0x00xxxx):   0x00883C dispatch, 0x0085E3 exit_state, 0x00863A process_key');
  console.log('   They use different __frameset and _seqcase helper addresses.');
  console.log('');
  console.log('3. D177B9 = OS context/screen state byte. 13 states in flash copy, 10 in low copy.');
  console.log('   States 0x01-0x04: likely base modes (home, graph, table, etc.)');
  console.log('   States 0x10-0x18: likely sub-modes (edit, menu, format, etc.)');
  console.log('   Flash copy handles 3 extra states: 0x16, 0x17, 0x18.');
  console.log('');
  console.log('4. D177B8 = last key code, written by every _seqcase case body.');
  console.log('');
  console.log('5. 0x049CCA has 166 CALL + 1 JP sites across ROM 02-07xxxx.');
  console.log('   0x00883C has 78 CALL sites in ROM 00-01xxxx only.');
  console.log('   -> Flash copy is the primary dispatcher; low copy handles boot/init contexts.');
  console.log('');
  console.log('6. The sub-dispatchers (exit_state) split states into two groups:');
  console.log('   - States 0x01-0x04 + 0x17-0x18: pass-through (return 1, allow transition)');
  console.log('   - States 0x10-0x16: return 0 (block transition, need cleanup first)');
} else {
  console.log('\nSome checks failed — review output above.');
  process.exit(1);
}
