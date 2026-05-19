#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MODE = 'adl';
const PRIMARY_WINDOW_BYTES = 64;
const FOLLOW_UP_WINDOW_BYTES = 32;

const PRIMARY_HANDLERS = [
  { label: '0x003A7D target: cursor/timer handler', addr: 0x001713 },
  { label: '0x003A81 target: post-cursor dispatch', addr: 0x001933 },
  { label: '0x003A89 target: secondary handler', addr: 0x001853 },
  { label: '0x003A8E target: loop re-entry / tail', addr: 0x000721 },
];

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const primaryLabelByAddr = new Map(PRIMARY_HANDLERS.map((entry) => [entry.addr, entry.label]));

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexWord(value) {
  return ((value ?? 0) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, start + length),
    (value) => hexByte(value),
  ).join(' ');
}

function formatDisp(value) {
  return value >= 0
    ? `+0x${value.toString(16).toUpperCase()}`
    : `-0x${(-value).toString(16).toUpperCase()}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function usesShortAddressing(inst) {
  return inst?.modePrefix === 'sis' || inst?.modePrefix === 'lis';
}

function formatDirectAddress(addr, shortAddress) {
  return shortAddress ? `0x${hexWord(addr)} [short/MBASE]` : hex(addr);
}

function classifyAddressRange(addr) {
  const value = addr >>> 0;
  if (value >= 0xD40000 && value < 0xD80000) return 'LCD/VRAM range';
  if (value >= 0xF20000 && value < 0xF30000) return 'timer MMIO range';
  if (value >= 0x00A000 && value < 0x00B000) return 'low 0xA000 range';
  return null;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'nop': return withPrefix(inst, 'nop');
    case 'ex-af': return withPrefix(inst, 'ex af, af\'');
    case 'exx': return withPrefix(inst, 'exx');
    case 'ex-de-hl': return withPrefix(inst, 'ex de, hl');
    case 'ex-sp-hl': return withPrefix(inst, 'ex (sp), hl');
    case 'rlca': return withPrefix(inst, 'rlca');
    case 'rrca': return withPrefix(inst, 'rrca');
    case 'rla': return withPrefix(inst, 'rla');
    case 'rra': return withPrefix(inst, 'rra');
    case 'daa': return withPrefix(inst, 'daa');
    case 'cpl': return withPrefix(inst, 'cpl');
    case 'scf': return withPrefix(inst, 'scf');
    case 'ccf': return withPrefix(inst, 'ccf');
    case 'halt': return withPrefix(inst, 'halt');
    case 'di': return withPrefix(inst, 'di');
    case 'ei': return withPrefix(inst, 'ei');
    case 'neg': return withPrefix(inst, 'neg');
    case 'reti': return withPrefix(inst, 'reti');
    case 'retn': return withPrefix(inst, 'retn');
    case 'ret': return withPrefix(inst, 'ret');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'rst': return withPrefix(inst, `rst 0x${hexByte(inst.target)}`);
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'inc-pair': return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair': return withPrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'inc-ixd': return withPrefix(inst, `inc (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'dec-ixd': return withPrefix(inst, `dec (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'add-pair': return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'adc-pair': return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'sbc-pair': return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'mlt': return withPrefix(inst, `mlt ${inst.reg}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(inst, `ld ${inst.pair}, (${formatDirectAddress(inst.addr, usesShortAddressing(inst))})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `ld (${formatDirectAddress(inst.addr, usesShortAddressing(inst))}), ${inst.pair}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `ld ${inst.pair}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.pair}`);
    case 'ld-pair-ind':
      return withPrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-ind-pair':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, 0x${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind': return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg': return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-ind-imm': return withPrefix(inst, `ld (hl), 0x${hexByte(inst.value)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${inst.dest}, (${formatDirectAddress(inst.addr, usesShortAddressing(inst))})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${formatDirectAddress(inst.addr, usesShortAddressing(inst))}), ${inst.src}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `ld ${inst.dest}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.src}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), 0x${hexByte(inst.value)}`);
    case 'ld-ixiy-indexed':
      return withPrefix(inst, `ld ${inst.dest}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'ld-indexed-ixiy':
      return withPrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.src}`);
    case 'ld-sp-hl': return withPrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair': return withPrefix(inst, `ld sp, ${inst.pair}`);
    case 'ld-special': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-mb-a': return withPrefix(inst, 'ld mb, a');
    case 'ld-a-mb': return withPrefix(inst, 'ld a, mb');
    case 'alu-imm': return withPrefix(inst, `${inst.op} 0x${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-ixd': return withPrefix(inst, `${inst.op} (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'rotate-reg': return withPrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rotate-ind': return withPrefix(inst, `${inst.op} (${inst.indirectRegister})`);
    case 'indexed-cb-rotate':
      return withPrefix(inst, `${inst.operation ?? inst.op ?? 'rotate'} (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'bit-test': return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind': return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res': return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind': return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set': return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind': return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'im': return withPrefix(inst, `im ${inst.value}`);
    case 'out-imm': return withPrefix(inst, `out (0x${hexByte(inst.port)}), a`);
    case 'in-imm': return withPrefix(inst, `in a, (0x${hexByte(inst.port)})`);
    case 'out-reg': return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'in-reg': return withPrefix(inst, `in ${inst.reg}, (c)`);
    case 'out0': return withPrefix(inst, `out0 (0x${hexByte(inst.port)}), ${inst.reg}`);
    case 'in0': return withPrefix(inst, `in0 ${inst.reg}, (0x${hexByte(inst.port)})`);
    case 'tst-reg': return withPrefix(inst, `tst a, ${inst.reg}`);
    case 'tst-ind': return withPrefix(inst, 'tst a, (hl)');
    case 'tst-imm': return withPrefix(inst, `tst a, 0x${hexByte(inst.value)}`);
    case 'tstio': return withPrefix(inst, `tstio 0x${hexByte(inst.value)}`);
    case 'lea': return withPrefix(inst, `lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`);
    case 'pea': return withPrefix(inst, `pea (${inst.base}${formatDisp(inst.displacement)})`);
    case 'ldi': return withPrefix(inst, 'ldi');
    case 'ldd': return withPrefix(inst, 'ldd');
    case 'ldir': return withPrefix(inst, 'ldir');
    case 'lddr': return withPrefix(inst, 'lddr');
    case 'cpi': return withPrefix(inst, 'cpi');
    case 'cpd': return withPrefix(inst, 'cpd');
    case 'cpir': return withPrefix(inst, 'cpir');
    case 'cpdr': return withPrefix(inst, 'cpdr');
    case 'ini': return withPrefix(inst, 'ini');
    case 'ind': return withPrefix(inst, 'ind');
    case 'inir': return withPrefix(inst, 'inir');
    case 'indr': return withPrefix(inst, 'indr');
    case 'outi': return withPrefix(inst, 'outi');
    case 'outd': return withPrefix(inst, 'outd');
    case 'otir': return withPrefix(inst, 'otir');
    case 'otdr': return withPrefix(inst, 'otdr');
    case 'otimr': return withPrefix(inst, 'otimr');
    case 'slp': return withPrefix(inst, 'slp');
    case 'stmix': return withPrefix(inst, 'stmix');
    case 'rsmix': return withPrefix(inst, 'rsmix');
    case 'db': return withPrefix(inst, `db 0x${hexByte(inst.value ?? 0)}`);
    default: {
      const parts = [];
      for (const [key, value] of Object.entries(inst ?? {})) {
        if ([
          'tag',
          'length',
          'pc',
          'nextPc',
          'mode',
          'modePrefix',
          'nextMode',
          'terminates',
          'fallthrough',
          'kind',
          'decodeError',
        ].includes(key)) {
          continue;
        }
        if (value === undefined || value === null) continue;
        if (typeof value === 'number') {
          parts.push(`${key}=${hex(value)}`);
        } else {
          parts.push(`${key}=${value}`);
        }
      }
      return withPrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : (inst?.tag ?? 'unknown'));
    }
  }
}

function decodeAt(pc) {
  try {
    const inst = decodeInstruction(romBytes, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      value: romBytes[pc] ?? 0,
      length: 1,
      pc,
      nextPc: pc + 1,
      mode: MODE,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractTargets(inst) {
  switch (inst?.tag) {
    case 'call':
      return [{ kind: 'call', target: inst.target, followUp: true }];
    case 'call-conditional':
      return [{ kind: `call ${inst.condition}`, target: inst.target, followUp: true }];
    case 'jp':
      return [{ kind: 'jp', target: inst.target, followUp: true }];
    case 'jp-conditional':
      return [{ kind: `jp ${inst.condition}`, target: inst.target, followUp: true }];
    case 'jr':
      return [{ kind: 'jr', target: inst.target, followUp: false }];
    case 'jr-conditional':
      return [{ kind: `jr ${inst.condition}`, target: inst.target, followUp: false }];
    case 'djnz':
      return [{ kind: 'djnz', target: inst.target, followUp: false }];
    default:
      return [];
  }
}

function extractPortAccesses(inst) {
  switch (inst?.tag) {
    case 'in-imm':
      return [{ key: `in:${inst.port}`, text: `in a, (0x${hexByte(inst.port)})` }];
    case 'out-imm':
      return [{ key: `out:${inst.port}`, text: `out (0x${hexByte(inst.port)}), a` }];
    case 'in0':
      return [{ key: `in0:${inst.port}:${inst.reg}`, text: `in0 ${inst.reg}, (0x${hexByte(inst.port)})` }];
    case 'out0':
      return [{ key: `out0:${inst.port}:${inst.reg}`, text: `out0 (0x${hexByte(inst.port)}), ${inst.reg}` }];
    case 'in-reg':
      return [{ key: `in-reg:${inst.reg}`, text: `in ${inst.reg}, (c)` }];
    case 'out-reg':
      return [{ key: `out-reg:${inst.reg}`, text: `out (c), ${inst.reg}` }];
    default:
      return [];
  }
}

function extractDirectMemoryRefs(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return [];
  }

  const shortAddress = usesShortAddressing(inst);
  const addr = inst.addr >>> 0;
  const range = shortAddress ? null : classifyAddressRange(addr);

  let access = 'mem';
  switch (inst.tag) {
    case 'ld-reg-mem':
    case 'ld-pair-mem':
      access = 'read';
      break;
    case 'ld-mem-reg':
    case 'ld-mem-pair':
      access = 'write';
      break;
    default:
      access = 'mem';
      break;
  }

  const label = `${access} ${formatDirectAddress(addr, shortAddress)}${range ? ` [${range}]` : ''}`;
  return [{ key: `${access}:${shortAddress ? 'short:' : ''}${addr}`, addr, shortAddress, access, range, label }];
}

function createEmptyAggregate() {
  return {
    control: [],
    returns: [],
    ports: new Map(),
    memRefs: new Map(),
  };
}

function mergeAggregate(aggregate, section) {
  for (const entry of section.control) {
    aggregate.control.push(entry);
  }
  for (const entry of section.returns) {
    aggregate.returns.push(entry);
  }
  for (const [key, value] of section.ports) {
    if (!aggregate.ports.has(key)) {
      aggregate.ports.set(key, { text: value.text, hits: [] });
    }
    aggregate.ports.get(key).hits.push(...value.hits);
  }
  for (const [key, value] of section.memRefs) {
    if (!aggregate.memRefs.has(key)) {
      aggregate.memRefs.set(key, { label: value.label, hits: [], range: value.range });
    }
    aggregate.memRefs.get(key).hits.push(...value.hits);
  }
}

function printSummary(section) {
  console.log('Summary:');

  if (section.control.length > 0) {
    console.log('  Control-flow targets:');
    for (const entry of section.control) {
      console.log(`    ${hex(entry.pc)}  ${entry.kind} -> ${hex(entry.target)}`);
    }
  } else {
    console.log('  Control-flow targets: none');
  }

  if (section.returns.length > 0) {
    console.log(`  Returns: ${section.returns.map((entry) => hex(entry.pc)).join(', ')}`);
  } else {
    console.log('  Returns: none');
  }

  if (section.ports.size > 0) {
    console.log('  IN/OUT ports:');
    for (const value of section.ports.values()) {
      const pcs = value.hits.map((hit) => hex(hit.pc)).join(', ');
      console.log(`    ${value.text} @ ${pcs}`);
    }
  } else {
    console.log('  IN/OUT ports: none');
  }

  if (section.memRefs.size > 0) {
    console.log('  Direct memory references:');
    for (const value of section.memRefs.values()) {
      const pcs = value.hits.map((hit) => hex(hit.pc)).join(', ');
      console.log(`    ${value.label} @ ${pcs}`);
    }
  } else {
    console.log('  Direct memory references: none');
  }

  const interestingRefs = [...section.memRefs.values()].filter((value) => value.range);
  if (interestingRefs.length > 0) {
    console.log(`  Interesting ranges hit: ${interestingRefs.map((value) => value.range).join(', ')}`);
  } else {
    console.log('  Interesting ranges hit: none of LCD/VRAM, timer MMIO, or low 0xA000 direct references');
  }
}

function disassembleWindow(start, maxBytes, title, followUpTargets) {
  console.log(`=== ${title} ===`);
  console.log(`Start: ${hex(start)}  Bytes: ${maxBytes}  Mode: ${MODE}`);

  const end = Math.min((start + maxBytes) >>> 0, romBytes.length);
  const section = {
    control: [],
    returns: [],
    ports: new Map(),
    memRefs: new Map(),
  };

  let pc = start >>> 0;
  while (pc < end) {
    const inst = decodeAt(pc);
    const length = Math.max(1, Math.min(inst.length, end - pc));
    const bytes = hexBytes(romBytes, pc, length).padEnd(20);
    const text = formatInstruction(inst);
    const notes = [];

    for (const targetInfo of extractTargets(inst)) {
      section.control.push({ pc, ...targetInfo });
      notes.push(`${targetInfo.kind} -> ${hex(targetInfo.target)}`);

      if (
        followUpTargets &&
        targetInfo.followUp &&
        Number.isInteger(targetInfo.target) &&
        targetInfo.target >= 0x000000 &&
        targetInfo.target <= 0x00FFFF
      ) {
        if (!followUpTargets.has(targetInfo.target)) {
          followUpTargets.set(targetInfo.target, []);
        }
        followUpTargets.get(targetInfo.target).push({
          sourceWindow: start,
          sourcePc: pc,
          kind: targetInfo.kind,
        });
      }
    }

    if (inst.tag === 'jp-indirect') {
      notes.push(`jp indirect via ${inst.indirectRegister}`);
    }

    if (['ret', 'ret-conditional', 'reti', 'retn'].includes(inst.tag)) {
      section.returns.push({ pc, text });
      notes.push('return');
    }

    for (const port of extractPortAccesses(inst)) {
      if (!section.ports.has(port.key)) {
        section.ports.set(port.key, { text: port.text, hits: [] });
      }
      section.ports.get(port.key).hits.push({ pc });
      notes.push(`io ${port.text}`);
    }

    for (const memRef of extractDirectMemoryRefs(inst)) {
      if (!section.memRefs.has(memRef.key)) {
        section.memRefs.set(memRef.key, { label: memRef.label, hits: [], range: memRef.range });
      }
      section.memRefs.get(memRef.key).hits.push({ pc });
      notes.push(memRef.label);
    }

    if (inst.decodeError) {
      notes.push(`decode fallback: ${inst.decodeError}`);
    }

    const noteText = notes.length > 0 ? `  ; ${notes.join(' | ')}` : '';
    console.log(`  ${hex(pc)}: ${bytes} ${text}${noteText}`);
    pc += length;
  }

  printSummary(section);
  console.log('');
  return section;
}

function printAggregateSummary(aggregate, followUpTargets) {
  console.log('=== Aggregate Primary Summary ===');

  if (followUpTargets.size > 0) {
    console.log('CALL/JP targets eligible for one-level follow-up:');
    for (const target of [...followUpTargets.keys()].sort((a, b) => a - b)) {
      const sources = followUpTargets.get(target) ?? [];
      const formattedSources = sources.map((source) => {
        const fromLabel = primaryLabelByAddr.get(source.sourceWindow) ?? hex(source.sourceWindow);
        return `${hex(source.sourcePc)} from ${fromLabel} [${source.kind}]`;
      }).join('; ');
      console.log(`  ${hex(target)} <= ${formattedSources}`);
    }
  } else {
    console.log('CALL/JP targets eligible for one-level follow-up: none');
  }

  if (aggregate.ports.size > 0) {
    console.log('All IN/OUT accesses seen in primary windows:');
    for (const value of aggregate.ports.values()) {
      const pcs = value.hits.map((hit) => hex(hit.pc)).join(', ');
      console.log(`  ${value.text} @ ${pcs}`);
    }
  } else {
    console.log('All IN/OUT accesses seen in primary windows: none');
  }

  const interestingRefs = [...aggregate.memRefs.values()].filter((value) => value.range);
  if (interestingRefs.length > 0) {
    console.log('Interesting direct memory ranges seen in primary windows:');
    for (const value of interestingRefs) {
      const pcs = value.hits.map((hit) => hex(hit.pc)).join(', ');
      console.log(`  ${value.label} @ ${pcs}`);
    }
  } else {
    console.log('Interesting direct memory ranges seen in primary windows: none');
  }

  console.log('');
}

console.log('Phase 369: Post-Scan Handler Disassembly');
console.log('========================================');
console.log(`ROM:  ${ROM_PATH}`);
console.log(`Mode: ${MODE}`);
console.log('');

const followUpTargets = new Map();
const aggregate = createEmptyAggregate();

for (const entry of PRIMARY_HANDLERS) {
  const section = disassembleWindow(
    entry.addr,
    PRIMARY_WINDOW_BYTES,
    `${entry.label} @ ${hex(entry.addr)}`,
    followUpTargets,
  );
  mergeAggregate(aggregate, section);
}

printAggregateSummary(aggregate, followUpTargets);

console.log('=== One-Level Follow-Up Disassembly (CALL/JP targets in 0x000000-0x00FFFF) ===');
if (followUpTargets.size === 0) {
  console.log('No eligible CALL/JP targets discovered in the primary windows.');
  console.log('');
} else {
  console.log('');
  for (const target of [...followUpTargets.keys()].sort((a, b) => a - b)) {
    const sources = followUpTargets.get(target) ?? [];
    const sourceLine = sources.map((source) => {
      const fromLabel = primaryLabelByAddr.get(source.sourceWindow) ?? hex(source.sourceWindow);
      return `${hex(source.sourcePc)} from ${fromLabel} [${source.kind}]`;
    }).join('; ');
    const suffix = primaryLabelByAddr.has(target) ? ' (also a primary handler)' : '';
    console.log(`Follow-up target ${hex(target)}${suffix}`);
    console.log(`Sources: ${sourceLine}`);
    console.log('');
    disassembleWindow(target, FOLLOW_UP_WINDOW_BYTES, `Follow-up window @ ${hex(target)}`, null);
  }
}
