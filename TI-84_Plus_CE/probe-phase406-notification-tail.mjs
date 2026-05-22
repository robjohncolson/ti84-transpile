#!/usr/bin/env node

import fs from 'node:fs';

process.emitWarning = () => {};

const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const D177B8 = 0xD177B8;
const D177B9 = 0xD177B9;

const RECURSIVE_CALL = 0x049CFE;
const TYPE_COMMIT = 0x049D07;
const LAST_HANDLER = 0x049DE3;
const DEFAULT_HANDLER = 0x049DEC;
const RETURN2_STUB = 0x049DF5;
const COMMON_TAIL = 0x049DF9;
const NEXT_FUNCTION = 0x049E07;
const NEXT_FUNCTION_TABLE = 0x049E1F;
const WINDOW_BYTES = 0x78; // 120 bytes

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function signedDisp(value) {
  if (value >= -128 && value <= 127) return value;
  return (value & 0x80) ? value - 0x100 : value;
}

function formatIndexed(indexRegister, displacement) {
  const disp = signedDisp(Number(displacement) || 0);
  const sign = disp >= 0 ? '+' : '-';
  return `(${String(indexRegister).toUpperCase()}${sign}0x${Math.abs(disp).toString(16).toUpperCase().padStart(2, '0')})`;
}

