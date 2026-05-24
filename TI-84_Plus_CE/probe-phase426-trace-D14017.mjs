#!/usr/bin/env node

// Phase 426 - Trace D14017 and nearby slab/context globals.
//
// This is a ROM-wide literal scan, not a control-flow graph walk. It finds each
// 24-bit little-endian RAM operand, classifies the embedding instruction as a
// read or write, and annotates the main init windows that matter for the
// D14017 -> slab bootstrap -> descriptor-base chain.

import { readFileSync } from 'node:fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TARGETS = [
  { name: 'D14011', addr: 0xD14011, note: 'sibling-walker live pointer' },
  { name: 'D14014', addr: 0xD14014, note: 'live context / session pointer' },
  { name: 'D14017', addr: 0xD14017, note: 'master workspace / descriptor pool root' },
  { name: 'D1401A', addr: 0xD1401A, note: 'selector-0 pool base' },
  { name: 'D1401D', addr: 0xD1401D, note: 'selector-0 pool end / sentinel' },
  { name: 'D14020', addr: 0xD14020, note: 'selector-2 pool base' },
];

const KNOWN_RANGES = [
  { start: 0x000000, end: 0x001FFF, label: 'boot-time low ROM window' },
  { start: 0x006E00, end: 0x007700, label: 'USB init window A' },
  { start: 0x00CAF4, end: 0x00CB7A, label: 'layout helper / slab geometry writer' },
  { start: 0x00CC75, end: 0x00CD58, label: 'pre-bootstrap init / D14014 reset' },
  { start: 0x00CD59, end: 0x00CD7A, label: 'bootstrap gate' },
  { start: 0x00E06D, end: 0x00E1CB, label: 'slab alloc' },
  { start: 0x00E1CC, end: 0x00E2EA, label: 'slab free' },
  { start: 0x00E2EB, end: 0x00E37D, label: 'pool bootstrap' },
  { start: 0x00E37E, end: 0x00E3DA, label: 'descriptor init A' },
  { start: 0x00E3DB, end: 0x00E43F, label: 'descriptor init B' },
  { start: 0x00EB31, end: 0x00ED76, label: 'caller B / live-context writer' },
  { start: 0x00ED77, end: 0x00EE1A, label: 'live descriptor selector' },
  { start: 0x00C900, end: 0x00CC00, label: 'USB init window B' },
];

const SINGLE_BYTE_OPS = {
  0x01: { op: 'LD BC,nn', kind: 'IMM', reg: 'BC' },
  0x11: { op: 'LD DE,nn', kind: 'IMM', reg: 'DE' },
  0x21: { op: 'LD HL,nn', kind: 'IMM', reg: 'HL' },
  0x31: { op: 'LD SP,nn', kind: 'IMM', reg: 'SP' },
  0x22: { op: 'LD (nn),HL', kind: 'WRITE' },
  0x2A: { op: 'LD HL,(nn)', kind: 'READ' },
  0x32: { op: 'LD (nn),A', kind: 'WRITE' },
  0x3A: { op: 'LD A,(nn)', kind: 'READ' },
  0xC2: { op: 'JP NZ,nn', kind: 'JP' },
  0xC3: { op: 'JP nn', kind: 'JP' },
  0xC4: { op: 'CALL NZ,nn', kind: 'CALL' },
  0xCA: { op: 'JP Z,nn', kind: 'JP' },
  0xCC: { op: 'CALL Z,nn', kind: 'CALL' },
  0xCD: { op: 'CALL nn', kind: 'CALL' },
  0xD2: { op: 'JP NC,nn', kind: 'JP' },
  0xD4: { op: 'CALL NC,nn', kind: 'CALL' },
  0xDA: { op: 'JP C,nn', kind: 'JP' },
  0xDC: { op: 'CALL C,nn', kind: 'CALL' },
  0xE2: { op: 'JP PO,nn', kind: 'JP' },
  0xE4: { op: 'CALL PO,nn', kind: 'CALL' },
  0xEA: { op: 'JP PE,nn', kind: 'JP' },
  0xEC: { op: 'CALL PE,nn', kind: 'CALL' },
  0xF2: { op: 'JP P,nn', kind: 'JP' },
  0xF4: { op: 'CALL P,nn', kind: 'CALL' },
  0xFA: { op: 'JP M,nn', kind: 'JP' },
  0xFC: { op: 'CALL M,nn', kind: 'CALL' },
};

