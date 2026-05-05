#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MATRIX_PATH = path.join(__dirname, 'keyboard-matrix.md');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(
    'Missing TI-84_Plus_CE/ROM.transpiled.js. Gunzip ROM.transpiled.js.gz first, then rerun this probe.',
  );
}

const rom = fs.readFileSync(ROM_PATH);
const matrixText = fs.readFileSync(MATRIX_PATH, 'utf8');
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MASK24 = 0xFFFFFF;
const MEM_SIZE = 0x1000000;

const HOME_WINDOW_START = 0x058000;
const HOME_WINDOW_END = 0x05A000;
const HOME_CONTEXT_ENTRY = 0x0585E9;
const HOME_NON_ENTER = 0x05877A;
const HOME_CONTEXT_TABLE = 0x0585D3;

const GETCSC_TRANSLATION_TABLE = 0x09F79B;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MEMINIT_RET = 0x7FFFF6;
const FAKE_RET = 0x7FFFFE;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const RAW_SCAN_ADDR = 0xD00587;
const KEY_CODE_ADDR = 0xD0058C;
const GETKY_ADDR = 0xD0058D;
const GETCSC_SCAN_ADDR = 0xD0058E;

const STEP_LIMIT = 3000;
const LOOP_LIMIT = 8192;
const RUN_STOP = '__PHASE188_SENTINEL__';

