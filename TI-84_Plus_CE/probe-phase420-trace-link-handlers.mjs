#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const HANDLERS = [
  {
    name: '0x0094C0 non-USB link-port status dispatcher',
    start: 0x0094c0,
    endExclusive: 0x0096cb,
    callerContext: 'Reached from 0x009B35 when D177B7 != 0x55 and D14073 == 0.',
  },
  {
    name: '0x0096CB non-USB link-port active fallback handler',
    start: 0x0096cb,
    endExclusive: 0x0098d2,
    callerContext: 'Reached from 0x009B35 when D177B7 != 0x55 and D14073 != 0.',
  },
];

const RAM_LABELS = new Map([
  [0xd14035, 'status-loop counter'],
  [0xd14038, 'rolling/link timer'],
  [0xd14040, 'link scratch byte 0'],
  [0xd14041, 'link scratch byte 1'],
  [0xd14049, 'cached port 0x3014 status'],
  [0xd14059, 'aggregated fallback status'],
  [0xd1405a, 'port 0x3130 sample'],
  [0xd1405b, 'port 0x3140 sample'],
  [0xd1407b, 'fallback state latch A'],
  [0xd1407c, 'fallback state latch B'],
  [0xd1407d, 'fallback state latch C'],
  [0xd1407e, 'fallback state latch D'],
  [0xd1407f, 'fallback state latch E'],
  [0xd14084, 'busy/late-path flag'],
  [0xd1408c, 'fallback latch clear byte'],
  [0xd140af, '24-bit fallback slot'],
  [0xd140b2, 'fallback active flag'],
  [0xd141bb, 'D141BB / IY+8 slot'],
  [0xd141e7, 'bit3-path latch'],
  [0xd141e8, 'bit2/bit3 latch'],
  [0xd141ea, 'bit2 result latch'],
  [0xd141eb, 'bit2 high-bit latch'],
  [0xd141ec, 'bit0/bit1 ready latch'],
  [0xd143ff, 'status class byte'],
  [0xd176f8, 'link pending/state byte'],
  [0xd17796, 'link state byte'],
  [0xd177bb, 'transfer-in-progress latch'],
]);

const PORT_LABELS = new Map([
  [0x3014, 'link status / ack port'],
  [0x3030, 'USB/link status register'],
  [0x3031, 'USB/link data/status register'],
  [0x3100, '0x31xx gate register'],
  [0x3108, '0x31xx control register'],
  [0x3114, '0x31xx control register'],
  [0x3120, '0x31xx control register'],
  [0x3130, '0x31xx status sample A'],
  [0x313c, '0x31xx control register'],
  [0x313d, '0x31xx control register'],
  [0x3140, '0x31xx status sample B'],
  [0x314c, '0x31xx gate register A'],
  [0x314d, '0x31xx gate register B'],
  [0x31cb, '0x31xx control register'],
  [0x5005, 'FTINTC enable byte 1'],
]);

const TARGET_LABELS = new Map([
  [0x0019b5, 'crash/halt handler'],
  [0x002197, 'stack-frame helper'],
  [0x0021c2, 'HL null-check helper'],
  [0x006f31, 'low-level link helper'],
  [0x00756c, 'follow-up fallback helper'],
  [0x00ed77, 'bit0/bit1 sub-handler'],
  [0x00fe10, 'byte-dispatch helper'],
  [0x00988b, 'cleanup tail'],
  [0x0098bc, 'shared FTINTC bit5 re-enable epilogue'],
  [0x0098d1, 'shared RET'],
]);

