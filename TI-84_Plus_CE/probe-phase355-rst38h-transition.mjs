#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const TRACE_ENTRY = 0x00D7BE;
const TRACE_STEPS = 3000;
const WARMUP_LIMIT = 10000;

const DISASM_START = 0x00D330;
const DISASM_LENGTH = 0x40;
const DISASM_END = DISASM_START + DISASM_LENGTH;

const TRACE_RANGE_START = 0x00D330;
const TRACE_RANGE_END = 0x00D360;

const TRANSITION_BLOCK_PC = 0x00D33B;
const RST_VECTOR = 0x000038;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesToHex(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatDisp(value) {
  if (!Number.isFinite(value)) {
    return '+0x00';
  }
  if (value >= 0) {
    return `+0x${value.toString(16).toUpperCase()}`;
  }
  return `-0x${(-value).toString(16).toUpperCase()}`;
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function fallbackMnemonic(inst) {
  const ignored = new Set([
    'fallthrough',
    'kind',
    'length',
    'mode',
    'modePrefix',
    'nextMode',
    'nextPc',
    'pc',
    'targetMode',
    'terminates',
  ]);

  const parts = [];
  for (const [key, value] of Object.entries(inst ?? {})) {
    if (key === 'tag' || ignored.has(key) || value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'number') {
      if (key === 'addr' || key === 'target' || key === 'value') {
        parts.push(`${key}=${hex(value)}`);
      } else if (key === 'displacement') {
        parts.push(`${key}=${formatDisp(value)}`);
      } else if (key === 'port') {
        parts.push(`${key}=${hex(value, 2)}`);
      } else {
        parts.push(`${key}=${value}`);
      }
    } else {
      parts.push(`${key}=${value}`);
    }
  }

  return withModePrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : inst.tag);
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'adc-pair':
      return withModePrefix(inst, `adc hl, ${inst.src}`);
    case 'add-pair':
      return withModePrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'alu-imm':
      return withModePrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg':
      return withModePrefix(inst, `${inst.op} ${inst.src}`);
    case 'bit-test':
      return withModePrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind':
      return withModePrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'call':
      return withModePrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'ccf':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'daa':
    case 'di':
    case 'ei':
    case 'ex-af':
    case 'ex-de-hl':
    case 'ex-sp-hl':
    case 'exx':
    case 'halt':
    case 'ldd':
    case 'lddr':
    case 'ldi':
    case 'ldir':
    case 'ld-mb-a':
    case 'ld-a-mb':
    case 'neg':
    case 'nop':
    case 'rla':
    case 'rlca':
    case 'rra':
    case 'rrca':
    case 'rrd':
    case 'rld':
    case 'scf':
    case 'stmix':
    case 'rsmix':
      return withModePrefix(inst, inst.tag);
    case 'dec-pair':
      return withModePrefix(inst, `dec ${inst.pair}`);
    case 'dec-reg':
      return withModePrefix(inst, `dec ${inst.reg}`);
    case 'djnz':
      return withModePrefix(inst, `djnz ${hex(inst.target)}`);
    case 'im':
      return withModePrefix(inst, `im ${inst.value}`);
    case 'in-imm':
      return withModePrefix(inst, `in a, (${hexByte(inst.port)})`);
    case 'in-reg':
      return withModePrefix(inst, `in ${inst.reg}, (c)`);
    case 'in0':
      return withModePrefix(inst, `in0 ${inst.reg}, (${hexByte(inst.port)})`);
    case 'inc-pair':
      return withModePrefix(inst, `inc ${inst.pair}`);
    case 'inc-reg':
      return withModePrefix(inst, `inc ${inst.reg}`);
    case 'indexed-cb-bit':
      return withModePrefix(inst, `bit ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'indexed-cb-res':
      return withModePrefix(inst, `res ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'indexed-cb-rotate':
      return withModePrefix(
        inst,
        `${inst.operation ?? inst.op ?? 'rotate'} (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'indexed-cb-set':
      return withModePrefix(inst, `set ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'jp':
      return withModePrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withModePrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr':
      return withModePrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-ind-imm':
      return withModePrefix(inst, `ld (hl), ${hexByte(inst.value)}`);
    case 'ld-ind-pair':
      return withModePrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-ind-reg':
      return withModePrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-indexed-pair':
      return withModePrefix(inst, `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.pair}`);
    case 'ld-mem-pair':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-indexed':
      return withModePrefix(inst, `ld ${inst.pair}, (${inst.indexRegister}${formatDisp(inst.displacement)})`);
    case 'ld-pair-mem':
      return withModePrefix(inst, `ld ${inst.pair}, (${hex(inst.addr)})`);
    case 'ld-reg-imm':
      return withModePrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-mem':
      return withModePrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-sp-hl':
      return withModePrefix(inst, `ld sp, ${inst.pair ?? 'hl'}`);
    case 'ld-sp-pair':
      return withModePrefix(inst, `ld sp, ${inst.pair}`);
    case 'lea':
      return withModePrefix(inst, `lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`);
    case 'mlt':
      return withModePrefix(inst, `mlt ${inst.reg}`);
    case 'out-imm':
      return withModePrefix(inst, `out (${hexByte(inst.port)}), a`);
    case 'out-reg':
      return withModePrefix(inst, `out (c), ${inst.reg}`);
    case 'out0':
      return withModePrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);
    case 'pea':
      return withModePrefix(inst, `pea ${inst.base}${formatDisp(inst.displacement)}`);
    case 'pop':
      return withModePrefix(inst, `pop ${inst.pair}`);
    case 'push':
      return withModePrefix(inst, `push ${inst.pair}`);
    case 'ret':
      return withModePrefix(inst, 'ret');
    case 'ret-conditional':
      return withModePrefix(inst, `ret ${inst.condition}`);
    case 'reti':
      return withModePrefix(inst, 'reti');
    case 'retn':
      return withModePrefix(inst, 'retn');
    case 'rotate-ind':
      return withModePrefix(inst, `${inst.op} (${inst.indirectRegister})`);
    case 'rotate-reg':
      return withModePrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rst':
      return withModePrefix(inst, `rst ${hexByte(inst.target)}`);
    case 'sbc-pair':
      return withModePrefix(inst, `sbc hl, ${inst.src}`);
    case 'slp':
      return withModePrefix(inst, 'slp');
    case 'tst-imm':
      return withModePrefix(inst, `tst ${hexByte(inst.value)}`);
    case 'tst-reg':
      return withModePrefix(inst, `tst ${inst.reg}`);
    default:
      return fallbackMnemonic(inst);
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const exits = executor.blockMeta?.[key]?.exits;
  if (!exits) {
    return currentMode;
  }
  for (const exit of exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function createCPU(mem, bus, blocks) {
  const executor = createExecutor(blocks, mem, { peripherals: bus });
  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.pc = 0;
  cpu.__executor = executor;
  cpu.__bus = bus;
  return { cpu, executor };
}

function decodeRow(rom, pc, mode) {
  try {
    const inst = decodeInstruction(rom, pc, mode);
    const length = Math.max(1, inst?.length ?? 1);
    return {
      pc,
      length,
      bytes: bytesToHex(rom, pc, length),
      text: formatInstruction(inst),
      inst,
    };
  } catch (error) {
    return {
      pc,
      length: 1,
      bytes: bytesToHex(rom, pc, 1),
      text: `db ${hexByte(rom[pc] ?? 0)} ; ${error?.message ?? 'decode error'}`,
      inst: null,
    };
  }
}

function printStaticDisassembly(rom) {
  console.log('=== Static Disassembly: 0x00D330-0x00D36F (z80 mode) ===');
  let pc = DISASM_START;
  while (pc < DISASM_END) {
    const row = decodeRow(rom, pc, 'z80');
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.text}`);
    pc += row.length;
  }
  console.log('');
}

function printOpcodeCheck(rom) {
  const byteAtD33B = rom[TRANSITION_BLOCK_PC] ?? 0;
  const rowAtD33B = decodeRow(rom, TRANSITION_BLOCK_PC, 'z80');
  const rstPc = (TRANSITION_BLOCK_PC + rowAtD33B.length) & 0xFFFFFF;
  const rowAtRst = decodeRow(rom, rstPc, 'z80');

  console.log('=== Opcode Check: 0x00D33B ===');
  console.log(`Byte at ${hex(TRANSITION_BLOCK_PC)}: ${hexByte(byteAtD33B)}`);
  if (byteAtD33B === 0xFF) {
    console.log(`${hex(TRANSITION_BLOCK_PC)} is directly RST 38h.`);
  } else {
    console.log(`${hex(TRANSITION_BLOCK_PC)} is not RST 38h.`);
    console.log(`${hex(TRANSITION_BLOCK_PC)}  ${rowAtD33B.bytes.padEnd(17)}  ${rowAtD33B.text}`);
    console.log(`${hex(rstPc)}  ${rowAtRst.bytes.padEnd(17)}  ${rowAtRst.text}`);
  }
  console.log('');
}

function stepRuntime(runtime) {
  const { cpu, executor, peripherals } = runtime;
  const fromPc = cpu.pc & 0xFFFFFF;
  const fromMode = cpu.madl ? 'adl' : 'z80';
  const key = blockKey(fromPc, fromMode);
  const fn = executor.compiledBlocks?.[key];
  const meta = executor.blockMeta?.[key] ?? null;
  const spBefore = cpu.sp & 0xFFFFFF;

  if (typeof fn !== 'function') {
    return {
      fromPc,
      fromMode,
      key,
      meta,
      spBefore,
      spAfter: cpu.sp & 0xFFFFFF,
      nextPc: null,
      nextMode: fromMode,
      termination: 'missing_block',
      error: new Error(`Missing block ${key}`),
    };
  }

  cpu._currentBlockPc = fromPc;

  let result;
  try {
    result = fn(cpu);
  } catch (error) {
    return {
      fromPc,
      fromMode,
      key,
      meta,
      spBefore,
      spAfter: cpu.sp & 0xFFFFFF,
      nextPc: null,
      nextMode: fromMode,
      termination: 'error',
      error,
    };
  }

  if (result === undefined || result === null) {
    return {
      fromPc,
      fromMode,
      key,
      meta,
      spBefore,
      spAfter: cpu.sp & 0xFFFFFF,
      nextPc: null,
      nextMode: fromMode,
      termination: 'no_return',
    };
  }

  if (result < 0) {
    if (result === -1 && runtime.wakeFromHalt) {
      const haltReturnPc = (fromPc + 1) & 0xFFFFFF;
      cpu.halted = false;

      if (runtime.wakeFromHalt === 'nmi') {
        cpu.push(haltReturnPc);
        cpu.pc = 0x000066;
        cpu.madl = 1;
      } else {
        cpu.push(haltReturnPc);
        cpu.pc = 0x000038;
        cpu.madl = 1;
      }

      runtime.wakeFromHalt = null;
      return {
        fromPc,
        fromMode,
        key,
        meta,
        spBefore,
        spAfter: cpu.sp & 0xFFFFFF,
        nextPc: cpu.pc & 0xFFFFFF,
        nextMode: cpu.madl ? 'adl' : 'z80',
        termination: null,
        result,
      };
    }

    if (result === -1 && typeof peripherals.tick === 'function') {
      peripherals.tick();

      if (typeof peripherals.hasPendingNMI === 'function' && peripherals.hasPendingNMI()) {
        cpu.halted = false;
        const haltReturnPc = (fromPc + 1) & 0xFFFFFF;
        cpu.push(haltReturnPc);
        cpu.iff2 = cpu.iff1;
        cpu.iff1 = 0;
        cpu.pc = 0x000066;
        cpu.madl = 1;
        if (typeof peripherals.acknowledgeNMI === 'function') {
          peripherals.acknowledgeNMI();
        }
        return {
          fromPc,
          fromMode,
          key,
          meta,
          spBefore,
          spAfter: cpu.sp & 0xFFFFFF,
          nextPc: cpu.pc & 0xFFFFFF,
          nextMode: 'adl',
          termination: null,
          result,
        };
      }

      if (
        typeof peripherals.hasPendingIRQ === 'function' &&
        peripherals.hasPendingIRQ() &&
        cpu.iff1
      ) {
        cpu.halted = false;
        const haltReturnPc = (fromPc + 1) & 0xFFFFFF;
        cpu.push(haltReturnPc);
        cpu.iff1 = 0;
        cpu.iff2 = 0;
        cpu.pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : RST_VECTOR;
        cpu.madl = 1;
        if (typeof peripherals.acknowledgeIRQ === 'function') {
          peripherals.acknowledgeIRQ();
        }
        return {
          fromPc,
          fromMode,
          key,
          meta,
          spBefore,
          spAfter: cpu.sp & 0xFFFFFF,
          nextPc: cpu.pc & 0xFFFFFF,
          nextMode: 'adl',
          termination: null,
          result,
        };
      }
    }

    return {
      fromPc,
      fromMode,
      key,
      meta,
      spBefore,
      spAfter: cpu.sp & 0xFFFFFF,
      nextPc: null,
      nextMode: fromMode,
      termination: result === -1 ? 'halt' : 'sleep',
      result,
    };
  }

  if (typeof peripherals.tick === 'function') {
    peripherals.tick();

    if (typeof peripherals.hasPendingNMI === 'function' && peripherals.hasPendingNMI()) {
      cpu.push(result);
      cpu.iff2 = cpu.iff1;
      cpu.iff1 = 0;
      cpu.pc = 0x000066;
      cpu.madl = 1;
      if (typeof peripherals.acknowledgeNMI === 'function') {
        peripherals.acknowledgeNMI();
      }
      return {
        fromPc,
        fromMode,
        key,
        meta,
        spBefore,
        spAfter: cpu.sp & 0xFFFFFF,
        nextPc: cpu.pc & 0xFFFFFF,
        nextMode: 'adl',
        termination: null,
        result,
      };
    }

    if (
      typeof peripherals.hasPendingIRQ === 'function' &&
      peripherals.hasPendingIRQ() &&
      cpu.iff1
    ) {
      cpu.push(result);
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : RST_VECTOR;
      cpu.madl = 1;
      if (typeof peripherals.acknowledgeIRQ === 'function') {
        peripherals.acknowledgeIRQ();
      }
      return {
        fromPc,
        fromMode,
        key,
        meta,
        spBefore,
        spAfter: cpu.sp & 0xFFFFFF,
        nextPc: cpu.pc & 0xFFFFFF,
        nextMode: 'adl',
        termination: null,
        result,
      };
    }
  }

  const nextMode = resolveNextMode(executor, key, result, fromMode);
  cpu.pc = result & 0xFFFFFF;
  cpu.madl = nextMode === 'adl' ? 1 : 0;

  return {
    fromPc,
    fromMode,
    key,
    meta,
    spBefore,
    spAfter: cpu.sp & 0xFFFFFF,
    nextPc: cpu.pc & 0xFFFFFF,
    nextMode,
    termination: null,
    result,
  };
}

function warmToSeed(runtime) {
  const { cpu } = runtime;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;

  for (let step = 0; step < WARMUP_LIMIT; step += 1) {
    if ((cpu.pc & 0xFFFFFF) === TRACE_ENTRY && (cpu.madl ? 'adl' : 'z80') === 'z80') {
      return { found: true, step };
    }

    const info = stepRuntime(runtime);
    if (info.termination) {
      return {
        found: false,
        step,
        termination: info.termination,
        lastPc: info.fromPc,
        lastMode: info.fromMode,
        error: info.error ?? null,
      };
    }
  }

  return {
    found: false,
    step: WARMUP_LIMIT,
    termination: 'warmup_limit',
    lastPc: runtime.cpu.pc & 0xFFFFFF,
    lastMode: runtime.cpu.madl ? 'adl' : 'z80',
    error: null,
  };
}

function printRangeHit(stepNumber, inst, spBefore) {
  const bytes = String(inst?.bytes ?? '').toUpperCase();
  const text = inst?.dasm ?? formatInstruction(inst);
  console.log(
    `step=${String(stepNumber).padStart(4)}  ` +
    `pc=${hex(inst.pc)}  ` +
    `bytes=${bytes.padEnd(11)}  ` +
    `sp=${hex(spBefore)}  ` +
    `${text}`,
  );
}

function traceFromSeed(runtime, rom) {
  const transition = { value: null };
  let termination = 'max_steps';
  let error = null;
  let executed = 0;

  console.log('=== Dynamic Trace: executed instructions in 0x00D330-0x00D360 ===');

  for (let step = 0; step < TRACE_STEPS; step += 1) {
    const key = blockKey(runtime.cpu.pc & 0xFFFFFF, runtime.cpu.madl ? 'adl' : 'z80');
    const meta = runtime.executor.blockMeta?.[key] ?? null;
    const spBefore = runtime.cpu.sp & 0xFFFFFF;
    const instructions = Array.isArray(meta?.instructions) ? meta.instructions : [];
    const hits = instructions.filter((inst) => inst.pc >= TRACE_RANGE_START && inst.pc <= TRACE_RANGE_END);

    for (const inst of hits) {
      printRangeHit(step + 1, inst, spBefore);
    }

    const info = stepRuntime(runtime);
    executed = step + 1;

    if (
      transition.value === null &&
      info.fromPc === TRANSITION_BLOCK_PC &&
      info.fromMode === 'z80' &&
      info.nextPc === RST_VECTOR
    ) {
      const lastInstruction =
        [...instructions].reverse().find((inst) => inst?.tag === 'rst')
        ?? instructions[instructions.length - 1]
        ?? null;

      transition.value = {
        traceStep: step + 1,
        blockPc: info.fromPc,
        blockMode: info.fromMode,
        nextPc: info.nextPc,
        nextMode: info.nextMode,
        lastInstructionPc: lastInstruction?.pc ?? null,
        lastInstructionBytes: String(lastInstruction?.bytes ?? '').toUpperCase(),
        lastInstructionText: lastInstruction?.dasm ?? (lastInstruction ? formatInstruction(lastInstruction) : 'n/a'),
        a: runtime.cpu.a & 0xFF,
        f: runtime.cpu.f & 0xFF,
        sp: runtime.cpu.sp & 0xFFFFFF,
        iy: runtime.cpu.iy & 0xFFFFFF,
        spBefore: info.spBefore,
        spAfter: info.spAfter,
      };
    }

    if (info.termination) {
      termination = info.termination;
      error = info.error ?? null;
      break;
    }
  }

  if (termination === 'max_steps') {
    termination = executed >= TRACE_STEPS ? 'max_steps' : 'completed';
  }

  console.log('');
  return {
    executed,
    termination,
    error,
    transition: transition.value,
    lastPc: runtime.cpu.pc & 0xFFFFFF,
    lastMode: runtime.cpu.madl ? 'adl' : 'z80',
  };
}

function printTransitionSummary(rom, traceResult) {
  const byteAtD33B = rom[TRANSITION_BLOCK_PC] ?? 0;

  console.log('=== Transition Capture ===');
  if (!traceResult.transition) {
    console.log('Transition from 0x00D33B to 0x000038 was not observed in the 3000-step trace window.');
    console.log(`Trace termination: ${traceResult.termination}`);
    console.log(`Last PC/mode:      ${hex(traceResult.lastPc)}:${traceResult.lastMode}`);
    if (traceResult.error) {
      console.log(`Error:             ${traceResult.error?.stack ?? traceResult.error}`);
    }
    console.log('');
    return;
  }

  const capture = traceResult.transition;

  console.log(`Trace step:             ${capture.traceStep}`);
  console.log(`Observed block entry:   ${hex(capture.blockPc)}:${capture.blockMode}`);
  console.log(`Byte at 0x00D33B:       ${hexByte(byteAtD33B)}`);
  console.log(`Last instruction:       ${hex(capture.lastInstructionPc)}  ${capture.lastInstructionBytes.padEnd(11)}  ${capture.lastInstructionText}`);
  console.log(`Next PC / mode:         ${hex(capture.nextPc)}:${capture.nextMode}`);
  console.log(`A:                      ${hexByte(capture.a)}`);
  console.log(`F:                      ${hexByte(capture.f)}`);
  console.log(`SP before / after RST:  ${hex(capture.spBefore)} -> ${hex(capture.spAfter)}`);
  console.log(`IY:                     ${hex(capture.iy)}`);
  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const rom = new Uint8Array(fs.readFileSync(ROM_PATH));
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const bus = createPeripheralBus({ timerInterrupt: false });
  const transpiledModule = await import('./ROM.transpiled.js');
  const blocks = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS ??
    transpiledModule.default?.PRELIFTED_BLOCKS ??
    transpiledModule.default ??
    transpiledModule,
  );

  const runtime = {
    ...createCPU(mem, bus, blocks),
    peripherals: bus,
    wakeFromHalt: 'nmi',
  };

  console.log('Phase 355: Trace 0x00D33B -> RST 38h transition');
  console.log('================================================');
  console.log(`ROM:               ${ROM_PATH}`);
  console.log(`Seed entry:        ${hex(TRACE_ENTRY)}:z80`);
  console.log(`Trace budget:      ${TRACE_STEPS} block steps`);
  console.log(`Timer interrupt:   false`);
  console.log('');

  printStaticDisassembly(rom);
  printOpcodeCheck(rom);

  const warmup = warmToSeed(runtime);
  console.log('=== Warmup To Seed ===');
  if (!warmup.found) {
    console.log(`Failed to reach ${hex(TRACE_ENTRY)}:z80 from cold boot.`);
    console.log(`Warmup step:       ${warmup.step}`);
    console.log(`Termination:       ${warmup.termination}`);
    console.log(`Last PC/mode:      ${hex(warmup.lastPc)}:${warmup.lastMode}`);
    if (warmup.error) {
      console.log(`Error:             ${warmup.error?.stack ?? warmup.error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Reached ${hex(TRACE_ENTRY)}:z80 after ${warmup.step} warmup steps.`);
  console.log('');

  const traceResult = traceFromSeed(runtime, rom);
  console.log('=== Trace Summary ===');
  console.log(`Executed steps:     ${traceResult.executed}`);
  console.log(`Termination:        ${traceResult.termination}`);
  console.log(`Last PC/mode:       ${hex(traceResult.lastPc)}:${traceResult.lastMode}`);
  if (traceResult.error) {
    console.log(`Error:              ${traceResult.error?.stack ?? traceResult.error}`);
  }
  console.log('');

  printTransitionSummary(rom, traceResult);
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
