#!/usr/bin/env node

/**
 * Phase 222: ISR Key Code Delivery Chain (0x000038 -> 0x02F68A)
 *
 * Goals:
 *  1. Disassemble the ISR chain statically: 0x000038, 0x0006F3, 0x001713
 *     Follow CALL/JP to find keyboard-specific ISR handlers.
 *  2. Find scan-to-keycode conversion table in ROM.
 *  3. Map all writers to 0x02F68A (where ISR stores delivered key code).
 *  4. Understand how key codes reach 0x02F68A and eventually 0xD00824/0xD00826.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const ROM_SIZE = rom.length;
const ROM_SCAN_LIMIT = Math.min(ROM_SIZE, 0x400000);

// Key addresses
const ISR_ENTRY = 0x000038;        // RST 38h
const ISR_LINK2 = 0x0006F3;        // next link in chain
const ISR_DISPATCH = 0x001713;      // ISR dispatch gate
const DIRECT_SCAN = 0x0159C0;       // direct keyboard scanner
const GETKEY = 0x04AB5D;            // _GetKey
const GETCSC = 0x04AB65;            // _GetCSC
const KEY_DELIVERY = 0x02F68A;      // ISR stores key code here
const KEY_CODE_D00824 = 0xD00824;   // key code storage (home dispatch)
const KEY_CODE_D00826 = 0xD00826;   // key code storage (home dispatch)
const CONV_KEY_TO_TOK = 0x05BF84;   // ConvKeyToTok table base

// Keyboard I/O ports
const KB_SCAN_PORT = 0xA00F;
const KB_DATA_PORTS_START = 0xA010;
const KB_DATA_PORTS_END = 0xA017;

/* ── Utility helpers ─────────────────────────────────────────────── */

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatBytes(addr, length) {
  return [...rom.subarray(addr, addr + length)]
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function formatIndexed(base, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${base}${sign}${Math.abs(displacement)})`;
}

function safeDecode(addr) {
  if (addr < 0 || addr >= ROM_SIZE) return null;
  try {
    return decodeInstruction(rom, addr, 'adl');
  } catch {
    return null;
  }
}

function formatInstruction(instr) {
  if (!instr) return 'db ?';
  switch (instr.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'daa': return 'daa';
    case 'cpl': return 'cpl';
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-mb-a': return 'ld mb, a';
    case 'ld-a-mb': return 'ld a, mb';
    case 'ret': return 'ret';
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'jp': return `jp ${hex(instr.target, 6)}`;
    case 'jr': return `jr ${hex(instr.target, 6)}`;
    case 'call': return `call ${hex(instr.target, 6)}`;
    case 'rst': return `rst ${hex(instr.target, 2)}`;
    case 'jp-indirect': return `jp (${instr.indirectRegister})`;
    case 'ret-conditional': return `ret ${instr.condition}`;
    case 'jp-conditional': return `jp ${instr.condition}, ${hex(instr.target, 6)}`;
    case 'jr-conditional': return `jr ${instr.condition}, ${hex(instr.target, 6)}`;
    case 'call-conditional': return `call ${instr.condition}, ${hex(instr.target, 6)}`;
    case 'ld-pair-imm': return `ld ${instr.pair}, ${hex(instr.value, 6)}`;
    case 'ld-reg-imm': return `ld ${instr.dest}, ${hex(instr.value, 2)}`;
    case 'ld-reg-reg': return `ld ${instr.dest}, ${instr.src}`;
    case 'ld-reg-ind': return `ld ${instr.dest}, (${instr.src})`;
    case 'ld-ind-reg': return `ld (${instr.dest}), ${instr.src}`;
    case 'ld-reg-mem': return `ld ${instr.dest}, (${hex(instr.addr, 6)})`;
    case 'ld-mem-reg': return `ld (${hex(instr.addr, 6)}), ${instr.src}`;
    case 'ld-pair-mem':
      if (instr.direction === 'from-mem') return `ld ${instr.pair}, (${hex(instr.addr, 6)})`;
      if (instr.direction === 'to-mem') return `ld (${hex(instr.addr, 6)}), ${instr.pair}`;
      return `ld ${instr.pair}, (${hex(instr.addr, 6)})`;
    case 'ld-mem-pair': return `ld (${hex(instr.addr, 6)}), ${instr.pair}`;
    case 'ld-ind-imm': return `ld (hl), ${hex(instr.value, 2)}`;
    case 'ld-reg-ixd': return `ld ${instr.dest}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-ixd-reg': return `ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${instr.src}`;
    case 'ld-ixd-imm': return `ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${hex(instr.value, 2)}`;
    case 'ld-sp-pair': return `ld sp, ${instr.pair}`;
    case 'ld-pair-indexed': return `ld ${instr.pair}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-indexed-pair': return `ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${instr.pair}`;
    case 'ld-ixiy-indexed': return `ld ${instr.dest}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-indexed-ixiy': return `ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${instr.src}`;
    case 'inc-reg': return `inc ${instr.reg}`;
    case 'dec-reg': return `dec ${instr.reg}`;
    case 'inc-pair': return `inc ${instr.pair}`;
    case 'dec-pair': return `dec ${instr.pair}`;
    case 'inc-ixd': return `inc ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'dec-ixd': return `dec ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'add-pair': return `add ${instr.dest}, ${instr.src}`;
    case 'adc-pair': return `adc hl, ${instr.src}`;
    case 'sbc-pair': return `sbc hl, ${instr.src}`;
    case 'alu-reg': return `${instr.op} a, ${instr.src}`;
    case 'alu-imm': return `${instr.op} a, ${hex(instr.value, 2)}`;
    case 'alu-ixd': return `${instr.op} a, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'in-reg': return `in ${instr.reg}, (c)`;
    case 'out-reg': return `out (c), ${instr.reg}`;
    case 'in0': return `in0 ${instr.reg}, (${hex(instr.port, 2)})`;
    case 'out0': return `out0 (${hex(instr.port, 2)}), ${instr.reg}`;
    case 'in-imm': return `in a, (${hex(instr.port, 2)})`;
    case 'out-imm': return `out (${hex(instr.port, 2)}), a`;
    case 'pop': return `pop ${instr.pair}`;
    case 'push': return `push ${instr.pair}`;
    case 'im': return `im ${instr.value}`;
    case 'bit-test': return `bit ${instr.bit}, ${instr.reg}`;
    case 'bit-test-ind': return `bit ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-res': return `res ${instr.bit}, ${instr.reg}`;
    case 'bit-res-ind': return `res ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-set': return `set ${instr.bit}, ${instr.reg}`;
    case 'bit-set-ind': return `set ${instr.bit}, (${instr.indirectRegister})`;
    case 'indexed-cb-bit': return `bit ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-res': return `res ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-set': return `set ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-rotate': return `${instr.operation} ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'tst-reg': return `tst a, ${instr.reg}`;
    case 'tst-ind': return 'tst a, (hl)';
    case 'tst-imm': return `tst a, ${hex(instr.value, 2)}`;
    case 'tstio': return `tstio ${hex(instr.value, 2)}`;
    case 'neg': return 'neg';
    case 'rrd': return 'rrd';
    case 'rld': return 'rld';
    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'ini': return 'ini';
    case 'inir': return 'inir';
    case 'ind': return 'ind';
    case 'indr': return 'indr';
    case 'outi': return 'outi';
    case 'otir': return 'otir';
    case 'outd': return 'outd';
    case 'otdr': return 'otdr';
    case 'otimr': return 'otimr';
    case 'lea': return `lea ${instr.dest}, ${formatIndexed(instr.base, instr.displacement)}`;
    case 'slp': return 'slp';
    default: return instr.tag;
  }
}