const PC_NOTES = new Map([
  [0x0094dc, 'start of the cached 0x3014 bit-service loop'],
  [0x0094e4, 'bit4 fatal branch: write 0x10 to 0x3014 then crash'],
  [0x009516, 'bit1 branch: acknowledge 0x3014 bit1 and dispatch through 0x00ED77 / 0x00FE10'],
  [0x009560, 'bit2 branch: test 0x3030 state and update D141EA/D141EB/D141E8'],
  [0x009627, 'bit0 branch: acknowledge 0x3014 bit0 and inspect D141BB / IY+8'],
  [0x009688, 'bit3 branch: acknowledge 0x3014 bit3 and increment D14035'],
  [0x0096b3, 'tail re-read of port 0x3014; loop back while any status bit remains'],
  [0x0096cb, 'entry gate for the D14073 != 0 fallback path'],
  [0x0096d7, 'sample 0x3140/0x3130 and fold their relationship into D14059'],
  [0x009707, 'early empty-status exit through the shared FTINTC bit5 re-enable helper'],
  [0x009720, 'non-empty D14059 path: gate on 0x314C bit2 before deeper recovery'],
  [0x0097b2, 'secondary 0x314D gate before the cleanup / reset tail'],
  [0x009800, 'set D1407C/D1407D and clear hardware/control state before the long cleanup'],
  [0x009858, 'clear D177BB/D176F8 and several D140xx latches before cleanup'],
  [0x00988b, 'final cleanup tail before return'],
  [0x0098bc, 'shared FTINTC bit5 re-enable epilogue'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + length), hexByte).join(' ');
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function lower(value) {
  return value == null ? '' : String(value).toLowerCase();
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${signedDisp(displacement)})`;
}

function withPrefix(inst, mnemonic) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${mnemonic}` : mnemonic;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `CALL ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `JP ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${upper(inst.condition)},${hex(inst.target)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    case 'ret-conditional':
      return withPrefix(inst, `RET ${upper(inst.condition)}`);
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(
        inst,
        inst.direction === 'to-mem'
          ? `LD (${hex(inst.addr)}),${upper(inst.pair)}`
          : `LD ${upper(inst.pair)},(${hex(inst.addr)})`
      );
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${upper(inst.src)})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${upper(inst.dest)}),${upper(inst.src)}`);
    case 'ld-ind-imm':
      return withPrefix(inst, `LD (HL),${hex(inst.value, 2)}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`);
    case 'ld-ixiy-indexed':
      return withPrefix(inst, `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
    case 'inc-pair':
      return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'dec-pair':
      return withPrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'inc-reg':
      return withPrefix(inst, `INC ${upper(inst.reg)}`);
    case 'dec-reg':
      return withPrefix(inst, `DEC ${upper(inst.reg)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'bit-set':
      return withPrefix(inst, `SET ${inst.bit},${upper(inst.reg)}`);
    case 'bit-res':
      return withPrefix(inst, `RES ${inst.bit},${upper(inst.reg)}`);
    case 'bit-test':
      return withPrefix(inst, `BIT ${inst.bit},${upper(inst.reg)}`);
    case 'in-reg':
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'out-reg':
      return withPrefix(inst, `OUT (C),${upper(inst.reg)}`);
    case 'cpl':
      return withPrefix(inst, 'CPL');
    case 'nop':
      return withPrefix(inst, 'NOP');
    case 'db':
      return withPrefix(inst, `DB ${hex(inst.value, 2)}`);
    default:
      return withPrefix(inst, `[${inst.tag}]`);
  }
}

function addToSet(target, value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target.add(value >>> 0);
  }
}

function isTrackedRam(addr) {
  return typeof addr === 'number' && addr >= 0xd00000 && addr <= 0xd3ffff;
}

function labelFor(map, value) {
  return map.get(value) ?? '';
}

function formatValue(value, width, labelMap) {
  const label = labelFor(labelMap, value);
  return label ? `${hex(value, width)} (${label})` : hex(value, width);
}

function formatValueList(values, width, labelMap) {
  if (values.length === 0) {
    return 'none';
  }

  return values.map((value) => formatValue(value, width, labelMap)).join(', ');
}

function updateBcContext(inst, currentBc) {
  if (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'bc') {
    return inst.value >>> 0;
  }

  if (inst.tag === 'ld-pair-mem' && lower(inst.pair) === 'bc' && inst.direction !== 'to-mem') {
    return null;
  }

  if (inst.tag === 'ld-mem-pair' && lower(inst.pair) === 'bc') {
    return currentBc;
  }

  if ((inst.tag === 'inc-pair' || inst.tag === 'dec-pair') && lower(inst.pair) === 'bc') {
    if (currentBc == null) {
      return null;
    }

    return inst.tag === 'inc-pair'
      ? (currentBc + 1) & 0xffffff
      : (currentBc - 1) & 0xffffff;
  }

  if (inst.tag === 'pop' && lower(inst.pair) === 'bc') {
    return null;
  }

  if (
    (inst.tag === 'ld-reg-imm' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-reg-reg' || inst.tag === 'ld-reg-ind')
    && (lower(inst.dest) === 'b' || lower(inst.dest) === 'c')
  ) {
    return null;
  }

  if ((inst.tag === 'inc-reg' || inst.tag === 'dec-reg') && (lower(inst.reg) === 'b' || lower(inst.reg) === 'c')) {
    return null;
  }

  if ((inst.tag === 'bit-set' || inst.tag === 'bit-res' || inst.tag === 'bit-test') && (lower(inst.reg) === 'b' || lower(inst.reg) === 'c')) {
    return null;
  }

  if (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'rst') {
    return null;
  }

  return currentBc;
}

function updateHlContext(inst, currentHl) {
  if (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'hl') {
    return inst.value >>> 0;
  }

  if (inst.tag === 'ld-pair-mem' && lower(inst.pair) === 'hl' && inst.direction !== 'to-mem') {
    return null;
  }

  if (inst.tag === 'ld-pair-indexed' && lower(inst.pair) === 'hl') {
    return null;
  }

  if ((inst.tag === 'inc-pair' || inst.tag === 'dec-pair') && lower(inst.pair) === 'hl') {
    if (currentHl == null) {
      return null;
    }

    return inst.tag === 'inc-pair'
      ? (currentHl + 1) & 0xffffff
      : (currentHl - 1) & 0xffffff;
  }

  if (inst.tag === 'pop' && lower(inst.pair) === 'hl') {
    return null;
  }

  if (
    (inst.tag === 'ld-reg-imm' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-reg-reg' || inst.tag === 'ld-reg-ind')
    && (lower(inst.dest) === 'h' || lower(inst.dest) === 'l')
  ) {
    return null;
  }

  if ((inst.tag === 'inc-reg' || inst.tag === 'dec-reg') && (lower(inst.reg) === 'h' || lower(inst.reg) === 'l')) {
    return null;
  }

  if ((inst.tag === 'bit-set' || inst.tag === 'bit-res' || inst.tag === 'bit-test') && (lower(inst.reg) === 'h' || lower(inst.reg) === 'l')) {
    return null;
  }

  if (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'rst') {
    return null;
  }

  return currentHl;
}

function analyzeInstructionEffects(row, summary, inst, contexts) {
  switch (inst.tag) {
    case 'ld-reg-mem':
      if (isTrackedRam(inst.addr)) {
        addToSet(row.ramReads, inst.addr);
        addToSet(summary.ramReads, inst.addr);
      }
      break;
    case 'ld-pair-mem':
      if (isTrackedRam(inst.addr)) {
        if (inst.direction === 'to-mem') {
          addToSet(row.ramWrites, inst.addr);
          addToSet(summary.ramWrites, inst.addr);
        } else {
          addToSet(row.ramReads, inst.addr);
          addToSet(summary.ramReads, inst.addr);
        }
      }
      break;
    case 'ld-mem-pair':
      if (isTrackedRam(inst.addr)) {
        addToSet(row.ramWrites, inst.addr);
        addToSet(summary.ramWrites, inst.addr);
      }
      break;
    case 'ld-mem-reg':
      if (isTrackedRam(inst.addr)) {
        addToSet(row.ramWrites, inst.addr);
        addToSet(summary.ramWrites, inst.addr);
      }
      break;
    case 'ld-ind-imm':
      if (isTrackedRam(contexts.hl)) {
        addToSet(row.ramWrites, contexts.hl);
        addToSet(summary.ramWrites, contexts.hl);
      }
      break;
    case 'ld-ind-reg':
      if (lower(inst.dest) === 'hl' && isTrackedRam(contexts.hl)) {
        addToSet(row.ramWrites, contexts.hl);
        addToSet(summary.ramWrites, contexts.hl);
      }
      break;
    case 'ld-reg-ind':
      if (lower(inst.src) === 'hl' && isTrackedRam(contexts.hl)) {
        addToSet(row.ramReads, contexts.hl);
        addToSet(summary.ramReads, contexts.hl);
      }
      break;
    case 'in-reg':
      if (contexts.bc != null) {
        addToSet(row.portReads, contexts.bc & 0xffff);
        addToSet(summary.portReads, contexts.bc & 0xffff);
      } else {
        summary.unresolvedPortReads++;
      }
      break;
    case 'out-reg':
      if (contexts.bc != null) {
        addToSet(row.portWrites, contexts.bc & 0xffff);
        addToSet(summary.portWrites, contexts.bc & 0xffff);
      } else {
        summary.unresolvedPortWrites++;
      }
      break;
    case 'call':
    case 'call-conditional':
      addToSet(summary.calls, inst.target);
      row.callTarget = inst.target >>> 0;
      break;
    case 'jp':
    case 'jp-conditional':
    case 'jr':
    case 'jr-conditional':
      row.branchTarget = inst.target >>> 0;
      break;
    default:
      break;
  }
}

function analyzeRange(handler) {
  let bcValue = null;
  let hlValue = null;
  const rows = [];
  const summary = {
    ramReads: new Set(),
    ramWrites: new Set(),
    portReads: new Set(),
    portWrites: new Set(),
    calls: new Set(),
    unresolvedPortReads: 0,
    unresolvedPortWrites: 0,
  };

  for (let pc = handler.start; pc < handler.endExclusive; ) {
    const inst = safeDecode(pc);
    const nextPc = inst.nextPc > pc ? inst.nextPc : pc + 1;
    const row = {
      pc,
      inst,
      ramReads: new Set(),
      ramWrites: new Set(),
      portReads: new Set(),
      portWrites: new Set(),
      callTarget: null,
      branchTarget: null,
      note: PC_NOTES.get(pc) ?? null,
    };

    analyzeInstructionEffects(row, summary, inst, { bc: bcValue, hl: hlValue });
    rows.push(row);

    bcValue = updateBcContext(inst, bcValue);
    hlValue = updateHlContext(inst, hlValue);
    pc = nextPc;
  }

  return summary ? { rows, ...summary } : { rows };
}

function describeEffects(row) {
  const bits = [];

  if (row.callTarget != null) {
    bits.push(`call ${formatValue(row.callTarget, 6, TARGET_LABELS)}`);
  } else if (row.branchTarget != null) {
    bits.push(`branch ${formatValue(row.branchTarget, 6, TARGET_LABELS)}`);
  }

  if (row.portReads.size > 0) {
    bits.push(`port rd ${formatValueList([...row.portReads].sort((a, b) => a - b), 4, PORT_LABELS)}`);
  }
  if (row.portWrites.size > 0) {
    bits.push(`port wr ${formatValueList([...row.portWrites].sort((a, b) => a - b), 4, PORT_LABELS)}`);
  }
  if (row.ramReads.size > 0) {
    bits.push(`ram rd ${formatValueList([...row.ramReads].sort((a, b) => a - b), 6, RAM_LABELS)}`);
  }
  if (row.ramWrites.size > 0) {
    bits.push(`ram wr ${formatValueList([...row.ramWrites].sort((a, b) => a - b), 6, RAM_LABELS)}`);
  }
  if (row.note) {
    bits.push(row.note);
  }

  return bits.join(' | ');
}

function renderRows(rows) {
  return rows
    .map((row) => {
      const inst = row.inst;
      const bytes = rawBytes(row.pc, inst.length).padEnd(18, ' ');
      const mnemonic = formatInstruction(inst).padEnd(30, ' ');
      const comment = describeEffects(row);
      return `${hex(row.pc)}  ${bytes} ${mnemonic}${comment ? ` ; ${comment}` : ''}`;
    })
    .join('\n');
}

const lines = [];
lines.push('# Phase 420 Probe: Trace 0x0094C0 and 0x0096CB', '');
lines.push(`ROM size: ${rom.length} bytes`);
lines.push(`Generated: ${new Date().toISOString()}`, '');

for (const handler of HANDLERS) {
  const analysis = analyzeRange(handler);
  const ramReads = [...analysis.ramReads].sort((a, b) => a - b);
  const ramWrites = [...analysis.ramWrites].sort((a, b) => a - b);
  const portReads = [...analysis.portReads].sort((a, b) => a - b);
  const portWrites = [...analysis.portWrites].sort((a, b) => a - b);
  const calls = [...analysis.calls].sort((a, b) => a - b);

  lines.push(`## ${handler.name}`, '');
  lines.push(`Boundary: ${hex(handler.start)}..${hex(handler.endExclusive - 1)} (${handler.endExclusive - handler.start} bytes)`);
  lines.push(`Caller context: ${handler.callerContext}`);
  lines.push(`Port reads: ${formatValueList(portReads, 4, PORT_LABELS)}${analysis.unresolvedPortReads ? ` (+${analysis.unresolvedPortReads} unresolved)` : ''}`);
  lines.push(`Port writes: ${formatValueList(portWrites, 4, PORT_LABELS)}${analysis.unresolvedPortWrites ? ` (+${analysis.unresolvedPortWrites} unresolved)` : ''}`);
  lines.push(`RAM reads: ${formatValueList(ramReads, 6, RAM_LABELS)}`);
  lines.push(`RAM writes: ${formatValueList(ramWrites, 6, RAM_LABELS)}`);
  lines.push(`Call targets: ${formatValueList(calls, 6, TARGET_LABELS)}`, '');
  lines.push('```text');
  lines.push(renderRows(analysis.rows));
  lines.push('```', '');
}

console.log(lines.join('\n'));
