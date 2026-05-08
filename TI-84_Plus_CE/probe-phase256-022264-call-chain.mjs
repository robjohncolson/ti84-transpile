#!/usr/bin/env node

import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
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

const TARGET_022264 = 0x022264;
const TARGET_05523D = 0x05523D;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 50000;
const BOOT_MAX_LOOP_ITERATIONS = 256;

const MEM_SIZE = 0x1000000;

const TRACE_RANGES = [
  { start: 0x022260, end: 0x022280, label: '0x022260-0x022280' },
  { start: 0x055230, end: 0x055280, label: '0x055230-0x055280' },
];

if (!existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM image: ${ROM_PATH}`);
}

const romBytes = readFileSync(ROM_PATH);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function bytesAt(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.subarray(safeStart, safeEnd), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${upper(indexRegister)}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode error)';
  }

  if (inst.tag === 'decode-error') {
    return `DB ${hexByte(inst.byte)} ; ${inst.error}`;
  }

  const prefix = inst.modePrefix ? `${upper(inst.modePrefix)} ` : '';

  switch (inst.tag) {
    case 'nop':
      return `${prefix}NOP`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${upper(inst.condition)}`;
    case 'halt':
      return `${prefix}HALT`;
    case 'di':
      return `${prefix}DI`;
    case 'ei':
      return `${prefix}EI`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    case 'exx':
      return `${prefix}EXX`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'scf':
      return `${prefix}SCF`;
    case 'ccf':
      return `${prefix}CCF`;
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `${prefix}JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'rst':
      return `${prefix}RST ${hex(inst.vector, 2)}`;
    case 'push':
      return `${prefix}PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `${prefix}POP ${upper(inst.pair)}`;
    case 'inc-reg':
      return `${prefix}INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `${prefix}DEC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `${prefix}INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `${prefix}DEC ${upper(inst.pair)}`;
    case 'add-pair':
      return `${prefix}ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${upper(inst.src)}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${upper(inst.src)}`;
    case 'alu-reg':
      return `${prefix}${upper(inst.op)} ${upper(inst.src ?? inst.reg)}`;
    case 'alu-imm':
      return `${prefix}${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-ind':
      return `${prefix}${upper(inst.op)} (${upper(inst.src ?? 'hl')})`;
    case 'ld-pair-imm':
      return `${prefix}LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${upper(inst.dest)}, ${hexByte(inst.value)}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${upper(inst.dest)}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${upper(inst.src)}`;
    case 'ld-pair-mem':
      return `${prefix}LD ${upper(inst.pair)}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${upper(inst.pair)}`;
    case 'ld-sp-hl':
      return `${prefix}LD SP, HL`;
    case 'ld-sp-pair':
      return `${prefix}LD SP, ${upper(inst.pair)}`;
    case 'ld-reg-ixd':
      return `${prefix}LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-ixd-imm':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed':
      return `${prefix}LD ${upper(inst.pair)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.pair)}`;
    case 'ld-ixiy-indexed':
      return `${prefix}LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'lea':
      return `${prefix}LEA ${upper(inst.dest)}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res':
      return `${prefix}RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set':
      return `${prefix}SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind':
      return `${prefix}BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res-ind':
      return `${prefix}RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set-ind':
      return `${prefix}SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'indexed-cb-rotate':
      return `${prefix}${upper(inst.operation)} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'cpi':
      return `${prefix}CPI`;
    case 'cpir':
      return `${prefix}CPIR`;
    case 'cpd':
      return `${prefix}CPD`;
    case 'cpdr':
      return `${prefix}CPDR`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'rld':
      return `${prefix}RLD`;
    case 'rrd':
      return `${prefix}RRD`;
    case 'neg':
      return `${prefix}NEG`;
    case 'retn':
      return `${prefix}RETN`;
    case 'reti':
      return `${prefix}RETI`;
    case 'in-port':
      return `${prefix}IN A, (${hex(inst.port, 2)})`;
    case 'out-port':
      return `${prefix}OUT (${hex(inst.port, 2)}), A`;
    case 'ld-special':
      return `${prefix}LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ld-mb-a':
      return `${prefix}LD MB, A`;
    case 'ld-a-mb':
      return `${prefix}LD A, MB`;
    case 'ld-pair-ind':
      return `${prefix}LD ${upper(inst.pair)}, (${upper(inst.src)})`;
    case 'ld-ind-pair':
      return `${prefix}LD (${upper(inst.dest)}), ${upper(inst.pair)}`;
    default: {
      const notable = [];
      for (const field of ['condition', 'target', 'pair', 'reg', 'dest', 'src', 'value', 'addr', 'address']) {
        if (inst[field] !== undefined) {
          notable.push(`${field}=${typeof inst[field] === 'number' ? hex(inst[field]) : inst[field]}`);
        }
      }
      const suffix = notable.length ? ` ${notable.join(' ')}` : '';
      return `${prefix}[${inst.tag}]${suffix}`;
    }
  }
}

