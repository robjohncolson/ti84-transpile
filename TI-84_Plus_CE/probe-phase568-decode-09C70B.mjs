#!/usr/bin/env node
// Decode 0x09C70B — Recursive Paren Balancer (47B)
// Session 567 identified this as a recursive paren-balancing depth scanner
// called from 0x059FFF (token accept handler) when CP 0x29 (close-paren)
// is detected. This probe fully disassembles and annotates it.

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const START = 0x09C70B;
const MAX_BYTES = 80; // 47B expected, extra margin

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xff).toString(16).padStart(2, '0');
}

function hexWord(v) {
  return '0x' + (v & 0xffffff).toString(16).padStart(6, '0');
}

// Known RAM addresses for annotation
const RAM_LABELS = {
  0xd0231a: 'tokenCursor',
  0xd0231d: 'bufferEndLimit',
  0xd00080: 'IY_base (flags)',
  0xd00088: 'IY+0x08 (paren flags)',
  0xd005f8: 'tokenClassByte0',
  0xd005f9: 'tokenClassByte1',
  0xd005fa: 'tokenClassByte2',
  0xd0058e: 'keyEventCode',
};

// Known ROM call targets
const CALL_LABELS = {
  0x09bac9: 'cursorAdvance (8B: increments D0231A)',
  0x09baff: 'mainTokenClassifier',
  0x059fff: 'tokenAcceptHandler',
  0x09c70b: 'SELF — recursive paren balancer',
};

function annotateAddr(addr) {
  if (RAM_LABELS[addr]) return `  ; ${RAM_LABELS[addr]}`;
  if (addr >= 0xd00080 && addr <= 0xd000ff) return `  ; IY+${hex(addr - 0xd00080, 2)}`;
  if (addr >= 0xd00000 && addr < 0xe00000) return `  ; RAM`;
  if (addr < 0x400000) return `  ; ROM`;
  return '';
}

