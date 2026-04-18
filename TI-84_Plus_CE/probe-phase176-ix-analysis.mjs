#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;

const STAGE1_ENTRY = 0x0A2B72;

const FUNCTION_START = 0x00E4E8;
const FUNCTION_END = 0x00E580;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index += 1) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function safeDecode(pc, mode = 'adl') {
  if (pc < 0 || pc >= ROM_LIMIT) {
    return null;
  }

  try {
    const decoded = decodeInstruction(romBytes, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister}${sign}${displacement})`;
}

function formatInstruction(decoded) {
  if (!decoded) {
    return 'decode failed';
  }

  switch (decoded.tag) {
    case 'nop':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'halt':
    case 'di':
    case 'ei':
    case 'exx':
    case 'neg':
    case 'cpl':
    case 'scf':
    case 'ccf':
      return decoded.tag;

    case 'jr':
      return `jr ${hex(decoded.target)}`;
    case 'jr-conditional':
      return `jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp':
      return `jp ${hex(decoded.target)}`;
    case 'jp-conditional':
      return `jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect':
      return `jp (${decoded.indirectRegister})`;
    case 'call':
      return `call ${hex(decoded.target)}`;
    case 'call-conditional':
      return `call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'ret-conditional':
      return `ret ${decoded.condition}`;
    case 'rst':
      return `rst ${hex(decoded.target, 2)}`;
    case 'djnz':
      return `djnz ${hex(decoded.target)}`;

    case 'push':
      return `push ${decoded.pair}`;
    case 'pop':
      return `pop ${decoded.pair}`;
    case 'inc-pair':
      return `inc ${decoded.pair}`;
    case 'dec-pair':
      return `dec ${decoded.pair}`;
    case 'inc-reg':
      return `inc ${decoded.reg}`;
    case 'dec-reg':
      return `dec ${decoded.reg}`;

    case 'ld-pair-imm':
      return `ld ${decoded.pair}, ${hex(decoded.value)}`;
    case 'ld-reg-imm':
      return `ld ${decoded.dest}, ${hex(decoded.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${decoded.dest}, ${decoded.src}`;
    case 'ld-reg-ind':
      return `ld ${decoded.dest}, (${decoded.src})`;
    case 'ld-ind-reg':
      return `ld (${decoded.dest}), ${decoded.src}`;
    case 'ld-reg-mem':
      return `ld ${decoded.dest}, (${hex(decoded.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(decoded.addr)}), ${decoded.src}`;
    case 'ld-pair-mem':
      if (decoded.direction === 'to-mem') {
        return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
      }
      return `ld ${decoded.pair}, (${hex(decoded.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
    case 'ld-pair-ind':
      return `ld ${decoded.pair}, (${decoded.src})`;
    case 'ld-ind-pair':
      return `ld (${decoded.dest}), ${decoded.pair}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-pair':
      return `ld sp, ${decoded.pair}`;

    case 'ld-ixd-imm':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${hex(decoded.value, 2)}`;
    case 'ld-reg-ixd':
      return `ld ${decoded.dest}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;
    case 'ld-pair-indexed':
      return `ld ${decoded.pair}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.pair}`;
    case 'ld-ixiy-indexed':
      return `ld ${decoded.dest}, ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;
    case 'ld-indexed-ixiy':
      return `ld ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}, ${decoded.src}`;

    case 'add-pair':
      return `add ${decoded.dest}, ${decoded.src}`;
    case 'adc-pair':
      return `adc hl, ${decoded.src}`;
    case 'sbc-pair':
      return `sbc hl, ${decoded.src}`;
    case 'alu-reg':
      return `${decoded.op} ${decoded.src}`;
    case 'alu-imm':
      return `${decoded.op} ${hex(decoded.value, 2)}`;
    case 'alu-ixd':
      return `${decoded.op} ${formatIndexedOperand(decoded.indexRegister, decoded.displacement)}`;

    case 'ex-de-hl':
      return 'ex de, hl';
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    case 'ex-sp-pair':
      return `ex (sp), ${decoded.pair}`;

    case 'bit-test':
      return `bit ${decoded.bit}, ${decoded.reg}`;
    case 'bit-res':
      return `res ${decoded.bit}, ${decoded.reg}`;
    case 'bit-set':
      return `set ${decoded.bit}, ${decoded.reg}`;

    case 'lea':
      return `lea ${decoded.dest}, ${formatIndexedOperand(decoded.base, decoded.displacement)}`;

    case 'in-imm':
      return `in a, (${hex(decoded.port, 2)})`;
    case 'out-imm':
      return `out (${hex(decoded.port, 2)}), a`;

    default:
      return decoded.dasm ?? decoded.tag ?? 'unknown';
  }
}

// ---- Boot / state management ----

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return result;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreStageState(cpu, snapshot, mem, ramSnapshot) {
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  clearVram(mem);

  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  cpu._ix = cpu.sp;
  mem.fill(0xFF, cpu.sp, 12);
}

// ---- Deliverable 1: Extended boot IX/SP trace ----

function runBootWithIxSpTrace(executor, cpu, mem) {
  console.log('=== DELIVERABLE 1: Extended Boot IX/SP Trace ===');
  console.log('');

  const transitions = [];
  let prevIx = null;
  let prevSp = null;
  let totalSteps = 0;

  function makeTraceCallback(phaseLabel) {
    return function onBlock(pc, mode, meta, steps) {
      const ix = cpu._ix & 0xFFFFFF;
      const sp = cpu.sp & 0xFFFFFF;

      if (ix !== prevIx || sp !== prevSp) {
        transitions.push({
          phase: phaseLabel,
          step: totalSteps + steps + 1,
          pc: pc & 0xFFFFFF,
          ix,
          sp,
          prevIx,
          prevSp,
          ixChanged: ix !== prevIx,
          spChanged: sp !== prevSp,
        });

        prevIx = ix;
        prevSp = sp;
      }
    };
  }

  // Phase A: Cold boot
  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
    onBlock: makeTraceCallback('cold_boot'),
  });
  totalSteps += bootResult.steps;
  console.log(`Cold boot: ${bootResult.steps} steps, termination=${bootResult.termination}, IX=${hex(cpu._ix)}, SP=${hex(cpu.sp)}`);

  // Prepare for kernel init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  prevSp = cpu.sp & 0xFFFFFF;

  // Phase B: Kernel init
  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
    onBlock: makeTraceCallback('kernel_init'),
  });
  totalSteps += kernelResult.steps;
  console.log(`Kernel init: ${kernelResult.steps} steps, termination=${kernelResult.termination}, IX=${hex(cpu._ix)}, SP=${hex(cpu.sp)}`);

  // Prepare for post-init
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  prevSp = cpu.sp & 0xFFFFFF;

  // Phase C: Post-init
  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 500,
    onBlock: makeTraceCallback('post_init'),
  });
  totalSteps += postInitResult.steps;
  console.log(`Post-init: ${postInitResult.steps} steps, termination=${postInitResult.termination}, IX=${hex(cpu._ix)}, SP=${hex(cpu.sp)}`);

  console.log(`Total boot steps: ${totalSteps}`);
  console.log(`Final boot state: IX=${hex(cpu._ix)}, SP=${hex(cpu.sp)}`);
  console.log('');

  // Print top 50 IX/SP transitions
  console.log(`IX/SP transitions during boot (${transitions.length} total, showing top 50):`);

  const top50 = transitions.slice(0, 50);

  for (const t of top50) {
    const ixPart = t.ixChanged ? `IX: ${hex(t.prevIx)} -> ${hex(t.ix)}` : `IX: ${hex(t.ix)}`;
    const spPart = t.spChanged ? `SP: ${hex(t.prevSp)} -> ${hex(t.sp)}` : `SP: ${hex(t.sp)}`;
    console.log(`  [${t.phase}] step ${t.step} PC=${hex(t.pc)} ${ixPart} ${spPart}`);
  }

  if (transitions.length > 50) {
    console.log(`  ... (${transitions.length - 50} more transitions omitted)`);
  }

  // Find IX-specific transitions
  const ixTransitions = transitions.filter((t) => t.ixChanged);
  console.log('');
  console.log(`IX-only transitions: ${ixTransitions.length}`);

  for (const t of ixTransitions) {
    console.log(`  [${t.phase}] step ${t.step} PC=${hex(t.pc)} IX: ${hex(t.prevIx)} -> ${hex(t.ix)}`);
  }

  console.log('');
  return { transitions, ixTransitions, totalSteps };
}

// ---- Deliverable 2: Function 0x00E4E8 disassembly with frame annotation ----

function disassembleFunction() {
  console.log('=== DELIVERABLE 2: Function 0x00E4E8-0x00E580 Disassembly ===');
  console.log('');

  const instructions = [];
  let pc = FUNCTION_START;

  while (pc < FUNCTION_END) {
    const decoded = safeDecode(pc, 'adl');

    if (!decoded) {
      const byte = romBytes[pc];
      instructions.push({
        pc,
        length: 1,
        text: `db ${hex(byte, 2)}`,
        raw: hex(byte, 2),
        ixAccess: null,
      });
      pc += 1;
      continue;
    }

    const text = formatInstruction(decoded);
    let ixAccess = null;

    // Annotate IX-relative accesses
    if (decoded.indexRegister === 'ix' && decoded.displacement !== undefined) {
      const offset = decoded.displacement;
      ixAccess = { offset, tag: decoded.tag };
    }

    instructions.push({
      pc: decoded.pc,
      length: decoded.length,
      text,
      tag: decoded.tag,
      ixAccess,
      decoded,
    });

    pc = decoded.nextPc ?? (pc + decoded.length);
  }

  // Print the disassembly
  const frameSlots = new Map();

  for (const inst of instructions) {
    const addr = hex(inst.pc);
    const annotation = inst.ixAccess
      ? `  ; frame[IX${inst.ixAccess.offset >= 0 ? '+' : ''}${inst.ixAccess.offset}]`
      : '';

    console.log(`  ${addr}: ${inst.text}${annotation}`);

    if (inst.ixAccess) {
      const key = inst.ixAccess.offset;

      if (!frameSlots.has(key)) {
        frameSlots.set(key, []);
      }

      frameSlots.set(key, [...frameSlots.get(key), {
        pc: inst.pc,
        text: inst.text,
        tag: inst.tag,
      }]);
    }
  }

  console.log('');

  // Frame layout annotation
  console.log('Frame layout (IX-relative accesses in 0x00E4E8-0x00E580):');

  const sortedSlots = [...frameSlots.entries()].sort((a, b) => a[0] - b[0]);

  for (const [offset, accesses] of sortedSlots) {
    const readWrite = accesses.map((a) => {
      const kind = a.tag?.includes('ld-reg-ixd') || a.tag?.includes('ld-pair-indexed') || a.tag?.includes('ld-ixiy-indexed')
        ? 'READ'
        : a.tag?.includes('ld-ixd') || a.tag?.includes('ld-indexed') || a.tag?.includes('ld-indexed-pair')
          ? 'WRITE'
          : a.tag?.includes('alu') ? 'READ(alu)' : 'ACCESS';

      return `${kind} at ${hex(a.pc)}`;
    });

    const sign = offset >= 0 ? '+' : '';
    console.log(`  IX${sign}${offset}: ${readWrite.join(', ')} (${accesses[0].text})`);
  }

  console.log('');
  console.log('Key observations:');
  console.log('  - IX+6 is read as a 24-bit pointer (callers must pass a valid frame pointer here)');
  console.log('  - The function sets IX from that loaded value (LD IX,(IX+6)) at 0x00E4F0');
  console.log('  - If IX+6 contains garbage (0x3E0000), IX becomes 0x3E0000 -> subsequent corruption');
  console.log('  - Block 0x00E57E does LD SP,IX which copies the corrupted IX into SP -> crash');
  console.log('');

  return { instructions, frameSlots: sortedSlots };
}

// ---- Deliverable 3: IX fix experiments ----

function runIxExperiment(label, executor, cpu, mem, cpuSnapshot, ramSnapshot, ixValue) {
  restoreStageState(cpu, cpuSnapshot, mem, ramSnapshot);

  // Override IX with the experiment value
  cpu._ix = ixValue;

  const crashInfo = {
    hitE57e: false,
    crashPc: null,
    crashStep: null,
  };

  let stepCount = 0;

  const result = executor.runFrom(STAGE1_ENTRY, 'adl', {
    maxSteps: 1000,
    maxLoopIterations: 500,
    onBlock(pc, mode, meta, steps) {
      stepCount = steps + 1;

      if ((pc & 0xFFFFFF) === 0x00E57E) {
        crashInfo.hitE57e = true;
        crashInfo.crashPc = pc & 0xFFFFFF;
        crashInfo.crashStep = steps + 1;
      }
    },
  });

  return {
    label,
    ixValue,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc & 0xFFFFFF,
    finalSp: cpu.sp & 0xFFFFFF,
    finalIx: cpu._ix & 0xFFFFFF,
    hitE57e: crashInfo.hitE57e,
    crashStep: crashInfo.crashStep,
  };
}

async function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('=== Phase 176 - IX Analysis (SP Corruption Mitigation) ===');
  console.log(`ROM size: ${hex(romBytes.length)}`);
  console.log('');

  // ---- Deliverable 1: Extended boot IX/SP trace ----
  const bootTrace = runBootWithIxSpTrace(executor, cpu, mem);

  // Take snapshots after boot
  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);

  console.log(`CPU snapshot: IX=${hex(cpuSnapshot._ix)}, SP=${hex(cpuSnapshot.sp)}, IY=${hex(cpuSnapshot._iy)}`);
  console.log('');

  // ---- Deliverable 2: Disassembly ----
  const disasm = disassembleFunction();

  // ---- Deliverable 3: IX fix experiments ----
  console.log('=== DELIVERABLE 3: IX Fix Experiments (Stage 1, maxSteps=1000) ===');
  console.log('');

  const experiments = [
    { label: 'A: IX=SP (current approach)', ixValue: STACK_RESET_TOP - 12 },
    { label: 'B: IX=0xD1A860 (stack frame area)', ixValue: 0xD1A860 },
    { label: 'C: IX=0xD00080 (IY base)', ixValue: 0xD00080 },
  ];

  const results = [];

  for (const exp of experiments) {
    const result = runIxExperiment(
      exp.label,
      executor,
      cpu,
      mem,
      cpuSnapshot,
      ramSnapshot,
      exp.ixValue,
    );

    results.push(result);

    console.log(`--- ${result.label} ---`);
    console.log(`  IX init: ${hex(result.ixValue)}`);
    console.log(`  Steps: ${result.steps}`);
    console.log(`  Termination: ${result.termination}`);
    console.log(`  Last PC: ${hex(result.lastPc)}`);
    console.log(`  Final SP: ${hex(result.finalSp)}`);
    console.log(`  Final IX: ${hex(result.finalIx)}`);
    console.log(`  Hit 0x00E57E: ${result.hitE57e}`);

    if (result.crashStep !== null) {
      console.log(`  Crash step (at 0x00E57E): ${result.crashStep}`);
    }

    console.log('');
  }

  // ---- Verdict ----
  const anyAvoided = results.some((r) => !r.hitE57e);

  if (anyAvoided) {
    console.log('VERDICT: IX_FIX_FOUND');
    const successful = results.filter((r) => !r.hitE57e);
    console.log(`Strategies that avoided 0x00E57E crash: ${successful.map((r) => r.label).join(', ')}`);
  } else {
    console.log('VERDICT: IX_FIX_NOT_FOUND');
    console.log('All three strategies still hit the 0x00E57E crash.');
  }

  console.log('');

  // ---- JSON Summary ----
  const summary = {
    bootTrace: {
      totalSteps: bootTrace.totalSteps,
      totalTransitions: bootTrace.transitions.length,
      ixTransitions: bootTrace.ixTransitions.map((t) => ({
        phase: t.phase,
        step: t.step,
        pc: hex(t.pc),
        prevIx: hex(t.prevIx),
        ix: hex(t.ix),
      })),
      top50Transitions: bootTrace.transitions.slice(0, 50).map((t) => ({
        phase: t.phase,
        step: t.step,
        pc: hex(t.pc),
        ix: hex(t.ix),
        sp: hex(t.sp),
        ixChanged: t.ixChanged,
        spChanged: t.spChanged,
      })),
    },
    experiments: results.map((r) => ({
      label: r.label,
      ixInit: hex(r.ixValue),
      steps: r.steps,
      termination: r.termination,
      lastPc: hex(r.lastPc),
      finalSp: hex(r.finalSp),
      finalIx: hex(r.finalIx),
      hitE57e: r.hitE57e,
      crashStep: r.crashStep,
    })),
    verdict: anyAvoided ? 'IX_FIX_FOUND' : 'IX_FIX_NOT_FOUND',
  };

  console.log('JSON_SUMMARY_BEGIN');
  console.log(JSON.stringify(summary, null, 2));
  console.log('JSON_SUMMARY_END');
}

try {
  await main();
} catch (error) {
  console.error('Phase 176 IX analysis failed.');
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
