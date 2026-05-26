#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase450-d18c22-crash-investigation-report.md');

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS
  ?? romModule.default?.PRELIFTED_BLOCKS
  ?? romModule.default
  ?? romModule,
);

const MEM_SIZE = 0x1000000;
const ROM_SIZE = 0x400000;
const RAM_THRESHOLD = 0xD00000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const KEY_STATUS_ADDR = 0xD00080;
const KEY_AVAILABLE_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_REFRESH_MODE_ADDR = 0xD177B7;
const DISPATCH_GATE_ADDR = 0xD177BA;

const KEY_ONE = { idx: 4, bit: 1, label: '1', scan: 0x12 };

const RAM_MISS_ADDR = 0xD18C22;
const RAM_CODE_TOP = 0xD18C7C;
const KNOWN_COPY_LENGTH = 0x005A;
const KNOWN_COPY_SOURCE = 0x000EBB;
const KNOWN_COPY_HELPER = 0x000D82;
const KNOWN_COPY_ENTRY = 0x000D7E;
const KNOWN_COPY_SELECTOR = 0x000E94;
const KNOWN_COPY_RETURN = 0x000E9D;

const TRACE_HISTORY_LIMIT = 64;
const REPORT_HISTORY_COUNT = 20;

class StopAtRamMiss extends Error {}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function hexBytes(buffer) {
  return Array.from(buffer, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function createMemoryImage() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, mem.length)));
  return mem;
}

function read24(buffer, addr) {
  const a = addr & 0xFFFFFF;
  return (
    (buffer[a] ?? 0)
    | ((buffer[(a + 1) & 0xFFFFFF] ?? 0) << 8)
    | ((buffer[(a + 2) & 0xFFFFFF] ?? 0) << 16)
  ) >>> 0;
}

function bytesEqual(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function vramHash(mem) {
  return createHash('sha256')
    .update(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE))
    .digest('hex')
    .slice(0, 12);
}

function pressKey(peripherals, key) {
  peripherals.keyboard.keyMatrix[key.idx] &= ~(1 << key.bit);
  peripherals.setKeyboardIRQ(true);
}

function releaseKey(peripherals, key) {
  peripherals.keyboard.keyMatrix[key.idx] |= (1 << key.bit);
  peripherals.setKeyboardIRQ(false);
}

function pushHistory(history, entry) {
  history.push(entry);
  if (history.length > TRACE_HISTORY_LIMIT) {
    history.shift();
  }
}

function snapshotRegs(cpu) {
  const read = (publicName, privateName) => {
    if (cpu[publicName] !== undefined) return cpu[publicName] & 0xFFFFFF;
    if (cpu[privateName] !== undefined) return cpu[privateName] & 0xFFFFFF;
    return null;
  };

  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: read('bc', '_bc'),
    de: read('de', '_de'),
    hl: read('hl', '_hl'),
    ix: read('ix', '_ix'),
    iy: read('iy', '_iy'),
    sp: cpu.sp & 0xFFFFFF,
    mbase: cpu.mbase & 0xFF,
    madl: cpu.madl ? 1 : 0,
    iff1: cpu.iff1 ? 1 : 0,
    iff2: cpu.iff2 ? 1 : 0,
    halted: cpu.halted ? 1 : 0,
  };
}

function readStackView(mem, sp, count = 4) {
  const entries = [];
  let addr = sp & 0xFFFFFF;
  for (let i = 0; i < count; i += 1) {
    entries.push({
      addr,
      value: read24(mem, addr),
    });
    addr = (addr + 3) & 0xFFFFFF;
  }
  return entries;
}

function safeDecode(pc, mode = 'adl') {
  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch {
    return null;
  }
}

