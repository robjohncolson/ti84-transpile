#!/usr/bin/env node

/**
 * Phase 221: _GetKey scan-code -> key-code table hunt
 *
 * Goals:
 *  1. Disassemble the published _GetKey/_GetCSC entrypoints and any shared
 *     jump chain they feed into.
 *  2. Boot the transpiled ROM, inject a few known keys, confirm their raw
 *     scan codes via the direct keyboard scanner, then trace _GetKey.
 *  3. Heuristically scan ROM near the published _GetKey area for lookup
 *     tables whose entries look like key codes (0x5A-0xFF).
 *
 * Notes discovered while wiring this probe:
 *  - 0x04AB5D and 0x04AB65 are JP veneers in this ROM image.
 *  - The direct keyboard scan helper at 0x0159C0 still gives us a ground
 *    truth scan code for each injected key in the transpiled environment.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const RAM_IY = 0xD00080;
const KEYBOARD_IY = 0xE00800;
const IX_RESET = 0xD1A860;
const FAKE_RET = 0x7FFFFE;
const MEMINIT_RET = 0x7FFFF6;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEMINIT_ENTRY = 0x09DEE0;
const HOME_STAGE_ENTRIES = [
  { name: 'home-stage-1 status background', entry: 0x0A2B72 },
  { name: 'home-stage-2 status dots', entry: 0x0A3301 },
  { name: 'home-stage-3 home row', entry: 0x0A29EC },
  { name: 'home-stage-4 history area', entry: 0x0A2854 },
];

const GETKEY_ENTRY = 0x04AB5D;
const GETCSC_ENTRY = 0x04AB65;
const DIRECT_SCAN_ENTRY = 0x0159C0;
const DIRECT_SCAN_CAPTURE_PC = 0x015AD2;
const CONV_KEY_TO_TOK_BASE = 0x05BF84;

const KEY_TESTS = [
  { name: '+', group: 1, bit: 1 },
  { name: '1', group: 4, bit: 1 },
  { name: '4', group: 4, bit: 2 },
  { name: 'Y=', group: 6, bit: 4 },
  { name: 'GRAPH', group: 6, bit: 0 },
];

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function write24(mem, addr, value) {
  mem[addr & 0xFFFFFF] = value & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function formatBytes(addr, length) {
  return [...rom.subarray(addr, addr + length)]
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function formatIndexed(base, displacement) {
  const sign = displacement >= 0 ? '+' : '-';
  return `(${base}${sign}${Math.abs(displacement)})`;
}

function formatInstruction(instr) {
  if (!instr) return 'db ?';

  switch (instr.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'daa': return 'daa';
    case 'cpl': return 'cpl';
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-mb-a': return 'ld mb, a';
    case 'ld-a-mb': return 'ld a, mb';
    case 'ret': return 'ret';
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'jp': return `jp ${hex(instr.target, 6)}`;
    case 'jr': return `jr ${hex(instr.target, 6)}`;
    case 'call': return `call ${hex(instr.target, 6)}`;
    case 'rst': return `rst ${hex(instr.target, 2)}`;
    case 'jp-indirect': return `jp (${instr.indirectRegister})`;
    case 'ret-conditional': return `ret ${instr.condition}`;
    case 'jp-conditional': return `jp ${instr.condition}, ${hex(instr.target, 6)}`;
    case 'jr-conditional': return `jr ${instr.condition}, ${hex(instr.target, 6)}`;
    case 'call-conditional': return `call ${instr.condition}, ${hex(instr.target, 6)}`;
    case 'ld-pair-imm': return `ld ${instr.pair}, ${hex(instr.value, 6)}`;
    case 'ld-reg-imm': return `ld ${instr.dest}, ${hex(instr.value, 2)}`;
    case 'ld-reg-reg': return `ld ${instr.dest}, ${instr.src}`;
    case 'ld-reg-ind': return `ld ${instr.dest}, (${instr.src})`;
    case 'ld-ind-reg': return `ld (${instr.dest}), ${instr.src}`;
    case 'ld-reg-mem': return `ld ${instr.dest}, (${hex(instr.addr, 6)})`;
    case 'ld-mem-reg': return `ld (${hex(instr.addr, 6)}), ${instr.src}`;
    case 'ld-pair-mem':
      if (instr.direction === 'from-mem') return `ld ${instr.pair}, (${hex(instr.addr, 6)})`;
      if (instr.direction === 'to-mem') return `ld (${hex(instr.addr, 6)}), ${instr.pair}`;
      return `ld ${instr.pair}, (${hex(instr.addr, 6)})`;
    case 'ld-mem-pair': return `ld (${hex(instr.addr, 6)}), ${instr.pair}`;
    case 'ld-ind-imm': return `ld (hl), ${hex(instr.value, 2)}`;
    case 'ld-reg-ixd': return `ld ${instr.dest}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-ixd-reg': return `ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${instr.src}`;
    case 'ld-ixd-imm': return `ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${hex(instr.value, 2)}`;
    case 'ld-sp-pair': return `ld sp, ${instr.pair}`;
    case 'ld-pair-indexed': return `ld ${instr.pair}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-indexed-pair': return `ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${instr.pair}`;
    case 'ld-ixiy-indexed': return `ld ${instr.dest}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'ld-indexed-ixiy': return `ld ${formatIndexed(instr.indexRegister, instr.displacement)}, ${instr.src}`;
    case 'inc-reg': return `inc ${instr.reg}`;
    case 'dec-reg': return `dec ${instr.reg}`;
    case 'inc-pair': return `inc ${instr.pair}`;
    case 'dec-pair': return `dec ${instr.pair}`;
    case 'inc-ixd': return `inc ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'dec-ixd': return `dec ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'add-pair': return `add ${instr.dest}, ${instr.src}`;
    case 'adc-pair': return `adc hl, ${instr.src}`;
    case 'sbc-pair': return `sbc hl, ${instr.src}`;
    case 'alu-reg': return `${instr.op} a, ${instr.src}`;
    case 'alu-imm': return `${instr.op} a, ${hex(instr.value, 2)}`;
    case 'alu-ixd': return `${instr.op} a, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'in-reg': return `in ${instr.reg}, (c)`;
    case 'out-reg': return `out (c), ${instr.reg}`;
    case 'in0': return `in0 ${instr.reg}, (${hex(instr.port, 2)})`;
    case 'out0': return `out0 (${hex(instr.port, 2)}), ${instr.reg}`;
    case 'in-imm': return `in a, (${hex(instr.port, 2)})`;
    case 'out-imm': return `out (${hex(instr.port, 2)}), a`;
    case 'pop': return `pop ${instr.pair}`;
    case 'push': return `push ${instr.pair}`;
    case 'im': return `im ${instr.value}`;
    case 'bit-test': return `bit ${instr.bit}, ${instr.reg}`;
    case 'bit-test-ind': return `bit ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-res': return `res ${instr.bit}, ${instr.reg}`;
    case 'bit-res-ind': return `res ${instr.bit}, (${instr.indirectRegister})`;
    case 'bit-set': return `set ${instr.bit}, ${instr.reg}`;
    case 'bit-set-ind': return `set ${instr.bit}, (${instr.indirectRegister})`;
    case 'indexed-cb-bit': return `bit ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-res': return `res ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-set': return `set ${instr.bit}, ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'indexed-cb-rotate': return `${instr.operation} ${formatIndexed(instr.indexRegister, instr.displacement)}`;
    case 'tst-reg': return `tst a, ${instr.reg}`;
    case 'tst-ind': return 'tst a, (hl)';
    case 'tst-imm': return `tst a, ${hex(instr.value, 2)}`;
    case 'tstio': return `tstio ${hex(instr.value, 2)}`;
    case 'neg': return 'neg';
    case 'rrd': return 'rrd';
    case 'rld': return 'rld';
    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'ini': return 'ini';
    case 'inir': return 'inir';
    case 'ind': return 'ind';
    case 'indr': return 'indr';
    case 'outi': return 'outi';
    case 'otir': return 'otir';
    case 'outd': return 'outd';
    case 'otdr': return 'otdr';
    case 'otimr': return 'otimr';
    case 'lea': return `lea ${instr.dest}, ${formatIndexed(instr.base, instr.displacement)}`;
    case 'slp': return 'slp';
    default:
      return instr.tag;
  }
}

function safeDecode(addr) {
  try {
    // The current decoder uses the string mode name rather than the older
    // boolean API some earlier notes referenced.
    return decodeInstruction(rom, addr, 'adl');
  } catch {
    return null;
  }
}

function disassembleWindow(start, byteCount = 0x100) {
  const rows = [];
  const end = Math.min(start + byteCount, rom.length);
  let pc = start;

  while (pc < end) {
    const instr = safeDecode(pc);

    if (!instr || !instr.length || pc + instr.length > rom.length) {
      rows.push({
        pc,
        length: 1,
        bytes: formatBytes(pc, 1),
        text: `db ${hex(rom[pc], 2)}`,
        instr: null,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      length: instr.length,
      bytes: formatBytes(pc, instr.length),
      text: formatInstruction(instr),
      instr,
    });
    pc += instr.length;
  }

  return rows;
}

function isLookupConsumer(instr) {
  if (!instr) return false;

  if (instr.tag === 'ld-reg-ind' && instr.src === 'hl') return true;
  if (instr.tag === 'ld-ind-reg' && instr.dest === 'hl') return true;
  if (instr.tag === 'alu-reg' && instr.op === 'add' && instr.src === 'l') return true;
  if (instr.tag === 'alu-reg' && instr.op === 'add' && instr.src === 'h') return true;
  if (instr.tag === 'add-pair' && instr.dest === 'hl') return true;

  return false;
}

function isCompareOrBranch(instr) {
  if (!instr) return false;

  if (instr.tag === 'jp-conditional' || instr.tag === 'jr-conditional') return true;
  if (instr.tag === 'alu-imm' && instr.op === 'cp') return true;
  if (instr.tag === 'alu-reg' && instr.op === 'cp') return true;

  return false;
}

function analyzeDisasm(rows) {
  const lookupPatterns = [];
  const compareBranches = [];

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    const instr = row.instr;

    if (instr?.tag === 'ld-pair-imm' && instr.pair === 'hl') {
      const consumer = rows
        .slice(index + 1, index + 5)
        .find((candidate) => isLookupConsumer(candidate.instr));

      if (consumer) {
        lookupPatterns.push({
          base: row,
          consumer,
        });
      }
    }

    if (isCompareOrBranch(instr)) {
      compareBranches.push(row);
    }
  }

  return { lookupPatterns, compareBranches };
}

function followJumpChain(startPc, limit = 8) {
  const chain = [];
  const seen = new Set();
  let pc = startPc;

  for (let depth = 0; depth < limit; depth++) {
    if (seen.has(pc)) break;
    seen.add(pc);
    const instr = safeDecode(pc);
    if (!instr) break;
    chain.push({ pc, instr, text: formatInstruction(instr) });
    if (instr.tag !== 'jp') break;
    pc = instr.target & 0xFFFFFF;
  }

  return chain;
}

function printDisasmSection(label, startPc) {
  const rows = disassembleWindow(startPc, 0x100);
  const analysis = analyzeDisasm(rows);
  const chain = followJumpChain(startPc);

  console.log(`\n${'='.repeat(92)}`);
  console.log(`${label} @ ${hex(startPc, 6)} — 256-byte ADL disassembly`);
  console.log(`${'='.repeat(92)}`);

  for (const row of rows) {
    console.log(`${hex(row.pc, 6)}  ${row.bytes.padEnd(14)}  ${row.text}`);
  }

  console.log('\nJump chain:');
  for (const entry of chain) {
    console.log(`  ${hex(entry.pc, 6)} -> ${entry.text}`);
  }

  if (analysis.lookupPatterns.length > 0) {
    console.log('\nPossible lookup patterns:');
    for (const match of analysis.lookupPatterns) {
      console.log(
        `  ${hex(match.base.pc, 6)} ${match.base.text}  ...  ` +
        `${hex(match.consumer.pc, 6)} ${match.consumer.text}`
      );
    }
  } else {
    console.log('\nPossible lookup patterns: none in this 256-byte window.');
  }

  if (analysis.compareBranches.length > 0) {
    console.log('\nCP / branch lines:');
    for (const row of analysis.compareBranches) {
      console.log(`  ${hex(row.pc, 6)} ${row.text}`);
    }
  } else {
    console.log('\nCP / branch lines: none in this 256-byte window.');
  }
}

function resetStageCpu(cpu, mem, { iy = RAM_IY, stackBytes = 3 } = {}) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = iy;
  cpu._ix = IX_RESET;
  cpu.sp = STACK_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function prepareCall(cpu, mem, { iy = RAM_IY, returnPc = FAKE_RET, stackBytes = 12 } = {}) {
  resetStageCpu(cpu, mem, { iy, stackBytes });
  cpu.f = 0x40;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, returnPc);
}

function runMemInit(executor, cpu, mem) {
  prepareCall(cpu, mem, { iy: RAM_IY, returnPc: MEMINIT_RET, stackBytes: 12 });

  let returned = false;
  let result = null;
  let trapSteps = null;

  const checkReturn = (pc, step) => {
    if ((pc & 0xFFFFFF) === MEMINIT_RET) {
      trapSteps = step;
      throw new Error('__MEMINIT_RET__');
    }
  };

  try {
    result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 2000,
      maxLoopIterations: 1024,
      onBlock(pc, _mode, _meta, step) {
        checkReturn(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        checkReturn(pc, step);
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    steps: returned ? (trapSteps ?? 0) + 1 : result?.steps ?? 0,
    termination: returned ? 'return_hit' : (result?.termination ?? 'unknown'),
  };
}

function bootSystem() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const stages = [];

  stages.push({
    name: 'boot',
    result: executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
      maxSteps: 10000,
      maxLoopIterations: 32,
    }),
  });

  resetStageCpu(cpu, mem, { iy: RAM_IY, stackBytes: 3 });
  stages.push({
    name: 'kernelInit',
    result: executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
      maxSteps: 3000,
      maxLoopIterations: 500,
    }),
  });

  cpu._hl = 0;
  resetStageCpu(cpu, mem, { iy: RAM_IY, stackBytes: 3 });
  stages.push({
    name: 'postInit',
    result: executor.runFrom(POST_INIT_ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 500,
    }),
  });

  const memInit = runMemInit(executor, cpu, mem);
  stages.push({
    name: 'memInit',
    result: {
      steps: memInit.steps,
      termination: memInit.termination,
      lastPc: memInit.returned ? MEMINIT_RET : 0,
    },
  });

  for (const stage of HOME_STAGE_ENTRIES) {
    resetStageCpu(cpu, mem, { iy: RAM_IY, stackBytes: 3 });
    stages.push({
      name: stage.name,
      result: executor.runFrom(stage.entry, 'adl', {
        maxSteps: 15000,
        maxLoopIterations: 500,
      }),
    });
  }

  return { mem, peripherals, executor, cpu, stages };
}

function clearKeyboard(peripherals) {
  peripherals.keyboard.keyMatrix.fill(0xFF);
  peripherals.setKeyboardIRQ(false);
}

function pressSingleKey(peripherals, group, bit) {
  clearKeyboard(peripherals);
  peripherals.keyboard.keyMatrix[group] &= ~(1 << bit);
  peripherals.setKeyboardIRQ(true);
  peripherals.write(0x5006, 0x08);
}

function callDirectKeyboardScan(env) {
  const { cpu, mem, executor } = env;
  prepareCall(cpu, mem, { iy: KEYBOARD_IY, returnPc: FAKE_RET, stackBytes: 12 });

  let capturedB = null;
  let returned = false;
  let result = null;
  let trapSteps = null;

  const checkReturn = (pc, step) => {
    if ((pc & 0xFFFFFF) === FAKE_RET) {
      trapSteps = step;
      throw new Error('__RET__');
    }
  };

  try {
    result = executor.runFrom(DIRECT_SCAN_ENTRY, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 64,
      onBlock(pc, _mode, _meta, step) {
        if (pc === DIRECT_SCAN_CAPTURE_PC && capturedB === null) {
          capturedB = cpu.b & 0xFF;
        }
        checkReturn(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        checkReturn(pc, step);
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    scanCode: capturedB ?? (cpu.b & 0xFF),
    a: cpu.a & 0xFF,
    steps: returned ? (trapSteps ?? 0) + 1 : result?.steps ?? 0,
    termination: returned ? 'return_hit' : (result?.termination ?? 'unknown'),
  };
}

function traceGetKey(env) {
  const { cpu, mem, executor } = env;
  prepareCall(cpu, mem, { iy: RAM_IY, returnPc: FAKE_RET, stackBytes: 12 });

  const blocks = [];
  const pairLoads = [];
  const aChanges = [];
  const dynamicTargets = [];

  let returned = false;
  let result = null;
  let trapSteps = null;
  let lastA = cpu.a & 0xFF;

  const recordBlock = (pc, mode, meta, step, missing = false) => {
    const currentA = cpu.a & 0xFF;
    if (currentA !== lastA) {
      aChanges.push({
        step,
        pc,
        from: lastA,
        to: currentA,
      });
      lastA = currentA;
    }

    const instructions = meta?.instructions ?? [];
    for (const instr of instructions) {
      if (instr.tag === 'ld-pair-imm' && typeof instr.value === 'number') {
        pairLoads.push({
          step,
          pc: instr.pc,
          pair: instr.pair,
          value: instr.value & 0xFFFFFF,
          dasm: instr.dasm,
        });
      }
    }

    blocks.push({
      step,
      pc,
      mode,
      a: currentA,
      bc: cpu.bc & 0xFFFFFF,
      de: cpu.de & 0xFFFFFF,
      hl: cpu.hl & 0xFFFFFF,
      ix: cpu.ix & 0xFFFFFF,
      iy: cpu.iy & 0xFFFFFF,
      missing,
      firstDasm: instructions[0]?.dasm ?? '(missing)',
    });
  };

  const checkReturn = (pc, step) => {
    if ((pc & 0xFFFFFF) === FAKE_RET) {
      trapSteps = step;
      throw new Error('__RET__');
    }
  };

  try {
    result = executor.runFrom(GETKEY_ENTRY, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 128,
      wakeFromHalt: 'irq',
      onBlock(pc, mode, meta, step) {
        checkReturn(pc, step);
        recordBlock(pc, mode, meta, step, false);
      },
      onMissingBlock(pc, mode, step) {
        checkReturn(pc, step);
        recordBlock(pc, mode, null, step, true);
      },
      onDynamicTarget(targetPc, mode, fromPc, step) {
        dynamicTargets.push({ targetPc, mode, fromPc, step });
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    result,
    steps: returned ? (trapSteps ?? 0) + 1 : result?.steps ?? 0,
    termination: returned ? 'return_hit' : (result?.termination ?? 'unknown'),
    finalA: cpu.a & 0xFF,
    finalPc: returned ? FAKE_RET : (result?.lastPc ?? 0),
    blocks,
    pairLoads,
    aChanges,
    dynamicTargets,
  };
}

function convKeyToTokValue(keyCode) {
  if (keyCode < 0x5A || keyCode > 0xFF) return null;
  const index = keyCode - 0x5A;
  return rom[CONV_KEY_TO_TOK_BASE + index] ?? null;
}

function formatCandidateSample(scanCode, value) {
  if (value === null || value === undefined) {
    return `${hex(scanCode, 2)}->(out-of-range)`;
  }

  const token = convKeyToTokValue(value);
  if (token === null) {
    return `${hex(scanCode, 2)}->${hex(value, 2)}`;
  }

  return `${hex(scanCode, 2)}->${hex(value, 2)} (tok ${hex(token, 2)})`;
}

function evaluateWindow(addr, length, scanCodes) {
  if (addr < 0 || addr + length > rom.length) return null;

  const bytes = rom.subarray(addr, addr + length);
  let highCount = 0;
  let zeroCount = 0;

  for (const byte of bytes) {
    if (byte >= 0x5A) highCount++;
    if (byte === 0x00) zeroCount++;
  }

  const sampleValues = scanCodes.map((scanCode) => (
    scanCode < length ? bytes[scanCode] : null
  ));
  const highSamples = sampleValues.filter((value) => value !== null && value >= 0x5A).length;
  const distinctSamples = new Set(sampleValues.filter((value) => value !== null)).size;
  const score = (highSamples * 12) + highCount + (distinctSamples * 2) - zeroCount;

  return {
    addr,
    length,
    highCount,
    zeroCount,
    highSamples,
    distinctSamples,
    score,
    sampleValues,
  };
}

function findCandidateTables(scanCodes, pairLoads) {
  const candidates = [];
  const seen = new Set();

  const lengths = [64, 96, 104, 128, 166];
  const addCandidate = (candidate) => {
    if (!candidate) return;
    if (candidate.highSamples < 2 && candidate.highCount < Math.floor(candidate.length / 3)) {
      return;
    }

    const key = `${candidate.addr}:${candidate.length}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(candidate);
  };

  for (let addr = 0x04AB00; addr <= 0x04AD00; addr++) {
    for (const length of lengths) {
      addCandidate(evaluateWindow(addr, length, scanCodes));
    }
  }

  for (const load of pairLoads) {
    if (load.value < 0 || load.value >= rom.length) continue;
    for (const length of lengths) {
      addCandidate(evaluateWindow(load.value, length, scanCodes));
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score || left.addr - right.addr)
    .slice(0, 12);
}

function printTraceSummary(key, directScan, trace) {
  console.log(`\n${'-'.repeat(92)}`);
  console.log(`Key ${key.name}  group=${key.group} bit=${key.bit}`);
  console.log(`${'-'.repeat(92)}`);
  console.log(
    `Direct scan @ ${hex(DIRECT_SCAN_ENTRY, 6)}: ` +
    `B=${hex(directScan.scanCode, 2)} A=${hex(directScan.a, 2)} ` +
    `steps=${directScan.steps} term=${directScan.termination}`
  );
  console.log(
    `_GetKey @ ${hex(GETKEY_ENTRY, 6)}: ` +
    `returned=${trace.returned} finalA=${hex(trace.finalA, 2)} ` +
    `steps=${trace.steps} term=${trace.termination} finalPc=${hex(trace.finalPc, 6)}`
  );

  if (trace.pairLoads.length > 0) {
    console.log('Immediate pair loads seen during trace:');
    for (const load of trace.pairLoads.slice(0, 16)) {
      console.log(`  [${String(load.step).padStart(3)}] ${hex(load.pc, 6)} ${load.dasm}`);
    }
  } else {
    console.log('Immediate pair loads seen during trace: none');
  }

  if (trace.aChanges.length > 0) {
    console.log('A-register changes at block boundaries:');
    for (const change of trace.aChanges.slice(0, 16)) {
      console.log(
        `  [${String(change.step).padStart(3)}] ${hex(change.pc, 6)} ` +
        `${hex(change.from, 2)} -> ${hex(change.to, 2)}`
      );
    }
  } else {
    console.log('A-register changes at block boundaries: none');
  }

  if (trace.dynamicTargets.length > 0) {
    console.log('Dynamic targets:');
    for (const target of trace.dynamicTargets.slice(0, 8)) {
      console.log(
        `  [${String(target.step).padStart(3)}] ${hex(target.fromPc, 6)} -> ` +
        `${hex(target.targetPc, 6)}:${target.mode}`
      );
    }
  }

  console.log('Trace excerpt:');
  for (const block of trace.blocks.slice(0, 24)) {
    const marker = block.missing ? 'MISSING' : block.firstDasm;
    console.log(
      `  [${String(block.step).padStart(3)}] ${hex(block.pc, 6)}:${block.mode} ` +
      `A=${hex(block.a, 2)} BC=${hex(block.bc, 6)} DE=${hex(block.de, 6)} ` +
      `HL=${hex(block.hl, 6)} ${marker}`
    );
  }
}

function main() {
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`Lifted blocks: ${Object.keys(PRELIFTED_BLOCKS).length}`);

  printDisasmSection('_GetKey published entrypoint', GETKEY_ENTRY);
  printDisasmSection('_GetCSC published entrypoint', GETCSC_ENTRY);

  const getKeyChain = followJumpChain(GETKEY_ENTRY);
  const chainTargets = getKeyChain
    .filter((entry) => entry.instr?.tag === 'jp')
    .map((entry) => entry.instr.target & 0xFFFFFF);

  const uniqueFollowOns = [...new Set(chainTargets)].filter(
    (target) => target !== GETKEY_ENTRY && target !== GETCSC_ENTRY
  );

  for (const target of uniqueFollowOns) {
    printDisasmSection(`Shared jump target`, target);
  }

  console.log(`\n${'='.repeat(92)}`);
  console.log('Booting transpiled ROM');
  console.log(`${'='.repeat(92)}`);

  const env = bootSystem();
  for (const stage of env.stages) {
    console.log(
      `${stage.name.padEnd(32)} ` +
      `steps=${String(stage.result.steps).padEnd(6)} ` +
      `term=${stage.result.termination}`
    );
  }

  console.log(`\n${'='.repeat(92)}`);
  console.log('Dynamic _GetKey traces');
  console.log(`${'='.repeat(92)}`);

  const traceResults = [];
  for (const key of KEY_TESTS) {
    pressSingleKey(env.peripherals, key.group, key.bit);
    const directScan = callDirectKeyboardScan(env);
    pressSingleKey(env.peripherals, key.group, key.bit);
    const trace = traceGetKey(env);
    traceResults.push({ key, directScan, trace });
    printTraceSummary(key, directScan, trace);
  }
  clearKeyboard(env.peripherals);

  const observedScanCodes = [...new Set(
    traceResults
      .map(({ key, directScan }) => (
        directScan.scanCode !== 0 ? directScan.scanCode : ((key.group << 4) | key.bit)
      ))
  )].sort((left, right) => left - right);

  const allPairLoads = traceResults.flatMap(({ trace }) => trace.pairLoads);
  const candidateTables = findCandidateTables(observedScanCodes, allPairLoads);

  console.log(`\n${'='.repeat(92)}`);
  console.log('Candidate scan->keycode tables near 0x04AB00');
  console.log(`${'='.repeat(92)}`);

  if (candidateTables.length === 0) {
    console.log('No strong candidates found in 0x04AB00-0x04AD00 with the current heuristic.');
  } else {
    for (const candidate of candidateTables) {
      const sampleText = observedScanCodes
        .map((scanCode, index) => formatCandidateSample(scanCode, candidate.sampleValues[index]))
        .join(', ');

      console.log(
        `${hex(candidate.addr, 6)} len=${String(candidate.length).padStart(3)} ` +
        `score=${String(candidate.score).padStart(4)} ` +
        `high=${String(candidate.highCount).padStart(3)} ` +
        `highSamples=${candidate.highSamples} ` +
        `samples: ${sampleText}`
      );
    }
  }

  console.log(`\nObserved direct scan codes: ${observedScanCodes.map((value) => hex(value, 2)).join(', ')}`);
  console.log(`ConvKeyToTok table base: ${hex(CONV_KEY_TO_TOK_BASE, 6)}`);
}

main();
