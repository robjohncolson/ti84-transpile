#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const REPORT_PATH = path.join(__dirname, 'phase25ak-chain1-disasm-report.md');

const ADL_MODE = 'adl';

// Key addresses
const CHAIN1_ADDR = 0x06CE73;
const CHAIN2_ADDR = 0x06C8B4;
const COORMON_ADDR = 0x08C331;
const PARSEINP_VIA = 0x0ACC4C;
const CX_CUR_APP = 0xD007E0;
const CUR_G_STYLE = 0xD0146D;
const FREE_SAVE_X = 0xD01474;
const CUR_PLOT_NUMBER = 0xD01D45;
const BP_SAVE = 0xD02709;
const UNKNOWN_GATE = 0xD0265C;
const DRAW_BG_COLOR = 0xD026AA;
const GRAPH_BG_COLOR = 0xD02A98;

// RAM range to flag
const CX_RANGE_START = 0xD007CA;
const CX_RANGE_END = 0xD007E1;
const RAM_START = 0xD00000;
const RAM_END = 0xD70000;

// Disassemble at least this many bytes forward
const MIN_DISASM_BYTES = 512;

const ADDRESS_NAMES = new Map([
  [CX_CUR_APP, 'cxCurApp'],
  [CUR_G_STYLE, 'curGStyle'],
  [FREE_SAVE_X, 'freeSaveX'],
  [CUR_PLOT_NUMBER, 'curPlotNumber'],
  [BP_SAVE, 'bpSave'],
  [UNKNOWN_GATE, 'unknownGate'],
  [DRAW_BG_COLOR, 'drawBGColor'],
  [GRAPH_BG_COLOR, 'graphBGColor'],
]);

