import fs from 'node:fs';
import path from 'node:path';

const baseDir = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const romPath = path.join(baseDir, 'ROM.rom');
const reportPath = path.join(baseDir, 'phase607-decode-08ddxx.md');

const rom = fs.readFileSync(romPath);

const ranges = [
  { name: '0x08DDxx key2-only cluster', start: 0x08dd60, end: 0x08dda0 },
  { name: '0x05CA18 key2-only blocks', start: 0x05ca18, end: 0x05ca2b },
  { name: '0x08E63E key2-only display branch', start: 0x08e63e, end: 0x08e776 },
  { name: '0x08FC15 key2-only block', start: 0x08fc15, end: 0x08fc27 },
  { name: '0x0908F1 key2 stuck context', start: 0x090900, end: 0x090960 },
  { name: '0x091BF2 key2-only block', start: 0x091bf2, end: 0x091bfd },
];

const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const r = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp = ['BC', 'DE', 'HL', 'SP'];
const rp2 = ['BC', 'DE', 'HL', 'AF'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byte(addr) {
  return rom[addr] ?? 0;
}

function u16(addr) {
  return byte(addr) | (byte(addr + 1) << 8);
}

function u24(addr) {
  return byte(addr) | (byte(addr + 1) << 8) | (byte(addr + 2) << 16);
}

function s8(v) {
  return v & 0x80 ? v - 0x100 : v;
}

function rel(addr, off, size) {
  return addr + size + s8(off);
}

function refs(kind, target) {
  return { kind, target };
}

function decodeCB(addr, pfx = '') {
  const op = byte(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const bitOps = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  if (x === 0) return { size: 1, text: `${bitOps[y]} ${pfx}${r[z]}` };
  if (x === 1) return { size: 1, text: `BIT ${y},${pfx}${r[z]}` };
  if (x === 2) return { size: 1, text: `RES ${y},${pfx}${r[z]}` };
  return { size: 1, text: `SET ${y},${pfx}${r[z]}` };
}

function decodeED(addr) {
  const op = byte(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const q = y & 1;
  const p = y >> 1;

  if (op === 0x4b || op === 0x5b || op === 0x6b || op === 0x7b) {
    const target = u24(addr + 1);
    return { size: 4, text: `LD ${rp[p]},(${hex(target, 6)})`, ref: refs('mem', target) };
  }
  if (op === 0x43 || op === 0x53 || op === 0x63 || op === 0x73) {
    const target = u24(addr + 1);
    return { size: 4, text: `LD (${hex(target, 6)}),${rp[p]}`, ref: refs('mem', target) };
  }
  const block = {
    0xa0: 'LDI', 0xa1: 'CPI', 0xa2: 'INI', 0xa3: 'OUTI',
    0xa8: 'LDD', 0xa9: 'CPD', 0xaa: 'IND', 0xab: 'OUTD',
    0xb0: 'LDIR', 0xb1: 'CPIR', 0xb2: 'INIR', 0xb3: 'OTIR',
    0xb8: 'LDDR', 0xb9: 'CPDR', 0xba: 'INDR', 0xbb: 'OTDR',
  };
  if (block[op]) return { size: 1, text: block[op] };
  if (x === 1 && z === 0) return { size: 1, text: `IN ${r[y]},(C)` };
  if (x === 1 && z === 1) return { size: 1, text: `OUT (C),${r[y]}` };
  if (x === 1 && z === 2) return { size: 1, text: `${q ? 'ADC' : 'SBC'} HL,${rp[p]}` };
  if (x === 1 && z === 4) return { size: 1, text: 'NEG' };
  if (x === 1 && z === 5) return { size: 1, text: y === 1 ? 'RETI' : 'RETN' };
  if (x === 1 && z === 6) return { size: 1, text: `IM ${[0, 0, 1, 2, 0, 0, 1, 2][y]}` };
  return { size: 1, text: `ED ${hex(op)}` };
}

function decodeAt(addr) {
  const op = byte(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const q = y & 1;
  const p = y >> 1;

  if (op === 0xcb) {
    const d = decodeCB(addr + 1);
    return { size: 1 + d.size, text: d.text, ref: d.ref };
  }
  if (op === 0xed) {
    const d = decodeED(addr + 1);
    return { size: 1 + d.size, text: d.text, ref: d.ref };
  }

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { size: 1, text: 'NOP' };
      if (y === 1) return { size: 3, text: `EX AF,AF'` };
      if (y === 2) {
        const target = rel(addr, byte(addr + 1), 2);
        return { size: 2, text: `DJNZ ${hex(target, 6)}`, ref: refs('branch', target) };
      }
      if (y === 3) {
        const target = rel(addr, byte(addr + 1), 2);
        return { size: 2, text: `JR ${hex(target, 6)}`, ref: refs('branch', target) };
      }
      const target = rel(addr, byte(addr + 1), 2);
      return { size: 2, text: `JR ${cc[y - 4]},${hex(target, 6)}`, ref: refs('conditional branch', target) };
    }
    if (z === 1) {
      if (q === 0) return { size: 4, text: `LD ${rp[p]},${hex(u24(addr + 1), 6)}` };
      return { size: 1, text: `ADD HL,${rp[p]}` };
    }
    if (z === 2) {
      if (q === 0) {
        if (p === 0) return { size: 1, text: 'LD (BC),A' };
        if (p === 1) return { size: 1, text: 'LD (DE),A' };
        const target = u24(addr + 1);
        return { size: 4, text: p === 2 ? `LD (${hex(target, 6)}),HL` : `LD (${hex(target, 6)}),A`, ref: refs('mem', target) };
      }
      if (p === 0) return { size: 1, text: 'LD A,(BC)' };
      if (p === 1) return { size: 1, text: 'LD A,(DE)' };
      const target = u24(addr + 1);
      return { size: 4, text: p === 2 ? `LD HL,(${hex(target, 6)})` : `LD A,(${hex(target, 6)})`, ref: refs('mem', target) };
    }
    if (z === 3) return { size: 1, text: `${q ? 'DEC' : 'INC'} ${rp[p]}` };
    if (z === 4) return { size: 1, text: `INC ${r[y]}` };
    if (z === 5) return { size: 1, text: `DEC ${r[y]}` };
    if (z === 6) return { size: 2, text: `LD ${r[y]},${hex(byte(addr + 1))}` };
    return { size: 1, text: ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'][y] };
  }

  if (x === 1) {
    if (op === 0x76) return { size: 1, text: 'HALT' };
    return { size: 1, text: `LD ${r[y]},${r[z]}` };
  }

  if (x === 2) return { size: 1, text: `${alu[y]} ${r[z]}` };

  if (z === 0) return { size: 1, text: `RET ${cc[y]}` };
  if (z === 1) return { size: 1, text: q === 0 ? `POP ${rp2[p]}` : ['RET', 'EXX', 'JP (HL)', 'LD SP,HL'][p] };
  if (z === 2) {
    const target = u24(addr + 1);
    return { size: 4, text: `JP ${cc[y]},${hex(target, 6)}`, ref: refs('conditional branch', target) };
  }
  if (z === 3) {
    if (y === 0) {
      const target = u24(addr + 1);
      return { size: 4, text: `JP ${hex(target, 6)}`, ref: refs('jump', target) };
    }
    if (y === 2) {
      const port = byte(addr + 1);
      return { size: 2, text: `OUT (${hex(port)}),A` };
    }
    if (y === 3) {
      const port = byte(addr + 1);
      return { size: 2, text: `IN A,(${hex(port)})` };
    }
    return { size: 1, text: ['CB', 'DD', 'ED', 'FD'][y - 1] ?? `OP ${hex(op)}` };
  }
  if (z === 4) {
    const target = u24(addr + 1);
    return { size: 4, text: `CALL ${cc[y]},${hex(target, 6)}`, ref: refs('conditional call', target) };
  }
  if (z === 5) {
    if (q === 0) return { size: 1, text: `PUSH ${rp2[p]}` };
    if (p === 0) {
      const target = u24(addr + 1);
      return { size: 4, text: `CALL ${hex(target, 6)}`, ref: refs('call', target) };
    }
  }
  if (z === 6) return { size: 2, text: `${alu[y]} ${hex(byte(addr + 1))}` };
  return { size: 1, text: `RST ${hex(y * 8)}` };
}

function disassembleRange(range) {
  const lines = [];
  for (let pc = range.start; pc < range.end;) {
    const ins = decodeAt(pc);
    const size = Math.max(1, ins.size);
    const raw = Array.from(rom.subarray(pc, pc + size), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const ref = ins.ref ? ` ; ${ins.ref.kind}: ${hex(ins.ref.target, 6)}` : '';
    lines.push(`${hex(pc, 6)}  ${raw.padEnd(13)}  ${ins.text}${ref}`);
    pc += size;
  }
  return lines;
}

function scanExact(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let ok = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
  }
  return hits;
}

function scanNeighborhoodForBranches(target, radius = 128) {
  const exact = new Set([...scanExact([0xcd, 0x60, 0xdd, 0x08]), ...scanExact([0xc3, 0x60, 0xdd, 0x08])]);
  const starts = new Set();
  for (const hit of exact) {
    const lo = Math.max(0, hit - radius);
    const hi = Math.min(rom.length - 1, hit + radius);
    for (let addr = lo; addr <= hi; addr++) starts.add(addr);
  }
  if (starts.size === 0) {
    const lo = Math.max(0, target - radius);
    const hi = Math.min(rom.length - 1, target + radius);
    for (let addr = lo; addr <= hi; addr++) starts.add(addr);
  }

  const hits = [];
  for (const addr of [...starts].sort((a, b) => a - b)) {
    const op = byte(addr);
    if ((op === 0x18 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38 || op === 0x10) && rel(addr, byte(addr + 1), 2) === target) {
      hits.push({ addr, text: decodeAt(addr).text });
    }
    if ((op === 0xc2 || op === 0xca || op === 0xd2 || op === 0xda || op === 0xe2 || op === 0xea || op === 0xf2 || op === 0xfa || op === 0xc3) && u24(addr + 1) === target) {
      hits.push({ addr, text: decodeAt(addr).text });
    }
  }
  return hits;
}

function analyze08dd(lines) {
  const refs = lines.filter((line) => /CALL|JP|JR|LD .*\(0x|LD \(0x/.test(line));
  if (refs.length === 0) return 'No control-transfer or absolute memory references were decoded in this cluster.';
  return [
    'The 0x08DDxx cluster is dominated by the following control and memory references:',
    '',
    ...refs.map((line) => `- \`${line}\``),
    '',
    'Interpretation should be tied to the branch targets above: direct exits are routing decisions, while absolute memory loads/stores are likely state or display/OS flag checks.',
  ].join('\n');
}

function analyzeLoop(lines) {
  const loopLines = lines.filter((line) => {
    const m = line.match(/^0x([0-9A-F]{6}).*; .*: 0x([0-9A-F]{6})/);
    return m && Number.parseInt(m[2], 16) <= Number.parseInt(m[1], 16);
  });
  if (loopLines.length === 0) return 'No backward branch was decoded in 0x090900-0x090960. If key2 stalls at 0x090927, inspect fall-through state and any call target immediately before it.';
  return [
    'Backward branches in the 0x090927 context:',
    '',
    ...loopLines.map((line) => `- \`${line}\``),
    '',
    'A backward conditional branch breaks when its named condition becomes false; for example `JR Z` exits when Z clears, and `JR NZ` exits when Z sets. The instruction immediately before the branch normally identifies the compared register, input port, or memory-backed flag.',
  ].join('\n');
}

const decoded = new Map();
for (const range of ranges) decoded.set(range.name, disassembleRange(range));

const calls = scanExact([0xcd, 0x60, 0xdd, 0x08]);
const jumps = scanExact([0xc3, 0x60, 0xdd, 0x08]);
const nearbyBranches = scanNeighborhoodForBranches(0x08dd60);
const loopLines = decoded.get('0x0908F1 key2 stuck context');
const ddLines = decoded.get('0x08DDxx key2-only cluster');

const out = [];
out.push('# Phase 607 Decode: 0x08DDxx Key2-Only Cluster');
out.push('');
out.push(`ROM: \`${path.basename(romPath)}\` (${rom.length} bytes)`);
out.push('');
for (const range of ranges) {
  out.push(`## ${range.name}`);
  out.push('');
  out.push(`Range: ${hex(range.start, 6)}-${hex(range.end, 6)} (end exclusive)`);
  out.push('');
  out.push('```asm');
  out.push(...decoded.get(range.name));
  out.push('```');
  out.push('');
}

out.push('## Caller Analysis For 0x08DD60');
out.push('');
out.push(`Exact CALL pattern \`CD 60 DD 08\`: ${calls.length ? calls.map((a) => hex(a, 6)).join(', ') : 'none found'}`);
out.push(`Exact JP pattern \`C3 60 DD 08\`: ${jumps.length ? jumps.map((a) => hex(a, 6)).join(', ') : 'none found'}`);
out.push('');
if (nearbyBranches.length) {
  out.push('Nearby conditional/direct branches resolving to 0x08DD60:');
  out.push('');
  for (const hit of nearbyBranches) out.push(`- ${hex(hit.addr, 6)}: \`${hit.text}\``);
} else {
  out.push('No JR/JP conditional patterns resolving to 0x08DD60 were found in the scanned neighborhoods.');
}
out.push('');

out.push('## Analysis: 0x08DDxx Cluster');
out.push('');
out.push(analyze08dd(ddLines));
out.push('');
out.push('## Analysis: 0x090927 Loop Context');
out.push('');
out.push(analyzeLoop(loopLines));
out.push('');
out.push('## Notes');
out.push('');
out.push('- Decode is eZ80 ADL-oriented for 24-bit immediate CALL/JP/LD addresses.');
out.push('- DD/FD indexed forms are reported conservatively by prefix when not needed for control-flow analysis.');
out.push('- Confirm semantic names by correlating absolute memory references and branch targets with the session trace.');
out.push('');

fs.writeFileSync(reportPath, `${out.join('\n')}\n`);
console.log(`Wrote ${reportPath}`);
