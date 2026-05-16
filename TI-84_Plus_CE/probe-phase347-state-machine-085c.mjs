#!/usr/bin/env node

import { readFileSync } from 'fs';
import process from 'process';

import { decodeInstruction as decodeInstructionImpl } from './ez80-decoder.js';

process.emitWarning = () => {};

const decode = (romBuffer, address) => decodeInstructionImpl(romBuffer, address, 'adl');

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const INC_PATH = new URL('./references/ti84pceg.inc', import.meta.url);

const rom = new Uint8Array(readFileSync(ROM_PATH));
const incText = readFileSync(INC_PATH, 'utf8');

const IY_BASE = 0xD00080;
const PROMPT_FLAGS_OFFSET = 0x11;
const PROMPT_FLAGS_ADDR = IY_BASE + PROMPT_FLAGS_OFFSET;

const ENTRY_START = 0x085C0B;
const ENTRY_END = 0x085CA0;
const HELPER_START = 0x0867CC;
const HELPER_END = 0x086820;
const CONTEXT_BRIDGE_START = 0x08696D;
const CONTEXT_BRIDGE_END = 0x0869A8;
const SYNTH_START = 0x0869A9;
const SYNTH_END = 0x086A20;
const EXIT_BRIDGE_START = 0x086A73;
const EXIT_END = 0x086B80;
const EXTERNAL_CONSUMER_START = 0x0224A3;
const EXTERNAL_CONSUMER_END = 0x0224D0;

const STATE_MACHINE_RANGE_START = ENTRY_START;
const STATE_MACHINE_RANGE_END = EXIT_END;

const CONTEXT_TABLE_BASE = 0x08C958;
const CONTEXT_TABLE_STRIDE = 3;
const CONTEXT_TABLE_COUNT = 28;
const CONTEXT_HANDLER_SCAN_BYTES = 0x300;

const ADDR_MENU_CURRENT = 0xD00824;
const ADDR_MENU_CURRENT_SUB = 0xD00825;
const ADDR_MENU_SELECTED = 0xD00826;
const ADDR_MENU_NUM_MENUS = 0xD00827;
const ADDR_MENU_NUM_ITEMS = 0xD00828;
const ADDR_PROG_CURRENT = 0xD0082D;
const ADDR_NEWCONTEXT_BUFFER = 0xD0082E;
const ADDR_NEWCONTEXT_BUFFER_END = 0xD00835;
const ADDR_USER_MENU_SA = 0xD00838;
const ADDR_D0058E = 0xD0058E;

const BIT5_PATTERN = [0xFD, 0xCB, 0x11, 0x6E];
const SET5_PATTERN = [0xFD, 0xCB, 0x11, 0xEE];
const RES5_PATTERN = [0xFD, 0xCB, 0x11, 0xAE];

const SHORT_PREFIXES = new Set(['sis', 'lis']);

const NAMED_ADDRS = new Map([
  [ADDR_MENU_CURRENT, 'menuCurrent'],
  [ADDR_MENU_CURRENT_SUB, 'menuCurrentSub'],
  [ADDR_MENU_SELECTED, 'menuSelected'],
  [ADDR_MENU_NUM_MENUS, 'menuNumMenus'],
  [ADDR_MENU_NUM_ITEMS, 'menuNumItems'],
  [ADDR_PROG_CURRENT, 'progCurrent'],
  [ADDR_NEWCONTEXT_BUFFER, 'D0082E buffer'],
  [ADDR_USER_MENU_SA, 'userMenuSA'],
  [ADDR_D0058E, 'D0058E cooked/event byte'],
]);

