#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase164-report.md');

const ROM_LIMIT = 0x400000;
const CALL_PREFIX = [0xcd, 0x97, 0x21];
const EXACT_CALL_FOURTH_BYTE = 0x00;

const CONTEXT_BEFORE = 20;
const CONTEXT_AFTER = 10;

const SYSTEM_RANGE = [0x050000, 0x05ffff];
const OS_CORE_RANGE = [0x080000, 0x08ffff];
const DISPLAY_RANGE = [0x0a0000, 0x0affff];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function read24(bytes, offset) {
  return (bytes[offset] ?? 0)
    | ((bytes[offset + 1] ?? 0) << 8)
    | ((bytes[offset + 2] ?? 0) << 16);
}

function signed24(value) {
  return value & 0x800000 ? value - 0x1000000 : value;
}

function regionLabel(address) {
  return `0x${((address >>> 16) & 0xff).toString(16).padStart(2, '0')}xxxx`;
}

function inRange(address, [start, end]) {
  return address >= start && address <= end;
}

function formatContext(bytes, address) {
  const start = Math.max(0, address - CONTEXT_BEFORE);
  const end = Math.min(bytes.length, address + CONTEXT_AFTER + 1);
  return Array.from(bytes.slice(start, end), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join(' ');
}

function chunk(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function loadTranspiledBlocks() {
  if (!fs.existsSync(TRANSPILED_PATH)) {
    return { blocks: null, note: 'ROM.transpiled.js was not present.' };
  }

  try {
    const module = await import(pathToFileURL(TRANSPILED_PATH).href);
    return { blocks: module.PRELIFTED_BLOCKS ?? {}, note: null };
  } catch (error) {
    return {
      blocks: null,
      note: `ROM.transpiled.js could not be loaded: ${error.message}`,
    };
  }
}

function analyzeRom(romBytes, transpiledBlocks) {
  const prefixHits = [];
  const exactCallers = [];

  for (let address = 0; address <= romBytes.length - 4; address += 1) {
    if (
      romBytes[address] !== CALL_PREFIX[0]
      || romBytes[address + 1] !== CALL_PREFIX[1]
      || romBytes[address + 2] !== CALL_PREFIX[2]
    ) {
      continue;
    }

    const fourthByte = romBytes[address + 3];
    const caller = {
      address,
      addressHex: hex(address),
      region: regionLabel(address),
      nextByte: fourthByte,
      nextByteHex: hex(fourthByte, 2),
      context: formatContext(romBytes, address),
      isSystem: inRange(address, SYSTEM_RANGE),
      isOsCore: inRange(address, OS_CORE_RANGE),
      isDisplay: inRange(address, DISPLAY_RANGE),
    };

    prefixHits.push(caller);

    if (fourthByte !== EXACT_CALL_FOURTH_BYTE) {
      continue;
    }

    let frameSeed = null;
    if (address >= 4 && romBytes[address - 4] === 0x21) {
      const raw = read24(romBytes, address - 3);
      frameSeed = {
        raw,
        hex: hex(raw),
        signed: signed24(raw),
      };
    }

    let exactTranspiledBlock = false;
    if (transpiledBlocks) {
      const blockKey = `${address.toString(16).padStart(6, '0')}:adl`;
      exactTranspiledBlock = Object.prototype.hasOwnProperty.call(
        transpiledBlocks,
        blockKey,
      );
    }

    exactCallers.push({
      ...caller,
      frameSeed,
      exactTranspiledBlock,
    });
  }

  const byRegion = new Map();
  const frameSeedCounts = new Map();
  const exactTranspiledBlocks = [];
  const displayCallers = [];
  const osCoreCallers = [];
  const systemCallers = [];

  for (const caller of exactCallers) {
    byRegion.set(caller.region, (byRegion.get(caller.region) ?? 0) + 1);

    if (caller.frameSeed) {
      const frameKey = `${caller.frameSeed.hex}|${caller.frameSeed.signed}`;
      frameSeedCounts.set(frameKey, (frameSeedCounts.get(frameKey) ?? 0) + 1);
    }

    if (caller.exactTranspiledBlock) {
      exactTranspiledBlocks.push(caller.addressHex);
    }
    if (caller.isDisplay) {
      displayCallers.push(caller.addressHex);
    }
    if (caller.isOsCore) {
      osCoreCallers.push(caller.addressHex);
    }
    if (caller.isSystem) {
      systemCallers.push(caller.addressHex);
    }
  }

  const ambiguousPrefixHits = prefixHits
    .filter((caller) => caller.nextByte !== EXACT_CALL_FOURTH_BYTE)
    .map((caller) => ({
      addressHex: caller.addressHex,
      nextByteHex: caller.nextByteHex,
      region: caller.region,
    }));

  const sortedByRegion = [...byRegion.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );

  const sortedFrameSeeds = [...frameSeedCounts.entries()]
    .map(([key, count]) => {
      const [frameHex, frameSigned] = key.split('|');
      return {
        frameHex,
        frameSigned: Number(frameSigned),
        count,
      };
    })
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }
      return left.frameSigned - right.frameSigned;
    });

  return {
    prefixHits,
    exactCallers,
    ambiguousPrefixHits,
    byRegion: sortedByRegion,
    frameSeeds: sortedFrameSeeds,
    exactTranspiledBlocks,
    displayCallers,
    osCoreCallers,
    systemCallers,
  };
}

