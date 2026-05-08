#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const TABLE_BASE = 0x08C958;
const TABLE_ENTRY_COUNT = 20;
const TABLE_ENTRY_SIZE = 3;
const DISASM_BYTES = 0x30;
const MAX_DISASM_INSTRUCTIONS = 16;

const D007E0 = 0xD007E0;
const D00824 = 0xD00824;
const NEW_CONTEXT = 0x08C79F;
const NEW_CONTEXT0 = 0x08C7AD;

const EXACT_LABELS = new Map([
  [0x058241, 'cxMain (home-screen key handler)'],
  [0x03D755, 'known handler start'],
  [0x080CA7, 'known handler start'],
  [0x0AB667, 'known handler start'],
  [0x06C748, 'known handler start'],
]);

const D00824_HINTS = new Map([
  [0x00, 'home'],
  [0x01, 'stat'],
  [0x46, 'ui/menu'],
  [0x48, 'editor'],
  [0x49, 'editor'],
  [0x4A, 'editor'],
]);

const ABSOLUTE_BRANCH_FORMS = new Map([
  [0xC3, 'jp'],
  [0xC2, 'jp nz'],
  [0xCA, 'jp z'],
  [0xD2, 'jp nc'],
  [0xDA, 'jp c'],
  [0xE2, 'jp po'],
  [0xEA, 'jp pe'],
  [0xF2, 'jp p'],
  [0xFA, 'jp m'],
  [0xCD, 'call'],
  [0xC4, 'call nz'],
  [0xCC, 'call z'],
  [0xD4, 'call nc'],
  [0xDC, 'call c'],
  [0xE4, 'call po'],
  [0xEC, 'call pe'],
  [0xF4, 'call p'],
  [0xFC, 'call m'],
]);

const LOAD_IMM_FORMS = new Map([
  [0x01, 'ld bc'],
  [0x11, 'ld de'],
  [0x21, 'ld hl'],
  [0x31, 'ld sp'],
]);

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function read24(buffer, addr) {
  return (
    ((buffer[addr] ?? 0) & 0xFF) |
    (((buffer[addr + 1] ?? 0) & 0xFF) << 8) |
    (((buffer[addr + 2] ?? 0) & 0xFF) << 16)
  ) >>> 0;
}

function bytesFor(buffer, pc, length) {
  return Array.from(
    buffer.slice(pc, pc + length),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function regionLabel(addr) {
  const page = (addr >>> 16) & 0xFF;
  if (page <= 0x03) return 'OS-low';
  if (page === 0x04) return 'OS-core';
  if (page === 0x05) return 'OS-mid';
  if (page === 0x06) return 'Editor-page';
  if (page === 0x07) return 'OS-07';
  if (page === 0x08) return 'UI/menu-page';
  if (page === 0x09) return '09xxxx-family';
  return '0A+/app-page';
}

function shortList(values, limit = 8, formatter = (value) => hex(value)) {
  if (!values.length) return 'none';
  const shown = values.slice(0, limit).map(formatter);
  return values.length > limit ? `${shown.join(', ')} ... (+${values.length - limit})` : shown.join(', ');
}

function intersectCount(a, b) {
  let count = 0;
  for (const value of a) {
    if (b.has(value)) count += 1;
  }
  return count;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'ei': text = 'ei'; break;
    case 'di': text = 'di'; break;
    case 'halt': text = 'halt'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'rst': text = `rst ${hex(inst.target)}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'exx': text = 'exx'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hex(inst.value, 2)}`; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'alu-ixd': text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-rotate': text = `${inst.operation} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hex(inst.value, 2)}`; break;
    case 'lea': text = `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`; break;
    case 'neg': text = 'neg'; break;
    case 'cpl': text = 'cpl'; break;
    case 'ccf': text = 'ccf'; break;
    case 'scf': text = 'scf'; break;
    case 'daa': text = 'daa'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'rld': text = 'rld'; break;
    case 'rrd': text = 'rrd'; break;
    default: {
      const detail = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(key)) {
          continue;
        }
        detail.push(`${key}=${typeof value === 'number' ? hex(value) : value}`);
      }
      text = detail.length > 0 ? `${inst.tag} ${detail.join(' ')}` : inst.tag;
      break;
    }
  }

  return `${prefix}${text}`;
}

