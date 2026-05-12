#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const rom = fs.readFileSync(ROM_PATH);
const incText = fs.readFileSync(INC_PATH, 'utf8');

const WRAPPER_START = 0x015930;
const WRAPPER_END = 0x0159BC;
const TRAMPOLINE_LOAD = 0x01598B;
const AFTER_RETURN_START = 0x015994;
const PARAM_BLOCK = 0x0159BD;
const BLOB_SOURCE = PARAM_BLOCK + 2;
const PUBLIC_SCANNER_ENTRY = 0x0159C0;

const COPY_HELPER_START = 0x000D7E;
const COPY_HELPER_END = 0x000DD6;
const SHARED_RETURN_START = 0x000DB6;
const SHARED_RETURN_END = 0x000DC1;
const SAVE_FLAGS_START = 0x000DC2;
const SAVE_FLAGS_END = 0x000DD6;

const NMI_VECTOR = 0x000066;
const RAM_CODE_TOP = 0xD18C7C;
const STACK_LOW_BOUND = 0xD1987E;
const STACK_HIGH_BOUND = 0xD1A87E;

const PARAM_LENGTH = read16LE(PARAM_BLOCK);
const BLOB_END = BLOB_SOURCE + PARAM_LENGTH - 1;
const RAM_BLOB_START = (RAM_CODE_TOP - PARAM_LENGTH) & 0xFFFFFF;
const RAM_BLOB_END = (RAM_CODE_TOP - 1) & 0xFFFFFF;
const RAM_PUBLIC_ENTRY = (RAM_BLOB_START + (PUBLIC_SCANNER_ENTRY - BLOB_SOURCE)) & 0xFFFFFF;

const incNames = parseIncNames(incText);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read16LE(addr) {
  return ((rom[addr] ?? 0) | ((rom[addr + 1] ?? 0) << 8)) >>> 0;
}

function parseIncNames(text) {
  const names = new Map();
  const re = /^\?([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*0([0-9A-Fa-f]+)h/gm;
  let match;

  while ((match = re.exec(text)) !== null) {
    const name = match[1];
    const addr = parseInt(match[2], 16) >>> 0;
    const existing = names.get(addr);
    if (!existing) {
      names.set(addr, name);
    } else if (!existing.split('/').includes(name)) {
      names.set(addr, `${existing}/${name}`);
    }
  }

  return names;
}

function labelAddr(addr) {
  const name = incNames.get(addr);
  return name ? `${hex(addr)} (${name})` : hex(addr);
}

function formatDisp(displacement) {
  const value = displacement ?? 0;
  return `${value >= 0 ? '+' : '-'}${hex(Math.abs(value), 2)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatDisp(displacement)})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  switch (inst.tag) {
    case 'nop': return 'nop';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'ret': return 'ret';
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${inst.indirectRegister})`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-sp-pair': return `ld sp, ${inst.pair}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-ixd-reg':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-pair-indexed':
      return `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixiy-indexed':
      return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-ixd':
      return `inc ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `dec ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair': return `add ${inst.dest ?? 'hl'}, ${inst.src}`;
    case 'adc-pair': return `adc hl, ${inst.src}`;
    case 'sbc-pair': return `sbc hl, ${inst.src}`;
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') return 'xor a';
      if (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc') {
        return `${inst.op} a, ${inst.src}`;
      }
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      if (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc') {
        return `${inst.op} a, ${hexByte(inst.value)}`;
      }
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ixd':
      if (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc') {
        return `${inst.op} a, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
      }
      return `${inst.op} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res': return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind': return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-special': return `ld ${inst.dest}, ${inst.src}`;
    case 'im': return `im ${inst.value}`;
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ex-sp-pair': return `ex (sp), ${inst.pair}`;
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'cpl': return 'cpl';
    case 'daa': return 'daa';
    case 'neg': return 'neg';
    case 'ldir': return 'ldir';
    case 'lddr': return 'lddr';
    case 'ldi': return 'ldi';
    case 'ldd': return 'ldd';
    case 'cpir': return 'cpir';
    case 'cpdr': return 'cpdr';
    case 'cpi': return 'cpi';
    case 'cpd': return 'cpd';
    case 'in0': return `in0 ${inst.reg}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${inst.reg}`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg}`;
    case 'in-imm': return `in a, (${hexByte(inst.port)})`;
    case 'out-imm': return `out (${hexByte(inst.port)}), a`;
    case 'rsmix': return 'rsmix';
    case 'stmix': return 'stmix';
    case 'rst': return `rst ${hex(inst.target ?? 0, 2)}`;
    default:
      return inst.tag;
  }
}

