#!/usr/bin/env node

/**
 * Phase 282: trace 0x09EE86 helper
 *
 * Tasks:
 *   1. Static disassembly of 0x09EE86-0x09EE94.
 *   2. Static disassembly of 0x000138 and its trampoline target.
 *   3. 64-byte ASCII/hex dump at 0x09EF36.
 *   4. Dynamic trace of 0x09EE86 with initial Z=1 and Z=0.
 *   5. Direct caller scan for ADL CALL/JP references to 0x09EE86.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const MEM_SIZE = 0x1000000;
const TARGET = 0x09EE86;
const TARGET_LEN = 15;
const ENTRY_0138 = 0x000138;
const ENTRY_0138_LEN = 4;
const TRAMPOLINE_TARGET = 0x0021C2;
const TRAMPOLINE_TARGET_LEN = 12;
const STRING_ADDR = 0x09EF36;
const STRING_DUMP_LEN = 64;
const RETURN_SENTINEL = 0xFEFEFE;
const TRACE_SP = 0xD1A870;
const TRACE_IX = 0xD1A860;
const TRACE_IY = 0xD00080;
const TRACE_STEPS = 500;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function read24LE(bytes, offset) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

function write24(mem, addr, value) {
  const base = addr & 0xFFFFFF;
  mem[base] = value & 0xFF;
  mem[(base + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(base + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function asciiPreview(bytes) {
  return Array.from(bytes)
    .map((b) => {
      if (b === 0x00) return '.';
      return b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.';
    })
    .join('');
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  switch (inst.tag) {
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'nop':
      return 'nop';
    case 'ex-de-hl':
      return 'ex de, hl';
    default:
      return inst.dasm ?? inst.tag;
  }
}

async function loadProjectModules() {
  const decoderUrl = pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href;
  const runtimeUrl = pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href;
  const peripheralsUrl = pathToFileURL(path.join(__dirname, 'peripherals.js')).href;
  const transpiledUrl = pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href;

  const [{ decodeInstruction }, { createExecutor }, { createPeripheralBus }, romModule] =
    await Promise.all([
      import(decoderUrl),
      import(runtimeUrl),
      import(peripheralsUrl),
      import(transpiledUrl),
    ]);

  return {
    decodeInstruction,
    createExecutor,
    createPeripheralBus,
    preliftedBlocks:
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule,
  };
}

function disasmRange(decodeInstruction, start, byteLength) {
  const rows = [];
  let pc = start;
  const end = start + byteLength;

  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      bytes: bytesAt(pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc += length;
  }

  return rows;
}

function dumpStringRegion(addr, byteLength) {
  const rows = [];

  for (let offset = 0; offset < byteLength; offset += 16) {
    const slice = rom.subarray(addr + offset, addr + offset + 16);
    rows.push({
      addr: addr + offset,
      bytes: Array.from(slice).map((b) => b.toString(16).padStart(2, '0')).join(' '),
      ascii: asciiPreview(slice),
    });
  }

  return rows;
}

function scanPattern(pattern) {
  const hits = [];

  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let ok = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }

  return hits;
}

function runTrace(createExecutor, createPeripheralBus, preliftedBlocks, initialZ, fallbackFormatter) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const bus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(preliftedBlocks, mem, { peripherals: bus });
  const cpu = executor.cpu;

  cpu.pc = TARGET;
  cpu.sp = TRACE_SP;
  cpu.ix = TRACE_IX;
  cpu.iy = TRACE_IY;
  cpu.hl = 0x123456;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = initialZ ? 0x40 : 0x00;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  write24(mem, cpu.sp, RETURN_SENTINEL);

  const blocks = [];
  const missing = [];

  const result = executor.runFrom(TARGET, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: 100,
    onBlock(pc, mode, meta, step) {
      blocks.push({
        step,
        pc: pc & 0xFFFFFF,
        dasm:
          meta?.instructions?.map((inst) => inst.dasm ?? fallbackFormatter(inst)).join(' | ') || '',
      });
    },
    onMissingBlock(pc, mode, step) {
      missing.push({ step, pc: pc & 0xFFFFFF, mode });
    },
  });

  return {
    initialZ,
    result,
    final: {
      hl: cpu.hl & 0xFFFFFF,
      f: cpu.f & 0xFF,
      sp: cpu.sp & 0xFFFFFF,
    },
    blocks,
    missing,
  };
}

async function main() {
  const {
    decodeInstruction,
    createExecutor,
    createPeripheralBus,
    preliftedBlocks,
  } = await loadProjectModules();

  const helperRows = disasmRange(decodeInstruction, TARGET, TARGET_LEN);
  const entryRows = disasmRange(decodeInstruction, ENTRY_0138, ENTRY_0138_LEN);
  const trampolineRows = disasmRange(
    decodeInstruction,
    TRAMPOLINE_TARGET,
    TRAMPOLINE_TARGET_LEN
  );
  const stringRows = dumpStringRegion(STRING_ADDR, STRING_DUMP_LEN);

  const traceZ1 = runTrace(
    createExecutor,
    createPeripheralBus,
    preliftedBlocks,
    true,
    formatInstruction
  );
  const traceZ0 = runTrace(
    createExecutor,
    createPeripheralBus,
    preliftedBlocks,
    false,
    formatInstruction
  );

  const callHits = scanPattern([0xCD, 0x86, 0xEE, 0x09]);
  const jpHits = scanPattern([0xC3, 0x86, 0xEE, 0x09]);

  const lines = [];
  lines.push('Phase 282 Probe: 0x09EE86 helper');
  lines.push('');

  lines.push('PART 1: Static disassembly of 0x09EE86-0x09EE94');
  for (const row of helperRows) {
    lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.text}`);
  }
  lines.push('');

  lines.push('PART 2: OS entry 0x000138');
  for (const row of entryRows) {
    lines.push(`  ${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.text}`);
  }
  lines.push(`  trampoline target: ${hex(read24LE(rom, ENTRY_0138 + 1))}`);
  lines.push('  target body at 0x0021C2:');
  for (const row of trampolineRows) {
    lines.push(`    ${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.text}`);
  }
  lines.push(
    '  summary: 0x000138 jumps to 0x0021C2, which compares HL against 0 with `or a; sbc hl,de`, preserves HL/DE, and returns with flags set from the compare.'
  );
  lines.push('');

  lines.push('PART 3: ROM bytes at 0x09EF36');
  for (const row of stringRows) {
    lines.push(`  ${hex(row.addr)}  ${row.bytes.padEnd(47)}  ${row.ascii}`);
  }
  lines.push('  first C-string: "TI-84 Plus CE"');
  lines.push('');

  function appendTrace(trace) {
    lines.push(
      `PART 4: Dynamic trace (Z=${trace.initialZ ? '1' : '0'} initial F=${hex(
        trace.initialZ ? 0x40 : 0x00,
        2
      )})`
    );
    lines.push(
      `  result: steps=${trace.result.steps} termination=${trace.result.termination} lastPc=${hex(
        trace.result.lastPc
      )} lastMode=${trace.result.lastMode}`
    );
    lines.push(
      `  final: HL=${hex(trace.final.hl)} F=${hex(trace.final.f, 2)} SP=${hex(
        trace.final.sp
      )} missing=${trace.missing.map((m) => hex(m.pc)).join(', ') || '(none)'}`
    );
    for (const block of trace.blocks) {
      lines.push(
        `    step ${String(block.step).padStart(2, ' ')}  ${hex(block.pc)}  ${block.dasm}`
      );
    }
    lines.push('');
  }

  appendTrace(traceZ1);
  appendTrace(traceZ0);
  lines.push(
    '  note: initial Z does not matter here. The helper zeroes HL before the call, and 0x0021C2 recomputes flags from HL-0, so both traces return the same HL=0x09EF36.'
  );
  lines.push('');

  lines.push('PART 5: Direct callers of 0x09EE86');
  lines.push(`  ADL CALL pattern (CD 86 EE 09): ${callHits.length} hit(s)`);
  for (const hit of callHits) {
    const inst = decodeInstruction(rom, hit, 'adl');
    lines.push(`    ${hex(hit)}  ${bytesAt(hit, inst.length).padEnd(17)}  ${formatInstruction(inst)}`);
  }
  lines.push(`  ADL JP pattern   (C3 86 EE 09): ${jpHits.length} hit(s)`);
  for (const hit of jpHits) {
    const inst = decodeInstruction(rom, hit, 'adl');
    lines.push(`    ${hex(hit)}  ${bytesAt(hit, inst.length).padEnd(17)}  ${formatInstruction(inst)}`);
  }

  console.log(lines.join('\n'));
}

await main();

/*
Phase 282 Probe: 0x09EE86 helper

PART 1: Static disassembly of 0x09EE86-0x09EE94
  0x09EE86  21 00 00 00        ld hl, 0x000000
  0x09EE8A  cd 38 01 00        call 0x000138
  0x09EE8E  20 04              jr nz, 0x09EE94
  0x09EE90  21 36 ef 09        ld hl, 0x09EF36
  0x09EE94  c9                 ret

PART 2: OS entry 0x000138
  0x000138  c3 c2 21 00        jp 0x0021C2
  trampoline target: 0x0021C2
  target body at 0x0021C2:
    0x0021C2  e5                 push hl
    0x0021C3  d5                 push de
    0x0021C4  11 00 00 00        ld de, 0x000000
    0x0021C8  b7                 or a
    0x0021C9  ed 52              sbc hl, de
    0x0021CB  d1                 pop de
    0x0021CC  e1                 pop hl
    0x0021CD  c9                 ret
  summary: 0x000138 jumps to 0x0021C2, which compares HL against 0 with `or a; sbc hl,de`, preserves HL/DE, and returns with flags set from the compare.

PART 3: ROM bytes at 0x09EF36
  0x09EF36  54 49 2d 38 34 20 50 6c 75 73 20 43 45 00 ed 57  TI-84 Plus CE..W
  0x09EF46  ea 4c ef 09 ed 57 dd e5 f5 f3 e5 d5 c5 79 90 3c  .L...W.......y.<
  0x09EF56  eb 52 ed 52 da 01 f0 09 23 f5 e5 d5 21 00 00 00  .R.R....#...!...
  0x09EF66  60 2e a0 ed 6c 29 cd 08 c3 08 28 45 ed 5b 10 00  `...l)....(E.[..
  first C-string: "TI-84 Plus CE"

PART 4: Dynamic trace (Z=1 initial F=0x40)
  result: steps=5 termination=missing_block lastPc=0xFEFEFE lastMode=adl
  final: HL=0x09EF36 F=0x42 SP=0xD1A873 missing=0xFEFEFE
    step  0  0x09EE86  ld hl, 0x000000 | call 0x000138
    step  1  0x000138  jp 0x0021c2
    step  2  0x0021C2  push hl | push de | ld de, 0x000000 | or a | sbc hl, de | pop de | pop hl | ret
    step  3  0x09EE8E  jr nz, 0x09ee94
    step  4  0x09EE90  ld hl, 0x09ef36 | ret

PART 4: Dynamic trace (Z=0 initial F=0x00)
  result: steps=5 termination=missing_block lastPc=0xFEFEFE lastMode=adl
  final: HL=0x09EF36 F=0x42 SP=0xD1A873 missing=0xFEFEFE
    step  0  0x09EE86  ld hl, 0x000000 | call 0x000138
    step  1  0x000138  jp 0x0021c2
    step  2  0x0021C2  push hl | push de | ld de, 0x000000 | or a | sbc hl, de | pop de | pop hl | ret
    step  3  0x09EE8E  jr nz, 0x09ee94
    step  4  0x09EE90  ld hl, 0x09ef36 | ret

  note: initial Z does not matter here. The helper zeroes HL before the call, and 0x0021C2 recomputes flags from HL-0, so both traces return the same HL=0x09EF36.

PART 5: Direct callers of 0x09EE86
  ADL CALL pattern (CD 86 EE 09): 2 hit(s)
    0x09EC0A  cd 86 ee 09        call 0x09EE86
    0x09EDD1  cd 86 ee 09        call 0x09EE86
  ADL JP pattern   (C3 86 EE 09): 0 hit(s)
*/
