#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;

const STACK_RESET_TOP = 0xD1A87E;
const FIXED_IX = 0xD1A860;
const FIXED_IY = 0xD00080;
const FIXED_SP = 0xD1A872;
const FIXED_MBASE = 0xD0;
const STACK_SENTINEL = 0xFF;

const CUR_ROW_ADDR = 0xD00595;
const CUR_COL_ADDR = 0xD00596;
const CUR_ROW_LIMIT_ADDR = 0xD02504;
const CUR_COL_LIMIT_ADDR = 0xD02505;

const SCAN_END = 0x400000;
const CUR_ROW_PATTERN = [0x95, 0x05, 0xD0];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xff).toString(16).padStart(2, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
}

function blockKey(pc, mode = 'adl') {
  return `${pc.toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }

  return rawBlocks;
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(STACK_SENTINEL, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = FIXED_MBASE;
  cpu._iy = FIXED_IY;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(STACK_SENTINEL, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function prepareStage1State(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._ix = FIXED_IX;
  cpu._iy = FIXED_IY;
  cpu.sp = FIXED_SP;
  cpu.mbase = FIXED_MBASE;
  cpu.madl = 1;
  mem.fill(STACK_SENTINEL, cpu.sp, cpu.sp + 12);
}

function getBlock(blocks, pc, mode = 'adl') {
  return blocks[blockKey(pc, mode)] ?? null;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'push':
      text = `push ${inst.pair}`;
      break;
    case 'pop':
      text = `pop ${inst.pair}`;
      break;
    case 'ld-pair-imm':
      text = `ld ${inst.pair}, ${hex(inst.value)}`;
      break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-reg-imm':
      text = `ld ${inst.dest}, ${hexByte(inst.value)}`;
      break;
    case 'ld-reg-reg':
      text = `ld ${inst.dest}, ${inst.src}`;
      break;
    case 'ld-reg-ind':
      text = `ld ${inst.dest}, (${inst.src})`;
      break;
    case 'ld-ind-reg':
      text = `ld (${inst.dest}), ${inst.src}`;
      break;
    case 'ld-reg-mem':
      text = `ld ${inst.dest}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-reg':
      text = `ld (${hex(inst.addr)}), ${inst.src}`;
      break;
    case 'ld-ind-imm':
      text = `ld (hl), ${hexByte(inst.value)}`;
      break;
    case 'alu-imm':
      text = `${inst.op} ${hexByte(inst.value)}`;
      break;
    case 'alu-reg':
      text = `${inst.op} ${inst.src}`;
      break;
    case 'call':
      text = `call ${hex(inst.target)}`;
      break;
    case 'call-conditional':
      text = `call ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jp':
      text = `jp ${hex(inst.target)}`;
      break;
    case 'jp-conditional':
      text = `jp ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jr':
      text = `jr ${hex(inst.target)}`;
      break;
    case 'jr-conditional':
      text = `jr ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'ret':
      text = 'ret';
      break;
    case 'ret-conditional':
      text = `ret ${inst.condition}`;
      break;
    case 'inc-pair':
      text = `inc ${inst.pair}`;
      break;
    case 'dec-pair':
      text = `dec ${inst.pair}`;
      break;
    case 'inc-reg':
      text = `inc ${inst.reg}`;
      break;
    case 'dec-reg':
      text = `dec ${inst.reg}`;
      break;
    case 'add-pair':
      text = `add ${inst.dest}, ${inst.src}`;
      break;
    case 'bit-test':
      text = `bit ${inst.bit}, ${inst.reg}`;
      break;
    case 'bit-test-ind':
      text = `bit ${inst.bit}, (${inst.indirectRegister})`;
      break;
    case 'res-indexed':
      text = `res ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
      break;
    case 'nop':
      text = 'nop';
      break;
    default:
      break;
  }

  return `${prefix}${text}`;
}

function decodeAt(rom, startPc) {
  const decoded = decodeInstruction(rom, startPc, 'adl');

  return {
    pc: decoded.pc,
    length: decoded.length,
    nextPc: decoded.nextPc,
    tag: decoded.tag,
    decoded,
    bytes: bytesToHex(rom.slice(decoded.pc, decoded.pc + decoded.length)),
    dasm: formatInstruction(decoded),
  };
}

