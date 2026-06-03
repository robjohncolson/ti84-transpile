import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const TARGETS = [
  { name: 'render_try_pipeline_07D1B4', start: 0x07d1b4, minBytes: 300 },
  { name: 'render_try_preflight_099921', start: 0x099921, minBytes: 150 },
];

const KNOWN_CALLS = new Map([
  [0x0a1799, 'text rasterizer candidate'],
  [0x07d583, 'render descriptor/populator candidate'],
  [0x07c8b7, 'BCD/layout calculation candidate'],
  [0x099921, 'TRY-block preflight from 0x099874'],
  [0x07d1b4, 'TRY-block rendering pipeline target'],
]);

const RANGES = [
  { start: 0xd00500, end: 0xd005ff, label: 'D005xx cursor/state' },
  { start: 0xd00800, end: 0xd008ff, label: 'D008xx VRAM/display state' },
  { start: 0xd01000, end: 0xd01fff, label: 'D01xxx descriptor/state' },
  { start: 0xd00000, end: 0xd3ffff, label: 'RAM' },
  { start: 0xe30000, end: 0xe3ffff, label: 'VRAM/mmio candidate' },
];

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const ALU = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const RP = ['BC', 'DE', 'HL', 'SP'];
const RP2 = ['BC', 'DE', 'HL', 'AF'];

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function s8(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function u24(offset) {
  if (offset + 2 >= rom.length) return null;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function u16(offset) {
  if (offset + 1 >= rom.length) return null;
  return rom[offset] | (rom[offset + 1] << 8);
}

function rangeFor(addr) {
  return RANGES.find((range) => addr >= range.start && addr <= range.end);
}

function classifyAddress(addr) {
  const known = KNOWN_CALLS.get(addr);
  const range = rangeFor(addr);
  if (known && range) return `${known}; ${range.label}`;
  if (known) return known;
  if (range) return range.label;
  return '';
}

function noteAddress(kind, addr, meta, detail = '') {
  if (addr == null) return;
  const range = rangeFor(addr);
  const label = classifyAddress(addr);
  const entry = {
    kind,
    addr,
    label,
    detail,
  };
  if (kind === 'call') meta.calls.push(entry);
  else if (kind === 'jump') meta.jumps.push(entry);
  else if (range) meta.ram.push(entry);
}

function prefixedIndex(prefix, pc) {
  const reg = prefix === 0xdd ? 'IX' : 'IY';
  const op = rom[pc + 1];
  let len = 2;
  let text = `${reg} prefix ${hex(op)}`;
  let flow = null;
  const meta = {};

  if (op === 0xcb) {
    const disp = s8(rom[pc + 2]);
    const cb = rom[pc + 3];
    len = 4;
    const bit = (cb >> 3) & 7;
    const group = cb >> 6;
    const target = `(${reg}${disp < 0 ? '-' : '+'}${hex(Math.abs(disp))})`;
    if (group === 1) text = `BIT ${bit},${target}`;
    else if (group === 2) text = `RES ${bit},${target}`;
    else if (group === 3) text = `SET ${bit},${target}`;
    else text = `CB ${hex(cb)} ${target}`;
    return { len, text, flow, meta };
  }

  switch (op) {
    case 0x21:
      len = 4;
      text = `LD ${reg},${hex(u16(pc + 2), 4)} (.S?)`;
      break;
    case 0x22:
      len = 4;
      meta.ramReadWrite = u16(pc + 2);
      text = `LD (${hex(meta.ramReadWrite, 4)}),${reg} (.S?)`;
      break;
    case 0x2a:
      len = 4;
      meta.ramReadWrite = u16(pc + 2);
      text = `LD ${reg},(${hex(meta.ramReadWrite, 4)}) (.S?)`;
      break;
    case 0x34:
    case 0x35:
      len = 3;
      text = `${op === 0x34 ? 'INC' : 'DEC'} (${reg}${signedDisp(pc + 2)})`;
      break;
    case 0x36:
      len = 4;
      text = `LD (${reg}${signedDisp(pc + 2)}),${hex(rom[pc + 3])}`;
      break;
    case 0x46: case 0x4e: case 0x56: case 0x5e: case 0x66: case 0x6e: case 0x7e:
      len = 3;
      text = `LD ${REG8[(op >> 3) & 7]},(${reg}${signedDisp(pc + 2)})`;
      break;
    case 0x70: case 0x71: case 0x72: case 0x73: case 0x74: case 0x75: case 0x77:
      len = 3;
      text = `LD (${reg}${signedDisp(pc + 2)}),${REG8[op & 7]}`;
      break;
    case 0xe5:
      text = `PUSH ${reg}`;
      break;
    case 0xe1:
      text = `POP ${reg}`;
      break;
    case 0xe9:
      text = `JP (${reg})`;
      flow = 'tail';
      break;
    case 0xf9:
      text = `LD SP,${reg}`;
      break;
    default:
      if ((op & 0xc7) === 0x86) {
        len = 3;
        text = `${ALU[(op >> 3) & 7]} (${reg}${signedDisp(pc + 2)})`;
      }
      break;
  }
  return { len, text, flow, meta };
}

function signedDisp(offset) {
  const value = s8(rom[offset]);
  return `${value < 0 ? '-' : '+'}${hex(Math.abs(value))}`;
}

function decodeED(pc) {
  const op = rom[pc + 1];
  const next24 = u24(pc + 2);
  const next16 = u16(pc + 2);
  const meta = {};
  let len = 2;
  let text = `ED ${hex(op)}`;

  switch (op) {
    case 0x4b:
    case 0x5b:
    case 0x6b:
    case 0x7b:
      len = 5;
      text = `LD ${RP[(op >> 4) & 3]},(${hex(next24, 6)})`;
      meta.ramReadWrite = next24;
      break;
    case 0x43:
    case 0x53:
    case 0x63:
    case 0x73:
      len = 5;
      text = `LD (${hex(next24, 6)}),${RP[(op >> 4) & 3]}`;
      meta.ramReadWrite = next24;
      break;
    case 0x44:
      text = 'NEG';
      break;
    case 0x45:
      text = 'RETN';
      break;
    case 0x47:
      text = 'LD I,A';
      break;
    case 0x4f:
      text = 'LD R,A';
      break;
    case 0x57:
      text = 'LD A,I';
      break;
    case 0x5f:
      text = 'LD A,R';
      break;
    case 0x67:
      text = 'RRD';
      break;
    case 0x6f:
      text = 'RLD';
      break;
    case 0xa0:
      text = 'LDI';
      break;
    case 0xa1:
      text = 'CPI';
      break;
    case 0xa8:
      text = 'LDD';
      break;
    case 0xa9:
      text = 'CPD';
      break;
    case 0xb0:
      text = 'LDIR';
      break;
    case 0xb1:
      text = 'CPIR';
      break;
    case 0xb8:
      text = 'LDDR';
      break;
    case 0xb9:
      text = 'CPDR';
      break;
    default:
      if ((op & 0xc7) === 0x40) text = `IN ${REG8[(op >> 3) & 7]},(C)`;
      else if ((op & 0xc7) === 0x41) text = `OUT (C),${REG8[(op >> 3) & 7]}`;
      else if ((op & 0xcf) === 0x42) text = `SBC HL,${RP[(op >> 4) & 3]}`;
      else if ((op & 0xcf) === 0x4a) text = `ADC HL,${RP[(op >> 4) & 3]}`;
      break;
  }

  if (meta.ramReadWrite != null) noteAddress('ram', meta.ramReadWrite, { ram: [] });
  return { len, text, meta };
}

function decodeCB(pc) {
  const op = rom[pc + 1];
  const bit = (op >> 3) & 7;
  const reg = REG8[op & 7];
  const group = op >> 6;
  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
  let text;
  if (group === 0) text = `${rot[bit]} ${reg}`;
  else if (group === 1) text = `BIT ${bit},${reg}`;
  else if (group === 2) text = `RES ${bit},${reg}`;
  else text = `SET ${bit},${reg}`;
  return { len: 2, text };
}

function decode40(pc) {
  const op = rom[pc + 1];
  if (op === 0x21) return { len: 4, text: `LD.SIS HL,${hex(u16(pc + 2), 4)}` };
  if (op === 0x11) return { len: 4, text: `LD.SIS DE,${hex(u16(pc + 2), 4)}` };
  if (op === 0x01) return { len: 4, text: `LD.SIS BC,${hex(u16(pc + 2), 4)}` };
  if (op === 0x2a) return { len: 4, text: `LD.SIS HL,(${hex(u16(pc + 2), 4)})` };
  if (op === 0x22) return { len: 4, text: `LD.SIS (${hex(u16(pc + 2), 4)}),HL` };
  if (op === 0xcd) return { len: 4, text: `CALL.SIS ${hex(u16(pc + 2), 4)}` };
  if (op === 0xc9) return { len: 2, text: 'RET.SIS', flow: 'ret' };
  return { len: 2, text: `.SIS prefix ${hex(op)}` };
}

function decodeOne(pc, meta) {
  const op = rom[pc];
  const nn24 = u24(pc + 1);
  const nn16 = u16(pc + 1);
  let len = 1;
  let text = `DB ${hex(op)}`;
  let flow = null;

  if (op === 0xdd || op === 0xfd) {
    const out = prefixedIndex(op, pc);
    if (out.meta?.ramReadWrite != null) noteAddress('ram', out.meta.ramReadWrite, meta, out.text);
    return out;
  }
  if (op === 0xed) {
    const out = decodeED(pc);
    if (out.meta?.ramReadWrite != null) noteAddress('ram', out.meta.ramReadWrite, meta, out.text);
    return out;
  }
  if (op === 0xcb) return decodeCB(pc);
  if (op === 0x40) return decode40(pc);

  switch (op) {
    case 0x00:
      text = 'NOP';
      break;
    case 0x01: case 0x11: case 0x21: case 0x31:
      len = 4;
      text = `LD ${RP[op >> 4]},${hex(nn24, 6)}`;
      if (rangeFor(nn24)) noteAddress('ram', nn24, meta, text);
      break;
    case 0x02:
      text = 'LD (BC),A';
      break;
    case 0x0a:
      text = 'LD A,(BC)';
      break;
    case 0x12:
      text = 'LD (DE),A';
      break;
    case 0x1a:
      text = 'LD A,(DE)';
      break;
    case 0x22:
      len = 4;
      text = `LD (${hex(nn24, 6)}),HL`;
      noteAddress('ram', nn24, meta, text);
      break;
    case 0x2a:
      len = 4;
      text = `LD HL,(${hex(nn24, 6)})`;
      noteAddress('ram', nn24, meta, text);
      break;
    case 0x32:
      len = 4;
      text = `LD (${hex(nn24, 6)}),A`;
      noteAddress('ram', nn24, meta, text);
      break;
    case 0x3a:
      len = 4;
      text = `LD A,(${hex(nn24, 6)})`;
      noteAddress('ram', nn24, meta, text);
      break;
    case 0x03: case 0x13: case 0x23: case 0x33:
      text = `INC ${RP[op >> 4]}`;
      break;
    case 0x0b: case 0x1b: case 0x2b: case 0x3b:
      text = `DEC ${RP[op >> 4]}`;
      break;
    case 0x04: case 0x0c: case 0x14: case 0x1c: case 0x24: case 0x2c: case 0x34: case 0x3c:
      text = `INC ${REG8[(op >> 3) & 7]}`;
      break;
    case 0x05: case 0x0d: case 0x15: case 0x1d: case 0x25: case 0x2d: case 0x35: case 0x3d:
      text = `DEC ${REG8[(op >> 3) & 7]}`;
      break;
    case 0x06: case 0x0e: case 0x16: case 0x1e: case 0x26: case 0x2e: case 0x36: case 0x3e:
      len = 2;
      text = `LD ${REG8[(op >> 3) & 7]},${hex(rom[pc + 1])}`;
      break;
    case 0x07:
      text = 'RLCA';
      break;
    case 0x0f:
      text = 'RRCA';
      break;
    case 0x17:
      text = 'RLA';
      break;
    case 0x1f:
      text = 'RRA';
      break;
    case 0x08:
      text = "EX AF,AF'";
      break;
    case 0x09: case 0x19: case 0x29: case 0x39:
      text = `ADD HL,${RP[op >> 4]}`;
      break;
    case 0x10:
      len = 2;
      text = `DJNZ ${hex(pc + 2 + s8(rom[pc + 1]), 6)}`;
      flow = 'branch';
      break;
    case 0x18:
      len = 2;
      text = `JR ${hex(pc + 2 + s8(rom[pc + 1]), 6)}`;
      flow = 'jump';
      break;
    case 0x20: case 0x28: case 0x30: case 0x38:
      len = 2;
      text = `JR ${CC[(op >> 3) - 4]},${hex(pc + 2 + s8(rom[pc + 1]), 6)}`;
      flow = 'branch';
      break;
    case 0x76:
      text = 'HALT';
      break;
    case 0xc0: case 0xc8: case 0xd0: case 0xd8: case 0xe0: case 0xe8: case 0xf0: case 0xf8:
      text = `RET ${CC[(op >> 3) & 7]}`;
      flow = 'ret-conditional';
      break;
    case 0xc1: case 0xd1: case 0xe1: case 0xf1:
      text = `POP ${RP2[(op >> 4) - 12]}`;
      break;
    case 0xc2: case 0xca: case 0xd2: case 0xda: case 0xe2: case 0xea: case 0xf2: case 0xfa:
      len = 4;
      text = `JP ${CC[(op >> 3) & 7]},${hex(nn24, 6)}`;
      noteAddress('jump', nn24, meta, text);
      flow = 'branch';
      break;
    case 0xc3:
      len = 4;
      text = `JP ${hex(nn24, 6)}`;
      noteAddress('jump', nn24, meta, text);
      flow = 'tail';
      break;
    case 0xc4: case 0xcc: case 0xd4: case 0xdc: case 0xe4: case 0xec: case 0xf4: case 0xfc:
      len = 4;
      text = `CALL ${CC[(op >> 3) & 7]},${hex(nn24, 6)}`;
      noteAddress('call', nn24, meta, text);
      flow = 'call-conditional';
      break;
    case 0xc5: case 0xd5: case 0xe5: case 0xf5:
      text = `PUSH ${RP2[(op >> 4) - 12]}`;
      break;
    case 0xc6: case 0xce: case 0xd6: case 0xde: case 0xe6: case 0xee: case 0xf6: case 0xfe:
      len = 2;
      text = `${ALU[(op >> 3) & 7]} ${hex(rom[pc + 1])}`;
      break;
    case 0xc7: case 0xcf: case 0xd7: case 0xdf: case 0xe7: case 0xef: case 0xf7: case 0xff:
      text = `RST ${hex(op & 0x38)}`;
      flow = 'call';
      break;
    case 0xc9:
      text = 'RET';
      flow = 'ret';
      break;
    case 0xcd:
      len = 4;
      text = `CALL ${hex(nn24, 6)}`;
      noteAddress('call', nn24, meta, text);
      flow = 'call';
      break;
    case 0xd3:
      len = 2;
      text = `OUT (${hex(rom[pc + 1])}),A`;
      break;
    case 0xdb:
      len = 2;
      text = `IN A,(${hex(rom[pc + 1])})`;
      break;
    case 0xe3:
      text = 'EX (SP),HL';
      break;
    case 0xe9:
      text = 'JP (HL)';
      flow = 'tail';
      break;
    case 0xeb:
      text = 'EX DE,HL';
      break;
    case 0xf3:
      text = 'DI';
      break;
    case 0xf9:
      text = 'LD SP,HL';
      break;
    case 0xfb:
      text = 'EI';
      break;
    default:
      if (op >= 0x40 && op <= 0x7f) text = `LD ${REG8[(op >> 3) & 7]},${REG8[op & 7]}`;
      else if (op >= 0x80 && op <= 0xbf) text = `${ALU[(op >> 3) & 7]} ${REG8[op & 7]}`;
      break;
  }

  return { len, text, flow };
}

function decodeFunction({ name, start, minBytes }) {
  const meta = { calls: [], jumps: [], ram: [] };
  const instructions = [];
  let pc = start;
  let sawTerminal = false;

  while (pc < rom.length && pc - start < minBytes) {
    const decoded = decodeOne(pc, meta);
    const bytes = Array.from(rom.subarray(pc, pc + decoded.len), (byte) => hex(byte)).join(' ');
    instructions.push({ pc, bytes, ...decoded });
    pc += decoded.len;
    if (decoded.flow === 'ret' || decoded.flow === 'tail') {
      sawTerminal = true;
      break;
    }
  }

  return {
    name,
    start,
    end: pc,
    bytesDecoded: pc - start,
    sawTerminal,
    instructions,
    meta,
  };
}

function uniqueByAddr(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.kind}:${item.addr}:${item.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inferPurpose(result) {
  const callAddrs = new Set(result.meta.calls.map((call) => call.addr));
  const hasRasterizer = callAddrs.has(0x0a1799);
  const hasPopulator = callAddrs.has(0x07d583);
  const hasBcd = callAddrs.has(0x07c8b7);
  const ramLabels = new Set(result.meta.ram.map((access) => access.label).filter(Boolean));
  const directVram = result.meta.ram.some((access) => access.label.includes('VRAM') || access.addr >= 0xe30000);

  const traits = [];
  if (hasRasterizer) traits.push('calls the 0x0A1799 text rasterizer candidate');
  if (hasPopulator) traits.push('calls the 0x07D583 descriptor/populator candidate');
  if (hasBcd) traits.push('calls the 0x07C8B7 BCD/layout calculator candidate');
  if (ramLabels.size) traits.push(`touches ${Array.from(ramLabels).join(', ')}`);
  if (!directVram) traits.push('no obvious direct VRAM/mmio absolute access was decoded');

  if (!traits.length) {
    return 'No known rendering endpoints or D005xx/D008xx/D01xxx absolute RAM accesses were identified in the decoded window; inspect indirect pointer use in the instruction listing.';
  }
  return traits.join('; ') + '.';
}

function printResult(result) {
  console.log(`\n=== ${result.name} @ ${hex(result.start, 6)} ===`);
  console.log(`Decoded ${result.bytesDecoded} bytes, end ${hex(result.end, 6)}, terminal=${result.sawTerminal}`);
  console.log('\nInstructions:');
  for (const ins of result.instructions) {
    const marker = ins.flow ? ` ; ${ins.flow}` : '';
    console.log(`${hex(ins.pc, 6)}  ${ins.bytes.padEnd(18)} ${ins.text}${marker}`);
  }

  const calls = uniqueByAddr(result.meta.calls);
  const jumps = uniqueByAddr(result.meta.jumps);
  const ram = uniqueByAddr(result.meta.ram);

  console.log('\nCALL targets:');
  if (!calls.length) console.log('  none decoded');
  for (const call of calls) {
    console.log(`  ${hex(call.addr, 6)}${call.label ? ` - ${call.label}` : ''}${call.detail ? ` (${call.detail})` : ''}`);
  }

  console.log('\nJump/branch absolute targets:');
  if (!jumps.length) console.log('  none decoded');
  for (const jump of jumps) {
    console.log(`  ${hex(jump.addr, 6)}${jump.label ? ` - ${jump.label}` : ''}${jump.detail ? ` (${jump.detail})` : ''}`);
  }

  console.log('\nRAM/MMIO absolute accesses of interest:');
  if (!ram.length) console.log('  none decoded');
  for (const access of ram) {
    console.log(`  ${hex(access.addr, 6)} - ${access.label}${access.detail ? ` (${access.detail})` : ''}`);
  }

  console.log('\nSummary:');
  console.log(`  Purpose inference: ${inferPurpose(result)}`);
  console.log(`  Control flow: ${summarizeFlow(result)}`);
  console.log(`  Rendering role: ${summarizeRenderingRole(result)}`);
}

function summarizeFlow(result) {
  const branches = result.instructions.filter((ins) => ins.flow === 'branch').length;
  const calls = result.instructions.filter((ins) => ins.flow === 'call' || ins.flow === 'call-conditional').length;
  const conditionalReturns = result.instructions.filter((ins) => ins.flow === 'ret-conditional').length;
  const terminal = result.instructions.at(-1);
  const terminalText = terminal ? terminal.text : 'none';
  return `${branches} relative/conditional branches, ${calls} calls, ${conditionalReturns} conditional returns, terminal instruction ${terminalText}.`;
}

function summarizeRenderingRole(result) {
  const callAddrs = new Set(result.meta.calls.map((call) => call.addr));
  const directVram = result.meta.ram.some((access) => access.label.includes('VRAM') || access.addr >= 0xe30000);
  if (callAddrs.has(0x0a1799)) return 'Rendering coordinator with a direct decoded call into the text rasterizer path.';
  if (callAddrs.has(0x07d583) || callAddrs.has(0x07c8b7)) return 'Likely rendering/layout coordinator; it delegates to known render-support routines.';
  if (directVram) return 'Contains direct absolute display/VRAM-state access in the decoded window.';
  return 'No direct rasterizer call or obvious direct pixel/VRAM absolute write was found in the decoded window; likely coordinator or pointer-driven helper if part of render path.';
}

for (const target of TARGETS) {
  printResult(decodeFunction(target));
}
