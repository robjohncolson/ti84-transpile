#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const FUNCTIONS = [
  {
    name: 'cpHL_DE_modeDependent',
    requestedAddr: 0x04C960,
    addr: 0x04C973,
    callBytes: 'cd 73 c9 04',
    targetHex: '04c973',
  },
  {
    name: 'cpHL_DE',
    requestedAddr: 0x04C979,
    addr: 0x04C979,
    callBytes: 'cd 79 c9 04',
    targetHex: '04c979',
  },
];

const CALL_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
]);

const JP_OPS = new Map([
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, addr + length))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function formatInst(inst) {
  let text;

  switch (inst.tag) {
    case 'push':
      text = `push ${inst.pair}`;
      break;
    case 'pop':
      text = `pop ${inst.pair}`;
      break;
    case 'alu-reg':
      text = `${inst.op} ${inst.src}`;
      break;
    case 'sbc-pair':
      text = `sbc hl, ${inst.src}`;
      break;
    case 'ret':
      text = 'ret';
      break;
    default:
      text = inst.dasm || inst.tag;
      break;
  }

  if (inst.modePrefix) {
    return `${inst.modePrefix.toUpperCase()} ${text}`;
  }

  return text;
}

function disassembleFunction(addr) {
  const lines = [];
  let pc = addr;

  while (pc < rom.length) {
    const inst = decodeInstruction(rom, pc, 'adl');
    lines.push({
      addr: pc,
      bytes: bytesAt(pc, inst.length),
      text: formatInst(inst),
      tag: inst.tag,
    });
    pc += inst.length;
    if (inst.tag === 'ret') break;
  }

  return lines;
}

function scanRomRefs(target) {
  const refs = [];
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i + 1] !== lo || rom[i + 2] !== mid || rom[i + 3] !== hi) continue;

    const opcode = rom[i];
    const kind = CALL_OPS.get(opcode) || JP_OPS.get(opcode);
    if (!kind) continue;

    refs.push({ addr: i, kind });
  }

  return refs;
}

function groupByRegion(addrs) {
  const counts = new Map();

  for (const addr of addrs) {
    const region = `0x${(addr >>> 16).toString(16).toUpperCase().padStart(2, '0')}xxxx`;
    counts.set(region, (counts.get(region) || 0) + 1);
  }

  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function readTranspiledText() {
  const jsPath = path.join(__dirname, 'ROM.transpiled.js');
  const gzPath = path.join(__dirname, 'ROM.transpiled.js.gz');

  if (existsSync(jsPath)) {
    return readFileSync(jsPath, 'utf8');
  }

  if (existsSync(gzPath)) {
    return gunzipSync(readFileSync(gzPath)).toString('utf8');
  }

  throw new Error('Neither ROM.transpiled.js nor ROM.transpiled.js.gz exists.');
}

function countLiftedCalls(text, callBytes, targetHex) {
  const escapedBytes = callBytes.replace(/ /g, '\\s+');
  const re = new RegExp(
    String.raw`"pc":\s*(\d+),\s*"mode":\s*"adl",\s*"bytes":\s*"${escapedBytes}",\s*"dasm":\s*"call 0x${targetHex}"`,
    'g',
  );

  const callPcs = new Set();
  let match;

  while ((match = re.exec(text))) {
    callPcs.add(Number.parseInt(match[1], 10));
  }

  return [...callPcs].sort((a, b) => a - b);
}

function printRegionTable(label, regions) {
  console.log(`  ${label}`);
  for (const [region, count] of regions) {
    console.log(`    ${region}: ${count}`);
  }
}

function main() {
  const transpiledText = readTranspiledText();

  console.log('Phase 312 - cpHL_DE comparison probe');
  console.log('');
  console.log('Address correction:');
  console.log('  The task text says cpHL_DE_modeDependent is at 0x04C960.');
  console.log('  Raw ROM bytes show 0x04C960..0x04C962 are the tail of the previous helper.');
  console.log('  The compare helper actually starts at 0x04C973.');

  for (const fn of FUNCTIONS) {
    const disasm = disassembleFunction(fn.addr);
    const romRefs = scanRomRefs(fn.addr);
    const callRefs = romRefs.filter((ref) => ref.kind.startsWith('CALL'));
    const jpRefs = romRefs.filter((ref) => ref.kind.startsWith('JP'));
    const liftedCalls = countLiftedCalls(transpiledText, fn.callBytes, fn.targetHex);

    console.log('');
    console.log('='.repeat(88));
    console.log(`${fn.name} @ ${hex(fn.addr)}`);
    console.log('='.repeat(88));

    if (fn.requestedAddr !== fn.addr) {
      console.log(`Requested address: ${hex(fn.requestedAddr)} (not the real entry)`);
      console.log(`Actual entry:      ${hex(fn.addr)}`);
    }

    console.log(`Raw bytes: ${bytesAt(fn.addr, disasm.reduce((sum, line) => sum + line.bytes.split(' ').length, 0))}`);
    console.log('');
    console.log('Disassembly:');
    for (const line of disasm) {
      console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(11)}  ${line.text}`);
    }

    console.log('');
    console.log(`Direct ROM refs: ${romRefs.length}`);
    console.log(`  CALL refs: ${callRefs.length}`);
    console.log(`  JP refs:   ${jpRefs.length}`);
    console.log(`Lifted transpiled.js CALL refs (deduped by PC): ${liftedCalls.length}`);

    console.log('');
    printRegionTable('All direct refs by region:', groupByRegion(romRefs.map((ref) => ref.addr)));
    console.log('');
    printRegionTable('CALL refs by region:', groupByRegion(callRefs.map((ref) => ref.addr)));

    console.log('');
    console.log('Lifted CALL sample PCs:');
    console.log(
      `  ${
        liftedCalls
          .slice(0, 20)
          .map((addr) => hex(addr))
          .join(', ') || '(none)'
      }`,
    );
  }
}

main();