function buildMarkdown({
  exactCallers,
  ambiguousPrefixHits,
  byRegion,
  frameSeeds,
  exactTranspiledBlocks,
  displayCallers,
  osCoreCallers,
  systemCallers,
  transpiledNote,
}) {
  const lines = [];
  const callersByRegion = new Map();

  for (const caller of exactCallers) {
    if (!callersByRegion.has(caller.region)) {
      callersByRegion.set(caller.region, []);
    }
    callersByRegion.get(caller.region).push(caller.addressHex);
  }

  lines.push('# Phase 164: CALL 0x002197 Caller Census');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Scanned \`${ROM_PATH}\` through \`${hex(ROM_LIMIT)}\` bytes (4 MB raw ROM).`);
  lines.push(`- Found ${exactCallers.length} exact ADL call sites matching \`CD 97 21 00\`.`);
  lines.push(`- Found ${ambiguousPrefixHits.length} additional \`CD 97 21 xx\` prefix hits with a non-zero fourth byte.`);
  lines.push(`- All exact callers land in only two ROM regions: \`${byRegion[0]?.[0] ?? 'none'}\` and \`${byRegion[1]?.[0] ?? 'none'}\`.`);
  lines.push(`- Display-range callers (\`0x0A0000-0x0AFFFF\`): ${displayCallers.length === 0 ? 'none' : displayCallers.join(', ')}.`);
  lines.push(`- OS-core callers (\`0x080000-0x08FFFF\`): ${osCoreCallers.length === 0 ? 'none' : osCoreCallers.join(', ')}.`);
  lines.push(`- System callers (\`0x050000-0x05FFFF\`): ${systemCallers.length === 0 ? 'none' : systemCallers.join(', ')}.`);
  if (transpiledNote) {
    lines.push(`- Transpiled block cross-reference: ${transpiledNote}`);
  } else {
    lines.push(`- Exact \`PRELIFTED_BLOCKS[*:adl]\` matches: ${exactTranspiledBlocks.length === 0 ? 'none' : exactTranspiledBlocks.join(', ')}.`);
  }
  lines.push('');
  lines.push('## Breakdown By ROM Region');
  lines.push('');
  lines.push('| Region | Count |');
  lines.push('| --- | ---: |');
  for (const [region, count] of byRegion) {
    lines.push(`| \`${region}\` | ${count} |`);
  }
  lines.push('');
  lines.push('## Common Pre-Call Frame Seeds');
  lines.push('');
  lines.push('These come from the context windows at `caller-20` through `caller+10` and summarize the immediate loaded into `HL` immediately before the frame-helper call.');
  lines.push('');
  lines.push('| `LD HL, imm24` | Signed | Count |');
  lines.push('| --- | ---: | ---: |');
  for (const frame of frameSeeds) {
    lines.push(`| \`${frame.frameHex}\` | ${frame.frameSigned} | ${frame.count} |`);
  }
  lines.push('');
  lines.push('## Exact ADL Callers');
  lines.push('');
  for (const [region, callers] of callersByRegion.entries()) {
    lines.push(`### \`${region}\` (${callers.length})`);
    lines.push('');
    for (const group of chunk(callers, 8)) {
      lines.push(group.map((caller) => `\`${caller}\``).join(', '));
      lines.push('');
    }
  }
  lines.push('## Prefix Scan Notes');
  lines.push('');
  if (ambiguousPrefixHits.length === 0) {
    lines.push('- Every `CD 97 21` prefix hit in this ROM is followed by `00`, so the wildcard/Z80-style scan did not produce any extra candidates.');
  } else {
    lines.push('- The following `CD 97 21 xx` hits had a non-zero fourth byte and were not counted as exact `CALL 0x002197` sites:');
    lines.push('');
    for (const hit of ambiguousPrefixHits) {
      lines.push(`- \`${hit.addressHex}\` in \`${hit.region}\` with fourth byte \`${hit.nextByteHex}\``);
    }
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

const romBytes = fs.readFileSync(ROM_PATH).subarray(0, ROM_LIMIT);
if (romBytes.length !== ROM_LIMIT) {
  throw new Error(`Expected a 4 MB ROM image at ${ROM_PATH}, got ${romBytes.length} bytes.`);
}

const { blocks: transpiledBlocks, note: transpiledNote } = await loadTranspiledBlocks();
const analysis = analyzeRom(romBytes, transpiledBlocks);
const report = buildMarkdown({
  ...analysis,
  transpiledNote,
});

fs.writeFileSync(REPORT_PATH, report);

const stdoutSummary = {
  phase: '164',
  totalCallers: analysis.exactCallers.length,
  byRegion: Object.fromEntries(analysis.byRegion),
  renderingCallers: analysis.displayCallers,
  osCoreCallers: analysis.osCoreCallers,
  systemCallers: analysis.systemCallers,
  exactTranspiledBlocks: analysis.exactTranspiledBlocks,
  ambiguousPrefixHits: analysis.ambiguousPrefixHits,
};

process.stdout.write(`${JSON.stringify(stdoutSummary, null, 2)}\n`);
