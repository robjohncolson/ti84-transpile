#!/usr/bin/env node
// Phase 413: decode 0x014E81 from raw ROM bytes.
// - Reads ROM.rom relative to this script.
// - Disassembles 0x014E81 until RET.
// - Scans direct CALL/JP references to 0x014E81.
// - Prints structured JSON and refreshes the markdown report.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase413-decode-014E81-report.md');

const ROM = fs.readFileSync(ROM_PATH);

const FUNC_START = 0x014e81;
const SIBLING_START = 0x014ef8;
const CALL_PATTERN = [0xcd, 0x81, 0x4e, 0x01];
const JP_PATTERN = [0xc3, 0x81, 0x4e, 0x01];

const KNOWN_RAM = new Map([
  [0xd14077, 'D14077 arm/init latch'],
  [0xd1440e, 'D1440E installer lock'],
  [0xd1440f, 'D1440F delivery status'],
  [0xd17779, 'D17779 lifecycle flag'],
  [0xd1777a, 'D1777A paired lifecycle flag'],
  [0xd176c9, 'D176C9 lifecycle flag'],
  [0xd176ca, 'D176CA paired lifecycle flag'],
]);

const PORT_NOTES = new Map([
  [0x5004, 'interrupt controller enable-mask byte 0'],
  [0x7030, 'GPIO/timer control port noted in prior USB/key-path work'],
]);

const CALLER_NOTES = new Map([
  [0x0004f4, 'exported ROM vector: JP 0x014E81'],
  [0x008d8e, 'teardown call followed by a short branch into a shared epilogue'],
  [0x00925c, 'branch arm of a larger wrapper that skips over a 0x014FA0 path'],
  [0x009274, 'parallel branch arm of the same wrapper family'],
  [0x00940e, 'teardown call followed by a short branch into a shared epilogue'],
  [0x00b865, 'conditional teardown when the prior helper leaves A == 0'],
  [0x0131dd, 'teardown before a later 0x313D port sequence'],
  [0x014f97, 'local wrapper: CALL 0x014E81; CALL 0x014EF8; RET'],
]);

