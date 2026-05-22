#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase404-action-pipeline-report.md');

const rom = fs.readFileSync(ROM_PATH);

// ===== Known addresses from session 403 =====
const PIPELINE_SHIFT = 0x07F95E;   // promotes slot 1 -> slot 0, archives slot 0 -> slot 3
const SLOT0_READER   = 0x07FDD6;   // LD HL, 0xD005F8 — reads action byte from slot 0
const SLOT1_READER   = 0x07FDD0;   // LD HL, 0xD00603 — reads action byte from slot 1
const BIT7_TEST      = 0x07FDC9;   // LD A,(0xD005F8); AND 0x80; RET — tests bit 7 of slot 0
const SLOT0_ALT      = 0x07FDC3;   // LD A,(0xD00603); JR -> bit7 test path (slot 1 bit 7)

// RAM addresses discovered from disassembly
const SLOT0_ADDR = 0xD005F8;
const SLOT1_ADDR = 0xD00603;
const ARCHIVE_ADDR = 0xD00624;  // destination in pipeline shift

const CALL_OPS = new Set([0xC4, 0xCC, 0xCD, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]);
const JP_OPS = new Set([0xC2, 0xC3, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]);

// ===== Formatting helpers =====

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function formatSigned(value) {
  const n = Number(value ?? 0);
  return `${n >= 0 ? '+' : '-'}0x${Math.abs(n).toString(16).toUpperCase()}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister)}${formatSigned(displacement)})`;
}

