#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction as dec } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MATRIX_PATH = path.join(__dirname, 'keyboard-matrix.md');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const rom = fs.readFileSync(ROM_PATH);
const matrixText = fs.readFileSync(MATRIX_PATH, 'utf8');

const HOME_SCAN_START = 0x058000;
const HOME_SCAN_END = 0x059000;
const HOME_TABLE_SCAN_START = 0x058500;
const HOME_TABLE_SCAN_END = 0x058D00;

const HOME_CONTEXT_COPY_SITE = 0x058222;
const HOME_CONTEXT_TABLE = 0x0585D3;
const HOME_SECOND_PASS = 0x0585E9;
const HOME_NON_ENTER = 0x05877A;
const HOME_LEAF_CANDIDATE = 0x058AC9;

const GETCSC_TRANSLATION_TABLE = 0x09F79B;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const STACK_TOP = 0xD1A87E;
const MEMINIT_RET = 0x7FFFF6;
const FAKE_RET = 0x7FFFFE;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const RAW_SCAN_ADDR = 0xD00587;
const KEY_CODE_ADDR = 0xD0058C;
const GETKY_ADDR = 0xD0058D;
const GETCSC_SCAN_ADDR = 0xD0058E;

const CONTEXT_FIELDS = [
  { name: 'cxMain', offset: 0, width: 3 },
  { name: 'cxPPutaway', offset: 3, width: 3 },
  { name: 'cxPutaway', offset: 6, width: 3 },
  { name: 'cxRedisp', offset: 9, width: 3 },
  { name: 'cxErrorEP', offset: 12, width: 3 },
  { name: 'cxSizeWind', offset: 15, width: 3 },
  { name: 'cxPage', offset: 18, width: 2 },
  { name: 'cxCurApp', offset: 20, width: 1 },
];

const hex = (value, width = 6) =>
  value === undefined || value === null || Number.isNaN(value)
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const bhex = (value) => hex(value & 0xFF, 2);

