#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 50000;

const GATE_BLOCK_PC = 0x000D82;
const GATE_READ_PC = 0x000DA1;
const GATE_PORT_READ_PC = 0x000DA5;
const GATE_JP_PC = 0x000DAA;
const HALT_PC = 0x0019B5;
const WATCH_ADDR = 0xD02AD9;
const PORT_1F = 0x1F;

const TERMINATOR_TAGS = new Set([
  'ret',
  'reti',
  'retn',
  'ret-conditional',
  'jp',
  'jp-conditional',
  'jp-indirect',
  'jr',
  'jr-conditional',
]);

const IN0_PORT_1F_PATTERNS = new Map([
  [0x00, 'IN0 B, (0x1F)'],
  [0x08, 'IN0 C, (0x1F)'],
  [0x10, 'IN0 D, (0x1F)'],
  [0x18, 'IN0 E, (0x1F)'],
  [0x20, 'IN0 H, (0x1F)'],
  [0x28, 'IN0 L, (0x1F)'],
  [0x38, 'IN0 A, (0x1F)'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, start + Math.max(0, length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ${text}` : text;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode failed)';
  }

  const ixd = (reg, displacement) => `(${reg.toUpperCase()}${signedDisp(displacement)})`;

  switch (inst.tag) {
    case 'nop': return withModePrefix(inst, 'NOP');
    case 'halt': return withModePrefix(inst, 'HALT');
    case 'slp': return withModePrefix(inst, 'SLP');
    case 'di': return withModePrefix(inst, 'DI');
    case 'ei': return withModePrefix(inst, 'EI');
    case 'ret': return withModePrefix(inst, 'RET');
    case 'reti': return withModePrefix(inst, 'RETI');
    case 'retn': return withModePrefix(inst, 'RETN');
    case 'ret-conditional': return withModePrefix(inst, `RET ${inst.condition.toUpperCase()}`);
    case 'jp': return withModePrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional': return withModePrefix(inst, `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'jp-indirect': return withModePrefix(inst, `JP (${inst.indirectRegister.toUpperCase()})`);
    case 'jr': return withModePrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional': return withModePrefix(inst, `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'call': return withModePrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional': return withModePrefix(inst, `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'push': return withModePrefix(inst, `PUSH ${inst.pair.toUpperCase()}`);
    case 'pop': return withModePrefix(inst, `POP ${inst.pair.toUpperCase()}`);
    case 'ld-reg-imm': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`);
    case 'ld-reg-reg': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'ld-reg-ind': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`);
    case 'ld-ind-reg': return withModePrefix(inst, `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`);
    case 'ld-reg-mem': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`);
    case 'ld-mem-reg': return withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`)
        : withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`);
    case 'ld-mem-pair': return withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`);
    case 'ld-special': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'ld-mb-a': return withModePrefix(inst, 'LD MB, A');
    case 'ld-a-mb': return withModePrefix(inst, 'LD A, MB');
    case 'ld-sp-hl': return withModePrefix(inst, 'LD SP, HL');
    case 'ld-sp-pair': return withModePrefix(inst, `LD SP, ${inst.pair.toUpperCase()}`);
    case 'ld-pair-ind': return withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`);
    case 'ld-ind-pair': return withModePrefix(inst, `LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`);
    case 'ld-reg-ixd': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg': return withModePrefix(inst, `LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`);
    case 'ld-ixd-imm': return withModePrefix(inst, `LD ${ixd(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`);
    case 'inc-reg': return withModePrefix(inst, `INC ${inst.reg.toUpperCase()}`);
    case 'dec-reg': return withModePrefix(inst, `DEC ${inst.reg.toUpperCase()}`);
    case 'inc-pair': return withModePrefix(inst, `INC ${inst.pair.toUpperCase()}`);
    case 'dec-pair': return withModePrefix(inst, `DEC ${inst.pair.toUpperCase()}`);
    case 'alu-reg':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${inst.src.toUpperCase()}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`);
    case 'alu-imm':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${hex(inst.value, 2)}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`);
    case 'add-pair': return withModePrefix(inst, `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'adc-pair': return withModePrefix(inst, `ADC HL, ${inst.src.toUpperCase()}`);
    case 'sbc-pair': return withModePrefix(inst, `SBC HL, ${inst.src.toUpperCase()}`);
    case 'bit-test': return withModePrefix(inst, `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-test-ind': return withModePrefix(inst, `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'bit-set': return withModePrefix(inst, `SET ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-set-ind': return withModePrefix(inst, `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'bit-res': return withModePrefix(inst, `RES ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-res-ind': return withModePrefix(inst, `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'exx': return withModePrefix(inst, 'EXX');
    case 'ex-af': return withModePrefix(inst, "EX AF, AF'");
    case 'ex-de-hl': return withModePrefix(inst, 'EX DE, HL');
    case 'ex-sp-hl': return withModePrefix(inst, 'EX (SP), HL');
    case 'rrd': return withModePrefix(inst, 'RRD');
    case 'rld': return withModePrefix(inst, 'RLD');
    case 'scf': return withModePrefix(inst, 'SCF');
    case 'ccf': return withModePrefix(inst, 'CCF');
    case 'cpl': return withModePrefix(inst, 'CPL');
    case 'daa': return withModePrefix(inst, 'DAA');
    case 'neg': return withModePrefix(inst, 'NEG');
    case 'in0': return withModePrefix(inst, `IN0 ${inst.reg.toUpperCase()}, (${hex(inst.port, 2)})`);
    case 'out0': return withModePrefix(inst, `OUT0 (${hex(inst.port, 2)}), ${inst.reg.toUpperCase()}`);
    case 'in-reg': return withModePrefix(inst, `IN ${inst.reg.toUpperCase()}, (C)`);
    case 'out-reg': return withModePrefix(inst, `OUT (C), ${inst.reg.toUpperCase()}`);
    case 'in-imm': return withModePrefix(inst, `IN A, (${hex(inst.port, 2)})`);
    case 'out-imm': return withModePrefix(inst, `OUT (${hex(inst.port, 2)}), A`);
    case 'rra': return withModePrefix(inst, 'RRA');
    case 'rla': return withModePrefix(inst, 'RLA');
    case 'rlca': return withModePrefix(inst, 'RLCA');
    case 'rrca': return withModePrefix(inst, 'RRCA');
    case 'ldir': return withModePrefix(inst, 'LDIR');
    case 'lddr': return withModePrefix(inst, 'LDDR');
    default: {
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['tag', 'length', 'pc', 'nextPc', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key)) {
          continue;
        }
        if (value === undefined || value === null) {
          continue;
        }
        fields.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${String(value)}`);
      }
      return withModePrefix(inst, fields.length > 0 ? `${inst.tag} ${fields.join(' ')}` : inst.tag);
    }
  }
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function disassembleUntilTerminator(romBytes, startPc, mode = 'adl', maxInstructions = 128) {
  const rows = [];
  let pc = startPc;

  for (let index = 0; index < maxInstructions; index += 1) {
    const inst = decodeInstruction(romBytes, pc, mode);
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: formatInstruction(inst),
      tag: inst?.tag ?? null,
    });

    if (TERMINATOR_TAGS.has(inst?.tag)) {
      break;
    }

    pc += length;
  }

  return rows;
}

function scanPort1fReaders(romBytes) {
  const in0 = [];
  const inImm = [];

  for (let pc = 0; pc < romBytes.length - 2; pc += 1) {
    if (romBytes[pc] === 0xED && romBytes[pc + 2] === PORT_1F) {
      const mnemonic = IN0_PORT_1F_PATTERNS.get(romBytes[pc + 1]);
      if (mnemonic) {
        in0.push({
          pc,
          bytes: bytesAt(romBytes, pc, 3),
          mnemonic,
        });
      }
    }
  }

  for (let pc = 0; pc < romBytes.length - 1; pc += 1) {
    if (romBytes[pc] === 0xDB && romBytes[pc + 1] === PORT_1F) {
      inImm.push({
        pc,
        bytes: bytesAt(romBytes, pc, 2),
        mnemonic: 'IN A, (0x1F)',
      });
    }
  }

  return { in0, inImm };
}

function extractInstrumentedBody(source) {
  const bodyStart = source.indexOf('{') + 1;
  const bodyEnd = source.lastIndexOf('}');
  const body = source.slice(bodyStart, bodyEnd);
  const lines = body.split('\n');
  const output = [];
  let pendingPc = null;

  for (const line of lines) {
    const commentMatch = line.match(/^\s*\/\/\s*0x([0-9a-fA-F]{6})\b/);
    if (commentMatch) {
      pendingPc = Number.parseInt(commentMatch[1], 16);
      output.push(line);
      continue;
    }

    if (pendingPc !== null && line.trim() !== '' && !line.trimStart().startsWith('//')) {
      output.push(`  cpu._probeInstrPc = 0x${pendingPc.toString(16)};`);
      pendingPc = null;
    }

    output.push(line);
  }

  return output.join('\n');
}

function instrumentCompiledBlocks(executor) {
  for (const [key, meta] of Object.entries(executor.blockMeta ?? {})) {
    if (!meta?.source || !executor.compiledBlocks?.[key]) {
      continue;
    }

    const instrumentedBody = extractInstrumentedBody(meta.source);
    executor.compiledBlocks[key] = new Function('cpu', instrumentedBody);
  }
}

function installWatch(cpu, trace) {
  const originals = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function probePc() {
    return cpu._probeInstrPc ?? cpu._currentBlockPc ?? null;
  }

  function watchedByteFromRange(addr, size, value) {
    const base = addr & 0xFFFFFF;
    for (let offset = 0; offset < size; offset += 1) {
      const byteAddr = (base + offset) & 0xFFFFFF;
      if (byteAddr === WATCH_ADDR) {
        return (Number(value) >>> (offset * 8)) & 0xFF;
      }
    }
    return null;
  }

  function recordRead(kind, addr, size, value) {
    const watchedValue = watchedByteFromRange(addr, size, value);
    if (watchedValue === null) {
      return;
    }

    trace.reads.push({
      step: trace.currentStep,
      block: trace.currentBlock,
      pc: probePc(),
      kind,
      rootAddr: addr & 0xFFFFFF,
      value: watchedValue,
    });
  }

  function recordWrite(kind, addr, size, value) {
    const watchedValue = watchedByteFromRange(addr, size, value);
    if (watchedValue === null) {
      return;
    }

    trace.writes.push({
      step: trace.currentStep,
      block: trace.currentBlock,
      pc: probePc(),
      kind,
      rootAddr: addr & 0xFFFFFF,
      value: watchedValue,
    });
  }

  cpu.read8 = (addr) => {
    const value = originals.read8(addr);
    recordRead('read8', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originals.read16(addr);
    recordRead('read16', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originals.read24(addr);
    recordRead('read24', addr, 3, value);
    return value;
  };

  cpu.write8 = (addr, value) => {
    recordWrite('write8', addr, 1, value);
    return originals.write8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordWrite('write16', addr, 2, value);
    return originals.write16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordWrite('write24', addr, 3, value);
    return originals.write24(addr, value);
  };

  return {
    restore() {
      cpu.read8 = originals.read8;
      cpu.read16 = originals.read16;
      cpu.read24 = originals.read24;
      cpu.write8 = originals.write8;
      cpu.write16 = originals.write16;
      cpu.write24 = originals.write24;
    },
  };
}

function formatStep(value) {
  return String(value ?? 'n/a').padStart(4);
}

function printDisassembly(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}`);
  }
  console.log('');
}

