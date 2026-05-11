#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const rom = fs.readFileSync(ROM_PATH);

// All 27 ROM locations that write LD (0xD0058C), A
const WRITE_SITES = [
  0x0238AD, 0x0258C8, 0x02658A, 0x026892, 0x0268A0, 0x026983,
  0x02F95D, 0x02FCBA, 0x02FEC9, 0x030330, 0x030345,
  0x03D964, 0x03D975, 0x03F0A1, 0x03F4CB,
  0x04BA69,
  0x05627A, 0x05628A, 0x0562AB,
  0x07BA72, 0x07BF39,
  0x080FB2, 0x080FCF,
  0x08C35A, 0x08C36E, 0x08C7A1,
  0x09D29E,
];

// Known address ranges for classification
const KEYBOARD_MMIO_START = 0xE00900;
const KEYBOARD_MMIO_END = 0xE0090F;
const D005_RANGE_START = 0xD00500;
const D005_RANGE_END = 0xD005FF;

// Categories
const CATEGORIES = {
  KEYBOARD_SCAN: 'KEYBOARD_SCAN',
  EVENT_SERVICE: 'EVENT_SERVICE',
  APP_DISPATCH: 'APP_DISPATCH',
  EDITOR: 'EDITOR',
  EVENT_LOOP: 'EVENT_LOOP',
  STAT: 'STAT',
  UNKNOWN: 'UNKNOWN',
};

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), (value) => hexByte(value)).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function safeDecode(pc) {
  if (pc < 0 || pc >= rom.length) {
    return null;
  }
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length || inst.length <= 0) {
      return null;
    }
    return inst;
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) {
    return 'DB ?';
  }

  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest ?? 'hl').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'rotate-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind':
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indirectRegister).toUpperCase()})`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg).toUpperCase()}`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'daa':
      return `${prefix}DAA`;
    case 'neg':
      return `${prefix}NEG`;
    case 'rra':
      return `${prefix}RRA`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'rlca':
      return `${prefix}RLCA`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'out-imm':
      return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-imm':
      return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'set-bit':
      return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'res-bit':
      return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'set-bit-ind':
      return `${prefix}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'res-bit-ind':
      return `${prefix}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'ex-sp-hl':
      return `${prefix}EX (SP), HL`;
    case 'im':
      return `${prefix}IM ${inst.mode}`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates']);
      const extra = Object.entries(inst)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${value}`)
        .join(' ');
      return `${prefix}${String(inst.tag).toUpperCase()}${extra ? ` ${extra}` : ''}`;
    }
  }
}

function disassembleAround(writeSitePC, beforeCount, afterCount) {
  // Walk backwards by disassembling from a safe distance before
  // We scan backwards by up to beforeCount * 6 bytes (max instruction length) to find start points
  const scanStart = Math.max(0, writeSitePC - beforeCount * 6);
  const scanEnd = writeSitePC + afterCount * 6;

  const rows = [];
  let pc = scanStart;

  while (pc < scanEnd && pc < rom.length) {
    const inst = safeDecode(pc);
    if (!inst) {
      rows.push({ pc, length: 1, asm: `DB ${hexByte(rom[pc])}`, inst: null });
      pc += 1;
      continue;
    }
    rows.push({ pc, length: inst.length, asm: formatInstruction(inst), inst });
    pc += inst.length;
  }

  // Find the row index of the write site
  const writeIdx = rows.findIndex((r) => r.pc === writeSitePC);
  if (writeIdx < 0) {
    // If exact address not found, return all rows near the target
    return rows;
  }

  const startIdx = Math.max(0, writeIdx - beforeCount);
  const endIdx = Math.min(rows.length, writeIdx + afterCount + 1);
  return rows.slice(startIdx, endIdx);
}

function extractAddress(inst) {
  if (!inst) {
    return null;
  }
  if (inst.addr !== undefined) {
    return inst.addr;
  }
  if (inst.target !== undefined) {
    return inst.target;
  }
  return null;
}

function isKeyboardMMIO(addr) {
  return addr >= KEYBOARD_MMIO_START && addr <= KEYBOARD_MMIO_END;
}

function isD005xxVar(addr) {
  return addr >= D005_RANGE_START && addr <= D005_RANGE_END;
}

function classifySite(writeSitePC, rows) {
  const callTargets = [];
  const memRefs = [];
  let hasKeyboardMMIO = false;
  let hasD005xx = false;
  let hasRET = false;
  let hasHALT = false;
  let hasDI = false;
  let hasEI = false;

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) {
      continue;
    }

    // Collect CALL targets
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push(inst.target);
    }

    // Collect JP targets
    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      callTargets.push(inst.target);
    }

    // Check for memory references
    const addr = extractAddress(inst);
    if (addr !== null && addr !== 0xD0058C) {
      if (isKeyboardMMIO(addr)) {
        hasKeyboardMMIO = true;
        memRefs.push({ pc: row.pc, addr, type: 'KEYBOARD_MMIO' });
      } else if (isD005xx(addr)) {
        hasD005xx = true;
        memRefs.push({ pc: row.pc, addr, type: 'D005xx' });
      } else if (addr >= 0xD00000 && addr <= 0xD0FFFF) {
        memRefs.push({ pc: row.pc, addr, type: 'RAM' });
      }
    }

    if (inst.tag === 'ret' || inst.tag === 'ret-conditional') {
      hasRET = true;
    }
    if (inst.tag === 'halt') {
      hasHALT = true;
    }
    if (inst.tag === 'di') {
      hasDI = true;
    }
    if (inst.tag === 'ei') {
      hasEI = true;
    }
  }

  // Classification heuristics

  // KEYBOARD_SCAN: references keyboard MMIO ports 0xE00900-0xE0090F
  if (hasKeyboardMMIO) {
    return CATEGORIES.KEYBOARD_SCAN;
  }

  // Address-range-based heuristics
  const pc = writeSitePC;

  // 0x02F95D-0x030345 cluster: nearby addresses suggest event-service region
  if (pc >= 0x02F000 && pc <= 0x030FFF) {
    // Check for patterns suggesting event processing
    if (hasD005xx) {
      return CATEGORIES.EVENT_SERVICE;
    }
    return CATEGORIES.EVENT_SERVICE;
  }

  // 0x03D964-0x03F4CB cluster: editor/app region
  if (pc >= 0x03D000 && pc <= 0x03FFFF) {
    // Look for patterns: multiple D005xx refs suggest editor state management
    if (hasD005xx) {
      return CATEGORIES.EDITOR;
    }
    return CATEGORIES.APP_DISPATCH;
  }

  // 0x0238AD-0x026983: early OS region, likely keyboard/event handling
  if (pc >= 0x023000 && pc <= 0x026FFF) {
    if (hasD005xx) {
      return CATEGORIES.EVENT_LOOP;
    }
    return CATEGORIES.EVENT_LOOP;
  }

  // 0x04BA69: mid-ROM, likely app dispatch
  if (pc >= 0x04B000 && pc <= 0x04BFFF) {
    return CATEGORIES.APP_DISPATCH;
  }

  // 0x05627A-0x0562AB: cluster of 3 writes close together
  if (pc >= 0x056000 && pc <= 0x056FFF) {
    if (hasD005xx) {
      return CATEGORIES.EVENT_SERVICE;
    }
    return CATEGORIES.EVENT_SERVICE;
  }

  // 0x07BA72-0x07BF39: later ROM region
  if (pc >= 0x07B000 && pc <= 0x07BFFF) {
    return CATEGORIES.APP_DISPATCH;
  }

  // 0x080FB2-0x080FCF: pair close together
  if (pc >= 0x080000 && pc <= 0x080FFF) {
    return CATEGORIES.STAT;
  }

  // 0x08C35A-0x08C7A1: cluster of 3
  if (pc >= 0x08C000 && pc <= 0x08CFFF) {
    return CATEGORIES.STAT;
  }

  // 0x09D29E: isolated late-ROM
  if (pc >= 0x09D000 && pc <= 0x09DFFF) {
    return CATEGORIES.APP_DISPATCH;
  }

  return CATEGORIES.UNKNOWN;
}

function isD005xx(addr) {
  return addr >= D005_RANGE_START && addr <= D005_RANGE_END;
}

function main() {
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Analyzing ${WRITE_SITES.length} D0058C write sites`);
  console.log('');

  const results = [];

  for (const site of WRITE_SITES) {
    const rows = disassembleAround(site, 18, 10);
    const category = classifySite(site, rows);

    // Collect context info
    const callTargets = [];
    const memRefs = [];

    for (const row of rows) {
      const inst = row.inst;
      if (!inst) {
        continue;
      }
      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        callTargets.push({ pc: row.pc, target: inst.target });
      }

      const addr = extractAddress(inst);
      if (addr !== null && addr !== 0xD0058C) {
        if (isKeyboardMMIO(addr)) {
          memRefs.push({ pc: row.pc, addr, type: 'KBD_MMIO' });
        } else if (isD005xx(addr)) {
          memRefs.push({ pc: row.pc, addr, type: 'D005xx' });
        }
      }
    }

    results.push({ site, category, rows, callTargets, memRefs });
  }

  // Print per-site disassembly context
  console.log('='.repeat(80));
  console.log('PER-SITE DISASSEMBLY CONTEXT');
  console.log('='.repeat(80));

  for (const result of results) {
    console.log('');
    console.log(`--- ${hex(result.site)} [${result.category}] ---`);

    for (const row of result.rows) {
      const marker = row.pc === result.site ? ' <<<' : '';
      console.log(`  ${hex(row.pc)}: ${row.asm.padEnd(36)}${marker}`);
    }

    if (result.callTargets.length) {
      console.log(`  CALL targets: ${result.callTargets.map((c) => `${hex(c.pc)}->${hex(c.target)}`).join(', ')}`);
    }
    if (result.memRefs.length) {
      console.log(`  Mem refs: ${result.memRefs.map((m) => `${hex(m.pc)}:${m.type}@${hex(m.addr)}`).join(', ')}`);
    }
  }

  // Print summary table grouped by category
  console.log('');
  console.log('='.repeat(80));
  console.log('CLASSIFICATION SUMMARY');
  console.log('='.repeat(80));
  console.log('');

  const grouped = {};
  for (const cat of Object.values(CATEGORIES)) {
    grouped[cat] = [];
  }
  for (const result of results) {
    grouped[result.category].push(result);
  }

  for (const [category, items] of Object.entries(grouped)) {
    if (!items.length) {
      continue;
    }
    console.log(`${category} (${items.length} sites):`);
    for (const item of items) {
      const callInfo = item.callTargets.length
        ? ` calls:[${item.callTargets.map((c) => hex(c.target)).join(',')}]`
        : '';
      const memInfo = item.memRefs.length
        ? ` mem:[${item.memRefs.map((m) => `${m.type}@${hex(m.addr)}`).join(',')}]`
        : '';
      console.log(`  ${hex(item.site)}${callInfo}${memInfo}`);
    }
    console.log('');
  }

  // Address cluster analysis
  console.log('='.repeat(80));
  console.log('ADDRESS CLUSTER ANALYSIS');
  console.log('='.repeat(80));
  console.log('');

  const clusters = [];
  let currentCluster = [WRITE_SITES[0]];

  for (let i = 1; i < WRITE_SITES.length; i++) {
    if (WRITE_SITES[i] - WRITE_SITES[i - 1] < 0x1000) {
      currentCluster.push(WRITE_SITES[i]);
    } else {
      clusters.push([...currentCluster]);
      currentCluster = [WRITE_SITES[i]];
    }
  }
  clusters.push(currentCluster);

  for (const cluster of clusters) {
    const start = cluster[0];
    const end = cluster[cluster.length - 1];
    const span = end - start;
    const cats = [...new Set(cluster.map((s) => results.find((r) => r.site === s).category))];
    console.log(`Cluster ${hex(start)}-${hex(end)} (span ${hex(span, 4)}, ${cluster.length} sites): ${cats.join(', ')}`);
    for (const site of cluster) {
      const r = results.find((res) => res.site === site);
      console.log(`  ${hex(site)} -> ${r.category}`);
    }
    console.log('');
  }
}

main();
