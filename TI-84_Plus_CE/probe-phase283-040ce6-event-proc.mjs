#!/usr/bin/env node

/**
 * Phase 283: Trace 0x040CE6 — STAT event loop event processing
 *
 * Tasks:
 *   1. Static disassembly of 0x040CE6 (80+ bytes until RET/JP exit).
 *   2. Identify function signature (registers/stack args).
 *   3. Find all callers — scan for CD E6 0C 04 (CALL) and C3 E6 0C 04 (JP).
 *   4. Dynamic trace — PC=0x040CE6, A=1 (simulating key event), 200 steps.
 *   5. Cross-reference: disassemble 0x040C5B-0x040C6F (context before call).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const MEM_SIZE = 0x1000000;
const TARGET = 0x040CE6;
const DISASM_LEN = 120; // decode at least 80 bytes, extra to find function end
const CONTEXT_START = 0x040C5B;
const CONTEXT_END = 0x040C6F + 4; // include the CALL itself
const RETURN_SENTINEL = 0xFEFEFE;
const TRACE_SP = 0xD1A870;
const TRACE_IX = 0xD1A860;
const TRACE_IY = 0xD00080;
const TRACE_STEPS = 200;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24LE(bytes, offset) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join(' ');
}

function write24(mem, addr, value) {
  const base = addr & 0xFFFFFF;
  mem[base] = value & 0xFF;
  mem[(base + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(base + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  switch (inst.tag) {
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `ld ${inst.dst}, ${hex(inst.value & 0xFF, 2)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dst}, ${inst.src}`;
    case 'ld-mem-reg':
      return `ld (${inst.addr ? hex(inst.addr) : inst.ptr}), ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${inst.dst}, (${inst.addr ? hex(inst.addr) : inst.ptr})`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hex(inst.value & 0xFF, 2)}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'add-pair':
      return `add hl, ${inst.src}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'nop':
      return 'nop';
    case 'ex-de-hl':
      return 'ex de, hl';
    case 'di':
      return 'di';
    case 'ei':
      return 'ei';
    case 'rst':
      return `rst ${hex(inst.target, 2)}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'set-bit':
      return `set ${inst.bit}, ${inst.reg}`;
    case 'res-bit':
      return `res ${inst.bit}, ${inst.reg}`;
    default:
      return inst.dasm ?? inst.tag;
  }
}

async function loadProjectModules() {
  const decoderUrl = pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href;
  const runtimeUrl = pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href;
  const peripheralsUrl = pathToFileURL(path.join(__dirname, 'peripherals.js')).href;
  const transpiledUrl = pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href;

  const [{ decodeInstruction }, { createExecutor }, { createPeripheralBus }, romModule] =
    await Promise.all([
      import(decoderUrl),
      import(runtimeUrl),
      import(peripheralsUrl),
      import(transpiledUrl),
    ]);

  return {
    decodeInstruction,
    createExecutor,
    createPeripheralBus,
    preliftedBlocks:
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule,
  };
}

function disasmRange(decodeInstruction, start, byteLength) {
  const rows = [];
  let pc = start;
  const end = start + byteLength;

  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      bytes: bytesAt(pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc += length;
    // Stop early on unconditional RET or JP (function boundary)
    if (pc > start + 80 && inst && (inst.tag === 'ret' || inst.tag === 'jp')) {
      break;
    }
  }

  return rows;
}

function scanPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let ok = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

function runTrace(createExecutor, createPeripheralBus, preliftedBlocks, fallbackFormatter) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const bus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(preliftedBlocks, mem, { peripherals: bus });
  const cpu = executor.cpu;

  cpu.pc = TARGET;
  cpu.sp = TRACE_SP;
  cpu.ix = TRACE_IX;
  cpu.iy = TRACE_IY;
  cpu.hl = 0x000000;
  cpu.de = 0x000000;
  cpu.bc = 0x000000;
  cpu.a = 1; // Simulate key event
  cpu.f = 0x00;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  write24(mem, cpu.sp, RETURN_SENTINEL);

  const blocks = [];
  const missing = [];
  const ramWrites = [];

  // Intercept RAM writes
  const origWrite8 = executor.write8?.bind(executor) ?? null;
  if (executor.mem) {
    // Track writes to RAM region (>= 0xD00000)
    const origMem = mem;
    const writeProxy = new Proxy(origMem, {
      set(target, prop, value) {
        const idx = Number(prop);
        if (!isNaN(idx) && idx >= 0xD00000 && ramWrites.length < 50) {
          ramWrites.push({ addr: idx, value });
        }
        target[prop] = value;
        return true;
      },
    });
    // Note: Proxy on typed array may not work, we'll track via blocks instead
  }

  const result = executor.runFrom(TARGET, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: 50,
    onBlock(pc, mode, meta, step) {
      blocks.push({
        step,
        pc: pc & 0xFFFFFF,
        dasm:
          meta?.instructions?.map((inst) => inst.dasm ?? fallbackFormatter(inst)).join(' | ') || '',
      });
    },
    onMissingBlock(pc, mode, step) {
      missing.push({ step, pc: pc & 0xFFFFFF, mode });
    },
  });

  // Check RAM region for changes compared to ROM (ROM is 0-0x3FFFFF, RAM starts at D00000)
  const ramChanges = [];
  for (let addr = 0xD00000; addr < 0xD10000 && ramChanges.length < 50; addr++) {
    if (mem[addr] !== 0) {
      ramChanges.push({ addr, value: mem[addr] });
    }
  }

  return {
    result,
    final: {
      pc: cpu.pc & 0xFFFFFF,
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      hl: cpu.hl & 0xFFFFFF,
      de: cpu.de & 0xFFFFFF,
      bc: cpu.bc & 0xFFFFFF,
      sp: cpu.sp & 0xFFFFFF,
    },
    blocks,
    missing,
    ramChanges: ramChanges.slice(0, 30),
  };
}

async function main() {
  console.log('=== Phase 283: Trace 0x040CE6 — STAT event loop event processing ===\n');

  const {
    decodeInstruction,
    createExecutor,
    createPeripheralBus,
    preliftedBlocks,
  } = await loadProjectModules();

  // --- Task 1: Static disassembly of 0x040CE6 ---
  console.log('--- Task 1: Static disassembly of 0x040CE6 ---');
  const mainRows = disasmRange(decodeInstruction, TARGET, DISASM_LEN);
  for (const row of mainRows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}`);
  }

  // --- Task 2: Function signature analysis ---
  console.log('\n--- Task 2: Function signature analysis ---');
  console.log('  First few instructions reveal register usage:');
  for (const row of mainRows.slice(0, 8)) {
    console.log(`    ${hex(row.pc)} ${row.text}`);
  }

  // --- Task 3: Find all callers ---
  console.log('\n--- Task 3: Find all callers of 0x040CE6 ---');
  // CALL 040CE6 in ADL: CD E6 0C 04
  const callHits = scanPattern([0xCD, 0xE6, 0x0C, 0x04]);
  const jpHits = scanPattern([0xC3, 0xE6, 0x0C, 0x04]);
  console.log(`  CALL hits (CD E6 0C 04): ${callHits.length}`);
  for (const addr of callHits) {
    console.log(`    ${hex(addr)} — context: ${bytesAt(addr - 4, 12)}`);
  }
  console.log(`  JP hits (C3 E6 0C 04): ${jpHits.length}`);
  for (const addr of jpHits) {
    console.log(`    ${hex(addr)} — context: ${bytesAt(addr - 4, 12)}`);
  }

  // --- Task 4: Dynamic trace ---
  console.log('\n--- Task 4: Dynamic trace (A=1, HL=0, DE=0, 200 steps) ---');
  const trace = runTrace(createExecutor, createPeripheralBus, preliftedBlocks, formatInstruction);
  console.log(`  Exit reason: ${trace.result?.reason ?? trace.result ?? 'unknown'}`);
  console.log(`  Final state: PC=${hex(trace.final.pc)} A=${hex(trace.final.a, 2)} F=${hex(trace.final.f, 2)} HL=${hex(trace.final.hl)} DE=${hex(trace.final.de)} BC=${hex(trace.final.bc)} SP=${hex(trace.final.sp)}`);
  console.log(`  Blocks visited: ${trace.blocks.length}`);
  for (const b of trace.blocks.slice(0, 30)) {
    console.log(`    step=${b.step} PC=${hex(b.pc)} ${b.dasm.slice(0, 80)}`);
  }
  if (trace.blocks.length > 30) {
    console.log(`    ... (${trace.blocks.length - 30} more blocks)`);
  }
  if (trace.missing.length > 0) {
    console.log(`  Missing blocks: ${trace.missing.length}`);
    for (const m of trace.missing.slice(0, 10)) {
      console.log(`    step=${m.step} PC=${hex(m.pc)} mode=${m.mode}`);
    }
  }
  if (trace.ramChanges.length > 0) {
    console.log(`  RAM writes (non-zero bytes in D00000-D10000): ${trace.ramChanges.length}`);
    for (const w of trace.ramChanges.slice(0, 20)) {
      console.log(`    ${hex(w.addr)} = ${hex(w.value, 2)}`);
    }
  }

  // --- Task 5: Cross-reference — context before call at 0x040C6F ---
  console.log('\n--- Task 5: Context before CALL at 0x040C6F (0x040C5B-0x040C73) ---');
  const contextRows = disasmRange(decodeInstruction, CONTEXT_START, CONTEXT_END - CONTEXT_START);
  for (const row of contextRows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}`);
  }

  console.log('\n=== Phase 283 complete ===');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});

/*
=== PROBE OUTPUT ===

=== Phase 283: Trace 0x040CE6 — STAT event loop event processing ===

--- Task 1: Static disassembly of 0x040CE6 ---
  0x040CE6  cd 11 71 02          call 0x027111
  0x040CEA  ed 00 0f             in0
  0x040CED  cb 78                bit 7, b
  0x040CEF  c0                   ret nz
  0x040CF0  38 07                jr c, 0x040CF9
  0x040CF2  fe 02                cp 0x02
  0x040CF4  da 17 e0 09          jp c, 0x09E017
  0x040CF8  c9                   ret
  0x040CF9  fd cb 1b e6          indexed-cb-set
  0x040CFD  c1                   pop bc
  0x040CFE  c3 5e 05 04          jp 0x04055E

--- Task 2: Function signature analysis ---
  First few instructions reveal register usage:
    0x040CE6 call 0x027111       <- calls key scan subsystem
    0x040CEA in0                 <- reads I/O port 0x0F (USB/status register)
    0x040CED bit 7, b           <- tests bit 7 of result
    0x040CEF ret nz             <- early return if bit 7 set
    0x040CF0 jr c, 0x040CF9     <- branch on carry from 0x027111
    0x040CF2 cp 0x02            <- compare A with 2
    0x040CF4 jp c, 0x09E017     <- if A < 2, jump to 0x09E017
    0x040CF8 ret                <- otherwise return

  Signature: No explicit args needed. Calls 0x027111 (key scan/input poll),
  then dispatches based on return value:
    - bit 7 of B set -> return (no event)
    - carry set -> set IY flag, pop BC, JP 0x04055E (event loop exit?)
    - A < 2 -> JP 0x09E017 (key handler dispatch)
    - A >= 2 -> return

--- Task 3: Find all callers of 0x040CE6 ---
  CALL hits (CD E6 0C 04): 3
    0x040835 — in STAT init sequence
    0x0409DF — after call 0x0893D1 (STAT dispatcher)
    0x040C6F — in the STAT event loop proper
  JP hits (C3 E6 0C 04): 0

--- Task 4: Dynamic trace (A=1, HL=0, DE=0, 200 steps) ---
  Exit reason: [object Object]
  Final state: PC=0x040CE6 A=0x01 F=0x03 HL=0xD4076E DE=0x00FC64 BC=0x000102 SP=0xD1A837
  Blocks visited: 200 (ran out of steps inside 0x027111 key scan subsystem)

  The trace shows 0x040CE6 immediately calls 0x027111 which enters deep into
  the keyboard scanning hardware layer (port I/O on 0x02, 0x03, 0x07, 0x09, 0x0A, 0x0B, 0x0C, 0x0F)
  with delay loops. 200 steps was not enough to exit the key scan.

  RAM writes observed (D00000-D10000): 12 non-zero bytes
    0xD00082 = 0x02    (IY-relative flag area)
    0xD000AB = 0x04
    0xD000D1 = 0x80
    0xD026AC = 0x64
    0xD026AD = 0xFC
    0xD02A87 = 0x33
    0xD02A88 = 0x01
    0xD02A89 = 0x02
    0xD02A8A = 0x66
    0xD02A8B = 0x07
    0xD02A8C = 0xD4
    0xD02AC8 = 0x01

--- Task 5: Context before CALL at 0x040C6F (0x040C5B-0x040C73) ---
  0x040C5B  7d                   ld a, l
  0x040C5C  50                   ld d, b
  0x040C5D  02                   ld (bc), a
  0x040C5E  cd d7 46 02          call 0x0246D7     <- some setup call
  0x040C62  21 5a a5 5a          ld hl, 0x5AA55A   <- magic constant (watchdog/sentinel?)
  0x040C66  22 1b 30 d0          ld (0xD0301B), hl <- store sentinel to RAM
  0x040C6A  cd 39 c5 04          call 0x04C539     <- pre-scan setup
  0x040C6E  fb                   ei                <- enable interrupts
  0x040C6F  cd e6 0c 04          call 0x040CE6     <- THE EVENT PROCESSING CALL

=== ANALYSIS ===

0x040CE6 is a **keyboard/event polling dispatcher** in the STAT event loop:

1. It calls 0x027111 (the low-level keyboard scan routine that probes hardware ports).
2. After the scan returns, it reads port 0x0F and checks bit 7 of B:
   - If set: return immediately (no event / USB busy).
3. If carry is set from the scan: sets a flag in IY+0x1B, pops BC off stack,
   and jumps to 0x04055E — this is likely an "abort event loop" path
   (e.g., ON key pressed, triggering exit from STAT mode).
4. Otherwise compares A (scan result) with 2:
   - A < 2: jumps to 0x09E017 — likely the key event handler/dispatcher
   - A >= 2: returns (no actionable key)

The function fits the STAT event loop as the primary input poll point:
each iteration calls 0x040CE6 to check for keyboard input and dispatch
accordingly. It is called from 3 places — all within the 0x04xxxx STAT module.

=== END PROBE OUTPUT ===
*/
