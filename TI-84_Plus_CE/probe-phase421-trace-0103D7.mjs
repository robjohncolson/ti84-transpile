#!/usr/bin/env node

import fs from 'node:fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const ENTRY = 0x0103D7;
const VECTOR_234 = 0x0005A8;
const WRAPPER_CALL = 0x05F69F;

const SYMBOLS = new Map([
  [0xD177CC, 'D177CC'],
  [0xD177CF, 'D177CF'],
  [0xD177D8, 'D177D8'],
  [0xD177DB, 'D177DB'],
  [0xD177DE, 'D177DE'],
]);

const BRANCH_OPS = new Map([
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(addr) {
  return (rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16)) >>> 0;
}

function signedByte(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function rawBytes(addr, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(hexByte(rom[addr + i]));
  return out.join(' ');
}

function symbolName(addr) {
  return SYMBOLS.get(addr) ?? hex(addr);
}

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function renderDisp(disp) {
  return disp >= 0 ? `+${disp}` : `${disp}`;
}

function renderSource(source) {
  if (!source) return 'unknown';
  if (source.kind === 'abs8') return symbolName(source.addr);
  if (source.kind === 'abs24') return symbolName(source.addr);
  if (source.kind === 'ix-ptr') {
    const plus = source.offset ? `+${source.offset}` : '';
    return `*(*(IX${renderDisp(source.disp)})${plus})`;
  }
  if (source.kind === 'sis-sum') {
    return `low16(${renderSource(source.left)} + ${renderSource(source.right)})`;
  }
  return source.kind;
}

function decodeAt(pc) {
  const op = rom[pc];
  if (op === 0xCD) {
    return { len: 4, text: `CALL ${hex(read24(pc + 1))}`, kind: 'call', target: read24(pc + 1) };
  }
  if (op === 0xC3) {
    return { len: 4, text: `JP ${hex(read24(pc + 1))}`, kind: 'jp', target: read24(pc + 1) };
  }
  if (op === 0x3A) {
    const addr = read24(pc + 1);
    return { len: 4, text: `LD A,(${symbolName(addr)})`, kind: 'ld-a-mem', addr };
  }
  if (op === 0x2A) {
    const addr = read24(pc + 1);
    return { len: 4, text: `LD HL,(${symbolName(addr)})`, kind: 'ld-hl-mem', addr };
  }
  if (op === 0x77) return { len: 1, text: 'LD (HL),A', kind: 'ld-hl-a' };
  if (op === 0x71) return { len: 1, text: 'LD (HL),C', kind: 'ld-hl-c' };
  if (op === 0x70) return { len: 1, text: 'LD (HL),B', kind: 'ld-hl-b' };
  if (op === 0x23) return { len: 1, text: 'INC HL', kind: 'inc-hl' };
  if (op === 0xE5) return { len: 1, text: 'PUSH HL', kind: 'push-hl' };
  if (op === 0xC5) return { len: 1, text: 'PUSH BC', kind: 'push-bc' };
  if (op === 0xC1) return { len: 1, text: 'POP BC', kind: 'pop-bc' };
  if (op === 0xC9) return { len: 1, text: 'RET', kind: 'ret' };
  if (op === 0x40 && rom[pc + 1] === 0x09) {
    return { len: 2, text: 'SIS ADD HL,BC', kind: 'sis-add-hl-bc' };
  }
  if (op === 0xED && rom[pc + 1] === 0x4B) {
    const addr = read24(pc + 2);
    return { len: 5, text: `LD BC,(${symbolName(addr)})`, kind: 'ld-bc-mem', addr };
  }
  if (op === 0xDD) {
    const next = rom[pc + 1];
    if (next === 0x27) {
      const disp = signedByte(rom[pc + 2]);
      return { len: 3, text: `LD HL,(IX${renderDisp(disp)})`, kind: 'ld-hl-ixd', disp };
    }
    if (next === 0x07) {
      const disp = signedByte(rom[pc + 2]);
      return { len: 3, text: `LD BC,(IX${renderDisp(disp)})`, kind: 'ld-bc-ixd', disp };
    }
    if (next === 0xF9) return { len: 2, text: 'LD SP,IX', kind: 'ld-sp-ix' };
    if (next === 0xE1) return { len: 2, text: 'POP IX', kind: 'pop-ix' };
  }
  throw new Error(`Unsupported opcode sequence at ${hex(pc)}: ${rawBytes(pc, 5)}`);
}

function searchBranchRefs(target) {
  const hits = [];
  for (let addr = 0; addr <= rom.length - 4; addr++) {
    const op = rom[addr];
    if (!BRANCH_OPS.has(op)) continue;
    if (read24(addr + 1) === target) {
      hits.push({ addr, mnemonic: BRANCH_OPS.get(op) });
    }
  }
  return hits;
}

function findFunctionStartFromRet(addr) {
  for (let pc = addr; pc >= Math.max(0, addr - 0x40); pc--) {
    if (rom[pc] === 0xC9) return pc + 1;
  }
  return addr;
}

function disassembleRange(start, endExclusive) {
  const lines = [];
  let pc = start;
  while (pc < endExclusive) {
    const inst = decodeAt(pc);
    lines.push(`${hex(pc)}  ${rawBytes(pc, inst.len).padEnd(14, ' ')}  ${inst.text}`);
    pc += inst.len;
    if (inst.kind === 'ret') break;
  }
  return lines;
}

function traceEntry() {
  const directReads = [];
  const ixOffsets = [];
  const callTargets = [];
  const writes = [];
  const lines = [];

  const state = {
    a: null,
    hl: null,
    bc: null,
    stack: [],
  };

  let pc = ENTRY;
  while (true) {
    const inst = decodeAt(pc);
    lines.push(`${hex(pc)}  ${rawBytes(pc, inst.len).padEnd(14, ' ')}  ${inst.text}`);

    switch (inst.kind) {
      case 'call':
        callTargets.push(inst.target);
        break;
      case 'ld-a-mem':
        state.a = { kind: 'abs8', addr: inst.addr };
        directReads.push({ addr: inst.addr, width: 1, note: '8-bit read into A' });
        break;
      case 'ld-hl-mem':
        state.hl = { kind: 'abs24', addr: inst.addr };
        directReads.push({ addr: inst.addr, width: 3, note: '24-bit read into HL' });
        break;
      case 'ld-bc-mem':
        state.bc = { kind: 'abs24', addr: inst.addr };
        directReads.push({ addr: inst.addr, width: 3, note: '24-bit read into BC' });
        break;
      case 'ld-hl-ixd':
        state.hl = { kind: 'ix-ptr', disp: inst.disp, offset: 0 };
        ixOffsets.push({ disp: inst.disp, action: 'load destination pointer into HL' });
        break;
      case 'ld-bc-ixd':
        state.bc = { kind: 'ix-ptr', disp: inst.disp, offset: 0 };
        ixOffsets.push({ disp: inst.disp, action: 'load argument pointer into BC' });
        break;
      case 'ld-hl-a':
        writes.push({
          via: clone(state.hl),
          source: clone(state.a),
          width: 1,
          note: `${renderSource(state.a)} -> ${renderSource(state.hl)}`,
        });
        break;
      case 'ld-hl-c':
        writes.push({
          via: clone(state.hl),
          source: clone(state.bc),
          width: 1,
          byte: 'low',
          note: `low byte of ${renderSource(state.bc)} -> ${renderSource(state.hl)}`,
        });
        break;
      case 'ld-hl-b':
        writes.push({
          via: clone(state.hl),
          source: clone(state.bc),
          width: 1,
          byte: 'high',
          note: `high byte of ${renderSource(state.bc)} -> ${renderSource(state.hl)}`,
        });
        break;
      case 'inc-hl':
        if (state.hl?.kind === 'ix-ptr') state.hl.offset += 1;
        break;
      case 'sis-add-hl-bc':
        state.hl = {
          kind: 'sis-sum',
          left: clone(state.hl),
          right: clone(state.bc),
        };
        break;
      case 'push-hl':
        state.stack.push(clone(state.hl));
        break;
      case 'push-bc':
        state.stack.push(clone(state.bc));
        break;
      case 'pop-bc':
        state.bc = state.stack.pop() ?? null;
        break;
      default:
        break;
    }

    pc += inst.len;
    if (inst.kind === 'ret') break;
  }

  return {
    lines,
    end: pc - 1,
    size: pc - ENTRY,
    directReads,
    ixOffsets,
    callTargets,
    writes,
  };
}

function uniqueByKey(items, keyFn) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function main() {
  const trace = traceEntry();
  const directRefs = searchBranchRefs(ENTRY);
  const vectorRefs = searchBranchRefs(VECTOR_234);
  const wrapperStart = findFunctionStartFromRet(WRAPPER_CALL);
  const wrapperLines = disassembleRange(wrapperStart, wrapperStart + 0x40);

  console.log('=== 0x0103D7 Manual Trace ===');
  console.log(`Function range: ${hex(ENTRY)}-${hex(trace.end)} (${trace.size} bytes)`);
  console.log('');
  for (const line of trace.lines) console.log(line);

  console.log('\n=== Structured Report ===');
  console.log(`Function size: ${trace.size} bytes`);

  console.log('\nDirect RAM reads:');
  for (const read of uniqueByKey(trace.directReads, (item) => `${item.addr}:${item.width}`)) {
    console.log(`- ${symbolName(read.addr)} @ ${hex(read.addr)} (${read.width} byte${read.width === 1 ? '' : 's'}): ${read.note}`);
  }

  console.log('\nIX-relative accesses:');
  for (const access of uniqueByKey(trace.ixOffsets, (item) => `${item.disp}:${item.action}`)) {
    console.log(`- (IX${renderDisp(access.disp)}): ${access.action}`);
  }

  console.log('\nIndirect RAM writes via caller-supplied pointers:');
  for (const write of trace.writes) {
    console.log(`- ${write.note}`);
  }
  console.log('- No direct fixed-address RAM writes occur inside 0x0103D7.');

  console.log('\nCALL targets:');
  for (const target of uniqueByKey(trace.callTargets, (item) => item)) {
    console.log(`- ${hex(target)}`);
  }

  console.log('\nDerived-value note:');
  console.log('- `SIS ADD HL,BC` uses 16-bit arithmetic in ADL mode.');
  console.log('- The third output is `low16(D177DE + D177CC)`, not a direct read of D177CF.');

  console.log('\n=== Direct CALL/JP Refs To 0x0103D7 ===');
  for (const ref of directRefs) {
    const vectorIndex = ref.addr >= 0x000580 && ref.addr < 0x0005E8
      ? 224 + ((ref.addr - 0x000580) >> 2)
      : null;
    const vectorText = vectorIndex === null ? '' : `, vector ${vectorIndex}`;
    console.log(`- ${hex(ref.addr)}  ${ref.mnemonic} ${hex(ENTRY)}${vectorText}`);
  }
  if (!directRefs.length) console.log('- none');

  console.log('\n=== CALL/JP Refs To Vector 0x0005A8 ===');
  for (const ref of vectorRefs) {
    console.log(`- ${hex(ref.addr)}  ${ref.mnemonic} ${hex(VECTOR_234)}`);
  }
  if (!vectorRefs.length) console.log('- none');

  console.log(`\n=== Wrapper Context For ${hex(WRAPPER_CALL)} ===`);
  console.log(`Nearest preceding RET yields wrapper start ${hex(wrapperStart)}`);
  for (const line of wrapperLines) console.log(line);

  console.log('\n=== Interpretation ===');
  console.log('- 0x0103D7 is a 3-output serializer/getter, not a contiguous IX-struct writer.');
  console.log('- Output 1: `*(ptr at IX+6) = D177D8`.');
  console.log('- Output 2: `*(ptr at IX+9) = D177DB`.');
  console.log('- Output 3: `*(ptr at IX+12..13) = low16(D177DE + D177CC)` in little-endian order.');
  console.log('- The only direct ROM xref is the vector-table JP at 0x0005A8; the only in-ROM caller of that vector is the wrapper at 0x05F69F inside 0x05F68F-0x05F6AA.');
}

main();
