#!/usr/bin/env node

/**
 * Phase 284: Trace 0x09E017 — Key Event Handler
 *
 * Tasks:
 *   1. Static disassembly of 0x09E017 (~150 bytes or until function boundary).
 *   2. Find all callers — scan for CALL/JP 0x09E017.
 *   3. Dynamic trace with A=1 (valid scan code < 2), 500 steps.
 *   4. Dynamic trace with A=0 (no key / different scan code), 500 steps.
 *   5. Report: what does 0x09E017 do with key events?
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const MEM_SIZE = 0x1000000;
const TARGET = 0x09E017;
const DISASM_LEN = 200;
const RETURN_SENTINEL = 0xFEFEFE;
const TRACE_SP = 0xD1A87E;
const TRACE_IY = 0xD00080;
const TRACE_STEPS = 500;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
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
      return `ld ${inst.dst ?? inst.dest}, ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dst ?? inst.dest}, ${inst.src}`;
    case 'ld-mem-reg':
      return `ld (${inst.addr ? hex(inst.addr) : inst.ptr}), ${inst.src}`;
    case 'ld-reg-mem':
      return `ld ${inst.dst ?? inst.dest}, (${inst.addr ? hex(inst.addr) : inst.ptr})`;
    case 'ld-mem-pair':
      return `ld (${inst.addr ? hex(inst.addr) : inst.ptr}), ${inst.pair ?? inst.src}`;
    case 'ld-pair-mem':
      return `ld ${inst.pair ?? inst.dst ?? inst.dest}, (${inst.addr ? hex(inst.addr) : inst.ptr})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest ?? inst.ptr}), ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest ?? inst.dst}, (${inst.src ?? inst.ptr})`;
    case 'ld-ind-imm':
      return `ld (hl), ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-sp-pair':
      return `ld sp, ${inst.pair}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest ?? inst.dst}, (${inst.indexRegister ?? 'ix'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ixd-reg':
      return `ld (${inst.indexRegister ?? 'ix'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src}`;
    case 'ld-ixd-imm':
      return `ld (${inst.indexRegister ?? 'ix'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'ld-special':
      return `ld ${inst.dest ?? inst.dst}, ${inst.src}`;
    case 'ld-mb-a':
      return 'ld mb, a';
    case 'ld-a-mb':
      return 'ld a, mb';
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister ?? 'hl'})`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz':
      return `djnz ${hex(inst.target)}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hex((inst.value ?? 0) & 0xFF, 2)}`;
    case 'alu-ixd':
      return `${inst.op} (${inst.indexRegister ?? 'ix'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
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
    case 'adc-pair':
      return `adc hl, ${inst.src}`;
    case 'add-pair':
      return `add hl, ${inst.src}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'reti':
      return 'reti';
    case 'retn':
      return 'retn';
    case 'nop':
      return 'nop';
    case 'ex-de-hl':
      return 'ex de, hl';
    case 'ex-af':
      return "ex af, af'";
    case 'exx':
      return 'exx';
    case 'di':
      return 'di';
    case 'ei':
      return 'ei';
    case 'rst':
      return `rst ${hex(inst.target, 2)}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (hl)`;
    case 'bit-set':
    case 'set-bit':
      return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-res':
    case 'res-bit':
      return `res ${inst.bit}, ${inst.reg}`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, (${inst.indexRegister ?? 'ix'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, (${inst.indexRegister ?? 'ix'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, (${inst.indexRegister ?? 'ix'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'in0':
      return `in0 ${inst.reg ?? 'a'}, (${hex((inst.port ?? 0) & 0xFF, 2)})`;
    case 'out0':
      return `out0 (${hex((inst.port ?? 0) & 0xFF, 2)}), ${inst.reg ?? 'a'}`;
    case 'lea':
      return `lea ${inst.dest ?? inst.dst}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'ldir':
      return 'ldir';
    case 'lddr':
      return 'lddr';
    case 'ldi':
      return 'ldi';
    case 'ldd':
      return 'ldd';
    case 'cpir':
      return 'cpir';
    case 'cpdr':
      return 'cpdr';
    case 'scf':
      return 'scf';
    case 'ccf':
      return 'ccf';
    case 'cpl':
      return 'cpl';
    case 'rra':
      return 'rra';
    case 'rla':
      return 'rla';
    case 'rlca':
      return 'rlca';
    case 'rrca':
      return 'rrca';
    case 'im':
      return `im ${inst.value}`;
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

function runTrace(createExecutor, createPeripheralBus, preliftedBlocks, aValue) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const bus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(preliftedBlocks, mem, { peripherals: bus });
  const cpu = executor.cpu;

  cpu.pc = TARGET;
  cpu.sp = TRACE_SP;
  cpu.ix = 0xD1A860;
  cpu.iy = TRACE_IY;
  cpu.hl = 0x000000;
  cpu.de = 0x000000;
  cpu.bc = 0x000000;
  cpu.a = aValue;
  cpu.f = 0x00;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  // Push return sentinel onto the stack
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Seed keyboard state
  mem[0xD02A87] = 0x31;
  mem[0xD02A88] = 0x01;
  mem[0xD02A89] = 0x02;
  mem[0xD02A8A] = 0x66;
  mem[0xD02A8B] = 0x07;
  mem[0xD02A8C] = 0xD4;
  mem[0xD02AC8] = 0x01;

  // Seed IY-relative flags
  mem[0xD00080] = 0x00;
  mem[0xD00089] = 0x10; // IY+0x09
  mem[0xD0008C] = 0x04; // IY+0x0C
  mem[0xD0008D] = 0x02; // IY+0x0D
  mem[0xD0009B] = 0x40; // IY+0x1B
  mem[0xD000B5] = 0x00; // IY+0x35
  mem[0xD000C4] = 0x00; // IY+0x44
  mem[0xD000CA] = 0x10; // IY+0x4A

  // Snapshot RAM before trace
  const ramBefore = new Uint8Array(0x10000);
  ramBefore.set(mem.subarray(0xD00000, 0xD10000));

  const blocks = [];
  const missing = [];

  const result = executor.runFrom(TARGET, 'adl', {
    maxSteps: TRACE_STEPS,
    maxLoopIterations: 50,
    onBlock(pc, mode, meta, step) {
      blocks.push({
        step,
        pc: pc & 0xFFFFFF,
        dasm:
          meta?.instructions?.map((inst) => inst.dasm ?? formatInstruction(inst)).join(' | ') || '',
      });
    },
    onMissingBlock(pc, mode, step) {
      missing.push({ step, pc: pc & 0xFFFFFF, mode });
    },
  });

  // Find RAM changes
  const ramChanges = [];
  for (let addr = 0xD00000; addr < 0xD10000 && ramChanges.length < 80; addr++) {
    const before = ramBefore[addr - 0xD00000];
    const after = mem[addr];
    if (before !== after) {
      ramChanges.push({ addr, before, after });
    }
  }

  // Keyboard area specifically
  const kbdArea = [];
  for (let addr = 0xD02A80; addr < 0xD02B00; addr++) {
    const before = ramBefore[addr - 0xD00000];
    const after = mem[addr];
    if (before !== after) {
      kbdArea.push({ addr, before, after });
    }
  }

  // IY-relative area
  const iyArea = [];
  for (let addr = 0xD00080; addr < 0xD00100; addr++) {
    const before = ramBefore[addr - 0xD00000];
    const after = mem[addr];
    if (before !== after) {
      iyArea.push({ addr, offset: addr - 0xD00080, before, after });
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
    ramChanges: ramChanges.slice(0, 40),
    kbdArea,
    iyArea,
  };
}

function printTrace(trace, label) {
  console.log(`  Exit reason: ${typeof trace.result === 'object' ? JSON.stringify(trace.result?.reason ?? trace.result) : trace.result}`);
  console.log(`  Final: PC=${hex(trace.final.pc)} A=${hex(trace.final.a, 2)} F=${hex(trace.final.f, 2)} HL=${hex(trace.final.hl)} DE=${hex(trace.final.de)} BC=${hex(trace.final.bc)} SP=${hex(trace.final.sp)}`);
  console.log(`  Blocks visited: ${trace.blocks.length}`);
  for (const b of trace.blocks.slice(0, 50)) {
    console.log(`    step=${String(b.step).padStart(3)} PC=${hex(b.pc)} ${b.dasm.slice(0, 100)}`);
  }
  if (trace.blocks.length > 50) {
    console.log(`    ... (${trace.blocks.length - 50} more blocks)`);
  }
  if (trace.missing.length > 0) {
    console.log(`  Missing blocks: ${trace.missing.length}`);
    for (const m of trace.missing.slice(0, 15)) {
      console.log(`    step=${m.step} PC=${hex(m.pc)} mode=${m.mode}`);
    }
  }
  if (trace.ramChanges.length > 0) {
    console.log(`  RAM changes (D00000-D10000): ${trace.ramChanges.length}`);
    for (const w of trace.ramChanges.slice(0, 30)) {
      console.log(`    ${hex(w.addr)} : ${hex(w.before, 2)} -> ${hex(w.after, 2)}`);
    }
  }
  if (trace.iyArea.length > 0) {
    console.log(`  IY-relative changes (IY+offset): ${trace.iyArea.length}`);
    for (const w of trace.iyArea) {
      console.log(`    IY+${hex(w.offset, 2)} (${hex(w.addr)}) : ${hex(w.before, 2)} -> ${hex(w.after, 2)}`);
    }
  }
  if (trace.kbdArea.length > 0) {
    console.log(`  Keyboard area changes (D02A80-D02B00): ${trace.kbdArea.length}`);
    for (const w of trace.kbdArea) {
      console.log(`    ${hex(w.addr)} : ${hex(w.before, 2)} -> ${hex(w.after, 2)}`);
    }
  }
}

async function main() {
  console.log('=== Phase 284: Trace 0x09E017 — Key Event Handler ===\n');

  const {
    decodeInstruction,
    createExecutor,
    createPeripheralBus,
    preliftedBlocks,
  } = await loadProjectModules();

  // --- Task 1: Static disassembly of 0x09E017 ---
  console.log('--- Task 1: Static disassembly of 0x09E017 (200 bytes) ---');
  const mainRows = disasmRange(decodeInstruction, TARGET, DISASM_LEN);

  for (const row of mainRows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}`);
  }

  // Identify branch targets
  console.log('\n  --- Branch/call targets in disassembly ---');
  for (const row of mainRows) {
    const tag = row.inst?.tag;
    if (tag === 'call' || tag === 'call-conditional' ||
        tag === 'jp' || tag === 'jp-conditional' ||
        tag === 'jr' || tag === 'jr-conditional') {
      console.log(`    ${hex(row.pc)} ${row.text}`);
    }
    if (tag === 'ret' || tag === 'ret-conditional') {
      console.log(`    ${hex(row.pc)} ${row.text}  <-- function boundary`);
    }
  }

  // --- Task 2: Find all callers ---
  console.log('\n--- Task 2: Find all callers of 0x09E017 ---');
  // CALL 09E017: CD 17 E0 09
  const callHits = scanPattern([0xCD, 0x17, 0xE0, 0x09]);
  // JP 09E017: C3 17 E0 09
  const jpHits = scanPattern([0xC3, 0x17, 0xE0, 0x09]);
  // Also check conditional variants
  const jpCHits = scanPattern([0xDA, 0x17, 0xE0, 0x09]); // JP C, 09E017

  console.log(`  CALL hits (CD 17 E0 09): ${callHits.length}`);
  for (const addr of callHits) {
    console.log(`    ${hex(addr)} — context: ${bytesAt(Math.max(0, addr - 4), 12)}`);
  }
  console.log(`  JP hits (C3 17 E0 09): ${jpHits.length}`);
  for (const addr of jpHits) {
    console.log(`    ${hex(addr)} — context: ${bytesAt(Math.max(0, addr - 4), 12)}`);
  }
  console.log(`  JP C hits (DA 17 E0 09): ${jpCHits.length}`);
  for (const addr of jpCHits) {
    console.log(`    ${hex(addr)} — context: ${bytesAt(Math.max(0, addr - 4), 12)}`);
  }

  // Scan all conditional CALL/JP variants too
  const allRefOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC,
                         0xC2, 0xCA, 0xD2, 0xE2, 0xEA, 0xF2, 0xFA];
  const condNames = {
    0xC4: 'CALL NZ', 0xCC: 'CALL Z', 0xD4: 'CALL NC', 0xDC: 'CALL C',
    0xE4: 'CALL PO', 0xEC: 'CALL PE', 0xF4: 'CALL P', 0xFC: 'CALL M',
    0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC',
    0xE2: 'JP PO', 0xEA: 'JP PE', 0xF2: 'JP P', 0xFA: 'JP M',
  };
  for (const opcode of allRefOpcodes) {
    const hits = scanPattern([opcode, 0x17, 0xE0, 0x09]);
    if (hits.length > 0) {
      console.log(`  ${condNames[opcode]} hits: ${hits.length}`);
      for (const addr of hits) {
        console.log(`    ${hex(addr)} — context: ${bytesAt(Math.max(0, addr - 4), 12)}`);
      }
    }
  }

  // --- Task 3: Dynamic trace with A=1 ---
  console.log('\n--- Task 3: Dynamic trace (A=1, 500 steps) ---');
  const trace1 = runTrace(createExecutor, createPeripheralBus, preliftedBlocks, 1);
  printTrace(trace1, 'A=1');

  // --- Task 4: Dynamic trace with A=0 ---
  console.log('\n--- Task 4: Dynamic trace (A=0, 500 steps) ---');
  const trace0 = runTrace(createExecutor, createPeripheralBus, preliftedBlocks, 0);
  printTrace(trace0, 'A=0');

  // --- Task 5: Comparison & Analysis ---
  console.log('\n--- Task 5: Comparison & Analysis ---');
  console.log(`  A=1 trace: ${trace1.blocks.length} blocks, final PC=${hex(trace1.final.pc)}, ${trace1.ramChanges.length} RAM changes`);
  console.log(`  A=0 trace: ${trace0.blocks.length} blocks, final PC=${hex(trace0.final.pc)}, ${trace0.ramChanges.length} RAM changes`);

  // Check if traces diverge
  const maxCompare = Math.min(trace1.blocks.length, trace0.blocks.length, 50);
  let divergeAt = -1;
  for (let i = 0; i < maxCompare; i++) {
    if (trace1.blocks[i].pc !== trace0.blocks[i].pc) {
      divergeAt = i;
      break;
    }
  }
  if (divergeAt >= 0) {
    console.log(`  Traces DIVERGE at block index ${divergeAt}:`);
    console.log(`    A=1: step=${trace1.blocks[divergeAt].step} PC=${hex(trace1.blocks[divergeAt].pc)}`);
    console.log(`    A=0: step=${trace0.blocks[divergeAt].step} PC=${hex(trace0.blocks[divergeAt].pc)}`);
    // Show a few blocks after divergence
    for (let i = divergeAt; i < Math.min(divergeAt + 5, trace1.blocks.length); i++) {
      console.log(`      A=1[${i}]: PC=${hex(trace1.blocks[i].pc)} ${trace1.blocks[i].dasm.slice(0, 80)}`);
    }
    for (let i = divergeAt; i < Math.min(divergeAt + 5, trace0.blocks.length); i++) {
      console.log(`      A=0[${i}]: PC=${hex(trace0.blocks[i].pc)} ${trace0.blocks[i].dasm.slice(0, 80)}`);
    }
  } else {
    console.log(`  Traces follow the same path for the first ${maxCompare} blocks`);
  }

  // Unique PCs in each trace
  const pcs1 = new Set(trace1.blocks.map(b => b.pc));
  const pcs0 = new Set(trace0.blocks.map(b => b.pc));
  const only1 = [...pcs1].filter(pc => !pcs0.has(pc));
  const only0 = [...pcs0].filter(pc => !pcs1.has(pc));
  if (only1.length > 0) {
    console.log(`  PCs only in A=1 trace: ${only1.map(p => hex(p)).join(', ')}`);
  }
  if (only0.length > 0) {
    console.log(`  PCs only in A=0 trace: ${only0.map(p => hex(p)).join(', ')}`);
  }

  console.log('\n=== Phase 284 complete ===');
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
