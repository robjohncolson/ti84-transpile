import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const reportPath = path.join(__dirname, 'phase621-d02a29-clusters.md');
const rom = fs.readFileSync(romPath);

const D02A29 = 0xd02a29;
const D02A2B = 0xd02a2b;
const D02A1B = 0xd02a1b;
const D0059A = 0xd0059a;
const D0114E = 0xd0114e;
const D01150 = 0xd01150;
const D01156 = 0xd01156;
const D0115A = 0xd0115a;

const clusters = [
  { name: 'initializer/display-state setup', start: 0x08df54, end: 0x08e190 },
  { name: 'display arithmetic and derived cursor state', start: 0x08e151, end: 0x08e3a8 },
  { name: 'token output setup and cursor adjustment', start: 0x08ed73, end: 0x08ee44 },
  { name: 'token output loop setup', start: 0x08f006, end: 0x08f150 },
  { name: 'normal and alternate exit cursor advance', start: 0x08f54b, end: 0x08f6b0 },
  { name: 'cursor movement helpers', start: 0x08f6fe, end: 0x08f7d0 },
];

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function bytes(addr, len) {
  return Array.from({ length: len }, (_, i) => rom[addr + i].toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function memRefs(insn) {
  const refs = [];
  const op = rom[insn.pc];
  const op1 = rom[insn.pc + 1];
  const low = rom[insn.pc + 2];
  const high = rom[insn.pc + 3];
  if (op === 0x40 && (op1 === 0x2a || op1 === 0x22)) refs.push(0xd00000 | low | (high << 8));
  for (const value of Object.values(insn)) {
    if (typeof value === 'number' && value >= 0xd00000 && value <= 0xd3ffff) refs.push(value);
  }
  return [...new Set(refs)];
}

function calls(insn) {
  const op = rom[insn.pc];
  if ((op === 0xcd || op === 0xc3) && typeof insn.target === 'number') return insn.target & 0xffffff;
  if ((op === 0xcd || op === 0xc3) && typeof insn.operand === 'number') return insn.operand & 0xffffff;
  return null;
}

function insnText(insn) {
  const fields = Object.entries(insn)
    .filter(([key]) => !['pc', 'nextPc', 'length'].includes(key))
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : value}`)
    .join(' ');
  return `${hex(insn.pc)} ${bytes(insn.pc, insn.length).padEnd(14)} ${fields}`;
}

function decodeWindow(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    try {
      const insn = decodeInstruction(rom, pc, 'adl');
      rows.push(insn);
      pc = insn.nextPc;
    } catch (err) {
      rows.push({ pc, nextPc: pc + 1, length: 1, error: err.message });
      pc++;
    }
  }
  return rows;
}

function classifyCluster(cluster, decoded) {
  const refs = decoded
    .filter((insn) => !insn.error)
    .map((insn) => ({ insn, refs: memRefs(insn), call: calls(insn) }))
    .filter((row) => row.refs.length || row.call !== null);

  const d02a29Refs = refs.filter((row) => row.refs.includes(D02A29));
  const stateRefs = refs.filter((row) => row.refs.some((addr) => [
    D02A29, D02A2B, D02A1B, D0059A, D0114E, D01150, D01156, D0115A,
  ].includes(addr)));
  const callTargets = [...new Set(refs.map((row) => row.call).filter((target) => target !== null))];

  return {
    cluster,
    decoded,
    d02a29Refs,
    stateRefs,
    callTargets,
  };
}

const decodedClusters = clusters.map((cluster) => classifyCluster(cluster, decodeWindow(cluster.start, cluster.end)));

const roleByStart = new Map([
  [0x08df54, 'entry seed: stores caller HL into D02A29, then snapshots D02A2B and D02A1B around display setup helpers'],
  [0x08e151, 'display coordinate arithmetic: D02A29 is combined with constants and D02A2B to derive render cursor state'],
  [0x08ed73, 'token-output setup: writes computed HL to D02A29 before token/render position adjustment'],
  [0x08f006, 'loop setup: repeatedly rewrites D02A29 from local cursor arithmetic before normal token processing'],
  [0x08f54b, 'normal exit: saves/restores D02A29 around cleanup and token-position updates'],
  [0x08f69c, 'alternate exit: reads D02A29, adds token byte size from 0x0907DB, writes advanced D02A29'],
  [0x08f6fe, 'movement helpers: D02A29 is reset or advanced by helpers that coordinate D02A2B and token-size state'],
]);

const report = [
  '# Phase 621: D02A29 Writer Cluster Decode',
  '',
  '## Summary',
  '',
  '- Decoded the dense `D02A29` writer/read clusters requested by the phase620 handoff: `0x08DF54`, `0x08E151`, `0x08ED73`, `0x08F54B`, plus adjacent loop/helper ranges that share the same state.',
  '- `D02A29` is consistently used as a 16-bit token/display cursor byte offset. It is not isolated: the same clusters pair it with `D02A2B`, `D02A1B`, and derived display cursor fields such as `D0059A`, `D0114E`, `D01150`, `D01156`, and `D0115A`.',
  '- The writer clusters split into four roles: seed from caller/token context, convert to display-coordinate state, adjust during token-output loop setup, and advance by token byte size on normal/alternate exits.',
  '- The practical restore implication is narrower than a full RAM snapshot but broader than `D02A29` alone: persistent display state needs the local cursor-position tuple (`D02A29`, `D02A2B`, `D02A1B`, and derived D011xx/D0059A fields) to stay coherent.',
  '',
  '## Cluster Roles',
  '',
  '| Range | Role | D02A29 refs | Nearby state refs | Calls/Jumps |',
  '|---|---|---:|---:|---|',
  ...decodedClusters.map(({ cluster, d02a29Refs, stateRefs, callTargets }) => {
    const role = roleByStart.get(cluster.start) ?? cluster.name;
    const targets = callTargets.map((target) => hex(target)).join(', ') || '(none)';
    return `| ${hex(cluster.start)}-${hex(cluster.end)} | ${role} | ${d02a29Refs.length} | ${stateRefs.length} | ${targets} |`;
  }),
  '',
  '## D02A29 Reference Detail',
  '',
  ...decodedClusters.flatMap(({ cluster, d02a29Refs, stateRefs }) => [
    `### ${hex(cluster.start)}-${hex(cluster.end)} ${cluster.name}`,
    '',
    'D02A29 references:',
    '',
    ...(d02a29Refs.length
      ? d02a29Refs.map(({ insn }) => `- \`${insnText(insn)}\``)
      : ['- none in this decoded range']),
    '',
    'Nearby cursor/display state references:',
    '',
    ...(stateRefs.length
      ? stateRefs.map(({ insn, refs }) => `- \`${insnText(insn)}\` refs=${refs.map((addr) => hex(addr)).join(',')}`)
      : ['- none']),
    '',
  ]),
  '## Interpretation',
  '',
  '`0x08DF54` and `0x08DFDD` initialize `D02A29` from the incoming HL context and immediately work with `D02A2B` / `D02A1B`, so they are setup entries for the token display cursor tuple. `0x08E151` and the nearby `0x08E355`/`0x08E380` references derive display-position fields from that tuple, including `D0059A` and D011xx scratch/state fields. `0x08ED73` and `0x08F006` rewrite `D02A29` during token-output setup. The `0x08F54B` and `0x08F69C` exit paths then save/restore or advance the cursor offset before restarting or cleaning up the loop.',
  '',
  'This explains why restoring only `D02A29` would be fragile: the loop expects a coherent token/display cursor tuple. For browser persistence, the already-proven VRAM and token-buffer snapshots are still the low-risk path; if RAM state restoration is attempted, include at least `D02A29-D02A2C`, `D02A1B-D02A1D`, and the derived D011xx/D0059A fields captured from the same phase.',
  '',
].join('\n');

fs.writeFileSync(reportPath, report);

console.log('phase621: D02A29 cluster decode complete');
for (const { cluster, d02a29Refs, stateRefs, callTargets } of decodedClusters) {
  console.log(`phase621: ${hex(cluster.start)}-${hex(cluster.end)} ${cluster.name}`);
  console.log(`  d02a29Refs=${d02a29Refs.length} stateRefs=${stateRefs.length} callTargets=${callTargets.map((target) => hex(target)).join(',') || '(none)'}`);
}
console.log(`phase621: wrote ${path.relative(path.resolve(__dirname, '..'), reportPath)}`);

const totalD02A29Refs = decodedClusters.reduce((sum, item) => sum + item.d02a29Refs.length, 0);
if (totalD02A29Refs < 10) {
  console.log(`phase621: FAIL -- expected at least 10 D02A29 refs, found ${totalD02A29Refs}`);
  process.exit(1);
}

console.log('phase621: PASS -- D02A29 writer clusters decoded');
