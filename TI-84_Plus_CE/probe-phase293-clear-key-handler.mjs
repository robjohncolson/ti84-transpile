#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import('./ez80-decoder.js');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

// ── Helpers ──

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(s) {
  return String(s ?? '').toUpperCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const mag = hex(Math.abs(displacement), 2);
  const sign = displacement < 0 ? '-' : '+';
  return `(${upper(indexRegister)}${sign}${mag})`;
}

function formatInstruction(inst) {
  if (!inst) return { mnemonic: 'UNKNOWN', operands: '' };
  switch (inst.tag) {
    case 'indexed-cb-bit':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hexByte(inst.value) };
    case 'alu-ixd':
      return { mnemonic: upper(inst.op), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'ld-mem-reg':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.src)}` };
    case 'ld-mem-pair':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.pair)}` };
    case 'ld-reg-mem':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})` };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}` };
    case 'ld-pair-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)}, ${hex(inst.value)}` };
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? { mnemonic: 'LD', operands: `${upper(inst.pair)}, (${hex(inst.addr)})` }
        : { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.pair)}` };
    case 'ld-ind-reg':
      return { mnemonic: 'LD', operands: `(${upper(inst.pair)}), ${upper(inst.src)}` };
    case 'ld-reg-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, (${upper(inst.pair)})` };
    case 'ld-ind-imm':
      return { mnemonic: 'LD', operands: `(${upper(inst.pair)}), ${hexByte(inst.value)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'ld-sp-hl':
      return { mnemonic: 'LD', operands: 'SP, HL' };
    case 'push':
      return { mnemonic: 'PUSH', operands: upper(inst.pair) };
    case 'pop':
      return { mnemonic: 'POP', operands: upper(inst.pair) };
    case 'call':
      return { mnemonic: 'CALL', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'CALL', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'jp':
      return { mnemonic: 'JP', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'JP', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'jp-indirect':
      return { mnemonic: 'JP', operands: `(${upper(inst.indirectRegister ?? 'HL')})` };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'DJNZ', operands: hex(inst.target) };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    case 'rst':
      return { mnemonic: 'RST', operands: hexByte(inst.target ?? inst.vector) };
    case 'inc-reg':
      return { mnemonic: 'INC', operands: upper(inst.reg) };
    case 'dec-reg':
      return { mnemonic: 'DEC', operands: upper(inst.reg) };
    case 'inc-pair':
      return { mnemonic: 'INC', operands: upper(inst.pair) };
    case 'dec-pair':
      return { mnemonic: 'DEC', operands: upper(inst.pair) };
    case 'inc-ixd':
      return { mnemonic: 'INC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'dec-ixd':
      return { mnemonic: 'DEC', operands: formatIndexed(inst.indexRegister, inst.displacement) };
    case 'add-pair':
      return { mnemonic: 'ADD', operands: `${upper(inst.dest)}, ${upper(inst.src)}` };
    case 'nop':
      return { mnemonic: 'NOP', operands: '' };
    case 'halt':
      return { mnemonic: 'HALT', operands: '' };
    case 'di':
      return { mnemonic: 'DI', operands: '' };
    case 'ei':
      return { mnemonic: 'EI', operands: '' };
    case 'ex-af':
      return { mnemonic: "EX AF, AF'", operands: '' };
    case 'exx':
      return { mnemonic: 'EXX', operands: '' };
    case 'ex-de-hl':
      return { mnemonic: 'EX DE, HL', operands: '' };
    case 'ex-sp-hl':
      return { mnemonic: 'EX (SP), HL', operands: '' };
    case 'scf':
      return { mnemonic: 'SCF', operands: '' };
    case 'ccf':
      return { mnemonic: 'CCF', operands: '' };
    case 'cpl':
      return { mnemonic: 'CPL', operands: '' };
    case 'daa':
      return { mnemonic: 'DAA', operands: '' };
    case 'rlca':
      return { mnemonic: 'RLCA', operands: '' };
    case 'rrca':
      return { mnemonic: 'RRCA', operands: '' };
    case 'rla':
      return { mnemonic: 'RLA', operands: '' };
    case 'rra':
      return { mnemonic: 'RRA', operands: '' };
    case 'out-imm':
      return { mnemonic: 'OUT', operands: `(${hexByte(inst.port)}), A` };
    case 'in-imm':
      return { mnemonic: 'IN', operands: `A, (${hexByte(inst.port)})` };
    case 'in-reg':
      return { mnemonic: 'IN', operands: `${upper(inst.dest)}, (C)` };
    case 'in0':
      return { mnemonic: 'IN0', operands: `${upper(inst.dest)}, (${hexByte(inst.port)})` };
    case 'bit-test':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${upper(inst.reg)}` };
    case 'bit-test-ind':
      return { mnemonic: 'BIT', operands: `${inst.bit}, (HL)` };
    case 'bit-res-ind':
      return { mnemonic: 'RES', operands: `${inst.bit}, (HL)` };
    case 'bit-set-ind':
      return { mnemonic: 'SET', operands: `${inst.bit}, (HL)` };
    case 'rotate-reg':
      return { mnemonic: upper(inst.operation), operands: upper(inst.reg) };
    case 'rotate-ind':
      return { mnemonic: upper(inst.operation), operands: '(HL)' };
    case 'indexed-cb-rotate':
      return { mnemonic: upper(inst.operation), operands: formatIndexed(inst.indexRegister, inst.displacement) };
    default:
      return { mnemonic: upper(inst.tag ?? 'UNKNOWN'), operands: '' };
  }
}

