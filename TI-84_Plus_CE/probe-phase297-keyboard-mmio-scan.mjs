#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const WINDOW_BYTES = 20;
const DUMP_RADIUS = 10;
const ED_PREFIX = 0xED;
const LD_BC_IMM24_OPCODE = 0x01;
const OUT_C_A_OPCODE = 0x79;
const KEYBOARD_PORT_MASK = 0xffff00;
const KEYBOARD_PORT_PREFIX = 0xe00900;

const IN_REG_OPCODE_TO_NAME = new Map([
  [0x40, 'B'],
  [0x48, 'C'],
  [0x50, 'D'],
  [0x58, 'E'],
  [0x60, 'H'],
  [0x68, 'L'],
  [0x78, 'A'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function isKeyboardPort(value) {
  // Requested keyboard matrix range: 0xE009xx, encoded as 01 <low> 09 E0.
  return (value & KEYBOARD_PORT_MASK) === KEYBOARD_PORT_PREFIX;
}

function bytesToHex(buffer, start, end) {
  const clampedStart = Math.max(0, start);
  const clampedEnd = Math.min(buffer.length, end);
  return Array.from(buffer.subarray(clampedStart, clampedEnd), (value) => hexByte(value)).join(' ');
}

function makeDump(center, radius = DUMP_RADIUS) {
  const start = Math.max(0, center - radius);
  const end = Math.min(rom.length, center + radius + 1);
  return {
    start,
    end,
    text: bytesToHex(rom, start, end),
  };
}

function scanKeyboardLdBcSites() {
  const hits = [];
  for (let offset = 0; offset <= rom.length - 4; offset += 1) {
    if (rom[offset] !== LD_BC_IMM24_OPCODE) {
      continue;
    }

    const bcValue = read24LE(rom, offset + 1);
    if (!isKeyboardPort(bcValue)) {
      continue;
    }

    hits.push({
      offset,
      bcValue,
      dump: makeDump(offset),
    });
  }
  return hits;
}

function scanInRegCHits() {
  const hits = [];
  for (let offset = 0; offset <= rom.length - 2; offset += 1) {
    if (rom[offset] !== ED_PREFIX) {
      continue;
    }

    const opcode = rom[offset + 1];
    const register = IN_REG_OPCODE_TO_NAME.get(opcode);
    if (!register) {
      continue;
    }

    hits.push({
      offset,
      opcode,
      register,
      dump: makeDump(offset),
    });
  }
  return hits;
}

function scanOutCAHits() {
  const hits = [];
  for (let offset = 0; offset <= rom.length - 2; offset += 1) {
    if (rom[offset] !== ED_PREFIX || rom[offset + 1] !== OUT_C_A_OPCODE) {
      continue;
    }

    hits.push({
      offset,
      opcode: OUT_C_A_OPCODE,
      dump: makeDump(offset),
    });
  }
  return hits;
}

function findPrecedingKeyboardLoads(targetOffset, keyboardLoads) {
  return keyboardLoads
    .filter((load) => load.offset < targetOffset && targetOffset - load.offset <= WINDOW_BYTES)
    .map((load) => ({
      ...load,
      distance: targetOffset - load.offset,
    }))
    .sort((left, right) => left.distance - right.distance || left.offset - right.offset);
}

function findForwardHits(loadOffset, hits) {
  return hits
    .filter((hit) => hit.offset > loadOffset && hit.offset - loadOffset <= WINDOW_BYTES)
    .map((hit) => ({
      ...hit,
      distance: hit.offset - loadOffset,
    }))
    .sort((left, right) => left.offset - right.offset);
}

function formatDump(label, dump) {
  return `${label} ${hex(dump.start)}..${hex(dump.end - 1)}: ${dump.text}`;
}

function printSummary(rawInHits, rawOutHits, keyboardLoads, matchedInHits, loadContexts) {
  const loadsWithOut = loadContexts.filter((context) => context.outHits.length > 0).length;
  console.log('Summary');
  console.log(`  Raw IN r,(C) hits: ${rawInHits.length}`);
  console.log(`  Raw OUT (C),A hits: ${rawOutHits.length}`);
  console.log(`  Raw LD BC,0xE009xx hits: ${keyboardLoads.length}`);
  console.log(`  Filtered IN r,(C) hits with preceding keyboard LD BC: ${matchedInHits.length}`);
  console.log(`  Keyboard LD BC sites with nearby OUT (C),A: ${loadsWithOut}`);
  console.log('');
}

function printMatchedInHits(matchedInHits) {
  console.log('IN r,(C) hits with preceding LD BC,0xE009xx');
  if (matchedInHits.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  matchedInHits.forEach((match, index) => {
    console.log(
      `#${index + 1} IN ${match.hit.register},(C) @ ${hex(match.hit.offset)} ` +
      `(opcode ED ${hexByte(match.hit.opcode)})`,
    );
    console.log(`  ${formatDump('IN dump  ', match.hit.dump)}`);
    match.loads.forEach((load) => {
      console.log(
        `  LD BC @ ${hex(load.offset)} = ${hex(load.bcValue)} ` +
        `(${load.distance} byte(s) before IN)`,
      );
      console.log(`  ${formatDump('LD dump  ', load.dump)}`);
    });
    console.log('');
  });
}

function printLoadContexts(loadContexts) {
  console.log('LD BC,0xE009xx sites with nearby IN/OUT activity');
  if (loadContexts.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  loadContexts.forEach((context, index) => {
    console.log(`#${index + 1} LD BC @ ${hex(context.offset)} = ${hex(context.bcValue)}`);
    console.log(`  ${formatDump('LD dump  ', context.dump)}`);

    if (context.inHits.length === 0) {
      console.log('  IN hits after load: none within 20 bytes');
    } else {
      context.inHits.forEach((hit) => {
        console.log(
          `  IN ${hit.register},(C) @ ${hex(hit.offset)} ` +
          `(${hit.distance} byte(s) after load)`,
        );
        console.log(`  ${formatDump('IN dump  ', hit.dump)}`);
      });
    }

    if (context.outHits.length === 0) {
      console.log('  OUT (C),A hits after load: none within 20 bytes');
    } else {
      context.outHits.forEach((hit) => {
        console.log(
          `  OUT (C),A @ ${hex(hit.offset)} ` +
          `(${hit.distance} byte(s) after load)`,
        );
        console.log(`  ${formatDump('OUT dump ', hit.dump)}`);
      });
    }

    console.log('');
  });
}

function main() {
  const keyboardLoads = scanKeyboardLdBcSites();
  const rawInHits = scanInRegCHits();
  const rawOutHits = scanOutCAHits();

  const matchedInHits = rawInHits
    .map((hit) => ({
      hit,
      loads: findPrecedingKeyboardLoads(hit.offset, keyboardLoads),
    }))
    .filter((match) => match.loads.length > 0);

  const loadContexts = keyboardLoads.map((load) => ({
    ...load,
    inHits: findForwardHits(load.offset, rawInHits),
    outHits: findForwardHits(load.offset, rawOutHits),
  }));

  console.log('=== Phase 297: Keyboard MMIO raw ROM scan ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes (${hex(rom.length)})`);
  console.log(`IN opcode set: ED 40 / 48 / 50 / 58 / 60 / 68 / 78`);
  console.log(`Keyboard LD BC pattern: 01 <low> 09 E0 (0xE009xx)`);
  console.log(`Window: ${WINDOW_BYTES} bytes, dump radius: +/-${DUMP_RADIUS} bytes`);
  console.log('');

  printSummary(rawInHits, rawOutHits, keyboardLoads, matchedInHits, loadContexts);
  printMatchedInHits(matchedInHits);
  printLoadContexts(loadContexts);

  console.log('Done.');
}

main();
