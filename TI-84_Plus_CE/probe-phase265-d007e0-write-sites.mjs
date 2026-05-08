#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TARGET_ADDR = 0xD007E0;
const TARGET_LE = [0xE0, 0x07, 0xD0];
const DIRECT_A_PATTERN = [0x32, ...TARGET_LE];
const PAIR_STORE_PATTERNS = [
  { label: 'LD (D007E0),BC', bytes: [0xED, 0x43, ...TARGET_LE], pair: 'bc' },
  { label: 'LD (D007E0),DE', bytes: [0xED, 0x53, ...TARGET_LE], pair: 'de' },
  { label: 'LD (D007E0),HL', bytes: [0xED, 0x63, ...TARGET_LE], pair: 'hl' },
  { label: 'LD (D007E0),SP', bytes: [0xED, 0x73, ...TARGET_LE], pair: 'sp' },
];
const ED39_WILDCARD = [0xED, 0x39, null, 0xE0, 0x07, 0xD0];

const RETURN_SENTINEL = 0x7FFFFE;
const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const DYNAMIC_STEP_BUDGET = 160;
const DYNAMIC_LIMIT = 5;
const DYNAMIC_REGION_ORDER = ['OS core', 'Editor', 'Graph', 'Display', 'Other'];
const STOP_AFTER_TARGET_WRITE = '__phase265_stop_after_target_write__';

const COMMON_DYNAMIC_SEEDS = [
  [0xD00000, 0x00],
  [0xD003DA, 0x00],
  [0xD003E0, 0x00],
  [0xD0058D, 0x00],
  [0xD0058E, 0x8F],
  [0xD0059F, 0x00],
  [0xD007E0, 0xA5],
  [0xD00824, 0x00],
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function classifyRegion(addr) {
  const highByte = (addr >>> 16) & 0xFF;
  if (highByte === 0x09) return 'STAT';
  if (highByte === 0x04) return 'OS core';
  if (highByte === 0x05) return 'Editor';
  if (highByte === 0x06) return 'Graph';
  if (highByte === 0x08) return 'Display';
  return 'Other';
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      source: 'js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Regenerate the transpiled ROM first.',
    );
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase265-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function scanPattern(buffer, bytes) {
  const hits = [];
  for (let offset = 0; offset <= buffer.length - bytes.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < bytes.length; index += 1) {
      if (buffer[offset + index] !== bytes[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(offset);
    }
  }
  return hits;
}

function scanWildcardPattern(buffer, pattern) {
  const hits = [];
  for (let offset = 0; offset <= buffer.length - pattern.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < pattern.length; index += 1) {
      const token = pattern[index];
      if (token !== null && buffer[offset + index] !== token) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(offset);
    }
  }
  return hits;
}

function hexDump(romBytes, start, count) {
  const begin = Math.max(0, start);
  const end = Math.min(romBytes.length, start + count);
  return bytesToHex(romBytes.subarray(begin, end));
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    default: {
      const parts = [];
      for (const [key, value] of Object.entries(inst ?? {})) {
        if (
          value === undefined ||
          value === null ||
          ['pc', 'length', 'nextPc', 'fallthrough', 'terminates', 'mode', 'modePrefix', 'tag'].includes(key)
        ) {
          continue;
        }
        if (typeof value === 'number') {
          if (key === 'addr' || key === 'target') {
            parts.push(`${key}=${hex(value)}`);
          } else if (key === 'value') {
            parts.push(`${key}=${hexByte(value)}`);
          } else {
            parts.push(`${key}=${value}`);
          }
        } else {
          parts.push(`${key}=${value}`);
        }
      }
      return parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : String(inst?.tag ?? 'unknown');
    }
  }
}

function isControlInstruction(inst) {
  return [
    'call',
    'call-conditional',
    'jp',
    'jp-conditional',
    'jr',
    'jr-conditional',
  ].includes(inst?.tag);
}

function describeContext(inst) {
  if (!inst) {
    return 'n/a';
  }
  return `${formatInstruction(inst)} @${hex(inst.pc)}`;
}