function disassembleWindow(startAddr, byteLimit = DISASM_BYTES, maxInstructions = MAX_DISASM_INSTRUCTIONS) {
  const rows = [];
  let pc = startAddr;
  const end = Math.min(startAddr + byteLimit, rom.length);

  while (pc < end && rows.length < maxInstructions) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      if (!inst || inst.length <= 0) {
        rows.push({ pc, bytes: bytesFor(rom, pc, 1), text: `db ${hexByte(rom[pc] ?? 0)}`, inst: null });
        pc += 1;
        continue;
      }

      rows.push({
        pc: inst.pc,
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        inst,
      });
      pc += inst.length;
    } catch (error) {
      rows.push({ pc, bytes: bytesFor(rom, pc, 1), text: `db ${hexByte(rom[pc] ?? 0)} ; decode-error: ${error.message}`, inst: null });
      pc += 1;
    }
  }

  return rows;
}

function findExact24Refs(target) {
  const low = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const high = (target >>> 16) & 0xFF;
  const hits = [];

  for (let addr = 0; addr <= rom.length - 3; addr += 1) {
    if (rom[addr] === low && rom[addr + 1] === mid && rom[addr + 2] === high) {
      hits.push(addr);
    }
  }

  return hits;
}

function findAbsoluteBranchRefs(target) {
  const hits = [];

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const mnemonic = ABSOLUTE_BRANCH_FORMS.get(rom[addr]);
    if (!mnemonic) continue;
    if (read24(rom, addr + 1) === target) {
      hits.push({ addr, mnemonic, bytes: bytesFor(rom, addr, 4) });
    }
  }

  return hits;
}

function findImmediateLoadRefs(target) {
  const hits = [];

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const mnemonic = LOAD_IMM_FORMS.get(rom[addr]);
    if (!mnemonic) continue;
    if (read24(rom, addr + 1) === target) {
      hits.push({ addr, mnemonic, bytes: bytesFor(rom, addr, 4) });
    }
  }

  return hits;
}

function findConstantWritersToD00824(value) {
  const pattern = [0x3E, value & 0xFF, 0x32, 0x24, 0x08, 0xD0];
  const hits = [];

  outer: for (let addr = 0; addr <= rom.length - pattern.length; addr += 1) {
    for (let i = 0; i < pattern.length; i += 1) {
      if (rom[addr + i] !== pattern[i]) continue outer;
    }
    hits.push(addr);
  }

  return hits;
}

function findDirectContextPreloads(rawContext) {
  const patterns = [
    { kind: 'call 0x08C79F', bytes: [0x3E, rawContext & 0xFF, 0xCD, 0x9F, 0xC7, 0x08] },
    { kind: 'call 0x08C7AD', bytes: [0x3E, rawContext & 0xFF, 0xCD, 0xAD, 0xC7, 0x08] },
  ];

  const hits = [];
  for (const pattern of patterns) {
    outer: for (let addr = 0; addr <= rom.length - pattern.bytes.length; addr += 1) {
      for (let i = 0; i < pattern.bytes.length; i += 1) {
        if (rom[addr + i] !== pattern.bytes[i]) continue outer;
      }
      hits.push({ addr, kind: pattern.kind });
    }
  }

  return hits;
}

function buildCallTargetSet(rows) {
  const targets = new Set();

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;
    if (
      inst.tag === 'call' ||
      inst.tag === 'call-conditional' ||
      inst.tag === 'jp' ||
      inst.tag === 'jp-conditional'
    ) {
      if (typeof inst.target === 'number') targets.add(inst.target >>> 0);
    }
  }

  return targets;
}

