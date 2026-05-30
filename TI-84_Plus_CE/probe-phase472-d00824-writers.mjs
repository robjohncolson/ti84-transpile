#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TARGET_ADDR = 0xD00824;
const TARGET_DECIMAL = String(TARGET_ADDR);
const PROMPT_DECIMAL = '13632548';
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = `${TRANSPILED_JS_PATH}.gz`;

const patterns = [
  { name: 'LD (D00824),A', bytes: [0x32, 0x24, 0x08, 0xD0], kind: 'write' },
  { name: 'LD (D00824),HL [22]', bytes: [0x22, 0x24, 0x08, 0xD0], kind: 'write' },
  { name: 'LD (D00824),HL [ED 63]', bytes: [0xED, 0x63, 0x24, 0x08, 0xD0], kind: 'write' },
  { name: 'LD (D00824),DE [ED 53]', bytes: [0xED, 0x53, 0x24, 0x08, 0xD0], kind: 'write' },
  { name: 'LD (D00824),BC [ED 43]', bytes: [0xED, 0x43, 0x24, 0x08, 0xD0], kind: 'write' },
  { name: 'LD (D00824),SP [ED 73]', bytes: [0xED, 0x73, 0x24, 0x08, 0xD0], kind: 'write' },
  { name: 'LD (D00824),IX [DD 22]', bytes: [0xDD, 0x22, 0x24, 0x08, 0xD0], kind: 'write' },
  { name: 'LD (D00824),IY [FD 22]', bytes: [0xFD, 0x22, 0x24, 0x08, 0xD0], kind: 'write' },
  { name: 'LD HL,D00824 [21] (potential pointer setup)', bytes: [0x21, 0x24, 0x08, 0xD0], kind: 'address' },
  { name: 'LD DE,D00824 [11] (potential pointer setup)', bytes: [0x11, 0x24, 0x08, 0xD0], kind: 'address' },
  { name: 'LD BC,D00824 [01] (potential pointer setup)', bytes: [0x01, 0x24, 0x08, 0xD0], kind: 'address' },
];

const addrBytes = Buffer.from([0x24, 0x08, 0xD0]);
const patternBuffers = patterns.map((pattern) => ({
  ...pattern,
  buffer: Buffer.from(pattern.bytes),
}));

function fmtAddr(value) {
  return `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
}

function fmtBytes(bytes) {
  if (bytes.length === 0) {
    return '(none)';
  }

  return [...bytes].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function contextFor(rom, start, length) {
  const beforeStart = Math.max(0, start - 4);
  const before = rom.subarray(beforeStart, start);
  const afterStart = start + length;
  const afterEnd = Math.min(rom.length, afterStart + 4);
  const after = rom.subarray(afterStart, afterEnd);

  return {
    before: fmtBytes(before),
    match: fmtBytes(rom.subarray(start, start + length)),
    after: fmtBytes(after),
  };
}

function findPatternMatches(rom) {
  const matches = [];

  for (const pattern of patternBuffers) {
    let offset = 0;
    while (offset < rom.length) {
      const found = rom.indexOf(pattern.buffer, offset);
      if (found === -1) {
        break;
      }

      matches.push({
        addr: found,
        length: pattern.buffer.length,
        name: pattern.name,
        summaryName: pattern.name,
        source: 'pattern',
        kind: pattern.kind,
      });

      offset = found + 1;
    }
  }

  return matches;
}

function classifyAddressOperand(rom, addrOffset) {
  const prev1 = addrOffset >= 1 ? rom[addrOffset - 1] : undefined;
  const prev2a = addrOffset >= 2 ? rom[addrOffset - 2] : undefined;
  const prev2b = addrOffset >= 2 ? rom[addrOffset - 1] : undefined;

  const twoByteOpcodeStores = new Map([
    [0x43, 'LD (D00824),BC [ED 43]'],
    [0x53, 'LD (D00824),DE [ED 53]'],
    [0x63, 'LD (D00824),HL [ED 63]'],
    [0x73, 'LD (D00824),SP [ED 73]'],
  ]);

  if (prev2a === 0xED && twoByteOpcodeStores.has(prev2b)) {
    return {
      start: addrOffset - 2,
      length: 5,
      name: `address-subsequence store candidate: ${twoByteOpcodeStores.get(prev2b)}`,
      kind: 'write',
    };
  }

  if (prev2a === 0xDD && prev2b === 0x22) {
    return {
      start: addrOffset - 2,
      length: 5,
      name: 'address-subsequence store candidate: LD (D00824),IX [DD 22]',
      kind: 'write',
    };
  }

  if (prev2a === 0xFD && prev2b === 0x22) {
    return {
      start: addrOffset - 2,
      length: 5,
      name: 'address-subsequence store candidate: LD (D00824),IY [FD 22]',
      kind: 'write',
    };
  }

  const oneByteOpcodeCandidates = new Map([
    [0x32, { name: 'address-subsequence store candidate: LD (D00824),A [32]', kind: 'write' }],
    [0x22, { name: 'address-subsequence store candidate: LD (D00824),HL [22]', kind: 'write' }],
    [0x21, { name: 'address-subsequence pointer candidate: LD HL,D00824 [21]', kind: 'address' }],
    [0x11, { name: 'address-subsequence pointer candidate: LD DE,D00824 [11]', kind: 'address' }],
    [0x01, { name: 'address-subsequence pointer candidate: LD BC,D00824 [01]', kind: 'address' }],
  ]);

  const oneByte = oneByteOpcodeCandidates.get(prev1);
  if (oneByte) {
    return {
      start: addrOffset - 1,
      length: 4,
      name: oneByte.name,
      kind: oneByte.kind,
    };
  }

  return null;
}

function findAddressSubsequenceCandidates(rom, existingMatchKeys) {
  const matches = [];
  let offset = 0;

  while (offset < rom.length) {
    const found = rom.indexOf(addrBytes, offset);
    if (found === -1) {
      break;
    }

    const candidate = classifyAddressOperand(rom, found);
    if (candidate) {
      const key = `${candidate.start}:${candidate.length}`;
      if (!existingMatchKeys.has(key)) {
        matches.push({
          addr: candidate.start,
          length: candidate.length,
          name: candidate.name,
          summaryName: 'address-subsequence store/pointer candidates',
          source: 'addr-subsequence',
          kind: candidate.kind,
        });
      }
    }

    offset = found + 1;
  }

  return matches;
}

function printRomMatches(rom) {
  const exactMatches = findPatternMatches(rom);
  const existingMatchKeys = new Set(exactMatches.map((match) => `${match.addr}:${match.length}`));
  const addressMatches = findAddressSubsequenceCandidates(rom, existingMatchKeys);
  const matches = [...exactMatches, ...addressMatches].sort((a, b) => {
    if (a.addr !== b.addr) {
      return a.addr - b.addr;
    }

    return a.name.localeCompare(b.name);
  });

  const summary = new Map(patterns.map((pattern) => [pattern.name, 0]));
  summary.set('address-subsequence store/pointer candidates', 0);

  console.log(`D00824 writer probe`);
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Target: ${fmtAddr(TARGET_ADDR)} (decimal ${TARGET_DECIMAL}; also checking prompt decimal ${PROMPT_DECIMAL} in transpiled JS)`);
  console.log('');

  for (const match of matches) {
    const context = contextFor(rom, match.addr, match.length);
    summary.set(match.summaryName, (summary.get(match.summaryName) ?? 0) + 1);
    console.log(`[match] ${match.name} at ${fmtAddr(match.addr)}  context: ${context.before} [${context.match}] ${context.after}`);
  }

  if (matches.length === 0) {
    console.log('[match] none');
  }

  console.log('');
  console.log('Summary:');
  for (const [name, count] of summary) {
    console.log(`  ${name}: ${count}`);
  }
  console.log(`  total: ${matches.length}`);

  return matches;
}