function findBestDecodeWindow(romBytes, site, patternLength, options = {}) {
  const beforeBytes = options.beforeBytes ?? 20;
  const afterBytes = options.afterBytes ?? 12;
  const slop = options.slop ?? 12;
  const desiredStart = Math.max(0, site - beforeBytes);
  const earliestStart = Math.max(0, desiredStart - slop);
  const latestExclusive = Math.min(romBytes.length, site + patternLength + afterBytes);

  let best = null;

  for (let candidate = earliestStart; candidate <= site; candidate += 1) {
    const instructions = [];
    let pc = candidate;
    let exactSite = false;
    let valid = true;

    while (pc < latestExclusive) {
      let inst;
      try {
        inst = decodeInstruction(romBytes, pc, 'adl');
      } catch {
        valid = false;
        break;
      }

      if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
        valid = false;
        break;
      }

      if (pc < site && pc + inst.length > site) {
        valid = false;
        break;
      }

      instructions.push(inst);
      if (pc === site) {
        exactSite = true;
      }
      pc += inst.length;
    }

    if (!valid || !exactSite) {
      continue;
    }

    const coveredBefore = Math.min(site - candidate, beforeBytes);
    const coveredAfter = Math.min(Math.max(0, pc - site), afterBytes + patternLength);
    const startPenalty = Math.abs(candidate - desiredStart);
    const score = (coveredBefore * 1000) + (coveredAfter * 10) - startPenalty;

    if (!best || score > best.score) {
      best = { start: candidate, end: pc, instructions, score };
    }
  }

  return best;
}

function findNearestContext(instructions, site) {
  let best = null;
  for (const inst of instructions ?? []) {
    if (!isControlInstruction(inst)) continue;
    const distance = Math.abs((inst.pc ?? 0) - site);
    const prefer = (inst.pc ?? 0) <= site ? 0 : 1;
    const score = (distance * 10) + prefer;
    if (!best || score < best.score) {
      best = { inst, score };
    }
  }
  return best?.inst ?? null;
}

function printTable(headers, rows) {
  const widths = headers.map((header) => header.length);

  for (const row of rows) {
    for (let index = 0; index < headers.length; index += 1) {
      widths[index] = Math.max(widths[index], String(row[index] ?? '').length);
    }
  }

  console.log(headers.map((header, index) => header.padEnd(widths[index])).join('  '));
  console.log(widths.map((width) => '-'.repeat(width)).join('  '));
  for (const row of rows) {
    console.log(row.map((value, index) => String(value ?? '').padEnd(widths[index])).join('  '));
  }
}

function rangesOverlap(a0, aWidth, b0, bWidth) {
  const a1 = a0 + aWidth - 1;
  const b1 = b0 + bWidth - 1;
  return a0 <= b1 && b0 <= a1;
}

function instructionWriteWidth(inst) {
  switch (inst?.tag) {
    case 'ld-mem-reg':
    case 'ld-mem-imm':
    case 'inc-mem':
    case 'dec-mem':
    case 'res-mem':
    case 'set-mem':
    case 'sla-mem':
    case 'sll-mem':
    case 'sra-mem':
    case 'srl-mem':
    case 'rl-mem':
    case 'rr-mem':
    case 'rlc-mem':
    case 'rrc-mem':
      return 1;
    case 'ld-mem-pair':
      return inst.mode === 'adl' ? 3 : 2;
    default:
      if (
        typeof inst?.addr === 'number' &&
        String(inst.tag ?? '').includes('mem') &&
        inst.tag !== 'ld-reg-mem'
      ) {
        return 1;
      }
      return 0;
  }
}

function buildLiftedSiteMap(blocks) {
  const siteMap = new Map();

  for (const block of Object.values(blocks)) {
    for (const inst of block.instructions ?? []) {
      const width = instructionWriteWidth(inst);
      if (!width || typeof inst.addr !== 'number') {
        continue;
      }
      if (!rangesOverlap(inst.addr, width, TARGET_ADDR, 1)) {
        continue;
      }
      if (inst.addr !== TARGET_ADDR) {
        continue;
      }

      siteMap.set(inst.pc, {
        pc: inst.pc,
        blockStart: block.startPc ?? inst.pc,
        blockMode: block.mode ?? inst.mode ?? 'adl',
        blockId: block.id ?? `${hex(block.startPc ?? inst.pc)}:${block.mode ?? inst.mode ?? 'adl'}`,
        dasm: inst.dasm ?? formatInstruction(inst),
        tag: inst.tag ?? 'unknown',
      });
    }
  }

  return siteMap;
}

