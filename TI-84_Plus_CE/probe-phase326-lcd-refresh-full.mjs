#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const VECTOR_STUBS = [
  { addr: 0x022264, label: 'mega-table slot for 0x05523D' },
  { addr: 0x022268, label: 'mega-table slot for 0x0551FE' },
];

const FUNCTIONS = [
  {
    start: 0x0551FE,
    vector: 0x022268,
    label: 'LCD refresh path with command 0x2D',
    overview:
      'Runs the common preflight, fills VRAM with 0xFF, conditionally calls the LCD DMA helper with A=0x2D when D000C6 bit 2 is set, then clears that bit and performs final RAM cleanup before returning.',
  },
  {
    start: 0x05523D,
    vector: 0x022264,
    label: 'LCD refresh path with setup copy and command 0x27',
    overview:
      'Runs the same preflight, fills VRAM with 0xFF, copies a 0x200-byte LCD controller setup block from ROM 0x055777 into 0xE30200, calls the LCD DMA helper with A=0x27, then runs a post-DMA helper and sets D000C6 bit 2 before returning.',
  },
];

const DATA_START = 0x055777;
const DATA_SIZE = 0x0200;
const PREVIEW_COUNT = 8;

const ADDRESS_NOTES = new Map([
  [0x022264, 'Vector stub: jumps straight into the 0x05523D refresh routine.'],
  [0x022268, 'Vector stub: jumps straight into the 0x0551FE refresh routine.'],

  [0x0551FE, 'Common display preflight before the refresh path touches VRAM or LCD-state flags.'],
  [0x055202, 'Point IY at LCD VRAM base 0xD40000.'],
  [0x055207, 'Seed VRAM byte 0 with 0xFF.'],
  [0x05520B, 'Seed VRAM byte 1 with 0xFF so LDIR can replicate the pattern.'],
  [0x05520F, 'HL becomes the source pointer for the seeded fill pattern.'],
  [0x055212, 'DE points at VRAM byte 2, the start of the bulk fill.'],
  [0x055215, 'BC = 0x0257FE remaining bytes to fill after the first two seed bytes.'],
  [0x055219, 'Bulk-fill the rest of VRAM with 0xFF via the two-byte seed pattern.'],
  [0x05521B, 'Restore IY to the OS base at 0xD00080.'],
  [0x055220, 'Read bit 2 of D000C6 through (IY+70).'],
  [0x055224, 'If bit 2 is clear, skip the 0x2D LCD DMA command and jump directly to cleanup at 0x055230.'],
  [0x055226, 'Load LCD command byte 0x2D into A for the DMA helper.'],
  [0x055228, 'Call 0x055280 to submit the LCD transfer and poll for completion.'],
  [0x05522C, 'Clear bit 2 of D000C6 after the transfer path runs.'],
  [0x055230, 'Zero HL for the RAM cleanup writes that follow.'],
  [0x055234, 'Store zero through the SIS-prefixed RAM window at 0xD026AC.'],
  [0x055238, 'Copy a 13-byte ROM template from 0x05550C into RAM 0xD02FD9.'],
  [0x05523C, 'Return from the 0x0551FE refresh routine.'],

  [0x05523D, 'Run the same common preflight helper used by 0x0551FE.'],
  [0x055241, 'Point HL directly at LCD VRAM base 0xD40000.'],
  [0x055245, 'Seed VRAM byte 0 with 0xFF.'],
  [0x055247, 'DE points at VRAM byte 1 for the LDIR fill.'],
  [0x05524B, 'BC = 0x0257FF bytes to fill after the seed byte.'],
  [0x05524F, 'Bulk-fill VRAM with 0xFF.'],
  [0x055251, 'HL points at the ROM-resident LCD controller setup block.'],
  [0x055255, 'DE points at LCD controller RAM/MMIO shadow 0xE30200.'],
  [0x055259, 'BC = 0x0200 bytes for the setup-data copy.'],
  [0x05525D, 'Copy the 512-byte setup block from ROM into 0xE30200.'],
  [0x05525F, 'Load LCD command byte 0x27 into A for the DMA helper.'],
  [0x055261, 'Call 0x055280 to submit the LCD transfer and wait for completion.'],
  [0x055265, 'Clear A for the post-DMA status reset sequence.'],
  [0x055267, 'Clear byte 0xD026AC.'],
  [0x05526B, 'Load A = 0xFF as a sentinel value.'],
  [0x05526D, 'Store 0xFF into 0xD005F4.'],
  [0x055271, 'Load HL = 0x055519; this value is staged on the stack for the next helper.'],
  [0x055275, 'Push the staged 0x055519 value.'],
  [0x055276, 'Call the secondary LCD helper at 0x055743.'],
  [0x05527A, 'Pop the staged HL value back after 0x055743 returns.'],
  [0x05527B, 'Set bit 2 of D000C6 before returning.'],
  [0x05527F, 'Return from the 0x05523D refresh routine.'],

  [0x055191, 'Reload IY = 0xD00080 for LCD-state access.'],
  [0x055196, 'Test bit 1 of D000C6 through (IY+70).'],
  [0x05519A, 'If bit 1 is clear, call 0x05519F to set it and run a deeper helper.'],
  [0x05519E, 'Fast-path return when bit 1 was already set.'],
  [0x05519F, 'Re-enter the slow path with IY = 0xD00080.'],
  [0x0551A4, 'Set bit 1 of D000C6.'],
  [0x0551A8, 'Zero BC before pushing it as an argument.'],
  [0x0551AC, 'Push the zero BC argument.'],
  [0x0551AD, 'Call 0x055316 for the deeper setup path.'],

  [0x0551EF, 'Load the 13-byte copy length into BC.'],
  [0x0551F3, 'Destination for the copy is RAM 0xD02FD9.'],
  [0x0551F7, 'Source for the copy is ROM 0x05550C.'],
  [0x0551FB, 'Copy 13 bytes from 0x05550C to 0xD02FD9.'],
  [0x0551FD, 'Return from the small ROM-to-RAM template copier.'],

  [0x055280, 'Write the command byte from A into LCD register 0xE30018.'],
  [0x055284, 'Select LCD DMA trigger register 0xE30028 via HL.'],
  [0x055288, 'Set bit 2 at 0xE30028 to trigger the LCD DMA operation.'],
  [0x05528A, 'Load VRAM base 0xD40000 into HL.'],
  [0x05528E, 'Write the VRAM base into 0xE30010 for the LCD engine.'],
  [0x055292, 'Point HL at LCD status register 0xE30020.'],
  [0x055296, 'Test bit 2 of the LCD status register.'],
  [0x055298, 'Loop until the LCD status register reports bit 2 set.'],
  [0x05529A, 'Return once the LCD transfer reports completion.'],

  [0x055316, 'Save IX before building a stack-frame view of the arguments.'],
  [0x055318, 'Zero IX as the base for an SP-relative frame.'],
  [0x05531D, 'IX = SP to make indexed argument reads possible.'],
  [0x05531F, 'Call back into 0x055191 from the deeper setup path.'],

  [0x055743, 'Save IX before building another SP-relative helper frame.'],
  [0x055745, 'Zero IX for the frame setup.'],
  [0x05574A, 'IX = SP.'],
  [0x05574C, 'Reload IY = 0xD00080 for LCD-state access.'],
  [0x055751, 'Read the stacked 24-bit argument at (IX+6) into HL.'],
  [0x055754, 'Call trampoline 0x000138 with that HL argument live.'],

  [0x000138, 'Trampoline: jumps straight to 0x0021C2.'],
]);

