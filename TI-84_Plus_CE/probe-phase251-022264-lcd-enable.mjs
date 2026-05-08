#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.dirname(__dirname);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const TARGET_CALLER = 0x022264;
const TARGET_ENABLE = 0x05523D;
const TARGET_LCD_INIT = 0x055743;

const TRACE_STACK = 0xD1A860;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const TRACE_TRANSFER_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC3, 'JP'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
]);

if (!existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const rom = readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${String(indexRegister).toUpperCase()}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind':
      return `${prefix}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind':
      return `${prefix}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'inc-reg':
      return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'lea':
      return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'xor-reg':
      return `${prefix}XOR ${String(inst.src).toUpperCase()}`;
    case 'xor-imm':
      return `${prefix}XOR ${hexByte(inst.value)}`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'nop':
      return `${prefix}NOP`;
    case 'halt':
      return `${prefix}HALT`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    default: {
      let text = `[${inst.tag}]`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      return `${prefix}${text}`;
    }
  }
}

function decodeSafe(pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc & 0xFFFFFF, mode);
  } catch {
    return null;
  }
}

function summarizeBlock(meta, pc, mode) {
  if (meta?.instructions?.length) {
    const text = meta.instructions.map((instruction) => instruction.dasm).join(' | ');
    return text.length > 180 ? `${text.slice(0, 177)}...` : text;
  }
  const inst = decodeSafe(pc, mode);
  return inst ? formatInstruction(inst) : '(decode error)';
}

function scanTransferSites(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const sites = [];

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const kind = TRACE_TRANSFER_OPS.get(rom[addr]);
    if (!kind) continue;
    if (rom[addr + 1] !== lo || rom[addr + 2] !== mid || rom[addr + 3] !== hi) continue;

    const inst = decodeSafe(addr, 'adl');
    sites.push({
      addr,
      bytes: bytesAt(rom, addr, 4),
      kind,
      text: inst ? formatInstruction(inst) : kind,
    });
  }

  return sites.sort((a, b) => a.addr - b.addr);
}

async function loadBlocks() {
  if (!existsSync(TRANSPILED_PATH)) {
    const { execSync } = await import('node:child_process');
    execSync('node scripts/transpile-ti84-rom.mjs', {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  }

  const moduleUrl = pathToFileURL(TRANSPILED_PATH).href;
  const mod = await import(moduleUrl);
  const rawBlocks =
    mod.PRELIFTED_BLOCKS ??
    mod.default?.PRELIFTED_BLOCKS ??
    mod.default ??
    mod;
  const blocks = normalizeBlocks(rawBlocks);

  if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
    throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
  }

  return blocks;
}

function createCPU(blocks) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const mem = new Uint8Array(MEM_SIZE);
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.executor = executor;
  return cpu;
}

