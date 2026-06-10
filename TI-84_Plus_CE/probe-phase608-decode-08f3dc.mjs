#!/usr/bin/env node
/**
 * probe-phase608-decode-08f3dc.mjs — Static decode of cursor-advance function
 * at 0x08F3DC and its calling loop at 0x090917.
 *
 * Decodes:
 *   1. 0x08F3DC (cursor advance) — 100 bytes
 *   2. 0x04C973 (compare helper) — 45 bytes
 *   3. 0x090917 (walker loop)    — 41 bytes
 *   4. Cross-reference scan for CALL 0x08F3DC (CD DC F3 08)
 *
 * Output: console listing + phase608-decode-08f3dc.md
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const REPORT_PATH = new URL('./phase608-decode-08f3dc.md', import.meta.url);

const romBytes = readFileSync(ROM_PATH);

// ── helpers ──────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function formatInstruction(inst) {
  const ixd = (reg, disp) => {
    const sign = disp >= 0 ? '+' : '';
    return `(${reg}${sign}${disp})`;
  };
  const p = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'bit-test':        return `${p}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':    return `${p}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit':  return `${p}bit ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg':      return `${p}${inst.op} ${inst.reg}`;
    case 'rotate-ind':      return `${p}${inst.op} (${inst.indirectRegister})`;
    case 'jr-conditional':  return `${p}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':              return `${p}jr ${hex(inst.target)}`;
    case 'djnz':            return `${p}djnz ${hex(inst.target)}`;
    case 'jp':              return `${p}jp ${hex(inst.target)}`;
    case 'jp-conditional':  return `${p}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':     return `${p}jp (${inst.indirectRegister})`;
    case 'call':            return `${p}call ${hex(inst.target)}`;
    case 'call-conditional':return `${p}call ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':             return `${p}ret`;
    case 'ret-conditional': return `${p}ret ${inst.condition}`;
    case 'push':            return `${p}push ${inst.pair}`;
    case 'pop':             return `${p}pop ${inst.pair}`;
    case 'inc-pair':        return `${p}inc ${inst.pair}`;
    case 'dec-pair':        return `${p}dec ${inst.pair}`;
    case 'inc-reg':         return `${p}inc ${inst.reg}`;
    case 'dec-reg':         return `${p}dec ${inst.reg}`;
    case 'ld-pair-imm':     return `${p}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':     return `${p}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':     return `${p}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-mem':      return `${p}ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':      return `${p}ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-imm':      return `${p}ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':      return `${p}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':      return `${p}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':      return `${p}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm':      return `${p}ld (hl), ${hex(inst.value, 2)}`;
    case 'ld-reg-ixd':      return `${p}ld ${inst.dest}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':      return `${p}ld ${ixd(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm':      return `${p}ld ${ixd(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
    case 'ex-de-hl':        return `${p}ex de, hl`;
    case 'exx':             return `${p}exx`;
    case 'ccf':             return `${p}ccf`;
    case 'scf':             return `${p}scf`;
    case 'alu-ind':         return `${p}${inst.op} (${inst.indirectRegister})`;
    case 'alu-ixd':         return `${p}${inst.op} ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'alu-reg':         return `${p}${inst.op} ${inst.src}`;
    case 'alu-imm':         return `${p}${inst.op} ${hex(inst.value, 2)}`;
    case 'add-pair':        return `${p}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair':        return `${p}adc hl, ${inst.src}`;
    case 'sbc-pair':        return `${p}sbc hl, ${inst.src}`;
    case 'cpir':            return `${p}cpir`;
    case 'cpi':             return `${p}cpi`;
    case 'cpdr':            return `${p}cpdr`;
    case 'cpd':             return `${p}cpd`;
    case 'ldir':            return `${p}ldir`;
    case 'ldi':             return `${p}ldi`;
    case 'lddr':            return `${p}lddr`;
    case 'ldd':             return `${p}ldd`;
    case 'inc-ixd':         return `${p}inc ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':         return `${p}dec ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'rst':             return `${p}rst ${hex(inst.target, 2)}`;
    case 'out-imm':         return `${p}out (${hex(inst.port, 2)}), a`;
    case 'in-imm':          return `${p}in a, (${hex(inst.port, 2)})`;
    case 'out-c':           return `${p}out (c), ${inst.reg}`;
    case 'in-c':            return `${p}in ${inst.reg}, (c)`;
    case 'ex-sp-hl':        return `${p}ex (sp), hl`;
    case 'ex-sp-ix':        return `${p}ex (sp), ${inst.indexRegister}`;
    case 'ld-sp-hl':        return `${p}ld sp, hl`;
    case 'ld-sp-ix':        return `${p}ld sp, ${inst.indexRegister}`;
    case 'im':              return `${p}im ${inst.im}`;
    case 'reti':            return `${p}reti`;
    case 'retn':            return `${p}retn`;
    default:                return `${p}${inst.tag}`;
  }
}

function disassemble(startAddr, maxInstructions) {
  const rows = [];
  let pc = startAddr;
  let retCount = 0;

  for (let i = 0; i < maxInstructions; i++) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      b => b.toString(16).padStart(2, '0'),
    ).join(' ');
    const text = formatInstruction(inst);
    rows.push({ pc: inst.pc, bytes: rawBytes, text, inst });
    pc = inst.nextPc;

    // Track unconditional RETs to detect function boundaries
    if (inst.tag === 'ret') retCount++;
    if (retCount >= 2) break;
  }
  return rows;
}

function formatRows(rows) {
  return rows.map(r =>
    `${hex(r.pc)}: ${r.bytes.padEnd(18)} ${r.text}`
  ).join('\n');
}

// ── decode regions ───────────────────────────────────────────────────

console.log('=== 0x08F3DC — cursor advance ===');
const cursorAdvRows = disassemble(0x08F3DC, 50);
console.log(formatRows(cursorAdvRows));

console.log('\n=== 0x04C973 — compare helper ===');
const compareRows = disassemble(0x04C973, 25);
console.log(formatRows(compareRows));

console.log('\n=== 0x090917 — walker loop ===');
const walkerRows = disassemble(0x090917, 25);
console.log(formatRows(walkerRows));

// ── cross-reference scan: CALL 0x08F3DC = CD DC F3 08 ───────────────

console.log('\n=== Cross-references: CALL 0x08F3DC (CD DC F3 08) ===');
const callers = [];
const ROM_SIZE = 0x400000;
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (romBytes[i] === 0xCD &&
      romBytes[i + 1] === 0xDC &&
      romBytes[i + 2] === 0xF3 &&
      romBytes[i + 3] === 0x08) {
    callers.push(i);
  }
}
console.log(`Found ${callers.length} unconditional callers:`);
for (const addr of callers) {
  // Decode a few instructions before the CALL for context
  console.log(`  ${hex(addr)}`);
}

// Also scan for conditional CALL cc, 0x08F3DC patterns
const condCallers = [];
const condOpcodes = [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC];
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (condOpcodes.includes(romBytes[i]) &&
      romBytes[i + 1] === 0xDC &&
      romBytes[i + 2] === 0xF3 &&
      romBytes[i + 3] === 0x08) {
    if (romBytes[i] !== 0xCD) {
      condCallers.push({ addr: i, opcode: romBytes[i] });
    }
  }
}
if (condCallers.length > 0) {
  console.log(`\nConditional CALL callers:`);
  for (const c of condCallers) {
    console.log(`  ${hex(c.addr)}: opcode ${hex(c.opcode, 2)}`);
  }
}

// Provide context for each caller — decode 3 instructions before + the CALL
console.log('\n=== Caller context (3 instructions before each CALL) ===');
for (const addr of callers) {
  // Try to decode from a few bytes before
  const contextStart = Math.max(0, addr - 12);
  const contextRows = [];
  let pc = contextStart;
  while (pc < addr + 4) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    contextRows.push({ pc: inst.pc, bytes: '', text: formatInstruction(inst), inst });
    pc = inst.nextPc;
  }
  // Show the last few instructions up to and including the CALL
  const relevant = contextRows.filter(r => r.pc <= addr).slice(-4);
  console.log(`\n  --- caller at ${hex(addr)} ---`);
  for (const r of relevant) {
    const marker = r.pc === addr ? '>>>' : '   ';
    console.log(`  ${marker} ${hex(r.pc)}: ${formatInstruction(r.inst)}`);
  }
}

// ── analysis ─────────────────────────────────────────────────────────

console.log('\n=== Z-Flag Analysis ===');

const zReturnInfo = [];
for (let i = 0; i < cursorAdvRows.length; i++) {
  const r = cursorAdvRows[i];

  // RET Z / RET NZ
  if (r.inst.tag === 'ret-conditional') {
    zReturnInfo.push(`${r.inst.condition.toUpperCase()} return at ${hex(r.pc)}: RET ${r.inst.condition.toUpperCase()}`);
  }

  // Unconditional RET — check what sets flags before it
  if (r.inst.tag === 'ret' && i > 0) {
    const prev = cursorAdvRows[i - 1];
    zReturnInfo.push(`Unconditional RET at ${hex(r.pc)} (preceded by: ${prev.text})`);
  }

  // CP instructions
  if (r.inst.op === 'cp') {
    if (r.inst.tag === 'alu-imm') {
      zReturnInfo.push(`CP ${hex(r.inst.value, 2)} at ${hex(r.pc)} — Z set when A == ${hex(r.inst.value, 2)}`);
    } else if (r.inst.tag === 'alu-reg') {
      zReturnInfo.push(`CP ${r.inst.src} at ${hex(r.pc)} — Z set when A == ${r.inst.src}`);
    } else if (r.inst.tag === 'alu-ind') {
      zReturnInfo.push(`CP (${r.inst.indirectRegister}) at ${hex(r.pc)} — Z set when A == (${r.inst.indirectRegister})`);
    }
  }

  // OR A (sets Z if A==0)
  if (r.inst.op === 'or' && r.inst.src === 'a') {
    zReturnInfo.push(`OR A at ${hex(r.pc)} — Z set when A == 0`);
  }

  // AND / XOR / SUB that set flags
  if (r.inst.op === 'and' || r.inst.op === 'xor' || r.inst.op === 'sub') {
    zReturnInfo.push(`${r.inst.op.toUpperCase()} at ${hex(r.pc)}: ${r.text}`);
  }
}

for (const info of zReturnInfo) {
  console.log(`  ${info}`);
}

// ── compare helper analysis ──────────────────────────────────────────

console.log('\n=== Compare Helper Analysis (0x04C973) ===');
for (const r of compareRows) {
  const t = r.inst.tag;
  const interesting = t === 'ret' || t === 'ret-conditional' ||
    t === 'sbc-pair' || t === 'adc-pair' ||
    r.inst.op === 'cp' || r.inst.op === 'or' || r.inst.op === 'xor' || r.inst.op === 'sub' ||
    t === 'ex-de-hl';
  if (interesting) {
    console.log(`  ${hex(r.pc)}: ${r.text}`);
  }
}

// ── generate report ──────────────────────────────────────────────────

const report = `# Phase 608 — Decode 0x08F3DC (Cursor-Advance Function)

Generated by probe-phase608-decode-08f3dc.mjs

## 0x08F3DC — Cursor Advance

\`\`\`
${formatRows(cursorAdvRows)}
\`\`\`

## 0x04C973 — Compare Helper

\`\`\`
${formatRows(compareRows)}
\`\`\`

## 0x090917 — Walker Loop

\`\`\`
${formatRows(walkerRows)}
\`\`\`

## Cross-References: CALL 0x08F3DC

${callers.length} unconditional callers:
${callers.map(a => `- \`${hex(a)}\``).join('\n')}
${condCallers.length > 0 ? `\n${condCallers.length} conditional callers:\n${condCallers.map(c => `- \`${hex(c.addr)}\` (opcode ${hex(c.opcode, 2)})`).join('\n')}` : '\nNo conditional callers found.'}

## Z-Flag Analysis (Cursor Advance)

${zReturnInfo.map(s => `- ${s}`).join('\n')}

## Walker Loop (0x090917) Control Flow

The walker loop at 0x090917-0x090928:
1. \`INC HL\` — advance cursor pointer
2. \`CALL 0x08F3DC\` — cursor advance (returns Z if at end)
3. \`RET Z\` — if 0x08F3DC returned Z, the walker is done
4. \`LD DE,(D0243A)\` — load the edit buffer pointer
5. \`CALL 0x04C973\` — compare HL vs DE
6. \`POP DE\`
7. \`RET NZ\` — if compare returned NZ, done

The loop exits when either:
- **0x08F3DC returns Z** — cursor reached end of buffer (terminator found)
- **0x04C973 returns NZ** — cursor position does not match edit target at (D0243A)

**RUNAWAY condition**: neither exit fires. 0x08F3DC never returns Z (no terminator
in the edit buffer) AND (D0243A) keeps matching on every iteration, so the loop
cycles indefinitely with 12KB stack leak per iteration (CALL + POP imbalance).
`;

writeFileSync(fileURLToPath(REPORT_PATH), report);
console.log(`\nReport written to phase608-decode-08f3dc.md`);
console.log('Done.');
