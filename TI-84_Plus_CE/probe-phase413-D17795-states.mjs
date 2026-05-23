import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TARGET_ADDRESS = 0xD17795;
const TARGET_BYTES = [0x95, 0x77, 0xD1];
const SCAN_START = 0x000000;
const SCAN_END = 0x3FFFFF;
const LOOKBACK_BYTES = 10;
const LOOKAHEAD_BYTES = 10;

function hex(value, width) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function hexWord24(value) {
  return hex(value & 0xFFFFFF, 6);
}

function formatBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
}

function makeContextWindow(rom, pc, length) {
  const start = Math.max(0, pc - 6);
  const end = Math.min(rom.length, pc + length + 10);
  return {
    start: hexWord24(start),
    end: hexWord24(end - 1),
    bytes: formatBytes(rom.subarray(start, end)),
  };
}

function classifyReference(rom, addressByteIndex) {
  const prev1 = addressByteIndex > 0 ? rom[addressByteIndex - 1] : -1;
  const prev2 = addressByteIndex > 1 ? rom[addressByteIndex - 2] : -1;

  if (prev1 === 0x32) {
    return {
      direction: 'write',
      opcode: 'LD (nn),A',
      register: 'A',
      widthBytes: 1,
      pc: addressByteIndex - 1,
      length: 4,
    };
  }

  if (prev1 === 0x3A) {
    return {
      direction: 'read',
      opcode: 'LD A,(nn)',
      register: 'A',
      widthBytes: 1,
      pc: addressByteIndex - 1,
      length: 4,
    };
  }

  if (prev2 === 0xED && prev1 === 0x43) {
    return {
      direction: 'write',
      opcode: 'LD (nn),BC',
      register: 'BC',
      widthBytes: 3,
      pc: addressByteIndex - 2,
      length: 5,
    };
  }

  if (prev2 === 0xED && prev1 === 0x63) {
    return {
      direction: 'write',
      opcode: 'LD (nn),HL',
      register: 'HL',
      widthBytes: 3,
      pc: addressByteIndex - 2,
      length: 5,
    };
  }

  if (prev2 === 0xED && prev1 === 0x73) {
    return {
      direction: 'write',
      opcode: 'LD (nn),SP',
      register: 'SP',
      widthBytes: 3,
      pc: addressByteIndex - 2,
      length: 5,
    };
  }

  if (prev2 === 0xED && prev1 === 0x4B) {
    return {
      direction: 'read',
      opcode: 'LD BC,(nn)',
      register: 'BC',
      widthBytes: 3,
      pc: addressByteIndex - 2,
      length: 5,
    };
  }

  if (prev2 === 0xED && prev1 === 0x6B) {
    return {
      direction: 'read',
      opcode: 'LD HL,(nn)',
      register: 'HL',
      widthBytes: 3,
      pc: addressByteIndex - 2,
      length: 5,
    };
  }

  if (prev2 === 0xED && prev1 === 0x7B) {
    return {
      direction: 'read',
      opcode: 'LD SP,(nn)',
      register: 'SP',
      widthBytes: 3,
      pc: addressByteIndex - 2,
      length: 5,
    };
  }

  return {
    direction: 'unknown',
    opcode: 'unsupported-literal-reference',
    register: null,
    widthBytes: 0,
    pc: addressByteIndex,
    length: 3,
  };
}

function inferWriteValue(rom, referencePc, register) {
  if (register !== 'A') {
    return {
      value: null,
      kind: 'non-a-store',
      sourcePc: null,
      summary: `Store uses ${register}; this probe only infers literal byte values for A stores.`,
    };
  }

  const minPc = Math.max(0, referencePc - LOOKBACK_BYTES);
  for (let pc = referencePc - 1; pc >= minPc; pc -= 1) {
    const opcode = rom[pc];
    if (opcode === 0x3E && pc + 1 < referencePc) {
      const value = rom[pc + 1];
      return {
        value,
        kind: 'ld-a-immediate',
        sourcePc: pc,
        summary: `LD A,${hexByte(value)}`,
      };
    }

    if (opcode === 0xAF) {
      return {
        value: 0,
        kind: 'xor-a',
        sourcePc: pc,
        summary: 'XOR A',
      };
    }

    if (opcode === 0xB7) {
      return {
        value: null,
        kind: 'or-a',
        sourcePc: pc,
        summary: 'OR A (value depends on incoming A)',
      };
    }
  }

  return {
    value: null,
    kind: 'unresolved',
    sourcePc: null,
    summary: `No LD A,n / XOR A / OR A found within ${LOOKBACK_BYTES} bytes.`,
  };
}

function inferReadChecks(rom, referencePc, length) {
  const checks = [];
  const start = referencePc + length;
  const end = Math.min(rom.length, start + LOOKAHEAD_BYTES + 1);

  for (let pc = start; pc < end; pc += 1) {
    const opcode = rom[pc];

    if (opcode === 0xFE && pc + 1 < rom.length) {
      const value = rom[pc + 1];
      checks.push({
        kind: 'cp-immediate',
        pc: hexWord24(pc),
        value: hexByte(value),
        numericValue: value,
        summary: `CP ${hexByte(value)}`,
      });
      pc += 1;
      continue;
    }

    if (opcode === 0xB7) {
      checks.push({
        kind: 'zero-check',
        pc: hexWord24(pc),
        value: hexByte(0),
        numericValue: 0,
        summary: 'OR A',
      });
    }
  }

  return checks;
}

