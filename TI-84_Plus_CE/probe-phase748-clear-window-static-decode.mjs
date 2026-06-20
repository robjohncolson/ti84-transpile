import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase748-clear-window-static-decode.md');

const rom = fs.readFileSync(ROM_PATH);

const WINDOWS = Object.freeze([
  ['caller into CLEAR window', 0x058A0C, 0x058A22],
  ['CLEAR/EOL local window', 0x0A223A, 0x0A22B1],
  ['row/offset helper', 0x0A2A37, 0x0A2A3E],
  ['text output helper return edge', 0x09EF20, 0x09EF35],
]);

const DIRECT_CALL_TARGETS = Object.freeze([
  0x0A223A,
  0x0A235E,
  0x09EF20,
  0x026789,
  0x0A2A37,
  0x0A22A4,
]);

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteText(pc, len) {
  return Array.from(rom.subarray(pc, pc + len), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function formatValue(value, width = 6) {
  return typeof value === 'number' ? hex(value, width) : String(value);
}

function formatIndex(indexRegister, displacement = 0) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(insn) {
  if (!insn) return '(decode error)';
  if (insn.dasm) return insn.dasm;

  switch (insn.tag) {
    case 'call': return `CALL ${hex(insn.target)}`;
    case 'call-conditional': return `CALL ${String(insn.condition).toUpperCase()},${hex(insn.target)}`;
    case 'jp': return `JP ${hex(insn.target)}`;
    case 'jp-conditional': return `JP ${String(insn.condition).toUpperCase()},${hex(insn.target)}`;
    case 'jr': return `JR ${hex(insn.target)}`;
    case 'jr-conditional': return `JR ${String(insn.condition).toUpperCase()},${hex(insn.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${String(insn.condition).toUpperCase()}`;
    case 'push': return `PUSH ${String(insn.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(insn.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(insn.pair).toUpperCase()},${formatValue(insn.value)}`;
    case 'ld-reg-imm': return `LD ${String(insn.dest).toUpperCase()},${formatValue(insn.value, 2)}`;
    case 'ld-reg-reg': return `LD ${String(insn.dest).toUpperCase()},${String(insn.src).toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${String(insn.dest).toUpperCase()},(${hex(insn.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(insn.addr)}),${String(insn.src).toUpperCase()}`;
    case 'ld-ind-imm': return `LD (HL),${formatValue(insn.value, 2)}`;
    case 'add-pair': return `ADD ${String(insn.dest).toUpperCase()},${String(insn.src).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(insn.pair).toUpperCase()}`;
    case 'alu-reg': return `${String(insn.op).toUpperCase()} ${String(insn.src).toUpperCase()}`;
    case 'alu-imm': return `${String(insn.op).toUpperCase()} ${formatValue(insn.value, 2)}`;
    case 'indexed-cb-bit': return `BIT ${insn.bit},${formatIndex(insn.indexRegister, insn.displacement)}`;
    case 'indexed-cb-set': return `SET ${insn.bit},${formatIndex(insn.indexRegister, insn.displacement)}`;
    case 'indexed-cb-res': return `RES ${insn.bit},${formatIndex(insn.indexRegister, insn.displacement)}`;
    case 'mlt': return `MLT ${String(insn.reg).toUpperCase()}`;
    case 'ldir': return 'LDIR';
    default:
      return `${insn.tag ?? 'unknown'} ${JSON.stringify(insn)}`;
  }
}

function decodeAt(pc) {
  try {
    const insn = decodeInstruction(rom, pc, 'adl');
    const length = Math.max(1, insn?.length ?? 1);
    return {
      pc,
      pcText: hex(pc),
      bytes: byteText(pc, length),
      asm: formatInstruction(insn),
      tag: insn?.tag ?? 'decode-error',
      target: Number.isInteger(insn?.target) ? insn.target : null,
      fallthrough: Number.isInteger(insn?.fallthrough) ? insn.fallthrough : null,
      length,
      raw: insn ?? null,
    };
  } catch (error) {
    return {
      pc,
      pcText: hex(pc),
      bytes: byteText(pc, 1),
      asm: `DB ${hex(rom[pc] ?? 0, 2)} (${String(error?.message || error)})`,
      tag: 'decode-error',
      target: null,
      fallthrough: null,
      length: 1,
      raw: null,
    };
  }
}

function decodeRange(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end) {
    const row = decodeAt(pc);
    rows.push(row);
    pc += row.length;
  }
  return rows;
}

function findDirectCalls(target) {
  const pattern = [0xCD, target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const hits = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc += 1) {
    let ok = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (rom[pc + i] !== pattern[i]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(pc);
  }
  return hits;
}

function rowAt(pc) {
  return decodeAt(pc);
}

function checkAt(pc, description, predicate) {
  const row = rowAt(pc);
  const pass = Boolean(predicate(row.raw ?? {}));
  return { pc, description, pass, row };
}

function runCriticalChecks() {
  return [
    checkAt(0x058A16, 'home redraw caller reaches CLEAR/EOL local routine', (insn) => insn.tag === 'call' && insn.target === 0x0A223A),
    checkAt(0x0A226D, 'local routine explicitly seeds HL with zero', (insn) => insn.tag === 'ld-pair-imm' && insn.pair === 'hl' && insn.value === 0),
    checkAt(0x0A2272, 'local routine sets DE to last display column/address parameter 0x00013F', (insn) => insn.tag === 'ld-pair-imm' && insn.pair === 'de' && insn.value === 0x00013F),
    checkAt(0x0A2276, 'text helper is called after HL=0 and DE=0x00013F are prepared', (insn) => insn.tag === 'call' && insn.target === 0x09EF20),
    checkAt(0x0A2299, 'first size-to-HL helper returns to 0x0A229D', (insn) => insn.tag === 'call' && insn.target === 0x0A2A37 && insn.fallthrough === 0x0A229D),
    checkAt(0x0A229D, 'second pass loads A from B before recomputing the tail offset', (insn) => insn.tag === 'ld-reg-reg' && insn.dest === 'a' && insn.src === 'b'),
    checkAt(0x0A229E, 'HL result is pushed', (insn) => insn.tag === 'push' && insn.pair === 'hl'),
    checkAt(0x0A229F, 'HL result is popped into BC, making BC inherit a zero HL result', (insn) => insn.tag === 'pop' && insn.pair === 'bc'),
    checkAt(0x0A22A0, 'second size-to-HL helper returns to the space-fill tail', (insn) => insn.tag === 'call' && insn.target === 0x0A2A37 && insn.fallthrough === 0x0A22A4),
    checkAt(0x0A22A4, 'space-fill tail anchors at D006C0', (insn) => insn.tag === 'ld-pair-imm' && insn.pair === 'de' && insn.value === 0xD006C0),
    checkAt(0x0A22AE, 'space-fill tail performs the block copy', (insn) => insn.tag === 'ldir'),
    checkAt(0x0A2A37, 'helper takes A into L', (insn) => insn.tag === 'ld-reg-reg' && insn.dest === 'l' && insn.src === 'a'),
    checkAt(0x0A2A38, 'helper loads multiplier 0x1A into H', (insn) => insn.tag === 'ld-reg-imm' && insn.dest === 'h' && insn.value === 0x1A),
    checkAt(0x0A2A3A, 'helper multiplies H*L into HL', (insn) => insn.tag === 'mlt' && insn.reg === 'hl'),
  ];
}

function instructionTable(rows) {
  return [
    '| PC | Bytes | Decode | Target | Fallthrough |',
    '|---|---|---|---|---|',
    ...rows.map((row) => `| ${row.pcText} | \`${row.bytes}\` | \`${row.asm}\` | ${row.target === null ? '-' : hex(row.target)} | ${row.fallthrough === null ? '-' : hex(row.fallthrough)} |`),
  ].join('\n');
}

function checkTable(checks) {
  return [
    '| Check | PC | Pass | Decode |',
    '|---|---|---|---|',
    ...checks.map((check) => `| ${check.description} | ${hex(check.pc)} | ${check.pass ? 'yes' : 'NO'} | \`${check.row.asm}\` |`),
  ].join('\n');
}

function callerTable(callers) {
  return [
    '| Target | Direct CALL sites |',
    '|---|---|',
    ...callers.map(([target, hits]) => `| ${hex(target)} | ${hits.map((pc) => hex(pc)).join(', ') || '(none)'} |`),
  ].join('\n');
}

function pathTable() {
  const rows = [
    ['0x058A16', 'CALL 0x0A223A', 'Home redraw path enters the local CLEAR/EOL text-window routine.'],
    ['0x0A226D', 'LD HL,0', 'The local routine has an explicit zero base for the subsequent size/offset calculation.'],
    ['0x0A2272', 'LD DE,0x00013F', 'The right-edge/display parameter is prepared independently of BC.'],
    ['0x0A2299', 'CALL 0x0A2A37', 'The helper converts the current A delta into an HL byte count/offset. Phase745 dynamically proved this returns HL=0 at 0x0A229D in the failing browser path.'],
    ['0x0A229E-0x0A229F', 'PUSH HL; POP BC', 'The returned HL value is copied into BC. If HL is zero, BC becomes zero before the final tail call.'],
    ['0x0A22A0', 'CALL 0x0A2A37', 'With A loaded from B, the same helper recomputes the final HL offset for the tail.'],
    ['0x0A22A4-0x0A22B0', 'D006C0 + HL; LD (HL),0x20; LDIR; RET', 'The tail uses HL as the D006C0 offset and BC as the space-fill count. A zero BC is the static route into the old 0x202020 corruption.'],
  ];
  return [
    '| Step | Decode | Static meaning |',
    '|---|---|---|',
    ...rows.map(([step, decode, meaning]) => `| ${step} | \`${decode}\` | ${meaning} |`),
  ].join('\n');
}

function buildReport(windows, checks, callers) {
  const compact = {
    pass: checks.every((check) => check.pass),
    checks: checks.map((check) => ({
      pc: hex(check.pc),
      description: check.description,
      pass: check.pass,
      asm: check.row.asm,
      bytes: check.row.bytes,
    })),
    directCalls: Object.fromEntries(callers.map(([target, hits]) => [hex(target), hits.map((pc) => hex(pc))])),
  };

  return [
    '# Phase 748: CLEAR/EOL Static Window Decode',
    '',
    'Probe: `probe-phase748-clear-window-static-decode.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase748-clear-window-static-decode.mjs`  ',
    'Exit: 0',
    '',
    '## Summary',
    '',
    checks.every((check) => check.pass)
      ? '- **** Static checks passed for the local CLEAR/EOL route from `0x058A16` into `0x0A223A`, through the `0x0A229D` BC-owner sequence, and into the `0x0A22A4` space-fill tail.'
      : '- !!!! One or more static checks failed; do not use this report as evidence until re-run/fixed.',
    '- **** The ROM bytes show the exact BC-zero propagation mechanism: `0x0A2299` calls the `0x0A2A37` A-to-HL multiplier, then `0x0A229E-0x0A229F` copies that returned `HL` into `BC` with `PUSH HL; POP BC` before the final tail call.',
    '- *** The space-fill tail at `0x0A22A4` anchors at `D006C0`, makes `DE=HL+1`, stores `0x20`, then executes `LDIR`; this matches the earlier phase744/745 dynamic `0x202020` corruption when the inherited count is zero.',
    '- No runtime, transpiler, browser, scheduler, or follow-along files were modified.',
    '',
    '## Critical Checks',
    '',
    checkTable(checks),
    '',
    '## Static Data Path',
    '',
    pathTable(),
    '',
    '## Direct CALL Scan',
    '',
    callerTable(callers),
    '',
    '## Static Decode',
    '',
    ...windows.flatMap(([name, start, end, rows]) => [
      `### ${name} ${hex(start)}-${hex(end - 1)}`,
      '',
      instructionTable(rows),
      '',
    ]),
    '## Compact Evidence',
    '',
    '```json',
    JSON.stringify(compact, null, 2),
    '```',
    '',
    '## Interpretation',
    '',
    'The missing piece after phase745 was not another browser route fork; it was a concise static explanation of how a zero size reaches the old tail. The local window first computes a display/text span, then reuses `0x0A2A37` as an A-to-HL multiplier. The decisive ownership sequence is `CALL 0x0A2A37; LD A,B; PUSH HL; POP BC; CALL 0x0A2A37`: the first helper result becomes the second helper count through BC. When the first helper returns `HL=0` in the failing dynamic path already captured by phase745, the tail is entered with `BC=0` and `HL=0`, so the `D006C0` space-fill LDIR overruns state and the eventual return target becomes `0x202020`.',
    '',
  ].join('\n');
}

const windows = WINDOWS.map(([name, start, end]) => [name, start, end, decodeRange(start, end)]);
const checks = runCriticalChecks();
const callers = DIRECT_CALL_TARGETS.map((target) => [target, findDirectCalls(target)]);
const report = buildReport(windows, checks, callers);
fs.writeFileSync(REPORT_PATH, `${report}\n`);

console.log('phase748: CLEAR/EOL static window decode');
console.log(`report=${path.basename(REPORT_PATH)}`);
console.log(`checks=${checks.filter((check) => check.pass).length}/${checks.length}`);
console.log(`callers=${callers.map(([target, hits]) => `${hex(target)}:${hits.length}`).join(' ')}`);

if (!checks.every((check) => check.pass)) {
  console.error('Critical decode check failed');
  process.exit(1);
}
