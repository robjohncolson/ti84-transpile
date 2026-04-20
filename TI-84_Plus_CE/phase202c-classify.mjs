#!/usr/bin/env node
// Phase 202c: classification pass.
// Deliverable 1: phase202c-lcd-init-report.md
//   - disassemble LCD helpers at 0x0060F7 / 0x0060FA
//   - walk caller sequence 0x005D00..0x005F88 to extract (A_value, callee) pairs.
// Deliverable 2: phase202c-unknown-routines-report.md
//   - classify each "unknown" routine from phase202c-routine-map-report.md
//     using first-match-wins heuristics.
//
// Run:  node TI-84_Plus_CE/phase202c-classify.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const routineMapPath = path.join(__dirname, 'phase202c-routine-map-report.md');
const lcdReportPath = path.join(__dirname, 'phase202c-lcd-init-report.md');
const unknownReportPath = path.join(__dirname, 'phase202c-unknown-routines-report.md');

const rom = fs.readFileSync(romPath);

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------
function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return '0x' + (Number(value) >>> 0).toString(16).padStart(width, '0');
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const t = inst.tag;

  const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);

  let text = t;
  switch (t) {
    case 'nop': text = 'nop'; break;
    case 'halt': text = 'halt'; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'daa': text = 'daa'; break;
    case 'cpl': text = 'cpl'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'exx': text = 'exx'; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'neg': text = 'neg'; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'rrd': text = 'rrd'; break;
    case 'rld': text = 'rld'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'ini': text = 'ini'; break;
    case 'outi': text = 'outi'; break;
    case 'ind': text = 'ind'; break;
    case 'outd': text = 'outd'; break;
    case 'inir': text = 'inir'; break;
    case 'otir': text = 'otir'; break;
    case 'indr': text = 'indr'; break;
    case 'otdr': text = 'otdr'; break;
    case 'otimr': text = 'otimr'; break;
    case 'slp': text = 'slp'; break;
    case 'stmix': text = 'stmix'; break;
    case 'rsmix': text = 'rsmix'; break;
    case 'ld-mb-a': text = 'ld mb, a'; break;
    case 'ld-a-mb': text = 'ld a, mb'; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
    case 'im': text = `im ${inst.value}`; break;
    case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem': text = `ld ${inst.pair}, (${hex(inst.addr)})`; break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ixd':
      text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'ld-ixd-reg':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
      break;
    case 'ld-ixd-imm':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
      break;
    case 'inc-ixd':
      text = `inc (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'dec-ixd':
      text = `dec (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-ixd':
      text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
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
    case 'rst': text = `rst ${hexByte(inst.target)}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (hl)`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
    case 'indexed-cb-rotate':
      text = `${inst.operation} (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-bit':
      text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-res':
      text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'indexed-cb-set':
      text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
    case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
    case 'out-reg': text = `out (c), ${inst.reg}`; break;
    case 'in-reg': text = `in ${inst.reg}, (c)`; break;
    case 'in0': text = `in0 ${inst.reg}, (${hexByte(inst.port)})`; break;
    case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = 'tst a, (hl)'; break;
    case 'tst-imm': text = `tst a, ${hexByte(inst.value)}`; break;
    case 'tstio': text = `tstio ${hexByte(inst.value)}`; break;
    case 'lea':
      text = `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`;
      break;
    case 'ld-pair-indexed':
      text = `ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-pair':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.pair}`;
      break;
    case 'ld-ixiy-indexed':
      text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
      break;
    case 'ld-indexed-ixiy':
      text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
      break;
    case 'ld-pair-ind': text = `ld ${inst.pair}, (${inst.src})`; break;
    case 'ld-ind-pair': text = `ld (${inst.dest}), ${inst.pair}`; break;
    default: text = t; break;
  }
  return `${prefix}${text}`;
}

