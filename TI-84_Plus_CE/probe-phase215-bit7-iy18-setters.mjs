#!/usr/bin/env node

// Node treats .mjs as ESM. Use a tiny shim to build require(), then keep
// the rest of the probe in CommonJS style as requested.
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const { readFileSync } = require('node:fs');
const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function loadDecoder() {
  try {
    const maybe = require('./ez80-decoder.js');
    if (typeof maybe?.decodeInstruction === 'function') return maybe.decodeInstruction;
  } catch (error) {
    // Fall through: the repo's local module mode may expose ez80-decoder.js as ESM.
  }

  const decoderUrl = pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href;
  const maybe = await import(decoderUrl);
  if (typeof maybe?.decodeInstruction === 'function') return maybe.decodeInstruction;

  throw new Error('Could not load decodeInstruction from ez80-decoder.js');
}

const decodeInstruction = await loadDecoder();
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const IY_BASE = 0xD00080;
const IY_OFFSET = 0x18;
const TARGET_ADDR = IY_BASE + IY_OFFSET;
const GATE_TEST_ADDR = 0x06004C;
const DISPATCHER_ADDR = 0x061290;

const KNOWN_ADDRESSES = new Map([
  [GATE_TEST_ADDR, 'Session 214 gate: BIT 7,(IY+0x18) before JP NZ -> 0x061290'],
  [DISPATCHER_ADDR, 'Session 214 dispatcher target reached when the gate bit is armed'],
]);

const GROUPS = [
  { key: 'set', label: 'SET', opcodeBase: 0xC6 },
  { key: 'res', label: 'RES', opcodeBase: 0x86 },
  { key: 'bit', label: 'BIT', opcodeBase: 0x46 },
];

function buildBitPatterns() {
  const patterns = [];
  for (const group of GROUPS) {
    for (let bit = 0; bit < 8; bit += 1) {
      patterns.push({
        key: `${group.key}${bit}`,
        kind: group.key,
        bit,
        label: `${group.label} ${bit},(IY+0x18)`,
        bytes: [0xFD, 0xCB, IY_OFFSET, group.opcodeBase + (bit * 8)],
      });
    }
  }
  return patterns;
}

const ALL_BIT_PATTERNS = buildBitPatterns();
const SET_PATTERNS = ALL_BIT_PATTERNS.filter((pattern) => pattern.kind === 'set');
const RES_PATTERNS = ALL_BIT_PATTERNS.filter((pattern) => pattern.kind === 'res');
const BIT_PATTERNS = ALL_BIT_PATTERNS.filter((pattern) => pattern.kind === 'bit');

const DIRECT_WRITE_PATTERNS = [
  {
    label: 'LD (0xD00098),A',
    bytes: [0x32, 0x98, 0x00, 0xD0],
    skipIfPrefixedByEd: true,
  },
  {
    label: 'ED LD (0xD00098),A',
    bytes: [0xED, 0x32, 0x98, 0x00, 0xD0],
  },
];

const DIRECT_READ_PATTERNS = [
  {
    label: 'LD A,(0xD00098)',
    bytes: [0x3A, 0x98, 0x00, 0xD0],
    skipIfPrefixedByEd: true,
  },
  {
    label: 'ED LD A,(0xD00098)',
    bytes: [0xED, 0x3A, 0x98, 0x00, 0xD0],
  },
];

const INDEXED_IMM_WRITER = {
  label: 'LD (IY+0x18),n',
  bytes: [0xFD, 0x36, IY_OFFSET],
};

const INDEXED_REG_WRITER = {
  label: 'LD (IY+0x18),A',
  bytes: [0xFD, 0x77, IY_OFFSET],
};

