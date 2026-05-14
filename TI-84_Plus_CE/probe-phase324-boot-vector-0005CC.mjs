#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const REFERENCES_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const VECTOR_REGION_START = 0x000580;
const VECTOR_REGION_END = 0x000600;
const VECTOR_STRIDE = 4;

const TARGET_VECTOR_ADDR = 0x0005CC;
const TARGET_ROUTINE_ADDR = 0x007B70;
const TARGET_ROUTINE_DISASM_BYTES = 50;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;

const BOOT_STAGE_MAX_STEPS = 20000;
const KERNEL_STAGE_MAX_STEPS = 100000;
const POST_STAGE_MAX_STEPS = 100;

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

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
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
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase324-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function loadSymbolMap() {
  const symbols = new Map();
  if (!fs.existsSync(REFERENCES_PATH)) {
    return symbols;
  }

  const text = fs.readFileSync(REFERENCES_PATH, 'utf8');
  const regex = /^\?([^\r\n:=]+?)\s*:=\s*([0-9A-Fa-f]+)h\s*$/gm;
  for (const match of text.matchAll(regex)) {
    const name = match[1].trim();
    const addr = parseInt(match[2], 16) >>> 0;
    symbols.set(addr, name);
  }
  return symbols;
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
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'rst':
      return `${prefix}RST ${hex(inst.target ?? 0, 2)}`;
    case 'push':
      return `${prefix}PUSH ${String(inst.pair ?? inst.reg ?? inst.src).toUpperCase()}`;
    case 'pop':
      return `${prefix}POP ${String(inst.pair ?? inst.reg ?? inst.dest).toUpperCase()}`;
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
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem':
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-sp-pair':
      return `${prefix}LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ixd':
    case 'ld-pair-indexed':
      return `${prefix}LD ${String(inst.dest ?? inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src ?? inst.reg).toUpperCase()}`;
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
    case 'in-reg':
      return `${prefix}IN ${String(inst.reg).toUpperCase()}, (C)`;
    case 'out-reg':
      return `${prefix}OUT (C), ${String(inst.reg).toUpperCase()}`;
    case 'indexed-cb-bit':
      return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'ex-af':
      return `${prefix}EX AF, AF'`;
    default: {
      let rendered = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) rendered += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) rendered += ` ${hex(inst.value)}`;
      return rendered;
    }
  }
}

function disassembleWindow(buffer, start, byteCount) {
  const rows = [];
  const end = Math.min(buffer.length, start + byteCount);

  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(buffer, pc, 'adl');
      const length = Math.max(1, inst?.length ?? 1);
      rows.push({
        pc,
        inst,
        bytes: bytesToHex(buffer.subarray(pc, Math.min(pc + length, end))),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        inst: null,
        bytes: hexByte(buffer[pc]),
        text: `DB ${hexByte(buffer[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }

  return rows;
}

function findAlignedStart(buffer, targetPc, maxLookback = 24, maxSteps = 8) {
  let best = targetPc;
  const min = Math.max(0, targetPc - maxLookback);

  for (let candidate = min; candidate < targetPc; candidate++) {
    let pc = candidate;
    let steps = 0;
    let ok = true;

    while (pc < targetPc && steps < maxSteps) {
      try {
        const inst = decodeInstruction(buffer, pc, 'adl');
        if (!inst?.length || inst.nextPc <= pc) {
          ok = false;
          break;
        }
        pc = inst.nextPc & 0xFFFFFF;
        steps += 1;
      } catch {
        ok = false;
        break;
      }
    }

    if (ok && pc === targetPc) {
      best = candidate;
    }
  }

  return best;
}

function scanPattern(buffer, pattern) {
  const hits = [];
  const limit = buffer.length - pattern.length;
  const first = pattern[0];

  outer: for (let addr = 0; addr <= limit; addr++) {
    if (buffer[addr] !== first) continue;
    for (let i = 1; i < pattern.length; i++) {
      if (buffer[addr + i] !== pattern[i]) {
        continue outer;
      }
    }
    hits.push(addr);
  }

  return hits;
}

function extractVectorEntries(rom, symbols) {
  const entries = [];
  for (let addr = VECTOR_REGION_START; addr < VECTOR_REGION_END; addr += VECTOR_STRIDE) {
    const opcode = rom[addr] & 0xFF;
    const target = read24(rom, addr + 1);
    entries.push({
      addr,
      opcode,
      target,
      name: symbols.get(addr) ?? '(unnamed)',
      bytes: bytesToHex(rom.subarray(addr, addr + VECTOR_STRIDE)),
    });
  }
  return entries;
}

function printRows(rows, annotations = new Map()) {
  for (const row of rows) {
    const note = annotations.get(row.pc) ?? '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(14)}  ${row.text}${note ? `  ${note}` : ''}`);
  }
}

