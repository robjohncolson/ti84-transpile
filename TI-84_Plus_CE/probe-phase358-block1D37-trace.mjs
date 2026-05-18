#!/usr/bin/env node

/**
 * Phase 358: Block 0x001D37 trace
 *
 * Disassembles 0x001D37-0x001D80 (eZ80 ADL mode), then boots the ROM and
 * traces execution through that range under three different GPIO port 0x03
 * values to understand the BIT 4,A branch.
 *
 * Port behaviour observed in session 357:
 *   - Writes port 0x28 (PLL) with 0xD0
 *   - Reads port 0x28 (gets 0x0C)
 *   - Reads port 0x03 (GPIO, returns 0xEF)
 *   - Does BIT 4,A on the GPIO value
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const EXPECTED_HALT_PC = 0x0019B5;
const NMI_VECTOR = 0x000066;
const BOOT_MAX_STEPS = 5000;
const NMI_MAX_STEPS = 500;
const MAX_LOOP_ITERATIONS = 50000;
const NMI_WAKE_COUNT = 3;

const TRACE_START = 0x001D37;
const TRACE_END = 0x001D80;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatPort(port) {
  const normalized = Number(port) & 0xFFFF;
  const width = normalized > 0xFF ? 4 : 2;
  return hex(normalized, width);
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
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

function createMemory(romBytes) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(memory.length, romBytes.length)));
  return memory;
}

function pad(text, width) {
  return String(text).padEnd(width, ' ');
}

// ---------------------------------------------------------------------------
// Disassembler — minimal eZ80 ADL-mode decoder for the target range
// ---------------------------------------------------------------------------

function disassembleRange(rom, start, end) {
  const lines = [];
  let pc = start;

  function byte() { return rom[pc++]; }
  function imm8() { return byte(); }
  function imm16() { const lo = byte(); const hi = byte(); return (hi << 8) | lo; }
  function imm24() { const lo = byte(); const mid = byte(); const hi = byte(); return (hi << 16) | (mid << 8) | lo; }
  function rel8() { const v = byte(); return v > 127 ? v - 256 : v; }

  function hexB(v) { return '0x' + (v & 0xFF).toString(16).toUpperCase().padStart(2, '0'); }
  function hexW(v) { return '0x' + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, '0'); }
  function hexA(v) { return '0x' + (v & 0xFFFFFF).toString(16).toUpperCase().padStart(6, '0'); }

  const r8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

  while (pc <= end) {
    const addr = pc;
    const startPc = pc;
    let mnemonic = '???';

    const op = byte();

    switch (op) {
      case 0x00: mnemonic = 'NOP'; break;
      case 0x01: mnemonic = `LD BC,${hexA(imm24())}`; break;
      case 0x06: mnemonic = `LD B,${hexB(imm8())}`; break;
      case 0x0E: mnemonic = `LD C,${hexB(imm8())}`; break;
      case 0x11: mnemonic = `LD DE,${hexA(imm24())}`; break;
      case 0x16: mnemonic = `LD D,${hexB(imm8())}`; break;
      case 0x18: { const off = rel8(); mnemonic = `JR ${hexA(pc + off)}`; break; }
      case 0x20: { const off = rel8(); mnemonic = `JR NZ,${hexA(pc + off)}`; break; }
      case 0x28: { const off = rel8(); mnemonic = `JR Z,${hexA(pc + off)}`; break; }
      case 0x30: { const off = rel8(); mnemonic = `JR NC,${hexA(pc + off)}`; break; }
      case 0x38: { const off = rel8(); mnemonic = `JR C,${hexA(pc + off)}`; break; }
      case 0x3E: mnemonic = `LD A,${hexB(imm8())}`; break;
      case 0x76: mnemonic = 'HALT'; break;
      case 0xAF: mnemonic = 'XOR A'; break;
      case 0xC1: mnemonic = 'POP BC'; break;
      case 0xC3: mnemonic = `JP ${hexA(imm24())}`; break;
      case 0xC5: mnemonic = 'PUSH BC'; break;
      case 0xC9: mnemonic = 'RET'; break;
      case 0xCD: mnemonic = `CALL ${hexA(imm24())}`; break;
      case 0xD1: mnemonic = 'POP DE'; break;
      case 0xD5: mnemonic = 'PUSH DE'; break;
      case 0xD9: mnemonic = 'EXX'; break;
      case 0xE1: mnemonic = 'POP HL'; break;
      case 0xE5: mnemonic = 'PUSH HL'; break;
      case 0xF1: mnemonic = 'POP AF'; break;
      case 0xF3: mnemonic = 'DI'; break;
      case 0xF5: mnemonic = 'PUSH AF'; break;
      case 0xFB: mnemonic = 'EI'; break;

      case 0xCB: {
        const cb = byte();
        const bit = (cb >> 3) & 7;
        const reg = cb & 7;
        const hi2 = (cb >> 6) & 3;
        if (hi2 === 1) {
          mnemonic = `BIT ${bit},${r8[reg]}`;
        } else if (hi2 === 2) {
          mnemonic = `RES ${bit},${r8[reg]}`;
        } else if (hi2 === 3) {
          mnemonic = `SET ${bit},${r8[reg]}`;
        } else {
          // rotate/shift group
          const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
          mnemonic = `${ops[bit]} ${r8[reg]}`;
        }
        break;
      }

      case 0xED: {
        const ed = byte();
        switch (ed) {
          case 0x38: mnemonic = `IN0 A,(${hexB(imm8())})`; break;
          case 0x39: mnemonic = `OUT0 (${hexB(imm8())}),A`; break;
          case 0x46: mnemonic = 'IM 0'; break;
          case 0x56: mnemonic = 'IM 1'; break;
          case 0x5E: mnemonic = 'IM 2'; break;
          case 0x7E: mnemonic = 'STMIX'; break;
          case 0x7F: mnemonic = 'RSMIX'; break;
          case 0x4D: mnemonic = 'RETI'; break;
          case 0x45: mnemonic = 'RETN'; break;
          default: mnemonic = `ED ${hexB(ed)}`; break;
        }
        break;
      }

      case 0xDD: {
        const dd = byte();
        switch (dd) {
          case 0x0F: { mnemonic = `DB 0xDD,0x0F`; break; }  // undocumented / suffix
          case 0x21: mnemonic = `LD IX,${hexA(imm24())}`; break;
          case 0x23: mnemonic = 'INC IX'; break;
          case 0x27: { const dd2 = byte(); mnemonic = `DB 0xDD,0x27,${hexB(dd2)}`; break; }
          case 0x39: mnemonic = 'ADD IX,SP'; break;
          case 0xE1: mnemonic = 'POP IX'; break;
          case 0xE5: mnemonic = 'PUSH IX'; break;
          default: mnemonic = `DD ${hexB(dd)}`; break;
        }
        break;
      }

      case 0xFD: {
        const fd = byte();
        switch (fd) {
          case 0x21: mnemonic = `LD IY,${hexA(imm24())}`; break;
          case 0xCD: mnemonic = `CALL.S ${hexA(imm24())}`; break;  // .SIS suffix
          case 0xE1: mnemonic = 'POP IY'; break;
          case 0xE5: mnemonic = 'PUSH IY'; break;
          default: mnemonic = `FD ${hexB(fd)}`; break;
        }
        break;
      }

      default: {
        mnemonic = `DB ${hexB(op)}`;
        break;
      }
    }

    const rawBytes = [];
    for (let i = startPc; i < pc; i++) {
      rawBytes.push(rom[i].toString(16).toUpperCase().padStart(2, '0'));
    }

    lines.push({
      addr,
      bytes: rawBytes.join(' '),
      mnemonic,
    });
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Boot + trace helpers
// ---------------------------------------------------------------------------

async function loadBlocks() {
  ensureTranspiledRom();
  const transpiledMod = await import(pathToFileURL(TRANSPILED_PATH).href);
  const rawBlocks =
    transpiledMod.PRELIFTED_BLOCKS ??
    transpiledMod.default?.PRELIFTED_BLOCKS ??
    transpiledMod.default ??
    transpiledMod;
  const blocks = normalizeBlocks(rawBlocks);
  if (Object.keys(blocks).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
  }
  return blocks;
}

function runBootToHalt(blocks, romBytes, gpioValue) {
  const memory = createMemory(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false, gpioValue });
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = memory;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;

  // Track blocks visited in the trace range
  const traceLog = [];
  const blockHits = new Map();
  const portOps = [];

  // Patch port I/O to log operations in trace range
  const origRead = peripherals.read.bind(peripherals);
  const origWrite = peripherals.write.bind(peripherals);
  let tracing = false;

  peripherals.read = function(port) {
    const value = origRead(port);
    if (tracing) {
      portOps.push({
        phase: 'trace',
        op: 'READ',
        port: Number(port) & 0xFFFF,
        value: value & 0xFF,
        pc: cpu.pc & 0xFFFFFF,
        a: cpu.a & 0xFF,
      });
    }
    return value;
  };

  peripherals.write = function(port, value) {
    if (tracing) {
      portOps.push({
        phase: 'trace',
        op: 'WRITE',
        port: Number(port) & 0xFFFF,
        value: value & 0xFF,
        pc: cpu.pc & 0xFFFFFF,
        a: cpu.a & 0xFF,
      });
    }
    origWrite(port, value);
  };

  // Instrument block execution to trace our range
  const origRunFrom = executor.runFrom.bind(executor);

  // Boot to HALT
  const bootResult = origRunFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(blockPc) {
      const pc = blockPc & 0xFFFFFF;
      if (pc >= TRACE_START && pc <= TRACE_END) {
        tracing = true;
        const count = (blockHits.get(pc) || 0) + 1;
        blockHits.set(pc, count);
        traceLog.push({
          phase: 'boot',
          block: pc,
          a: cpu.a & 0xFF,
          f: cpu.f & 0xFF,
          bc: cpu._bc & 0xFFFFFF,
          de: cpu._de & 0xFFFFFF,
          hl: cpu._hl & 0xFFFFFF,
          sp: cpu.sp & 0xFFFFFF,
          ix: cpu._ix & 0xFFFFFF,
          madl: cpu.madl,
        });
      } else {
        tracing = false;
      }
    },
  });

  const bootHaltPc = (bootResult.lastPc ?? 0) & 0xFFFFFF;

  // Run NMI wakes
  let currentPc = bootHaltPc;
  let currentMode = bootResult.lastMode ?? (cpu.madl ? 'adl' : 'z80');

  for (let nmi = 1; nmi <= NMI_WAKE_COUNT; nmi++) {
    peripherals.triggerNMI();

    const nmiResult = origRunFrom(currentPc, currentMode, {
      maxSteps: NMI_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(blockPc) {
        const pc = blockPc & 0xFFFFFF;
        if (pc >= TRACE_START && pc <= TRACE_END) {
          tracing = true;
          const count = (blockHits.get(pc) || 0) + 1;
          blockHits.set(pc, count);
          traceLog.push({
            phase: `nmi-${nmi}`,
            block: pc,
            a: cpu.a & 0xFF,
            f: cpu.f & 0xFF,
            bc: cpu._bc & 0xFFFFFF,
            de: cpu._de & 0xFFFFFF,
            hl: cpu._hl & 0xFFFFFF,
            sp: cpu.sp & 0xFFFFFF,
            ix: cpu._ix & 0xFFFFFF,
            madl: cpu.madl,
          });
        } else {
          tracing = false;
        }
      },
    });

    currentPc = (nmiResult.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = nmiResult.lastMode ?? currentMode;

    if (nmiResult.termination !== 'halt') {
      break;
    }
  }

  // Also collect ALL unique blocks visited after block 0x1D37 during boot
  // to map control flow
  const allBlocksAfterTrace = [];
  tracing = false;

  return {
    bootTermination: bootResult.termination,
    bootSteps: bootResult.steps,
    bootHaltPc,
    traceLog,
    blockHits,
    portOps,
    totalBlocks: bootResult.blocksExecuted ?? 'n/a',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const blocks = await loadBlocks();

  // ---- Part 1: Disassembly ------------------------------------------------
  console.log('Phase 358: Block 0x001D37 Trace');
  console.log('================================');
  console.log('');

  console.log('--- Disassembly: 0x001D37 - 0x001D80 (eZ80 ADL mode) ---');
  const disasm = disassembleRange(romBytes, TRACE_START, TRACE_END);
  for (const line of disasm) {
    console.log(`  ${hex(line.addr)}:  ${pad(line.bytes, 18)}  ${line.mnemonic}`);
  }
  console.log('');

  // ---- Part 2: GPIO variant runs ------------------------------------------
  const gpioVariants = [
    { label: '0xEF (current, bit4=0)', value: 0xEF },
    { label: '0xFF (bit4=1)',          value: 0xFF },
    { label: '0xE0 (bits4-0 clear)',   value: 0xE0 },
  ];

  for (const variant of gpioVariants) {
    console.log(`--- GPIO variant: ${variant.label} ---`);

    const result = runBootToHalt(blocks, romBytes, variant.value);

    console.log(`  Boot: termination=${result.bootTermination} steps=${result.bootSteps} haltPc=${hex(result.bootHaltPc)}`);
    console.log(`  Blocks in trace range (0x001D37-0x001D80):`);

    if (result.blockHits.size === 0) {
      console.log('    (none — block 0x001D37 was not entered)');
    } else {
      for (const [blockPc, count] of [...result.blockHits.entries()].sort((a, b) => a[0] - b[0])) {
        console.log(`    ${hex(blockPc)}: hit ${count} time(s)`);
      }
    }

    if (result.traceLog.length > 0) {
      console.log('  Trace entries (block entries in range):');
      console.log('    Phase      Block     A     F     BC       DE       HL       SP       IX       MADL');
      for (const entry of result.traceLog) {
        console.log(
          `    ${pad(entry.phase, 9)} ${pad(hex(entry.block), 8)} ${pad(hex(entry.a, 2), 4)} ${pad(hex(entry.f, 2), 4)} ` +
          `${pad(hex(entry.bc), 8)} ${pad(hex(entry.de), 8)} ${pad(hex(entry.hl), 8)} ${pad(hex(entry.sp), 8)} ` +
          `${pad(hex(entry.ix), 8)} ${entry.madl}`
        );
      }
    }

    if (result.portOps.length > 0) {
      console.log('  Port operations during trace:');
      console.log('    Op     Port    Value  PC         A');
      for (const entry of result.portOps) {
        console.log(
          `    ${pad(entry.op, 5)} ${pad(formatPort(entry.port), 6)} ${pad(hex(entry.value, 2), 5)} ${pad(hex(entry.pc), 9)} ${hex(entry.a, 2)}`
        );
      }
    }

    console.log('');
  }

  // ---- Part 3: Control flow after 0x001D37 --------------------------------
  console.log('--- Control flow: does execution reach 0x000D82? ---');

  // Run a full boot tracing ALL block entries to find what follows 0x1D37
  const memory = createMemory(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false, gpioValue: 0xEF });
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;
  cpu.mem = memory;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;

  const allBlocks = [];
  let sawTraceBlock = false;
  let blocksAfter1D37 = [];

  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(blockPc) {
      const pc = blockPc & 0xFFFFFF;
      allBlocks.push(pc);
      if (pc >= TRACE_START && pc <= TRACE_END) {
        sawTraceBlock = true;
        blocksAfter1D37 = []; // reset — capture what comes AFTER
      } else if (sawTraceBlock && blocksAfter1D37.length < 20) {
        blocksAfter1D37.push(pc);
      }
    },
  });

  const bootHaltPc = (bootResult.lastPc ?? 0) & 0xFFFFFF;
  const reaches0D82 = allBlocks.includes(0x000D82);

  console.log(`  Total unique blocks in boot: ${new Set(allBlocks).size}`);
  console.log(`  Block 0x001D37 entered: ${sawTraceBlock ? 'YES' : 'NO'}`);
  console.log(`  Block 0x000D82 reached: ${reaches0D82 ? 'YES' : 'NO'}`);

  if (blocksAfter1D37.length > 0) {
    console.log(`  Next ${blocksAfter1D37.length} blocks after leaving trace range:`);
    for (const pc of blocksAfter1D37) {
      console.log(`    ${hex(pc)}`);
    }
  }

  // Also check during NMI wakes
  let currentPc = bootHaltPc;
  let currentMode = bootResult.lastMode ?? (cpu.madl ? 'adl' : 'z80');

  for (let nmi = 1; nmi <= NMI_WAKE_COUNT; nmi++) {
    peripherals.triggerNMI();
    sawTraceBlock = false;
    blocksAfter1D37 = [];

    const nmiResult = executor.runFrom(currentPc, currentMode, {
      maxSteps: NMI_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(blockPc) {
        const pc = blockPc & 0xFFFFFF;
        if (pc >= TRACE_START && pc <= TRACE_END) {
          sawTraceBlock = true;
          blocksAfter1D37 = [];
        } else if (sawTraceBlock && blocksAfter1D37.length < 20) {
          blocksAfter1D37.push(pc);
        }
        if (pc === 0x000D82) {
          console.log(`  [NMI #${nmi}] Reached 0x000D82!`);
        }
      },
    });

    if (sawTraceBlock) {
      console.log(`  NMI #${nmi}: block 0x001D37 entered`);
      if (blocksAfter1D37.length > 0) {
        console.log(`    Next blocks: ${blocksAfter1D37.map((pc) => hex(pc)).join(', ')}`);
      }
    }

    currentPc = (nmiResult.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = nmiResult.lastMode ?? currentMode;

    if (nmiResult.termination !== 'halt') {
      break;
    }
  }

  console.log('');
  console.log('Done.');
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