function decodeRange(start, endInclusive, mode = 'adl') {
  const rows = [];
  let pc = start;

  while (pc <= endInclusive) {
    let inst = null;
    let length = 1;

    try {
      inst = decodeInstruction(rom, pc, mode);
      length = Math.max(inst.length ?? 1, 1);
    } catch (error) {
      rows.push({
        pc,
        length: 1,
        bytes: bytesAt(pc, 1),
        text: `??? (${error.message})`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      pc,
      length,
      bytes: bytesAt(pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc += length;
  }

  return rows;
}

function printRows(rows, notes = new Map()) {
  for (const row of rows) {
    const note = notes.get(row.pc);
    const suffix = note ? `  ${note}` : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}${suffix}`);
  }
}

function printSection(title, rangeText, purpose, rows, notes = new Map()) {
  console.log(`--- ${title} (${rangeText}) ---`);
  console.log(`Purpose: ${purpose}`);
  console.log();
  printRows(rows, notes);
  console.log();
}

function printParamBlock() {
  const raw = bytesAt(PARAM_BLOCK, 16);
  console.log(`--- Parameter Block (${hex(PARAM_BLOCK)}) ---`);
  console.log(`  raw bytes: ${raw}`);
  console.log(`  length word @ ${hex(PARAM_BLOCK)} = ${hex(PARAM_LENGTH, 4)} (${PARAM_LENGTH} bytes)`);
  console.log(`  copied source blob: ${hex(BLOB_SOURCE)}..${hex(BLOB_END)}`);
  console.log(`  copy destination window: ${hex(RAM_BLOB_START)}..${hex(RAM_BLOB_END)} (${labelAddr(RAM_CODE_TOP)} is the top sentinel)`);
  console.log(`  helper jumps to RAM entry ${hex(RAM_BLOB_START)}, which corresponds to ROM source ${hex(BLOB_SOURCE)}`);
  console.log(`  familiar scanner entry ${hex(PUBLIC_SCANNER_ENTRY)} maps to RAM ${hex(RAM_PUBLIC_ENTRY)} (one byte into the copied blob)`);
  console.log();
}

function printBranchSummary() {
  console.log('--- Branch / Skip Summary ---');
  console.log(`  ${hex(0x015936)}  RET NZ`);
  console.log('    Early skip: if low-memory byte 0x00007E is not 0xFF, the wrapper returns immediately and never touches the scanner.');
  console.log(`  ${hex(0x015940)}  JP NZ, ${hex(NMI_VECTOR)}`);
  console.log('    Enter-handshake trap: after loading A=0x8C and writing port 0x24, any unexpected NZ result aborts to the interrupt vector.');
  console.log(`  ${hex(0x015951)}  JR ${hex(0x015953)}`);
  console.log('    Tiny alternate entry at 0x015950 just joins the shared main body at 0x015953.');
  console.log(`  ${hex(0x015978)}  JR C, ${hex(0x015981)}`);
  console.log('    If SP is already below the low bound, skip the upper-bound compare and fall straight into the failure complement/jump path.');
  console.log(`  ${hex(0x015983)}  JP NC, ${hex(NMI_VECTOR)}`);
  console.log(`    Stack guard trap: the scanner only runs when SP is inside ${hex(STACK_LOW_BOUND)}..${hex(STACK_HIGH_BOUND)}.`);
  console.log(`  ${hex(0x015997)}  JR ${hex(0x015999)}`);
  console.log('    Post-return cleanup has the same tiny stub pattern as the pre-call entry.');
  console.log(`  ${hex(0x0159B7)}  JP NZ, ${hex(NMI_VECTOR)}`);
  console.log('    Exit-handshake trap: teardown expects the same port sequence to leave A consistent with 0x88.');
  console.log();
}

function printStateWriteSummary() {
  console.log('--- State Writes ---');
  console.log(`  ${hex(0x015963)}  LD (${labelAddr(0xD0053F)}), SP`);
  console.log('    Wrapper scratch write: shadow the live SP into tempSP before the bounds check.');
  console.log(`  ${hex(0x000D9D)}  LD (${labelAddr(0xD02AD7)}), HL`);
  console.log('    Copy-helper scratch write after LDIR; HL now points just past the copied ROM source bytes.');
  console.log(`  ${hex(0x000DD0)}  LD (${hex(0xD00128)}), A`);
  console.log('    Save-helper write: snapshot the interrupt-enable state so the shared return stub can conditionally EI.');
  console.log();
}

function printOverallInterpretation() {
  console.log('--- Overall Interpretation ---');
  console.log(`  ${hex(WRAPPER_START)} is a wrapper, not the keyboard scanner itself.`);
  console.log('  It performs four jobs before and after the real scan:');
  console.log('    1. gate the call on a low-memory byte check');
  console.log('    2. enter an interrupt-safe hardware/port state');
  console.log('    3. validate SP against the OS stack window');
  console.log('    4. dispatch the scanner through the 0x000D7E copy-to-RAM trampoline, then tear the wrapper state back down');
  console.log();
  console.log(`  The actual copied blob starts at ${hex(BLOB_SOURCE)} with PUSH DE, not at ${hex(PUBLIC_SCANNER_ENTRY)}.`);
  console.log(`  Earlier direct probes at ${hex(PUBLIC_SCANNER_ENTRY)} were entering one byte into that blob, at the visible PUSH IY body.`);
  console.log();
  console.log(`  After the copied scanner tail-jumps to ${hex(SHARED_RETURN_START)} and RETs, control lands back at ${hex(AFTER_RETURN_START)}.`);
  console.log('  The wrapper preserves the scanner return value in AF, performs the inverse port handshake, restores AF, and returns that same value to the ISR caller.');
  console.log();
}

console.log('=== Phase 300: Scanner Wrapper 0x015930-0x0159BC ===');
console.log();
console.log(`ROM loaded: ${rom.length} bytes`);
console.log(`Decode convention: linear ADL decode matching this repo's existing probes and ROM.transpiled.js block ids, including the wrapper's RSMIX sites.`);
console.log();

const gateRows = decodeRange(0x015930, 0x015936);
const enterRows = decodeRange(0x015937, 0x01595F);
const guardRows = decodeRange(0x015960, 0x015983);
const dispatchRows = decodeRange(0x015987, 0x015990);
const cleanupRows = decodeRange(0x015994, 0x0159BC);
const helperRows = decodeRange(COPY_HELPER_START, COPY_HELPER_END);
const blobHeadRows = decodeRange(BLOB_SOURCE, 0x0159E8);
const sharedReturnRows = decodeRange(SHARED_RETURN_START, SHARED_RETURN_END);
const saveFlagsRows = decodeRange(SAVE_FLAGS_START, SAVE_FLAGS_END);

printSection(
  'Section A: Early Gate',
  `${hex(0x015930)}..${hex(0x015936)}`,
  'Read a low-memory gate byte and skip the scanner entirely unless it is exactly 0xFF.',
  gateRows,
  new Map([
    [0x015930, '<-- low-memory gate byte load'],
    [0x015936, '<-- only normal branch that skips the wrapper cleanly'],
  ]),
);

printSection(
  'Section B: Enter Wrapper / Join Stub',
  `${hex(0x015937)}..${hex(0x01595F)}`,
  'Save AF, disable interrupts, arm the port 0x24 / 0x06 state, then run the DI/RSMIX/IM1/port-0x28 handshake before the stack guard.',
  enterRows,
  new Map([
    [0x015937, '<-- save caller AF before clobbering A/flags'],
    [0x01593B, '<-- write 0x8C to port 0x24 (enter selector)'],
    [0x015940, `<-- fail-hard path to ${hex(NMI_VECTOR)}`],
    [0x015947, '<-- set bit 2 in port 0x06'],
    [0x015950, '<-- tiny alternate entry stub: DI ; JR 0x015953'],
    [0x015953, '<-- shared main entry after the stub'],
    [0x015954, '<-- repo/toolchain marks this RSMIX site but keeps the block in ADL decode'],
    [0x015958, '<-- port 0x28 handshake begins with A=0x04'],
    [0x01595E, '<-- sample status bit 2 from port 0x28'],
  ]),
);

printSection(
  'Section C: Stack Window Guard',
  `${hex(0x015960)}..${hex(0x015983)}`,
  `Preserve BC/DE/HL, shadow SP into ${labelAddr(0xD0053F)}, and require SP to stay inside ${hex(STACK_LOW_BOUND)}..${hex(STACK_HIGH_BOUND)} before the scanner is allowed to run.`,
  guardRows,
  new Map([
    [0x015963, `<-- save SP into ${labelAddr(0xD0053F)}`],
    [0x015968, '<-- reload the saved SP into HL for 24-bit compares'],
    [0x01596C, `<-- low bound ${hex(STACK_LOW_BOUND)}`],
    [0x015970, `<-- high bound ${hex(STACK_HIGH_BOUND)}`],
    [0x015974, '<-- clear carry before SBC-based range checks'],
    [0x015978, '<-- if SP < low bound, jump directly into failure path'],
    [0x015983, `<-- if carry is clear after CCF, SP was outside the window: jump to ${hex(NMI_VECTOR)}`],
  ]),
);

printSection(
  'Section D: Restore + Copy Trampoline Call',
  `${hex(0x015987)}..${hex(0x015990)}`,
  'Restore the wrapper-saved registers, load IX with the parameter block header, and call the shared copy/execute trampoline.',
  dispatchRows,
  new Map([
    [0x015987, '<-- restore HL'],
    [0x015988, '<-- restore DE'],
    [0x015989, '<-- restore BC'],
    [0x01598A, '<-- restore AF'],
    [0x01598B, `<-- IX = parameter block ${hex(PARAM_BLOCK)}`],
    [0x015990, `<-- trampoline call into ${hex(COPY_HELPER_START)}`],
  ]),
);

printSection(
  'Section E: After Scanner Returns',
  `${hex(AFTER_RETURN_START)}..${hex(WRAPPER_END)}`,
  'Preserve the scanner return value in AF, undo the port 0x28 / 0x06 / 0x24 wrapper state, then RET with the scanner result still in A.',
  cleanupRows,
  new Map([
    [0x015994, '<-- save scanner return AF across cleanup'],
    [0x015995, '<-- zero A for the teardown handshake'],
    [0x015999, '<-- shared cleanup entry after tiny stub at 0x015997'],
    [0x01599A, '<-- same RSMIX wrapper idiom as the pre-call side'],
    [0x0159A6, '<-- read port 0x06 for teardown'],
    [0x0159A9, '<-- clear bit 2 in port 0x06'],
    [0x0159B0, '<-- load 0x88 exit selector'],
    [0x0159B2, '<-- write 0x88 to port 0x24'],
    [0x0159B7, `<-- fail-hard path to ${hex(NMI_VECTOR)}`],
    [0x0159BB, '<-- restore original scanner AF'],
    [0x0159BC, '<-- wrapper returns to caller here'],
  ]),
);

printSection(
  'Copy Trampoline',
  `${hex(COPY_HELPER_START)}..${hex(0x000DB4)}`,
  `Save the interrupt-enable state, read the length word from IX, copy IX+2 into RAM below ${labelAddr(RAM_CODE_TOP)}, load IX with the copied RAM start, and JP (IX).`,
  helperRows.filter((row) => row.pc <= 0x000DB4),
  new Map([
    [0x000D7E, `<-- first step: call the saved-interrupt helper at ${hex(SAVE_FLAGS_START)}`],
    [0x000D88, '<-- move the incoming IX parameter pointer into HL'],
    [0x000D91, '<-- BC low byte = parameter-block length byte 0'],
    [0x000D93, '<-- BC high byte = parameter-block length byte 1'],
    [0x000D95, '<-- HL becomes ramCodeTop, DE becomes source pointer IX+2'],
    [0x000D97, '<-- compute RAM destination start = ramCodeTop - length'],
    [0x000D9A, '<-- push destination start so POP IX can recover it later'],
    [0x000D9B, '<-- copy BC bytes from ROM source to RAM destination'],
    [0x000D9D, `<-- scratch write into ${labelAddr(0xD02AD7)}`],
    [0x000DAE, '<-- POP IX now loads IX with the copied RAM entry, not the original parameter-block address'],
    [0x000DB4, '<-- execute the copied RAM blob via JP (IX)'],
  ]),
);

printSection(
  'Shared Return Stub',
  `${hex(SHARED_RETURN_START)}..${hex(SHARED_RETURN_END)}`,
  'This is where the copied scanner tail-jumps when it is done. The stub conditionally EI based on the saved flag byte, then RETs back to wrapper address 0x015994.',
  sharedReturnRows,
  new Map([
    [0x000DB7, '<-- read saved interrupt-state byte'],
    [0x000DBB, '<-- bit 2 decides whether EI should run'],
    [0x000DBF, '<-- EI only when the saved state requested it'],
    [0x000DC1, `<-- RET lands at wrapper cleanup ${hex(AFTER_RETURN_START)}`],
  ]),
);

printSection(
  'Saved-Interrupt Helper',
  `${hex(SAVE_FLAGS_START)}..${hex(SAVE_FLAGS_END)}`,
  `Called by ${hex(COPY_HELPER_START)} before the copy. It snapshots the interrupt-enable state into ${hex(0xD00128)} for the shared return stub above.`,
  saveFlagsRows,
  new Map([
    [0x000DC4, '<-- LD A,I gives the P/V snapshot tied to the interrupt state'],
    [0x000DCD, '<-- DI before storing the snapshot byte'],
    [0x000DD0, '<-- save snapshot byte to 0xD00128'],
  ]),
);

printParamBlock();

printSection(
  'Copied Scanner Blob Head',
  `${hex(BLOB_SOURCE)}..${hex(0x0159E8)}`,
  'Show the first part of the copied ROM blob. This confirms that the helper copies from IX+2, so the real copied entry includes PUSH DE one byte before the familiar 0x0159C0 scanner body.',
  blobHeadRows,
  new Map([
    [0x0159BF, `<-- actual blob entry copied to and executed from RAM ${hex(RAM_BLOB_START)}`],
    [0x0159C0, `<-- familiar scanner body entry mapped to RAM ${hex(RAM_PUBLIC_ENTRY)}`],
    [0x0159C7, '<-- repoint IY at keyboard MMIO base 0xE00800'],
    [0x0159E8, '<-- start of the scan-complete polling loop in the copied scanner'],
  ]),
);

printBranchSummary();
printStateWriteSummary();
printOverallInterpretation();
