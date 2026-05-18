#!/usr/bin/env node

/*
OUTPUT (2026-05-18):

Phase 362: Trace 0x00BC00-0x00BD00 Block Pattern
=================================================
ROM:             ...\TI-84_Plus_CE\ROM.rom
Transpiled ROM:  ROM.transpiled.js
Total blocks:    144177
Boot steps:      5000

Boot summary
------------
  termination:    missing_block
  steps:          2688
  unique blocks:  476
  last pc:        0x4C7B21:adl

BC-range block visit counts (0x00BC00 - 0x00BD00):
  0x00BC31: 2 visits
  0x00BC1D: 1 visits
  0x00BC21: 1 visits
  0x00BC3E: 1 visits
  0x00BC47: 1 visits
  0x00BC3C: 1 visits
  0x00BC6C: 1 visits
  0x00BC72: 1 visits

Last 50 blocks before termination:
  step=  2639  0x002696:adl
  ...  (loop at 0x002696/0x0026A1/0x00B968/0x00B977/0x00B95B)
  step=  2662  0x00B96C:adl
  step=  2663  0x00B9AE:adl
  step=  2664  0x00BBC2:adl
  step=  2665  0x0021C2:adl
  step=  2666  0x00BBCC:adl
  step=  2667  0x00BBD5:adl
  step=  2668  0x00BBEF:adl
  step=  2669  0x00BBE2:adl
  step=  2670  0x00BBF8:adl
  step=  2671  0x00BBE2:adl
  step=  2672  0x00BBED:adl
  step=  2673  0x00BC1D:adl [BC]    <-- first BC entry, came from 0x00BBED
  step=  2674  0x014C63:adl         <-- call target from 0x00BC1D
  step=  2675  0x002197:adl
  step=  2676  0x014C6B:adl
  step=  2677  0x00BC21:adl [BC]    <-- return from call
  step=  2678  0x00BC3E:adl [BC]    <-- jr from 0x00BC2F
  step=  2679  0x00BC31:adl [BC]    <-- comparison loop
  step=  2680  0x00BC47:adl [BC]    <-- carry set: copy byte
  step=  2681  0x00BC31:adl [BC]    <-- back to loop
  step=  2682  0x00BC3C:adl [BC]    <-- no carry: done
  step=  2683  0x00BC6C:adl [BC]    <-- epilogue: pop af, jp po
  step=  2684  0x00BC72:adl [BC]    <-- restore sp=ix, pop ix, ret
  step=  2685  0x006500:adl         <-- BC72 exits here
  step=  2686  0x006CC6:adl
  step=  2687  0x006D5D:adl
  step=  2688  0x0021C2:adl         <-- then missing_block at 0x4C7B21

First entry into BC cluster:
  step=2673  pc=0x00BC1D:adl  came from: 0x00BBED:adl

0x00BC72 exit target:
  exits to 0x006500:adl

IN/OUT instructions in BC blocks: (none found)

Missing blocks (2 unique):
  step=  2207  pc=0xD18C22:adl  hits=1
  step=  2689  pc=0x4C7B21:adl  hits=1

ANALYSIS:
- The BC cluster is a memcpy-like loop: copies bytes from [iy+0] to RAM at
  0xD15CC0+offset. Loop at 0x00BC31 compares bc (length) vs hl (counter),
  0x00BC47 copies one byte per iteration, 0x00BC6C is the epilogue.
- No IN/OUT (port I/O) instructions in the BC blocks.
- The cluster is entered from 0x00BBED and exits via RET at 0x00BC76 to 0x006500.
- Boot terminates 4 blocks after leaving the BC cluster at missing_block 0x4C7B21.
- The real blocker is 0x4C7B21 (in flash space), not the BC cluster itself.
*/