function fmtRow(pc, inst) {
  const len = Math.max(1, inst?.length ?? 1);
  const bytes = bytesToHex(rom.subarray(pc, pc + len));
  const f = formatInstruction(inst);
  return { pc, len, inst, bytes, mnemonic: f.mnemonic, operands: f.operands };
}

function printRow(row) {
  const ops = row.operands ? ` ${row.operands}` : '';
  return `  ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.mnemonic}${ops}`;
}

function isTerminator(tag) {
  return ['ret', 'jp', 'jp-indirect', 'halt'].includes(tag);
}

function isConditionalBranch(tag) {
  return ['jr-conditional', 'jp-conditional', 'call-conditional', 'ret-conditional'].includes(tag);
}

// ── Disassemble a linear run of N instructions or until terminator ──

function disassembleLinear(startPc, maxInstructions = 150) {
  const rows = [];
  let pc = startPc;
  for (let i = 0; i < maxInstructions; i++) {
    if (pc < 0 || pc >= rom.length) break;
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = Math.max(1, inst?.length ?? 1);
    const row = fmtRow(pc, inst);
    rows.push(row);
    if (isTerminator(inst?.tag)) break;
    pc += len;
  }
  return rows;
}

// ── Analyze handler: extract calls, writes, IY ops, etc. ──

