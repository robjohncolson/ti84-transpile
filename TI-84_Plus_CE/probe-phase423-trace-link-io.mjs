#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const FUNCTIONS = [
  {
    name: '0x00DB66 TX drain helper',
    start: 0x00DB66,
    expectedEnd: 0x00DC0D,
    controlPort: 0x3010,
    controlBit: 5,
    controlMask: 0x20,
    statusPort: 0x3015,
    statusBit: 7,
    statusMask: 0x80,
  },
  {
    name: '0x00DC0E RX drain helper',
    start: 0x00DC0E,
    expectedEnd: 0x00DCB5,
    controlPort: 0x3010,
    controlBit: 4,
    controlMask: 0x10,
    statusPort: 0x3015,
    statusBit: 6,
    statusMask: 0x40,
  },
];

const CALL_LABELS = new Map([
  [0x00218A, 'stack-frame helper'],
  [0x014E3F, 'notification installer'],
]);

const PORT_LABELS = new Map([
  [0x3010, 'link control port'],
  [0x3015, 'link status port'],
]);

const RAM_LABELS = new Map([
  [0xD1440E, 'notification lock byte'],
  [0xD1440F, 'notification delivery status'],
  [0xD177B7, 'USB/link initialized sentinel'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function upper(value) {
  return String(value).toUpperCase();
}

function lower(value) {
  return String(value).toLowerCase();
}

function formatValue(value) {
  return hex(value, value <= 0xFFFF ? 4 : 6);
}

function formatDisp(value) {
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `.${upper(inst.modePrefix)} ${text}` : text;
}

function rawBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), hexByte).join(' ');
}

function isTrackedRam(addr) {
  return typeof addr === 'number' && addr >= RAM_MIN && addr <= RAM_MAX;
}

function labelFor(map, value) {
  return map.get(value) ?? '';
}

function addSite(map, key, site) {
  let entry = map.get(key);
  if (!entry) {
    entry = [];
    map.set(key, entry);
  }
  entry.push(site);
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
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatValue(inst.value)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${upper(inst.src)})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${upper(inst.dest)}),${upper(inst.src)}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
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
    default:
      return withPrefix(inst, `[${inst.tag}]`);
  }
}

function updateBcContext(inst, currentBc) {
  if (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'bc') {
    return inst.value >>> 0;
  }

  if (inst.tag === 'inc-pair' && lower(inst.pair) === 'bc' && currentBc != null) {
    return (currentBc + 1) & 0xFFFFFF;
  }

  if (inst.tag === 'dec-pair' && lower(inst.pair) === 'bc' && currentBc != null) {
    return (currentBc - 1) & 0xFFFFFF;
  }

  return currentBc;
}

function decodeFunction(spec) {
  const instructions = [];
  const calls = new Map();
  const ports = new Map();
  const ramReads = new Map();
  const ramWrites = new Map();

  let pc = spec.start;
  let bcContext = null;

  while (pc < rom.length) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const bytes = rawBytes(pc, inst.length);

    const annotated = {
      ...inst,
      bytes,
      text: formatInstruction(inst),
      bcContext,
      port: null,
      portDirection: null,
      ramDirection: null,
      callArg: null,
    };

    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target != null) {
      addSite(calls, inst.target, inst.pc);

      const prev1 = instructions.at(-1);
      const prev2 = instructions.at(-2);
      if (
        inst.target === 0x014E3F &&
        prev1?.tag === 'push' &&
        lower(prev1.pair) === 'bc' &&
        prev2?.tag === 'ld-pair-imm' &&
        lower(prev2.pair) === 'bc'
      ) {
        annotated.callArg = prev2.value >>> 0;
      }
    }

    if ((inst.tag === 'in-reg' || inst.tag === 'out-reg') && bcContext != null) {
      const port = bcContext & 0xFFFF;
      annotated.port = port;
      annotated.portDirection = inst.tag === 'in-reg' ? 'read' : 'write';

      let entry = ports.get(port);
      if (!entry) {
        entry = { reads: [], writes: [] };
        ports.set(port, entry);
      }

      if (annotated.portDirection === 'read') {
        entry.reads.push(inst.pc);
      } else {
        entry.writes.push(inst.pc);
      }
    }

    if (inst.tag === 'ld-reg-mem' && isTrackedRam(inst.addr)) {
      annotated.ramDirection = 'read';
      addSite(ramReads, inst.addr, inst.pc);
    }

    if (inst.tag === 'ld-mem-reg' && isTrackedRam(inst.addr)) {
      annotated.ramDirection = 'write';
      addSite(ramWrites, inst.addr, inst.pc);
    }

    instructions.push(annotated);
    bcContext = updateBcContext(inst, bcContext);
    pc = inst.nextPc;

    if (inst.tag === 'ret') {
      break;
    }
  }

  const last = instructions.at(-1);
  if (!last || last.tag !== 'ret') {
    throw new Error(`${spec.name}: sequential decode did not terminate at RET`);
  }

  const end = last.pc + last.length - 1;
  if (end !== spec.expectedEnd) {
    throw new Error(
      `${spec.name}: expected end ${hex(spec.expectedEnd)}, got ${hex(end)}`
    );
  }

  for (let i = 1; i < instructions.length; i += 1) {
    if (instructions[i].pc !== instructions[i - 1].nextPc) {
      throw new Error(`${spec.name}: instruction boundary mismatch at ${hex(instructions[i].pc)}`);
    }
  }

  return {
    ...spec,
    instructions,
    end,
    size: end - spec.start + 1,
    calls,
    ports,
    ramReads,
    ramWrites,
  };
}

