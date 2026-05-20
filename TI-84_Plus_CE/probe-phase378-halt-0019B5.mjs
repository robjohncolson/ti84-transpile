#!/usr/bin/env node

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

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 200000, maxLoopIterations: 100000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const INJECTED_SCAN_CODE = 0x09;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

const GPIO_VALUE = 0xEE;

const HALT_ENTRY = 0x0019B5;
const DISASM_RANGE_START = 0x001990;
const DISASM_RANGE_END = 0x0019E0;
const WAKE_PATH_START = 0x0019BE;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

// --- Utilities ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function bytesToHex(buffer, start, length) {
  const end = Math.min(buffer.length, start + Math.max(length, 0));
  return Array.from(
    buffer.subarray(start, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function parseKey(blockKey) {
  const [addrHex, mode] = blockKey.split(':');
  return { addr: Number.parseInt(addrHex, 16) & 0xFFFFFF, mode };
}

function sortBlockKeys(blockKeys) {
  return [...blockKeys].sort((left, right) => {
    const a = parseKey(left);
    const b = parseKey(right);
    return a.addr - b.addr || String(a.mode).localeCompare(String(b.mode));
  });
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) return;
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
      mode,
    };
  }
}

function formatInstruction(inst) {
  if (!inst) return 'unknown';
  switch (inst.tag) {
    case 'db': return `DB ${hexByte(inst.value)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': case 'reti': case 'retn': case 'halt': case 'di': case 'ei': case 'nop':
      return inst.tag.toUpperCase();
    case 'ret-conditional': return `RET ${inst.condition}`;
    case 'rst': return `RST ${hexByte(inst.target ?? inst.vector ?? 0)}`;
    case 'push': return `PUSH ${(inst.pair ?? '??').toUpperCase()}`;
    case 'pop': return `POP ${(inst.pair ?? '??').toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem': return `LD ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${inst.pair}`
        : `LD ${inst.pair}, (${hex(inst.addr)})`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    case 'sbc-pair': return `SBC HL, ${inst.src}`;
    case 'adc-pair': return `ADC HL, ${inst.src}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${inst.indirectRegister})`;
    case 'inc-reg': return `INC ${(inst.reg ?? '??').toUpperCase()}`;
    case 'dec-reg': return `DEC ${(inst.reg ?? '??').toUpperCase()}`;
    case 'out0': return `OUT0 (${hexByte(inst.port)}), ${(inst.reg ?? 'A').toUpperCase()}`;
    case 'in0': return `IN0 ${(inst.reg ?? 'A').toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out-imm': return `OUT (${hexByte(inst.port)}), A`;
    case 'in-imm': return `IN A, (${hexByte(inst.port)})`;
    default: return inst.tag ?? 'unknown';
  }
}

// --- Disassembly ---

function disassembleRange(memory, start, end, mode = MODE) {
  const lines = [];
  let pc = start;
  while (pc < end) {
    const inst = safeDecode(memory, pc, mode);
    const size = Math.max(inst.length ?? 1, 1);
    lines.push({
      addr: pc,
      rawBytes: bytesToHex(memory, pc, size),
      mnemonic: formatInstruction(inst),
      tag: inst.tag,
      size,
    });
    pc += size;
  }
  return lines;
}

function printDisassembly(title, lines) {
  console.log(`=== ${title} ===`);
  for (const line of lines) {
    const marker = line.addr === HALT_ENTRY ? '  <-- HALT ENTRY (DI+HALT sequence starts here)'
      : line.tag === 'halt' ? '  <-- HALT OPCODE'
      : line.tag === 'di' && line.addr >= HALT_ENTRY ? '  <-- DI (interrupts off)'
      : '';
    console.log(
      `  ${hex(line.addr)}: ${line.rawBytes.padEnd(18)} ${line.mnemonic}${marker}`,
    );
  }
  console.log('');
}

// --- Boot ---

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    bootStepCount: [phase1, phase2, phase3].reduce((s, r) => s + Number(r.steps ?? 0), 0),
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function seedMemory(mem) {
  for (let i = 0; i < FLASH_SEED_BYTES.length; i += 1) {
    mem[FLASH_SEED_ADDR + i] = FLASH_SEED_BYTES[i];
  }
  mem[SYSFLAG_ADDR] = 0x00;
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = EVENT_RESET_SP;
  mem.fill(0xFF, EVENT_RESET_SP, EVENT_RESET_SP + 12);
}

// --- Traced event loop run ---

function runEventLoopWithTrace(blocks, romBytes, bootState, timerInterrupt) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  prepareEventLoop(cpu, executor, mem, bootState);
  seedMemory(mem);

  const uniqueBlocks = new Set();
  const recentBlocks = [];
  const RECENT_LIMIT = 50;
  let haltReached = false;
  let haltStep = null;
  let haltCallChain = [];
  let spAtHalt = null;

  const haltEntryKey = makeKey(HALT_ENTRY, MODE);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const blockKey = makeKey(pc, mode);
      uniqueBlocks.add(blockKey);

      recentBlocks.push({ pc, mode, step, blockKey });
      if (recentBlocks.length > RECENT_LIMIT) {
        recentBlocks.shift();
      }

      if (blockKey === haltEntryKey && !haltReached) {
        haltReached = true;
        haltStep = step;
        spAtHalt = cpu.sp;
        haltCallChain = [...recentBlocks];
      }
    },
  });

  return {
    timerInterrupt,
    result,
    uniqueBlocks,
    haltReached,
    haltStep,
    haltCallChain,
    spAtHalt,
    cpuFinal: snapshotCpu(cpu),
    mem,
  };
}

// --- Stack decode ---

function decodeStack(mem, sp, entries) {
  const result = [];
  for (let i = 0; i < entries; i += 1) {
    const addr = (sp + i * 3) & 0xFFFFFF;
    if (addr + 2 >= mem.length) break;
    const value = mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
    result.push({ stackAddr: addr, value });
  }
  return result;
}

// --- Main ---

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }
  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default
    ?? romModule,
  );

  if (!blocks || Object.keys(blocks).length === 0) {
    throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  console.log('=== PROBE: PHASE 378 — HALT AT 0x0019B5 ===');
  console.log(`target: ${hex(HALT_ENTRY)} (DI+HALT dead stop investigation)`);
  console.log(`key injection: scancode=${hexByte(INJECTED_SCAN_CODE)}`);
  console.log(`event loop budget: maxSteps=${count(EVENT_OPTS.maxSteps)}`);
  console.log('');

  // -------------------------------------------------------
  // 1. Static disassembly of 0x001990 - 0x0019E0
  // -------------------------------------------------------

  const fullDisasm = disassembleRange(romBytes, DISASM_RANGE_START, DISASM_RANGE_END, MODE);
  printDisassembly(`STATIC DISASSEMBLY ${hex(DISASM_RANGE_START)}-${hex(DISASM_RANGE_END)} (ADL mode)`, fullDisasm);

  // -------------------------------------------------------
  // 5. Wake path: 0x0019BE onwards (after the HALT opcode)
  // -------------------------------------------------------

  const wakeDisasm = disassembleRange(romBytes, WAKE_PATH_START, DISASM_RANGE_END, MODE);
  printDisassembly(`WAKE PATH ${hex(WAKE_PATH_START)}-${hex(DISASM_RANGE_END)} (what runs after NMI wakes CPU)`, wakeDisasm);

  // -------------------------------------------------------
  // Boot phases
  // -------------------------------------------------------

  console.log('=== BOOT PHASES ===');
  const bootState = runBootPhases(blocks, romBytes);
  for (const phase of bootState.phaseResults) {
    console.log(
      `  ${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log(`  Boot total: ${count(bootState.bootStepCount)} steps`);
  console.log('');

  // -------------------------------------------------------
  // 3. Timer-enabled test
  // -------------------------------------------------------

  console.log('=== TEST: timerInterrupt=true ===');
  const timerOn = runEventLoopWithTrace(blocks, romBytes, bootState, true);
  console.log(`  termination: ${timerOn.result.termination}`);
  console.log(`  steps: ${count(timerOn.result.steps)}`);
  console.log(`  lastPc: ${hex(timerOn.result.lastPc)}`);
  console.log(`  unique_blocks: ${count(timerOn.uniqueBlocks.size)}`);
  console.log(`  halt_entry_reached: ${yesNo(timerOn.haltReached)}`);
  console.log(`  halt_step: ${timerOn.haltStep !== null ? count(timerOn.haltStep) : 'n/a'}`);
  console.log(`  cpu.halted: ${yesNo(timerOn.cpuFinal.halted)}`);
  console.log(`  cpu.iff1: ${timerOn.cpuFinal.iff1}  cpu.iff2: ${timerOn.cpuFinal.iff2}`);
  console.log('');

  // -------------------------------------------------------
  // 4. Timer-disabled test
  // -------------------------------------------------------

  console.log('=== TEST: timerInterrupt=false ===');
  const timerOff = runEventLoopWithTrace(blocks, romBytes, bootState, false);
  console.log(`  termination: ${timerOff.result.termination}`);
  console.log(`  steps: ${count(timerOff.result.steps)}`);
  console.log(`  lastPc: ${hex(timerOff.result.lastPc)}`);
  console.log(`  unique_blocks: ${count(timerOff.uniqueBlocks.size)}`);
  console.log(`  halt_entry_reached: ${yesNo(timerOff.haltReached)}`);
  console.log(`  halt_step: ${timerOff.haltStep !== null ? count(timerOff.haltStep) : 'n/a'}`);
  console.log(`  cpu.halted: ${yesNo(timerOff.cpuFinal.halted)}`);
  console.log(`  cpu.iff1: ${timerOff.cpuFinal.iff1}  cpu.iff2: ${timerOff.cpuFinal.iff2}`);
  console.log('');

  // -------------------------------------------------------
  // 2. Call chain leading to 0x0019B5
  // -------------------------------------------------------

  const primary = timerOff.haltReached ? timerOff : timerOn;
  const chain = primary.haltCallChain;

  console.log('=== CALL CHAIN LEADING TO 0x0019B5 ===');
  if (chain.length > 0) {
    console.log(`  Last ${chain.length} blocks before ${hex(HALT_ENTRY)} (timerInterrupt=${primary.timerInterrupt}):`);
    const startIdx = Math.max(0, chain.length - 30);
    for (let i = startIdx; i < chain.length; i += 1) {
      const t = chain[i];
      const inst = safeDecode(primary.mem, t.pc, t.mode);
      const rawBytes = bytesToHex(primary.mem, t.pc, Math.max(inst.length ?? 1, 1));
      const marker = t.pc === HALT_ENTRY ? '  <-- TARGET' : '';
      console.log(
        `    step ${String(t.step).padStart(7)}: ${hex(t.pc)}  ${rawBytes.padEnd(18)} ${formatInstruction(inst)}${marker}`,
      );
    }
    console.log('');

    // Stack at time of halt
    const sp = primary.spAtHalt;
    if (sp !== null) {
      console.log(`=== STACK AT HALT (SP=${hex(sp)}) ===`);
      const stackEntries = decodeStack(primary.mem, sp, 8);
      for (const entry of stackEntries) {
        const inRom = entry.value < 0x400000;
        let annotation = '';
        if (inRom) {
          const decoded = safeDecode(romBytes, entry.value, MODE);
          annotation = ` -> ROM ${hex(entry.value)}: ${formatInstruction(decoded)}`;
        } else {
          annotation = ` -> RAM`;
        }
        console.log(`    ${hex(entry.stackAddr)}: ${hex(entry.value)}${annotation}`);
      }
      console.log('');
    }
  } else {
    console.log(`  ${hex(HALT_ENTRY)} was NOT reached during either test.`);
    console.log('');
  }

  // -------------------------------------------------------
  // VERDICT
  // -------------------------------------------------------

  console.log('=== VERDICT ===');
  const bothReached = timerOn.haltReached && timerOff.haltReached;
  const neitherReached = !timerOn.haltReached && !timerOff.haltReached;
  const timerOnHalted = timerOn.cpuFinal.halted;
  const timerOffHalted = timerOff.cpuFinal.halted;

  console.log(`  timer_enabled:  halt_entry=${yesNo(timerOn.haltReached)}  cpu_halted=${yesNo(timerOnHalted)}  iff1=${timerOn.cpuFinal.iff1}  lastPc=${hex(timerOn.result.lastPc)}`);
  console.log(`  timer_disabled: halt_entry=${yesNo(timerOff.haltReached)}  cpu_halted=${yesNo(timerOffHalted)}  iff1=${timerOff.cpuFinal.iff1}  lastPc=${hex(timerOff.result.lastPc)}`);
  console.log('');

  if (bothReached && timerOnHalted && timerOffHalted) {
    console.log('  VERDICT: DI+HALT dead stop — timer cannot help.');
    console.log('  0x0019B5 executes DI then HALT. With interrupts disabled, no maskable');
    console.log('  interrupt (including timer) can wake the CPU. This is OS power-down/sleep.');
    console.log('  Only NMI (ON button) or RESET can wake execution.');
    console.log('  The wake path at 0x0019BE shows what the OS does after NMI wakeup.');
  } else if (neitherReached) {
    console.log('  VERDICT: 0x0019B5 was NOT reached — execution stopped before the halt entry.');
    console.log('  The key dispatch path terminated or looped before reaching DI+HALT.');
  } else if (bothReached) {
    console.log('  VERDICT: Both reached 0x0019B5 but CPU halt state differs — check trace.');
  } else {
    console.log('  VERDICT: Unexpected — only one scenario reached 0x0019B5. Check trace above.');
  }

  console.log('');
  console.log('=== END PROBE ===');
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
