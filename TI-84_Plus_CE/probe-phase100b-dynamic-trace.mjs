#!/usr/bin/env node
// Phase 100B — dynamic trace of the 13 ROM addresses that reference 0xD020A6-BF.
// For each address, find the enclosing function (nearest PRELIFTED_BLOCKS key <=
// the ROM address), run it from a post-boot snapshot, and record any writes to
// the mode display buffer at 0xD020A6-0xD020BF.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase100b-dynamic-trace-report.md');

// ── Constants ──────────────────────────────────────────────────────────────────

const MEM_SIZE          = 0x1000000;
const BOOT_ENTRY        = 0x000000;
const BOOT_MODE         = 'z80';
const BOOT_MAX_STEPS    = 20000;
const BOOT_MAX_LOOP_IT  = 32;
const STACK_RESET_TOP   = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY   = 0x0802B2;
const MAX_LOOP_IT       = 500;
const MAX_STEPS         = 50000;
const PER_FN_TIMEOUT_MS = 10000;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_END   = 0xD020BF;
const MODE_BUF_LEN   = MODE_BUF_END - MODE_BUF_START + 1; // 26

// The 13 ROM addresses from Phase 100A static scan.
const STATIC_HITS = [
  { romAddr: 0x0781cc, target: 0xd020b8 },
  { romAddr: 0x0b2d6a, target: 0xd020b2 },
  { romAddr: 0x0b2e87, target: 0xd020b2 },
  { romAddr: 0x0b2f32, target: 0xd020b1 },
  { romAddr: 0x0b2f36, target: 0xd020a8 },
  { romAddr: 0x0b306e, target: 0xd020b2 },
  { romAddr: 0x0b3400, target: 0xd020b2 },
  { romAddr: 0x0b4073, target: 0xd020b2 },
  { romAddr: 0x0b42c3, target: 0xd020b2 },
  { romAddr: 0x0b4b01, target: 0xd020b2 },
  { romAddr: 0x0b4bab, target: 0xd020b2 },
  { romAddr: 0x0b4bd7, target: 0xd020b2 },
  { romAddr: 0x0b59ce, target: 0xd020b2 },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  if (v === null || v === undefined) return 'n/a';
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function safeChar(byte) {
  if (byte >= 0x20 && byte < 0x7f) return String.fromCharCode(byte);
  return '.';
}

// ── Boot helpers (copied from probe-phase99d-home-verify.mjs) ─────────────────

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_IT,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase  = 0xD0;
  cpu._iy    = 0xD00080;
  cpu._hl    = 0;
  cpu.halted = false;
  cpu.iff1   = 0;
  cpu.iff2   = 0;
  cpu.sp     = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

const CPU_FIELDS = [
  'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
];

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snap, mem) {
  for (const [f, v] of Object.entries(snap)) cpu[f] = v;
  cpu.halted = false;
  cpu.iff1   = 0;
  cpu.iff2   = 0;
  cpu._iy    = 0xD00080;
  cpu.f      = 0x40;
  cpu.sp     = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

// ── Function-start lookup ─────────────────────────────────────────────────────
// Given a ROM address, find the nearest PRELIFTED_BLOCKS key <= that address.
// Keys are hex strings like "0b2d6a:adl". We sort them numerically once.

function buildSortedBlockKeys(blocks) {
  return Object.keys(blocks)
    .map((key) => {
      const [addrHex] = key.split(':');
      return { key, addr: parseInt(addrHex, 16) };
    })
    .sort((a, b) => a.addr - b.addr);
}

function findEnclosingBlock(sortedKeys, romAddr) {
  // Binary-search for largest addr <= romAddr
  let lo = 0;
  let hi = sortedKeys.length - 1;
  let best = null;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedKeys[mid].addr <= romAddr) {
      best = sortedKeys[mid];
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best; // { key, addr } or null
}

// ── Write-hook factory ────────────────────────────────────────────────────────
// Wraps cpu.write8/write16/write24 to intercept writes to the mode buffer.
// Returns { unwrap, getWrites }.

function installWriteHook(cpu, mem) {
  const writes = [];
  let step = 0;

  const origWrite8  = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr <= MODE_BUF_END) {
      writes.push({ addr, size: 1, value: value & 0xFF, step, pc: cpu.pc ?? 0 });
    }
    origWrite8(addr, value);
    step++;
  };

  cpu.write16 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr <= MODE_BUF_END + 1) {
      writes.push({ addr, size: 2, value: value & 0xFFFF, step, pc: cpu.pc ?? 0 });
    }
    origWrite16(addr, value);
    step++;
  };

  cpu.write24 = (addr, value) => {
    if (addr >= MODE_BUF_START && addr <= MODE_BUF_END + 2) {
      writes.push({ addr, size: 3, value: value & 0xFFFFFF, step, pc: cpu.pc ?? 0 });
    }
    origWrite24(addr, value);
    step++;
  };

  return {
    getWrites: () => writes,
    unwrap: () => {
      cpu.write8  = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

// ── Classify result ───────────────────────────────────────────────────────────

function classifyResult(writes, termination) {
  if (termination === 'CRASH' || termination === 'TIMEOUT') return termination;

  // Count distinct bytes covered in the buffer
  const covered = new Set();
  for (const w of writes) {
    for (let i = 0; i < w.size; i++) {
      const off = w.addr + i - MODE_BUF_START;
      if (off >= 0 && off < MODE_BUF_LEN) covered.add(off);
    }
  }

  if (covered.size === 0) return 'NO-OP';
  if (covered.size >= 13) {
    // Check if written bytes look like ASCII text
    const buf = new Uint8Array(MODE_BUF_LEN).fill(0);
    for (const w of writes) {
      for (let i = 0; i < w.size; i++) {
        const off = w.addr + i - MODE_BUF_START;
        if (off >= 0 && off < MODE_BUF_LEN) {
          const byteVal = (w.value >> (i * 8)) & 0xFF;
          buf[off] = byteVal;
        }
      }
    }
    const printable = [...buf].filter((b) => b >= 0x20 && b < 0x7F).length;
    if (printable >= 10) return 'POPULATOR';
  }
  return 'PARTIAL';
}

// ── Format first N writes as a table ─────────────────────────────────────────

function formatWrites(writes, limit = 30) {
  if (writes.length === 0) return '(none)';
  const rows = [];
  rows.push('| offset | byte | char | step |');
  rows.push('|---:|---:|:---:|---:|');
  for (const w of writes.slice(0, limit)) {
    for (let i = 0; i < w.size; i++) {
      const off = w.addr + i - MODE_BUF_START;
      if (off < 0 || off >= MODE_BUF_LEN) continue;
      const b = (w.value >> (i * 8)) & 0xFF;
      rows.push(`| +${off} | 0x${b.toString(16).padStart(2,'0')} | \`${safeChar(b)}\` | ${w.step} |`);
    }
    if (rows.length > limit + 2) break; // guard
  }
  return rows.join('\n');
}

// ── Mode RAM seeding helpers ──────────────────────────────────────────────────
// The mode display functions read index bytes from:
//   0xD02048 = number mode   (0=Normal, 1=Sci, 2=Eng)
//   0xD02049 = float mode    (0=Float, 1-9=Fix0-9)
//   0xD0204A = angle mode    (0=Radian, 1=Degree)
// Cold RAM has all zeros. With these seeds the functions should produce ASCII text.
// These are the typical TI-84 CE OS RAM addresses based on ROM analysis of 0x0b2f65
// (reads 0xD02049) and 0x0b486b (reads 0xD02048).
const MODE_SEEDS = {
  D02048: 0x00, // Normal
  D02049: 0x00, // Float
  D0204A: 0x00, // Radian
};

function seedModeRam(mem) {
  mem[0xD02048] = MODE_SEEDS.D02048;
  mem[0xD02049] = MODE_SEEDS.D02049;
  mem[0xD0204A] = MODE_SEEDS.D0204A;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 100B — Dynamic Trace ===');

  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule.PRELIFTED_BLOCKS;

  console.log(`Loaded ${Object.keys(BLOCKS).length} PRELIFTED_BLOCKS entries`);

  const sortedKeys = buildSortedBlockKeys(BLOCKS);

  // ── Build function-start lookup table ──────────────────────────────────────
  const fnLookup = [];
  const deduped = new Map(); // enclosing block addr -> first hit index in fnLookup

  for (const hit of STATIC_HITS) {
    const enc = findEnclosingBlock(sortedKeys, hit.romAddr);
    const fnAddr = enc ? enc.addr : null;
    const fnKey  = enc ? enc.key  : null;
    fnLookup.push({ romAddr: hit.romAddr, target: hit.target, fnAddr, fnKey });
    if (fnAddr !== null && !deduped.has(fnAddr)) {
      deduped.set(fnAddr, fnLookup.length - 1);
    }
  }

  // Also add the externally-called function 0x0b2d8a (mode update, called from 0x0acb01)
  // and 0x0b3a26 (called from 0x0ac171). These weren't in the static scan but are in the
  // same module and are candidates for the full populate.
  const EXTRA_FNS = [0x0b2d8a, 0x0b3a26, 0x0b33bb, 0x0b33c0, 0x0b3a2b];
  for (const fnAddr of EXTRA_FNS) {
    const key = fnAddr.toString(16).padStart(6, '0') + ':adl';
    if (!deduped.has(fnAddr) && BLOCKS[key]) {
      deduped.set(fnAddr, -1);
      fnLookup.push({ romAddr: fnAddr, target: 0, fnAddr, fnKey: key, extra: true });
    }
  }

  console.log(`Unique enclosing functions (including extras): ${deduped.size}`);

  // ── Boot once ──────────────────────────────────────────────────────────────
  const mem  = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor    = createExecutor(BLOCKS, mem, { peripherals });
  const cpu         = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  // Snapshot RAM + CPU after boot
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  // ── Probe each unique function — two passes: cold RAM and seeded mode RAM ──
  const results = new Map(); // fnAddr -> result

  for (const [fnAddr, _idx] of deduped) {
    const fnKey = fnLookup.find((e) => e.fnAddr === fnAddr)?.fnKey;
    const mode  = fnKey ? fnKey.split(':')[1] : 'adl';

    // Run twice: once cold, once with mode RAM seeded
    for (const seeded of [false, true]) {
      const label = seeded ? 'seeded' : 'cold';
      const runKey = `${fnAddr}_${label}`;

      console.log(`  probe fn=${hex(fnAddr)} key=${fnKey} [${label}]`);

      // Restore RAM and CPU
      mem.set(ramSnap, 0x400000);
      restoreCpu(cpu, cpuSnap, mem);

      if (seeded) seedModeRam(mem);

      const hook = installWriteHook(cpu, mem);
      let termination = 'max_steps';
      let steps = 0;
      let lastPc = fnAddr;

      const deadline = Date.now() + PER_FN_TIMEOUT_MS;

      try {
        const run = executor.runFrom(fnAddr, mode, {
          maxSteps: MAX_STEPS,
          maxLoopIterations: MAX_LOOP_IT,
        });
        termination = run.termination;
        steps       = run.steps;
        lastPc      = run.lastPc;

        if (Date.now() > deadline) termination = 'TIMEOUT';
      } catch (err) {
        termination = 'CRASH';
        console.log(`    CRASH: ${err.message}`);
      }

      hook.unwrap();
      const writes = hook.getWrites();
      const verdict = classifyResult(writes, termination);

      console.log(`    term=${termination} steps=${steps} bufWrites=${writes.length} verdict=${verdict}`);

      results.set(runKey, { fnAddr, fnKey, mode, seeded, termination, steps, lastPc, writes, verdict });

      // If we already found a populator in the seeded pass, no need for more
      if (seeded && verdict === 'POPULATOR') break;
    }
  }

  // ── Build report ───────────────────────────────────────────────────────────
  const lines = [];
  lines.push('# Phase 100B — Dynamic Trace of Mode Buffer Populators');
  lines.push('');
  lines.push('Generated by `probe-phase100b-dynamic-trace.mjs`.');
  lines.push('');
  lines.push(`- Boot: steps=${bootResult.steps} term=${bootResult.termination}`);
  lines.push(`- PRELIFTED_BLOCKS: ${Object.keys(BLOCKS).length} entries`);
  lines.push(`- Unique enclosing functions probed: ${deduped.size}`);
  lines.push(`- RAM seed for seeded pass: D02048=0x${MODE_SEEDS.D02048.toString(16).padStart(2,'0')} (Normal), D02049=0x${MODE_SEEDS.D02049.toString(16).padStart(2,'0')} (Float), D0204A=0x${MODE_SEEDS.D0204A.toString(16).padStart(2,'0')} (Radian)`);
  lines.push('');

  // Table 1: ROM address → enclosing function (static hits only)
  lines.push('## Function-Start Lookup Table (Static Hits)');
  lines.push('');
  lines.push('| ROM addr | target | fn entry | fn key |');
  lines.push('|---|---|---|---|');
  for (const e of fnLookup.filter((e) => !e.extra)) {
    lines.push(`| ${hex(e.romAddr)} | ${hex(e.target)} | ${hex(e.fnAddr)} | \`${e.fnKey ?? 'n/a'}\` |`);
  }
  lines.push('');
  lines.push('Extra functions probed (external callers, not in static scan):');
  for (const e of fnLookup.filter((e) => e.extra)) {
    lines.push(`- ${hex(e.fnAddr)} (\`${e.fnKey}\`)`);
  }
  lines.push('');

  // Table 2: results per function (both passes)
  lines.push('## Probe Results');
  lines.push('');
  lines.push('| fn entry | pass | termination | steps | buf writes | verdict |');
  lines.push('|---|---|---|---:|---:|---|');
  for (const r of results.values()) {
    const pass = r.seeded ? 'seeded' : 'cold';
    lines.push(`| ${hex(r.fnAddr)} | ${pass} | \`${r.termination}\` | ${r.steps} | ${r.writes.length} | **${r.verdict}** |`);
  }
  lines.push('');

  // Table 3: writes detail for POPULATOR/PARTIAL (seeded pass preferred)
  const interesting = [...results.values()].filter(
    (r) => r.verdict === 'POPULATOR' || r.verdict === 'PARTIAL',
  );

  // De-dup: prefer seeded over cold for the same fnAddr
  const bestByFn = new Map();
  for (const r of interesting) {
    const existing = bestByFn.get(r.fnAddr);
    if (!existing || r.seeded) bestByFn.set(r.fnAddr, r);
  }
  const bestInteresting = [...bestByFn.values()];

  if (bestInteresting.length === 0) {
    lines.push('## Write Details');
    lines.push('');
    lines.push('No POPULATOR or PARTIAL functions found in this run.');
    lines.push('');
  } else {
    for (const r of bestInteresting) {
      const pass = r.seeded ? 'seeded' : 'cold';
      lines.push(`## Write Detail — fn ${hex(r.fnAddr)} [${r.verdict}] [${pass}]`);
      lines.push('');
      lines.push(formatWrites(r.writes, 30));
      lines.push('');

      // Show the buffer content after all writes
      const buf = new Uint8Array(MODE_BUF_LEN).fill(0);
      for (const w of r.writes) {
        for (let i = 0; i < w.size; i++) {
          const off = w.addr + i - MODE_BUF_START;
          if (off >= 0 && off < MODE_BUF_LEN) buf[off] = (w.value >> (i * 8)) & 0xFF;
        }
      }
      const str = [...buf].map((b) => safeChar(b)).join('');
      lines.push(`Final buffer content: \`${str}\``);
      lines.push('');
    }
  }

  // Recommendation
  lines.push('## Next Steps');
  lines.push('');
  const populators = bestInteresting.filter((r) => r.verdict === 'POPULATOR');
  const partials   = bestInteresting.filter((r) => r.verdict === 'PARTIAL');
  const allNoops   = [...results.values()].filter((r) => r.verdict === 'NO-OP');
  const allCrashes = [...results.values()].filter((r) => r.verdict === 'CRASH' || r.verdict === 'TIMEOUT');

  if (populators.length > 0) {
    lines.push(`Found ${populators.length} POPULATOR function(s):`);
    for (const r of populators) {
      const pass = r.seeded ? 'seeded' : 'cold';
      lines.push(`- ${hex(r.fnAddr)} (key \`${r.fnKey}\`, ${pass}): ${r.writes.length} writes, term=\`${r.termination}\``);
    }
    lines.push('');
    lines.push('These are strong candidates for the OS mode-buffer populate routine.');
    lines.push('Next: disassemble the function and trace callers to confirm it is reachable from the home-screen setup path.');
    lines.push('Wire this function into the golden regression instead of the hand-seed in probe-phase99d-home-verify.mjs.');
  } else if (partials.length > 0) {
    lines.push(`No POPULATOR found. ${partials.length} PARTIAL function(s) write a subset of the buffer:`);
    for (const r of partials) {
      const pass = r.seeded ? 'seeded' : 'cold';
      lines.push(`- ${hex(r.fnAddr)} (key \`${r.fnKey}\`, ${pass}): ${r.writes.length} writes`);
    }
    lines.push('');
    lines.push('Analysis: the partials write only to 0xD020B2+ (offset +12, angle-mode slot).');
    lines.push('The "Normal Float" portion (offsets +0..+11) is NOT written by any probed function.');
    lines.push('');
    lines.push('Possible causes:');
    lines.push('1. The first-12-bytes populate uses a COMPUTED destination address (HL + DE offset), not a literal LD HL,0xD020A6.');
    lines.push('   → Scan ROM for functions that do `LD HL, 0xD02040-ish` then `ADD HL,DE` to reach 0xD020A6.');
    lines.push('2. The populate entry point is a HIGHER-LEVEL function (e.g. 0x0b2d8a or 0x0b3a26) that');
    lines.push('   calls subfunctions for each mode slot, but those subfunctions need the full call stack');
    lines.push('   (including IX/IY and calling convention) that we don\'t set up in a standalone runFrom.');
    lines.push('3. The mode RAM address offsets are DIFFERENT from what we seeded (0xD02048-4A).');
    lines.push('   → Try seeding 0xD020A0-A5 range with mode index values (0,0,0).');
    lines.push('');
    lines.push('Recommended next probe: run 0x0b2d8a (the known external entry) with a fully');
    lines.push('prepared stack frame (IY=0xD00080, SP set, all mode bytes at 0xD02048-4A seeded).');
  } else {
    lines.push('No POPULATOR or PARTIAL found in either cold or seeded passes.');
    lines.push('');
    if (allCrashes.length > 0) {
      lines.push(`${allCrashes.length} run(s) crashed or timed out.`);
    }
    lines.push('The populate function likely requires a different calling convention or pre-state.');
    lines.push('Next: trace from 0x0acb01 (known caller of 0x0b2d8a) to understand full pre-call setup.');
  }

  lines.push('');
  lines.push(`_Report bounded at 250 lines. Total lines: ${lines.length}_`);

  const report = lines.slice(0, 250).join('\n') + '\n';
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\nreport: ${REPORT_PATH}`);
}

try {
  await main();
} catch (err) {
  console.error(err.stack || err);
  const failReport = [
    '# Phase 100B — Dynamic Trace',
    '',
    '## Fatal Error',
    '',
    '```',
    err.stack || String(err),
    '```',
  ].join('\n') + '\n';
  fs.writeFileSync(REPORT_PATH, failReport);
  process.exitCode = 1;
}