/* ── Disassembly ─────────────────────────────────────────────────── */

function disassembleRange(start, end) {
  const rows = [];
  let pc = start;
  const limit = Math.min(end, ROM_SIZE);

  while (pc < limit) {
    const instr = safeDecode(pc);
    if (!instr || !instr.length || pc + instr.length > ROM_SIZE) {
      rows.push({
        pc,
        length: 1,
        bytes: formatBytes(pc, 1),
        text: `db ${hex(rom[pc], 2)}`,
        instr: null,
      });
      pc += 1;
      continue;
    }
    rows.push({
      pc,
      length: instr.length,
      bytes: formatBytes(pc, instr.length),
      text: formatInstruction(instr),
      instr,
    });
    pc += instr.length;
  }
  return rows;
}

function printDisasm(label, start, end) {
  const rows = disassembleRange(start, end);
  console.log(`\n${'='.repeat(92)}`);
  console.log(`${label} @ ${hex(start, 6)}-${hex(end, 6)}`);
  console.log(`${'='.repeat(92)}`);
  for (const row of rows) {
    const annotation = annotateInstruction(row);
    const suffix = annotation ? `  ; ${annotation}` : '';
    console.log(`${hex(row.pc, 6)}  ${row.bytes.padEnd(20)}  ${row.text}${suffix}`);
  }
  return rows;
}

function annotateInstruction(row) {
  const instr = row.instr;
  if (!instr) return '';

  // Annotate references to known addresses
  const target = instr.target ?? instr.addr ?? instr.value;
  if (typeof target !== 'number') return '';

  if (target === ISR_ENTRY) return 'RST 38h entry';
  if (target === ISR_LINK2) return 'ISR chain link 2';
  if (target === ISR_DISPATCH) return 'ISR dispatch gate';
  if (target === DIRECT_SCAN) return 'direct keyboard scanner';
  if (target === GETKEY) return '_GetKey';
  if (target === GETCSC) return '_GetCSC';
  if (target === KEY_DELIVERY) return 'key delivery address 0x02F68A';
  if (target === CONV_KEY_TO_TOK) return 'ConvKeyToTok table';

  // Annotate keyboard port I/O
  if (instr.tag === 'out-reg' || instr.tag === 'in-reg' || instr.tag === 'out0' || instr.tag === 'in0') {
    const port = instr.port;
    if (port === 0x0F) return 'keyboard scan group select (port 0xA00F via BC)';
  }

  return '';
}

/* ── Follow jump/call chains ─────────────────────────────────────── */

function followTransferTargets(rows) {
  const targets = [];
  for (const row of rows) {
    const instr = row.instr;
    if (!instr) continue;
    if (instr.tag === 'jp' || instr.tag === 'call' ||
        instr.tag === 'jp-conditional' || instr.tag === 'call-conditional') {
      const t = (instr.target ?? 0) & 0xFFFFFF;
      if (t > 0 && t < ROM_SCAN_LIMIT) {
        targets.push({ from: row.pc, target: t, type: instr.tag, text: row.text });
      }
    }
    if (instr.tag === 'rst') {
      const t = (instr.target ?? 0) & 0xFFFFFF;
      if (t > 0) {
        targets.push({ from: row.pc, target: t, type: 'rst', text: row.text });
      }
    }
  }
  return targets;
}

/* ── Scan for writes to 0x02F68A ─────────────────────────────────── */

