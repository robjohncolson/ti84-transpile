#!/usr/bin/env node
// Phase 76: scan lifted blocks for the length-prefixed token-name walker shape.
// We keep the scan strict to the prompt's dasm-driven block matcher, then probe
// any matched function entries with HL pointed at the token-table "prgm" name.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase76-walker-scan-report.md');

const romBytes = fs.readFileSync(romPath);

const PRINT_CHAR_ENTRY = 0x0059c6;
const TOKEN_NAME_HL = 0x0a0452;
const MAX_PROBES = 10;

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const SET_TEXT_FG_ENTRY = 0x0802b2;
const SCREEN_STACK_TOP = 0xd1a87e;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xd00080;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;

const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xaaaa;
const FIRST_BLOCKS_LIMIT = 10;

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
}

function formatBlocks(blocks) {
  if (!blocks || blocks.length === 0) {
    return 'none';
  }

  return blocks.map((pc) => hex(pc)).join(', ');
}

function formatCallers(callers, limit = 8) {
  if (!callers || callers.length === 0) {
    return 'none';
  }

  return callers
    .slice(0, limit)
    .map((caller) => hex(caller.callerPc))
    .join(', ');
}

function normalizeDasm(dasm) {
  return String(dasm || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function tagIsDirectCallOrJump(tag) {
  const normalized = String(tag || '').toLowerCase();
  return normalized.includes('call') || normalized.startsWith('jp');
}

function instructionCallsPrintChar(instruction) {
  return (
    instruction?.target === PRINT_CHAR_ENTRY ||
    normalizeDasm(instruction?.dasm) === `call ${hex(PRINT_CHAR_ENTRY)}`
  );
}

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(
      `Missing ${transpiledPath}. Run node scripts/transpile-ti84-rom.mjs first.`,
    );
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  const blockValues = Array.isArray(mod.PRELIFTED_BLOCKS)
    ? mod.PRELIFTED_BLOCKS
    : Object.values(mod.PRELIFTED_BLOCKS);

  return blockValues.map((block, index) => ({
    id: `block-${index}`,
    block,
  }));
}

function buildTargetKey(pc, mode) {
  return `${pc}:${mode || 'unknown'}`;
}

function buildContext(blockEntries) {
  const blocksByTargetKey = new Map();
  const fallthroughPredsByTargetKey = new Map();

  for (const entry of blockEntries) {
    const key = buildTargetKey(entry.block.startPc, entry.block.mode);
    const siblings = blocksByTargetKey.get(key) || [];
    siblings.push(entry);
    blocksByTargetKey.set(key, siblings);
  }

  for (const entry of blockEntries) {
    for (const exit of entry.block.exits || []) {
      if (exit.type !== 'fallthrough') {
        continue;
      }

      const targetKey = buildTargetKey(exit.target, exit.targetMode);
      const preds = fallthroughPredsByTargetKey.get(targetKey) || [];
      preds.push({
        from: entry,
        exit,
      });
      fallthroughPredsByTargetKey.set(targetKey, preds);
    }
  }

  return {
    blockEntries,
    blocksByTargetKey,
    fallthroughPredsByTargetKey,
  };
}

function collectStrictMatches(blockEntry) {
  const matches = [];
  const instructions = blockEntry.block.instructions || [];

  for (let index = 0; index < instructions.length; index += 1) {
    const instruction = instructions[index];
    const dasm = normalizeDasm(instruction.dasm);

    if (dasm === 'ld b, (hl)') {
      const window = instructions.slice(index + 1, index + 6);
      const hasIncHl = window.some((item) => normalizeDasm(item.dasm) === 'inc hl');
      const hasPrintCall = window.some(instructionCallsPrintChar);
      const hasDjnz = window.some((item) => normalizeDasm(item.dasm).startsWith('djnz'));

      if (hasIncHl && hasPrintCall && hasDjnz) {
        matches.push({
          pattern: 'A',
          matchPc: instruction.pc,
          blockPc: blockEntry.block.startPc,
          blockMode: blockEntry.block.mode,
        });
      }
    }

    if (dasm === 'ld a, (hl)') {
      const prefixWindow = instructions.slice(index + 1, index + 4);
      const hasLdBA = prefixWindow.some((item) => normalizeDasm(item.dasm) === 'ld b, a');
      const hasIncHl = prefixWindow.some((item) => normalizeDasm(item.dasm) === 'inc hl');

      if (!hasLdBA || !hasIncHl) {
        continue;
      }

      const suffixWindow = instructions.slice(index + 1);
      const hasPrintCall = suffixWindow.some(instructionCallsPrintChar);
      const hasDjnz = suffixWindow.some((item) => normalizeDasm(item.dasm).startsWith('djnz'));

      if (hasPrintCall && hasDjnz) {
        matches.push({
          pattern: 'B',
          matchPc: instruction.pc,
          blockPc: blockEntry.block.startPc,
          blockMode: blockEntry.block.mode,
        });
      }
    }
  }

  return matches;
}

function walkBackToFunctionEntry(context, startEntry) {
  const chain = [startEntry];
  const seen = new Set([startEntry.id]);
  let current = startEntry;

  while (true) {
    const key = buildTargetKey(current.block.startPc, current.block.mode);
    const preds = (context.fallthroughPredsByTargetKey.get(key) || []).filter(
      (pred) => !seen.has(pred.from.id),
    );

    if (preds.length !== 1) {
      break;
    }

    current = preds[0].from;
    seen.add(current.id);
    chain.unshift(current);
  }

  return {
    entryPc: current.block.startPc,
    entryMode: current.block.mode,
    chain,
  };
}

function listDirectCallers(blockEntries, entryPc) {
  const callers = [];

  for (const entry of blockEntries) {
    for (const instruction of entry.block.instructions || []) {
      if (instruction.target !== entryPc) {
        continue;
      }

      if (!tagIsDirectCallOrJump(instruction.tag)) {
        continue;
      }

      callers.push({
        callerPc: instruction.pc,
        blockPc: entry.block.startPc,
        blockMode: entry.block.mode,
        tag: String(instruction.tag || ''),
        dasm: String(instruction.dasm || instruction.tag || ''),
      });
    }
  }

  const deduped = new Map();
  for (const caller of callers) {
    const key = `${caller.callerPc}:${caller.tag}:${caller.blockPc}:${caller.blockMode}`;
    if (!deduped.has(key)) {
      deduped.set(key, caller);
    }
  }

  return [...deduped.values()].sort(
    (a, b) => a.callerPc - b.callerPc || a.blockPc - b.blockPc,
  );
}

function collectPrintLoops(blockEntries) {
  const blocksByPc = new Map();

  for (const entry of blockEntries) {
    const rows = blocksByPc.get(entry.block.startPc) || [];
    rows.push(entry);
    blocksByPc.set(entry.block.startPc, rows);
  }

  const loops = [];

  for (const entry of blockEntries) {
    for (const instruction of entry.block.instructions || []) {
      if (!normalizeDasm(instruction.dasm).startsWith('djnz')) {
        continue;
      }

      if (typeof instruction.target !== 'number') {
        continue;
      }

      const targetEntries = blocksByPc.get(instruction.target) || [];
      const targetHasPrintCall = targetEntries.some((targetEntry) =>
        (targetEntry.block.instructions || []).some(instructionCallsPrintChar),
      );

      if (!targetHasPrintCall) {
        continue;
      }

      loops.push({
        loopPc: entry.block.startPc,
        targetPc: instruction.target,
        loopMode: entry.block.mode,
      });
    }
  }

  const deduped = new Map();
  for (const loop of loops) {
    const key = `${loop.loopPc}:${loop.targetPc}:${loop.loopMode}`;
    if (!deduped.has(key)) {
      deduped.set(key, loop);
    }
  }

  return [...deduped.values()].sort((a, b) => a.targetPc - b.targetPc || a.loopPc - b.loopPc);
}

function buildClearedVram() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xff;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }

  return bytes;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xff, start, start + bytes);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(
    CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]),
  );
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function collectVramStats(mem) {
  let vramWrites = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      vramWrites += 1;

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    vramWrites,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

async function buildProbeEnv(blockEntries) {
  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
  });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const executor = createExecutor(blockEntries.map((entry) => entry.block), mem, {
    peripherals,
  });
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });

  cpu.mbase = 0xd0;
  cpu._iy = PROBE_IY;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return {
    executor,
    mem,
    cpu,
    ramSnapshot: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram: buildClearedVram(),
    lcdSnapshot: executor.lcdMmio
      ? {
          upbase: executor.lcdMmio.upbase,
          control: executor.lcdMmio.control,
        }
      : null,
  };
}