function collectSite(romBytes, site, patternLength, label, liftedSiteMap) {
  const decodeWindow = findBestDecodeWindow(romBytes, site, patternLength, {
    beforeBytes: 20,
    afterBytes: 12,
    slop: 12,
  });
  const instructions = decodeWindow?.instructions ?? [];
  const contextInst = findNearestContext(instructions, site);
  const detailInstructions = instructions.filter(
    (inst) => (inst.pc + inst.length) > (site - 16) && inst.pc <= site + patternLength + 8,
  );

  return {
    site,
    label,
    patternLength,
    region: classifyRegion(site),
    contextInst,
    detailInstructions,
    lifted: liftedSiteMap.get(site) ?? null,
    preceding16: hexDump(romBytes, site - 16, 16),
    following8: hexDump(romBytes, site + patternLength, 8),
  };
}

function chooseDynamicCandidates(hits) {
  const pool = hits.filter(
    (hit) => hit.label === 'LD (D007E0),A' && hit.region !== 'STAT' && hit.lifted,
  );
  const selected = [];
  const seen = new Set();

  for (const region of DYNAMIC_REGION_ORDER) {
    const match = pool.find((hit) => hit.region === region && !seen.has(hit.site));
    if (!match) continue;
    selected.push(match);
    seen.add(match.site);
  }

  for (const hit of pool) {
    if (selected.length >= DYNAMIC_LIMIT) break;
    if (seen.has(hit.site)) continue;
    selected.push(hit);
    seen.add(hit.site);
  }

  return selected.slice(0, DYNAMIC_LIMIT);
}

function createMemory(romBytes) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return memory;
}

