#!/usr/bin/env node

/**
 * probe-phase300-event-loop-kbd-trace.mjs
 *
 * Phase 300 - static end-to-end keyboard/event-loop trace from ROM bytes.
 *
 * Static chain recovered from this ROM:
 *   IM1 IRQ vector:
 *     0x000038 -> JP 0x0006F3
 *
 *   IRQ/service scanner gate:
 *     0x0013FC  in0 a, (0x03)
 *     0x0013FF  bit 4, a
 *     0x001401  call nz, 0x015930
 *     Note: 0x001401 is an instruction boundary, but it is also reached by
 *     ordinary fallthrough from 0x0013FC/0x0013FF inside the same block.
 *
 *   Scanner wrapper / copy trampoline:
 *     0x015930 ... 0x01598B ld ix, 0x0159BD
 *     0x015990 call 0x000D7E
 *     0x000D7E copies 0x011A bytes from ROM 0x0159BF.. to RAM and executes
 *     the copied scanner via jp (ix). The computed RAM destination start is
 *     0xD18B62.
 *
 *   Scan-code byte:
 *     The RAM-resident scanner writes the raw scan code to 0xD00587.
 *
 *   GetCSC veneer:
 *     0x02014C -> jp 0x03FA09
 *     0x03FA09 loads A from 0xD00587, clears that byte, and returns.
 *
 *   Event loop / CoorMon:
 *     0x020150 -> jp 0x08C331
 *     0x08C362 call 0x02FCB3
 *     0x02FDBE call 0x03FA09
 *     0x08C36E ld (0xD0058C), a
 *     0x08C44D..0x08C530 classify/tokenize A, optionally stage an extended
 *     token in 0xD0058E, then call 0x022331.
 *
 *   CallMain / cxMain:
 *     0x020188 -> jp 0x08C72F
 *     0x08C735 ld hl, (0xD007CA)
 *     0x08C745 jp (hl)
 *
 *   Home-app local dispatch:
 *     0x0585E9 is the cxMain body entry used by the home app context.
 *     0x058604 jp nz, 0x05877A
 *     0x0587E0 jp nz, 0x0589E5
 *     0x0589E5 is the key-comparison cascade for 0x0B / 0x0A / 0x09 / 0x0C /
 *     0x0D ...; it is not the initial jp (hl) dispatch target.
 *
 * Address note:
 *   0x058757 is not an instruction boundary in this ROM. It lies inside the
 *   instruction at 0x058755. The nearest local entry points in this handler
 *   cluster are 0x058762 and 0x05877A.
 */

process.emitWarning = () => {};

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const IRQ_VECTOR = 0x000038;
const IRQ_PROLOGUE = 0x0006F3;
const IRQ_SCAN_GATE_START = 0x0013C3;
const IRQ_SCAN_GATE_CALL = 0x001401;
const SCANNER_WRAPPER = 0x015930;
const SCANNER_IX_LOAD = 0x01598B;
const COPY_HELPER = 0x000D7E;
const COPY_HELPER_EXIT = 0x000DB6;
const COPY_SCRATCH_END = 0xD18C7C;
const PARAM_BLOCK = 0x0159BD;
const SCAN_CODE_RAM = 0xD00587;
const GETCSC_VENEER = 0x02014C;
const GETCSC_IMPL = 0x03FA09;
const COORMON_VENEER = 0x020150;
const COORMON_IMPL = 0x08C331;
const CALLMAIN_VENEER = 0x020188;
const CALLMAIN_IMPL = 0x08C72F;
const GETKEY_HELPER = 0x02FCB3;
const GETKEY_TO_GETCSC = 0x02FDBE;
const HOME_CXMAIN_ENTRY = 0x0585E9;
const HOME_LOCAL_BRANCH = 0x05877A;
const HOME_CLASS_CASCADE = 0x0589E5;
const REQUESTED_LOCAL_ADDR = 0x058757;

