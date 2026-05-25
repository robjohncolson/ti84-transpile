#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const SDK_INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');
const REPORT_PATH = path.join(__dirname, 'phase435-os-api-naming-report.md');

const TABLE_START = 0x000080;
const TABLE_END_EXCLUSIVE = 0x000658;
const SLOT_SIZE = 4;
const SLOT_COUNT = (TABLE_END_EXCLUSIVE - TABLE_START) / SLOT_SIZE;
const JP_OPCODE = 0xC3;
const BODY_READ_SIZE = 32;

// ── Helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0)
    | ((buffer[offset + 1] ?? 0) << 8)
    | ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function hexDump(buffer, offset, length) {
  const bytes = [];
  for (let i = 0; i < length && offset + i < buffer.length; i++) {
    bytes.push(buffer[offset + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

// ── SDK Boot Calls parser ────────────────────────────────────────────

function parseBootCallNames(includeText) {
  const sectionStart = includeText.indexOf('; Boot Calls');
  const sectionEnd = includeText.indexOf(';RAM Equates');

  if (sectionStart === -1 || sectionEnd === -1 || sectionEnd <= sectionStart) {
    throw new Error('Could not locate the Boot Calls block in references/ti84pceg.inc');
  }

  const block = includeText.slice(sectionStart, sectionEnd);
  const namesByAddr = new Map();
  const re = /^\?([A-Za-z_][A-Za-z0-9_.]*)\s*:=\s*0([0-9A-Fa-f]+)h/gm;
  let match;

  while ((match = re.exec(block)) !== null) {
    const name = match[1];
    const addr = parseInt(match[2], 16);
    if (addr < TABLE_START || addr >= TABLE_END_EXCLUSIVE) continue;
    if (!namesByAddr.has(addr)) namesByAddr.set(addr, []);
    namesByAddr.get(addr).push(name);
  }

  return namesByAddr;
}

// ── Pattern matchers ─────────────────────────────────────────────────
//
// Each matcher returns a string label or null.
// The `bytes` argument is a Uint8Array of the first BODY_READ_SIZE bytes
// of the function body at the target address.

function matchBytes(bytes, ...pattern) {
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === null) continue; // wildcard
    if (i >= bytes.length) return false;
    if (bytes[i] !== pattern[i]) return false;
  }
  return true;
}

function containsBytes(bytes, maxScan, ...pattern) {
  for (let i = 0; i <= maxScan - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (pattern[j] === null) continue;
      if (bytes[i + j] !== pattern[j]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

// Known target → name mapping from prior sessions
const KNOWN_TARGETS = new Map([
  [0x0021C2, '_icmpzero (_Null_check)'],
  [0x002623, '_seqcase'],
  [0x00276B, '_stoiu'],
  [0x002330, '_ishru_b (right-shift unsigned byte)'],
  [0x00230B, '_ishrs_b (right-shift signed byte)'],
  [0x00285F, '_memclear (_bzero)'],
  [0x002553, '_lshru'],
  [0x0027E8, '_memcpy'],
  [0x00218A, '__frameset0'],
  [0x002197, '__frameset'],
  [0x0025E8, '_scmpzero (_setflag)'],
  [0x0022F9, '_ishl_b (shift-left byte)'],
  [0x00224C, '_imulu / _imuls'],
  [0x002288, '_indcall (JP (IY) trampoline)'],
]);

function identifyByPattern(bytes, target, rom) {
  // Already known?
  if (KNOWN_TARGETS.has(target)) return KNOWN_TARGETS.get(target);

  // Out of ROM range?
  if (target >= rom.length) return null;

  const len = Math.min(BODY_READ_SIZE, rom.length - target);
  if (len < 4) return null;

  // ── Exact pattern matches for C runtime helpers ──

  // _frameset: PUSH IX (DD E5) / LD IX,SP (DD F9) / LEA IX,IX+d
  if (matchBytes(bytes, 0xDD, 0xE5, 0xDD, 0xF9)) {
    return '_frameset variant (PUSH IX; LD IX,SP)';
  }

  // LDIR-based: 0xED 0xB0
  if (containsBytes(bytes, len, 0xED, 0xB0)) {
    // Distinguish _memcpy vs _memset vs _bzero
    // _bzero: LD (HL),0 = 0x36 0x00 then LDIR
    if (containsBytes(bytes, len, 0x36, 0x00)) {
      return '_bzero variant (LD (HL),0; LDIR)';
    }
    // _memmove: check for LDDR = ED B8
    if (containsBytes(bytes, len, 0xED, 0xB8)) {
      return '_memmove variant (LDIR+LDDR)';
    }
    return 'block-copy (LDIR-based)';
  }

  // LDDR only (reverse copy)
  if (containsBytes(bytes, len, 0xED, 0xB8)) {
    return 'block-copy-reverse (LDDR-based)';
  }

  // SIL prefix pattern (0x40 in ADL mode) — common in setflag, scmpzero
  // SIL SBC HL,DE = 40 ED 52
  if (matchBytes(bytes, 0x40, 0xED, 0x52)) {
    return 'SIL SBC HL,DE pattern (flag/compare)';
  }

  // JP (IY) trampoline = FD E9
  if (matchBytes(bytes, 0xFD, 0xE9)) {
    return '_indcall (JP (IY))';
  }

  // JP (HL) trampoline = E9
  if (matchBytes(bytes, 0xE9)) {
    return 'JP (HL) trampoline';
  }

  // Simple RET = C9 (1-byte stub)
  if (matchBytes(bytes, 0xC9)) {
    return 'RET stub (no-op)';
  }

  // XOR A; RET = AF C9 (return 0)
  if (matchBytes(bytes, 0xAF, 0xC9)) {
    return 'return-zero (XOR A; RET)';
  }

  // OR A; SBC HL,HL; RET — return 0 in HL
  if (matchBytes(bytes, 0xB7, 0xED, 0x62, 0xC9)) {
    return 'return-zero-HL (OR A; SBC HL,HL; RET)';
  }

  // LD A,(addr); ... — memory read pattern
  if (bytes[0] === 0x3A) {
    const addr = read24LE(bytes, 1);
    return `LD A,(${hex(addr)}) reader`;
  }

  // PUSH IX (DD E5) without frameset — callee-save prologue
  if (matchBytes(bytes, 0xDD, 0xE5)) {
    return 'PUSH IX prologue';
  }

  // PUSH IY (FD E5) — callee-save prologue
  if (matchBytes(bytes, 0xFD, 0xE5)) {
    return 'PUSH IY prologue';
  }

  // DI (F3) — interrupt disable, typically hardware init
  if (bytes[0] === 0xF3) {
    return 'DI prologue (interrupt-sensitive)';
  }

  // EI (FB) — interrupt enable
  if (bytes[0] === 0xFB) {
    return 'EI prologue';
  }

  // CALL nn = CD xx xx xx — starts with a call
  if (bytes[0] === 0xCD) {
    const callTarget = read24LE(bytes, 1);
    return `CALL ${hex(callTarget)} dispatcher`;
  }

  // JP nn = C3 xx xx xx — tail-call/redirect
  if (bytes[0] === 0xC3) {
    const jpTarget = read24LE(bytes, 1);
    return `JP ${hex(jpTarget)} redirect`;
  }

  // LD HL,nn = 21 xx xx xx — loads a value
  if (bytes[0] === 0x21) {
    return 'LD HL,nn prologue';
  }

  // LD DE,nn = 11 xx xx xx
  if (bytes[0] === 0x11) {
    return 'LD DE,nn prologue';
  }

  // LD BC,nn = 01 xx xx xx
  if (bytes[0] === 0x01) {
    return 'LD BC,nn prologue';
  }

  // PUSH AF (F5)
  if (bytes[0] === 0xF5) {
    return 'PUSH AF prologue';
  }

  // SIL prefix (0x40) — short-mode prefix in ADL
  if (bytes[0] === 0x40) {
    return 'SIL-prefixed operation';
  }

  // OR A,A (B7) — flag set before conditional
  if (bytes[0] === 0xB7) {
    return 'OR A prologue (flag test)';
  }

  // XOR A (AF) — clear accumulator
  if (bytes[0] === 0xAF) {
    return 'XOR A prologue (clear A)';
  }

  // CP immediate (FE xx) — compare
  if (bytes[0] === 0xFE) {
    return `CP ${hex(bytes[1], 2)} prologue`;
  }

  // BIT/RES/SET prefix (CB)
  if (bytes[0] === 0xCB) {
    return 'BIT/RES/SET operation';
  }

  // RST 28h (EF) — OS system call
  if (bytes[0] === 0xEF) {
    return 'RST 28h (OS syscall)';
  }

  // IN/OUT prefix (ED)
  if (bytes[0] === 0xED) {
    return 'ED-prefixed (extended/IO)';
  }

  return null;
}

// ── Slot classification by SDK name ──────────────────────────────────

function classifySlotBySDKName(sdkNames) {
  if (sdkNames.length === 0) return 'unnamed';
  const name = sdkNames[0];

  // C runtime helpers
  if (name.startsWith('_mem') || name.startsWith('_str') || name === 'printf' || name === 'sprintf' || name === 'strtok' || name === '_longjmp' || name === '_setjmp' || name === 'dbgout') {
    return 'C-stdlib';
  }

  // ZDS-II compiler helpers (shift, mul, div, cmp, neg, etc.)
  if (/^_(i|l|s|b)(shl|shrs|shru|mul|div|rem|cmp|neg|not|and|or|xor|add|sub|tol|toi|ldix|ldiy|stix|stiy|dvrmu)/.test(name)) {
    return 'ZDS-II-runtime';
  }
  if (/^_(frameset|indcall|case|seqcase|setflag|null_check|icmpzero|scmpzero|lcmpzero|sand|sor|sxor|sneg|snot|ladd|land|lor|lxor|lneg|lnot|lsub|lstix|lstiy|lldix|lldiy|lshru|lshrs|lshl)/.test(name)) {
    return 'ZDS-II-runtime';
  }
  if (name === 'ret' || name === '_bldiy' || name === '_bshl' || name === '_bshru' || name === '_bstiy' || name === '_bstix') {
    return 'ZDS-II-runtime';
  }
  if (name === '_stoi' || name === '_stoiu' || name === '_itol') {
    return 'ZDS-II-runtime';
  }

  // Floating point
  if (/^_(f[a-z]|fp|fr[a-z]|ultof|ltof)/.test(name) || name === 'sqrtf' || name === 'FLTMAX') {
    return 'floating-point';
  }

  // Boot / hardware
  if (name.startsWith('boot.') || name.startsWith('Boot') || /^(Reset|Check|Get|Set|Write|Erase|Mark|Draw|Put|Delay|Mult|Div|Cmp|Find|Next|Clr|Cpy|Chk|Execute|Keypad)/.test(name)) {
    return 'boot-hardware';
  }

  // USB
  if (name.startsWith('usb_')) {
    return 'USB';
  }

  return 'other';
}

// ── Main ─────────────────────────────────────────────────────────────

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const sdkInclude = fs.readFileSync(SDK_INC_PATH, 'utf8');
  const sdkNamesByAddr = parseBootCallNames(sdkInclude);

  // Extract all 374 JP thunks
  const slots = [];
  const targetToSlots = new Map();

  for (let index = 0; index < SLOT_COUNT; index++) {
    const addr = TABLE_START + index * SLOT_SIZE;
    const opcode = rom[addr];
    const target = read24LE(rom, addr + 1);
    const sdkNames = sdkNamesByAddr.get(addr) ?? [];

    const slot = { index, addr, opcode, target, sdkNames, isJp: opcode === JP_OPCODE };

    if (!targetToSlots.has(target)) targetToSlots.set(target, []);
    targetToSlots.get(target).push(slot);
    slots.push(slot);
  }

  // Read first 32 bytes of each unique target and attempt identification
  const targetInfo = new Map();
  let identifiedCount = 0;
  let patternOnlyCount = 0;

  for (const [target, tSlots] of targetToSlots.entries()) {
    const bodyOffset = target;
    let bodyBytes = new Uint8Array(0);
    let bodyHex = '';

    if (bodyOffset + BODY_READ_SIZE <= rom.length) {
      bodyBytes = rom.slice(bodyOffset, bodyOffset + BODY_READ_SIZE);
      bodyHex = hexDump(rom, bodyOffset, BODY_READ_SIZE);
    } else if (bodyOffset < rom.length) {
      bodyBytes = rom.slice(bodyOffset, rom.length);
      bodyHex = hexDump(rom, bodyOffset, rom.length - bodyOffset);
    }

    // Collect all SDK names for this target across all slots pointing to it
    const allSDKNames = [...new Set(tSlots.flatMap(s => s.sdkNames))];

    // Try pattern identification
    const patternLabel = identifyByPattern(bodyBytes, target, rom);

    // Determine final label
    let finalLabel = null;
    let source = 'unidentified';

    if (KNOWN_TARGETS.has(target)) {
      finalLabel = KNOWN_TARGETS.get(target);
      source = 'prior-session';
      identifiedCount++;
    } else if (allSDKNames.length > 0) {
      finalLabel = allSDKNames.join(' / ');
      source = 'SDK';
      identifiedCount++;
    } else if (patternLabel) {
      finalLabel = patternLabel;
      source = 'pattern';
      patternOnlyCount++;
      identifiedCount++;
    }

    const category = classifySlotBySDKName(allSDKNames);

    targetInfo.set(target, {
      target,
      bodyBytes,
      bodyHex,
      allSDKNames,
      patternLabel,
      finalLabel,
      source,
      category,
      slotCount: tSlots.length,
      slots: tSlots,
    });
  }

  // Annotate slots
  for (const slot of slots) {
    const info = targetInfo.get(slot.target);
    slot.finalLabel = info.finalLabel;
    slot.source = info.source;
    slot.category = info.category;
    slot.patternLabel = info.patternLabel;
  }

  // ── Statistics ───────────────────────────────────────────────────

  const uniqueTargets = targetToSlots.size;
  const slotsWithSDKName = slots.filter(s => s.sdkNames.length > 0).length;
  const targetsWithSDKName = [...targetInfo.values()].filter(t => t.allSDKNames.length > 0).length;
  const targetsFromPrior = [...targetInfo.values()].filter(t => t.source === 'prior-session').length;
  const targetsFromPattern = [...targetInfo.values()].filter(t => t.source === 'pattern').length;
  const targetsUnidentified = [...targetInfo.values()].filter(t => t.source === 'unidentified').length;

  // Category counts
  const categoryCounts = new Map();
  for (const info of targetInfo.values()) {
    const cat = info.category;
    categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
  }

  // ── Console output ───────────────────────────────────────────────

  const lines = [];
  lines.push('Phase 435 - OS API Naming via SDK Cross-Reference + Pattern Matching');
  lines.push('====================================================================');
  lines.push('');
  lines.push(`ROM: ${ROM_PATH}`);
  lines.push(`Table: ${hex(TABLE_START)}-${hex(TABLE_END_EXCLUSIVE - SLOT_SIZE)} (${SLOT_COUNT} slots)`);
  lines.push(`Body read: first ${BODY_READ_SIZE} bytes of each unique target`);
  lines.push('');
  lines.push('Summary Statistics');
  lines.push('------------------');
  lines.push(`Total slots:                 ${SLOT_COUNT}`);
  lines.push(`Unique targets:              ${uniqueTargets}`);
  lines.push(`Slots with SDK name:         ${slotsWithSDKName} / ${SLOT_COUNT}`);
  lines.push(`Targets with SDK name:       ${targetsWithSDKName} / ${uniqueTargets}`);
  lines.push(`Targets from prior sessions: ${targetsFromPrior} / ${uniqueTargets}`);
  lines.push(`Targets from pattern match:  ${targetsFromPattern} / ${uniqueTargets}`);
  lines.push(`Targets identified (total):  ${identifiedCount} / ${uniqueTargets}`);
  lines.push(`Targets unidentified:        ${targetsUnidentified} / ${uniqueTargets}`);
  lines.push('');
  lines.push('Category Breakdown (unique targets)');
  lines.push('-----------------------------------');
  for (const [cat, count] of [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`  ${pad(cat, 22)} ${count}`);
  }

  lines.push('');
  lines.push('Newly Pattern-Identified Targets');
  lines.push('--------------------------------');
  const patternTargets = [...targetInfo.values()]
    .filter(t => t.source === 'pattern')
    .sort((a, b) => a.target - b.target);

  for (const info of patternTargets) {
    const slotList = info.slots.map(s => s.index).join(', ');
    lines.push(`  ${hex(info.target)}  ${pad(info.patternLabel, 42)}  slots: ${slotList}`);
  }

  lines.push('');
  lines.push('Full Table');
  lines.push('----------');

  const labelWidth = Math.max(
    'Label'.length,
    ...slots.map(s => (s.finalLabel ?? '---').length),
  );
  const srcWidth = Math.max('Source'.length, 14);
  const sdkWidth = Math.max('SDK Name'.length, ...slots.map(s => (s.sdkNames.join(' / ') || '---').length));

  lines.push(
    `${pad('Slot', 5)} ${pad('Thunk', 10)} ${pad('Target', 10)} ${pad('Source', srcWidth)} ${pad('SDK Name', sdkWidth)} ${pad('Label', labelWidth)} First 16 bytes`,
  );
  lines.push(
    `${'-'.repeat(5)} ${'-'.repeat(10)} ${'-'.repeat(10)} ${'-'.repeat(srcWidth)} ${'-'.repeat(sdkWidth)} ${'-'.repeat(labelWidth)} ${'─'.repeat(47)}`,
  );

  for (const slot of slots) {
    const info = targetInfo.get(slot.target);
    const shortHex = hexDump(rom, slot.target, Math.min(16, rom.length - slot.target));
    lines.push(
      `${pad(slot.index, 5)} ${pad(hex(slot.addr), 10)} ${pad(hex(slot.target), 10)} ${pad(slot.source, srcWidth)} ${pad(slot.sdkNames.join(' / ') || '---', sdkWidth)} ${pad(slot.finalLabel ?? '---', labelWidth)} ${shortHex}`,
    );
  }

  lines.push('');
  lines.push('Unidentified Targets (grouped by address range)');
  lines.push('------------------------------------------------');

  const unidentified = [...targetInfo.values()]
    .filter(t => t.source === 'unidentified')
    .sort((a, b) => a.target - b.target);

  if (unidentified.length === 0) {
    lines.push('  None — all targets identified.');
  } else {
    const ranges = [
      { label: '0x000000-0x000FFF', min: 0x000000, max: 0x001000 },
      { label: '0x001000-0x001FFF', min: 0x001000, max: 0x002000 },
      { label: '0x002000-0x002FFF', min: 0x002000, max: 0x003000 },
      { label: '0x003000-0x003FFF', min: 0x003000, max: 0x004000 },
      { label: '0x004000-0x00FFFF', min: 0x004000, max: 0x010000 },
      { label: '0x010000-0x01FFFF', min: 0x010000, max: 0x020000 },
      { label: '0x020000+',        min: 0x020000, max: Number.POSITIVE_INFINITY },
    ];

    for (const range of ranges) {
      const inRange = unidentified.filter(t => t.target >= range.min && t.target < range.max);
      if (inRange.length === 0) continue;

      lines.push(`\n  ${range.label} (${inRange.length} targets)`);
      for (const info of inRange) {
        const slotList = info.slots.map(s => s.index).join(', ');
        lines.push(`    ${hex(info.target)}  slots: ${pad(slotList, 12)}  ${info.bodyHex.slice(0, 47)}`);
      }
    }
  }

  const consoleOutput = lines.join('\n');
  console.log(consoleOutput);

  // ── Markdown report ────────────────────────────────────────────────

  const md = [];
  md.push('# Phase 435 - OS API Naming Report');
  md.push('');
  md.push('## Overview');
  md.push('');
  md.push(`Cross-referenced all **${SLOT_COUNT}** JP thunks in the boot-call table at **${hex(TABLE_START)}-${hex(TABLE_END_EXCLUSIVE - SLOT_SIZE)}** against SDK names (Boot Calls block in \`ti84pceg.inc\`), prior-session identifications, and byte-pattern matching on the first ${BODY_READ_SIZE} bytes of each function body.`);
  md.push('');
  md.push('## Statistics');
  md.push('');
  md.push('| Metric | Value |');
  md.push('|--------|-------|');
  md.push(`| Total slots | ${SLOT_COUNT} |`);
  md.push(`| Unique targets | ${uniqueTargets} |`);
  md.push(`| Slots with SDK name | ${slotsWithSDKName} / ${SLOT_COUNT} |`);
  md.push(`| Unique targets with SDK name | ${targetsWithSDKName} / ${uniqueTargets} |`);
  md.push(`| Targets from prior sessions | ${targetsFromPrior} / ${uniqueTargets} |`);
  md.push(`| Targets from pattern match (new) | ${targetsFromPattern} / ${uniqueTargets} |`);
  md.push(`| **Total targets identified** | **${identifiedCount} / ${uniqueTargets}** |`);
  md.push(`| Targets still unidentified | ${targetsUnidentified} / ${uniqueTargets} |`);
  md.push('');

  md.push('## Category Breakdown');
  md.push('');
  md.push('| Category | Unique targets |');
  md.push('|----------|---------------|');
  for (const [cat, count] of [...categoryCounts.entries()].sort((a, b) => b[1] - a[1])) {
    md.push(`| ${cat} | ${count} |`);
  }
  md.push('');

  md.push('## Newly Pattern-Identified Functions');
  md.push('');
  md.push('These targets were not named by the SDK or prior sessions, but were identified by reading the first bytes of the function body.');
  md.push('');
  md.push('| Target | Pattern ID | Slots | First 16 bytes |');
  md.push('|--------|-----------|-------|----------------|');
  for (const info of patternTargets) {
    const slotList = info.slots.map(s => s.index).join(', ');
    const shortHex = hexDump(rom, info.target, Math.min(16, rom.length - info.target));
    md.push(`| ${hex(info.target)} | ${info.patternLabel} | ${slotList} | \`${shortHex}\` |`);
  }
  md.push('');

  md.push('## Complete Table');
  md.push('');
  md.push('| Slot | Thunk | Target | Source | SDK Name | Label |');
  md.push('|------|-------|--------|--------|----------|-------|');
  for (const slot of slots) {
    md.push(
      `| ${slot.index} | ${hex(slot.addr)} | ${hex(slot.target)} | ${slot.source} | ${slot.sdkNames.join(' / ') || '---'} | ${slot.finalLabel ?? '---'} |`,
    );
  }
  md.push('');

  md.push('## Unidentified Targets');
  md.push('');
  if (unidentified.length === 0) {
    md.push('None — all targets identified.');
  } else {
    md.push(`**${unidentified.length}** unique targets remain unidentified.`);
    md.push('');
    md.push('| Target | Slots | First 16 bytes |');
    md.push('|--------|-------|----------------|');
    for (const info of unidentified) {
      const slotList = info.slots.map(s => s.index).join(', ');
      const shortHex = hexDump(rom, info.target, Math.min(16, rom.length - info.target));
      md.push(`| ${hex(info.target)} | ${slotList} | \`${shortHex}\` |`);
    }
  }
  md.push('');

  md.push('## Assessment');
  md.push('');
  md.push(`- **${identifiedCount}** of **${uniqueTargets}** unique targets now have a name or pattern identification (${(identifiedCount / uniqueTargets * 100).toFixed(1)}% coverage).`);
  md.push(`- **${targetsWithSDKName}** targets are named directly from the SDK Boot Calls block.`);
  md.push(`- **${targetsFromPrior}** targets carry names from prior reverse-engineering sessions.`);
  md.push(`- **${targetsFromPattern}** new targets were identified by byte-pattern matching on their function prologues.`);
  md.push(`- **${targetsUnidentified}** targets remain unidentified — these require deeper disassembly or cross-referencing with higher-level OS routines.`);
  md.push('- The table is a mix of ZDS-II compiler runtime helpers, C standard library wrappers, floating-point support, boot/hardware services, and USB stack entries.');

  fs.writeFileSync(REPORT_PATH, md.join('\n') + '\n');
  console.log('');
  console.log(`Markdown report written to ${REPORT_PATH}`);
}

main();
