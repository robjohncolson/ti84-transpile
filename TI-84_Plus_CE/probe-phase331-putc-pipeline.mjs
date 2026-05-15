#!/usr/bin/env node

/**
 * Phase 331: trace the PutC / DrawText pipeline end to end.
 *
 * What this probe does:
 *   1. Gunzips ROM.transpiled.js.gz and imports PRELIFTED_BLOCKS.
 *   2. Statically recovers the 0x0540D0 caller sites from lifted blocks plus
 *      the public JP vector at 0x021E00 that is not itself lifted.
 *   3. Boots to the home screen path with timer IRQs disabled.
 *   4. Hooks the string wrapper / per-glyph dispatch / DrawChar entry blocks.
 *   5. Records at least the first few glyphs with:
 *        - top-level caller address
 *        - current character byte
 *        - first-char and advance flags
 *        - DrawChar implementation selected by D005E9+3
 *        - first VRAM write and pixel coordinates
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const rom = fs.readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;

const STAGE_ENTRIES = [
  { label: 'status-bar background', entry: 0x0A2B72, maxSteps: 800000 },
  { label: 'status dots', entry: 0x0A3301, maxSteps: 800000 },
  { label: 'home row strip', entry: 0x0A29EC, maxSteps: 800000 },
  { label: 'history area', entry: 0x0A2854, maxSteps: 800000 },
];

const PUTC_DRAW_ADVANCE = 0x0540D0;
const PUTC_DRAW_ONLY = 0x0540F5;
const PUTC_DRAW_INNER = 0x05411A;
const PUTC_DISPATCH = 0x05412B;
const PUTC_GLYPH_DISPATCH = 0x054153;
const PUTC_GLYPH_RETURN = 0x054166;
const PUTC_RETURN = 0x05416F;
const LAZY_INIT = 0x055191;
const INDCALL = 0x00015C;
const JP_IY = 0x002288;

const DRAW_VARWIDTH = 0x054FC6;
const DRAW_FIXEDWIDTH = 0x054E21;

const DESC_PTR_RAM = 0xD005E9;
const PEN_X_ADDR = 0xD008D2;
const PEN_Y_ADDR = 0xD008D5;
const VRAM_STRIDE_ADDR = 0xD02FE0;
const VRAM_BASE_ADDR = 0xD02FE3;
const VRAM_BASE_DEFAULT = 0xD40000;
const VRAM_STRIDE_DEFAULT = 0x0280;

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const VECTOR_NAMES = new Map([
  [0x021E00, '?os.FontDrawText / _PutC'],
  [0x022178, '?os.FontDrawTransText / _PutMap'],
]);

const CALL_OR_JP_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'], [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'], [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'], [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'], [0xFC, 'CALL M'],
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'], [0xCA, 'JP Z'],
  [0xD2, 'JP NC'], [0xDA, 'JP C'],
  [0xE2, 'JP PO'], [0xEA, 'JP PE'],
  [0xF2, 'JP P'], [0xFA, 'JP M'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read8(buffer, addr) {
  return buffer[addr & MEM_MASK] ?? 0;
}

function read16(buffer, addr) {
  const base = addr & MEM_MASK;
  return ((buffer[base] ?? 0) | ((buffer[(base + 1) & MEM_MASK] ?? 0) << 8)) >>> 0;
}

function read24(buffer, addr) {
  const base = addr & MEM_MASK;
  return (
    (buffer[base] ?? 0) |
    ((buffer[(base + 1) & MEM_MASK] ?? 0) << 8) |
    ((buffer[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function charDisplay(code) {
  if (code >= 0x20 && code <= 0x7E) {
    return String.fromCharCode(code);
  }
  if (code === 0x00) return '<NUL>';
  if (code === 0x0A) return '<LF>';
  if (code === 0x0D) return '<CR>';
  return `<${hex(code, 2)}>`;
}

function previewCString(buffer, addr, maxLen = 24) {
  const chars = [];
  for (let i = 0; i < maxLen; i += 1) {
    const value = read8(buffer, addr + i);
    if (value === 0x00) break;
    chars.push(charDisplay(value));
  }
  return chars.join('');
}

function uniquePush(list, value) {
  if (list.length === 0 || list[list.length - 1] !== value) {
    list.push(value);
  }
}

function formatPairInstruction(inst) {
  if (!inst) return 'unresolved';

  if (inst.tag === 'ld-pair-imm') {
    return `literal ${hex(inst.value)}`;
  }
  if (inst.tag === 'ld-pair-indexed') {
    return `caller frame (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
  }
  if (inst.tag === 'ld-pair-mem') {
    return `memory ${hex(inst.addr)}`;
  }
  if (inst.tag === 'ex-de-hl') {
    return 'EX DE,HL result';
  }
  return inst.dasm ?? inst.tag;
}

function regionNameFor(pc) {
  if (pc === 0x021E00) return '?os.FontDrawText / _PutC vector';
  if (pc === 0x022178) return '?os.FontDrawTransText / _PutMap vector';
  if (pc >= 0x023D00 && pc < 0x023F00) return 'status-bar text cluster';
  if (pc >= 0x025500 && pc < 0x025700) return 'home-screen text cluster';
  if (pc >= 0x09ED00 && pc < 0x09EF00) return 'graph/status text cluster';
  return 'unclassified text path';
}

function syntheticFunctionName(pc) {
  if (pc === 0x021E00) return '?os.FontDrawText / _PutC';
  if (pc === 0x022178) return '?os.FontDrawTransText / _PutMap';
  if (pc === 0x023DB6) return 'StatusBarDrawChar (~0x023D9F)';
  if (pc === 0x023DFC) return 'StatusBarLiteralV (~0x023DDA)';
  if (pc === 0x023E0D) return 'StatusBarFollowup (~0x023E00)';
  if (pc === 0x023E44) return 'StatusBarDrawChar2 (~0x023E2D)';
  if (pc === 0x023E75) return 'StatusBarDrawChar3 (~0x023E5E)';
  if (pc === 0x025565) return 'HomeScreenLiteralV (~0x025556)';
  if (pc === 0x025576) return 'HomeScreenFollowup (~0x025569)';
  if (pc === 0x0255E5) return 'HomeScreenCursorOrPrompt (~0x0255D7)';
  if (pc === 0x09ED9F) return 'GraphStatusPutText (~0x09ED7B)';
  return `SyntheticCaller(${hex(pc)})`;
}

function ensureTranspiledModule() {
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing ROM.transpiled.js.gz');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase331-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return tempModulePath;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const tempModulePath = ensureTranspiledModule();
  try {
    const moduleUrl = `${pathToFileURL(tempModulePath).href}?t=${Date.now()}`;
    const romModule = await import(moduleUrl);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    return normalizeBlocks(rawBlocks);
  } finally {
    try {
      fs.unlinkSync(tempModulePath);
    } catch {}
  }
}

function buildInstructionIndex(blocks) {
  const exact = new Map();
  for (const block of Object.values(blocks)) {
    for (let index = 0; index < (block.instructions?.length ?? 0); index += 1) {
      const inst = block.instructions[index];
      exact.set(`${inst.pc.toString(16).padStart(6, '0')}:${inst.mode ?? block.mode ?? 'adl'}`, {
        block,
        index,
        instruction: inst,
      });
    }
  }
  return exact;
}

function findRomTransfers(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const hits = [];

  for (let pc = 0; pc < rom.length - 4; pc += 1) {
    const op = rom[pc];
    if (!CALL_OR_JP_OPS.has(op)) continue;
    if (rom[pc + 1] !== lo || rom[pc + 2] !== mid || rom[pc + 3] !== hi) continue;
    hits.push({ pc, type: CALL_OR_JP_OPS.get(op) });
  }

  return hits;
}

function findLiftedTransfers(target, blocks) {
  const hits = new Map();

  for (const block of Object.values(blocks)) {
    for (const inst of block.instructions ?? []) {
      if (inst.target !== target) continue;
      if (!['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional'].includes(inst.tag)) {
        continue;
      }
      const key = inst.pc.toString(16).padStart(6, '0');
      if (!hits.has(key)) {
        hits.set(key, {
          pc: inst.pc,
          type: inst.dasm?.split(' ')[0]?.toUpperCase() ?? inst.tag.toUpperCase(),
          block,
          instruction: inst,
        });
      }
    }
  }

  return [...hits.values()].sort((a, b) => a.pc - b.pc);
}

function findProducerForPush(block, callIndex, pairName) {
  for (let index = callIndex - 1; index >= 0; index -= 1) {
    const inst = block.instructions[index];
    if (pairName === 'bc') {
      if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') return inst;
      if (inst.tag === 'ld-pair-indexed' && inst.pair === 'bc') return inst;
      if (inst.tag === 'ld-pair-mem' && inst.pair === 'bc') return inst;
      if (inst.tag === 'ld-reg-reg' && ['b', 'c'].includes(inst.dest)) return inst;
      if (inst.tag === 'ld-reg-mem' && ['b', 'c', 'a'].includes(inst.dest)) return inst;
    }
    if (pairName === 'hl') {
      if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') return inst;
      if (inst.tag === 'ld-pair-indexed' && inst.pair === 'hl') return inst;
      if (inst.tag === 'ex-de-hl') return inst;
      if (inst.tag === 'sbc-pair' || inst.tag === 'add-pair') return inst;
    }
  }
  return null;
}

function analyzeCallSite(hit, exactIndex) {
  if (hit.pc === 0x021E00) {
    return {
      pc: hit.pc,
      type: hit.type,
      functionName: syntheticFunctionName(hit.pc),
      region: regionNameFor(hit.pc),
      arg0Source: 'caller ABI arg0 -> string pointer',
      arg1Source: 'caller ABI arg1 -> pen/X',
      arg2Source: 'caller ABI arg2 -> row/Y or attribute byte',
      trigger: 'generic public text API; actual bytes come from caller-supplied string pointer',
      charArrival: '0x05411A: LD HL,(IX+6) -> LD A,(HL) -> INC HL -> store back',
      lifted: false,
    };
  }

  if (hit.pc === 0x022178) {
    return {
      pc: hit.pc,
      type: hit.type,
      functionName: syntheticFunctionName(hit.pc),
      region: regionNameFor(hit.pc),
      arg0Source: 'caller ABI arg0 -> string pointer',
      arg1Source: 'caller ABI arg1 -> pen/X',
      arg2Source: 'caller ABI arg2 -> row/Y or attribute byte',
      trigger: 'draw-only public text API; same byte source, but wrapper pushes advance flag 0',
      charArrival: '0x05411A: LD HL,(IX+6) -> LD A,(HL) -> INC HL -> store back',
      lifted: false,
    };
  }

  const ref = exactIndex.get(`${hit.pc.toString(16).padStart(6, '0')}:adl`);
  if (!ref) {
    return {
      pc: hit.pc,
      type: hit.type,
      functionName: syntheticFunctionName(hit.pc),
      region: regionNameFor(hit.pc),
      arg0Source: 'unresolved',
      arg1Source: 'unresolved',
      arg2Source: 'unresolved',
      trigger: 'unresolved',
      charArrival: '0x05411A: LD HL,(IX+6) -> LD A,(HL) -> INC HL -> store back',
      lifted: true,
    };
  }

  const { block, index } = ref;
  const pushes = [];
  for (let i = 0; i < index; i += 1) {
    const inst = block.instructions[i];
    if (inst.tag === 'push') {
      pushes.push({ index: i, inst });
    }
  }

  const arg0Push = pushes[pushes.length - 1];
  const arg1Push = pushes[pushes.length - 2];
  const arg2Push = pushes[pushes.length - 3];

  const arg0Producer = arg0Push ? findProducerForPush(block, arg0Push.index, 'bc') ?? findProducerForPush(block, arg0Push.index, 'hl') : null;
  const arg1Producer = arg1Push ? findProducerForPush(block, arg1Push.index, 'bc') ?? findProducerForPush(block, arg1Push.index, 'hl') : null;
  const arg2Producer = arg2Push ? findProducerForPush(block, arg2Push.index, 'bc') ?? findProducerForPush(block, arg2Push.index, 'hl') : null;

  let trigger = 'caller-supplied string pointer';
  if (arg0Producer?.tag === 'ld-pair-imm') {
    const ptr = arg0Producer.value & 0xFFFFFF;
    const firstByte = read8(rom, ptr);
    trigger = `literal string/pointer ${hex(ptr)} -> first byte ${charDisplay(firstByte)} preview "${previewCString(rom, ptr, 8)}"`;
  } else if (arg0Producer?.tag === 'ld-pair-indexed') {
    trigger = `indirect string pointer from caller frame (${String(arg0Producer.indexRegister).toUpperCase()}${arg0Producer.displacement >= 0 ? '+' : ''}${arg0Producer.displacement})`;
  }

  return {
    pc: hit.pc,
    type: hit.type,
    functionName: syntheticFunctionName(hit.pc),
    region: regionNameFor(hit.pc),
    arg0Source: formatPairInstruction(arg0Producer),
    arg1Source: formatPairInstruction(arg1Producer),
    arg2Source: formatPairInstruction(arg2Producer),
    trigger,
    charArrival: '0x05411A: LD HL,(IX+6) -> LD A,(HL) -> INC HL -> store back',
    lifted: true,
  };
}

function collectStaticSites(blocks) {
  const exactIndex = buildInstructionIndex(blocks);
  const advanceRomHits = findRomTransfers(PUTC_DRAW_ADVANCE).sort((a, b) => a.pc - b.pc);
  const drawOnlyRomHits = findRomTransfers(PUTC_DRAW_ONLY).sort((a, b) => a.pc - b.pc);
  const innerLiftedHits = findLiftedTransfers(PUTC_DRAW_INNER, blocks);

  const advanceSites = advanceRomHits.map((hit) => analyzeCallSite(hit, exactIndex));
  const drawOnlySites = drawOnlyRomHits.map((hit) => analyzeCallSite(hit, exactIndex));

  return {
    advanceSites,
    drawOnlySites,
    innerLiftedHits,
    liftedAdvanceHits: findLiftedTransfers(PUTC_DRAW_ADVANCE, blocks),
  };
}

function printStaticReport(staticInfo) {
  console.log('=== Phase 331: PutC / DrawText Pipeline ===\n');

  console.log('1) Static caller census\n');
  console.log(`   0x0540D0 lifted CALL sites in PRELIFTED_BLOCKS: ${staticInfo.liftedAdvanceHits.length}`);
  console.log('   Plus one public JP vector at 0x021E00 that is visible in ROM but not lifted as a standalone block.');
  console.log(`   Total entry sites into 0x0540D0: ${staticInfo.advanceSites.length}\n`);

  for (const site of staticInfo.advanceSites) {
    console.log(`   ${hex(site.pc)}  ${site.type.padEnd(7)}  ${site.functionName}`);
    console.log(`     Region:        ${site.region}`);
    console.log(`     arg0 source:   ${site.arg0Source}`);
    console.log(`     arg1 source:   ${site.arg1Source}`);
    console.log(`     arg2 source:   ${site.arg2Source}`);
    console.log(`     Trigger:       ${site.trigger}`);
    console.log(`     Char path:     ${site.charArrival}`);
    console.log('');
  }

  console.log(`   0x0540F5 sibling entry sites: ${staticInfo.drawOnlySites.length}`);
  for (const site of staticInfo.drawOnlySites) {
    console.log(`     ${hex(site.pc)}  ${site.type.padEnd(7)}  ${site.functionName}`);
  }
  console.log('');

  console.log(`   0x05411A direct lifted callers: ${staticInfo.innerLiftedHits.length}`);
  for (const hit of staticInfo.innerLiftedHits) {
    console.log(`     ${hex(hit.pc)}  ${hit.type} -> ${hex(PUTC_DRAW_INNER)}`);
  }
  console.log('');

  console.log('2) Verified wrapper semantics\n');
  console.log('   0x0540D0 / 0x0540F5 do not take a raw character byte directly.');
  console.log('   They pass a string pointer plus X/Y-ish state into 0x05411A.');
  console.log('   0x05411A then does the per-glyph step:');
  console.log(`     ${hex(PUTC_DISPATCH)}: pen X := (IX+9), pen Y := low byte of (IX+12)`);
  console.log('     reads current byte with LD A,(HL)');
  console.log(`     ${hex(PUTC_GLYPH_DISPATCH)}: pushes [advanceFlag, firstCharFlag, charByte]`);
  console.log(`     CALL ${hex(INDCALL)} -> JP ${hex(JP_IY)} -> JP (IY)`);
  console.log(`     DrawChar target comes from D005E9+3, usually ${hex(DRAW_VARWIDTH)} or ${hex(DRAW_FIXEDWIDTH)}\n`);
}

function seedModeBuffers(mem) {
  for (let i = 0; i < MODE_BUF_TEXT.length; i += 1) {
    const code = MODE_BUF_TEXT.charCodeAt(i) & 0x7F;
    mem[(MODE_BUF_START + i) & MEM_MASK] = code;
    mem[(DISPLAY_BUF_START + i) & MEM_MASK] = code;
  }
  mem[(MODE_BUF_START + MODE_BUF_TEXT.length) & MEM_MASK] = 0x00;
  mem[(DISPLAY_BUF_START + MODE_BUF_TEXT.length) & MEM_MASK] = 0x00;
}

function resetCpu(cpu) {
  cpu.a = 0x00;
  cpu.f = 0x00;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x000000;
  cpu.ix = 0x000000;
  cpu.iy = 0x000000;
  cpu.sp = STACK_RESET_TOP;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
}

function bootKernel(executor, mem) {
  const cpu = executor.cpu;
  resetCpu(cpu);

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
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
  cpu.iy = 0xD00080;
  cpu.hl = 0x000000;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  seedModeBuffers(mem);
}

function withHook(executor, key, before, after) {
  const original = executor.compiledBlocks[key];
  if (!original) {
    return false;
  }

  executor.compiledBlocks[key] = function wrappedBlock(cpu) {
    let state;
    if (before) {
      state = before(cpu);
    }
    try {
      return original(cpu);
    } finally {
      if (after) {
        after(cpu, state);
      }
    }
  };

  return true;
}

function currentVramGeometry(mem) {
  const base = read24(mem, VRAM_BASE_ADDR) || VRAM_BASE_DEFAULT;
  const stride = read24(mem, VRAM_STRIDE_ADDR) || VRAM_STRIDE_DEFAULT;
  return { base, stride };
}

function glyphCoordinates(addr, mem) {
  const { base, stride } = currentVramGeometry(mem);
  const pixelAddr = addr & 0xFFFFFE;
  if (pixelAddr < base) return null;
  const delta = pixelAddr - base;
  if (delta < 0) return null;
  return {
    addr: pixelAddr,
    x: Math.floor((delta % stride) / 2),
    y: Math.floor(delta / stride),
  };
}

function mergedChain(context, glyph) {
  const chain = [];
  if (context?.callerPc) chain.push(context.callerPc);
  if (!context?.callerPc && context?.entryVector) chain.push(context.entryVector);
  for (const pc of context?.chain ?? []) uniquePush(chain, pc);
  for (const pc of glyph?.chain ?? []) uniquePush(chain, pc);
  return chain;
}

function printChain(chain, firstVram) {
  const parts = chain.map((pc) => hex(pc));
  if (firstVram) {
    parts.push(`${hex(firstVram.addr)}@(${firstVram.x},${firstVram.y})`);
  }
  return parts.join(' -> ');
}

async function runDynamicTrace(blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  bootKernel(executor, mem);

  const contexts = [];
  const completedContexts = [];
  const glyphEvents = [];
  const stageResults = [];

  let nextContextId = 1;
  let activeGlyph = null;

  const maxStoredGlyphs = 256;
  const maxStoredWritesPerGlyph = 24;

  const noteStage = (pc) => {
    const context = contexts[contexts.length - 1];
    if (!context) return;
    uniquePush(context.chain, pc);
    if (activeGlyph) {
      uniquePush(activeGlyph.chain, pc);
    }
  };

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function captureVramWrite(addr, value, width) {
    if (!activeGlyph) return;
    const { base, stride } = currentVramGeometry(mem);
    const pixelAddr = addr & 0xFFFFFE;
    const maxAddr = base + (stride * 240);
    if (pixelAddr < base || pixelAddr >= maxAddr) return;

    const coords = glyphCoordinates(pixelAddr, mem);
    if (!coords) return;

    if (!activeGlyph.firstVram) {
      activeGlyph.firstVram = coords;
    }
    if (activeGlyph.vramWrites.length < maxStoredWritesPerGlyph) {
      activeGlyph.vramWrites.push({
        addr: coords.addr,
        x: coords.x,
        y: coords.y,
        width,
        value,
      });
    }
  }

  cpu.write8 = (addr, value) => {
    captureVramWrite(addr, value & 0xFF, 1);
    return origWrite8(addr, value);
  };
  cpu.write16 = (addr, value) => {
    captureVramWrite(addr, value & 0xFFFF, 2);
    return origWrite16(addr, value);
  };
  cpu.write24 = (addr, value) => {
    captureVramWrite(addr, value & 0xFFFFFF, 3);
    return origWrite24(addr, value);
  };

  withHook(executor, '0540d0:adl', (cpuRef) => {
    const sp = cpuRef.sp & 0xFFFFFF;
    const returnAddr = read24(mem, sp);
    const stringPtr = read24(mem, sp + 3);
    const penXArg = read24(mem, sp + 6);
    const penYArg = read24(mem, sp + 9);
    const context = {
      id: nextContextId++,
      entryPc: PUTC_DRAW_ADVANCE,
      entryVector: 0x021E00,
      callerReturn: returnAddr,
      callerPc: returnAddr ? ((returnAddr - 4) & 0xFFFFFF) : null,
      stringPtr,
      stringPreview: previewCString(mem, stringPtr, 24),
      penXArg,
      penYArg,
      advanceFlag: 1,
      chain: [PUTC_DRAW_ADVANCE],
      glyphs: [],
    };
    contexts.push(context);
  });

  withHook(executor, '0540f5:adl', (cpuRef) => {
    const sp = cpuRef.sp & 0xFFFFFF;
    const returnAddr = read24(mem, sp);
    const stringPtr = read24(mem, sp + 3);
    const penXArg = read24(mem, sp + 6);
    const penYArg = read24(mem, sp + 9);
    const context = {
      id: nextContextId++,
      entryPc: PUTC_DRAW_ONLY,
      entryVector: 0x022178,
      callerReturn: returnAddr,
      callerPc: returnAddr ? ((returnAddr - 4) & 0xFFFFFF) : null,
      stringPtr,
      stringPreview: previewCString(mem, stringPtr, 24),
      penXArg,
      penYArg,
      advanceFlag: 0,
      chain: [PUTC_DRAW_ONLY],
      glyphs: [],
    };
    contexts.push(context);
  });

  for (const key of ['05411a:adl', '055191:adl', '05412b:adl', '00015c:adl', '002288:adl']) {
    const pc = Number.parseInt(key.slice(0, 6), 16);
    withHook(executor, key, () => noteStage(pc));
  }

  withHook(executor, '054fc6:adl', () => {
    noteStage(DRAW_VARWIDTH);
    if (activeGlyph) {
      activeGlyph.renderer = 'variable-width';
      activeGlyph.rendererEntry = DRAW_VARWIDTH;
    }
  });

  withHook(executor, '054e21:adl', () => {
    noteStage(DRAW_FIXEDWIDTH);
    if (activeGlyph) {
      activeGlyph.renderer = 'fixed-width';
      activeGlyph.rendererEntry = DRAW_FIXEDWIDTH;
    }
  });

  withHook(executor, '054153:adl', (cpuRef) => {
    noteStage(PUTC_GLYPH_DISPATCH);
    const context = contexts[contexts.length - 1];
    if (!context || glyphEvents.length >= maxStoredGlyphs) {
      activeGlyph = null;
      return null;
    }

    const framePtr = cpuRef.ix & 0xFFFFFF;
    const charPtr = (cpuRef.hl - 1) & 0xFFFFFF;
    const glyph = {
      contextId: context.id,
      charCode: cpuRef.a & 0xFF,
      charText: charDisplay(cpuRef.a & 0xFF),
      charPtr,
      firstCharFlag: read8(mem, framePtr - 6),
      advanceFlag: read24(mem, framePtr + 15) & 0xFF,
      penX: read16(mem, PEN_X_ADDR),
      penY: read8(mem, PEN_Y_ADDR),
      descPtr: read24(mem, DESC_PTR_RAM),
      renderer: null,
      rendererEntry: null,
      chain: [PUTC_GLYPH_DISPATCH],
      firstVram: null,
      vramWrites: [],
    };

    context.glyphs.push(glyph);
    glyphEvents.push(glyph);
    activeGlyph = glyph;
    return glyph;
  });

  withHook(executor, '054166:adl', () => noteStage(PUTC_GLYPH_RETURN), () => {
    activeGlyph = null;
  });

  withHook(executor, '05416f:adl', () => noteStage(PUTC_RETURN), () => {
    const context = contexts.pop();
    if (context) {
      completedContexts.push(context);
    }
  });

  for (const stage of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.iy = 0xD00080;
    cpu.f = 0x40;
    cpu.ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);

    const result = executor.runFrom(stage.entry, 'adl', {
      maxSteps: stage.maxSteps,
      maxLoopIterations: 500,
    });

    stageResults.push({
      label: stage.label,
      entry: stage.entry,
      steps: result.steps,
      termination: result.termination,
      lastPc: result.lastPc,
    });
  }

  while (contexts.length > 0) {
    completedContexts.push(contexts.pop());
  }

  return { mem, stageResults, contexts: completedContexts.reverse(), glyphEvents };
}

function printDynamicReport(trace) {
  console.log('3) Dynamic home-screen trace\n');

  for (const stage of trace.stageResults) {
    console.log(
      `   ${stage.label.padEnd(22)} entry=${hex(stage.entry)} steps=${stage.steps} ` +
      `term=${stage.termination} lastPc=${hex(stage.lastPc)}`,
    );
  }
  console.log('');

  const rendererCounts = {};
  for (const glyph of trace.glyphEvents) {
    const key = glyph.renderer ?? 'unknown';
    rendererCounts[key] = (rendererCounts[key] ?? 0) + 1;
  }

  console.log(`   Top-level PutC/DrawText calls captured: ${trace.contexts.length}`);
  console.log(`   Glyph dispatches captured:              ${trace.glyphEvents.length}`);
  console.log(`   Active descriptor pointer D005E9:      ${hex(read24(trace.mem, DESC_PTR_RAM))}`);
  console.log(`   VRAM base/stride:                      ${hex(read24(trace.mem, VRAM_BASE_ADDR) || VRAM_BASE_DEFAULT)} / ${hex(read24(trace.mem, VRAM_STRIDE_ADDR) || VRAM_STRIDE_DEFAULT)}`);
  console.log('');

  console.log('   Renderer selection counts:');
  for (const [renderer, count] of Object.entries(rendererCounts)) {
    console.log(`     ${renderer.padEnd(14)} ${count}`);
  }
  console.log('');

  const callerCounts = {};
  for (const context of trace.contexts) {
    const key = context.callerPc ? hex(context.callerPc) : VECTOR_NAMES.get(context.entryVector) ?? hex(context.entryVector);
    callerCounts[key] = (callerCounts[key] ?? 0) + context.glyphs.length;
  }

  console.log('   Glyph counts by top-level caller:');
  for (const [caller, count] of Object.entries(callerCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${caller.padEnd(24)} ${count}`);
  }
  console.log('');

  const byContext = new Map(trace.contexts.map((context) => [context.id, context]));
  const uniqueSamples = [];
  const seenChars = new Set();
  for (const glyph of trace.glyphEvents) {
    if (seenChars.has(glyph.charCode)) continue;
    if (!glyph.firstVram) continue;
    seenChars.add(glyph.charCode);
    uniqueSamples.push(glyph);
    if (uniqueSamples.length >= 3) break;
  }

  if (uniqueSamples.length === 0) {
    console.log('   No glyph events reached VRAM during the staged boot path.');
    return;
  }

  console.log('4) Sample per-glyph call chains\n');
  for (const glyph of uniqueSamples) {
    const context = byContext.get(glyph.contextId);
    const callerLabel = context?.callerPc ? hex(context.callerPc) : VECTOR_NAMES.get(context?.entryVector) ?? 'n/a';
    const chain = mergedChain(context, glyph);
    console.log(`   ${glyph.charText} (${hex(glyph.charCode, 2)}) from ${callerLabel}`);
    console.log(`     string ptr:   ${hex(context?.stringPtr)}  preview="${context?.stringPreview ?? ''}"`);
    console.log(`     glyph ptr:    ${hex(glyph.charPtr)}  first=${glyph.firstCharFlag}  advance=${glyph.advanceFlag}`);
    console.log(`     pen coords:   (${glyph.penX}, ${glyph.penY})`);
    console.log(`     renderer:     ${glyph.renderer ?? 'unknown'} ${glyph.rendererEntry ? hex(glyph.rendererEntry) : ''}`);
    console.log(`     first VRAM:   ${glyph.firstVram ? `${hex(glyph.firstVram.addr)} @ (${glyph.firstVram.x}, ${glyph.firstVram.y})` : 'n/a'}`);
    console.log(`     call chain:   ${printChain(chain, glyph.firstVram)}`);
    if (glyph.vramWrites.length > 0) {
      const preview = glyph.vramWrites
        .slice(0, 6)
        .map((entry) => `${hex(entry.addr)}=${hex(entry.value, entry.width === 1 ? 2 : entry.width === 2 ? 4 : 6)}`)
        .join(', ');
      console.log(`     VRAM writes:  ${preview}`);
    }
    console.log('');
  }

  console.log('5) Pipeline summary\n');
  console.log('   Layer 0: 0x021E00 JP 0x0540D0 and 0x022178 JP 0x0540F5 public vectors.');
  console.log('   Layer 1: 9 lifted direct CALL sites into 0x0540D0 across status/home/graph clusters.');
  console.log('   Layer 2: 0x0540D0 / 0x0540F5 push advance flag 1/0 and tail into 0x05411A.');
  console.log('   Layer 3: 0x05411A sets pen X/Y, reads bytes from the caller string, and dispatches each glyph via D005E9+3.');
  console.log(`   Layer 4: ${hex(INDCALL)} -> ${hex(JP_IY)} -> JP (IY), selecting ${hex(DRAW_VARWIDTH)} or ${hex(DRAW_FIXEDWIDTH)}.`);
  console.log('   Layer 5: the selected renderer writes RGB565 pixels into VRAM at D02FE3 / D02FE0 geometry.');
}

const blocks = await loadBlocks();
const staticInfo = collectStaticSites(blocks);
printStaticReport(staticInfo);
const trace = await runDynamicTrace(blocks);
printDynamicReport(trace);
