#!/usr/bin/env node

/**
 * Phase 25AG — Static disassembly of CoorMon dispatch path
 *
 * Disassembles:
 *   1. CoorMon (0x08C331) — main OS event loop / dispatch
 *   2. Home-screen handler (0x058241) — where CoorMon dispatches for home screen
 *   3. RAM CLEAR (0x001881) — the destructive path reached on bad dispatch
 *
 * Also scans for byte references to 0x001881 in the CoorMon region.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH = path.join(__dirname, 'phase25ag-coormon-dispatch-disasm-report.md');

const ADL_MODE = 'adl';

// ── Key addresses ──────────────────────────────────────────────────────────
const COORMON_ADDR      = 0x08C331;
const COORMON_BYTES     = 0x300;  // ~768 bytes — full dispatch including 0x08C509+ continuation
const GETCSSC_ADDR      = 0x03FA09;
const PARSEINP_ADDR     = 0x099914;
const RAM_CLEAR_ADDR    = 0x001881;
const CX_MAIN_ADDR      = 0xD007CA;  // 3-byte pointer to app handler
const CX_CUR_APP_ADDR   = 0xD007E0;  // 1-byte current app ID
const HOME_HANDLER_ADDR = 0x058241;
const HOME_HANDLER_BYTES = 0x100;  // 256 bytes
const RAM_CLEAR_WINDOW   = 0x80;   // 128 bytes around RAM CLEAR
const NEW_CONTEXT_ADDR  = 0x08C79F;
const NEW_CONTEXT0_ADDR = 0x08C7AD;
const COORMON_DISPATCH  = 0x08C72F;  // dispatch subroutine called from CoorMon

// ── Helpers ────────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesFor(buffer, pc, length) {
  return Array.from(
    buffer.slice(pc, pc + length),
    (v) => v.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (v) => (v >= 0 ? `+${v}` : `${v}`);

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
    case 'ld-sp-pair': text = `ld sp, ${inst.src}`; break;
    case 'ld-a-ind-bc': text = 'ld a, (bc)'; break;
    case 'ld-a-ind-de': text = 'ld a, (de)'; break;
    case 'ld-ind-bc-a': text = 'ld (bc), a'; break;
    case 'ld-ind-de-a': text = 'ld (de), a'; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'inc-ind': text = `inc (${inst.indirectRegister})`; break;
    case 'dec-ind': text = `dec (${inst.indirectRegister})`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'alu-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
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
    case 'rotate': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'indexed-cb-rotate': text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'in-a-imm': text = `in a, (${hex(inst.port, 2)})`; break;
    case 'out-imm-a': text = `out (${hex(inst.port, 2)}), a`; break;
    case 'in-reg': text = `in ${inst.dest}, (c)`; break;
    case 'out-reg': text = `out (c), ${inst.src}`; break;
    case 'im': text = `im ${inst.mode_num}`; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-r-a': text = 'ld r, a'; break;
    case 'ld-a-r': text = 'ld a, r'; break;
    case 'ini': text = 'ini'; break;
    case 'ind': text = 'ind'; break;
    case 'inir': text = 'inir'; break;
    case 'indr': text = 'indr'; break;
    case 'outi': text = 'outi'; break;
    case 'outd': text = 'outd'; break;
    case 'otir': text = 'otir'; break;
    case 'otdr': text = 'otdr'; break;
    default: {
      const detail = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(key)) continue;
        detail.push(`${key}=${typeof value === 'number' ? hex(value) : value}`);
      }
      text = detail.length > 0 ? `${inst.tag} ${detail.join(' ')}` : inst.tag;
      break;
    }
  }

  return `${prefix}${text}`;
}

async function loadDecoder() {
  const decoderSource = fs.readFileSync(DECODER_PATH, 'utf8');
  const decoderUrl = `data:text/javascript;base64,${Buffer.from(decoderSource).toString('base64')}`;
  return import(decoderUrl);
}

function disassembleWindow(buffer, decodeInstruction, startAddr, byteCount) {
  const rows = [];
  let pc = startAddr;
  const end = startAddr + byteCount;

  while (pc < end) {
    const inst = decodeInstruction(buffer, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      rows.push({ pc, bytes: bytesFor(buffer, pc, 1), text: `DB ${hex(buffer[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }

    rows.push({
      pc: inst.pc,
      bytes: bytesFor(buffer, inst.pc, inst.length),
      text: formatInstruction(inst),
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

function scanBytePattern(buffer, pattern, start, end) {
  const hits = [];
  const limit = Math.min(end, buffer.length) - pattern.length;
  for (let i = start; i <= limit; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (buffer[i + j] !== pattern[j]) { match = false; break; }
    }
    if (match) hits.push(i);
  }
  return hits;
}

function annotateRow(row) {
  if (!row.inst) return '';
  const inst = row.inst;

  // Known address annotations
  const annotations = [];

  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    if (inst.target === GETCSSC_ADDR) annotations.push('<-- GetCSC');
    if (inst.target === PARSEINP_ADDR) annotations.push('<-- ParseInp');
    if (inst.target === RAM_CLEAR_ADDR) annotations.push('<-- RAM CLEAR!');
    if (inst.target === COORMON_ADDR) annotations.push('<-- CoorMon (recursive)');
    if (inst.target === HOME_HANDLER_ADDR) annotations.push('<-- home-screen handler');
    if (inst.target === NEW_CONTEXT_ADDR) annotations.push('<-- NewContext');
    if (inst.target === NEW_CONTEXT0_ADDR) annotations.push('<-- NewContext0');
    if (inst.target === COORMON_DISPATCH) annotations.push('<-- CoorMon dispatch sub');
  }

  if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    if (inst.target === GETCSSC_ADDR) annotations.push('<-- GetCSC');
    if (inst.target === PARSEINP_ADDR) annotations.push('<-- ParseInp');
    if (inst.target === RAM_CLEAR_ADDR) annotations.push('<-- RAM CLEAR!');
    if (inst.target === COORMON_ADDR) annotations.push('<-- CoorMon (loop back)');
    if (inst.target === HOME_HANDLER_ADDR) annotations.push('<-- home-screen handler');
    if (inst.target === NEW_CONTEXT_ADDR) annotations.push('<-- NewContext');
    if (inst.target === NEW_CONTEXT0_ADDR) annotations.push('<-- NewContext0');
  }

  if (inst.tag === 'jp-indirect') {
    annotations.push(`<-- dispatch via (${inst.indirectRegister})`);
  }

  // Memory references to known addresses
  if (inst.addr === CX_MAIN_ADDR || inst.value === CX_MAIN_ADDR) {
    annotations.push('<-- cxMain');
  }
  if (inst.addr === CX_CUR_APP_ADDR || inst.value === CX_CUR_APP_ADDR) {
    annotations.push('<-- cxCurApp');
  }

  return annotations.length > 0 ? `  ; ${annotations.join(', ')}` : '';
}

function printDisassembly(title, rows) {
  console.log(`\n=== ${title} ===\n`);
  for (const row of rows) {
    const annotation = annotateRow(row);
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${annotation}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { decodeInstruction } = await loadDecoder();

  // 1. Disassemble CoorMon
  console.log('Phase 25AG — CoorMon Dispatch Disassembly');
  console.log('=========================================\n');

  const coormonRows = disassembleWindow(rom, decodeInstruction, COORMON_ADDR, COORMON_BYTES);
  printDisassembly(`CoorMon (${hex(COORMON_ADDR)}) — ${COORMON_BYTES} bytes`, coormonRows);

  // 2. Disassemble home-screen handler
  const homeRows = disassembleWindow(rom, decodeInstruction, HOME_HANDLER_ADDR, HOME_HANDLER_BYTES);
  printDisassembly(`Home-screen handler (${hex(HOME_HANDLER_ADDR)}) — ${HOME_HANDLER_BYTES} bytes`, homeRows);

  // 3. Disassemble CoorMon dispatch subroutine at 0x08C72F
  const dispatchRows = disassembleWindow(rom, decodeInstruction, COORMON_DISPATCH, 0x70);
  printDisassembly(`CoorMon dispatch sub (${hex(COORMON_DISPATCH)}) — 0x70 bytes`, dispatchRows);

  // 4. Disassemble RAM CLEAR region
  const clearStart = RAM_CLEAR_ADDR - 0x30;
  const clearRows = disassembleWindow(rom, decodeInstruction, clearStart, RAM_CLEAR_WINDOW);
  printDisassembly(`RAM CLEAR region (${hex(clearStart)} to ${hex(clearStart + RAM_CLEAR_WINDOW)})`, clearRows);

  // 4. Search for byte references to 0x001881 in CoorMon region
  // In LE: 0x81, 0x18, 0x00
  console.log('\n=== Byte-pattern scan for 0x001881 references ===\n');

  const pattern = [0x81, 0x18, 0x00];
  const coormonHits = scanBytePattern(rom, pattern, 0x08C300, 0x08C500);
  console.log(`Scan range: 0x08C300 - 0x08C500`);
  console.log(`Pattern: [81 18 00] (LE encoding of 0x001881)`);
  console.log(`Hits: ${coormonHits.length}`);
  for (const addr of coormonHits) {
    // Show context: 2 bytes before and 3 bytes after
    const ctx = bytesFor(rom, Math.max(0, addr - 2), 8);
    console.log(`  ${hex(addr)}: ...${ctx}...`);
    // Check if preceded by CALL (0xCD) or JP (0xC3)
    if (addr >= 1) {
      const prevByte = rom[addr - 1];
      if (prevByte === 0xCD) console.log(`    ^ preceded by CALL opcode (0xCD) at ${hex(addr - 1)}`);
      if (prevByte === 0xC3) console.log(`    ^ preceded by JP opcode (0xC3) at ${hex(addr - 1)}`);
      // Conditional JP: C2 (NZ), CA (Z), D2 (NC), DA (C)
      if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(prevByte)) {
        console.log(`    ^ preceded by conditional JP opcode (${hex(prevByte, 2)}) at ${hex(addr - 1)}`);
      }
      // Conditional CALL: C4 (NZ), CC (Z), D4 (NC), DC (C)
      if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(prevByte)) {
        console.log(`    ^ preceded by conditional CALL opcode (${hex(prevByte, 2)}) at ${hex(addr - 1)}`);
      }
    }
  }

  // Also scan wider ROM for CALL/JP to 0x001881
  console.log('\n=== Wider ROM scan: CALL/JP to 0x001881 ===\n');
  const callPattern = [0xCD, 0x81, 0x18, 0x00];
  const jpPattern = [0xC3, 0x81, 0x18, 0x00];
  const callHits = scanBytePattern(rom, callPattern, 0, rom.length);
  const jpHits = scanBytePattern(rom, jpPattern, 0, rom.length);
  console.log(`CALL 0x001881 hits: ${callHits.length} at ${callHits.map(a => hex(a)).join(', ') || '(none)'}`);
  console.log(`JP 0x001881 hits: ${jpHits.length} at ${jpHits.map(a => hex(a)).join(', ') || '(none)'}`);

  // 5. Identify key features in CoorMon disassembly
  console.log('\n=== Key features identified in CoorMon ===\n');

  const keyFeatures = {
    getCSCCalls: [],
    cxMainReads: [],
    cxCurAppReads: [],
    indirectJumps: [],
    indirectCalls: [],
    ramClearRefs: [],
    parseInpRefs: [],
    callTargets: [],
  };

  for (const row of coormonRows) {
    if (!row.inst) continue;
    const inst = row.inst;

    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target === GETCSSC_ADDR) {
      keyFeatures.getCSCCalls.push(row.pc);
    }
    if (inst.addr === CX_MAIN_ADDR) {
      keyFeatures.cxMainReads.push({ pc: row.pc, text: row.text });
    }
    if (inst.addr === CX_CUR_APP_ADDR) {
      keyFeatures.cxCurAppReads.push({ pc: row.pc, text: row.text });
    }
    if (inst.tag === 'jp-indirect') {
      keyFeatures.indirectJumps.push({ pc: row.pc, reg: inst.indirectRegister });
    }
    if (inst.tag === 'call-indirect') {
      keyFeatures.indirectCalls.push({ pc: row.pc, reg: inst.indirectRegister });
    }
    if ((inst.tag === 'call' || inst.tag === 'jp') && inst.target === RAM_CLEAR_ADDR) {
      keyFeatures.ramClearRefs.push(row.pc);
    }
    if ((inst.tag === 'call' || inst.tag === 'jp') && inst.target === PARSEINP_ADDR) {
      keyFeatures.parseInpRefs.push(row.pc);
    }
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      keyFeatures.callTargets.push({ pc: row.pc, target: inst.target, text: row.text });
    }
  }

  console.log(`GetCSC calls: ${keyFeatures.getCSCCalls.map(a => hex(a)).join(', ') || '(none)'}`);
  console.log(`cxMain (0xD007CA) references: ${keyFeatures.cxMainReads.length}`);
  for (const r of keyFeatures.cxMainReads) console.log(`  ${hex(r.pc)}: ${r.text}`);
  console.log(`cxCurApp (0xD007E0) references: ${keyFeatures.cxCurAppReads.length}`);
  for (const r of keyFeatures.cxCurAppReads) console.log(`  ${hex(r.pc)}: ${r.text}`);
  console.log(`Indirect jumps (JP (HL) etc.): ${keyFeatures.indirectJumps.length}`);
  for (const r of keyFeatures.indirectJumps) console.log(`  ${hex(r.pc)}: jp (${r.reg})`);
  console.log(`RAM CLEAR refs: ${keyFeatures.ramClearRefs.map(a => hex(a)).join(', ') || '(none)'}`);
  console.log(`ParseInp refs: ${keyFeatures.parseInpRefs.map(a => hex(a)).join(', ') || '(none)'}`);

  console.log('\nAll CALL targets from CoorMon:');
  for (const c of keyFeatures.callTargets) {
    console.log(`  ${hex(c.pc)}: ${c.text}`);
  }

  // 6. Same analysis for home-screen handler
  console.log('\n=== Key features in home-screen handler ===\n');

  for (const row of homeRows) {
    if (!row.inst) continue;
    const inst = row.inst;
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      let note = '';
      if (inst.target === PARSEINP_ADDR) note = ' <-- ParseInp!';
      if (inst.target === GETCSSC_ADDR) note = ' <-- GetCSC';
      console.log(`  CALL at ${hex(row.pc)}: target=${hex(inst.target)}${note}`);
    }
    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      let note = '';
      if (inst.target === PARSEINP_ADDR) note = ' <-- ParseInp!';
      console.log(`  JP at ${hex(row.pc)}: target=${hex(inst.target)}${note}`);
    }
    if (inst.tag === 'jp-indirect') {
      console.log(`  JP (${inst.indirectRegister}) at ${hex(row.pc)} <-- indirect dispatch`);
    }
    if (inst.addr === CX_MAIN_ADDR || inst.addr === CX_CUR_APP_ADDR) {
      console.log(`  Memory ref at ${hex(row.pc)}: ${row.text}`);
    }
  }

  // ── Build report ─────────────────────────────────────────────────────────
  const lines = [];
  lines.push('# Phase 25AG — CoorMon Dispatch Path Disassembly');
  lines.push('');
  lines.push('Generated by `probe-phase25ag-coormon-dispatch-disasm.mjs` from raw `ROM.rom` bytes.');
  lines.push('');

  lines.push('## Summary');
  lines.push('');
  lines.push('| Item | Detail |');
  lines.push('| --- | --- |');
  lines.push(`| GetCSC calls in CoorMon | ${keyFeatures.getCSCCalls.map(a => hex(a)).join(', ') || 'none'} |`);
  lines.push(`| cxMain reads | ${keyFeatures.cxMainReads.map(r => hex(r.pc)).join(', ') || 'none'} |`);
  lines.push(`| cxCurApp reads | ${keyFeatures.cxCurAppReads.map(r => hex(r.pc)).join(', ') || 'none'} |`);
  lines.push(`| Indirect jumps | ${keyFeatures.indirectJumps.map(r => `${hex(r.pc)} via (${r.reg})`).join(', ') || 'none'} |`);
  lines.push(`| CALL/JP to RAM CLEAR (0x001881) | ${[...callHits, ...jpHits].map(a => hex(a)).join(', ') || 'none in whole ROM'} |`);
  lines.push('');

  // Disassembly sections
  function renderSection(title, rows) {
    lines.push(`## ${title}`);
    lines.push('');
    lines.push('```text');
    for (const row of rows) {
      const ann = annotateRow(row);
      lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${ann}`);
    }
    lines.push('```');
    lines.push('');
  }

  renderSection(`CoorMon (${hex(COORMON_ADDR)}, ${COORMON_BYTES} bytes)`, coormonRows);
  renderSection(`CoorMon dispatch sub (${hex(COORMON_DISPATCH)}, 0x70 bytes)`, dispatchRows);
  renderSection(`Home-screen handler (${hex(HOME_HANDLER_ADDR)}, ${HOME_HANDLER_BYTES} bytes)`, homeRows);
  renderSection(`RAM CLEAR region (${hex(clearStart)})`, clearRows);

  lines.push('## Byte-pattern scan for 0x001881');
  lines.push('');
  lines.push(`- Pattern [81 18 00] in CoorMon region (0x08C300-0x08C500): ${coormonHits.length} hits`);
  for (const addr of coormonHits) {
    lines.push(`  - ${hex(addr)}`);
  }
  lines.push(`- CALL 0x001881 in full ROM: ${callHits.length} hits at ${callHits.map(a => hex(a)).join(', ') || 'none'}`);
  lines.push(`- JP 0x001881 in full ROM: ${jpHits.length} hits at ${jpHits.map(a => hex(a)).join(', ') || 'none'}`);
  lines.push('');

  lines.push('## Analysis');
  lines.push('');
  lines.push('_(see probe output for detailed analysis)_');
  lines.push('');

  const report = lines.join('\n') + '\n';
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\nWrote report: ${REPORT_PATH}`);
}

await main();
