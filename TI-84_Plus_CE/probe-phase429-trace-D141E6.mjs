#!/usr/bin/env node

// Phase 429 — Trace all ROM references to D141E6 (config/mode source byte).
// D141E6 is read 4x by 0x00DE8B (post-bootstrap field initializer); its source
// is unknown.  This probe scans the full 4 MB ROM for every 24-bit little-endian
// operand matching D141E5..D141E7 (the target byte plus neighbours), classifies
// the embedding instruction as read / write / imm / call / jp, and prints a
// complete site list so we can determine who writes D141E6.

import { readFileSync } from 'fs';

process.emitWarning = () => {};

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TARGETS = [
  { label: 'D141E5', addr: 0xD141E5, note: 'adjacent byte -1' },
  { label: 'D141E6', addr: 0xD141E6, note: 'config/mode source — primary target' },
  { label: 'D141E7', addr: 0xD141E7, note: 'adjacent byte +1' },
];

const CONTEXT_BEFORE = 12;
const CONTEXT_AFTER  = 12;
const CLUSTER_GAP    = 0x80;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function hex(v, width = 6) {
  return '0x' + (Number(v) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(v) {
  return (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function dumpBytes(buf, start, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    const pos = start + i;
    if (pos >= 0 && pos < buf.length) parts.push(hexByte(buf[pos]));
  }
  return parts.join(' ');
}

function formatContext(buf, immOff, before = CONTEXT_BEFORE, after = CONTEXT_AFTER) {
  const leftStart = Math.max(0, immOff - before);
  const leftLen   = immOff - leftStart;
  const rightStart = immOff + 3;
  const rightLen   = Math.max(0, Math.min(after, buf.length - rightStart));
  const left  = dumpBytes(buf, leftStart, leftLen);
  const mid   = dumpBytes(buf, immOff, 3);
  const right = dumpBytes(buf, rightStart, rightLen);
  return `${left ? `${left} ` : ''}[${mid}]${right ? ` ${right}` : ''}`;
}

function findLE24(buf, addr) {
  const b0 = addr & 0xFF;
  const b1 = (addr >> 8) & 0xFF;
  const b2 = (addr >> 16) & 0xFF;
  const matches = [];
  for (let i = 0; i < buf.length - 2; i++) {
    if (buf[i] === b0 && buf[i + 1] === b1 && buf[i + 2] === b2) {
      matches.push(i);
    }
  }
  return matches;
}

// ---------------------------------------------------------------------------
// instruction classification
// ---------------------------------------------------------------------------

function classifyInstruction(buf, immOff) {
  const prev1 = immOff >= 1 ? buf[immOff - 1] : -1;
  const prev2 = immOff >= 2 ? buf[immOff - 2] : -1;
  const prev3 = immOff >= 3 ? buf[immOff - 3] : -1;

  const singleByteOps = {
    0x01: { op: 'LD BC,nn',    kind: 'IMM'   },
    0x11: { op: 'LD DE,nn',    kind: 'IMM'   },
    0x21: { op: 'LD HL,nn',    kind: 'IMM'   },
    0x31: { op: 'LD SP,nn',    kind: 'IMM'   },
    0x22: { op: 'LD (nn),HL',  kind: 'WRITE' },
    0x2A: { op: 'LD HL,(nn)',  kind: 'READ'  },
    0x32: { op: 'LD (nn),A',   kind: 'WRITE' },
    0x3A: { op: 'LD A,(nn)',   kind: 'READ'  },
    0xC2: { op: 'JP NZ,nn',   kind: 'JP'    },
    0xC3: { op: 'JP nn',      kind: 'JP'    },
    0xC4: { op: 'CALL NZ,nn', kind: 'CALL'  },
    0xCA: { op: 'JP Z,nn',    kind: 'JP'    },
    0xCC: { op: 'CALL Z,nn',  kind: 'CALL'  },
    0xCD: { op: 'CALL nn',    kind: 'CALL'  },
    0xD2: { op: 'JP NC,nn',   kind: 'JP'    },
    0xD4: { op: 'CALL NC,nn', kind: 'CALL'  },
    0xDA: { op: 'JP C,nn',    kind: 'JP'    },
    0xDC: { op: 'CALL C,nn',  kind: 'CALL'  },
    0xE2: { op: 'JP PO,nn',   kind: 'JP'    },
    0xE4: { op: 'CALL PO,nn', kind: 'CALL'  },
    0xEA: { op: 'JP PE,nn',   kind: 'JP'    },
    0xEC: { op: 'CALL PE,nn', kind: 'CALL'  },
    0xF2: { op: 'JP P,nn',    kind: 'JP'    },
    0xF4: { op: 'CALL P,nn',  kind: 'CALL'  },
    0xFA: { op: 'JP M,nn',    kind: 'JP'    },
    0xFC: { op: 'CALL M,nn',  kind: 'CALL'  },
  };

  const edOps = {
    0x07: { op: 'LD BC,(nn)',  kind: 'READ'  },
    0x0F: { op: 'LD (nn),BC', kind: 'WRITE' },
    0x17: { op: 'LD DE,(nn)',  kind: 'READ'  },
    0x1F: { op: 'LD (nn),DE', kind: 'WRITE' },
    0x27: { op: 'LD HL,(nn)',  kind: 'READ'  },
    0x2F: { op: 'LD (nn),HL', kind: 'WRITE' },
    0x31: { op: 'LD IX/IY,(nn)', kind: 'READ' },
    0x37: { op: 'LD (nn),IX/IY', kind: 'WRITE' },
    0x43: { op: 'LD (nn),BC', kind: 'WRITE' },
    0x4B: { op: 'LD BC,(nn)', kind: 'READ'  },
    0x53: { op: 'LD (nn),DE', kind: 'WRITE' },
    0x5B: { op: 'LD DE,(nn)', kind: 'READ'  },
    0x63: { op: 'LD (nn),HL', kind: 'WRITE' },
    0x6B: { op: 'LD HL,(nn)', kind: 'READ'  },
    0x73: { op: 'LD (nn),SP', kind: 'WRITE' },
    0x7B: { op: 'LD SP,(nn)', kind: 'READ'  },
  };

  const ixiyOps = {
    0x21: { op: 'LD rr,nn',    kind: 'IMM'   },
    0x22: { op: 'LD (nn),rr',  kind: 'WRITE' },
    0x2A: { op: 'LD rr,(nn)',  kind: 'READ'  },
  };

  const suffixNames = {
    0x40: '.SIS',
    0x49: '.LIS',
    0x52: '.SIL',
    0x5B: '.LIL',
  };

  // 3-byte prefix patterns: eZ80 suffix + ED + op
  if (suffixNames[prev3] && prev2 === 0xED && edOps[prev1]) {
    return {
      op: `${edOps[prev1].op}${suffixNames[prev3]}`,
      kind: edOps[prev1].kind,
      instructionStart: immOff - 3,
    };
  }

  // 3-byte prefix patterns: eZ80 suffix + DD/FD + op
  if (suffixNames[prev3] && (prev2 === 0xDD || prev2 === 0xFD) && ixiyOps[prev1]) {
    const reg = prev2 === 0xDD ? 'IX' : 'IY';
    return {
      op: `${ixiyOps[prev1].op.replaceAll('rr', reg)}${suffixNames[prev3]}`,
      kind: ixiyOps[prev1].kind,
      instructionStart: immOff - 3,
    };
  }

  // 2-byte prefix: ED + op
  if (prev2 === 0xED && edOps[prev1]) {
    return { ...edOps[prev1], instructionStart: immOff - 2 };
  }

  // 2-byte prefix: DD/FD + op (IX/IY)
  if ((prev2 === 0xDD || prev2 === 0xFD) && ixiyOps[prev1]) {
    const reg = prev2 === 0xDD ? 'IX' : 'IY';
    return {
      op: ixiyOps[prev1].op.replaceAll('rr', reg),
      kind: ixiyOps[prev1].kind,
      instructionStart: immOff - 2,
    };
  }

  // 2-byte prefix: eZ80 suffix + single-byte op
  if (suffixNames[prev2] && singleByteOps[prev1]) {
    return {
      op: `${singleByteOps[prev1].op}${suffixNames[prev2]}`,
      kind: singleByteOps[prev1].kind,
      instructionStart: immOff - 2,
    };
  }

  // 1-byte prefix: plain single-byte op
  if (singleByteOps[prev1]) {
    return { ...singleByteOps[prev1], instructionStart: immOff - 1 };
  }

  return {
    op: `UNKNOWN (prev ${hexByte(prev2)} ${hexByte(prev1)})`,
    kind: 'UNKNOWN',
    instructionStart: Math.max(0, immOff - 1),
  };
}

// ---------------------------------------------------------------------------
// scanning
// ---------------------------------------------------------------------------

function scanTarget(target) {
  return findLE24(rom, target.addr).map((romOffset) => {
    const cls = classifyInstruction(rom, romOffset);
    return {
      targetAddr:  target.addr,
      targetLabel: target.label,
      targetNote:  target.note,
      romOffset,
      ...cls,
    };
  });
}

// ---------------------------------------------------------------------------
// grouping
// ---------------------------------------------------------------------------

function groupRefsByGap(refs) {
  const sorted = [...refs].sort((a, b) => a.instructionStart - b.instructionStart);
  const groups = [];
  let current = null;

  for (const ref of sorted) {
    if (!current || ref.instructionStart - current.end > CLUSTER_GAP) {
      current = {
        name: `ROM cluster ${hex(ref.instructionStart)}`,
        refs: [],
        start: ref.instructionStart,
        end: ref.instructionStart,
      };
      groups.push(current);
    }
    current.refs.push(ref);
    current.end = ref.instructionStart;
    current.name = `ROM cluster ${hex(current.start)}..${hex(current.end)}`;
  }

  return groups;
}

function countKinds(refs) {
  const counts = { READ: 0, WRITE: 0, IMM: 0, CALL: 0, JP: 0, UNKNOWN: 0 };
  for (const ref of refs) counts[ref.kind] = (counts[ref.kind] || 0) + 1;
  return counts;
}

function summarizeCounts(counts) {
  return `READ:${counts.READ} WRITE:${counts.WRITE} IMM:${counts.IMM} CALL:${counts.CALL} JP:${counts.JP} UNKNOWN:${counts.UNKNOWN}`;
}

function summarizeTargetMix(refs) {
  const mix = new Map();
  for (const ref of refs) mix.set(ref.targetLabel, (mix.get(ref.targetLabel) || 0) + 1);
  return [...mix.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, count]) => `${label}:${count}`)
    .join(', ');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const results = TARGETS.map((target) => ({
  ...target,
  refs: scanTarget(target),
}));

const allRefs = results.flatMap((item) => item.refs)
  .sort((a, b) => a.instructionStart - b.instructionStart);

console.log('=== Phase 429: Trace D141E6 Config/Mode Source ===\n');
console.log(`ROM size: ${hex(rom.length)} bytes`);
console.log('Targets: ' + TARGETS.map((t) => `${t.label}=${hex(t.addr)}`).join(', '));

// ---- per-target summary table ----
console.log('\n=== ADDRESS SUMMARY ===\n');
console.log('Address  Label    Total  READ  WRITE  IMM  CALL  JP  UNKNOWN  Note');
console.log('-------  -------  -----  ----  -----  ---  ----  --  -------  ----');
for (const item of results) {
  const c = countKinds(item.refs);
  console.log(
    `${hex(item.addr)}  ${item.label.padEnd(7)}  ${String(item.refs.length).padStart(5)}  ` +
    `${String(c.READ).padStart(4)}  ${String(c.WRITE).padStart(5)}  ` +
    `${String(c.IMM).padStart(3)}  ${String(c.CALL).padStart(4)}  ` +
    `${String(c.JP).padStart(2)}  ${String(c.UNKNOWN).padStart(7)}  ${item.note}`
  );
}

// ---- detailed per-target listing ----
for (const item of results) {
  const c = countKinds(item.refs);
  console.log(`\n=== ${item.label} (${hex(item.addr)}) ===`);
  console.log(`Note: ${item.note}`);
  console.log(`Total refs: ${item.refs.length}  (${summarizeCounts(c)})`);

  if (item.refs.length === 0) {
    console.log('  No references found.');
    continue;
  }

  for (const group of groupRefsByGap(item.refs)) {
    const gc = countKinds(group.refs);
    console.log(`\n  -- ${group.name} (${group.refs.length} ref(s); ${summarizeCounts(gc)}) --`);
    for (const ref of group.refs.sort((a, b) => a.instructionStart - b.instructionStart)) {
      console.log(`  ${hex(ref.instructionStart)}: ${ref.op}  [${ref.kind}]`);
      console.log(`    operand @ ${hex(ref.romOffset)}  context: ${formatContext(rom, ref.romOffset)}`);
    }
  }
}

// ---- WRITE-only focus ----
const writes = allRefs.filter((r) => r.kind === 'WRITE');
console.log('\n=== WRITE SITES (who sets D141E5..D141E7?) ===\n');
if (writes.length === 0) {
  console.log('No direct WRITE instructions found for these addresses.');
  console.log('D141E6 may be set via indirect write (LD (HL),A etc.), block copy (LDIR), or pointer-based store.');
} else {
  for (const w of writes) {
    console.log(`${hex(w.instructionStart)}: ${w.op}  target=${w.targetLabel}  operand@${hex(w.romOffset)}`);
    console.log(`  context: ${formatContext(rom, w.romOffset)}`);
  }
}

// ---- IMM loads (code that computes addresses near D141E6) ----
const imms = allRefs.filter((r) => r.kind === 'IMM');
console.log('\n=== IMM LOADS (code loading D141E5..D141E7 as an address) ===\n');
if (imms.length === 0) {
  console.log('No IMM loads found.');
} else {
  for (const m of imms) {
    console.log(`${hex(m.instructionStart)}: ${m.op}  target=${m.targetLabel}  operand@${hex(m.romOffset)}`);
    console.log(`  context: ${formatContext(rom, m.romOffset)}`);
  }
}

// ---- global cluster view ----
console.log('\n=== GLOBAL CLUSTER VIEW ===\n');
for (const group of groupRefsByGap(allRefs)) {
  const c = countKinds(group.refs);
  console.log(`${group.name}`);
  console.log(`  span: ${hex(group.start)}..${hex(group.end)}`);
  console.log(`  refs: ${group.refs.length}  (${summarizeCounts(c)})`);
  console.log(`  targets: ${summarizeTargetMix(group.refs)}`);
}

// ---- assessment ----
console.log('\n=== ASSESSMENT ===\n');
console.log('If no WRITE sites appear, D141E6 is likely set by one of:');
console.log('  1. Indirect store:  LD (HL),A  or  LD (IX+d),A  where HL/IX = D141E6');
console.log('  2. Block copy:     LDIR / LDDR copying a struct that includes offset +E6');
console.log('  3. Pointer store:  code loads D14100 (base) into HL, then LD (HL+offset),A');
console.log('Look at IMM loads of D141E6 or nearby base addresses (D14100, D14180, D141E0)');
console.log('to find the function that writes through a pointer.');