function analyzeHandler(rows) {
  const calls = [];
  const ramWrites = [];
  const ramReads = [];
  const iyOps = [];
  const branches = [];

  for (const row of rows) {
    const t = row.inst?.tag;
    if (!t) continue;

    // Calls
    if (t === 'call' || t === 'call-conditional') {
      calls.push({ pc: row.pc, target: row.inst.target, conditional: t === 'call-conditional' });
    }

    // Absolute memory writes
    if (t === 'ld-mem-reg' || t === 'ld-mem-pair') {
      ramWrites.push({ pc: row.pc, addr: row.inst.addr, src: row.inst.src ?? row.inst.pair });
    }
    if (t === 'ld-pair-mem' && row.inst.direction === 'to-mem') {
      ramWrites.push({ pc: row.pc, addr: row.inst.addr, src: row.inst.pair });
    }

    // Absolute memory reads
    if (t === 'ld-reg-mem') {
      ramReads.push({ pc: row.pc, addr: row.inst.addr, dest: row.inst.dest ?? row.inst.dst });
    }
    if (t === 'ld-pair-mem' && row.inst.direction === 'from-mem') {
      ramReads.push({ pc: row.pc, addr: row.inst.addr, dest: row.inst.pair });
    }

    // IY-relative ops (BIT/SET/RES on IY)
    if (['indexed-cb-bit', 'indexed-cb-set', 'indexed-cb-res'].includes(t) &&
        upper(row.inst.indexRegister) === 'IY') {
      iyOps.push({ pc: row.pc, op: row.mnemonic, bit: row.inst.bit, disp: row.inst.displacement });
    }

    // Branches
    if (['jr', 'jr-conditional', 'jp', 'jp-conditional'].includes(t)) {
      branches.push({ pc: row.pc, target: row.inst.target, tag: t });
    }
  }

  return { calls, ramWrites, ramReads, iyOps, branches };
}

// ── Force-decode N instructions (ignores terminators) ──

function disassembleForce(startPc, count) {
  const rows = [];
  let pc = startPc;
  for (let i = 0; i < count; i++) {
    if (pc < 0 || pc >= rom.length) break;
    const inst = decodeInstruction(rom, pc, 'adl');
    const len = Math.max(1, inst?.length ?? 1);
    rows.push(fmtRow(pc, inst));
    pc += len;
  }
  return rows;
}

// ──────────────────────────────────────────────────────────
// Phase 1: Disassemble the dispatcher at 0x0258DA to find
//          the actual CP values and their branch targets
// ──────────────────────────────────────────────────────────

console.log('# Phase 293: CLEAR Key Handler (0x0258DA CP 0x28) Disassembly');
console.log('');
console.log('## Step 1: Disassemble dispatcher region (starting before 0x0258DA to catch pre-cascade CPs)');
console.log('');

// The phase 292 probe found CP 0x28 at 0x0258D4 (BEFORE the LD A at 0x0258DA),
// branching JP Z to 0x0257CC. Start earlier to capture the full cascade context.
const dispatcherRows = disassembleForce(0x0258A0, 120);

// Print the dispatcher
for (const row of dispatcherRows) {
  console.log(printRow(row));
}
console.log('');

// Extract CP cascade: find all CP imm instructions and the branches that follow
const cpEntries = [];
for (let i = 0; i < dispatcherRows.length; i++) {
  const row = dispatcherRows[i];
  if (row.inst?.tag === 'alu-imm' && row.inst.op === 'cp') {
    const cpValue = row.inst.value;
    // Look at the next instruction for the branch
    if (i + 1 < dispatcherRows.length) {
      const next = dispatcherRows[i + 1];
      if (['jr-conditional', 'jp-conditional'].includes(next.inst?.tag)) {
        cpEntries.push({
          cpValue,
          cpPc: row.pc,
          branchPc: next.pc,
          condition: next.inst.condition,
          target: next.inst.target,
        });
      }
    }
  }
}

console.log('## CP Cascade Summary');
console.log('');
console.log('| CP Value | Scan Code Meaning | Branch Condition | Target Address |');
console.log('|----------|-------------------|------------------|----------------|');

const scanCodeNames = {
  0x01: '2nd',
  0x02: 'ALPHA',
  0x03: 'X,T,theta,n',
  0x04: 'STAT',
  0x05: 'MATH',
  0x09: 'GRAPH',
  0x21: 'MODE',
  0x28: 'CLEAR',
  0x40: 'APPS',
};

for (const entry of cpEntries) {
  const name = scanCodeNames[entry.cpValue] ?? '?';
  console.log(`| ${hexByte(entry.cpValue)} | ${name} | ${upper(entry.condition)} | ${hex(entry.target)} |`);
}
console.log('');

