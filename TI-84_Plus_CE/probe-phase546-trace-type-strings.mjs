import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const CALL_03EC5A = [0xCD, 0x5A, 0xEC, 0x03];
const DISPATCHER = 0x03EC5A;
const TYPE_TABLE = 0x03ECAD;
const TYPE_STRING_START = 0x03ECFE;
const TYPE_STRING_END = 0x03ED54;

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(addr, len) {
  return Array.from(rom.subarray(addr, Math.min(addr + len, rom.length)), byteHex).join(' ');
}

function formatDecoded(decoded, addr) {
  if (!decoded) {
    return { size: 1, text: '???' };
  }

  const size = decoded.size ?? decoded.length ?? decoded.bytes?.length ?? decoded.raw?.length ?? 1;
  const mnemonic =
    decoded.text ??
    decoded.asm ??
    decoded.mnemonic ??
    (decoded.opcode && decoded.operands ? `${decoded.opcode} ${decoded.operands}` : decoded.opcode) ??
    decoded.toString?.() ??
    '???';

  return {
    size: Number.isFinite(size) && size > 0 ? size : 1,
    text: String(mnemonic).replace(/\s+/g, ' ').trim(),
  };
}

function decodeAt(addr) {
  try {
    return formatDecoded(decodeInstruction(rom, addr), addr);
  } catch (err) {
    return { size: 1, text: `??? ; decode error: ${err.message}` };
  }
}

function disassembleForward(start, instructionCount) {
  const out = [];
  let pc = start;

  for (let i = 0; i < instructionCount && pc < rom.length; i += 1) {
    const decoded = decodeAt(pc);
    out.push({
      addr: pc,
      size: decoded.size,
      bytes: rawBytes(pc, decoded.size),
      text: decoded.text,
    });
    pc += decoded.size;
  }

  return out;
}

function disassembleBefore(callAddr, instructionCount, maxWindow = 80) {
  const windowStart = Math.max(0, callAddr - maxWindow);
  const decoded = [];
  let pc = windowStart;

  while (pc < callAddr) {
    const ins = decodeAt(pc);
    const next = pc + ins.size;

    if (next > callAddr) {
      pc = windowStart + 1;
      decoded.length = 0;
      continue;
    }

    decoded.push({
      addr: pc,
      size: ins.size,
      bytes: rawBytes(pc, ins.size),
      text: ins.text,
    });
    pc = next;
  }

  return decoded.slice(-instructionCount);
}

function findPattern(pattern) {
  const hits = [];

  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let matched = true;

    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }

    if (matched) {
      hits.push(i);
    }
  }

  return hits;
}

function findDirectTypeStringRefs() {
  const refs = [];

  for (let target = TYPE_STRING_START; target <= TYPE_STRING_END; target += 1) {
    const pattern = [target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
    for (const addr of findPattern(pattern)) {
      refs.push({ addr, target });
    }
  }

  refs.sort((a, b) => a.addr - b.addr || a.target - b.target);
  return refs;
}

function classifyInstruction(ins) {
  const text = ins.text.toUpperCase();
  const notes = [];

  if (text.includes('CALL')) {
    if (text.includes('0A1799') || text.includes('0X0A1799')) {
      notes.push('CALL text output candidate 0x0A1799');
    } else {
      notes.push('CALL; check whether callee consumes HL');
    }
  }

  if (/\bPUSH\s+HL\b/.test(text)) {
    notes.push('PUSH HL; returned pointer preserved/passed on stack');
  }

  if (/\bLD\s+\([^)]*\),\s*HL\b/.test(text)) {
    notes.push('LD (addr),HL; returned pointer stored');
  }

  if (/\bEX\b.*\bHL\b/.test(text) || /\bLD\s+(DE|BC|IX|IY),\s*HL\b/.test(text)) {
    notes.push('HL moved to another register');
  }

  if (/\bPOP\s+HL\b/.test(text) || /\bLD\s+HL\b/.test(text)) {
    notes.push('HL overwritten');
  }

  return notes;
}

function printInstructions(instructions) {
  for (const ins of instructions) {
    const notes = classifyInstruction(ins);
    const suffix = notes.length ? `  ; ${notes.join('; ')}` : '';
    console.log(`${hex(ins.addr)}  ${ins.bytes.padEnd(17)}  ${ins.text}${suffix}`);
  }
}

function printDirectRefs(refs) {
  if (refs.length === 0) {
    console.log('No direct 24-bit little-endian references found.');
    return;
  }

  for (const ref of refs) {
    const before = disassembleBefore(ref.addr, 5, 40);
    const after = disassembleForward(ref.addr, 8);

    console.log(`\nReference at ${hex(ref.addr)} to type string ${hex(ref.target)} (${rawBytes(ref.addr, 3)})`);
    console.log('Context before reference:');
    printInstructions(before);
    console.log('Context at/after reference:');
    printInstructions(after);
  }
}

console.log('=== Phase 546: Trace Type String Dispatcher Usage ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Dispatcher: ${hex(DISPATCHER)}`);
console.log(`Type table base: ${hex(TYPE_TABLE)}`);
console.log(`Type string range: ${hex(TYPE_STRING_START)}-${hex(TYPE_STRING_END)}`);
console.log(`CALL pattern: ${CALL_03EC5A.map(byteHex).join(' ')}`);

const callers = findPattern(CALL_03EC5A);

console.log(`\nFound ${callers.length} CALL xrefs to ${hex(DISPATCHER)}:`);
for (const addr of callers) {
  console.log(`- ${hex(addr)}`);
}

for (const callAddr of callers) {
  console.log(`\n=== Caller ${hex(callAddr)} ===`);
  console.log('Before CALL (A/HL setup candidates):');
  printInstructions(disassembleBefore(callAddr, 10));

  console.log('\nCALL and 15 instructions after return (HL use candidates):');
  printInstructions(disassembleForward(callAddr, 16));
}

console.log(`\n=== Direct References to Type String Range ${hex(TYPE_STRING_START)}-${hex(TYPE_STRING_END)} ===`);
printDirectRefs(findDirectTypeStringRefs());