const INDEXED_REG_READER = {
  label: 'LD A,(IY+0x18)',
  bytes: [0xFD, 0x7E, IY_OFFSET],
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesAt(start, length) {
  const sliceStart = Math.max(0, start);
  const sliceEnd = Math.min(rom.length, sliceStart + length);
  return Array.from(rom.slice(sliceStart, sliceEnd), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function regionLabel(addr) {
  if (addr < 0x050000) return 'OS core (<0x050000)';
  if (addr >= 0x055000 && addr < 0x065000) return 'editor (0x055000-0x064FFF)';
  if (addr >= 0x090000 && addr < 0x0A0000) return 'STAT (0x090000-0x09FFFF)';
  if (addr >= 0x0A0000) return 'apps (0x0A0000+)';
  if (addr < 0x055000) return 'mid OS gap (0x050000-0x054FFF)';
  return 'other OS/UI gap (0x065000-0x08FFFF)';
}

function describeSite(addr) {
  if (KNOWN_ADDRESSES.has(addr)) return KNOWN_ADDRESSES.get(addr);
  if (addr >= 0x060040 && addr <= 0x06005C) {
    return '0x06004C gate neighborhood from session 214';
  }
  if (addr >= 0x061280 && addr <= 0x0612A8) {
    return '0x061290 edit-mode dispatcher neighborhood';
  }
  if (addr >= 0x061CC0 && addr <= 0x061CE0) {
    return '0x061CDx helper neighborhood seen in prior disassembly notes';
  }
  return regionLabel(addr);
}

function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((0xD0 & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
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
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${prefix}ld ${inst.pair}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(resolveMemAddr(inst))}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(resolveMemAddr(inst))}), ${inst.src}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'alu-imm': return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'cp-reg': return `${prefix}cp ${inst.src}`;
    case 'cp-imm': return `${prefix}cp ${hexByte(inst.value)}`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'nop': return `${prefix}nop`;
    case 'halt': return `${prefix}halt`;
    default: return `${prefix}${inst.tag}`;
  }
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
    };
  }
}

function matchBytes(buffer, address, patternBytes) {
  if (address < 0 || address + patternBytes.length > buffer.length) return false;
  for (let index = 0; index < patternBytes.length; index += 1) {
    if (buffer[address + index] !== patternBytes[index]) return false;
  }
  return true;
}

function scanPattern(pattern, options = {}) {
  const hits = [];
  const extraLength = options.trailingImmediate ? 1 : 0;
  const fullLength = pattern.bytes.length + extraLength;

  for (let addr = 0; addr <= rom.length - fullLength; addr += 1) {
    if (pattern.skipIfPrefixedByEd && addr > 0 && rom[addr - 1] === 0xED) continue;
    if (!matchBytes(rom, addr, pattern.bytes)) continue;

    hits.push({
      addr,
      kind: pattern.kind ?? null,
      bit: Number.isInteger(pattern.bit) ? pattern.bit : null,
      label: pattern.label,
      bytes: bytesAt(addr, fullLength),
      immediate: options.trailingImmediate ? rom[addr + pattern.bytes.length] : null,
    });
  }

  return hits;
}

function collectBefore(target, count, lookbackBytes = 96) {
  const rows = [];
  let pc = Math.max(0, target - lookbackBytes);
  while (pc < target) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.length > 0 ? (inst.pc + inst.length) : (pc + 1);
  }
  return rows.filter((inst) => inst.pc < target).slice(-count);
}

function collectAfter(target, count) {
  const rows = [];
  let pc = target;
  while (rows.length < count && pc < rom.length) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.length > 0 ? (inst.pc + inst.length) : (pc + 1);
  }
  return rows;
}

function formatContext(target, before = 5, after = 5) {
  return [...collectBefore(target, before), ...collectAfter(target, after + 1)].map((inst) => {
    const marker = inst.pc === target ? '=>' : '  ';
    const bytes = bytesAt(inst.pc, inst.length || 1).padEnd(20, ' ');
    const text = inst.tag === 'decode-error'
      ? `decode-error: ${inst.errorMessage}`
      : formatInstruction(inst);
    return `${marker} ${hex(inst.pc)}  ${bytes} ${text}`;
  });
}

function hexWindow(addr, matchLength, radius = 16) {
  const beforeStart = Math.max(0, addr - radius);
  const before = bytesAt(beforeStart, addr - beforeStart);
  const match = bytesAt(addr, matchLength);
  const afterStart = addr + matchLength;
  const afterEnd = Math.min(rom.length, afterStart + radius);
  const after = bytesAt(afterStart, afterEnd - afterStart);
  return `${before}${before ? ' ' : ''}[${match}]${after ? ` ${after}` : ''}`;
}

function regionCounts(hits) {
  const counts = new Map();
  for (const hit of hits) {
    const label = regionLabel(hit.addr);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1]);
}

function printRegionSummary(title, hits) {
  console.log(`--- ${title} ---`);
  if (!hits.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const [label, count] of regionCounts(hits)) {
    console.log(`  ${label}: ${count}`);
  }
  console.log();
}

function printPerBitCounts(title, patterns, hitsByKey) {
  console.log(`--- ${title} ---`);
  for (const pattern of patterns) {
    const hits = hitsByKey.get(pattern.key) ?? [];
    console.log(`  bit ${pattern.bit}: ${hits.length}`);
  }
  console.log();
}