const ED_OPS = {
  0x07: { op: 'LD BC,(nn)', kind: 'READ' },
  0x0F: { op: 'LD (nn),BC', kind: 'WRITE' },
  0x17: { op: 'LD DE,(nn)', kind: 'READ' },
  0x1F: { op: 'LD (nn),DE', kind: 'WRITE' },
  0x27: { op: 'LD HL,(nn)', kind: 'READ' },
  0x2F: { op: 'LD (nn),HL', kind: 'WRITE' },
  0x31: { op: 'LD IX/IY,(nn)', kind: 'READ' },
  0x37: { op: 'LD (nn),IX/IY', kind: 'WRITE' },
  0x43: { op: 'LD (nn),BC', kind: 'WRITE' },
  0x4B: { op: 'LD BC,(nn)', kind: 'READ' },
  0x53: { op: 'LD (nn),DE', kind: 'WRITE' },
  0x5B: { op: 'LD DE,(nn)', kind: 'READ' },
  0x63: { op: 'LD (nn),HL', kind: 'WRITE' },
  0x6B: { op: 'LD HL,(nn)', kind: 'READ' },
  0x73: { op: 'LD (nn),SP', kind: 'WRITE' },
  0x7B: { op: 'LD SP,(nn)', kind: 'READ' },
};

const IXIY_OPS = {
  0x21: { op: 'LD rr,nn', kind: 'IMM' },
  0x22: { op: 'LD (nn),rr', kind: 'WRITE' },
  0x2A: { op: 'LD rr,(nn)', kind: 'READ' },
};