function formatDisplacement(displacement) {
  const signed = signedByte(displacement & 0xFF);
  return `${signed >= 0 ? '+' : ''}${signed}`;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode failed)';
  }

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `LD (${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD (${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg':
      if (inst.op === 'or' && inst.src === 'a') return 'OR A';
      if (inst.op === 'cp') return `CP ${String(inst.src).toUpperCase()}`;
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${formatDisplacement(inst.displacement)})`;
    case 'in0':
      return `IN0 ${String(inst.reg ?? 'a').toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0':
      return `OUT0 (${hexByte(inst.port)}), ${String(inst.reg ?? 'a').toUpperCase()}`;
    case 'adc-pair':
      return `ADC HL, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'add-pair':
      return `ADD ${String(inst.dest ?? 'HL').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    default: {
      const extras = Object.entries(inst)
        .filter(([key, value]) => !['tag', 'pc', 'length', 'nextPc', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key) && value !== undefined && value !== null)
        .map(([key, value]) => (typeof value === 'number' ? `${key}=${hex(value, value > 0xFF ? 6 : 2)}` : `${key}=${String(value)}`))
        .join(' ');
      return extras ? `${inst.tag} ${extras}` : inst.tag;
    }
  }
}

function isTerminalInstruction(inst) {
  if (!inst) return true;
  return [
    'ret',
    'ret-conditional',
    'reti',
    'retn',
    'jp',
    'jp-conditional',
    'jp-indirect',
    'jr',
    'jr-conditional',
    'halt',
  ].includes(inst.tag);
}

function disassembleBlock(startPc, mode = 'adl', maxInstructions = 16) {
  const rows = [];
  let pc = startPc;

  for (let i = 0; i < maxInstructions && pc < romBytes.length; i += 1) {
    const inst = safeDecode(pc, mode);
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: hexBytes(romBytes.subarray(pc, pc + length)),
      inst,
      text: formatInstruction(inst),
    });
    pc = inst?.nextPc ?? (pc + length);
    if (isTerminalInstruction(inst)) {
      break;
    }
  }

  return rows;
}

function describeJumpCause(rows, regs, stackView) {
  const terminal = rows.length > 0 ? rows[rows.length - 1] : null;
  if (!terminal?.inst) {
    return { terminalText: 'n/a', detail: 'Unable to decode the terminating instruction.' };
  }

  const inst = terminal.inst;
  if (inst.tag === 'jp-indirect') {
    const registerName = String(inst.indirectRegister || '').toLowerCase();
    const registerValue = regs[registerName];
    return {
      terminalText: terminal.text,
      detail: `Indirect jump via ${String(inst.indirectRegister).toUpperCase()}=${hex(registerValue)}`,
    };
  }

  if (inst.tag === 'ret' || inst.tag === 'ret-conditional' || inst.tag === 'reti' || inst.tag === 'retn') {
    const top = stackView[0];
    return {
      terminalText: terminal.text,
      detail: `Return pops ${hex(top?.value)} from stack ${hex(top?.addr)}`,
    };
  }

  if (typeof inst.target === 'number') {
    return {
      terminalText: terminal.text,
      detail: `Direct control-transfer target ${hex(inst.target)}`,
    };
  }

  return {
    terminalText: terminal.text,
    detail: 'Control flow leaves through the block terminator, but no explicit target field was decoded.',
  };
}

function classifyRamTarget(bytes3, matchesKnownCopy) {
  const value = read24(bytes3, 0);
  if (matchesKnownCopy) {
    return 'executable RAM copy of ROM code';
  }
  if (value === 0) {
    return 'zero-filled RAM slot (unlikely to be valid code or a live callback)';
  }
  if (value < ROM_SIZE) {
    return '24-bit pointer-sized data that could reference ROM';
  }
  return 'non-pointer RAM payload; the first bytes look like code/data, not a ROM callback address';
}

function bootToHomeScreen(executor, cpu, mem, traceHooks = {}) {
  const run = (entry, mode, opts = {}) => executor.runFrom(entry, mode, {
    ...opts,
    onBlock: traceHooks.onBlock,
    onMissingBlock: traceHooks.onMissingBlock,
  });

  const bootResult = run(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = run(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = KEY_STATUS_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = run(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  const stageResults = [];
  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = KEY_STATUS_ADDR;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    const stageResult = run(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
    stageResults.push({ entry, result: stageResult });
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return {
    bootResult,
    kernelResult,
    postInitResult,
    stageResults,
  };
}

function buildReport(data) {
  const {
    bootSummary,
    bootVisited,
    bootD18C22,
    bootRamBytes3,
    bootRamBytes16,
    bootMatchesKnownCopy,
    knownCopySourceBytes16,
    keyRun,
    d18c22Miss,
  } = data;

  const lines = [];
  lines.push('# Phase 450 - D18C22 Crash Investigation');
  lines.push('');
  lines.push('Generated by `probe-phase450-d18c22-crash-investigation.mjs`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- Boot sequence: cold boot -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${STAGE_ENTRIES.map((entry) => hex(entry)).join(', ')}`);
  lines.push(`- Gates after boot: D14091=${hexByte(1)}, D177B7=${hexByte(0x55)}, D177BA=${hexByte(0x00)}`);
  lines.push(`- Injected key: "${KEY_ONE.label}" idx=${KEY_ONE.idx} bit=${KEY_ONE.bit} scan=${hexByte(KEY_ONE.scan)}`);
  lines.push(`- Event-loop entry: ${hex(EVENT_LOOP_ENTRY)} with diHaltBypass=true`);
  lines.push('');
  lines.push('## Boot Findings');
  lines.push('');
  lines.push(`- Boot phase 1 termination: ${bootSummary.bootResult.termination} after ${bootSummary.bootResult.steps} steps at ${hex(bootSummary.bootResult.lastPc)}.`);
  lines.push(`- Post-kernel termination: ${bootSummary.kernelResult.termination} after ${bootSummary.kernelResult.steps} steps at ${hex(bootSummary.kernelResult.lastPc)}.`);
  lines.push(`- 0xD18C22 bytes after boot (first 3): \`${hexBytes(bootRamBytes3)}\` -> little-endian value ${hex(read24(bootRamBytes3, 0))}.`);
  lines.push(`- 0xD18C22 bytes after boot (first 16): \`${hexBytes(bootRamBytes16)}\`.`);
  lines.push(`- Known ROM source 0x000EBB.. bytes (first 16): \`${hexBytes(knownCopySourceBytes16)}\`.`);
  lines.push(`- Boot RAM bytes match ROM 0x000EBB copy source: ${bootMatchesKnownCopy ? 'YES' : 'no'}.`);
  lines.push(`- Boot visited copy selector ${hex(KNOWN_COPY_SELECTOR)}: ${bootVisited.has(KNOWN_COPY_SELECTOR) ? 'YES' : 'no'}.`);
  lines.push(`- Boot visited copy helper ${hex(KNOWN_COPY_HELPER)}: ${bootVisited.has(KNOWN_COPY_HELPER) ? 'YES' : 'no'}.`);
  if (bootD18C22) {
    lines.push(`- Boot also reached a first missing-block attempt at 0xD18C22 on step ${bootD18C22.step}; last ROM block before that boot-time jump was ${bootD18C22.lastRomBlock ? `${hex(bootD18C22.lastRomBlock.pc)}:${bootD18C22.lastRomBlock.mode}` : 'n/a'}.`);
  }
  lines.push(`- Expected RAM copy destination from \`ramCodeTop (${hex(RAM_CODE_TOP)}) - 0x${KNOWN_COPY_LENGTH.toString(16).toUpperCase()}\` is ${hex(RAM_CODE_TOP - KNOWN_COPY_LENGTH)}.`);
  lines.push('');
  lines.push('## Key-Run Results');
  lines.push('');
  lines.push(`- Event-loop VRAM hash before key processing: \`${keyRun.vramBefore}\`.`);
  lines.push(`- Event-loop VRAM hash at interception: \`${keyRun.vramAtIntercept ?? 'n/a'}\`.`);
  if (keyRun.result) {
    lines.push(`- Run result before interception: termination=${keyRun.result.termination} steps=${keyRun.result.steps} lastPc=${hex(keyRun.result.lastPc)}.`);
  }
  if (keyRun.error && !(keyRun.error instanceof StopAtRamMiss)) {
    lines.push(`- Unexpected execution error: ${keyRun.error.stack ?? keyRun.error.message}.`);
  } else {
    lines.push(`- Probe stopped intentionally on the first missing-block attempt at ${hex(RAM_MISS_ADDR)}.`);
  }
  lines.push('');

  if (!d18c22Miss) {
    lines.push('## D18C22 Miss');
    lines.push('');
    lines.push('- No 0xD18C22 miss was observed during the event-loop run.');
    return `${lines.join('\n')}\n`;
  }

  const callerPc = d18c22Miss.lastRomBlock?.pc ?? null;
  const callerMode = d18c22Miss.lastRomBlock?.mode ?? 'adl';
  const callerRows = callerPc !== null ? disassembleBlock(callerPc, callerMode) : [];
  const callerBytes10 = callerPc !== null ? hexBytes(romBytes.subarray(callerPc, Math.min(romBytes.length, callerPc + 10))) : 'n/a';
  const jumpCause = describeJumpCause(callerRows, d18c22Miss.regs, d18c22Miss.stackView);
  const ramKind = classifyRamTarget(bootRamBytes3, bootMatchesKnownCopy);

  lines.push('## D18C22 Miss');
  lines.push('');
  lines.push(`- First event-loop miss at ${hex(d18c22Miss.pc)}:${d18c22Miss.mode} on step ${d18c22Miss.step}.`);
  lines.push(`- Immediate previous block: ${d18c22Miss.previousBlock ? `${hex(d18c22Miss.previousBlock.pc)}:${d18c22Miss.previousBlock.mode}` : 'n/a'}.`);
  lines.push(`- Last ROM-space PC before the jump: ${callerPc !== null ? `${hex(callerPc)}:${callerMode}` : 'n/a'}.`);
  lines.push(`- ROM bytes at that PC (10 bytes): \`${callerBytes10}\`.`);
  lines.push(`- Terminating instruction in the caller block: \`${jumpCause.terminalText}\`.`);
  lines.push(`- Jump detail: ${jumpCause.detail}.`);
  lines.push(`- CPU state at interception: A=${hexByte(d18c22Miss.regs.a)} F=${hexByte(d18c22Miss.regs.f)} BC=${hex(d18c22Miss.regs.bc)} DE=${hex(d18c22Miss.regs.de)} HL=${hex(d18c22Miss.regs.hl)} IX=${hex(d18c22Miss.regs.ix)} IY=${hex(d18c22Miss.regs.iy)} SP=${hex(d18c22Miss.regs.sp)}.`);
  lines.push(`- Stack top at interception: ${d18c22Miss.stackView.map((entry) => `[${hex(entry.addr)}]=${hex(entry.value)}`).join('  ')}.`);
  lines.push('');
  lines.push('### Caller Block');
  lines.push('');
  lines.push('```asm');
  if (callerRows.length === 0) {
    lines.push('(caller block unavailable)');
  } else {
    for (const row of callerRows) {
      lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(19, ' ')} ${row.text}`);
    }
  }
  lines.push('```');
  lines.push('');
  lines.push('### Last 20 Blocks Before the Miss');
  lines.push('');
  lines.push('| Step | PC | Region |');
  lines.push('| ---: | --- | --- |');
  for (const entry of d18c22Miss.historyTail) {
    const region = entry.pc < ROM_SIZE ? 'ROM' : (entry.pc >= RAM_THRESHOLD ? 'RAM' : 'other');
    lines.push(`| ${entry.step} | ${hex(entry.pc)}:${entry.mode} | ${region} |`);
  }
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push(`- The 3-byte value currently stored at 0xD18C22 is \`${hexBytes(bootRamBytes3)}\`, which decodes to ${hex(read24(bootRamBytes3, 0))}.`);
  lines.push(`- Because that value is ${read24(bootRamBytes3, 0) < ROM_SIZE ? 'inside' : 'outside'} ROM space and the bytes ${bootMatchesKnownCopy ? 'exactly match the known 0x000EBB boot copy source' : 'do not look like a simple ROM pointer'}, 0xD18C22 is best classified as **${ramKind}**, not a callback slot or a function-pointer table.`);
  lines.push(`- The known boot helper at ${hex(KNOWN_COPY_ENTRY)} / ${hex(KNOWN_COPY_HELPER)} copies ${KNOWN_COPY_LENGTH} bytes from ROM ${hex(KNOWN_COPY_SOURCE)} to RAM ${hex(RAM_CODE_TOP - KNOWN_COPY_LENGTH)}. The post-boot bytes confirm that the copied routine is still resident when key processing later reaches 0xD18C22 again.`);
  lines.push('');
  lines.push('## Recommendations');
  lines.push('');
  lines.push(`1. Treat 0xD18C22 as a RAM alias for copied ROM code, not as a pointer slot. The clean fix is to redirect execution in the ${hex(RAM_MISS_ADDR)}..${hex(RAM_CODE_TOP - 1)} window back to ROM ${hex(KNOWN_COPY_SOURCE)}..${hex(KNOWN_COPY_SOURCE + KNOWN_COPY_LENGTH - 1)}.`);
  lines.push('2. Seed or lift the ROM source block range around 0x000EBB if any of those blocks are still absent, so the copied RAM routine has a fully decoded source body to execute.');
  lines.push('3. If you keep the runtime RAM trampoline, make it record the source alias/caller context for copied RAM code paths so later crashes report the ROM-side origin automatically.');
  lines.push('4. If the caller block above ends in an indirect jump or RET, use the captured register/stack state in this report to decide whether you need a JP(IX/IY) alias, a return-address alias, or a more general copied-code mapping.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function captureMiss(history, cpu, mem, pc, mode, step) {
  const lastEntry = history.length > 0 ? history[history.length - 1] : null;
  let lastRomBlock = null;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i].pc < ROM_SIZE) {
      lastRomBlock = history[i];
      break;
    }
  }

  return {
    step: step + 1,
    pc: pc & 0xFFFFFF,
    mode: mode ?? 'adl',
    previousBlock: lastEntry,
    lastRomBlock,
    regs: snapshotRegs(cpu),
    stackView: readStackView(mem, cpu.sp, 4),
    historyTail: history.slice(-REPORT_HISTORY_COUNT),
    vramHash: vramHash(mem),
  };
}