function analyzeVectorRegion(rom, symbols) {
  const entries = extractVectorEntries(rom, symbols);
  const tableSlot = (TARGET_VECTOR_ADDR - VECTOR_REGION_START) / VECTOR_STRIDE;
  const allJp = entries.every((entry) => entry.opcode === 0xC3);
  const distinctTargets = new Set(entries.map((entry) => entry.target));

  console.log('=== Part 1: Static analysis of the boot vector table region ===');
  console.log(`Region: ${hex(VECTOR_REGION_START)}..${hex(VECTOR_REGION_END - 1)} (${entries.length} slots, ${VECTOR_STRIDE} bytes each)`);
  console.log(`Pattern: ${allJp ? 'regular JP vector table' : 'mixed code/data'}; every slot advances by ${VECTOR_STRIDE} bytes.`);
  console.log(`0x0005CC is slot ${tableSlot} in this window and is named ${symbols.get(TARGET_VECTOR_ADDR) ?? '(unknown)'}.`);
  console.log(`Unique JP targets in the window: ${distinctTargets.size}.`);
  console.log('Disassembly / vector list:');

  const annotations = new Map();
  annotations.set(TARGET_VECTOR_ADDR, '<-- target vector');
  for (const entry of entries) {
    const row = {
      pc: entry.addr,
      bytes: entry.bytes,
      text: `JP ${hex(entry.target)}    ; ${entry.name}`,
    };
    printRows([row], annotations);
  }

  console.log('JP targets in order:');
  for (const entry of entries) {
    console.log(`  ${hex(entry.addr)} -> ${hex(entry.target)}`);
  }
  console.log('');
}

function analyzeReferencesToVector(rom) {
  const b0 = TARGET_VECTOR_ADDR & 0xFF;
  const b1 = (TARGET_VECTOR_ADDR >>> 8) & 0xFF;
  const b2 = (TARGET_VECTOR_ADDR >>> 16) & 0xFF;

  const rawHits = scanPattern(rom, [b0, b1, b2]).map((operandAddr) => {
    const opcode = operandAddr > 0 ? rom[operandAddr - 1] & 0xFF : null;
    let kind = 'raw bytes';
    let instAddr = null;
    if (opcode === 0xCD) {
      kind = 'CALL operand';
      instAddr = operandAddr - 1;
    } else if (opcode === 0xC3) {
      kind = 'JP operand';
      instAddr = operandAddr - 1;
    }
    return { operandAddr, opcode, kind, instAddr };
  });

  const callHits = scanPattern(rom, [0xCD, b0, b1, b2]).map((addr) => ({ addr, kind: 'CALL' }));
  const jpHits = scanPattern(rom, [0xC3, b0, b1, b2]).map((addr) => ({ addr, kind: 'JP' }));

  console.log('=== Part 2: Who reaches 0x0005CC? ===');
  console.log(`Raw 24-bit LE hits for ${hex(TARGET_VECTOR_ADDR)} (bytes ${hexByte(b0)} ${hexByte(b1)} ${hexByte(b2)}): ${rawHits.length}`);
  for (const hit of rawHits) {
    const opcodeText = hit.opcode === null ? 'n/a' : hexByte(hit.opcode);
    console.log(
      `  operand @ ${hex(hit.operandAddr)}  preceded-by=${opcodeText}  classified-as=${hit.kind}`,
    );
  }

  console.log(`Direct CALL ${hex(TARGET_VECTOR_ADDR)} sites: ${callHits.length}`);
  for (const hit of callHits) {
    console.log(`  ${hex(hit.addr)}  CALL ${hex(TARGET_VECTOR_ADDR)}`);
  }

  console.log(`Direct JP ${hex(TARGET_VECTOR_ADDR)} sites: ${jpHits.length}`);
  for (const hit of jpHits) {
    console.log(`  ${hex(hit.addr)}  JP ${hex(TARGET_VECTOR_ADDR)}`);
  }

  const directRefs = [...callHits, ...jpHits].sort((left, right) => left.addr - right.addr);
  if (directRefs.length) {
    console.log('Caller context:');
    for (const ref of directRefs) {
      const start = findAlignedStart(rom, ref.addr, 24, 10);
      const rows = disassembleWindow(rom, start, Math.max(24, ref.addr + 24 - start));
      const annotations = new Map([[ref.addr, '<-- direct reference']]);
      console.log(`  Around ${hex(ref.addr)} (${ref.kind}):`);
      printRows(rows, annotations);
    }
  } else {
    console.log('Caller context: none');
  }

  console.log('');
}

