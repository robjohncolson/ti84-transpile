#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_RESET_TOP = 0xD1A87E;
const hex = (v, w=6) => v == null ? 'n/a' : '0x' + (v >>> 0).toString(16).padStart(w, '0');

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const { cpu } = executor;

console.log('=== Phase 370 - BC31 via Post-Trampoline Entry ===\n');

// Phase 1: Z80 cold boot
const r1 = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log(`Phase 1: steps=${r1.steps} term=${r1.termination} lastPc=${hex(r1.lastPc)}`);

cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Phase 2: Kernel init — terminates at 0xD18C22 (trampoline handles it)
const r2 = executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
console.log(`Phase 2: steps=${r2.steps} term=${r2.termination} lastPc=${hex(r2.lastPc)}`);
console.log(`Phase 2 unique blocks: ${Object.keys(r2.blockVisits ?? {}).length}`);

// Log CPU state after Phase 2
console.log(`\nPost-Phase2 CPU state:`);
console.log(`  PC=${hex(r2.lastPc)} SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);
console.log(`  HL=${hex(cpu._hl)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)}`);
console.log(`  A=${hex(cpu.a, 2)} F=${hex(cpu.f, 2)} MBASE=${hex(cpu.mbase, 2)}`);
console.log(`  halted=${cpu.halted} iff1=${cpu.iff1} madl=${cpu.madl}`);

// Read the return address from the stack (this is what the trampoline would pop)
const sp = cpu.sp & 0xFFFFFF;
const stackRetAddr = mem[sp] | (mem[sp + 1] << 8) | (mem[sp + 2] << 16);
console.log(`\nStack return address at SP=${hex(sp)}: ${hex(stackRetAddr)}`);

// Show stack vicinity
console.log('Stack around SP:');
for (let i = -6; i <= 18; i += 3) {
  const addr = (sp + i) & 0xFFFFFF;
  const val = mem[addr] | (mem[addr+1] << 8) | (mem[addr+2] << 16);
  console.log(`  ${hex(addr)}: ${hex(val)}${i === 0 ? ' <-- SP' : ''}`);
}

// Collect Phase 2 blocks
const phase2Blocks = new Set(Object.keys(r2.blockVisits ?? {}));

// Phase 3: Start from the POST-TRAMPOLINE return address (0x000E9D)
// The trampoline at 0xD18C22 does: pop 3-byte return addr from stack, jump there
// So we simulate what the trampoline would do: adjust SP and start from the return addr
const POST_TRAMPOLINE_ENTRY = stackRetAddr;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = (sp + 3) & 0xFFFFFF; // simulate the trampoline's POP (3-byte address)

console.log(`\n--- Phase 3: Continue from post-trampoline ${hex(POST_TRAMPOLINE_ENTRY)} ---`);
console.log(`  SP adjusted to ${hex(cpu.sp)} (simulating trampoline POP)`);

const r3 = executor.runFrom(POST_TRAMPOLINE_ENTRY, 'adl', { maxSteps: 500000, maxLoopIterations: 1000 });
console.log(`Phase 3: steps=${r3.steps} term=${r3.termination} lastPc=${hex(r3.lastPc)}`);
console.log(`Phase 3 unique blocks: ${Object.keys(r3.blockVisits ?? {}).length}`);

if (r3.missingBlocks?.length > 0) {
  console.log(`Missing blocks: ${r3.missingBlocks.slice(0, 20).join(', ')}`);
}

// BC31 target coverage
const bc31Targets = [
  [0x00BC31, 'BC31 byte-copy loop'],
  [0x00BC47, 'BC47 linked-list follow'],
  [0x00BC72, 'BC72 epilogue'],
  [0x00BC1D, 'BC1D caller'],
];
console.log('\n--- BC31 Target Coverage ---');
for (const [addr, label] of bc31Targets) {
  const prefix = addr.toString(16).padStart(6, '0');
  const matching = Object.entries(r3.blockVisits ?? {}).filter(([k]) => k.startsWith(prefix + ':'));
  const visits = matching.reduce((sum, [, c]) => sum + c, 0);
  console.log(`  ${hex(addr)} (${label}): visited=${visits > 0 ? 'YES' : 'no'} visits=${visits}`);
}

// New blocks
const newInPhase3 = Object.entries(r3.blockVisits ?? {}).filter(([k]) => !phase2Blocks.has(k));
console.log(`\nNew blocks in Phase 3 (not in Phase 2): ${newInPhase3.length}`);

// Top 20 hottest
const sorted3 = Object.entries(r3.blockVisits ?? {}).sort((a, b) => b[1] - a[1]);
console.log('\n--- Top 20 Hottest Blocks in Phase 3 ---');
for (const [key, count] of sorted3.slice(0, 20)) {
  const isNew = !phase2Blocks.has(key) ? ' [NEW]' : '';
  console.log(`  ${key}: ${count}${isNew}`);
}

// Phase 3 CPU state at end
console.log(`\nPost-Phase3 CPU state:`);
console.log(`  PC=${hex(r3.lastPc)} SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);
console.log(`  halted=${cpu.halted} iff1=${cpu.iff1}`);

console.log('\n=== Done ===');