function scanForWritesTo02F68A() {
  // Pattern: LD (0x02F68A), A = 0x32 0x8A 0xF6 0x02  (in ADL mode, 24-bit address)
  // Also look for LD (0x02F68A), <reg> patterns
  // And LD (addr), HL/DE/BC with that address
  const results = [];

  // 1. LD (nn), A — opcode 0x32, followed by 24-bit LE address
  const targetLE = [0x8A, 0xF6, 0x02]; // 0x02F68A in little-endian
  for (let addr = 0; addr < ROM_SCAN_LIMIT - 4; addr++) {
    if (rom[addr] === 0x32 &&
        rom[addr + 1] === targetLE[0] &&
        rom[addr + 2] === targetLE[1] &&
        rom[addr + 3] === targetLE[2]) {
      results.push({ addr, type: 'ld-(nn)-a', bytes: formatBytes(addr, 4) });
    }
  }

  // 2. ED-prefixed stores: LD (nn), rr
  // ED 43 nn nn nn = LD (nn), BC
  // ED 53 nn nn nn = LD (nn), DE
  // ED 63 nn nn nn = LD (nn), HL
  // ED 73 nn nn nn = LD (nn), SP
  const edPairs = [
    [0x43, 'bc'], [0x53, 'de'], [0x63, 'hl'], [0x73, 'sp'],
  ];
  for (let addr = 0; addr < ROM_SCAN_LIMIT - 5; addr++) {
    if (rom[addr] === 0xED) {
      for (const [opcode, pair] of edPairs) {
        if (rom[addr + 1] === opcode &&
            rom[addr + 2] === targetLE[0] &&
            rom[addr + 3] === targetLE[1] &&
            rom[addr + 4] === targetLE[2]) {
          results.push({ addr, type: `ld-(nn)-${pair}`, bytes: formatBytes(addr, 5) });
        }
      }
    }
  }

  // 3. Also search for the address bytes appearing in any LD instruction context
  //    (may catch indirect indexed stores)
  //    Broader search: any occurrence of 0x8A 0xF6 0x02 in ROM
  const broadResults = [];
  for (let addr = 0; addr < ROM_SCAN_LIMIT - 3; addr++) {
    if (rom[addr] === targetLE[0] &&
        rom[addr + 1] === targetLE[1] &&
        rom[addr + 2] === targetLE[2]) {
      broadResults.push(addr);
    }
  }

  return { directWrites: results, broadMatches: broadResults };
}

/* ── Scan for writes to 0xD00824 / 0xD00826 ─────────────────────── */

function scanForWritesToKeyCodeVars() {
  const targets = [
    { addr: 0xD00824, label: 'D00824' },
    { addr: 0xD00826, label: 'D00826' },
  ];
  const results = [];

  for (const { addr: targetAddr, label } of targets) {
    const le = [targetAddr & 0xFF, (targetAddr >> 8) & 0xFF, (targetAddr >> 16) & 0xFF];

    // LD (nn), A
    for (let i = 0; i < ROM_SCAN_LIMIT - 4; i++) {
      if (rom[i] === 0x32 && rom[i + 1] === le[0] && rom[i + 2] === le[1] && rom[i + 3] === le[2]) {
        results.push({ addr: i, target: label, type: 'ld-(nn)-a', bytes: formatBytes(i, 4) });
      }
    }

    // ED-prefixed stores
    const edPairs = [[0x43, 'bc'], [0x53, 'de'], [0x63, 'hl'], [0x73, 'sp']];
    for (let i = 0; i < ROM_SCAN_LIMIT - 5; i++) {
      if (rom[i] === 0xED) {
        for (const [opcode, pair] of edPairs) {
          if (rom[i + 1] === opcode && rom[i + 2] === le[0] && rom[i + 3] === le[1] && rom[i + 4] === le[2]) {
            results.push({ addr: i, target: label, type: `ld-(nn)-${pair}`, bytes: formatBytes(i, 5) });
          }
        }
      }
    }

    // Broad match for the address bytes
    for (let i = 0; i < ROM_SCAN_LIMIT - 3; i++) {
      if (rom[i] === le[0] && rom[i + 1] === le[1] && rom[i + 2] === le[2]) {
        // Only count if the preceding byte is plausibly a load/store opcode
        const prev = i > 0 ? rom[i - 1] : 0;
        if (prev === 0x32 || prev === 0x3A || prev === 0x2A || prev === 0x22 ||
            (i > 1 && rom[i - 2] === 0xED)) {
          // Already captured above
        } else if (prev === 0x21 || prev === 0x01 || prev === 0x11 || prev === 0x31) {
          results.push({ addr: i - 1, target: label, type: 'ld-pair-imm', bytes: formatBytes(i - 1, 4) });
        }
      }
    }
  }

  return results;
}

/* ── Scan for references to keyboard I/O ports ───────────────────── */

function scanForKeyboardIO(rows) {
  const ioRefs = [];
  for (const row of rows) {
    const instr = row.instr;
    if (!instr) continue;

    // Check for port references in BC-based I/O or direct I/O
    if (instr.tag === 'in-reg' || instr.tag === 'out-reg' ||
        instr.tag === 'in0' || instr.tag === 'out0' ||
        instr.tag === 'in-imm' || instr.tag === 'out-imm') {
      ioRefs.push(row);
    }

    // Look for LD BC, 0x00A0xx (keyboard port base)
    if (instr.tag === 'ld-pair-imm' && instr.pair === 'bc') {
      const val = instr.value & 0xFFFFFF;
      if ((val & 0xFFFF00) === 0x00A000 || (val & 0xFFFF00) === 0xA00000) {
        ioRefs.push(row);
      }
    }
  }
  return ioRefs;
}

/* ── Search for scan-to-keycode table ────────────────────────────── */