function buildStateTable(references) {
  const states = new Map();

  function ensureState(value) {
    const key = hexByte(value);
    if (!states.has(key)) {
      states.set(key, {
        value: key,
        numericValue: value,
        writers: [],
        readers: [],
      });
    }
    return states.get(key);
  }

  for (const reference of references) {
    if (reference.direction === 'write' && typeof reference.writtenValueNumeric === 'number') {
      const state = ensureState(reference.writtenValueNumeric);
      state.writers.push({
        pc: reference.pc,
        opcode: reference.opcode,
        sourcePc: reference.writeSource ? reference.writeSource.pc : null,
        sourceKind: reference.writeSource ? reference.writeSource.kind : null,
      });
    }

    if (reference.direction === 'read') {
      for (const check of reference.checks) {
        if (typeof check.numericValue !== 'number') {
          continue;
        }
        const state = ensureState(check.numericValue);
        state.readers.push({
          pc: reference.pc,
          opcode: reference.opcode,
          comparisonPc: check.pc,
          comparisonKind: check.kind,
        });
      }
    }
  }

  return Array.from(states.values())
    .sort((left, right) => left.numericValue - right.numericValue)
    .map(({ numericValue, ...state }) => state);
}

const rom = fs.readFileSync(ROM_PATH);
const references = [];

for (let offset = SCAN_START; offset <= Math.min(SCAN_END, rom.length - 1) - 2; offset += 1) {
  if (
    rom[offset] === TARGET_BYTES[0] &&
    rom[offset + 1] === TARGET_BYTES[1] &&
    rom[offset + 2] === TARGET_BYTES[2]
  ) {
    const reference = classifyReference(rom, offset);
    const entry = {
      pc: hexWord24(reference.pc),
      direction: reference.direction,
      opcode: reference.opcode,
      register: reference.register,
      widthBytes: reference.widthBytes,
      address: hexWord24(TARGET_ADDRESS),
      addressBytesOffset: hexWord24(offset),
      instructionLength: reference.length,
      context: makeContextWindow(rom, reference.pc, reference.length),
    };

    if (reference.direction === 'write') {
      const writeSource = inferWriteValue(rom, reference.pc, reference.register);
      entry.writeSource = {
        kind: writeSource.kind,
        pc: writeSource.sourcePc === null ? null : hexWord24(writeSource.sourcePc),
        summary: writeSource.summary,
      };
      entry.writtenValue = writeSource.value === null ? null : hexByte(writeSource.value);
      entry.writtenValueNumeric = writeSource.value;
    }

    if (reference.direction === 'read') {
      const checks = inferReadChecks(rom, reference.pc, reference.length);
      entry.checks = checks;
      entry.checkedValues = Array.from(
        new Set(checks.map((check) => check.value)),
      );
    }

    references.push(entry);
  }
}

const writeValues = Array.from(
  new Set(
    references
      .filter((reference) => reference.direction === 'write' && reference.writtenValue !== null)
      .map((reference) => reference.writtenValue),
  ),
).sort((left, right) => parseInt(left, 16) - parseInt(right, 16));

const checkedValues = Array.from(
  new Set(
    references
      .filter((reference) => reference.direction === 'read')
      .flatMap((reference) => reference.checkedValues || []),
  ),
).sort((left, right) => parseInt(left, 16) - parseInt(right, 16));

const wideReferences = references.filter((reference) => reference.widthBytes > 1);

const result = {
  probe: 'probe-phase413-D17795-states.mjs',
  romPath: ROM_PATH.replace(/\\/g, '/'),
  romSize: rom.length,
  expectedRomSize: 0x400000,
  targetAddress: hexWord24(TARGET_ADDRESS),
  targetBytesLittleEndian: TARGET_BYTES.map((value) => hexByte(value)),
  scanRange: {
    start: hexWord24(SCAN_START),
    end: hexWord24(Math.min(SCAN_END, rom.length - 1)),
  },
  counts: {
    rawLiteralHits: references.length,
    writes: references.filter((reference) => reference.direction === 'write').length,
    reads: references.filter((reference) => reference.direction === 'read').length,
    unknown: references.filter((reference) => reference.direction === 'unknown').length,
  },
  stateMachine: {
    observedWriteValues: writeValues,
    observedCheckedValues: checkedValues,
    states: buildStateTable(references),
    decisionGroups: references
      .filter((reference) => reference.direction === 'read')
      .map((reference) => ({
        pc: reference.pc,
        opcode: reference.opcode,
        checkedValues: reference.checkedValues || [],
        checks: reference.checks || [],
      })),
    notes: [
      'All classified hits are absolute byte loads/stores on D17795.',
      wideReferences.length === 0
        ? 'No LD (D17795),BC/HL/SP or matching wide readers were found in this ROM image.'
        : `Wide references were found at: ${wideReferences.map((reference) => reference.pc).join(', ')}`,
      `Write-value inference only looks ${LOOKBACK_BYTES} bytes backward for LD A,n / XOR A / OR A.`,
      `Read-check inference only looks ${LOOKAHEAD_BYTES} bytes forward for CP n and OR A zero-checks.`,
    ],
  },
  references,
};

console.log(JSON.stringify(result, null, 2));
