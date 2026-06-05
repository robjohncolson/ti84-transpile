import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const IY_BASE = 0xd00080;

// Target functions
const FUNC_A = { name: '0x09AF4E (token/alpha range)', start: 0x09af4e, maxBytes: 350 };
const FUNC_B = { name: '0x099BB0 (2nd-function range)', start: 0x099bb0, maxBytes: 350 };

// Token table range
const TOKEN_TABLE_START = 0x061cfa;
const TOKEN_TABLE_END = 0x061db1;
// Fallthrough entries
const FALLTHROUGH_A = 0x061d22;
const FALLTHROUGH_B = 0x061d2c;

const rom = readFileSync(ROM_PATH);

const hex = (v, w = 2) => `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const addr = (v) => hex(v, 6);
const signed = (b) => (b & 0x80 ? b - 0x100 : b);
const relTarget = (pc, size, disp) => (pc + size + signed(disp)) & 0xffffff;
const u16 = (off) => rom[off] | (rom[off + 1] << 8);
const u24 = (off) => rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16);

function bytesAt(pc, size) {
  return [...rom.subarray(pc, pc + size)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

// --- Lightweight decoder (same as phase518 reference) ---

const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const rpPush = ['BC', 'DE', 'HL', 'AF'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

function decodeCb(pc) {
  const op = rom[pc + 1];
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  const bitGroups = ['BIT', 'RES', 'SET'];
  const text = x === 0 ? `${groups[y]} ${r[z]}` : `${bitGroups[x - 1]} ${y},${r[z]}`;
  return { size: 2, text };
}

function decodeEd(pc) {
  const op = rom[pc + 1];
  const lo = rom[pc + 2];
  const hi = rom[pc + 3];
  const address16 = lo | (hi << 8);
  const block = {
    0x44: 'NEG', 0x45: 'RETN', 0x46: 'IM 0', 0x47: 'LD I,A', 0x4d: 'RETI', 0x4f: 'LD R,A',
    0x56: 'IM 1', 0x57: 'LD A,I', 0x5e: 'IM 2', 0x5f: 'LD A,R',
    0xa0: 'LDI', 0xa1: 'CPI', 0xa2: 'INI', 0xa3: 'OUTI',
    0xa8: 'LDD', 0xa9: 'CPD', 0xaa: 'IND', 0xab: 'OUTD',
    0xb0: 'LDIR', 0xb1: 'CPIR', 0xb2: 'INIR', 0xb3: 'OTIR',
    0xb8: 'LDDR', 0xb9: 'CPDR', 0xba: 'INDR', 0xbb: 'OTDR',
  };
  if (block[op]) return { size: 2, text: block[op] };
  if ((op & 0xcf) === 0x43) {
    const reg = rp[(op >> 4) & 3];
    return { size: 4, text: `LD (${hex(address16, 4)}),${reg}` };
  }
  if ((op & 0xcf) === 0x4b) {
    const reg = rp[(op >> 4) & 3];
    return { size: 4, text: `LD ${reg},(${hex(address16, 4)})` };
  }
  return { size: 2, text: `ED ${hex(op)}` };
}

function decodeIndexed(pc, indexReg) {
  const op = rom[pc + 1];

  if (op === 0xcb) {
    const disp = rom[pc + 2];
    const cbop = rom[pc + 3];
    const x = cbop >> 6;
    const y = (cbop >> 3) & 7;
    const groups = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    const bitGroups = ['BIT', 'RES', 'SET'];
    const mem = `(${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)})`;
    const opName = x === 0 ? groups[y] : `${bitGroups[x - 1]} ${y},`;
    return { size: 4, text: `${opName}${mem}` };
  }

  if (op === 0x21) return { size: 4, text: `LD ${indexReg},${addr(u24(pc + 2))}` };
  if (op === 0x22) return { size: 4, text: `LD (${addr(u24(pc + 2))}),${indexReg}` };
  if (op === 0x2a) return { size: 4, text: `LD ${indexReg},(${addr(u24(pc + 2))})` };
  if (op === 0x36) {
    const disp = rom[pc + 2];
    const value = rom[pc + 3];
    return { size: 4, text: `LD (${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)}),${hex(value)}` };
  }
  if ((op & 0xc7) === 0x46) {
    const reg = r[(op >> 3) & 7];
    const disp = rom[pc + 2];
    return { size: 3, text: `LD ${reg},(${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)})` };
  }
  if ((op & 0xf8) === 0x70) {
    const src = r[op & 7];
    const disp = rom[pc + 2];
    return { size: 3, text: `LD (${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)}),${src}` };
  }
  if ((op & 0xc7) === 0x86) {
    const disp = rom[pc + 2];
    const opName = alu[(op >> 3) & 7];
    return { size: 3, text: `${opName} (${indexReg}${signed(disp) >= 0 ? '+' : ''}${signed(disp)})` };
  }
  if (op === 0xe5) return { size: 2, text: `PUSH ${indexReg}` };
  if (op === 0xe1) return { size: 2, text: `POP ${indexReg}` };
  if (op === 0x23) return { size: 2, text: `INC ${indexReg}` };
  if (op === 0x2b) return { size: 2, text: `DEC ${indexReg}` };
  if ((op & 0xcf) === 0x09) return { size: 2, text: `ADD ${indexReg},${rp[(op >> 4) & 3]}` };

  // fallback: decode as base with note
  const base = decodeBase(pc + 1);
  return { size: base.size + 1, text: `${base.text} ; ${indexReg} prefix` };
}

function decodeBase(pc) {
  const op = rom[pc];
  const n = rom[pc + 1];
  const nnn = u24(pc + 1);

  // Mode prefixes (.SIS, .LIS, .SIL, .LIL)
  if ([0x40, 0x49, 0x52, 0x5b].includes(op)) {
    const suffix = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5b: '.LIL' }[op];
    const next = decodeBase(pc + 1);
    return { size: next.size + 1, text: `${suffix} ${next.text}` };
  }
  if (op === 0xcb) return decodeCb(pc);
  if (op === 0xed) return decodeEd(pc);
  if (op === 0xdd) return decodeIndexed(pc, 'IX');
  if (op === 0xfd) return decodeIndexed(pc, 'IY');

  if (op === 0x00) return { size: 1, text: 'NOP' };
  if (op === 0x08) return { size: 1, text: "EX AF,AF'" };
  if (op === 0x10) return { size: 2, text: `DJNZ ${addr(relTarget(pc, 2, n))}`, branch: { type: 'DJNZ', target: relTarget(pc, 2, n) } };
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op)) {
    const cond = { 0x18: '', 0x20: 'NZ,', 0x28: 'Z,', 0x30: 'NC,', 0x38: 'C,' }[op];
    const target = relTarget(pc, 2, n);
    return { size: 2, text: `JR ${cond}${addr(target)}`, branch: { type: `JR ${cond || 'uncond'}`.trim(), target } };
  }
  if (op === 0xc3) return { size: 4, text: `JP ${addr(nnn)}`, branch: { type: 'JP', target: nnn } };
  if ((op & 0xc7) === 0xc2) {
    const condition = cc[(op >> 3) & 7];
    return { size: 4, text: `JP ${condition},${addr(nnn)}`, branch: { type: `JP ${condition}`, target: nnn } };
  }
  if (op === 0xcd) return { size: 4, text: `CALL ${addr(nnn)}`, call: nnn };
  if ((op & 0xc7) === 0xc4) {
    const condition = cc[(op >> 3) & 7];
    return { size: 4, text: `CALL ${condition},${addr(nnn)}`, call: nnn };
  }
  if (op === 0xc9) return { size: 1, text: 'RET', exits: true };
  if ((op & 0xc7) === 0xc0) return { size: 1, text: `RET ${cc[(op >> 3) & 7]}` };
  if (op === 0xd9) return { size: 1, text: 'EXX' };
  if (op === 0xe3) return { size: 1, text: 'EX (SP),HL' };
  if (op === 0xeb) return { size: 1, text: 'EX DE,HL' };
  if (op === 0xf3) return { size: 1, text: 'DI' };
  if (op === 0xfb) return { size: 1, text: 'EI' };
  if (op === 0xe9) return { size: 1, text: 'JP (HL)', branch: { type: 'JP (HL)', target: null } };
  if (op === 0x76) return { size: 1, text: 'HALT' };
  if (op === 0x27) return { size: 1, text: 'DAA' };
  if (op === 0x2f) return { size: 1, text: 'CPL' };
  if (op === 0x37) return { size: 1, text: 'SCF' };
  if (op === 0x3f) return { size: 1, text: 'CCF' };
  if (op === 0x07) return { size: 1, text: 'RLCA' };
  if (op === 0x0f) return { size: 1, text: 'RRCA' };
  if (op === 0x17) return { size: 1, text: 'RLA' };
  if (op === 0x1f) return { size: 1, text: 'RRA' };

  if ((op & 0xcf) === 0x01) return { size: 4, text: `LD ${rp[(op >> 4) & 3]},${addr(nnn)}` };
  if ((op & 0xcf) === 0x03) return { size: 1, text: `INC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x0b) return { size: 1, text: `DEC ${rp[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0x09) return { size: 1, text: `ADD HL,${rp[(op >> 4) & 3]}` };
  if ((op & 0xc7) === 0x04) return { size: 1, text: `INC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x05) return { size: 1, text: `DEC ${r[(op >> 3) & 7]}` };
  if ((op & 0xc7) === 0x06) return { size: 2, text: `LD ${r[(op >> 3) & 7]},${hex(n)}` };
  if (op === 0x02) return { size: 1, text: 'LD (BC),A' };
  if (op === 0x0a) return { size: 1, text: 'LD A,(BC)' };
  if (op === 0x12) return { size: 1, text: 'LD (DE),A' };
  if (op === 0x1a) return { size: 1, text: 'LD A,(DE)' };
  if (op === 0x22) return { size: 4, text: `LD (${addr(nnn)}),HL` };
  if (op === 0x2a) return { size: 4, text: `LD HL,(${addr(nnn)})` };
  if (op === 0x32) return { size: 4, text: `LD (${addr(nnn)}),A` };
  if (op === 0x3a) return { size: 4, text: `LD A,(${addr(nnn)})` };
  if (op >= 0x40 && op <= 0x7f) return { size: 1, text: `LD ${r[(op >> 3) & 7]},${r[op & 7]}` };
  if (op >= 0x80 && op <= 0xbf) return { size: 1, text: `${alu[(op >> 3) & 7]} ${r[op & 7]}` };
  if ((op & 0xc7) === 0xc6) return { size: 2, text: `${alu[(op >> 3) & 7]} ${hex(n)}` };
  if ((op & 0xcf) === 0xc5) return { size: 1, text: `PUSH ${rpPush[(op >> 4) & 3]}` };
  if ((op & 0xcf) === 0xc1) return { size: 1, text: `POP ${rpPush[(op >> 4) & 3]}` };
  if ((op & 0xc7) === 0xc7) return { size: 1, text: `RST ${hex(op & 0x38)}` };

  return { size: 1, text: `DB ${hex(op)}` };
}