const FLAG_SITE_NOTES = new Map([
  [0x084D57, 'RES 5 before zeroing menu scratch and re-running 0x087774.'],
  [0x084F09, 'RES 5 immediately after writing menuNumItems/menuSelected.'],
  [0x084F2F, 'SET 5 on the menuCurrent==0x02 path before 0x0868C0 synthetic setup.'],
  [0x084F73, 'SET 5 on the alternate path after 0x086779/RET C gate before 0x0868C0.'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function read24LE(offset) {
  return (
    (rom[offset] ?? 0) |
    ((rom[offset + 1] ?? 0) << 8) |
    ((rom[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function effectiveAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (SHORT_PREFIXES.has(inst.modePrefix)) {
    return (((0xD0 << 16) | (inst.addr & 0xFFFF)) >>> 0) & 0xFFFFFF;
  }
  return (inst.addr >>> 0) & 0xFFFFFF;
}

function safeDecode(pc) {
  try {
    const inst = decode(rom, pc);
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {
    // Fall through.
  }

  return {
    pc,
    length: 1,
    tag: 'db',
    value: rom[pc] ?? 0,
    modePrefix: null,
  };
}

function formatInstruction(inst) {
  if (!inst) {
    return 'db ?';
  }

  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'nop');
    case 'ret': return withPrefix(inst, 'ret');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withPrefix(inst, `ld (${hex(effectiveAddress(inst))}), ${inst.pair}`)
        : withPrefix(inst, `ld ${inst.pair}, (${hex(effectiveAddress(inst))})`);
    case 'ld-mem-pair': return withPrefix(inst, `ld (${hex(effectiveAddress(inst))}), ${inst.pair}`);
    case 'ld-reg-mem': return withPrefix(inst, `ld ${inst.dest}, (${hex(effectiveAddress(inst))})`);
    case 'ld-mem-reg': return withPrefix(inst, `ld (${hex(effectiveAddress(inst))}), ${inst.src}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind': return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg': return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-ind-imm': return withPrefix(inst, `ld (hl), ${hexByte(inst.value)}`);
    case 'ld-reg-ixd': return withPrefix(inst, `ld ${inst.dest}, (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'ld-ixd-reg': return withPrefix(inst, `ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${inst.src}`);
    case 'ld-ixd-imm': return withPrefix(inst, `ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${hexByte(inst.value)}`);
    case 'inc-pair': return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair': return withPrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'add-pair': return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'adc-pair': return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'sbc-pair': return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'alu-imm': return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-ixd': return withPrefix(inst, `${inst.op} (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'bit-test': return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind': return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set': return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind': return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res': return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind': return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'indexed-cb-bit': return withPrefix(inst, `bit ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'indexed-cb-set': return withPrefix(inst, `set ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'indexed-cb-res': return withPrefix(inst, `res ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'rotate-reg': return withPrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rotate-ind': return withPrefix(inst, `${inst.op} (${inst.indirectRegister})`);
    case 'indexed-cb-rotate': return withPrefix(inst, `${inst.operation ?? inst.op ?? 'rotate'} (${inst.indexRegister}${signedDisp(inst.displacement)})`);
    case 'ldi': return withPrefix(inst, 'ldi');
    case 'ldir': return withPrefix(inst, 'ldir');
    case 'ldd': return withPrefix(inst, 'ldd');
    case 'lddr': return withPrefix(inst, 'lddr');
    case 'sub': return withPrefix(inst, 'sub');
    case 'ex-de-hl': return withPrefix(inst, 'ex de, hl');
    case 'db': return withPrefix(inst, `db ${hexByte(inst.value)}`);
    default: return withPrefix(inst, inst.tag ?? 'unknown');
  }
}

function disassembleRange(start, endInclusive) {
  const rows = [];
  let pc = start;

  while (pc <= endInclusive && pc < rom.length) {
    const inst = safeDecode(pc);
    const length = Math.max(1, inst.length ?? 1);
    rows.push({
      pc,
      inst,
      length,
      bytes: bytesToHex(rom.subarray(pc, Math.min(rom.length, pc + length))),
      text: formatInstruction(inst),
    });
    pc += length;
  }

  return rows;
}

function printSection(title) {
  console.log('');
  console.log('='.repeat(80));
  console.log(title);
  console.log('='.repeat(80));
}

function printDisassembly(title, start, endInclusive) {
  printSection(title);
  for (const row of disassembleRange(start, endInclusive)) {
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(18)} ${row.text}`);
  }
}

function scanPattern(pattern) {
  const hits = [];
  for (let offset = 0; offset <= rom.length - pattern.length; offset += 1) {
    let matches = true;
    for (let index = 0; index < pattern.length; index += 1) {
      if (rom[offset + index] !== pattern[index]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      hits.push(offset);
    }
  }
  return hits;
}

function findIncLine(regex) {
  const match = incText.match(regex);
  return match ? match[0].trim() : null;
}

function labelAddress(address) {
  return NAMED_ADDRS.get(address) ?? hex(address);
}

function scanContextTable() {
  const entries = [];
  for (let index = 0; index < CONTEXT_TABLE_COUNT; index += 1) {
    const offset = CONTEXT_TABLE_BASE + index * CONTEXT_TABLE_STRIDE;
    entries.push({
      index,
      addr: read24LE(offset),
    });
  }
  return entries;
}

function scanContextHandlerEdges(targetStart, targetEnd) {
  const entries = scanContextTable();
  const edges = [];

  for (const entry of entries) {
    const rows = disassembleRange(entry.addr, entry.addr + CONTEXT_HANDLER_SCAN_BYTES - 1);
    for (const row of rows) {
      const tag = row.inst?.tag;
      if (!['call', 'call-conditional', 'jp', 'jp-conditional'].includes(tag)) {
        continue;
      }
      if (!Number.isInteger(row.inst.target)) {
        continue;
      }
      if (row.inst.target < targetStart || row.inst.target > targetEnd) {
        continue;
      }
      edges.push({
        contextIndex: entry.index,
        contextAddr: entry.addr,
        sourcePc: row.pc,
        target: row.inst.target,
        text: row.text,
      });
    }
  }

  return edges;
}

function scanIncomingEdges(targetStart, targetEnd) {
  const edges = [];

  for (let pc = 0; pc < rom.length; pc += 1) {
    const inst = safeDecode(pc);
    const tag = inst?.tag;
    if (!['call', 'call-conditional', 'jp', 'jp-conditional'].includes(tag)) {
      continue;
    }
    if (!Number.isInteger(inst.target)) {
      continue;
    }
    if (inst.target < targetStart || inst.target > targetEnd) {
      continue;
    }
    edges.push({
      sourcePc: pc,
      target: inst.target,
      text: formatInstruction(inst),
    });
  }

  return edges;
}

function printFlagHits(title, hits) {
  printSection(title);
  if (hits.length === 0) {
    console.log('No hits.');
    return;
  }

  for (const hit of hits) {
    const note = FLAG_SITE_NOTES.get(hit);
    console.log(`${hex(hit)}${note ? `  ${note}` : ''}`);
  }
}

function printIncEvidence() {
  printSection('ti84pceg.inc Evidence');
  const lines = [
    findIncLine(/^\?promptFlags\s*:=\s*11h.*$/m),
    findIncLine(/^\?menuCurrent\s*:=\s*0D00824h.*$/m),
    findIncLine(/^\?menuCurrentSub\s*:=\s*0D00825h.*$/m),
    findIncLine(/^\?menuSelected\s*:=\s*0D00826h.*$/m),
    findIncLine(/^\?menuNumItems\s*:=\s*0D00828h.*$/m),
    findIncLine(/^\?progCurrent\s*:=\s*0D0082Dh.*$/m),
    findIncLine(/^;D0082E.*$/m),
    findIncLine(/^\?userMenuSA\s*:=\s*0D00838h.*$/m),
  ].filter(Boolean);

  for (const line of lines) {
    console.log(line);
  }
}

function printContextTable(entries, target) {
  printSection('Context Table Check');
  let match = false;

  for (const entry of entries) {
    const suffix = entry.addr === target ? '  <-- target' : '';
    if (entry.addr === target) {
      match = true;
    }
    console.log(`[${String(entry.index).padStart(2, '0')}] ${hex(entry.addr)}${suffix}`);
  }

  console.log('');
  console.log(`Exact table match for ${hex(target)}: ${match ? 'YES' : 'NO'}`);
}

function buildSummary(entries, setHits, resHits, bitHits, contextEdges, directEntryEdges) {
  const appearsInContextTable = entries.some((entry) => entry.addr === ENTRY_START);
  const helperGates = [
    `${labelAddress(ADDR_MENU_CURRENT)} (${hex(ADDR_MENU_CURRENT)}) == 0x02 via 0x0867BE`,
    `${labelAddress(ADDR_PROG_CURRENT)} (${hex(ADDR_PROG_CURRENT)}) == 0x14`,
    `${hex(ADDR_NEWCONTEXT_BUFFER)}..${hex(ADDR_NEWCONTEXT_BUFFER_END)} are all zero`,
  ];

  return {
    scope: {
      core_range: `${hex(STATE_MACHINE_RANGE_START)}..${hex(STATE_MACHINE_RANGE_END)}`,
      setup_and_flag_toggle_range: `${hex(0x084E98)}..${hex(0x084F73)}`,
      context_bridge: `${hex(CONTEXT_BRIDGE_START)}..${hex(CONTEXT_BRIDGE_END)}`,
      synthetic_outputs: ['0x82', '0x01', '0xFD', '0x77..0x7C'],
      notes: [
        `${hex(ENTRY_START)} is the parent gate that branches straight to ${hex(0x08699B)} when promptFlags bit 5 is set.`,
        `${hex(CONTEXT_BRIDGE_START)} contains the buffer-driven entry that a context-table handler reaches before falling into ${hex(0x08699B)}.`,
      ],
    },
    helper_0x0867CC: {
      purpose: 'buffer-empty / synthetic-0x82 guard',
      gates: helperGates,
      returns: {
        z: 'all helper conditions satisfied; the state buffer is considered empty/ready',
        nz: 'menuCurrent mismatch, progCurrent mismatch, or at least one byte in D0082E..D00835 is non-zero',
      },
      flag_behavior: [
        `0x0867D0 calls 0x0867BE and immediately RET NZ on ${labelAddress(ADDR_MENU_CURRENT)} != 0x02.`,
        `0x0867D6 compares ${labelAddress(ADDR_PROG_CURRENT)} to 0x14 and RET NZ on mismatch.`,
        `0x0867DD..0x0867E1 loops across eight bytes; the final CP flags fall through to RET at 0x0867E4.`,
      ],
    },
    entry_0x085C0B: {
      bit5_set_branch: `BIT 5,(IY+0x11) set -> JP NZ ${hex(0x08699B)} -> synthetic D0058E generation family`,
      bit5_clear_branch: `BIT 5 clear -> fall through to CP 0x05 at ${hex(0x085C13)} and continue normal menu-selection handling`,
      primary_dispatch_driver: 'incoming A register; the first compare is CP 0x05 and the set-bit branch re-checks CP 0x05 at 0x08699B',
      secondary_state_inputs: [
        `${labelAddress(ADDR_MENU_CURRENT)} (${hex(ADDR_MENU_CURRENT)})`,
        `${labelAddress(ADDR_MENU_CURRENT_SUB)} (${hex(ADDR_MENU_CURRENT_SUB)})`,
        `${labelAddress(ADDR_MENU_SELECTED)} (${hex(ADDR_MENU_SELECTED)})`,
        `${labelAddress(ADDR_MENU_NUM_ITEMS)} (${hex(ADDR_MENU_NUM_ITEMS)})`,
        `${labelAddress(ADDR_PROG_CURRENT)} (${hex(ADDR_PROG_CURRENT)})`,
        `${labelAddress(ADDR_D0058E)}`,
      ],
    },
    bit5_iy11: {
      address: hex(PROMPT_FLAGS_ADDR),
      flag_group: 'promptFlags (offset 0x11 in ti84pceg.inc)',
      set_sites: setHits.map((hit) => hex(hit)),
      clear_sites: resHits.map((hit) => hex(hit)),
      test_sites: bitHits.map((hit) => hex(hit)),
      best_fit: 'undocumented prompt/menu special-input mode flag',
      interpretation: 'This bit is closer to a buffered/special menu-input submode than a generic top-level "menu active" flag.',
      evidence: [
        `The set/clear sites all live in ${hex(0x084E98)}..${hex(0x084F73)}, the same builder that writes menuCurrent/menuSelected/menuNumItems.`,
        `${hex(EXTERNAL_CONSUMER_START + 0x0A)} checks the bit and, when set, uses ${hex(ADDR_NEWCONTEXT_BUFFER)} directly instead of menuCurrent/menuNumItems.`,
        `${hex(ENTRY_START)} and ${hex(0x0868E2)}/${hex(0x0868F1)}/${hex(0x086914)}/${hex(0x086923)} gate the synthetic D0058E state machine on this bit.`,
      ],
    },
    relationship_to_coormon: {
      appears_in_context_table: appearsInContextTable,
      direct_entry_edges_to_0x085C0B: directEntryEdges.map((edge) => `${hex(edge.sourcePc)} -> ${edge.text}`),
      context_table_edges_into_family: contextEdges.map(
        (edge) => `context[${edge.contextIndex}] ${hex(edge.contextAddr)} : ${hex(edge.sourcePc)} -> ${edge.text}`,
      ),
      best_fit: appearsInContextTable
        ? 'direct CoorMon-dispatched context handler'
        : 'not a top-level CoorMon table handler; reached from a CoorMon-dispatched context handler',
      path_note: contextEdges.length > 0
        ? `Observed path: CoorMon -> context[${contextEdges[0].contextIndex}] ${hex(contextEdges[0].contextAddr)} -> ${hex(contextEdges[0].target)} bridge -> ${hex(0x08699B)} synthetic branch family`
        : 'No context-table edge into the family was found in the scanned handler windows.',
    },
  };
}

function main() {
  const setHits = scanPattern(SET5_PATTERN);
  const resHits = scanPattern(RES5_PATTERN);
  const bitHits = scanPattern(BIT5_PATTERN);
  const contextEntries = scanContextTable();
  const contextEdges = scanContextHandlerEdges(STATE_MACHINE_RANGE_START, STATE_MACHINE_RANGE_END);
  const directEntryEdges = scanIncomingEdges(ENTRY_START, ENTRY_START);
  const summary = buildSummary(contextEntries, setHits, resHits, bitHits, contextEdges, directEntryEdges);

  console.log('Phase 347: 0x085C/0x0867CC menu-state-machine probe');
  console.log(`ROM: ${ROM_PATH.pathname}`);
  console.log(`IY base: ${hex(IY_BASE)}  IY+0x11: ${hex(PROMPT_FLAGS_ADDR)}`);

  printIncEvidence();
  printDisassembly('External Consumer: 0x0224A3..0x0224D0', EXTERNAL_CONSUMER_START, EXTERNAL_CONSUMER_END);
  printDisassembly('Parent Entry + First Dispatch: 0x085C0B..0x085CA0', ENTRY_START, ENTRY_END);
  printDisassembly('Helper Function: 0x0867CC..0x086820', HELPER_START, HELPER_END);
  printDisassembly('Context Bridge: 0x08696D..0x0869A8', CONTEXT_BRIDGE_START, CONTEXT_BRIDGE_END);
  printDisassembly('Synthetic Generator Window: 0x0869A9..0x086A20', SYNTH_START, SYNTH_END);
  printDisassembly('Mid/Exit Bridge: 0x086A73..0x086B80', EXIT_BRIDGE_START, EXIT_END);

  printFlagHits('SET 5,(IY+0x11) Hits', setHits);
  printFlagHits('RES 5,(IY+0x11) Hits', resHits);
  printFlagHits('BIT 5,(IY+0x11) Test Sites', bitHits);

  printContextTable(contextEntries, ENTRY_START);

  printSection('Context Handler Edges Into 0x085C..0x086B');
  if (contextEdges.length === 0) {
    console.log('No scanned context handler jumps or calls into the family.');
  } else {
    for (const edge of contextEdges) {
      console.log(
        `context[${String(edge.contextIndex).padStart(2, '0')}] ${hex(edge.contextAddr)}  ${hex(edge.sourcePc)} -> ${edge.text}`,
      );
    }
  }

  printSection('Direct CALL/JP To 0x085C0B');
  if (directEntryEdges.length === 0) {
    console.log('No direct CALL/JP edges to 0x085C0B were found in the ROM.');
  } else {
    for (const edge of directEntryEdges) {
      console.log(`${hex(edge.sourcePc)} -> ${edge.text}`);
    }
  }

  printSection('Structured Summary');
  console.log(JSON.stringify(summary, null, 2));
}

main();
