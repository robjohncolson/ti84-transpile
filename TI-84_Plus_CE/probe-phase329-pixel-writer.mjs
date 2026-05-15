#!/usr/bin/env node
/**
 * Phase 329 - trace pixel writer subroutine 0x0553F0
 *
 * Blend summary for 0 < A < 0xFF:
 *   src = BC (RGB565), dst = *(uint16_t*)HL
 *   inv = (~A) & 0xFF
 *   outChan = ((A * srcChan) + (inv * dstChan) + 0x80) >> 8
 *   out = (outR << 11) | (outG << 5) | outB
 *
 * Fast paths:
 *   A == 0x00: RET immediately, leaving VRAM unchanged.
 *   A == 0xFF: store BC directly to [HL],[HL+1] little-endian.
 *
 * MLT usage:
 *   The routine only uses `MLT HL`.
 *   H holds alpha or inverse alpha, L holds one 5-bit or 6-bit channel,
 *   and the 16-bit product is left in HL.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const FUNC_START = 0x0553F0;
const TEST_VRAM_ADDR = 0xD40000;
const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function read16(mem, addr) {
  const base = addr & MEM_MASK;
  return mem[base] | (mem[(base + 1) & MEM_MASK] << 8);
}

function write16(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function rgb565Channels(pixel) {
  return {
    r: (pixel >>> 11) & 0x1F,
    g: (pixel >>> 5) & 0x3F,
    b: pixel & 0x1F,
  };
}

function packRgb565({ r, g, b }) {
  return ((r & 0x1F) << 11) | ((g & 0x3F) << 5) | (b & 0x1F);
}

function blendChannel(alpha, src, dst) {
  const invAlpha = (~alpha) & 0xFF;
  return ((alpha * src) + (invAlpha * dst) + 0x80) >>> 8;
}

function expectedPixel(alpha, srcPixel, dstPixel) {
  if (alpha === 0x00) return dstPixel;
  if (alpha === 0xFF) return srcPixel;

  const src = rgb565Channels(srcPixel);
  const dst = rgb565Channels(dstPixel);
  return packRgb565({
    r: blendChannel(alpha, src.r, dst.r),
    g: blendChannel(alpha, src.g, dst.g),
    b: blendChannel(alpha, src.b, dst.b),
  });
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase329-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const moduleUrl = `${pathToFileURL(assets.modulePath).href}?t=${Date.now()}`;
    const mod = await import(moduleUrl);
    return normalizeBlocks(mod.PRELIFTED_BLOCKS);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function isConditionalTerminator(inst) {
  return ['ret-conditional', 'jr-conditional', 'jp-conditional', 'djnz'].includes(inst.tag);
}

function isHardTerminator(inst) {
  return ['ret', 'reti', 'retn', 'jr', 'jp', 'jp-indirect'].includes(inst.tag);
}

function walkFunction(start) {
  const queue = [start];
  const queued = new Set(queue);
  const seenBlocks = new Set();
  const instructions = new Map();
  const blockStarts = new Set([start]);

  while (queue.length > 0) {
    let pc = queue.shift();
    if (seenBlocks.has(pc)) continue;
    seenBlocks.add(pc);

    while (pc >= 0 && pc < rom.length) {
      if (instructions.has(pc)) break;
      const inst = decodeSafe(pc);
      if (!inst || !inst.length) break;
      instructions.set(pc, inst);

      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        const fallthrough = inst.fallthrough ?? nextPc(inst);
        blockStarts.add(fallthrough);
        pc = fallthrough;
        continue;
      }

      if (isConditionalTerminator(inst)) {
        if (inst.target !== undefined) {
          blockStarts.add(inst.target);
          if (!seenBlocks.has(inst.target) && !queued.has(inst.target)) {
            queue.push(inst.target);
            queued.add(inst.target);
          }
        }
        const fallthrough = inst.fallthrough ?? nextPc(inst);
        blockStarts.add(fallthrough);
        if (!seenBlocks.has(fallthrough) && !queued.has(fallthrough)) {
          queue.push(fallthrough);
          queued.add(fallthrough);
        }
        break;
      }

      if (isHardTerminator(inst)) {
        if ((inst.tag === 'jp' || inst.tag === 'jr') && inst.target !== undefined) {
          blockStarts.add(inst.target);
          if (!seenBlocks.has(inst.target) && !queued.has(inst.target)) {
            queue.push(inst.target);
            queued.add(inst.target);
          }
        }
        break;
      }

      pc = nextPc(inst);
    }
  }

  const ordered = [...instructions.values()].sort((a, b) => a.pc - b.pc);
  const starts = [...blockStarts].filter((pc) => instructions.has(pc)).sort((a, b) => a - b);
  return {
    ordered,
    starts,
    startSet: new Set(starts),
    totalBytes: ordered.reduce((sum, inst) => sum + inst.length, 0),
  };
}

function indexed(reg, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${String(reg).toUpperCase()}${signed})`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'ld-ind-reg':
      return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'inc-pair':
      return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair ?? inst.reg ?? inst.src).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair ?? inst.reg ?? inst.dest).toUpperCase()}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value, inst.value <= 0xFFFF ? 4 : 6)}`;
    case 'add-pair':
      return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${indexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${indexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'rrca':
      return `${prefix}RRCA`;
    case 'cpl':
      return `${prefix}CPL`;
    case 'mlt':
      return `${prefix}MLT ${String(inst.reg ?? inst.pair).toUpperCase()}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-pair':
      return `${prefix}LD SP, ${String(inst.pair).toUpperCase()}`;
    default:
      return `${prefix}[${inst.tag}]`;
  }
}

function formatStaticDisassembly(staticInfo) {
  for (const inst of staticInfo.ordered) {
    if (staticInfo.startSet.has(inst.pc)) {
      console.log(`\n[block ${hex(inst.pc)}]`);
    }
    const bytes = bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length)).padEnd(28);
    console.log(`  ${hex(inst.pc)}: ${bytes} ${formatInstruction(inst)}`);
  }
}

function describePath(inst) {
  if (inst.pc === 0x0553F1) {
    return `transparent fast path when Z is set from OR A`;
  }
  if (inst.pc === 0x0553F4) {
    return `if A != 0xFF jump to blend path ${hex(inst.target)}, else fall through to opaque store`;
  }
  return '';
}

function printStaticSummary(staticInfo) {
  console.log('=== Static disassembly of 0x0553F0 ===');
  formatStaticDisassembly(staticInfo);
  console.log();
  console.log('=== Basic block summary ===');
  console.log(`Basic blocks: ${staticInfo.starts.length}`);
  console.log(`Instructions: ${staticInfo.ordered.length}`);
  console.log(`Total bytes:  ${staticInfo.totalBytes}`);
  console.log();
  console.log('=== Branch map ===');
  for (const inst of staticInfo.ordered) {
    if (!isConditionalTerminator(inst) && !isHardTerminator(inst)) continue;
    const note = describePath(inst);
    if (inst.tag === 'ret-conditional') {
      console.log(`  ${hex(inst.pc)}: ${formatInstruction(inst)}${note ? `  ; ${note}` : ''}`);
      continue;
    }
    if (inst.target !== undefined) {
      const fallthrough = inst.fallthrough ?? nextPc(inst);
      console.log(`  ${hex(inst.pc)}: ${formatInstruction(inst)}  ; target=${hex(inst.target)} fallthrough=${hex(fallthrough)}${note ? ` ; ${note}` : ''}`);
      continue;
    }
    console.log(`  ${hex(inst.pc)}: ${formatInstruction(inst)}${note ? `  ; ${note}` : ''}`);
  }
  console.log();
}

function printBlendAnalysis() {
  console.log('=== RGB565 decomposition ===');
  console.log('Source pixel comes from BC (C = low byte, B = high byte).');
  console.log(`  Blue  = BC & 0x001F           via ${hex(0x05541A)}..${hex(0x05541D)}`);
  console.log(`  Red   = (BC >> 11) & 0x001F   via ${hex(0x055420)}..${hex(0x055426)}`);
  console.log(`  Green = (BC >> 5)  & 0x003F   via ${hex(0x055429)}..${hex(0x05542F)}`);
  console.log();
  console.log('Destination pixel is read from VRAM at HL as little-endian RGB565.');
  console.log(`  Read existing pixel with LD E,(HL) / INC HL / LD D,(HL) at ${hex(0x055435)}..${hex(0x055437)}`);
  console.log(`  Blue  = dst & 0x001F          via ${hex(0x055439)}..${hex(0x05543C)}`);
  console.log(`  Red   = (dst >> 11) & 0x001F  via ${hex(0x05543F)}..${hex(0x055445)}`);
  console.log(`  Green = (dst >> 5)  & 0x003F  via ${hex(0x055448)}..${hex(0x05544E)}`);
  console.log();
  console.log('=== MLT usage ===');
  console.log('All multiplies are `MLT HL`.');
  console.log(`  Red:   ${hex(0x055451)} alpha*srcR, ${hex(0x05545A)} invAlpha*dstR`);
  console.log(`  Blue:  ${hex(0x05546E)} alpha*srcB, ${hex(0x055474)} invAlpha*dstB`);
  console.log(`  Green: ${hex(0x055481)} alpha*srcG, ${hex(0x05548A)} invAlpha*dstG`);
  console.log('`EX DE,HL` preserves the first product while HL is reused for the second.');
  console.log('BC is loaded with 0x0080 once and reused as the rounding bias before taking H.');
  console.log();
  console.log('=== Recomposition ===');
  console.log(`  Build (red << 11) | (green << 5) | blue across ${hex(0x055497)}..${hex(0x0554B2)}`);
  console.log(`  Write low byte then high byte back to VRAM at ${hex(0x0554B6)}..${hex(0x0554B8)}`);
  console.log();
  console.log('Note: the blend math only runs for 0 < A < 0xFF.');
  console.log('The transparent and opaque fast paths avoid the 255/256 weighting loss that the blend path would introduce at A=0x00 or A=0xFF.');
  console.log();
}

function runPixelWriterCase(blocks, testCase) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);
  write16(mem, TEST_VRAM_ADDR, testCase.dst);

  const executor = createExecutor(blocks, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  const cpu = executor.cpu;

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP;
  cpu.ix = 0x102030;
  cpu.iy = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = TEST_VRAM_ADDR;
  cpu.bc = testCase.src;
  cpu.a = testCase.alpha;
  cpu.f = 0;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;

  write24(mem, cpu.sp, RETURN_SENTINEL);

  const writes = [];
  const blocksVisited = [];
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    if (normalized >= 0xD40000 && normalized < 0xD65800) {
      writes.push({
        width: 1,
        addr: normalized,
        value: value & 0xFF,
      });
    }
    originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    if (normalized >= 0xD40000 && normalized < 0xD65800) {
      writes.push({
        width: 2,
        addr: normalized,
        value: value & 0xFFFF,
      });
    }
    originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    if (normalized >= 0xD40000 && normalized < 0xD65800) {
      writes.push({
        width: 3,
        addr: normalized,
        value: value & 0xFFFFFF,
      });
    }
    originalWrite24(addr, value);
  };

  const before = read16(mem, TEST_VRAM_ADDR);
  const result = executor.runFrom(FUNC_START, 'adl', {
    maxSteps: 256,
    maxLoopIterations: 256,
    onBlock: (pc) => blocksVisited.push(pc & 0xFFFFFF),
  });
  const after = read16(mem, TEST_VRAM_ADDR);
  const expected = expectedPixel(testCase.alpha, testCase.src, testCase.dst);

  return {
    ...testCase,
    before,
    after,
    expected,
    pass: after === expected,
    result,
    blocksVisited,
    writes,
    finalState: {
      a: cpu.a,
      bc: cpu.bc,
      de: cpu.de,
      hl: cpu.hl,
      ix: cpu.ix,
      sp: cpu.sp,
    },
  };
}

function formatBlockPath(blocksVisited) {
  return blocksVisited.map((pc) => hex(pc)).join(' -> ');
}

function printWriteLog(writes) {
  if (writes.length === 0) {
    console.log('  VRAM writes: none');
    return;
  }

  console.log('  VRAM writes:');
  for (const write of writes) {
    console.log(`    ${hex(write.addr)} width=${write.width} value=${hex(write.value, write.width * 2)}`);
  }
}

function printCaseResult(caseResult) {
  const srcChannels = rgb565Channels(caseResult.src);
  const dstChannels = rgb565Channels(caseResult.dst);
  const outChannels = rgb565Channels(caseResult.after);
  const expectedChannels = rgb565Channels(caseResult.expected);
  const invAlpha = (~caseResult.alpha) & 0xFF;

  console.log(`=== ${caseResult.name} ===`);
  console.log(`Input: A=${hexByte(caseResult.alpha)} inv=${hexByte(invAlpha)} BC=${hex(caseResult.src, 4)} HL=${hex(TEST_VRAM_ADDR)}`);
  console.log(`Path:  ${formatBlockPath(caseResult.blocksVisited)}`);
  console.log(`VRAM:  before=${hex(caseResult.before, 4)} after=${hex(caseResult.after, 4)} expected=${hex(caseResult.expected, 4)} ${caseResult.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Src:   R=${srcChannels.r} G=${srcChannels.g} B=${srcChannels.b}`);
  console.log(`Dst:   R=${dstChannels.r} G=${dstChannels.g} B=${dstChannels.b}`);
  console.log(`Out:   R=${outChannels.r} G=${outChannels.g} B=${outChannels.b}`);
  console.log(`Want:  R=${expectedChannels.r} G=${expectedChannels.g} B=${expectedChannels.b}`);
  console.log(`Exec:  termination=${caseResult.result.termination} lastPc=${hex(caseResult.result.lastPc ?? 0)}`);
  printWriteLog(caseResult.writes);
  console.log();
}

async function main() {
  console.log('Phase 329: pixel writer 0x0553F0');
  console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
  console.log();

  const staticInfo = walkFunction(FUNC_START);
  printStaticSummary(staticInfo);
  printBlendAnalysis();

  const blocks = await loadBlocks();
  const cases = [
    {
      name: 'Opaque fast path',
      alpha: 0xFF,
      src: 0x1234,
      dst: 0xABCD,
    },
    {
      name: 'Transparent fast path',
      alpha: 0x00,
      src: 0x1234,
      dst: 0xABCD,
    },
    {
      name: '50% blend: white over black',
      alpha: 0x80,
      src: 0xFFFF,
      dst: 0x0000,
    },
    {
      name: '25% blend: magenta over green',
      alpha: 0x40,
      src: 0xF81F,
      dst: 0x07E0,
    },
  ];

  console.log('=== Dynamic verification ===');
  console.log(`Test VRAM address: ${hex(TEST_VRAM_ADDR)}`);
  console.log(`Return sentinel:   ${hex(RETURN_SENTINEL)}`);
  console.log();

  const results = cases.map((testCase) => runPixelWriterCase(blocks, testCase));
  for (const result of results) {
    printCaseResult(result);
  }

  const failures = results.filter((result) => !result.pass);
  console.log('=== Summary ===');
  console.log(`Cases run: ${results.length}`);
  console.log(`Passes:    ${results.length - failures.length}`);
  console.log(`Failures:  ${failures.length}`);
  console.log('Blend formula confirmed for all non-fast-path cases when:');
  console.log('  outChan = ((A * srcChan) + ((~A & 0xFF) * dstChan) + 0x80) >> 8');
  console.log();

  if (failures.length > 0) {
    process.exitCode = 1;
    console.log('Failing cases:');
    for (const failure of failures) {
      console.log(`  ${failure.name}`);
    }
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