/**
 * Phase 362: Trace 0x00BC00-0x00BD00 Block Pattern
 *
 * Boot reaches 476 unique blocks. The last blocks before termination at
 * 0x4C7B21 show repeated visits to 0x00BCxx range:
 *   0x00BC31 -> 0x00BC47 -> 0x00BC31 -> 0x00BC3C -> 0x00BC6C -> 0x00BC72
 *   -> 0x006500 -> 0x006CC6 -> 0x006D5D -> 0x0021C2 -> missing_block
 *
 * This probe:
 * 1. Boots the OS for 5000 steps
 * 2. Counts visits to blocks in 0x00BC00-0x00BD00
 * 3. Records the last 50 blocks before termination
 * 4. Disassembles all visited blocks in that range (20 instrs max each)
 * 5. Identifies: first entry into BC cluster, what 0x00BC72 exits to
 * 6. Checks for IN/OUT instructions in the BC blocks
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 50000;

const BC_RANGE_START = 0x00BC00;
const BC_RANGE_END = 0x00BD00;
const MAX_DISASM_INSTRS = 20;

// IN/OUT tag patterns (excluding inc-pair, inc-reg which start with "inc")
const IO_TAGS = new Set([
  'in-imm', 'in-reg', 'in0', 'ini', 'inir', 'ind', 'indr',
  'out-imm', 'out-reg', 'out0', 'outi', 'outd',
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) return false;
  console.log(`${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
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
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function isInBCRange(pc) {
  const addr = pc & 0xFFFFFF;
  return addr >= BC_RANGE_START && addr < BC_RANGE_END;
}

function disassembleBlock(romBytes, startPc, decodeInstruction, maxInstrs) {
  const instrs = [];
  let pc = startPc;
  for (let i = 0; i < maxInstrs; i++) {
    if (pc >= romBytes.length) break;
    let instr;
    try {
      instr = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      instrs.push({ pc, tag: '<decode-error>', length: 1 });
      break;
    }
    if (!instr || !instr.tag) {
      instrs.push({ pc, tag: '<unknown>', length: 1 });
      break;
    }
    instrs.push(instr);

    // Stop on unconditional control flow
    const t = instr.tag;
    if (t === 'ret' || t === 'reti' || t === 'retn' || t === 'jp' || t === 'jr' || t === 'halt') {
      break;
    }

    pc = instr.nextPc;
  }
  return instrs;
}

function formatInstr(instr) {
  const fields = { ...instr };
  delete fields.pc;
  delete fields.length;
  delete fields.nextPc;
  const tag = fields.tag;
  delete fields.tag;

  const extras = Object.entries(fields)
    .map(([k, v]) => {
      if (typeof v === 'number') return `${k}=${hex(v, v > 0xFF ? 6 : 2)}`;
      return `${k}=${v}`;
    })
    .join(' ');

  return `${hex(instr.pc)}  ${tag}${extras ? '  ' + extras : ''}`;
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');

  const regenerated = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const cpuRuntimeModule = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const peripheralsModule = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const decoderModule = await import(pathToFileURL(DECODER_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const { decodeInstruction } = decoderModule;
  const { createExecutor } = cpuRuntimeModule;
  const { createPeripheralBus } = peripheralsModule;

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  console.log('Phase 362: Trace 0x00BC00-0x00BD00 Block Pattern');
  console.log('=================================================');
  console.log(`ROM:             ${ROM_PATH}`);
  console.log(`Transpiled ROM:  ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Total blocks:    ${Object.keys(PRELIFTED_BLOCKS).length}`);
  console.log(`Boot steps:      ${BOOT_MAX_STEPS}`);
  console.log('');

  // --- Boot ---
  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });

  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const uniqueBlocks = new Set();
  const blockHistory = [];
  const bcVisitCounts = new Map(); // hex addr -> count
  const missingBlocks = [];
  let firstBCEntry = null;      // { step, pc, mode, prevPc, prevMode }
  let bc72ExitTarget = null;    // { pc, mode }

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const key = blockKey(normalizedPc, normalizedMode);
      uniqueBlocks.add(key);
      blockHistory.push({ step: step + 1, pc: normalizedPc, mode: normalizedMode });

      // Track BC range visits
      if (isInBCRange(normalizedPc)) {
        const addrHex = hex(normalizedPc);
        bcVisitCounts.set(addrHex, (bcVisitCounts.get(addrHex) || 0) + 1);

        // First entry into BC cluster
        if (firstBCEntry === null) {
          const prev = blockHistory.length >= 2 ? blockHistory[blockHistory.length - 2] : null;
          firstBCEntry = {
            step: step + 1,
            pc: normalizedPc,
            mode: normalizedMode,
            prevPc: prev ? prev.pc : null,
            prevMode: prev ? prev.mode : null,
          };
        }
      }

      // Track what 0x00BC72 exits to
      if (blockHistory.length >= 2) {
        const prev = blockHistory[blockHistory.length - 2];
        if (prev.pc === 0x00BC72) {
          bc72ExitTarget = { pc: normalizedPc, mode: normalizedMode };
        }
      }
    },
    onMissingBlock(pc, mode, step) {
      missingBlocks.push({ step: step + 1, pc: pc & 0xFFFFFF, mode: mode ?? 'adl' });
    },
  });

  // --- Results ---
  console.log('Boot summary');
  console.log('------------');
  console.log(`  termination:    ${result.termination}`);
  console.log(`  steps:          ${result.steps}`);
  console.log(`  unique blocks:  ${uniqueBlocks.size}`);
  console.log(`  last pc:        ${hex(result.lastPc)}:${result.lastMode}`);
  console.log('');

  // --- BC range visit counts ---
  console.log('BC-range block visit counts (0x00BC00 - 0x00BD00):');
  if (bcVisitCounts.size === 0) {
    console.log('  (none visited)');
  } else {
    const sorted = [...bcVisitCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [addr, count] of sorted) {
      console.log(`  ${addr}: ${count} visits`);
    }
  }
  console.log('');

  // --- Last 50 blocks ---
  const last50 = blockHistory.slice(-50);
  console.log(`Last ${last50.length} blocks before termination:`);
  for (const entry of last50) {
    const marker = isInBCRange(entry.pc) ? ' [BC]' : '';
    console.log(`  step=${String(entry.step).padStart(6)}  ${hex(entry.pc)}:${entry.mode}${marker}`);
  }
  console.log('');

  // --- First BC entry ---
  console.log('First entry into BC cluster:');
  if (firstBCEntry) {
    console.log(`  step=${firstBCEntry.step}  pc=${hex(firstBCEntry.pc)}:${firstBCEntry.mode}`);
    console.log(`  came from: ${firstBCEntry.prevPc !== null ? hex(firstBCEntry.prevPc) + ':' + firstBCEntry.prevMode : '(start)'}`);
  } else {
    console.log('  (BC cluster was never entered)');
  }
  console.log('');

  // --- 0x00BC72 exit target ---
  console.log('0x00BC72 exit target:');
  if (bc72ExitTarget) {
    console.log(`  exits to ${hex(bc72ExitTarget.pc)}:${bc72ExitTarget.mode}`);
  } else {
    console.log('  (0x00BC72 was never followed by another block)');
  }
  console.log('');

  // --- Disassembly of visited BC-range blocks ---
  const visitedBCAddrs = [...bcVisitCounts.keys()]
    .map((s) => parseInt(s.replace('0x', ''), 16))
    .sort((a, b) => a - b);

  console.log(`Disassembly of ${visitedBCAddrs.length} visited BC-range blocks:`);
  console.log('');

  const ioInstructions = []; // collect IN/OUT instructions found

  for (const addr of visitedBCAddrs) {
    const visits = bcVisitCounts.get(hex(addr));
    console.log(`--- ${hex(addr)} (${visits} visits) ---`);
    const instrs = disassembleBlock(romBytes, addr, decodeInstruction, MAX_DISASM_INSTRS);
    for (const instr of instrs) {
      const isIO = IO_TAGS.has(instr.tag);
      const ioMarker = isIO ? ' <<< I/O' : '';
      console.log(`  ${formatInstr(instr)}${ioMarker}`);
      if (isIO) {
        ioInstructions.push({ block: hex(addr), ...instr });
      }
    }
    console.log('');
  }

  // --- IN/OUT summary ---
  console.log('IN/OUT instructions in BC blocks:');
  if (ioInstructions.length === 0) {
    console.log('  (none found)');
  } else {
    for (const io of ioInstructions) {
      console.log(`  block=${io.block}  ${formatInstr(io)}`);
    }
  }
  console.log('');

  // --- Missing blocks ---
  if (missingBlocks.length > 0) {
    const collapsed = new Map();
    for (const mb of missingBlocks) {
      const key = blockKey(mb.pc, mb.mode);
      const existing = collapsed.get(key);
      if (existing) { existing.hits++; continue; }
      collapsed.set(key, { ...mb, hits: 1 });
    }
    console.log(`Missing blocks (${collapsed.size} unique):`);
    for (const mb of collapsed.values()) {
      console.log(`  step=${String(mb.step).padStart(6)}  pc=${hex(mb.pc)}:${mb.mode}  hits=${mb.hits}`);
    }
    console.log('');
  }

  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