// --- Disassemble a function, extracting CP/JP routing pairs ---

function disassembleFunction(funcDef) {
  const { start, maxBytes } = funcDef;
  const instructions = [];
  let pc = start;

  while (pc < start + maxBytes && pc < rom.length) {
    const decoded = decodeBase(pc);
    instructions.push({ pc, ...decoded, bytes: bytesAt(pc, decoded.size) });
    pc += decoded.size;
  }

  return instructions;
}

// Extract CP immediate / JP conditional pairs from instruction stream.
// Pattern: CP <imm> followed (possibly with intervening JR) by JP <cond>,<addr>
function extractCpJpPairs(instructions) {
  const pairs = [];
  let lastCpValue = null;
  let lastCpPc = null;

  for (let i = 0; i < instructions.length; i++) {
    const ins = instructions[i];
    const text = ins.text;

    // Detect CP <immediate>
    const cpMatch = text.match(/^CP (0x[0-9A-F]+)$/);
    if (cpMatch) {
      lastCpValue = parseInt(cpMatch[1], 16);
      lastCpPc = ins.pc;
      continue;
    }

    // Detect JP <cond>,<addr> or JP <addr> (unconditional after CP)
    if (ins.branch && lastCpValue !== null) {
      const branchType = ins.branch.type;
      const target = ins.branch.target;

      // Only record conditional jumps that follow a CP, or unconditional JP
      if (branchType.startsWith('JP') || branchType.startsWith('JR')) {
        const inTokenTable = target !== null && target >= TOKEN_TABLE_START && target <= TOKEN_TABLE_END;
        let tokenByte = null;
        if (inTokenTable) {
          // Token table entry format: LD A,<token> (3E xx) then JR <offset> (18 xx)
          tokenByte = rom[target + 1]; // byte after 0x3E at target
          const opAtTarget = rom[target];
          if (opAtTarget !== 0x3e) {
            // Not LD A,nn -- might be a different entry format
            tokenByte = null;
          }
        }

        pairs.push({
          cpPc: lastCpPc,
          cpValue: lastCpValue,
          jpPc: ins.pc,
          jpType: branchType,
          target,
          inTokenTable,
          tokenByte,
        });
      }

      // Reset after unconditional jump
      if (branchType === 'JP' || branchType === 'JR uncond') {
        lastCpValue = null;
        lastCpPc = null;
      }
      // For conditional branches, keep the CP value -- the next branch might also use it
      // (e.g., CP x; JP Z,a; JP NC,b uses the same CP for two branches)
    }

    // If we hit a non-branch, non-CP instruction that changes A or flags, reset
    if (!cpMatch && !ins.branch) {
      const resetPatterns = ['LD A,', 'AND ', 'OR ', 'XOR ', 'SUB ', 'ADD A', 'ADC A', 'SBC A', 'INC A', 'DEC A', 'NEG', 'CPL', 'DAA', 'RLA', 'RRA', 'RLCA', 'RRCA'];
      if (resetPatterns.some((p) => text.startsWith(p) || text === p)) {
        lastCpValue = null;
        lastCpPc = null;
      }
    }
  }

  return pairs;
}