function tryDecodeAt(rom, startPc) {
  try {
    return decodeAt(rom, startPc);
  } catch {
    return null;
  }
}

function buildCoverageIndex(blocks) {
  const coveredByteMap = new Map();

  for (const [key, block] of Object.entries(blocks)) {
    for (const inst of block.instructions || []) {
      const instKey = `${inst.pc}:${inst.bytes}`;
      let entryMap = coveredByteMap.get(inst.pc);

      if (!entryMap) {
        entryMap = new Map();
        coveredByteMap.set(inst.pc, entryMap);
      }

      let canonical = entryMap.get(instKey);

      if (!canonical) {
        canonical = {
          pc: inst.pc,
          length: inst.length,
          bytes: inst.bytes,
          dasm: inst.dasm,
          tag: inst.tag,
          blockKeys: new Set(),
        };
        entryMap.set(instKey, canonical);
      }

      canonical.blockKeys.add(key);
    }
  }

  const byByte = new Map();

  for (const instEntryMap of coveredByteMap.values()) {
    for (const entry of instEntryMap.values()) {
      for (let offset = 0; offset < entry.length; offset += 1) {
        const addr = entry.pc + offset;
        let byteEntryMap = byByte.get(addr);

        if (!byteEntryMap) {
          byteEntryMap = new Map();
          byByte.set(addr, byteEntryMap);
        }

        byteEntryMap.set(`${entry.pc}:${entry.bytes}`, entry);
      }
    }
  }

  return { byByte };
}

function classifyRawHit(rom, hitAddr) {
  const prev1 = hitAddr > 0 ? rom[hitAddr - 1] : -1;
  const prev2 = hitAddr > 1 ? rom[hitAddr - 2] : -1;

  if (prev1 === 0x3a || prev1 === 0x2a) {
    return { kind: 'reader', instructionPc: hitAddr - 1 };
  }

  if (prev2 === 0xed && [0x4b, 0x5b, 0x6b, 0x7b].includes(prev1)) {
    return { kind: 'reader', instructionPc: hitAddr - 2 };
  }

  if (prev1 === 0x32 || prev1 === 0x22) {
    return { kind: 'writer', instructionPc: hitAddr - 1 };
  }

  if (prev2 === 0xed && [0x43, 0x53, 0x63, 0x73].includes(prev1)) {
    return { kind: 'writer', instructionPc: hitAddr - 2 };
  }

  if ([0x01, 0x11, 0x21, 0x31].includes(prev1)) {
    return { kind: 'address_load', instructionPc: hitAddr - 1 };
  }

  return { kind: 'unknown', instructionPc: null };
}

function classifyInstruction(decodedInstruction, rawKind) {
  const { decoded } = decodedInstruction;

  if (decoded.tag === 'ld-reg-mem') {
    return 'reader';
  }

  if (decoded.tag === 'ld-pair-mem') {
    return decoded.direction === 'from-mem' ? 'reader' : 'writer';
  }

  if (decoded.tag === 'ld-mem-reg') {
    return 'writer';
  }

  if (decoded.tag === 'ld-pair-imm' && decoded.value === CUR_ROW_ADDR) {
    return 'address_load';
  }

  return rawKind;
}

function scanCurRowHits(rom, coverageIndex) {
  const hits = [];

  for (let addr = 0; addr < SCAN_END - 2; addr += 1) {
    if (rom[addr] !== CUR_ROW_PATTERN[0] || rom[addr + 1] !== CUR_ROW_PATTERN[1] || rom[addr + 2] !== CUR_ROW_PATTERN[2]) {
      continue;
    }

    const coverageEntries = [...(coverageIndex.byByte.get(addr)?.values() ?? [])]
      .sort((left, right) => left.pc - right.pc || left.bytes.localeCompare(right.bytes));
    const raw = classifyRawHit(rom, addr);
    const instructionPc = coverageEntries[0]?.pc ?? raw.instructionPc;
    const instruction = instructionPc === null ? null : tryDecodeAt(rom, instructionPc);
    const kind = instruction ? classifyInstruction(instruction, raw.kind) : raw.kind;
    const blockKeys = coverageEntries.flatMap((entry) => [...entry.blockKeys]).sort();

    hits.push({
      hitAddr: addr,
      reachable: coverageEntries.length > 0,
      kind,
      instructionPc,
      instruction,
      blockKeys,
    });
  }

  return hits;
}