const MODE_PREFIXES = {
  0x40: '.SIS',
  0x49: '.LIS',
  0x52: '.SIL',
  0x5B: '.LIL',
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function classifyInstruction(immOffset) {
  const prev1 = immOffset >= 1 ? rom[immOffset - 1] : -1;
  const prev2 = immOffset >= 2 ? rom[immOffset - 2] : -1;

  if (prev2 === 0xED && ED_OPS[prev1]) {
    return { ...ED_OPS[prev1], instructionStart: immOffset - 2 };
  }

  if ((prev2 === 0xDD || prev2 === 0xFD) && IXIY_OPS[prev1]) {
    const reg = prev2 === 0xDD ? 'IX' : 'IY';
    return {
      op: IXIY_OPS[prev1].op.replaceAll('rr', reg),
      kind: IXIY_OPS[prev1].kind,
      reg,
      instructionStart: immOffset - 2,
    };
  }

  if (MODE_PREFIXES[prev2] && SINGLE_BYTE_OPS[prev1]) {
    return {
      op: `${SINGLE_BYTE_OPS[prev1].op}${MODE_PREFIXES[prev2]}`,
      kind: SINGLE_BYTE_OPS[prev1].kind,
      reg: SINGLE_BYTE_OPS[prev1].reg,
      instructionStart: immOffset - 2,
    };
  }

  if (SINGLE_BYTE_OPS[prev1]) {
    return {
      ...SINGLE_BYTE_OPS[prev1],
      instructionStart: immOffset - 1,
    };
  }

  return {
    op: `UNKNOWN (${hexByte(prev2)} ${hexByte(prev1)})`,
    kind: 'UNKNOWN',
    instructionStart: Math.max(0, immOffset - 1),
  };
}

function estimateLength(pc) {
  const b0 = rom[pc];
  const b1 = rom[pc + 1];

  if (SINGLE_BYTE_OPS[b0]) {
    if (b0 === 0x22 || b0 === 0x2A || b0 === 0x32 || b0 === 0x3A) {
      return 4;
    }
    if (b0 === 0x01 || b0 === 0x11 || b0 === 0x21 || b0 === 0x31) {
      return 4;
    }
    return 4;
  }

  if (b0 === 0xDD || b0 === 0xFD) {
    if (IXIY_OPS[b1]) {
      return b1 === 0x21 ? 5 : 5;
    }
    if ([0x7E, 0x77, 0x4E, 0x46, 0x56, 0x5E, 0x66, 0x6E, 0x34, 0x35].includes(b1)) {
      return 3;
    }
    if (b1 === 0x36) {
      return 4;
    }
    return 2;
  }

  if (b0 === 0xED) {
    if (
      [
        0x03,
        0x07,
        0x0B,
        0x0F,
        0x13,
        0x17,
        0x1B,
        0x1F,
        0x23,
        0x27,
        0x2B,
        0x2F,
        0x31,
        0x37,
        0x39,
        0x43,
        0x4B,
        0x53,
        0x5B,
        0x63,
        0x6B,
        0x73,
        0x7B,
      ].includes(b1)
    ) {
      return [0x03, 0x0B, 0x13, 0x1B, 0x23, 0x2B, 0x31, 0x39].includes(b1) ? 3 : 5;
    }
    return 2;
  }

  if ([0x18, 0x20, 0x28, 0x30, 0x38, 0x3E, 0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0xE6, 0xF6, 0xFE].includes(b0)) {
    return 2;
  }

  return 1;
}

function followImmediateUse(start, reg) {
  let pc = start;
  let offset = 0;

  for (let step = 0; step < 10; step++) {
    const b0 = rom[pc];
    const b1 = rom[pc + 1];

    if (reg === 'HL') {
      if (b0 === 0x23) {
        offset += 1;
        pc += 1;
        continue;
      }
      if (b0 === 0x2B) {
        offset -= 1;
        pc += 1;
        continue;
      }
      if (b0 === 0x7E) return { resolved: 'READ', note: 'LD A,(HL)', offset };
      if ([0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E].includes(b0)) {
        return { resolved: 'READ', note: 'LD r,(HL)', offset };
      }
      if (b0 === 0x36) return { resolved: 'WRITE', note: `LD (HL),${hex(rom[pc + 1], 2)}`, offset };
      if (b0 >= 0x70 && b0 <= 0x77) return { resolved: 'WRITE', note: 'LD (HL),r', offset };
      if (b0 === 0x34) return { resolved: 'WRITE', note: 'INC (HL)', offset };
      if (b0 === 0x35) return { resolved: 'WRITE', note: 'DEC (HL)', offset };
      if ([0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE].includes(b0)) {
        return { resolved: 'READ', note: 'ALU/CP (HL)', offset };
      }
      if (b0 === 0xED && b1 === 0x0F) return { resolved: 'WRITE', note: 'LD (HL),BC', offset };
      if (b0 === 0xED && b1 === 0x1F) return { resolved: 'WRITE', note: 'LD (HL),DE', offset };
      if (b0 === 0xED && b1 === 0x07) return { resolved: 'READ', note: 'LD BC,(HL)', offset };
      if (b0 === 0xED && b1 === 0x17) return { resolved: 'READ', note: 'LD DE,(HL)', offset };
      if (b0 === 0x09) return { resolved: 'ADDR', note: 'ADD HL,BC before deref', offset };
    }

    if (reg === 'BC') {
      if (b0 === 0x0A) return { resolved: 'READ', note: 'LD A,(BC)', offset };
      if (b0 === 0x02) return { resolved: 'WRITE', note: 'LD (BC),A', offset };
      if (b0 === 0x03) {
        offset += 1;
        pc += 1;
        continue;
      }
      if (b0 === 0x0B) {
        offset -= 1;
        pc += 1;
        continue;
      }
      if (b0 === 0x09) return { resolved: 'ADDR', note: 'ADD HL,BC before deref', offset };
    }

    if (reg === 'DE') {
      if (b0 === 0x1A) return { resolved: 'READ', note: 'LD A,(DE)', offset };
      if (b0 === 0x12) return { resolved: 'WRITE', note: 'LD (DE),A', offset };
      if (b0 === 0x13) {
        offset += 1;
        pc += 1;
        continue;
      }
      if (b0 === 0x1B) {
        offset -= 1;
        pc += 1;
        continue;
      }
    }

    pc += estimateLength(pc);
  }

  return { resolved: 'ADDR', note: 'address load only', offset };
}

function findLittleEndian24(addr) {
  const b0 = addr & 0xFF;
  const b1 = (addr >> 8) & 0xFF;
  const b2 = (addr >> 16) & 0xFF;
  const hits = [];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === b0 && rom[i + 1] === b1 && rom[i + 2] === b2) {
      hits.push(i);
    }
  }

  return hits;
}