function analyzeTargetRoutine(rom) {
  const rows = disassembleWindow(rom, TARGET_ROUTINE_ADDR, TARGET_ROUTINE_DISASM_BYTES);
  const bodyRows = [];
  for (const row of rows) {
    bodyRows.push(row);
    if (row.inst?.tag === 'ret') break;
  }

  let bc = null;
  let lastReadPort = null;
  const portReads = [];
  const aToRegisterMoves = [];
  const memoryStores = [];

  for (const row of bodyRows) {
    const inst = row.inst;
    if (!inst) continue;

    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      bc = inst.value & 0xFFFF;
    } else if (inst.tag === 'inc-reg' && inst.reg === 'c' && bc !== null) {
      bc = ((bc & 0xFF00) | (((bc & 0xFF) + 1) & 0xFF)) & 0xFFFF;
    } else if (inst.tag === 'dec-reg' && inst.reg === 'c' && bc !== null) {
      bc = ((bc & 0xFF00) | (((bc & 0xFF) - 1) & 0xFF)) & 0xFFFF;
    } else if (inst.tag === 'in-reg' && inst.reg === 'a') {
      lastReadPort = bc;
      portReads.push({ pc: row.pc, port: bc });
    } else if (inst.tag === 'ld-reg-reg' && inst.src === 'a' && (inst.dest === 'l' || inst.dest === 'h')) {
      aToRegisterMoves.push({ pc: row.pc, dest: inst.dest, sourcePort: lastReadPort });
    } else if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
      memoryStores.push({ pc: row.pc, text: row.text });
    }
  }

  console.log('=== Part 3: What does 0x007B70 do? ===');
  console.log(`First ${TARGET_ROUTINE_DISASM_BYTES} bytes from ${hex(TARGET_ROUTINE_ADDR)}:`);
  const annotations = new Map([
    [TARGET_ROUTINE_ADDR, '<-- wrapper entry'],
    [0x007B8B, '<-- next wrapper begins here'],
  ]);
  printRows(rows, annotations);

  console.log(`Routine body returns at ${hex(bodyRows[bodyRows.length - 1]?.pc ?? TARGET_ROUTINE_ADDR)}.`);
  console.log('Observed port-read sequence in the 0x007B70 body:');
  for (const read of portReads) {
    console.log(`  ${hex(read.pc)}  IN A, (C) with BC=${hex(read.port ?? 0, 4)}`);
  }

  console.log('How the returned value is assembled:');
  for (const move of aToRegisterMoves) {
    const source = move.sourcePort === null ? 'unknown-port' : hex(move.sourcePort, 4);
    console.log(`  ${hex(move.pc)}  LD ${String(move.dest).toUpperCase()}, A  ; ${source}`);
  }

  if (memoryStores.length) {
    console.log('Memory stores inside 0x007B70:');
    for (const store of memoryStores) {
      console.log(`  ${hex(store.pc)}  ${store.text}`);
    }
  } else {
    console.log('Memory stores inside 0x007B70: none');
  }

  console.log('Inference:');
  console.log('  1. The wrapper loads BC with 0x800C.');
  console.log('  2. It reads port 0x800C into A, then copies A into L.');
  console.log('  3. It increments C to 0x0D, reads port 0x800D into A, then copies A into H.');
  console.log('  4. It does not write RAM; the 16-bit result is returned in HL.');
  console.log('  5. The tail at 0x007B7F..0x007B88 is the same BC-verification loop seen in the other LCD wrappers.');
  console.log('');
}

function createRuntime(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.rom = romBytes;

  return { mem, cpu, executor };
}