const CONTROL_OPS = new Map([
  [0xCD, { kind: 'call', cond: '' }],
  [0xC4, { kind: 'call', cond: 'nz' }],
  [0xCC, { kind: 'call', cond: 'z' }],
  [0xD4, { kind: 'call', cond: 'nc' }],
  [0xDC, { kind: 'call', cond: 'c' }],
  [0xE4, { kind: 'call', cond: 'po' }],
  [0xEC, { kind: 'call', cond: 'pe' }],
  [0xF4, { kind: 'call', cond: 'p' }],
  [0xFC, { kind: 'call', cond: 'm' }],
  [0xC3, { kind: 'jp', cond: '' }],
  [0xC2, { kind: 'jp', cond: 'nz' }],
  [0xCA, { kind: 'jp', cond: 'z' }],
  [0xD2, { kind: 'jp', cond: 'nc' }],
  [0xDA, { kind: 'jp', cond: 'c' }],
  [0xE2, { kind: 'jp', cond: 'po' }],
  [0xEA, { kind: 'jp', cond: 'pe' }],
  [0xF2, { kind: 'jp', cond: 'p' }],
  [0xFA, { kind: 'jp', cond: 'm' }],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read16LE(offset) {
  return ((rom[offset] ?? 0) | ((rom[offset + 1] ?? 0) << 8)) >>> 0;
}

function read24LE(offset) {
  return (
    (rom[offset] ?? 0) |
    ((rom[offset + 1] ?? 0) << 8) |
    ((rom[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesHex(start, length) {
  return Array.from(rom.subarray(start, start + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function fmtDisp(value) {
  const abs = Math.abs(Number(value) || 0);
  return `${value < 0 ? '-' : '+'}0x${abs.toString(16).toUpperCase().padStart(2, '0')}`;
}

function safeDecode(pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc, mode);
  } catch {
    return null;
  }
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  const disp = inst.displacement ?? 0;
  const idx = `(${String(inst.indexRegister ?? 'ix').toUpperCase()}${fmtDisp(disp)})`;

  switch (inst.tag) {
    case 'nop': return 'nop';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'halt': return 'halt';
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${String(inst.indirectRegister).toUpperCase()})`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'push': return `push ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `pop ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `ld ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`
        : `ld ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm': return `ld ${String(inst.dest ?? inst.dst).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `ld ${String(inst.dest ?? inst.dst).toUpperCase()}, (${String(inst.src ?? inst.ptr ?? inst.pair).toUpperCase()})`;
    case 'ld-ind-reg': return `ld (${String(inst.dest ?? inst.ptr ?? inst.pair).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `ld ${String(inst.dest ?? inst.dst).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm': return `ld (${String(inst.pair ?? 'HL').toUpperCase()}), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': return `ld ${String(inst.dest).toUpperCase()}, ${idx}`;
    case 'ld-ixd-reg': return `ld ${idx}, ${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm': return `ld ${idx}, ${hexByte(inst.value)}`;
    case 'inc-pair': return `inc ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `dec ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `inc ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `dec ${String(inst.reg).toUpperCase()}`;
    case 'add-pair': return `add ${String(inst.dest ?? 'HL').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'adc-pair': return `adc hl, ${String(inst.src).toUpperCase()}`;
    case 'sbc-pair': return `sbc hl, ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return inst.op === 'xor' && String(inst.src).toLowerCase() === 'a'
        ? 'xor a'
        : `${inst.op} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'bit-test': return `bit ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `set ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `res ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${idx}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${idx}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${idx}`;
    case 'in0': return `in0 ${String(inst.reg ?? inst.dest ?? 'a').toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${String(inst.reg ?? inst.src ?? 'a').toUpperCase()}`;
    case 'in-reg': return `in ${String(inst.reg ?? inst.dest ?? 'a').toUpperCase()}, (c)`;
    case 'out-reg': return `out (c), ${String(inst.reg ?? inst.src ?? 'a').toUpperCase()}`;
    case 'ldir': return 'ldir';
    case 'lddr': return 'lddr';
    case 'ex-af': return "ex af, af'";
    case 'exx': return 'exx';
    case 'ex-de-hl': return 'ex de, hl';
    case 'rsmix': return 'rsmix';
    case 'im': return `im ${inst.value}`;
    case 'ld-special':
      return `ld ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    default:
      return inst.dasm ?? inst.tag ?? '??';
  }
}

function decodeRows(start, options = {}) {
  const {
    endExclusive = rom.length,
    maxInstructions = Number.POSITIVE_INFINITY,
    mode = 'adl',
  } = options;

  const rows = [];
  let pc = start;
  while (pc < endExclusive && rows.length < maxInstructions) {
    const inst = safeDecode(pc, mode);
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      length,
      bytes: bytesHex(pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc += length;
  }
  return rows;
}

function findControlRefs(target) {
  const refs = [];
  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    const meta = CONTROL_OPS.get(rom[pc]);
    if (!meta) continue;
    if (read24LE(pc + 1) !== (target >>> 0)) continue;
    const text = meta.cond
      ? `${meta.kind} ${meta.cond}, ${hex(target)}`
      : `${meta.kind} ${hex(target)}`;
    refs.push({ pc, kind: meta.kind, cond: meta.cond, text });
  }
  return refs;
}

function findCoveringRow(start, endExclusive, addr) {
  const rows = decodeRows(start, { endExclusive });
  return rows.find((row) => addr >= row.pc && addr < row.pc + row.length) ?? null;
}

function printHeader(title) {
  console.log('\n' + '='.repeat(78));
  console.log(title);
  console.log('='.repeat(78));
}

function printRows(rows, notes = new Map()) {
  for (const row of rows) {
    const note = notes.get(row.pc);
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}${note ? `  ; ${note}` : ''}`);
  }
}

function printRefList(label, target, options = {}) {
  const { limit = 12, extraNote = null } = options;
  const refs = findControlRefs(target);
  console.log(`  ${label} ${hex(target)}: ${refs.length} direct CALL/JP ref(s)`);
  for (const ref of refs.slice(0, limit)) {
    console.log(`    ${hex(ref.pc)}  ${ref.text}`);
  }
  if (refs.length > limit) {
    console.log(`    ... ${refs.length - limit} more`);
  }
  if (extraNote) {
    console.log(`    note: ${extraNote}`);
  }
}

function main() {
  const copyLen = read16LE(PARAM_BLOCK);
  const copySource = PARAM_BLOCK + 2;
  const copyRamStart = (COPY_SCRATCH_END - copyLen) & 0xFFFFFF;
  const localCover = findCoveringRow(0x058755, 0x058762, REQUESTED_LOCAL_ADDR);

  console.log('probe-phase300-event-loop-kbd-trace.mjs');
  console.log('Phase 300 - Event loop keyboard path trace from raw ROM bytes');

  printHeader('CHAIN SUMMARY');
  const summaryLines = [
    `1. IRQ vector: ${hex(IRQ_VECTOR)} -> ${hex(IRQ_PROLOGUE)}`,
    `2. Scanner gate: ${hex(0x0013FC)} -> ${hex(0x0013FF)} -> ${hex(IRQ_SCAN_GATE_CALL)} call nz, ${hex(SCANNER_WRAPPER)}`,
    `3. Scanner wrapper: ${hex(SCANNER_WRAPPER)} -> ${hex(SCANNER_IX_LOAD)} ld ix, ${hex(PARAM_BLOCK)} -> ${hex(0x015990)} call ${hex(COPY_HELPER)}`,
    `4. Copy trampoline: ${hex(COPY_HELPER)} copies ${hex(copyLen, 4)} bytes from ${hex(copySource)} to RAM ${hex(copyRamStart)} then jp (ix)`,
    `5. Raw scan-code byte: scanner writes ${hex(SCAN_CODE_RAM)}`,
    `6. GetCSC veneer: ${hex(GETCSC_VENEER)} -> ${hex(GETCSC_IMPL)}`,
    `7. CoorMon veneer: ${hex(COORMON_VENEER)} -> ${hex(COORMON_IMPL)} -> ${hex(0x08C362)} call ${hex(GETKEY_HELPER)} -> ${hex(GETKEY_TO_GETCSC)} call ${hex(GETCSC_IMPL)}`,
    `8. CoorMon tokenization: ${hex(0x08C36E)} stores A to ${hex(0xD0058C)}; ${hex(0x08C44D)}..${hex(0x08C530)} classify/stage token; ${hex(0x08C532)} call ${hex(0x022331)}`,
    `9. CallMain veneer: ${hex(CALLMAIN_VENEER)} -> ${hex(CALLMAIN_IMPL)} -> ${hex(0x08C735)} load HL=(0xD007CA) -> ${hex(0x08C745)} jp (hl)`,
    `10. Home cxMain body: ${hex(HOME_CXMAIN_ENTRY)} -> ${hex(0x058604)} jp nz, ${hex(HOME_LOCAL_BRANCH)} -> ${hex(0x0587E0)} jp nz, ${hex(HOME_CLASS_CASCADE)}`,
    `11. cxMain comparison cascade: ${hex(HOME_CLASS_CASCADE)} tests 0x0B / 0x0A / 0x09 / 0x0C / 0x0D ...`,
  ];
  for (const line of summaryLines) {
    console.log(`  ${line}`);
  }
  console.log(`  Requested local address ${hex(REQUESTED_LOCAL_ADDR)} is inside ${hex(localCover.pc)}: ${localCover.text}`);

  printHeader('A. IRQ VECTOR AND 0x001401');
  printRefList('Exact refs to', IRQ_SCAN_GATE_CALL, {
    extraNote: `${hex(IRQ_SCAN_GATE_CALL)} is also reached by linear fallthrough from ${hex(0x0013FC)} / ${hex(0x0013FF)} inside the scanner-gate block.`,
  });
  printRefList('Exact refs to', SCANNER_WRAPPER, {
    extraNote: 'The scanner wrapper has a single direct ref in this path: the conditional call at 0x001401.',
  });
  console.log('\n  IM1 vector entry:');
  printRows(decodeRows(IRQ_VECTOR, { endExclusive: 0x000047 }));
  console.log('\n  IRQ prologue window:');
  printRows(decodeRows(IRQ_PROLOGUE, { endExclusive: 0x00071E }));
  console.log('\n  Scanner-gate block containing 0x001401:');
  const irqNotes = new Map([
    [0x0013C3, 'service block entry used by this path'],
    [0x0013FC, 'read interrupt/status port'],
    [0x0013FF, 'bit 4 decides whether the keyboard scanner runs'],
    [IRQ_SCAN_GATE_CALL, 'scanner wrapper call site'],
  ]);
  printRows(decodeRows(IRQ_SCAN_GATE_START, { endExclusive: 0x001429 }), irqNotes);

  printHeader('B. SCANNER WRAPPER AND COPY TRAMPOLINE');
  console.log(`  Param block ${hex(PARAM_BLOCK)}: length=${hex(copyLen, 4)} source=${hex(copySource)} computed_ram_start=${hex(copyRamStart)}`);
  const wrapperNotes = new Map([
    [SCANNER_WRAPPER, 'wrapper entry'],
    [SCANNER_IX_LOAD, 'load scanner param block into IX'],
    [0x015990, 'invoke copy trampoline'],
  ]);
  printRows(decodeRows(SCANNER_WRAPPER, { endExclusive: 0x015994 }), wrapperNotes);
  console.log('\n  Copy trampoline:');
  const copyNotes = new Map([
    [COPY_HELPER, 'helper entry'],
    [0x000D89, 'scratch end pointer used to derive RAM destination'],
    [0x000D9B, 'copy loop'],
    [0x000DB4, 'jump into copied RAM code via IX'],
    [COPY_HELPER_EXIT, 'scanner return tail'],
  ]);
  printRows(decodeRows(COPY_HELPER, { endExclusive: 0x000DC1 }), copyNotes);

  printHeader('C. GETCSC VENEER AND INNER CALL');
  printRefList('Exact refs to', GETCSC_IMPL, {
    extraNote: `${hex(GETKEY_TO_GETCSC)} is the in-loop bridge from the CoorMon acquisition helper into GetCSC.`,
  });
  console.log('\n  Veneers:');
  printRows([
    ...decodeRows(GETCSC_VENEER, { endExclusive: GETCSC_VENEER + 4, maxInstructions: 1 }),
    ...decodeRows(COORMON_VENEER, { endExclusive: COORMON_VENEER + 4, maxInstructions: 1 }),
    ...decodeRows(CALLMAIN_VENEER, { endExclusive: CALLMAIN_VENEER + 4, maxInstructions: 1 }),
  ]);
  console.log('\n  CoorMon helper -> GetCSC bridge:');
  const bridgeNotes = new Map([
    [0x02FDBA, 'arm helper state before GetCSC'],
    [GETKEY_TO_GETCSC, 'direct call into GetCSC'],
  ]);
  printRows(decodeRows(0x02FDB6, { endExclusive: 0x02FDD0 }), bridgeNotes);
  console.log('\n  GetCSC body head:');
  const getCscNotes = new Map([
    [GETCSC_IMPL, `load HL with scan-code byte ${hex(SCAN_CODE_RAM)}`],
    [0x03FA0E, 'read current scan code into A'],
    [0x03FA0F, 'clear the scan-code byte after reading'],
  ]);
  printRows(decodeRows(GETCSC_IMPL, { endExclusive: 0x03FA1D }), getCscNotes);

  printHeader('D. COORMON TOKENIZATION AND DISPATCH');
  console.log('  CoorMon acquisition head:');
  const coormonHeadNotes = new Map([
    [0x08C359, 'clear pending key bytes when no forced state is present'],
    [0x08C362, 'call key acquisition helper'],
    [0x08C36E, 'store returned A to D0058C'],
  ]);
  printRows(decodeRows(0x08C359, { endExclusive: 0x08C389 }), coormonHeadNotes);
  console.log('\n  CoorMon classification/token staging window:');
  const coormonClassNotes = new Map([
    [0x08C44D, 'dispatch begins here after A is acquired'],
    [0x08C463, 'read staged extended-token byte D0058E'],
    [0x08C49B, 'emit 0xFA pseudo-token'],
    [0x08C4F1, 'map 0xEF -> 0xA6'],
    [0x08C503, 'write staged token into D0058E'],
    [0x08C519, 'special-case ENTER / right / left family'],
    [0x08C51E, 'ENTER maps to 0xDA'],
    [0x08C52C, 'secondary special-case maps to 0x7F'],
    [0x08C532, 'handoff token/descriptor to helper'],
    [0x08C536, 'dispatch through CallMain'],
  ]);
  printRows(decodeRows(0x08C44D, { endExclusive: 0x08C53A }), coormonClassNotes);
  console.log('\n  CallMain dispatch stub:');
  const callMainNotes = new Map([
    [CALLMAIN_IMPL, 'CallMain entry'],
    [0x08C735, 'load cxMain pointer from D007CA'],
    [0x08C745, 'indirect jump to current app main handler'],
  ]);
  printRows(decodeRows(CALLMAIN_IMPL, { endExclusive: 0x08C746 }), callMainNotes);

  printHeader('E. APP-LOCAL cxMAIN PATH');
  printRefList('Exact refs to', HOME_LOCAL_BRANCH);
  printRefList('Exact refs to', HOME_CLASS_CASCADE, {
    extraNote: `${hex(HOME_CLASS_CASCADE)} is the class-comparison cascade inside cxMain, not the initial JP(HL) target.`,
  });
  console.log('\n  Requested 0x058757 context:');
  console.log(`    ${hex(REQUESTED_LOCAL_ADDR)} is covered by ${hex(localCover.pc)}  ${localCover.bytes}  ${localCover.text}`);
  console.log('    nearest aligned local entry points in this cluster: 0x058762 and 0x05877A');
  console.log('\n  cxMain entry body:');
  const cxEntryNotes = new Map([
    [HOME_CXMAIN_ENTRY, 'home-app cxMain body entry'],
    [0x058604, 'non-class5 keys branch into the local handler cluster'],
  ]);
  printRows(decodeRows(HOME_CXMAIN_ENTRY, { endExclusive: 0x058610 }), cxEntryNotes);
  console.log('\n  Local handler cluster around 0x05877A:');
  const localNotes = new Map([
    [0x058762, 'local helper entry before forcing app context 0x44'],
    [0x058776, 'tail-jump back into CallMain'],
    [HOME_LOCAL_BRANCH, 'class/range classifier entry'],
    [0x05878D, 'call into 0x080259 helper'],
    [0x0587E0, 'class>=4 falls into the 0x0589E5 cascade'],
  ]);
  printRows(decodeRows(0x058762, { endExclusive: 0x0587E9 }), localNotes);
  console.log('\n  0x0589E5 comparison cascade head:');
  const cascadeNotes = new Map([
    [HOME_CLASS_CASCADE, 'cascade entry'],
    [0x0589E9, 'compare A with 0x0B'],
    [0x0589EF, 'compare A with 0x0A'],
    [0x058A0C, 'compare A with 0x09'],
    [0x058A10, '0x09 handler entry'],
  ]);
  printRows(decodeRows(HOME_CLASS_CASCADE, { endExclusive: 0x058A20 }), cascadeNotes);
}

main();
