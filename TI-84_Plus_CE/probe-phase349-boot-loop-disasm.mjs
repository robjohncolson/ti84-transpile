#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const MAX_STEPS = 2000;
const MAX_LOOP_ITERATIONS = 50000;
const RAW_DUMP_BYTES = 32;
const MAX_DECODE_ROWS = 24;
const TARGET_VISIT_PREVIEW = 96;

const TARGET_BLOCKS = [
  0x001AFA,
  0x0058A6,
  0x0058A9,
  0x0058E9,
  0x005929,
  0x005969,
  0x001713,
  0x005973,
  0x005998,
  0x001AFD,
  0x000810,
  0x000043,
  0x0006F3,
  0x000704,
  0x00070F,
  0x00080B,
];

const TARGET_SET = new Set(TARGET_BLOCKS);
const TARGET_INDEX = new Map(TARGET_BLOCKS.map((pc, index) => [pc, index]));

const TERMINATOR_TAGS = new Set([
  'call',
  'call-conditional',
  'djnz',
  'halt',
  'jp',
  'jp-conditional',
  'jp-indirect',
  'jr',
  'jr-conditional',
  'ret',
  'ret-conditional',
  'reti',
  'retn',
  'rst',
  'slp',
]);

const TARGETED_BRANCH_TAGS = new Set([
  'call',
  'call-conditional',
  'djnz',
  'jp',
  'jp-conditional',
  'jr',
  'jr-conditional',
  'rst',
]);

const FLAG_WRITER_TAGS = new Set([
  'adc-pair',
  'add-pair',
  'alu-imm',
  'alu-reg',
  'bit-test',
  'bit-test-ind',
  'ccf',
  'cpd',
  'cpi',
  'cpdr',
  'cpir',
  'daa',
  'dec-reg',
  'im',
  'in-reg',
  'in0',
  'inc-reg',
  'indexed-cb-bit',
  'neg',
  'or',
  'rrd',
  'rld',
  'scf',
  'sbc-pair',
  'tst-ind',
  'tst-imm',
  'tst-reg',
  'tstio',
]);

