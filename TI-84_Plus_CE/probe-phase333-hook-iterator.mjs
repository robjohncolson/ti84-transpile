#!/usr/bin/env node
// Phase 333: Map the 0x023D14 hook iterator
//
// The TI-84 CE OS has a hook system with 24 slots. Address 0x023D14 is a
// function that iterates hook slots for lookup/matching. This probe:
// 1. Boots to home screen
// 2. Dumps raw ROM bytes at 0x023D14
// 3. Calls 0x023D14 with sentinel return address + onBlock tracing
// 4. Dumps the hook slot table from RAM after boot
// 5. Reports: search key register, slot count, slot structure, match vs no-match behavior

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];

const HOOK_ITERATOR = 0x023D14;
const HOOK_SLOT_COUNT = 24;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hexDump(data, baseAddr, length) {
  const lines = [];
  for (let off = 0; off < length; off += 16) {
    const addr = baseAddr + off;
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16 && off + i < length; i++) {
      const b = data[addr + off + i] !== undefined ? data[addr + off + i] : 0;
      bytes.push(b.toString(16).padStart(2, '0'));
      ascii.push(b >= 0x20 && b < 0x7F ? String.fromCharCode(b) : '.');
    }
    lines.push(`  ${hex(addr)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
  return lines;
}

function read24(src, addr) {
  return src[addr] | (src[addr + 1] << 8) | (src[addr + 2] << 16);
}

function main() {
  console.log('=== Phase 333: Hook Iterator at 0x023D14 ===');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // ---------------------------------------------------------------
  // Step 1: Boot to home screen
  // ---------------------------------------------------------------
  console.log('--- Step 1: Boot to home screen ---');

  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  }

  console.log('  Boot complete.');
  console.log('');

  // ---------------------------------------------------------------
  // Step 2: Dump raw ROM bytes at 0x023D14
  // ---------------------------------------------------------------
  console.log('--- Step 2: ROM bytes at 0x023D14 (160 bytes) ---');
  const dumpLines = hexDump(romBytes, HOOK_ITERATOR, 160);
  for (const line of dumpLines) console.log(line);
  console.log('');

  // Check if a transpiled block exists for this address
  const blockKey = HOOK_ITERATOR.toString(16).padStart(6, '0') + ':adl';
  const hasBlock = !!executor.compiledBlocks[blockKey];
  console.log(`  Block ${blockKey} exists: ${hasBlock}`);
  console.log('');

  // ---------------------------------------------------------------
  // Step 3: Call 0x023D14 with sentinel + onBlock tracing
  // ---------------------------------------------------------------
  console.log('--- Step 3: Call 0x023D14 with sentinel tracing ---');

  // Snapshot CPU state for repeated calls
  const savedIY = cpu._iy;
  const savedMBASE = cpu.mbase;

  // 3a: Call with default registers (as left by boot)
  console.log('  3a: Default registers after boot');
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0; cpu.madl = 1;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFE; mem[cpu.sp + 1] = 0xFE; mem[cpu.sp + 2] = 0xFE;

  console.log(`    pre-call: A=${hex(cpu.a, 2)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)} SP=${hex(cpu.sp)}`);

  const trace3a = [];
  const result3a = executor.runFrom(HOOK_ITERATOR, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 200,
    onBlock: (pc, mode, meta, steps) => {
      trace3a.push({ pc, mode, steps });
      console.log(`    block ${pc.toString(16).padStart(6, '0')}:${mode} step=${steps}`);
    },
  });
  console.log(`    result: steps=${result3a.steps} term=${result3a.termination} lastPc=${hex(result3a.lastPc)}`);
  console.log(`    post-call: A=${hex(cpu.a, 2)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)} F=${hex(cpu.f, 2)} CF=${cpu.f & 1}`);
  console.log('');

  // 3b: Call with A=0 (possible "search for hook type 0")
  console.log('  3b: A=0 (hook type 0)');
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0; cpu.madl = 1;
  cpu.a = 0; cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFE; mem[cpu.sp + 1] = 0xFE; mem[cpu.sp + 2] = 0xFE;

  const trace3b = [];
  const result3b = executor.runFrom(HOOK_ITERATOR, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 200,
    onBlock: (pc, mode, meta, steps) => {
      trace3b.push({ pc, mode, steps });
      console.log(`    block ${pc.toString(16).padStart(6, '0')}:${mode} step=${steps}`);
    },
  });
  console.log(`    result: steps=${result3b.steps} term=${result3b.termination} lastPc=${hex(result3b.lastPc)}`);
  console.log(`    post-call: A=${hex(cpu.a, 2)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)} F=${hex(cpu.f, 2)} CF=${cpu.f & 1}`);
  console.log('');

  // 3c: Call with A=1 (possible "search for hook type 1")
  console.log('  3c: A=1 (hook type 1)');
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0; cpu.madl = 1;
  cpu.a = 1; cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFE; mem[cpu.sp + 1] = 0xFE; mem[cpu.sp + 2] = 0xFE;

  const trace3c = [];
  const result3c = executor.runFrom(HOOK_ITERATOR, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 200,
    onBlock: (pc, mode, meta, steps) => {
      trace3c.push({ pc, mode, steps });
      console.log(`    block ${pc.toString(16).padStart(6, '0')}:${mode} step=${steps}`);
    },
  });
  console.log(`    result: steps=${result3c.steps} term=${result3c.termination} lastPc=${hex(result3c.lastPc)}`);
  console.log(`    post-call: A=${hex(cpu.a, 2)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)} F=${hex(cpu.f, 2)} CF=${cpu.f & 1}`);
  console.log('');

  // 3d: Call with B as slot count (try B=24)
  console.log('  3d: B=24 (slot count), A=0');
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0; cpu.madl = 1;
  cpu.a = 0; cpu._bc = (24 << 16) | (24 << 8) | 0; cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFE; mem[cpu.sp + 1] = 0xFE; mem[cpu.sp + 2] = 0xFE;

  const trace3d = [];
  const result3d = executor.runFrom(HOOK_ITERATOR, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 200,
    onBlock: (pc, mode, meta, steps) => {
      trace3d.push({ pc, mode, steps });
      console.log(`    block ${pc.toString(16).padStart(6, '0')}:${mode} step=${steps}`);
    },
  });
  console.log(`    result: steps=${result3d.steps} term=${result3d.termination} lastPc=${hex(result3d.lastPc)}`);
  console.log(`    post-call: A=${hex(cpu.a, 2)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)} F=${hex(cpu.f, 2)} CF=${cpu.f & 1}`);
  console.log('');

  // ---------------------------------------------------------------
  // Step 4: Dump hook slot table from RAM
  // ---------------------------------------------------------------
  console.log('--- Step 4: Hook slot table scan (D-prefix region near IY) ---');

  // The IY register points to 0xD00080 (OS system flags area).
  // Hook tables are typically stored in the D00xxx range.
  // Known hook-related addresses from TI SDK:
  //   hookflags2 at (IY+0x36) = 0xD000B6
  //   hookflags3 at (IY+0x35) = 0xD000B5
  //   hookflags4 at (IY+0x34) = 0xD000B4
  // Hook pointers are typically 3-byte entries in the D002xx-D003xx range.

  const IY = 0xD00080;

  // Dump flag bytes near IY that might be hook-related
  console.log('  Hook flag bytes (IY+0x30..IY+0x3F):');
  for (let off = 0x30; off <= 0x3F; off++) {
    const addr = IY + off;
    const val = mem[addr];
    console.log(`    (IY+${hex(off, 2)}) = ${hex(addr)}: ${hex(val, 2)} = ${val.toString(2).padStart(8, '0')}`);
  }
  console.log('');

  // Scan known hook table regions. TI-OS typically stores hooks at:
  // Each hook slot = 1 byte type/flags + 3 byte address = 4 bytes per slot
  // Or: 1 byte active flag + 3 byte address
  // Common base addresses for hook tables: 0xD025xx, 0xD02Dxx, etc.

  // Scan a broader region looking for 3-byte values that point into ROM (0x000000-0x3FFFFF)
  const hookTableCandidates = [
    { label: 'D002xx region', start: 0xD00200, end: 0xD00300 },
    { label: 'D025xx region', start: 0xD02500, end: 0xD02600 },
    { label: 'D02Dxx region', start: 0xD02D00, end: 0xD02E00 },
    { label: 'D009xx region', start: 0xD00900, end: 0xD00A00 },
    { label: 'D00Axx region', start: 0xD00A00, end: 0xD00B00 },
  ];

  for (const region of hookTableCandidates) {
    const romPointers = [];
    for (let addr = region.start; addr < region.end - 2; addr++) {
      const ptr = read24(mem, addr);
      // Look for plausible ROM code pointers (non-zero, in ROM range, not erased flash)
      if (ptr > 0x1000 && ptr < 0x400000) {
        // Check if the target looks like code
        const targetByte = romBytes[ptr];
        if (targetByte !== 0xFF && targetByte !== 0x00) {
          romPointers.push({ addr, ptr });
        }
      }
    }
    if (romPointers.length > 0) {
      console.log(`  ${region.label} — ROM pointers found:`);
      for (const { addr, ptr } of romPointers.slice(0, 20)) {
        const targetBytes = Array.from(romBytes.slice(ptr, ptr + 4)).map(b => b.toString(16).padStart(2, '0')).join(' ');
        console.log(`    ${hex(addr)}: -> ${hex(ptr)} [${targetBytes}]`);
      }
    }
  }
  console.log('');

  // Also scan the specific region right around where hook data structures tend to live
  // on TI-84 CE: 0xD02688 area (24 slots * 5 bytes each = 120 bytes)
  console.log('  Broader scan: look for 4-byte or 5-byte aligned ROM pointer arrays');

  for (let stride = 4; stride <= 6; stride++) {
    for (let base = 0xD00200; base < 0xD03000; base += stride) {
      let romPtrCount = 0;
      const ptrs = [];
      for (let slot = 0; slot < HOOK_SLOT_COUNT; slot++) {
        const slotAddr = base + slot * stride;
        if (slotAddr + 3 > MEM_SIZE) break;
        // Try pointer at offset 0 within the slot
        const ptr0 = read24(mem, slotAddr);
        // Try pointer at offset 1 within the slot (if there's a type byte first)
        const ptr1 = stride >= 4 ? read24(mem, slotAddr + 1) : 0;

        let foundPtr = 0;
        if (ptr0 > 0x1000 && ptr0 < 0x400000 && romBytes[ptr0] !== 0xFF) {
          foundPtr = ptr0;
        } else if (ptr1 > 0x1000 && ptr1 < 0x400000 && romBytes[ptr1] !== 0xFF) {
          foundPtr = ptr1;
        }

        if (foundPtr) {
          romPtrCount++;
          ptrs.push({ slot, addr: slotAddr, ptr: foundPtr });
        }
      }

      // If we found 3+ ROM pointers in a regularly-spaced array, report it
      if (romPtrCount >= 3) {
        console.log(`    Candidate: base=${hex(base)} stride=${stride} romPtrs=${romPtrCount}/${HOOK_SLOT_COUNT}`);
        for (const { slot, addr, ptr } of ptrs.slice(0, 10)) {
          const targetBytes = Array.from(romBytes.slice(ptr, ptr + 4)).map(b => b.toString(16).padStart(2, '0')).join(' ');
          console.log(`      slot[${slot}] at ${hex(addr)}: -> ${hex(ptr)} [${targetBytes}]`);
        }
      }
    }
  }
  console.log('');

  // ---------------------------------------------------------------
  // Step 5: Dump RAM near addresses referenced by the block trace
  // ---------------------------------------------------------------
  console.log('--- Step 5: RAM state at addresses visited by trace ---');

  // Collect unique PCs from all traces
  const allPCs = new Set();
  for (const t of [...trace3a, ...trace3b, ...trace3c, ...trace3d]) {
    allPCs.add(t.pc);
  }
  console.log(`  Unique block PCs visited: ${allPCs.size}`);
  for (const pc of [...allPCs].sort((a, b) => a - b)) {
    const inROM = pc < 0x400000;
    if (inROM) {
      const bytes = Array.from(romBytes.slice(pc, pc + 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`    ${hex(pc)}: ROM [${bytes}]`);
    } else {
      const bytes = Array.from(mem.slice(pc, pc + 8)).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`    ${hex(pc)}: RAM [${bytes}]`);
    }
  }
  console.log('');

  // ---------------------------------------------------------------
  // Step 6: Summary
  // ---------------------------------------------------------------
  console.log('--- Step 6: Summary ---');
  console.log('');
  console.log(`  Hook iterator address: ${hex(HOOK_ITERATOR)}`);
  console.log(`  Block exists: ${hasBlock}`);
  console.log(`  Trace 3a (default regs): ${result3a.steps} steps, term=${result3a.termination}, lastPc=${hex(result3a.lastPc)}`);
  console.log(`  Trace 3b (A=0): ${result3b.steps} steps, term=${result3b.termination}, lastPc=${hex(result3b.lastPc)}`);
  console.log(`  Trace 3c (A=1): ${result3c.steps} steps, term=${result3c.termination}, lastPc=${hex(result3c.lastPc)}`);
  console.log(`  Trace 3d (B=24,A=0): ${result3d.steps} steps, term=${result3d.termination}, lastPc=${hex(result3d.lastPc)}`);
  console.log('');

  // Compare outputs to infer behavior
  const returned3a = result3a.lastPc === 0xFEFEFE;
  const returned3b = result3b.lastPc === 0xFEFEFE;
  const returned3c = result3c.lastPc === 0xFEFEFE;
  const returned3d = result3d.lastPc === 0xFEFEFE;
  console.log(`  Returned to sentinel (0xFEFEFE):`);
  console.log(`    3a (default): ${returned3a}`);
  console.log(`    3b (A=0):     ${returned3b}`);
  console.log(`    3c (A=1):     ${returned3c}`);
  console.log(`    3d (B=24):    ${returned3d}`);
  console.log('');

  // Infer search key register by comparing traces
  if (result3b.steps !== result3c.steps) {
    console.log('  INFERENCE: A register likely affects iteration (different step counts for A=0 vs A=1)');
  } else {
    console.log('  INFERENCE: A register does NOT affect iteration (same step counts for A=0 vs A=1)');
  }

  if (result3b.steps !== result3d.steps) {
    console.log('  INFERENCE: B register likely affects iteration (different step counts for B=0 vs B=24)');
  } else {
    console.log('  INFERENCE: B register does NOT affect iteration');
  }

  console.log('');
  console.log('=== Phase 333 complete ===');
}

try {
  main();
} catch (error) {
  console.error('PROBE FAILED:', error.stack || error);
  process.exitCode = 1;
}
