#!/usr/bin/env node
// Phase 412: trace 0x014EF8 from raw ROM bytes.
// - Reads ROM.rom relative to this script.
// - Disassembles 0x014EF8 until RET.
// - Scans direct CALL/JP references and the 0x020104-0x02230C JP table.
// - Writes a markdown report alongside console output.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase412-trace-014EF8-report.md');

const ROM = fs.readFileSync(ROM_PATH);

const FUNC_START = 0x014ef8;
const SIBLING_START = 0x014e81;
const RAW_DUMP_LEN = 0xa0;
const JP_TABLE_START = 0x020104;
const JP_TABLE_END = 0x02230c;

const KNOWN_RAM = new Map([
  [0xd177b7, 'D177B7 sentinel'],
  [0xd1440e, 'D1440E lock'],
  [0xd1440f, 'D1440F delivery status'],
  [0xd14073, 'D14073 enabled flag'],
  [0xd14084, 'D14084 busy flag'],
  [0xd14408, 'D14408 block pointer'],
  [0xd1440b, 'D1440B installer-private save'],
  [0xd14077, 'D14077 arm/init latch'],
  [0xd14038, 'D14038 source state word'],
]);

const PORT_NOTES = new Map([
  [0x5008, 'interrupt controller acknowledge byte 0'],
  [0x5004, 'interrupt controller enable-mask byte 0'],
  [0x500c, 'interrupt controller latch-mode byte 0'],
  [0x7030, 'GPIO/timer control port noted in prior USB/key-path work'],
]);

const CALL_NOTES = new Map([
  [0x007121, 'writes two 16-bit words to port block 0x7020-0x7023'],
  [0x007151, 'writes two 16-bit words to port block 0x7024-0x7027'],
  [0x007181, 'writes two 16-bit words to port block 0x7028-0x702b'],
  [0x0071b1, 'writes two 16-bit words to port block 0x702c-0x702f'],
]);

const DIRECT_CALLER_NOTES = new Map([
  [0x0004f8, 'exported ROM vector: JP 0x014EF8'],
  [0x00fc95, 'runtime user: arms 0x014EF8 before port 0x3082 / 0x3010 bit-clears'],
  [0x00fd5b, 'runtime user: after reading D177B8, skips arm only when payload == 0xFF'],
  [0x014e4c, 'called from 0x014E3F, the notification installer traced in phase 411'],
  [0x014f9b, 'local wrapper: CALL 0x014E81; CALL 0x014EF8; RET'],
]);