function annotateCall(target) {
  if (CALL_LABELS[target]) return `  ; ${CALL_LABELS[target]}`;
  if (target < 0x400000) return '  ; ROM fn';
  return '';
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ex-sp-index': return `ex (sp), ${inst.indexRegister}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hexWord(inst.value)}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hexWord(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hexWord(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `ld (${hexWord(inst.addr)}), ${inst.pair}`;
      return `ld ${inst.pair}, (${hexWord(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hexWord(inst.addr)}), ${inst.pair}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-index': return `ld sp, ${inst.indexRegister}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.indirectRegister})`;
    case 'ld-ind-reg': return `ld (${inst.indirectRegister}), ${inst.src}`;
    case 'ld-ind-imm': return `ld (${inst.indirectRegister}), ${hexByte(inst.value)}`;
    case 'ld-indexed-reg': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `ld (${inst.indexRegister}${s}${inst.displacement}), ${inst.src}`;
    }
    case 'ld-reg-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `ld ${inst.dest}, (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'ld-indexed-imm': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `ld (${inst.indexRegister}${s}${inst.displacement}), ${hexByte(inst.value)}`;
    }
    case 'ld-a-i': return 'ld a, i';
    case 'ld-i-a': return 'ld i, a';
    case 'ld-a-r': return 'ld a, r';
    case 'ld-r-a': return 'ld r, a';
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ind': return `${inst.op} (${inst.indirectRegister})`;
    case 'alu-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `${inst.op} (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-ind': return `inc (${inst.indirectRegister})`;
    case 'dec-ind': return `dec (${inst.indirectRegister})`;
    case 'inc-index': return `inc ${inst.indexRegister}`;
    case 'dec-index': return `dec ${inst.indexRegister}`;
    case 'inc-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `inc (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'dec-indexed': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `dec (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'push-index': return `push ${inst.indexRegister}`;
    case 'pop-index': return `pop ${inst.indexRegister}`;
    case 'jp': return `jp ${hexWord(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hexWord(inst.target)}`;
    case 'jp-hl': return 'jp (hl)';
    case 'jp-index': return `jp (${inst.indexRegister})`;
    case 'jr': return `jr ${hexWord(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hexWord(inst.target)}`;
    case 'djnz': return `djnz ${hexWord(inst.target)}`;
    case 'call': return `call ${hexWord(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hexWord(inst.target)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'rst': return `rst ${hexByte(inst.target)}`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-reset': return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-reset-ind': return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `bit ${inst.bit}, (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'indexed-cb-set': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `set ${inst.bit}, (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'indexed-cb-reset': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `res ${inst.bit}, (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'rotate-reg': return `${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${inst.op} (${inst.indirectRegister})`;
    case 'indexed-cb-rotate': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `${inst.op} (${inst.indexRegister}${s}${inst.displacement})`;
    }
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'rld': return 'rld';
    case 'rrd': return 'rrd';
    case 'daa': return 'daa';
    case 'cpl': return 'cpl';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'neg': return 'neg';
    case 'im': return `im ${inst.mode_val ?? inst.im_mode ?? '?'}`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg}`;
    case 'in-a-imm': return `in a, (${hexByte(inst.port)})`;
    case 'out-imm-a': return `out (${hexByte(inst.port)}), a`;
    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'ini': return 'ini';
    case 'inir': return 'inir';
    case 'ind': return 'ind';
    case 'indr': return 'indr';
    case 'outi': return 'outi';
    case 'otir': return 'otir';
    case 'outd': return 'outd';
    case 'otdr': return 'otdr';
    case 'add-hl-pair': return `add hl, ${inst.pair}`;
    case 'adc-hl-pair': return `adc hl, ${inst.pair}`;
    case 'sbc-hl-pair': return `sbc hl, ${inst.pair}`;
    case 'add-index-pair': return `add ${inst.indexRegister}, ${inst.pair}`;
    case 'lea-index': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `lea ${inst.dest}, ${inst.indexRegister}${s}${inst.displacement}`;
    }
    case 'lea-pair': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `lea ${inst.pair}, ${inst.indexRegister}${s}${inst.displacement}`;
    }
    case 'pea-index': {
      const s = inst.displacement >= 0 ? '+' : '';
      return `pea ${inst.indexRegister}${s}${inst.displacement}`;
    }
    case 'tst-a-reg': return `tst a, ${inst.reg}`;
    case 'tst-a-imm': return `tst a, ${hexByte(inst.value)}`;
    case 'mlt': return `mlt ${inst.pair}`;
    case 'stmix': return 'stmix';
    case 'rsmix': return 'rsmix';
    case 'slp': return 'slp';
    case 'ld-mb-a': return 'ld mb, a';
    case 'ld-a-mb': return 'ld a, mb';
    default: return `<${inst.tag}>${JSON.stringify(inst)}`;
  }
}

// ── Role annotations keyed by PC address ──
// These are assigned after first-pass disassembly based on actual byte analysis.
const ROLE = {
  0x09C70B: 'ENTRY GUARD: BIT 1,(IY+0x08) — is paren-balance mode active?',
  0x09C70F: 'if NZ (bit set): skip early exit, proceed to scan loop',
  0x09C711: 'OR A clears CF, keeps A; signal "not in paren mode"',
  0x09C712: 'EARLY EXIT: paren mode not active → RET with CF=0',
  0x09C713: 'SAVE: snapshot tokenCursor D0231A into HL',
  0x09C717: 'PUSH HL — save entry cursor on stack (one per nesting level)',
  0x09C718: 'SCAN LOOP TOP: CALL cursorAdvance → next token, result in A',
  0x09C71C: 'store updated cursor BC → D0231A',
  0x09C721: 'JR NC: if cursorAdvance returned CF=0 (hit end), go to classify',
  0x09C723: 'POP HL — restore saved cursor (fail path)',
  0x09C724: 'XOR A — A=0, CF=0: signal "unbalanced, hit end of buffer"',
  0x09C725: 'FAIL EXIT: unbalanced → RET with A=0, CF=0',
  0x09C726: 'CP 0x3E — is current token an open-paren "("?',
  0x09C728: 'JR Z → 0x09C723: open-paren found → POP+XOR+RET (mismatch at this level)',
  0x09C72A: 'CP 0x3F — is it token 0x3F (end-of-expression marker)?',
  0x09C72C: 'JR Z → 0x09C723: end-of-expr found → POP+XOR+RET (mismatch)',
  0x09C72E: 'CP 0x29 — is it a close-paren ")"?',
  0x09C730: 'JR Z → 0x09C718: close-paren found → re-enter scan loop (recurse via loop)',
  0x09C732: 'POP HL — restore saved cursor (success path: no special token)',
  0x09C733: 'LD (D0231A), HL — write original cursor back (undo advances)',
  0x09C737: 'LD A, 0x29 — return value signals "balanced paren group"',
  0x09C739: 'SUCCESS EXIT: RET with A=0x29',
};

// Collect external calls, RAM refs, exit paths
const calls = [];
const ramRefs = [];
const exitPaths = [];
const condBranchTargets = new Set();

console.log(`=== Disassembly of 0x09C70B — Recursive Paren Balancer ===\n`);

// First pass: disassemble, collecting branch targets
let pc = START;
const endPc = START + MAX_BYTES;
let instrCount = 0;
let lastPc = START;
const instructions = [];

while (pc < endPc) {
  const inst = decodeInstruction(rom, pc, 'adl');

  const rawBytes = Array.from(
    rom.slice(inst.pc, inst.pc + inst.length),
    (v) => v.toString(16).padStart(2, '0')
  ).join(' ');

  const dasm = formatInstruction(inst);
  instructions.push({ inst, rawBytes, dasm });

  // Track conditional branch targets
  if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional') {
    condBranchTargets.add(inst.target);
  }

  // Track calls
  if (inst.tag === 'call' || inst.tag === 'call-conditional') {
    calls.push({ pc: inst.pc, target: inst.target, conditional: inst.tag === 'call-conditional', condition: inst.condition });
  }

  // Track RAM references
  if (inst.addr !== undefined && inst.addr >= 0xd00000 && inst.addr < 0xe00000) {
    ramRefs.push({ pc: inst.pc, addr: inst.addr, label: RAM_LABELS[inst.addr] || 'RAM' });
  }

  // Track exit paths
  if (inst.tag === 'ret' || inst.tag === 'ret-conditional') {
    exitPaths.push({ pc: inst.pc, type: inst.tag, condition: inst.condition });
  }
  if (inst.tag === 'jp' || inst.tag === 'jp-hl' || inst.tag === 'jp-index') {
    exitPaths.push({ pc: inst.pc, type: inst.tag, target: inst.target });
  }

  instrCount++;
  lastPc = inst.pc + inst.length;
  pc += inst.length;

  // Stop at unconditional RET or JP, but continue if a conditional branch
  // targets an address past us (meaning there's a fall-through path)
  if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'jp-hl' || inst.tag === 'jp-index') {
    const nextPc = inst.pc + inst.length;
    if (!condBranchTargets.has(nextPc)) {
      break;
    }
    console.log(`  (conditional branch targets ${hex(nextPc)}, continuing)\n`);
  }
}

// Print all instructions with role + address annotations
for (const { inst, rawBytes, dasm } of instructions) {
  let annotation = '';

  // Address-based annotations
  if (inst.addr !== undefined) {
    annotation = annotateAddr(inst.addr);
  } else if (inst.target !== undefined && typeof inst.target === 'number') {
    annotation = annotateCall(inst.target);
  }

  // IY-relative references
  if (dasm.includes('iy') && inst.displacement !== undefined) {
    const iyAddr = 0xd00080 + inst.displacement;
    if (RAM_LABELS[iyAddr]) {
      annotation += `  ; IY+${hexByte(inst.displacement)} = ${RAM_LABELS[iyAddr]}`;
    }
  }

  // Role annotation from the ROLE table
  const role = ROLE[inst.pc];
  if (role) {
    annotation += `\n${' '.repeat(38)}  ;; ${role}`;
  }

  console.log(`${hex(inst.pc)}  ${rawBytes.padEnd(20)} ${dasm}${annotation}`);
}

// Summary
console.log(`\n\n=== Summary ===`);
console.log(`Function start:  ${hex(START)}`);
console.log(`Function size:   ${lastPc - START} bytes (${instrCount} instructions)`);
console.log(`Disassembly end: ${hex(lastPc)}`);

console.log(`\nExternal CALLs (${calls.length}):`);
for (const c of calls) {
  const label = CALL_LABELS[c.target] ? ` — ${CALL_LABELS[c.target]}` : '';
  console.log(`  ${hex(c.pc)} -> CALL ${c.conditional ? c.condition + ', ' : ''}${hex(c.target)}${label}`);
}

console.log(`\nRAM references (${ramRefs.length}):`);
for (const r of ramRefs) {
  console.log(`  ${hex(r.pc)} -> ${hex(r.addr)} (${r.label})`);
}

console.log(`\nExit paths (${exitPaths.length}):`);
for (const e of exitPaths) {
  if (e.target !== undefined) {
    console.log(`  ${hex(e.pc)} -> ${e.type.toUpperCase()} ${hex(e.target)}`);
  } else {
    console.log(`  ${hex(e.pc)} -> ${e.type.toUpperCase()}${e.condition ? ' ' + e.condition : ''}`);
  }
}

// Detailed analysis
console.log(`\n\n=== Detailed Analysis: Recursive Paren Balancer 0x09C70B ===`);
console.log(`
ENTRY CONDITIONS:
  - Called from 0x059FFF (token accept handler) when current token = 0x29 (close-paren)
  - IY = D00080 (system flags base)
  - D0231A = tokenCursor (current position in token buffer)
  - A = token value returned by cursor advance (from caller's context)
  - cursorAdvance (0x09BAC9) returns next token in A, CF=1 if valid / CF=0 if end-of-buffer

ALGORITHM — CONTROL FLOW GRAPH:

  0x09C70B  BIT 1,(IY+0x08)      — check paren-balance-active flag
  0x09C70F  JR NZ, +2            — if SET: skip to 0x09C713 (main body)
  0x09C711  OR A                  — clear CF
  0x09C712  RET                   — EARLY EXIT: paren mode inactive

  0x09C713  LD HL,(D0231A)        — snapshot cursor position
  0x09C717  PUSH HL               — save on stack (one frame per nesting level)

  [SCAN LOOP — top at 0x09C718]:
  0x09C718  CALL 0x09BAC9         — cursorAdvance: next token → A, CF=valid
  0x09C71C  LD (D0231A),BC        — store updated cursor back
  0x09C721  JR NC, +3 → 0x09C726 — if CF=0 (end of buffer): skip to classify
            (fall-through: CF=1 means hit end)
  0x09C723  POP HL                — restore saved cursor
  0x09C724  XOR A                 — A=0
  0x09C725  RET                   — FAIL EXIT: hit end of buffer, unbalanced

  [TOKEN CLASSIFICATION — at 0x09C726]:
  0x09C726  CP 0x3E               — open-paren "(" ?
  0x09C728  JR Z → 0x09C723      — YES: POP+XOR+RET → mismatch (found "(" when seeking ")")
  0x09C72A  CP 0x3F               — end-of-expression marker?
  0x09C72C  JR Z → 0x09C723      — YES: POP+XOR+RET → mismatch (expression ended)
  0x09C72E  CP 0x29               — close-paren ")" ?
  0x09C730  JR Z → 0x09C718      — YES: re-enter scan loop (consume nested close-paren)

  [NO MATCH — fall-through at 0x09C732]:
  0x09C732  POP HL                — restore saved cursor
  0x09C733  LD (D0231A),HL        — write original cursor back (undo all advances)
  0x09C737  LD A,0x29             — return value = 0x29 (balanced)
  0x09C739  RET                   — SUCCESS EXIT

RECURSIVE STRUCTURE:
  - When CP 0x29 matches at 0x09C72E, JR Z loops back to 0x09C718 (scan loop top).
    This does NOT use CALL 0x09C70B — it is an iterative loop, not true recursion.
  - Each close-paren ")" found re-enters the scan loop, consuming one more token.
  - The PUSH HL at 0x09C717 saves the original cursor; it is only pushed ONCE
    per call to this function (before the scan loop starts).
  - True recursion happens at the CALLER level: 0x059FFF calls 0x09C70B, and
    the token classifier may trigger another call to 0x059FFF → 0x09C70B.

PAREN DEPTH TRACKING:
  - Depth is tracked implicitly by the call chain from the token accept handler.
  - Within a single call to 0x09C70B, the function loops through tokens:
      0x3E → immediate fail (found open-paren, wrong direction)
      0x3F → immediate fail (hit end marker)
      0x29 → consume it and keep scanning (loop back)
      anything else → balanced match found, restore cursor, return A=0x29
  - The function scans FORWARD through close-parens. When it encounters a
    non-paren, non-boundary token, it considers the paren group balanced.

EXIT CONDITIONS:
  - A=0x29: balanced — paren group consumed, cursor restored to entry position
  - A=0x00, CF=0: unbalanced — hit end of buffer or found open-paren/end-marker
  - A unchanged, CF=0: paren mode not active (early exit, bit 1 of IY+0x08 clear)

TOKEN CODES HANDLED:
  - 0x29 = close-paren ")" — consume and continue scanning
  - 0x3E = open-paren "(" — fail (wrong nesting direction)
  - 0x3F = end-of-expression — fail (expression boundary)
  - anything else = non-paren token → signals balanced group at this level

RAM ADDRESSES:
  - D0231A: tokenCursor — read at entry (save), written after cursorAdvance,
            restored on success exit. Three references total.
  - D00088: IY+0x08 — paren-balance-mode flag (bit 1). Read-only guard.
`);

console.log(`Done.`);
process.exit(0);