const CONDITION_DETAILS = new Map([
  ['nz', 'Z flag clear'],
  ['z', 'Z flag set'],
  ['nc', 'C flag clear'],
  ['c', 'C flag set'],
  ['po', 'P/V flag clear'],
  ['pe', 'P/V flag set'],
  ['p', 'S flag clear'],
  ['m', 'S flag set'],
]);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function formatDisp(value) {
  if (!Number.isFinite(value)) {
    return '+0x00';
  }
  if (value >= 0) {
    return `+0x${value.toString(16).toUpperCase()}`;
  }
  return `-0x${(-value).toString(16).toUpperCase()}`;
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function incrementCount(map, key) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function fallbackMnemonic(inst) {
  const ignored = new Set([
    'fallthrough',
    'kind',
    'length',
    'mode',
    'modePrefix',
    'nextMode',
    'nextPc',
    'pc',
    'targetMode',
    'terminates',
  ]);

  const parts = [];
  for (const [key, value] of Object.entries(inst ?? {})) {
    if (key === 'tag' || ignored.has(key) || value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'number') {
      if (key === 'addr' || key === 'target' || key === 'value') {
        parts.push(`${key}=${hex(value)}`);
      } else if (key === 'displacement') {
        parts.push(`${key}=${formatDisp(value)}`);
      } else {
        parts.push(`${key}=${value}`);
      }
    } else {
      parts.push(`${key}=${value}`);
    }
  }

  return withModePrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : inst.tag);
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'adc-pair':
      return withModePrefix(inst, `adc hl, ${inst.src}`);
    case 'add-pair':
      return withModePrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'alu-imm':
      return withModePrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg':
      return withModePrefix(inst, `${inst.op} ${inst.src}`);
    case 'bit-test':
      return withModePrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind':
      return withModePrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'call':
      return withModePrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'ccf':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'daa':
    case 'di':
    case 'ei':
    case 'ex-af':
    case 'ex-de-hl':
    case 'ex-sp-hl':
    case 'exx':
    case 'halt':
    case 'ldd':
    case 'lddr':
    case 'ldi':
    case 'ldir':
    case 'ld-mb-a':
    case 'ld-a-mb':
    case 'neg':
    case 'nop':
    case 'rla':
    case 'rlca':
    case 'rra':
    case 'rrca':
    case 'rrd':
    case 'rld':
    case 'scf':
    case 'stmix':
    case 'rsmix':
      return withModePrefix(inst, inst.tag);
    case 'dec-pair':
      return withModePrefix(inst, `dec ${inst.pair}`);
    case 'dec-reg':
      return withModePrefix(inst, `dec ${inst.reg}`);
    case 'djnz':
      return withModePrefix(inst, `djnz ${hex(inst.target)}`);
    case 'im':
      return withModePrefix(inst, `im ${inst.value}`);
    case 'in-reg':
      return withModePrefix(inst, `in ${inst.reg}, (c)`);
    case 'in0':
      return withModePrefix(inst, `in0 ${inst.reg}, (${hexByte(inst.port)})`);
    case 'inc-pair':
      return withModePrefix(inst, `inc ${inst.pair}`);
    case 'inc-reg':
      return withModePrefix(inst, `inc ${inst.reg}`);
    case 'indexed-cb-bit':
      return withModePrefix(
        inst,
        `bit ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'indexed-cb-res':
      return withModePrefix(
        inst,
        `res ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'indexed-cb-rotate':
      return withModePrefix(
        inst,
        `${inst.operation ?? inst.op ?? 'rotate'} (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'indexed-cb-set':
      return withModePrefix(
        inst,
        `set ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'jp':
      return withModePrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withModePrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr':
      return withModePrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-ind-imm':
      return withModePrefix(inst, `ld (hl), ${hexByte(inst.value)}`);
    case 'ld-ind-pair':
      return withModePrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-ind-reg':
      return withModePrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-indexed-pair':
      return withModePrefix(
        inst,
        `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.pair}`,
      );
    case 'ld-mem-pair':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-indexed':
      return withModePrefix(
        inst,
        `ld ${inst.pair}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'ld-pair-ind':
      return withModePrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
      }
      return withModePrefix(inst, `ld ${inst.pair}, (${hex(inst.addr)})`);
    case 'ld-reg-imm':
      return withModePrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-ixd':
      return withModePrefix(
        inst,
        `ld ${inst.dest}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'ld-reg-mem':
      return withModePrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-special':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-sp-hl':
      return withModePrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair':
      return withModePrefix(inst, `ld sp, ${inst.pair}`);
    case 'lea':
      return withModePrefix(
        inst,
        `lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`,
      );
    case 'mlt':
      return withModePrefix(inst, `mlt ${inst.reg}`);
    case 'otimr':
      return withModePrefix(inst, 'otimr');
    case 'out-reg':
      return withModePrefix(inst, `out (c), ${inst.reg}`);
    case 'out0':
      return withModePrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);
    case 'pop':
      return withModePrefix(inst, `pop ${inst.pair}`);
    case 'push':
      return withModePrefix(inst, `push ${inst.pair}`);
    case 'ret':
      return withModePrefix(inst, 'ret');
    case 'ret-conditional':
      return withModePrefix(inst, `ret ${inst.condition}`);
    case 'reti':
      return withModePrefix(inst, 'reti');
    case 'retn':
      return withModePrefix(inst, 'retn');
    case 'rst':
      return withModePrefix(inst, `rst ${hex(inst.target, 2)}`);
    case 'sbc-pair':
      return withModePrefix(inst, `sbc hl, ${inst.src}`);
    case 'slp':
      return withModePrefix(inst, 'slp');
    case 'tst-ind':
      return withModePrefix(inst, 'tst (hl)');
    case 'tst-imm':
      return withModePrefix(inst, `tst ${hexByte(inst.value)}`);
    case 'tst-reg':
      return withModePrefix(inst, `tst ${inst.reg}`);
    case 'tstio':
      return withModePrefix(inst, `tstio ${hexByte(inst.value)}`);
    default:
      return fallbackMnemonic(inst);
  }
}

function formatRawDump(rom, start, length, bytesPerLine = 16) {
  const lines = [];
  for (let offset = 0; offset < length; offset += bytesPerLine) {
    const lineStart = start + offset;
    const lineLength = Math.min(bytesPerLine, length - offset);
    lines.push(`  ${hex(lineStart)}: ${hexBytes(rom, lineStart, lineLength)}`);
  }
  return lines;
}

function tryDecodeInstruction(decodeInstruction, rom, pc, mode) {
  try {
    return decodeInstruction(rom, pc, mode);
  } catch {
    return null;
  }
}

function isFlagWriter(inst) {
  if (!inst || inst.tag === 'db') {
    return false;
  }
  return FLAG_WRITER_TAGS.has(inst.tag);
}

function disassembleBlock(decodeInstruction, rom, addr, mode, observedModes) {
  const rows = [];
  const limit = addr + RAW_DUMP_BYTES;
  let pc = addr;

  while (pc < rom.length && pc < limit && rows.length < MAX_DECODE_ROWS) {
    const inst = tryDecodeInstruction(decodeInstruction, rom, pc, mode);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      rows.push({
        pc,
        length: 1,
        tag: 'db',
        bytes: hexBytes(rom, pc, 1),
        text: `db ${hexByte(rom[pc])}`,
      });
      pc += 1;
      continue;
    }

    const length = Math.max(inst.length, 1);
    rows.push({
      ...inst,
      bytes: hexBytes(rom, pc, length),
      text: formatInstruction(inst),
    });
    pc += length;

    if (inst.terminates || TERMINATOR_TAGS.has(inst.tag)) {
      break;
    }
  }

  const terminator = [...rows].reverse().find(
    (row) => row.tag !== 'db' && (row.terminates || TERMINATOR_TAGS.has(row.tag)),
  ) ?? null;

  const terminatorIndex = terminator ? rows.indexOf(terminator) : -1;
  const flagSource = terminatorIndex > 0
    ? rows.slice(0, terminatorIndex).reverse().find((row) => isFlagWriter(row)) ?? null
    : null;

  return {
    addr,
    mode,
    observedModes,
    rows,
    terminator,
    flagSource,
  };
}