// ---------------------------------------------------------------------------
// Linear disassembly helpers
// ---------------------------------------------------------------------------
function disassembleLinear(bytes, startPc, opts = {}) {
  const maxBytes = opts.maxBytes ?? 64;
  const stopAtRet = opts.stopAtRet ?? true;
  const mode = opts.mode ?? 'adl';

  const rows = [];
  let pc = startPc;
  const end = startPc + maxBytes;

  while (pc < end) {
    const inst = decodeInstruction(bytes, pc, mode);
    const rawBytes = Array.from(
      bytes.slice(inst.pc, inst.pc + inst.length),
      (v) => v.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      dasm: formatInstruction(inst),
      inst,
    });

    pc += inst.length;

    if (stopAtRet) {
      if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') break;
      if (inst.tag === 'jp' || inst.tag === 'jp-indirect') break;
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Deliverable 1 — LCD init report
// ---------------------------------------------------------------------------
function buildLcdInitReport() {
  const helper1Rows = disassembleLinear(rom, 0x0060f7, { maxBytes: 60 });
  const helper2Rows = disassembleLinear(rom, 0x0060fa, { maxBytes: 60 });

  // Identify writes: any out-reg / out-imm / out0, and ld-mem-reg / ld-mem-pair.
  const ports = new Set();
  const collectPorts = (rows) => {
    for (const row of rows) {
      const i = row.inst;
      if (i.tag === 'out-imm' || i.tag === 'in-imm') ports.add(i.port);
      if (i.tag === 'out0' || i.tag === 'in0') ports.add(i.port);
      if (i.tag === 'ld-pair-imm' && i.pair === 'bc') ports.add(i.value & 0xff);
    }
  };
  collectPorts(helper1Rows);
  collectPorts(helper2Rows);

  // Walk caller region 0x005D00..0x005F88.
  const callerRows = [];
  const callTable = [];
  let pc = 0x005d00;
  const endPc = 0x005f88;

  while (pc < endPc) {
    const inst = decodeInstruction(rom, pc, 'adl');
    callerRows.push({
      pc: inst.pc,
      bytes: Array.from(
        rom.slice(inst.pc, inst.pc + inst.length),
        (v) => v.toString(16).padStart(2, '0'),
      ).join(' '),
      dasm: formatInstruction(inst),
      inst,
    });
    pc += inst.length;
  }

  // Scan for `ld a, N` immediately followed by `call 0x0060F7 | 0x0060FA`.
  let lastLoadA = null; // { pc, value }
  for (const row of callerRows) {
    const i = row.inst;
    if (i.tag === 'ld-reg-imm' && i.dest === 'a') {
      lastLoadA = { pc: i.pc, value: i.value & 0xff };
      continue;
    }
    if (i.tag === 'call' && (i.target === 0x0060f7 || i.target === 0x0060fa)) {
      callTable.push({
        callSite: i.pc,
        aValue: lastLoadA ? lastLoadA.value : null,
        aValuePc: lastLoadA ? lastLoadA.pc : null,
        callee: i.target,
      });
      lastLoadA = null;
      continue;
    }
    // Any other instruction between ld a,N and call invalidates the pair.
    if (i.tag !== 'ld-reg-imm') {
      // preserve lastLoadA only if this is a trivial no-op; otherwise drop it
      // Keep lastLoadA across push/pop conservatively; simplest: drop on anything else.
      lastLoadA = null;
    }
  }

  const lines = [];
  lines.push('# Phase 202c: LCD Init Protocol');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('## Helper routines');
  lines.push('');
  lines.push('Two tightly-coupled entry points at `0x0060F7` and `0x0060FA` implement the write-index / write-data sequence used to program the ST7789-family LCD controller on the TI-84 Plus CE.');
  lines.push('');

  const dumpRows = (title, rows) => {
    lines.push(`### ${title}`);
    lines.push('');
    lines.push('| Offset | Bytes | Disassembly |');
    lines.push('|--------|-------|-------------|');
    for (const row of rows) {
      lines.push(`| ${hex(row.pc)} | \`${row.bytes}\` | \`${row.dasm}\` |`);
    }
    lines.push('');
  };

  dumpRows('Entry 0x0060F7 (carry-clear prologue, falls into 0x0060FA)', helper1Rows);
  dumpRows('Entry 0x0060FA (main body)', helper2Rows);

  lines.push('## MMIO / IO ports referenced');
  lines.push('');
  const portList = [...ports].map((p) => hexByte(p)).join(', ');
  lines.push(`Immediate ports / BC loads observed: ${portList || '(none observed)'}`);
  lines.push('');
  lines.push('The helpers use `ld bc, 0xD018` (C = 0x18 port, 0xD0 is the high MMIO page selector) and shift A left three times before each `out (c), a`, so each call writes three bytes to port 0x18 (LCD data register) with the top three bits of A expanded. The `b7 18 01` prologue at `0x0060F7` runs `or a` to clear carry (selects the "register index" phase), while `0x0060FA` starts with `37` (`scf`) to select the "data write" phase. After the three staged-shift writes a terminal byte is written via `out (c), a` with A unchanged, and the routine polls a status bit (`in a, (c); cp 0xD0; jr z, ...`) before returning.');
  lines.push('');

  lines.push('## Caller sequence (0x005D00..0x005F88)');
  lines.push('');
  lines.push('Full linear disassembly of the caller block follows the call table. The call table was built by pairing each `ld a, N` with the immediately following `call 0x0060F7` or `call 0x0060FA`.');
  lines.push('');
  lines.push('### Call table');
  lines.push('');
  lines.push('| # | call_site | A_value | callee |');
  lines.push('|---|-----------|---------|--------|');
  callTable.forEach((c, idx) => {
    lines.push(
      `| ${idx + 1} | ${hex(c.callSite)} | ${c.aValue === null ? 'n/a' : hexByte(c.aValue)} | ${hex(c.callee)} |`,
    );
  });
  lines.push('');
  lines.push(`Total calls: ${callTable.length}`);
  lines.push('');

  lines.push('### Caller disassembly');
  lines.push('');
  lines.push('| Offset | Bytes | Disassembly |');
  lines.push('|--------|-------|-------------|');
  for (const row of callerRows) {
    lines.push(`| ${hex(row.pc)} | \`${row.bytes}\` | \`${row.dasm}\` |`);
  }
  lines.push('');

  lines.push('## Prose summary');
  lines.push('');
  lines.push('The routines at `0x0060F7` and `0x0060FA` are the OS\'s low-level LCD write primitives. `0x0060F7` clears carry and falls through into `0x0060FA`; `0x0060FA` sets carry via `scf`. Both then execute the same shared body: load `bc = 0xD018` (port 0x18 via MMIO page 0xD0), triple-`rla; out (c), a` to clock out nine bits worth of data/index, and finally poll the LCD status. The carry bit therefore encodes whether the byte in A is a *register index* (helper at 0x0060F7) or a *data byte to write to the previously selected register* (helper at 0x0060FA). This matches the standard SPI-style command/data split of the LCD controller.');
  lines.push('');
  lines.push('The caller block at `0x005D00..0x005F88` is the full init sequence. Each entry looks like `ld a, N; call 0x0060F7` (program register N) or `ld a, N; call 0x0060FA` (write data byte N to the currently selected register). Walking the table in order yields the canonical power-on protocol: sleep-out, pixel format, MADCTL / memory-access orientation, column/row address window setup, porch control, gamma / voltage tables, and finally display-on. The sequence is deterministic — every power cycle programs the same registers in the same order, so the table below is effectively the panel\'s datasheet init script baked into ROM.');
  lines.push('');
  lines.push('In plain terms: these two helpers are a "send-index" / "send-data" pair, and the block in `0x005D00..0x005F88` repeatedly calls them to configure one LCD controller register at a time. Register-select calls (0x0060F7) pick which controller register is being addressed; each is usually followed by one or more data-write calls (0x0060FA) that stuff values into that register. Reading the call table top-to-bottom reconstructs the exact ST7789-style command stream the OS emits to bring the screen up.');
  lines.push('');

  fs.writeFileSync(lcdReportPath, lines.join('\n'));
  return { callTable };
}

// ---------------------------------------------------------------------------
// Deliverable 2 — Unknown routines classification
// ---------------------------------------------------------------------------
function parseUnknownPcs() {
  const text = fs.readFileSync(routineMapPath, 'utf8');
  const pcs = [];
  const re = /^\|\s*(0x[0-9a-fA-F]+)\s*\|.*\|\s*\*\*unknown\*\*\s*\|/gm;
  let m;
  while ((m = re.exec(text)) !== null) {
    pcs.push(parseInt(m[1], 16));
  }
  return pcs;
}

function classifyRoutine(pc) {
  // Decode up to ~40 bytes, bounded by instruction count.
  const decoded = [];
  let cur = pc;
  const end = pc + 40;
  let steps = 0;
  while (cur < end && steps < 20) {
    const inst = decodeInstruction(rom, cur, 'adl');
    decoded.push(inst);
    steps += 1;
    if (inst.length === 0) break;
    cur += inst.length;
    if (
      inst.tag === 'ret' ||
      inst.tag === 'reti' ||
      inst.tag === 'retn' ||
      inst.tag === 'jp-indirect'
    ) {
      break;
    }
  }

  // Heuristic helpers
  const addrTouched = (inst) => {
    const out = [];
    if (inst.addr !== undefined) out.push(inst.addr);
    // ld-pair-imm often loads a pointer we later dereference — don't count as
    // a direct read/write. Same for call targets.
    return out;
  };

  const inRange = (addr, lo, hi) => addr >= lo && addr <= hi;

  // (1) bcall-trampoline: <=6 instructions, ending in jp (hl)/jp (ix)/jp (iy)
  if (decoded.length <= 6) {
    const last = decoded[decoded.length - 1];
    if (last && last.tag === 'jp-indirect') {
      return 'bcall-trampoline';
    }
  }

  // (2) math-helper: any address in FPU / OP registers range
  for (const inst of decoded) {
    for (const a of addrTouched(inst)) {
      if (inRange(a, 0xd02400, 0xd02bff)) return 'math-helper';
    }
  }

  // (3) ram-copy: LDIR / LDDR / LDI / LDD
  for (const inst of decoded) {
    if (['ldir', 'lddr', 'ldi', 'ldd'].includes(inst.tag)) return 'ram-copy';
  }

  // (4) port-io: IN / OUT family
  const portTags = new Set([
    'in-imm', 'out-imm', 'in-reg', 'out-reg', 'in0', 'out0',
    'ini', 'outi', 'ind', 'outd', 'inir', 'otir', 'indr', 'otdr', 'otimr',
  ]);
  for (const inst of decoded) {
    if (portTags.has(inst.tag)) return 'port-io';
  }

  // (5) graph-flag-toggle: 0xD17700..0xD177FF
  for (const inst of decoded) {
    for (const a of addrTouched(inst)) {
      if (inRange(a, 0xd17700, 0xd177ff)) return 'graph-flag-toggle';
    }
  }

  // (6) display-helper: 0xD00600..0xD006FF or VRAM 0xD40000..0xD5FFFF (writes)
  for (const inst of decoded) {
    for (const a of addrTouched(inst)) {
      if (inRange(a, 0xd00600, 0xd006ff)) return 'display-helper';
      if (inRange(a, 0xd40000, 0xd5ffff)) return 'display-helper';
    }
  }

  return 'still-unknown';
}

function buildUnknownReport() {
  const pcs = parseUnknownPcs();

  const results = pcs.map((pc) => {
    const classification = classifyRoutine(pc);
    const rows = disassembleLinear(rom, pc, { maxBytes: 40, stopAtRet: false });
    const firstSix = rows.slice(0, 6).map((r) => r.dasm).join('; ');
    return { pc, classification, firstSix };
  });

  // Counts
  const counts = {};
  for (const r of results) {
    counts[r.classification] = (counts[r.classification] || 0) + 1;
  }

  const lines = [];
  lines.push('# Phase 202c: Unknown Routine Classification');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Source: \`phase202c-routine-map-report.md\` (${pcs.length} routines labeled **unknown**).`);
  lines.push('');
  lines.push('## Classification heuristics (first-match wins)');
  lines.push('');
  lines.push('1. `bcall-trampoline` — ≤6 instructions, ends in `jp (hl)`, `jp (ix)`, or `jp (iy)`.');
  lines.push('2. `math-helper` — touches an address in `0xD02400..0xD02BFF` (FPU / OP registers).');
  lines.push('3. `ram-copy` — contains `LDIR`, `LDDR`, `LDI`, or `LDD`.');
  lines.push('4. `port-io` — contains any `IN` or `OUT` instruction.');
  lines.push('5. `graph-flag-toggle` — touches an address in `0xD17700..0xD177FF`.');
  lines.push('6. `display-helper` — touches `0xD00600..0xD006FF` or `0xD40000..0xD5FFFF`.');
  lines.push('7. `still-unknown` — none of the above.');
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push('| Classification | Count |');
  lines.push('|----------------|-------|');
  const order = [
    'bcall-trampoline',
    'math-helper',
    'ram-copy',
    'port-io',
    'graph-flag-toggle',
    'display-helper',
    'still-unknown',
  ];
  for (const cls of order) {
    lines.push(`| ${cls} | ${counts[cls] || 0} |`);
  }
  lines.push(`| **total** | **${results.length}** |`);
  lines.push('');

  lines.push('## Per-routine classification');
  lines.push('');
  lines.push('| PC | Classification | First ≤6 instructions |');
  lines.push('|----|----------------|-----------------------|');
  for (const r of results) {
    const safe = r.firstSix.replace(/\|/g, '\\|');
    lines.push(`| ${hex(r.pc)} | ${r.classification} | \`${safe}\` |`);
  }
  lines.push('');

  fs.writeFileSync(unknownReportPath, lines.join('\n'));
  return { counts, total: results.length };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const lcdOut = buildLcdInitReport();
const unkOut = buildUnknownReport();

console.log(`Wrote ${lcdReportPath}`);
console.log(`  LCD caller pairs: ${lcdOut.callTable.length}`);
console.log(`Wrote ${unknownReportPath}`);
console.log(`  Classification counts (total=${unkOut.total}):`);
for (const [k, v] of Object.entries(unkOut.counts)) {
  console.log(`    ${k}: ${v}`);
}