function buildFeatureNotes(entry, editorSeedTargetSet) {
  const notes = [];
  const callTargets = entry.callTargets;

  if (entry.label !== null) {
    notes.push(`label match: ${entry.label}`);
  }

  if (entry.address === 0x058241) {
    notes.push('given task anchor for home / cxMain');
  }

  if (entry.index === 1) {
    notes.push('index 1 lines up with the session-236 D00824=0x01 STAT hint');
  }

  if (entry.rawContext === 0x44) {
    notes.push('raw context 0x44 is the special NewContext path that goes through GrPutAway before home handoff');
  }

  if (entry.rawContext === 0x46) {
    notes.push('raw context 0x46 lines up with the session-236 UI/menu hint');
  }

  if ([0x48, 0x49, 0x4A].includes(entry.rawContext)) {
    notes.push(`raw context ${hexByte(entry.rawContext)} lines up with the session-236 editor hints`);
  }

  if (entry.directPreloads.length) {
    notes.push(`direct raw preload sites: ${shortList(entry.directPreloads.map((hit) => hit.addr))}`);
  }

  if (callTargets.has(D007E0) || callTargets.has(D00824)) {
    notes.push('contains direct branch to D007E0/D00824 helper region');
  }

  const touchesCxCurApp = entry.rows.some((row) => row.inst?.addr === D007E0 || row.inst?.value === D007E0);
  if (touchesCxCurApp) {
    notes.push('touches cxCurApp (0xD007E0) in the first window');
  }

  const touchesMenuCurrent = entry.rows.some((row) => row.inst?.addr === D00824 || row.inst?.value === D00824);
  if (touchesMenuCurrent) {
    notes.push('touches menuCurrent / D00824 in the first window');
  }

  const editorOverlap = intersectCount(callTargets, editorSeedTargetSet);
  if (editorOverlap >= 2 && ![0x48, 0x49, 0x4A].includes(entry.rawContext)) {
    notes.push(`shares ${editorOverlap} call targets with the 0x48/0x49/0x4A editor-handler seed set`);
  }

  return notes;
}

function classifyEntry(entry, editorSeedTargetSet) {
  let category = 'unknown';
  let confidence = 'low';
  const reasons = [];

  if (entry.address === 0x058241) {
    category = 'home';
    confidence = 'high';
    reasons.push('exact task-provided cxMain / home handler address');
  } else if (entry.index === 1) {
    category = 'stat';
    confidence = 'low';
    reasons.push('index 1 aligns with the session-236 D00824=0x01 STAT hint');
  } else if (entry.rawContext === 0x44) {
    category = 'graph';
    confidence = 'low';
    reasons.push('raw context 0x44 is the special NewContext path tied to GrPutAway before the home handoff');
  } else if ([0x48, 0x49, 0x4A].includes(entry.rawContext)) {
    category = 'editor';
    confidence = 'medium';
    reasons.push(`raw context ${hexByte(entry.rawContext)} matches the editor-mode hints from the D00824 writer map`);
  }

  const editorOverlap = intersectCount(entry.callTargets, editorSeedTargetSet);
  if (category === 'unknown' && editorOverlap >= 2) {
    reasons.push(`shares ${editorOverlap} early call targets with the editor seed handlers`);
  }

  if (entry.rawContext === 0x46 && category === 'unknown') {
    reasons.push('raw context 0x46 matches the repo hint for UI/menu');
  }

  return { category, confidence, reasons };
}

function collectEntries() {
  const entries = [];

  for (let index = 0; index < TABLE_ENTRY_COUNT; index += 1) {
    const entryAddr = TABLE_BASE + index * TABLE_ENTRY_SIZE;
    const address = read24(rom, entryAddr);
    const rawContext = 0x40 + index;
    const rows = disassembleWindow(address);
    const exact24Refs = findExact24Refs(address);
    const branchRefs = findAbsoluteBranchRefs(address);
    const immLoadRefs = findImmediateLoadRefs(address);
    const directPreloads = findDirectContextPreloads(rawContext);
    const callTargets = buildCallTargetSet(rows);

    entries.push({
      index,
      rawContext,
      entryAddr,
      address,
      label: EXACT_LABELS.get(address) ?? null,
      region: regionLabel(address),
      rows,
      exact24Refs,
      branchRefs,
      immLoadRefs,
      directPreloads,
      callTargets,
    });
  }

  return entries;
}

function buildEditorSeedTargetSet(entries) {
  const seedSet = new Set();

  for (const entry of entries) {
    if (![0x48, 0x49, 0x4A].includes(entry.rawContext)) continue;
    for (const target of entry.callTargets) seedSet.add(target);
  }

  return seedSet;
}