function tagForAddress(pc) {
  const tags = [];
  for (const range of KNOWN_RANGES) {
    if (pc >= range.start && pc <= range.end) {
      tags.push(range.label);
    }
  }
  if (pc >= 0x030000) {
    tags.push('0x03xxxx mirror');
  }
  return tags;
}

function scanTarget(target) {
  return findLittleEndian24(target.addr)
    .map((immOffset) => {
      const cls = classifyInstruction(immOffset);
      let resolved = cls.kind;
      let detail = cls.op;
      let offset = 0;

      if (cls.kind === 'IMM' && cls.reg) {
        const followed = followImmediateUse(immOffset + 3, cls.reg);
        resolved = followed.resolved;
        detail = `${cls.op} -> ${followed.note}`;
        offset = followed.offset;
      }

      return {
        targetName: target.name,
        targetAddr: target.addr,
        note: target.note,
        pc: cls.instructionStart,
        instruction: cls.op,
        resolved,
        detail,
        offset,
        tags: tagForAddress(cls.instructionStart),
      };
    })
    .sort((a, b) => a.pc - b.pc);
}

function countResolved(refs) {
  const counts = { READ: 0, WRITE: 0, ADDR: 0, CALL: 0, JP: 0, UNKNOWN: 0 };
  for (const ref of refs) {
    counts[ref.resolved] = (counts[ref.resolved] || 0) + 1;
  }
  return counts;
}

console.log('Phase 426 - Trace D14017 and Related Slab / Context Globals');
console.log(`ROM size: ${rom.length} bytes`);
console.log('');

for (const target of TARGETS) {
  const refs = scanTarget(target);
  const counts = countResolved(refs);
  const writes = refs.filter((ref) => ref.resolved === 'WRITE');

  console.log(`== ${target.name} ${hex(target.addr)} ==`);
  console.log(`Role: ${target.note}`);
  console.log(`Total refs: ${refs.length}  READ=${counts.READ}  WRITE=${counts.WRITE}  ADDR=${counts.ADDR}  CALL=${counts.CALL}  JP=${counts.JP}  UNKNOWN=${counts.UNKNOWN}`);

  if (writes.length > 0) {
    console.log('WRITE sites:');
    for (const ref of writes) {
      const tagText = ref.tags.length > 0 ? ` [${ref.tags.join('; ')}]` : '';
      console.log(`  ${hex(ref.pc)}  ${ref.detail}${ref.offset ? ` (offset ${ref.offset})` : ''}${tagText}`);
    }
  } else {
    console.log('WRITE sites: none');
  }

  console.log('All refs:');
  for (const ref of refs) {
    const offsetText = ref.offset ? ` (offset ${ref.offset})` : '';
    const tagText = ref.tags.length > 0 ? ` [${ref.tags.join('; ')}]` : '';
    console.log(`  ${hex(ref.pc)}  ${ref.resolved.padEnd(7)}  ${ref.detail}${offsetText}${tagText}`);
  }
  console.log('');
}
