#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import(
  pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href
);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const ADL_MODE = 'adl';
const START_ADDR = 0x022331;
const WINDOW_BYTES = 400;
const WINDOW_END = START_ADDR + WINDOW_BYTES;
const PREVIEW_ROW_LIMIT = 16;

const VRAM_D4_START = 0xD40000;
const VRAM_D4_END = 0xD50000;
const LCD_MMIO_START = 0xE30000;
const LCD_MMIO_END = 0xE31000;

const KNOWN_ADDRS = new Map([
  [0x00007E, '0x00007E app-context gate byte'],
  [0xD0058E, '0xD0058E keyExtend'],
  [0xD005F8, '0xD005F8 OP1'],
  [0xD007E0, '0xD007E0 cxCurApp'],
  [0xD00824, '0xD00824 mode/status byte'],
  [0xD00826, '0xD00826 aux key/status byte'],
  [0xD0082E, '0xD0082E state buffer'],
  [0xD0227E, '0xD0227E state table'],
  [0x089F8D, '0x089F8D ROM descriptor table'],
]);

const LOCAL_ENTRY_LABELS = new Map([
  [0x022331, 'reachable entry wrapper'],
  [0x022346, 'sibling helper: table-byte wrapper'],
  [0x022359, 'reachable local descriptor builder'],
  [0x02237E, 'sibling helper: F0xx wrapper'],
  [0x022390, 'sibling helper: table copy / OP1 scratch'],
  [0x0223CE, 'sibling helper: OP1 / D00826 table path'],
  [0x022470, 'sibling helper: D0082E / D00824 path'],
  [0x0224A3, 'sibling helper: IY gate / D00824 path'],
]);