function makeTranspiledStream() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      label: TRANSPILED_JS_PATH,
      stream: fs.createReadStream(TRANSPILED_JS_PATH, { encoding: 'utf8' }),
    };
  }

  if (fs.existsSync(TRANSPILED_GZ_PATH)) {
    return {
      label: TRANSPILED_GZ_PATH,
      stream: fs.createReadStream(TRANSPILED_GZ_PATH).pipe(zlib.createGunzip()).setEncoding('utf8'),
    };
  }

  return null;
}

function sanitizeSnippet(text) {
  return text.replace(/\s+/g, ' ').trim();
}

async function searchTranspiledReferences() {
  const transpiled = makeTranspiledStream();
  console.log('');
  console.log('Transpiled JS references:');

  if (!transpiled) {
    console.log(`  skipped: neither ${TRANSPILED_JS_PATH} nor ${TRANSPILED_GZ_PATH} exists`);
    return;
  }

  const needles = [
    { name: '0xD00824', text: '0xd00824' },
    { name: 'D00824', text: 'd00824' },
    { name: `decimal ${TARGET_DECIMAL}`, text: TARGET_DECIMAL },
    { name: `prompt decimal ${PROMPT_DECIMAL}`, text: PROMPT_DECIMAL },
  ];
  const maxNeedleLength = Math.max(...needles.map((needle) => needle.text.length));
  const contextRadius = 80;
  const carryLength = contextRadius + maxNeedleLength;
  const counts = new Map(needles.map((needle) => [needle.name, 0]));
  const printLimit = 200;
  let printed = 0;
  let total = 0;
  let carry = '';
  let absoluteChunkStart = 0;

  console.log(`  source: ${transpiled.label}`);

  for await (const chunk of transpiled.stream) {
    const text = carry + chunk;
    const lower = text.toLowerCase();
    const reportStart = Math.max(0, carry.length - maxNeedleLength + 1);

    for (const needle of needles) {
      let searchFrom = 0;
      while (searchFrom < lower.length) {
        const found = lower.indexOf(needle.text, searchFrom);
        if (found === -1) {
          break;
        }

        if (found >= reportStart) {
          const absoluteOffset = absoluteChunkStart - carry.length + found;
          const snippetStart = Math.max(0, found - contextRadius);
          const snippetEnd = Math.min(text.length, found + needle.text.length + contextRadius);
          const snippet = sanitizeSnippet(text.slice(snippetStart, snippetEnd));

          counts.set(needle.name, (counts.get(needle.name) ?? 0) + 1);
          total += 1;
          if (printed < printLimit) {
            console.log(`  [ref] ${needle.name} at byte ~${absoluteOffset}: ${snippet}`);
            printed += 1;
          }
        }

        searchFrom = found + 1;
      }
    }

    absoluteChunkStart += chunk.length;
    carry = text.slice(-carryLength);
  }

  if (total === 0) {
    console.log('  [ref] none');
  } else if (printed < total) {
    console.log(`  [ref] ${total - printed} additional references not printed (print limit ${printLimit})`);
  }

  console.log('  Summary:');
  for (const [name, count] of counts) {
    console.log(`    ${name}: ${count}`);
  }
  console.log(`    total: ${total}`);
}

const rom = fs.readFileSync(ROM_PATH);
printRomMatches(rom);
await searchTranspiledReferences();
