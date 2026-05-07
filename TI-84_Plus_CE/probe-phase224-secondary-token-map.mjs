#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const rom = readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const CLASSIFIER_ENTRY = 0x05C52C;
const INS_DISP_ENTRY = 0x05E630;

const PRIMARY_TABLE = 0x05BF84;
const FE_TABLE = 0x05C01D;
const FE_CONTINUATION_TABLE = 0x05C086;
const FC_TABLE = 0x05C1B0;
const FB_TABLE = 0x05C3AA;
const FA_TABLE = 0x05C4A0;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY5_ADDR = IY_ADDR + 5;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const KBD_RAW_SCAN = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GETKY = 0xD0058D;
const KBD_GETCSC_SCAN = 0xD0058E;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;
const EDIT_BUF = 0xD00A00;
const EDIT_END = 0xD00B00;

const SAMPLE_KEYS = [0x60, 0x68, 0x70, 0x76, 0x7B, 0x80, 0x8F, 0x97, 0x9A, 0xB3];
const MAGIC_CASES = [
  { label: 'Fn(0xFE)', magicA: 0xFE, readExpected: readFnEntry },
  { label: '2nd(0xFC)', magicA: 0xFC, readExpected: readFcEntry },
  { label: 'Alpha(0xFB)', magicA: 0xFB, readExpected: readFbEntry },
  { label: 'AlphaLock(0xFA)', magicA: 0xFA, readExpected: readFaEntry },
];

const COMMON_SECTIONS = [
  { title: 'Range 0x5A-0x67', keys: range(0x5A, 0x67) },
  { title: 'Range 0x68-0x7F', keys: range(0x68, 0x7F) },
  { title: 'Math ops + digits', keys: [...range(0x80, 0x84), ...range(0x8E, 0x97)] },
  { title: 'Letters', keys: range(0x9A, 0xB3) },
];

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks
        .filter((block) => block?.id)
        .map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function hex(value, width = 2) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatWordValue(value) {
  return hex(value & 0xFFFF, 4);
}

function formatWordBytes(hi, lo) {
  return formatWordValue(((hi & 0xFF) << 8) | (lo & 0xFF));
}

function formatEditPair(first, second) {
  return `${hex(first & 0xFF)} ${hex(second & 0xFF)}`;
}

function labelForKeyCode(keyCode) {
  const operators = {
    0x80: '+',
    0x81: '-',
    0x82: '*',
    0x83: '/',
    0x84: '^',
  };

  if (operators[keyCode]) {
    return operators[keyCode];
  }
  if (keyCode >= 0x8E && keyCode <= 0x97) {
    return String(keyCode - 0x8E);
  }
  if (keyCode >= 0x9A && keyCode <= 0xB3) {
    return String.fromCharCode(0x41 + (keyCode - 0x9A));
  }
  return '';
}

function readPrimaryEntry(keyCode) {
  if (keyCode < 0x5A || keyCode > 0xFF) {
    return '--';
  }
  const byte = rom[PRIMARY_TABLE + keyCode - 0x5A] & 0xFF;
  return hex(byte);
}

function readFnEntry(keyCode) {
  if (keyCode < 0x69) {
    const value = rom[FE_TABLE + keyCode] & 0xFF;
    return {
      mode: 'Fn(0xFE)',
      branch: 'FE direct',
      addr: FE_TABLE + keyCode,
      text: formatWordValue(value),
      zero: value === 0,
    };
  }

  const adjusted = keyCode - 0x69;
  const addr = FE_CONTINUATION_TABLE + adjusted * 2;
  const hi = rom[addr] & 0xFF;
  const lo = rom[addr + 1] & 0xFF;
  return {
    mode: 'Fn(0xFE)',
    branch: 'FE continuation',
    addr,
    text: formatWordBytes(hi, lo),
    zero: hi === 0 && lo === 0,
  };
}

function readFcEntry(keyCode) {
  const addr = FC_TABLE + keyCode * 2;
  const hi = rom[addr] & 0xFF;
  const lo = rom[addr + 1] & 0xFF;
  return {
    mode: '2nd(0xFC)',
    branch: 'FC pair',
    addr,
    text: formatWordBytes(hi, lo),
    zero: hi === 0 && lo === 0,
  };
}

function readFbEntry(keyCode) {
  const adjusted = keyCode >= 0x8C ? keyCode - 0x7F : keyCode;
  const addr = FB_TABLE + adjusted * 2;
  const hi = rom[addr] & 0xFF;
  const lo = rom[addr + 1] & 0xFF;
  return {
    mode: 'Alpha(0xFB)',
    branch: keyCode >= 0x8C ? 'FB pair (-0x7F)' : 'FB pair',
    addr,
    text: formatWordBytes(hi, lo),
    zero: hi === 0 && lo === 0,
  };
}