function formatBytes(addr, length) {
  return Array.from(
    rom.subarray(addr, Math.min(addr + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !inst.length) {
      throw new Error('decoder returned empty instruction');
    }
    return inst;
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
  switch (inst.tag) {
    case 'db':
      return `db ${hexByte(inst.value)}`;
    case 'nop':
      return 'nop';
    case 'di':
      return 'di';
    case 'ei':
      return 'ei';
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${String(inst.condition).toUpperCase()}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${String(inst.indirectRegister).toUpperCase()})`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'push':
      return `push ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `pop ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `ld ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `ld ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `ld ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `ld ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `ld (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `ld ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-sp-pair':
      return `ld sp, ${String(inst.pair).toUpperCase()}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-special':
      return `ld ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `inc ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `dec ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `inc ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `dec ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `add ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `adc hl, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `sbc hl, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return `${String(inst.op).toLowerCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toLowerCase()} ${hexByte(inst.value)}`;
    case 'alu-ixd':
      return `${String(inst.op).toLowerCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ex-sp-pair':
      return `ex (sp), ${String(inst.pair).toUpperCase()}`;
    case 'ex-de-hl':
      return 'ex de, hl';
    case 'lea': {
      const disp = signedDisp(Number(inst.displacement) || 0);
      const sign = disp >= 0 ? '+' : '-';
      return `lea ${String(inst.dest).toUpperCase()}, ${String(inst.base).toUpperCase()}${sign}0x${Math.abs(disp).toString(16).toUpperCase().padStart(2, '0')}`;
    }
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'tag', 'terminates', 'fallthrough']);
      const extras = Object.entries(inst)
        .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
        .map(([key, value]) => {
          if (typeof value === 'number') return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
          return `${key}=${String(value)}`;
        })
        .join(' ');
      return extras ? `${inst.tag} ${extras}` : inst.tag;
    }
  }
}

function renderRow(inst) {
  return `${hex(inst.pc)}  ${formatBytes(inst.pc, inst.length).padEnd(16)}  ${formatInstruction(inst)}`;
}

function decodeSpan(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end && rows.length < 128) {
    const inst = safeDecode(pc);
    rows.push(inst);
    pc = inst.nextPc;
  }
  return rows;
}

function decodeCount(start, count) {
  const rows = [];
  let pc = start;
  for (let i = 0; i < count && pc < rom.length; i += 1) {
    const inst = safeDecode(pc);
    rows.push(inst);
    pc = inst.nextPc;
  }
  return rows;
}

function printBlock(title, rows) {
  console.log(title);
  for (const row of rows) {
    console.log(`  ${renderRow(row)}`);
  }
  console.log();
}

function scanPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let match = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(i);
  }
  return hits;
}

function describeRamAccess(rows) {
  const lines = [];
  for (const row of rows) {
    if (row.tag === 'ld-mem-reg' || row.tag === 'ld-mem-pair') {
      lines.push(`WRITE ${hex(row.addr)} @ ${hex(row.pc)}`);
    }
    if (row.tag === 'ld-reg-mem' || row.tag === 'ld-pair-mem') {
      lines.push(`READ ${hex(row.addr)} @ ${hex(row.pc)}`);
    }
  }
  return lines;
}

function dumpRawWindow(start, size) {
  console.log(`Raw ${size}-byte window from ${hex(start)}:`);
  for (let offset = 0; offset < size; offset += 16) {
    const addr = start + offset;
    const len = Math.min(16, size - offset);
    console.log(`  ${hex(addr)}  ${formatBytes(addr, len)}`);
  }
  console.log();
}

const lastHandlerRows = decodeCount(LAST_HANDLER, 3);
const defaultHandlerRows = decodeCount(DEFAULT_HANDLER, 3);
const return2StubRows = decodeCount(RETURN2_STUB, 1);
const typeCommitRows = decodeSpan(0x049CFE, 0x049D0D);
const interruptSaveRows = decodeCount(0x049CD6, 3);
const tailRows = decodeSpan(COMMON_TAIL, NEXT_FUNCTION);
const nextFunctionRows = decodeSpan(NEXT_FUNCTION, NEXT_FUNCTION_TABLE);
const helper12CRows = decodeCount(0x00012C, 1);
const helper124Rows = decodeCount(0x000124, 1);
const resolved12CRows = decodeCount(0x002197, 8);
const resolved124Rows = decodeCount(0x00211B, 12);

const d177b9WriteSites = scanPattern([0x32, 0xB9, 0x77, 0xD1]);
const callRowsInTrueTail = tailRows.filter((row) => row.tag === 'call' || row.tag === 'call-conditional');
const callRowsInForwardCode = nextFunctionRows.filter((row) => row.tag === 'call' || row.tag === 'call-conditional');

console.log('=== Phase 406: Notification Common Tail ===');
console.log(`ROM bytes loaded from TI-84_Plus_CE/ROM.rom (${rom.length} bytes)`);
console.log();

printBlock('Last explicit handler (state 0x18) flowing into the tail:', lastHandlerRows);
printBlock('Table default handler (same payload store):', defaultHandlerRows);
printBlock('Adjacent return-2 stub beside the tail:', return2StubRows);

printBlock('Earlier recursive/state-commit snippet:', typeCommitRows);
console.log(`  Recursive self-call is at ${hex(RECURSIVE_CALL)}`);
console.log(`  Type commit is at ${hex(TYPE_COMMIT)} -> LD (${hex(D177B9)}), A`);
console.log();

printBlock('Interrupt-save setup at function entry:', interruptSaveRows);
console.log('  ED 57 / PUSH AF / DI is the save half of the later POP AF / JP PO / EI restore pattern.');
console.log();

printBlock('True common tail (0x049DF9..0x049E06):', tailRows);
console.log('Findings for the true tail:');
console.log(`  Writes ${hex(D177B9)}? ${tailRows.some((row) => (row.tag === 'ld-mem-reg' || row.tag === 'ld-mem-pair') && row.addr === D177B9) ? 'YES' : 'NO'}`);
console.log(`  Writes ${hex(D177B8)}? ${tailRows.some((row) => (row.tag === 'ld-mem-reg' || row.tag === 'ld-mem-pair') && row.addr === D177B8) ? 'YES' : 'NO'}`);
console.log(`  Calls back into recursive flush? ${callRowsInTrueTail.length > 0 ? 'YES' : 'NO'}`);
console.log(`  Interrupt restore pattern present? ${tailRows.some((row) => row.tag === 'pop' && row.pair === 'af') && tailRows.some((row) => row.tag === 'jp-conditional' && row.condition === 'po') && tailRows.some((row) => row.tag === 'ei') ? 'YES' : 'NO'}`);
console.log('  Return value source: A <- (IX-1) at 0x049DFF');
console.log(`  Global RAM accesses in true tail: ${describeRamAccess(tailRows).length ? describeRamAccess(tailRows).join(', ') : 'none'}`);
console.log();

console.log(`Direct ROM scan for "LD (${hex(D177B9)}),A" found: ${d177b9WriteSites.map((addr) => hex(addr)).join(', ')}`);
console.log('This confirms the flash copy already writes the type byte before the payload-store handlers run.');
console.log();

printBlock('Code that starts immediately after the tail (0x049E07..0x049E1E):', nextFunctionRows);
console.log('  Note: 0x049E07 is a separate function. The bytes at 0x049E1F and later are inline _seqcase data for that next function,');
console.log('  so they are inside the 120-byte forward window but are not part of the common tail itself.');
console.log();

console.log('CALL targets visible in the 120-byte forward window:');
for (const row of callRowsInForwardCode) {
  console.log(`  ${hex(row.pc)} -> ${hex(row.target)}`);
}
console.log();

printBlock('CALL 0x00012C trampoline:', helper12CRows);
printBlock('Resolved helper behind 0x00012C (0x002197):', resolved12CRows);
printBlock('CALL 0x000124 trampoline:', helper124Rows);
printBlock('Resolved helper behind 0x000124 (0x00211B):', resolved124Rows);

dumpRawWindow(COMMON_TAIL, WINDOW_BYTES);

console.log('Summary:');
console.log(`  1. ${hex(COMMON_TAIL)} is a 14-byte shared epilogue, not another dispatcher.`);
console.log(`  2. It does not write ${hex(D177B9)}; the flash dispatcher already committed the type at ${hex(TYPE_COMMIT)}.`);
console.log(`  3. It does not recurse or call helpers; the recursive flush happened earlier at ${hex(RECURSIVE_CALL)}.`);
console.log('  4. It conditionally restores interrupts with POP AF / JP PO / EI.');
console.log('  5. It returns A from (IX-1), tears down the IX frame, and RETs.');
console.log('  6. The only CALLs in the requested forward window belong to the next function that starts at 0x049E07.');