function restoreBaseState(env) {
  env.mem.set(env.ramSnapshot, RAM_START);
  env.mem.set(env.clearedVram, VRAM_BASE);
  restoreCpu(env.cpu, env.cpuSnapshot);

  if (env.executor.lcdMmio && env.lcdSnapshot) {
    env.executor.lcdMmio.upbase = env.lcdSnapshot.upbase;
    env.executor.lcdMmio.control = env.lcdSnapshot.control;
  }
}

function runProbe(env, entryPc) {
  restoreBaseState(env);

  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu._iy = PROBE_IY;
  env.cpu.f = 0x40;
  env.cpu.hl = TOKEN_NAME_HL;
  env.cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(env.mem, env.cpu.sp, PROBE_STACK_BYTES);

  const uniqueBlocks = new Set();
  const firstBlocks = [];

  const raw = env.executor.runFrom(entryPc, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (uniqueBlocks.has(pc)) {
        return;
      }

      uniqueBlocks.add(pc);
      if (firstBlocks.length < FIRST_BLOCKS_LIMIT) {
        firstBlocks.push(pc);
      }
    },
  });

  const stats = collectVramStats(env.mem);

  return {
    entryPc,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc,
    lastMode: raw.lastMode,
    error: raw.error instanceof Error ? raw.error.message : null,
    vramWrites: stats.vramWrites,
    bbox: stats.bbox,
    uniqueBlocks: uniqueBlocks.size,
    firstBlocks,
  };
}