function describeCondition(inst) {
  if (!inst) {
    return 'n/a';
  }
  if (inst.tag === 'djnz') {
    return 'B register non-zero after decrement';
  }
  if (!inst.condition) {
    return 'unconditional';
  }
  const detail = CONDITION_DETAILS.get(inst.condition);
  return detail ? `${inst.condition.toUpperCase()} (${detail})` : inst.condition.toUpperCase();
}

function buildBackEdgeCandidates(analyses, transitionCounts) {
  const candidates = [];

  for (const analysis of analyses) {
    const term = analysis.terminator;
    if (!term || !TARGETED_BRANCH_TAGS.has(term.tag) || !Number.isInteger(term.target)) {
      continue;
    }

    const sourceIndex = TARGET_INDEX.get(analysis.addr);
    const target = term.target & 0xFFFFFF;
    const targetIndex = TARGET_INDEX.get(target);

    if (sourceIndex === undefined || targetIndex === undefined || targetIndex >= sourceIndex) {
      continue;
    }

    const transitionKey = `${analysis.addr}->${target}`;
    const observedTransitions = transitionCounts.get(transitionKey) ?? 0;

    candidates.push({
      source: analysis.addr,
      sourceIndex,
      sourceMode: analysis.mode,
      target,
      targetIndex,
      observedTransitions,
      instruction: term,
      flagSource: analysis.flagSource,
    });
  }

  candidates.sort((a, b) => {
    const observedDelta = b.observedTransitions - a.observedTransitions;
    if (observedDelta !== 0) {
      return observedDelta;
    }

    const spanA = a.sourceIndex - a.targetIndex;
    const spanB = b.sourceIndex - b.targetIndex;
    if (spanB !== spanA) {
      return spanB - spanA;
    }

    return a.source - b.source;
  });

  return candidates;
}