// --- Extract token table entries ---

function extractTokenTable() {
  const entries = [];
  let pc = TOKEN_TABLE_START;

  while (pc <= TOKEN_TABLE_END) {
    const op = rom[pc];

    if (op === 0x3e) {
      // LD A, <token>
      const token = rom[pc + 1];
      const nextOp = rom[pc + 2];

      if (nextOp === 0x18) {
        // JR <offset>
        const disp = rom[pc + 3];
        const jrTarget = relTarget(pc + 2, 2, disp);
        entries.push({ pc, token, jrTarget, size: 4 });
        pc += 4;
      } else {
        entries.push({ pc, token, nextOp, size: 2, note: 'LD A,nn not followed by JR' });
        pc += 2;
      }
    } else if (op === 0xc3) {
      // JP <addr> -- possible fallthrough/redirect
      const target = u24(pc + 1);
      entries.push({ pc, jpTarget: target, size: 4, note: 'JP redirect' });
      pc += 4;
    } else {
      entries.push({ pc, rawByte: op, size: 1, note: 'unexpected byte' });
      pc += 1;
    }
  }

  return entries;
}

// --- Main ---

console.log('Probe phase 519: scan-code-to-token-table routing');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log('');

// 1. Disassemble token table
console.log('===================================================');
console.log('TOKEN TABLE at 0x061CFA - 0x061DB1');
console.log('===================================================');