function printSiteGroup(title, hits, options = {}) {
  console.log(`--- ${title} (${hits.length}) ---`);
  if (!hits.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const hit of hits) {
    const matchLength = hit.immediate === null ? hit.bytes.split(' ').length : hit.bytes.split(' ').length;
    console.log(`${hex(hit.addr)}  ${hit.label}`);
    console.log(`  region: ${regionLabel(hit.addr)}`);
    console.log(`  note:   ${describeSite(hit.addr)}`);
    console.log(`  bytes:  ${hit.bytes}`);
    if (options.showImmediate && hit.immediate !== null) {
      console.log(`  immediate: ${hexByte(hit.immediate)} (bit7=${hit.immediate & 0x80 ? '1' : '0'})`);
    }
    console.log(`  +/-16B: ${hexWindow(hit.addr, matchLength, 16)}`);
    for (const line of formatContext(hit.addr, 5, 5)) {
      console.log(`  ${line}`);
    }
    console.log();
  }
}

function printSimpleGroup(title, hits) {
  console.log(`--- ${title} (${hits.length}) ---`);
  if (!hits.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const hit of hits) {
    console.log(`${hex(hit.addr)}  ${hit.label}`);
    console.log(`  region: ${regionLabel(hit.addr)}`);
    console.log(`  note:   ${describeSite(hit.addr)}`);
    console.log(`  bytes:  ${hit.bytes}`);
    console.log();
  }
}

function isLoadAFromIY18(inst) {
  return (
    (inst.tag === 'ld-reg-ixd'
      && inst.dest === 'a'
      && inst.indexRegister === 'iy'
      && inst.displacement === IY_OFFSET)
    || (inst.tag === 'ld-reg-mem'
      && inst.dest === 'a'
      && resolveMemAddr(inst) === TARGET_ADDR)
  );
}

function isStoreAToIY18(inst) {
  return (
    (inst.tag === 'ld-ixd-reg'
      && inst.src === 'a'
      && inst.indexRegister === 'iy'
      && inst.displacement === IY_OFFSET)
    || (inst.tag === 'ld-mem-reg'
      && inst.src === 'a'
      && resolveMemAddr(inst) === TARGET_ADDR)
  );
}

function scanReadModifyWrite() {
  const loadHits = [
    ...scanPattern(INDEXED_REG_READER),
    ...scanPattern(DIRECT_READ_PATTERNS[0]),
    ...scanPattern(DIRECT_READ_PATTERNS[1]),
  ].sort((left, right) => left.addr - right.addr);

  const rmwHits = [];

  for (const hit of loadHits) {
    const loadInst = decodeSafe(hit.addr);
    if (!isLoadAFromIY18(loadInst)) continue;

    const window = collectAfter(hit.addr, 7);
    for (let index = 1; index < window.length; index += 1) {
      const inst = window[index];
      const isMaskOp = (
        inst.tag === 'alu-imm'
        && (inst.op === 'or' || inst.op === 'and')
      );
      if (!isMaskOp) continue;

      for (let follow = index + 1; follow < Math.min(window.length, index + 4); follow += 1) {
        const storeInst = window[follow];
        if (!isStoreAToIY18(storeInst)) continue;

        rmwHits.push({
          loadAddr: loadInst.pc,
          aluAddr: inst.pc,
          storeAddr: storeInst.pc,
          op: inst.op,
          mask: inst.value,
        });
      }
    }
  }

  return rmwHits;
}

function flattenHits(patterns, hitsByKey) {
  return patterns.flatMap((pattern) => hitsByKey.get(pattern.key) ?? []);
}

const hitsByKey = new Map();
for (const pattern of ALL_BIT_PATTERNS) {
  hitsByKey.set(pattern.key, scanPattern(pattern));
}

const setHits = flattenHits(SET_PATTERNS, hitsByKey);
const resHits = flattenHits(RES_PATTERNS, hitsByKey);
const bitHits = flattenHits(BIT_PATTERNS, hitsByKey);

const set7Hits = hitsByKey.get('set7') ?? [];
const res7Hits = hitsByKey.get('res7') ?? [];
const bit7Hits = hitsByKey.get('bit7') ?? [];

const directWriteHits = DIRECT_WRITE_PATTERNS.flatMap((pattern) => scanPattern(pattern));
const indexedImmHits = scanPattern(INDEXED_IMM_WRITER, { trailingImmediate: true });
const indexedImmSetHits = indexedImmHits.filter((hit) => (hit.immediate & 0x80) !== 0);
const indexedImmClearHits = indexedImmHits.filter((hit) => (hit.immediate & 0x80) === 0);
const indexedRegWriterHits = scanPattern(INDEXED_REG_WRITER);
const rmwHits = scanReadModifyWrite();