function printTargetVisitPreview(targetVisitLog) {
  console.log('=== Target-Block Visit Preview ===');
  if (targetVisitLog.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }

  const preview = targetVisitLog.slice(0, TARGET_VISIT_PREVIEW);
  for (const entry of preview) {
    console.log(`  [${String(entry.step).padStart(4)}] ${hex(entry.pc)}:${entry.mode}`);
  }
  if (targetVisitLog.length > preview.length) {
    console.log(`  ... ${targetVisitLog.length - preview.length} more target-block visits`);
  }
  console.log('');

  const compact = preview.map((entry) => hex(entry.pc)).join(' -> ');
  console.log('Compact target-block path:');
  console.log(`  ${compact}`);
  console.log('');
}

function printTargetTransitionCounts(targetTransitionCounts) {
  console.log('=== Target-Block Transition Counts ===');
  if (targetTransitionCounts.size === 0) {
    console.log('  none');
    console.log('');
    return;
  }

  const sorted = [...targetTransitionCounts.entries()]
    .map(([key, count]) => {
      const [fromRaw, toRaw] = key.split('->');
      return {
        from: Number(fromRaw),
        to: Number(toRaw),
        count,
      };
    })
    .sort((a, b) => b.count - a.count || a.from - b.from || a.to - b.to);

  for (const row of sorted) {
    console.log(`  ${hex(row.from)} -> ${hex(row.to)} : ${row.count}`);
  }
  console.log('');
}

function printDisassembly(analysis) {
  console.log(`=== Block ${hex(analysis.addr)} ===`);
  console.log(`Observed mode(s): ${analysis.observedModes.join(', ')}`);
  console.log(`Sequence index: ${TARGET_INDEX.get(analysis.addr) + 1}/${TARGET_BLOCKS.length}`);
  console.log(`Raw first ${RAW_DUMP_BYTES} bytes:`);
  for (const line of formatRawDump(romBytes, analysis.addr, RAW_DUMP_BYTES)) {
    console.log(line);
  }
  console.log('Decoded instructions:');
  for (const row of analysis.rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(17)} ${row.text}`);
  }
  if (analysis.terminator) {
    console.log(`Block end: ${analysis.terminator.text} @ ${hex(analysis.terminator.pc)}`);
    console.log(`Branch condition: ${describeCondition(analysis.terminator)}`);
    if (analysis.flagSource) {
      console.log(`Nearest flag source: ${analysis.flagSource.text} @ ${hex(analysis.flagSource.pc)}`);
    }
  } else {
    console.log('Block end: no terminating control-flow decoded within the first 32 ROM bytes');
  }
  console.log('');
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();
const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

const uniqueBlocks = new Map();
const transitionCounts = new Map();
const targetTransitionCounts = new Map();
const targetVisitLog = [];
const missingBlockEvents = [];
const observedModesByTarget = new Map(TARGET_BLOCKS.map((pc) => [pc, new Set()]));

let previousEntry = null;

console.log('Phase 349: Boot Loop Disassembly Probe');
console.log('======================================');
console.log(`Boot entry:      ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Max steps:       ${MAX_STEPS.toLocaleString()}`);
console.log(`Timer interrupt: disabled`);
console.log(`Loop cap:        ${MAX_LOOP_ITERATIONS.toLocaleString()}`);
console.log(`Transpiled ROM:  ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
console.log(`Target blocks:   ${TARGET_BLOCKS.map((pc) => hex(pc)).join(', ')}`);
console.log('');

console.log('=== Boot Transition Trace ===');
const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
  maxSteps: MAX_STEPS,
  maxLoopIterations: MAX_LOOP_ITERATIONS,
  onBlock(blockPc, mode, _meta, steps) {
    const entry = {
      step: steps,
      pc: blockPc & 0xFFFFFF,
      mode: mode ?? 'adl',
    };

    const uniqueKey = `${entry.pc}:${entry.mode}`;
    incrementCount(uniqueBlocks, uniqueKey);

    if (previousEntry) {
      const transitionKey = `${previousEntry.pc}->${entry.pc}`;
      incrementCount(transitionCounts, transitionKey);
      if (TARGET_SET.has(previousEntry.pc) && TARGET_SET.has(entry.pc)) {
        incrementCount(targetTransitionCounts, transitionKey);
      }
      console.log(
        `  [${String(steps).padStart(4)}] ${hex(previousEntry.pc)}:${previousEntry.mode} -> ${hex(entry.pc)}:${entry.mode}`,
      );
    } else {
      console.log(`  [${String(steps).padStart(4)}] ${hex(entry.pc)}:${entry.mode}`);
    }

    if (TARGET_SET.has(entry.pc)) {
      observedModesByTarget.get(entry.pc)?.add(entry.mode);
      targetVisitLog.push(entry);
    }

    previousEntry = entry;
  },
  onMissingBlock(pc, mode, steps) {
    missingBlockEvents.push({
      pc: pc & 0xFFFFFF,
      mode: mode ?? 'adl',
      step: steps,
    });
  },
});