function scoreProbe(probe) {
  let score = 0;

  if (probe.vramWrites > 0) {
    score += 1000 + Math.min(probe.vramWrites, 500);
  }

  if (probe.bbox) {
    const width = probe.bbox.maxCol - probe.bbox.minCol + 1;
    const height = probe.bbox.maxRow - probe.bbox.minRow + 1;

    if (probe.bbox.minRow <= 24) score += 200;
    if (probe.bbox.minCol <= 24) score += 200;
    if (probe.bbox.maxRow <= 40) score += 100;
    if (probe.bbox.maxCol <= 48) score += 100;
    if (width >= 10 && width <= 20) score += 150;
    if (height <= 16) score += 80;
  }

  if (probe.termination === 'ret' || probe.termination === 'halt') {
    score += 100;
  }

  if (probe.uniqueBlocks < 30) {
    score += 100;
  }

  return score;
}

function buildProbeNotes(probe) {
  if (!probe.bbox || probe.vramWrites === 0) {
    return 'no visible VRAM writes';
  }

  const width = probe.bbox.maxCol - probe.bbox.minCol + 1;
  const nearTopLeft = probe.bbox.minRow <= 24 && probe.bbox.minCol <= 24;
  const widthLooksLikeToken = width >= 10 && width <= 20;
  const compact = probe.uniqueBlocks < 30;

  const notes = [];
  notes.push(nearTopLeft ? 'top-left' : 'not top-left');
  notes.push(widthLooksLikeToken ? 'width 10-20 cols' : `width ${width} cols`);
  notes.push(compact ? 'compact' : 'wide');

  return notes.join(', ');
}

function buildMarkdownTable(rows, headers) {
  const head = `| ${headers.join(' | ')} |`;
  const divider = `| ${headers.map(() => '---').join(' | ')} |`;
  return [head, divider, ...rows.map((row) => `| ${row.join(' | ')} |`)].join('\n');
}

