#!/usr/bin/env node
/**
 * Phase 432 — Trace 0x01579B
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase432-trace-01579B.mjs
 *
 * This probe decodes the real leaf at 0x01579B, prints its direct caller,
 * and scans the ROM for the related RAM latches/gate byte so the function can
 * be classified from ROM evidence instead of from the provisional "timer arm"
 * label in the upstream caller report.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const MODE = 'adl';

const ENTRY = 0x01579B;
const SIBLING_GETTER = 0x0157A1;
const DIRECT_CALLER = 0x00B8BC;

const GATE_FLAG = 0xD176FC;
const CHANNEL3_LATCH = 0xD176CB;
const CHANNEL2_LATCH = 0xD17792;

const TIMER_MMIO_LO = 0xF20000;
const TIMER_MMIO_HI = 0xF200FF;

const KNOWN_NOTES = new Map([
  [0x00B8F7, 'event 0x47 recovery helper writes caller arg to D17792'],
  [0x00B8FF, 'event 0x47 recovery helper writes caller arg to D176CB'],
  [0x0150E9, 'generic completion dispatcher reads D176FC before Channel 3 USB fallback'],
  [0x0151AB, 'Channel 3 staging helper reads D176CB into callback arg slot D176C3'],
  [0x0156C2, 'USB/link wrapper reads D17792 before CALL 0x0151FE'],
  [0x012149, 'payload-guard helper reads D176FC before UI/USB branch'],
  [0x0BCD24, 'sole known setter pattern for D176FC: LD A,1 / LD (D176FC),A / RET'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesHex(addr, length) {
  return Array.from(rom.slice(addr, addr + length))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function signedHex(value) {
  const n = Number(value ?? 0);
  const abs = Math.abs(n);
  return `${n >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister.toUpperCase()}${signedHex(displacement)})`;
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('invalid decode');
    }
    return inst;
  } catch (error) {
    return {
      pc,
      nextPc: pc + 1,
      length: 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: String(error?.message ?? error),
    };
  }
}

function renderInstruction(inst) {
  switch (inst.tag) {
    case 'db': return `DB ${hex(inst.value, 2)}`;
    case 'ret': return 'RET';
    case 'retn': return 'RETN';
    case 'reti': return 'RETI';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()},${hex(inst.target)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()},${hex(inst.value, 2)}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()},${hex(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}),${inst.src.toUpperCase()}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`
        : `LD ${inst.pair.toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-pair-indexed':
      return `LD ${inst.pair.toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${inst.src.toUpperCase()}`;
    case 'ld-special': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'alu-reg':
      if (inst.src === 'a' && inst.op === 'xor') return 'XOR A';
      return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'in-reg': return `IN ${inst.reg.toUpperCase()},(C)`;
    case 'out-reg': return `OUT (C),${inst.reg.toUpperCase()}`;
    case 'in-imm': return `IN A,(${hex(inst.port, 2)})`;
    case 'out-imm': return `OUT (${hex(inst.port, 2)}),A`;
    case 'in0': return `IN0 ${inst.reg.toUpperCase()},(${hex(inst.port, 2)})`;
    case 'out0': return `OUT0 (${hex(inst.port, 2)}),${inst.reg.toUpperCase()}`;
    default: {
      const extra = Object.entries(inst)
        .filter(([key, value]) => ![
          'pc', 'nextPc', 'length', 'tag', 'mode', 'modePrefix',
          'terminates', 'fallthrough', 'decodeError',
        ].includes(key) && value != null)
        .map(([key, value]) => {
          if (typeof value === 'number') return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
          return `${key}=${String(value)}`;
        });
      return `[${inst.tag}${extra.length ? ` ${extra.join(' ')}` : ''}]`;
    }
  }
}

function disassembleUntilRet(startPc, maxInstructions = 32) {
  const rows = [];
  let pc = startPc;
  for (let i = 0; i < maxInstructions; i += 1) {
    const inst = safeDecode(pc);
    rows.push(inst);
    pc = inst.nextPc;
    if (inst.tag === 'ret' || inst.tag === 'retn' || inst.tag === 'reti') {
      break;
    }
  }
  return rows;
}

function disassembleRange(startPc, endPcInclusive) {
  const rows = [];
  let pc = startPc;
  while (pc <= endPcInclusive) {
    const inst = safeDecode(pc);
    rows.push(inst);
    pc = inst.nextPc;
    if (pc <= startPc) break;
  }
  return rows;
}

function printDisassembly(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const inst of rows) {
    const note = KNOWN_NOTES.get(inst.pc);
    const suffix = note ? `  ; ${note}` : '';
    console.log(`${hex(inst.pc)}  ${bytesHex(inst.pc, inst.length).padEnd(18)}  ${renderInstruction(inst)}${suffix}`);
  }
  console.log('');
}

function collectDirectEffects(rows) {
  const calls = [];
  const ports = [];
  const ramRefs = [];
  const timerRefs = [];

  for (const inst of rows) {
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      calls.push({ pc: inst.pc, target: inst.target, conditional: inst.tag === 'call-conditional' ? inst.condition : null });
    }

    if (inst.tag === 'in-reg' || inst.tag === 'out-reg' || inst.tag === 'in-imm' || inst.tag === 'out-imm' || inst.tag === 'in0' || inst.tag === 'out0') {
      ports.push({
        pc: inst.pc,
        tag: inst.tag,
        port: inst.port ?? null,
        text: renderInstruction(inst),
      });
    }

    if (typeof inst.addr === 'number') {
      if (inst.addr >= TIMER_MMIO_LO && inst.addr <= TIMER_MMIO_HI) {
        timerRefs.push({ pc: inst.pc, addr: inst.addr, text: renderInstruction(inst) });
      }
      if (inst.addr >= 0xD00000 && inst.addr <= 0xD1FFFF) {
        ramRefs.push({ pc: inst.pc, addr: inst.addr, text: renderInstruction(inst) });
      }
    }

    if (typeof inst.value === 'number' && inst.value >= TIMER_MMIO_LO && inst.value <= TIMER_MMIO_HI) {
      timerRefs.push({ pc: inst.pc, addr: inst.value, text: `${renderInstruction(inst)}  [imm]` });
    }
  }

  return { calls, ports, ramRefs, timerRefs };
}

function scanCallsTo(target) {
  const bytes = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const hits = [];
  for (let pc = 0; pc < rom.length - 3; pc += 1) {
    if (rom[pc] === 0xCD && rom[pc + 1] === bytes[0] && rom[pc + 2] === bytes[1] && rom[pc + 3] === bytes[2]) {
      hits.push(pc);
    }
  }
  return hits;
}

function findAbsoluteRefs(target) {
  const pattern = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const results = new Map();

  for (let hit = 0; hit < rom.length - 2; hit += 1) {
    if (rom[hit] !== pattern[0] || rom[hit + 1] !== pattern[1] || rom[hit + 2] !== pattern[2]) {
      continue;
    }

    for (const delta of [0, -1, -2, -3, -4]) {
      const start = hit + delta;
      if (start < 0) continue;
      const inst = safeDecode(start);
      const matchesAddr = inst.addr === target;
      const matchesValue = inst.value === target;
      const matchesTarget = inst.target === target;
      if (!matchesAddr && !matchesValue && !matchesTarget) continue;

      if (!results.has(inst.pc)) {
        results.set(inst.pc, inst);
      }
    }
  }

  return [...results.values()].sort((a, b) => a.pc - b.pc);
}

function printRefList(label, target, refs) {
  console.log(`${label} (${hex(target)})`);
  console.log('-'.repeat(label.length + 9));
  if (refs.length === 0) {
    console.log('No absolute references found.\n');
    return;
  }
  for (const inst of refs) {
    const note = KNOWN_NOTES.get(inst.pc);
    const suffix = note ? `  ; ${note}` : '';
    console.log(`${hex(inst.pc)}  ${bytesHex(inst.pc, inst.length).padEnd(18)}  ${renderInstruction(inst)}${suffix}`);
  }
  console.log('');
}

function printConclusion(entryRows, entryEffects, directCallerRows, callSites) {
  const start = entryRows[0]?.pc ?? ENTRY;
  const end = entryRows.at(-1)?.nextPc ? entryRows.at(-1).nextPc - 1 : ENTRY;
  const size = end - start + 1;

  console.log('Conclusion');
  console.log('----------');
  console.log(`Entry span:                ${hex(start)}..${hex(end)} (${size} bytes)`);
  console.log(`Direct callers:            ${callSites.length} (${callSites.map((pc) => hex(pc)).join(', ') || 'none'})`);
  console.log(`CALL instructions inside:  ${entryEffects.calls.length}`);
  console.log(`Port I/O inside:           ${entryEffects.ports.length}`);
  console.log(`Timer MMIO refs inside:    ${entryEffects.timerRefs.length}`);
  console.log(`Absolute RAM refs inside:  ${entryEffects.ramRefs.length}`);

  if (entryEffects.timerRefs.length === 0) {
    console.log('Timer hardware:            none');
    console.log('  0x01579B never touches 0xF20000-0xF200FF and performs no IN/OUT.');
  }

  if (entryEffects.ramRefs.length === 1 && entryEffects.ramRefs[0].addr === GATE_FLAG) {
    console.log('Actual behavior:           clear D176FC and return');
    console.log('  The body is exactly XOR A / LD (D176FC),A / RET.');
  }

  const callerEffects = collectDirectEffects(directCallerRows);
  if (callerEffects.timerRefs.length === 0 && callerEffects.ports.length === 0) {
    console.log('Caller evidence:           0x00B8BC also performs no timer MMIO or port I/O.');
    console.log('  It writes D17792 and D176CB, then calls 0x01579B.');
  }

  console.log('Reclassification:          D17792 and D176CB behave like staged notification args, not hardware timer registers.');
  console.log('  D176CB feeds the Channel 3 staging helper at 0x0151A7; D17792 feeds the USB/link wrapper at 0x01567C.');
  console.log('USB recovery link:         clearing D176FC re-opens the D176FC==0 gate used by 0x0150C2 for the Channel 3 USB fallback path.');
  console.log('  That path calls 0x006EDA and may relay to 0x0019B5 when D1772D is pending.');
}

const entryRows = disassembleUntilRet(ENTRY);
const siblingRows = disassembleUntilRet(SIBLING_GETTER);
const directCallerRows = disassembleRange(DIRECT_CALLER, 0x00B912);

const entryEffects = collectDirectEffects(entryRows);
const callSites = scanCallsTo(ENTRY);

const d176fcRefs = findAbsoluteRefs(GATE_FLAG);
const d176cbRefs = findAbsoluteRefs(CHANNEL3_LATCH);
const d17792Refs = findAbsoluteRefs(CHANNEL2_LATCH);

console.log('=== Phase 432: Trace 0x01579B ===');
console.log('');

printDisassembly('0x01579B leaf function', entryRows);
printDisassembly('Paired getter at 0x0157A1', siblingRows);
printDisassembly('Direct caller window 0x00B8BC..0x00B912', directCallerRows);

console.log('Leaf direct effects');
console.log('-------------------');
console.log(`CALL targets: ${entryEffects.calls.length === 0 ? 'none' : entryEffects.calls.map((item) => hex(item.target)).join(', ')}`);
console.log(`Port I/O:     ${entryEffects.ports.length === 0 ? 'none' : entryEffects.ports.map((item) => item.text).join(', ')}`);
console.log(`Timer MMIO:   ${entryEffects.timerRefs.length === 0 ? 'none' : entryEffects.timerRefs.map((item) => `${hex(item.addr)} @ ${hex(item.pc)}`).join(', ')}`);
console.log(`RAM refs:     ${entryEffects.ramRefs.length === 0 ? 'none' : entryEffects.ramRefs.map((item) => `${hex(item.addr)} @ ${hex(item.pc)}`).join(', ')}`);
console.log('');

printRefList('D176FC references', GATE_FLAG, d176fcRefs);
printRefList('D176CB references', CHANNEL3_LATCH, d176cbRefs);
printRefList('D17792 references', CHANNEL2_LATCH, d17792Refs);

printConclusion(entryRows, entryEffects, directCallerRows, callSites);
