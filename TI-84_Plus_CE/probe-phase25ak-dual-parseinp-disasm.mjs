#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const ADL_MODE = 'adl';

const OP1_ADDR = 0xD005F8;
const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;
const PARSEINP_ADDR = 0x099914;
const PUSH_ERROR_HANDLER_ADDR = 0x061DEF;
const POP_ERROR_HANDLER_ADDR = 0x061E20;
const JERROR_ADDR = 0x061DB2;

const RANGES = [
  {
    id: 'dual-parseinp-caller',
    title: '0x0973C8 dual-ParseInp caller',
    start: 0x0973C8,
    endExclusive: 0x097489,
    note: 'Contiguous control-flow region ends at 0x097488 ret; 0x097489 looks like the next routine.',
  },
  {
    id: 'shared-helper',
    title: '0x0973BA shared helper',
    start: 0x0973BA,
    endExclusive: 0x0973C8,
    note: 'Requested range 0x0973BA-0x0973C7.',
  },
  {
    id: 'close-edit-equ',
    title: '0x05E872 CloseEditEqu',
    start: 0x05E872,
    endExclusive: 0x05E8B6,
    note: 'Actual CloseEditEqu body returns at 0x05E89B; dump extends past that to satisfy the 64-byte minimum.',
  },
];

const KNOWN_ADDRS = new Map([
  [0x05E3E3, 'IsEditEmpty'],
  [0x05E820, 'BufToBtm'],
  [0x05E872, 'CloseEditEqu'],
  [0x061DB2, 'JError'],
  [0x061DEF, 'PushErrorHandler'],
  [0x061E20, 'PopErrorHandler'],
  [0x083623, 'CleanAll'],
  [0x099914, 'ParseInp'],
]);

const EXTRA_NOTES = new Map([
  [0x0973BE, 'IY+1 bit 2 gate'],
  [0x0973C3, 'shared helper flushes dirty edit buffer'],
  [0x0973D8, 'load UndefObj literal'],
  [0x0973DA, 'OP1[0] <- UndefObj'],
  [0x0973F8, 'ParseInp #1'],
  [0x097402, 'local error cleanup stub address'],
  [0x097406, 'arm PushErrorHandler'],
  [0x09740A, 'ParseInp #2'],
  [0x09740E, 'PopErrorHandler'],
  [0x097416, 'shared post-parse cleanup'],
  [0x097456, 'helper: returns Z for 0x04 / 0x05 / 0x32'],
  [0x09746E, 'error cleanup stub'],
  [0x097474, 'rethrow through JError'],
  [0x05E872, 'dirty edit buffer flag test'],
  [0x05E877, 'move cursor/buffer to bottom before flush'],
  [0x05E897, 'clear dirty edit buffer flag'],
]);

