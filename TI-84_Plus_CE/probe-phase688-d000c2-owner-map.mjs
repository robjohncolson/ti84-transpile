import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase688-d000c2-owner-map.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const IY66 = 0x42;
const D000C2 = 0xD000C2;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function bytesAt(pc, len) {
  return Array.from(romBytes.subarray(pc, pc + len), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  switch (inst.tag) {
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'inc-ixd':
      return `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `DEC ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'alu-ixd':
      return `${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-pair-indexed':
      return `LD ${String(inst.pair).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.pair).toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.src).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.dest).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    default:
      return `${inst.tag}${inst.op ? ` ${inst.op}` : ''}`;
  }
}

function buildInstructionIndex() {
  const byPc = new Map();
  const blocks = [];
  for (const [key, block] of Object.entries(BLOCKS)) {
    const startPc = Number.isInteger(block?.startPc)
      ? block.startPc
      : Number.parseInt(key.split(':')[0], 16);
    if (!Number.isFinite(startPc)) continue;

    const instructions = block.instructions ?? [];
    let endPc = startPc;
    for (const insn of instructions) {
      const pc = Number.isInteger(insn.pc) ? insn.pc : startPc + (insn.offset ?? 0);
      const length = Number.isInteger(insn.length) && insn.length > 0 ? insn.length : 1;
      endPc = Math.max(endPc, pc + length);
      byPc.set(pc, { blockKey: key, blockStart: startPc, blockEnd: endPc, insn });
    }
    blocks.push({ key, startPc, endPc, instructions });
  }
  blocks.sort((a, b) => a.startPc - b.startPc);
  return { byPc, blocks };
}

const instructionIndex = buildInstructionIndex();

function blockForPc(pc) {
  const exact = instructionIndex.byPc.get(pc);
  if (exact) return exact;
  for (const block of instructionIndex.blocks) {
    if (pc >= block.startPc && pc < block.endPc) return { blockKey: block.key, blockStart: block.startPc, blockEnd: block.endPc, insn: null };
  }
  return null;
}

function instructionWindow(pc, radius = 4) {
  const block = instructionIndex.blocks.find((entry) => pc >= entry.startPc && pc < entry.endPc);
  if (!block) {
    return [{ pc, text: '(no lifted block metadata)', bytes: bytesAt(pc, 4), hit: true }];
  }
  const idx = block.instructions.findIndex((insn) => {
    const insnPc = Number.isInteger(insn.pc) ? insn.pc : block.startPc + (insn.offset ?? 0);
    return insnPc === pc;
  });
  if (idx < 0) return [{ pc, text: '(inside lifted block, instruction metadata not exact)', bytes: bytesAt(pc, 4), hit: true }];
  const start = Math.max(0, idx - radius);
  const end = Math.min(block.instructions.length, idx + radius + 1);
  return block.instructions.slice(start, end).map((insn) => {
    const insnPc = Number.isInteger(insn.pc) ? insn.pc : block.startPc + (insn.offset ?? 0);
    const length = Number.isInteger(insn.length) && insn.length > 0 ? insn.length : 1;
    return {
      pc: insnPc,
      text: insn.dasm ?? formatInstruction(insn),
      bytes: bytesAt(insnPc, length),
      hit: insnPc === pc,
    };
  });
}

function isIy66Instruction(inst) {
  return inst?.indexRegister === 'iy' && inst.displacement === IY66;
}

function classifyRef(inst) {
  if (inst.tag === 'indexed-cb-bit') return { kind: 'BIT', bit: inst.bit, role: 'test' };
  if (inst.tag === 'indexed-cb-set') return { kind: 'SET', bit: inst.bit, role: 'setter' };
  if (inst.tag === 'indexed-cb-res') return { kind: 'RES', bit: inst.bit, role: 'clearer' };
  if (inst.tag === 'ld-ixd-imm' || inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-indexed-pair' || inst.tag === 'ld-indexed-ixiy') {
    return { kind: inst.tag, bit: '-', role: 'byte-write' };
  }
  if (inst.tag === 'inc-ixd' || inst.tag === 'dec-ixd') return { kind: inst.tag, bit: '-', role: 'byte-mutate' };
  return { kind: inst.tag, bit: '-', role: 'byte-read/test' };
}

