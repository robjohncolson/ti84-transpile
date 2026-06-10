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

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 601 type-code-trace probe');
console.log('Tracing register A at key handler addresses to find type code origin');

// ── Phase 0: Cold boot (verbatim from probe-599) ──
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

console.log('Boot complete. Seeding key for outer loop...');

// ── Phase 3: Seed key for outer loop (same as probe-599) ──
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

// ── Phase 4: Outer loop with register A tracing ──
const maxSteps = 500_000;

const WATCHED = {
  0x0585E9: 'cxMain',
  0x05877A: 'key_handler',
  0x058b73: 'type7_check',
  0x058d54: 'action_processor',
  0x0587E9: 'convergence',
  0x0587F3: 'cp05_split',
  0x080259: 'descriptor_check',
  0x058EDA: 'catalog_check',
};

let stepCounter = 0;
const traceHits = [];

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const maskedPc = pc & 0xFFFFFF;
    stepCounter++;

    const label = WATCHED[maskedPc];
    if (label) {
      traceHits.push({
        step: stepCounter,
        pc: hex(maskedPc),
        label,
        regA: hex(cpu.a, 2),
        regF: hex(cpu.f, 2),
        regHL: hex(cpu._hl),
        regDE: hex(cpu._de),
        regBC: hex(cpu._bc),
      });
    }
  },
});

console.log('\n=== REGISTER A TRACE AT WATCHED ADDRESSES ===');
for (const hit of traceHits) {
  console.log(`  step=${hit.step} PC=${hit.pc} [${hit.label}] A=${hit.regA} F=${hit.regF} HL=${hit.regHL} DE=${hit.regDE} BC=${hit.regBC}`);
}
console.log(`Total watched hits: ${traceHits.length}`);

// Group by label for summary
const byLabel = {};
for (const hit of traceHits) {
  if (!byLabel[hit.label]) byLabel[hit.label] = [];
  byLabel[hit.label].push(hit);
}
console.log('\n=== SUMMARY BY ADDRESS ===');
for (const [label, hits] of Object.entries(byLabel)) {
  const aValues = [...new Set(hits.map(h => h.regA))];
  console.log(`  ${label}: ${hits.length} hits, A values seen: [${aValues.join(', ')}]`);
}

// ── Static decode: ROM bytes 0x0587B0-0x058810 ──
console.log('\n=== STATIC DECODE: ROM 0x0587B0-0x058810 ===');
console.log('Looking for CALL (0xCD), JP (0xC3), RET (0xC9) instructions in ADL mode');

const decodeStart = 0x0587B0;
const decodeEnd = 0x058810;
let offset = decodeStart;
while (offset < decodeEnd) {
  const byte = romBytes[offset];

  if (byte === 0xCD) {
    // CALL nn in ADL mode: 3-byte address follows
    if (offset + 3 < decodeEnd) {
      const target = romBytes[offset + 1] | (romBytes[offset + 2] << 8) | (romBytes[offset + 3] << 16);
      console.log(`  ${hex(offset)}: CALL ${hex(target)}`);
      offset += 4;
      continue;
    }
  } else if (byte === 0xC3) {
    // JP nn in ADL mode: 3-byte address follows
    if (offset + 3 < decodeEnd) {
      const target = romBytes[offset + 1] | (romBytes[offset + 2] << 8) | (romBytes[offset + 3] << 16);
      console.log(`  ${hex(offset)}: JP   ${hex(target)}`);
      offset += 4;
      continue;
    }
  } else if (byte === 0xC9) {
    console.log(`  ${hex(offset)}: RET`);
    offset += 1;
    continue;
  } else if (byte === 0xFE) {
    // CP n: useful to see comparisons
    if (offset + 1 < decodeEnd) {
      console.log(`  ${hex(offset)}: CP   ${hex(romBytes[offset + 1], 2)}`);
      offset += 2;
      continue;
    }
  } else if (byte === 0xC2 || byte === 0xCA || byte === 0xD2 || byte === 0xDA ||
             byte === 0xE2 || byte === 0xEA || byte === 0xF2 || byte === 0xFA) {
    // Conditional JP nn
    const condNames = {
      0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C',
      0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M'
    };
    if (offset + 3 < decodeEnd) {
      const target = romBytes[offset + 1] | (romBytes[offset + 2] << 8) | (romBytes[offset + 3] << 16);
      console.log(`  ${hex(offset)}: JP   ${condNames[byte]},${hex(target)}`);
      offset += 4;
      continue;
    }
  } else if (byte === 0xC4 || byte === 0xCC || byte === 0xD4 || byte === 0xDC ||
             byte === 0xE4 || byte === 0xEC || byte === 0xF4 || byte === 0xFC) {
    // Conditional CALL nn
    const condNames = {
      0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C',
      0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M'
    };
    if (offset + 3 < decodeEnd) {
      const target = romBytes[offset + 1] | (romBytes[offset + 2] << 8) | (romBytes[offset + 3] << 16);
      console.log(`  ${hex(offset)}: CALL ${condNames[byte]},${hex(target)}`);
      offset += 4;
      continue;
    }
  } else if (byte === 0xC0 || byte === 0xC8 || byte === 0xD0 || byte === 0xD8 ||
             byte === 0xE0 || byte === 0xE8 || byte === 0xF0 || byte === 0xF8) {
    // Conditional RET
    const condNames = {
      0xC0: 'NZ', 0xC8: 'Z', 0xD0: 'NC', 0xD8: 'C',
      0xE0: 'PO', 0xE8: 'PE', 0xF0: 'P', 0xF8: 'M'
    };
    console.log(`  ${hex(offset)}: RET  ${condNames[byte]}`);
    offset += 1;
    continue;
  } else if (byte === 0xF5) {
    console.log(`  ${hex(offset)}: PUSH AF`);
    offset += 1;
    continue;
  } else if (byte === 0xF1) {
    console.log(`  ${hex(offset)}: POP  AF`);
    offset += 1;
    continue;
  } else if (byte === 0x3E) {
    // LD A,n
    if (offset + 1 < decodeEnd) {
      console.log(`  ${hex(offset)}: LD   A,${hex(romBytes[offset + 1], 2)}`);
      offset += 2;
      continue;
    }
  }

  offset += 1;
}

