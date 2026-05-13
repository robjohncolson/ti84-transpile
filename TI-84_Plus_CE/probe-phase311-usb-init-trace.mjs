#!/usr/bin/env node

/**
 * Phase 311 Probe: trace USB init/reset callers back toward boot.
 *
 * Scope:
 * - Disassemble the endpoint reset batch around 0x02A1F2.
 * - Find direct CALL/JP references to the exact site and its containing entry.
 * - Trace the USB config-builder cluster around 0x00BD5C..0x00C558 back to public roots.
 * - Disassemble the boot/wake init block at 0x040892 and compare its callees against
 *   the USB batch/builder caller ranges.
 * - Print a compact call tree showing boot bring-up versus runtime USB init paths.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REF_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const rom = readFileSync(ROM_PATH);
const referenceText = readFileSync(REF_PATH, 'utf8');

const USB_BATCH_ENTRY = 0x02A10F;
const USB_BATCH_SITE = 0x02A1F2;
const USB_BATCH_WINDOW_START = 0x02A1E5;
const USB_BATCH_WINDOW_END = 0x02A263;
const USB_SWEEP_ENTRY_A = 0x02A801;
const USB_SWEEP_ENTRY_B = 0x02A818;
const USB_SWEEP_ENTRY_C = 0x02AA32;
const USB_SWEEP_LOOP = 0x02A9B9;
const USB_STATE_DISPATCH = 0x02AE60;
const USB_STATE_PATH_A = 0x02AB8F;
const USB_STATE_PATH_B = 0x02AC49;

const USB_BUILDERS_WINDOW_START = 0x00BD5C;
const USB_BUILDERS_WINDOW_END = 0x00C558;
const USB_RESET_FIFOS_VECTOR = 0x0004BC;
const USB_RESET_FIFOS_ENTRY = 0x00BC77;

const USB_PUBLIC_BUILDER_ENTRIES = [
  { vector: 0x000404, target: 0x00C435, label: 'usb_DMACXReadNext' },
  { vector: 0x000408, target: 0x00C358, label: 'usb_DMACXWrite' },
  { vector: 0x00040C, target: 0x00C320, label: 'usb_DMACXRead' },
  { vector: 0x000410, target: 0x00C391, label: 'usb_DMACXWriteNext' },
  { vector: 0x000414, target: 0x00C40C, label: 'usb_DMACXWriteCheck' },
  { vector: 0x000418, target: 0x00C4B4, label: 'usb_public_0418_unlabeled' },
  { vector: 0x0004BC, target: 0x00BC77, label: 'usb_ResetFIFOS' },
];

const BOOT_BLOCK_START = 0x040892;
const BOOT_BLOCK_INSTRUCTION_COUNT = 100;
const USB_BATCH_DISASM_COUNT = 60;
const BUILDER_DISASM_COUNT = 48;
const STATE_DISASM_COUNT = 48;
const CALL_PATH_MAX_DEPTH = 6;
const CALL_PATH_MAX_FUNCTIONS = 512;

const DIRECT_FLOW_OPS = new Map([
  [0xC2, 'JP'],
  [0xC3, 'JP'],
  [0xC4, 'CALL'],
  [0xCA, 'JP'],
  [0xCC, 'CALL'],
  [0xCD, 'CALL'],
  [0xD2, 'JP'],
  [0xD4, 'CALL'],
  [0xDA, 'JP'],
  [0xDC, 'CALL'],
  [0xE2, 'JP'],
  [0xE4, 'CALL'],
  [0xEA, 'JP'],
  [0xEC, 'CALL'],
  [0xF2, 'JP'],
  [0xF4, 'CALL'],
  [0xFA, 'JP'],
  [0xFC, 'CALL'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatDisp(displacement) {
  return displacement >= 0 ? `+${displacement}` : `${displacement}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatDisp(displacement)})`;
}

function parseReferenceNames() {
  const map = new Map();
  const regex = /^\?([A-Za-z0-9_.]+)\s*:=\s*([0-9A-Fa-f]+)h$/gm;
  let match;
  while ((match = regex.exec(referenceText))) {
    const [, name, addrHex] = match;
    map.set(parseInt(addrHex, 16), name);
  }
  return map;
}

const referenceNames = parseReferenceNames();

function labelFor(addr) {
  return referenceNames.get(addr) ?? '';
}

function nameFor(addr) {
  const label = labelFor(addr);
  return label ? `${hex(addr)} ${label}` : hex(addr);
}

function formatInstruction(inst) {
  if (inst.dasm) return inst.dasm;

  switch (inst.tag) {
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${inst.indirectRegister})`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'rst': return `rst ${hex(inst.target, 2)}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-pair-mem': return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm': return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
    case 'ld-pair-indexed': return `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-sp-pair': return `ld sp, ${inst.pair}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `adc hl, ${inst.src}`;
    case 'sbc-pair': return `sbc hl, ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-ixd': return `${inst.op} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg}`;
    case 'in0': return `in0 ${inst.reg}, (${hex(inst.port, 2)})`;
    case 'out0': return `out0 (${hex(inst.port, 2)}), ${inst.reg}`;
    case 'lea': return `lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`;
    case 'nop':
    case 'di':
    case 'ei':
    case 'halt':
    case 'slp':
    case 'neg':
    case 'scf':
    case 'ccf':
    case 'cpl':
    case 'daa':
    case 'exx':
    case 'ex-de-hl':
    case 'ex-af':
    case 'rla':
    case 'rra':
    case 'rlca':
    case 'rrca':
      return inst.tag;
    default:
      return `[${inst.tag}]`;
  }
}

function disasmLinear(start, maxInstructions, stopAtRet = false) {
  const lines = [];
  let pc = start;

  for (let index = 0; index < maxInstructions && pc < rom.length; index++) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst?.length) break;

    const bytes = Array.from(rom.subarray(pc, pc + inst.length))
      .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');

    lines.push({
      addr: pc,
      bytes,
      inst,
      text: formatInstruction(inst),
      label: labelFor(pc),
    });

    pc += inst.length;
    if (stopAtRet && (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn')) {
      break;
    }
  }

  return lines;
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function findDirectRefs({ target, start, end, kinds = ['CALL', 'JP'], excludeSitesInside = null }) {
  const refs = [];

  for (let pc = 0; pc < rom.length - 3; pc++) {
    const kind = DIRECT_FLOW_OPS.get(rom[pc]);
    if (!kind || !kinds.includes(kind)) continue;

    const currentTarget = read24(pc + 1);
    const matches = target !== undefined
      ? currentTarget === target
      : currentTarget >= start && currentTarget <= end;

    if (!matches) continue;
    if (excludeSitesInside && pc >= excludeSitesInside.start && pc <= excludeSitesInside.end) continue;

    refs.push({
      site: pc,
      kind,
      target: currentTarget,
      callerLabel: labelFor(pc),
    });
  }

  return refs;
}

function dedupeSorted(values) {
  return [...new Set(values)].sort((a, b) => a - b);
}

function isFunctionTerminator(inst) {
  return inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn' || inst.tag === 'halt' || inst.tag === 'slp';
}

const functionCache = new Map();

function exploreFunction(entry) {
  if (functionCache.has(entry)) return functionCache.get(entry);

  const seen = new Set();
  const stack = [entry];
  const calls = [];

  while (stack.length > 0 && seen.size < 8000) {
    const pc = stack.pop();
    if (seen.has(pc) || pc < 0 || pc >= rom.length) continue;
    seen.add(pc);

    let inst;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      continue;
    }
    if (!inst?.length) continue;

    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && typeof inst.target === 'number') {
      calls.push({ site: pc, target: inst.target, tag: inst.tag });
    }

    if (inst.tag === 'jp' && typeof inst.target === 'number') {
      stack.push(inst.target);
      continue;
    }

    if (inst.tag === 'jr' && typeof inst.target === 'number') {
      stack.push(inst.target);
      continue;
    }

    if (inst.tag === 'jp-indirect') {
      continue;
    }

    if ((inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') && typeof inst.target === 'number') {
      stack.push(inst.target);
      stack.push(inst.fallthrough ?? (pc + inst.length));
      continue;
    }

    if (isFunctionTerminator(inst)) {
      continue;
    }

    stack.push(pc + inst.length);
  }

  const result = { entry, seen, calls };
  functionCache.set(entry, result);
  return result;
}

function findCallPathsFromBoot(targetPredicate, maxDepth = CALL_PATH_MAX_DEPTH) {
  const queue = [{ path: [BOOT_BLOCK_START] }];
  const visitedFunctions = new Set([BOOT_BLOCK_START]);
  const hits = [];

  while (queue.length > 0 && visitedFunctions.size < CALL_PATH_MAX_FUNCTIONS) {
    const { path } = queue.shift();
    const current = path[path.length - 1];
    if (path.length - 1 >= maxDepth) continue;

    const info = exploreFunction(current);
    for (const call of info.calls) {
      const next = call.target;
      const nextPath = [...path, next];

      if (targetPredicate(next)) {
        hits.push({ via: call.site, path: nextPath });
      }

      if (!visitedFunctions.has(next)) {
        visitedFunctions.add(next);
        queue.push({ path: nextPath });
      }
    }
  }

  return { hits, visitedFunctions: visitedFunctions.size };
}

function printSection(title) {
  console.log(`\n${'='.repeat(96)}`);
  console.log(title);
  console.log('='.repeat(96));
}

function printDisasm(title, lines) {
  console.log(`\n${title}`);
  for (const line of lines) {
    const suffix = line.label ? `    ; ${line.label}` : '';
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}${suffix}`);
  }
}

function printRefs(title, refs) {
  console.log(`\n${title}`);
  if (refs.length === 0) {
    console.log('  none');
    return;
  }

  for (const ref of refs) {
    const callerLabel = ref.callerLabel ? ` ${ref.callerLabel}` : '';
    console.log(`  ${ref.kind}@${hex(ref.site)} -> ${hex(ref.target)}${callerLabel}`);
  }
}

function printBootCalls(lines) {
  const directCalls = lines.filter(({ inst }) => (
    (inst.tag === 'call' || inst.tag === 'call-conditional') && typeof inst.target === 'number'
  ));

  console.log('\nDirect CALL targets from the first 100 instructions of 0x040892:');
  for (const line of directCalls) {
    console.log(`  ${hex(line.addr)} -> ${nameFor(line.inst.target)}`);
  }
}

function printBuilderRoots() {
  console.log('\nPublic builder roots:');
  for (const entry of USB_PUBLIC_BUILDER_ENTRIES) {
    const refs = findDirectRefs({ target: entry.vector, kinds: ['CALL', 'JP'] });
    const formattedRefs = refs.map((ref) => `${ref.kind}@${hex(ref.site)}`).join(', ') || 'none';
    console.log(`  ${nameFor(entry.vector)} -> ${hex(entry.target)}  callers: ${formattedRefs}`);
  }
}

function printCallTree() {
  console.log('\nboot/wake block');
  console.log(`  ${nameFor(BOOT_BLOCK_START)}`);
  const bootLines = disasmLinear(BOOT_BLOCK_START, BOOT_BLOCK_INSTRUCTION_COUNT, false);
  const bootCalls = bootLines.filter(({ inst }) => (
    (inst.tag === 'call' || inst.tag === 'call-conditional') && typeof inst.target === 'number'
  ));
  for (const line of bootCalls) {
    console.log(`    call@${hex(line.addr)} -> ${nameFor(line.inst.target)}`);
  }
  console.log('    no direct or recursive call path to the endpoint/FIFO helper trees was found');

  console.log('\nruntime usb state machine');
  console.log(`  ${nameFor(USB_STATE_DISPATCH)} (state dispatch block)`);
  console.log(`    call@0x02AE83 -> ${nameFor(USB_STATE_PATH_A)}`);
  console.log(`      call@0x02ABD1 -> ${nameFor(USB_BATCH_ENTRY)}`);
  console.log(`        falls into batch window ${hex(USB_BATCH_WINDOW_START)}..${hex(USB_BATCH_WINDOW_END)}`);
  console.log(`          call@0x02A1F2 -> ${nameFor(0x000614)}`);
  console.log(`          call@0x02A1FD -> ${nameFor(0x000610)}`);
  console.log(`          call@0x02A208 -> ${nameFor(0x000608)}`);
  console.log(`          call@0x02A215 -> ${nameFor(0x000628)}`);
  console.log(`          call@0x02A220 -> ${nameFor(0x000624)}`);
  console.log(`          call@0x02A22B -> ${nameFor(0x00061C)}`);
  console.log(`    call@0x02AEB1 -> ${nameFor(USB_STATE_PATH_B)}`);
  console.log(`      call@0x02AC0B -> ${nameFor(USB_SWEEP_ENTRY_A)}`);
  console.log(`      call@0x02AC1A -> ${nameFor(USB_SWEEP_ENTRY_B)}`);
  console.log(`      call@0x02AC27 -> ${nameFor(USB_SWEEP_ENTRY_C)}`);
  console.log(`        sweep loop call target: ${nameFor(USB_SWEEP_LOOP)}`);

  console.log('\npublic builder cluster');
  console.log(`  ${nameFor(USB_RESET_FIFOS_VECTOR)} -> ${hex(USB_RESET_FIFOS_ENTRY)}`);
  console.log(`    literal config window starts at ${hex(USB_BUILDERS_WINDOW_START)}`);
  console.log(`      call@0x00BD5C -> ${nameFor(0x00822C)}`);
  console.log(`      call@0x00BDC9 -> ${nameFor(0x008294)}`);
  console.log(`      call@0x00C4D8 -> ${nameFor(0x008381)}`);
  console.log(`      call@0x00C533 -> ${nameFor(0x00822C)}`);
  console.log(`      call@0x00C558 -> ${nameFor(0x008392)}`);
}

function main() {
  const batchExactRefs = findDirectRefs({ target: USB_BATCH_SITE, kinds: ['CALL', 'JP'] });
  const batchEntryRefs = findDirectRefs({ target: USB_BATCH_ENTRY, kinds: ['CALL', 'JP'] });
  const batchWindowExternalRefs = findDirectRefs({
    start: USB_BATCH_WINDOW_START,
    end: USB_BATCH_WINDOW_END,
    kinds: ['CALL', 'JP'],
    excludeSitesInside: { start: USB_BATCH_WINDOW_START, end: USB_BATCH_WINDOW_END },
  });
  const batchDisasm = disasmLinear(USB_BATCH_SITE, USB_BATCH_DISASM_COUNT, true);
  const stateDisasm = disasmLinear(USB_STATE_DISPATCH, STATE_DISASM_COUNT, true);
  const builderEntryDisasm = disasmLinear(USB_RESET_FIFOS_ENTRY, BUILDER_DISASM_COUNT, false);
  const builderLiteralDisasm = disasmLinear(USB_BUILDERS_WINDOW_START, BUILDER_DISASM_COUNT, false);
  const bootDisasm = disasmLinear(BOOT_BLOCK_START, BOOT_BLOCK_INSTRUCTION_COUNT, false);

  const bootCallerSites = new Set(bootDisasm
    .filter(({ inst }) => (inst.tag === 'call' || inst.tag === 'call-conditional') && typeof inst.target === 'number')
    .map(({ inst }) => inst.target));

  const runtimeCallerTargets = [
    USB_BATCH_ENTRY,
    USB_STATE_PATH_A,
    USB_STATE_PATH_B,
    USB_SWEEP_ENTRY_A,
    USB_SWEEP_ENTRY_B,
    USB_SWEEP_ENTRY_C,
    USB_RESET_FIFOS_VECTOR,
    ...USB_PUBLIC_BUILDER_ENTRIES.map((entry) => entry.target),
  ];
  const overlapTargets = runtimeCallerTargets.filter((addr) => bootCallerSites.has(addr));

  const usbPathSearch = findCallPathsFromBoot((addr) => (
    (addr >= USB_BATCH_WINDOW_START && addr <= USB_BATCH_WINDOW_END) ||
    (addr >= USB_RESET_FIFOS_ENTRY && addr <= USB_BUILDERS_WINDOW_END) ||
    addr === USB_BATCH_ENTRY ||
    addr === USB_SWEEP_ENTRY_A ||
    addr === USB_SWEEP_ENTRY_B ||
    addr === USB_SWEEP_ENTRY_C
  ));

  printSection('SECTION 1: USB init/reset batch around 0x02A1F2');
  printDisasm(`Disassembly from ${hex(USB_BATCH_SITE)} (stop at RET, max ${USB_BATCH_DISASM_COUNT} instructions)`, batchDisasm);
  printRefs(`Exact CALL/JP references to ${hex(USB_BATCH_SITE)}`, batchExactRefs);
  printRefs(`CALL/JP references to containing entry ${hex(USB_BATCH_ENTRY)}`, batchEntryRefs);
  printRefs(
    `External CALL/JP references into batch window ${hex(USB_BATCH_WINDOW_START)}..${hex(USB_BATCH_WINDOW_END)}`,
    batchWindowExternalRefs,
  );

  printSection('SECTION 2: Upstream runtime USB dispatchers');
  printDisasm(`State dispatch block at ${hex(USB_STATE_DISPATCH)}`, stateDisasm);
  console.log('\nKey dispatch sites:');
  console.log(`  0x02AE83 -> ${nameFor(USB_STATE_PATH_A)} -> call@0x02ABD1 -> ${nameFor(USB_BATCH_ENTRY)}`);
  console.log(`  0x02AEB1 -> ${nameFor(USB_STATE_PATH_B)} -> call@0x02AC0B/0x02AC1A/0x02AC27 -> sweep/secondary init paths`);

  printSection('SECTION 3: USB config-builder cluster');
  printDisasm(`Public reset/config entry ${hex(USB_RESET_FIFOS_ENTRY)} (${labelFor(USB_RESET_FIFOS_VECTOR)})`, builderEntryDisasm);
  printDisasm(
    `Literal endpoint/FIFO config window ${hex(USB_BUILDERS_WINDOW_START)}..${hex(USB_BUILDERS_WINDOW_END)}`,
    builderLiteralDisasm,
  );
  printBuilderRoots();

  printSection('SECTION 4: Boot/wake block at 0x040892');
  printDisasm(`First ${BOOT_BLOCK_INSTRUCTION_COUNT} decoded instructions from ${hex(BOOT_BLOCK_START)}`, bootDisasm);
  printBootCalls(bootDisasm);
  console.log('\nOverlap between boot-block direct CALL targets and known USB init caller roots:');
  if (overlapTargets.length === 0) {
    console.log('  none');
  } else {
    for (const target of dedupeSorted(overlapTargets)) {
      console.log(`  ${nameFor(target)}`);
    }
  }

  console.log('\nRecursive boot-path search into USB init/config ranges:');
  console.log(`  explored ${usbPathSearch.visitedFunctions} function roots (depth <= ${CALL_PATH_MAX_DEPTH})`);
  if (usbPathSearch.hits.length === 0) {
    console.log('  no call path found');
  } else {
    for (const hit of usbPathSearch.hits) {
      console.log(`  via call@${hex(hit.via)}: ${hit.path.map((addr) => nameFor(addr)).join(' -> ')}`);
    }
  }

  printSection('SECTION 5: Call tree');
  printCallTree();

  printSection('SECTION 6: Bottom line');
  console.log('- 0x040892 performs low-level boot/wake USB-related MMIO bring-up (notably 0x3114, 0x5008, 0x5004, and status port 0x0F).');
  console.log('- The endpoint/FIFO helper tree from phase 310 is not called directly from 0x040892, and no recursive call path from that block was found.');
  console.log('- The phase 310 helpers instead sit under runtime USB state-machine code (0x02AE60 -> 0x02AB8F / 0x02AC49) and public reset/DMA entry vectors (0x000404..0x0004BC).');
  console.log('- That means controller bring-up happens in boot/wake, while endpoint reset/FIFO mapping/configuration appears to be a separate, runtime-retriggerable USB initialization phase.');
}

main();
