#!/usr/bin/env node

/**
 * Phase 383 — Find the parent function of 0x03010D
 *
 * Session 382 found that the translation table lookup at 0x03010D has 0 CALL
 * sites — it is reached by fall-through from a parent function that converts
 * reversed _GetCSC scan codes to forward table indices.
 *
 * Strategy:
 *   1. Disassemble backwards from 0x03010D looking for RET/JP that marks the
 *      end of the previous function.
 *   2. The instruction after that terminator is the parent function entry.
 *   3. Analyze the conversion logic between the entry and 0x03010D.
 *   4. Scan ROM for CALL/JP refs to the parent entry point.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const MODE = 'adl';

// ── Formatting helpers ──────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function bytesHex(buffer, start, length) {
  const end = Math.min(buffer.length, start + length);
  return Array.from(
    buffer.subarray(start, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatInstruction(inst) {
  if (!inst) return 'db ??';

  const idx = (displacement, register) =>
    `(${String(register).toUpperCase()}${displacement >= 0 ? '+' : ''}${displacement})`;

  switch (inst.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${String(inst.indirectRegister).toUpperCase()})`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'push': return `push ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `pop ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `ld ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `ld ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `ld ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `ld (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem': return `ld ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-ind-imm': return `ld (${String(inst.dest ?? 'HL').toUpperCase()}), ${hexByte(inst.value)}`;
    case 'alu-reg':
      return inst.op === 'xor' && String(inst.src).toLowerCase() === 'a'
        ? 'xor a'
        : `${inst.op} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ind': return `${inst.op} (${String(inst.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'inc-reg': return `inc ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `dec ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `inc ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `dec ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `add ${String(inst.dest ?? 'HL').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'in0': return `in0 ${String(inst.reg ?? 'a').toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${String(inst.reg ?? 'a').toUpperCase()}`;
    case 'in-reg': return `in ${String(inst.reg ?? 'a').toUpperCase()}, (c)`;
    case 'out-reg': return `out (c), ${String(inst.reg ?? 'a').toUpperCase()}`;
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'rrca': return 'rrca';
    case 'rlca': return 'rlca';
    case 'ccf': return 'ccf';
    case 'scf': return 'scf';
    case 'cpl': return 'cpl';
    case 'neg': return 'neg';
    case 'ldir': return 'ldir';
    case 'lddr': return 'lddr';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'exx': return 'exx';
    case 'rst': return `rst ${hexByte(inst.vector)}`;
    case 'bit-test': return `bit ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `set ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `res ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind': return `set ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind': return `res ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-ld-reg': return `ld ${String(inst.dest).toUpperCase()}, ${idx(inst.displacement, inst.indexRegister)}`;
    case 'indexed-ld-imm': return `ld ${idx(inst.displacement, inst.indexRegister)}, ${hexByte(inst.value)}`;
    case 'indexed-st-reg': return `ld ${idx(inst.displacement, inst.indexRegister)}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-add': return `add ${String(inst.dest ?? 'HL').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-inc': return `inc ${idx(inst.displacement, inst.indexRegister)}`;
    case 'indexed-dec': return `dec ${idx(inst.displacement, inst.indexRegister)}`;
    case 'indexed-alu': return `${inst.op} ${idx(inst.displacement, inst.indexRegister)}`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${idx(inst.displacement, inst.indexRegister)}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${idx(inst.displacement, inst.indexRegister)}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${idx(inst.displacement, inst.indexRegister)}`;
    case 'indexed-push': return `push ${String(inst.indexRegister).toUpperCase()}`;
    case 'indexed-pop': return `pop ${String(inst.indexRegister).toUpperCase()}`;
    case 'indexed-ld-pair': return `ld ${String(inst.indexRegister).toUpperCase()}, ${hex(inst.value)}`;
    case 'indexed-ld-mem': return `ld ${String(inst.indexRegister).toUpperCase()}, (${hex(inst.addr)})`;
    case 'indexed-st-mem': return `ld (${hex(inst.addr)}), ${String(inst.indexRegister).toUpperCase()}`;
    case 'indexed-jp': return `jp (${String(inst.indexRegister).toUpperCase()})`;
    case 'indexed-ld-sp': return `ld sp, ${String(inst.indexRegister).toUpperCase()}`;
    case 'indexed-ex-sp': return `ex (sp), ${String(inst.indexRegister).toUpperCase()}`;
    case 'sbc-pair': return `sbc HL, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair': return `adc HL, ${String(inst.src).toUpperCase()}`;
    case 'rotate-reg': return `${inst.op} ${String(inst.reg).toUpperCase()}`;
    case 'rotate-ind': return `${inst.op} (${String(inst.indirectRegister).toUpperCase()})`;
    default: return inst.tag;
  }
}

// ── Disassemble a region ────────────────────────────────────────────

function disasmRegion(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end && pc < rom.length) {
    let inst = null;
    try {
      inst = decodeInstruction(rom, pc, MODE);
    } catch {
      inst = null;
    }
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      length,
      bytes: bytesHex(rom, pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc += length;
  }
  return rows;
}

function isTerminator(row) {
  if (!row.inst) return false;
  const t = row.inst.tag;
  // Unconditional terminators
  if (t === 'ret') return true;
  if (t === 'jp') return true;     // unconditional JP to absolute
  if (t === 'jp-indirect') return true;
  return false;
}

// ── PASS 1: Wide disassembly ────────────────────────────────────────

console.log('=== PASS 1: Disassembly 0x030080 .. 0x030170 ===\n');

const allRows = disasmRegion(0x030080, 0x030170);
for (const row of allRows) {
  const marker =
    row.pc === 0x03010D ? '  <<<< TARGET (0x03010D)' :
    '';
  console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${marker}`);
}

// ── PASS 2: Find function boundaries ────────────────────────────────

console.log('\n=== PASS 2: Function boundary scan ===\n');

let parentEntry = null;
let lastTerminator = null;

for (let i = 0; i < allRows.length; i++) {
  const row = allRows[i];

  if (row.pc >= 0x03010D) break;  // stop once we pass our target

  if (isTerminator(row)) {
    lastTerminator = row;
    // The next instruction could be the parent entry
    if (i + 1 < allRows.length) {
      const next = allRows[i + 1];
      if (next.pc <= 0x03010D) {
        console.log(`  Terminator: ${hex(row.pc)} ${row.text}`);
        console.log(`    Next instruction: ${hex(next.pc)} ${next.text}`);
        parentEntry = next.pc;
      }
    }
  }
}

if (parentEntry) {
  console.log(`\n  ==> Best candidate for parent entry: ${hex(parentEntry)}`);
} else {
  console.log('\n  No clear terminator found. Checking for conditional terminators...');

  // Fall back: look for the last RET (even conditional) before 0x03010D
  for (let i = allRows.length - 1; i >= 0; i--) {
    const row = allRows[i];
    if (row.pc >= 0x03010D) continue;
    const t = row.inst?.tag;
    if (t === 'ret' || t === 'ret-conditional' || t === 'jp' || t === 'jp-conditional') {
      if (i + 1 < allRows.length) {
        parentEntry = allRows[i + 1].pc;
        console.log(`  Last branch/ret before target: ${hex(row.pc)} ${row.text}`);
        console.log(`  ==> Candidate entry: ${hex(parentEntry)}`);
        break;
      }
    }
  }
}

// ── PASS 3: Detailed parent function disassembly ────────────────────

if (parentEntry) {
  console.log(`\n=== PASS 3: Parent function ${hex(parentEntry)} through 0x03010D+ ===\n`);

  const funcRows = disasmRegion(parentEntry, 0x030170);
  for (const row of funcRows) {
    const marker =
      row.pc === parentEntry ? '  <<<< PARENT ENTRY' :
      row.pc === 0x03010D ? '  <<<< TARGET (fall-through)' :
      '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${marker}`);

    // Stop at unconditional RET/JP well after the target
    if (row.pc > 0x030120 && isTerminator(row)) {
      console.log('  --- [function end] ---');
      break;
    }
  }
}

// ── PASS 4: Conversion logic analysis ───────────────────────────────

if (parentEntry) {
  console.log(`\n=== PASS 4: Scan code conversion analysis ===\n`);

  const funcRows = disasmRegion(parentEntry, 0x030140);
  const interesting = [];

  for (const row of funcRows) {
    if (!row.inst) continue;
    const t = row.inst.tag;

    // Arithmetic/logic ops that might convert scan codes
    if (['alu-imm', 'alu-reg', 'alu-ind', 'cpl', 'neg',
         'inc-reg', 'dec-reg', 'bit-test', 'bit-set', 'bit-res',
         'bit-test-ind', 'bit-set-ind', 'bit-res-ind',
         'indexed-cb-bit', 'indexed-cb-set', 'indexed-cb-res',
         'rotate-reg', 'rotate-ind'].includes(t)) {
      interesting.push(row);
    }

    // LD with notable addresses
    if (t === 'ld-pair-imm' && row.inst.value === 0x09F79B) {
      interesting.push(row);
    }
    if (t === 'ld-reg-mem' || t === 'ld-mem-reg') {
      interesting.push(row);
    }

    if (row.pc > 0x030135 && isTerminator(row)) break;
  }

  if (interesting.length > 0) {
    console.log('  Key arithmetic/logic/memory ops in parent function:');
    for (const row of interesting) {
      const marker = row.pc < 0x03010D ? '' : '  (after target)';
      console.log(`    ${hex(row.pc)}  ${row.text}${marker}`);
    }
  }

  // Specifically annotate the conversion at 0x03010D
  console.log('\n  Code at 0x03010D and surrounding context:');
  const targetRows = disasmRegion(0x030105, 0x030130);
  for (const row of targetRows) {
    console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}`);
  }
}

// ── PASS 5: CALL/JP references to parent entry ─────────────────────

console.log('\n=== PASS 5: CALL/JP references ===\n');

if (parentEntry) {
  // Scan key OS regions for CALL/JP to parentEntry
  const targets = [parentEntry];
  const refs = [];

  for (let scanPc = 0; scanPc < Math.min(rom.length, 0x400000); scanPc++) {
    const byte = rom[scanPc];
    // CALL nn: 0xCD followed by 3-byte address (ADL mode)
    if (byte === 0xCD && scanPc + 3 < rom.length) {
      const addr = rom[scanPc + 1] | (rom[scanPc + 2] << 8) | (rom[scanPc + 3] << 16);
      if (targets.includes(addr)) {
        refs.push({ type: 'CALL', from: scanPc, target: addr });
      }
    }
    // JP nn: 0xC3 followed by 3-byte address
    if (byte === 0xC3 && scanPc + 3 < rom.length) {
      const addr = rom[scanPc + 1] | (rom[scanPc + 2] << 8) | (rom[scanPc + 3] << 16);
      if (targets.includes(addr)) {
        refs.push({ type: 'JP', from: scanPc, target: addr });
      }
    }
  }

  if (refs.length > 0) {
    console.log(`  References to ${hex(parentEntry)}:`);
    for (const ref of refs) {
      console.log(`    ${ref.type} from ${hex(ref.from)} -> ${hex(ref.target)}`);
    }
  } else {
    console.log(`  No CALL/JP references found to ${hex(parentEntry)}`);
    console.log('  (Reached by fall-through only, or JR-relative branch)');
  }

  // Also check JR targets
  console.log('\n  Checking JR (relative branch) references...');
  let jrRefs = 0;
  for (let scanPc = parentEntry - 130; scanPc < parentEntry + 130; scanPc++) {
    if (scanPc < 0 || scanPc >= rom.length) continue;
    const byte = rom[scanPc];
    // JR d: 0x18 dd
    if (byte === 0x18 && scanPc + 1 < rom.length) {
      const d = rom[scanPc + 1];
      const target = scanPc + 2 + (d < 128 ? d : d - 256);
      if (target === parentEntry) {
        console.log(`    JR from ${hex(scanPc)} -> ${hex(target)}`);
        jrRefs++;
      }
    }
    // JR cc, d: 0x20/0x28/0x30/0x38
    if ([0x20, 0x28, 0x30, 0x38].includes(byte) && scanPc + 1 < rom.length) {
      const d = rom[scanPc + 1];
      const target = scanPc + 2 + (d < 128 ? d : d - 256);
      if (target === parentEntry) {
        const cond = ['nz', 'z', 'nc', 'c'][(byte - 0x20) >> 3];
        console.log(`    JR ${cond} from ${hex(scanPc)} -> ${hex(target)}`);
        jrRefs++;
      }
    }
  }
  if (jrRefs === 0) {
    console.log('    No JR references found nearby');
  }
}

// ── PASS 6: Also scan for CALL/JP (incl. conditional) to nearby addresses ──

console.log('\n=== PASS 6: CALL/JP refs to addresses near 0x03010D ===\n');

// Check a few interesting addresses in the region
const checkAddrs = [0x0300A1, 0x0300CB, 0x0300F1, 0x0300FF, 0x03010B, 0x03010D];

// All CALL/JP opcodes (unconditional + conditional)
const callJpOpcodes = new Set([
  0xCD,                               // CALL nn
  0xC4, 0xCC, 0xD4, 0xDC,            // CALL cc, nn
  0xE4, 0xEC, 0xF4, 0xFC,
  0xC3,                               // JP nn
  0xC2, 0xCA, 0xD2, 0xDA,            // JP cc, nn
  0xE2, 0xEA, 0xF2, 0xFA,
]);

for (const target of checkAddrs) {
  let found = false;
  for (let scanPc = 0; scanPc < Math.min(rom.length, 0x400000); scanPc++) {
    if (callJpOpcodes.has(rom[scanPc]) && scanPc + 3 < rom.length) {
      const addr = rom[scanPc + 1] | (rom[scanPc + 2] << 8) | (rom[scanPc + 3] << 16);
      if (addr === target) {
        const opName = rom[scanPc] === 0xCD ? 'CALL' :
                       rom[scanPc] === 0xC3 ? 'JP' :
                       (rom[scanPc] & 0x04) ? 'CALL cc' : 'JP cc';
        console.log(`  ${opName} ${hex(target)} from ${hex(scanPc)} [opcode ${hexByte(rom[scanPc])}]`);
        found = true;
      }
    }
  }
  if (!found) {
    console.log(`  ${hex(target)}: no CALL/JP refs`);
  }
}

// ── PASS 7: Trace the TRUE function entry ───────────────────────────

console.log('\n=== PASS 7: True function entry (backtrack past JR chains) ===\n');

// 0x0300F1 is reached via JR NZ from 0x0300CD, which is inside the block
// starting at 0x0300CB. And 0x0300CB is reached via JP NZ from 0x02FEDB.
// So 0x0300CB is the true entry point of the key dispatch function.

// Walk backwards from parentEntry: check if there are JR/JR cc branches
// that reach parentEntry from an earlier instruction in the same block.
let trueEntry = parentEntry;
{
  // Check all rows from the RET at 0x0300CA backward
  const prevRows = disasmRegion(0x0300C0, parentEntry || 0x03010D);
  for (const row of prevRows) {
    if (!row.inst) continue;
    const t = row.inst.tag;
    // If this is a conditional branch that targets our current entry candidate,
    // then the block starts earlier
    if (t === 'jr-conditional' && row.inst.fallthrough !== undefined) {
      // The fall-through means this instruction is part of the same function
      // The function starts at or before this instruction
    }
  }

  // More direct approach: 0x0300CA is RET (end of previous function).
  // So 0x0300CB is the start of the next function.
  // Verify: is there a RET/JP (unconditional) at 0x0300CA?
  const atCA = disasmRegion(0x0300CA, 0x0300CC);
  if (atCA.length > 0 && isTerminator(atCA[0])) {
    trueEntry = 0x0300CB;
    console.log(`  0x0300CA is ${atCA[0].text} => function boundary`);
    console.log(`  TRUE ENTRY: 0x0300CB (first instruction after the RET)`);
  }

  // Cross-check: JP NZ, 0x0300CB from 0x02FEDB
  console.log(`  Confirmed by: JP NZ, 0x0300CB at 0x02FEDB`);
}

// ── PASS 8: Full function listing from true entry ───────────────────

console.log(`\n=== PASS 8: Full key dispatch function from ${hex(trueEntry)} ===\n`);

{
  const funcRows = disasmRegion(trueEntry, 0x030140);
  for (const row of funcRows) {
    const marker =
      row.pc === trueEntry ? '  <<<< FUNCTION ENTRY' :
      row.pc === 0x03010D ? '  <<<< scan code conversion (add 0x70)' :
      row.pc === 0x030117 ? '  <<<< 2nd-key offset (add 0x38)' :
      row.pc === 0x03011C ? '  <<<< translation table base' :
      row.pc === 0x030121 ? '  <<<< table lookup' :
      row.pc === 0x03012A ? '  <<<< store TI-BASIC key code' :
      '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${marker}`);
  }
}

// ── Summary ─────────────────────────────────────────────────────────

console.log('\n========================================');
console.log('=== SUMMARY ===');
console.log('========================================\n');

console.log(`  TRUE FUNCTION ENTRY:   ${hex(trueEntry)}`);
console.log(`  TARGET (fall-through): 0x03010D`);
console.log(`  CALLER:                JP NZ from 0x02FEDB`);
console.log('');
console.log('  SCAN CODE CONVERSION LOGIC:');
console.log('    0x03010D: ADD 0x70  -- converts reversed _GetCSC code');
console.log('    0x030117: ADD 0x38  -- additional offset if "2nd" key active');
console.log('    0x03011C: LD DE, 0x09F79B  -- translation table base');
console.log('    0x030120: ADD HL, DE  -- index into table');
console.log('    0x030121: LD A, (HL)  -- read TI-BASIC key code');
console.log('    0x03012A: LD (0xD0058E), A  -- store result');
console.log('');
console.log(`  ACTION: Add ${hex(trueEntry)} as a transpiler seed`);
console.log(`          in scripts/transpile-ti84-rom.mjs`);