async function loadDecoder() {
  const source = fs.readFileSync(DECODER_PATH, 'utf8');
  const url = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
  return import(url);
}

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesStr(buffer, pc, length) {
  return Array.from(buffer.slice(pc, pc + length), (v) =>
    v.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function fmtInst(inst) {
  const d = (v) => (v >= 0 ? `+${v}` : `${v}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  let text = inst.tag;
  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'ei': text = 'ei'; break;
    case 'di': text = 'di'; break;
    case 'halt': text = 'halt'; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
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
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${d(inst.displacement)}), ${hex(inst.value, 2)}`; break;
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
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'neg': text = 'neg'; break;
    case 'cpl': text = 'cpl'; break;
    case 'ccf': text = 'ccf'; break;
    case 'scf': text = 'scf'; break;
    case 'daa': text = 'daa'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hex(inst.value, 2)}`; break;
    case 'lea': text = `lea ${inst.dest}, ${inst.base}${d(inst.displacement)}`; break;
    case 'rotate': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'indexed-cb-rotate': text = `${inst.op} (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'in-a-imm': text = `in a, (${hex(inst.port, 2)})`; break;
    case 'out-imm-a': text = `out (${hex(inst.port, 2)}), a`; break;
    case 'in-reg': text = `in ${inst.dest}, (c)`; break;
    case 'out-reg': text = `out (c), ${inst.src}`; break;
    case 'im': text = `im ${inst.mode_num}`; break;
    case 'ld-i-a': text = 'ld i, a'; break;
    case 'ld-a-i': text = 'ld a, i'; break;
    case 'ld-r-a': text = 'ld r, a'; break;
    case 'ld-a-r': text = 'ld a, r'; break;
    default: {
      const skip = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough']);
      const parts = Object.entries(inst)
        .filter(([key]) => !skip.has(key))
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : value}`);
      text = parts.length ? `${inst.tag} ${parts.join(' ')}` : inst.tag;
    }
  }

  return `${prefix}${text}`;
}

function disassembleRange(buffer, decode, startAddr, endAddr) {
  const rows = [];
  let pc = startAddr;

  while (pc < endAddr) {
    const inst = decode(buffer, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      rows.push({
        pc,
        nextPc: pc + 1,
        length: 1,
        inst: null,
        bytes: bytesStr(buffer, pc, 1),
        text: `db ${hex(buffer[pc], 2)}`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc: inst.pc,
      nextPc: inst.pc + inst.length,
      length: inst.length,
      inst,
      bytes: bytesStr(buffer, inst.pc, inst.length),
      text: fmtInst(inst),
    });

    pc += inst.length;
  }

  return rows;
}

// Disassemble until we find an unconditional RET, or hit maxBytes
function disassembleFunction(buffer, decode, startAddr, maxBytes = 1024) {
  const rows = [];
  let pc = startAddr;
  const endAddr = startAddr + maxBytes;
  let foundRet = false;
  let retCount = 0;

  while (pc < endAddr) {
    const inst = decode(buffer, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      rows.push({
        pc,
        nextPc: pc + 1,
        length: 1,
        inst: null,
        bytes: bytesStr(buffer, pc, 1),
        text: `db ${hex(buffer[pc], 2)}`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc: inst.pc,
      nextPc: inst.pc + inst.length,
      length: inst.length,
      inst,
      bytes: bytesStr(buffer, inst.pc, inst.length),
      text: fmtInst(inst),
    });

    pc += inst.length;

    // Track unconditional RETs after the minimum disasm window
    if (inst.tag === 'ret' && (pc - startAddr) >= MIN_DISASM_BYTES) {
      retCount += 1;
      foundRet = true;
      // Keep going a bit past the RET to see if there's more code
      // but stop if we find two consecutive terminators
      if (retCount >= 1) break;
    }
  }

  return { rows, foundRet };
}

function isFlowControl(inst) {
  if (!inst) return false;
  return ['call', 'call-conditional', 'jp', 'jp-conditional', 'jp-indirect',
    'jr', 'jr-conditional', 'djnz', 'ret', 'ret-conditional', 'retn', 'reti', 'rst'].includes(inst.tag);
}

function getTarget(inst) {
  if (!inst) return null;
  if (typeof inst.target === 'number') return inst.target;
  return null;
}

function isConditional(inst) {
  if (!inst) return false;
  return inst.tag.includes('conditional');
}

function getReferencedAddr(inst) {
  // Get any memory address referenced by the instruction
  if (!inst) return null;
  if (typeof inst.addr === 'number') return inst.addr;
  if (typeof inst.value === 'number' && inst.value >= RAM_START && inst.value < RAM_END) return inst.value;
  return null;
}

function formatAddrLabel(addr) {
  const name = ADDRESS_NAMES.get(addr);
  return name ? `${hex(addr)} (${name})` : hex(addr);
}

function getRowByPc(rows, pc) {
  return rows.find((row) => row.pc === pc) || null;
}

function createLogger() {
  const lines = [];
  return {
    log(line = '') {
      lines.push(line);
      console.log(line);
    },
    toString() {
      return `${lines.join('\n')}\n`;
    },
  };
}

function analyze(rom, decodeInstruction, log = console.log) {
  log('=== Chain1 (0x06CE73) Disassembly Probe ===\n');

  // Disassemble Chain1 function body
  log(`Disassembling from ${hex(CHAIN1_ADDR)} forward...\n`);

  const { rows, foundRet } = disassembleFunction(rom, decodeInstruction, CHAIN1_ADDR, 1024);

  log(`Disassembled ${rows.length} instructions, ${rows[rows.length - 1].nextPc - CHAIN1_ADDR} bytes`);
  log(`Found unconditional RET: ${foundRet}\n`);

  // Collect all branch targets
  const branches = [];
  const ramRefs = [];
  const iyOps = [];
  const chain2Refs = [];
  const cxCurAppRefs = [];
  const cxRangeRefs = [];

  for (const row of rows) {
    if (!row.inst) continue;

    // Flow control
    if (isFlowControl(row.inst)) {
      const target = getTarget(row.inst);
      branches.push({
        pc: row.pc,
        tag: row.inst.tag,
        target,
        condition: row.inst.condition || null,
        text: row.text,
      });

      // Check for Chain2 reference
      if (target === CHAIN2_ADDR) {
        chain2Refs.push({ pc: row.pc, text: row.text, tag: row.inst.tag });
      }
    }

    // RAM references
    const addr = getReferencedAddr(row.inst);
    if (addr !== null) {
      ramRefs.push({ pc: row.pc, addr, text: row.text });

      if (addr === CX_CUR_APP) {
        cxCurAppRefs.push({ pc: row.pc, text: row.text });
      }
      if (addr >= CX_RANGE_START && addr <= CX_RANGE_END) {
        cxRangeRefs.push({ pc: row.pc, addr, text: row.text });
      }
    }

    // Immediate values that reference Chain2 or cxCurApp
    if (row.inst.tag === 'ld-pair-imm' && typeof row.inst.value === 'number') {
      if (row.inst.value === CHAIN2_ADDR) {
        chain2Refs.push({ pc: row.pc, text: row.text, tag: 'immediate' });
      }
      if (row.inst.value === CX_CUR_APP) {
        cxCurAppRefs.push({ pc: row.pc, text: row.text });
      }
    }

    // IY operations
    if (row.inst.indexRegister === 'iy') {
      iyOps.push({
        pc: row.pc,
        text: row.text,
        displacement: row.inst.displacement,
        bit: row.inst.bit,
        tag: row.inst.tag,
      });
    }
  }

  // Print full disassembly
  log('--- Full Disassembly ---\n');
  for (const row of rows) {
    const notes = [];

    if (row.inst) {
      if (isFlowControl(row.inst)) {
        const target = getTarget(row.inst);
        if (target === CHAIN2_ADDR) notes.push('*** CHAIN2 TARGET ***');
        if (target === COORMON_ADDR) notes.push('CoorMon');
        if (target === PARSEINP_VIA) notes.push('ParseInp via');
        if (isConditional(row.inst)) notes.push(`CONDITIONAL (${row.inst.condition})`);
      }

      const addr = getReferencedAddr(row.inst);
      if (addr === CX_CUR_APP) notes.push('cxCurApp');
      if (addr !== null && addr >= CX_RANGE_START && addr <= CX_RANGE_END) notes.push('cx-range');

      if (row.inst.indexRegister === 'iy') {
        notes.push(`IY${row.inst.displacement >= 0 ? '+' : ''}${row.inst.displacement}`);
      }
    }

    const noteSuffix = notes.length ? `  ; ${notes.join(' | ')}` : '';
    log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}${noteSuffix}`);
  }

  // Summary sections
  log('\n--- Branch Targets ---\n');
  for (const b of branches) {
    const cond = b.condition ? ` [${b.condition}]` : '';
    const targetStr = b.target !== null ? hex(b.target) : '(indirect)';
    const chain2Mark = b.target === CHAIN2_ADDR ? ' *** CHAIN2 ***' : '';
    log(`  ${hex(b.pc)}  ${b.tag}${cond} -> ${targetStr}${chain2Mark}`);
  }

  log('\n--- Chain2 (0x06C8B4) References ---\n');
  if (chain2Refs.length === 0) {
    log('  NONE FOUND in the disassembled range');
  } else {
    for (const ref of chain2Refs) {
      log(`  ${hex(ref.pc)}  ${ref.text} (${ref.tag})`);
    }
  }

  log('\n--- cxCurApp (0xD007E0) References ---\n');
  if (cxCurAppRefs.length === 0) {
    log('  NONE FOUND in the disassembled range');
  } else {
    for (const ref of cxCurAppRefs) {
      log(`  ${hex(ref.pc)}  ${ref.text}`);
    }
  }

  log('\n--- cx Range (0xD007CA-0xD007E1) References ---\n');
  if (cxRangeRefs.length === 0) {
    log('  NONE FOUND in the disassembled range');
  } else {
    for (const ref of cxRangeRefs) {
      log(`  ${hex(ref.pc)}  addr=${hex(ref.addr)}  ${ref.text}`);
    }
  }

  log('\n--- IY+offset Operations ---\n');
  if (iyOps.length === 0) {
    log('  NONE FOUND in the disassembled range');
  } else {
    for (const op of iyOps) {
      log(`  ${hex(op.pc)}  disp=${op.displacement}  ${op.text}`);
    }
  }

  log('\n--- RAM References (0xD0xxxx) ---\n');
  if (ramRefs.length === 0) {
    log('  NONE FOUND');
  } else {
    for (const ref of ramRefs) {
      log(`  ${hex(ref.pc)}  addr=${hex(ref.addr)}  ${ref.text}`);
    }
  }

  // If Chain2 not found, trace where Chain1 actually goes
  log('\n--- Control Flow Trace ---\n');
  const directCalls = branches.filter(b => b.tag === 'call');
  const directJps = branches.filter(b => b.tag === 'jp');
  const condJps = branches.filter(b => b.tag === 'jp-conditional');
  const condCalls = branches.filter(b => b.tag === 'call-conditional');
  const condJrs = branches.filter(b => b.tag === 'jr-conditional');

  log(`  Unconditional CALLs: ${directCalls.length}`);
  for (const c of directCalls) log(`    ${hex(c.pc)} -> ${hex(c.target)}`);

  log(`  Unconditional JPs: ${directJps.length}`);
  for (const j of directJps) log(`    ${hex(j.pc)} -> ${hex(j.target)}`);

  log(`  Conditional JPs: ${condJps.length}`);
  for (const j of condJps) log(`    ${hex(j.pc)} [${j.condition}] -> ${hex(j.target)}`);

  log(`  Conditional CALLs: ${condCalls.length}`);
  for (const c of condCalls) log(`    ${hex(c.pc)} [${c.condition}] -> ${hex(c.target)}`);

  log(`  Conditional JRs: ${condJrs.length}`);
  for (const j of condJrs) log(`    ${hex(j.pc)} [${j.condition}] -> ${hex(j.target)}`);

  // Now scan around Chain2 to see what calls it
  log('\n\n=== Chain2 (0x06C8B4) Caller Scan ===\n');

  // Look for bytes that encode CALL 0x06C8B4 or JP 0x06C8B4
  // CALL nn = CD lo mid hi (eZ80 ADL)
  // JP nn = C3 lo mid hi
  const chain2Lo = CHAIN2_ADDR & 0xFF;         // 0xB4
  const chain2Mid = (CHAIN2_ADDR >> 8) & 0xFF; // 0xC8
  const chain2Hi = (CHAIN2_ADDR >> 16) & 0xFF; // 0x06

  const callPattern = [0xCD, chain2Lo, chain2Mid, chain2Hi];
  const jpPattern = [0xC3, chain2Lo, chain2Mid, chain2Hi];

  const callHits = scanPattern(rom, callPattern);
  const jpHits = scanPattern(rom, jpPattern);

  log(`  CALL 0x06C8B4 sites: ${callHits.length}`);
  for (const site of callHits) {
    log(`    ${hex(site)}`);
  }
  log(`  JP 0x06C8B4 sites: ${jpHits.length}`);
  for (const site of jpHits) {
    log(`    ${hex(site)}`);
  }

  // Also disassemble the Chain2 entry point to understand its shape
  log('\n\n=== Chain2 (0x06C8B4) Entry Point Disassembly ===\n');
  const chain2Rows = disassembleRange(rom, decodeInstruction, CHAIN2_ADDR, CHAIN2_ADDR + 128);
  for (const row of chain2Rows) {
    log(`  ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }

  // Now scan for references to CHAIN1_ADDR to understand who calls it
  log('\n\n=== Chain1 (0x06CE73) Caller Scan ===\n');

  const chain1Lo = CHAIN1_ADDR & 0xFF;         // 0x73
  const chain1Mid = (CHAIN1_ADDR >> 8) & 0xFF; // 0xCE
  const chain1Hi = (CHAIN1_ADDR >> 16) & 0xFF; // 0x06

  const chain1CallPattern = [0xCD, chain1Lo, chain1Mid, chain1Hi];
  const chain1JpPattern = [0xC3, chain1Lo, chain1Mid, chain1Hi];

  const chain1CallHits = scanPattern(rom, chain1CallPattern);
  const chain1JpHits = scanPattern(rom, chain1JpPattern);

  log(`  CALL 0x06CE73 sites: ${chain1CallHits.length}`);
  for (const site of chain1CallHits) {
    log(`    ${hex(site)}`);
    // Show context around each caller
    const contextStart = Math.max(0, site - 16);
    const contextEnd = site + 16;
    const contextRows = disassembleRange(rom, decodeInstruction, contextStart, contextEnd);
    for (const row of contextRows) {
      const marker = row.pc === site ? '>>>' : '   ';
      log(`      ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
    }
  }
  log(`  JP 0x06CE73 sites: ${chain1JpHits.length}`);
  for (const site of chain1JpHits) {
    log(`    ${hex(site)}`);
    const contextStart = Math.max(0, site - 16);
    const contextEnd = site + 16;
    const contextRows = disassembleRange(rom, decodeInstruction, contextStart, contextEnd);
    for (const row of contextRows) {
      const marker = row.pc === site ? '>>>' : '   ';
      log(`      ${marker} ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
    }
  }

  return {
    rows,
    foundRet,
    branches,
    chain2Refs,
    cxCurAppRefs,
    cxRangeRefs,
    iyOps,
    ramRefs,
    callHits,
    jpHits,
    chain1CallHits,
    chain1JpHits,
    chain2Rows,
    directCalls,
    directJps,
    condJps,
    condCalls,
    condJrs,
  };
}

function scanPattern(buffer, bytes) {
  const hits = [];
  const limit = buffer.length - bytes.length;

  outer: for (let pc = 0; pc <= limit; pc += 1) {
    for (let i = 0; i < bytes.length; i += 1) {
      if (buffer[pc + i] !== bytes[i]) {
        continue outer;
      }
    }
    hits.push(pc);
  }

  return hits;
}

function buildReport(data) {
  const lines = [];

  lines.push('# Phase 25AK - Chain1 (0x06CE73) Disassembly Report');
  lines.push('');
  lines.push('Generated by `probe-phase25ak-chain1-disasm.mjs`.');
  lines.push('');

  lines.push('## Question');
  lines.push('');
  lines.push('CoorMon (0x08C331) dispatches Chain1 (0x06CE73) at step 5, but Chain2 (0x06C8B4) is never reached in 300K steps. Why?');
  lines.push('');

  lines.push('## Executive Summary');
  lines.push('');

  if (data.chain2Refs.length > 0) {
    const site1 = getRowByPc(data.rows, 0x06CE95);
    const site2 = getRowByPc(data.rows, 0x06CEEB);

    lines.push('Chain2 (0x06C8B4) IS referenced from Chain1 -- it is called at TWO sites:');
    lines.push('');
    lines.push(`- **Site 1** (\`${hex(0x06CE95)}\`): \`${site1?.text ?? 'call 0x06C8B4'}\` -- reached only if \`${formatAddrLabel(CUR_G_STYLE)} != 0\` AND \`!= 0x85\` AND \`!= 0x87\` AND \`!= 0x8D\`.`);
    lines.push(`- **Site 2** (\`${hex(0x06CEEB)}\`): \`${site2?.text ?? 'call 0x06C8B4'}\` -- reached only after the later dispatch path keeps \`bit 0, (iy+2)\` set and passes the additional \`${formatAddrLabel(CUR_PLOT_NUMBER)}\`, \`(iy+4)\`, \`${formatAddrLabel(FREE_SAVE_X)}\`, and \`(iy+75)\` gates.`);
    lines.push('');
    lines.push(`The wrapper at \`${hex(CHAIN1_ADDR)}\` is fixed: \`res 3, (iy+2)\`; \`call 0x06CE7F\`; \`jp 0x06C8AB\`.`);
    lines.push(`If helper \`${hex(0x06CE7F)}\` returns early, execution goes straight to \`${hex(0x06C8AB)}\`, which is a separate entry point 9 bytes before Chain2, not to \`${hex(CHAIN2_ADDR)}\`.`);
    lines.push('');
    lines.push(`Static explanation for "Chain1 hit but Chain2 never hit": one of the helper's early exits fired before \`${hex(0x06CE95)}\` or \`${hex(0x06CEEB)}\`. The earliest and simplest skip is \`${hex(0x06CE84)}\` (\`or a; ret z\`) when \`${formatAddrLabel(CUR_G_STYLE)} == 0\`; two more early returns skip on \`0x85\` / \`0x87\`, and \`${hex(0x06CE91)}\` diverts \`0x8D\` to \`${hex(0x06CF41)}\`.`);
    lines.push('');
    lines.push(`Chain2 itself is tiny: \`sis ld hl, (0x002A98)\`; \`sis ld (0x0026AA), hl\`; \`ret\`. With the normal TI-OS \`mbase=0xD0\`, that copies \`${formatAddrLabel(GRAPH_BG_COLOR)}\` to \`${formatAddrLabel(DRAW_BG_COLOR)}\`.`);
  } else {
    lines.push('Chain2 (0x06C8B4) is **NOT directly referenced** from Chain1\'s function body.');
    lines.push('The static BFS assumption (Chain1 -> Chain2) is incorrect -- these are separate dispatch paths.');
    lines.push('');
    lines.push('Chain1 dispatches to:');
    lines.push('');
    for (const c of data.directCalls) {
      lines.push(`- CALL \`${hex(c.target)}\` at \`${hex(c.pc)}\``);
    }
    for (const j of data.directJps) {
      lines.push(`- JP \`${hex(j.target)}\` at \`${hex(j.pc)}\``);
    }
  }
  lines.push('');

  lines.push('## cxCurApp References');
  lines.push('');
  if (data.cxCurAppRefs.length === 0) {
    lines.push('No direct references to cxCurApp (0xD007E0) in Chain1.');
  } else {
    for (const ref of data.cxCurAppRefs) {
      lines.push(`- \`${hex(ref.pc)}\`: \`${ref.text}\``);
    }
  }
  lines.push('');

  lines.push('## IY+offset Operations');
  lines.push('');
  if (data.iyOps.length === 0) {
    lines.push('No IY+offset operations in Chain1.');
  } else {
    lines.push('| PC | Displacement | Instruction |');
    lines.push('| --- | --- | --- |');
    for (const op of data.iyOps) {
      lines.push(`| \`${hex(op.pc)}\` | ${op.displacement} | \`${op.text}\` |`);
    }
  }
  lines.push('');

  lines.push('## Named RAM Gates');
  lines.push('');
  lines.push(`- \`${hex(0x06CE7F)}\`, \`${hex(0x06CEB5)}\`, \`${hex(0x06CED6)}\`, and \`${hex(0x06CEEF)}\` read \`${formatAddrLabel(CUR_G_STYLE)}\`. This is the primary selector that decides whether Chain2 is called, skipped, or diverted into later dispatch tables.`);
  lines.push(`- \`${hex(0x06CEC5)}\` reads \`${formatAddrLabel(CUR_PLOT_NUMBER)}\`. Zero takes the alternate \`${hex(0x06CEDF)}\` path; nonzero continues through \`${hex(0x06CECC)}\` and then checks \`bit 4, (iy+4)\` / \`${formatAddrLabel(CUR_G_STYLE)} >= 0x7F\` before the second Chain2 call.`);
  lines.push(`- \`${hex(0x06CEDF)}\` reads \`${formatAddrLabel(FREE_SAVE_X)}\`, and \`${hex(0x06CEE3)}\` tests \`bit 3, (iy+75)\` before entering the second Chain2 call site.`);
  lines.push(`- \`${hex(0x06CEA9)}\` loads \`${formatAddrLabel(BP_SAVE)}\` before \`call 0x09F1DF\` when \`bit 2, (iy+78)\` is clear and \`bit 2, (iy+3)\` is set.`);
  lines.push(`- \`${hex(0x06CF59)}\` reads \`${formatAddrLabel(UNKNOWN_GATE)}\` only for the \`0x1B / 0x1D\` case on the later \`${hex(0x06CF41)}\` dispatch path.`);
  lines.push('');

  lines.push('## Chain2 Caller Scan (ROM-wide)');
  lines.push('');
  lines.push(`- CALL 0x06C8B4 sites: ${data.callHits.length}`);
  for (const site of data.callHits) {
    lines.push(`  - \`${hex(site)}\``);
  }
  lines.push(`- JP 0x06C8B4 sites: ${data.jpHits.length}`);
  for (const site of data.jpHits) {
    lines.push(`  - \`${hex(site)}\``);
  }
  lines.push('');

  lines.push('## Chain1 Caller Scan (ROM-wide)');
  lines.push('');
  lines.push(`- CALL 0x06CE73 sites: ${data.chain1CallHits.length}`);
  for (const site of data.chain1CallHits) {
    lines.push(`  - \`${hex(site)}\``);
  }
  lines.push(`- JP 0x06CE73 sites: ${data.chain1JpHits.length}`);
  for (const site of data.chain1JpHits) {
    lines.push(`  - \`${hex(site)}\``);
  }
  lines.push('');

  lines.push('## Full Disassembly (Chain1 from 0x06CE73)');
  lines.push('');
  lines.push('```text');
  for (const row of data.rows) {
    const notes = [];
    if (row.inst) {
      const target = getTarget(row.inst);
      if (target === CHAIN2_ADDR) notes.push('*** CHAIN2 ***');
      if (isConditional(row.inst)) notes.push(`COND:${row.inst.condition}`);
      if (row.inst.indexRegister === 'iy') notes.push(`IY${row.inst.displacement >= 0 ? '+' : ''}${row.inst.displacement}`);
      const addr = getReferencedAddr(row.inst);
      if (addr === CX_CUR_APP) notes.push('cxCurApp');
    }
    const noteSuffix = notes.length ? `  ; ${notes.join(' | ')}` : '';
    lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}${noteSuffix}`);
  }
  lines.push('```');
  lines.push('');

  lines.push('## Chain2 Entry Point (0x06C8B4, first 128 bytes)');
  lines.push('');
  lines.push('```text');
  for (const row of data.chain2Rows) {
    lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }
  lines.push('```');
  lines.push('');

  lines.push('## Probe Stdout');
  lines.push('');
  lines.push('```text');
  lines.push(data.stdout.trimEnd());
  lines.push('```');
  lines.push('');

  return lines.join('\n') + '\n';
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { decodeInstruction } = await loadDecoder();
  const logger = createLogger();

  const data = analyze(rom, decodeInstruction, logger.log);
  data.stdout = logger.toString();
  const report = buildReport(data);

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\n\nReport written to ${REPORT_PATH}`);
}

await main();