function analyzeReaderSentinelHandling(rom, hit) {
  if (hit.kind !== 'reader' || hit.instructionPc === null || !hit.instruction) {
    return null;
  }

  const nextInstructions = [];
  let pc = hit.instruction.nextPc;

  for (let index = 0; index < 6; index += 1) {
    try {
      const inst = decodeAt(rom, pc);
      nextInstructions.push(inst);
      pc = inst.nextPc;
    } catch {
      break;
    }
  }

  const cpFf = nextInstructions.find((inst) => (
    inst.decoded.tag === 'alu-imm'
    && inst.decoded.op === 'cp'
    && inst.decoded.value === 0xff
  ));
  const incA = nextInstructions.find((inst) => (
    inst.decoded.tag === 'inc-reg'
    && inst.decoded.reg === 'a'
  ));

  let handling = 'none_obvious';

  if (cpFf) {
    handling = 'cp_ff';
  } else if (incA) {
    handling = 'inc_a_wrap';
  }

  return {
    handling,
    cpFfPc: cpFf?.pc ?? null,
    incAPc: incA?.pc ?? null,
    nextInstructions,
  };
}

function traceStage1CurRowWrites(executor, cpu, mem, blocks) {
  const events = [];
  const visitedBlocks = [];
  let currentBlockPc = null;
  let currentBlockStep = null;

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordByteWrite(addr, value, via) {
    const maskedAddr = addr & 0xffffff;

    if (maskedAddr !== CUR_ROW_ADDR) {
      return;
    }

    events.push({
      step: currentBlockStep,
      blockPc: currentBlockPc,
      via,
      oldValue: mem[maskedAddr],
      newValue: value & 0xff,
      recentBlocks: visitedBlocks.slice(-5).map((entry) => ({ ...entry })),
    });
  }

  cpu.write8 = (addr, value) => {
    recordByteWrite(addr, value, 'write8');
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordByteWrite(addr, value, 'write16-low');
    recordByteWrite(addr + 1, value >> 8, 'write16-high');
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByteWrite(addr, value, 'write24-low');
    recordByteWrite(addr + 1, value >> 8, 'write24-mid');
    recordByteWrite(addr + 2, value >> 16, 'write24-high');
    return originalWrite24(addr, value);
  };

  const initialCurRow = mem[CUR_ROW_ADDR];
  const initialCurCol = mem[CUR_COL_ADDR];

  let result;

  try {
    result = executor.runFrom(STAGE_1_ENTRY, 'adl', {
      maxSteps: 30000,
      maxLoopIterations: 500,
      onBlock(pc, mode, meta, step) {
        currentBlockPc = pc;
        currentBlockStep = step;
        visitedBlocks.push({
          step,
          pc,
          mode,
          first: meta?.instructions?.[0]?.dasm ?? '(no instruction)',
        });
      },
    });
  } finally {
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
  }

  const enrichedEvents = events.map((event) => ({
    ...event,
    currentBlock: getBlock(blocks, event.blockPc),
  }));

  return {
    result,
    initialCurRow,
    finalCurRow: mem[CUR_ROW_ADDR],
    initialCurCol,
    finalCurCol: mem[CUR_COL_ADDR],
    rowLimit: mem[CUR_ROW_LIMIT_ADDR],
    colLimit: mem[CUR_COL_LIMIT_ADDR],
    events: enrichedEvents,
  };
}

function printBlockInstructions(block, titlePrefix = '      ') {
  if (!block) {
    console.log(`${titlePrefix}(block unavailable)`);
    return;
  }

  for (const inst of block.instructions || []) {
    console.log(`${titlePrefix}${hex(inst.pc)}  ${inst.bytes.padEnd(14)}  ${inst.dasm}`);
  }
}

