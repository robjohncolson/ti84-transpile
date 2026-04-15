#!/usr/bin/env node

/**
 * Phase 171 — Display Buffer Populator Hunt
 *
 * Phase 169 found that the home screen text renderer reads characters from a
 * display buffer at RAM 0xD006C0-0xD006FF. This probe performs:
 *   Part A: Static disassembly of 16 known ROM addresses referencing 0xD006C0
 *   Part B: Dynamic probing of WRITE candidates to detect actual buffer population
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const RAM_START = 0x400000;
const RAM_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;

const BOOT_MAX_LOOPS = 32;
const KERNEL_INIT_MAX_LOOPS = 10000;

const STACK_RESET_TOP = 0xD1A87E;

const DISPLAY_BUF_START = 0xD006C0;
const DISPLAY_BUF_END = 0xD006FF;
const DISPLAY_BUF_LEN = DISPLAY_BUF_END - DISPLAY_BUF_START + 1;

const MODE_BUF_START = 0xD020A6;
const MODE_TEXT = 'Normal Float Radian       ';

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// The 16 immediate references to 0xD006C0 found in Phase 169
const CANDIDATE_ADDRS = [
  0x0885A1,
  0x088720,
  0x08C2EF,
  0x0A2000,
  0x0A20B2,
  0x0A2133,
  0x0A21FF,
  0x0A2203,
  0x0A22A4,
  0x0A231D,
  0x0A2394,
  0x0A2969,
];

// Also include the paired instruction at 0x08C2F3 (LD DE,0xD006C1 — LDIR setup)
const EXTRA_ADDRS = [0x08C2F3];
const ALL_ADDRS = [...CANDIDATE_ADDRS, ...EXTRA_ADDRS];

// --- Load ROM and transpiled blocks ---
const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// --- Utility functions ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function formatBytes(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

function mnemonicOf(inst) {
  if (!inst) return '<null>';
  const { tag, pair, value, addr, src, dest } = inst;
  if (tag === 'ld-pair-imm') return `LD ${(pair || '??').toUpperCase()},${hex(value)}`;
  if (tag === 'ld-mem-reg') return `LD (${hex(addr)}),${(src || '?').toUpperCase()}`;
  if (tag === 'ld-mem-pair') return `LD (${hex(addr)}),${(pair || '?').toUpperCase()}`;
  if (tag === 'ld-reg-mem') return `LD ${(dest || '?').toUpperCase()},(${hex(addr)})`;
  if (tag === 'ld-pair-mem') return `LD ${(pair || '?').toUpperCase()},(${hex(addr)})`;
  if (tag === 'ldir') return 'LDIR';
  if (tag === 'lddr') return 'LDDR';
  if (tag === 'ldi') return 'LDI';
  if (tag === 'ldd') return 'LDD';
  if (tag === 'ret') return 'RET';
  if (tag === 'call') return `CALL ${hex(inst.target)}`;
  if (tag === 'jp') return `JP ${hex(inst.target)}`;
  if (tag === 'jr') return `JR ${hex(inst.target)}`;
  if (tag === 'push') return `PUSH ${(pair || '?').toUpperCase()}`;
  if (tag === 'pop') return `POP ${(pair || '?').toUpperCase()}`;
  if (tag === 'nop') return 'NOP';
  if (tag === 'halt') return 'HALT';
  if (tag === 'di') return 'DI';
  if (tag === 'ei') return 'EI';
  return tag.toUpperCase();
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem, stackBytes = 12) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - stackBytes;
  mem.fill(0xFF, cpu.sp, cpu.sp + stackBytes);
}

function dumpDisplayBuffer(mem) {
  const bytes = [];
  for (let addr = DISPLAY_BUF_START; addr <= DISPLAY_BUF_END; addr++) {
    bytes.push(mem[addr]);
  }
  return bytes;
}

function bufferToAscii(bytes) {
  return bytes.map((b) => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('');
}

function bufferToHex(bytes) {
  return bytes.map((b) => hexByte(b)).join(' ');
}

function bufferHasNonZero(bytes) {
  return bytes.some((b) => b !== 0x00);
}

function countNonZero(bytes) {
  return bytes.filter((b) => b !== 0x00).length;
}

// --- Part A: Static disassembly around each candidate ---

function disassembleRegion(startAddr, length) {
  const rows = [];
  let pc = startAddr;
  const endAddr = startAddr + length;

  while (pc < endAddr && pc < romBytes.length) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      rows.push({ pc, length: 1, tag: '<decode-error>', text: '<decode-error>' });
      pc += 1;
      continue;
    }

    if (!inst || !inst.length || inst.length <= 0) {
      rows.push({ pc, length: 1, tag: '<bad>', text: '<bad>' });
      pc += 1;
      continue;
    }

    const bytes = romBytes.subarray(pc, pc + inst.length);
    rows.push({
      pc,
      length: inst.length,
      bytes: Array.from(bytes),
      tag: inst.tag,
      inst,
      text: mnemonicOf(inst),
    });

    pc = inst.nextPc;
  }

  return rows;
}

function findLdirLddr(rows) {
  const results = [];
  for (const row of rows) {
    if (row.tag === 'ldir' || row.tag === 'lddr' || row.tag === 'ldi' || row.tag === 'ldd') {
      results.push(row);
    }
  }
  return results;
}

function findPairLoads(rows) {
  // Find LD HL,nn or LD DE,nn that set up source/dest for LDIR
  const results = [];
  for (const row of rows) {
    if (row.tag === 'ld-pair-imm' && row.inst) {
      const pair = (row.inst.pair || '').toLowerCase();
      if (pair === 'hl' || pair === 'de' || pair === 'bc') {
        results.push({
          pc: row.pc,
          pair: pair.toUpperCase(),
          value: row.inst.value,
          text: row.text,
        });
      }
    }
  }
  return results;
}

function classifyReference(candidateAddr, rows) {
  // Find the row matching the candidate address
  const targetRow = rows.find((r) => r.pc === candidateAddr);
  if (!targetRow || !targetRow.inst) {
    return { direction: 'UNKNOWN', detail: 'instruction not found at exact address' };
  }

  const inst = targetRow.inst;
  const pair = (inst.pair || '').toLowerCase();

  // LD DE,0xD006C0 followed by LDIR => WRITE (DE is destination for LDIR)
  // LD HL,0xD006C0 followed by LDIR => READ (HL is source for LDIR)
  // LD HL,0xD006C0 could also be used as a pointer for LD (HL),A loops

  // Look for LDIR/LDDR nearby
  const ldirRows = findLdirLddr(rows);
  const pairLoads = findPairLoads(rows);

  // Check if this instruction loads DE or HL with the buffer address
  let direction = 'UNKNOWN';
  let sourceAddr = null;
  let destAddr = null;
  let bcValue = null;

  if (inst.tag === 'ld-pair-imm') {
    if (pair === 'de') {
      // DE = destination for LDIR => this is a WRITE setup
      direction = 'WRITE';
      destAddr = inst.value;
      // Look for HL load (source) nearby
      for (const pl of pairLoads) {
        if (pl.pair === 'HL' && pl.pc !== candidateAddr) {
          sourceAddr = pl.value;
        }
      }
    } else if (pair === 'hl') {
      // Check if there's an LDIR nearby — if so, HL=source => READ
      if (ldirRows.length > 0) {
        direction = 'READ';
        sourceAddr = inst.value;
        // Look for DE load (destination)
        for (const pl of pairLoads) {
          if (pl.pair === 'DE' && pl.pc !== candidateAddr) {
            destAddr = pl.value;
          }
        }
      } else {
        // HL loaded but no LDIR — might be used as pointer for LD (HL),A loop
        // or as a source in some other way; classify as POINTER
        direction = 'POINTER';
      }
    } else if (pair === 'bc') {
      direction = 'COUNT';
      bcValue = inst.value;
    }
  }

  // Try to find BC (count) value
  for (const pl of pairLoads) {
    if (pl.pair === 'BC') {
      bcValue = pl.value;
    }
  }

  return {
    direction,
    pair: pair.toUpperCase(),
    sourceAddr,
    destAddr,
    bcValue,
    ldirCount: ldirRows.length,
    ldirAddrs: ldirRows.map((r) => r.pc),
    pairLoads,
    detail: `${inst.tag} ${pair.toUpperCase()},${hex(inst.value || 0)}`,
  };
}

function runPartA() {
  console.log('PART A: Static Disassembly of Candidate Regions');
  console.log('================================================');

  const results = [];

  for (const addr of ALL_ADDRS) {
    // Disassemble 20 bytes before through 44 bytes after (64 bytes total)
    const regionStart = Math.max(0, addr - 20);
    const regionLen = 64;

    console.log(`\n--- ${hex(addr)} (region ${hex(regionStart)} - ${hex(regionStart + regionLen)}) ---`);

    const rows = disassembleRegion(regionStart, regionLen);

    // Print the disassembly
    for (const row of rows) {
      const marker = row.pc === addr ? ' <<<' : '';
      const bytesStr = row.bytes ? formatBytes(row.bytes) : '';
      console.log(`  ${hex(row.pc)}: ${bytesStr.padEnd(20)} ${row.text}${marker}`);
    }

    // Classify the reference
    const classification = classifyReference(addr, rows);
    console.log(`  CLASSIFICATION: direction=${classification.direction} pair=${classification.pair || 'n/a'}`);
    if (classification.sourceAddr !== null && classification.sourceAddr !== undefined) {
      console.log(`    SOURCE: ${hex(classification.sourceAddr)}`);
    }
    if (classification.destAddr !== null && classification.destAddr !== undefined) {
      console.log(`    DEST:   ${hex(classification.destAddr)}`);
    }
    if (classification.bcValue !== null && classification.bcValue !== undefined) {
      console.log(`    COUNT (BC): ${hex(classification.bcValue)} (${classification.bcValue} bytes)`);
    }
    if (classification.ldirCount > 0) {
      console.log(`    LDIR/LDDR at: ${classification.ldirAddrs.map((a) => hex(a)).join(', ')}`);
    }

    // Determine if this is a write candidate for Part B
    const isWriteCandidate = classification.direction === 'WRITE' ||
      (classification.direction === 'POINTER' && classification.pair === 'HL');

    results.push({
      addr,
      classification,
      isWriteCandidate,
      rows,
    });
  }

  // Also do a broader scan: look for ALL LDIR/LDDR that are near any LD DE,0xD006C0
  console.log('\n\n--- Broader LDIR Scan: LD DE with D006xx + nearby LDIR ---');
  const broadResults = [];
  let scanPc = 0x080000; // Start from ADL-mode ROM region
  while (scanPc < ROM_LIMIT) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, scanPc, 'adl');
    } catch {
      scanPc += 1;
      continue;
    }
    if (!inst || !inst.length || inst.length <= 0) {
      scanPc += 1;
      continue;
    }

    // Look for LD DE with value in display buffer range
    if (inst.tag === 'ld-pair-imm' && (inst.pair || '').toLowerCase() === 'de') {
      if (inst.value >= DISPLAY_BUF_START && inst.value <= DISPLAY_BUF_END) {
        // Check next 20 instructions for LDIR
        let checkPc = inst.nextPc;
        for (let i = 0; i < 20 && checkPc < ROM_LIMIT; i++) {
          let checkInst;
          try {
            checkInst = decodeInstruction(romBytes, checkPc, 'adl');
          } catch {
            break;
          }
          if (!checkInst || !checkInst.length) break;
          if (checkInst.tag === 'ldir' || checkInst.tag === 'lddr') {
            broadResults.push({
              ldDeAddr: scanPc,
              deValue: inst.value,
              ldirAddr: checkPc,
              ldirTag: checkInst.tag,
              distance: i,
            });
            break;
          }
          checkPc = checkInst.nextPc;
        }
      }
    }

    scanPc = inst.nextPc;
  }

  console.log(`  Found ${broadResults.length} LD DE,D006xx + nearby LDIR pairs:`);
  for (const r of broadResults) {
    console.log(`    LD DE,${hex(r.deValue)} at ${hex(r.ldDeAddr)} -> ${r.ldirTag} at ${hex(r.ldirAddr)} (${r.distance} instructions apart)`);
  }

  return { results, broadResults };
}

// --- Part B: Dynamic Probing ---

function initializeEnvironment() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, ROM_LIMIT)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  // Kernel init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOPS,
  });

  // Post-init
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  console.log(`Boot:        steps=${boot.steps} term=${boot.termination}`);
  console.log(`Kernel init: steps=${kernelInit.steps} term=${kernelInit.termination}`);
  console.log(`Post-init:   steps=${postInit.steps} term=${postInit.termination}`);

  return {
    mem,
    cpu,
    executor,
    ramSnapshot: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
  };
}

function scanBackForPrologue(addr) {
  // Scan backwards from addr looking for common function prologues:
  // PUSH AF (F5), PUSH BC/DE/HL, or a RET/JP/CALL that would indicate
  // the start of a new function. Return the addr itself if nothing found.
  const maxScan = 64;
  const startAddr = Math.max(0x080000, addr - maxScan);

  // Disassemble forward from startAddr to addr and find the last RET/JP before addr
  const rows = disassembleRegion(startAddr, addr - startAddr + 1);

  let bestStart = addr;

  // Walk through rows, looking for function boundaries
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (row.pc >= addr) continue;

    // PUSH AF/IX/IY at start of function
    if (row.tag === 'push') {
      bestStart = row.pc;
      // Keep going to find the actual start
      continue;
    }

    // If we hit a RET or JP (unconditional), the function likely starts right after
    if (row.tag === 'ret' || row.tag === 'jp' || row.tag === 'halt') {
      // The instruction after this is likely the function start
      if (i + 1 < rows.length && rows[i + 1].pc < addr) {
        bestStart = rows[i + 1].pc;
      }
      break;
    }
  }

  return bestStart;
}

function runDynamicProbe(env, label, entryAddr, maxSteps = 5000) {
  // Restore clean state
  env.mem.set(env.ramSnapshot, RAM_START);
  restoreCpu(env.cpu, env.cpuSnapshot, env.mem, 12);

  // Seed mode buffer (in case the function copies from there)
  for (let i = 0; i < MODE_TEXT.length; i++) {
    env.mem[MODE_BUF_START + i] = MODE_TEXT.charCodeAt(i);
  }

  // Zero-fill the display buffer so we can detect writes
  env.mem.fill(0x00, DISPLAY_BUF_START, DISPLAY_BUF_START + DISPLAY_BUF_LEN);

  // Record pre-state
  const beforeBuf = dumpDisplayBuffer(env.mem);

  let result;
  try {
    result = env.executor.runFrom(entryAddr, 'adl', {
      maxSteps,
      maxLoopIterations: 500,
    });
  } catch (err) {
    return {
      label,
      entryAddr,
      error: err.message || String(err),
      steps: 0,
      termination: 'error',
      changed: false,
      changedCount: 0,
      afterBuf: beforeBuf,
    };
  }

  const afterBuf = dumpDisplayBuffer(env.mem);
  const changed = bufferHasNonZero(afterBuf);
  const changedCount = countNonZero(afterBuf);

  return {
    label,
    entryAddr,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    changed,
    changedCount,
    afterBuf,
  };
}

function runPartB(env, partAResults) {
  console.log('\n\nPART B: Dynamic Probing of WRITE Candidates');
  console.log('============================================');

  // Collect all write candidates from Part A
  const writeCandidates = partAResults.results.filter((r) => r.isWriteCandidate);

  // Also add broad scan results as candidates
  const broadEntries = partAResults.broadResults.map((r) => ({
    addr: r.ldDeAddr,
    isWriteCandidate: true,
    classification: {
      direction: 'WRITE',
      pair: 'DE',
      destAddr: r.deValue,
      ldirAddrs: [r.ldirAddr],
    },
  }));

  // Merge broad entries that aren't already in candidates
  const candidateAddrs = new Set(writeCandidates.map((c) => c.addr));
  for (const be of broadEntries) {
    if (!candidateAddrs.has(be.addr)) {
      writeCandidates.push(be);
      candidateAddrs.add(be.addr);
    }
  }

  // Also try ALL candidate addresses, not just classified writes
  // (our static analysis might miss some indirect patterns)
  const allToProbe = [];
  for (const r of partAResults.results) {
    allToProbe.push(r);
  }
  for (const be of broadEntries) {
    if (!partAResults.results.find((r) => r.addr === be.addr)) {
      allToProbe.push(be);
    }
  }

  console.log(`\nWrite candidates from static analysis: ${writeCandidates.length}`);
  console.log(`Total addresses to probe: ${allToProbe.length}`);

  const dynamicResults = [];

  for (const candidate of allToProbe) {
    const addr = candidate.addr;
    const funcStart = scanBackForPrologue(addr);

    console.log(`\n--- Probing ${hex(addr)} (func start: ${hex(funcStart)}) ---`);
    console.log(`  Classification: ${candidate.classification?.direction || 'n/a'}`);

    // Probe 1: Run from the function start
    const probe1 = runDynamicProbe(env, `${hex(addr)} (from func ${hex(funcStart)})`, funcStart, 5000);
    console.log(`  Run from ${hex(funcStart)}: steps=${probe1.steps} term=${probe1.termination} lastPc=${hex(probe1.lastPc)}`);
    console.log(`  Buffer changed: ${probe1.changed ? 'YES' : 'NO'} (${probe1.changedCount} non-zero bytes)`);

    if (probe1.changed) {
      console.log(`  Hex: ${bufferToHex(probe1.afterBuf)}`);
      console.log(`  ASCII: "${bufferToAscii(probe1.afterBuf)}"`);
    }

    dynamicResults.push(probe1);

    // Probe 2: If func start differs from addr, also try running from the exact address
    if (funcStart !== addr) {
      const probe2 = runDynamicProbe(env, `${hex(addr)} (exact)`, addr, 5000);
      console.log(`  Run from ${hex(addr)} (exact): steps=${probe2.steps} term=${probe2.termination} lastPc=${hex(probe2.lastPc)}`);
      console.log(`  Buffer changed: ${probe2.changed ? 'YES' : 'NO'} (${probe2.changedCount} non-zero bytes)`);

      if (probe2.changed) {
        console.log(`  Hex: ${bufferToHex(probe2.afterBuf)}`);
        console.log(`  ASCII: "${bufferToAscii(probe2.afterBuf)}"`);
      }

      dynamicResults.push(probe2);
    }
  }

  // Extra: Try the kernel init LDIR at 0x08C2EF which was specifically flagged
  console.log('\n--- Special: Kernel Init LDIR Region (0x08C2EF) ---');

  // Disassemble wider region around 0x08C2EF to find the LDIR
  const kernelRegion = disassembleRegion(0x08C2E0, 48);
  for (const row of kernelRegion) {
    const bytesStr = row.bytes ? formatBytes(row.bytes) : '';
    console.log(`  ${hex(row.pc)}: ${bytesStr.padEnd(20)} ${row.text}`);
  }

  // Try running from 0x08C2EF itself (the LD HL instruction)
  const kernelProbe = runDynamicProbe(env, '0x08C2EF (kernel LDIR setup)', 0x08C2EF, 1000);
  console.log(`  Run from 0x08C2EF: steps=${kernelProbe.steps} term=${kernelProbe.termination} lastPc=${hex(kernelProbe.lastPc)}`);
  console.log(`  Buffer changed: ${kernelProbe.changed ? 'YES' : 'NO'} (${kernelProbe.changedCount} non-zero bytes)`);
  if (kernelProbe.changed) {
    console.log(`  Hex: ${bufferToHex(kernelProbe.afterBuf)}`);
    console.log(`  ASCII: "${bufferToAscii(kernelProbe.afterBuf)}"`);
  }
  dynamicResults.push(kernelProbe);

  // Extra: Probe the 0x0A2xxx cluster addresses as potential home-screen routines
  // that may populate the buffer before rendering
  const homeScreenEntries = [0x0A2000, 0x0A20B2, 0x0A2133, 0x0A21FF, 0x0A22A4, 0x0A231D, 0x0A2394, 0x0A2969];

  console.log('\n--- Extended: Run each 0x0A2xxx address with larger step budget ---');
  for (const hsAddr of homeScreenEntries) {
    const funcStart = scanBackForPrologue(hsAddr);
    const probe = runDynamicProbe(env, `${hex(hsAddr)} (extended, func ${hex(funcStart)})`, funcStart, 20000);
    console.log(`  ${hex(hsAddr)} from ${hex(funcStart)}: steps=${probe.steps} term=${probe.termination} changed=${probe.changed ? 'YES' : 'NO'} (${probe.changedCount} bytes)`);
    if (probe.changed) {
      console.log(`    Hex: ${bufferToHex(probe.afterBuf)}`);
      console.log(`    ASCII: "${bufferToAscii(probe.afterBuf)}"`);
    }
    dynamicResults.push(probe);
  }

  return dynamicResults;
}

// --- Summary ---

function printSummary(partAResults, dynamicResults) {
  console.log('\n\nPHASE 171 RESULTS');
  console.log('=================');

  console.log('\nPart A: Static analysis');
  for (const r of partAResults.results) {
    const c = r.classification;
    const ldirInfo = c.ldirCount > 0 ? ` LDIR at ${c.ldirAddrs.map((a) => hex(a)).join(',')}` : '';
    const sourceInfo = c.sourceAddr != null ? ` SOURCE: ${hex(c.sourceAddr)}` : '';
    const destInfo = c.destAddr != null ? ` DEST: ${hex(c.destAddr)}` : '';
    const countInfo = c.bcValue != null ? ` COUNT: ${c.bcValue}` : '';
    console.log(`  ${hex(r.addr)}: ${c.detail} -- DIRECTION: ${c.direction}${sourceInfo}${destInfo}${countInfo}${ldirInfo}`);
  }

  console.log('\nPart B: Dynamic probing');
  const successfulWrites = [];

  for (const dr of dynamicResults) {
    const status = dr.error ? `ERROR: ${dr.error}` : `ran ${dr.steps} steps, buffer changed: ${dr.changed ? 'YES' : 'NO'}`;
    console.log(`  ${dr.label}: ${status}`);

    if (dr.changed && dr.changedCount > 0) {
      console.log(`  Changed bytes (${dr.changedCount}): ${bufferToHex(dr.afterBuf)}`);
      console.log(`  ASCII: "${bufferToAscii(dr.afterBuf)}"`);
      successfulWrites.push(dr);
    }
  }

  console.log('\n--- VERDICT ---');
  if (successfulWrites.length > 0) {
    console.log('VERDICT: POPULATOR_FOUND');
    // Sort by most bytes written
    successfulWrites.sort((a, b) => b.changedCount - a.changedCount);
    const best = successfulWrites[0];
    console.log(`Best candidate: ${best.label} -- writes ${best.changedCount} bytes`);
    console.log(`  steps=${best.steps} term=${best.termination}`);
    console.log(`  Buffer hex: ${bufferToHex(best.afterBuf)}`);
    console.log(`  Buffer ASCII: "${bufferToAscii(best.afterBuf)}"`);

    // Check if the written content matches the mode text
    const ascii = bufferToAscii(best.afterBuf);
    if (ascii.includes('Normal') || ascii.includes('Float') || ascii.includes('Radian')) {
      console.log(`  MATCH: Buffer contains mode text fragments!`);
    }

    if (successfulWrites.length > 1) {
      console.log(`\nOther successful populators (${successfulWrites.length - 1}):`);
      for (let i = 1; i < successfulWrites.length; i++) {
        const sw = successfulWrites[i];
        console.log(`  ${sw.label}: ${sw.changedCount} bytes, ASCII="${bufferToAscii(sw.afterBuf).substring(0, 40)}..."`);
      }
    }
  } else {
    console.log('VERDICT: POPULATOR_NOT_FOUND');
    console.log('No candidate wrote to the display buffer in the tested configurations.');
    console.log('Possible reasons:');
    console.log('  - The populator requires additional OS state not set up by cold boot');
    console.log('  - The populator is called indirectly (via function pointer or RST)');
    console.log('  - The step budget was insufficient');
    console.log('  - The buffer is populated by the kernel init itself (check post-init state)');
  }
}

// --- Main ---

async function main() {
  console.log('=== Phase 171 — Display Buffer Populator Hunt ===');
  console.log(`ROM bytes: ${romBytes.length}`);
  console.log(`PRELIFTED_BLOCKS: ${Object.keys(BLOCKS).length}`);
  console.log(`Display buffer: ${hex(DISPLAY_BUF_START)}-${hex(DISPLAY_BUF_END)} (${DISPLAY_BUF_LEN} bytes)`);
  console.log(`Candidate addresses: ${ALL_ADDRS.length}`);
  console.log('');

  // Part A: Static analysis
  const partAResults = runPartA();

  // Part B: Dynamic probing
  const env = initializeEnvironment();

  // First, check what the display buffer looks like after boot+init (before any probing)
  console.log('\n--- Display buffer state after boot+init ---');
  const postInitBuf = dumpDisplayBuffer(env.mem);
  const postInitNonZero = countNonZero(postInitBuf);
  console.log(`  Non-zero bytes: ${postInitNonZero} / ${DISPLAY_BUF_LEN}`);
  console.log(`  Hex: ${bufferToHex(postInitBuf)}`);
  console.log(`  ASCII: "${bufferToAscii(postInitBuf)}"`);

  if (postInitNonZero > 0) {
    console.log('  NOTE: The kernel init already populated some bytes in the display buffer!');
    console.log('  This may mean the kernel init IS the populator (via the LDIR at 0x08C2EF).');
  }

  const dynamicResults = runPartB(env, partAResults);

  // Summary
  printSummary(partAResults, dynamicResults);
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
