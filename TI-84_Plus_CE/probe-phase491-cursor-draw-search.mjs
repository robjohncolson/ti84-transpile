#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const romPath = path.join(__dirname, 'ROM.rom');

const ROM_SIZE = 0x400000;
const SCAN_START = 0x060000;
const SCAN_END = 0x062000;
const CURSOR_ERASE = 0x061000;
const CHAR_RENDERER = 0x0059c6;
const CURSOR_ROW = 0xd00595;
const CURSOR_COL = 0xd00596;
const CURSOR_FLAGS = 0xd00092;
const VRAM_START = 0xd40000;
const VRAM_END = 0xd52bff;
const VRAM_WIDTH = 320;
const CELL_WIDTH = 12;
const CELL_HEIGHT = 16;
const RETURN_SENTINEL = 0x0badf0;
const MODE_PREFIXES = new Set([0x40, 0x49, 0x52, 0x5b]);

const DIRECT_CALL_OPS = new Map([
  [0xcd, 'CALL'],
]);
const DIRECT_JP_OPS = new Map([
  [0xc3, 'JP'],
]);
const CONDITIONAL_CALL_OPS = new Map([
  [0xc4, 'CALL NZ'],
  [0xcc, 'CALL Z'],
  [0xd4, 'CALL NC'],
  [0xdc, 'CALL C'],
  [0xe4, 'CALL PO'],
  [0xec, 'CALL PE'],
  [0xf4, 'CALL P'],
  [0xfc, 'CALL M'],
]);
const CONDITIONAL_JP_OPS = new Map([
  [0xc2, 'JP NZ'],
  [0xca, 'JP Z'],
  [0xd2, 'JP NC'],
  [0xda, 'JP C'],
  [0xe2, 'JP PO'],
  [0xea, 'JP PE'],
  [0xf2, 'JP P'],
  [0xfa, 'JP M'],
]);