function searchForScanToKeycodeTable() {
  // Known scan codes from Session 221:
  // Group 1 bit 1 (+)     -> scan code ~0x11
  // Group 4 bit 1 (1)     -> scan code ~0x41
  // Group 4 bit 2 (4)     -> scan code ~0x42
  // Group 6 bit 4 (Y=)    -> scan code ~0x64
  // Group 6 bit 0 (GRAPH) -> scan code ~0x60
  // Key codes used by ConvKeyToTok start at 0x5A

  // Strategy 1: Look for LD HL, <addr> followed by ADD A,L or LD L,A near ISR code
  // This pattern is a classic table lookup: base + offset

  // Strategy 2: Search ROM for 104-byte (0x68) regions where many values are
  // in the 0x5A-0xFF range (valid key codes)

  const candidates = [];

  // Scan regions of interest
  const regions = [
    { start: 0x000000, end: 0x002000, label: 'low-ROM (ISR area)' },
    { start: 0x015800, end: 0x016000, label: 'near direct scanner' },
    { start: 0x04A000, end: 0x04C000, label: 'near _GetKey' },
    { start: 0x02F000, end: 0x030000, label: 'near key delivery var' },
    { start: 0x001700, end: 0x001A00, label: 'near ISR dispatch' },
  ];

  const TABLE_SIZES = [64, 96, 104, 128];

  for (const region of regions) {
    for (let addr = region.start; addr < region.end; addr++) {
      for (const size of TABLE_SIZES) {
        if (addr + size > ROM_SIZE) continue;

        let highCount = 0;
        let zeroCount = 0;
        let ffCount = 0;

        for (let i = 0; i < size; i++) {
          const b = rom[addr + i];
          if (b >= 0x5A && b <= 0xFF) highCount++;
          if (b === 0x00) zeroCount++;
          if (b === 0xFF) ffCount++;
        }

        // A keycode table should have many entries in the 0x5A-0xFF range
        // and relatively few zeros (unused keys would be 0x00 though)
        const ratio = highCount / size;
        if (ratio >= 0.4 && zeroCount < size * 0.5 && ffCount < size * 0.3) {
          candidates.push({
            addr,
            size,
            highCount,
            zeroCount,
            ffCount,
            ratio,
            region: region.label,
            sample: [...rom.subarray(addr, addr + Math.min(32, size))]
              .map((b) => hex(b, 2))
              .join(' '),
          });
        }
      }
    }
  }

  // Sort by ratio descending, then by address
  candidates.sort((a, b) => b.ratio - a.ratio || a.addr - b.addr);

  // Deduplicate overlapping ranges
  const deduped = [];
  const seen = new Set();
  for (const c of candidates) {
    const key = `${Math.floor(c.addr / 16)}:${c.size}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(c);
    }
  }

  return deduped.slice(0, 30);
}

/* ── Search for table-lookup patterns in disassembly ─────────────── */

function findTableLookupPatterns(rows) {
  const patterns = [];

  for (let i = 0; i < rows.length - 4; i++) {
    const instr = rows[i].instr;
    if (!instr) continue;

    // Pattern: LD HL, <addr>  ... ADD HL, <something> or LD A, (HL)
    if (instr.tag === 'ld-pair-imm' && instr.pair === 'hl') {
      const baseAddr = instr.value & 0xFFFFFF;
      if (baseAddr < ROM_SCAN_LIMIT) {
        // Check next few instructions for table-lookup indicators
        const window = rows.slice(i + 1, i + 6);
        for (const w of window) {
          if (!w.instr) continue;
          if (w.instr.tag === 'ld-reg-ind' && w.instr.src === 'hl') {
            patterns.push({
              loadPc: rows[i].pc,
              baseAddr,
              consumerPc: w.pc,
              consumer: w.text,
              loadText: rows[i].text,
            });
            break;
          }
          if (w.instr.tag === 'add-pair' && w.instr.dest === 'hl') {
            patterns.push({
              loadPc: rows[i].pc,
              baseAddr,
              consumerPc: w.pc,
              consumer: w.text,
              loadText: rows[i].text,
            });
            break;
          }
        }
      }
    }
  }

  return patterns;
}

/* ── Disassemble context around an address ───────────────────────── */

function disassembleContext(addr, beforeBytes, afterBytes) {
  const start = Math.max(0, addr - beforeBytes);
  const end = Math.min(ROM_SIZE, addr + afterBytes);
  return disassembleRange(start, end);
}

/* ── Main ────────────────────────────────────────────────────────── */

function main() {
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`ROM scan limit: ${hex(ROM_SCAN_LIMIT, 6)}`);

  // ────────────────────────────────────────────────────────────────
  // Part 1: Disassemble the ISR chain
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 1: ISR Chain Disassembly');
  console.log('#'.repeat(92));

  const isr1Rows = printDisasm('RST 38h handler', ISR_ENTRY, ISR_ENTRY + 0x60);
  const isr1Targets = followTransferTargets(isr1Rows);

  console.log('\nTransfer targets from RST 38h:');
  for (const t of isr1Targets) {
    console.log(`  ${hex(t.from, 6)} ${t.type.padEnd(16)} -> ${hex(t.target, 6)}  (${t.text})`);
  }

  const isr2Rows = printDisasm('ISR chain link 2', ISR_LINK2, ISR_LINK2 + 0xA0);
  const isr2Targets = followTransferTargets(isr2Rows);

  console.log('\nTransfer targets from 0x0006F3:');
  for (const t of isr2Targets) {
    console.log(`  ${hex(t.from, 6)} ${t.type.padEnd(16)} -> ${hex(t.target, 6)}  (${t.text})`);
  }

  const isr3Rows = printDisasm('ISR dispatch gate', ISR_DISPATCH, ISR_DISPATCH + 0xA0);
  const isr3Targets = followTransferTargets(isr3Rows);

  console.log('\nTransfer targets from 0x001713:');
  for (const t of isr3Targets) {
    console.log(`  ${hex(t.from, 6)} ${t.type.padEnd(16)} -> ${hex(t.target, 6)}  (${t.text})`);
  }

  // Follow deeper into any new targets from the ISR chain
  const allIsrTargets = new Set();
  for (const t of [...isr1Targets, ...isr2Targets, ...isr3Targets]) {
    allIsrTargets.add(t.target);
  }

  // Remove the ones we already disassembled
  allIsrTargets.delete(ISR_ENTRY);
  allIsrTargets.delete(ISR_LINK2);
  allIsrTargets.delete(ISR_DISPATCH);

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 1b: Follow-on ISR targets (deeper chain)');
  console.log('#'.repeat(92));

  const sortedTargets = [...allIsrTargets].sort((a, b) => a - b);
  const deeperTargets = [];

  for (const target of sortedTargets) {
    if (target < ROM_SCAN_LIMIT) {
      const rows = printDisasm(`ISR follow-on target`, target, target + 0x80);
      const transfers = followTransferTargets(rows);
      const ioRefs = scanForKeyboardIO(rows);
      const lookups = findTableLookupPatterns(rows);

      if (transfers.length > 0) {
        console.log(`\n  Transfer targets from ${hex(target, 6)}:`);
        for (const t of transfers) {
          console.log(`    ${hex(t.from, 6)} ${t.type.padEnd(16)} -> ${hex(t.target, 6)}  (${t.text})`);
          deeperTargets.push(t);
        }
      }

      if (ioRefs.length > 0) {
        console.log(`\n  Keyboard I/O references at ${hex(target, 6)}:`);
        for (const r of ioRefs) {
          console.log(`    ${hex(r.pc, 6)} ${r.text}`);
        }
      }

      if (lookups.length > 0) {
        console.log(`\n  Table lookup patterns at ${hex(target, 6)}:`);
        for (const p of lookups) {
          console.log(`    ${hex(p.loadPc, 6)} ${p.loadText}  =>  ${hex(p.consumerPc, 6)} ${p.consumer}  (base=${hex(p.baseAddr, 6)})`);
        }
      }
    }
  }

  // Follow one more level deep for keyboard-related targets
  const secondLevelTargets = new Set();
  for (const t of deeperTargets) {
    if (!allIsrTargets.has(t.target) && t.target < ROM_SCAN_LIMIT &&
        t.target !== ISR_ENTRY && t.target !== ISR_LINK2 && t.target !== ISR_DISPATCH) {
      secondLevelTargets.add(t.target);
    }
  }

  if (secondLevelTargets.size > 0 && secondLevelTargets.size <= 20) {
    console.log('\n' + '#'.repeat(92));
    console.log('# PART 1c: Second-level ISR targets');
    console.log('#'.repeat(92));

    for (const target of [...secondLevelTargets].sort((a, b) => a - b)) {
      const rows = printDisasm(`Second-level ISR target`, target, target + 0x60);
      const ioRefs = scanForKeyboardIO(rows);
      const lookups = findTableLookupPatterns(rows);

      if (ioRefs.length > 0) {
        console.log(`\n  Keyboard I/O references at ${hex(target, 6)}:`);
        for (const r of ioRefs) {
          console.log(`    ${hex(r.pc, 6)} ${r.text}`);
        }
      }

      if (lookups.length > 0) {
        console.log(`\n  Table lookup patterns at ${hex(target, 6)}:`);
        for (const p of lookups) {
          console.log(`    ${hex(p.loadPc, 6)} ${p.loadText}  =>  ${hex(p.consumerPc, 6)} ${p.consumer}  (base=${hex(p.baseAddr, 6)})`);
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Part 2: Map all writers to 0x02F68A
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 2: Writers to 0x02F68A (key delivery address)');
  console.log('#'.repeat(92));

  const { directWrites, broadMatches } = scanForWritesTo02F68A();

  console.log(`\nDirect LD (0x02F68A), <reg> instructions found: ${directWrites.length}`);
  for (const w of directWrites) {
    console.log(`  ${hex(w.addr, 6)}  ${w.bytes}  ${w.type}`);

    // Disassemble context around each writer
    const ctx = disassembleContext(w.addr, 32, 16);
    console.log('  Context:');
    for (const row of ctx) {
      const marker = row.pc === w.addr ? '>>>' : '   ';
      console.log(`  ${marker} ${hex(row.pc, 6)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
    console.log('');
  }

  console.log(`\nBroad matches for bytes 0x8A 0xF6 0x02: ${broadMatches.length}`);
  for (const addr of broadMatches) {
    // Decode the instruction AT addr-1 or addr-2 or addr-4 to see if it's a load
    const prevByte = addr > 0 ? rom[addr - 1] : 0;
    const prevPrevByte = addr > 1 ? rom[addr - 2] : 0;
    let decoded = '';

    // Check if this is part of a known instruction
    if (prevByte === 0x32) decoded = 'LD (0x02F68A), A';
    else if (prevByte === 0x3A) decoded = 'LD A, (0x02F68A)';
    else if (prevByte === 0x2A) decoded = 'LD HL, (0x02F68A)';
    else if (prevByte === 0x22) decoded = 'LD (0x02F68A), HL';
    else if (prevByte === 0x21) decoded = 'LD HL, 0x02F68A';
    else if (prevByte === 0x01) decoded = 'LD BC, 0x02F68A';
    else if (prevByte === 0x11) decoded = 'LD DE, 0x02F68A';
    else if (prevPrevByte === 0xED && prevByte === 0x43) decoded = 'LD (0x02F68A), BC';
    else if (prevPrevByte === 0xED && prevByte === 0x53) decoded = 'LD (0x02F68A), DE';
    else if (prevPrevByte === 0xED && prevByte === 0x63) decoded = 'LD (0x02F68A), HL [ED prefix]';
    else if (prevPrevByte === 0xED && prevByte === 0x73) decoded = 'LD (0x02F68A), SP';
    else if (prevPrevByte === 0xED && prevByte === 0x4B) decoded = 'LD BC, (0x02F68A)';
    else if (prevPrevByte === 0xED && prevByte === 0x5B) decoded = 'LD DE, (0x02F68A)';
    else if (prevPrevByte === 0xED && prevByte === 0x6B) decoded = 'LD HL, (0x02F68A) [ED prefix]';
    else if (prevPrevByte === 0xED && prevByte === 0x7B) decoded = 'LD SP, (0x02F68A)';
    else decoded = `(prev byte = ${hex(prevByte, 2)}, prev-prev = ${hex(prevPrevByte, 2)})`;

    const isWrite = decoded.startsWith('LD (');
    const isRead = decoded.startsWith('LD A,') || decoded.startsWith('LD HL,') ||
                   decoded.startsWith('LD BC,') || decoded.startsWith('LD DE,') ||
                   decoded.startsWith('LD SP,');
    const tag = isWrite ? 'WRITE' : isRead ? 'READ ' : 'REF  ';

    console.log(`  ${hex(addr, 6)}  ${tag}  ${decoded}`);
  }

  // ────────────────────────────────────────────────────────────────
  // Part 3: Writers to D00824 / D00826
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 3: Writers to 0xD00824 / 0xD00826');
  console.log('#'.repeat(92));

  const keyCodeVarWrites = scanForWritesToKeyCodeVars();
  console.log(`\nReferences found: ${keyCodeVarWrites.length}`);
  for (const w of keyCodeVarWrites) {
    console.log(`  ${hex(w.addr, 6)}  ${w.target}  ${w.type}  ${w.bytes}`);
  }

  // Disassemble context around each writer
  for (const w of keyCodeVarWrites) {
    if (w.type.startsWith('ld-(nn)')) {
      const ctx = disassembleContext(w.addr, 24, 12);
      console.log(`\n  Context for ${w.target} writer at ${hex(w.addr, 6)}:`);
      for (const row of ctx) {
        const marker = row.pc === w.addr ? '>>>' : '   ';
        console.log(`  ${marker} ${hex(row.pc, 6)}  ${row.bytes.padEnd(20)}  ${row.text}`);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Part 4: Search for scan-to-keycode lookup table
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 4: Search for scan-to-keycode conversion table');
  console.log('#'.repeat(92));

  const tableCandidates = searchForScanToKeycodeTable();
  console.log(`\nCandidate tables found: ${tableCandidates.length}`);
  for (const c of tableCandidates) {
    console.log(`\n  ${hex(c.addr, 6)}  size=${c.size}  high=${c.highCount}/${c.size} (${(c.ratio * 100).toFixed(0)}%)  zeros=${c.zeroCount}  ff=${c.ffCount}  region=${c.region}`);
    console.log(`    First 32 bytes: ${c.sample}`);
  }

  // ────────────────────────────────────────────────────────────────
  // Part 5: Disassemble around direct keyboard scanner for table refs
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 5: Direct keyboard scanner (0x0159C0) and surroundings');
  console.log('#'.repeat(92));

  const scannerRows = printDisasm('Direct keyboard scanner', DIRECT_SCAN, DIRECT_SCAN + 0x120);
  const scannerLookups = findTableLookupPatterns(scannerRows);
  const scannerIO = scanForKeyboardIO(scannerRows);

  if (scannerLookups.length > 0) {
    console.log('\nTable lookup patterns in scanner:');
    for (const p of scannerLookups) {
      console.log(`  ${hex(p.loadPc, 6)} ${p.loadText}  =>  ${hex(p.consumerPc, 6)} ${p.consumer}  (base=${hex(p.baseAddr, 6)})`);

      // Dump the table data at base address
      if (p.baseAddr < ROM_SCAN_LIMIT && p.baseAddr + 128 <= ROM_SIZE) {
        console.log(`    Table data at ${hex(p.baseAddr, 6)}:`);
        for (let row = 0; row < 8; row++) {
          const offset = row * 16;
          const bytes = [...rom.subarray(p.baseAddr + offset, p.baseAddr + offset + 16)]
            .map((b) => hex(b, 2))
            .join(' ');
          console.log(`    ${hex(p.baseAddr + offset, 6)}: ${bytes}`);
        }
      }
    }
  }

  if (scannerIO.length > 0) {
    console.log('\nKeyboard I/O in scanner:');
    for (const r of scannerIO) {
      console.log(`  ${hex(r.pc, 6)} ${r.text}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Part 6: Disassemble _GetKey / _GetCSC deep
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 6: _GetKey and _GetCSC deep disassembly');
  console.log('#'.repeat(92));

  // Follow the JP chain from _GetKey
  const getKeyRows = printDisasm('_GetKey entry', GETKEY, GETKEY + 0x20);
  const getKeyJP = getKeyRows.find((r) => r.instr?.tag === 'jp');
  if (getKeyJP) {
    const realTarget = getKeyJP.instr.target & 0xFFFFFF;
    console.log(`\n_GetKey JP target: ${hex(realTarget, 6)}`);

    const realRows = printDisasm('_GetKey real body', realTarget, realTarget + 0x200);
    const realLookups = findTableLookupPatterns(realRows);
    const realTransfers = followTransferTargets(realRows);

    if (realLookups.length > 0) {
      console.log('\nTable lookup patterns in _GetKey body:');
      for (const p of realLookups) {
        console.log(`  ${hex(p.loadPc, 6)} ${p.loadText}  =>  ${hex(p.consumerPc, 6)} ${p.consumer}  (base=${hex(p.baseAddr, 6)})`);

        // Dump table data
        if (p.baseAddr < ROM_SCAN_LIMIT && p.baseAddr + 128 <= ROM_SIZE) {
          console.log(`    Table data at ${hex(p.baseAddr, 6)}:`);
          for (let row = 0; row < 8; row++) {
            const offset = row * 16;
            const bytes = [...rom.subarray(p.baseAddr + offset, p.baseAddr + offset + 16)]
              .map((b) => hex(b, 2))
              .join(' ');
            console.log(`    ${hex(p.baseAddr + offset, 6)}: ${bytes}`);
          }
        }
      }
    }

    if (realTransfers.length > 0) {
      console.log('\nTransfer targets in _GetKey body:');
      for (const t of realTransfers) {
        console.log(`  ${hex(t.from, 6)} ${t.type.padEnd(16)} -> ${hex(t.target, 6)}  (${t.text})`);
      }
    }
  }

  // Follow _GetCSC JP chain similarly
  const getCSCRows = printDisasm('_GetCSC entry', GETCSC, GETCSC + 0x20);
  const getCSCJP = getCSCRows.find((r) => r.instr?.tag === 'jp');
  if (getCSCJP) {
    const realTarget = getCSCJP.instr.target & 0xFFFFFF;
    console.log(`\n_GetCSC JP target: ${hex(realTarget, 6)}`);

    const realRows = printDisasm('_GetCSC real body', realTarget, realTarget + 0x100);
    const realLookups = findTableLookupPatterns(realRows);

    if (realLookups.length > 0) {
      console.log('\nTable lookup patterns in _GetCSC body:');
      for (const p of realLookups) {
        console.log(`  ${hex(p.loadPc, 6)} ${p.loadText}  =>  ${hex(p.consumerPc, 6)} ${p.consumer}  (base=${hex(p.baseAddr, 6)})`);
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Part 7: Look for the HALT loop in _GetKey that waits for ISR
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 7: HALT instructions near _GetKey / ISR path');
  console.log('#'.repeat(92));

  // Scan for HALT (0x76) in the _GetKey neighborhood
  const haltAddrs = [];
  for (let addr = 0x0019A0; addr < 0x001A00; addr++) {
    if (rom[addr] === 0x76) {
      haltAddrs.push(addr);
    }
  }
  // Also check near the real _GetKey body
  if (getKeyJP) {
    const base = getKeyJP.instr.target & 0xFFFFFF;
    for (let addr = base; addr < base + 0x200; addr++) {
      if (rom[addr] === 0x76) {
        haltAddrs.push(addr);
      }
    }
  }

  console.log(`\nHALT instructions found: ${haltAddrs.length}`);
  for (const addr of haltAddrs) {
    console.log(`\n  HALT at ${hex(addr, 6)}:`);
    const ctx = disassembleContext(addr, 16, 16);
    for (const row of ctx) {
      const marker = row.pc === addr ? '>>>' : '   ';
      console.log(`  ${marker} ${hex(row.pc, 6)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Summary
  // ────────────────────────────────────────────────────────────────

  // ────────────────────────────────────────────────────────────────
  // Part 8: Full post-HALT _GetKey code at 0x0019B5
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 8: Post-HALT _GetKey code (0x0019B5-0x001B00)');
  console.log('#'.repeat(92));

  const postHaltRows = printDisasm('_GetKey post-HALT body', 0x0019B5, 0x001B00);
  const postHaltLookups = findTableLookupPatterns(postHaltRows);
  const postHaltTransfers = followTransferTargets(postHaltRows);

  if (postHaltLookups.length > 0) {
    console.log('\nTable lookup patterns in post-HALT _GetKey:');
    for (const p of postHaltLookups) {
      console.log(`  ${hex(p.loadPc, 6)} ${p.loadText}  =>  ${hex(p.consumerPc, 6)} ${p.consumer}  (base=${hex(p.baseAddr, 6)})`);

      if (p.baseAddr < ROM_SCAN_LIMIT && p.baseAddr + 128 <= ROM_SIZE) {
        console.log(`    Table data at ${hex(p.baseAddr, 6)}:`);
        for (let row = 0; row < 8; row++) {
          const offset = row * 16;
          const bytes = [...rom.subarray(p.baseAddr + offset, p.baseAddr + offset + 16)]
            .map((b) => hex(b, 2))
            .join(' ');
          console.log(`    ${hex(p.baseAddr + offset, 6)}: ${bytes}`);
        }
      }
    }
  }

  if (postHaltTransfers.length > 0) {
    console.log('\nTransfer targets in post-HALT _GetKey:');
    for (const t of postHaltTransfers) {
      console.log(`  ${hex(t.from, 6)} ${t.type.padEnd(16)} -> ${hex(t.target, 6)}  (${t.text})`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Part 9: Investigate 0x04AB91 (the one broad reference to 0x02F68A)
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 9: Context around 0x04AB91 (broad ref to 0x02F68A)');
  console.log('#'.repeat(92));

  const ab91Rows = printDisasm('0x04AB80 context', 0x04AB80, 0x04AC40);
  const ab91Lookups = findTableLookupPatterns(ab91Rows);
  const ab91Transfers = followTransferTargets(ab91Rows);

  if (ab91Lookups.length > 0) {
    console.log('\nTable lookup patterns:');
    for (const p of ab91Lookups) {
      console.log(`  ${hex(p.loadPc, 6)} ${p.loadText}  =>  ${hex(p.consumerPc, 6)} ${p.consumer}  (base=${hex(p.baseAddr, 6)})`);
    }
  }

  if (ab91Transfers.length > 0) {
    console.log('\nTransfer targets:');
    for (const t of ab91Transfers) {
      console.log(`  ${hex(t.from, 6)} ${t.type.padEnd(16)} -> ${hex(t.target, 6)}  (${t.text})`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Part 10: Follow calls from post-HALT code (0x001296, 0x001652, etc.)
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 10: Key subroutines called from ISR keyboard path');
  console.log('#'.repeat(92));

  const isrSubroutines = [0x001296, 0x001652, 0x0008BB, 0x0067F8];
  for (const sub of isrSubroutines) {
    const subRows = printDisasm(`Subroutine ${hex(sub, 6)}`, sub, sub + 0x80);
    const subLookups = findTableLookupPatterns(subRows);

    if (subLookups.length > 0) {
      console.log(`\n  Table lookup patterns in ${hex(sub, 6)}:`);
      for (const p of subLookups) {
        console.log(`    ${hex(p.loadPc, 6)} ${p.loadText}  =>  ${hex(p.consumerPc, 6)} ${p.consumer}  (base=${hex(p.baseAddr, 6)})`);

        if (p.baseAddr < ROM_SCAN_LIMIT && p.baseAddr + 128 <= ROM_SIZE) {
          console.log(`    Table data at ${hex(p.baseAddr, 6)}:`);
          for (let row = 0; row < 8; row++) {
            const offset = row * 16;
            const bytes = [...rom.subarray(p.baseAddr + offset, p.baseAddr + offset + 16)]
              .map((b) => hex(b, 2))
              .join(' ');
            console.log(`    ${hex(p.baseAddr + offset, 6)}: ${bytes}`);
          }
        }
      }
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Part 11: Scan for LD (IY+offset) where offset maps to 0x02F68A
  //          IY=0xD00080, so offset = 0x02F68A - 0xD00080 = negative (not IY+d)
  //          But also check for LD (HL), A patterns near ISR code where HL could be 0x02F68A
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 11: Indirect write patterns to 0x02F68A');
  console.log('#'.repeat(92));

  // Search for LD HL, 0x02F68A (opcode 21 8A F6 02) anywhere in ROM
  const ldHL02F68A = [];
  for (let addr = 0; addr < ROM_SCAN_LIMIT - 4; addr++) {
    if (rom[addr] === 0x21 && rom[addr+1] === 0x8A && rom[addr+2] === 0xF6 && rom[addr+3] === 0x02) {
      ldHL02F68A.push(addr);
    }
  }
  console.log(`\nLD HL, 0x02F68A instructions: ${ldHL02F68A.length}`);
  for (const addr of ldHL02F68A) {
    console.log(`  ${hex(addr, 6)}`);
    const ctx = disassembleRange(Math.max(0, addr - 16), Math.min(ROM_SIZE, addr + 20));
    for (const row of ctx) {
      const marker = row.pc === addr ? '>>>' : '   ';
      console.log(`  ${marker} ${hex(row.pc, 6)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
  }

  // Search for LD DE, 0x02F68A
  const ldDE02F68A = [];
  for (let addr = 0; addr < ROM_SCAN_LIMIT - 4; addr++) {
    if (rom[addr] === 0x11 && rom[addr+1] === 0x8A && rom[addr+2] === 0xF6 && rom[addr+3] === 0x02) {
      ldDE02F68A.push(addr);
    }
  }
  console.log(`\nLD DE, 0x02F68A instructions: ${ldDE02F68A.length}`);
  for (const addr of ldDE02F68A) {
    console.log(`  ${hex(addr, 6)}`);
    const ctx = disassembleRange(Math.max(0, addr - 16), Math.min(ROM_SIZE, addr + 20));
    for (const row of ctx) {
      const marker = row.pc === addr ? '>>>' : '   ';
      console.log(`  ${marker} ${hex(row.pc, 6)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
  }

  // Search for LD IX, 0x02F68A (DD 21 8A F6 02) or LD IY, 0x02F68A (FD 21 8A F6 02)
  const ldIXIY02F68A = [];
  for (let addr = 0; addr < ROM_SCAN_LIMIT - 5; addr++) {
    if ((rom[addr] === 0xDD || rom[addr] === 0xFD) &&
        rom[addr+1] === 0x21 && rom[addr+2] === 0x8A && rom[addr+3] === 0xF6 && rom[addr+4] === 0x02) {
      ldIXIY02F68A.push(addr);
    }
  }
  console.log(`\nLD IX/IY, 0x02F68A instructions: ${ldIXIY02F68A.length}`);
  for (const addr of ldIXIY02F68A) {
    console.log(`  ${hex(addr, 6)}`);
    const ctx = disassembleRange(Math.max(0, addr - 16), Math.min(ROM_SIZE, addr + 20));
    for (const row of ctx) {
      const marker = row.pc === addr ? '>>>' : '   ';
      console.log(`  ${marker} ${hex(row.pc, 6)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
  }

  // ────────────────────────────────────────────────────────────────
  // Part 12: Search broader area around 0x02F68A for related vars
  // ────────────────────────────────────────────────────────────────

  console.log('\n' + '#'.repeat(92));
  console.log('# PART 12: Search for references to 0x02F680-0x02F6A0 area');
  console.log('#'.repeat(92));

  // Search for any reference to the 0x02F6 page
  const f6Refs = [];
  for (let addr = 0; addr < ROM_SCAN_LIMIT - 3; addr++) {
    if (rom[addr+1] === 0xF6 && rom[addr+2] === 0x02) {
      const offset = rom[addr];
      if (offset >= 0x80 && offset <= 0xA0) {
        const prev = addr > 0 ? rom[addr - 1] : 0;
        f6Refs.push({ addr: addr - 1, prev, fullAddr: (0x02F600 | offset), offset });
      }
    }
  }
  console.log(`\nReferences to 0x02F680-0x02F6A0: ${f6Refs.length}`);
  // Group by full address
  const byAddr = {};
  for (const ref of f6Refs) {
    const key = hex(ref.fullAddr, 6);
    if (!byAddr[key]) byAddr[key] = [];
    byAddr[key].push(ref);
  }
  for (const [targetAddr, refs] of Object.entries(byAddr).sort()) {
    console.log(`\n  ${targetAddr}: ${refs.length} references`);
    for (const ref of refs.slice(0, 10)) {
      // Try to decode the instruction
      let decoded = '?';
      const prevByte = ref.prev;
      if (prevByte === 0x32) decoded = `LD (${targetAddr}), A`;
      else if (prevByte === 0x3A) decoded = `LD A, (${targetAddr})`;
      else if (prevByte === 0x22) decoded = `LD (${targetAddr}), HL`;
      else if (prevByte === 0x2A) decoded = `LD HL, (${targetAddr})`;
      else if (prevByte === 0x21) decoded = `LD HL, ${targetAddr}`;
      else if (prevByte === 0x11) decoded = `LD DE, ${targetAddr}`;
      else if (prevByte === 0x01) decoded = `LD BC, ${targetAddr}`;
      else decoded = `prev=${hex(prevByte, 2)}`;
      console.log(`    ${hex(ref.addr, 6)}  ${decoded}`);
    }
  }

  console.log('\n' + '#'.repeat(92));
  console.log('# SUMMARY');
  console.log('#'.repeat(92));

  console.log('\nISR chain:');
  console.log(`  0x000038 (RST 38h) -> transfers: ${isr1Targets.map((t) => hex(t.target, 6)).join(', ')}`);
  console.log(`  0x0006F3 (link 2)  -> transfers: ${isr2Targets.map((t) => hex(t.target, 6)).join(', ')}`);
  console.log(`  0x001713 (dispatch) -> transfers: ${isr3Targets.map((t) => hex(t.target, 6)).join(', ')}`);

  console.log(`\nWriters to 0x02F68A: ${directWrites.length} direct, ${broadMatches.length} broad refs`);
  console.log(`Writers to D00824/D00826: ${keyCodeVarWrites.length} refs`);
  console.log(`Scan-to-keycode table candidates: ${tableCandidates.length}`);

  console.log('\nDone.');
}

main();