function decodeSafe(buffer, pc, mode = 'adl') {
  try {
    return decodeInstruction(buffer, pc & 0xFFFFFF, mode);
  } catch (error) {
    return {
      tag: 'decode-error',
      length: 1,
      byte: buffer[pc] ?? 0,
      error: error?.message ?? String(error),
    };
  }
}

function disassembleRange(buffer, startAddr, byteCount, mode = 'adl') {
  const rows = [];
  const endAddr = Math.min(buffer.length, startAddr + byteCount);
  let pc = Math.max(0, startAddr);

  while (pc < endAddr) {
    const inst = decodeSafe(buffer, pc, mode);
    const length = Math.max(1, inst.length || 1);
    rows.push({
      addr: pc,
      bytes: bytesAt(buffer, pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc += length;
  }

  return rows;
}

function printDisassemblyRows(rows, highlightAddr = null) {
  for (const row of rows) {
    const marker = row.addr === highlightAddr ? '>>' : '  ';
    console.log(`${marker} ${hex(row.addr)}  ${row.bytes.padEnd(20)} ${row.text}`);
  }
}

function scanPattern(buffer, pattern) {
  const hits = [];
  for (let addr = 0; addr <= buffer.length - pattern.length; addr += 1) {
    let matched = true;
    for (let index = 0; index < pattern.length; index += 1) {
      if (buffer[addr + index] !== pattern[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(addr);
    }
  }
  return hits;
}

function buildExactReferenceList(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;

  const specs = [
    { kind: 'CALL', pattern: [0xCD, lo, mid, hi] },
    { kind: 'JP', pattern: [0xC3, lo, mid, hi] },
    { kind: 'LD HL', pattern: [0x21, lo, mid, hi] },
  ];

  const sites = [];

  for (const spec of specs) {
    for (const addr of scanPattern(romBytes, spec.pattern)) {
      const inst = decodeSafe(romBytes, addr, 'adl');
      sites.push({
        addr,
        kind: spec.kind,
        target,
        bytes: bytesAt(romBytes, addr, spec.pattern.length),
        text: formatInstruction(inst),
        inst,
      });
    }
  }

  sites.sort((left, right) => left.addr - right.addr || left.kind.localeCompare(right.kind));
  return sites;
}

function printReferenceList(title, target, sites) {
  console.log(title);
  console.log(`target=${hex(target)}  sites=${sites.length}`);
  if (!sites.length) {
    console.log('  none');
    console.log('');
    return;
  }

  for (const site of sites) {
    console.log(`  ${hex(site.addr)}  ${site.kind.padEnd(5)}  ${site.bytes.padEnd(11)}  ${site.text}`);
  }
  console.log('');
}

function findAlignedStart(targetAddr, lookback = 32, mode = 'adl') {
  const minStart = Math.max(0, targetAddr - lookback);

  for (let start = minStart; start <= targetAddr; start += 1) {
    let pc = start;
    let aligned = true;

    while (pc < targetAddr) {
      try {
        const inst = decodeInstruction(romBytes, pc, mode);
        const length = Math.max(1, inst.length || 1);
        if (pc + length > targetAddr) {
          aligned = false;
          break;
        }
        pc += length;
      } catch {
        aligned = false;
        break;
      }
    }

    if (aligned && pc === targetAddr) {
      return start;
    }
  }

  return minStart;
}

function printCallerContexts(sites) {
  console.log('=== 4. Caller Contexts For Exact 0x022264 References ===');
  console.log('32-byte lookback windows, aligned where possible.');
  console.log('');

  if (!sites.length) {
    console.log('  no exact CALL/JP/LD HL sites found for 0x022264');
    console.log('');
    return;
  }

  for (const site of sites) {
    const alignedStart = findAlignedStart(site.addr, 32, 'adl');
    const trailingBytes = Math.max(16, site.inst?.length ?? 4);
    const byteCount = (site.addr - alignedStart) + trailingBytes;
    const rows = disassembleRange(romBytes, alignedStart, byteCount, 'adl');

    console.log(`--- ${site.kind} at ${hex(site.addr)} ---`);
    console.log(`exact bytes: ${site.bytes}`);
    console.log(`decoded: ${site.text}`);
    console.log(`alignedWindowStart=${hex(alignedStart)}  precedingBytes=${site.addr - alignedStart}`);
    printDisassemblyRows(rows, site.addr);
    console.log('');
  }
}

function summarizeBlock(meta, pc, mode) {
  if (meta?.instructions?.length) {
    const text = meta.instructions.map((instruction) => instruction.dasm).join(' | ');
    return text.length > 220 ? `${text.slice(0, 217)}...` : text;
  }
  const inst = decodeSafe(romBytes, pc, mode);
  return formatInstruction(inst);
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
  if (existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase256-${process.pid}.mjs`);
  writeFileSync(tempModulePath, gunzipSync(readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const moduleAssets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(moduleAssets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);

    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }

    return { blocks, moduleAssets };
  } catch (error) {
    cleanupTranspiledModule(moduleAssets);
    throw error;
  }
}

function createRuntime(blocks) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  return { memory, peripherals, executor, cpu: executor.cpu };
}

function findTraceRange(pc) {
  const normalizedPc = pc & 0xFFFFFF;
  return TRACE_RANGES.find((range) => normalizedPc >= range.start && normalizedPc <= range.end) ?? null;
}

function collectBootRangeHits(blocks) {
  const runtime = createRuntime(blocks);
  const hits = [];

  function recordHit(source, pc, mode, step, meta = null) {
    const range = findTraceRange(pc);
    if (!range) {
      return;
    }

    hits.push({
      source,
      step,
      pc: pc & 0xFFFFFF,
      mode,
      range: range.label,
      summary: source === 'missing' ? '(missing block)' : summarizeBlock(meta, pc & 0xFFFFFF, mode),
    });
  }

  const result = runtime.executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, step) {
      recordHit('block', pc, mode, step, meta);
    },
    onMissingBlock(pc, mode, step) {
      recordHit('missing', pc, mode, step, null);
    },
  });

  return { result, hits };
}

function printBootTrace(trace) {
  console.log('=== 5. Boot Trace ===');
  console.log(
    `entry=${hex(BOOT_ENTRY)} mode=${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} ` +
    `steps=${trace.result.steps} termination=${trace.result.termination} ` +
    `lastPc=${hex(trace.result.lastPc)} lastMode=${trace.result.lastMode}`,
  );
  console.log('');

  for (const range of TRACE_RANGES) {
    const rangeHits = trace.hits.filter((hit) => hit.range === range.label);
    if (!rangeHits.length) {
      console.log(`  ${range.label}: not hit during boot trace`);
      continue;
    }

    const firstHit = rangeHits[0];
    console.log(
      `  ${range.label}: hit ${rangeHits.length} time(s), ` +
      `first step=${firstHit.step} pc=${hex(firstHit.pc)} mode=${firstHit.mode}`,
    );
  }
  console.log('');

  if (!trace.hits.length) {
    console.log('  no range-hit events captured');
    console.log('');
    return;
  }

  for (const hit of trace.hits) {
    console.log(
      `  [${String(hit.step).padStart(5, '0')}] ${hit.range} ${hex(hit.pc)}:${hit.mode} ` +
      `${hit.source} ${hit.summary}`,
    );
  }
  console.log('');
}

function describe022264Entry(rows) {
  const transferTags = new Set(['jp', 'jp-conditional', 'call', 'call-conditional']);
  const firstTransfer = rows.find((row) => transferTags.has(row.inst?.tag));

  if (!firstTransfer) {
    return 'No direct CALL/JP found in the 64-byte window at 0x022264.';
  }

  if (firstTransfer.addr === TARGET_022264 && firstTransfer.inst.tag === 'jp' && firstTransfer.inst.target === TARGET_05523D) {
    return '0x022264 is a direct JP 0x05523D stub.';
  }

  if (firstTransfer.addr === TARGET_022264 && firstTransfer.inst.tag === 'call' && firstTransfer.inst.target === TARGET_05523D) {
    return '0x022264 begins with CALL 0x05523D.';
  }

  if (firstTransfer.addr === TARGET_022264) {
    return `0x022264 begins with ${formatInstruction(firstTransfer.inst)}.`;
  }

  return `First transfer in the 64-byte window appears at ${hex(firstTransfer.addr)}: ${formatInstruction(firstTransfer.inst)}.`;
}

async function main() {
  console.log('Phase 256 probe: trace 0x022264 call chain / LCD write-enable path');
  console.log(`ROM bytes=${romBytes.length}`);
  console.log('');

  const exact022264 = buildExactReferenceList(TARGET_022264);
  const exact05523D = buildExactReferenceList(TARGET_05523D);

  console.log('=== 1. Static ROM Scan For 0x022264 ===');
  printReferenceList('Exact ADL CALL/JP/LD HL references', TARGET_022264, exact022264);

  console.log('=== 2. Static ROM Scan For 0x05523D ===');
  printReferenceList('Exact ADL CALL/JP/LD HL references', TARGET_05523D, exact05523D);

  const disasm022264 = disassembleRange(romBytes, TARGET_022264, 64, 'adl');
  console.log('=== 3. Disassembly Of 0x022264 (64 bytes) ===');
  printDisassemblyRows(disasm022264, TARGET_022264);
  console.log('');
  console.log(`entryAssessment: ${describe022264Entry(disasm022264)}`);
  console.log('');

  printCallerContexts(exact022264);

  const { blocks, moduleAssets } = await loadBlocks();
  try {
    console.log('transpiledModuleLoaded=true');
    console.log(`transpiledSource=${moduleAssets.source}`);
    console.log(`blockCount=${Object.keys(blocks).length}`);
    console.log('');

    const bootTrace = collectBootRangeHits(blocks);
    printBootTrace(bootTrace);
  } finally {
    cleanupTranspiledModule(moduleAssets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