const TARGET_LABELS = new Map([
  [0x000578, 'app-context gate stub'],
  [0x0158A6, 'app-context gate body'],
  [0x022359, 'local descriptor builder'],
  [0x022470, 'local D0082E/D00824 helper'],
  [0x0224E7, 'length-prefixed copy helper'],
  [0x0236F1, 'copy-until-zero helper'],
  [0x0236F9, 'descriptor sink'],
  [0x05622E, 'A + keyExtend pack helper'],
  [0x0855B1, 'class/range classifier'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function mask24(value) {
  return Number(value) & 0xFFFFFF;
}

function bytesToHex(bytes) {
  return Array.from(
    bytes,
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatDisplacement(value) {
  const displacement = Number(value) || 0;
  return displacement < 0 ? `-${hexByte(Math.abs(displacement))}` : `+${hexByte(displacement)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${upper(indexRegister)}${formatDisplacement(displacement)})`;
}

function isInterestingAddress(value) {
  const address = mask24(value);
  return KNOWN_ADDRS.has(address)
    || (address >= VRAM_D4_START && address < VRAM_D4_END)
    || (address >= LCD_MMIO_START && address < LCD_MMIO_END);
}

function labelForTarget(target) {
  const address = mask24(target);
  if (TARGET_LABELS.has(address)) {
    return `${hex(address)} [${TARGET_LABELS.get(address)}]`;
  }
  return hex(address);
}

function annotateAddress(address) {
  const normalized = mask24(address);
  const notes = [];

  if (KNOWN_ADDRS.has(normalized)) {
    notes.push(KNOWN_ADDRS.get(normalized));
  }
  if (normalized >= VRAM_D4_START && normalized < VRAM_D4_END) {
    notes.push('VRAM reference (0xD4xxxx)');
  }
  if (normalized >= LCD_MMIO_START && normalized < LCD_MMIO_END) {
    notes.push('LCD controller reference (0xE30xxx)');
  }

  return notes;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  let text = inst.tag ?? 'unknown';
  switch (inst.tag) {
    case 'nop': text = 'NOP'; break;
    case 'halt': text = 'HALT'; break;
    case 'di': text = 'DI'; break;
    case 'ei': text = 'EI'; break;
    case 'ret': text = 'RET'; break;
    case 'reti': text = 'RETI'; break;
    case 'retn': text = 'RETN'; break;
    case 'ret-conditional': text = `RET ${upper(inst.condition)}`; break;
    case 'call': text = `CALL ${hex(inst.target)}`; break;
    case 'call-conditional': text = `CALL ${upper(inst.condition)}, ${hex(inst.target)}`; break;
    case 'jp': text = `JP ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `JP ${upper(inst.condition)}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `JP (${upper(inst.indirectRegister ?? 'HL')})`; break;
    case 'jr': text = `JR ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `JR ${upper(inst.condition)}, ${hex(inst.target)}`; break;
    case 'djnz': text = `DJNZ ${hex(inst.target)}`; break;
    case 'rst': text = `RST ${hexByte(inst.target ?? inst.vector)}`; break;
    case 'push': text = `PUSH ${upper(inst.pair)}`; break;
    case 'pop': text = `POP ${upper(inst.pair)}`; break;
    case 'ex-af': text = "EX AF, AF'"; break;
    case 'ex-de-hl': text = 'EX DE, HL'; break;
    case 'exx': text = 'EXX'; break;
    case 'ex-sp-pair': text = `EX (SP), ${upper(inst.pair)}`; break;
    case 'ld-pair-imm': text = `LD ${upper(inst.pair)}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${upper(inst.pair)}`
        : `LD ${upper(inst.pair)}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `LD (${hex(inst.addr)}), ${upper(inst.pair)}`; break;
    case 'ld-reg-imm': text = `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `LD ${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `LD (${hex(inst.addr)}), ${upper(inst.src)}`; break;
    case 'ld-reg-reg': text = `LD ${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}`; break;
    case 'ld-reg-ind': text = `LD ${upper(inst.dest ?? inst.dst)}, (${upper(inst.src ?? inst.pair)})`; break;
    case 'ld-ind-reg': text = `LD (${upper(inst.dest ?? inst.pair)}), ${upper(inst.src)}`; break;
    case 'ld-ind-imm': text = `LD (${upper(inst.pair ?? 'HL')}), ${hexByte(inst.value)}`; break;
    case 'ld-reg-ixd': text = `LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`; break;
    case 'ld-ixd-reg': text = `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`; break;
    case 'ld-ixd-imm': text = `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`; break;
    case 'ld-sp-hl': text = 'LD SP, HL'; break;
    case 'ld-sp-pair': text = `LD SP, ${upper(inst.pair ?? inst.src)}`; break;
    case 'ld-pair-indexed': text = `LD ${upper(inst.pair)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`; break;
    case 'ld-indexed-pair': text = `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`; break;
    case 'ld-pair-ind': text = `LD ${upper(inst.pair)}, (${upper(inst.src)})`; break;
    case 'inc-pair': text = `INC ${upper(inst.pair)}`; break;
    case 'dec-pair': text = `DEC ${upper(inst.pair)}`; break;
    case 'inc-reg': text = `INC ${upper(inst.reg)}`; break;
    case 'dec-reg': text = `DEC ${upper(inst.reg)}`; break;
    case 'add-pair': text = `ADD ${upper(inst.dest)}, ${upper(inst.src)}`; break;
    case 'adc-pair': text = `ADC HL, ${upper(inst.src)}`; break;
    case 'sbc-pair': text = `SBC HL, ${upper(inst.src)}`; break;
    case 'alu-reg': text = `${upper(inst.op)} ${upper(inst.src)}`; break;
    case 'alu-imm': text = `${upper(inst.op)} ${hexByte(inst.value)}`; break;
    case 'bit-test': text = `BIT ${inst.bit}, ${upper(inst.reg)}`; break;
    case 'bit-test-ind': text = `BIT ${inst.bit}, (${upper(inst.indirectRegister)})`; break;
    case 'bit-set': text = `SET ${inst.bit}, ${upper(inst.reg)}`; break;
    case 'bit-set-ind': text = `SET ${inst.bit}, (${upper(inst.indirectRegister)})`; break;
    case 'bit-res': text = `RES ${inst.bit}, ${upper(inst.reg)}`; break;
    case 'bit-res-ind': text = `RES ${inst.bit}, (${upper(inst.indirectRegister)})`; break;
    case 'indexed-cb-bit': text = `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`; break;
    case 'indexed-cb-set': text = `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`; break;
    case 'indexed-cb-res': text = `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`; break;
    case 'rotate-reg': text = `${upper(inst.op)} ${upper(inst.reg)}`; break;
    case 'rotate-ind': text = `${upper(inst.op)} (${upper(inst.indirectRegister ?? 'HL')})`; break;
    case 'indexed-cb-rotate': text = `${upper(inst.op)} ${formatIndexed(inst.indexRegister, inst.displacement)}`; break;
    case 'lea': text = `LEA ${upper(inst.dest)}, ${upper(inst.base)}${formatDisplacement(inst.displacement)}`; break;
    case 'mlt': text = `MLT ${upper(inst.reg)}`; break;
    case 'in-reg': text = `IN ${upper(inst.reg ?? inst.dest ?? 'A')}, (C)`; break;
    case 'in0': text = `IN0 ${upper(inst.dest)}, (${hexByte(inst.port)})`; break;
    case 'out-imm': text = `OUT (${hexByte(inst.port)}), A`; break;
    case 'ldi': text = 'LDI'; break;
    case 'ldir': text = 'LDIR'; break;
    case 'ldd': text = 'LDD'; break;
    case 'lddr': text = 'LDDR'; break;
    case 'cpi': text = 'CPI'; break;
    case 'cpir': text = 'CPIR'; break;
    case 'cpd': text = 'CPD'; break;
    case 'cpdr': text = 'CPDR'; break;
    case 'ini': text = 'INI'; break;
    case 'inir': text = 'INIR'; break;
    case 'ind': text = 'IND'; break;
    case 'indr': text = 'INDR'; break;
    case 'outi': text = 'OUTI'; break;
    case 'otir': text = 'OTIR'; break;
    case 'outd': text = 'OUTD'; break;
    case 'otdr': text = 'OTDR'; break;
    case 'rla': text = 'RLA'; break;
    case 'rra': text = 'RRA'; break;
    case 'rlca': text = 'RLCA'; break;
    case 'rrca': text = 'RRCA'; break;
    case 'scf': text = 'SCF'; break;
    case 'ccf': text = 'CCF'; break;
    case 'daa': text = 'DAA'; break;
    case 'cpl': text = 'CPL'; break;
    default: {
      const detail = { ...inst };
      delete detail.pc;
      delete detail.length;
      delete detail.nextPc;
      delete detail.mode;
      delete detail.modePrefix;
      delete detail.terminates;
      delete detail.fallthrough;
      text = `${upper(inst.tag ?? 'UNKNOWN')} ${JSON.stringify(detail)}`;
      break;
    }
  }

  return `${prefix}${text}`;
}

function decodeRow(pc) {
  try {
    const inst = decodeInstruction(rom, pc, ADL_MODE);
    const length = Math.max(1, inst?.length ?? 1);
    return {
      pc,
      inst,
      length,
      nextPc: pc + length,
      bytes: bytesToHex(rom.subarray(pc, pc + length)),
      text: inst ? formatInstruction(inst) : `DB ${hexByte(rom[pc] ?? 0)}`,
    };
  } catch (error) {
    return {
      pc,
      inst: null,
      length: 1,
      nextPc: pc + 1,
      bytes: bytesToHex(rom.subarray(pc, pc + 1)),
      text: `DB ${hexByte(rom[pc] ?? 0)} ; decode error: ${error.message}`,
    };
  }
}

function buildSequentialWindow(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    const row = decodeRow(pc);
    rows.push(row);
    pc = row.nextPc > pc ? row.nextPc : pc + 1;
  }
  return rows;
}

function buildPreview(startPc, maxRows = PREVIEW_ROW_LIMIT) {
  const rows = [];
  const seen = new Set();
  let pc = startPc;

  while (rows.length < maxRows && pc >= 0 && pc < rom.length && !seen.has(pc)) {
    seen.add(pc);
    const row = decodeRow(pc);
    rows.push(row);

    const tag = row.inst?.tag;
    if (
      tag === 'ret'
      || tag === 'reti'
      || tag === 'retn'
      || tag === 'jp'
      || tag === 'jp-indirect'
      || tag === 'jr'
      || tag === 'halt'
    ) {
      break;
    }

    pc = row.nextPc;
  }

  return rows;
}

function walkReachableBlocks(start, end) {
  const queue = [start];
  const seenBlockStarts = new Set();
  const externalTargets = new Set();
  const blocks = [];

  function queueLocal(target) {
    const normalized = mask24(target);
    if (normalized >= start && normalized < end) {
      queue.push(normalized);
    } else {
      externalTargets.add(normalized);
    }
  }

  while (queue.length > 0) {
    const blockStart = queue.shift();
    if (blockStart < start || blockStart >= end || seenBlockStarts.has(blockStart)) {
      continue;
    }
    seenBlockStarts.add(blockStart);

    const rows = [];
    const seenPcs = new Set();
    let pc = blockStart;
    let done = false;

    while (!done && pc < end && !seenPcs.has(pc)) {
      seenPcs.add(pc);
      const row = decodeRow(pc);
      rows.push(row);

      if (!row.inst) {
        pc = row.nextPc;
        continue;
      }

      const { inst } = row;
      switch (inst.tag) {
        case 'call':
          queueLocal(inst.target);
          pc = row.nextPc;
          break;

        case 'call-conditional':
          queueLocal(inst.target);
          pc = row.nextPc;
          break;

        case 'jr-conditional':
        case 'jp-conditional':
        case 'djnz':
          queueLocal(inst.target);
          queueLocal(row.nextPc);
          done = true;
          break;

        case 'jr':
        case 'jp':
          queueLocal(inst.target);
          done = true;
          break;

        case 'ret-conditional':
          queueLocal(row.nextPc);
          done = true;
          break;

        case 'ret':
        case 'reti':
        case 'retn':
        case 'jp-indirect':
        case 'halt':
          done = true;
          break;

        default:
          pc = row.nextPc;
          break;
      }
    }

    blocks.push({ start: blockStart, rows });
  }

  blocks.sort((a, b) => a.start - b.start);
  return { blocks, externalTargets: Array.from(externalTargets).sort((a, b) => a - b) };
}

function rowNotes(row) {
  const notes = [];
  const inst = row.inst;

  if (!inst) return notes;

  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    notes.push(`CP compare against ${hexByte(inst.value)}`);
    if (inst.value === 0xDA) {
      notes.push('THIS WOULD BE a direct CLEAR-token compare');
    }
  }

  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    notes.push(`call target ${labelForTarget(inst.target)}`);
  }

  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    notes.push(`jump target ${labelForTarget(inst.target)}`);
  }

  if (inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
    notes.push(`branch target ${hex(inst.target)}`);
  }

  if (inst.addr != null) {
    notes.push(...annotateAddress(inst.addr));
  }

  if (inst.tag === 'ld-pair-imm' && isInterestingAddress(inst.value)) {
    notes.push(...annotateAddress(inst.value));
  }

  if (row.pc === 0x022331) {
    notes.push('entry used by CoorMon after A is loaded with a token such as CLEAR=0xDA');
  }
  if (row.pc === 0x022359) {
    notes.push('builds the trailing 3 bytes of a 6-byte descriptor before CALL 0x0236F9');
  }
  if (row.pc === 0x022375) {
    notes.push('hands descriptor start (IX-6) to 0x0236F9');
  }
  if (row.pc === 0x02240E) {
    notes.push('LDIR copy of 9 bytes from OP1 (0xD005F8) into stack local scratch');
  }
  if (row.pc === 0x02243F) {
    notes.push('LDIR restore of 9 bytes from stack local scratch back into OP1');
  }
  if (row.pc === 0x022446) {
    notes.push('sibling helper checks local byte against 0x55');
  }
  if (row.pc === 0x02244D) {
    notes.push('sibling helper checks local byte against 0x03');
  }
  if (row.pc === 0x0224F1) {
    notes.push('length-prefixed block copy');
  }
  if (row.pc === 0x0224F3) {
    notes.push('SUB A clears A to 0x00 before writing a trailing terminator');
  }
  if (row.pc === 0x0158AC) {
    notes.push('gate compares the ROM-backed byte at 0x00007E against 0xFF');
  }
  if (row.pc === 0x056239) {
    notes.push('special-case check for 0xFE token marker');
  }
  if (row.pc === 0x05623D) {
    notes.push('special-case check for 0xFC token marker');
  }
  if (row.pc === 0x0236F9) {
    notes.push('descriptor sink entry');
  }
  if (row.pc === 0x0236FC) {
    notes.push('stores cxCurApp into descriptor byte 1');
  }
  if (row.pc === 0x023702) {
    notes.push('branches on cxCurApp == 0x4E before pulling D0058E into descriptor byte 2');
  }

  return notes;
}

function printRows(rows, options = {}) {
  const indent = options.indent ?? '';
  const labelMap = options.labelMap ?? null;

  for (const row of rows) {
    if (labelMap && labelMap.has(row.pc)) {
      console.log(`${indent}[${labelMap.get(row.pc)}]`);
    }
    const noteText = rowNotes(row);
    const suffix = noteText.length > 0 ? ` ; ${noteText.join(' | ')}` : '';
    console.log(
      `${indent}${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${suffix}`,
    );
  }
}

function flattenRows(blocksOrPreviews) {
  return blocksOrPreviews.flatMap((item) => item.rows ?? item);
}

function collectCpRows(rows) {
  return rows.filter((row) => row.inst?.tag === 'alu-imm' && row.inst.op === 'cp');
}

function collectCallRows(rows) {
  return rows.filter((row) => row.inst?.tag === 'call' || row.inst?.tag === 'call-conditional');
}

const sequentialRows = buildSequentialWindow(START_ADDR, WINDOW_END);
const reachable = walkReachableBlocks(START_ADDR, WINDOW_END);

const previewTargets = [
  0x000578,
  0x0158A6,
  0x05622E,
  0x0236F9,
].filter((target) => {
  if (target === 0x0158A6) {
    return reachable.externalTargets.includes(0x000578);
  }
  return reachable.externalTargets.includes(target);
});

const previews = previewTargets.map((target) => ({
  target,
  label: TARGET_LABELS.get(target) ?? 'external preview',
  rows: buildPreview(target),
}));

const reachableRows = flattenRows(reachable.blocks);
const previewRows = flattenRows(previews);
const reachableAndPreviewCpRows = collectCpRows([...reachableRows, ...previewRows]);
const localWindowCpRows = collectCpRows(sequentialRows);
const reachableCallRows = collectCallRows(reachableRows);

const hasCpDaAnywhere = [...localWindowCpRows, ...reachableAndPreviewCpRows].some(
  (row) => row.inst?.value === 0xDA,
);

console.log('Phase 295 - 0x022331 CoorMon dispatch trace');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Window: ${hex(START_ADDR)} .. ${hex(WINDOW_END - 1)} (${WINDOW_BYTES} bytes)`);
console.log('');
console.log('## Determination');
console.log(`- CP 0xDA present in 0x022331 path: ${hasCpDaAnywhere ? 'YES' : 'NO'}`);
console.log('- 0x022331 does not directly clear VRAM or touch LCD MMIO.');
console.log('- 0x022331 first calls the 0x000578 gate; when that gate is open, it forwards the token into 0x05622E and then into the local descriptor builder 0x022359.');
console.log('- 0x022359 + 0x0236F9 build a 6-byte descriptor: the local helper stores [L, H, IY+0x12], and 0x0236F9 prepends [0x01, cxCurApp, maybe D0058E].');
console.log('- For CLEAR specifically, A arrives as 0xDA, but 0x05622E only checks 0xFE and 0xFC. So 0xDA is not dispatched here; it is merely packaged.');
console.log('- Conclusion: 0x022331 is a generic token/descriptor handoff helper. The actual CLEAR action must happen later, after return to CoorMon and downstream dispatch.');

console.log('\n## Reachable Walk From 0x022331');
for (const block of reachable.blocks) {
  const label = LOCAL_ENTRY_LABELS.get(block.start) ?? 'local block';
  console.log(`\n[block ${hex(block.start)} - ${label}]`);
  printRows(block.rows, { indent: '  ' });
}

console.log('\n## Full Local 400-byte Window');
printRows(sequentialRows, { labelMap: LOCAL_ENTRY_LABELS });

console.log('\n## External Call Previews');
for (const preview of previews) {
  console.log(`\n[${hex(preview.target)} - ${preview.label}]`);
  printRows(preview.rows, { indent: '  ' });
}

console.log('\n## CP Summary');
if (reachableAndPreviewCpRows.length === 0) {
  console.log('- No CP-immediate instructions were found in the reachable path or its key external previews.');
} else {
  for (const row of reachableAndPreviewCpRows) {
    console.log(`- ${hex(row.pc)}  ${row.text}`);
  }
}
console.log('- Extra CPs inside the surrounding 400-byte cluster (sibling helpers):');
for (const row of localWindowCpRows) {
  if (reachableAndPreviewCpRows.some((reachableRow) => reachableRow.pc === row.pc)) {
    continue;
  }
  console.log(`  - ${hex(row.pc)}  ${row.text}`);
}
console.log(`- Direct CLEAR-token compare (CP 0xDA) found anywhere in the scanned local cluster or previews: ${hasCpDaAnywhere ? 'YES' : 'NO'}`);

console.log('\n## CALL Summary');
for (const row of reachableCallRows) {
  console.log(`- ${hex(row.pc)}  ${row.text} -> ${labelForTarget(row.inst.target)}`);
}

console.log('\n## VRAM / LCD References');
const vramOrLcdRows = [...sequentialRows, ...previewRows].filter((row) => {
  const addr = row.inst?.addr;
  if (addr == null) return false;
  const normalized = mask24(addr);
  return (normalized >= VRAM_D4_START && normalized < VRAM_D4_END)
    || (normalized >= LCD_MMIO_START && normalized < LCD_MMIO_END);
});
if (vramOrLcdRows.length === 0) {
  console.log('- None. No 0xD4xxxx VRAM or 0xE30xxx LCD-controller references appear in this helper cluster or its key callees.');
} else {
  for (const row of vramOrLcdRows) {
    console.log(`- ${hex(row.pc)}  ${row.text}`);
  }
}

console.log('\n## Memory Copy / Clear Notes');
console.log('- 0x02240E LDIR copies 9 bytes from OP1 (0xD005F8) into local scratch.');
console.log('- 0x02243F LDIR copies those 9 bytes back into OP1.');
console.log('- 0x0224F1 LDIR performs a length-prefixed copy; 0x0224F3 then clears A and 0x0224F4 stores a 0x00 terminator.');
console.log('- No VRAM fill, RAM clear, or LCD-clear pattern appears in 0x022331 itself.');