const TARGET_SUMMARIES = new Map([
  [
    0x055191,
    'Common preflight helper: sets up IY for D000C6 access, returns immediately if bit 1 is already set, and otherwise enters 0x05519F to set that bit and continue deeper setup.',
  ],
  [
    0x05519F,
    'Slow path from 0x055191: sets D000C6 bit 1, pushes a zero argument, and calls 0x055316.',
  ],
  [
    0x0551EF,
    'Small template copier: moves 13 bytes from ROM 0x05550C into RAM 0xD02FD9 and returns.',
  ],
  [
    0x055280,
    'LCD DMA submit/poll helper: writes the command byte to 0xE30018, triggers DMA through 0xE30028, writes VRAM base 0xD40000 to 0xE30010, and polls 0xE30020 bit 2 until it becomes set.',
  ],
  [
    0x055316,
    'Deeper stack-frame helper: saves IX, builds an SP-relative frame in IX, and immediately calls back into 0x055191.',
  ],
  [
    0x055743,
    'Secondary LCD helper: saves IX, builds an SP-relative frame, reloads IY=0xD00080, pulls a 24-bit argument from (IX+6), and calls trampoline 0x000138.',
  ],
  [
    0x000138,
    'Pure trampoline: JP 0x0021C2.',
  ],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function bytesForInstruction(inst) {
  return bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length));
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${upper(indexRegister)}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode error)';
  }

  const prefix = inst.modePrefix ? `${upper(inst.modePrefix)} ` : '';

  switch (inst.tag) {
    case 'nop':
      return `${prefix}NOP`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${upper(inst.condition)}`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'halt':
      return `${prefix}HALT`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'push':
      return `${prefix}PUSH ${upper(inst.pair ?? inst.reg ?? inst.src)}`;
    case 'pop':
      return `${prefix}POP ${upper(inst.pair ?? inst.reg ?? inst.dest)}`;
    case 'inc-reg':
      return `${prefix}INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `${prefix}DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `${prefix}INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `${prefix}DEC ${upper(inst.pair)}`;
    case 'add-pair':
      return `${prefix}ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${upper(inst.src)}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${upper(inst.src)}`;
    case 'alu-reg':
      return `${prefix}${upper(inst.op)} ${upper(inst.src ?? inst.reg)}`;
    case 'alu-imm':
      return `${prefix}${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${upper(inst.dest)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${upper(inst.dest)}, (${upper(inst.indirectRegister ?? inst.src)})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${upper(inst.indirectRegister ?? inst.dest)}), ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${upper(inst.dest)}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${upper(inst.src)}`;
    case 'ld-pair-mem': {
      const suffix = inst.modePrefix ? `.${upper(inst.modePrefix)}` : '';
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      if (inst.direction === 'to-mem') {
        return `LD${suffix} (${hex(inst.addr, width)}), ${upper(inst.pair)}`;
      }
      return `LD${suffix} ${upper(inst.pair)}, (${hex(inst.addr, width)})`;
    }
    case 'ld-mem-pair': {
      const suffix = inst.modePrefix ? `.${upper(inst.modePrefix)}` : '';
      const width = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      return `LD${suffix} (${hex(inst.addr, width)}), ${upper(inst.pair)}`;
    }
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${upper(inst.pair)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'lea':
      return `${prefix}LEA ${upper(inst.dest)}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res':
      return `${prefix}RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res-ind':
      return `${prefix}RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set-ind':
      return `${prefix}SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpdr':
      return `${prefix}CPDR`;
    default: {
      let text = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) {
        text += ` ${hex(inst.target)}`;
      }
      if (inst.value !== undefined) {
        text += ` ${hex(inst.value)}`;
      }
      return text;
    }
  }
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function noteForInstruction(inst) {
  return ADDRESS_NOTES.get(inst.pc) ?? fallbackNote(inst);
}

