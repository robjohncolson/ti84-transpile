import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const TARGET = 0x02398e;
const PATTERNS = [
  { name: 'CALL 0x02398E', bytes: [0xcd, 0x8e, 0x39, 0x02] },
  { name: 'CALL NZ,0x02398E', bytes: [0xc4, 0x8e, 0x39, 0x02] },
  { name: 'CALL Z,0x02398E', bytes: [0xca, 0x8e, 0x39, 0x02] },
  { name: 'CALL C,0x02398E', bytes: [0xcc, 0x8e, 0x39, 0x02] },
];

const SUBSYSTEMS = [
  {
    name: 'Core OS / tokenizer',
    start: 0x020000,
    end: 0x02ffff,
  },
  {
    name: 'Error handling / system',
    start: 0x030000,
    end: 0x03ffff,
  },
  {
    name: 'Memory management',
    start: 0x040000,
    end: 0x04ffff,
  },
  {
    name: 'Variable/equation system',
    start: 0x050000,
    end: 0x06ffff,
  },
  {
    name: 'Math/FPU / display',
    start: 0x070000,
    end: 0x08ffff,
  },
  {
    name: 'Graph/app/extended display',
    start: 0x090000,
    end: 0x0bffff,
  },
];

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(address, length) {
  return Array.from(rom.subarray(address, Math.min(address + length, rom.length)))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function normalizeDecoded(address, decoded) {
  if (!decoded) {
    return {
      address,
      length: 1,
      text: `DB ${bytesAt(address, 1)}`,
    };
  }

  if (typeof decoded === 'string') {
    return {
      address,
      length: 1,
      text: decoded,
    };
  }

  const length =
    decoded.length ??
    decoded.size ??
    decoded.bytes?.length ??
    decoded.rawBytes?.length ??
    decoded.raw?.length ??
    1;

  const text =
    decoded.text ??
    decoded.asm ??
    decoded.disasm ??
    decoded.instruction ??
    [decoded.mnemonic, decoded.operands].filter(Boolean).join(' ') ??
    `DB ${bytesAt(address, length)}`;

  return {
    address,
    length: Math.max(1, Number(length) || 1),
    text,
  };
}

function decodeAt(address) {
  try {
    return normalizeDecoded(address, decodeInstruction(rom, address));
  } catch (firstError) {
    try {
      return normalizeDecoded(address, decodeInstruction(rom.subarray(address), address));
    } catch (secondError) {
      try {
        return normalizeDecoded(address, decodeInstruction(rom.subarray(address)));
      } catch (thirdError) {
        return normalizeDecoded(address, null);
      }
    }
  }
}

function disassembleForward(start, stop) {
  const instructions = [];
  let pc = Math.max(0, start);

  while (pc < stop && pc < rom.length) {
    const decoded = decodeAt(pc);
    instructions.push(decoded);
    pc += decoded.length;
  }

  return instructions;
}

function disassembleBefore(address, count) {
  const start = Math.max(0, address - 48);
  const decoded = disassembleForward(start, address).filter((instruction) => {
    return instruction.address + instruction.length <= address;
  });

  return decoded.slice(-count);
}

function disassembleAfter(address, count) {
  const instructions = [];
  let pc = address + 4;

  while (instructions.length < count && pc < rom.length) {
    const decoded = decodeAt(pc);
    instructions.push(decoded);
    pc += decoded.length;
  }

  return instructions;
}

function subsystemFor(address) {
  return (
    SUBSYSTEMS.find((subsystem) => {
      return address >= subsystem.start && address <= subsystem.end;
    }) ?? {
      name: 'Other / uncategorized',
      start: 0x000000,
      end: 0x3fffff,
    }
  );
}

function matchesPattern(address, pattern) {
  return pattern.bytes.every((byte, index) => rom[address + index] === byte);
}

function findCallers() {
  const callers = [];

  for (let address = 0; address <= Math.min(0x3fffff, rom.length - 4); address += 1) {
    for (const pattern of PATTERNS) {
      if (matchesPattern(address, pattern)) {
        callers.push({
          address,
          pattern: pattern.name,
          subsystem: subsystemFor(address).name,
        });
      }
    }
  }

  return callers.sort((a, b) => a.address - b.address);
}

function printInstruction(instruction, marker = '   ') {
  const rawBytes = bytesAt(instruction.address, instruction.length).padEnd(14, ' ');
  console.log(`${marker} ${hex(instruction.address)}  ${rawBytes}  ${instruction.text}`);
}

function printCaller(caller, index) {
  console.log(`\n[${index + 1}] ${hex(caller.address)}  ${caller.pattern}`);
  console.log(`    Subsystem: ${caller.subsystem}`);
  console.log('    Context:');

  for (const instruction of disassembleBefore(caller.address, 5)) {
    printInstruction(instruction);
  }

  printInstruction({
    address: caller.address,
    length: 4,
    text: caller.pattern,
  }, '=>');

  for (const instruction of disassembleAfter(caller.address, 5)) {
    printInstruction(instruction);
  }
}

function printPatternSummary(callers) {
  console.log('\nPattern summary:');
  for (const pattern of PATTERNS) {
    const patternCallers = callers.filter((caller) => caller.pattern === pattern.name);
    console.log(
      `${pattern.name.padEnd(20)} ${String(patternCallers.length).padStart(3)}  ${patternCallers
        .map((caller) => hex(caller.address))
        .join(', ')}`
    );
  }
}

function printSubsystemSummary(callers) {
  console.log('\nSubsystem summary:');
  const allSubsystems = [
    ...SUBSYSTEMS,
    {
      name: 'Other / uncategorized',
      start: 0x000000,
      end: 0x3fffff,
    },
  ];

  for (const subsystem of allSubsystems) {
    const subsystemCallers = callers.filter((caller) => caller.subsystem === subsystem.name);
    console.log(
      `${subsystem.name.padEnd(30)} ${String(subsystemCallers.length).padStart(3)}  ${subsystemCallers
        .map((caller) => hex(caller.address))
        .join(', ')}`
    );
  }
}

const callers = findCallers();

console.log(`Scanning ${ROM_PATH} for CALLs to ${hex(TARGET)} across ${hex(0)}-${hex(0x3fffff)}.`);
console.log(`Found ${callers.length} call site(s).`);

callers.forEach(printCaller);
printPatternSummary(callers);
printSubsystemSummary(callers);
