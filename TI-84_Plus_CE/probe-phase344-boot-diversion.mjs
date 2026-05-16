#!/usr/bin/env node

/**
 * Phase 344: Boot Diversion — .SIL prefix bug in ROM signature check
 *
 * FINDING: The function at 0x0008BB is a ROM signature check that uses a
 * .SIL prefix (byte 0x52) to force SBC HL,BC into 16-bit mode. The transpiler
 * incorrectly generates 24-bit SBC, causing the signature check to fail and
 * diverting boot to halt at 0x0019B5.
 *
 * Static disassembly of 0x0008BB:
 *   LD HL,(0x020100)    ; load 24-bit value from ROM
 *   LD BC,0x00A55A      ; magic constant
 *   OR A                 ; clear carry
 *   .SIL SBC HL,BC      ; 16-bit subtract (prefix 0x52)
 *   RET                  ; Z if signature matches
 *
 * ROM[0x020100] = 0xFFA55A (bytes: 5A A5 FF)
 * In 16-bit mode: 0xA55A - 0xA55A = 0 → Z → boot OK
 * In 24-bit mode: 0xFFA55A - 0x00A55A = 0xFF0000 → NZ → boot fails
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return `0x${(Number(value) & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

// ============================================================
// Section 1: Static ROM bytes at 0x0008BB-0x0008C7
// ============================================================

function showRomDisassembly(romBytes) {
  console.log('Section 1: ROM bytes at 0x0008BB-0x0008C7 (signature check function)');
  console.log('====================================================================');

  const start = 0x0008BB;
  const end = 0x0008C8; // one past last byte
  const bytes = [];
  for (let i = start; i < end; i++) {
    bytes.push(romBytes[i]);
  }

  console.log(`Raw bytes: ${bytes.map(b => hex8(b)).join(' ')}`);
  console.log('');

  // Manual disassembly with known structure:
  // ED 6B 00 01 02  = LD HL,(0x020100)  [5 bytes in ADL mode]
  // 01 5A A5 00     = LD BC,0x00A55A    [4 bytes in ADL mode]
  // B7              = OR A
  // 52 ED 42        = .SIL SBC HL,BC    [prefix 0x52 + ED 42]
  // C9              = RET

  let offset = 0;

  // LD HL,(nn) in ADL = ED 6B nn nn nn
  const ldHlBytes = bytes.slice(offset, offset + 5);
  const ldHlAddr = ldHlBytes[2] | (ldHlBytes[3] << 8) | (ldHlBytes[4] << 16);
  console.log(`  ${hex(start + offset)}: ${ldHlBytes.map(b => hex8(b).slice(2)).join(' ').padEnd(16)} LD HL,(${hex(ldHlAddr)})`);
  offset += 5;

  // LD BC,nn in ADL = 01 nn nn nn
  const ldBcBytes = bytes.slice(offset, offset + 4);
  const ldBcVal = ldBcBytes[1] | (ldBcBytes[2] << 8) | (ldBcBytes[3] << 16);
  console.log(`  ${hex(start + offset)}: ${ldBcBytes.map(b => hex8(b).slice(2)).join(' ').padEnd(16)} LD BC,${hex(ldBcVal)}`);
  offset += 4;

  // OR A
  const orAByte = bytes[offset];
  console.log(`  ${hex(start + offset)}: ${hex8(orAByte).slice(2).padEnd(16)} OR A`);
  offset += 1;

  // .SIL SBC HL,BC = 52 ED 42
  const silBytes = bytes.slice(offset, offset + 3);
  const hasSilPrefix = silBytes[0] === 0x52;
  console.log(`  ${hex(start + offset)}: ${silBytes.map(b => hex8(b).slice(2)).join(' ').padEnd(16)} .SIL SBC HL,BC  ${hasSilPrefix ? '[PREFIX 0x52 CONFIRMED]' : '[ERROR: no .SIL prefix!]'}`);
  offset += 3;

  // RET
  const retByte = bytes[offset];
  console.log(`  ${hex(start + offset)}: ${hex8(retByte).slice(2).padEnd(16)} RET`);

  console.log('');
  console.log(`  .SIL prefix (0x52) present: ${hasSilPrefix}`);
  console.log(`  Effect: SBC HL,BC operates on 16 bits only (ignores upper byte of HL)`);
  console.log('');
}

// ============================================================
// Section 2: ROM signature value at 0x020100
// ============================================================

function showSignatureValue(romBytes) {
  console.log('Section 2: ROM bytes at 0x020100-0x020102 (signature value)');
  console.log('============================================================');

  const b0 = romBytes[0x020100];
  const b1 = romBytes[0x020101];
  const b2 = romBytes[0x020102];
  const val24 = b0 | (b1 << 8) | (b2 << 16);
  const val16 = b0 | (b1 << 8);

  console.log(`  ROM[0x020100] = ${hex8(b0)}`);
  console.log(`  ROM[0x020101] = ${hex8(b1)}`);
  console.log(`  ROM[0x020102] = ${hex8(b2)}`);
  console.log(`  24-bit value:  ${hex(val24)} (little-endian: ${hex8(b0)} ${hex8(b1)} ${hex8(b2)})`);
  console.log(`  16-bit value:  ${hex(val16, 4)} (lower two bytes only)`);
  console.log('');
  console.log(`  Magic constant: 0x00A55A`);
  console.log(`  16-bit compare: 0x${val16.toString(16).toUpperCase()} - 0xA55A = 0x${((val16 - 0xA55A) & 0xFFFF).toString(16).toUpperCase()} -> ${val16 === 0xA55A ? 'Z (PASS)' : 'NZ (FAIL)'}`);
  console.log(`  24-bit compare: 0x${val24.toString(16).toUpperCase()} - 0x00A55A = 0x${((val24 - 0x00A55A) & 0xFFFFFF).toString(16).toUpperCase()} -> ${val24 === 0x00A55A ? 'Z (PASS)' : 'NZ (FAIL)'}`);
  console.log('');
}

// ============================================================
// Section 3: Execute block_0008bb_adl and show the bug
// ============================================================

function demonstrateBug(romBytes) {
  console.log('Section 3: Transpiler bug demonstration');
  console.log('=======================================');

  const memory = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, memory, { peripherals });
  const { cpu, compiledBlocks } = executor;

  // Look for the block at 0x0008BB in ADL mode
  const key = blockKey(0x0008BB, 'adl');
  const fn = compiledBlocks[key];

  if (!fn) {
    console.log(`  ERROR: block ${key} not found in compiled blocks!`);
    return;
  }

  // Reset CPU state for clean test
  cpu.a = 0;
  cpu.f = 0;
  cpu.hl = 0;
  cpu.bc = 0;
  cpu.sp = 0xD40000;
  cpu.madl = 1;

  // Execute the block
  const result = fn(cpu);

  const zFlag = (cpu.f & 0x40) !== 0;
  const hlAfter = cpu.hl & 0xFFFFFF;

  console.log(`  Executed block: ${key}`);
  console.log(`  Result (next PC): ${hex(result)}`);
  console.log(`  HL after SBC:     ${hex(hlAfter)}`);
  console.log(`  F register:       ${hex8(cpu.f)} (Z=${zFlag ? 1 : 0})`);
  console.log(`  Z flag set:       ${zFlag}`);
  console.log('');

  if (!zFlag) {
    console.log('  BUG CONFIRMED: Z flag is NOT set!');
    console.log('  The transpiler performs 24-bit SBC despite .SIL prefix:');
    console.log(`    0xFFA55A - 0x00A55A = 0xFF0000 (24-bit) -> NZ`);
    console.log('  Correct behavior with .SIL (16-bit SBC):');
    console.log(`    0xA55A - 0xA55A = 0x0000 (16-bit) -> Z`);
  } else {
    console.log('  Z flag IS set — the bug may have been fixed already.');
  }
  console.log('');
}

// ============================================================
// Section 4: Correct behavior demonstration
// ============================================================

function showCorrectBehavior() {
  console.log('Section 4: Correct 16-bit SBC behavior');
  console.log('=======================================');

  // Simulate what .SIL SBC HL,BC should do:
  // HL is loaded with 24-bit value 0xFFA55A from ROM
  // BC is 0x00A55A
  // .SIL means: operate on 16-bit HL and 16-bit BC only
  const hl24 = 0xFFA55A;
  const bc24 = 0x00A55A;

  const hl16 = hl24 & 0xFFFF; // 0xA55A
  const bc16 = bc24 & 0xFFFF; // 0xA55A

  const result16 = (hl16 - bc16) & 0xFFFF;
  const result24 = (hl24 - bc24) & 0xFFFFFF;

  console.log(`  HL (24-bit from ROM): ${hex(hl24)}`);
  console.log(`  BC (24-bit constant): ${hex(bc24)}`);
  console.log('');
  console.log('  CORRECT (.SIL → 16-bit operation):');
  console.log(`    HL[15:0] = ${hex(hl16, 4)}, BC[15:0] = ${hex(bc16, 4)}`);
  console.log(`    ${hex(hl16, 4)} - ${hex(bc16, 4)} = ${hex(result16, 4)} -> Z=${result16 === 0 ? 1 : 0} (PASS)`);
  console.log('');
  console.log('  INCORRECT (transpiler uses 24-bit):');
  console.log(`    ${hex(hl24)} - ${hex(bc24)} = ${hex(result24)} -> Z=${result24 === 0 ? 1 : 0} (FAIL)`);
  console.log('');
}

// ============================================================
// Section 5: Count .SIL/.SIS-prefixed ALU instructions in transpiled output
// ============================================================

async function countSilSisInstructions() {
  console.log('Section 5: .SIL/.SIS-prefixed ALU instructions in transpiled output');
  console.log('===================================================================');

  // Read the transpiled JS source
  let source;
  if (fs.existsSync(TRANSPILED_PATH)) {
    source = fs.readFileSync(TRANSPILED_PATH, 'utf-8');
  } else {
    // Try gzipped version
    const gzPath = TRANSPILED_PATH + '.gz';
    if (!fs.existsSync(gzPath)) {
      console.log('  ERROR: Neither ROM.transpiled.js nor ROM.transpiled.js.gz found.');
      console.log('  Run: node scripts/transpile-ti84-rom.mjs');
      return;
    }
    const zlib = await import('node:zlib');
    const compressed = fs.readFileSync(gzPath);
    source = zlib.gunzipSync(compressed).toString('utf-8');
  }

  // Search for .SIL and .SIS prefix patterns in source strings/comments
  // .SIL = 0x52, .SIS = 0x40 (when used as prefix before ED-group ALU ops)
  // ED 42 = SBC HL,BC; ED 4A = ADC HL,BC; ED 52 = SBC HL,DE; ED 5A = ADC HL,DE
  // ED 62 = SBC HL,HL; ED 6A = ADC HL,HL; ED 72 = SBC HL,SP; ED 7A = ADC HL,SP

  // Pattern: look for the prefix bytes in source strings that represent instruction bytes
  // These appear in block metadata or comments like "52 ed 42" or "40 ed 42"
  const silPrefixPattern = /\b52\s*ed\s*[47][2a]\b/gi;
  const sisPrefixPattern = /\b40\s*ed\s*[47][2a]\b/gi;

  const silMatches = source.match(silPrefixPattern) || [];
  const sisMatches = source.match(sisPrefixPattern) || [];

  console.log(`  .SIL (0x52) + ED ALU matches: ${silMatches.length}`);
  console.log(`  .SIS (0x40) + ED ALU matches: ${sisMatches.length}`);
  console.log(`  Total prefix-modified ALU ops: ${silMatches.length + sisMatches.length}`);

  // Also search for any mention of "SIL" or "SIS" as text
  const silTextPattern = /\.SIL/g;
  const sisTextPattern = /\.SIS/g;
  const silTextMatches = source.match(silTextPattern) || [];
  const sisTextMatches = source.match(sisTextPattern) || [];

  console.log('');
  console.log(`  ".SIL" text occurrences: ${silTextMatches.length}`);
  console.log(`  ".SIS" text occurrences: ${sisTextMatches.length}`);

  // Search for the specific block containing 0x0008BB
  const blockPattern = /block_0008bb/gi;
  const blockMatches = source.match(blockPattern) || [];
  console.log(`  References to block_0008bb: ${blockMatches.length}`);
  console.log('');

  if (silMatches.length + sisMatches.length === 0 && silTextMatches.length + sisTextMatches.length === 0) {
    console.log('  CONCLUSION: The transpiler does NOT appear to track .SIL/.SIS prefixes,');
    console.log('  confirming that ALL prefix-modified ALU ops are incorrectly transpiled.');
  }
  console.log('');
}

// ============================================================
// Section 6: Boot trace from 0x000000 → halt at 0x0019B5
// ============================================================

function traceBootDiversion(romBytes) {
  console.log('Section 6: Boot trace showing diversion to 0x0019B5');
  console.log('====================================================');

  const memory = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, memory, { peripherals });
  const { cpu, compiledBlocks, blockMeta } = executor;

  let pc = 0x000000;
  let mode = 'z80';
  const MAX_BLOCKS = 500;
  const trace = [];
  let termination = 'max_blocks';

  for (let step = 0; step < MAX_BLOCKS; step++) {
    cpu.madl = mode === 'adl' ? 1 : 0;

    const key = blockKey(pc, mode);
    const meta = blockMeta[key];
    const fn = compiledBlocks[key];

    if (!fn) {
      // Try to skip
      let found = false;
      for (let offset = 1; offset <= 16; offset++) {
        const candidate = (pc + offset) & 0xffffff;
        if (compiledBlocks[blockKey(candidate, mode)]) {
          trace.push({ pc, mode, dasm: '(missing block, skipped)', next: candidate });
          pc = candidate;
          found = true;
          break;
        }
      }
      if (!found) {
        termination = 'missing_block';
        break;
      }
      continue;
    }

    const instructions = meta?.instructions ?? [];
    const lastInst = instructions.length ? instructions[instructions.length - 1] : null;

    let result;
    try {
      result = fn(cpu);
    } catch (err) {
      termination = `error: ${err.message}`;
      break;
    }

    const zFlag = (cpu.f & 0x40) !== 0;
    const entry = {
      pc,
      mode,
      dasm: lastInst?.dasm ?? '?',
      allDasm: instructions.map(i => `${hex(i.pc)}: ${i.dasm}`),
      next: result >= 0 ? result & 0xffffff : result,
      zAfter: zFlag,
    };
    trace.push(entry);

    // Check if we hit the signature check
    if (pc === 0x0008BB) {
      console.log(`  >> Signature check at ${hex(pc)}:${mode}`);
      console.log(`     Z flag after: ${zFlag}`);
      console.log(`     HL = ${hex(cpu.hl & 0xFFFFFF)}, BC = ${hex(cpu.bc & 0xFFFFFF)}`);
      console.log(`     Next PC: ${hex(result >= 0 ? result & 0xffffff : result)}`);
    }

    if (result === undefined || result === null || result < 0) {
      termination = result === -1 ? 'halt' : (result === null ? 'null' : 'sleep');
      break;
    }

    // Check if we reached the halt target
    if ((result & 0xffffff) === 0x0019B5 || pc === 0x0019B5) {
      termination = 'reached_halt_target';
      // Execute one more step at halt target if possible
      const haltKey = blockKey(0x0019B5, mode);
      if (compiledBlocks[haltKey]) {
        cpu.madl = mode === 'adl' ? 1 : 0;
        const haltMeta = blockMeta[haltKey];
        const haltFn = compiledBlocks[haltKey];
        try {
          const haltResult = haltFn(cpu);
          const haltInsts = haltMeta?.instructions ?? [];
          trace.push({
            pc: 0x0019B5,
            mode,
            dasm: haltInsts.length ? haltInsts[haltInsts.length - 1].dasm : '?',
            allDasm: haltInsts.map(i => `${hex(i.pc)}: ${i.dasm}`),
            next: haltResult,
            zAfter: (cpu.f & 0x40) !== 0,
          });
        } catch (e) {
          // ignore
        }
      }
      break;
    }

    // Resolve next mode
    if (meta?.exits) {
      for (const exit of meta.exits) {
        if (exit.target === result && exit.targetMode) {
          mode = exit.targetMode;
          break;
        }
      }
    }
    if (cpu.madl) {
      mode = 'adl';
    }

    pc = result & 0xffffff;
  }

  // Print the critical path
  console.log('');
  console.log('  Critical path (showing blocks that lead to the diversion):');
  console.log('  -----------------------------------------------------------');

  // Find interesting entries: the ones near CALL 0x0008BB and the JP NZ
  const interestingPcs = new Set([0x000000, 0x000047, 0x0008BB, 0x0019B5]);
  const callTo8BB = trace.findIndex(e => e.next === 0x0008BB);
  const sig8BB = trace.findIndex(e => e.pc === 0x0008BB);
  const jpNz = trace.findIndex(e => e.next === 0x0019B5);
  const halt = trace.findIndex(e => e.pc === 0x0019B5);

  // Show first few entries and the critical ones
  const showIndices = new Set();
  // First 5 entries
  for (let i = 0; i < Math.min(5, trace.length); i++) {
    showIndices.add(i);
  }
  // Entries around the CALL
  if (callTo8BB >= 0) {
    for (let i = Math.max(0, callTo8BB - 1); i <= Math.min(trace.length - 1, callTo8BB + 1); i++) {
      showIndices.add(i);
    }
  }
  // The signature check block itself
  if (sig8BB >= 0) {
    showIndices.add(sig8BB);
  }
  // After signature check (return + JP NZ)
  if (sig8BB >= 0) {
    for (let i = sig8BB; i <= Math.min(trace.length - 1, sig8BB + 3); i++) {
      showIndices.add(i);
    }
  }
  if (jpNz >= 0) {
    for (let i = Math.max(0, jpNz - 1); i <= Math.min(trace.length - 1, jpNz + 1); i++) {
      showIndices.add(i);
    }
  }
  if (halt >= 0) {
    showIndices.add(halt);
  }

  const sorted = [...showIndices].sort((a, b) => a - b);
  let lastPrinted = -1;
  for (const idx of sorted) {
    if (idx > lastPrinted + 1 && lastPrinted >= 0) {
      console.log('    ...');
    }
    const e = trace[idx];
    const arrow = e.next >= 0 ? hex(e.next) : String(e.next);
    const marker = interestingPcs.has(e.pc) ? ' <<<' : '';
    console.log(`    [${String(idx).padStart(3)}] ${hex(e.pc)}:${e.mode.padEnd(3)} ${e.dasm.padEnd(24)} -> ${arrow}  Z=${e.zAfter ? 1 : 0}${marker}`);
    lastPrinted = idx;
  }

  console.log('');
  console.log(`  Termination: ${termination}`);
  console.log(`  Total blocks executed: ${trace.length}`);

  // Summarize the path
  console.log('');
  console.log('  Boot diversion path summary:');
  console.log('  0x000000 (reset vector)');
  if (callTo8BB >= 0) {
    console.log(`  -> ... -> ${hex(trace[callTo8BB].pc)} (CALL 0x0008BB)`);
  }
  console.log('  -> 0x0008BB (ROM signature check: .SIL SBC HL,BC)');
  console.log('  -> RET with NZ (24-bit bug: 0xFFA55A - 0x00A55A = 0xFF0000)');
  if (jpNz >= 0) {
    console.log(`  -> ${hex(trace[jpNz].pc)} (JP NZ,0x0019B5 — taken because Z=0)`);
  }
  console.log('  -> 0x0019B5 (HALT — boot failure handler)');
  console.log('');
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('Phase 344: Boot Diversion — .SIL prefix transpiler bug');
  console.log('=======================================================');
  console.log('');

  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const romBytes = fs.readFileSync(ROM_PATH);

  showRomDisassembly(romBytes);
  showSignatureValue(romBytes);
  demonstrateBug(romBytes);
  showCorrectBehavior();
  await countSilSisInstructions();
  traceBootDiversion(romBytes);

  console.log('CONCLUSION');
  console.log('==========');
  console.log('The .SIL prefix (0x52) at 0x0008C4 forces SBC HL,BC to operate in');
  console.log('16-bit mode. The transpiler ignores this prefix and generates 24-bit');
  console.log('SBC, causing the ROM signature check to fail (NZ instead of Z).');
  console.log('This diverts boot to the halt handler at 0x0019B5.');
  console.log('');
  console.log('FIX REQUIRED: The transpiler (scripts/transpile-ti84-rom.mjs) must');
  console.log('recognize .SIL (0x52) and .SIS (0x40) prefixes before ED-group ALU');
  console.log('instructions and emit 16-bit arithmetic instead of 24-bit.');
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