function bytesToHex(start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rom.length, safeStart + Math.max(0, length));
  return Array.from(rom.subarray(safeStart, safeEnd), (v) => hexByte(v)).join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstruction(inst) {
  if (!inst) return '<null>';
  const tag = inst.tag ?? 'unknown';
  if (tag === 'db') return `db ${hexByte(inst.value)}`;

  switch (tag) {
    case 'nop': case 'halt': case 'di': case 'ei': case 'ret':
    case 'reti': case 'retn': case 'rlca': case 'rrca': case 'rla':
    case 'rra': case 'daa': case 'cpl': case 'scf': case 'ccf':
    case 'neg': case 'ldi': case 'ldd': case 'ldir': case 'lddr':
    case 'cpi': case 'cpd': case 'cpir': case 'cpdr': case 'exx':
      return tag;
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz':
      return `djnz ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister})`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'rst':
      return `rst ${hexByte(inst.target)}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm':
      return `ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-pair-ind':
      return `ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair':
      return `ld (${inst.dest}), ${inst.pair}`;
    case 'ld-sp-hl':
      return 'ld sp, hl';
    case 'ld-sp-pair':
      return `ld sp, ${inst.pair}`;
    case 'ld-pair-indexed':
      return `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm':
      return `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-special':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-mb-a':
      return 'ld mb, a';
    case 'ld-a-mb':
      return 'ld a, mb';
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'inc-ixd':
      return `inc ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `dec ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'adc-pair':
      return `adc hl, ${inst.src}`;
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ixd':
      return `${inst.op} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set':
      return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind':
      return `set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res':
      return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind':
      return `res ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ex-af':
      return "ex af, af'";
    case 'ex-de-hl':
      return 'ex de, hl';
    case 'ex-sp-hl':
      return 'ex (sp), hl';
    case 'ex-sp-pair':
      return `ex (sp), ${inst.pair}`;
    case 'im':
      return `im ${inst.value}`;
    case 'mlt':
      return `mlt ${inst.reg}`;
    case 'lea':
      return `lea ${inst.dest}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'pea':
      return `pea ${inst.base}${formatSigned(inst.displacement)}`;
    default: {
      const ignored = new Set(['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'decodeError', 'tag']);
      const extras = Object.entries(inst)
        .filter(([k, v]) => !ignored.has(k) && v !== undefined && v !== null)
        .map(([k, v]) => typeof v === 'number' ? `${k}=${hex(v, v > 0xFF ? 6 : 2)}` : `${k}=${v}`)
        .join(' ');
      return extras ? `${tag} ${extras}` : tag;
    }
  }
}

// ===== Disassemble a range =====
function disassembleRange(start, end) {
  const rows = [];
  let pc = start;
  while (pc < end && rows.length < 2048) {
    const inst = safeDecode(pc);
    rows.push(inst);
    pc += Math.max(1, inst.length || 1);
  }
  return rows;
}

function formatRow(inst) {
  return `${hex(inst.pc)}  ${bytesToHex(inst.pc, inst.length).padEnd(20)} ${formatInstruction(inst)}`;
}

// ===== Find all CALL/JP references to a target in the ROM =====
function findReferences(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const refs = [];

  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    const opcode = rom[pc];
    if (rom[pc + 1] !== lo || rom[pc + 2] !== mid || rom[pc + 3] !== hi) continue;
    if (!CALL_OPS.has(opcode) && !JP_OPS.has(opcode)) continue;
    const inst = safeDecode(pc);
    if (inst.target === target) {
      refs.push({ pc, inst });
    }
  }
  return refs;
}

// ===== Disassemble N instructions from an address =====
function traceFrom(addr, maxInst = 30) {
  const rows = [];
  let pc = addr;
  for (let i = 0; i < maxInst && pc < rom.length; i++) {
    const inst = safeDecode(pc);
    rows.push(inst);
    if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'halt') break;
    pc += Math.max(1, inst.length || 1);
  }
  return rows;
}

// ===== Extract CP instructions after a CALL to a target =====
function extractPostCallCP(callerPc, targetAddr) {
  // The CALL instruction is at callerPc, decode it to find its length
  const callInst = safeDecode(callerPc);
  const afterCall = callerPc + callInst.length;

  // Scan up to 20 instructions after the call for CP instructions
  const cpValues = [];
  let pc = afterCall;
  for (let i = 0; i < 20 && pc < rom.length; i++) {
    const inst = safeDecode(pc);

    // CP immediate — this is an action code comparison
    if (inst.tag === 'alu-imm' && inst.op === 'cp') {
      cpValues.push({ value: inst.value, pc: inst.pc });
    }

    // AND 0x3F masks the action byte — common before CP
    // Just note it, keep scanning

    // Stop at control flow that exits this block
    if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'halt') break;
    // Stop at another call to a different function (but not recursive)
    if ((inst.tag === 'call' || inst.tag === 'call-conditional') && inst.target !== targetAddr) break;

    pc += Math.max(1, inst.length || 1);
  }
  return cpValues;
}

// ===== MAIN =====
function main() {
  const output = [];
  function log(line = '') {
    console.log(line);
    output.push(line);
  }

  log('# Phase 404: 6-Slot Action Pipeline Data Flow');
  log('');
  log(`ROM: ${ROM_PATH}`);
  log('');

  // =========================================================
  // PART 1: Disassemble the pipeline shift function (0x07F95E)
  // =========================================================
  log('## Part 1: Pipeline Shift Function at 0x07F95E');
  log('');
  log('This function is called when action codes 0x1C or 0x1D are detected.');
  log('It promotes slot 1 into slot 0 and archives old slot 0.');
  log('');

  // Disassemble a generous range starting from 0x07F95E
  const shiftInsts = disassembleRange(0x07F95E, 0x07F9D0);
  log('### Full Disassembly');
  log('```');
  for (const inst of shiftInsts) {
    log(`  ${formatRow(inst)}`);
  }
  log('```');
  log('');

  // Now trace the LDI chain: find all LDI instructions and the LD HL/DE pairs that set up source/dest
  log('### LDI Chain Analysis');
  log('');

  const ldiOps = [];
  const ldPairImms = [];
  for (const inst of shiftInsts) {
    if (inst.tag === 'ldi' || inst.tag === 'ldir') {
      ldiOps.push(inst);
    }
    if (inst.tag === 'ld-pair-imm' && (inst.pair === 'hl' || inst.pair === 'de')) {
      ldPairImms.push(inst);
    }
  }

  log('LD pair setups (source=HL, dest=DE for LDI):');
  for (const inst of ldPairImms) {
    log(`  ${hex(inst.pc)}: LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`);
  }
  log('');
  log(`LDI instructions found: ${ldiOps.length}`);
  for (const inst of ldiOps) {
    log(`  ${hex(inst.pc)}: ${formatInstruction(inst)}`);
  }
  log('');

  // Determine slot addresses and sizes from the LD HL/DE pairs
  // The shift function does: copy slot 0 -> archive, copy slot 1 -> slot 0
  // HL = source, DE = destination for LDI
  log('### Slot Address Derivation');
  log('');

  // From 0x07F95E: LD HL,0xD005F8  LD DE,0xD00624 — copy slot 0 to archive
  // From 0x07F968: LD HL,0xD00603  LD DE,0xD005F8 — copy slot 1 to slot 0
  // Count LDI ops between these to determine record size

  // Let's also look for the second half of the shift (slot 2 -> slot 1, etc.)
  // by examining what happens after the LDI chain

  // Compute slot size from address gaps
  const slot0Start = 0xD005F8;
  const slot1Start = 0xD00603;
  const archiveStart = 0xD00624;
  const slotSize = slot1Start - slot0Start; // 0x0B = 11 bytes

  log(`Slot 0 base: ${hex(slot0Start)} (0xD005F8)`);
  log(`Slot 1 base: ${hex(slot1Start)} (0xD00603)`);
  log(`Archive base: ${hex(archiveStart)} (0xD00624)`);
  log(`Slot size (slot1 - slot0): ${slotSize} bytes (${hex(slotSize, 2)})`);
  log('');

  // Extrapolate more slots: if slot 0 = 0xD005F8 and slot 1 = 0xD00603, gap = 0x0B
  // slot 2 = 0xD0060E, slot 3 = 0xD00619, slot 4 = 0xD00624, slot 5 = 0xD0062F
  const slots = [];
  for (let i = 0; i < 6; i++) {
    slots.push({
      index: i,
      addr: slot0Start + (i * slotSize),
    });
  }

  log('### Extrapolated 6-Slot Layout (assuming uniform 11-byte records)');
  log('');
  log('| Slot | RAM Address | End Address | Notes |');
  log('|------|------------ |-------------|-------|');
  for (const s of slots) {
    let note = '';
    if (s.index === 0) note = 'Active action slot (read by 57 callers)';
    if (s.index === 1) note = 'Next-action slot (read by 10 callers)';
    if (s.addr === archiveStart) note += (note ? '; ' : '') + 'Archive destination in pipeline shift';
    log(`| ${s.index} | ${hex(s.addr)} | ${hex(s.addr + slotSize - 1)} | ${note} |`);
  }
  log('');

  // Verify: does the archive address (0xD00624) match any extrapolated slot?
  const archiveSlot = slots.find(s => s.addr === archiveStart);
  if (archiveSlot) {
    log(`Archive address ${hex(archiveStart)} matches extrapolated slot ${archiveSlot.index}.`);
  } else {
    const archiveOffset = archiveStart - slot0Start;
    log(`Archive address ${hex(archiveStart)} is at offset ${archiveOffset} from slot 0 (${archiveOffset / slotSize} slots).`);
    // Recalculate if needed
    const archiveSlotIdx = archiveOffset / slotSize;
    if (Number.isInteger(archiveSlotIdx)) {
      log(`This cleanly maps to slot ${archiveSlotIdx}.`);
    } else {
      log(`WARNING: offset does not divide evenly by slot size ${slotSize}. Archive may use a different record size.`);
    }
  }
  log('');

  // =========================================================
  // PART 2: Deeper disassembly of pipeline shift internals
  // =========================================================
  log('## Part 2: Pipeline Shift Internals — Full Trace');
  log('');

  // Also check the alternate entry at 0x07F968 (copies slot 1 -> slot 0)
  log('### Alternate Entry 0x07F968 (slot 1 -> slot 0 copy)');
  log('```');
  const altEntry = disassembleRange(0x07F968, 0x07F9D0);
  for (const inst of altEntry) {
    log(`  ${formatRow(inst)}`);
  }
  log('```');
  log('');

  // Check what 0x07F972 / 0x07F974 look like — the LDI chain
  // From the report we know:
  //   0x07F972: LDI
  //   0x07F974: LDI
  // But we need to see the full loop — DJNZ or counted LDIs?
  log('### LDI Chain Detail');
  log('');

  // Count consecutive LDIs starting from 0x07F972
  let ldiCount = 0;
  let pc = 0x07F972;
  while (pc < 0x07F9E0) {
    const inst = safeDecode(pc);
    if (inst.tag === 'ldi') {
      ldiCount++;
      pc += inst.length;
    } else {
      break;
    }
  }
  log(`Consecutive LDI instructions starting at 0x07F972: ${ldiCount}`);
  log(`Each LDI copies 1 byte from (HL) to (DE), increments both, decrements BC.`);
  log(`Total bytes copied per shift call: ${ldiCount} bytes`);
  log('');

  // Actually, the jump at 0x07F966 goes to 0x07F974, skipping 0x07F972
  // So when entering from 0x07F95E (slot 0 -> archive), it jumps to 0x07F974
  // And 0x07F972 has the extra LDI that's used when entering from 0x07F968
  // Let's count more carefully
  log('### Entry Path Analysis');
  log('');
  log('Path A (0x07F95E): LD HL,0xD005F8; LD DE,0xD00624; JR 0x07F974');
  log('  -> copies slot 0 to archive, starting at LDI @0x07F974');
  log('');
  log('Path B (0x07F968): LD HL,0xD00603; LD DE,0xD005F8; JR 0x07F974');
  log('  -> copies slot 1 to slot 0, starting at LDI @0x07F974');
  log('');
  log('Path C (0x07F972): Extra LDI before @0x07F974 (falls through)');
  log('');

  // Disassemble from 0x07F974 until non-LDI
  let ldiFromF974 = 0;
  pc = 0x07F974;
  while (pc < 0x07F9E0) {
    const inst = safeDecode(pc);
    if (inst.tag === 'ldi') {
      ldiFromF974++;
      pc += inst.length;
    } else {
      break;
    }
  }
  log(`LDIs from 0x07F974: ${ldiFromF974}`);
  log(`LDIs from 0x07F972 (includes extra): ${ldiFromF974 + 1}`);
  log('');

  // What follows the LDI chain?
  log('### Code After LDI Chain');
  log('```');
  const afterLdi = disassembleRange(pc, pc + 0x40);
  for (const inst of afterLdi) {
    log(`  ${formatRow(inst)}`);
  }
  log('```');
  log('');

  // Check if there are additional copy stages (slot 2 -> slot 1, etc.)
  // by looking for more LD HL/DE pairs after the first LDI chain
  log('### Additional Copy Stages');
  log('');

  // Scan the code after the LDI chain for LD HL,imm / LD DE,imm pointing to slot-range RAM
  const postLdiInsts = disassembleRange(pc, pc + 0x80);
  const additionalCopies = [];
  for (let i = 0; i < postLdiInsts.length; i++) {
    const inst = postLdiInsts[i];
    if (inst.tag === 'ld-pair-imm' && (inst.pair === 'hl' || inst.pair === 'de')) {
      const addr = inst.value;
      if (addr >= 0xD005F0 && addr <= 0xD00680) {
        additionalCopies.push(inst);
      }
    }
  }

  if (additionalCopies.length > 0) {
    log('Found additional LD pair,imm pointing to slot-range RAM after LDI chain:');
    for (const inst of additionalCopies) {
      log(`  ${hex(inst.pc)}: LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`);
    }
  } else {
    log('No additional copy stages found immediately after the LDI chain.');
    log('The pipeline shift appears to be a single-stage copy (slot 0 -> archive, then slot 1 -> slot 0).');
  }
  log('');

  // =========================================================
  // PART 3: Search for other references to slot RAM addresses
  // =========================================================
  log('## Part 3: RAM Address References Across ROM');
  log('');

  // Search for all references to each slot address
  const slotAddrs = [
    { name: 'Slot 0', addr: 0xD005F8 },
    { name: 'Slot 1', addr: 0xD00603 },
    { name: 'Slot 0+1 (byte 1)', addr: 0xD005F9 },
    { name: 'Slot 0+2 (byte 2)', addr: 0xD005FA },
    { name: 'Slot 1+1', addr: 0xD00604 },
    { name: 'Archive', addr: 0xD00624 },
    { name: 'Slot 2 (extrapolated)', addr: 0xD0060E },
    { name: 'Slot 3 (extrapolated)', addr: 0xD00619 },
  ];

  for (const entry of slotAddrs) {
    const lo = entry.addr & 0xFF;
    const mid = (entry.addr >> 8) & 0xFF;
    const hi = (entry.addr >> 16) & 0xFF;
    let refCount = 0;

    for (let i = 0; i <= rom.length - 3; i++) {
      if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
        refCount++;
      }
    }
    log(`${entry.name} (${hex(entry.addr)}): ${refCount} raw byte-pattern occurrences in ROM`);
  }
  log('');

  // =========================================================
  // PART 4: Categorize callers by action code
  // =========================================================
  log('## Part 4: Caller Action Code Analysis');
  log('');
  log('For each caller of 0x07FDD6 (slot 0 reader), we examine the instructions');
  log('AFTER the CALL to find which action codes the caller compares against.');
  log('');

  // Get all 57 callers of slot 0 reader
  const slot0Callers = findReferences(SLOT0_READER);

  // Build action code -> callers map
  const actionCodeMap = new Map();  // action code value -> array of caller PCs
  const callerDetails = [];

  for (const ref of slot0Callers) {
    const cpValues = extractPostCallCP(ref.pc, SLOT0_READER);
    const detail = {
      callerPc: ref.pc,
      callType: formatInstruction(ref.inst),
      actionCodes: cpValues,
    };
    callerDetails.push(detail);

    for (const cp of cpValues) {
      if (!actionCodeMap.has(cp.value)) {
        actionCodeMap.set(cp.value, []);
      }
      actionCodeMap.get(cp.value).push(ref.pc);
    }
  }

  // Sort action codes
  const sortedCodes = [...actionCodeMap.entries()].sort((a, b) => a[0] - b[0]);

  log('### Action Code Distribution (from slot 0 callers)');
  log('');
  log('| Action Code | Hex  | Callers | Representative Caller Addresses |');
  log('|-------------|------|---------|----------------------------------|');
  for (const [code, callers] of sortedCodes) {
    const reps = callers.slice(0, 5).map(pc => hex(pc)).join(', ');
    const more = callers.length > 5 ? ` (+${callers.length - 5} more)` : '';
    log(`| ${String(code).padStart(3)} | ${hexByte(code)} | ${String(callers.length).padStart(3)}     | ${reps}${more} |`);
  }
  log('');

  // Also show callers that don't compare any action codes
  const noCompareCallers = callerDetails.filter(d => d.actionCodes.length === 0);
  if (noCompareCallers.length > 0) {
    log(`### Callers With No Post-Call CP (${noCompareCallers.length})`);
    log('');
    log('These callers read the action byte but do not immediately compare it with CP:');
    for (const d of noCompareCallers) {
      // Show a few instructions after the call for context
      const callInst = safeDecode(d.callerPc);
      const afterPc = d.callerPc + callInst.length;
      const preview = disassembleRange(afterPc, afterPc + 20);
      log(`  ${hex(d.callerPc)}: ${d.callType}`);
      for (const inst of preview.slice(0, 5)) {
        log(`    ${formatRow(inst)}`);
      }
      log('');
    }
  }

  // =========================================================
  // PART 5: Repeat for slot 1 callers
  // =========================================================
  log('## Part 5: Slot 1 Callers (0x07FDD0) — Action Code Analysis');
  log('');

  const slot1Callers = findReferences(SLOT1_READER);
  const slot1ActionMap = new Map();
  const slot1Details = [];

  for (const ref of slot1Callers) {
    const cpValues = extractPostCallCP(ref.pc, SLOT1_READER);
    const detail = {
      callerPc: ref.pc,
      callType: formatInstruction(ref.inst),
      actionCodes: cpValues,
    };
    slot1Details.push(detail);

    for (const cp of cpValues) {
      if (!slot1ActionMap.has(cp.value)) {
        slot1ActionMap.set(cp.value, []);
      }
      slot1ActionMap.get(cp.value).push(ref.pc);
    }
  }

  const sortedSlot1Codes = [...slot1ActionMap.entries()].sort((a, b) => a[0] - b[0]);

  log('| Action Code | Hex  | Callers | Representative Caller Addresses |');
  log('|-------------|------|---------|----------------------------------|');
  for (const [code, callers] of sortedSlot1Codes) {
    const reps = callers.slice(0, 5).map(pc => hex(pc)).join(', ');
    log(`| ${String(code).padStart(3)} | ${hexByte(code)} | ${String(callers.length).padStart(3)}     | ${reps} |`);
  }
  log('');

  // =========================================================
  // PART 6: Bit 7 callers analysis
  // =========================================================
  log('## Part 6: Bit 7 Test Callers (0x07FDC9)');
  log('');

  const bit7Callers = findReferences(BIT7_TEST);
  log(`Total callers of 0x07FDC9 (bit 7 test): ${bit7Callers.length}`);
  log('');

  // Show first 15 with context
  log('### Representative Callers (first 15)');
  log('');
  for (const ref of bit7Callers.slice(0, 15)) {
    const callInst = safeDecode(ref.pc);
    const afterPc = ref.pc + callInst.length;
    const preview = disassembleRange(afterPc, afterPc + 20);

    // What do they do with the bit 7 result?
    // The function returns A = (slot0) & 0x80, so callers check Z/NZ
    let usage = 'unknown';
    for (const inst of preview.slice(0, 4)) {
      if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'ret-conditional' || inst.tag === 'call-conditional') {
        usage = `${formatInstruction(inst)}`;
        break;
      }
      if (inst.tag === 'alu-imm' && inst.op === 'or') {
        usage = `OR with ${hexByte(inst.value)} (combine flags)`;
        break;
      }
    }

    log(`  ${hex(ref.pc)}: ${formatInstruction(ref.inst)} -> ${usage}`);
  }
  log('');

  // =========================================================
  // PART 7: Check alternate entry 0x07FDC3 callers
  // =========================================================
  log('## Part 7: Alternate Bit 7 Entry (0x07FDC3) — Slot 1 Bit 7 Test');
  log('');

  const altCallers = findReferences(SLOT0_ALT);
  log(`Callers of 0x07FDC3: ${altCallers.length}`);
  for (const ref of altCallers) {
    log(`  ${hex(ref.pc)}: ${formatInstruction(ref.inst)}`);
  }
  log('');

  // Disassemble 0x07FDC3 for reference
  log('### Disassembly of 0x07FDC3');
  log('```');
  const altInsts = disassembleRange(0x07FDC3, 0x07FDD6);
  for (const inst of altInsts) {
    log(`  ${formatRow(inst)}`);
  }
  log('```');
  log('');

  // =========================================================
  // PART 8: What does 0x07D27A do? (post-pipeline-shift target)
  // =========================================================
  log('## Part 8: Post-Pipeline-Shift Handler (0x07D27A)');
  log('');
  log('After pipeline shift, the code JPs to 0x07D27A.');
  const postShift = traceFrom(0x07D27A, 5);
  log('```');
  for (const inst of postShift) {
    log(`  ${formatRow(inst)}`);
  }
  log('```');
  log('');
  if (postShift.length === 1 && postShift[0].tag === 'ret') {
    log('0x07D27A is a bare RET — the pipeline shift returns to the caller immediately after promoting slots.');
  }
  log('');

  // =========================================================
  // PART 9: Scan for all slot-range addresses in ROM to find additional slots
  // =========================================================
  log('## Part 9: Comprehensive Slot Range Scan');
  log('');
  log('Scanning ROM for all LD instructions referencing 0xD005F0..0xD00650:');
  log('');

  const slotRangeRefs = new Map();
  for (let i = 0; i <= rom.length - 4; i++) {
    const opcode = rom[i];
    // LD pair, imm24: 0x01 (BC), 0x11 (DE), 0x21 (HL)
    // LD A, (imm24): 0x3A
    // LD (imm24), A: 0x32
    if (opcode === 0x01 || opcode === 0x11 || opcode === 0x21 || opcode === 0x3A || opcode === 0x32) {
      const addr = rom[i + 1] | (rom[i + 2] << 8) | (rom[i + 3] << 16);
      if (addr >= 0xD005F0 && addr <= 0xD00650) {
        if (!slotRangeRefs.has(addr)) {
          slotRangeRefs.set(addr, 0);
        }
        slotRangeRefs.set(addr, slotRangeRefs.get(addr) + 1);
      }
    }
  }

  const sortedRefs = [...slotRangeRefs.entries()].sort((a, b) => a[0] - b[0]);
  log('| RAM Address | Refs | Slot (if size=11) | Offset in Slot |');
  log('|-------------|------|-------------------|----------------|');
  for (const [addr, count] of sortedRefs) {
    const offset = addr - slot0Start;
    const slotIdx = Math.floor(offset / slotSize);
    const byteInSlot = offset % slotSize;
    const slotLabel = (offset >= 0 && slotIdx < 6) ? `Slot ${slotIdx}` : (offset < 0 ? 'Before slots' : `Slot ${slotIdx} (beyond 6)`);
    log(`| ${hex(addr)} | ${String(count).padStart(4)} | ${slotLabel.padEnd(17)} | byte ${byteInSlot} |`);
  }
  log('');

  // =========================================================
  // SUMMARY
  // =========================================================
  log('## Summary');
  log('');

  log('### Pipeline Slot Addresses');
  log('');
  log(`- Slot size: ${slotSize} bytes (0x${slotSize.toString(16).toUpperCase()})`);
  for (const s of slots) {
    log(`- Slot ${s.index}: ${hex(s.addr)}..${hex(s.addr + slotSize - 1)}`);
  }
  log('');

  log('### Pipeline Shift Mechanics (0x07F95E)');
  log('');
  log(`1. Archives slot 0 (${hex(slot0Start)}) -> archive (${hex(archiveStart)}) via ${ldiFromF974} LDI ops`);
  log(`2. Promotes slot 1 (${hex(slot1Start)}) -> slot 0 (${hex(slot0Start)}) via ${ldiFromF974} LDI ops`);
  log(`3. Then JPs to 0x07D27A (bare RET) — returns to caller`);
  log('');

  log('### Entry Points');
  log('');
  log(`| Entry | Address | Callers | Purpose |`);
  log(`|-------|---------|---------|---------|`);
  log(`| Slot 0 reader | ${hex(SLOT0_READER)} | ${slot0Callers.length} | LD HL,slot0; read action byte, handle 0x1C/0x1D |`);
  log(`| Slot 1 reader | ${hex(SLOT1_READER)} | ${slot1Callers.length} | LD HL,slot1; read action byte, handle 0x1C/0x1D |`);
  log(`| Bit 7 test | ${hex(BIT7_TEST)} | ${bit7Callers.length} | LD A,(slot0); AND 0x80; RET (one-shot flag) |`);
  log(`| Alt bit 7 | ${hex(SLOT0_ALT)} | ${altCallers.length} | LD A,(slot1); JR to bit 7 test path |`);
  log(`| Total | | ${slot0Callers.length + slot1Callers.length + bit7Callers.length + altCallers.length} | |`);
  log('');

  log('### Action Code Frequency (merged slot 0 + slot 1)');
  log('');
  const merged = new Map();
  for (const [code, callers] of actionCodeMap) {
    merged.set(code, (merged.get(code) || 0) + callers.length);
  }
  for (const [code, callers] of slot1ActionMap) {
    merged.set(code, (merged.get(code) || 0) + callers.length);
  }
  const sortedMerged = [...merged.entries()].sort((a, b) => b[1] - a[1]);
  log('| Action Code | Hex  | Total Callers |');
  log('|-------------|------|---------------|');
  for (const [code, count] of sortedMerged) {
    log(`| ${String(code).padStart(3)} | ${hexByte(code)} | ${String(count).padStart(5)}         |`);
  }
  log('');

  log('---');
  log('Generated by probe-phase404-action-pipeline.mjs');

  // Write report
  const reportContent = output.join('\n');
  fs.writeFileSync(REPORT_PATH, reportContent, 'utf8');
  console.log(`\nReport written to: ${REPORT_PATH}`);
}

main();