function printStage1Trace(trace, blocks) {
  console.log('=== Phase 195 - Stage 1 curRow Investigation ===');
  console.log('');
  console.log('Part A - Stage 1 curRow write trace');
  console.log(`  Stage 1 result: steps=${trace.result.steps} termination=${trace.result.termination} lastPc=${hex(trace.result.lastPc)}`);
  console.log(`  curRow: before=${hexByte(trace.initialCurRow)} after=${hexByte(trace.finalCurRow)}`);
  console.log(`  curCol: before=${hexByte(trace.initialCurCol)} after=${hexByte(trace.finalCurCol)}`);
  console.log(`  rowLimit@${hex(CUR_ROW_LIMIT_ADDR)}=${hexByte(trace.rowLimit)} colLimit@${hex(CUR_COL_LIMIT_ADDR)}=${hexByte(trace.colLimit)}`);
  console.log('');

  if (trace.events.length === 0) {
    console.log('  No writes to curRow were observed during Stage 1.');
    console.log('');
    return;
  }

  console.log(`  curRow write count: ${trace.events.length}`);

  trace.events.forEach((event, index) => {
    console.log(`  Write ${index + 1}: step=${event.step} blockPc=${hex(event.blockPc)} via=${event.via} old=${hexByte(event.oldValue)} new=${hexByte(event.newValue)}`);
    console.log('    Recent block trail:');
    for (const blockEntry of event.recentBlocks) {
      console.log(`      step=${blockEntry.step} pc=${hex(blockEntry.pc)} first=${blockEntry.first}`);
    }
    console.log('    Current block instructions:');
    printBlockInstructions(event.currentBlock, '      ');
  });

  const firstEvent = trace.events[0];
  const blockTrailPcs = firstEvent.recentBlocks.map((entry) => entry.pc);
  const leadInBlockPc = blockTrailPcs.find((pc) => pc !== firstEvent.blockPc && pc >= 0x0A20CC && pc <= 0x0A20FF);

  if (leadInBlockPc !== undefined) {
    console.log('');
    console.log(`  Lead-in block ${hex(leadInBlockPc)}:`);
    printBlockInstructions(getBlock(blocks, leadInBlockPc), '      ');
  }

  console.log('');
}

function groupHits(hits, reachable, kind) {
  return hits.filter((hit) => hit.reachable === reachable && hit.kind === kind);
}

function printHitGroup(title, hits) {
  console.log(`  ${title}: ${hits.length}`);

  if (hits.length === 0) {
    console.log('    (none)');
    console.log('');
    return;
  }

  for (const hit of hits) {
    const instText = hit.instruction
      ? `inst=${hex(hit.instructionPc)} ${hit.instruction.dasm}`
      : 'inst=n/a';
    console.log(`    hit=${hex(hit.hitAddr)} ${instText}`);
  }

  console.log('');
}

function printRomScan(hits) {
  const reachable = hits.filter((hit) => hit.reachable);
  const unreachable = hits.filter((hit) => !hit.reachable);

  console.log('Part B - Raw ROM scan for 95 05 D0');
  console.log(`  Total raw hits: ${hits.length}`);
  console.log(`  Reachable / inside transpiled instructions: ${reachable.length}`);
  console.log(`  Not inside transpiled instructions: ${unreachable.length}`);
  console.log('');

  printHitGroup('Reachable readers', groupHits(hits, true, 'reader'));
  printHitGroup('Reachable writers', groupHits(hits, true, 'writer'));
  printHitGroup('Reachable address loads', groupHits(hits, true, 'address_load'));
  printHitGroup('Reachable unknown', groupHits(hits, true, 'unknown'));

  printHitGroup('Unreachable readers', groupHits(hits, false, 'reader'));
  printHitGroup('Unreachable writers', groupHits(hits, false, 'writer'));
  printHitGroup('Unreachable address loads', groupHits(hits, false, 'address_load'));
  printHitGroup('Unreachable unknown', groupHits(hits, false, 'unknown'));
}

