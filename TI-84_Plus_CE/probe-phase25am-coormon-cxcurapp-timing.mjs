#!/usr/bin/env node

/**
 * Phase 25AM — CoorMon cxCurApp Read Timing
 *
 * Question: Does CoorMon read cxCurApp (0xD007E0) BEFORE or AFTER
 * the JP (HL) dispatch at 0x08C745?
 *
 * Statically disassembles:
 *   1. CoorMon entry (0x08C331) through the dispatch sub call
 *   2. Dispatch sub (0x08C72F) through JP (HL) at 0x08C745
 *   3. Each cxCurApp read site (0x08C408, 0x08C4C7, 0x08C59C, 0x08C5C8, 0x08C5E7)
 *   4. CoorMon loop-back structure — where does control go after handler returns?
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const ADL_MODE = 'adl';

// ── Key addresses ──────────────────────────────────────────────────────────
const COORMON_ENTRY     = 0x08C331;
const COORMON_DISPATCH  = 0x08C72F;  // dispatch subroutine
const JP_HL_ADDR        = 0x08C745;  // JP (HL) inside dispatch sub
const CX_MAIN_ADDR      = 0xD007CA;  // 3-byte pointer to app handler
const CX_CUR_APP_ADDR   = 0xD007E0;  // 1-byte current app ID
const KEY_DISPATCH_ADDR  = 0x08C536;  // main key dispatch

// cxCurApp read sites identified in session 92
const CX_CUR_APP_SITES = [0x08C408, 0x08C4C7, 0x08C59C, 0x08C5C8, 0x08C5E7];

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

function annotateRow(row) {
  if (!row.inst) return '';
  const inst = row.inst;
  const annotations = [];

  if (inst.tag === 'jp-indirect') {
    annotations.push(`<-- DISPATCH via (${inst.indirectRegister})`);
  }

  // Memory references to known addresses
  if (inst.addr === CX_MAIN_ADDR || inst.value === CX_MAIN_ADDR) {
    annotations.push('<-- cxMain (0xD007CA)');
  }
  if (inst.addr === CX_CUR_APP_ADDR || inst.value === CX_CUR_APP_ADDR) {
    annotations.push('<-- cxCurApp (0xD007E0)');
  }

  // Jump/call targets of interest
  if (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'jp' || inst.tag === 'jp-conditional') {
    if (inst.target === COORMON_ENTRY) annotations.push('<-- CoorMon entry');
    if (inst.target === COORMON_DISPATCH) annotations.push('<-- dispatch sub');
    if (inst.target === KEY_DISPATCH_ADDR) annotations.push('<-- key dispatch');
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

// ── Analysis helpers ──────────────────────────────────────────────────────

function findCxCurAppRefsInRows(rows) {
  const refs = [];
  for (const row of rows) {
    if (!row.inst) continue;
    if (row.inst.addr === CX_CUR_APP_ADDR || row.inst.value === CX_CUR_APP_ADDR) {
      refs.push(row);
    }
  }
  return refs;
}

function findCxMainRefsInRows(rows) {
  const refs = [];
  for (const row of rows) {
    if (!row.inst) continue;
    if (row.inst.addr === CX_MAIN_ADDR || row.inst.value === CX_MAIN_ADDR) {
      refs.push(row);
    }
  }
  return refs;
}

function findJpIndirectInRows(rows) {
  const refs = [];
  for (const row of rows) {
    if (!row.inst) continue;
    if (row.inst.tag === 'jp-indirect') {
      refs.push(row);
    }
  }
  return refs;
}

function findBranchTargets(rows) {
  const targets = [];
  for (const row of rows) {
    if (!row.inst) continue;
    const tag = row.inst.tag;
    if (tag === 'jp' || tag === 'jp-conditional' || tag === 'jr' || tag === 'jr-conditional' ||
        tag === 'call' || tag === 'call-conditional' || tag === 'djnz') {
      targets.push({ pc: row.pc, tag, target: row.inst.target, condition: row.inst.condition });
    }
    if (tag === 'ret' || tag === 'ret-conditional') {
      targets.push({ pc: row.pc, tag, condition: row.inst.condition });
    }
  }
  return targets;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { decodeInstruction } = await loadDecoder();

  console.log('Phase 25AM — CoorMon cxCurApp Read Timing Analysis');
  console.log('===================================================\n');
  console.log('Question: Is cxCurApp (0xD007E0) read BEFORE or AFTER JP (HL) at 0x08C745?\n');

  // ── 1. Full CoorMon from entry to beyond key dispatch ────────────────
  console.log('────────────────────────────────────────────────────────────────');
  console.log('SECTION 1: CoorMon main body (0x08C331 - 0x08C631, 768 bytes)');
  console.log('────────────────────────────────────────────────────────────────');

  const coormonRows = disassembleWindow(rom, decodeInstruction, COORMON_ENTRY, 0x300);
  printDisassembly(`CoorMon main body (${hex(COORMON_ENTRY)})`, coormonRows);

  // ── 2. Dispatch subroutine ───────────────────────────────────────────
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('SECTION 2: Dispatch subroutine (0x08C72F - 0x08C79F, 112 bytes)');
  console.log('────────────────────────────────────────────────────────────────');

  const dispatchRows = disassembleWindow(rom, decodeInstruction, COORMON_DISPATCH, 0x70);
  printDisassembly(`Dispatch sub (${hex(COORMON_DISPATCH)})`, dispatchRows);

  // ── 3. Context around each cxCurApp read site ────────────────────────
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('SECTION 3: Context around each cxCurApp read site (30 bytes each)');
  console.log('────────────────────────────────────────────────────────────────');

  for (const site of CX_CUR_APP_SITES) {
    const contextRows = disassembleWindow(rom, decodeInstruction, site, 30);
    printDisassembly(`cxCurApp read site at ${hex(site)}`, contextRows);
  }

  // ── 4. Analysis: ordering ────────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('ANALYSIS: Instruction ordering');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Find all cxCurApp refs in the main CoorMon body
  const mainCxCurAppRefs = findCxCurAppRefsInRows(coormonRows);
  console.log(`cxCurApp (0xD007E0) references in CoorMon main body (${hex(COORMON_ENTRY)} - ${hex(COORMON_ENTRY + 0x300)}):`);
  for (const r of mainCxCurAppRefs) {
    console.log(`  ${hex(r.pc)}: ${r.text}`);
  }

  // Find all cxMain refs in the main CoorMon body
  const mainCxMainRefs = findCxMainRefsInRows(coormonRows);
  console.log(`\ncxMain (0xD007CA) references in CoorMon main body:`);
  for (const r of mainCxMainRefs) {
    console.log(`  ${hex(r.pc)}: ${r.text}`);
  }

  // Find all cxMain refs in dispatch sub
  const dispCxMainRefs = findCxMainRefsInRows(dispatchRows);
  console.log(`\ncxMain (0xD007CA) references in dispatch sub (${hex(COORMON_DISPATCH)}):`);
  for (const r of dispCxMainRefs) {
    console.log(`  ${hex(r.pc)}: ${r.text}`);
  }

  // Find JP (HL) in dispatch sub
  const dispJpHL = findJpIndirectInRows(dispatchRows);
  console.log(`\nJP (HL) in dispatch sub:`);
  for (const r of dispJpHL) {
    console.log(`  ${hex(r.pc)}: ${r.text}`);
  }

  // ── 5. Determine ordering ───────────────────────────────────────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('ORDERING DETERMINATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  // All cxCurApp reads are in the CoorMon main body (0x08C331 - 0x08C631)
  // The dispatch sub starts at 0x08C72F
  // JP (HL) is at 0x08C745
  // Key question: the dispatch sub is called from CoorMon main — but where?

  // Find all calls to the dispatch sub from CoorMon main body
  console.log('Calls to dispatch sub (0x08C72F) from CoorMon main body:');
  const callsToDispatch = [];
  for (const row of coormonRows) {
    if (!row.inst) continue;
    if ((row.inst.tag === 'call' || row.inst.tag === 'call-conditional' ||
         row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional') &&
        row.inst.target === COORMON_DISPATCH) {
      console.log(`  ${hex(row.pc)}: ${row.text}`);
      callsToDispatch.push(row.pc);
    }
  }

  // Find all jumps BACK to CoorMon entry from the main body (loop detection)
  console.log('\nJumps back to CoorMon entry (0x08C331) — loop-back points:');
  for (const row of coormonRows) {
    if (!row.inst) continue;
    if ((row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional' ||
         row.inst.tag === 'jr' || row.inst.tag === 'jr-conditional') &&
        row.inst.target >= COORMON_ENTRY && row.inst.target <= COORMON_ENTRY + 0x20) {
      console.log(`  ${hex(row.pc)}: ${row.text} -> ${hex(row.inst.target)}`);
    }
  }

  // Compute the answer
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('CONCLUSION');
  console.log('════════════════════════════════════════════════════════════════\n');

  // The cxCurApp read sites are all in the range 0x08C408-0x08C5E7
  // The dispatch sub call (JP/CALL to 0x08C72F) happens from somewhere in the main body
  // JP (HL) is at 0x08C745, which is INSIDE the dispatch sub (0x08C72F+)
  // So the linear order in CoorMon is:
  //   0x08C331: entry
  //   0x08C408, 0x08C4C7, 0x08C59C, 0x08C5C8, 0x08C5E7: cxCurApp reads (in main body)
  //   0x08C72F: dispatch sub (called from main body)
  //   0x08C745: JP (HL) (inside dispatch sub)

  const cxCurAppAddrs = mainCxCurAppRefs.map(r => r.pc);
  const jpHLAddr = dispJpHL.length > 0 ? dispJpHL[0].pc : null;

  if (cxCurAppAddrs.length > 0 && jpHLAddr !== null) {
    const allBefore = cxCurAppAddrs.every(a => a < COORMON_DISPATCH);
    const allCallsBefore = callsToDispatch.every(c => c > Math.min(...cxCurAppAddrs));

    console.log(`cxCurApp read addresses: ${cxCurAppAddrs.map(a => hex(a)).join(', ')}`);
    console.log(`Dispatch sub (containing JP (HL)): ${hex(COORMON_DISPATCH)}`);
    console.log(`JP (HL) address: ${hex(jpHLAddr)}`);
    console.log(`Calls to dispatch sub from main body: ${callsToDispatch.map(a => hex(a)).join(', ') || '(none found in main body — check wider range)'}`);
    console.log('');

    if (allBefore) {
      console.log('RESULT: All cxCurApp reads are at LOWER addresses than the dispatch sub.');
      console.log('The cxCurApp reads (0x08C408-0x08C5E7) come BEFORE the dispatch sub (0x08C72F).');
      console.log('The JP (HL) at 0x08C745 is AFTER the dispatch sub entry.');
      console.log('');
      console.log('CONCLUSION: cxCurApp is read BEFORE JP (HL) dispatch.');
      console.log('');
      console.log('IMPLICATION: The two-pass model works:');
      console.log('  Pass 1: CoorMon reads cxCurApp=0x40 (home), uses it for branching,');
      console.log('          then calls dispatch sub -> JP (HL) to HomeHandler (0x058241).');
      console.log('          HomeHandler loads context table -> cxCurApp becomes 0x00.');
      console.log('  Pass 2: CoorMon re-enters, reads cxCurApp=0x00. But by now cxMain=0x0585E9');
      console.log('          (set by HomeHandler), so dispatch goes to the new handler.');
      console.log('          cxCurApp=0x00 only matters if CoorMon branches on it before dispatch.');
      console.log('');
      console.log('ANSWER: cxCurApp=0x00 in the context table is NOT necessarily a blocker');
      console.log('for the ENTER key path, because CoorMon reads it on the FIRST pass when');
      console.log('it is still 0x40, and the dispatch already happens via JP (HL).');
      console.log('On the second pass, the new cxMain handler at 0x0585E9 receives control');
      console.log('regardless of cxCurApp value.');
    } else {
      console.log('RESULT: Some cxCurApp reads are at addresses >= dispatch sub.');
      console.log('This means cxCurApp might be read AFTER JP (HL) returns.');
      console.log('Need to examine the control flow more carefully.');
    }
  } else {
    console.log('Could not determine ordering — missing data.');
  }

  // ── 6. Check: what does cxCurApp branching actually DO? ──────────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('DETAIL: What happens at each cxCurApp read site?');
  console.log('════════════════════════════════════════════════════════════════\n');

  for (const site of CX_CUR_APP_SITES) {
    // Disassemble a bit more context — from 10 bytes before to 40 bytes after
    const ctxStart = Math.max(COORMON_ENTRY, site - 10);
    const ctxRows = disassembleWindow(rom, decodeInstruction, ctxStart, 50);

    console.log(`--- Site ${hex(site)} ---`);
    for (const row of ctxRows) {
      const marker = row.pc === site ? ' <<<' : '';
      const ann = annotateRow(row);
      console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${ann}${marker}`);
    }
    console.log('');
  }

  // ── 7. Check dispatch sub for RET — does handler return to CoorMon? ─
  console.log('════════════════════════════════════════════════════════════════');
  console.log('DETAIL: Does the dispatch sub use CALL (HL) or JP (HL)?');
  console.log('════════════════════════════════════════════════════════════════\n');

  console.log('If JP (HL): control transfers to handler, handler must RET to');
  console.log('whoever called the dispatch sub (i.e., back into CoorMon main body).');
  console.log('If CALL (HL): dispatch sub would resume after the call.');
  console.log('');
  console.log('At 0x08C745 we have:');
  const jpHLRow = dispatchRows.find(r => r.pc === JP_HL_ADDR);
  if (jpHLRow) {
    console.log(`  ${hex(jpHLRow.pc)}: ${jpHLRow.text}`);
    if (jpHLRow.inst && jpHLRow.inst.tag === 'jp-indirect') {
      console.log('  This is JP (HL), NOT CALL (HL).');
      console.log('  So the handler receives control and its RET goes back to');
      console.log('  the CALLER of the dispatch sub, not to the dispatch sub itself.');
      console.log('');
      console.log('  If the dispatch sub was CALLed from CoorMon main body,');
      console.log('  the handler RET goes back to the instruction AFTER that CALL.');
      console.log('  If the dispatch sub was JPed to, the handler RET goes further up.');
    }
  } else {
    console.log('  (Could not find instruction at 0x08C745)');
  }

  // ── 8. Look for where control goes after dispatch sub returns ────────
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('DETAIL: What happens after the dispatch sub call returns?');
  console.log('════════════════════════════════════════════════════════════════\n');

  // For each call to dispatch sub, show what follows
  for (const callAddr of callsToDispatch) {
    // Find the row
    const callRow = coormonRows.find(r => r.pc === callAddr);
    if (!callRow) continue;

    const afterAddr = callRow.inst.nextPc || callAddr + callRow.inst.length;
    console.log(`After CALL/JP to dispatch sub at ${hex(callAddr)}:`);

    // If it's a JP, not a CALL, the handler RET won't come back here
    if (callRow.inst.tag === 'jp' || callRow.inst.tag === 'jp-conditional') {
      console.log(`  (This is a ${callRow.inst.tag}, so handler RET does NOT return here)`);
    } else {
      // Show next few instructions after the call
      const afterRows = disassembleWindow(rom, decodeInstruction, afterAddr, 30);
      for (const row of afterRows) {
        const ann = annotateRow(row);
        console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(22)} ${row.text}${ann}`);
      }
    }
    console.log('');
  }

  // If no calls found in main body, check wider range
  if (callsToDispatch.length === 0) {
    console.log('No direct calls to 0x08C72F found in main body. Searching wider...');
    const widerRows = disassembleWindow(rom, decodeInstruction, COORMON_ENTRY, 0x500);
    for (const row of widerRows) {
      if (!row.inst) continue;
      if ((row.inst.tag === 'call' || row.inst.tag === 'call-conditional' ||
           row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional') &&
          row.inst.target === COORMON_DISPATCH) {
        console.log(`  Found at ${hex(row.pc)}: ${row.text}`);
      }
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('END OF ANALYSIS');
  console.log('════════════════════════════════════════════════════════════════');
}

await main();
