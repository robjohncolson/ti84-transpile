import fs from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const TARGET = [0xD2, 0x25, 0xD0];
const TARGET_ADDR = 0xD025D2;
const WINDOW = 20;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function read24(offset) {
  if (offset < 0 || offset + 2 >= rom.length) return null;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function bytesAt(start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rom.length, safeStart + length);
  return Array.from(rom.subarray(safeStart, safeEnd), byteHex).join(' ');
}

function contextBytes(offset) {
  const start = Math.max(0, offset - WINDOW);
  const end = Math.min(rom.length, offset + TARGET.length + WINDOW);
  return Array.from(rom.subarray(start, end), byteHex).join(' ');
}

function findPreviousLdHlImmediate(offset) {
  const searchStart = Math.max(0, offset - 16);
  for (let pos = offset - 4; pos >= searchStart; pos--) {
    if (rom[pos] === 0x21) {
      const value = read24(pos + 1);
      return { address: pos, value };
    }
  }
  return null;
}

function findPreviousLdAImmediate(offset) {
  const searchStart = Math.max(0, offset - 8);
  for (let pos = offset - 2; pos >= searchStart; pos--) {
    if (rom[pos] === 0x3E) {
      return { address: pos, value: rom[pos + 1] };
    }
  }
  return null;
}

function decodeReference(offset) {
  const p1 = offset - 1;
  const p2 = offset - 2;
  let type = 'RAW';
  let instruction = 'raw D2 25 D0';
  let writeValue = null;
  let confidence = 'pattern only';

  if (p1 >= 0) {
    const op = rom[p1];
    if (op === 0x21) {
      type = 'POINTER';
      instruction = 'LD HL,0xD025D2';
      confidence = 'exact opcode';
    } else if (op === 0x22) {
      type = 'WRITE';
      instruction = 'LD (0xD025D2),HL';
      confidence = 'exact opcode';
      writeValue = findPreviousLdHlImmediate(p1);
    } else if (op === 0x3A) {
      type = 'READ';
      instruction = 'LD A,(0xD025D2)';
      confidence = 'exact opcode';
    } else if (op === 0x32) {
      type = 'WRITE';
      instruction = 'LD (0xD025D2),A';
      confidence = 'exact opcode';
      writeValue = findPreviousLdAImmediate(p1);
    } else if (op === 0x2A) {
      type = 'READ';
      instruction = 'LD HL,(0xD025D2)';
      confidence = 'exact opcode';
    }
  }

  if (p2 >= 0 && rom[p2] === 0xED && rom[p2 + 1] === 0x23) {
    type = 'WRITE';
    instruction = 'ED 23 D2 25 D0 / LD (0xD025D2),HL';
    confidence = 'exact opcode';
    writeValue = findPreviousLdHlImmediate(p2);
  }

  return { type, instruction, writeValue, confidence };
}

function scanReferences() {
  const refs = [];
  for (let offset = 0; offset <= rom.length - TARGET.length; offset++) {
    if (
      rom[offset] === TARGET[0] &&
      rom[offset + 1] === TARGET[1] &&
      rom[offset + 2] === TARGET[2]
    ) {
      refs.push({ offset, ...decodeReference(offset) });
    }
  }
  return refs;
}

function printReference(ref, index) {
  const instructionAddress =
    ref.instruction.startsWith('ED 23') ? ref.offset - 2 :
    ref.type === 'RAW' ? ref.offset :
    ref.offset - 1;

  console.log(`\n[${index + 1}] ${hex(instructionAddress)} ${ref.type} ${ref.instruction}`);
  console.log(`    target bytes at ${hex(ref.offset)} (${ref.confidence})`);
  console.log(`    bytes -20/+20: ${contextBytes(ref.offset)}`);

  if (ref.type === 'WRITE') {
    if (ref.writeValue && ref.writeValue.value !== null) {
      const width = ref.writeValue.value > 0xFF ? 6 : 2;
      const source =
        ref.writeValue.value > 0xFF
          ? `LD HL,${hex(ref.writeValue.value)} at ${hex(ref.writeValue.address)}`
          : `LD A,0x${byteHex(ref.writeValue.value)} at ${hex(ref.writeValue.address)}`;
      console.log(`    inferred write value: ${hex(ref.writeValue.value, width)} from ${source}`);
    } else {
      console.log('    inferred write value: unknown from local context');
    }
  }
}

function summarize(refs) {
  const counts = new Map();
  const dispatchTargets = [];

  for (const ref of refs) {
    counts.set(ref.type, (counts.get(ref.type) || 0) + 1);
    if (ref.type === 'WRITE' && ref.writeValue && ref.writeValue.value !== null && ref.writeValue.value > 0xFF) {
      dispatchTargets.push({
        writeAt: ref.instruction.startsWith('ED 23') ? ref.offset - 2 : ref.offset - 1,
        sourceAt: ref.writeValue.address,
        target: ref.writeValue.value,
      });
    }
  }

  console.log('\n=== Counts ===');
  for (const type of ['READ', 'WRITE', 'POINTER', 'RAW']) {
    console.log(`${type.padEnd(7)} ${counts.get(type) || 0}`);
  }
  console.log(`TOTAL   ${refs.length}`);

  console.log('\n=== Dispatch Targets Written to D025D2 ===');
  if (dispatchTargets.length === 0) {
    console.log('No 24-bit LD HL,<addr> -> LD (D025D2),HL targets inferred from the local scan window.');
  } else {
    for (const target of dispatchTargets) {
      console.log(`${hex(target.target)} written at ${hex(target.writeAt)} (source ${hex(target.sourceAt)})`);
    }
  }

  console.log('\n=== Dispatch Mechanism Summary ===');
  console.log(`RAM ${hex(TARGET_ADDR)} is used as a 24-bit function pointer slot.`);
  console.log('The known dispatcher reads it with LD HL,(D025D2), swaps it onto the return stack with EX (SP),HL, then RET jumps indirectly to the stored target.');
  console.log('WRITE rows above identify code paths that update the slot; inferred 24-bit write values are the indirect dispatch destinations.');
  console.log('POINTER rows load the address of the slot for indirect access and should be inspected when no nearby direct write is visible.');
}

console.log(`Scanning ${ROM_PATH} (${rom.length} bytes) for references to ${hex(TARGET_ADDR)} / ${TARGET.map(byteHex).join(' ')}...`);
console.log(`Opcode checks include: 21/22/3A/32/2A ${TARGET.map(byteHex).join(' ')} and ED 23 ${TARGET.map(byteHex).join(' ')}.`);

const refs = scanReferences();
refs.forEach(printReference);
summarize(refs);
