#!/usr/bin/env node

/**
 * Phase 365: disassemble and summarize the Fix B boot endpoint near 0x006D57.
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase365-disasm-006D57.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const romBytes = fs.readFileSync(ROM_PATH);

const FOCUS_START = 0x006D57;
const FOCUS_END_EXCLUSIVE = 0x006DD8;

const CONTEXT_REQUEST_START = 0x006D40;
const CONTEXT_LISTING_START = 0x006D3E; // 0x006D40 lands inside the instruction that starts here.
const CONTEXT_END_EXCLUSIVE = 0x006DF1;

const ABSOLUTE_STACK_RAM_BASE = 0xD00000;

function hex(value, width = 6) {
  const normalized = Number(value ?? 0) >>> 0;
  return `0x${normalized.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value).toUpperCase();
}

function formatDisp(value) {
  const abs = hexByte(Math.abs(value ?? 0));
  return `${value >= 0 ? '+' : '-'}${abs}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function formatPea(base, displacement) {
  return `${upper(base)}${formatDisp(displacement)}`;
}

function bytesAt(start, length) {
  const end = Math.min(romBytes.length, start + Math.max(length, 0));
  return Array.from(
    romBytes.subarray(start, end),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatFieldValue(value) {
  if (typeof value === 'number') {
    return value > 0xFF ? hex(value) : hexByte(value);
  }
  return String(value);
}

function formatInstruction(inst) {
  if (!inst) return 'DB ??';

  switch (inst.tag) {
    case 'nop': return withModePrefix(inst, 'NOP');
    case 'halt': return withModePrefix(inst, 'HALT');
    case 'di': return withModePrefix(inst, 'DI');
    case 'ei': return withModePrefix(inst, 'EI');
    case 'ret': return withModePrefix(inst, 'RET');
    case 'reti': return withModePrefix(inst, 'RETI');
    case 'retn': return withModePrefix(inst, 'RETN');
    case 'ret-conditional': return withModePrefix(inst, `RET ${upper(inst.condition)}`);
    case 'jp': return withModePrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional': return withModePrefix(inst, `JP ${upper(inst.condition)}, ${hex(inst.target)}`);
    case 'jp-indirect': return withModePrefix(inst, `JP (${upper(inst.indirectRegister)})`);
    case 'jr': return withModePrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional': return withModePrefix(inst, `JR ${upper(inst.condition)}, ${hex(inst.target)}`);
    case 'djnz': return withModePrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'call': return withModePrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional': return withModePrefix(inst, `CALL ${upper(inst.condition)}, ${hex(inst.target)}`);
    case 'rst': return withModePrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push': return withModePrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop': return withModePrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-imm': return withModePrefix(inst, `LD ${upper(inst.pair)}, ${hex(inst.value)}`);
    case 'ld-sp-hl': return withModePrefix(inst, 'LD SP, HL');
    case 'ld-sp-pair': return withModePrefix(inst, `LD SP, ${upper(inst.pair)}`);
    case 'ld-reg-reg': return withModePrefix(inst, `LD ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'ld-reg-imm': return withModePrefix(inst, `LD ${upper(inst.dest)}, ${hexByte(inst.value)}`);
    case 'ld-reg-mem': return withModePrefix(inst, `LD ${upper(inst.dest)}, (${hex(inst.addr)})`);
    case 'ld-mem-reg': return withModePrefix(inst, `LD (${hex(inst.addr)}), ${upper(inst.src)}`);
    case 'ld-pair-mem':
      return withModePrefix(
        inst,
        inst.direction === 'to-mem'
          ? `LD (${hex(inst.addr)}), ${upper(inst.pair)}`
          : `LD ${upper(inst.pair)}, (${hex(inst.addr)})`,
      );
    case 'ld-mem-pair': return withModePrefix(inst, `LD (${hex(inst.addr)}), ${upper(inst.pair)}`);
    case 'ld-reg-ind': return withModePrefix(inst, `LD ${upper(inst.dest)}, (${upper(inst.src)})`);
    case 'ld-ind-reg': return withModePrefix(inst, `LD (${upper(inst.dest)}), ${upper(inst.src)}`);
    case 'ld-pair-indexed': return withModePrefix(inst, `LD ${upper(inst.pair)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair': return withModePrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`);
    case 'ld-reg-ixd': return withModePrefix(inst, `LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg': return withModePrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`);
    case 'inc-pair': return withModePrefix(inst, `INC ${upper(inst.pair)}`);
    case 'dec-pair': return withModePrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'inc-reg': return withModePrefix(inst, `INC ${upper(inst.reg)}`);
    case 'dec-reg': return withModePrefix(inst, `DEC ${upper(inst.reg)}`);
    case 'add-pair': return withModePrefix(inst, `ADD ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'adc-pair': return withModePrefix(inst, `ADC HL, ${upper(inst.src)}`);
    case 'sbc-pair': return withModePrefix(inst, `SBC HL, ${upper(inst.src)}`);
    case 'alu-imm': return withModePrefix(inst, `${upper(inst.op)} ${hexByte(inst.value)}`);
    case 'alu-reg': return withModePrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'bit-test': return withModePrefix(inst, `BIT ${inst.bit}, ${upper(inst.reg)}`);
    case 'rotate-reg': return withModePrefix(inst, `${upper(inst.op)} ${upper(inst.reg)}`);
    case 'rotate-ind': return withModePrefix(inst, `${upper(inst.op)} (${upper(inst.indirectRegister)})`);
    case 'indexed-cb-rotate':
      return withModePrefix(inst, `${upper(inst.operation)} ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'out-reg': return withModePrefix(inst, `OUT (BC), ${upper(inst.reg)}`);
    case 'in-reg': return withModePrefix(inst, `IN ${upper(inst.reg)}, (BC)`);
    case 'out-imm': return withModePrefix(inst, `OUT (${hexByte(inst.port)}), A`);
    case 'in-imm': return withModePrefix(inst, `IN A, (${hexByte(inst.port)})`);
    case 'out0': return withModePrefix(inst, `OUT0 (${hexByte(inst.port)}), ${upper(inst.reg)}`);
    case 'in0': return withModePrefix(inst, `IN0 ${upper(inst.reg)}, (${hexByte(inst.port)})`);
    case 'pea': return withModePrefix(inst, `PEA ${formatPea(inst.base, inst.displacement)}`);
    case 'ex-de-hl': return withModePrefix(inst, 'EX DE, HL');
    case 'ex-sp-hl': return withModePrefix(inst, 'EX (SP), HL');
    case 'ex-af': return withModePrefix(inst, "EX AF, AF'");
    case 'exx': return withModePrefix(inst, 'EXX');
    default: {
      const extras = Object.entries(inst)
        .filter(([key, value]) => (
          !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'fallthrough', 'terminates', 'tag'].includes(key) &&
          value !== undefined &&
          value !== null
        ))
        .map(([key, value]) => `${key}=${formatFieldValue(value)}`)
        .join(' ');
      return withModePrefix(inst, extras ? `${upper(inst.tag)} ${extras}` : upper(inst.tag));
    }
  }
}

function decodeAt(pc) {
  if (pc < 0 || pc >= romBytes.length) return null;
  try {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    if (!inst || !inst.length) return null;
    return inst;
  } catch {
    return null;
  }
}

function disassembleRange(startPc, endExclusive) {
  const rows = [];
  let pc = startPc;

  while (pc < endExclusive) {
    const inst = decodeAt(pc);
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      inst,
      length,
      bytes: bytesAt(pc, length),
      text: inst ? formatInstruction(inst) : `DB ${hexByte(romBytes[pc])}`,
    });
    pc += length;
  }

  return rows;
}

function pushUnique(array, value) {
  if (!array.includes(value)) array.push(value);
}

function describeMemoryAccess(addr, access, source) {
  return `${access.padEnd(5)} ${hex(addr)}${source ? `  ${source}` : ''}`;
}

function collectStaticAnalysis(rows) {
  const calls = [];
  const branches = [];
  const returns = [];
  const io = [];
  const memory = [];
  const indexedRefs = [];

  let lastKnownHl = null;

  for (const row of rows) {
    const inst = row.inst;
    if (!inst) {
      lastKnownHl = null;
      continue;
    }

    switch (inst.tag) {
      case 'call':
      case 'call-conditional':
        pushUnique(calls, `${hex(row.pc)} -> ${hex(inst.target)}  ${row.text}`);
        break;
      case 'jp':
      case 'jp-conditional':
      case 'jr':
      case 'jr-conditional':
      case 'djnz':
        pushUnique(branches, `${hex(row.pc)} -> ${hex(inst.target)}  ${row.text}`);
        break;
      case 'jp-indirect':
        pushUnique(branches, `${hex(row.pc)} -> indirect ${row.text}`);
        break;
      case 'rst':
        pushUnique(branches, `${hex(row.pc)} -> ${hex(inst.target, 2)}  ${row.text}`);
        break;
      case 'ret':
      case 'ret-conditional':
      case 'reti':
      case 'retn':
        pushUnique(returns, `${hex(row.pc)}  ${row.text}`);
        break;
      case 'out-reg':
      case 'in-reg':
      case 'out-imm':
      case 'in-imm':
      case 'out0':
      case 'in0':
        pushUnique(io, `${hex(row.pc)}  ${row.text}`);
        break;
      default:
        break;
    }

    switch (inst.tag) {
      case 'ld-reg-mem':
        pushUnique(memory, describeMemoryAccess(inst.addr, 'read', `${hex(row.pc)}  ${row.text}`));
        break;
      case 'ld-mem-reg':
      case 'ld-mem-pair':
        pushUnique(memory, describeMemoryAccess(inst.addr, 'write', `${hex(row.pc)}  ${row.text}`));
        break;
      case 'ld-pair-mem':
        pushUnique(
          memory,
          describeMemoryAccess(
            inst.addr,
            inst.direction === 'to-mem' ? 'write' : 'read',
            `${hex(row.pc)}  ${row.text}`,
          ),
        );
        break;
      default:
        break;
    }

    if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
      lastKnownHl = inst.value;
      if (inst.value >= ABSOLUTE_STACK_RAM_BASE) {
        pushUnique(memory, `base  ${hex(inst.value)}  ${hex(row.pc)}  ${row.text}`);
      }
    } else if (inst.tag === 'inc-pair' && inst.pair === 'hl' && lastKnownHl !== null) {
      lastKnownHl = (lastKnownHl + 1) & 0xFFFFFF;
    } else if (inst.tag === 'dec-pair' && inst.pair === 'hl' && lastKnownHl !== null) {
      lastKnownHl = (lastKnownHl - 1) & 0xFFFFFF;
    } else if (
      inst.tag === 'add-pair' ||
      inst.tag === 'adc-pair' ||
      inst.tag === 'sbc-pair' ||
      inst.tag === 'ex-de-hl' ||
      inst.tag === 'ld-pair-mem' ||
      inst.tag === 'ld-pair-indexed' ||
      inst.tag === 'ld-indexed-pair'
    ) {
      lastKnownHl = null;
    }

    if (inst.tag === 'ld-reg-ind' && inst.src === 'hl' && lastKnownHl !== null) {
      pushUnique(memory, describeMemoryAccess(lastKnownHl, 'read', `${hex(row.pc)}  ${row.text}`));
    }

    if (inst.tag === 'ld-ind-reg' && inst.dest === 'hl' && lastKnownHl !== null) {
      pushUnique(memory, describeMemoryAccess(lastKnownHl, 'write', `${hex(row.pc)}  ${row.text}`));
    }

    if (['ld-pair-indexed', 'ld-indexed-pair', 'ld-reg-ixd', 'ld-ixd-reg', 'indexed-cb-rotate'].includes(inst.tag)) {
      const descriptor = `${upper(inst.indexRegister)}${formatDisp(inst.displacement)}`;
      pushUnique(indexedRefs, descriptor);
    }
  }

  return { calls, branches, returns, io, memory, indexedRefs };
}

function printListing(title, rows, requestedStart = null) {
  console.log(title);
  console.log('-'.repeat(title.length));
  if (requestedStart !== null && rows[0]?.pc < requestedStart) {
    console.log(
      `Requested start ${hex(requestedStart)} falls inside ${hex(rows[0].pc)}  ${rows[0].text}; listing begins at the containing instruction.`,
    );
  }
  for (const row of rows) {
    const marker = row.pc === FOCUS_START ? '>>' : '  ';
    console.log(`${marker} ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}`);
  }
  console.log('');
}

function printAnalysis(analysis) {
  console.log('Static analysis');
  console.log('---------------');

  console.log('Calls:');
  if (analysis.calls.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of analysis.calls) console.log(`  ${entry}`);
  }

  console.log('Branches / loop edges:');
  if (analysis.branches.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of analysis.branches) console.log(`  ${entry}`);
  }

  console.log('Returns:');
  if (analysis.returns.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of analysis.returns) console.log(`  ${entry}`);
  }

  console.log('Port I/O:');
  if (analysis.io.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of analysis.io) console.log(`  ${entry}`);
  }

  console.log('Memory references:');
  if (analysis.memory.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of analysis.memory) console.log(`  ${entry}`);
  }

  console.log('Indexed frame references:');
  if (analysis.indexedRefs.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of analysis.indexedRefs) console.log(`  ${entry}`);
  }

  console.log('');
}

function printSummary() {
  console.log('Summary');
  console.log('-------');
  console.log(
    `${hex(FOCUS_START)} is in the middle of a helper routine, not at a function entry. ` +
    `The current routine returns at ${hex(0x006D6C)} and a new IX-framed routine begins immediately afterward at ${hex(0x006D6D)}.`,
  );
  console.log(
    `The core sequence ${hex(0x006D46)}-${hex(0x006D5B)} performs hardware handshaking: ` +
    `it writes to the BC-selected port, stores ${hexByte(0x0E)} into ${hex(0xD00124)}, then spins on ` +
    `IN A, (BC) / BIT 3, A / JR NZ, ${hex(FOCUS_START)} until the status bit clears.`,
  );
  console.log(
    `After the poll, the code calls ${hex(0x0021C2)} and conditionally jumps back to ${hex(0x006CDF)}, ` +
    `so this looks like an outer wait/retry loop for low-level device setup or transfer completion, not the main OS event loop.`,
  );
}

const focusRows = disassembleRange(FOCUS_START, FOCUS_END_EXCLUSIVE);
const contextRows = disassembleRange(CONTEXT_LISTING_START, CONTEXT_END_EXCLUSIVE);
const analysis = collectStaticAnalysis(contextRows);

printListing(
  `Focused disassembly ${hex(FOCUS_START)}-${hex(FOCUS_END_EXCLUSIVE - 1)}`,
  focusRows,
);
printListing(
  `Surrounding context ${hex(CONTEXT_REQUEST_START)}-${hex(CONTEXT_END_EXCLUSIVE - 1)}`,
  contextRows,
  CONTEXT_REQUEST_START,
);
printAnalysis(analysis);
printSummary();
