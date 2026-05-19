#!/usr/bin/env node

/**
 * Phase 373 — LCD backlight port (0xB020, 0xB024) probe.
 *
 * Part A: Static ROM scan for OUT/IN instructions targeting ports 0xB020-0xB02F.
 *         Looks for LD BC,0xB0xx patterns followed by OUT (C),A / IN A,(C).
 *
 * Part B: Dynamic boot trace (phase 1, 20 000 steps, timerInterrupt:false).
 *         Reports all writes to ports 0xB020 and 0xB024.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const ROM_SIZE = 0x400000;
const MEM_SIZE = 0x1000000;
const PORT_RANGE_START = 0xB020;
const PORT_RANGE_END = 0xB02F;
const WATCHED_PORTS = [0xB020, 0xB024];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((Number(value) || 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

// ── Part A: Static ROM scan ──

function staticScan(romBytes) {
  console.log('=== PART A: STATIC ROM SCAN — OUT/IN referencing ports 0xB020-0xB02F ===');
  console.log('');

  const hits = [];
  let lastBcLoad = null;
  let addr = 0;

  while (addr < ROM_SIZE && addr < romBytes.length) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, addr, 'adl');
      if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
        addr++;
        continue;
      }
    } catch {
      addr++;
      continue;
    }

    // Track LD BC, imm24/imm16
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      lastBcLoad = { addr, value: inst.value };
    }

    // OUT (C), r or IN r, (C) — port comes from BC
    if (inst.tag === 'out-reg' || inst.tag === 'in-reg') {
      if (lastBcLoad && lastBcLoad.value >= PORT_RANGE_START && lastBcLoad.value <= PORT_RANGE_END) {
        hits.push({
          instrAddr: addr,
          tag: inst.tag,
          reg: inst.reg,
          port: lastBcLoad.value,
          bcLoadAddr: lastBcLoad.addr,
        });
      }
    }

    // OUT (n), A or IN A, (n) — immediate port
    if (inst.tag === 'out-imm' || inst.tag === 'in-imm') {
      const port = inst.port ?? inst.value ?? 0;
      if (port >= PORT_RANGE_START && port <= PORT_RANGE_END) {
        hits.push({
          instrAddr: addr,
          tag: inst.tag,
          reg: 'a',
          port,
          bcLoadAddr: null,
        });
      }
    }

    addr += inst.length;
  }

  if (hits.length === 0) {
    console.log('  No OUT/IN instructions found targeting ports 0xB020-0xB02F.');
  } else {
    console.log(`  Found ${hits.length} instruction(s):`);
    for (const hit of hits) {
      const bcInfo = hit.bcLoadAddr !== null
        ? ` (BC loaded at ${hex(hit.bcLoadAddr)})`
        : '';
      console.log(`    ${hex(hit.instrAddr)}: ${hit.tag} reg=${hit.reg} port=${hex(hit.port, 4)}${bcInfo}`);
    }
  }

  console.log('');
  return hits;
}

// ── Part B: Dynamic boot trace ──

function dynamicTrace(blocks, romBytes) {
  console.log('=== PART B: DYNAMIC BOOT TRACE — writes to 0xB020 and 0xB024 ===');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  romBytes.copy(mem, 0, 0, romBytes.length);

  const portWrites = [];
  const peripherals = createPeripheralBus({ timerInterrupt: false });

  // Wrap the peripheral write to intercept watched port writes
  const origWrite = peripherals.write.bind(peripherals);
  let stepCount = 0;

  peripherals.write = function (port, value) {
    const normalizedPort = Number(port) & 0xFFFF;
    if (WATCHED_PORTS.includes(normalizedPort)) {
      portWrites.push({
        step: stepCount,
        port: normalizedPort,
        value: Number(value) & 0xFF,
      });
    }
    return origWrite(port, value);
  };

  const executor = createExecutor(blocks, mem, { peripherals });

  // Hook into step counting via onBlock
  const result = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
    onBlock(pc, mode, meta, step) {
      stepCount = step;
    },
  });

  console.log(`  Phase 1 trace: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)}`);
  console.log('');

  if (portWrites.length === 0) {
    console.log('  No writes to ports 0xB020 or 0xB024 during phase 1 boot.');
  } else {
    console.log(`  ${portWrites.length} write(s) to watched ports:`);
    for (const w of portWrites) {
      const portName = w.port === 0xB020 ? 'LCD_POWER' : w.port === 0xB024 ? 'LCD_BRIGHTNESS' : `port_${hex(w.port, 4)}`;
      console.log(`    step ~${w.step}  ${hex(w.port, 4)} (${portName}) <= 0x${hexByte(w.value)}`);
    }
  }

  // Also read back the values to confirm registration works
  console.log('');
  console.log('  Readback after boot:');
  for (const port of WATCHED_PORTS) {
    const val = peripherals.read(port);
    console.log(`    ${hex(port, 4)} => 0x${hexByte(val)}`);
  }

  console.log('');
  return portWrites;
}

// ── Main ──

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS
  ?? romModule.default?.PRELIFTED_BLOCKS
  ?? romModule.default,
);

if (!blocks || Object.keys(blocks).length === 0) {
  throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
}

const staticHits = staticScan(romBytes);
const dynamicWrites = dynamicTrace(blocks, romBytes);

console.log('=== SUMMARY ===');
console.log(`  Static scan: ${staticHits.length} OUT/IN instruction(s) in 0xB020-0xB02F range`);
console.log(`  Dynamic trace: ${dynamicWrites.length} write(s) to 0xB020/0xB024 during phase 1 boot`);
console.log('  PASS');