function clusterFor(pc) {
  const clusters = [
    {
      start: 0x0012E0,
      end: 0x001320,
      name: 'low-ROM reset/wake flag initializer',
      meaning: 'initializes IY to D00080 and clears bit7 before the low-ROM dispatch table walk',
    },
    {
      start: 0x001713,
      end: 0x001934,
      name: 'low-ROM key/flash wrapper cluster',
      meaning: 'normal key handler and wrapper path; known to clear IY+66 bit7 before post-key dispatch',
    },
    {
      start: 0x005BB0,
      end: 0x006230,
      name: 'low-ROM hardware/service dispatch cluster',
      meaning: 'clears/tests bit7 around port guards and calls into 0x0158DE service dispatch',
    },
    {
      start: 0x0158BC,
      end: 0x015900,
      name: '0x0158DE post-key flash/action gate',
      meaning: 'tests bit7 as a re-entry guard and sets it after the owner/table path succeeds',
    },
    {
      start: 0x025000,
      end: 0x027300,
      name: 'event/parser state cluster',
      meaning: 'uses multiple D000C2 bits and bridges into the central 0x04C83A bit7 helper',
    },
    {
      start: 0x03D000,
      end: 0x03E900,
      name: 'display/event prelude cluster',
      meaning: 'uses D000C2 bits during display/key event preparation',
    },
    {
      start: 0x03E900,
      end: 0x03EC40,
      name: 'error-display/detail cluster',
      meaning: 'uses neighboring D000C2 bits for error-detail formatting, not the phase687 bit7 gate',
    },
    {
      start: 0x03EC40,
      end: 0x040C80,
      name: 'keyboard/display event cluster',
      meaning: 'uses D000C2 bits across display/key event transitions, including bit7 tests and clears',
    },
    {
      start: 0x040C80,
      end: 0x040E80,
      name: 'keyboard/display timer cluster',
      meaning: 'uses D000C2 bit0 to choose cursor blink/display timer constants',
    },
    {
      start: 0x040E80,
      end: 0x041000,
      name: 'keyboard/display event tail cluster',
      meaning: 'clears bit7 before calling the central 0x04C83A helper',
    },
    {
      start: 0x045900,
      end: 0x045C00,
      name: 'home/display transition cluster',
      meaning: 'clears/sets bit7 around display-home transition helpers and the 0x04C33B path',
    },
    {
      start: 0x04B300,
      end: 0x04B3C0,
      name: 'D000C2 bit5 mode cluster',
      meaning: 'uses bit5 only; included to show D000C2 is a shared UI flag byte',
    },
    {
      start: 0x04C000,
      end: 0x04C900,
      name: 'central UI bit7 latch/helper cluster',
      meaning: 'contains the 0x04C83A BIT/SET helper plus related bit7-gated UI mode paths',
    },
    {
      start: 0x06B000,
      end: 0x06BA00,
      name: 'equation/error UI helper cluster',
      meaning: 'uses bits 1/6/7 and calls the central 0x04C83A bit7 helper',
    },
    {
      start: 0x08C600,
      end: 0x08C640,
      name: 'launch-home cleanup cluster',
      meaning: 'clears D000C2 bit0 during launch/home cleanup',
    },
    {
      start: 0x0A3200,
      end: 0x0A3500,
      name: 'display scan/layout cluster',
      meaning: 'uses D000C2 bit0 for display buffer/layout selection',
    },
  ];
  const hit = clusters.find((cluster) => pc >= cluster.start && pc < cluster.end);
  return hit ?? { name: 'unlabeled D000C2 cluster', meaning: 'needs follow-up only if bit7 appears here' };
}

