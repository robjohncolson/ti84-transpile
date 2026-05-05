#!/usr/bin/env node

/**
 * Phase 188 - STAT Key Dispatch Extended Micro-Trace (3000 steps)
 *
 * Extends the session 187 STAT key dispatch trace from 500 steps to 3000 steps.
 * Logs every unique PC visited, watches for CP instructions, conditional branches,
 * and CALLs into the STAT app area (0x058xxx-0x059xxx).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction as dec } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MATRIX_PATH = path.join(__dirname, 'keyboard-matrix.md');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const rom = fs.readFileSync(ROM_PATH);
const matrixText = fs.readFileSync(MATRIX_PATH, 'utf8');

// Key addresses
const HOME_SECOND_PASS = 0x0585E9;
const GETCSC_TRANSLATION_TABLE = 0x09F79B;

const MEM_SIZE = 0x1000000;
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

const MAX_STEPS = 3000;

const hex = (value, width = 6) =>
  value === undefined || value === null || Number.isNaN(value)
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const bhex = (value) => hex(value & 0xFF, 2);

const bytesAt = (addr, length) =>
  Array.from(rom.slice(addr, addr + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');

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

  return { group, bit, physicalScan, flattenedScan, homeKeyCode };
}

async function runExtendedTrace(stat) {
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = () => {};

  try {
    const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
    const blocks = romModule.PRELIFTED_BLOCKS;
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom);
    const executor = createExecutor(blocks, mem, {
      peripherals: createPeripheralBus({ timerInterrupt: false }),
    });
    const cpu = executor.cpu;

    const write24 = (addr, value) => {
      mem[addr] = value & 0xFF;
      mem[addr + 1] = (value >>> 8) & 0xFF;
      mem[addr + 2] = (value >>> 16) & 0xFF;
    };

    const prepareCpu = () => {
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
    };

    // Cold boot
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

    executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

    // Memory init
    prepareCpu();
    cpu.sp -= 3;
    write24(cpu.sp, MEMINIT_RET);
    try {
      executor.runFrom(MEM_INIT_ENTRY, 'adl', {
        maxSteps: 100000,
        maxLoopIterations: 4096,
        onBlock(pc) {
          if ((pc & 0xFFFFFF) === MEMINIT_RET) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          if ((pc & 0xFFFFFF) === MEMINIT_RET) throw new Error('__RET__');
        },
      });
    } catch (error) {
      if (error?.message !== '__RET__') throw error;
    }

    // Prepare for STAT dispatch
    prepareCpu();

    mem[KEY_CODE_ADDR] = stat.homeKeyCode;
    mem[RAW_SCAN_ADDR] = stat.physicalScan;
    mem[GETCSC_SCAN_ADDR] = stat.flattenedScan;
    cpu.a = stat.homeKeyCode;

    // Clear "normal home" flags
    mem[IY_ADDR + 0x09] &= ~(1 << 7);
    mem[IY_ADDR + 0x0C] &= ~(1 << 6);
    mem[IY_ADDR + 0x0C] &= ~(1 << 7);
    mem[IY_ADDR + 0x45] &= ~(1 << 6);

    cpu.sp -= 3;
    write24(cpu.sp, FAKE_RET);

    // Extended trace state
    const blocksVisited = [];       // ordered unique PCs with step number
    const compareInstructions = []; // CP instructions where A is compared
    const conditionalBranches = []; // JR/JP conditional branches
    const statAreaCalls = [];       // CALLs to 0x058xxx-0x059xxx
    let reachedStatArea = false;
    let returned = false;
    let stepCount = 0;

    try {
      executor.runFrom(HOME_SECOND_PASS, 'adl', {
        maxSteps: MAX_STEPS,
        maxLoopIterations: 2048,
        onBlock(pc) {
          stepCount++;
          const normalized = pc & 0xFFFFFF;

          // Track unique block visits with step number
          if (blocksVisited.length === 0 || blocksVisited[blocksVisited.length - 1].pc !== normalized) {
            blocksVisited.push({ pc: normalized, step: stepCount });
          }

          // Check if we reached STAT app area (0x059xxx)
          if (normalized >= 0x059000 && normalized < 0x05A000) {
            reachedStatArea = true;
          }

          // Decode the block's first few instructions to watch for CP, branches, CALLs
          let instPc = normalized;
          for (let i = 0; i < 15; i++) {
            try {
              const inst = dec(rom, instPc, 'adl');

              // Watch for CP instructions
              if (inst.tag === 'alu-imm' && inst.op === 'cp') {
                compareInstructions.push({
                  pc: inst.pc,
                  value: inst.value & 0xFF,
                  step: stepCount,
                });
              }

              // Watch for conditional JR/JP branches
              if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional') {
                conditionalBranches.push({
                  pc: inst.pc,
                  target: inst.target,
                  condition: inst.condition,
                  step: stepCount,
                });
              }

              // Watch for CALLs to STAT app area
              if ((inst.tag === 'call' || inst.tag === 'call-conditional') &&
                  inst.target >= 0x058000 && inst.target < 0x05A000) {
                statAreaCalls.push({
                  pc: inst.pc,
                  target: inst.target,
                  step: stepCount,
                });
              }

              instPc = inst.nextPc;
              if (['jp', 'jp-conditional', 'jp-indirect', 'jr', 'jr-conditional',
                   'ret', 'ret-conditional', 'call', 'call-conditional'].includes(inst.tag)) {
                break;
              }
            } catch {
              break;
            }
          }

          if (normalized === FAKE_RET) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          stepCount++;
          const normalized = pc & 0xFFFFFF;
          if (blocksVisited.length === 0 || blocksVisited[blocksVisited.length - 1].pc !== normalized) {
            blocksVisited.push({ pc: normalized, step: stepCount });
          }
          if (normalized >= 0x059000 && normalized < 0x05A000) {
            reachedStatArea = true;
          }
          if (normalized === FAKE_RET) throw new Error('__RET__');
        },
      });
    } catch (error) {
      if (error?.message === '__RET__') returned = true;
      else throw error;
    }

    return {
      returned,
      stepCount,
      blocksVisited,
      compareInstructions,
      conditionalBranches,
      statAreaCalls,
      reachedStatArea,
      finalA: cpu.a & 0xFF,
      finalF: cpu.f & 0xFF,
      finalScan: mem[GETCSC_SCAN_ADDR] & 0xFF,
      finalKey: mem[KEY_CODE_ADDR] & 0xFF,
      finalGetKy: mem[GETKY_ADDR] & 0xFF,
    };
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

async function main() {
  console.log('=== Phase 188 - STAT Key Dispatch Extended Micro-Trace (3000 steps) ===');
  console.log(`Entry: ${hex(HOME_SECOND_PASS)} (cxMain home context handler)`);
  console.log(`Max steps: ${MAX_STEPS}`);

  const stat = parseStatKey();
  console.log(`\nSTAT key codes: physical=${bhex(stat.physicalScan)} getCSC=${bhex(stat.flattenedScan)} home=${bhex(stat.homeKeyCode)}`);
  console.log(`A register pre-seeded to ${bhex(stat.homeKeyCode)}`);

  console.log('\n--- Running extended trace ---');
  const trace = await runExtendedTrace(stat);

  console.log(`\n=== TRACE RESULTS ===`);
  console.log(`Steps executed: ${trace.stepCount}`);
  console.log(`Returned to caller: ${trace.returned ? 'YES' : 'NO'}`);
  console.log(`Reached STAT area (0x059xxx): ${trace.reachedStatArea ? 'YES' : 'NO'}`);
  console.log(`Final registers: A=${bhex(trace.finalA)} F=${bhex(trace.finalF)}`);
  console.log(`Final memory: getCSCScan=${bhex(trace.finalScan)} keyCode=${bhex(trace.finalKey)} getKy=${bhex(trace.finalGetKy)}`);

  console.log(`\n=== FULL ORDERED BLOCK TRACE (${trace.blocksVisited.length} unique entries) ===`);
  for (const entry of trace.blocksVisited) {
    const inStatArea = entry.pc >= 0x059000 && entry.pc < 0x05A000 ? ' [STAT AREA]' : '';
    const inHomeHandler = entry.pc >= 0x058000 && entry.pc < 0x059000 ? ' [HOME]' : '';
    console.log(`  step ${String(entry.step).padStart(4)}: ${hex(entry.pc)}${inStatArea}${inHomeHandler}`);
  }

  console.log(`\n=== CP (COMPARE) INSTRUCTIONS (${trace.compareInstructions.length} found) ===`);
  for (const cp of trace.compareInstructions) {
    const isKeyCode = cp.value === stat.homeKeyCode ? ' <-- STAT key code!' : '';
    const isScan = cp.value === stat.flattenedScan ? ' <-- STAT scan code!' : '';
    console.log(`  step ${String(cp.step).padStart(4)}: ${hex(cp.pc)} cp ${bhex(cp.value)}${isKeyCode}${isScan}`);
  }

  console.log(`\n=== CONDITIONAL BRANCHES (${trace.conditionalBranches.length} found) ===`);
  for (const br of trace.conditionalBranches) {
    console.log(`  step ${String(br.step).padStart(4)}: ${hex(br.pc)} ${br.condition} -> ${hex(br.target)}`);
  }

  console.log(`\n=== CALLS TO STAT APP AREA 0x058000-0x059FFF (${trace.statAreaCalls.length} found) ===`);
  if (trace.statAreaCalls.length === 0) {
    console.log('  (none)');
  } else {
    for (const call of trace.statAreaCalls) {
      console.log(`  step ${String(call.step).padStart(4)}: ${hex(call.pc)} call ${hex(call.target)}`);
    }
  }

  console.log('\n=== KEY BRANCH DECISIONS ===');
  const keyCompares = trace.compareInstructions.filter(
    (cp) => cp.value === stat.homeKeyCode || cp.value === stat.flattenedScan || cp.value === stat.physicalScan
  );
  if (keyCompares.length === 0) {
    console.log('  No CP instructions found comparing against STAT key/scan codes directly.');
    console.log('  Dispatch likely uses table lookup or indirect jump rather than sequential CP chain.');
  } else {
    console.log('  Key code comparisons found:');
    for (const cp of keyCompares) {
      console.log(`    ${hex(cp.pc)} cp ${bhex(cp.value)} at step ${cp.step}`);
    }
  }

  console.log('\n=== SUMMARY ===');
  console.log(`Total unique blocks visited: ${trace.blocksVisited.length}`);
  const homeBlocks = trace.blocksVisited.filter((e) => e.pc >= 0x058000 && e.pc < 0x059000);
  const statBlocks = trace.blocksVisited.filter((e) => e.pc >= 0x059000 && e.pc < 0x05A000);
  console.log(`Blocks in home handler range (0x058xxx): ${homeBlocks.length}`);
  console.log(`Blocks in STAT area (0x059xxx): ${statBlocks.length}`);
  if (statBlocks.length > 0) {
    console.log(`First STAT area block reached at step ${statBlocks[0].step}: ${hex(statBlocks[0].pc)}`);
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