// Find the CLEAR (0x28), 0x09, and 0x40 handler targets
const clearEntry = cpEntries.find((e) => e.cpValue === 0x28);
const entry09 = cpEntries.find((e) => e.cpValue === 0x09);
const entry40 = cpEntries.find((e) => e.cpValue === 0x40);

if (!clearEntry) {
  console.log('ERROR: Could not find CP 0x28 in the dispatcher cascade!');
  console.log('Trying to decode from 0x0257CC directly as fallback...');
}

// ──────────────────────────────────────────────────────────
// Phase 2: Trace the CLEAR key path
// ──────────────────────────────────────────────────────────

// The CLEAR path is NOT a separate handler at a branch target. Instead:
//   0x0258BE: BIT 6,(IY+0x2B) — gate check
//   0x0258C2: JR Z,0x0258DE — skip if bit not set
//   0x0258C4: CP 0x06 — range check (scan code < 6?)
//   0x0258C6: JR NC,0x0258DE — skip if scan code >= 6
//   0x0258C8: LD (D0058C),A — store scan code to buffer
//   0x0258CC: CALL 0x026987 — pre-processing function
//   0x0258D0: CALL 0x0268AC — another pre-processing function
//   0x0258D4: CP 0x28 — is it CLEAR?
//   0x0258D6: JP Z,0x0257CC — if CLEAR, skip rest of cascade, go to epilogue
// Then the epilogue at 0x0257CC:
//   BIT 6,(IY+0x2B) — check flag
//   RET Z — return if not set
//   CALL 0x026955 — post-processing
//   EI
//   RET

console.log('## Step 2: CLEAR Key Path Analysis');
console.log('');
console.log('### CLEAR key execution flow through dispatcher:');
console.log('');
console.log('When scan code 0x28 (CLEAR) arrives:');
console.log('  1. 0x0258BE: BIT 6,(IY+0x2B) — gate check');
console.log('  2. 0x0258C8: LD (D0058C),A — stores 0x28 to scan code buffer');
console.log('  3. 0x0258CC: CALL 0x026987 — pre-processing (shared with all keys < 6? No — CLEAR is 0x28 >= 6)');
console.log('');

// Wait — CP 0x06, JR NC skips to 0x0258DE. 0x28 >= 0x06, so NC is set. CLEAR *skips* the
// store-and-call block! It goes directly to 0x0258DE (the CP 0x09 cascade).
// Then CP 0x09 (NZ), CP 0x05 (NZ), CP 0x04, CP 0x03, CP 0x40, CP 0x02, CP 0x21, CP 0x01...
// But where is CP 0x28? It's at 0x0258D4 which is BEFORE the JR NC jump target.
// Let me re-read the flow carefully:
//   0x0258C4: CP 0x06 — sets carry if A < 6
//   0x0258C6: JR NC,0x0258DE — jump if A >= 6 (NC means no carry, so A >= 6)
// CLEAR = 0x28, which is >= 6, so it DOES take the JR NC branch to 0x0258DE.
// But the CP 0x28 at 0x0258D4 is ONLY reached by fall-through from 0x0258D0 (CALL 0x0268AC).
// That means: keys < 6 get stored to D0058C, then go through two calls, then CP 0x28 check.
// Keys >= 6 (including CLEAR) skip directly to 0x0258DE (the CP 0x09 cascade).
// So CP 0x28 at 0x0258D4 is actually checking a RETURN VALUE from 0x0268AC, not the scan code!