function scanIy66Refs() {
  const refs = [];
  const seen = new Set();
  for (let pc = 0; pc < romBytes.length - 4; pc += 1) {
    if (romBytes[pc] !== 0xFD) continue;
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      continue;
    }
    if (!isIy66Instruction(inst)) continue;
    const key = `${pc}:${inst.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const block = blockForPc(pc);
    const classification = classifyRef(inst);
    const cluster = clusterFor(pc);
    refs.push({
      pc,
      bytes: bytesAt(pc, inst.length),
      text: formatInstruction(inst),
      tag: inst.tag,
      ...classification,
      codeBacked: Boolean(block?.insn),
      blockStart: block?.blockStart ?? null,
      blockKey: block?.blockKey ?? null,
      cluster: cluster.name,
      clusterMeaning: cluster.meaning,
    });
  }
  return refs.sort((a, b) => a.pc - b.pc);
}

function scanAbsoluteD000C2Triples() {
  const hits = [];
  for (let pc = 0; pc < romBytes.length - 2; pc += 1) {
    if (romBytes[pc] === 0xC2 && romBytes[pc + 1] === 0x00 && romBytes[pc + 2] === 0xD0) {
      hits.push({ pc, codeBacked: Boolean(blockForPc(pc)?.insn), bytes: bytesAt(Math.max(0, pc - 2), 7) });
    }
  }
  return hits;
}

function findDirectControlRefs(target) {
  const refs = [];
  const low = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const high = (target >>> 16) & 0xFF;
  const callOps = new Set([0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);
  const jumpOps = new Set([0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]);
  for (let pc = 0; pc < romBytes.length - 3; pc += 1) {
    const op = romBytes[pc];
    if (!callOps.has(op) && !jumpOps.has(op)) continue;
    if (romBytes[pc + 1] !== low || romBytes[pc + 2] !== mid || romBytes[pc + 3] !== high) continue;
    const block = blockForPc(pc);
    refs.push({
      pc,
      op: callOps.has(op) ? 'CALL' : 'JP',
      bytes: bytesAt(pc, 4),
      codeBacked: Boolean(block?.insn),
      blockStart: block?.blockStart ?? null,
    });
  }
  return refs.sort((a, b) => a.pc - b.pc);
}

function summarizeByBitAndRole(refs) {
  const summary = new Map();
  for (const ref of refs.filter((entry) => ['BIT', 'SET', 'RES'].includes(entry.kind))) {
    const key = `bit${ref.bit}:${ref.kind}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  return Array.from(summary.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function toMarkdownTable(headers, rows) {
  const escape = (value) => String(value).replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

const refs = scanIy66Refs();
const bitOps = refs.filter((ref) => ['BIT', 'SET', 'RES'].includes(ref.kind));
const bit7Ops = bitOps.filter((ref) => ref.bit === 7);
const absoluteTriples = scanAbsoluteD000C2Triples();
const call0158de = findDirectControlRefs(0x0158DE);
const call0158bc = findDirectControlRefs(0x0158BC);
const call001853 = findDirectControlRefs(0x001853);

const codeBackedRefs = refs.filter((ref) => ref.codeBacked);
const bit7Clusters = Array.from(new Set(bit7Ops.map((ref) => ref.cluster)));
const uncoveredBit7Ops = bit7Ops.filter((ref) => !ref.codeBacked);
const bit7Setters = bit7Ops.filter((ref) => ref.kind === 'SET');
const bit7Clearers = bit7Ops.filter((ref) => ref.kind === 'RES');
const bit7Tests = bit7Ops.filter((ref) => ref.kind === 'BIT');
const centralHelperOps = bit7Ops.filter((ref) => ref.pc >= 0x04C000 && ref.pc < 0x04C900);

const assertions = {
  foundBit7Test: bit7Tests.length >= 1,
  foundBit7Setter: bit7Setters.length >= 1,
  foundBit7Clearer: bit7Clearers.length >= 1,
  allBit7OpsCodeBacked: uncoveredBit7Ops.length === 0,
  foundCentral04C83AHelperFamily: centralHelperOps.length >= 1,
  noAbsoluteD000C2CodeRefs: absoluteTriples.every((hit) => !hit.codeBacked),
};
const pass = Object.values(assertions).every(Boolean);

const lines = [
  '# Phase 688: D000C2 / IY+66 Bit-7 Ownership Map',
  '',
  'Probe: `probe-phase688-d000c2-owner-map.mjs`  ',
  'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase688-d000c2-owner-map.mjs`',
  '',
  '## Summary',
  '',
  `- Indexed IY+66 references found: **${refs.length}** total, **${codeBackedRefs.length}** backed by lifted instruction metadata.`,
  `- Bit-operation references on IY+66: **${bitOps.length}** total.`,
  `- Bit-7 ownership sites: **${bit7Ops.length}** total = ${bit7Tests.length} BIT, ${bit7Setters.length} SET, ${bit7Clearers.length} RES.`,
  `- Direct absolute byte pattern for D000C2 (C2 00 D0): **${absoluteTriples.length}** raw hits, **${absoluteTriples.filter((hit) => hit.codeBacked).length}** code-backed hits.`,
  `- Main finding: ${pass ? 'D000C2 bit7 is broader than the phase687 gate: it is a shared low-ROM/UI latch with owners in the 0x0012xx/0x0018xx/0x005Bxx/0x0158xx/0x04Cxxx families, anchored by a central 0x04C83A BIT/SET helper.' : 'one or more ownership assertions failed; inspect the tables before browser integration.'}`,
  '',
  '## Bit Operation Counts',
  '',
  toMarkdownTable(['bit/op', 'count'], summarizeByBitAndRole(bitOps).map((row) => [row.key, row.count])),
  '',
  '## Bit-7 Ownership Sites',
  '',
  toMarkdownTable(
    ['pc', 'bytes', 'op', 'role', 'code-backed', 'block', 'cluster', 'meaning'],
    bit7Ops.map((ref) => [
      hex(ref.pc),
      ref.bytes,
      ref.text,
      ref.role,
      ref.codeBacked ? 'yes' : 'no',
      ref.blockStart == null ? '-' : hex(ref.blockStart),
      ref.cluster,
      ref.clusterMeaning,
    ]),
  ),
  '',
  '## All Code-Backed IY+66 References',
  '',
  toMarkdownTable(
    ['pc', 'bytes', 'instruction', 'role', 'cluster'],
    codeBackedRefs.map((ref) => [hex(ref.pc), ref.bytes, ref.text, ref.role, ref.cluster]),
  ),
  '',
  '## Direct Control References',
  '',
  toMarkdownTable(
    ['target', 'refs'],
    [
      ['0x001853', call001853.map((ref) => `${ref.op}@${hex(ref.pc)}${ref.codeBacked ? '' : ' raw'}`).join(', ') || '-'],
      ['0x0158DE', call0158de.map((ref) => `${ref.op}@${hex(ref.pc)}${ref.codeBacked ? '' : ' raw'}`).join(', ') || '-'],
      ['0x0158BC', call0158bc.map((ref) => `${ref.op}@${hex(ref.pc)}${ref.codeBacked ? '' : ' raw'}`).join(', ') || '-'],
    ],
  ),
  '',
  '## Bit-7 Decode Windows',
  '',
];

for (const ref of bit7Ops) {
  lines.push(`### ${hex(ref.pc)} - ${ref.text}`);
  lines.push('');
  lines.push(toMarkdownTable(
    ['pc', 'bytes', 'instruction'],
    instructionWindow(ref.pc).map((row) => [
      row.hit ? `**${hex(row.pc)}**` : hex(row.pc),
      row.bytes,
      row.hit ? `**${row.text}**` : row.text,
    ]),
  ));
  lines.push('');
}

lines.push(
  '## Interpretation',
  '',
  '- Bit 7 is broader than the phase687 `0x0158DE` gate. Static code-backed owners include low-ROM init/service paths, the `0x0158DE` post-key flash/action gate, display/home transition paths, and the central `0x04C83A` helper family.',
  '- The normal low-ROM clearer pattern is `RES 7,(IY+66)` before service dispatch (`0x00186A`, `0x005BB6`, `0x00621F`) and before calls into the central helper (`0x027238`, `0x040580`, `0x0408C6`, `0x040EB4`, `0x04C53E`, `0x06B9C5`).',
  '- The normal setter pattern appears both in the `0x0158DE` gate (`0x0158F0`) and in the central helper/display transition family (`0x045B46`, `0x04C56F`, `0x04C84B`). So bit7 is a shared re-entry/latch flag, not a one-off browser-insert flag.',
  '- D000C2 as a byte also has broader UI meaning through other bits: bit0 appears in cursor/display timing and layout clusters, bit6 appears in error-detail paths, and bits1/2/3/5 have separate mode users. Any browser policy must touch only bit7.',
  '- Integration risk is medium, not low: phase687 proves the targeted gate-bypass state is equivalent for tested insertions, but this map shows leaving bit7 set intersects OS service/display helpers. Before editing `browser-shell.html`, run one dynamic owner-hit probe from the browser recipe to confirm which bit7 owners fire during key insertion and settling.',
  '',
  '## Assertions',
  '',
  toMarkdownTable(['assertion', 'pass'], Object.entries(assertions).map(([name, value]) => [name, value ? 'yes' : 'no'])),
  '',
  '## Compact JSON',
  '',
  '```json',
  JSON.stringify({
    pass,
    assertions,
    counts: {
      refs: refs.length,
      codeBackedRefs: codeBackedRefs.length,
      bitOps: bitOps.length,
      bit7Ops: bit7Ops.length,
      absoluteD000C2Triples: absoluteTriples.length,
      absoluteD000C2CodeBacked: absoluteTriples.filter((hit) => hit.codeBacked).length,
    },
    bit7Ops: bit7Ops.map((ref) => ({
      pc: hex(ref.pc),
      op: ref.text,
      role: ref.role,
      cluster: ref.cluster,
      codeBacked: ref.codeBacked,
      blockStart: ref.blockStart == null ? null : hex(ref.blockStart),
    })),
    codeBackedRefs: codeBackedRefs.map((ref) => ({
      pc: hex(ref.pc),
      op: ref.text,
      role: ref.role,
      cluster: ref.cluster,
    })),
    directControlRefs: {
      '0x001853': call001853,
      '0x0158DE': call0158de,
      '0x0158BC': call0158bc,
    },
  }, null, 2),
  '```',
  '',
);

fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);

console.log('phase688: D000C2 / IY+66 bit7 ownership map');
console.log(`refs=${refs.length} codeBacked=${codeBackedRefs.length} bitOps=${bitOps.length} bit7=${bit7Ops.length}`);
console.log(`bit7 tests=${bit7Tests.length} setters=${bit7Setters.length} clearers=${bit7Clearers.length} clusters=${bit7Clusters.join(', ')}`);
console.log(`absolute D000C2 triples raw=${absoluteTriples.length} codeBacked=${absoluteTriples.filter((hit) => hit.codeBacked).length}`);
console.log(`report=${path.relative(process.cwd(), REPORT_PATH)}`);
console.log(pass ? 'PASS' : 'FAIL');

if (!pass) process.exitCode = 1;
