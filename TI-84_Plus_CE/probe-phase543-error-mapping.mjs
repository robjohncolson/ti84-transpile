import fs from 'fs';
const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const hex = (value, width = 2) =>
  `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;

const ERROR_CONVERTER = 0x08356A;
const DISPATCH_TABLE = 0x061D00;
const POINTER_TABLE = 0x062290;
const POINTER_COUNT = 19;
const DISPATCH_ENTRY_COUNT = 44;
const KNOWN_MAPPINGS = new Map([
  [0x84, 28],
  [0x88, 32],
  [0x8C, 36],
  [0x8D, 37],
  [0x8E, 38],
  [0x8F, 39],
  [0x93, 42],
  [0x94, 43],
]);

// Minimal inline disassembler for common Z80/eZ80 opcodes (the main decoder
// returns stubs for un-lifted regions, so we decode manually here).
function simpleDisasm(pc) {
  const op = rom[pc];
  switch (op) {
    case 0x3E: return { len: 2, asm: `LD A, ${hex(rom[pc + 1])}` };
    case 0x3D: return { len: 1, asm: 'DEC A' };
    case 0xC9: return { len: 1, asm: 'RET' };
    case 0xFE: return { len: 2, asm: `CP ${hex(rom[pc + 1])}` };
    case 0x18: {
      const off = rom[pc + 1] > 127 ? rom[pc + 1] - 256 : rom[pc + 1];
      return { len: 2, asm: `JR ${hex(pc + 2 + off, 6)}` };
    }
    case 0x20: {
      const off = rom[pc + 1] > 127 ? rom[pc + 1] - 256 : rom[pc + 1];
      return { len: 2, asm: `JR NZ, ${hex(pc + 2 + off, 6)}` };
    }
    case 0x28: {
      const off = rom[pc + 1] > 127 ? rom[pc + 1] - 256 : rom[pc + 1];
      return { len: 2, asm: `JR Z, ${hex(pc + 2 + off, 6)}` };
    }
    case 0xD6: return { len: 2, asm: `SUB ${hex(rom[pc + 1])}` };
    case 0xC6: return { len: 2, asm: `ADD A, ${hex(rom[pc + 1])}` };
    case 0xE6: return { len: 2, asm: `AND ${hex(rom[pc + 1])}` };
    case 0xC3: {
      const target = rom[pc + 1] | (rom[pc + 2] << 8) | (rom[pc + 3] << 16);
      return { len: 4, asm: `JP ${hex(target, 6)}` };
    }
    case 0xAF: return { len: 1, asm: 'XOR A' };
    case 0xD0: return { len: 1, asm: 'RET NC' };
    case 0xD8: return { len: 1, asm: 'RET C' };
    case 0x30: {
      const off = rom[pc + 1] > 127 ? rom[pc + 1] - 256 : rom[pc + 1];
      return { len: 2, asm: `JR NC, ${hex(pc + 2 + off, 6)}` };
    }
    case 0x38: {
      const off = rom[pc + 1] > 127 ? rom[pc + 1] - 256 : rom[pc + 1];
      return { len: 2, asm: `JR C, ${hex(pc + 2 + off, 6)}` };
    }
    default: return { len: 1, asm: `DB ${hex(op)}` };
  }
}

function disassemble(addr, maxInstructions, stopAddr = 0) {
  let pc = addr;
  for (let i = 0; i < maxInstructions; i += 1) {
    if (stopAddr && pc >= stopAddr) break;
    const instr = simpleDisasm(pc);
    const rawBytes = Array.from(rom.slice(pc, pc + instr.len));
    const bytesHex = rawBytes.map((b) => hex(b)).join(' ');
    console.log(`${hex(pc, 6)}  ${bytesHex.padEnd(18)}  ${instr.asm}`);
    pc += instr.len;
  }
}

function readPointerTable() {
  const pointers = [];
  for (let index = 0; index < POINTER_COUNT; index += 1) {
    const base = POINTER_TABLE + index * 3;
    const ptr = rom[base] | (rom[base + 1] << 8) | (rom[base + 2] << 16);
    pointers.push(ptr);
  }
  return pointers;
}

function readDispatchTable() {
  // The dispatch table region at 0x061D00 contains:
  //   - An initial JR (0x18) that jumps over the first batch
  //   - Entries of the form: LD A,N (3E xx) followed by JR (18 yy) or JP (C3 ll mm hh)
  //   - All branches converge on the shared handler at 0x061DB2
  // Scan the region for all 0x3E opcodes to extract error codes.
  const entries = [];
  const TABLE_START = DISPATCH_TABLE;
  const TABLE_END = 0x061DB2; // shared handler starts here

  let pc = TABLE_START;
  let entryIndex = 0;

  while (pc < TABLE_END) {
    const opcode = rom[pc];

    if (opcode === 0x3E) {
      // LD A, N
      const code = rom[pc + 1];
      const branchAddr = pc + 2;
      const branchOpcode = rom[branchAddr];
      let branchAsm = '';
      let entryLen = 0;

      if (branchOpcode === 0x18) {
        // JR offset (2 bytes)
        const offset = rom[branchAddr + 1];
        const signedOffset = offset > 127 ? offset - 256 : offset;
        const target = branchAddr + 2 + signedOffset;
        branchAsm = `JR ${hex(target, 6)}`;
        entryLen = 4; // 3E xx 18 yy
      } else if (branchOpcode === 0xC3) {
        // JP addr (4 bytes: C3 ll mm hh)
        const target = rom[branchAddr + 1] | (rom[branchAddr + 2] << 8) | (rom[branchAddr + 3] << 16);
        branchAsm = `JP ${hex(target, 6)}`;
        entryLen = 6; // 3E xx C3 ll mm hh
      } else {
        branchAsm = `??? opcode ${hex(branchOpcode)}`;
        entryLen = 2; // just the LD A,N
      }

      entries.push({
        index: entryIndex,
        address: pc,
        code,
        branchAsm,
        length: entryLen,
      });
      entryIndex += 1;
      pc += entryLen;
    } else if (opcode === 0x18) {
      // JR — skip over (initial jump or inter-entry padding)
      pc += 2;
    } else {
      // Unknown opcode, advance 1
      console.log(`  Unknown opcode ${hex(opcode)} at ${hex(pc, 6)}, skipping`);
      pc += 1;
    }
  }

  return entries;
}

function inferLinearFormula(entries) {
  if (entries.length === 0) return { bestDelta: 0, bestCount: 0, mismatches: [] };

  const deltas = entries.map((entry) => entry.code - entry.index);
  const counts = new Map();
  for (const delta of deltas) {
    counts.set(delta, (counts.get(delta) ?? 0) + 1);
  }

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const [bestDelta, bestCount] = sorted[0];
  const mismatches = entries.filter((entry) => entry.code - bestDelta !== entry.index);

  return { bestDelta, bestCount, mismatches };
}

console.log('=== Disassembly at 0x08356A (error offset converter) ===');
// This function has multiple early RET branches; disassemble until 0x08359B
disassemble(ERROR_CONVERTER, 50, 0x08359B);

console.log(`\n=== Error string pointer table at ${hex(POINTER_TABLE, 6)} (${POINTER_COUNT} entries) ===`);
const pointers = readPointerTable();
for (let index = 0; index < pointers.length; index += 1) {
  const ptr = pointers[index];
  // Read null-terminated string at pointer
  let str = '';
  for (let j = 0; j < 40; j++) {
    const ch = rom[ptr + j];
    if (ch === 0) break;
    str += String.fromCharCode(ch);
  }
  console.log(`index ${index.toString().padStart(2, ' ')} -> ${hex(ptr, 6)}  "${str}"`);
}

console.log('\n=== Error dispatch table at 0x061D00 ===');
const entries = readDispatchTable();
for (const entry of entries) {
  // Try to map error code to pointer table index via the converter at 0x08356A
  const ptrIndex = entry.code < POINTER_COUNT ? entry.code : null;
  const knownIndex = KNOWN_MAPPINGS.get(entry.code);
  const knownText =
    knownIndex === undefined
      ? ''
      : ` known=${knownIndex}`;

  console.log(
    [
      `entry ${entry.index.toString().padStart(2, ' ')}`,
      `@ ${hex(entry.address, 6)}`,
      `code ${hex(entry.code)} (${entry.code.toString().padStart(3)})`,
      `${entry.branchAsm}`,
      `len=${entry.length}`,
      knownText,
    ].join(' | '),
  );
}

console.log('\n=== Formula checks ===');
const formula = inferLinearFormula(entries);
console.log(
  `Most common linear mapping: table_index = error_code - ${hex(formula.bestDelta)} ` +
    `(${formula.bestCount}/${entries.length} dispatch entries)`,
);

if (formula.mismatches.length === 0) {
  console.log('All dispatch entries match the inferred linear mapping.');
} else {
  console.log('Dispatch entries that do not match the inferred linear mapping:');
  for (const entry of formula.mismatches) {
    console.log(
      `  entry ${entry.index}: code ${hex(entry.code)} -> code-${hex(formula.bestDelta)}=${entry.code - formula.bestDelta}`,
    );
  }
}

console.log('\nKnown SDK mapping verification:');
for (const [code, expectedIndex] of KNOWN_MAPPINGS) {
  const dispatchEntry = entries.find((entry) => entry.code === code);
  const computedIndex = code - 0x68;
  const dispatchText = dispatchEntry
    ? `dispatch entry=${dispatchEntry.index}`
    : 'dispatch entry=not found';
  const computedText =
    computedIndex >= 0 && computedIndex < DISPATCH_ENTRY_COUNT ? `code-0x68=${computedIndex}` : `code-0x68=${computedIndex} invalid`;
  const status = dispatchEntry?.index === expectedIndex && computedIndex === expectedIndex ? 'OK' : 'CHECK';
  console.log(
    `  code ${hex(code)} expected=${expectedIndex} | ${dispatchText} | ${computedText} | ${status}`,
  );
}