const SPECIAL_NOTES = new Map([
  [0x014e81, 'capture current interrupt state via LD A,I before DI'],
  [0x014e8a, 'if D14077 is already zero, skip all teardown work'],
  [0x014e92, 'clear bit 3 in the port-0x5004 enable mask'],
  [0x014ea1, 'only flip D1440E/D1440F if the installer lock is active'],
  [0x014eb3, 'secondary lifecycle flag pair: clear low flag, set high flag'],
  [0x014ec5, 'third lifecycle flag pair: clear low flag, set high flag'],
  [0x014edd, 'AND 0x3F clears bits 6 and 7 before writing back to port 0x7030'],
  [0x014eed, 'mark the arm/init latch inactive'],
  [0x014ef2, 'restore interrupts only if they were enabled on entry'],
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

function formatContextBytes(site, before = 12, after = 20) {
  const start = Math.max(0, site - before);
  const end = Math.min(ROM.length, site + after);
  return bytesAt(start, end - start);
}

function decodeBitOp(op) {
  const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][op & 7];
  const bit = (op >> 3) & 7;
  const group = (op >> 6) & 3;
  if (group === 1) return `BIT ${bit},${reg}`;
  if (group === 2) return `RES ${bit},${reg}`;
  if (group === 3) return `SET ${bit},${reg}`;
  return `CB ${op.toString(16).padStart(2, '0').toUpperCase()}`;
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
    return { pc, len: 2, text: decodeBitOp(ROM[pc + 1]) };
  }

  switch (b0) {
    case 0x01: {
      const value = read24LE(ROM, pc + 1);
      return { pc, len: 4, text: `LD BC,${hex(value)}`, setsBC: value };
    }
    case 0x20: {
      const target = pc + 2 + signed8(ROM[pc + 1]);
      return { pc, len: 2, text: `JR NZ,${hex(target)}`, branch: { kind: 'JR NZ', target } };
    }
    case 0x28: {
      const target = pc + 2 + signed8(ROM[pc + 1]);
      return { pc, len: 2, text: `JR Z,${hex(target)}`, branch: { kind: 'JR Z', target } };
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
    case 0xc9:
      return { pc, len: 1, text: 'RET', terminal: true };
    case 0xcf:
      return { pc, len: 1, text: 'RST 08h' };
    case 0xcd: {
      const target = read24LE(ROM, pc + 1);
      return { pc, len: 4, text: `CALL ${hex(target)}`, call: target };
    }
    case 0xe2: {
      const target = read24LE(ROM, pc + 1);
      return { pc, len: 4, text: `JP PO,${hex(target)}`, branch: { kind: 'JP PO', target } };
    }
    case 0xe6:
      return { pc, len: 2, text: `AND ${hexByte(ROM[pc + 1])}` };
    case 0xf1:
      return { pc, len: 1, text: 'POP AF' };
    case 0xf3:
      return { pc, len: 1, text: 'DI' };
    case 0xf5:
      return { pc, len: 1, text: 'PUSH AF' };
    case 0xfb:
      return { pc, len: 1, text: 'EI' };
    case 0xfe:
      return { pc, len: 2, text: `CP ${hexByte(ROM[pc + 1])}` };
    default:
      return { pc, len: 1, text: `DB ${hexByte(b0)}` };
  }
}

function disassembleLinear(start) {
  const rows = [];
  const ramAccesses = [];
  const portAccesses = [];
  const callTargets = [];
  const controlFlow = [];
  let pc = start;
  let currentBC = null;

  while (pc < ROM.length) {
    const insn = decodeAt(pc);
    const bytes = bytesAt(pc, insn.len);
    const notes = [];

    if (typeof insn.setsBC === 'number') {
      currentBC = insn.setsBC;
    }

    if (insn.ram && insn.ram.addr >= 0xd00000) {
      const label = KNOWN_RAM.get(insn.ram.addr) ?? 'direct RAM reference';
      ramAccesses.push({
        pc: insn.pc,
        instruction: insn.text,
        access: insn.ram.access,
        address: hex(insn.ram.addr),
        label,
      });
      notes.push(`${label} ${insn.ram.access.toLowerCase()}`);
    }

    if (insn.io) {
      const port = currentBC == null ? null : currentBC & 0xffff;
      const portHex = port == null ? 'unknown' : hex(port, 4);
      const portNote = port == null ? null : PORT_NOTES.get(port) ?? null;
      portAccesses.push({
        pc: insn.pc,
        instruction: insn.text,
        access: insn.io.op,
        port: portHex,
        note: portNote,
      });
      notes.push(`${insn.io.op} port ${portHex}${portNote ? ` (${portNote})` : ''}`);
    }

    if (insn.call != null) {
      callTargets.push({
        pc: insn.pc,
        instruction: insn.text,
        target: hex(insn.call),
      });
    }

    if (insn.branch) {
      controlFlow.push({
        pc: insn.pc,
        instruction: insn.text,
        kind: insn.branch.kind,
        target: hex(insn.branch.target),
      });
    }

    const special = SPECIAL_NOTES.get(insn.pc);
    if (special) notes.push(special);

    rows.push({
      pc: insn.pc,
      bytes,
      instruction: insn.text,
      notes,
    });

    pc += insn.len;
    if (insn.terminal) break;
  }

  const endPc = rows.at(-1).pc;
  return {
    rows,
    ramAccesses,
    portAccesses,
    callTargets,
    controlFlow,
    endPc,
  };
}

function scanPattern(pattern, type) {
  const sites = [];
  for (let i = 0; i <= ROM.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (ROM[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      sites.push({
        site: i,
        type,
        note: CALLER_NOTES.get(i) ?? null,
        contextBytes: formatContextBytes(i),
      });
    }
  }
  return sites;
}

function analyze() {
  const decoded = disassembleLinear(FUNC_START);
  const callers = [
    ...scanPattern(CALL_PATTERN, 'CALL'),
    ...scanPattern(JP_PATTERN, 'JP'),
  ].sort((a, b) => a.site - b.site);
  const length = decoded.endPc - FUNC_START + 1;

  return {
    generatedAt: new Date().toISOString(),
    target: hex(FUNC_START),
    siblingStart: hex(SIBLING_START),
    romPath: 'TI-84_Plus_CE/ROM.rom',
    reportPath: 'TI-84_Plus_CE/phase413-decode-014E81-report.md',
    functionRange: {
      start: hex(FUNC_START),
      end: hex(decoded.endPc),
      lengthBytes: length,
    },
    summary: [
      'Returns immediately when D14077 is already zero, so the routine is guarded by the arm/init latch.',
      'Touches only two hardware ports directly: 0x5004 (clear bit 3) and 0x7030 (AND 0x3F, clearing bits 6-7).',
      'Direct RAM traffic is the teardown state itself: D14077, D1440E/D1440F, D17779/D1777A, and D176C9/D176CA.',
      'No direct CALL instructions appear inside 0x014E81.',
      'The entry/exit LD A,I / PUSH AF / DI ... POP AF / JP PO / EI / RET pattern preserves the caller interrupt-enable state.',
    ],
    lifecycle: [
      '0x014EF8 is the hardware arm/setup partner: it sets bit 3 on port 0x5004, sets bit 6 on port 0x7030, and stores D14077 = 1.',
      '0x014E3F is the notification installer wrapper traced in phase 411: it calls 0x014EF8 and manages D1440E/D1440F around the setup path.',
      '0x014E81 is the opposite half: it only runs when D14077 is non-zero, clears the relevant port bits, clears D14077, and advances three RAM flag handshakes into their completion state.',
      '0x014F97 is a local wrapper that calls 0x014E81 and then 0x014EF8 back-to-back, showing that the ROM sometimes performs an explicit re-arm cycle.',
    ],
    rawBytes: rawDump(FUNC_START, length),
    disassembly: decoded.rows.map((row) => ({
      pc: hex(row.pc),
      bytes: row.bytes,
      instruction: row.instruction,
      notes: row.notes,
    })),
    portAccesses: decoded.portAccesses,
    ramAccesses: decoded.ramAccesses,
    callTargets: decoded.callTargets,
    controlFlow: decoded.controlFlow,
    callers: callers.map((caller) => ({
      site: hex(caller.site),
      type: caller.type,
      note: caller.note,
      contextBytes: caller.contextBytes,
    })),
    absences: [
      'No direct calls are made from inside 0x014E81.',
      'No direct accesses to ports 0x5008, 0x500C, or the 0x7020-0x702F helper block occur here.',
    ],
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Phase 413: Decode of 0x014E81');
  lines.push('');
  lines.push(`Date: ${report.generatedAt}`);
  lines.push(`Target: ${report.target}`);
  lines.push(`ROM: ${report.romPath}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  for (const item of report.summary) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Raw Bytes');
  lines.push('');
  lines.push('```text');
  for (const line of report.rawBytes) {
    lines.push(line);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Disassembly');
  lines.push('');
  lines.push('```text');
  for (const row of report.disassembly) {
    const note = row.notes.length ? ` ; ${row.notes.join(' ; ')}` : '';
    lines.push(`${row.pc}: ${row.bytes.padEnd(24, ' ')} ${row.instruction}${note}`);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Direct Port I/O');
  lines.push('');
  lines.push('| PC | Instruction | Access | Port | Note |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const item of report.portAccesses) {
    lines.push(`| ${hex(item.pc)} | \`${item.instruction}\` | ${item.access} | ${item.port} | ${item.note ?? '-'} |`);
  }
  lines.push('');
  lines.push('## Direct RAM Accesses');
  lines.push('');
  lines.push('| PC | Instruction | Access | Address | Label |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const item of report.ramAccesses) {
    lines.push(`| ${hex(item.pc)} | \`${item.instruction}\` | ${item.access} | ${item.address} | ${item.label} |`);
  }
  lines.push('');
  lines.push('## Control Flow');
  lines.push('');
  lines.push('| PC | Instruction | Target |');
  lines.push('| --- | --- | --- |');
  for (const item of report.controlFlow) {
    lines.push(`| ${hex(item.pc)} | \`${item.instruction}\` | ${item.target} |`);
  }
  lines.push('');
  lines.push('## Direct CALL Targets');
  lines.push('');
  if (report.callTargets.length === 0) {
    lines.push('- None. 0x014E81 is a leaf routine.');
  } else {
    for (const item of report.callTargets) {
      lines.push(`- ${hex(item.pc)} -> ${item.target}`);
    }
  }
  lines.push('');
  lines.push('## Direct Caller Scan');
  lines.push('');
  lines.push('Exact-byte scans used:');
  lines.push('- `CALL 0x014E81 = CD 81 4E 01`');
  lines.push('- `JP   0x014E81 = C3 81 4E 01`');
  lines.push('');
  lines.push('| Site | Type | Note | Context Bytes |');
  lines.push('| --- | --- | --- | --- |');
  for (const caller of report.callers) {
    lines.push(`| ${caller.site} | ${caller.type} | ${caller.note ?? '-'} | \`${caller.contextBytes}\` |`);
  }
  lines.push('');
  lines.push('## Lifecycle Interpretation');
  lines.push('');
  for (const item of report.lifecycle) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('## Notable Absences');
  lines.push('');
  for (const item of report.absences) {
    lines.push(`- ${item}`);
  }
  lines.push('');
  lines.push('*Generated by probe-phase413-decode-014E81.mjs*');
  lines.push('');
  return lines.join('\n');
}

const report = analyze();
fs.writeFileSync(REPORT_PATH, buildMarkdown(report));
console.log(JSON.stringify(report, null, 2));