const tokenEntries = extractTokenTable();
for (const entry of tokenEntries) {
  if (entry.token !== undefined && entry.jrTarget !== undefined) {
    console.log(`  ${addr(entry.pc)}  LD A,${hex(entry.token)}; JR ${addr(entry.jrTarget)}  (token ${hex(entry.token)})`);
  } else if (entry.jpTarget !== undefined) {
    console.log(`  ${addr(entry.pc)}  JP ${addr(entry.jpTarget)}  ; ${entry.note}`);
  } else if (entry.token !== undefined) {
    console.log(`  ${addr(entry.pc)}  LD A,${hex(entry.token)}  ; ${entry.note}`);
  } else {
    console.log(`  ${addr(entry.pc)}  DB ${hex(entry.rawByte)}  ; ${entry.note}`);
  }
}
console.log(`  Total entries: ${tokenEntries.length}`);

// 2. Disassemble function A (0x09AF4E)
console.log('');
console.log('===================================================');
console.log(`FUNCTION A: ${FUNC_A.name}`);
console.log('===================================================');

const insA = disassembleFunction(FUNC_A);
console.log(`  Decoded range: ${addr(FUNC_A.start)}..${addr(insA[insA.length - 1].pc)} (${insA[insA.length - 1].pc + insA[insA.length - 1].size - FUNC_A.start} bytes, ${insA.length} instructions)`);
console.log('');
console.log('  Disassembly:');
for (const ins of insA) {
  console.log(`  ${addr(ins.pc)}  ${ins.bytes.padEnd(16)}  ${ins.text}`);
}