function buildReport({
  matches,
  groupedCandidates,
  probes,
  rankedProbes,
  printLoops,
}) {
  const matchRows = matches.map((match) => [
    `\`${hex(match.blockPc)}\``,
    `\`${match.blockMode}\``,
    `\`${match.pattern}\``,
    `\`${hex(match.functionEntry)}\``,
    match.callerCount,
    `\`${formatCallers(match.callers)}\``,
  ]);

  const probeRows = probes.map((probe) => [
    `\`${hex(probe.entryPc)}\``,
    probe.matchedBlockCount,
    probe.callerCount,
    probe.vramWrites,
    `\`${formatBbox(probe.bbox)}\``,
    probe.uniqueBlocks,
    `\`${probe.termination}\``,
    `\`${formatBlocks(probe.firstBlocks)}\``,
  ]);

  const rankedRows = rankedProbes.map((probe, index) => [
    index + 1,
    `\`${hex(probe.entryPc)}\``,
    probe.score,
    probe.vramWrites,
    `\`${formatBbox(probe.bbox)}\``,
    probe.uniqueBlocks,
    `\`${probe.termination}\``,
    `\`${buildProbeNotes(probe)}\``,
  ]);

  const loopLines = printLoops.length === 0
    ? ['- No direct `call 0x0059c6` + `djnz` loop pairs were found in the lifted blocks.']
    : printLoops.map(
        (loop) =>
          `- loop block=${hex(loop.loopPc)} target=${hex(loop.targetPc)} mode=${loop.loopMode}`,
      );

  const lines = [
    '# Phase 76: Walker Scan',
    '',
    '## Summary',
    '',
    `- Strict block matches: ${matches.length}`,
    `- Unique matched function entries: ${groupedCandidates.length}`,
    `- Probed entries: ${probes.length} (cap ${MAX_PROBES})`,
    `- Probe HL seed: \`${hex(TOKEN_NAME_HL)}\` ("prgm" token name entry)`,
    '',
    '## Strict Pattern Matches',
    '',
  ];

  if (matchRows.length === 0) {
    lines.push('- No PRELIFTED_BLOCKS entries matched Pattern A or Pattern B with literal `dasm` matching.');
  } else {
    lines.push(
      buildMarkdownTable(matchRows, [
        'Block PC',
        'Mode',
        'Pattern',
        'Function Entry',
        'Caller Count',
        'Caller PCs',
      ]),
    );
  }

  lines.push('');
  lines.push('## Probe Results');
  lines.push('');

  if (probeRows.length === 0) {
    lines.push('- No matched function entries were available to probe.');
  } else {
    lines.push(
      buildMarkdownTable(probeRows, [
        'Function Entry',
        'Matched Blocks',
        'Caller Count',
        'VRAM Writes',
        'BBox',
        'Unique Blocks',
        'Termination',
        'First 10 Blocks',
      ]),
    );
  }

  lines.push('');
  lines.push('## Top Candidates');
  lines.push('');

  if (rankedRows.length === 0) {
    lines.push('- No probe candidates ranked because no strict matches were found.');
  } else {
    lines.push(
      buildMarkdownTable(rankedRows, [
        'Rank',
        'Function Entry',
        'Score',
        'VRAM Writes',
        'BBox',
        'Unique Blocks',
        'Termination',
        'Notes',
      ]),
    );
  }

  lines.push('');
  lines.push('## Supporting `call 0x0059c6` Loop Pairs');
  lines.push('');
  lines.push(...loopLines);
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function groupCandidates(context, strictMatches) {
  const enrichedMatches = strictMatches.map((match) => {
    const startEntry = context.blockEntries.find((entry) => entry.id === match.blockId);
    const functionInfo = walkBackToFunctionEntry(context, startEntry);
    const callers = listDirectCallers(context.blockEntries, functionInfo.entryPc);

    return {
      ...match,
      functionEntry: functionInfo.entryPc,
      functionMode: functionInfo.entryMode,
      fallthroughChain: functionInfo.chain.map((entry) => entry.block.startPc),
      callers,
      callerCount: callers.length,
    };
  });

  const grouped = new Map();

  for (const match of enrichedMatches) {
    const group = grouped.get(match.functionEntry) || {
      entryPc: match.functionEntry,
      entryMode: match.functionMode,
      matches: [],
      callers: match.callers,
    };
    group.matches.push(match);
    grouped.set(match.functionEntry, group);
  }

  const groupedCandidates = [...grouped.values()].sort((a, b) => {
    if (b.callers.length !== a.callers.length) {
      return b.callers.length - a.callers.length;
    }

    if (b.matches.length !== a.matches.length) {
      return b.matches.length - a.matches.length;
    }

    return a.entryPc - b.entryPc;
  });

  return {
    enrichedMatches,
    groupedCandidates,
  };
}

function printMatchSummary(matches) {
  console.log('=== Strict Pattern Matches ===');
  console.log(`match_count=${matches.length}`);

  if (matches.length === 0) {
    console.log('no strict block-level Pattern A/B matches');
    console.log('');
    return;
  }

  for (const match of matches) {
    console.log(
      [
        `block=${hex(match.blockPc)}`,
        `mode=${match.blockMode}`,
        `pattern=${match.pattern}`,
        `function=${hex(match.functionEntry)}`,
        `callers=${match.callerCount}`,
        `caller_pcs=${formatCallers(match.callers)}`,
      ].join('  '),
    );
  }

  console.log('');
}

function printProbeSummary(probes) {
  console.log('=== Probe Results ===');
  console.log(`probe_count=${probes.length}`);

  if (probes.length === 0) {
    console.log('no probes run');
    console.log('');
    return;
  }

  for (const probe of probes) {
    const extra = probe.error ? `  error=${probe.error}` : '';
    console.log(
      [
        `entry=${hex(probe.entryPc)}`,
        `matches=${probe.matchedBlockCount}`,
        `callers=${probe.callerCount}`,
        `steps=${probe.steps}`,
        `term=${probe.termination}`,
        `vram=${probe.vramWrites}`,
        `bbox=${formatBbox(probe.bbox)}`,
        `blocks=${probe.uniqueBlocks}`,
        `first10=${formatBlocks(probe.firstBlocks)}`,
      ].join('  ') + extra,
    );
  }

  console.log('');
}

function printRankedSummary(rankedProbes) {
  console.log('=== Top Candidates ===');

  if (rankedProbes.length === 0) {
    console.log('no ranked candidates');
    console.log('');
    return;
  }

  for (let index = 0; index < rankedProbes.length; index += 1) {
    const probe = rankedProbes[index];
    console.log(
      [
        `rank=${index + 1}`,
        `entry=${hex(probe.entryPc)}`,
        `score=${probe.score}`,
        `vram=${probe.vramWrites}`,
        `bbox=${formatBbox(probe.bbox)}`,
        `term=${probe.termination}`,
        `blocks=${probe.uniqueBlocks}`,
        `note=${buildProbeNotes(probe)}`,
      ].join('  '),
    );
  }

  console.log('');
}

async function main() {
  const blockEntries = await loadBlocks();
  const context = buildContext(blockEntries);
  const strictMatches = [];

  for (const blockEntry of blockEntries) {
    const blockMatches = collectStrictMatches(blockEntry);

    for (const match of blockMatches) {
      strictMatches.push({
        ...match,
        blockId: blockEntry.id,
      });
    }
  }

  const { enrichedMatches, groupedCandidates } = groupCandidates(context, strictMatches);
  const probeTargets = groupedCandidates.slice(0, MAX_PROBES);
  const probes = [];

  if (probeTargets.length > 0) {
    const env = await buildProbeEnv(blockEntries);

    for (const candidate of probeTargets) {
      const probe = runProbe(env, candidate.entryPc);
      probes.push({
        ...probe,
        matchedBlockCount: candidate.matches.length,
        callerCount: candidate.callers.length,
      });
    }
  }

  for (const probe of probes) {
    probe.score = scoreProbe(probe);
  }

  const rankedProbes = [...probes].sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }

    if (b.vramWrites !== a.vramWrites) {
      return b.vramWrites - a.vramWrites;
    }

    if (a.uniqueBlocks !== b.uniqueBlocks) {
      return a.uniqueBlocks - b.uniqueBlocks;
    }

    return a.entryPc - b.entryPc;
  });

  const printLoops = collectPrintLoops(blockEntries);
  const report = buildReport({
    matches: enrichedMatches,
    groupedCandidates,
    probes,
    rankedProbes,
    printLoops,
  });

  fs.writeFileSync(reportPath, report);

  console.log('=== Phase 76: walker scan ===');
  console.log(`blocks=${blockEntries.length}`);
  console.log(`strict_matches=${enrichedMatches.length}`);
  console.log(`matched_functions=${groupedCandidates.length}`);
  console.log(`probe_hl=${hex(TOKEN_NAME_HL)}`);
  console.log('');

  printMatchSummary(enrichedMatches);
  printProbeSummary(probes);
  printRankedSummary(rankedProbes);

  console.log('=== Supporting call/djnz loops ===');
  for (const loop of printLoops) {
    console.log(
      `loop=${hex(loop.loopPc)}  target=${hex(loop.targetPc)}  mode=${loop.loopMode}`,
    );
  }

  console.log('');
  console.log(`report=${path.basename(reportPath)}`);
}

await main();