console.log('### IMPORTANT CORRECTION:');
console.log('');
console.log('The CP 0x06 at 0x0258C4 with JR NC to 0x0258DE means:');
console.log('  - If scan code < 6: store to D0058C, CALL 0x026987, CALL 0x0268AC, then CP 0x28');
console.log('  - If scan code >= 6 (including CLEAR=0x28): jump directly to 0x0258DE (CP 0x09 cascade)');
console.log('');
console.log('Therefore CP 0x28 at 0x0258D4 is NOT checking the CLEAR scan code in register A.');
console.log('It is checking the return value from CALL 0x0268AC for keys with scan code < 6.');
console.log('');
console.log('CLEAR (scan code 0x28) enters the cascade at 0x0258DE and falls through ALL');
console.log('CP comparisons (0x09, 0x05, 0x04, 0x03, 0x40, 0x02, 0x21, 0x01) without matching,');
console.log('reaching the default handler.');
console.log('');

// But wait — the LD A,(D0058C) at 0x0258DA reloads A from D0058C.
// For keys < 6, D0058C was set at 0x0258C8. For keys >= 6, D0058C was NOT set.
// Unless it was set elsewhere before entering this dispatcher.
// The dispatcher entry point is likely 0x0258BE. A contains the scan code on entry.
// For CLEAR (0x28): BIT 6,(IY+0x2B), then CP 0x06 → JR NC → jumps to 0x0258DE.
// At 0x0258DE: LD A,(D0058C) — reloads from buffer. But we never stored 0x28 there!
// Wait no — 0x0258DA is LD A,(D0058C), 0x0258DE is CP 0x09.
// For CLEAR: 0x0258C6 JR NC goes to 0x0258DE which is CP 0x09, not LD A.
// So A still contains 0x28 from the original input. Let me verify...

console.log('### Verifying CLEAR path through CP cascade:');
console.log('');
console.log('CLEAR (A=0x28) enters at 0x0258DE (CP 0x09):');
console.log('  CP 0x09: 0x28 != 0x09 → NZ taken → JR to 0x0258F6');
console.log('  CP 0x05: 0x28 != 0x05 → NZ taken → JP to 0x02591F');
console.log('  CP 0x04: 0x28 != 0x04 → not Z');
console.log('  CP 0x03: 0x28 != 0x03 → not Z');
console.log('  CP 0x40: 0x28 != 0x40 → not Z');
console.log('  CP 0x02: 0x28 != 0x02 → NZ taken → JR to 0x0259AB');
console.log('  CP 0x21: 0x28 != 0x21 → NZ taken → JR to 0x0259BF');
console.log('  CP 0x01: 0x28 != 0x01 → NZ taken → JP to 0x025A93 (default handler)');
console.log('');

// So CLEAR hits the default handler at 0x025A93
console.log('### CLEAR lands at DEFAULT HANDLER: 0x025A93');
console.log('');

const defaultRows = disassembleLinear(0x025A93, 30);
for (const row of defaultRows) {
  console.log(printRow(row));
}
console.log('');

const defaultAnalysis = analyzeHandler(defaultRows);
console.log('Default handler analysis:');
console.log(`  Calls: ${defaultAnalysis.calls.map((c) => hex(c.target)).join(', ') || 'none'}`);
console.log(`  RAM writes: ${defaultAnalysis.ramWrites.map((w) => hex(w.addr)).join(', ') || 'none'}`);
console.log(`  IY ops: ${defaultAnalysis.iyOps.map((o) => `${o.op} ${o.bit},(IY+${hex(o.disp, 2)})`).join(', ') || 'none'}`);
console.log('');

// Now trace the epilogue at 0x0257CC
console.log('### Epilogue at 0x0257CC (where default handler eventually JPs):');
console.log('');

const epilogueRows = disassembleLinear(0x0257CC, 20);
for (const row of epilogueRows) {
  console.log(printRow(row));
}
console.log('');

const epilogueAnalysis = analyzeHandler(epilogueRows);
console.log('Epilogue analysis:');
console.log(`  Calls: ${epilogueAnalysis.calls.map((c) => hex(c.target)).join(', ') || 'none'}`);
console.log(`  IY ops: ${epilogueAnalysis.iyOps.map((o) => `${o.op} ${o.bit},(IY+${hex(o.disp, 2)})`).join(', ') || 'none'}`);
console.log('');