const STATIC_COMPARE_VALUES = new Set([0x31, 0x09, 0xFC, 0x05]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bhex(value) {
  return hex(value & 0xFF, 2);
}

function write24(buffer, addr, value) {
  buffer[addr] = value & 0xFF;
  buffer[addr + 1] = (value >>> 8) & 0xFF;
  buffer[addr + 2] = (value >>> 16) & 0xFF;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & MASK24).toString(16).padStart(6, '0')}:${mode}`;
}

function inHomeWindow(addr) {
  return Number.isInteger(addr) && addr >= HOME_WINDOW_START && addr < HOME_WINDOW_END;
}

function in059Range(addr) {
  return Number.isInteger(addr) && addr >= 0x059000 && addr < 0x05A000;
}

function getKeyboardMatrix(peripherals) {
  if (!peripherals.keyMatrix && peripherals.keyboard?.keyMatrix) {
    peripherals.keyMatrix = peripherals.keyboard.keyMatrix;
  }
  return peripherals.keyMatrix ?? peripherals.keyboard?.keyMatrix ?? null;
}

function parseStatKey() {
  const match = matrixText.match(/\|\s*STAT\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*0x([0-9A-Fa-f]+)\s*\|/);
  if (!match) {
    throw new Error('Could not find the STAT row in keyboard-matrix.md');
  }

  const group = Number(match[1]);
  const bit = Number(match[2]);
  const physicalScan = parseInt(match[3], 16);
  const flattenedScan = group * 8 + bit + 1;
  const homeKeyCode = rom[GETCSC_TRANSLATION_TABLE + flattenedScan] & 0xFF;

  return {
    group,
    bit,
    physicalScan,
    flattenedScan,
    homeKeyCode,
  };
}

function parseCpValue(inst) {
  const match = /^cp 0x([0-9a-f]+)$/i.exec(inst?.dasm ?? '');
  return match ? (parseInt(match[1], 16) & 0xFF) : null;
}

function parseCondition(inst) {
  const dasm = inst?.dasm ?? '';
  let match = /^(?:jr|jp|call)\s+([a-z]+),\s+/i.exec(dasm);
  if (match) return match[1].toLowerCase();
  match = /^ret\s+([a-z]+)$/i.exec(dasm);
  if (match) return match[1].toLowerCase();
  return null;
}

function isConditionalControl(inst) {
  return Boolean(inst) && [
    'jr-conditional',
    'jp-conditional',
    'ret-conditional',
    'call-conditional',
  ].includes(inst.tag);
}

function isCall(inst) {
  return Boolean(inst) && (inst.tag === 'call' || inst.tag === 'call-conditional');
}

function findConditionalFollower(instructions, startIndex) {
  for (let index = startIndex + 1; index < instructions.length; index += 1) {
    const inst = instructions[index];
    if (isConditionalControl(inst)) return inst;
    if (['call', 'jp', 'jr', 'ret'].includes(inst?.tag)) break;
  }
  return null;
}

function collectStaticKeyCompareHits(values) {
  const hits = [];
  const seen = new Set();

  for (const block of Object.values(BLOCKS)) {
    if (block?.mode !== 'adl') continue;
    if (!inHomeWindow(block.startPc)) continue;
    if (!Array.isArray(block.instructions)) continue;

    for (let index = 0; index < block.instructions.length; index += 1) {
      const inst = block.instructions[index];
      const compareValue = parseCpValue(inst);
      if (compareValue === null || !values.has(compareValue)) continue;

      const comparePc = inst.pc & MASK24;
      if (seen.has(comparePc)) continue;
      seen.add(comparePc);

      const branch = findConditionalFollower(block.instructions, index);
      hits.push({
        blockPc: block.startPc & MASK24,
        pc: comparePc,
        dasm: inst.dasm,
        compareValue,
        branchText: branch?.dasm ?? null,
        branchTarget: Number.isInteger(branch?.target) ? (branch.target & MASK24) : null,
        branchFallthrough: Number.isInteger(branch?.fallthrough) ? (branch.fallthrough & MASK24) : null,
      });
    }
  }

  hits.sort((left, right) => left.pc - right.pc);
  return hits;
}

function prepareCpu(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function runMemInit(executor, cpu, mem) {
  prepareCpu(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 4096,
      onBlock(pc) {
        if ((pc & MASK24) === MEMINIT_RET) throw new Error(RUN_STOP);
      },
      onMissingBlock(pc) {
        if ((pc & MASK24) === MEMINIT_RET) throw new Error(RUN_STOP);
      },
    });
  } catch (error) {
    if (error?.message !== RUN_STOP) throw error;
  }
}

function seedStatState(stat, peripherals, cpu, mem) {
  mem[KEY_CODE_ADDR] = stat.homeKeyCode;
  mem[GETKY_ADDR] = stat.homeKeyCode;
  mem[RAW_SCAN_ADDR] = stat.physicalScan;
  mem[GETCSC_SCAN_ADDR] = stat.flattenedScan;
  cpu.a = stat.homeKeyCode;

  const keyMatrix = getKeyboardMatrix(peripherals);
  if (keyMatrix) {
    keyMatrix.fill(0xFF);
    if (stat.group >= 0 && stat.group < keyMatrix.length) {
      keyMatrix[stat.group] &= ~(1 << stat.bit);
    }
  }

  // Match the "plain home screen" flags used by the phase 187 micro-trace.
  mem[IY_ADDR + 0x09] &= ~(1 << 7);
  mem[IY_ADDR + 0x0C] &= ~(1 << 6);
  mem[IY_ADDR + 0x0C] &= ~(1 << 7);
  mem[IY_ADDR + 0x45] &= ~(1 << 6);
}

function describeControlOutcome(event, nextPc) {
  if (!Number.isInteger(nextPc)) return 'next pc unavailable';

  switch (event.tag) {
    case 'jr-conditional':
    case 'jp-conditional':
      if (nextPc === event.target) return `taken to ${hex(event.target)}`;
      if (nextPc === event.fallthrough) return `fallthrough to ${hex(event.fallthrough)}`;
      return `next ${hex(nextPc)}`;
    case 'ret-conditional':
      if (nextPc === event.fallthrough) return `not taken, fallthrough to ${hex(event.fallthrough)}`;
      return `taken return to ${hex(nextPc)}`;
    case 'call-conditional':
      if (nextPc === event.target) return `taken call to ${hex(event.target)}`;
      if (nextPc === event.fallthrough) return `not taken, fallthrough to ${hex(event.fallthrough)}`;
      return `next ${hex(nextPc)}`;
    case 'call':
      if (nextPc === event.target) return `called ${hex(event.target)}`;
      if (nextPc === event.fallthrough) return `call-return to ${hex(event.fallthrough)}`;
      return `next ${hex(nextPc)}`;
    default:
      return `next ${hex(nextPc)}`;
  }
}

async function runExtendedTrace(stat) {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = () => {};

  try {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom);

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    coldBoot(executor, cpu, mem);
    runMemInit(executor, cpu, mem);
    prepareCpu(cpu, mem);
    seedStatState(stat, peripherals, cpu, mem);

    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    const sequence = [];
    const uniqueVisited = [];
    const missingVisits = [];
    const seenUnique = new Set();
    const compareEvents = [];
    const controlEvents = [];

    let previousVisit = null;
    let returned = false;
    let first059Block = null;

    function finalizePrevious(nextPc) {
      if (!previousVisit) return;

      for (const index of previousVisit.controlEventIndexes) {
        const event = controlEvents[index];
        event.nextPc = nextPc;
        event.outcome = describeControlOutcome(event, nextPc);
      }

      for (const index of previousVisit.compareEventIndexes) {
        const event = compareEvents[index];
        event.nextPc = nextPc;
        if (event.companionText) {
          event.outcome = describeControlOutcome({
            tag: event.companionTag,
            target: event.companionTarget,
            fallthrough: event.companionFallthrough,
          }, nextPc);
        }
      }

      previousVisit = null;
    }

    function captureVisit(pc, mode, step, missing = false) {
      const normalized = pc & MASK24;

      if (normalized === FAKE_RET) {
        finalizePrevious(normalized);
        returned = true;
        throw new Error(RUN_STOP);
      }

      finalizePrevious(normalized);

      const aBefore = cpu.a & 0xFF;
      const visit = {
        step,
        pc: normalized,
        mode,
        missing,
        aBefore,
        controlEventIndexes: [],
        compareEventIndexes: [],
      };

      sequence.push(visit);
      previousVisit = visit;

      if (missing) {
        missingVisits.push({ step, pc: normalized, mode });
        return;
      }

      const uniqueKey = `${mode}:${normalized.toString(16)}`;
      if (!seenUnique.has(uniqueKey)) {
        seenUnique.add(uniqueKey);
        uniqueVisited.push({ step, pc: normalized, mode });
      }

      if (!first059Block && in059Range(normalized)) {
        first059Block = { step, pc: normalized, mode };
      }

      const meta = executor.blockMeta[blockKey(normalized, mode)] ?? null;
      if (!meta?.instructions) return;

      for (let index = 0; index < meta.instructions.length; index += 1) {
        const inst = meta.instructions[index];
        const compareValue = parseCpValue(inst);
        const target = Number.isInteger(inst?.target) ? (inst.target & MASK24) : null;
        const fallthrough = Number.isInteger(inst?.fallthrough) ? (inst.fallthrough & MASK24) : null;

        if (compareValue !== null && inHomeWindow(normalized)) {
          const companion = findConditionalFollower(meta.instructions, index);
          compareEvents.push({
            step,
            blockPc: normalized,
            pc: inst.pc & MASK24,
            dasm: inst.dasm,
            aBefore,
            compareValue,
            matched: aBefore === compareValue,
            interesting: STATIC_COMPARE_VALUES.has(compareValue),
            companionText: companion?.dasm ?? null,
            companionTag: companion?.tag ?? null,
            companionTarget: Number.isInteger(companion?.target) ? (companion.target & MASK24) : null,
            companionFallthrough: Number.isInteger(companion?.fallthrough)
              ? (companion.fallthrough & MASK24)
              : null,
            outcome: companion ? 'pending' : 'no following conditional',
            nextPc: null,
          });
          visit.compareEventIndexes.push(compareEvents.length - 1);
        }

        const shouldRecordControl =
          (isConditionalControl(inst) && inHomeWindow(normalized))
          || (isCall(inst) && (inHomeWindow(normalized) || inHomeWindow(target)));

        if (shouldRecordControl) {
          controlEvents.push({
            step,
            blockPc: normalized,
            pc: inst.pc & MASK24,
            dasm: inst.dasm,
            aBefore,
            tag: inst.tag,
            condition: parseCondition(inst),
            target,
            fallthrough,
            outcome: 'pending',
            nextPc: null,
            touchesHomeRange: inHomeWindow(target),
            reaches059Range: in059Range(target),
          });
          visit.controlEventIndexes.push(controlEvents.length - 1);
        }
      }
    }

    let runResult = null;
    let errorMessage = null;

    try {
      runResult = executor.runFrom(HOME_CONTEXT_ENTRY, 'adl', {
        maxSteps: STEP_LIMIT,
        maxLoopIterations: LOOP_LIMIT,
        onBlock(pc, mode, _meta, step) {
          captureVisit(pc, mode, step, false);
        },
        onMissingBlock(pc, mode, step) {
          captureVisit(pc, mode, step, true);
        },
      });
    } catch (error) {
      if (error?.message !== RUN_STOP) {
        errorMessage = error?.stack ?? String(error);
      }
    }

    if (runResult && !returned) {
      const nextPc = runResult.lastPc & MASK24;
      finalizePrevious(nextPc);
    }

    return {
      returned,
      errorMessage,
      termination: returned ? 'sentinel_return' : (runResult?.termination ?? 'exception'),
      steps: returned ? sequence.length : (runResult?.steps ?? sequence.length),
      lastPc: returned ? FAKE_RET : (runResult?.lastPc ?? HOME_CONTEXT_ENTRY),
      lastMode: returned ? 'adl' : (runResult?.lastMode ?? 'adl'),
      loopsForced: runResult?.loopsForced ?? 0,
      uniqueVisited,
      missingVisits,
      compareEvents,
      controlEvents,
      first059Block,
      finalA: cpu.a & 0xFF,
      finalF: cpu.f & 0xFF,
      finalKey: mem[KEY_CODE_ADDR] & 0xFF,
      finalGetKy: mem[GETKY_ADDR] & 0xFF,
      finalScan: mem[GETCSC_SCAN_ADDR] & 0xFF,
      finalRawScan: mem[RAW_SCAN_ADDR] & 0xFF,
    };
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printUniqueBlocks(entries) {
  if (entries.length === 0) {
    console.log('No lifted blocks were visited.');
    return;
  }

  for (const entry of entries) {
    const markers = [];
    if (entry.step >= 500) markers.push('>500');
    if (in059Range(entry.pc)) markers.push('059xxx');
    const suffix = markers.length ? ` [${markers.join(', ')}]` : '';
    console.log(`[${String(entry.step).padStart(4, '0')}] ${hex(entry.pc)} (${entry.mode})${suffix}`);
  }
}

function printCompareEvents(events) {
  if (events.length === 0) {
    console.log('No immediate CP instructions executed in the traced 0x058xxx/0x059xxx blocks.');
    return;
  }

  for (const event of events) {
    const markers = [];
    if (event.interesting) markers.push('watch');
    if (event.compareValue === 0x05) markers.push('ENTER split');
    const prefix = markers.length ? ` [${markers.join(', ')}]` : '';
    const branchText = event.companionText ? ` ; ${event.companionText} => ${event.outcome}` : '';
    console.log(
      `[${String(event.step).padStart(4, '0')}] ${hex(event.blockPc)} A=${bhex(event.aBefore)} ${event.dasm}`
      + ` => ${event.matched ? 'match' : 'no-match'}${prefix}${branchText}`,
    );
  }
}

function printControlEvents(events) {
  if (events.length === 0) {
    console.log('No tracked conditional branches or calls executed in the home-window trace.');
    return;
  }

  for (const event of events) {
    const markers = [];
    if (event.touchesHomeRange) markers.push('058/059 call');
    if (event.reaches059Range) markers.push('059xxx target');
    const suffix = markers.length ? ` [${markers.join(', ')}]` : '';
    console.log(
      `[${String(event.step).padStart(4, '0')}] ${hex(event.blockPc)} ${event.dasm}`
      + ` => ${event.outcome}${suffix}`,
    );
  }
}

function printStaticHits(hits) {
  if (hits.length === 0) {
    console.log('No static cp 0x31 / 0x09 / 0xFC / 0x05 blocks were found in 0x058000..0x05A000.');
    return;
  }

  for (const hit of hits) {
    const branchText = hit.branchText ? ` ; ${hit.branchText}` : '';
    console.log(`${hex(hit.pc)} in ${hex(hit.blockPc)}: ${hit.dasm}${branchText}`);
  }
}

async function main() {
  console.log('=== Phase 188 - STAT Extended Micro-Trace ===');

  const stat = parseStatKey();
  const staticHits = collectStaticKeyCompareHits(STATIC_COMPARE_VALUES);

  printSection('STAT Seed');
  console.log(`Home context table: ${hex(HOME_CONTEXT_TABLE)}`);
  console.log(`Trace entry: ${hex(HOME_CONTEXT_ENTRY)} (shared non-ENTER pivot at ${hex(HOME_NON_ENTER)})`);
  console.log(`keyboard-matrix.md: keyMatrix[${stat.group}] bit ${stat.bit} -> physical scan ${bhex(stat.physicalScan)}`);
  console.log(`_GetCSC flattened scan: ${bhex(stat.flattenedScan)}`);
  console.log(`Seeded home key code in A / D0058C / D0058D: ${bhex(stat.homeKeyCode)}`);
  console.log(`Step limit: ${STEP_LIMIT}`);

  printSection('Static Key-Code Compare Scan');
  console.log('Watching for cp 0x31 (STAT home key), cp 0x09 (ENTER), cp 0xFC, plus cp 0x05 (observed home ENTER split).');
  printStaticHits(staticHits);

  printSection('Extended Trace');
  const trace = await runExtendedTrace(stat);
  console.log(`Termination: ${trace.termination}`);
  console.log(`Returned to sentinel: ${trace.returned ? 'yes' : 'no'}`);
  console.log(`Steps executed: ${trace.steps}`);
  console.log(`Last PC: ${hex(trace.lastPc)} (${trace.lastMode})`);
  console.log(`Loops forced by executor: ${trace.loopsForced}`);
  console.log(`Final A=${bhex(trace.finalA)} F=${bhex(trace.finalF)} key=${bhex(trace.finalKey)} getKy=${bhex(trace.finalGetKy)} getCSC=${bhex(trace.finalScan)} rawScan=${bhex(trace.finalRawScan)}`);
  if (trace.errorMessage) {
    console.log(`Trace exception: ${trace.errorMessage}`);
  }

  printSection('Unique Block PCs Visited');
  printUniqueBlocks(trace.uniqueVisited);

  printSection('Unique Blocks First Seen After Step 500');
  printUniqueBlocks(trace.uniqueVisited.filter((entry) => entry.step >= 500));

  printSection('Executed CP Decisions');
  printCompareEvents(trace.compareEvents);

  printSection('Executed Conditional Branches And Calls');
  printControlEvents(trace.controlEvents);

  printSection('Missing Blocks');
  if (trace.missingVisits.length === 0) {
    console.log('No missing blocks encountered.');
  } else {
    for (const visit of trace.missingVisits) {
      console.log(`[${String(visit.step).padStart(4, '0')}] ${hex(visit.pc)} (${visit.mode})`);
    }
  }

  printSection('Assessment');
  const cp31 = trace.compareEvents.filter((event) => event.compareValue === 0x31);
  const cp09 = trace.compareEvents.filter((event) => event.compareValue === 0x09);
  const cpFC = trace.compareEvents.filter((event) => event.compareValue === 0xFC);
  const homeCalls = trace.controlEvents.filter((event) => isCall({ tag: event.tag }) && inHomeWindow(event.target));

  console.log(`cp 0x31 executed dynamically: ${cp31.length ? 'yes' : 'no'}`);
  console.log(`cp 0x09 executed dynamically: ${cp09.length ? 'yes' : 'no'}`);
  console.log(`cp 0xFC executed dynamically: ${cpFC.length ? 'yes' : 'no'}`);
  console.log(`Calls into 0x058xxx/0x059xxx observed: ${homeCalls.length ? 'yes' : 'no'}`);
  if (homeCalls.length) {
    console.log(`First local home-range call: step ${homeCalls[0].step} ${hex(homeCalls[0].pc)} ${homeCalls[0].dasm}`);
  }

  if (trace.first059Block) {
    console.log(`STAT-specific 0x059xxx path found: yes, first reached ${hex(trace.first059Block.pc)} at step ${trace.first059Block.step}.`);
  } else {
    console.log('STAT-specific 0x059xxx path found: no, the seeded trace never entered 0x059xxx within 3000 steps.');
  }

  const firstPost500 = trace.uniqueVisited.find((entry) => entry.step >= 500);
  if (firstPost500) {
    console.log(`First new block beyond the phase 187 limit: step ${firstPost500.step} ${hex(firstPost500.pc)}.`);
  } else {
    console.log('No new unique block first appeared after step 500.');
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
