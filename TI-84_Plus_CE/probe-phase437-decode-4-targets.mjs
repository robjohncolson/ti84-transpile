#!/usr/bin/env node

/**
 * Phase 437: decode the 4 remaining unidentified OS API jump-table targets.
 *
 * Targets:
 *   0x001768
 *   0x00380D
 *   0x0060FA
 *   0x015151
 *
 * Output:
 *   - stdout
 *   - TI-84_Plus_CE/phase437-4-targets-report.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};

const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');
const REPORT_PATH = path.join(__dirname, 'phase437-4-targets-report.md');

const rom = fs.readFileSync(ROM_PATH);
const includeText = fs.existsSync(INC_PATH) ? fs.readFileSync(INC_PATH, 'utf8') : '';

const TARGETS = [0x001768, 0x00380D, 0x0060FA, 0x015151];

const JT_START = 0x000080;
const JT_END_EXCLUSIVE = 0x000658;
const JT_SLOT_SIZE = 4;
const DISASM_WINDOW_BYTES = 64;
const DISASM_WINDOW_INSTRUCTIONS = 20;
const BODY_ANALYSIS_INSTRUCTIONS = 80;
const BODY_ANALYSIS_MAX_BYTES = 512;
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD4FFFF;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read24LE(buffer, addr) {
  return (
    (buffer[addr] ?? 0)
    | ((buffer[addr + 1] ?? 0) << 8)
    | ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ${text}` : text;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'adc-pair':
      return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'add-pair':
      return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'alu-imm':
      return withPrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg':
      return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'call':
      return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'ccf':
      return withPrefix(inst, 'ccf');
    case 'cpir':
    case 'cpdr':
    case 'cpi':
    case 'cpd':
    case 'ldir':
    case 'lddr':
    case 'ldi':
    case 'ldd':
    case 'rld':
    case 'rrd':
    case 'neg':
    case 'di':
    case 'ei':
    case 'halt':
    case 'nop':
    case 'rla':
    case 'rlca':
    case 'rra':
    case 'rrca':
    case 'scf':
    case 'daa':
    case 'cpl':
    case 'exx':
    case 'retn':
    case 'reti':
    case 'ret':
      return withPrefix(inst, inst.tag);
    case 'djnz':
      return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'ex-af':
      return withPrefix(inst, "ex af, af'");
    case 'ex-de-hl':
      return withPrefix(inst, 'ex de, hl');
    case 'ex-sp-hl':
      return withPrefix(inst, 'ex (sp), hl');
    case 'im':
      return withPrefix(inst, `im ${inst.value}`);
    case 'in-imm':
      return withPrefix(inst, `in a, (${hexByte(inst.port)})`);
    case 'in-reg':
      return withPrefix(inst, `in ${inst.reg}, (c)`);
    case 'in0':
      return withPrefix(inst, `in0 ${inst.reg}, (${hexByte(inst.port)})`);
    case 'inc-pair':
      return withPrefix(inst, `inc ${inst.pair}`);
    case 'inc-reg':
      return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-pair':
      return withPrefix(inst, `dec ${inst.pair}`);
    case 'dec-reg':
      return withPrefix(inst, `dec ${inst.reg}`);
    case 'jp':
      return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr':
      return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-ind-reg':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-ind-imm':
      return withPrefix(inst, `ld (hl), ${hexByte(inst.value)}`);
    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-mem-pair':
      return withPrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(
        inst,
        inst.direction === 'to-mem'
          ? `ld (${hex(inst.addr)}), ${inst.pair}`
          : `ld ${inst.pair}, (${hex(inst.addr)})`,
      );
    case 'ld-pair-indexed':
      return withPrefix(
        inst,
        `ld ${inst.pair}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`,
      );
    case 'ld-indexed-pair':
      return withPrefix(
        inst,
        `ld (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.pair}`,
      );
    case 'ld-reg-imm':
      return withPrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ixd':
      return withPrefix(
        inst,
        `ld ${inst.dest}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`,
      );
    case 'ld-ixd-reg':
      return withPrefix(
        inst,
        `ld (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src}`,
      );
    case 'ld-ixd-imm':
      return withPrefix(
        inst,
        `ld (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${hexByte(inst.value)}`,
      );
    case 'ld-special':
      return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-sp-hl':
      return withPrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair':
      return withPrefix(inst, `ld sp, ${inst.pair}`);
    case 'mlt':
      return withPrefix(inst, `mlt ${inst.reg}`);
    case 'or':
      return withPrefix(inst, 'or');
    case 'out-imm':
      return withPrefix(inst, `out (${hexByte(inst.port)}), a`);
    case 'out-reg':
      return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'out0':
      return withPrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);
    case 'pop':
      return withPrefix(inst, `pop ${inst.pair}`);
    case 'push':
      return withPrefix(inst, `push ${inst.pair}`);
    case 'ret-conditional':
      return withPrefix(inst, `ret ${inst.condition}`);
    case 'rotate-reg':
      return withPrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rotate-ind':
      return withPrefix(inst, `${inst.op} (hl)`);
    case 'rst':
      return withPrefix(inst, `rst ${hex(inst.target, 2)}`);
    case 'sbc-pair':
      return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'bit-test':
      return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind':
      return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res':
      return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind':
      return withPrefix(inst, `res ${inst.bit}, (hl)`);
    case 'bit-set':
      return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind':
      return withPrefix(inst, `set ${inst.bit}, (hl)`);
    case 'indexed-cb-bit':
      return withPrefix(
        inst,
        `bit ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`,
      );
    case 'indexed-cb-res':
      return withPrefix(
        inst,
        `res ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`,
      );
    case 'indexed-cb-set':
      return withPrefix(
        inst,
        `set ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`,
      );
    default: {
      const fields = Object.entries(inst ?? {})
        .filter(([key, value]) => ![
          'pc',
          'length',
          'nextPc',
          'tag',
          'mode',
          'modePrefix',
          'target',
          'fallthrough',
          'terminates',
          'kind',
          'nextMode',
        ].includes(key) && value !== undefined && value !== null)
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : String(value)}`);
      return fields.length > 0 ? withPrefix(inst, `${inst.tag} ${fields.join(', ')}`) : withPrefix(inst, inst?.tag ?? 'db');
    }
  }
}

function decodeSequential(start, opts = {}) {
  const mode = opts.mode ?? 'adl';
  const maxInstructions = opts.maxInstructions ?? DISASM_WINDOW_INSTRUCTIONS;
  const maxBytes = opts.maxBytes ?? DISASM_WINDOW_BYTES;
  const stopOnRet = opts.stopOnRet ?? false;

  const rows = [];
  let pc = start;
  let count = 0;
  const limit = Math.min(start + maxBytes, rom.length);

  while (pc < limit && count < maxInstructions) {
    let inst;
    try {
      inst = decodeInstruction(rom, pc, mode);
    } catch {
      inst = null;
    }

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      rows.push({
        pc,
        length: 1,
        bytes: bytesToHex(rom, pc, 1),
        text: `db ${hexByte(rom[pc] ?? 0)}`,
        inst: null,
      });
      pc += 1;
      count += 1;
      continue;
    }

    rows.push({
      pc,
      length: inst.length,
      bytes: bytesToHex(rom, pc, inst.length),
      text: formatInstruction(inst),
      inst,
    });
    pc += inst.length;
    count += 1;

    if (stopOnRet && ['ret', 'reti', 'retn'].includes(inst.tag)) {
      break;
    }
  }

  return rows;
}

function hexDump(start, length = DISASM_WINDOW_BYTES) {
  const lines = [];
  for (let offset = 0; offset < length; offset += 16) {
    const addr = start + offset;
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16 && offset + i < length && addr + i < rom.length; i++) {
      const byte = rom[addr + i];
      bytes.push(byte.toString(16).toUpperCase().padStart(2, '0'));
      ascii.push(byte >= 0x20 && byte < 0x7F ? String.fromCharCode(byte) : '.');
    }
    lines.push(`${hex(addr)}  ${bytes.join(' ').padEnd(47)}  ${ascii.join('')}`);
  }
  return lines;
}

function findThunk(target) {
  for (let thunk = JT_START; thunk < JT_END_EXCLUSIVE; thunk += JT_SLOT_SIZE) {
    if (rom[thunk] !== 0xC3) continue;
    if (read24LE(rom, thunk + 1) === target) {
      return {
        thunk,
        slot: (thunk - JT_START) / JT_SLOT_SIZE,
      };
    }
  }
  return null;
}

function findDirectCallers(target) {
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;
  const callers = [];

  for (let pc = 0; pc < rom.length - 3; pc++) {
    const op = rom[pc];
    if ((op === 0xCD || op === 0xC3) && rom[pc + 1] === b0 && rom[pc + 2] === b1 && rom[pc + 3] === b2) {
      callers.push({
        pc,
        type: op === 0xCD ? 'CALL' : 'JP',
      });
    }
  }

  return callers;
}

function findFirstRet(target) {
  const rows = decodeSequential(target, {
    maxInstructions: BODY_ANALYSIS_INSTRUCTIONS,
    maxBytes: BODY_ANALYSIS_MAX_BYTES,
    stopOnRet: false,
  });

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const tag = row.inst?.tag;
    if (tag === 'ret' || tag === 'reti' || tag === 'retn') {
      return {
        pc: row.pc,
        type: row.text,
        size: row.pc + row.length - target,
        bodyRows: rows.slice(0, index + 1),
        rows,
      };
    }
  }

  return {
    pc: null,
    type: 'not found',
    size: null,
    bodyRows: rows,
    rows,
  };
}

function extractRamRefs(rows) {
  const refs = new Map();

  function add(addr, pc, kind) {
    if (!Number.isInteger(addr) || addr < RAM_MIN || addr > RAM_MAX) return;
    const key = addr >>> 0;
    if (!refs.has(key)) refs.set(key, { addr: key, hits: [] });
    refs.get(key).hits.push({ pc, kind });
  }

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    if (Number.isInteger(inst.addr)) add(inst.addr, row.pc, inst.tag);

    if (
      Number.isInteger(inst.value)
      && inst.value >= RAM_MIN
      && inst.value <= RAM_MAX
      && [
        'ld-pair-imm',
        'ld-reg-mem',
        'ld-mem-reg',
        'ld-pair-mem',
        'ld-mem-pair',
      ].includes(inst.tag)
    ) {
      add(inst.value, row.pc, `${inst.tag}:imm`);
    }
  }

  return [...refs.values()].sort((a, b) => a.addr - b.addr);
}

function extractPortIo(rows) {
  const hits = [];
  let currentBcImm = null;
  let currentBcPc = null;

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) continue;

    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      currentBcImm = inst.value;
      currentBcPc = row.pc;
      continue;
    }

    if (inst.tag === 'ld-pair-mem' && inst.pair === 'bc') {
      currentBcImm = null;
      currentBcPc = null;
    }

    if (inst.tag === 'out-reg' || inst.tag === 'in-reg') {
      hits.push({
        pc: row.pc,
        text: row.text,
        bcImm: currentBcImm,
        bcPc: currentBcPc,
      });
      continue;
    }

    if (inst.tag === 'out0' || inst.tag === 'in0' || inst.tag === 'out-imm' || inst.tag === 'in-imm') {
      hits.push({
        pc: row.pc,
        text: row.text,
        bcImm: null,
        bcPc: null,
      });
    }
  }

  return hits;
}

function parseBootCallMap(text) {
  const map = new Map();
  const sectionStart = text.indexOf('; Boot Calls');
  if (sectionStart === -1) return map;
  const sectionEnd = text.indexOf(';RAM Equates', sectionStart);
  const section = sectionEnd === -1 ? text.slice(sectionStart) : text.slice(sectionStart, sectionEnd);
  const re = /^\?([A-Za-z0-9_.]+)\s*:=\s*0([0-9A-Fa-f]+)h/gm;
  let match;

  while ((match = re.exec(section)) !== null) {
    map.set(parseInt(match[2], 16), match[1]);
  }
  return map;
}

const bootCallMap = parseBootCallMap(includeText);

function classifyTarget(target, info) {
  switch (target) {
    case 0x001768:
      return {
        proposedName: 'boot.GetBootVerMajor',
        classification: 'boot/helper stub',
        confidence: 'medium',
        purpose: 'returns the leading boot-version byte in A; the only internal caller also consumes B as a second packed version byte',
        rationale: [
          'slot 0x000080 is the only unnamed boot-call immediately adjacent to boot.GetBootVerMinor (0x00008C) and boot.GetBootVerBuild (0x000090)',
          'the only non-thunk caller at 0x00AF9A chains 0x001768 -> 0x00176D -> 0x001770 to materialize a version tuple',
          'the body is a 5-byte constant-return stub: A=0x05, B=0x06, RET',
          'alternate reading: this may be a packed boot-version-word getter rather than a pure “major only” getter',
        ],
      };
    case 0x00380D:
      return {
        proposedName: '_ultof',
        classification: 'C runtime helper',
        confidence: 'high',
        purpose: 'unsigned long/integer to float wrapper that seeds sign/exponent and tail-calls the shared float packer',
        rationale: [
          'body is PUSH DE; LD D,0x00; LD E,0x96; CALL 0x0034EE; POP DE; RET',
          '0x0034EE sits inside the soft-float packing family, so this is the standard unsigned-to-float adapter',
          'the thunk at 0x000280 sits in the float helper bank beside _ltof / sqrtf-class entries',
        ],
      };
    case 0x0060FA: {
      const firstCaller = info.callers.find((caller) => caller.type === 'CALL');
      const lastCaller = [...info.callers].reverse().find((caller) => caller.type === 'CALL');
      return {
        proposedName: 'lcd.SendDataByte',
        classification: 'hardware function',
        confidence: 'high',
        purpose: 'LCD serial/data writer; this entry is the SCF/data-mode half of the 0x0060F7/0x0060FA command/data pair',
        rationale: [
          'starts with SCF, then SIS LD BC,0xD018 and three RLA/OUT (C),A bursts followed by a poll loop',
          `has ${info.callers.length} direct CALL/JP hits, overwhelmingly from the LCD init block${firstCaller && lastCaller ? ` (${hex(firstCaller.pc)}..${hex(lastCaller.pc)})` : ''}`,
          'matches the previously decoded low-level LCD command/data write primitive shape',
        ],
      };
    }
    case 0x015151:
      return {
        proposedName: 'protocol.CommitPendingChannel3Value',
        classification: 'OS protocol/state helper',
        confidence: 'medium',
        purpose: 'if a pending channel-3 value exists in D176CE, copy it into the active staging slot D176CB and clear the pending slot',
        rationale: [
          'body is: LD HL,(D176CE); null-check via 0x0021C2; if nonzero copy D176CE -> D176CB; clear D176CE; RET',
          'all non-thunk callers clear D176C9 just before calling it, matching the channel-3 reset / teardown family',
          'the routine is too stateful and RAM-specific to be a generic CRT helper; it fits the surrounding protocol-notification machinery',
        ],
      };
    default:
      return {
        proposedName: 'unidentified',
        classification: 'unknown',
        confidence: 'low',
        purpose: 'unknown',
        rationale: [],
      };
  }
}

function formatCallerList(callers) {
  if (callers.length === 0) return ['(none)'];
  return callers.map((caller) => `- ${caller.type} ${hex(caller.pc)}`);
}

function formatRamRefs(ramRefs) {
  if (ramRefs.length === 0) return ['(none)'];
  return ramRefs.map((ref) => {
    const pcs = [...new Set(ref.hits.map((hit) => hex(hit.pc)))].join(', ');
    const kinds = [...new Set(ref.hits.map((hit) => hit.kind))].join(', ');
    return `- ${hex(ref.addr)} via ${kinds} at ${pcs}`;
  });
}

function formatPortRefs(portRefs) {
  if (portRefs.length === 0) return ['(none)'];
  return portRefs.map((ref) => {
    if (Number.isInteger(ref.bcImm)) {
      const cPort = ref.bcImm & 0xFF;
      const bcWidth = ref.bcImm > 0xFFFF ? 6 : 4;
      return `- ${hex(ref.pc)} ${ref.text} (preceded by BC=${hex(ref.bcImm, bcWidth)} at ${hex(ref.bcPc)}; C-port ${hexByte(cPort)})`;
    }
    return `- ${hex(ref.pc)} ${ref.text}`;
  });
}

function buildTargetInfo(target) {
  const thunk = findThunk(target);
  const callers = findDirectCallers(target);
  const retInfo = findFirstRet(target);
  const fullRows = retInfo.bodyRows;
  const previewRows = decodeSequential(target, {
    maxInstructions: DISASM_WINDOW_INSTRUCTIONS,
    maxBytes: DISASM_WINDOW_BYTES,
    stopOnRet: false,
  });
  const ramRefs = extractRamRefs(fullRows);
  const portRefs = extractPortIo(fullRows);
  const classification = classifyTarget(target, {
    thunk,
    callers,
    fullRows,
    previewRows,
    ramRefs,
    portRefs,
    retInfo,
  });

  return {
    target,
    thunk,
    callers,
    retInfo,
    previewRows,
    fullRows,
    ramRefs,
    portRefs,
    classification,
    nearbyBootNames: thunk
      ? [
          bootCallMap.get(0x000084),
          bootCallMap.get(0x00008C),
          bootCallMap.get(0x000090),
          bootCallMap.get(0x000394),
        ].filter(Boolean)
      : [],
  };
}

function renderReport(targetInfos) {
  const lines = [];
  lines.push('# Phase 437: Decode 4 Remaining OS API Targets');
  lines.push('');
  lines.push(`Generated by \`probe-phase437-decode-4-targets.mjs\` on ${new Date().toISOString()}.`);
  lines.push('');
  lines.push(`ROM: \`${path.basename(ROM_PATH)}\` (${rom.length.toLocaleString()} bytes, ${hex(rom.length)})`);
  lines.push('');

  for (const info of targetInfos) {
    lines.push(`## ${hex(info.target)}`);
    lines.push('');
    lines.push(`- Proposed name: \`${info.classification.proposedName}\``);
    lines.push(`- Classification: ${info.classification.classification}`);
    lines.push(`- Confidence: **${info.classification.confidence}**`);
    lines.push(`- Purpose: ${info.classification.purpose}`);
    if (info.thunk) {
      lines.push(`- Jump-table thunk: ${hex(info.thunk.thunk)} (slot ${info.thunk.slot})`);
    }
    lines.push(`- First RET: ${info.retInfo.pc === null ? 'not found' : `${hex(info.retInfo.pc)} (${info.retInfo.retType ?? info.retInfo.type})`}`);
    lines.push(`- Estimated function size: ${info.retInfo.size === null ? 'n/a' : `${info.retInfo.size} bytes (${hex(info.retInfo.size, 2)})`}`);
    lines.push(`- Direct CALL/JP references: ${info.callers.length}`);
    lines.push('');
    lines.push('### Hex Dump');
    lines.push('');
    lines.push('```text');
    for (const line of hexDump(info.target, DISASM_WINDOW_BYTES)) {
      lines.push(line);
    }
    lines.push('```');
    lines.push('');
    lines.push(`### Disassembly (${DISASM_WINDOW_INSTRUCTIONS} instructions, sequential)`);
    lines.push('');
    lines.push('```text');
    for (const row of info.previewRows) {
      lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
    }
    lines.push('```');
    lines.push('');
    lines.push('### Callers');
    lines.push('');
    lines.push(...formatCallerList(info.callers));
    lines.push('');
    lines.push('### RAM References');
    lines.push('');
    lines.push(...formatRamRefs(info.ramRefs));
    lines.push('');
    lines.push('### Port I/O');
    lines.push('');
    lines.push(...formatPortRefs(info.portRefs));
    lines.push('');
    lines.push('### Rationale');
    lines.push('');
    for (const item of info.classification.rationale) {
      lines.push(`- ${item}`);
    }
    if (info.target === 0x001768 && info.nearbyBootNames.length > 0) {
      lines.push(`- Nearby named boot calls in \`ti84pceg.inc\`: ${info.nearbyBootNames.map((name) => `\`${name}\``).join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## Summary');
  lines.push('');
  lines.push('| Target | Proposed Name | Classification | Confidence |');
  lines.push('| --- | --- | --- | --- |');
  for (const info of targetInfos) {
    lines.push(
      `| ${hex(info.target)} | \`${info.classification.proposedName}\` | ${info.classification.classification} | ${info.classification.confidence} |`,
    );
  }
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function main() {
  const targetInfos = TARGETS.map(buildTargetInfo);
  const report = renderReport(targetInfos);
  fs.writeFileSync(REPORT_PATH, report);
  process.stdout.write(report);
}

main();