async function loadDecoder() {
  const src = fs.readFileSync(DECODER_PATH, 'utf8');
  const url = `data:text/javascript;base64,${Buffer.from(src).toString('base64')}`;
  return import(url);
}

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesStr(buffer, pc, length) {
  return Array.from(buffer.slice(pc, pc + length), v =>
    v.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function fmtInst(inst) {
  const d = v => (v >= 0 ? `+${v}` : `${v}`);
  const pfx = inst.modePrefix ? `${inst.modePrefix} ` : '';

  let t = inst.tag;
  switch (inst.tag) {
    case 'nop': t = 'nop'; break;
    case 'ei': t = 'ei'; break;
    case 'di': t = 'di'; break;
    case 'halt': t = 'halt'; break;
    case 'ret': t = 'ret'; break;
    case 'ret-conditional': t = `ret ${inst.condition}`; break;
    case 'retn': t = 'retn'; break;
    case 'reti': t = 'reti'; break;
    case 'call': t = `call ${hex(inst.target)}`; break;
    case 'call-conditional': t = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': t = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': t = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': t = `jp (${inst.indirectRegister})`; break;
    case 'jr': t = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': t = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': t = `djnz ${hex(inst.target)}`; break;
    case 'rst': t = `rst ${hex(inst.target)}`; break;
    case 'push': t = `push ${inst.pair}`; break;
    case 'pop': t = `pop ${inst.pair}`; break;
    case 'ex-af': t = "ex af, af'"; break;
    case 'ex-de-hl': t = 'ex de, hl'; break;
    case 'ex-sp-pair': t = `ex (sp), ${inst.pair}`; break;
    case 'exx': t = 'exx'; break;
    case 'ld-pair-imm': t = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      t = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`; break;
    case 'ld-mem-pair': t = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': t = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem': t = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': t = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': t = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': t = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': t = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ixd': t = `ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ld-ixd-reg': t = `ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': t = `ld (${inst.indexRegister}${d(inst.displacement)}), ${hex(inst.value, 2)}`; break;
    case 'ld-sp-pair': t = `ld sp, ${inst.src}`; break;
    case 'ld-a-ind-bc': t = 'ld a, (bc)'; break;
    case 'ld-a-ind-de': t = 'ld a, (de)'; break;
    case 'ld-ind-bc-a': t = 'ld (bc), a'; break;
    case 'ld-ind-de-a': t = 'ld (de), a'; break;
    case 'inc-pair': t = `inc ${inst.pair}`; break;
    case 'dec-pair': t = `dec ${inst.pair}`; break;
    case 'inc-reg': t = `inc ${inst.reg}`; break;
    case 'dec-reg': t = `dec ${inst.reg}`; break;
    case 'inc-ind': t = `inc (${inst.indirectRegister})`; break;
    case 'dec-ind': t = `dec (${inst.indirectRegister})`; break;
    case 'add-pair': t = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': t = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': t = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'alu-ind': t = `${inst.op} (${inst.indirectRegister})`; break;
    case 'sbc-pair': t = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': t = `adc hl, ${inst.src}`; break;
    case 'bit-test': t = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': t = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-res': t = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': t = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-set': t = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': t = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'indexed-cb-bit': t = `bit ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-res': t = `res ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'indexed-cb-set': t = `set ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'ldir': t = 'ldir'; break;
    case 'lddr': t = 'lddr'; break;
    case 'ldi': t = 'ldi'; break;
    case 'ldd': t = 'ldd'; break;
    case 'cpir': t = 'cpir'; break;
    case 'cpdr': t = 'cpdr'; break;
    case 'cpi': t = 'cpi'; break;
    case 'cpd': t = 'cpd'; break;
    case 'neg': t = 'neg'; break;
    case 'cpl': t = 'cpl'; break;
    case 'ccf': t = 'ccf'; break;
    case 'scf': t = 'scf'; break;
    case 'daa': t = 'daa'; break;
    case 'rla': t = 'rla'; break;
    case 'rra': t = 'rra'; break;
    case 'rlca': t = 'rlca'; break;
    case 'rrca': t = 'rrca'; break;
    case 'mlt': t = `mlt ${inst.reg}`; break;
    case 'tst-reg': t = `tst a, ${inst.reg}`; break;
    case 'tst-ind': t = 'tst a, (hl)'; break;
    case 'tst-imm': t = `tst a, ${hex(inst.value, 2)}`; break;
    case 'lea': t = `lea ${inst.dest}, ${inst.base}${d(inst.displacement)}`; break;
    case 'rotate': t = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': t = `${inst.op} (${inst.indirectRegister})`; break;
    case 'indexed-cb-rotate': t = `${inst.op} (${inst.indexRegister}${d(inst.displacement)})`; break;
    case 'in-a-imm': t = `in a, (${hex(inst.port, 2)})`; break;
    case 'out-imm-a': t = `out (${hex(inst.port, 2)}), a`; break;
    case 'in-reg': t = `in ${inst.dest}, (c)`; break;
    case 'out-reg': t = `out (c), ${inst.src}`; break;
    case 'im': t = `im ${inst.mode_num}`; break;
    case 'ld-i-a': t = 'ld i, a'; break;
    case 'ld-a-i': t = 'ld a, i'; break;
    case 'ld-r-a': t = 'ld r, a'; break;
    case 'ld-a-r': t = 'ld a, r'; break;
    default: {
      const skip = new Set(['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough']);
      const parts = Object.entries(inst)
        .filter(([k]) => !skip.has(k))
        .map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v) : v}`);
      t = parts.length ? `${inst.tag} ${parts.join(' ')}` : inst.tag;
    }
  }
  return `${pfx}${t}`;
}

function splitMnemonicOperands(text) {
  const idx = text.indexOf(' ');
  if (idx === -1) return { mnemonic: text, operands: '' };
  return {
    mnemonic: text.slice(0, idx),
    operands: text.slice(idx + 1),
  };
}

function decodeRange(buffer, decode, start, endExclusive) {
  const rows = [];
  let pc = start;
  while (pc < endExclusive) {
    const inst = decode(buffer, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      rows.push({
        pc,
        bytes: bytesStr(buffer, pc, 1),
        text: `db ${hex(buffer[pc] ?? 0, 2)}`,
        inst: null,
      });
      pc += 1;
      continue;
    }
    rows.push({
      pc,
      bytes: bytesStr(buffer, pc, inst.length),
      text: fmtInst(inst),
      inst,
    });
    pc += inst.length;
  }
  return rows;
}

function findByPc(rows, pc) {
  return rows.find(row => row.pc === pc);
}

function callsTo(rows, target) {
  return rows.filter(row => row.inst && row.inst.tag === 'call' && row.inst.target === target);
}

function refsAbsoluteAddress(inst, addr) {
  if (!inst) return false;
  if ('addr' in inst && inst.addr === addr) return true;
  if ('value' in inst && inst.value === addr) return true;
  return false;
}

function buildObjectTypeMap(incText) {
  const map = new Map();
  const regex = /^\?([A-Za-z0-9_]+Obj)\s*:=\s*([0-9A-F]+)h\b/gm;
  let match;
  while ((match = regex.exec(incText)) !== null) {
    map.set(parseInt(match[2], 16), match[1]);
  }
  return map;
}

function targetLabel(addr) {
  const label = KNOWN_ADDRS.get(addr);
  return label ? ` (${label})` : '';
}

function noteForRow(row) {
  const parts = [];
  const extra = EXTRA_NOTES.get(row.pc);
  if (extra) parts.push(extra);
  if (row.inst && row.inst.tag === 'call' && KNOWN_ADDRS.has(row.inst.target)) {
    parts.push(KNOWN_ADDRS.get(row.inst.target));
  }
  if (row.inst && row.inst.tag === 'jp' && KNOWN_ADDRS.has(row.inst.target)) {
    parts.push(KNOWN_ADDRS.get(row.inst.target));
  }
  return parts.length ? ` ; ${parts.join(' | ')}` : '';
}

function printRange(spec, rows) {
  console.log(`--- ${spec.title} (${hex(spec.start)} - ${hex(spec.endExclusive - 1)}) ---`);
  if (spec.note) console.log(`# ${spec.note}`);
  for (const row of rows) {
    const { mnemonic, operands } = splitMnemonicOperands(row.text);
    console.log(
      `${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${mnemonic.padEnd(8)} ${operands}${noteForRow(row)}`,
    );
  }
  console.log('');
}

function summarize0973C8(rows, objectTypes) {
  const type0E = objectTypes.get(0x0E) ?? 'UNKNOWN';
  const parseCallRows = callsTo(rows, PARSEINP_ADDR);
  const afterSecond = rows.filter(row => row.pc > 0x09740A && row.pc < 0x097489);
  const afterSecondCalls = afterSecond
    .filter(row => row.inst && row.inst.tag === 'call')
    .map(row => `${hex(row.pc)} -> ${hex(row.inst.target)}${targetLabel(row.inst.target)}`);
  const op1AfterSecond = afterSecond.filter(row => row.inst && refsAbsoluteAddress(row.inst, OP1_ADDR));
  const pointerRefs = rows.filter(row => row.inst && (
    refsAbsoluteAddress(row.inst, BEGPC_ADDR) ||
    refsAbsoluteAddress(row.inst, CURPC_ADDR) ||
    refsAbsoluteAddress(row.inst, ENDPC_ADDR)
  ));

  console.log('0x0973C8 analysis:');
  console.log(`- OP1[0] type literal: ${hex(0x0E, 2)} = ${type0E} (from ti84pceg.inc).`);
  console.log(`- Exact write sequence: ${hex(0x0973D8)} ${findByPc(rows, 0x0973D8)?.text} ; ${hex(0x0973DA)} ${findByPc(rows, 0x0973DA)?.text}.`);
  console.log(`- ParseInp call sites: ${parseCallRows.map(row => hex(row.pc)).join(', ')}.`);
  console.log(`- Protected second parse arm: ${hex(0x097402)} ${findByPc(rows, 0x097402)?.text} ; ${hex(0x097406)} ${findByPc(rows, 0x097406)?.text} ; ${hex(0x09740E)} ${findByPc(rows, 0x09740E)?.text}.`);
  console.log(`- Local error stub: ${hex(0x09746E)} ${findByPc(rows, 0x09746E)?.text} ; ${hex(0x09746F)} ${findByPc(rows, 0x09746F)?.text} ; ${hex(0x097473)} ${findByPc(rows, 0x097473)?.text} ; ${hex(0x097474)} ${findByPc(rows, 0x097474)?.text}.`);
  console.log(`- After second ParseInp there is no direct OP1 access before return: ${op1AfterSecond.length === 0 ? 'yes' : 'no'}.`);
  console.log(`- Post-second-parse calls: ${afterSecondCalls.join(', ')}.`);
  console.log(`- Helper 0x097456 returns Z for current byte values 0x04, 0x05, or 0x32, which steers control into the PushErrorHandler-wrapped ParseInp path.`);
  console.log(`- begPC/curPC/endPC references inside 0x0973C8 region: ${pointerRefs.length}.`);
  console.log('');
}

function summarize0973BA(rows) {
  const pointerRefs = rows.filter(row => row.inst && (
    refsAbsoluteAddress(row.inst, BEGPC_ADDR) ||
    refsAbsoluteAddress(row.inst, CURPC_ADDR) ||
    refsAbsoluteAddress(row.inst, ENDPC_ADDR)
  ));

  console.log('0x0973BA analysis:');
  console.log(`- Setup sequence: ${hex(0x0973BA)} ${findByPc(rows, 0x0973BA)?.text} ; ${hex(0x0973BE)} ${findByPc(rows, 0x0973BE)?.text} ; ${hex(0x0973C3)} ${findByPc(rows, 0x0973C3)?.text}.`);
  console.log('- This helper does not initialize begPC, curPC, endPC, or the ParseInp token buffer.');
  console.log(`- begPC/curPC/endPC references inside helper: ${pointerRefs.length}.`);
  console.log('- Behavior: always call 0x03FBF9 first, then if IY+1 bit 2 is set call CloseEditEqu, otherwise return immediately.');
  console.log('');
}

function summarize05E872(rows) {
  const actual = rows.filter(row => row.pc < 0x05E89C);
  const pointerRefs = actual.filter(row => row.inst && (
    refsAbsoluteAddress(row.inst, BEGPC_ADDR) ||
    refsAbsoluteAddress(row.inst, CURPC_ADDR) ||
    refsAbsoluteAddress(row.inst, ENDPC_ADDR)
  ));

  console.log('0x05E872 analysis:');
  console.log(`- Dirty flag gate: ${hex(0x05E872)} ${findByPc(rows, 0x05E872)?.text} ; ${hex(0x05E876)} ${findByPc(rows, 0x05E876)?.text}.`);
  console.log(`- Flush body: ${hex(0x05E877)} ${findByPc(rows, 0x05E877)?.text} ; ${hex(0x05E87B)} ${findByPc(rows, 0x05E87B)?.text} ; ${hex(0x05E883)} ${findByPc(rows, 0x05E883)?.text} ; ${hex(0x05E88C)} ${findByPc(rows, 0x05E88C)?.text}.`);
  console.log(`- Dirty flag clear: ${hex(0x05E897)} ${findByPc(rows, 0x05E897)?.text}.`);
  console.log('- This confirms the session-95 dirty-buffer hypothesis: the same IY+1 bit 2 flag gates the flush and gets cleared after CloseEditEqu commits state.');
  console.log('- No begPC/curPC/endPC references appear in the actual CloseEditEqu body.');
  console.log(`- begPC/curPC/endPC references inside 0x05E872 body: ${pointerRefs.length}.`);
  console.log('');
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const decoderMod = await loadDecoder();
  const decode = decoderMod.decodeInstruction;
  const objectTypes = buildObjectTypeMap(fs.readFileSync(INC_PATH, 'utf8'));
  const type0E = objectTypes.get(0x0E) ?? 'UNKNOWN';

  const decodedRanges = RANGES.map(spec => ({
    spec,
    rows: decodeRange(rom, decode, spec.start, spec.endExclusive),
  }));

  console.log('=== Phase 25AK: dual-ParseInp disassembly ===');
  console.log(`Type 0x0E cross-reference: ${type0E}`);
  console.log(`Known error helpers: ${hex(PUSH_ERROR_HANDLER_ADDR)} PushErrorHandler, ${hex(POP_ERROR_HANDLER_ADDR)} PopErrorHandler, ${hex(JERROR_ADDR)} JError.`);
  console.log('');

  summarize0973C8(decodedRanges[0].rows, objectTypes);
  summarize0973BA(decodedRanges[1].rows);
  summarize05E872(decodedRanges[2].rows);

  for (const entry of decodedRanges) {
    printRange(entry.spec, entry.rows);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