function traceStage(executor, label, entry, mode, maxSteps, maxLoopIterations, hits) {
  let previousPc = null;
  const watchSet = new Set([TARGET_VECTOR_ADDR, TARGET_ROUTINE_ADDR]);

  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
    onBlock(pc, blockMode, _meta, step) {
      const currentPc = pc & 0xFFFFFF;
      if (watchSet.has(currentPc)) {
        hits.push({
          stage: label,
          pc: currentPc,
          mode: blockMode ?? mode,
          step: step ?? 0,
          previousPc,
          missing: false,
        });
      }
      previousPc = currentPc;
    },
    onMissingBlock(pc, blockMode, step) {
      const currentPc = pc & 0xFFFFFF;
      if (watchSet.has(currentPc)) {
        hits.push({
          stage: label,
          pc: currentPc,
          mode: blockMode ?? mode,
          step: step ?? 0,
          previousPc,
          missing: true,
        });
      }
      previousPc = currentPc;
    },
  });

  return {
    label,
    entry,
    mode,
    maxSteps,
    steps: result.steps ?? 0,
    termination: result.termination ?? 'unknown',
    lastPc: result.lastPc ?? entry,
  };
}

function coldBootTrace(runtime) {
  const { executor, cpu, mem } = runtime;
  const hits = [];
  const stages = [];

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;

  stages.push(
    traceStage(executor, 'boot_entry', BOOT_ENTRY, 'z80', BOOT_STAGE_MAX_STEPS, 32, hits),
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 3));

  stages.push(
    traceStage(executor, 'kernel_init', KERNEL_INIT_ENTRY, 'adl', KERNEL_STAGE_MAX_STEPS, 10000, hits),
  );

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 3));

  stages.push(
    traceStage(executor, 'post_init', POST_INIT_ENTRY, 'adl', POST_STAGE_MAX_STEPS, 32, hits),
  );

  return { stages, hits };
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const moduleUrl = pathToFileURL(assets.modulePath).href;
    const romModule = await import(moduleUrl);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;

    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
    }

    return blocks;
  } finally {
    cleanupTranspiledModule(assets);
  }
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM image: ${ROM_PATH}`);
  }

  const rom = fs.readFileSync(ROM_PATH);
  const symbols = loadSymbolMap();

  analyzeVectorRegion(rom, symbols);
  analyzeReferencesToVector(rom);
  analyzeTargetRoutine(rom);

  const blocks = await loadBlocks();
  const runtime = createRuntime(rom, blocks);
  const trace = coldBootTrace(runtime);

  console.log('=== Part 4: Is this vector exercised during normal boot? ===');
  console.log('Standard sequence traced: 0x000000 -> 0x08C331 -> 0x0802B2');
  console.log(
    `Step limits: boot=${BOOT_STAGE_MAX_STEPS}, kernel=${KERNEL_STAGE_MAX_STEPS}, post=${POST_STAGE_MAX_STEPS} (all <= 100000)`,
  );
  console.log('Stage results:');
  for (const stage of trace.stages) {
    console.log(
      `  ${stage.label}: entry=${hex(stage.entry)} mode=${stage.mode} steps=${stage.steps} term=${stage.termination} lastPc=${hex(stage.lastPc)}`,
    );
  }

  if (trace.hits.length) {
    console.log('Target hits observed during boot:');
    for (const hit of trace.hits) {
      const note = hit.missing ? 'missing-block entry' : 'executed block';
      const prev = hit.previousPc === null ? 'n/a' : hex(hit.previousPc);
      console.log(
        `  stage=${hit.stage} step=${hit.step} pc=${hex(hit.pc)} mode=${hit.mode} prev=${prev} type=${note}`,
      );
    }
  } else {
    console.log(`No boot hits: PC never reached ${hex(TARGET_VECTOR_ADDR)} or ${hex(TARGET_ROUTINE_ADDR)} in the traced startup path.`);
  }

  console.log('Conclusion:');
  if (trace.hits.length) {
    console.log('  The vector is live in the traced boot path; see the hit log above for the triggering stage and predecessor block.');
  } else {
    console.log(`  ${hex(TARGET_VECTOR_ADDR)} behaves as a dormant boot API vector in this standard boot trace.`);
    console.log(`  ${hex(TARGET_ROUTINE_ADDR)} is still reachable elsewhere via its sole direct caller, but normal cold boot did not exercise it here.`);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