const SPECIAL_NOTES = new Map([
  [0x014ef8, 'read one-byte arm/init latch'],
  [0x014efd, 'already-armed fast path'],
  [0x014f07, 'write one-hot 0x08 acknowledge to port 0x5008'],
  [0x014f1a, 'set bit 3 before writing back to port 0x5004'],
  [0x014f2f, 'set bit 3 before writing back to port 0x500C'],
  [0x014f42, 'clear D14038 before 0x014E3F later copies it into D1440B'],
  [0x014f4d, 'program port block 0x7020 using pushed args 0 and 0xC000'],
  [0x014f5d, 'program port block 0x7024 using pushed args 0 and 0xC000'],
  [0x014f69, 'program port block 0x7028 using pushed args 0 and 0'],
  [0x014f75, 'program port block 0x702C using pushed args 0 and 0'],
  [0x014f7b, 'SIS prefix forces a 16-bit immediate load of BC=0x7030'],
  [0x014f81, 'set bit 6 before writing back to port 0x7030'],
  [0x014f92, 'mark arm/init latch as active'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${(value & 0xff).toString(16).padStart(2, '0')}`;
}

function read24LE(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function bytesAt(off, len) {
  return Array.from(ROM.slice(off, off + len), (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

function rawDump(start, len) {
  const lines = [];
  for (let off = 0; off < len; off += 16) {
    const pc = start + off;
    lines.push(`${hex(pc)}: ${bytesAt(pc, Math.min(16, len - off))}`);
  }
  return lines;
}

function knownRamName(addr) {
  return KNOWN_RAM.get(addr) ?? null;
}

function decodeAt(pc) {
  const b0 = ROM[pc];

  if (b0 === 0x40 && ROM[pc + 1] === 0x01) {
    const value = ROM[pc + 2] | (ROM[pc + 3] << 8);
    return {
      pc,
      len: 4,
      text: `SIS LD BC,${hex(value, 4)}`,
      setsBC: value,
    };
  }

  if (b0 === 0xed) {
    const b1 = ROM[pc + 1];
    switch (b1) {
      case 0x43: {
        const addr = read24LE(ROM, pc + 2);
        return { pc, len: 5, text: `LD (${hex(addr)}),BC`, ram: { addr, access: 'WRITE' } };
      }
      case 0x4b: {
        const addr = read24LE(ROM, pc + 2);
        return { pc, len: 5, text: `LD BC,(${hex(addr)})`, ram: { addr, access: 'READ' }, setsBC: 'memory' };
      }
      case 0x57:
        return { pc, len: 2, text: 'LD A,I' };
      case 0x78:
        return { pc, len: 2, text: 'IN A,(C)', io: { op: 'IN' } };
      case 0x79:
        return { pc, len: 2, text: 'OUT (C),A', io: { op: 'OUT' } };
      default:
        return { pc, len: 2, text: `ED ${ROM[pc + 1].toString(16).padStart(2, '0').toUpperCase()}` };
    }
  }

  if (b0 === 0xcb) {
    const op = ROM[pc + 1];
    const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
    const bit = (op >> 3) & 7;
    const group = (op >> 6) & 3;
    let text = `CB ${ROM[pc + 1].toString(16).padStart(2, '0').toUpperCase()}`;
    if (group === 1) text = `BIT ${bit},${reg}`;
    if (group === 2) text = `RES ${bit},${reg}`;
    if (group === 3) text = `SET ${bit},${reg}`;
    return { pc, len: 2, text };
  }

  switch (b0) {
    case 0x01: {
      const value = read24LE(ROM, pc + 1);
      return { pc, len: 4, text: `LD BC,${hex(value)}`, setsBC: value };
    }
    case 0x20: {
      const target = pc + 2 + signed8(ROM[pc + 1]);
      return { pc, len: 2, text: `JR NZ,${hex(target)}` };
    }
    case 0x28: {
      const target = pc + 2 + signed8(ROM[pc + 1]);
      return { pc, len: 2, text: `JR Z,${hex(target)}` };
    }
    case 0x32: {
      const addr = read24LE(ROM, pc + 1);
      return { pc, len: 4, text: `LD (${hex(addr)}),A`, ram: { addr, access: 'WRITE' } };
    }
    case 0x3a: {
      const addr = read24LE(ROM, pc + 1);
      return { pc, len: 4, text: `LD A,(${hex(addr)})`, ram: { addr, access: 'READ' } };
    }
    case 0x3e:
      return { pc, len: 2, text: `LD A,${hexByte(ROM[pc + 1])}` };
    case 0x78:
      return { pc, len: 1, text: 'LD A,B' };
    case 0x79:
      return { pc, len: 1, text: 'LD A,C' };
    case 0xaf:
      return { pc, len: 1, text: 'XOR A' };
    case 0xb7:
      return { pc, len: 1, text: 'OR A' };
    case 0xc1:
      return { pc, len: 1, text: 'POP BC', clearsBC: true };
    case 0xc2: {
      const target = read24LE(ROM, pc + 1);
      return { pc, len: 4, text: `JP NZ,${hex(target)}` };
    }
    case 0xc5:
      return { pc, len: 1, text: 'PUSH BC' };
    case 0xc9:
      return { pc, len: 1, text: 'RET', terminal: true };
    case 0xcd: {
      const target = read24LE(ROM, pc + 1);
      return { pc, len: 4, text: `CALL ${hex(target)}`, call: target };
    }
    case 0xcf:
      return { pc, len: 1, text: 'RST 08h' };
    case 0xe2: {
      const target = read24LE(ROM, pc + 1);
      return { pc, len: 4, text: `JP PO,${hex(target)}` };
    }
    case 0xe6:
      return { pc, len: 2, text: `AND ${hexByte(ROM[pc + 1])}` };
    case 0xf1:
      return { pc, len: 1, text: 'POP AF' };
    case 0xf3:
      return { pc, len: 1, text: 'DI' };
    case 0xf5:
      return { pc, len: 1, text: 'PUSH AF' };
    case 0xf6:
      return { pc, len: 2, text: `OR ${hexByte(ROM[pc + 1])}` };
    case 0xfb:
      return { pc, len: 1, text: 'EI' };
    case 0xfe:
      return { pc, len: 2, text: `CP ${hexByte(ROM[pc + 1])}` };
    default:
      return { pc, len: 1, text: `DB ${hexByte(b0)}` };
  }
}

function disassembleLinear(start) {
  const lines = [];
  let pc = start;
  let currentBC = null;

  while (pc < ROM.length) {
    const insn = decodeAt(pc);
    const bytes = bytesAt(pc, insn.len);
    const notes = [];

    if (insn.ram) {
      const name = knownRamName(insn.ram.addr);
      if (name) notes.push(`${name} ${insn.ram.access.toLowerCase()}`);
      else notes.push(`RAM ${insn.ram.access.toLowerCase()} ${hex(insn.ram.addr)}`);
    }

    if (insn.io && currentBC != null) {
      const port = currentBC & 0xffff;
      const note = PORT_NOTES.get(port);
      notes.push(`${insn.io.op} port ${hex(port, 4)}${note ? ` (${note})` : ''}`);
    }

    if (insn.call) {
      const note = CALL_NOTES.get(insn.call);
      if (note) notes.push(note);
    }

    const special = SPECIAL_NOTES.get(insn.pc);
    if (special) notes.push(special);

    lines.push({
      pc,
      bytes,
      text: insn.text,
      notes,
      ram: insn.ram ?? null,
      call: insn.call ?? null,
      ioPort: insn.io && currentBC != null ? (currentBC & 0xffff) : null,
    });

    if (typeof insn.setsBC === 'number') currentBC = insn.setsBC;
    else if (insn.setsBC === 'memory') currentBC = null;
    else if (insn.clearsBC) currentBC = null;

    pc += insn.len;
    if (insn.terminal) break;
  }

  return lines;
}

function findPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= ROM.length - pattern.length; i++) {
    let matched = true;
    for (let j = 0; j < pattern.length; j++) {
      if (ROM[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }
  return hits;
}

function summarizeCaller(addr, type) {
  const contextStart = Math.max(0, addr - 8);
  const context = bytesAt(contextStart, 20);
  return {
    addr,
    type,
    note: DIRECT_CALLER_NOTES.get(addr) ?? '',
    context,
  };
}

function scanJumpTable(target) {
  const matches = [];
  for (let pc = JP_TABLE_START; pc + 3 < JP_TABLE_END; pc += 4) {
    const entryTarget = read24LE(ROM, pc);
    const op = ROM[pc + 3];
    if (entryTarget === target) {
      matches.push({
        pc,
        slot: (pc - JP_TABLE_START) >>> 2,
        op,
        bytes: bytesAt(pc, 4),
      });
    }
  }
  return matches;
}

function uniqueSortedDirectRam(lines) {
  const seen = new Map();
  for (const line of lines) {
    if (!line.ram) continue;
    const key = `${line.ram.access}:${line.ram.addr}`;
    if (!seen.has(key)) seen.set(key, { addr: line.ram.addr, access: line.ram.access, firstPc: line.pc });
  }
  return Array.from(seen.values()).sort((a, b) => a.firstPc - b.firstPc);
}

function uniqueSortedCalls(lines) {
  const seen = new Map();
  for (const line of lines) {
    if (!line.call) continue;
    if (!seen.has(line.call)) seen.set(line.call, { target: line.call, firstPc: line.pc });
  }
  return Array.from(seen.values()).sort((a, b) => a.firstPc - b.firstPc);
}

function uniqueSortedPorts(lines) {
  const seen = new Map();
  for (const line of lines) {
    if (line.ioPort == null) continue;
    if (!seen.has(line.ioPort)) seen.set(line.ioPort, { port: line.ioPort, firstPc: line.pc });
  }
  return Array.from(seen.values()).sort((a, b) => a.firstPc - b.firstPc);
}

function buildReport(functionLines, siblingLines, callers, jpMatches) {
  const directRam = uniqueSortedDirectRam(functionLines);
  const directCalls = uniqueSortedCalls(functionLines);
  const ports = uniqueSortedPorts(functionLines);

  const touchedRequested = directRam.filter((entry) =>
    [
      0xd177b7,
      0xd1440e,
      0xd1440f,
      0xd14073,
      0xd14084,
      0xd14408,
      0xd1440b,
    ].includes(entry.addr),
  );

  const lines = [];
  lines.push('# Phase 412: Trace of 0x014EF8');
  lines.push('');
  lines.push('Date: 2026-05-22');
  lines.push('Target: 0x014EF8');
  lines.push('ROM: TI-84_Plus_CE/ROM.rom');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('- 0x014EF8 is 159 bytes long (0x014EF8-0x014F96) and returns early if D14077 is already non-zero.');
  lines.push('- It directly touches only D14077 and D14038. None of D177B7, D1440E, D1440F, D14073, D14084, D14408, or D1440B are accessed directly inside this function.');
  lines.push('- It performs hardware I/O on ports 0x5008, 0x5004, 0x500C, and 0x7030, and it calls four helpers that program the 0x7020-0x702F port block.');
  lines.push('- The neighboring routine 0x014E81 clears D14077 and reverses part of this state, so the bytes identify 0x014EF8 as the arm/setup half of the pair, not the teardown half.');
  lines.push('- Indirect effect on known notification RAM: 0x014EF8 clears D14038, and caller 0x014E3F immediately copies D14038 -> D1440B afterward, so D1440B becomes 0 through the caller path.');
  lines.push('');
  lines.push('## Raw Bytes');
  lines.push('');
  lines.push('```text');
  lines.push(...rawDump(FUNC_START, RAW_DUMP_LEN));
  lines.push('```');
  lines.push('');
  lines.push('## Disassembly');
  lines.push('');
  lines.push('```text');
  for (const line of functionLines) {
    const note = line.notes.length ? ` ; ${line.notes.join(' ; ')}` : '';
    lines.push(`${hex(line.pc)}: ${line.bytes.padEnd(20)} ${line.text}${note}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Direct RAM Accesses');
  lines.push('');
  lines.push('| PC | Instruction | Access | Address | Note |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const entry of directRam) {
    const functionLine = functionLines.find((line) => line.pc === entry.firstPc);
    const label = knownRamName(entry.addr) ?? '';
    lines.push(`| ${hex(entry.firstPc)} | \`${functionLine.text}\` | ${entry.access} | ${hex(entry.addr)} | ${label} |`);
  }
  lines.push('');
  if (touchedRequested.length === 0) {
    lines.push('Requested notification RAM check: no direct references to D177B7, D1440E, D1440F, D14073, D14084, D14408, or D1440B appear in 0x014EF8.');
  } else {
    lines.push('Requested notification RAM check:');
    for (const entry of touchedRequested) {
      lines.push(`- ${knownRamName(entry.addr)} at ${hex(entry.addr)} (${entry.access})`);
    }
  }
  lines.push('');
  lines.push('Indirect notification RAM effect through caller 0x014E3F:');
  lines.push('- 0x014F42 stores BC=0 into D14038.');
  lines.push('- Phase 411 already established that 0x014E3F then executes `LD BC,(0xD14038)` at 0x014E66 and `LD (0xD1440B),BC` at 0x014E6B.');
  lines.push('- Result: the installer path saves 0 into D1440B even though 0x014EF8 never names D1440B directly.');
  lines.push('');
  lines.push('## Direct Caller Scan');
  lines.push('');
  lines.push('Exact-byte scans used:');
  lines.push('- CALL 0x014EF8 = `CD F8 4E 01`');
  lines.push('- JP   0x014EF8 = `C3 F8 4E 01`');
  lines.push('');
  lines.push('| Site | Type | Note | Context Bytes |');
  lines.push('| --- | --- | --- | --- |');
  for (const caller of callers) {
    lines.push(`| ${hex(caller.addr)} | ${caller.type} | ${caller.note || '-'} | \`${caller.context}\` |`);
  }
  lines.push('');
  if (jpMatches.length === 0) {
    lines.push(`Jump table scan (${hex(JP_TABLE_START)}-${hex(JP_TABLE_END)}): no entry points at 0x014EF8.`);
  } else {
    lines.push(`Jump table scan (${hex(JP_TABLE_START)}-${hex(JP_TABLE_END)}):`);
    for (const match of jpMatches) {
      lines.push(`- slot ${match.slot} at ${hex(match.pc)} -> ${match.bytes}`);
    }
  }
  lines.push('');
  lines.push('## Port I/O');
  lines.push('');
  lines.push('| Port | Sites | Access | Note |');
  lines.push('| --- | --- | --- | --- |');
  for (const portEntry of ports) {
    const port = portEntry.port;
    const sites = functionLines.filter((line) => line.ioPort === port).map((line) => hex(line.pc)).join(', ');
    const access = functionLines.filter((line) => line.ioPort === port).map((line) => line.text.startsWith('IN ') ? 'IN' : 'OUT').join(', ');
    lines.push(`| ${hex(port, 4)} | ${sites} | ${access} | ${PORT_NOTES.get(port) ?? '-'} |`);
  }
  lines.push('');
  lines.push('## Subroutine Calls');
  lines.push('');
  lines.push('| Site | Target | Note |');
  lines.push('| --- | --- | --- |');
  for (const entry of directCalls) {
    lines.push(`| ${hex(entry.firstPc)} | ${hex(entry.target)} | ${CALL_NOTES.get(entry.target) ?? '-'} |`);
  }
  lines.push('');
  lines.push('## Why This Looks Like Setup, Not Teardown');
  lines.push('');
  lines.push('0x014EF8 does all of the following before setting D14077=1:');
  lines.push('- acknowledges interrupt-controller byte 0 with 0x08 at port 0x5008');
  lines.push('- sets bit 3 in the interrupt enable mask at port 0x5004');
  lines.push('- sets bit 3 in the latch-mode/control register at port 0x500C');
  lines.push('- programs four adjacent 0x7020-0x702F register groups via 0x007121 / 0x007151 / 0x007181 / 0x0071B1');
  lines.push('- sets bit 6 in port 0x7030');
  lines.push('- latches the one-byte state flag D14077 to 1');
  lines.push('');
  lines.push('The adjacent routine at 0x014E81 shows the opposite shape. Key lines from that sibling are:');
  lines.push('');
  lines.push('```text');
  for (const line of siblingLines) {
    if (
      [
        0x014e85, 0x014e8c, 0x014e92, 0x014ea1, 0x014ea9, 0x014eaf,
        0x014ed7, 0x014edd, 0x014eed,
      ].includes(line.pc)
    ) {
      const note = line.notes.length ? ` ; ${line.notes.join(' ; ')}` : '';
      lines.push(`${hex(line.pc)}: ${line.bytes.padEnd(20)} ${line.text}${note}`);
    }
  }
  lines.push('```');
  lines.push('');
  lines.push('That sibling:');
  lines.push('- returns immediately if D14077 is already zero');
  lines.push('- clears bit 3 on port 0x5004 (`RES 3,A`) instead of setting it');
  lines.push('- clears D14077 back to zero');
  lines.push('- clears D1440E and sets D1440F=1 when the lock/status path is active');
  lines.push('');
  lines.push('Taken together, the ROM bytes point to this lifecycle:');
  lines.push('- 0x014EF8 = hardware arm/setup');
  lines.push('- 0x014E3F = notification installer wrapper that calls 0x014EF8 while managing D1440E/D1440F/D14408/D1440B');
  lines.push('- 0x014E81 = disarm/teardown partner');
  lines.push('');
  lines.push('*Generated by probe-phase412-trace-014EF8.mjs*');
  lines.push('');
  return lines.join('\n');
}

const functionLines = disassembleLinear(FUNC_START);
const siblingLines = disassembleLinear(SIBLING_START);
const callers = [
  ...findPattern([0xcd, 0xf8, 0x4e, 0x01]).map((addr) => summarizeCaller(addr, 'CALL')),
  ...findPattern([0xc3, 0xf8, 0x4e, 0x01]).map((addr) => summarizeCaller(addr, 'JP')),
].sort((a, b) => a.addr - b.addr);
const jpMatches = scanJumpTable(FUNC_START);

const report = buildReport(functionLines, siblingLines, callers, jpMatches);

console.log('Phase 412: trace 0x014EF8');
console.log('');
console.log(report);
fs.writeFileSync(REPORT_PATH, report);
console.log('');
console.log(`Report written to ${REPORT_PATH}`);