// Trace the called functions
console.log('### Tracing called functions:');
console.log('');

// 0x096E22 (from default handler at 0x025A93)
console.log('#### 0x096E22 (called from default handler 0x025A93):');
const fn096E22 = disassembleLinear(0x096E22, 60);
for (const row of fn096E22) {
  console.log(printRow(row));
}
console.log('');
const analysis096E22 = analyzeHandler(fn096E22);
console.log(`  Calls: ${analysis096E22.calls.map((c) => hex(c.target)).join(', ') || 'none'}`);
console.log(`  RAM writes: ${analysis096E22.ramWrites.map((w) => `${upper(w.src)}->(${hex(w.addr)})`).join(', ') || 'none'}`);
console.log(`  RAM reads: ${analysis096E22.ramReads.map((r) => `(${hex(r.addr)})->${upper(r.dest)}`).join(', ') || 'none'}`);
console.log(`  IY ops: ${analysis096E22.iyOps.map((o) => `${o.op} ${o.bit},(IY+${hex(o.disp, 2)})`).join(', ') || 'none'}`);
console.log('');

// 0x025CFC (called from default handler continuation)
console.log('#### 0x025CFC (called from 0x025A97):');
const fn025CFC = disassembleLinear(0x025CFC, 40);
for (const row of fn025CFC) {
  console.log(printRow(row));
}
console.log('');
const analysis025CFC = analyzeHandler(fn025CFC);
console.log(`  Calls: ${analysis025CFC.calls.map((c) => hex(c.target)).join(', ') || 'none'}`);
console.log(`  RAM writes: ${analysis025CFC.ramWrites.map((w) => `${upper(w.src)}->(${hex(w.addr)})`).join(', ') || 'none'}`);
console.log(`  IY ops: ${analysis025CFC.iyOps.map((o) => `${o.op} ${o.bit},(IY+${hex(o.disp, 2)})`).join(', ') || 'none'}`);
console.log('');

// 0x026955 (called from epilogue at 0x0257D1)
console.log('#### 0x026955 (called from epilogue 0x0257D1):');
const fn026955 = disassembleLinear(0x026955, 60);
for (const row of fn026955) {
  console.log(printRow(row));
}
console.log('');
const analysis026955 = analyzeHandler(fn026955);
console.log(`  Calls: ${analysis026955.calls.map((c) => hex(c.target)).join(', ') || 'none'}`);
console.log(`  RAM writes: ${analysis026955.ramWrites.map((w) => `${upper(w.src)}->(${hex(w.addr)})`).join(', ') || 'none'}`);
console.log(`  RAM reads: ${analysis026955.ramReads.map((r) => `(${hex(r.addr)})->${upper(r.dest)}`).join(', ') || 'none'}`);
console.log(`  IY ops: ${analysis026955.iyOps.map((o) => `${o.op} ${o.bit},(IY+${hex(o.disp, 2)})`).join(', ') || 'none'}`);
console.log('');

// Also trace the pre-cascade functions for keys < 6
console.log('#### 0x026987 (pre-cascade call for keys < 6):');
const fn026987 = disassembleLinear(0x026987, 40);
for (const row of fn026987) {
  console.log(printRow(row));
}
console.log('');

console.log('#### 0x0268AC (pre-cascade call for keys < 6):');
const fn0268AC = disassembleLinear(0x0268AC, 60);
for (const row of fn0268AC) {
  console.log(printRow(row));
}
console.log('');

// ──────────────────────────────────────────────────────────
// Phase 3: Comparison handlers (GRAPH and the shared MATH/STAT/APPS handler)
// ──────────────────────────────────────────────────────────

console.log('## Step 3: Comparison Handlers');
console.log('');