function seedTraceState(cpu, startPc, stackTop = TRACE_STACK) {
  const mem = cpu.mem;
  mem.set(rom.subarray(0, Math.min(rom.length, mem.length)));

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.hl = 0;
  cpu.a = 0;
  cpu.f = 0x40;
  cpu.sp = stackTop & 0xFFFFFF;
  cpu.pc = startPc & 0xFFFFFF;

  const fillStart = Math.max(0, cpu.sp - 0x80);
  const fillEnd = Math.min(mem.length, cpu.sp + 0x40);
  mem.fill(0xFF, fillStart, fillEnd);
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function traceFrom(blocks, startPc, stepBudget) {
  const cpu = createCPU(blocks);
  const executor = cpu.executor;
  seedTraceState(cpu, startPc, TRACE_STACK);

  const visits = [];
  let result = null;
  let termination = 'max_steps';
  let errorMessage = null;
  let stopPc = null;

  try {
    result = executor.runFrom(startPc, 'adl', {
      maxSteps: stepBudget,
      maxLoopIterations: stepBudget + 8,
      onBlock(pc, mode, meta, step) {
        const addr = pc & 0xFFFFFF;
        visits.push({
          step,
          pc: addr,
          mode,
          summary: summarizeBlock(meta, addr, mode),
        });
      },
      onMissingBlock(pc, mode, step) {
        const addr = pc & 0xFFFFFF;
        if (addr === RETURN_SENTINEL) {
          const stop = new Error('__RETURN_SENTINEL__');
          stop.traceStop = true;
          stop.tracePc = addr;
          throw stop;
        }
        visits.push({
          step,
          pc: addr,
          mode,
          summary: '(missing block)',
          missing: true,
        });
      },
    });
    termination = result?.termination ?? termination;
    stopPc = result?.lastPc ?? null;
  } catch (error) {
    if (error?.traceStop) {
      termination = 'return_sentinel';
      stopPc = error.tracePc ?? RETURN_SENTINEL;
    } else {
      termination = 'exception';
      errorMessage = error?.message ?? String(error);
      stopPc = cpu.pc ?? null;
    }
  }

  return {
    startPc,
    budget: stepBudget,
    termination,
    errorMessage,
    stopPc,
    visits,
    executorSteps: result?.steps ?? visits.length,
    loopsForced: result?.loopsForced ?? 0,
    dynamicTargets: result?.dynamicTargets ?? [],
    missingBlocks: result?.missingBlocks ?? [],
  };
}

function printCallerSites(title, target, sites) {
  console.log(`\n=== ${title} (${hex(target)}) ===`);
  console.log(`sites=${sites.length}`);
  if (!sites.length) {
    console.log('  none');
    return;
  }
  for (const site of sites) {
    console.log(`  ${hex(site.addr)}  ${site.bytes.padEnd(11)}  ${site.text}`);
  }
}

function printTrace(title, trace) {
  console.log(`\n=== ${title} (${hex(trace.startPc)}) ===`);
  console.log(
    `budget=${trace.budget} visited=${trace.visits.length} executorSteps=${trace.executorSteps} ` +
    `termination=${trace.termination} stopPc=${hex(trace.stopPc)} loopsForced=${trace.loopsForced}`,
  );

  if (trace.errorMessage) {
    console.log(`error=${trace.errorMessage}`);
  }

  if (trace.dynamicTargets.length) {
    console.log(`dynamicTargets=${trace.dynamicTargets.map((target) => hex(target)).join(', ')}`);
  }

  if (trace.missingBlocks.length) {
    console.log(`missingBlocks=${trace.missingBlocks.join(', ')}`);
  }

  for (const visit of trace.visits) {
    const suffix = visit.missing ? ' [missing]' : '';
    console.log(
      `  [${String(visit.step).padStart(3, '0')}] ${hex(visit.pc)}:${visit.mode} ${visit.summary}${suffix}`,
    );
  }

  if (trace.termination === 'return_sentinel') {
    console.log(`  -> returned to ${hex(RETURN_SENTINEL)}`);
  }
}

async function main() {
  const blocks = await loadBlocks();
  const callers022264 = scanTransferSites(TARGET_CALLER);
  const callers05523d = scanTransferSites(TARGET_ENABLE);
  const trace022264 = traceFrom(blocks, TARGET_CALLER, 200);
  const trace055743 = traceFrom(blocks, TARGET_LCD_INIT, 100);

  console.log('Phase 251 probe: 0x022264 call chain / LCD write-enable path');
  console.log(`ROM bytes=${rom.length} blocks=${Object.keys(blocks).length}`);
  console.log(`traceStack=${hex(TRACE_STACK)} returnSentinel=${hex(RETURN_SENTINEL)}`);

  printCallerSites('Callers of 0x022264', TARGET_CALLER, callers022264);
  printCallerSites('Callers of 0x05523D', TARGET_ENABLE, callers05523d);
  printTrace('Block trace from 0x022264', trace022264);
  printTrace('Block trace from 0x055743', trace055743);
}

await main();