console.log('=== Phase 215: BIT 7,(IY+0x18) setter map ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`IY base: ${hex(IY_BASE)}  IY+0x18: ${hex(TARGET_ADDR)}`);
console.log(`Gate under investigation: ${hex(GATE_TEST_ADDR)} -> dispatcher ${hex(DISPATCHER_ADDR)}`);
console.log('Static scan coverage: exact/all FD CB 18 xx bit ops, direct 0xD00098 stores, and extra whole-byte writer heuristics.');
console.log();

console.log('Bit-7 summary:');
console.log(`  ${set7Hits.length} SET sites, ${res7Hits.length} RES sites, ${bit7Hits.length} BIT test sites for bit 7 at (IY+0x18)`);
console.log();

console.log('All (IY+0x18) bit-op totals:');
console.log(`  SET n,(IY+0x18): ${setHits.length}`);
console.log(`  RES n,(IY+0x18): ${resHits.length}`);
console.log(`  BIT n,(IY+0x18): ${bitHits.length}`);
console.log(`  Direct LD (0xD00098),A writes: ${directWriteHits.length}`);
console.log(`  Whole-byte LD (IY+0x18),n sites: ${indexedImmHits.length}`);
console.log(`  Whole-byte LD (IY+0x18),A sites: ${indexedRegWriterHits.length}`);
console.log(`  OR/AND read-modify-write candidates on this byte: ${rmwHits.length}`);
console.log();

printRegionSummary('SET region distribution (all bits)', setHits);
printRegionSummary('RES region distribution (all bits)', resHits);
printRegionSummary('BIT region distribution (all bits)', bitHits);
printRegionSummary('SET 7 region distribution', set7Hits);
printRegionSummary('RES 7 region distribution', res7Hits);
printRegionSummary('BIT 7 region distribution', bit7Hits);

printPerBitCounts('SET hit counts by bit', SET_PATTERNS, hitsByKey);
printPerBitCounts('RES hit counts by bit', RES_PATTERNS, hitsByKey);
printPerBitCounts('BIT hit counts by bit', BIT_PATTERNS, hitsByKey);

printSiteGroup('SET 7 arm sites (highlighted)', set7Hits);
printSiteGroup('RES 7 clear sites', res7Hits);
printSiteGroup('BIT 7 test sites', bit7Hits);

for (const pattern of SET_PATTERNS) {
  printSiteGroup(`${pattern.label} sites`, hitsByKey.get(pattern.key) ?? []);
}

for (const pattern of RES_PATTERNS) {
  printSiteGroup(`${pattern.label} sites`, hitsByKey.get(pattern.key) ?? []);
}

for (const pattern of BIT_PATTERNS) {
  printSiteGroup(`${pattern.label} sites`, hitsByKey.get(pattern.key) ?? []);
}

printSiteGroup('Direct absolute LD (0xD00098),A writes', directWriteHits);
printSiteGroup('Whole-byte LD (IY+0x18),n sites with bit 7 forced set', indexedImmSetHits, { showImmediate: true });
printSiteGroup('Whole-byte LD (IY+0x18),n sites with bit 7 forced clear', indexedImmClearHits, { showImmediate: true });
printSimpleGroup('Whole-byte LD (IY+0x18),A writers (A-dependent arm/disarm)', indexedRegWriterHits);

console.log('--- OR/AND read-modify-write candidates on 0xD00098 / (IY+0x18) ---');
if (!rmwHits.length) {
  console.log('  none');
} else {
  for (const hit of rmwHits) {
    console.log(
      `  load ${hex(hit.loadAddr)} -> ${hit.op} ${hexByte(hit.mask)} @ ${hex(hit.aluAddr)} -> store ${hex(hit.storeAddr)}`
    );
  }
}
console.log();

console.log('--- Static conclusion ---');
console.log(`  Summary line: ${set7Hits.length} SET sites, ${res7Hits.length} RES sites, ${bit7Hits.length} BIT test sites for bit 7 at (IY+0x18).`);
console.log(`  All exact SET n/(IY+0x18) hits across every bit: ${setHits.length}.`);
console.log(`  All exact RES n/(IY+0x18) hits across every bit: ${resHits.length}.`);
console.log(`  All exact BIT n/(IY+0x18) tests across every bit: ${bitHits.length}.`);
console.log('  The highlighted SET 7 section above is the primary static answer to "what arms the 0x06004C gate?".');
console.log('  The whole-byte LD and OR/AND sections are included because exact SET/RES opcodes are not the only way this flag byte can be armed or cleared.');