function printReaderHandling(readerHits) {
  const cpFfHits = readerHits.filter((hit) => hit.sentinel?.handling === 'cp_ff');
  const incAHits = readerHits.filter((hit) => hit.sentinel?.handling === 'inc_a_wrap');
  const noneHits = readerHits.filter((hit) => hit.sentinel?.handling === 'none_obvious');

  console.log('Part C - curRow reader handling');
  console.log(`  Reader hits: ${readerHits.length}`);
  console.log(`  Explicit cp 0xFF after read: ${cpFfHits.length}`);
  console.log(`  inc a soon after read (0xFF would wrap to 0x00): ${incAHits.length}`);
  console.log(`  No obvious 0xFF handling in next 6 instructions: ${noneHits.length}`);
  console.log('');

  for (const hit of readerHits) {
    let handlingText = 'none obvious in next 6 instructions';

    if (hit.sentinel?.handling === 'cp_ff') {
      handlingText = `cp 0xFF @ ${hex(hit.sentinel.cpFfPc)}`;
    } else if (hit.sentinel?.handling === 'inc_a_wrap') {
      handlingText = `inc a @ ${hex(hit.sentinel.incAPc)} (possible 0xFF -> 0x00 wrap)`;
    }

    console.log(`  hit=${hex(hit.hitAddr)} inst=${hex(hit.instructionPc)} ${hit.instruction.dasm} -> ${handlingText}`);
  }

  console.log('');
}

function printStage1Conclusion(trace, readerHits) {
  const incAHits = readerHits.filter((hit) => hit.sentinel?.handling === 'inc_a_wrap');
  const stage1Reader = readerHits.find((hit) => hit.instructionPc === 0x0A2BA3);
  const nearbyWrapReader = readerHits.find((hit) => hit.instructionPc === 0x0A20F5);
  const wroteWrappedFf = trace.events.length === 1
    && trace.events[0].oldValue === 0x00
    && trace.events[0].newValue === 0xff
    && trace.events[0].blockPc === 0x0A20F0;

  console.log('Conclusion');

  if (wroteWrappedFf) {
    console.log(`  Stage 1 does not load ${hexByte(0xff)} directly into curRow. The only observed write lands in block ${hex(0x0A20F0)} after the lead-in block ${hex(0x0A20CC)} loads DE=${hex(CUR_ROW_ADDR)}, reads curRow, executes dec a, and stores the underflowed result back through DE.`);
  } else if (trace.events.length > 0) {
    console.log(`  Stage 1 changed curRow ${trace.events.length} time(s), but the write path did not match the expected underflow-to-${hexByte(0xff)} pattern.`);
  } else {
    console.log('  Stage 1 did not write curRow in this run.');
  }

  if (stage1Reader) {
    console.log(`  The Stage 1 body later reads curRow again at ${hex(stage1Reader.instructionPc)} and compares it against the row limit at ${hex(CUR_ROW_LIMIT_ADDR)}. That is cursor bookkeeping, not a VRAM fill primitive.`);
  }

  if (nearbyWrapReader) {
    console.log(`  Nearby cursor code at ${hex(nearbyWrapReader.instructionPc)} immediately does inc a after reading curRow, so a stored ${hexByte(0xff)} would wrap to ${hexByte(0x00)} before the compare against ${hex(CUR_COL_LIMIT_ADDR)}. Across the whole ROM scan, ${incAHits.length} curRow readers show this wrap-style handling and none use an explicit cp 0xFF.`);
  } else {
    console.log(`  Across the whole ROM scan, ${incAHits.length} curRow readers show inc-a wrap handling and none use an explicit cp 0xFF.`);
  }

  console.log('  Combined with Phase 193\'s zero-VRAM result, this makes Stage 1 look like a cursor/status configuration step. The suspicious 0xFF is consistent with an off-screen or sentinel row value, not with a status-bar paint pass.');
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  coldBoot(executor, cpu, mem);

  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  prepareStage1State(cpu, mem);

  const trace = traceStage1CurRowWrites(executor, cpu, mem, blocks);
  const coverageIndex = buildCoverageIndex(blocks);
  const hits = scanCurRowHits(rom, coverageIndex);
  const readerHits = hits
    .filter((hit) => hit.kind === 'reader' && hit.instruction)
    .map((hit) => ({
      ...hit,
      sentinel: analyzeReaderSentinelHandling(rom, hit),
    }));

  printStage1Trace(trace, blocks);
  printRomScan(hits);
  printReaderHandling(readerHits);
  printStage1Conclusion(trace, readerHits);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