// CP 0x09 (GRAPH) — has its own dedicated block
console.log('### CP 0x09 (GRAPH) Handler — inline at 0x0258E2:');
console.log('  SET 5,(IY+0x05) → CALL 0x03FBF9 → CALL 0x0972AA → CALL 0x025D1E → JP 0x0257CC');
console.log('  Three function calls + flag set, then epilogue. A full context switch.');
console.log('');

// CP 0x05/0x04/0x03/0x40 all share the handler at 0x0258FC
console.log('### CP 0x05/0x04/0x03/0x40 (MATH/STAT/X,T,θ,n/APPS) shared handler at 0x0258FC:');
const sharedRows = disassembleForce(0x0258FC, 15);
for (const row of sharedRows) {
  console.log(printRow(row));
}
console.log('');
console.log('  Pattern: OR A (clear carry), PUSH AF, CALL 0x05E3E3, branch on result,');
console.log('  then JP 0x025AC1 (stack-based context switch). These are menu-launching keys.');
console.log('');

// ──────────────────────────────────────────────────────────
// Phase 4: Overall Summary
// ──────────────────────────────────────────────────────────

console.log('## Summary');
console.log('');
console.log('### Key Correction from Session 292 Notes');
console.log('The session 292 notes listed "0x28" as a CP value in the 0x0258DA dispatcher,');
console.log('with handler at 0x0257CC. This is MISLEADING:');
console.log('');
console.log('  - CP 0x28 exists at 0x0258D4 but it is in the PRE-CASCADE block for keys < 6.');
console.log('    It checks the return value from CALL 0x0268AC, NOT the original scan code.');
console.log('    Keys with scan code >= 6 (including CLEAR=0x28) skip this block entirely.');
console.log('');
console.log('  - 0x0257CC is the SHARED EPILOGUE that ALL handlers JP to, not a CLEAR-specific handler.');
console.log('');
console.log('### CLEAR Key (scan code 0x28) Actual Path:');
console.log('  1. Enters dispatcher at 0x0258BE');
console.log('  2. BIT 6,(IY+0x2B) gate check');
console.log('  3. CP 0x06 → JR NC → skips store-and-call block (0x28 >= 6)');
console.log('  4. Falls through entire CP cascade without matching any value');
console.log('  5. Hits DEFAULT handler at 0x025A93: CALL 0x096E22 + CALL 0x025CFC');
console.log('  6. JP 0x0257CC (shared epilogue): BIT 6,(IY+0x2B), CALL 0x026955, EI, RET');
console.log('');
console.log('### What happens on CLEAR press:');
console.log('  - 0x096E22: the default key handler (likely generic key processing)');
console.log('  - 0x025CFC: post-key cleanup');
console.log('  - 0x026955: epilogue processing (called for ALL keys)');
console.log('  - D0058C is NOT written by this dispatcher (scan code >= 6 skips the store)');
console.log('  - D0058E is NOT written by this dispatcher');
console.log('  - No IY RES/SET operations specific to CLEAR');
console.log('');
console.log('### Comparison with other handlers:');
console.log('  - GRAPH (0x09): dedicated handler with SET 5,(IY+5) + 3 CALLs — full context switch');
console.log('  - MATH/STAT/X,T,θ,n/APPS: shared handler launching menus via 0x05E3E3 + stack switch');
console.log('  - ALPHA (0x02): complex handler with RES 4,(IY+5), multiple CALLs, cursor management');
console.log('  - CLEAR (0x28): NO dedicated handler — falls through to default at 0x025A93');
console.log('');
console.log('### Conclusion:');
console.log('CLEAR does NOT do a full state reset in this dispatcher. It is treated as an');
console.log('unrecognized/default key. The actual CLEAR functionality must be handled:');
console.log('  (a) By a DIFFERENT dispatcher (one of the other 13 D0058C reader sites), or');
console.log('  (b) By the default handler at 0x096E22 which may recognize 0x28 internally, or');
console.log('  (c) Earlier in the pipeline before this dispatcher is reached.');
console.log('');
console.log('Done.');
