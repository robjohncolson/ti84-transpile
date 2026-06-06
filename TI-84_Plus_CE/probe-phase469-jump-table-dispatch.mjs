import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { BLOCKS } from './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TABLE_ADDR = 0x021AB8;
const NEAR_PAGE_START = 0x021A00;
const NEAR_PAGE_END = 0x021AFF;
const TABLE_NEAR_START = 0x021AB0;
const TABLE_NEAR_END = 0x021ACF;
const MAX_PRINT = 80;

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${Number(value).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexShort(value) {
  return `0x${Number(value).toString(16).toUpperCase()}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function read16(offset) {
  if (offset < 0 || offset + 1 >= romBytes.length) return null;
  return romBytes[offset] | (romBytes[offset + 1] << 8);
}

function read24(offset) {
  if (offset < 0 || offset + 2 >= romBytes.length) return null;
  return romBytes[offset] | (romBytes[offset + 1] << 8) | (romBytes[offset + 2] << 16);
}

function bytesAt(offset, length) {
  const start = Math.max(0, offset);
  const end = Math.min(romBytes.length, start + length);
  const out = [];
  for (let i = start; i < end; i += 1) out.push(byteHex(romBytes[i]));
  return out.join(' ');
}

function inRange(value, start, end) {
  return value !== null && value >= start && value <= end;
}

function printMatches(title, matches, format, limit = MAX_PRINT) {
  console.log(`\n=== ${title} (${matches.length}) ===`);
  if (matches.length === 0) {
    console.log('none');
    return;
  }

  for (const match of matches.slice(0, limit)) console.log(format(match));
  if (matches.length > limit) console.log(`... ${matches.length - limit} more omitted`);
}

function decodeJumpTable(start) {
  const entries = [];
  console.log(`=== Jump table decode at ${hex(start)} ===`);

  for (let index = 0, offset = start; offset + 3 < romBytes.length && index < 128; index += 1, offset += 4) {
    const opcode = romBytes[offset];
    const target = read24(offset + 1);

    if (opcode !== 0xC3 || target === null) {
      console.log(`${hex(offset)}: ${bytesAt(offset, 4)}    stop: not a 24-bit JP entry`);
      break;
    }

    const entry = { index, offset, target };
    entries.push(entry);
    console.log(`${String(index).padStart(2, '0')} ${hex(offset)}: ${bytesAt(offset, 4)}    JP ${hex(target)}`);
  }

  if (entries.length === 128) console.log('stopped after 128 entries to avoid walking unrelated code');
  return entries;
}

function scanRaw24References() {
  const matches = [];
  for (let offset = 0; offset + 2 < romBytes.length; offset += 1) {
    const value = read24(offset);
    if (inRange(value, NEAR_PAGE_START, NEAR_PAGE_END)) {
      matches.push({
        kind: 'raw24',
        offset,
        value,
        exactTable: value === TABLE_ADDR,
        tableNeighborhood: inRange(value, TABLE_NEAR_START, TABLE_NEAR_END),
      });
    }
  }

  matches.sort((a, b) => {
    const aDist = Math.abs(a.value - TABLE_ADDR);
    const bDist = Math.abs(b.value - TABLE_ADDR);
    if (aDist !== bDist) return aDist - bDist;
    return a.offset - b.offset;
  });

  return matches;
}

function scanImmediateLoads() {
  const load24 = [];
  const load16 = [];
  const baseOpcodes = new Map([
    [0x01, 'BC'],
    [0x11, 'DE'],
    [0x21, 'HL'],
  ]);

  for (let offset = 0; offset < romBytes.length; offset += 1) {
    const opcode = romBytes[offset];
    const reg = baseOpcodes.get(opcode);

    if (reg) {
      const value24 = read24(offset + 1);
      if (inRange(value24, NEAR_PAGE_START, NEAR_PAGE_END)) {
        load24.push({
          kind: 'load24',
          offset,
          value: value24,
          mnemonic: `LD ${reg},${hex(value24)} (ADL immediate)`,
          bytes: bytesAt(offset, 4),
        });
      }

      const value16 = read16(offset + 1);
      if (inRange(value16, 0x1A00, 0x1AFF)) {
        load16.push({
          kind: 'load16',
          offset,
          value: value16,
          mnemonic: `LD ${reg},${hex(value16, 4)} (16-bit immediate)`,
          bytes: bytesAt(offset, 3),
          tableNeighborhood: inRange(value16, 0x1AB0, 0x1ACF),
        });
      }
    }

    if ((opcode === 0xDD || opcode === 0xFD) && romBytes[offset + 1] === 0x21) {
      const regName = opcode === 0xDD ? 'IX' : 'IY';
      const value24 = read24(offset + 2);
      if (inRange(value24, NEAR_PAGE_START, NEAR_PAGE_END)) {
        load24.push({
          kind: 'load24',
          offset,
          value: value24,
          mnemonic: `LD ${regName},${hex(value24)} (ADL immediate)`,
          bytes: bytesAt(offset, 5),
        });
      }

      const value16 = read16(offset + 2);
      if (inRange(value16, 0x1A00, 0x1AFF)) {
        load16.push({
          kind: 'load16',
          offset,
          value: value16,
          mnemonic: `LD ${regName},${hex(value16, 4)} (16-bit immediate)`,
          bytes: bytesAt(offset, 4),
          tableNeighborhood: inRange(value16, 0x1AB0, 0x1ACF),
        });
      }
    }
  }

  const byTableDistance = (a, b) => {
    const aValue = a.value < 0x10000 ? 0x020000 + a.value : a.value;
    const bValue = b.value < 0x10000 ? 0x020000 + b.value : b.value;
    const aDist = Math.abs(aValue - TABLE_ADDR);
    const bDist = Math.abs(bValue - TABLE_ADDR);
    if (aDist !== bDist) return aDist - bDist;
    return a.offset - b.offset;
  };

  load24.sort(byTableDistance);
  load16.sort(byTableDistance);
  return { load24, load16 };
}

function describeAddAt(offset) {
  const first = romBytes[offset];
  const second = romBytes[offset + 1];

  if (first === 0x09) return { offset, length: 1, mnemonic: 'ADD HL,BC', classic: true };
  if (first === 0x19) return { offset, length: 1, mnemonic: 'ADD HL,DE', classic: true };
  if (first === 0x29) return { offset, length: 1, mnemonic: 'ADD HL,HL', classic: false };
  if (first === 0x39) return { offset, length: 1, mnemonic: 'ADD HL,SP', classic: false };
  if (first === 0xDD && second === 0x09) return { offset, length: 2, mnemonic: 'ADD IX,BC', classic: false };
  if (first === 0xDD && second === 0x19) return { offset, length: 2, mnemonic: 'ADD IX,DE', classic: false };
  if (first === 0xFD && second === 0x09) return { offset, length: 2, mnemonic: 'ADD IY,BC', classic: false };
  if (first === 0xFD && second === 0x19) return { offset, length: 2, mnemonic: 'ADD IY,DE', classic: false };
  return null;
}

function describeJpAt(offset) {
  const first = romBytes[offset];
  const second = romBytes[offset + 1];

  if (first === 0xE9) return { offset, length: 1, mnemonic: 'JP (HL)' };
  if (first === 0xDD && second === 0xE9) return { offset, length: 2, mnemonic: 'JP (IX)' };
  if (first === 0xFD && second === 0xE9) return { offset, length: 2, mnemonic: 'JP (IY)' };
  return null;
}

function refValueForDistance(ref) {
  if (ref.kind === 'load16') return 0x020000 + ref.value;
  return ref.value;
}

function buildReferenceSet(raw24, load24, load16) {
  const refs = [];
  const seen = new Set();

  function add(ref) {
    const key = `${ref.kind}:${ref.offset}:${ref.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(ref);
  }

  for (const ref of load24) add(ref);
  for (const ref of raw24.filter((item) => item.exactTable || item.tableNeighborhood)) add(ref);
  for (const ref of load16.filter((item) => item.tableNeighborhood)) add(ref);

  refs.sort((a, b) => {
    const aDist = Math.abs(refValueForDistance(a) - TABLE_ADDR);
    const bDist = Math.abs(refValueForDistance(b) - TABLE_ADDR);
    if (aDist !== bDist) return aDist - bDist;
    return a.offset - b.offset;
  });

  return refs;
}

function findComputedDispatchCandidates(refs) {
  const candidates = new Map();
  const indirectJumps = new Map();

  function rememberCandidate(add, jp, ref) {
    const key = `${add.offset}:${jp.offset}`;
    const existing = candidates.get(key) ?? {
      add,
      jp,
      evidence: [],
      classic: add.classic && jp.mnemonic === 'JP (HL)',
    };
    existing.evidence.push(ref);
    candidates.set(key, existing);
  }

  function rememberJump(jp, ref) {
    const key = `${jp.offset}:${jp.mnemonic}`;
    const existing = indirectJumps.get(key) ?? { jp, evidence: [] };
    existing.evidence.push(ref);
    indirectJumps.set(key, existing);
  }

  for (const ref of refs) {
    const start = Math.max(0, ref.offset - 256);
    const end = Math.min(romBytes.length - 1, ref.offset + 256);

    for (let offset = start; offset <= end; offset += 1) {
      const add = describeAddAt(offset);
      if (add) {
        const jpSearchEnd = Math.min(end, offset + 40);
        for (let jpOffset = offset + add.length; jpOffset <= jpSearchEnd; jpOffset += 1) {
          const jp = describeJpAt(jpOffset);
          if (jp) rememberCandidate(add, jp, ref);
        }
      }

      const jp = describeJpAt(offset);
      if (jp) rememberJump(jp, ref);
    }
  }

  const sortBySignal = (a, b) => {
    if (a.classic !== b.classic) return a.classic ? -1 : 1;
    const aClosest = Math.min(...a.evidence.map((ref) => Math.abs(ref.offset - a.add.offset)));
    const bClosest = Math.min(...b.evidence.map((ref) => Math.abs(ref.offset - b.add.offset)));
    if (aClosest !== bClosest) return aClosest - bClosest;
    return a.add.offset - b.add.offset;
  };

  const candidateList = [...candidates.values()].sort(sortBySignal);
  const jumpList = [...indirectJumps.values()].sort((a, b) => a.jp.offset - b.jp.offset);
  return { candidateList, jumpList };
}

function describeReference(ref) {
  const value = ref.kind === 'load16' ? `${hex(ref.value, 4)} (banked as ${hex(0x020000 + ref.value)})` : hex(ref.value);
  const mnemonic = ref.mnemonic ? `${ref.mnemonic}; ` : '';
  return `${ref.kind} at ${hex(ref.offset)}: ${mnemonic}value ${value}; bytes ${bytesAt(ref.offset, ref.kind === 'raw24' ? 12 : 8)}`;
}

function getBlockEntries() {
  if (BLOCKS instanceof Map) return [...BLOCKS.entries()];
  if (Array.isArray(BLOCKS)) return BLOCKS.map((value, index) => [index, value]);
  return Object.entries(BLOCKS);
}

function parseBlockAddress(key) {
  if (typeof key === 'number') return key;
  if (typeof key !== 'string') return NaN;

  const trimmed = key.trim();
  if (/^0x/i.test(trimmed)) return Number.parseInt(trimmed, 16);

  const decimal = Number(trimmed);
  return Number.isFinite(decimal) ? decimal : NaN;
}

function crossReferenceTranspiledBlocks() {
  const blockEntries = getBlockEntries().map(([key, value]) => ({
    key,
    value,
    address: parseBlockAddress(key),
  }));

  console.log('\n=== Transpiled block cross-reference ===');
  console.log(`runtime imports: createExecutor=${typeof createExecutor}; createPeripheralBus=${typeof createPeripheralBus}`);
  console.log(`BLOCKS entries: ${blockEntries.length}`);

  const nearbyBlocks = blockEntries
    .filter((entry) => Number.isFinite(entry.address) && entry.address >= NEAR_PAGE_START && entry.address <= NEAR_PAGE_END)
    .sort((a, b) => a.address - b.address);

  printMatches(
    `BLOCKS keys in ${hex(NEAR_PAGE_START)}-${hex(NEAR_PAGE_END)}`,
    nearbyBlocks,
    (entry) => `${hex(entry.address)} key=${String(entry.key)}`,
  );

  const targetAddresses = [
    0x021AB0,
    0x021AB4,
    0x021AB8,
    0x021ABC,
    0x021AC0,
    0x021AC4,
  ];
  const needles = new Set();
  for (const address of targetAddresses) {
    const padded = hex(address);
    const short = hexShort(address);
    needles.add(padded);
    needles.add(padded.toLowerCase());
    needles.add(short);
    needles.add(short.toLowerCase());
    needles.add(String(address));
  }

  const sourceHits = [];
  for (const entry of blockEntries) {
    const source = typeof entry.value === 'function'
      ? Function.prototype.toString.call(entry.value)
      : String(entry.value);
    const hits = [...needles].filter((needle) => source.includes(needle));
    if (hits.length > 0) {
      sourceHits.push({
        address: entry.address,
        key: entry.key,
        hits: [...new Set(hits)],
      });
    }
  }

  printMatches(
    'BLOCKS source references to table addresses',
    sourceHits,
    (entry) => `${Number.isFinite(entry.address) ? hex(entry.address) : String(entry.key)} hits ${entry.hits.join(', ')}`,
  );
}

console.log('Phase 469: jump table dispatcher probe');
console.log(`ROM path: ${ROM_PATH}`);
console.log(`ROM size: ${romBytes.length} bytes`);
console.log(`Target table: ${hex(TABLE_ADDR)}`);

decodeJumpTable(TABLE_ADDR);

const raw24 = scanRaw24References();
const { load24, load16 } = scanImmediateLoads();
const directTableRaw24 = raw24.filter((match) => match.exactTable || match.tableNeighborhood);

printMatches(
  `Raw little-endian 24-bit references in ${hex(NEAR_PAGE_START)}-${hex(NEAR_PAGE_END)}`,
  raw24,
  (match) => `${hex(match.offset)}: ${bytesAt(match.offset, 3)} -> ${hex(match.value)}${match.exactTable ? ' EXACT_TABLE' : match.tableNeighborhood ? ' TABLE_NEAR' : ''}`,
);

printMatches(
  'Direct raw24 hits for 0x021AB0-0x021ACF',
  directTableRaw24,
  (match) => `${hex(match.offset)}: ${bytesAt(match.offset, 12)} -> ${hex(match.value)}${match.exactTable ? ' EXACT_TABLE' : ''}`,
);

printMatches(
  '24-bit immediate loads of 0x021Axx',
  load24,
  (match) => `${hex(match.offset)}: ${match.bytes.padEnd(14)} ${match.mnemonic}`,
);

printMatches(
  '16-bit immediate loads of 0x1Axx',
  load16,
  (match) => `${hex(match.offset)}: ${match.bytes.padEnd(11)} ${match.mnemonic}${match.tableNeighborhood ? ' TABLE_LOW_NEAR' : ''}`,
);

const refs = buildReferenceSet(raw24, load24, load16);
printMatches('High-signal references used for nearby dispatch search', refs, describeReference);

const { candidateList, jumpList } = findComputedDispatchCandidates(refs);
printMatches(
  'Computed dispatch candidates near table references',
  candidateList,
  (candidate) => {
    const nearest = candidate.evidence
      .slice()
      .sort((a, b) => Math.abs(a.offset - candidate.add.offset) - Math.abs(b.offset - candidate.add.offset))[0];
    const distance = Math.abs(nearest.offset - candidate.add.offset);
    return [
      `${hex(candidate.add.offset)} ${candidate.add.mnemonic} -> ${hex(candidate.jp.offset)} ${candidate.jp.mnemonic}`,
      `${candidate.classic ? 'CLASSIC_HL_DISPATCH' : 'INDIRECT_DISPATCH'}; nearest ${nearest.kind} at ${hex(nearest.offset)} (${distance} bytes): ${describeReference(nearest)}`,
      `  context ${hex(Math.max(0, candidate.add.offset - 8))}: ${bytesAt(candidate.add.offset - 8, 64)}`,
    ].join('\n');
  },
);

printMatches(
  'Standalone JP (HL/IX/IY) near table references',
  jumpList,
  (jump) => {
    const nearest = jump.evidence
      .slice()
      .sort((a, b) => Math.abs(a.offset - jump.jp.offset) - Math.abs(b.offset - jump.jp.offset))[0];
    const distance = Math.abs(nearest.offset - jump.jp.offset);
    return `${hex(jump.jp.offset)} ${jump.jp.mnemonic}; nearest ${nearest.kind} at ${hex(nearest.offset)} (${distance} bytes): ${describeReference(nearest)}`;
  },
);

crossReferenceTranspiledBlocks();

console.log('\n=== Summary hint ===');
if (candidateList.length > 0) {
  const best = candidateList[0];
  const nearest = best.evidence
    .slice()
    .sort((a, b) => Math.abs(a.offset - best.add.offset) - Math.abs(b.offset - best.add.offset))[0];
  console.log(`Best candidate: ${hex(best.add.offset)} ${best.add.mnemonic} -> ${hex(best.jp.offset)} ${best.jp.mnemonic}`);
  console.log(`Nearest table-base evidence: ${describeReference(nearest)}`);
} else if (jumpList.length > 0) {
  const best = jumpList[0];
  const nearest = best.evidence
    .slice()
    .sort((a, b) => Math.abs(a.offset - best.jp.offset) - Math.abs(b.offset - best.jp.offset))[0];
  console.log(`No ADD+JP sequence found near table references; closest indirect jump is ${hex(best.jp.offset)} ${best.jp.mnemonic}`);
  console.log(`Nearest table-base evidence: ${describeReference(nearest)}`);
} else {
  console.log('No nearby computed JP candidate found from direct table references. Check the raw/load hit lists for an earlier helper that materializes the table base indirectly.');
}