function formatSites(sites) {
  return sites.map((site) => hex(site)).join(', ');
}

function formatMapBlock(map, kind) {
  if (map.size === 0) {
    return ['  (none)'];
  }

  const lines = [];
  for (const [key, sites] of map.entries()) {
    const label = kind === 'call'
      ? labelFor(CALL_LABELS, key)
      : kind === 'port'
        ? labelFor(PORT_LABELS, key)
        : labelFor(RAM_LABELS, key);
    const suffix = label ? ` (${label})` : '';
    lines.push(`  ${kind === 'port' ? hex(key, 4) : hex(key)}${suffix}: ${formatSites(sites)}`);
  }
  return lines;
}

function formatPortBlock(portMap) {
  if (portMap.size === 0) {
    return ['  (none)'];
  }

  const lines = [];
  for (const [port, entry] of portMap.entries()) {
    const label = labelFor(PORT_LABELS, port);
    const summary = [];
    if (entry.reads.length) {
      summary.push(`reads @ ${formatSites(entry.reads)}`);
    }
    if (entry.writes.length) {
      summary.push(`writes @ ${formatSites(entry.writes)}`);
    }
    lines.push(`  ${hex(port, 4)}${label ? ` (${label})` : ''}: ${summary.join('; ')}`);
  }
  return lines;
}

function formatByteDump(start, end) {
  const lines = [];
  for (let pc = start; pc <= end; pc += 16) {
    const slice = rom.subarray(pc, Math.min(end + 1, pc + 16));
    lines.push(`  ${hex(pc)}: ${Array.from(slice, hexByte).join(' ')}`);
  }
  return lines;
}

function semanticSummary(spec) {
  const start = spec.start;
  const epilogue = spec.expectedEnd - 4;
  return [
    `  ${hex(start + 0x04)}..${hex(start + 0x0A)}: load stacked arg from (IX+0x06); only arg values 1 and 0 do work.`,
    `  ${hex(start + 0x0B)}..${hex(start + 0x35)}: arg==1 path. If ${hex(spec.controlPort, 4)} bit ${spec.controlBit} is already set, return. Otherwise set it, verify BC still equals ${hex(spec.controlPort, 4)} with RST ${hex(0x08, 2)}, then CALL ${hex(0x014E3F)} with pushed BC=${hex(0x0032, 4)}.`,
    `  ${hex(start + 0x36)}..${hex(start + 0x4E)}: poll ${hex(spec.statusPort, 4)} bit ${spec.statusBit} until it becomes 1. The loop also stops if ${hex(0xD1440F)} != 0 or ${hex(0xD177B7)} != ${hex(0x55, 2)}.`,
    `  ${hex(start + 0x56)}..${hex(start + 0x84)}: arg==0 path. Any nonzero arg other than 1 returns immediately. If ${hex(spec.controlPort, 4)} bit ${spec.controlBit} is already clear, return. Otherwise clear it, run the same BC verification, and CALL ${hex(0x014E3F)} with BC=${hex(0x0032, 4)}.`,
    `  ${hex(start + 0x85)}..${hex(start + 0x9D)}: poll ${hex(spec.statusPort, 4)} bit ${spec.statusBit} until it becomes 0. The same ${hex(0xD1440F)} / ${hex(0xD177B7)} break conditions apply.`,
    `  ${hex(start + 0x4F)} and ${hex(start + 0x9E)}: both working paths exit through XOR A; LD (${hex(0xD1440E)}),A, then the common epilogue at ${hex(epilogue)}.`,
  ];
}

