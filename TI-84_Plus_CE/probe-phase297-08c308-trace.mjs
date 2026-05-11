#!/usr/bin/env node

/**
 * Phase 297: Trace 0x08C308, the subcall from _RectFill (0x09EF44).
 *
 * cpu-runtime.js in this repo currently exports createExecutor rather than the
 * createCPU/createMemory/loadROM trio used in some older probes, so this file
 * provides small local compatibility helpers with those names.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TARGET_PC = 0x08C308;
const RETURN_PC = 0x09EF70;
const STACK_TOP = 0xD1A800;
const ENTRY_STACK_SLOT = (STACK_TOP - 3) & MEM_MASK;
const SAVED_HL_SLOT = (STACK_TOP - 6) & MEM_MASK;
const MAX_STEPS = 200;

const ENTRY_CONTEXT = {
  bc: 0x00020F,
  hl: 0x000121,
  de: 0x00012A,
};

const D000C6 = 0xD000C6;
const D0059C = 0xD0059C;
const DRAW_COLOR = 0x002AC0;
const MEMORY_MAP_BASE = 0xE30010;

const WATCHED_ADDRS = new Map([
  [D000C6, 'D000C6 LCD write-enable flag'],
  [D0059C, 'D0059C VRAM cursor'],
  [DRAW_COLOR, '0x002AC0 draw color'],
  [MEMORY_MAP_BASE, '0xE30010 memory mapping base'],
  [ENTRY_STACK_SLOT, 'return address slot'],
  [SAVED_HL_SLOT, 'saved HL slot'],
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

function hexBySize(value, size) {
  const mask = size === 1 ? 0xFF : size === 2 ? 0xFFFF : 0xFFFFFF;
  return hex((value ?? 0) & mask, size * 2);
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function loadROM(mem, romPath = ROM_PATH) {
  const romBytes = fs.readFileSync(romPath);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return romBytes.length;
}

function createCPU(blocks, mem, peripherals) {
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.pc = 0;
  return { cpu, executor };
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(
      'ROM.transpiled.js is missing. Generate it first with: node scripts/transpile-ti84-rom.mjs',
    );
  }

  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS ??
      transpiledModule.default?.PRELIFTED_BLOCKS ??
      transpiledModule.default ??
      transpiledModule,
  );

  if (!Object.keys(blocks).length) {
    throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  return blocks;
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
  };
}

function formatFlags(f) {
  const names = [
    ['S', 0x80],
    ['Z', 0x40],
    ['Y', 0x20],
    ['H', 0x10],
    ['X', 0x08],
    ['PV', 0x04],
    ['N', 0x02],
    ['C', 0x01],
  ];
  const active = names.filter(([, bit]) => (f & bit) !== 0).map(([name]) => name);
  return active.length ? active.join(' ') : 'none';
}

function formatRegs(regs) {
  return [
    `A=${hexByte(regs.a)}`,
    `F=${hexByte(regs.f)} [${formatFlags(regs.f)}]`,
    `BC=${hex(regs.bc)}`,
    `DE=${hex(regs.de)}`,
    `HL=${hex(regs.hl)}`,
    `IX=${hex(regs.ix)}`,
    `IY=${hex(regs.iy)}`,
    `SP=${hex(regs.sp)}`,
  ].join(' ');
}

function addressLabel(addr) {
  return WATCHED_ADDRS.get(addr & MEM_MASK) ?? null;
}

function installMemoryTrace(cpu) {
  const original = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  const events = [];

  function reset() {
    events.length = 0;
  }

  function take() {
    return events.map((event) => ({ ...event }));
  }

  cpu.read8 = (addr) => {
    const value = original.read8(addr);
    events.push({ kind: 'read', size: 1, addr: addr & MEM_MASK, value: value & 0xFF });
    return value;
  };

  cpu.read16 = (addr) => {
    const value = original.read16(addr);
    events.push({ kind: 'read', size: 2, addr: addr & MEM_MASK, value: value & 0xFFFF });
    return value;
  };

  cpu.read24 = (addr) => {
    const value = original.read24(addr);
    events.push({ kind: 'read', size: 3, addr: addr & MEM_MASK, value: value & 0xFFFFFF });
    return value;
  };

  cpu.write8 = (addr, value) => {
    const target = addr & MEM_MASK;
    const before = original.read8(target);
    original.write8(target, value);
    const after = original.read8(target);
    events.push({
      kind: 'write',
      size: 1,
      addr: target,
      before: before & 0xFF,
      after: after & 0xFF,
    });
  };

  cpu.write16 = (addr, value) => {
    const target = addr & MEM_MASK;
    const before = original.read16(target);
    original.write16(target, value);
    const after = original.read16(target);
    events.push({
      kind: 'write',
      size: 2,
      addr: target,
      before: before & 0xFFFF,
      after: after & 0xFFFF,
    });
  };

  cpu.write24 = (addr, value) => {
    const target = addr & MEM_MASK;
    const before = original.read24(target);
    original.write24(target, value);
    const after = original.read24(target);
    events.push({
      kind: 'write',
      size: 3,
      addr: target,
      before: before & 0xFFFFFF,
      after: after & 0xFFFFFF,
    });
  };

  function restore() {
    cpu.read8 = original.read8;
    cpu.read16 = original.read16;
    cpu.read24 = original.read24;
    cpu.write8 = original.write8;
    cpu.write16 = original.write16;
    cpu.write24 = original.write24;
  }

  return { reset, take, restore };
}

function resolveNextMode(meta, returnedPc, currentMode) {
  for (const exit of meta?.exits ?? []) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function annotateTargetInstruction(pc) {
  switch (pc) {
    case 0x08C308:
      return 'save caller HL on the stack so HL can be reused for the flag probe';
    case 0x08C309:
      return 'point HL at D000C6, the LCD write-enable / VRAM-base selector byte';
    case 0x08C30D:
      return 'BIT 2 updates flags only; Z=1 when bit 2 is clear, Z=0 when bit 2 is set';
    case 0x08C30F:
      return 'restore caller HL; BIT result remains live in F';
    case 0x08C310:
      return 'return to 0x09EF70 where _RectFill immediately branches on Z';
    default:
      return '';
  }
}

function annotateCallerInstruction(pc) {
  switch (pc) {
    case 0x09EF6C:
      return 'call the flag probe after HL = row * 0x140';
    case 0x09EF70:
      return 'if Z=1, skip the mapped-base path and branch to 0x09EFB7';
    case 0x09EF72:
      return 'mapped-base path: read DE from 0xE30010';
    case 0x09EF7A:
      return 'store computed pointer to D0059C';
    case 0x09EFB7:
      return 'direct-base path: double HL and start from hardcoded base 0xD40000';
    case 0x09EFC0:
      return 'store computed pointer to D0059C';
    case 0x09EFCE:
      return 'both paths converge here and load the draw color from 0x002AC0';
    default:
      return '';
  }
}

function diffRegs(before, after) {
  const fields = ['a', 'f', 'bc', 'de', 'hl', 'ix', 'iy', 'sp'];
  const diffs = [];
  for (const field of fields) {
    if (before[field] !== after[field]) {
      const width = field === 'a' || field === 'f' ? 2 : 6;
      diffs.push(`${field.toUpperCase()}: ${hex(before[field], width)} -> ${hex(after[field], width)}`);
    }
  }
  return diffs;
}

function formatEvent(event) {
  const label = addressLabel(event.addr);
  const suffix = label ? ` [${label}]` : '';
  if (event.kind === 'read') {
    return `READ${event.size * 8} ${hex(event.addr)}${suffix} => ${hexBySize(event.value, event.size)}`;
  }
  return `WRITE${event.size * 8} ${hex(event.addr)}${suffix}: ${hexBySize(event.before, event.size)} -> ${hexBySize(event.after, event.size)}`;
}

function branchOutcome(finalRegs) {
  return (finalRegs.f & 0x40) !== 0
    ? 'Z=1 -> 0x09EF70 takes JR Z to 0x09EFB7 (direct 0xD40000 base path)'
    : 'Z=0 -> 0x09EF70 falls through to 0x09EF72 (mapped base path via 0xE30010)';
}

function touchedWatchedAddrs(stepTrace) {
  const touched = new Set();
  for (const step of stepTrace) {
    for (const event of step.events) {
      touched.add(event.addr & MEM_MASK);
    }
  }
  return touched;
}

function runScenario(blocks, d000c6Value, label) {
  const mem = createMemory();
  loadROM(mem, ROM_PATH);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(blocks, mem, peripherals);
  const targetKey = blockKey(TARGET_PC, 'adl');
  const targetMeta = executor.blockMeta[targetKey];
  const targetFn = executor.compiledBlocks[targetKey];

  if (!targetMeta || typeof targetFn !== 'function') {
    throw new Error(`Target block ${targetKey} is not available in compiled PRELIFTED_BLOCKS`);
  }

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.ix = 0xD1A860;
  cpu.iy = 0xD00080;
  cpu.bc = ENTRY_CONTEXT.bc;
  cpu.de = ENTRY_CONTEXT.de;
  cpu.hl = ENTRY_CONTEXT.hl;
  cpu.a = 0x00;
  cpu.f = 0x00;
  cpu.sp = STACK_TOP;
  cpu.pc = TARGET_PC;

  mem[D000C6] = d000c6Value & 0xFF;
  cpu.push(RETURN_PC);

  const trace = installMemoryTrace(cpu);
  const entryRegs = snapshotRegs(cpu);
  const steps = [];

  let mode = 'adl';
  let stopReason = 'step_limit';

  for (let step = 0; step < MAX_STEPS; step += 1) {
    const key = blockKey(cpu.pc, mode);
    const fn = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (!fn || !meta) {
      stopReason = `missing block ${key}`;
      break;
    }

    const before = snapshotRegs(cpu);
    trace.reset();

    let result;
    try {
      result = fn(cpu);
    } catch (error) {
      steps.push({
        step,
        pc: cpu.pc & 0xFFFFFF,
        key,
        before,
        error,
      });
      stopReason = `error: ${error.message}`;
      break;
    }

    const after = snapshotRegs(cpu);
    const events = trace.take();

    steps.push({
      step,
      pc: before ? cpu.pc & 0xFFFFFF : TARGET_PC,
      key,
      before,
      after,
      result: result & 0xFFFFFF,
      events,
      regDiffs: diffRegs(before, after),
    });

    cpu.pc = result & 0xFFFFFF;
    mode = resolveNextMode(meta, result, mode);

    if ((cpu.pc & 0xFFFFFF) === RETURN_PC) {
      stopReason = 'returned';
      break;
    }
  }

  trace.restore();

  const finalRegs = snapshotRegs(cpu);
  return {
    label,
    d000c6Value: d000c6Value & 0xFF,
    entryRegs,
    finalRegs,
    nextPc: cpu.pc & 0xFFFFFF,
    stopReason,
    steps,
    watched: touchedWatchedAddrs(steps),
  };
}

function printScenario(result) {
  console.log(`## ${result.label}`);
  console.log(`D000C6 seeded to ${hexByte(result.d000c6Value)} (bit 2 ${(result.d000c6Value & 0x04) ? 'set' : 'clear'})`);
  console.log(`Entry regs: ${formatRegs(result.entryRegs)}`);

  for (const step of result.steps) {
    console.log('');
    console.log(`Step ${step.step}: ${hex(step.pc)} ${step.key}`);
    console.log(`  before: ${formatRegs(step.before)}`);
    if (step.error) {
      console.log(`  error: ${step.error.message}`);
      continue;
    }
    console.log(`  after:  ${formatRegs(step.after)}`);
    console.log(`  return: ${hex(step.result)}`);
    if (step.regDiffs.length) {
      console.log(`  reg changes: ${step.regDiffs.join('; ')}`);
    } else {
      console.log('  reg changes: none');
    }
    if (step.events.length) {
      console.log('  memory:');
      for (const event of step.events) {
        console.log(`    - ${formatEvent(event)}`);
      }
    } else {
      console.log('  memory: none');
    }
  }

  console.log('');
  console.log(`Stop reason: ${result.stopReason}`);
  console.log(`Final regs: ${formatRegs(result.finalRegs)}`);
  console.log(`Next PC: ${hex(result.nextPc)}`);
  console.log(`Caller consequence: ${branchOutcome(result.finalRegs)}`);
}

function printDirectAccessSummary(clearResult, setResult) {
  const watchedTargets = [
    [D000C6, 'D000C6 LCD write-enable flag'],
    [D0059C, 'D0059C VRAM cursor'],
    [DRAW_COLOR, '0x002AC0 draw color'],
    [MEMORY_MAP_BASE, '0xE30010 memory mapping base'],
  ];

  console.log('## Direct Access Summary');
  console.log('0x08C308 itself performs one global RAM read and otherwise only touches the stack.');
  for (const [addr, label] of watchedTargets) {
    const clearTouched = clearResult.watched.has(addr);
    const setTouched = setResult.watched.has(addr);
    const touched = clearTouched || setTouched;
    let note = touched ? 'yes' : 'no';
    if (addr === D000C6 && touched) {
      note = 'yes, read-only';
    }
    console.log(`- ${label} (${hex(addr)}): ${note}`);
  }
  console.log('- Stack effect: PUSH HL writes 3 bytes, POP HL reads them back, RET pops the 24-bit return address.');
  console.log('- Caller-visible net effect: HL is preserved, BC/DE/A are preserved, and only F changes.');
}

function printCallerContext(blocks) {
  const callerKeys = ['09ef5e:adl', '09ef70:adl', '09ef72:adl', '09efb7:adl'];
  console.log('## Immediate Caller Context');
  console.log('0x08C308 does not compute geometry. It feeds a single branch in _RectFill:');

  for (const key of callerKeys) {
    const meta = blocks[key];
    if (!meta) {
      continue;
    }
    console.log('');
    console.log(`### ${key}`);
    for (const instruction of meta.instructions) {
      const note = annotateCallerInstruction(instruction.pc);
      if (instruction.pc === 0x09EF72 && instruction.dasm !== 'ld de, (0xe30010)') {
        continue;
      }
      if (instruction.pc >= 0x09EF74 && key === '09ef72:adl' && instruction.pc !== 0x09EF7A) {
        continue;
      }
      if (instruction.pc < 0x09EFB7 && key === '09efb7:adl') {
        continue;
      }
      if (instruction.pc > 0x09EFC0 && key === '09efb7:adl') {
        break;
      }
      console.log(
        `- ${hex(instruction.pc)}  ${instruction.dasm}${note ? `  ; ${note}` : ''}`,
      );
      if (key === '09ef72:adl' && instruction.pc === 0x09EF7A) {
        break;
      }
    }
  }

  console.log('');
  console.log('- When Z=1 (D000C6 bit 2 clear), _RectFill jumps straight to 0x09EFB7 and uses hardcoded base 0xD40000.');
  console.log('- When Z=0 (D000C6 bit 2 set), _RectFill falls through to 0x09EF72 and reads base offset from 0xE30010.');
  console.log('- Both paths later converge and load draw color from 0x002AC0 before entering the fill loop.');
}

function printAnnotatedDisassembly(blocks) {
  const meta = blocks[blockKey(TARGET_PC, 'adl')];
  console.log('## Annotated Disassembly');
  for (const instruction of meta.instructions) {
    const note = annotateTargetInstruction(instruction.pc);
    console.log(`- ${hex(instruction.pc)}  ${instruction.dasm}${note ? `  ; ${note}` : ''}`);
  }
}

async function main() {
  const blocks = await loadBlocks();
  const targetMeta = blocks[blockKey(TARGET_PC, 'adl')];

  if (!targetMeta) {
    throw new Error(`Block ${blockKey(TARGET_PC, 'adl')} not found in PRELIFTED_BLOCKS`);
  }

  const clearResult = runScenario(blocks, 0x00, 'Scenario A: bit 2 clear');
  const setResult = runScenario(blocks, 0x04, 'Scenario B: bit 2 set');

  console.log('# Phase 297: Trace 0x08C308');
  console.log('');
  console.log('## Verdict');
  console.log('- 0x08C308 is a 5-instruction flag probe, not a fill-parameter calculator.');
  console.log(`- It reads bit 2 of ${hex(D000C6)} and returns with flags set from BIT 2,(HL).`);
  console.log(`- It does not directly access ${hex(D0059C)}, ${hex(DRAW_COLOR)}, or ${hex(MEMORY_MAP_BASE)}.`);
  console.log(`- Its only persistent output is the condition flags consumed by 0x09EF70 after returning to ${hex(RETURN_PC)}.`);
  console.log('');

  printScenario(clearResult);
  console.log('');
  printScenario(setResult);
  console.log('');
  printDirectAccessSummary(clearResult, setResult);
  console.log('');
  printCallerContext(blocks);
  console.log('');
  printAnnotatedDisassembly(blocks);
}

await main();
