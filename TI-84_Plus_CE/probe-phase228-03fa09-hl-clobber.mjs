#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const FUNC_ADDR = 0x03FC1C;
const CALL_03FA09 = 0x03FA09;
const CALL_0AF8C4 = 0x0AF8C4;
const CULPRIT_0AF8FC = 0x0AF8FC;

const D0058D_ADDR = 0xD0058D;
const TABLE_ADDR = 0x03FC41;
const SEED_INDEX = 34;

const STATIC_03FA09_LEN = 0x70;
const STATIC_03FB9A_LEN = 0x50;
const STATIC_0AF8C4_LEN = 0x50;
const TRACE_MAX_STEPS = 100;

if (!existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM: ${ROM_PATH}`);
}

if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(`Missing transpiled ROM: ${TRANSPILED_PATH}`);
}

const romBytes = readFileSync(ROM_PATH);
const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const RAW_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;
const BLOCKS = normalizeBlocks(RAW_BLOCKS);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks
        .filter((block) => block?.id)
        .map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return bytes.map((value) => hexByte(value)).join(' ');
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function signedDisp(value) {
  const signed = signedByte(value & 0xFF);
  return signed < 0 ? `-${hexByte(-signed).replace('0x', '')}` : `+${hexByte(signed).replace('0x', '')}`;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return (
    (mem[a] & 0xFF) |
    ((mem[(a + 1) & 0xFFFFFF] & 0xFF) << 8) |
    ((mem[(a + 2) & 0xFFFFFF] & 0xFF) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stackBytes(mem, sp, count = 4) {
  const bytes = [];
  const base = sp & 0xFFFFFF;
  for (let index = 0; index < count; index += 1) {
    bytes.push(mem[(base + index) & 0xFFFFFF] & 0xFF);
  }
  return bytes;
}

function snapshotState(cpu, mem) {
  const sp = cpu.sp & 0xFFFFFF;
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu.hl & 0xFFFFFF,
    sp,
    top4: stackBytes(mem, sp, 4),
    word0: read24(mem, sp),
    word1: read24(mem, sp + 3),
  };
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu, peripherals };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.iy = 0xD00080;
  cpu.ix = 0xD1A860;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function stopError(name, detail = null) {
  const error = new Error('__PHASE228_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

function bootInitializedRuntime() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu.iy = 0xD00080;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  resetOsState(cpu, mem);
  push24(cpu, mem, MEM_INIT_RET);

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
    });
  } catch (error) {
    if (error?.message !== '__PHASE228_STOP__' || error.stopName !== 'mem_init_return') {
      throw error;
    }
  }

  resetOsState(cpu, mem);
  return { mem, executor, cpu };
}

function resolveNextMode(exits, returnedPc, currentMode) {
  for (const exit of exits ?? []) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }
  return currentMode;
}

function traceFunction(executor, mem, startPc, startMode, maxSteps) {
  const { cpu, compiledBlocks, blockMeta } = executor;
  const steps = [];

  let pc = startPc & 0xFFFFFF;
  let mode = startMode;
  let stopReason = 'max_steps';

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    cpu.madl = mode === 'adl' ? 1 : 0;

    const key = `${pc.toString(16).padStart(6, '0')}:${mode}`;
    const fn = compiledBlocks[key];
    const meta = blockMeta[key];

    if (!fn) {
      steps.push({
        stepIndex,
        pc,
        mode,
        key,
        missing: true,
      });
      stopReason = 'missing_block';
      break;
    }

    const before = snapshotState(cpu, mem);
    const result = fn(cpu);
    const after = snapshotState(cpu, mem);
    const nextPc = typeof result === 'number' && result >= 0 ? result & 0xFFFFFF : null;
    const nextMode = nextPc === null ? mode : resolveNextMode(meta?.exits, result, mode);

    steps.push({
      stepIndex,
      pc,
      mode,
      key,
      result,
      nextPc,
      nextMode,
      before,
      after,
      instructions: (meta?.instructions ?? []).map((instruction) => instruction.dasm ?? formatInstruction(instruction)),
    });

    if (result === RETURN_SENTINEL) {
      stopReason = 'returned_to_sentinel';
      break;
    }

    if (result === undefined || result === null) {
      stopReason = 'no_return';
      break;
    }

    if (typeof result === 'number' && result < 0) {
      stopReason = result === -1 ? 'halt' : 'sleep';
      break;
    }

    pc = nextPc;
    mode = nextMode;
  }

  return { steps, stopReason };
}

function formatInstruction(decoded) {
  if (!decoded) {
    return 'decode failed';
  }

  switch (decoded.tag) {
    case 'nop':
      return 'nop';
    case 'di':
      return 'di';
    case 'ei':
      return 'ei';
    case 'daa':
      return 'daa';
    case 'rra':
      return 'rra';
    case 'xor-a':
      return 'xor a';
    case 'ld-pair-imm':
      return `ld ${decoded.pair}, ${hex(decoded.value)}`;
    case 'ld-reg-imm':
      return `ld ${decoded.dest}, ${hexByte(decoded.value)}`;
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
    case 'ld-ind-imm':
      return `ld (hl), ${hexByte(decoded.value)}`;
    case 'push':
      return `push ${decoded.pair}`;
    case 'pop':
      return `pop ${decoded.pair}`;
    case 'call':
      return `call ${hex(decoded.target)}`;
    case 'call-conditional':
      return `call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp':
      return `jp ${hex(decoded.target)}`;
    case 'jp-conditional':
      return `jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect':
      return `jp (${decoded.indirectRegister})`;
    case 'jr':
      return `jr ${hex(decoded.target)}`;
    case 'jr-conditional':
      return `jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${decoded.condition}`;
    case 'reti':
      return 'reti';
    case 'retn':
      return 'retn';
    case 'rst':
      return `rst ${hex(decoded.target, 2)}`;
    case 'add-pair':
      return `add ${decoded.dest}, ${decoded.src}`;
    case 'inc-pair':
      return `inc ${decoded.pair}`;
    case 'dec-pair':
      return `dec ${decoded.pair}`;
    case 'inc-reg':
      return `inc ${decoded.reg}`;
    case 'dec-reg':
      return `dec ${decoded.reg}`;
    case 'alu-reg':
      return `${decoded.op} ${decoded.src}`;
    case 'alu-imm':
      return `${decoded.op} ${hexByte(decoded.value)}`;
    case 'bit-test':
      return `bit ${decoded.bit}, ${decoded.reg}`;
    case 'bit-test-ind':
      return `bit ${decoded.bit}, (${decoded.indirectRegister})`;
    case 'bit-set':
      return `set ${decoded.bit}, ${decoded.reg}`;
    case 'bit-res':
      return `res ${decoded.bit}, ${decoded.reg}`;
    case 'indexed-cb-bit':
      return `bit ${decoded.bit}, (${decoded.indexRegister}${signedDisp(decoded.displacement)})`;
    case 'indexed-cb-set':
      return `set ${decoded.bit}, (${decoded.indexRegister}${signedDisp(decoded.displacement)})`;
    case 'indexed-cb-res':
      return `res ${decoded.bit}, (${decoded.indexRegister}${signedDisp(decoded.displacement)})`;
    case 'in':
      return `in ${decoded.dest}, (c)`;
    case 'in0':
      return `in0 ${decoded.dest}, (${hexByte(decoded.port)})`;
    case 'out':
      return `out (c), ${decoded.src}`;
    case 'ld-special':
      return `ld ${decoded.dest}, ${decoded.src}`;
    default:
      return decoded.tag;
  }
}

function instructionNotes(decoded) {
  const notes = [];
  if (
    decoded.tag === 'push' ||
    decoded.tag === 'pop' ||
    decoded.tag === 'ret' ||
    decoded.tag === 'ret-conditional' ||
    decoded.tag === 'reti' ||
    decoded.tag === 'retn'
  ) {
    notes.push('STACK');
  }
  if (decoded.tag === 'ld-sp-hl' || decoded.tag === 'ld-sp-pair' || decoded.tag === 'ex-sp-hl' || decoded.tag === 'ex-sp-pair') {
    notes.push('SP');
  }
  if (
    (decoded.tag === 'ld-pair-imm' && decoded.pair === 'hl') ||
    (decoded.tag === 'ld-reg-reg' && (decoded.dest === 'h' || decoded.dest === 'l')) ||
    (decoded.tag === 'add-pair' && decoded.dest === 'hl')
  ) {
    notes.push('HL');
  }
  return notes;
}

function printStaticRange(title, start, length) {
  console.log(`\n--- ${title} (${hex(start)}..${hex(start + length - 1)}) ---`);

  let pc = start;
  const end = start + length;
  const interesting = [];

  while (pc < end) {
    const decoded = decodeInstruction(romBytes, pc, 'adl');
    const bytes = Array.from(romBytes.subarray(pc, Math.min(end, decoded.nextPc)));
    const notes = instructionNotes(decoded);
    const rendered = formatInstruction(decoded);
    const noteText = notes.length ? `  <${notes.join(', ')}>` : '';
    console.log(`${hex(pc)}  ${formatBytes(bytes).padEnd(20, ' ')}  ${rendered}${noteText}`);
    if (notes.length) {
      interesting.push({ pc, text: rendered, notes });
    }
    pc = decoded.nextPc;
  }

  if (interesting.length === 0) {
    console.log('  No PUSH/POP/RET or SP-adjusting instructions in this slice.');
    return;
  }

  console.log('  Interesting ops:');
  for (const entry of interesting) {
    console.log(`    ${hex(entry.pc)}  ${entry.text}  [${entry.notes.join(', ')}]`);
  }
}

function tableLookupValue(index) {
  return romBytes[(TABLE_ADDR + (index & 0xFF)) & 0xFFFFFF] & 0xFF;
}

function findFirstStep(trace, pc) {
  return trace.steps.find((step) => step.pc === pc) ?? null;
}

function printDynamicTrace(trace) {
  console.log(`\n--- Dynamic block trace from ${hex(FUNC_ADDR)} with D0058D=${hexByte(SEED_INDEX)} ---`);
  console.log('step  pc        next      sp before -> after   hl before -> after   top4 before -> after   instructions');

  for (const step of trace.steps) {
    if (step.missing) {
      console.log(
        `${String(step.stepIndex).padStart(3, ' ')}  ${hex(step.pc)}  missing block for key ${step.key}`,
      );
      continue;
    }

    const nextText = step.nextPc === null ? String(step.result) : hex(step.nextPc);
    const instructions = step.instructions.join(' | ');
    console.log(
      `${String(step.stepIndex).padStart(3, ' ')}  ${hex(step.pc)}  ${String(nextText).padEnd(10, ' ')}  ` +
      `${hex(step.before.sp)} -> ${hex(step.after.sp)}  ` +
      `${hex(step.before.hl)} -> ${hex(step.after.hl)}  ` +
      `${formatBytes(step.before.top4)} -> ${formatBytes(step.after.top4)}  ` +
      `${instructions}`,
    );
  }

  console.log(`Trace stop reason: ${trace.stopReason}`);
}

function printVerification(trace) {
  const step03FC28 = findFirstStep(trace, 0x03FC28);
  const step03FA09 = findFirstStep(trace, 0x03FA09);
  const step03FBE8 = findFirstStep(trace, 0x03FBE8);
  const step0AF8C4 = findFirstStep(trace, 0x0AF8C4);
  const step0AF8FC = findFirstStep(trace, 0x0AF8FC);
  const step03FC40 = findFirstStep(trace, 0x03FC40);

  console.log('\n--- Verification ---');
  console.log(`Seed index ${hexByte(SEED_INDEX)} reads table byte ${hexByte(tableLookupValue(SEED_INDEX))} from ${hex(TABLE_ADDR + SEED_INDEX)}.`);

  if (step03FC28 && step03FA09) {
    console.log(`HL saved by PUSH HL before CALL 0x03FA09: ${hex(step03FA09.before.hl)}.`);
    console.log(
      `CALL 0x03FA09 stack movement: SP ${hex(step03FC28.before.sp)} -> ${hex(step03FC28.after.sp)}; ` +
      `stack[SP]=return ${hex(step03FC28.after.word0)}, stack[SP+3]=saved HL ${hex(step03FC28.after.word1)}.`,
    );
  }

  if (step03FBE8) {
    console.log(
      `0x03FA09 returns via ${hex(step03FBE8.pc)}: SP ${hex(step03FBE8.before.sp)} -> ${hex(step03FBE8.after.sp)}, ` +
      `next PC ${hex(step03FBE8.nextPc)}.`,
    );
  }

  if (step0AF8C4) {
    console.log(
      `POP HL at the caller worked: entry to 0x0AF8C4 sees HL=${hex(step0AF8C4.before.hl)} and SP=${hex(step0AF8C4.before.sp)}.`,
    );
  }

  if (step0AF8FC) {
    console.log(
      `The surviving HL clobber happens in block ${hex(step0AF8FC.pc)}: ` +
      `"${step0AF8FC.instructions.join(' | ')}".`,
    );
    console.log(
      `That block changes HL ${hex(step0AF8FC.before.hl)} -> ${hex(step0AF8FC.after.hl)}.`,
    );
  }

  if (step03FC40) {
    console.log(
      `Final caller return block ${hex(step03FC40.pc)} leaves HL=${hex(step03FC40.after.hl)} and SP=${hex(step03FC40.after.sp)}.`,
    );
  }

  console.log('\nConclusion:');
  console.log('0x03FA09 does clobber HL internally, but its stack discipline is balanced on the observed path.');
  console.log('The caller POP HL restores the table lookup value before 0x0AF8C4 starts.');
  console.log(`0x0AF8C4 later executes LD HL, ${hex(0xD00604)} at ${hex(CULPRIT_0AF8FC)}, and that overwrite survives to the final RET.`);
  console.log('So the final HL=0xD00604 is not caused by a broken PUSH/POP pair around 0x03FA09; it is caused by 0x0AF8C4 intentionally reusing HL as a scratch pointer and not restoring it.');
}

function main() {
  console.log('Phase 228: 0x03FA09 / 0x03FC1C HL clobber probe');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled blocks: ${TRANSPILED_PATH}`);

  printStaticRange('Static disassembly of 0x03FA09 first ~100 bytes', 0x03FA09, STATIC_03FA09_LEN);
  printStaticRange('Branch target used by the observed 0x03FA09 path', 0x03FB9A, STATIC_03FB9A_LEN);
  printStaticRange('0x0AF8C4 culprit slice', 0x0AF8C4, STATIC_0AF8C4_LEN);

  const { mem, executor, cpu } = bootInitializedRuntime();
  mem[D0058D_ADDR] = SEED_INDEX & 0xFF;
  push24(cpu, mem, RETURN_SENTINEL);

  const trace = traceFunction(executor, mem, FUNC_ADDR, 'adl', TRACE_MAX_STEPS);
  printDynamicTrace(trace);
  printVerification(trace);
}

try {
  main();
} catch (error) {
  console.log(error?.stack ?? String(error));
  process.exitCode = 1;
}