function write24(memory, addr, value) {
  const base = addr & MEM_MASK;
  memory[base] = value & 0xFF;
  memory[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  memory[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function seedDynamicCpu(cpu, memory, hit) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = hit.lifted?.blockMode === 'z80' ? 0 : 1;
  cpu.mbase = MBASE;
  cpu.pc = hit.lifted?.blockStart ?? hit.site;
  cpu.sp = STACK_TOP - 3;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;

  for (const [addr, value] of COMMON_DYNAMIC_SEEDS) {
    memory[addr & MEM_MASK] = value & 0xFF;
  }
  memory.fill(0x00, IY_BASE & MEM_MASK, (IY_BASE & MEM_MASK) + 0x80);
  memory.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(memory, cpu.sp, RETURN_SENTINEL);
}

function buildTargetWriteEvent(hit, blockState, addr, width, rawValue) {
  const normalizedAddr = addr & 0xFFFFFF;
  if (!rangesOverlap(normalizedAddr, width, TARGET_ADDR, 1)) {
    return null;
  }

  const offset = TARGET_ADDR - normalizedAddr;
  const value = (Number(rawValue) >>> (offset * 8)) & 0xFF;

  return {
    site: hit.site,
    siteLabel: hit.label,
    eventPc: hit.site,
    blockStart: blockState.pc,
    blockMode: blockState.mode,
    step: blockState.step + 1,
    addr: normalizedAddr,
    width,
    value,
    rawValue: Number(rawValue) >>> 0,
  };
}

function installTargetWriteTracer(cpu, hit, blockState, events) {
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const event = buildTargetWriteEvent(hit, blockState, addr, 1, value);
    const result = origWrite8(addr, value);
    if (event) {
      events.push(event);
      throw new Error(STOP_AFTER_TARGET_WRITE);
    }
    return result;
  };

  cpu.write16 = (addr, value) => {
    const event = buildTargetWriteEvent(hit, blockState, addr, 2, value);
    const result = origWrite16(addr, value);
    if (event) {
      events.push(event);
      throw new Error(STOP_AFTER_TARGET_WRITE);
    }
    return result;
  };

  cpu.write24 = (addr, value) => {
    const event = buildTargetWriteEvent(hit, blockState, addr, 3, value);
    const result = origWrite24(addr, value);
    if (event) {
      events.push(event);
      throw new Error(STOP_AFTER_TARGET_WRITE);
    }
    return result;
  };
}

function runDynamicSite(blocks, romBytes, hit) {
  const memory = createMemory(romBytes);
  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
  });
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;

  seedDynamicCpu(cpu, memory, hit);

  const blockState = {
    pc: hit.lifted?.blockStart ?? hit.site,
    mode: hit.lifted?.blockMode ?? 'adl',
    step: 0,
  };
  const visited = new Set();
  const trace = [];
  const events = [];
  let result = null;
  let termination = 'budget';
  let lastPc = hit.lifted?.blockStart ?? hit.site;
  let lastMode = hit.lifted?.blockMode ?? 'adl';

  installTargetWriteTracer(cpu, hit, blockState, events);

  try {
    result = executor.runFrom(hit.lifted?.blockStart ?? hit.site, hit.lifted?.blockMode ?? 'adl', {
      maxSteps: DYNAMIC_STEP_BUDGET,
      maxLoopIterations: 32,
      onBlock(pc, mode, meta, step) {
        blockState.pc = pc & 0xFFFFFF;
        blockState.mode = mode ?? meta?.mode ?? blockState.mode;
        blockState.step = step ?? 0;
        lastPc = blockState.pc;
        lastMode = blockState.mode;

        const key = `${hex(blockState.pc)}:${blockState.mode}`;
        visited.add(key);
        if (trace.length < 12) {
          trace.push(key);
        }
      },
      onMissingBlock(pc, mode, step) {
        blockState.pc = pc & 0xFFFFFF;
        blockState.mode = mode ?? blockState.mode;
        blockState.step = step ?? 0;
        lastPc = blockState.pc;
        lastMode = blockState.mode;

        const key = `${hex(blockState.pc)}:${blockState.mode}:missing`;
        visited.add(key);
        if (trace.length < 12) {
          trace.push(key);
        }
      },
    });
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === STOP_AFTER_TARGET_WRITE) {
      termination = 'first_write';
    } else {
      throw error;
    }
  }

  return {
    site: hit.site,
    region: hit.region,
    requestedPc: hit.site,
    actualStartPc: hit.lifted?.blockStart ?? hit.site,
    actualStartMode: hit.lifted?.blockMode ?? 'adl',
    writeObserved: events.length > 0,
    firstValue: events[0]?.value ?? null,
    finalValue: memory[TARGET_ADDR] & 0xFF,
    steps: events[0]?.step ?? result?.steps ?? (blockState.step + 1),
    termination,
    lastPc,
    lastMode,
    uniqueBlocks: visited.size,
    trace,
  };
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const transpiledAssets = ensureTranspiledModule();

  try {
    const transpiledModule = await import(pathToFileURL(transpiledAssets.modulePath).href);
    const blocks = normalizeBlocks(
      transpiledModule.PRELIFTED_BLOCKS ??
      transpiledModule.default?.PRELIFTED_BLOCKS ??
      transpiledModule.default ??
      transpiledModule,
    );
    const liftedSiteMap = buildLiftedSiteMap(blocks);

    const directAHits = scanPattern(romBytes, DIRECT_A_PATTERN);
    const pairHits = PAIR_STORE_PATTERNS.flatMap((pattern) =>
      scanPattern(romBytes, pattern.bytes).map((site) => ({
        site,
        patternLength: pattern.bytes.length,
        label: pattern.label,
      })),
    );
    const ed39Hits = scanWildcardPattern(romBytes, ED39_WILDCARD);

    const allExactHits = [
      ...directAHits.map((site) => collectSite(romBytes, site, DIRECT_A_PATTERN.length, 'LD (D007E0),A', liftedSiteMap)),
      ...pairHits.map((hit) => collectSite(romBytes, hit.site, hit.patternLength, hit.label, liftedSiteMap)),
    ].sort((left, right) => left.site - right.site);

    console.log('=== Phase 265: D007E0 Non-STAT Write-Site Investigation ===\n');
    console.log(`ROM: ${ROM_PATH}`);
    console.log(`Transpiled blocks: ${transpiledAssets.modulePath} (${transpiledAssets.source})`);
    console.log(`Target RAM byte: ${hex(TARGET_ADDR)}`);
    console.log('Timer IRQ: disabled via createPeripheralBus({ timerInterrupt: false })');
    console.log('');

    console.log('--- Static pattern scan ---');
    console.log(`LD (D007E0),A  [32 E0 07 D0]:        ${directAHits.length} hit(s)`);
    for (const pattern of PAIR_STORE_PATTERNS) {
      const count = pairHits.filter((hit) => hit.label === pattern.label).length;
      console.log(`${pattern.label.padEnd(31, ' ')} ${String(count).padStart(2, ' ')} hit(s)`);
    }
    console.log(`ED 39 ? E0 07 D0 wildcard:            ${ed39Hits.length} hit(s)`);
    console.log('');

    if (allExactHits.length > 0) {
      console.log('--- Exact write sites ---\n');
      printTable(
        ['site', 'region', 'instruction', 'nearest CALL/JP/JR', 'lifted block'],
        allExactHits.map((hit) => [
          hex(hit.site),
          hit.region,
          hit.label,
          describeContext(hit.contextInst),
          hit.lifted ? `${hex(hit.lifted.blockStart)}:${hit.lifted.blockMode}` : 'n/a',
        ]),
      );

      console.log('\n--- Per-site byte context and disassembly ---\n');
      for (const hit of allExactHits) {
        console.log(`${hex(hit.site)}  ${hit.label}  region=${hit.region}`);
        console.log(`  preceding16: ${hit.preceding16}`);
        console.log(`  following8 : ${hit.following8}`);
        if (hit.detailInstructions.length > 0) {
          console.log('  disassembly:');
          for (const inst of hit.detailInstructions) {
            const marker = inst.pc === hit.site ? ' <== WRITE' : '';
            console.log(`    ${hex(inst.pc)}: ${formatInstruction(inst)}${marker}`);
          }
        } else {
          console.log('  disassembly: (no aligned decode window found)');
        }
        console.log('');
      }
    } else {
      console.log('No exact write patterns were found for D007E0.\n');
    }

    if (ed39Hits.length > 0) {
      console.log('--- ED 39 wildcard sites ---\n');
      for (const site of ed39Hits) {
        console.log(`${hex(site)}  bytes=${hexDump(romBytes, site, ED39_WILDCARD.length)}  region=${classifyRegion(site)}`);
      }
      console.log('');
    }

    const dynamicCandidates = chooseDynamicCandidates(allExactHits);
    console.log('--- Dynamic spot checks ---');
    console.log('Note: when a write PC sits inside a lifted basic block, the probe starts from that block entry instead of the interior instruction address.');
    console.log('');

    if (dynamicCandidates.length === 0) {
      console.log('No non-STAT lifted `LD (D007E0),A` sites were available for dynamic spot checks.');
      return;
    }

    const dynamicResults = dynamicCandidates.map((hit) => runDynamicSite(blocks, romBytes, hit));
    printTable(
      ['site', 'region', 'startPc', 'wrote?', 'value', 'steps', 'termination', 'lastPc'],
      dynamicResults.map((result) => [
        hex(result.site),
        result.region,
        `${hex(result.actualStartPc)}:${result.actualStartMode}`,
        result.writeObserved ? 'yes' : 'no',
        result.writeObserved ? hexByte(result.firstValue) : hexByte(result.finalValue),
        result.steps,
        result.termination,
        `${hex(result.lastPc)}:${result.lastMode}`,
      ]),
    );

    console.log('\n--- Dynamic traces ---\n');
    for (const result of dynamicResults) {
      console.log(`${hex(result.site)} region=${result.region}`);
      console.log(`  requestedPc: ${hex(result.requestedPc)}`);
      console.log(`  actualStart: ${hex(result.actualStartPc)}:${result.actualStartMode}`);
      console.log(`  writeObserved: ${result.writeObserved ? 'yes' : 'no'}`);
      console.log(`  firstValue/finalValue: ${result.writeObserved ? hexByte(result.firstValue) : 'n/a'} / ${hexByte(result.finalValue)}`);
      console.log(`  steps=${result.steps} termination=${result.termination} uniqueBlocks=${result.uniqueBlocks}`);
      console.log(`  trace: ${result.trace.join(' -> ') || '(none)'}`);
      console.log('');
    }
  } finally {
    cleanupTranspiledModule(transpiledAssets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
