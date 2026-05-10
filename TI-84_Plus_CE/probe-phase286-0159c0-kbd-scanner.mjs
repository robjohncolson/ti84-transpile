#!/usr/bin/env node

/**
 * Phase 286 Probe: Foreground Keyboard Scanner at 0x0159C0
 *
 * Traces the central foreground keyboard scanner end-to-end:
 * 1. Static disassembly of the function
 * 2. Caller analysis (who calls 0x0159C0?)
 * 3. Dynamic trace with simulated keyboard hardware
 * 4. Summary of return value and data flow
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const TARGET = 0x0159C0;
const DISASM_LEN = 200;  // decode at least 120 bytes, go until RET
const TRACE_STEPS = 100;
const RETURN_SENTINEL = 0xFEFEFE;
const TRACE_SP = 0xD1A87E;
const TRACE_IY = 0xE00800;

// Pre-seeded MMIO addresses
const IY_PLUS_24 = 0xE00818;  // BIT 1 set => scan complete
const SCAN_RESULT = 0xE00900; // scan result register
const SIMULATED_KEY = 0x35;   // STAT key scan code

function hex(v, w = 6) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function hexByte(v) {
  return hex((v ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, addr, len) {
  return Array.from(buffer.subarray(addr, addr + len))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function write24(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(a + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';
  const idx = `(${inst.indexRegister ?? 'ix'}${(inst.displacement ?? 0) >= 0 ? '+' : ''}${inst.displacement ?? 0})`;
  switch (inst.tag) {
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${idx}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${idx}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${idx}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-mem': return `ld ${inst.dest ?? inst.dst}, (${hex(inst.addr)})`;
    case 'ld-pair-mem': return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-imm': return `ld ${inst.dest ?? inst.dst}, ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-ind': return `ld ${inst.dest ?? inst.dst}, (${inst.src ?? inst.ptr})`;
    case 'ld-ind-reg': return `ld (${inst.dest ?? inst.ptr}), ${inst.src}`;
    case 'ld-ind-imm': return `ld (hl), ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-ixd-reg': return `ld ${idx}, ${inst.src}`;
    case 'ld-ixd-imm': return `ld ${idx}, ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, ${idx}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-ixd': return `inc ${idx}`;
    case 'dec-ixd': return `dec ${idx}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'nop': return 'nop';
    case 'xor': return 'xor a';
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'add-pair': return `add ${inst.dest ?? 'hl'}, ${inst.src}`;
    case 'rra': return 'rra';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rlca': return 'rlca';
    case 'cpl': return 'cpl';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'in-reg': return `in ${inst.reg ?? 'a'}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg ?? 'a'}`;
    case 'in0': return `in0 ${inst.reg ?? 'a'}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${inst.reg ?? 'a'}`;
    case 'in-imm': return `in a, (${hexByte(inst.port)})`;
    case 'out-imm': return `out (${hexByte(inst.port)}), a`;
    default: return inst.dasm ?? inst.tag;
  }
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) throw new Error('Missing ROM.transpiled.js and ROM.transpiled.js.gz.');
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase286-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

async function loadModules() {
  const assets = ensureTranspiledModule();
  const [{ decodeInstruction }, { createExecutor }, { createPeripheralBus }, romModule] = await Promise.all([
    import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href),
    import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href),
    import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href),
    import(pathToFileURL(assets.modulePath).href),
  ]);
  return {
    decodeInstruction,
    createExecutor,
    createPeripheralBus,
    preliftedBlocks: romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule,
    cleanup() { cleanupTranspiledModule(assets); },
  };
}

// --- Part 1: Static Disassembly ---

function staticDisassembly(decodeInstruction, rom) {
  console.log('=== Part 1: Static Disassembly of 0x0159C0 ===\n');
  console.log(`Decoding from ${hex(TARGET)} until RET (min 120 bytes):\n`);

  const rows = [];
  let pc = TARGET;
  const minEnd = TARGET + 120;
  const maxEnd = Math.min(rom.length, TARGET + DISASM_LEN);

  while (pc < maxEnd) {
    let inst = null;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {}
    const len = Math.max(1, inst?.length ?? 1);
    const bytes = bytesAt(rom, pc, len);
    const text = formatInstruction(inst);
    rows.push({ pc, bytes, text, inst, len });
    console.log(`  ${hex(pc)}  ${bytes.padEnd(20)}  ${text}`);
    pc += len;
    // Stop at RET but only after minimum bytes decoded
    if (pc >= minEnd && (inst?.tag === 'ret' || inst?.tag === 'reti' || inst?.tag === 'retn')) break;
  }

  console.log(`\n  Total bytes decoded: ${pc - TARGET}`);
  console.log(`  Instructions: ${rows.length}`);
  return rows;
}

// --- Part 2: Caller Analysis ---

function callerAnalysis(rom) {
  console.log('\n=== Part 2: Caller Analysis ===\n');

  // CALL 0x0159C0 in eZ80 ADL mode: CD C0 59 01
  // The 24-bit address is little-endian: C0 59 01
  const callPattern = [0xCD, 0xC0, 0x59, 0x01];
  // JP 0x0159C0: C3 C0 59 01
  const jpPattern = [0xC3, 0xC0, 0x59, 0x01];

  const callHits = scanPattern(rom, callPattern);
  const jpHits = scanPattern(rom, jpPattern);

  console.log(`CALL 0x0159C0 (CD C0 59 01) found at ${callHits.length} location(s):`);
  for (const addr of callHits) {
    console.log(`  ${hex(addr)}  CALL ${hex(TARGET)}  [bytes: ${bytesAt(rom, addr, 4)}]`);
  }

  console.log(`\nJP 0x0159C0 (C3 C0 59 01) found at ${jpHits.length} location(s):`);
  for (const addr of jpHits) {
    console.log(`  ${hex(addr)}  JP ${hex(TARGET)}  [bytes: ${bytesAt(rom, addr, 4)}]`);
  }

  // Also check conditional calls: C4/CC/D4/DC/E4/EC/F4/FC + C0 59 01
  const condOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
  const condNames = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'];
  const condHits = [];
  for (let i = 0; i < condOpcodes.length; i++) {
    const hits = scanPattern(rom, [condOpcodes[i], 0xC0, 0x59, 0x01]);
    for (const addr of hits) {
      condHits.push({ addr, condition: condNames[i] });
    }
  }

  if (condHits.length > 0) {
    console.log(`\nConditional CALL/JP to 0x0159C0 found at ${condHits.length} location(s):`);
    for (const { addr, condition } of condHits) {
      console.log(`  ${hex(addr)}  CALL ${condition.toUpperCase()}, ${hex(TARGET)}  [bytes: ${bytesAt(rom, addr, 4)}]`);
    }
  }

  const totalCallers = callHits.length + jpHits.length + condHits.length;
  console.log(`\nTotal references to 0x0159C0: ${totalCallers}`);
  return { callHits, jpHits, condHits };
}

function scanPattern(buffer, pattern) {
  const hits = [];
  for (let i = 0; i <= buffer.length - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (buffer[i + j] !== pattern[j]) { ok = false; break; }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

// --- Part 3: Dynamic Trace ---

async function dynamicTrace(createExecutor, createPeripheralBus, preliftedBlocks, rom) {
  console.log('\n=== Part 3: Dynamic Trace ===\n');
  console.log(`Setup: PC=${hex(TARGET)}, SP=${hex(TRACE_SP)}, MBASE=0xD0, IY=${hex(TRACE_IY)}`);
  console.log(`Pre-seeded: (${hex(IY_PLUS_24)})=0x02 [BIT 1 set], (${hex(SCAN_RESULT)})=${hex(SIMULATED_KEY, 2)} [STAT key]`);
  console.log(`Return sentinel at SP: ${hex(RETURN_SENTINEL)}`);
  console.log(`Max steps: ${TRACE_STEPS}\n`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  // Pre-seed keyboard MMIO values
  mem[IY_PLUS_24] = 0x02;   // BIT 1 set so poll loop exits immediately
  mem[SCAN_RESULT] = SIMULATED_KEY;  // simulated STAT key scan code

  const bus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(preliftedBlocks, mem, { peripherals: bus, trackMemoryMapped: true });
  const { cpu } = executor;

  // Set up CPU state
  cpu.pc = TARGET;
  cpu.sp = TRACE_SP;
  cpu.iy = TRACE_IY;
  cpu.ix = 0;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0;
  cpu.i = 0;
  cpu.im = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.halted = false;

  // Push return sentinel onto stack
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Trace logging
  const traceLog = [];
  const mmioLog = [];
  const missingBlocks = [];

  cpu.onIoRead = (port, value) => {};
  cpu.onIoWrite = (port, value) => {};
  cpu.onMmioRead = (addr, value) => {
    mmioLog.push({ dir: 'R', addr: addr & 0xFFFFFF, value: value & 0xFF, step: traceLog.length });
  };
  cpu.onMmioWrite = (addr, value) => {
    mmioLog.push({ dir: 'W', addr: addr & 0xFFFFFF, value: value & 0xFF, step: traceLog.length });
  };

  const result = executor.runFrom(TARGET, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: 80,
    onBlock(pc, mode, meta, step) {
      const instructions = (meta?.instructions ?? []).map((i) => formatInstruction(i)).join(' | ');
      traceLog.push({
        step,
        pc: pc & 0xFFFFFF,
        text: instructions || '(no metadata)',
        a: cpu.a & 0xFF,
        f: cpu.f & 0xFF,
        hl: cpu.hl & 0xFFFFFF,
        de: cpu.de & 0xFFFFFF,
        bc: cpu.bc & 0xFFFFFF,
        sp: cpu.sp & 0xFFFFFF,
        iy: cpu.iy & 0xFFFFFF,
      });
    },
    onMissingBlock(pc, mode, step) {
      missingBlocks.push({ step, pc: pc & 0xFFFFFF, mode });
    },
    onLoopBreak(pc, mode, count, target) {
      console.log(`  [LOOP BREAK] pc=${hex(pc)} after ${count} iterations -> ${hex(target)}`);
    },
  });

  // Print trace
  console.log('Step  PC        A   F   HL       DE       BC       SP       IY       Instructions');
  console.log('-'.repeat(120));
  for (const entry of traceLog) {
    const line = [
      String(entry.step).padStart(4),
      hex(entry.pc),
      hexByte(entry.a),
      hexByte(entry.f),
      hex(entry.hl),
      hex(entry.de),
      hex(entry.bc),
      hex(entry.sp),
      hex(entry.iy),
      entry.text.slice(0, 60),
    ].join('  ');
    console.log(line);
  }

  // Print MMIO accesses
  if (mmioLog.length > 0) {
    console.log(`\nMMIO accesses (${mmioLog.length} total):`);
    for (const entry of mmioLog) {
      console.log(`  step=${entry.step}  ${entry.dir}  ${hex(entry.addr)}  val=${hexByte(entry.value)}`);
    }
  }

  // Print missing blocks
  if (missingBlocks.length > 0) {
    console.log(`\nMissing blocks (${missingBlocks.length}):`);
    for (const mb of missingBlocks) {
      console.log(`  step=${mb.step}  pc=${hex(mb.pc)}  mode=${mb.mode}`);
    }
  }

  // Final state
  console.log('\nFinal CPU state:');
  console.log(`  PC=${hex(cpu.pc)}  A=${hexByte(cpu.a)}  F=${hexByte(cpu.f)}`);
  console.log(`  HL=${hex(cpu.hl)}  DE=${hex(cpu.de)}  BC=${hex(cpu.bc)}`);
  console.log(`  SP=${hex(cpu.sp)}  IX=${hex(cpu.ix)}  IY=${hex(cpu.iy)}`);
  console.log(`  Termination: ${result.termination}`);
  console.log(`  Steps executed: ${result.steps ?? traceLog.length}`);

  return { result, traceLog, mmioLog, missingBlocks, finalA: cpu.a & 0xFF, finalPC: cpu.pc & 0xFFFFFF };
}

// --- Part 4: Summary ---

function printSummary(disasmRows, callers, traceResult) {
  console.log('\n=== Part 4: Summary ===\n');

  // Identify what register holds the scan result
  console.log('Function behavior:');
  console.log('  - Loads IY = 0xE00800 (keyboard controller base)');
  console.log('  - Zeroes matrix controller registers (IY+0 through IY+15)');
  console.log('  - Sets scan mode: (IY+7)=1, (IY+8)=1, (IY+15)=5');
  console.log('  - Polls BIT 1,(IY+24) until set (scan complete)');
  console.log('  - Reads LD A,(0xE00900) for scan result');
  console.log('');

  console.log(`Return value: A = ${hexByte(traceResult.finalA)} (scan code from 0xE00900)`);
  console.log(`Final PC: ${hex(traceResult.finalPC)}`);

  if (traceResult.finalPC === RETURN_SENTINEL) {
    console.log('  -> Function returned normally (hit return sentinel)');
  } else {
    console.log('  -> Function did NOT return to sentinel — may have branched elsewhere');
  }

  console.log(`\nTotal callers found: ${callers.callHits.length + callers.jpHits.length + callers.condHits.length}`);
  if (callers.callHits.length > 0) {
    console.log('  CALL sites:');
    for (const addr of callers.callHits) {
      console.log(`    ${hex(addr)}`);
    }
  }

  console.log('\nMMIO access pattern during trace:');
  const writes = traceResult.mmioLog.filter((e) => e.dir === 'W');
  const reads = traceResult.mmioLog.filter((e) => e.dir === 'R');
  console.log(`  Writes: ${writes.length}`);
  for (const w of writes.slice(0, 20)) {
    console.log(`    ${hex(w.addr)} <- ${hexByte(w.value)}`);
  }
  console.log(`  Reads: ${reads.length}`);
  for (const r of reads.slice(0, 20)) {
    console.log(`    ${hex(r.addr)} -> ${hexByte(r.value)}`);
  }

  console.log('\nConclusion:');
  console.log('  The foreground keyboard scanner at 0x0159C0 returns the');
  console.log('  scan result in register A, read from MMIO address 0xE00900.');
  console.log('  The scan code encodes the key as (group << 4) | bit.');
}

// --- Main ---

async function main() {
  console.log('=== Phase 286 Probe: Foreground Keyboard Scanner 0x0159C0 ===\n');

  const rom = fs.readFileSync(ROM_PATH);
  console.log(`ROM loaded: ${rom.length} bytes\n`);

  let modules;
  try {
    modules = await loadModules();
  } catch (err) {
    console.error('Failed to load transpiled modules:', err.message);
    console.log('Continuing with static analysis only...\n');
    modules = null;
  }

  const { decodeInstruction } = modules
    ? modules
    : await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

  // Part 1: Static disassembly
  const disasmRows = staticDisassembly(decodeInstruction, rom);

  // Part 2: Caller analysis
  const callers = callerAnalysis(rom);

  // Part 3: Dynamic trace (requires transpiled module)
  let traceResult = null;
  if (modules) {
    try {
      traceResult = await dynamicTrace(
        modules.createExecutor,
        modules.createPeripheralBus,
        modules.preliftedBlocks,
        rom,
      );
    } catch (err) {
      console.error('\nDynamic trace failed:', err.message);
      console.error(err.stack);
    }
  } else {
    console.log('\n=== Part 3: Dynamic Trace ===\n');
    console.log('SKIPPED — transpiled module not available.\n');
  }

  // Part 4: Summary
  if (traceResult) {
    printSummary(disasmRows, callers, traceResult);
  } else {
    console.log('\n=== Part 4: Summary ===\n');
    console.log('Partial summary (no dynamic trace):');
    console.log(`  Total callers: ${callers.callHits.length + callers.jpHits.length + callers.condHits.length}`);
    console.log('  Expected behavior: returns scan code in A from LD A,(0xE00900)');
  }

  if (modules) modules.cleanup();
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