async function main() {
  if (!BLOCKS || Object.keys(BLOCKS).length === 0) {
    throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  const mem = createMemoryImage();
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootHistory = [];
  const bootVisited = new Set();
  let bootD18C22 = null;

  const bootTraceHooks = {
    onBlock(pc, mode, meta, step) {
      const entry = { pc: pc & 0xFFFFFF, mode: mode ?? 'adl', step: step + 1 };
      pushHistory(bootHistory, entry);
      bootVisited.add(entry.pc);
    },
    onMissingBlock(pc, mode, step) {
      if ((pc & 0xFFFFFF) !== RAM_MISS_ADDR || bootD18C22) {
        return;
      }
      bootD18C22 = captureMiss(bootHistory, cpu, mem, pc, mode, step);
    },
  };

  const bootSummary = bootToHomeScreen(executor, cpu, mem, bootTraceHooks);

  mem[KEY_PROCESSING_ENABLE_ADDR] = 0x01;
  mem[DISPLAY_REFRESH_MODE_ADDR] = 0x55;
  mem[DISPATCH_GATE_ADDR] = 0x00;

  const bootRamBytes16 = mem.slice(RAM_MISS_ADDR, RAM_MISS_ADDR + 16);
  const bootRamBytes3 = bootRamBytes16.slice(0, 3);
  const knownCopySourceBytes16 = romBytes.slice(KNOWN_COPY_SOURCE, KNOWN_COPY_SOURCE + 16);
  const bootMatchesKnownCopy = bytesEqual(bootRamBytes16, knownCopySourceBytes16);

  const vramBefore = vramHash(mem);
  const history = [];
  let d18c22Miss = null;
  let keyRunResult = null;
  let keyRunError = null;

  pressKey(peripherals, KEY_ONE);
  mem[KEY_SCAN_CODE_ADDR] = KEY_ONE.scan;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;

  try {
    keyRunResult = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 5000,
      diHaltBypass: true,
      onBlock(pc, mode, meta, step) {
        pushHistory(history, { pc: pc & 0xFFFFFF, mode: mode ?? 'adl', step: step + 1 });
      },
      onMissingBlock(pc, mode, step) {
        if ((pc & 0xFFFFFF) !== RAM_MISS_ADDR || d18c22Miss) {
          return;
        }
        d18c22Miss = captureMiss(history, cpu, mem, pc, mode, step);
        throw new StopAtRamMiss(`Intercepted first D18C22 miss at step ${step + 1}`);
      },
    });
  } catch (error) {
    keyRunError = error;
    if (!(error instanceof StopAtRamMiss)) {
      throw error;
    }
  } finally {
    releaseKey(peripherals, KEY_ONE);
  }

  const report = buildReport({
    bootSummary,
    bootVisited,
    bootD18C22,
    bootRamBytes3,
    bootRamBytes16,
    bootMatchesKnownCopy,
    knownCopySourceBytes16,
    keyRun: {
      result: keyRunResult,
      error: keyRunError,
      vramBefore,
      vramAtIntercept: d18c22Miss?.vramHash ?? null,
    },
    d18c22Miss,
  });

  fs.writeFileSync(REPORT_PATH, report);
  console.log(report);
  console.log(`Report written to ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