function fallbackNote(inst) {
  switch (inst.tag) {
    case 'call':
    case 'call-conditional':
      return `Transfer control to ${hex(inst.target)}.`;
    case 'ret':
    case 'reti':
    case 'retn':
    case 'ret-conditional':
      return 'Return to the caller.';
    case 'jp':
    case 'jp-conditional':
    case 'jp-indirect':
    case 'jr':
    case 'jr-conditional':
      return inst.target !== undefined ? `Transfer/branch to ${hex(inst.target)}.` : 'Transfer control.';
    case 'ldir':
    case 'lddr':
      return 'Bulk memory copy using HL/DE/BC.';
    default:
      return '';
  }
}

function renderInstructionLine(inst, indent = '  ') {
  const bytes = bytesForInstruction(inst).padEnd(20);
  const text = formatInstruction(inst).padEnd(34);
  const note = noteForInstruction(inst);
  return `${indent}${hex(inst.pc)}: ${bytes} ${text}${note ? ` ; ${note}` : ''}`;
}

function isConditionalFlow(inst) {
  return ['jr-conditional', 'jp-conditional', 'ret-conditional', 'djnz'].includes(inst.tag);
}

function isHardExit(inst) {
  return ['ret', 'reti', 'retn', 'jp', 'jp-indirect', 'jr'].includes(inst.tag);
}

function collectFunction(start) {
  const queue = [start];
  const queued = new Set(queue);
  const visitedStarts = new Set();
  const instructions = new Map();
  const blockStarts = new Set([start]);
  const directCalls = new Map();

  while (queue.length) {
    const blockStart = queue.shift();
    if (visitedStarts.has(blockStart)) {
      continue;
    }
    visitedStarts.add(blockStart);

    let pc = blockStart;
    while (pc >= 0 && pc < rom.length) {
      if (instructions.has(pc)) {
        break;
      }

      const inst = decodeSafe(pc);
      if (!inst || !inst.length) {
        break;
      }
      instructions.set(pc, inst);

      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        if (inst.target !== undefined) {
          if (!directCalls.has(inst.target)) {
            directCalls.set(inst.target, []);
          }
          directCalls.get(inst.target).push(inst.pc);
        }
        const fallthrough = inst.fallthrough ?? nextPc(inst);
        blockStarts.add(fallthrough);
        pc = fallthrough;
        continue;
      }

      if (isConditionalFlow(inst)) {
        if (inst.target !== undefined) {
          blockStarts.add(inst.target);
          if (!visitedStarts.has(inst.target) && !queued.has(inst.target)) {
            queue.push(inst.target);
            queued.add(inst.target);
          }
        }
        const fallthrough = inst.fallthrough ?? nextPc(inst);
        blockStarts.add(fallthrough);
        pc = fallthrough;
        continue;
      }

      if (isHardExit(inst)) {
        break;
      }

      pc = nextPc(inst);
    }
  }

  return {
    ordered: [...instructions.values()].sort((a, b) => a.pc - b.pc),
    blockStarts: [...blockStarts].sort((a, b) => a - b),
    directCalls: [...directCalls.entries()].map(([target, sites]) => ({ target, sites })),
  };
}