function printLookupSummary() {
  console.log('=== Phase 255: Handler Table Context Map ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
  console.log('');
  console.log('Lookup helper at 0x08C94B:');
  console.log('  0x08C94B  ld e, a');
  console.log('  0x08C94C  ld d, 0x03');
  console.log('  0x08C94E  mlt de');
  console.log('  0x08C950  ld hl, 0x08C958');
  console.log('  0x08C954  add hl, de');
  console.log('  0x08C955  ld hl, (hl)');
  console.log('  0x08C957  ret');
  console.log('');
  console.log('Normalization note from NewContext/NewContext0: raw app ids 0x40..0x53 normalize to table indexes 0..19 before the helper call.');
  console.log('Special case: raw 0x3F aliases into index 0 / home via the same path.');
  console.log('');
}

function printD00824Hints() {
  console.log('Known D00824 constant-writer hints (scanned directly from ROM):');
  for (const [value, label] of D00824_HINTS.entries()) {
    const hits = findConstantWritersToD00824(value);
    console.log(`  ${hexByte(value)} -> ${label.padEnd(8)} writers: ${shortList(hits)}`);
  }
  console.log('');
}

function printIndexMap(entries) {
  console.log('Index to raw-context map:');
  for (const entry of entries) {
    const special = entry.index === 0 ? '  (raw 0x3F also aliases here)' : '';
    console.log(`  [${String(entry.index).padStart(2, '0')}] raw ${hexByte(entry.rawContext)} -> ${hex(entry.address)}${special}`);
  }
  console.log('');
}

function printCondensedTable(entries) {
  console.log('Condensed table:');
  for (const entry of entries) {
    const firstText = entry.rows.slice(0, 3).map((row) => row.text).join(' ; ');
    console.log(
      `  [${String(entry.index).padStart(2, '0')}] raw=${hexByte(entry.rawContext)} ` +
      `${hex(entry.address)} = ${entry.classification.category} [${entry.classification.confidence}] (${firstText})`
    );
  }
  console.log('');
}

function printDetailedEntry(entry) {
  console.log(
    `[${String(entry.index).padStart(2, '0')}] raw=${hexByte(entry.rawContext)} ` +
    `entry=${hex(entry.entryAddr)} -> ${hex(entry.address)}`
  );
  console.log(`  region: ${entry.region}`);
  if (entry.label) {
    console.log(`  label: ${entry.label}`);
  }
  console.log(
    `  classification: ${entry.classification.category} [${entry.classification.confidence}]` +
    (entry.classification.reasons.length ? ` ; ${entry.classification.reasons.join(' ; ')}` : '')
  );
  if (entry.featureNotes.length) {
    console.log(`  notes: ${entry.featureNotes.join(' ; ')}`);
  }
  console.log(`  exact 24-bit refs: ${entry.exact24Refs.length} -> ${shortList(entry.exact24Refs)}`);
  console.log(
    `  branch refs: ${entry.branchRefs.length} -> ` +
    shortList(entry.branchRefs, 6, (hit) => `${hex(hit.addr)} ${hit.mnemonic}`)
  );
  console.log(
    `  imm-load refs: ${entry.immLoadRefs.length} -> ` +
    shortList(entry.immLoadRefs, 6, (hit) => `${hex(hit.addr)} ${hit.mnemonic}`)
  );
  console.log(
    `  direct raw preload sites: ${entry.directPreloads.length} -> ` +
    shortList(entry.directPreloads, 6, (hit) => `${hex(hit.addr)} ${hit.kind}`)
  );
  console.log('  disassembly:');
  for (const row of entry.rows) {
    console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}`);
  }
  console.log('');
}

function main() {
  printLookupSummary();
  printD00824Hints();

  const entries = collectEntries();
  const editorSeedTargetSet = buildEditorSeedTargetSet(entries);

  for (const entry of entries) {
    entry.classification = classifyEntry(entry, editorSeedTargetSet);
    entry.featureNotes = buildFeatureNotes(entry, editorSeedTargetSet);
  }

  printIndexMap(entries);
  printCondensedTable(entries);

  console.log('Detailed per-handler report:');
  console.log('');
  for (const entry of entries) {
    printDetailedEntry(entry);
  }

  console.log('Summary notes:');
  console.log(`  - index 0 / raw 0x40 is the known home handler: ${hex(0x058241)}`);
  console.log('  - indexes 8/9/10 (raw 0x48/0x49/0x4A) are the strongest editor candidates from the D00824 writer map hints.');
  console.log('  - index 1 is a low-confidence STAT candidate because it lines up with the D00824=0x01 hint.');
  console.log('  - index 4 is a low-confidence graph candidate because raw 0x44 is the special NewContext path tied to GrPutAway before the home handoff.');
}

main();
