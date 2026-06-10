import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const REPORT_PATH = path.join('TI-84_Plus_CE', 'phase604-02af0f-loop.md');

const TARGETS = [
  { name: 'loop/control candidate', addr: 0x02af0f, length: 64 },
  { name: 'loop/body companion candidate', addr: 0x002696, length: 64 },
  { name: 'post-loop transition', addr: 0x0bcb2f, length: 48 },
  { name: 'post-transition dispatcher candidate', addr: 0x0013c3, length: 48 },
  { name: 'pre-0x0158xx condition candidate', addr: 0x001988, length: 32 },
];

const targetSet = new Set(TARGETS.map((t) => t.addr));

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function u24(rom, offset) {
  if (offset + 2 >= rom.length) return null;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function bytesAt(rom, offset, length) {
  return Array.from(rom.subarray(offset, Math.min(offset + length, rom.length)))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function decodeOne(rom, pc) {
  const op = rom[pc];
  const op2 = pc + 1 < rom.length ? rom[pc + 1] : undefined;
  const next = (n) => bytesAt(rom, pc, n);
  const rel = (mnemonic, size = 2) => {
    const off = signed8(rom[pc + 1] ?? 0);
    const target = (pc + size + off) & 0xffffff;
    return { size, text: `${mnemonic} ${hex(target)} (${off >= 0 ? '+' : ''}${off})`, branch: { kind: mnemonic, target, relative: true } };
  };
  const abs24 = (mnemonic) => {
    const target = u24(rom, pc + 1);
    return { size: 4, text: `${mnemonic} ${target == null ? '<truncated>' : hex(target)}`, branch: target == null ? null : { kind: mnemonic, target, relative: false } };
  };
  const imm24 = (mnemonic, reg) => {
    const value = u24(rom, pc + 1);
    return { size: 4, text: `${mnemonic} ${reg},${value == null ? '<truncated>' : hex(value)}` };
  };
  const imm8 = (mnemonic) => ({ size: 2, text: `${mnemonic} ${hex(rom[pc + 1] ?? 0, 2)}` });

  switch (op) {
    case 0x00: return { size: 1, text: 'NOP' };
    case 0x01: return imm24('LD', 'BC');
    case 0x02: return { size: 1, text: 'LD (BC),A' };
    case 0x03: return { size: 1, text: 'INC BC' };
    case 0x04: return { size: 1, text: 'INC B' };
    case 0x05: return { size: 1, text: 'DEC B' };
    case 0x06: return imm8('LD B,');
    case 0x0a: return { size: 1, text: 'LD A,(BC)' };
    case 0x0b: return { size: 1, text: 'DEC BC' };
    case 0x0c: return { size: 1, text: 'INC C' };
    case 0x0d: return { size: 1, text: 'DEC C' };
    case 0x0e: return imm8('LD C,');
    case 0x10: return rel('DJNZ');
    case 0x11: return imm24('LD', 'DE');
    case 0x12: return { size: 1, text: 'LD (DE),A' };
    case 0x13: return { size: 1, text: 'INC DE' };
    case 0x18: return rel('JR');
    case 0x19: return { size: 1, text: 'ADD HL,DE' };
    case 0x1a: return { size: 1, text: 'LD A,(DE)' };
    case 0x1b: return { size: 1, text: 'DEC DE' };
    case 0x20: return rel('JR NZ');
    case 0x21: return imm24('LD', 'HL');
    case 0x22: return imm24('LD', '(addr)');
    case 0x23: return { size: 1, text: 'INC HL' };
    case 0x28: return rel('JR Z');
    case 0x2a: return imm24('LD HL,', '(addr)');
    case 0x2b: return { size: 1, text: 'DEC HL' };
    case 0x2c: return { size: 1, text: 'INC L' };
    case 0x2d: return { size: 1, text: 'DEC L' };
    case 0x31: return imm24('LD', 'SP');
    case 0x32: return imm24('LD', '(addr),A');
    case 0x36: return imm8('LD (HL),');
    case 0x3a: return imm24('LD A,', '(addr)');
    case 0x3c: return { size: 1, text: 'INC A' };
    case 0x3d: return { size: 1, text: 'DEC A' };
    case 0x3e: return imm8('LD A,');
    case 0x77: return { size: 1, text: 'LD (HL),A' };
    case 0x7e: return { size: 1, text: 'LD A,(HL)' };
    case 0xaf: return { size: 1, text: 'XOR A' };
    case 0xb7: return { size: 1, text: 'OR A' };
    case 0xc0: return { size: 1, text: 'RET NZ', ret: true };
    case 0xc3: return abs24('JP');
    case 0xc8: return { size: 1, text: 'RET Z', ret: true };
    case 0xc9: return { size: 1, text: 'RET', ret: true };
    case 0xcd: return abs24('CALL');
    case 0xd0: return { size: 1, text: 'RET NC', ret: true };
    case 0xd8: return { size: 1, text: 'RET C', ret: true };
    case 0xe5: return { size: 1, text: 'PUSH HL' };
    case 0xe9: return { size: 1, text: 'JP (HL)', branch: { kind: 'JP (HL)', target: null, relative: false } };
    case 0xeb: return { size: 1, text: 'EX DE,HL' };
    case 0xf1: return { size: 1, text: 'POP AF' };
    case 0xf5: return { size: 1, text: 'PUSH AF' };
    case 0xfe: return imm8('CP A,');
    case 0xed:
      if (op2 === 0xb0) return { size: 2, text: 'LDIR' };
      if (op2 === 0xb8) return { size: 2, text: 'LDDR' };
      return { size: 2, text: `ED ${hex(op2 ?? 0, 2)}` };
    default:
      return { size: 1, text: `DB ${hex(op, 2)}` };
  }
}

function disassemble(rom, start, length) {
  const end = Math.min(start + length, rom.length);
  const rows = [];
  const branches = [];
  for (let pc = start; pc < end;) {
    const decoded = decodeOne(rom, pc);
    const raw = bytesAt(rom, pc, decoded.size);
    rows.push({ pc, raw, ...decoded });
    if (decoded.branch) branches.push({ from: pc, ...decoded.branch });
    pc += decoded.size || 1;
  }
  return { rows, branches };
}

function classifyWindow(result, start, length) {
  const calls = result.branches.filter((b) => b.kind === 'CALL');
  const jumps = result.branches.filter((b) => b.kind.startsWith('JP') || b.kind.startsWith('JR') || b.kind === 'DJNZ');
  const backward = jumps.filter((b) => b.target != null && b.target < b.from && b.target >= start - 0x40);
  const crossTargetCalls = calls.filter((b) => targetSet.has(b.target));
  const nearbyBackJumps = backward.map((b) => `${b.kind} from ${hex(b.from)} to ${hex(b.target)}`);
  const tableHints = result.rows.filter((r) => /\bINC HL\b|\bINC DE\b|\bDEC HL\b|\bDEC DE\b|\bLDIR\b|\bLDDR\b/.test(r.text)).map((r) => `${hex(r.pc)} ${r.text}`);
  const compareHints = result.rows.filter((r) => /\bCP A,|\bOR A\b|\bXOR A\b|\bRET Z\b|\bRET NZ\b|\bJR Z\b|\bJR NZ\b/.test(r.text)).map((r) => `${hex(r.pc)} ${r.text}`);
  return {
    calls,
    jumps,
    crossTargetCalls,
    backward,
    summary: [
      crossTargetCalls.length ? `Calls another focus target: ${crossTargetCalls.map((b) => hex(b.target)).join(', ')}.` : 'No direct CALL to another focus target in this decoded window.',
      nearbyBackJumps.length ? `Loop-like backward branch(es): ${nearbyBackJumps.join('; ')}.` : 'No backward JR/DJNZ loop detected inside this window.',
      tableHints.length ? `Pointer/block-operation hints: ${tableHints.join('; ')}.` : 'No obvious pointer increment/decrement or LDIR/LDDR hint in this short window.',
      compareHints.length ? `Condition/test hints: ${compareHints.join('; ')}.` : 'No obvious CP/flag-return condition hint in this short window.',
    ],
  };
}

function render(rom) {
  const lines = [];
  lines.push('# Phase 604: 0x02AF0F / 0x002696 Loop Decode');
  lines.push('');
  lines.push(`ROM: \`${ROM_PATH}\` (${rom.length} bytes)`);
  lines.push('');
  lines.push('This probe disassembles short eZ80 ADL windows at the five addresses from the wipe call-chain trace. It uses a focused decoder for branch, immediate, compare, return, pointer, and block-transfer opcodes needed for loop triage; unknown bytes are emitted as `DB` so the raw stream remains visible.');
  lines.push('');

  const analyses = new Map();
  for (const target of TARGETS) {
    const result = disassemble(rom, target.addr, target.length);
    const classification = classifyWindow(result, target.addr, target.length);
    analyses.set(target.addr, { target, result, classification });
    lines.push(`## ${hex(target.addr)} - ${target.name}`);
    lines.push('');
    lines.push('| Address | Bytes | Instruction |');
    lines.push('|---|---|---|');
    for (const row of result.rows) {
      lines.push(`| ${hex(row.pc)} | \`${row.raw}\` | \`${row.text}\` |`);
    }
    lines.push('');
    lines.push('Findings:');
    for (const item of classification.summary) lines.push(`- ${item}`);
    if (classification.calls.length) {
      lines.push(`- CALL targets: ${classification.calls.map((b) => `${hex(b.target)} from ${hex(b.from)}`).join(', ')}.`);
    }
    if (classification.jumps.length) {
      lines.push(`- JP/JR/DJNZ targets: ${classification.jumps.map((b) => `${b.kind} ${b.target == null ? '<dynamic>' : hex(b.target)} from ${hex(b.from)}`).join(', ')}.`);
    }
    lines.push('');
  }

  const a = analyses.get(0x02af0f).classification.crossTargetCalls.map((b) => b.target);
  const b = analyses.get(0x002696).classification.crossTargetCalls.map((br) => br.target);
  lines.push('## Connection Check');
  lines.push('');
  if (a.includes(0x002696)) {
    lines.push('- `0x02AF0F` directly CALLs `0x002696` in the decoded window, supporting the interpretation that `0x02AF0F` is loop control and `0x002696` is loop body/helper.');
  } else {
    lines.push('- `0x02AF0F` does not directly CALL `0x002696` within the decoded 64-byte window.');
  }
  if (b.includes(0x02af0f)) {
    lines.push('- `0x002696` directly CALLs `0x02AF0F` in the decoded window, supporting mutual recursion/control transfer.');
  } else {
    lines.push('- `0x002696` does not directly CALL `0x02AF0F` within the decoded 64-byte window.');
  }
  lines.push('- If neither direct edge is present, the 14-frame pattern is likely produced by a caller above these windows alternating between the two helpers, or by an indirect/dynamic dispatch not represented as `CD xx xx xx` in these slices.');
  lines.push('');
  lines.push('## Next Use');
  lines.push('');
  lines.push('Run with:');
  lines.push('');
  lines.push('```bash');
  lines.push('node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase604-loop-decode.mjs');
  lines.push('```');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

const rom = fs.readFileSync(ROM_PATH);
if (rom.length !== 4 * 1024 * 1024) {
  console.warn(`warning: expected 4MB ROM, got ${rom.length} bytes`);
}

const report = render(rom);
fs.writeFileSync(REPORT_PATH, report);
console.log(report);