const pairsA = extractCpJpPairs(insA);
console.log('');
console.log('  CP/JP routing pairs:');
if (pairsA.length === 0) {
  console.log('    (none found)');
} else {
  for (const p of pairsA) {
    const tokenInfo = p.inTokenTable ? ` => token ${hex(p.tokenByte)}` : '';
    const tableNote = p.inTokenTable ? ' [IN TOKEN TABLE]' : '';
    console.log(`    CP ${hex(p.cpValue)} @ ${addr(p.cpPc)} -> ${p.jpType} ${addr(p.target)}${tableNote}${tokenInfo}`);
  }
}

// 3. Disassemble function B (0x099BB0)
console.log('');
console.log('===================================================');
console.log(`FUNCTION B: ${FUNC_B.name}`);
console.log('===================================================');

const insB = disassembleFunction(FUNC_B);
console.log(`  Decoded range: ${addr(FUNC_B.start)}..${addr(insB[insB.length - 1].pc)} (${insB[insB.length - 1].pc + insB[insB.length - 1].size - FUNC_B.start} bytes, ${insB.length} instructions)`);
console.log('');
console.log('  Disassembly:');
for (const ins of insB) {
  console.log(`  ${addr(ins.pc)}  ${ins.bytes.padEnd(16)}  ${ins.text}`);
}

const pairsB = extractCpJpPairs(insB);
console.log('');
console.log('  CP/JP routing pairs:');
if (pairsB.length === 0) {
  console.log('    (none found)');
} else {
  for (const p of pairsB) {
    const tokenInfo = p.inTokenTable ? ` => token ${hex(p.tokenByte)}` : '';
    const tableNote = p.inTokenTable ? ' [IN TOKEN TABLE]' : '';
    console.log(`    CP ${hex(p.cpValue)} @ ${addr(p.cpPc)} -> ${p.jpType} ${addr(p.target)}${tableNote}${tokenInfo}`);
  }
}

// 4. Summary: combined scan-code-to-token mapping
console.log('');
console.log('===================================================');
console.log('COMBINED SCAN-CODE-TO-TOKEN MAPPING');
console.log('===================================================');

const allPairs = [
  ...pairsA.map((p) => ({ ...p, source: 'A (0x09AF4E)' })),
  ...pairsB.map((p) => ({ ...p, source: 'B (0x099BB0)' })),
];

const tokenTableHits = allPairs.filter((p) => p.inTokenTable);
const nonTableHits = allPairs.filter((p) => !p.inTokenTable);

console.log('');
console.log(`  Total CP/JP pairs found: ${allPairs.length}`);
console.log(`  Routing to token table (0x061CFA-0x061DB1): ${tokenTableHits.length}`);
console.log(`  Routing elsewhere: ${nonTableHits.length}`);

if (tokenTableHits.length > 0) {
  console.log('');
  console.log('  Scan codes routing INTO token table:');
  console.log('  ----------------------------------------');
  for (const p of tokenTableHits) {
    console.log(`    scan=${hex(p.cpValue)} -> ${p.jpType} ${addr(p.target)} => token=${hex(p.tokenByte)} [${p.source}]`);
  }
}

if (nonTableHits.length > 0) {
  console.log('');
  console.log('  Scan codes routing OUTSIDE token table:');
  console.log('  ----------------------------------------');
  for (const p of nonTableHits) {
    console.log(`    scan=${hex(p.cpValue)} -> ${p.jpType} ${addr(p.target)} [${p.source}]`);
  }
}

// 5. Check fallthrough entries
console.log('');
console.log('  Fallthrough entries:');
console.log(`    0x061D22: byte=${hex(rom[FALLTHROUGH_A])} ${bytesAt(FALLTHROUGH_A, 6)}`);
console.log(`    0x061D2C: byte=${hex(rom[FALLTHROUGH_B])} ${bytesAt(FALLTHROUGH_B, 6)}`);

console.log('');
console.log('Done.');