function readFaEntry(keyCode) {
  if (keyCode >= 0x44) {
    return {
      mode: 'AlphaLock(0xFA)',
      branch: 'FA bounds fail',
      addr: null,
      text: '0x0000',
      zero: true,
    };
  }

  const addr = FA_TABLE + keyCode * 2;
  const hi = rom[addr] & 0xFF;
  const lo = rom[addr + 1] & 0xFF;
  return {
    mode: 'AlphaLock(0xFA)',
    branch: 'FA pair',
    addr,
    text: formatWordBytes(hi, lo),
    zero: hi === 0 && lo === 0,
  };
}

function buildRomMapRow(keyCode) {
  return {
    keyCode: hex(keyCode),
    label: labelForKeyCode(keyCode),
    primary: readPrimaryEntry(keyCode),
    fn: readFnEntry(keyCode).text,
    second: readFcEntry(keyCode).text,
    alpha: readFbEntry(keyCode).text,
    alphaLock: readFaEntry(keyCode).text,
  };
}

function renderTable(columns, rows) {
  const header = `| ${columns.map((column) => column.title).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map(
    (row) => `| ${columns.map((column) => row[column.key] ?? '').join(' | ')} |`,
  );
  return [header, divider, ...body].join('\n');
}

function write24(mem, addr, value) {
  const normalized = addr & 0xFFFFFF;
  mem[normalized] = value & 0xFF;
  mem[normalized + 1] = (value >>> 8) & 0xFF;
  mem[normalized + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const normalized = addr & 0xFFFFFF;
  return (
    (mem[normalized] & 0xFF) |
    ((mem[normalized + 1] & 0xFF) << 8) |
    ((mem[normalized + 2] & 0xFF) << 16)
  ) >>> 0;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stopError(name) {
  const error = new Error('__PHASE224_STOP__');
  error.stopName = name;
  return error;
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetCpuState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP, EDIT_BUF);
  write24(mem, EDIT_CURSOR, EDIT_BUF);
  write24(mem, EDIT_TAIL, EDIT_END);
  write24(mem, EDIT_BTM, EDIT_END);
  mem.fill(0x00, EDIT_BUF, EDIT_END);
}

function seedKeyboardScratch(mem, keyCode) {
  const value = keyCode & 0xFF;
  mem[KBD_RAW_SCAN] = value;
  mem[KBD_KEY] = value;
  mem[KBD_GETKY] = value;
  mem[KBD_GETCSC_SCAN] = value;
}

function bootBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

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
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  resetCpuState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInitReturned = false;
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE224_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  return {
    memory: new Uint8Array(mem),
    memInitReturned,
  };
}

function detectObservedBranch(magicA, visitedBlocks) {
  if (magicA === 0xFE) {
    if (visitedBlocks.includes(0x05C59B)) return 'FE direct';
    if (visitedBlocks.includes(0x05C5A1)) return 'FE continuation';
  }
  if (magicA === 0xFC && visitedBlocks.includes(0x05C589)) {
    return 'FC pair';
  }
  if (magicA === 0xFB && visitedBlocks.includes(0x05C579)) {
    return 'FB pair';
  }
  if (magicA === 0xFA) {
    if (visitedBlocks.includes(0x05C566) && visitedBlocks.includes(0x05C574)) {
      return 'FA bounds fail';
    }
    if (visitedBlocks.includes(0x05C566) && visitedBlocks.includes(0x05C5A7)) {
      return 'FA pair';
    }
  }
  return 'unknown';
}

function runClassifierCase(baselineMemory, keyCode, magicCase) {
  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetCpuState(cpu, mem);
  seedEditBuffer(mem);
  seedKeyboardScratch(mem, keyCode);
  mem[IY5_ADDR] |= 0x10;

  cpu.a = magicCase.magicA & 0xFF;
  push24(cpu, mem, RETURN_SENTINEL);

  const visitedBlocks = [];
  let termination = 'unknown';

  try {
    executor.runFrom(CLASSIFIER_ENTRY, 'adl', {
      maxSteps: 100,
      maxLoopIterations: 128,
      onBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (normalized === RETURN_SENTINEL) {
          throw stopError('return_sentinel');
        }
        visitedBlocks.push(normalized);
      },
      onMissingBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (normalized === RETURN_SENTINEL) {
          throw stopError('return_sentinel');
        }
        visitedBlocks.push(normalized);
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE224_STOP__' && error.stopName === 'return_sentinel') {
      termination = 'sentinel';
    } else {
      throw error;
    }
  }

  const expected = magicCase.readExpected(keyCode);
  const observed = formatWordBytes(cpu.d, cpu.e);
  const editCursor = read24(mem, EDIT_CURSOR);

  return {
    keyCode: hex(keyCode),
    magicA: hex(magicCase.magicA),
    branch: detectObservedBranch(magicCase.magicA, visitedBlocks),
    expected: expected.text,
    observed,
    match: observed === expected.text ? 'yes' : 'NO',
    cursorDelta: `+${editCursor - EDIT_BUF}`,
    editBytes: formatEditPair(mem[EDIT_BUF], mem[EDIT_BUF + 1]),
    termination,
  };
}

function summarizeZeroReturns(rows) {
  const allKeys = rows.map((row) => row.keyCode);
  const groups = [
    { title: 'Fn(0xFE)', key: 'fn' },
    { title: '2nd(0xFC)', key: 'second' },
    { title: 'Alpha(0xFB)', key: 'alpha' },
    { title: 'AlphaLock(0xFA)', key: 'alphaLock' },
  ];

  return groups.map((group) => {
    const zeroKeys = rows
      .filter((row) => row[group.key] === '0x0000')
      .map((row) => row.keyCode);

    if (zeroKeys.length === 0) {
      return `- ${group.title}: none`;
    }
    if (zeroKeys.length === allKeys.length) {
      return `- ${group.title}: all ${allKeys.length} requested common keys`;
    }
    return `- ${group.title}: ${zeroKeys.join(', ')}`;
  });
}

function main() {
  const baseline = bootBaseline();
  const sectionRows = COMMON_SECTIONS.map((section) => ({
    title: section.title,
    rows: section.keys.map(buildRomMapRow),
  }));
  const allRows = sectionRows.flatMap((section) => section.rows);

  const dynamicRows = [];
  for (const keyCode of SAMPLE_KEYS) {
    for (const magicCase of MAGIC_CASES) {
      dynamicRows.push(runClassifierCase(baseline.memory, keyCode, magicCase));
    }
  }

  const mismatches = dynamicRows.filter((row) => row.match !== 'yes');

  console.log('# Phase 224 Secondary Token Map');
  console.log('');
  console.log(`- ROM source: ${path.basename(ROM_PATH)}`);
  console.log(
    `- Dynamic verifier entry: ${hex(CLASSIFIER_ENTRY, 6)} (ConvKeyToTok). ${hex(INS_DISP_ENTRY, 6)} is InsDisp, so the magic-A sweep calls the classifier directly.`,
  );
  console.log(
    `- Fn/0xFE uses ${hex(FE_TABLE, 6)} for keyCode < 0x69 and renders those direct 1-byte lookups as 0x00XX; keyCode >= 0x69 switches to ${hex(FE_CONTINUATION_TABLE, 6)}.`,
  );
  console.log(
    `- AlphaLock/0xFA only accepts keyCode < 0x44. Out-of-range rows are reported as 0x0000.`,
  );
  console.log(`- Boot baseline memInit returned: ${baseline.memInitReturned ? 'yes' : 'no'}`);
  console.log('');
  console.log('## ROM-derived map');

  for (const section of sectionRows) {
    console.log('');
    console.log(`### ${section.title}`);
    console.log('');
    console.log(
      renderTable(
        [
          { key: 'keyCode', title: 'KeyCode' },
          { key: 'label', title: 'Label' },
          { key: 'primary', title: 'Primary' },
          { key: 'fn', title: 'Fn(0xFE)' },
          { key: 'second', title: '2nd(0xFC)' },
          { key: 'alpha', title: 'Alpha(0xFB)' },
          { key: 'alphaLock', title: 'AlphaLock(0xFA)' },
        ],
        section.rows,
      ),
    );
  }

  console.log('');
  console.log('## Dynamic verification (10 keys x 4 magic A values)');
  console.log('');
  console.log(
    renderTable(
      [
        { key: 'keyCode', title: 'KeyCode' },
        { key: 'magicA', title: 'MagicA' },
        { key: 'branch', title: 'Branch' },
        { key: 'expected', title: 'Expected DE' },
        { key: 'observed', title: 'Observed DE' },
        { key: 'cursorDelta', title: 'Cursor+' },
        { key: 'editBytes', title: 'Edit[0..1]' },
        { key: 'termination', title: 'Term' },
        { key: 'match', title: 'Match' },
      ],
      dynamicRows,
    ),
  );

  console.log('');
  console.log('## Zero-return summary');
  console.log('');
  for (const line of summarizeZeroReturns(allRows)) {
    console.log(line);
  }

  console.log('');
  console.log('## Dynamic mismatches');
  console.log('');
  if (mismatches.length === 0) {
    console.log('None.');
    return;
  }

  console.log(
    renderTable(
      [
        { key: 'keyCode', title: 'KeyCode' },
        { key: 'magicA', title: 'MagicA' },
        { key: 'expected', title: 'Expected DE' },
        { key: 'observed', title: 'Observed DE' },
        { key: 'branch', title: 'Branch' },
        { key: 'editBytes', title: 'Edit[0..1]' },
      ],
      mismatches,
    ),
  );
}

main();