function meaningOfDrain(spec) {
  return [
    `  The helper never touches a byte-data register or a RAM buffer. Its only hardware I/O is ${hex(spec.controlPort, 4)} and ${hex(spec.statusPort, 4)}.`,
    `  On the disconnect/cleanup path (${hex(0x00DA8C)} calls this with arg 0), "drain" means: clear ${hex(spec.controlPort, 4)} bit ${spec.controlBit} and wait until ${hex(spec.statusPort, 4)} bit ${spec.statusBit} falls to 0, or until the shared abort latches end the wait.`,
    `  On the arg==1 path, the same helper acts as the inverse arm/assert primitive: set ${hex(spec.controlPort, 4)} bit ${spec.controlBit} and wait until ${hex(spec.statusPort, 4)} bit ${spec.statusBit} rises to 1.`,
  ];
}

function renderFunction(result) {
  console.log(`=== ${result.name} ===`);
  console.log(`Range: ${hex(result.start)}..${hex(result.end)} (${hex(result.size, 2)} bytes / ${result.size} decimal)`);
  console.log(`Boundary validation: PASS (sequential decode ends at RET ${hex(result.end)})`);
  console.log(`Control pair: ${hex(result.controlPort, 4)} bit ${result.controlBit} -> ${hex(result.statusPort, 4)} bit ${result.statusBit}`);
  console.log();

  console.log('Raw bytes:');
  for (const line of formatByteDump(result.start, result.end)) {
    console.log(line);
  }
  console.log();

  console.log('CALL targets:');
  for (const line of formatMapBlock(result.calls, 'call')) {
    console.log(line);
  }
  console.log();

  console.log('Port I/O:');
  for (const line of formatPortBlock(result.ports)) {
    console.log(line);
  }
  console.log();

  console.log('Absolute RAM reads:');
  for (const line of formatMapBlock(result.ramReads, 'ram')) {
    console.log(line);
  }
  console.log();

  console.log('Absolute RAM writes:');
  for (const line of formatMapBlock(result.ramWrites, 'ram')) {
    console.log(line);
  }
  console.log();

  console.log('Control-flow summary:');
  for (const line of semanticSummary(result)) {
    console.log(line);
  }
  console.log();

  console.log('Meaning of "drain":');
  for (const line of meaningOfDrain(result)) {
    console.log(line);
  }
  console.log();

  console.log('Disassembly:');
  for (const inst of result.instructions) {
    const notes = [];

    if (inst.port != null) {
      const label = labelFor(PORT_LABELS, inst.port);
      notes.push(`${inst.portDirection} ${hex(inst.port, 4)}${label ? ` (${label})` : ''}`);
    }

    if (inst.ramDirection && inst.addr != null) {
      const label = labelFor(RAM_LABELS, inst.addr);
      notes.push(`${inst.ramDirection} ${hex(inst.addr)}${label ? ` (${label})` : ''}`);
    }

    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target != null) {
      const label = labelFor(CALL_LABELS, inst.target);
      if (label) {
        notes.push(label);
      }
      if (inst.callArg != null) {
        notes.push(`pushed BC=${hex(inst.callArg, 4)}`);
      }
    }

    console.log(
      `  ${hex(inst.pc)}  ${inst.bytes.padEnd(15)}  ${inst.text}${notes.length ? ` ; ${notes.join('; ')}` : ''}`
    );
  }
  console.log();
}

const decoded = FUNCTIONS.map(decodeFunction);

console.log('Phase 423 link-I/O static trace');
console.log('ROM source: TI-84_Plus_CE/ROM.rom');
console.log('Decoder: TI-84_Plus_CE/ez80-decoder.js (ADL mode)');
console.log();

for (const result of decoded) {
  renderFunction(result);
}

console.log('Shared conclusion:');
console.log('  Neither helper contains a byte-moving TX/RX loop.');
console.log('  Both are symmetric control-bit helpers: toggle one bit in 0x3010, call 0x014E3F(0x0032), poll one status bit in 0x3015, then clear D1440E before returning.');
console.log('  The disconnect caller uses the arg==0 path, so forced cleanup drains each direction to idle instead of copying payload bytes.');
