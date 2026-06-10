import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function countVramNonWhite(mem) {
  const base = 0xD40000;
  let count = 0;
  for (let i = 0; i < 320 * 240; i++) {
    const a = base + i * 2;
    const word = mem[a] | (mem[a + 1] << 8);
    if (word !== 0xFFFF) count++;
  }
  return count;
}

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 600 D007CA re-arm probe');
console.log('Part A: Dynamic — second keypress after D007CA zeroed');
console.log('Part B: Static — ROM cross-reference for D007CA writers');
console.log('');

// ══════════════════════════════════════════════════════════════════
// Part A: Dynamic test — second keypress with D007CA=0
// ══════════════════════════════════════════════════════════════════

// ── Phase 0: Cold boot (exact copy from probe-599) ──
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(0x0019be, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

// ── Phase 1: Launch-init ──
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

// ── Phase 2: Paint ──
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const preKeyD007CA = read24(mem, 0xD007CA);
const preKeyD0231A = read24(mem, 0xD0231A);
const preKeyD0243A = read24(mem, 0xD0243A);
const preKeyVram = countVramNonWhite(mem);

console.log('=== Pre-first-key state ===');
console.log(`  D007CA=${hex(preKeyD007CA)} D0231A=${hex(preKeyD0231A)} D0243A=${hex(preKeyD0243A)} VRAM=${preKeyVram}px`);

// ── Phase 3: First keypress (seed + outer loop) ──
mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] |= 0x20;

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
write24(mem, 0xD008E0, cpu.sp);

const firstResult = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
});

const postKey1_D007CA = read24(mem, 0xD007CA);
const postKey1_D0231A = read24(mem, 0xD0231A);
const postKey1_D0243A = read24(mem, 0xD0243A);
const postKey1_Vram = countVramNonWhite(mem);

console.log('');
console.log('=== Post-first-key state ===');
console.log(`  D007CA=${hex(postKey1_D007CA)} D0231A=${hex(postKey1_D0231A)} D0243A=${hex(postKey1_D0243A)} VRAM=${postKey1_Vram}px`);
console.log(`  Termination: ${firstResult.termination}, steps: ${firstResult.steps}, lastPc: ${hex(firstResult.lastPc)}`);

// ── Phase 4: Second keypress with D007CA tracking ──
console.log('');
console.log('=== Seeding second key and tracking D007CA re-arm ===');

mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] |= 0x20;

// Re-arm longjmp anchor
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
write24(mem, 0xD008E0, cpu.sp);

let stepCounter2 = 0;
let prevD007CA = postKey1_D007CA;
const rearmEvents = [];
let firstRearmStep = null;
let firstRearmPc = null;

// Track unique blocks hit
const uniqueBlocks2 = new Set();

// Track key blocks
const KEY_BLOCKS = {
  0x0585E9: 'cxMain',
  0x08C33D: 'outerLoop_body',
  0x058241: 'paint',
  0x0019b5: 'halt_0019b5',
  0x0019be: 'wipe_0019be',
};
const keyBlockHits2 = {};
for (const addr of Object.keys(KEY_BLOCKS)) {
  keyBlockHits2[Number(addr)] = { label: KEY_BLOCKS[Number(addr)], count: 0, firstStep: null };
}

const secondResult = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const maskedPc = pc & 0xFFFFFF;
    stepCounter2++;
    uniqueBlocks2.add(maskedPc);

    // Track key block hits
    const entry = keyBlockHits2[maskedPc];
    if (entry) {
      entry.count++;
      if (entry.firstStep === null) entry.firstStep = stepCounter2;
    }

    // Track D007CA transitions (zero -> non-zero = re-arm)
    const curD007CA = read24(mem, 0xD007CA);
    if (prevD007CA === 0 && curD007CA !== 0) {
      rearmEvents.push({
        step: stepCounter2,
        pc: hex(maskedPc),
        newValue: hex(curD007CA),
      });
      if (firstRearmStep === null) {
        firstRearmStep = stepCounter2;
        firstRearmPc = hex(maskedPc);
      }
    }
    if (prevD007CA !== 0 && curD007CA === 0) {
      rearmEvents.push({
        step: stepCounter2,
        pc: hex(maskedPc),
        newValue: hex(0),
        note: 'zeroed again',
      });
    }
    prevD007CA = curD007CA;
  },
});

const postKey2_D007CA = read24(mem, 0xD007CA);
const postKey2_D0231A = read24(mem, 0xD0231A);
const postKey2_D0243A = read24(mem, 0xD0243A);
const postKey2_Vram = countVramNonWhite(mem);

console.log('');
console.log('=== Post-second-key state ===');
console.log(`  D007CA=${hex(postKey2_D007CA)} D0231A=${hex(postKey2_D0231A)} D0243A=${hex(postKey2_D0243A)} VRAM=${postKey2_Vram}px`);
console.log(`  Termination: ${secondResult.termination}, steps: ${secondResult.steps}, lastPc: ${hex(secondResult.lastPc)}`);
console.log(`  Unique blocks: ${uniqueBlocks2.size}`);

console.log('');
console.log('=== D007CA transition events ===');
if (rearmEvents.length === 0) {
  console.log('  No D007CA transitions detected — stayed at ' + hex(postKey1_D007CA));
} else {
  for (const e of rearmEvents) {
    const note = e.note ? ` (${e.note})` : '';
    console.log(`  step ${e.step}: PC=${e.pc} -> D007CA=${e.newValue}${note}`);
  }
}

console.log('');
console.log('=== Key block hits (second keypress) ===');
for (const [addr, entry] of Object.entries(keyBlockHits2)) {
  const label = entry.label.padEnd(18);
  console.log(`  ${hex(Number(addr))}: ${label} count=${entry.count}, firstStep=${entry.firstStep}`);
}