function printPortMatches(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  if (rows.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(11)} ${row.mnemonic}`);
  }
  console.log('');
}

function printWatchEvents(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  if (rows.length === 0) {
    console.log(`  No writes to ${hex(WATCH_ADDR)} were observed.`);
    console.log('');
    return;
  }

  for (const row of rows) {
    console.log(
      `  step=${formatStep(row.step)}  block=${row.block ?? 'n/a'}  `
      + `pc=${hex(row.pc)}  ${row.kind} root=${hex(row.rootAddr)}  `
      + `${hex(WATCH_ADDR)}=${hex(row.value, 2)}`,
    );
  }
  console.log('');
}

function runBootProbe(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus) {
  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  instrumentCompiledBlocks(executor);

  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;
  cpu._probeInstrPc = null;

  const trace = {
    currentStep: 0,
    currentBlock: null,
    uniqueBlocks: new Map(),
    writes: [],
    reads: [],
    portReads: [],
    missingBlocks: [],
  };

  const watch = installWatch(cpu, trace);

  cpu.onIoRead = (port, value) => {
    if ((Number(port) & 0xFFFF) !== PORT_1F) {
      return;
    }
    trace.portReads.push({
      step: trace.currentStep,
      block: trace.currentBlock,
      pc: cpu._probeInstrPc ?? cpu._currentBlockPc ?? null,
      value: Number(value) & 0xFF,
    });
  };

  cpu.onIoWrite = () => {};

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const key = blockKey(normalizedPc, normalizedMode);
      trace.currentStep = step + 1;
      trace.currentBlock = key;
      cpu._probeInstrPc = normalizedPc;

      if (!trace.uniqueBlocks.has(key)) {
        trace.uniqueBlocks.set(key, {
          pc: normalizedPc,
          mode: normalizedMode,
          firstStep: step + 1,
        });
      }
    },
    onMissingBlock(pc, mode, step) {
      trace.missingBlocks.push({
        step: step + 1,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      });
    },
  });

  watch.restore();

  const gateKey = blockKey(GATE_BLOCK_PC, 'adl');
  const gateStep = trace.uniqueBlocks.get(gateKey)?.firstStep ?? null;
  const gateRead = trace.reads.find((row) => row.pc === GATE_READ_PC)
    ?? trace.reads.find((row) => row.block === gateKey);
  const gatePortRead = trace.portReads.find((row) => row.pc === GATE_PORT_READ_PC)
    ?? trace.portReads.find((row) => row.block === gateKey);
  const lastWriteBeforeGate = gateStep === null
    ? null
    : [...trace.writes].filter((row) => row.step < gateStep).pop() ?? null;
  const incResult = gatePortRead ? ((gatePortRead.value + 1) & 0xFF) : null;
  const carrySet = gateRead && gatePortRead ? gateRead.value < incResult : null;

  return {
    result,
    trace,
    gateStep,
    gateRead,
    gatePortRead,
    lastWriteBeforeGate,
    incResult,
    carrySet,
    reachedHalt: trace.uniqueBlocks.has(blockKey(HALT_PC, 'adl')) || (result.lastPc & 0xFFFFFF) === HALT_PC,
  };
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  const disassembly = disassembleUntilTerminator(romBytes, GATE_BLOCK_PC, 'adl');
  const portScan = scanPort1fReaders(romBytes);
  const boot = runBootProbe(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus);

  console.log('Phase 358: Port 0x1F Gate at 0x000D82');
  console.log('======================================');
  console.log(`ROM:                 ${ROM_PATH}`);
  console.log(`Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:         entry=${hex(BOOT_ENTRY)}:${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} timerInterrupt=false`);
  console.log('');

  console.log('Boot summary');
  console.log('------------');
  console.log(`  termination:       ${boot.result.termination}`);
  console.log(`  steps:             ${boot.result.steps}`);
  console.log(`  unique blocks:     ${boot.trace.uniqueBlocks.size}`);
  console.log(`  last pc:           ${hex(boot.result.lastPc)}:${boot.result.lastMode}`);
  console.log(`  first gate step:   ${boot.gateStep ?? 'n/a'}`);
  console.log('');

  printDisassembly(
    `ADL disassembly from ${hex(GATE_BLOCK_PC)} through the first RET/JP/JR terminator`,
    disassembly,
  );

  printPortMatches('ROM scan: IN0 r,(0x1F) reads', portScan.in0);
  printPortMatches('ROM scan: IN A,(0x1F) reads', portScan.inImm);
  printWatchEvents(`Boot writes touching ${hex(WATCH_ADDR)}`, boot.trace.writes);

  console.log(`Read of ${hex(WATCH_ADDR)} at the gate`);
  console.log('-'.repeat(`Read of ${hex(WATCH_ADDR)} at the gate`.length));
  if (!boot.gateRead) {
    console.log(`  No read of ${hex(WATCH_ADDR)} was observed in block ${hex(GATE_BLOCK_PC)}.`);
  } else {
    console.log(`  step=${formatStep(boot.gateRead.step)}  block=${boot.gateRead.block}  pc=${hex(boot.gateRead.pc)}  ${hex(WATCH_ADDR)}=${hex(boot.gateRead.value, 2)}`);
  }
  if (boot.lastWriteBeforeGate) {
    console.log(`  last write before gate: step=${formatStep(boot.lastWriteBeforeGate.step)}  pc=${hex(boot.lastWriteBeforeGate.pc)}  ${hex(WATCH_ADDR)}=${hex(boot.lastWriteBeforeGate.value, 2)}`);
  } else {
    console.log(`  last write before gate: none observed`);
  }
  if (boot.gatePortRead) {
    console.log(`  port read at ${hex(GATE_PORT_READ_PC)}: ${hex(boot.gatePortRead.value, 2)}`);
  } else {
    console.log(`  port read at ${hex(GATE_PORT_READ_PC)}: not observed`);
  }
  if (boot.incResult !== null) {
    console.log(`  INC C result:      ${hex(boot.incResult, 2)}`);
  }
  if (boot.carrySet !== null) {
    console.log(`  carry after CP:    ${boot.carrySet ? 'set' : 'clear'}`);
  }
  console.log(`  JP NC @ ${hex(GATE_JP_PC)}: ${boot.reachedHalt ? `taken to ${hex(HALT_PC)}` : 'not proven taken'}`);
  console.log('');

  console.log('Observed answer');
  console.log('---------------');
  console.log(`  ${hex(WATCH_ADDR)} ${boot.trace.writes.length > 0 ? `is written ${boot.trace.writes.length} time(s) during baseline boot.` : 'is not written during baseline boot.'}`);
  if (boot.lastWriteBeforeGate) {
    console.log(`  The last observed pre-gate writer is ${hex(boot.lastWriteBeforeGate.pc)} at step ${boot.lastWriteBeforeGate.step}, leaving ${hex(WATCH_ADDR)}=${hex(boot.lastWriteBeforeGate.value, 2)}.`);
  }
  if (boot.gateRead) {
    console.log(`  When ${hex(GATE_BLOCK_PC)} reads ${hex(WATCH_ADDR)} at ${hex(GATE_READ_PC)}, the value is ${hex(boot.gateRead.value, 2)}.`);
  }
  if (boot.gatePortRead) {
    console.log(`  Port ${hex(PORT_1F, 2)} reads as ${hex(boot.gatePortRead.value, 2)} at ${hex(GATE_PORT_READ_PC)}; INC C makes it ${hex(boot.incResult, 2)}.`);
  }
  if (boot.carrySet !== null) {
    console.log(`  CP C therefore leaves carry ${boot.carrySet ? 'set' : 'clear'}, so JP NC is ${boot.carrySet ? 'not taken' : `taken to ${hex(HALT_PC)}`}.`);
  }
  console.log('');

  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