console.log('');
console.log('=== Trace Summary ===');
console.log(`Termination:   ${run.termination}`);
console.log(`Total steps:   ${run.steps}`);
console.log(`Unique blocks: ${uniqueBlocks.size}`);
console.log(`Last PC:       ${hex(run.lastPc)}:${run.lastMode}`);
console.log('');

if (missingBlockEvents.length > 0) {
  console.log(`Missing blocks seen: ${missingBlockEvents.length}`);
  for (const evt of missingBlockEvents.slice(0, 20)) {
    console.log(`  step=${evt.step} pc=${hex(evt.pc)}:${evt.mode}`);
  }
  if (missingBlockEvents.length > 20) {
    console.log(`  ... and ${missingBlockEvents.length - 20} more`);
  }
  console.log('');
} else {
  console.log('Missing blocks seen: none');
  console.log('');
}

printTargetVisitPreview(targetVisitLog);
printTargetTransitionCounts(targetTransitionCounts);

const analyses = TARGET_BLOCKS.map((addr) => {
  const observedModes = [...(observedModesByTarget.get(addr) ?? [])];
  const decodeMode = observedModes[0] ?? BOOT_MODE;
  return disassembleBlock(
    decodeInstruction,
    romBytes,
    addr,
    decodeMode,
    observedModes.length > 0 ? observedModes : [decodeMode],
  );
});

console.log('=== Per-Block Disassembly ===');
console.log('');
for (const analysis of analyses) {
  printDisassembly(analysis);
}

const candidates = buildBackEdgeCandidates(analyses, transitionCounts);

console.log('=== Backward-Edge Candidates ===');
if (candidates.length === 0) {
  console.log('  No backward JP/JR/CALL-style edge was found in the first 32 bytes of these target blocks.');
  console.log('');
} else {
  for (const candidate of candidates) {
    console.log(
      `  ${hex(candidate.source)} -> ${hex(candidate.target)} via ${candidate.instruction.text} ` +
      `@ ${hex(candidate.instruction.pc)}`,
    );
    console.log(`    condition: ${describeCondition(candidate.instruction)}`);
    if (candidate.flagSource) {
      console.log(`    nearest flag source: ${candidate.flagSource.text} @ ${hex(candidate.flagSource.pc)}`);
    }
    console.log(`    observed runtime transitions: ${candidate.observedTransitions}`);
  }
  console.log('');
}

const bestCandidate = candidates.find((candidate) => candidate.observedTransitions > 0) ?? candidates[0] ?? null;

console.log('=== Loop Identification ===');
if (!bestCandidate) {
  console.log('  Unable to identify a backward edge from this 16-block set.');
} else {
  console.log(`  Loop-closing block: ${hex(bestCandidate.source)}:${bestCandidate.sourceMode}`);
  console.log(
    `  Exact instruction: ${bestCandidate.instruction.text} @ ${hex(bestCandidate.instruction.pc)}`,
  );
  console.log(`  Backward target: ${hex(bestCandidate.target)}`);
  console.log(`  Condition control: ${describeCondition(bestCandidate.instruction)}`);
  if (bestCandidate.flagSource) {
    console.log(
      `  Nearest in-block flag writer: ${bestCandidate.flagSource.text} @ ${hex(bestCandidate.flagSource.pc)}`,
    );
  }
  console.log(
    `  Observed ${bestCandidate.observedTransitions} direct transition(s) from ${hex(bestCandidate.source)} ` +
    `to ${hex(bestCandidate.target)} in the ${MAX_STEPS}-step trace.`,
  );
}
console.log('');
console.log('--- probe complete ---');