// ══════════════════════════════════════════════════════════════════
// Part B: Static ROM cross-reference — all instructions writing D007CA
// ══════════════════════════════════════════════════════════════════

console.log('');
console.log('=== Part B: Static ROM cross-reference for D007CA writers ===');

const rom = romBytes;
const romLen = Math.min(rom.length, 0x400000);

// Pattern 1: LD (0xD007CA),HL — opcode 0x22 nn nn nn in ADL mode
// Encoding: 22 CA 07 D0
const ldHlRefs = [];
for (let i = 0; i < romLen - 3; i++) {
  if (rom[i] === 0x22 && rom[i + 1] === 0xCA && rom[i + 2] === 0x07 && rom[i + 3] === 0xD0) {
    ldHlRefs.push(hex(i));
  }
}

// Pattern 2: LD (0xD007CA),DE — ED 53 nn nn nn
// Encoding: ED 53 CA 07 D0
const ldDeRefs = [];
for (let i = 0; i < romLen - 4; i++) {
  if (rom[i] === 0xED && rom[i + 1] === 0x53 && rom[i + 2] === 0xCA && rom[i + 3] === 0x07 && rom[i + 4] === 0xD0) {
    ldDeRefs.push(hex(i));
  }
}

// Pattern 3: LD (0xD007CA),A — opcode 0x32 nn nn nn
// Encoding: 32 CA 07 D0
const ldARefs = [];
for (let i = 0; i < romLen - 3; i++) {
  if (rom[i] === 0x32 && rom[i + 1] === 0xCA && rom[i + 2] === 0x07 && rom[i + 3] === 0xD0) {
    ldARefs.push(hex(i));
  }
}

// Pattern 4: LD (0xD007CA),BC — ED 43 nn nn nn
// Encoding: ED 43 CA 07 D0
const ldBcRefs = [];
for (let i = 0; i < romLen - 4; i++) {
  if (rom[i] === 0xED && rom[i + 1] === 0x43 && rom[i + 2] === 0xCA && rom[i + 3] === 0x07 && rom[i + 4] === 0xD0) {
    ldBcRefs.push(hex(i));
  }
}

// Pattern 5: LD (0xD007CA),SP — ED 73 nn nn nn
// Encoding: ED 73 CA 07 D0
const ldSpRefs = [];
for (let i = 0; i < romLen - 4; i++) {
  if (rom[i] === 0xED && rom[i + 1] === 0x73 && rom[i + 2] === 0xCA && rom[i + 3] === 0x07 && rom[i + 4] === 0xD0) {
    ldSpRefs.push(hex(i));
  }
}

console.log(`  LD (D007CA),HL  [22 CA 07 D0]    — ${ldHlRefs.length} refs:`);
for (const r of ldHlRefs) console.log(`    ${r}`);

console.log(`  LD (D007CA),DE  [ED 53 CA 07 D0] — ${ldDeRefs.length} refs:`);
for (const r of ldDeRefs) console.log(`    ${r}`);

console.log(`  LD (D007CA),A   [32 CA 07 D0]    — ${ldARefs.length} refs:`);
for (const r of ldARefs) console.log(`    ${r}`);

console.log(`  LD (D007CA),BC  [ED 43 CA 07 D0] — ${ldBcRefs.length} refs:`);
for (const r of ldBcRefs) console.log(`    ${r}`);

console.log(`  LD (D007CA),SP  [ED 73 CA 07 D0] — ${ldSpRefs.length} refs:`);
for (const r of ldSpRefs) console.log(`    ${r}`);

const totalRefs = ldHlRefs.length + ldDeRefs.length + ldARefs.length + ldBcRefs.length + ldSpRefs.length;
console.log(`  Total D007CA writers: ${totalRefs}`);

// Cross-check known LD (D007CA),HL refs
const knownHlRefs = [
  0x05cc31, 0x0601b4, 0x06b432, 0x080eb7, 0x081018, 0x081100,
  0x0813e0, 0x09d327, 0x09d33d, 0x09d353, 0x0ab767, 0x0ab8e7,
  0x0aba7d, 0x0abb09, 0x0abe84, 0x0acc8a, 0x0b1d4d, 0x0b48ec,
  0x0b6170,
];
const foundHlSet = new Set(ldHlRefs.map(s => parseInt(s, 16)));
const missing = knownHlRefs.filter(a => !foundHlSet.has(a));
const extra = ldHlRefs.filter(s => !knownHlRefs.includes(parseInt(s, 16)));

console.log('');
console.log('=== Cross-check against known LD (D007CA),HL refs ===');
if (missing.length === 0) {
  console.log('  All 19 known refs found');
} else {
  console.log(`  MISSING (${missing.length}): ${missing.map(a => hex(a)).join(', ')}`);
}
if (extra.length > 0) {
  console.log(`  EXTRA (${extra.length}): ${extra.join(', ')}`);
}

// Summary
console.log('');
console.log('=== Summary ===');
console.log(`  First keypress: D007CA went from ${hex(preKeyD007CA)} to ${hex(postKey1_D007CA)}`);
console.log(`  Second keypress: D007CA went from ${hex(postKey1_D007CA)} to ${hex(postKey2_D007CA)}`);
if (firstRearmStep !== null) {
  console.log(`  D007CA first re-armed at step ${firstRearmStep}, PC=${firstRearmPc}`);
} else {
  console.log('  D007CA was NOT re-armed during second keypress');
}
console.log(`  Total D007CA transition events: ${rearmEvents.length}`);
console.log(`  ROM contains ${totalRefs} instructions that write to D007CA`);
