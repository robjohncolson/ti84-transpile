#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 5000;
const POST_HALT_MAX_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 50000;

const HALT_BLOCK_ENTRY = 0x0019B5;
const POST_HALT_ENTRY = 0x0019BE;
const POST_HALT_END = 0x001A20;
const NMI_TAIL_START = 0x000DED;
const NMI_TAIL_END = 0x000E10;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function bytesAt(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, start + Math.max(length, 0)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
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
    case 'djnz': return withModePrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'call': return withModePrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional': return withModePrefix(inst, `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'rst': return withModePrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push': return withModePrefix(inst, `PUSH ${inst.pair.toUpperCase()}`);
    case 'pop': return withModePrefix(inst, `POP ${inst.pair.toUpperCase()}`);
    case 'ld-reg-imm': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`);
    case 'ld-reg-reg': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'ld-reg-ind': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`);
    case 'ld-ind-reg': return withModePrefix(inst, `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`);
    case 'ld-reg-mem': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`);
    case 'ld-mem-reg': return withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`);
    case 'ld-pair-imm': {
      const width = inst.value > 0xFFFF ? 6 : 4;
      return withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, ${hex(inst.value, width)}`);
    }
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
    case 'ld-pair-indexed': return withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair': return withModePrefix(inst, `LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.pair.toUpperCase()}`);
    case 'ld-ixiy-indexed': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-ixiy': return withModePrefix(inst, `LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`);
    case 'inc-reg': return withModePrefix(inst, `INC ${inst.reg.toUpperCase()}`);
    case 'dec-reg': return withModePrefix(inst, `DEC ${inst.reg.toUpperCase()}`);
    case 'inc-pair': return withModePrefix(inst, `INC ${inst.pair.toUpperCase()}`);
    case 'dec-pair': return withModePrefix(inst, `DEC ${inst.pair.toUpperCase()}`);
    case 'inc-ixd': return withModePrefix(inst, `INC ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'dec-ixd': return withModePrefix(inst, `DEC ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'alu-reg':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${inst.src.toUpperCase()}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`);
    case 'alu-imm':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${hex(inst.value, 2)}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`);
    case 'alu-ixd':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${ixd(inst.indexRegister, inst.displacement)}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'add-pair': return withModePrefix(inst, `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'adc-pair': return withModePrefix(inst, `ADC HL, ${inst.src.toUpperCase()}`);
    case 'sbc-pair': return withModePrefix(inst, `SBC HL, ${inst.src.toUpperCase()}`);
    case 'bit-test': return withModePrefix(inst, `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-test-ind': return withModePrefix(inst, `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'bit-set': return withModePrefix(inst, `SET ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-set-ind': return withModePrefix(inst, `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'bit-res': return withModePrefix(inst, `RES ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-res-ind': return withModePrefix(inst, `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'indexed-cb-bit': return withModePrefix(inst, `BIT ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set': return withModePrefix(inst, `SET ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res': return withModePrefix(inst, `RES ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-rotate': return withModePrefix(inst, `${inst.operation.toUpperCase()} ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'im': return withModePrefix(inst, `IM ${inst.value}`);
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
    case 'mlt': return withModePrefix(inst, `MLT ${inst.reg.toUpperCase()}`);
    case 'tst-reg': return withModePrefix(inst, `TST A, ${inst.reg.toUpperCase()}`);
    case 'tst-ind': return withModePrefix(inst, 'TST A, (HL)');
    case 'tst-imm': return withModePrefix(inst, `TST A, ${hex(inst.value, 2)}`);
    case 'tstio': return withModePrefix(inst, `TSTIO ${hex(inst.value, 2)}`);
    case 'lea': return withModePrefix(inst, `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${signedDisp(inst.displacement)}`);
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
    default: {
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['tag', 'length', 'pc', 'nextPc', 'mode', 'modePrefix', 'nextMode', 'terminates', 'fallthrough', 'kind'].includes(key)) {
          continue;
        }
        if (value === undefined || value === null) {
          continue;
        }
        fields.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${value}`);
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
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function snapshotRegs(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    mbase: cpu.mbase & 0xFF,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    im: cpu.im,
    madl: cpu.madl,
    halted: cpu.halted,
  };
}

function printRegs(label, regs) {
  console.log(label);
  console.log(`  A=${hex(regs.a, 2)} F=${hex(regs.f, 2)} BC=${hex(regs.bc)} DE=${hex(regs.de)} HL=${hex(regs.hl)}`);
  console.log(`  IX=${hex(regs.ix)} IY=${hex(regs.iy)} SP=${hex(regs.sp)} MBASE=${hex(regs.mbase, 2)}`);
  console.log(`  IFF1=${regs.iff1} IFF2=${regs.iff2} IM=${regs.im} MADL=${regs.madl} HALTED=${regs.halted}`);
}

function disassembleRange(romBytes, start, end, mode = 'adl') {
  const rows = [];
  let pc = start;

  while (pc < end) {
    let inst = null;
    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch (error) {
      rows.push({
        pc,
        length: 1,
        bytes: bytesAt(romBytes, pc, 1),
        text: `DB ${hex(romBytes[pc] ?? 0, 2)} ; decode error: ${error.message}`,
        inst: null,
      });
      pc += 1;
      continue;
    }

    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      length,
      bytes: bytesAt(romBytes, pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc += length;
  }

  return rows;
}

function printDisassembly(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
  }
  console.log('');
}

function summarizeControlFlow(rows) {
  return rows.filter((row) => ['jp', 'jp-conditional', 'jr', 'jr-conditional', 'ret', 'reti', 'retn', 'rst'].includes(row.inst?.tag));
}

function inspectPeripheralsSource(source) {
  const lines = source.split(/\r?\n/);
  const lineNumber = (needle) => {
    const index = lines.findIndex((line) => line.includes(needle));
    return index === -1 ? null : index + 1;
  };

  return {
    normalizePortLine: lineNumber('function normalizePort(port) {'),
    portMaskLine: lineNumber('return Number(port) & 0xffff;'),
    readNormalizeLine: lineNumber('const normalizedPort = normalizePort(port);'),
    handlerLookupLine: lineNumber('const handler = handlers.get(normalizedPort);'),
    intcRegisterLine: lineNumber('register({ start: 0x5000, end: 0x501f }, createIntcHandler());'),
    intc5015Line: lineNumber('if (reg === 0x15) return ((intcState.rawStatus & intcState.enableMask) >> 8) & 0xff;'),
  };
}

function summarizePortEvents(events) {
  const grouped = new Map();

  for (const event of events) {
    const key = `${event.direction}:${event.port}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        direction: event.direction,
        port: event.port,
        count: 0,
        values: new Map(),
      });
    }

    const entry = grouped.get(key);
    entry.count++;
    entry.values.set(event.value, (entry.values.get(event.value) ?? 0) + 1);
  }

  return [...grouped.values()].sort((left, right) => {
    if (left.port !== right.port) {
      return left.port - right.port;
    }
    return left.direction.localeCompare(right.direction);
  });
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const peripheralsSource = fs.readFileSync(PERIPHERALS_PATH, 'utf8');
  const peripheralInfo = inspectPeripheralsSource(peripheralsSource);

  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS ??
    transpiledModule.default?.PRELIFTED_BLOCKS ??
    transpiledModule.default ??
    transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  const postHaltRows = disassembleRange(romBytes, HALT_BLOCK_ENTRY, POST_HALT_END, 'adl');
  const nmiTailRows = disassembleRange(romBytes, NMI_TAIL_START, NMI_TAIL_END, 'adl');
  const nmiTailControls = summarizeControlFlow(nmiTailRows);

  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.halted = false;

  console.log('Phase 357: Post-HALT Trace at 0x0019BE');
  console.log('======================================');
  console.log(`ROM:                 ${ROM_PATH}`);
  console.log(`Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:         entry=${hex(BOOT_ENTRY)}:${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} timerInterrupt=false`);
  console.log(`Post-HALT config:    entry=${hex(POST_HALT_ENTRY)}:adl maxSteps=${POST_HALT_MAX_STEPS}`);
  console.log('');

  printDisassembly(
    `ADL disassembly ${hex(HALT_BLOCK_ENTRY)}-${hex(POST_HALT_END)}`,
    postHaltRows,
  );

  printDisassembly(
    `ADL disassembly ${hex(NMI_TAIL_START)}-${hex(NMI_TAIL_END)}`,
    nmiTailRows,
  );

  console.log('NMI tail control-flow instructions');
  console.log('----------------------------------');
  if (nmiTailControls.length === 0) {
    console.log('  (none)');
  } else {
    for (const row of nmiTailControls) {
      console.log(`  ${hex(row.pc)}: ${row.text}`);
    }
  }
  console.log('');

  const bootBlocks = new Set();
  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode) {
      bootBlocks.add(blockKey(pc & 0xFFFFFF, mode ?? 'adl'));
    },
  });

  console.log('Boot-to-HALT summary');
  console.log('--------------------');
  console.log(`  termination: ${bootResult.termination}`);
  console.log(`  steps:       ${bootResult.steps}`);
  console.log(`  lastPc:      ${hex(bootResult.lastPc)}:${bootResult.lastMode}`);
  console.log(`  blocks:      ${bootBlocks.size}`);
  printRegs('  registers at boot stop', snapshotRegs(cpu));
  console.log('');

  const postTrace = {
    active: false,
    currentStep: 0,
    currentPc: POST_HALT_ENTRY,
    currentMode: 'adl',
    uniqueBlocks: new Map(),
    blockOrder: [],
    portEvents: [],
    missingBlocks: [],
  };

  cpu.onIoRead = (port, value) => {
    if (!postTrace.active) {
      return;
    }
    postTrace.portEvents.push({
      step: postTrace.currentStep,
      pc: postTrace.currentPc,
      mode: postTrace.currentMode,
      direction: 'IN',
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    });
  };

  cpu.onIoWrite = (port, value) => {
    if (!postTrace.active) {
      return;
    }
    postTrace.portEvents.push({
      step: postTrace.currentStep,
      pc: postTrace.currentPc,
      mode: postTrace.currentMode,
      direction: 'OUT',
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    });
  };

  cpu.halted = false;
  cpu.pc = POST_HALT_ENTRY;
  cpu.madl = 1;
  postTrace.active = true;

  const postResult = executor.runFrom(POST_HALT_ENTRY, 'adl', {
    maxSteps: POST_HALT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const key = blockKey(normalizedPc, normalizedMode);

      postTrace.currentStep = step;
      postTrace.currentPc = normalizedPc;
      postTrace.currentMode = normalizedMode;
      postTrace.blockOrder.push(key);

      if (!postTrace.uniqueBlocks.has(key)) {
        postTrace.uniqueBlocks.set(key, {
          pc: normalizedPc,
          mode: normalizedMode,
          firstStep: step,
          firstInstruction: meta?.instructions?.[0]?.dasm ?? null,
        });
      }
    },
    onMissingBlock(pc, mode, step) {
      postTrace.missingBlocks.push({
        step,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      });
    },
  });

  postTrace.active = false;

  const uniqueBlockRows = [...postTrace.uniqueBlocks.values()].sort((left, right) => left.firstStep - right.firstStep);
  const first5015Read = postTrace.portEvents.find((event) => event.direction === 'IN' && event.port === 0x5015);
  const branchOutcome = first5015Read
    ? (first5015Read.value === 0x00 ? `taken -> ${hex(0x0019EF)}` : `not taken -> ${hex(0x0019C6)}`)
    : 'unknown';
  const portSummary = summarizePortEvents(postTrace.portEvents);

  console.log('Post-HALT execution summary');
  console.log('---------------------------');
  console.log(`  termination: ${postResult.termination}`);
  console.log(`  steps:       ${postResult.steps}`);
  console.log(`  lastPc:      ${hex(postResult.lastPc)}:${postResult.lastMode}`);
  console.log(`  uniqueBlocks:${postTrace.uniqueBlocks.size}`);
  console.log(`  missingHits: ${postTrace.missingBlocks.length}`);
  printRegs('  registers after post-HALT run', snapshotRegs(cpu));
  console.log('');

  console.log('Unique blocks visited from 0x0019BE');
  console.log('-----------------------------------');
  if (uniqueBlockRows.length === 0) {
    console.log('  (none)');
  } else {
    for (const row of uniqueBlockRows) {
      console.log(
        `  step=${String(row.firstStep).padStart(4)}  ${hex(row.pc)}:${row.mode}  ${row.firstInstruction ?? ''}`.trimEnd(),
      );
    }
  }
  console.log('');

  console.log('Port I/O trace from 0x0019BE onward');
  console.log('-----------------------------------');
  if (postTrace.portEvents.length === 0) {
    console.log('  (none)');
  } else {
    for (const event of postTrace.portEvents) {
      console.log(
        `  step=${String(event.step).padStart(4)}  pc=${hex(event.pc)}:${event.mode}  `
        + `${event.direction} ${hex(event.port, 4)} ${event.direction === 'IN' ? '->' : '<-'} ${hex(event.value, 2)}`,
      );
    }
  }
  console.log('');

  console.log('Port summary');
  console.log('------------');
  if (portSummary.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of portSummary) {
      const values = [...entry.values.entries()]
        .sort((left, right) => left[0] - right[0])
        .map(([value, count]) => `${hex(value, 2)} x${count}`)
        .join(', ');
      console.log(`  ${entry.direction} ${hex(entry.port, 4)} count=${entry.count} values=[${values}]`);
    }
  }
  console.log('');

  console.log('Observed answers');
  console.log('----------------');
  console.log(`  First IN A,(C) at ${hex(POST_HALT_ENTRY)} read ${first5015Read ? hex(first5015Read.value, 2) : 'n/a'} from port ${hex(0x5015, 4)}.`);
  console.log(`  JR Z at ${hex(0x0019C4)} was ${branchOutcome}.`);
  console.log(`  Port handling is 16-bit: normalizePort() masks to 0xFFFF (line ${peripheralInfo.portMaskLine ?? 'n/a'}) and reads/writes look up the exact normalized port (line ${peripheralInfo.handlerLookupLine ?? 'n/a'}).`);
  console.log(`  Interrupt controller range registration is ${hex(0x5000, 4)}-${hex(0x501F, 4)} on line ${peripheralInfo.intcRegisterLine ?? 'n/a'}, with masked-status byte 1 (${hex(0x5015, 4)}) read on line ${peripheralInfo.intc5015Line ?? 'n/a'}.`);
  console.log(`  So port ${hex(0x5015, 4)} is handled directly as a full 16-bit port; the bus does not collapse this to plain port ${hex(0x50, 2)}.`);
  console.log('');

  if (postTrace.missingBlocks.length > 0) {
    console.log('Missing-block hits');
    console.log('------------------');
    for (const miss of postTrace.missingBlocks.slice(0, 20)) {
      console.log(`  step=${miss.step} pc=${hex(miss.pc)}:${miss.mode}`);
    }
    if (postTrace.missingBlocks.length > 20) {
      console.log(`  ... and ${postTrace.missingBlocks.length - 20} more`);
    }
    console.log('');
  }

  console.log('--- probe complete ---');
}

await main();