function previewTarget(start, limit = PREVIEW_COUNT) {
  const insts = [];
  let pc = start;
  const seen = new Set();

  while (insts.length < limit && pc >= 0 && pc < rom.length && !seen.has(pc)) {
    const inst = decodeSafe(pc);
    if (!inst || !inst.length) {
      break;
    }
    insts.push(inst);
    seen.add(pc);
    if (isHardExit(inst)) {
      break;
    }
    pc = nextPc(inst);
  }

  return insts;
}

function nestedTargets(preview) {
  const targets = [];
  const seen = new Set();

  for (const inst of preview) {
    if (!['call', 'call-conditional'].includes(inst.tag)) {
      continue;
    }
    if (inst.target === undefined || seen.has(inst.target)) {
      continue;
    }
    seen.add(inst.target);
    targets.push({
      fromPc: inst.pc,
      target: inst.target,
      kind: inst.tag,
    });
  }

  return targets;
}

function printVectorStub(vector) {
  const inst = decodeSafe(vector.addr);
  console.log(`- ${hex(vector.addr)} (${vector.label})`);
  if (!inst) {
    console.log('  decode failed');
    return;
  }
  console.log(`  ${renderInstructionLine(inst, '')}`);
}

function printFunctionReport(spec) {
  const trace = collectFunction(spec.start);
  const blockStartSet = new Set(trace.blockStarts);

  console.log(`=== Function ${hex(spec.start)}: ${spec.label} ===`);
  console.log(spec.overview);
  console.log();

  if (spec.vector !== undefined) {
    const inst = decodeSafe(spec.vector);
    console.log('Entry vector:');
    if (inst) {
      console.log(`  ${renderInstructionLine(inst, '')}`);
    } else {
      console.log(`  ${hex(spec.vector)}: decode failed`);
    }
    console.log();
  }

  console.log('Full disassembly / control flow:');
  for (const inst of trace.ordered) {
    if (blockStartSet.has(inst.pc)) {
      console.log(`  [block ${hex(inst.pc)}]`);
    }
    console.log(renderInstructionLine(inst, '    '));
  }
  console.log();

  console.log('Direct CALL targets:');
  if (!trace.directCalls.length) {
    console.log('  (none)');
  } else {
    for (const call of trace.directCalls) {
      const sites = call.sites.map((site) => hex(site)).join(', ');
      console.log(`- ${hex(call.target)} called from ${sites}`);
      console.log(`  ${TARGET_SUMMARIES.get(call.target) ?? `Starts at ${hex(call.target)} and begins with ${formatInstruction(previewTarget(call.target, 1)[0])}.`}`);
      const preview = previewTarget(call.target, PREVIEW_COUNT);
      console.log(`  first ${preview.length} instruction(s):`);
      for (const inst of preview) {
        console.log(`    ${renderInstructionLine(inst, '')}`);
      }

      const nested = nestedTargets(preview);
      if (nested.length) {
        console.log('  nested CALL targets seen inside that preview:');
        for (const item of nested) {
          const nestedPreview = previewTarget(item.target, 4);
          console.log(`    - ${hex(item.target)} via ${upper(item.kind)} at ${hex(item.fromPc)}`);
          if (TARGET_SUMMARIES.has(item.target)) {
            console.log(`      ${TARGET_SUMMARIES.get(item.target)}`);
          }
          for (const inst of nestedPreview) {
            console.log(`      ${renderInstructionLine(inst, '')}`);
          }
        }
      }
    }
  }
  console.log();
}

function printDataDump() {
  console.log(`=== LCD setup block ROM[${hex(DATA_START)}..${hex(DATA_START + DATA_SIZE - 1)}] (${hex(DATA_SIZE, 4)} bytes, end-exclusive ${hex(DATA_START + DATA_SIZE)}) ===`);
  for (let offset = 0; offset < DATA_SIZE; offset += 16) {
    const addr = DATA_START + offset;
    const slice = rom.subarray(addr, addr + Math.min(16, DATA_SIZE - offset));
    console.log(`${hex(addr)}: ${bytesToHex(slice)}`);
  }
  console.log();
}

console.log('Phase 326: full static trace of LCD refresh routines 0x0551FE and 0x05523D');
console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
console.log('Mode: ADL static decode using ez80-decoder.js');
console.log();

console.log('=== Vector stubs ===');
for (const vector of VECTOR_STUBS) {
  printVectorStub(vector);
}
console.log();

for (const spec of FUNCTIONS) {
  printFunctionReport(spec);
}

printDataDump();