// ── Also decode around the earlier key_handler 0x05877A range ──
console.log('\n=== STATIC DECODE: ROM 0x058760-0x0587B0 (before convergence) ===');
offset = 0x058760;
const earlyEnd = 0x0587B0;
while (offset < earlyEnd) {
  const byte = romBytes[offset];

  if (byte === 0xCD) {
    if (offset + 3 < earlyEnd) {
      const target = romBytes[offset + 1] | (romBytes[offset + 2] << 8) | (romBytes[offset + 3] << 16);
      console.log(`  ${hex(offset)}: CALL ${hex(target)}`);
      offset += 4; continue;
    }
  } else if (byte === 0xC3) {
    if (offset + 3 < earlyEnd) {
      const target = romBytes[offset + 1] | (romBytes[offset + 2] << 8) | (romBytes[offset + 3] << 16);
      console.log(`  ${hex(offset)}: JP   ${hex(target)}`);
      offset += 4; continue;
    }
  } else if (byte === 0xC9) {
    console.log(`  ${hex(offset)}: RET`);
    offset += 1; continue;
  } else if (byte === 0xFE) {
    if (offset + 1 < earlyEnd) {
      console.log(`  ${hex(offset)}: CP   ${hex(romBytes[offset + 1], 2)}`);
      offset += 2; continue;
    }
  } else if (byte === 0xC2 || byte === 0xCA || byte === 0xD2 || byte === 0xDA ||
             byte === 0xE2 || byte === 0xEA || byte === 0xF2 || byte === 0xFA) {
    const condNames = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C', 0xE2: 'PO', 0xEA: 'PE', 0xF2: 'P', 0xFA: 'M' };
    if (offset + 3 < earlyEnd) {
      const target = romBytes[offset + 1] | (romBytes[offset + 2] << 8) | (romBytes[offset + 3] << 16);
      console.log(`  ${hex(offset)}: JP   ${condNames[byte]},${hex(target)}`);
      offset += 4; continue;
    }
  } else if (byte === 0xC4 || byte === 0xCC || byte === 0xD4 || byte === 0xDC ||
             byte === 0xE4 || byte === 0xEC || byte === 0xF4 || byte === 0xFC) {
    const condNames = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
    if (offset + 3 < earlyEnd) {
      const target = romBytes[offset + 1] | (romBytes[offset + 2] << 8) | (romBytes[offset + 3] << 16);
      console.log(`  ${hex(offset)}: CALL ${condNames[byte]},${hex(target)}`);
      offset += 4; continue;
    }
  } else if (byte === 0xC0 || byte === 0xC8 || byte === 0xD0 || byte === 0xD8 ||
             byte === 0xE0 || byte === 0xE8 || byte === 0xF0 || byte === 0xF8) {
    const condNames = { 0xC0: 'NZ', 0xC8: 'Z', 0xD0: 'NC', 0xD8: 'C', 0xE0: 'PO', 0xE8: 'PE', 0xF0: 'P', 0xF8: 'M' };
    console.log(`  ${hex(offset)}: RET  ${condNames[byte]}`);
    offset += 1; continue;
  } else if (byte === 0xF5) {
    console.log(`  ${hex(offset)}: PUSH AF`);
    offset += 1; continue;
  } else if (byte === 0xF1) {
    console.log(`  ${hex(offset)}: POP  AF`);
    offset += 1; continue;
  } else if (byte === 0x3E) {
    if (offset + 1 < earlyEnd) {
      console.log(`  ${hex(offset)}: LD   A,${hex(romBytes[offset + 1], 2)}`);
      offset += 2; continue;
    }
  }

  offset += 1;
}

console.log('\n=== EXECUTION RESULT ===');
console.log(`  Termination: ${result.termination}`);
console.log(`  Steps: ${result.steps}`);
console.log(`  Last PC: ${hex(result.lastPc)}`);
console.log(`  Blocks instrumented: ${stepCounter}`);

console.log('\nPhase 601 complete.');