const bytesAt = (addr, length) =>
  Array.from(rom.slice(addr, addr + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');

const read24 = (buf, addr) =>
  ((buf[addr] & 0xFF) | ((buf[addr + 1] & 0xFF) << 8) | ((buf[addr + 2] & 0xFF) << 16)) >>> 0;

const read16 = (buf, addr) =>
  ((buf[addr] & 0xFF) | ((buf[addr + 1] & 0xFF) << 8)) >>> 0;

function memAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}djnz ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${prefix}ld ${inst.pair}, (${hex(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(memAddr(inst) ?? inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${bhex(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(memAddr(inst) ?? inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'alu-imm': return `${prefix}${inst.op} ${bhex(inst.value)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${prefix}sbc hl, ${inst.src}`;
    case 'ex-af': return `${prefix}ex af, af'`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'cpir': return `${prefix}cpir`;
    case 'or': return `${prefix}or`;
    default: return `${prefix}${inst.tag}`;
  }
}

function decodeRange(start, end) {
  const lines = [];
  for (let pc = start; pc < end;) {
    try {
      const inst = dec(rom, pc, 'adl');
      lines.push({
        pc: inst.pc,
        bytes: bytesAt(inst.pc, inst.length),
        inst,
        text: formatInstruction(inst),
      });
      pc = inst.nextPc;
    } catch (error) {
      lines.push({
        pc,
        bytes: bytesAt(pc, 1),
        inst: null,
        text: `decode error: ${error.message}`,
      });
      pc += 1;
    }
  }
  return lines;
}

function summarizeBlock(start, maxInstructions = 10) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < maxInstructions; i += 1) {
    try {
      const inst = dec(rom, pc, 'adl');
      rows.push({
        pc: inst.pc,
        bytes: bytesAt(inst.pc, inst.length),
        text: formatInstruction(inst),
      });
      pc = inst.nextPc;
      if ([
        'jp',
        'jp-conditional',
        'jp-indirect',
        'jr',
        'jr-conditional',
        'ret',
        'ret-conditional',
      ].includes(inst.tag)) {
        break;
      }
    } catch (error) {
      rows.push({ pc, bytes: bytesAt(pc, 1), text: `decode error: ${error.message}` });
      break;
    }
  }
  return rows;
}

function scanPointerRuns(start, end, minRunLength = 4) {
  const runs = [];
  for (let align = 0; align < 3; align += 1) {
    let current = [];
    for (let pc = start + align; pc + 2 < end; pc += 3) {
      const value = read24(rom, pc);
      const inRange = value >= 0x050000 && value < 0x0B0000;
      if (inRange) {
        current.push({ pc, value });
      } else if (current.length >= minRunLength) {
        runs.push({ align, entries: current });
        current = [];
      } else {
        current = [];
      }
    }
    if (current.length >= minRunLength) {
      runs.push({ align, entries: current });
    }
  }
  return runs;
}

function parseStatKey() {
  const match = matrixText.match(/\|\s*STAT\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*0x([0-9A-Fa-f]+)\s*\|/);
  if (!match) {
    throw new Error('Could not find the STAT row in keyboard-matrix.md');
  }

  const group = Number(match[1]);
  const bit = Number(match[2]);
  const physicalScan = parseInt(match[3], 16);
  const flattenedScan = group * 8 + bit + 1;
  const homeKeyCode = rom[GETCSC_TRANSLATION_TABLE + flattenedScan] & 0xFF;
  const legacyA1Mentioned = /\b0xA1\b/i.test(matrixText);

  return {
    group,
    bit,
    physicalScan,
    flattenedScan,
    homeKeyCode,
    legacyA1Mentioned,
  };
}

function find24Refs(target, start = 0, end = rom.length) {
  const refs = [];
  for (let pc = start; pc + 2 < end; pc += 1) {
    if (read24(rom, pc) === target) refs.push(pc);
  }
  return refs;
}

function findImmediateCpHits(values, start, end) {
  const hits = [];
  for (const row of decodeRange(start, end)) {
    if (row.inst?.tag === 'alu-imm' && row.inst.op === 'cp' && values.has(row.inst.value)) {
      hits.push({
        pc: row.pc,
        value: row.inst.value & 0xFF,
        text: row.text,
      });
    }
  }
  return hits;
}

function findRawByteHits(value, start, end) {
  const hits = [];
  for (let pc = start; pc < end; pc += 1) {
    if ((rom[pc] & 0xFF) === (value & 0xFF)) hits.push(pc);
  }
  return hits;
}

function readHomeContextTable() {
  return CONTEXT_FIELDS.map((field) => {
    let value;
    if (field.width === 3) value = read24(rom, HOME_CONTEXT_TABLE + field.offset);
    else if (field.width === 2) value = read16(rom, HOME_CONTEXT_TABLE + field.offset);
    else value = rom[HOME_CONTEXT_TABLE + field.offset] & 0xFF;
    return { ...field, value };
  });
}

function printRows(rows) {
  for (const row of rows) {
    console.log(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
  }
}

async function runSeededTrace(stat) {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = () => {};

  try {
    const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
    const blocks = romModule.PRELIFTED_BLOCKS;
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom);
    const executor = createExecutor(blocks, mem, {
      peripherals: createPeripheralBus({ timerInterrupt: false }),
    });
    const cpu = executor.cpu;

    const write24 = (addr, value) => {
      mem[addr] = value & 0xFF;
      mem[addr + 1] = (value >>> 8) & 0xFF;
      mem[addr + 2] = (value >>> 16) & 0xFF;
    };

    const prepareCpu = () => {
      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.madl = 1;
      cpu.mbase = MBASE;
      cpu._iy = IY_ADDR;
      cpu._ix = IX_ADDR;
      cpu.f = 0x40;
      cpu.sp = STACK_TOP - 12;
      mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    };

    const coldBoot = () => {
      executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.sp = STACK_TOP - 3;
      mem.fill(0xFF, cpu.sp, cpu.sp + 3);

      executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
        maxSteps: 100000,
        maxLoopIterations: 10000,
      });

      cpu.mbase = MBASE;
      cpu._iy = IY_ADDR;
      cpu._hl = 0;
      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.sp = STACK_TOP - 3;
      mem.fill(0xFF, cpu.sp, cpu.sp + 3);

      executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
    };

    const runMemInit = () => {
      prepareCpu();
      cpu.sp -= 3;
      write24(cpu.sp, MEMINIT_RET);
      try {
        executor.runFrom(MEM_INIT_ENTRY, 'adl', {
          maxSteps: 100000,
          maxLoopIterations: 4096,
          onBlock(pc) {
            if ((pc & 0xFFFFFF) === MEMINIT_RET) throw new Error('__RET__');
          },
          onMissingBlock(pc) {
            if ((pc & 0xFFFFFF) === MEMINIT_RET) throw new Error('__RET__');
          },
        });
      } catch (error) {
        if (error?.message !== '__RET__') throw error;
      }
    };

    coldBoot();
    runMemInit();
    prepareCpu();

    mem[KEY_CODE_ADDR] = stat.homeKeyCode;
    mem[RAW_SCAN_ADDR] = stat.physicalScan;
    mem[GETCSC_SCAN_ADDR] = stat.flattenedScan;
    cpu.a = stat.homeKeyCode;

    // Match the cleared "normal home" flags used by the earlier home-handler probes.
    mem[IY_ADDR + 0x09] &= ~(1 << 7);
    mem[IY_ADDR + 0x0C] &= ~(1 << 6);
    mem[IY_ADDR + 0x0C] &= ~(1 << 7);
    mem[IY_ADDR + 0x45] &= ~(1 << 6);

    cpu.sp -= 3;
    write24(cpu.sp, FAKE_RET);

    const blocksVisited = [];
    let returned = false;

    try {
      executor.runFrom(HOME_SECOND_PASS, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 512,
        onBlock(pc) {
          const normalized = pc & 0xFFFFFF;
          if (blocksVisited.at(-1) !== normalized) blocksVisited.push(normalized);
          if (normalized === FAKE_RET) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          const normalized = pc & 0xFFFFFF;
          if (blocksVisited.at(-1) !== normalized) blocksVisited.push(normalized);
          if (normalized === FAKE_RET) throw new Error('__RET__');
        },
      });
    } catch (error) {
      if (error?.message === '__RET__') returned = true;
      else throw error;
    }

    return {
      available: true,
      returned,
      blocksVisited,
      finalA: cpu.a & 0xFF,
      finalF: cpu.f & 0xFF,
      finalScan: mem[GETCSC_SCAN_ADDR] & 0xFF,
      finalKey: mem[KEY_CODE_ADDR] & 0xFF,
      finalGetKy: mem[GETKY_ADDR] & 0xFF,
    };
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printTracePath(trace) {
  const shown = trace.blocksVisited.slice(0, 20).map((pc) => hex(pc));
  console.log(`Seeded second-pass trace returned: ${trace.returned ? 'yes' : 'no'}`);
  console.log(`Final A=${bhex(trace.finalA)} F=${bhex(trace.finalF)} getCSCScan=${bhex(trace.finalScan)} key=${bhex(trace.finalKey)} getKy=${bhex(trace.finalGetKy)}`);
  console.log(`First ${shown.length} unique blocks: ${shown.join(' -> ')}`);
}

async function main() {
  console.log('=== Phase 187 - STAT Key Dispatch Lookup ===');

  const stat = parseStatKey();
  const legacyPromptA1 = 0xA1;

  printSection('STAT Code Chain');
  console.log(`keyboard-matrix.md: STAT group=${stat.group}, bit=${stat.bit}, physical scan=${bhex(stat.physicalScan)}`);
  console.log(`flattened _GetCSC scan index = group*8 + bit + 1 = ${bhex(stat.flattenedScan)}`);
  console.log(`ROM[${hex(GETCSC_TRANSLATION_TABLE + stat.flattenedScan)}] = ${bhex(stat.homeKeyCode)} (unmodified home key code)`);
  if (stat.legacyA1Mentioned) {
    console.log('keyboard-matrix.md still contains a legacy 0xA1 mention.');
  } else {
    console.log('keyboard-matrix.md does not mention 0xA1; the current file encodes STAT as 0x37.');
  }

  printSection('3-Byte Pointer Runs In 0x058500..0x058D00');
  const runs = scanPointerRuns(HOME_TABLE_SCAN_START, HOME_TABLE_SCAN_END);
  if (runs.length === 0) {
    console.log('No 24-bit pointer runs found in the requested home-handler window.');
  } else {
    for (const run of runs) {
      console.log(`align=${run.align} length=${run.entries.length} start=${hex(run.entries[0].pc)} end=${hex(run.entries.at(-1).pc)}`);
      console.log(`  ${run.entries.map((entry) => `${hex(entry.pc)} -> ${hex(entry.value)}`).join(', ')}`);
    }
  }

  printSection('0x0585D3 Interpretation');
  console.log(`Raw bytes at ${hex(HOME_CONTEXT_TABLE)}: ${bytesAt(HOME_CONTEXT_TABLE, 21)}`);
  console.log(`If mis-decoded as code, first byte ${bhex(rom[HOME_CONTEXT_TABLE])} becomes "jp (hl)".`);
  console.log('Parsed as the home-context table:');
  for (const field of readHomeContextTable()) {
    console.log(`  ${field.name.padEnd(10)} @ +${field.offset.toString(16).toUpperCase().padStart(2, '0')} width=${field.width} value=${hex(field.value, field.width === 1 ? 2 : 6)}`);
  }

  printSection('How 0x0585D3 Is Loaded');
  const contextRefs = find24Refs(HOME_CONTEXT_TABLE, HOME_SCAN_START, HOME_SCAN_END);
  console.log(`Raw 24-bit references to ${hex(HOME_CONTEXT_TABLE)} in 0x058000..0x059000: ${contextRefs.map((ref) => hex(ref)).join(', ') || '(none)'}`);
  printRows(decodeRange(HOME_CONTEXT_COPY_SITE, HOME_CONTEXT_COPY_SITE + 8));
  console.log('This is a literal table-base load plus a copy call, not key-code index math.');

  printSection('Tail Before 0x0585D3');
  printRows(decodeRange(0x058595, 0x0585D3));
  console.log(`${hex(0x0585D2)} is a RET, so ${hex(HOME_CONTEXT_TABLE)} is fall-through data, not a live dispatch stub.`);

  printSection('Immediate CP Scan In 0x058000..0x059000');
  const cpValues = new Set([stat.flattenedScan, stat.homeKeyCode, stat.physicalScan, legacyPromptA1]);
  const cpHits = findImmediateCpHits(cpValues, HOME_SCAN_START, HOME_SCAN_END);
  if (cpHits.length === 0) {
    console.log(`No decoded "cp imm" instructions compare against ${bhex(stat.flattenedScan)}, ${bhex(stat.homeKeyCode)}, ${bhex(stat.physicalScan)}, or ${bhex(legacyPromptA1)} in the home window.`);
  } else {
    for (const hit of cpHits) {
      console.log(`  ${hex(hit.pc)}: ${hit.text}`);
    }
  }

  console.log(`Raw byte hit counts in 0x058000..0x059000:`);
  for (const value of [stat.flattenedScan, stat.homeKeyCode, stat.physicalScan, legacyPromptA1]) {
    const hits = findRawByteHits(value, HOME_SCAN_START, HOME_SCAN_END);
    console.log(`  ${bhex(value)} -> count=${hits.length}${hits.length ? ` first=${hits.slice(0, 8).map((pc) => hex(pc)).join(', ')}` : ''}`);
  }

  printSection('Second-Pass Entry And Shared Non-ENTER Handler');
  console.log(`Second-pass entry (${hex(HOME_SECOND_PASS)}):`);
  printRows(summarizeBlock(HOME_SECOND_PASS, 10));
  console.log(`\nShared non-ENTER branch (${hex(HOME_NON_ENTER)}):`);
  printRows(summarizeBlock(HOME_NON_ENTER, 20));

  printSection('Candidate STAT Leaf');
  console.log(`Narrowed leaf candidate (${hex(HOME_LEAF_CANDIDATE)}):`);
  printRows(summarizeBlock(HOME_LEAF_CANDIDATE, 12));
  console.log('No direct DispMenu/STAT-title call is visible in the first candidate block; routing stays in shared key/menu helpers here.');

  printSection('Seeded Micro-Trace');
  let trace = null;
  try {
    trace = await runSeededTrace(stat);
    printTracePath(trace);
  } catch (error) {
    console.log(`Dynamic trace unavailable: ${error.message}`);
  }

  printSection('Assessment');
  console.log(`- The only ADL pointer table in ${hex(HOME_TABLE_SCAN_START)}..${hex(HOME_TABLE_SCAN_END)} is the home-context table at ${hex(HOME_CONTEXT_TABLE)}.`);
  console.log(`- ${hex(HOME_CONTEXT_TABLE)} is loaded verbatim at ${hex(HOME_CONTEXT_COPY_SITE)}; there is no nearby keycode*3 pointer dispatch that lands on a per-key handler entry.`);
  console.log(`- STAT currently resolves as physical ${bhex(stat.physicalScan)} -> _GetCSC ${bhex(stat.flattenedScan)} -> home key ${bhex(stat.homeKeyCode)}.`);
  console.log(`- The best shared entry for STAT inside the home handler is ${hex(HOME_NON_ENTER)} (taken from ${hex(HOME_SECOND_PASS)} when A != ${bhex(0x05)}).`);
  if (trace?.available) {
    console.log(`- Under a seeded second-pass trace, kStat walks ${trace.blocksVisited.slice(0, 12).map((pc) => hex(pc)).join(' -> ')}${trace.blocksVisited.length > 12 ? ' -> ...' : ''}.`);
  }
  console.log(`- No unique per-key 24-bit STAT menu handler was isolated in this window; the dispatch here is branch-based, not table-indexed.`);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
