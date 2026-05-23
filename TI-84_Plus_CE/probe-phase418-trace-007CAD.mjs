#!/usr/bin/env node

import { readFileSync } from 'node:fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TARGET = 0x007CAD;
const LINEAR_WINDOW_BYTES = 0xA0;
const CALL_PATTERN = [0xCD, 0xAD, 0x7C, 0x00];

const CALLER_NOTES = new Map([
  [0x01030A, 'slot 1 set path inside the display-callback dispatcher'],
  [0x010334, 'slot 2 set path inside the display-callback dispatcher'],
  [0x01035E, 'slot 3 set path inside the display-callback dispatcher'],
  [0x010A63, 'generic LCD control/configuration path outside the callback dispatcher'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + length), hexByte).join(' ');
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
    };
  }
}

function formatInstruction(inst) {
  const up = value => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${up(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${up(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'push':
      return `PUSH ${up(inst.pair)}`;
    case 'pop':
      return `POP ${up(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${up(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${up(inst.pair)}`
        : `LD ${up(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-reg-imm':
      return `LD ${up(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${up(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${up(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${up(inst.dest)},${up(inst.src)}`;
    case 'ld-reg-ixd':
      return `LD ${up(inst.dest)},(${up(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ixd-reg':
      return `LD (${up(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${up(inst.src)}`;
    case 'add-pair':
      return `ADD ${up(inst.dest)},${up(inst.src)}`;
    case 'alu-reg':
      return `${up(inst.op)} ${up(inst.src)}`;
    case 'alu-imm':
      return `${up(inst.op)} ${hex(inst.value, 2)}`;
    case 'bit-set':
      return `SET ${inst.bit},${up(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit},${up(inst.reg)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},(${up(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'in-reg':
      return `IN ${up(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${up(inst.reg)}`;
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function renderRows(rows) {
  return rows.map(({ pc, inst }) => {
    const bytes = rawBytes(pc, inst.length).padEnd(18, ' ');
    return `${hex(pc)}  ${bytes}  ${formatInstruction(inst)}`;
  }).join('\n');
}

function disassembleUntilRet(start, maxInstructions = 64) {
  const rows = [];
  let pc = start;

  while (rows.length < maxInstructions && pc < rom.length) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!inst || inst.nextPc <= pc || inst.tag === 'ret') {
      break;
    }
    pc = inst.nextPc;
  }

  return rows;
}

function disassembleLinearWindow(start, byteBudget) {
  const rows = [];
  let pc = start;
  const end = start + byteBudget;

  while (pc < end && pc < rom.length) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!inst || inst.nextPc <= pc) {
      break;
    }
    pc = inst.nextPc;
  }

  return rows;
}

function findPattern(bytes) {
  const hits = [];

  for (let pc = 0; pc <= rom.length - bytes.length; pc++) {
    let matched = true;
    for (let i = 0; i < bytes.length; i++) {
      if (rom[pc + i] !== bytes[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(pc);
    }
  }

  return hits;
}

function selectBestSequence(hit, maxBack = 96) {
  const sequences = [];
  const searchStart = Math.max(0, hit - maxBack);

  for (let start = searchStart; start <= hit; start++) {
    let pc = start;
    const rows = [];
    let valid = true;

    while (pc < hit) {
      const inst = safeDecode(pc);
      if (!inst || inst.nextPc <= pc || inst.nextPc > hit) {
        valid = false;
        break;
      }
      rows.push({ pc, inst });
      pc = inst.nextPc;
    }

    if (valid && pc === hit) {
      sequences.push(rows);
    }
  }

  if (sequences.length === 0) {
    return [];
  }

  return sequences.sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length;
    }
    return (a[0]?.pc ?? hit) - (b[0]?.pc ?? hit);
  })[0];
}

function collectContextRows(hit, beforeCount = 8, afterCount = 5) {
  const prefix = selectBestSequence(hit, 128);
  const rows = prefix.slice(-beforeCount);
  let pc = hit;
  let remaining = afterCount + 1;

  while (remaining > 0 && pc < rom.length) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!inst || inst.nextPc <= pc) {
      break;
    }
    pc = inst.nextPc;
    remaining--;
  }

  return rows;
}

function collectRamRefs(rows, treatIxAsStack = false) {
  const refs = [];

  for (const { pc, inst } of rows) {
    if (inst.tag === 'ld-reg-mem' && inst.addr >= 0xD00000) {
      refs.push({ pc, kind: 'read', mode: 'absolute', addr: inst.addr, detail: `-> ${String(inst.dest).toUpperCase()}` });
    }

    if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000) {
      refs.push({ pc, kind: 'write', mode: 'absolute', addr: inst.addr, detail: `<- ${String(inst.src).toUpperCase()}` });
    }

    if (inst.tag === 'ld-pair-mem' && inst.addr >= 0xD00000) {
      const kind = inst.direction === 'to-mem' ? 'write' : 'read';
      refs.push({ pc, kind, mode: 'absolute', addr: inst.addr, detail: kind === 'read' ? `-> ${String(inst.pair).toUpperCase()}` : `<- ${String(inst.pair).toUpperCase()}` });
    }

    if (treatIxAsStack && inst.tag === 'ld-reg-ixd' && inst.indexRegister === 'ix') {
      refs.push({
        pc,
        kind: 'read',
        mode: 'stack',
        displacement: inst.displacement,
        detail: `IX${inst.displacement >= 0 ? '+' : ''}${inst.displacement} -> ${String(inst.dest).toUpperCase()}`,
      });
    }

    if (treatIxAsStack && inst.tag === 'ld-ixd-reg' && inst.indexRegister === 'ix') {
      refs.push({
        pc,
        kind: 'write',
        mode: 'stack',
        displacement: inst.displacement,
        detail: `${String(inst.src).toUpperCase()} -> IX${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`,
      });
    }
  }

  return refs;
}

function renderRefs(refs) {
  if (refs.length === 0) {
    return '- none';
  }

  return refs.map(ref => {
    if (ref.mode === 'absolute') {
      return `- ${hex(ref.pc)}  ${ref.kind.toUpperCase()} ${hex(ref.addr)}  ${ref.detail}`;
    }

    return `- ${hex(ref.pc)}  ${ref.kind.toUpperCase()} stack(${ref.displacement >= 0 ? '+' : ''}${ref.displacement})  ${ref.detail}`;
  }).join('\n');
}

function collectPortOps(rows) {
  const ops = [];
  let bcValue = null;

  for (const { pc, inst } of rows) {
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      bcValue = inst.value;
    }

    if (inst.tag === 'in-reg' || inst.tag === 'out-reg') {
      ops.push({
        pc,
        kind: inst.tag === 'in-reg' ? 'IN' : 'OUT',
        port: bcValue,
        reg: inst.reg,
      });
    }
  }

  return ops;
}

function renderPortOps(ops) {
  if (ops.length === 0) {
    return '- none';
  }

  return ops.map(op => (
    `- ${hex(op.pc)}  ${op.kind} ${op.port == null ? '(unknown port)' : hex(op.port)}  ${op.reg.toUpperCase()}`
  )).join('\n');
}

function recoverImmediateByteArg(contextRows, callerPc) {
  const callIndex = contextRows.findIndex(row => row.pc === callerPc);
  if (callIndex < 2) {
    return null;
  }

  const pushRow = contextRows[callIndex - 1];
  const ldRow = contextRows[callIndex - 2];

  if (
    pushRow.inst.tag === 'push'
    && pushRow.inst.pair === 'bc'
    && ldRow.inst.tag === 'ld-pair-imm'
    && ldRow.inst.pair === 'bc'
  ) {
    return {
      value: ldRow.inst.value & 0xFF,
      source: `LD BC,${hex(ldRow.inst.value)}`,
    };
  }

  return null;
}

const primaryRows = disassembleUntilRet(TARGET);
const linearRows = disassembleLinearWindow(TARGET, LINEAR_WINDOW_BYTES);
const callerPcs = findPattern(CALL_PATTERN);
const primaryRamRefs = collectRamRefs(primaryRows, true);
const linearRamRefs = collectRamRefs(linearRows, true);
const primaryPortOps = collectPortOps(primaryRows);
const linearPortOps = collectPortOps(linearRows);

const lines = [];
lines.push('# Phase 418 Probe: Trace 0x007CAD', '');
lines.push(`Target routine: ${hex(TARGET)}`, '');
lines.push('## Primary function disassembly (`0x007CAD` through first `RET`)', '', '```text');
lines.push(renderRows(primaryRows));
lines.push('```', '');

lines.push('## Adjacent linear window (`0x007CAD` + 160 bytes)', '', '```text');
lines.push(renderRows(linearRows));
lines.push('```', '');

lines.push('## RAM reads/writes in primary function', '');
lines.push(renderRefs(primaryRamRefs), '');

lines.push('## RAM reads/writes in 160-byte linear window', '');
lines.push(renderRefs(linearRamRefs), '');

lines.push('## Port traffic in primary function', '');
lines.push(renderPortOps(primaryPortOps), '');

lines.push('## Port traffic in 160-byte linear window', '');
lines.push(renderPortOps(linearPortOps), '');

lines.push('## Direct callers of `CALL 0x007CAD` (`CD AD 7C 00`)', '');
if (callerPcs.length === 0) {
  lines.push('- none', '');
} else {
  for (const pc of callerPcs) {
    const contextRows = collectContextRows(pc, 9, 6);
    const arg = recoverImmediateByteArg(contextRows, pc);
    const note = CALLER_NOTES.get(pc) ?? 'unclassified caller';
    lines.push(`### ${hex(pc)}  ${note}`);
    if (arg) {
      lines.push(`- recovered low-byte stack argument: ${hex(arg.value, 2)} via ${arg.source}`);
    } else {
      lines.push('- recovered low-byte stack argument: not resolved from local context');
    }
    lines.push('- local RAM refs:');
    lines.push(renderRefs(collectRamRefs(contextRows, true)));
    lines.push('', '```text');
    lines.push(renderRows(contextRows));
    lines.push('```', '');
  }
}

lines.push('## Recovered semantics', '');
lines.push('- `0x007CAD` never touches `D177BD`, `D177D6`, `D177D7`, or any other absolute RAM address directly.');
lines.push('- The only memory operand inside the routine is `LD A,(IX+6)`, i.e. a stack byte parameter read from the first caller argument.');
lines.push('- The routine always loads `BC = 0x8020`, reads the current byte with `IN A,(C)`, then writes back `current | (arg & 0x3E)` with `OUT (C),A`.');
lines.push('- Because the merge is an OR, `0x007CAD` can only force bits 1-5 high; it does not clear them and it does not replace the full register value.');
lines.push('- The surrounding 160-byte window shows `0x007CAD` at the head of a contiguous `0x8020` helper family: read (`0x007CD3`), raw write (`0x007CF1`), clear bits 1-5 (`0x007D03`), and one-bit set/clear helpers (`0x007D0F` onward).');
lines.push('- Direct callers pass only control-byte masks: three callback-dispatch callers pass `0x02`, while one non-callback caller at `0x010A63` passes `0x14`.');
lines.push('- In the callback dispatcher, the pattern is `CALL 0x007CD3` -> `LD (D177D7),A` -> `CALL 0x007CAD(0x02)` -> `SET bit in D177D6`. That means the software callback slot is armed by the later `D177D6` store, while `0x007CAD` only reprograms LCD control port `0x8020` before the pending bit is raised.', '');

lines.push('## Pseudocode', '', '```c');
lines.push('void write_port_8020_masked_or(uint8_t arg) {');
lines.push('  uint8_t current = in_port(0x8020);');
lines.push('  uint8_t merged = current | (arg & 0x3E);');
lines.push('  out_port(0x8020, merged);');
lines.push('}');
lines.push('```');

console.log(lines.join('\n'));