const CONTROL_OPS = new Map([
  ...DIRECT_CALL_OPS,
  ...DIRECT_JP_OPS,
  ...CONDITIONAL_CALL_OPS,
  ...CONDITIONAL_JP_OPS,
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function range(start, end) {
  return { start: Math.max(0, start), end: Math.max(0, end) };
}

function read16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function read24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function inRom(addr) {
  return addr >= 0 && addr < ROM_SIZE;
}

function inVram(addr) {
  return addr >= VRAM_START && addr <= VRAM_END;
}

function matchesAt(bytes, offset, pattern) {
  if (offset < 0 || offset + pattern.length > bytes.length) return false;
  for (let i = 0; i < pattern.length; i += 1) {
    if (bytes[offset + i] !== pattern[i]) return false;
  }
  return true;
}

function findPattern(bytes, pattern, start = 0, end = bytes.length) {
  const hits = [];
  const stop = Math.min(end, bytes.length - pattern.length + 1);
  for (let offset = Math.max(0, start); offset < stop; offset += 1) {
    if (matchesAt(bytes, offset, pattern)) hits.push(offset);
  }
  return hits;
}

function makeCursorReadPatterns() {
  const vars = [
    { name: 'D00595 cursor row', addr: CURSOR_ROW, lo: 0x95 },
    { name: 'D00596 cursor column', addr: CURSOR_COL, lo: 0x96 },
  ];
  const patterns = [];

  for (const variable of vars) {
    patterns.push({
      variable,
      label: `LD A,(${hex(variable.addr)}) ADL`,
      bytes: [0x3a, variable.lo, 0x05, 0xd0],
      kind: 'A absolute read',
    });
    patterns.push({
      variable,
      label: `LD A,(${hex(variable.addr & 0xffff, 4)}) SIS-like 3A candidate`,
      bytes: [0x3a, variable.lo, 0x05],
      kind: 'A 16-bit read candidate',
      skipIfFollowedBy: 0xd0,
    });
    patterns.push({
      variable,
      label: `LD A,(${hex(variable.addr & 0xffff, 4)}) SIS-like FA candidate`,
      bytes: [0xfa, variable.lo, 0x05],
      kind: 'A SIS read candidate',
    });
    patterns.push({
      variable,
      label: `LD HL,(${hex(variable.addr)}) ADL`,
      bytes: [0x2a, variable.lo, 0x05, 0xd0],
      kind: 'HL absolute read',
    });
    patterns.push({
      variable,
      label: `LD HL,(${hex(variable.addr & 0xffff, 4)}) SIS candidate`,
      bytes: [0x2a, variable.lo, 0x05],
      kind: 'HL 16-bit read candidate',
      skipIfFollowedBy: 0xd0,
    });
    for (const [op, reg] of [
      [0x4b, 'BC'],
      [0x5b, 'DE'],
      [0x6b, 'HL'],
    ]) {
      patterns.push({
        variable,
        label: `LD ${reg},(${hex(variable.addr)}) ED ADL`,
        bytes: [0xed, op, variable.lo, 0x05, 0xd0],
        kind: `${reg} absolute read`,
      });
      patterns.push({
        variable,
        label: `LD ${reg},(${hex(variable.addr & 0xffff, 4)}) ED SIS candidate`,
        bytes: [0xed, op, variable.lo, 0x05],
        kind: `${reg} 16-bit read candidate`,
        skipIfFollowedBy: 0xd0,
      });
    }
  }

  return patterns;
}

function findCursorVariableReads(bytes) {
  const hits = [];
  for (const pattern of makeCursorReadPatterns()) {
    for (const offset of findPattern(bytes, pattern.bytes, SCAN_START, SCAN_END)) {
      if (
        pattern.skipIfFollowedBy !== undefined &&
        bytes[offset + pattern.bytes.length] === pattern.skipIfFollowedBy
      ) {
        continue;
      }
      hits.push({
        offset,
        variable: pattern.variable.name,
        variableAddress: pattern.variable.addr,
        label: pattern.label,
        kind: pattern.kind,
        bytes: pattern.bytes,
      });
    }
  }
  hits.sort((a, b) => a.offset - b.offset || a.label.localeCompare(b.label));
  return hits;
}

function readTarget24(bytes, offset) {
  if (offset + 4 > bytes.length) return null;
  const op = bytes[offset];
  const mnemonic = CONTROL_OPS.get(op);
  if (!mnemonic) return null;
  return {
    offset,
    opcodeOffset: offset,
    opcode: op,
    mnemonic,
    target: read24LE(bytes, offset + 1),
    size: 4,
    mode: 'ADL/plain',
  };
}

function readPrefixedTarget16(bytes, offset) {
  if (offset + 4 > bytes.length || !MODE_PREFIXES.has(bytes[offset])) return null;
  const op = bytes[offset + 1];
  const mnemonic = CONTROL_OPS.get(op);
  if (!mnemonic) return null;
  return {
    offset,
    opcodeOffset: offset + 1,
    prefix: bytes[offset],
    opcode: op,
    mnemonic: `${mnemonic}.prefixed`,
    target16: read16LE(bytes, offset + 2),
    size: 4,
    mode: `prefix ${byteHex(bytes[offset])} 16-bit target`,
  };
}

function scanControlTransfers(bytes, start = 0, end = bytes.length, options = {}) {
  const transfers = [];
  const stop = Math.min(end, bytes.length - 3);
  for (let offset = Math.max(0, start); offset < stop; offset += 1) {
    const prefixed = readPrefixedTarget16(bytes, offset);
    if (prefixed) {
      transfers.push(prefixed);
      continue;
    }

    const direct = readTarget24(bytes, offset);
    if (!direct) continue;
    if (options.directOnly && !(DIRECT_CALL_OPS.has(direct.opcode) || DIRECT_JP_OPS.has(direct.opcode))) {
      continue;
    }
    transfers.push(direct);
  }
  return transfers;
}

function buildFunctionEntryIndex(bytes) {
  const entries = new Set([0, CHAR_RENDERER, CURSOR_ERASE, SCAN_START]);
  for (const transfer of scanControlTransfers(bytes, 0, bytes.length, { directOnly: true })) {
    if (transfer.target !== undefined && inRom(transfer.target)) {
      entries.add(transfer.target);
    }
  }
  return [...entries].sort((a, b) => a - b);
}

function lowerBound(values, target) {
  let lo = 0;
  let hi = values.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (values[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function containingFunction(entries, offset) {
  const index = lowerBound(entries, offset + 1) - 1;
  if (index < 0) return { entry: offset, inferred: true, next: null };
  const entry = entries[index];
  const next = entries[index + 1] ?? null;
  if (offset - entry > 0x800) return { entry: offset, inferred: true, next };
  return { entry, inferred: false, next };
}

function groupReadsByFunction(reads, entries) {
  const groups = new Map();
  for (const hit of reads) {
    const owner = containingFunction(entries, hit.offset);
    const key = owner.entry;
    if (!groups.has(key)) {
      groups.set(key, {
        entry: key,
        inferred: owner.inferred,
        next: owner.next,
        reads: [],
      });
    }
    groups.get(key).reads.push(hit);
    if (!owner.inferred) groups.get(key).inferred = false;
  }
  return [...groups.values()].sort((a, b) => a.entry - b.entry);
}

function scanGlyphLoads(bytes, start, end) {
  const hits = [];
  const stop = Math.min(end, bytes.length - 1);
  for (let offset = Math.max(0, start); offset < stop; offset += 1) {
    if (bytes[offset] === 0x3e && bytes[offset + 1] >= 0xe1 && bytes[offset + 1] <= 0xe3) {
      hits.push({ offset, glyph: bytes[offset + 1] });
    }
  }
  return hits;
}

function scanVramImmediates(bytes, start, end) {
  const refs = [];
  const stop = Math.min(end, bytes.length - 3);
  for (let offset = Math.max(0, start); offset < stop; offset += 1) {
    const addr = read24LE(bytes, offset);
    if (!inVram(addr)) continue;
    const storeOpcode = offset > 0 && bytes[offset - 1] === 0x32;
    refs.push({
      offset: storeOpcode ? offset - 1 : offset,
      address: addr,
      kind: storeOpcode ? `LD (${hex(addr)}),A immediate store` : `VRAM immediate ${hex(addr)}`,
    });
  }
  return refs;
}

function scanNearbyFeatures(bytes, start, end) {
  const bounded = range(start, end);
  const transfers = scanControlTransfers(bytes, bounded.start, bounded.end)
    .filter((transfer) => {
      if (transfer.target !== undefined) return inRom(transfer.target);
      return true;
    })
    .map((transfer) => {
      const target = transfer.target !== undefined ? hex(transfer.target) : `${hex(transfer.target16, 4)} (16-bit)`;
      return {
        offset: transfer.offset,
        mnemonic: transfer.mnemonic,
        target,
        rawTarget: transfer.target,
        target16: transfer.target16,
        mode: transfer.mode,
      };
    });
  return {
    callsToRenderer: transfers.filter((transfer) => transfer.rawTarget === CHAR_RENDERER),
    callsToErase: transfers.filter((transfer) => transfer.rawTarget === CURSOR_ERASE),
    calls: transfers,
    glyphLoads: scanGlyphLoads(bytes, bounded.start, bounded.end),
    vramRefs: scanVramImmediates(bytes, bounded.start, bounded.end),
  };
}

function uniqueByOffsetAndKind(items) {
  const seen = new Set();
  const out = [];
  for (const item of items) {
    const key = `${item.offset}:${item.kind ?? item.mnemonic ?? item.label ?? ''}:${item.target ?? item.address ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function summarizeList(items, formatter, limit = 12) {
  if (!items.length) return 'none';
  const shown = items.slice(0, limit).map(formatter);
  if (items.length > limit) shown.push(`... ${items.length - limit} more`);
  return shown.join('; ');
}

function findTargetReferences(bytes, target) {
  const refs = [];
  const targetLo = target & 0xff;
  const targetMid = (target >> 8) & 0xff;
  const targetHi = (target >> 16) & 0xff;
  const target16 = target & 0xffff;

  for (let offset = 0; offset <= bytes.length - 4; offset += 1) {
    if (
      (bytes[offset] === 0xcd || bytes[offset] === 0xc3) &&
      bytes[offset + 1] === targetLo &&
      bytes[offset + 2] === targetMid &&
      bytes[offset + 3] === targetHi
    ) {
      refs.push({
        offset,
        mnemonic: bytes[offset] === 0xcd ? 'CALL' : 'JP',
        target,
        mode: 'ADL/plain',
        size: 4,
      });
    }

    if (
      MODE_PREFIXES.has(bytes[offset]) &&
      (bytes[offset + 1] === 0xcd || bytes[offset + 1] === 0xc3) &&
      read16LE(bytes, offset + 2) === target16
    ) {
      refs.push({
        offset,
        mnemonic: `${bytes[offset + 1] === 0xcd ? 'CALL' : 'JP'}.prefixed`,
        target16,
        target,
        mode: `prefix ${byteHex(bytes[offset])} 16-bit target candidate`,
        size: 4,
      });
    }
  }

  refs.sort((a, b) => a.offset - b.offset || a.mnemonic.localeCompare(b.mnemonic));
  return refs;
}

function functionWindowFor(entries, offset, fallbackRadius = 200) {
  const owner = containingFunction(entries, offset);
  if (owner.inferred) {
    return {
      entry: owner.entry,
      inferred: true,
      start: Math.max(0, offset - fallbackRadius),
      end: Math.min(ROM_SIZE, offset + fallbackRadius + 1),
    };
  }
  return {
    entry: owner.entry,
    inferred: false,
    start: owner.entry,
    end: Math.min(owner.next ?? owner.entry + 0x500, owner.entry + 0x500, ROM_SIZE),
  };
}

function printSection(title) {
  console.log('');
  console.log(`=== ${title} ===`);
}

function printPart1(bytes, entries) {
  printSection('Part 1: cursor variable readers in 0x060000-0x062000');
  const reads = findCursorVariableReads(bytes);
  const groups = groupReadsByFunction(reads, entries);

  console.log(`Raw cursor-variable read hits: ${reads.length}`);
  console.log(`Function groups with D00595/D00596 reads: ${groups.length}`);

  if (!groups.length) {
    console.log('No D00595/D00596 readers found in the scan range.');
    return { reads, groups };
  }

  for (const group of groups) {
    const readOffsets = group.reads.map((hit) => hit.offset);
    const nearStart = Math.max(SCAN_START, Math.min(...readOffsets) - 128);
    const nearEnd = Math.min(SCAN_END, Math.max(...readOffsets) + 256);
    const features = scanNearbyFeatures(bytes, nearStart, nearEnd);

    console.log('');
    console.log(
      `Function ${hex(group.entry)}${group.inferred ? ' (inferred from nearest read)' : ''}: ${group.reads.length} read(s)`,
    );
    for (const hit of group.reads) {
      console.log(
        `  ${hex(hit.offset)}: ${hit.label} [${hit.kind}] bytes=${hit.bytes.map(byteHex).join(' ')}`,
      );
    }
    console.log(
      `  nearby calls to 0x0059C6: ${summarizeList(
        features.callsToRenderer,
        (call) => `${hex(call.offset)} ${call.mnemonic} ${call.target}`,
      )}`,
    );
    console.log(
      `  nearby calls/jumps to 0x061000: ${summarizeList(
        features.callsToErase,
        (call) => `${hex(call.offset)} ${call.mnemonic} ${call.target}`,
      )}`,
    );
    console.log(
      `  nearby glyph loads: ${summarizeList(
        features.glyphLoads,
        (hit) => `${hex(hit.offset)} LD A,${byteHex(hit.glyph)}`,
      )}`,
    );
    console.log(
      `  nearby VRAM immediates/stores: ${summarizeList(
        uniqueByOffsetAndKind(features.vramRefs),
        (ref) => `${hex(ref.offset)} ${ref.kind}`,
      )}`,
    );
    console.log(
      `  nearby control transfers: ${summarizeList(
        features.calls,
        (call) => `${hex(call.offset)} ${call.mnemonic} ${call.target}`,
        18,
      )}`,
    );
  }

  return { reads, groups };
}

function printPart2(bytes, entries) {
  printSection('Part 2: callers/jumpers to 0x061000');
  const callers = findTargetReferences(bytes, CURSOR_ERASE);
  console.log(`References to ${hex(CURSOR_ERASE)}: ${callers.length}`);

  if (!callers.length) {
    console.log('No CALL/JP references to 0x061000 found.');
    return callers;
  }

  for (const caller of callers) {
    const window = functionWindowFor(entries, caller.offset, 160);
    const local100 = scanNearbyFeatures(bytes, caller.offset - 100, caller.offset + 101);
    const fnFeatures = scanNearbyFeatures(bytes, window.start, window.end);
    const otherCalls = fnFeatures.calls.filter(
      (call) => call.offset !== caller.offset && call.rawTarget !== CURSOR_ERASE,
    );

    console.log('');
    console.log(
      `${hex(caller.offset)}: ${caller.mnemonic} ${hex(CURSOR_ERASE)} (${caller.mode}); containing function ${hex(
        window.entry,
      )}${window.inferred ? ' inferred' : ''}`,
    );
    console.log(
      `  calls to 0x0059C6 within 100 bytes: ${summarizeList(
        local100.callsToRenderer,
        (call) => `${hex(call.offset)} ${call.mnemonic} ${call.target}`,
      )}`,
    );
    console.log(
      `  glyph loads within 100 bytes: ${summarizeList(
        local100.glyphLoads,
        (hit) => `${hex(hit.offset)} LD A,${byteHex(hit.glyph)}`,
      )}`,
    );
    console.log(
      `  other calls/jumps in containing window: ${summarizeList(
        otherCalls,
        (call) => `${hex(call.offset)} ${call.mnemonic} ${call.target}`,
        24,
      )}`,
    );
    console.log(
      `  VRAM immediates/stores in containing window: ${summarizeList(
        uniqueByOffsetAndKind(fnFeatures.vramRefs),
        (ref) => `${hex(ref.offset)} ${ref.kind}`,
      )}`,
    );
  }

  return callers;
}

function printPart4(bytes) {
  printSection('Part 4: 0x0059C6 + cursor glyph static search');
  const rendererRefs = findTargetReferences(bytes, CHAR_RENDERER).filter((ref) => ref.mnemonic.startsWith('CALL'));
  const eraseRefs = findTargetReferences(bytes, CURSOR_ERASE);
  const pairs = [];

  for (const renderer of rendererRefs) {
    for (const erase of eraseRefs) {
      const distance = Math.abs(renderer.offset - erase.offset);
      if (distance <= 200) pairs.push({ renderer, erase, distance });
    }
  }

  console.log(`CALL references to ${hex(CHAR_RENDERER)}: ${rendererRefs.length}`);
  console.log(`CALL/JP references to ${hex(CURSOR_ERASE)}: ${eraseRefs.length}`);
  console.log(`Renderer/erase references within 200 bytes: ${pairs.length}`);

  if (pairs.length) {
    for (const pair of pairs) {
      const start = Math.min(pair.renderer.offset, pair.erase.offset) - 96;
      const end = Math.max(pair.renderer.offset, pair.erase.offset) + 97;
      const glyphLoads = scanGlyphLoads(bytes, start, end);
      console.log(
        `  ${hex(pair.renderer.offset)} CALL 0x0059C6 and ${hex(pair.erase.offset)} ${
          pair.erase.mnemonic
        } 0x061000 distance=${pair.distance}; glyphs nearby: ${summarizeList(
          glyphLoads,
          (hit) => `${hex(hit.offset)} LD A,${byteHex(hit.glyph)}`,
        )}`,
      );
    }
  }

  const rendererGlyphSites = [];
  for (const renderer of rendererRefs) {
    const glyphLoads = scanGlyphLoads(bytes, renderer.offset - 200, renderer.offset + 201);
    if (glyphLoads.length) rendererGlyphSites.push({ renderer, glyphLoads });
  }

  console.log('');
  console.log(`Renderer calls with LD A,0xE1/0xE2/0xE3 within 200 bytes: ${rendererGlyphSites.length}`);
  if (!rendererGlyphSites.length) {
    console.log('No cursor-glyph loads found near 0x0059C6 calls.');
    return { rendererRefs, eraseRefs, pairs, rendererGlyphSites };
  }

  for (const site of rendererGlyphSites) {
    console.log(
      `  ${hex(site.renderer.offset)} CALL 0x0059C6; glyph loads: ${summarizeList(
        site.glyphLoads,
        (hit) => `${hex(hit.offset)} LD A,${byteHex(hit.glyph)}`,
      )}`,
    );
  }

  return { rendererRefs, eraseRefs, pairs, rendererGlyphSites };
}

async function importFirst(candidates) {
  const errors = [];
  for (const candidate of candidates) {
    const fullPath = path.resolve(__dirname, candidate);
    if (!fs.existsSync(fullPath)) continue;
    try {
      const mod = await import(pathToFileURL(fullPath).href);
      return { mod, fullPath };
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  return { mod: null, fullPath: null, errors };
}

async function ensureTranspiledRom() {
  const candidates = [
    '../scripts/probe-common.mjs',
    '../scripts/probe-utils.mjs',
    '../scripts/probe-helpers.mjs',
    '../scripts/ensure-transpiled-rom.mjs',
    './probe-common.mjs',
  ];
  const imported = await importFirst(candidates);
  const mod = imported.mod;
  const ensure =
    mod?.ensureTranspiledRom ??
    mod?.default?.ensureTranspiledRom ??
    (typeof mod?.default === 'function' ? mod.default : null);

  if (!ensure) {
    console.log('ensureTranspiledRom helper not found; continuing with existing runtime files if present.');
    return false;
  }

  await ensure({ rootDir, projectDir: __dirname, romPath });
  console.log(`ensureTranspiledRom: ${path.relative(rootDir, imported.fullPath)}`);
  return true;
}

async function loadRuntime() {
  await ensureTranspiledRom();

  const cpuImport = await importFirst([
    './cpu-runtime.js',
    './cpu-runtime.mjs',
    '../cpu-runtime.js',
    '../src/cpu-runtime.js',
    '../dist/cpu-runtime.js',
  ]);
  const periphImport = await importFirst([
    './peripherals.js',
    './peripherals.mjs',
    '../peripherals.js',
    '../src/peripherals.js',
    '../dist/peripherals.js',
  ]);

  const createCPU =
    cpuImport.mod?.createCPU ??
    cpuImport.mod?.default?.createCPU ??
    (typeof cpuImport.mod?.default === 'function' ? cpuImport.mod.default : null);
  const createPeripheralBus =
    periphImport.mod?.createPeripheralBus ??
    periphImport.mod?.default?.createPeripheralBus ??
    (typeof periphImport.mod?.default === 'function' ? periphImport.mod.default : null);

  if (!createCPU || !createPeripheralBus) {
    const details = [
      !createCPU ? 'createCPU not found' : null,
      !createPeripheralBus ? 'createPeripheralBus not found' : null,
      cpuImport.errors?.length ? `CPU import errors: ${cpuImport.errors.join(' | ')}` : null,
      periphImport.errors?.length ? `peripheral import errors: ${periphImport.errors.join(' | ')}` : null,
    ]
      .filter(Boolean)
      .join('; ');
    throw new Error(details || 'runtime modules unavailable');
  }

  return { createCPU, createPeripheralBus };
}

function tryConstruct(label, constructors) {
  const errors = [];
  for (const make of constructors) {
    try {
      const value = make();
      if (value) return value;
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  throw new Error(errors.join('; ') || `could not construct ${label}`);
}

function createMachine(runtime) {
  const bus = tryConstruct('peripheral bus', [
    () => runtime.createPeripheralBus({ timerInterrupt: false }),
    () => runtime.createPeripheralBus(undefined, { timerInterrupt: false }),
    () => runtime.createPeripheralBus(),
  ]);

  const cpu = tryConstruct('CPU', [
    () => runtime.createCPU({ bus, peripheralBus: bus, timerInterrupt: false }),
    () => runtime.createCPU(bus, { timerInterrupt: false }),
    () => runtime.createCPU(bus),
    () => runtime.createCPU({ timerInterrupt: false }),
    () => runtime.createCPU(),
  ]);

  return { cpu, bus };
}

function objectCandidates(cpu, bus) {
  return [
    cpu,
    bus,
    cpu?.bus,
    cpu?.peripheralBus,
    cpu?.memory,
    cpu?.mem,
    cpu?.state,
    bus?.memory,
    bus?.mem,
    bus?.state,
  ].filter(Boolean);
}

function makeMemoryAccess(cpu, bus) {
  const objects = objectCandidates(cpu, bus);
  const readMethods = ['read8', 'readByte', 'peek8', 'readMem8', 'readMemory', 'read'];
  const writeMethods = ['write8', 'writeByte', 'poke8', 'writeMem8', 'writeMemory', 'write'];
  const arrayProps = ['bytes', 'data', 'u8', 'ram', 'rom', 'mem', 'memory'];

  function read8(addr) {
    for (const object of objects) {
      for (const method of readMethods) {
        if (typeof object?.[method] !== 'function') continue;
        try {
          const value = object[method](addr);
          if (Number.isFinite(value)) return value & 0xff;
        } catch {
          // Try the next candidate.
        }
      }
    }

    for (const object of objects) {
      for (const prop of arrayProps) {
        const arr = object?.[prop];
        if (arr && typeof arr.length === 'number' && addr >= 0 && addr < arr.length) return arr[addr] & 0xff;
      }
    }

    throw new Error(`no byte reader accepted ${hex(addr)}`);
  }

  function write8(addr, value) {
    for (const object of objects) {
      for (const method of writeMethods) {
        if (typeof object?.[method] !== 'function') continue;
        try {
          object[method](addr, value & 0xff);
          return;
        } catch {
          // Try the next candidate.
        }
      }
    }

    for (const object of objects) {
      for (const prop of arrayProps) {
        const arr = object?.[prop];
        if (arr && typeof arr.length === 'number' && addr >= 0 && addr < arr.length) {
          arr[addr] = value & 0xff;
          return;
        }
      }
    }

    throw new Error(`no byte writer accepted ${hex(addr)}`);
  }

  return { read8, write8 };
}

function getFromPath(object, pathParts) {
  let current = object;
  for (const part of pathParts) {
    if (!current || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function setAtPath(object, pathParts, value) {
  let current = object;
  for (let i = 0; i < pathParts.length - 1; i += 1) {
    if (!current || !(pathParts[i] in current)) return false;
    current = current[pathParts[i]];
  }
  const last = pathParts[pathParts.length - 1];
  if (!current || !(last in current)) return false;
  current[last] = value;
  return true;
}

function registerPaths(name) {
  const lower = name.toLowerCase();
  const upper = name.toUpperCase();
  return [
    [lower],
    [upper],
    ['regs', lower],
    ['regs', upper],
    ['registers', lower],
    ['registers', upper],
    ['state', lower],
    ['state', upper],
    ['cpu', lower],
    ['cpu', upper],
  ];
}

function getRegister(cpu, name) {
  for (const regPath of registerPaths(name)) {
    const value = getFromPath(cpu, regPath);
    if (Number.isFinite(value)) return value >>> 0;
  }
  const getter = cpu?.[`get${name.toUpperCase()}`] ?? cpu?.[`get${name.toLowerCase()}`];
  if (typeof getter === 'function') {
    const value = getter.call(cpu);
    if (Number.isFinite(value)) return value >>> 0;
  }
  return null;
}

function setRegister(cpu, name, value) {
  const masked = value & 0xffffff;
  for (const regPath of registerPaths(name)) {
    if (setAtPath(cpu, regPath, masked)) return true;
  }
  const setter = cpu?.[`set${name.toUpperCase()}`] ?? cpu?.[`set${name.toLowerCase()}`];
  if (typeof setter === 'function') {
    setter.call(cpu, masked);
    return true;
  }
  return false;
}

async function runCpuBulk(cpu, steps) {
  for (const method of ['run', 'runSteps', 'execute', 'executeSteps']) {
    if (typeof cpu?.[method] !== 'function') continue;
    try {
      await cpu[method](steps);
      return;
    } catch {
      // Fall back to single-step execution.
    }
  }

  for (let i = 0; i < steps; i += 1) {
    await stepOne(cpu);
  }
}

async function stepOne(cpu) {
  for (const method of ['step', 'executeInstruction', 'instruction', 'cycle', 'tick', 'clock']) {
    if (typeof cpu?.[method] !== 'function') continue;
    const result = cpu[method]();
    if (result && typeof result.then === 'function') await result;
    return;
  }
  throw new Error('CPU has no recognized step method');
}

function pushReturnAddress(cpu, mem, returnAddress) {
  const currentSp = getRegister(cpu, 'sp');
  const sp = Number.isFinite(currentSp) && currentSp > 3 ? currentSp : 0xd1ff00;
  const newSp = (sp - 3) & 0xffffff;
  mem.write8(newSp, returnAddress & 0xff);
  mem.write8((newSp + 1) & 0xffffff, (returnAddress >> 8) & 0xff);
  mem.write8((newSp + 2) & 0xffffff, (returnAddress >> 16) & 0xff);
  if (!setRegister(cpu, 'sp', newSp)) {
    throw new Error('could not set SP for dynamic function call');
  }
}

function snapshotVram(mem) {
  const length = VRAM_END - VRAM_START + 1;
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i += 1) out[i] = mem.read8(VRAM_START + i);
  return out;
}

function diffVram(before, after) {
  let totalChanged = 0;
  let totalNonFFAfter = 0;
  let cursorChanged = 0;
  let cursorNonFFChanged = 0;
  const samples = [];

  for (let i = 0; i < before.length; i += 1) {
    if (before[i] === after[i]) continue;
    totalChanged += 1;
    if (after[i] !== 0xff) totalNonFFAfter += 1;
    if (samples.length < 12) samples.push(`${hex(VRAM_START + i)}:${byteHex(before[i])}->${byteHex(after[i])}`);
  }

  for (let y = 0; y < CELL_HEIGHT; y += 1) {
    for (let x = 0; x < CELL_WIDTH; x += 1) {
      const index = y * VRAM_WIDTH + x;
      if (before[index] === after[index]) continue;
      cursorChanged += 1;
      if (after[index] !== 0xff) cursorNonFFChanged += 1;
    }
  }

  return { totalChanged, totalNonFFAfter, cursorChanged, cursorNonFFChanged, samples };
}

async function runDynamicFunction(runtime, entry) {
  const { cpu, bus } = createMachine(runtime);
  const mem = makeMemoryAccess(cpu, bus);

  await runCpuBulk(cpu, 120000);
  mem.write8(CURSOR_ROW, 0x00);
  mem.write8(CURSOR_COL, 0x00);
  mem.write8(CURSOR_FLAGS, 0xff);

  const before = snapshotVram(mem);
  pushReturnAddress(cpu, mem, RETURN_SENTINEL);
  if (!setRegister(cpu, 'pc', entry)) throw new Error('could not set PC for dynamic function call');

  let steps = 0;
  let returned = false;
  for (; steps < 5000; steps += 1) {
    const pc = getRegister(cpu, 'pc');
    if (pc === RETURN_SENTINEL) {
      returned = true;
      break;
    }
    try {
      await stepOne(cpu);
    } catch (error) {
      return {
        returned,
        steps,
        error: error.message,
        diff: diffVram(before, snapshotVram(mem)),
      };
    }
  }

  const after = snapshotVram(mem);
  return { returned, steps, error: null, diff: diffVram(before, after) };
}

async function printPart3(groups) {
  printSection('Part 3: dynamic tests for companion candidates');
  const candidates = [...new Set(groups.map((group) => group.entry))]
    .filter((entry) => entry !== CURSOR_ERASE)
    .sort((a, b) => a - b);

  console.log(`Dynamic candidates from Part 1 excluding 0x061000: ${candidates.length}`);
  if (!candidates.length) {
    console.log('No dynamic candidates to test.');
    return [];
  }

  let runtime;
  try {
    runtime = await loadRuntime();
  } catch (error) {
    console.log(`Dynamic tests skipped: ${error.message}`);
    return [];
  }

  const results = [];
  for (const entry of candidates) {
    try {
      const result = await runDynamicFunction(runtime, entry);
      results.push({ entry, ...result });
      console.log('');
      console.log(
        `${hex(entry)}: steps=${result.steps} returned=${result.returned ? 'yes' : 'no'}${
          result.error ? ` error=${result.error}` : ''
        }`,
      );
      console.log(
        `  VRAM changed=${result.diff.totalChanged}; non-0xFF writes=${result.diff.totalNonFFAfter}; cursor-cell changed=${result.diff.cursorChanged}; cursor-cell non-0xFF=${result.diff.cursorNonFFChanged}`,
      );
      console.log(`  samples: ${result.diff.samples.length ? result.diff.samples.join('; ') : 'none'}`);
      if (result.diff.cursorNonFFChanged > 0) {
        console.log('  RESULT: candidate wrote non-0xFF pixels in the 12x16 cursor cell.');
      } else {
        console.log('  RESULT: no non-0xFF cursor-cell writes observed.');
      }
    } catch (error) {
      results.push({ entry, error: error.message });
      console.log('');
      console.log(`${hex(entry)}: dynamic test failed: ${error.message}`);
    }
  }

  return results;
}

async function main() {
  console.log('Phase 491 cursor draw companion search');
  console.log(`ROM: ${romPath}`);
  console.log(`Scan range: ${hex(SCAN_START)}-${hex(SCAN_END)}`);

  if (!fs.existsSync(romPath)) throw new Error(`ROM file not found: ${romPath}`);
  const bytes = fs.readFileSync(romPath);
  if (bytes.length < ROM_SIZE) {
    console.log(`Warning: ROM is ${bytes.length} bytes, expected at least ${ROM_SIZE}.`);
  }

  const entries = buildFunctionEntryIndex(bytes);
  const { groups } = printPart1(bytes, entries);
  printPart2(bytes, entries);
  printPart4(bytes);
  await printPart3(groups);
}

main().catch((error) => {
  console.log('');
  console.log(`Probe failed: ${error.stack || error.message || error}`);
  process.exitCode = 1;
});
