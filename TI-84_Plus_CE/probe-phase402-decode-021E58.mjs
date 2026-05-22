#!/usr/bin/env node
// Phase 402: Decode the jump table dispatcher at 0x021E58.
// The jump table at 0x021E58-0x021E7C holds 8 consecutive JP instructions.
// This probe finds the dispatcher code that indexes into the table and
// identifies what register holds the index and where it comes from.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hexByte(v) {
  return '0x' + (v & 0xff).toString(16).padStart(2, '0');
}

// --- Comprehensive instruction formatter ---
function formatInstruction(inst) {
  switch (inst.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'ret': return 'ret';
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'ret-conditional': return 'ret ' + inst.condition;
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'daa': return 'daa';
    case 'cpl': return 'cpl';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ex-sp-index': return 'ex (sp), ' + inst.indexRegister;

    case 'ld-reg-reg': return 'ld ' + inst.dest + ', ' + inst.src;
    case 'ld-reg-imm': return 'ld ' + inst.dest + ', ' + hexByte(inst.value);
    case 'ld-pair-imm': return 'ld ' + inst.pair + ', ' + hex(inst.value);
    case 'ld-reg-mem': return 'ld ' + inst.dest + ', (' + hex(inst.addr) + ')';
    case 'ld-mem-reg': return 'ld (' + hex(inst.addr) + '), ' + inst.src;
    case 'ld-pair-mem': return 'ld ' + inst.pair + ', (' + hex(inst.addr) + ')';
    case 'ld-mem-pair': return 'ld (' + hex(inst.addr) + '), ' + inst.pair;
    case 'ld-ind-imm': return 'ld (hl), ' + hexByte(inst.value);
    case 'ld-ind-reg': return 'ld (' + (inst.indirectRegister || 'hl') + '), ' + inst.src;
    case 'ld-reg-ind': return 'ld ' + inst.dest + ', (' + (inst.indirectRegister || 'hl') + ')';
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-index': return 'ld sp, ' + inst.indexRegister;
    case 'ld-a-bc': return 'ld a, (bc)';
    case 'ld-a-de': return 'ld a, (de)';
    case 'ld-bc-a': return 'ld (bc), a';
    case 'ld-de-a': return 'ld (de), a';

    case 'ld-index-imm': return 'ld ' + inst.indexRegister + ', ' + hex(inst.value);
    case 'ld-index-mem': return 'ld ' + inst.indexRegister + ', (' + hex(inst.addr) + ')';
    case 'ld-mem-index': return 'ld (' + hex(inst.addr) + '), ' + inst.indexRegister;
    case 'ld-indexed-reg': {
      var s = inst.displacement >= 0 ? '+' : '';
      return 'ld (' + inst.indexRegister + s + inst.displacement + '), ' + inst.src;
    }
    case 'ld-reg-indexed': {
      var s2 = inst.displacement >= 0 ? '+' : '';
      return 'ld ' + inst.dest + ', (' + inst.indexRegister + s2 + inst.displacement + ')';
    }
    case 'ld-indexed-imm': {
      var s3 = inst.displacement >= 0 ? '+' : '';
      return 'ld (' + inst.indexRegister + s3 + inst.displacement + '), ' + hexByte(inst.value);
    }

    case 'inc-reg': return 'inc ' + inst.reg;
    case 'dec-reg': return 'dec ' + inst.reg;
    case 'inc-pair': return 'inc ' + inst.pair;
    case 'dec-pair': return 'dec ' + inst.pair;
    case 'inc-index': return 'inc ' + inst.indexRegister;
    case 'dec-index': return 'dec ' + inst.indexRegister;
    case 'inc-ind': return 'inc (hl)';
    case 'dec-ind': return 'dec (hl)';

    case 'add-pair': return 'add hl, ' + inst.src;
    case 'adc-pair': return 'adc hl, ' + inst.src;
    case 'sbc-pair': return 'sbc hl, ' + inst.src;
    case 'add-index-pair': return 'add ' + inst.indexRegister + ', ' + inst.src;

    case 'alu-reg': return inst.op + ' ' + inst.src;
    case 'alu-imm': return inst.op + ' ' + hexByte(inst.value);
    case 'alu-ind': return inst.op + ' (hl)';
    case 'alu-indexed': {
      var s4 = inst.displacement >= 0 ? '+' : '';
      return inst.op + ' (' + inst.indexRegister + s4 + inst.displacement + ')';
    }

    case 'jp': return 'jp ' + hex(inst.target);
    case 'jp-conditional': return 'jp ' + inst.condition + ', ' + hex(inst.target);
    case 'jp-indirect': return 'jp (' + (inst.indirectRegister || 'hl') + ')';
    case 'jr': return 'jr ' + hex(inst.target);
    case 'jr-conditional': return 'jr ' + inst.condition + ', ' + hex(inst.target);
    case 'djnz': return 'djnz ' + hex(inst.target);
    case 'call': return 'call ' + hex(inst.target);
    case 'call-conditional': return 'call ' + inst.condition + ', ' + hex(inst.target);
    case 'rst': return 'rst ' + hex(inst.target, 2);

    case 'push': return 'push ' + inst.pair;
    case 'pop': return 'pop ' + inst.pair;
    case 'push-index': return 'push ' + inst.indexRegister;
    case 'pop-index': return 'pop ' + inst.indexRegister;

    case 'in-a-imm': return 'in a, (' + hexByte(inst.port) + ')';
    case 'out-imm-a': return 'out (' + hexByte(inst.port) + '), a';
    case 'in-reg': return 'in ' + inst.dest + ', (c)';
    case 'out-reg': return 'out (c), ' + inst.src;

    case 'rotate-reg': return inst.op + ' ' + inst.reg;
    case 'rotate-ind': return inst.op + ' (hl)';
    case 'bit-test': return 'bit ' + inst.bit + ', ' + inst.reg;
    case 'bit-test-ind': return 'bit ' + inst.bit + ', (hl)';
    case 'bit-set': return 'set ' + inst.bit + ', ' + inst.reg;
    case 'bit-set-ind': return 'set ' + inst.bit + ', (hl)';
    case 'bit-res': return 'res ' + inst.bit + ', ' + inst.reg;
    case 'bit-res-ind': return 'res ' + inst.bit + ', (hl)';

    case 'indexed-cb-bit': {
      var s5 = inst.displacement >= 0 ? '+' : '';
      return 'bit ' + inst.bit + ', (' + inst.indexRegister + s5 + inst.displacement + ')';
    }
    case 'indexed-cb-set': {
      var s6 = inst.displacement >= 0 ? '+' : '';
      return 'set ' + inst.bit + ', (' + inst.indexRegister + s6 + inst.displacement + ')';
    }
    case 'indexed-cb-res': {
      var s7 = inst.displacement >= 0 ? '+' : '';
      return 'res ' + inst.bit + ', (' + inst.indexRegister + s7 + inst.displacement + ')';
    }
    case 'indexed-cb-rotate': {
      var s8 = inst.displacement >= 0 ? '+' : '';
      return inst.op + ' (' + inst.indexRegister + s8 + inst.displacement + ')';
    }

    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'ini': return 'ini';
    case 'inir': return 'inir';
    case 'ind': return 'ind';
    case 'indr': return 'indr';
    case 'outi': return 'outi';
    case 'otir': return 'otir';
    case 'outd': return 'outd';
    case 'otdr': return 'otdr';
    case 'im': return 'im ' + inst.interruptMode;
    case 'neg': return 'neg';
    case 'rld': return 'rld';
    case 'rrd': return 'rrd';
    case 'ld-i-a': return 'ld i, a';
    case 'ld-a-i': return 'ld a, i';
    case 'ld-r-a': return 'ld r, a';
    case 'ld-a-r': return 'ld a, r';
    case 'ld-mb-a': return 'ld mb, a';
    case 'ld-a-mb': return 'ld a, mb';

    case 'tst-a-reg': return 'tst a, ' + inst.src;
    case 'tst-a-imm': return 'tst a, ' + hexByte(inst.value);
    case 'mlt': return 'mlt ' + inst.pair;
    case 'lea-index': return 'lea ' + inst.dest + ', ' + inst.indexRegister + (inst.displacement >= 0 ? '+' : '') + inst.displacement;
    case 'pea-index': return 'pea ' + inst.indexRegister + (inst.displacement >= 0 ? '+' : '') + inst.displacement;

    default: return inst.tag + ' (?)';
  }
}

// --- Disassemble a range of ROM ---
function disasmRange(start, end) {
  var rows = [];
  var pc = start;
  while (pc < end) {
    var inst = decodeInstruction(rom, pc, 'adl');
    var rawBytes = Array.from(
      rom.slice(inst.pc, inst.pc + inst.length),
      function (b) { return b.toString(16).padStart(2, '0'); }
    ).join(' ');
    rows.push({ pc: inst.pc, len: inst.length, bytes: rawBytes, dasm: formatInstruction(inst), inst: inst });
    pc += inst.length;
  }
  return rows;
}

function printRows(rows, label) {
  console.log('\n=== ' + label + ' ===');
  for (var r of rows) {
    console.log('  ' + hex(r.pc) + '  ' + r.bytes.padEnd(20) + ' ' + r.dasm);
  }
}

// --- Scan ROM for CALL/JP targeting an address range ---
function findCallersOf(rangeStart, rangeEnd) {
  var callers = [];
  var pc = 0;
  var romEnd = Math.min(rom.length, 0x400000); // ROM only
  while (pc < romEnd) {
    try {
      var inst = decodeInstruction(rom, pc, 'adl');
      if (inst.length === 0 || inst.length > 6) { pc++; continue; }
      var target = inst.target;
      if (typeof target === 'number' && target >= rangeStart && target < rangeEnd) {
        if (inst.tag === 'call' || inst.tag === 'call-conditional' ||
            inst.tag === 'jp' || inst.tag === 'jp-conditional') {
          callers.push({ from: pc, tag: inst.tag, target: target, condition: inst.condition || '' });
        }
      }
      pc += inst.length;
    } catch (e) {
      pc++;
    }
  }
  return callers;
}

// =============================================
// MAIN
// =============================================
console.log('# Phase 402: Decode Jump Table Dispatcher at 0x021E58\n');

// 1. The known jump table
var JUMP_TABLE_BASE = 0x021E58;
var JUMP_TABLE_ENTRIES = 9; // 9 JP instructions (8 targets + 1 for 0x05D5C2)
console.log('## Jump Table at ' + hex(JUMP_TABLE_BASE));
var jtRows = disasmRange(JUMP_TABLE_BASE, JUMP_TABLE_BASE + JUMP_TABLE_ENTRIES * 4);
printRows(jtRows, 'Jump Table (0x021E58 - 0x021E7C)');

var targets = jtRows.map(function (r) { return r.inst.target; }).filter(function (t) { return typeof t === 'number'; });
console.log('\nTargets: ' + targets.map(function (t) { return hex(t); }).join(', '));

// 2. Disassemble the dispatcher region BEFORE the jump table
console.log('\n## Dispatcher Region (0x021D80 - 0x021E58)');
var dispatcherRows = disasmRange(0x021D80, JUMP_TABLE_BASE);
printRows(dispatcherRows, 'Code before jump table (0x021D80 - 0x021E58)');

// 3. Also look at the wider region (0x021D00 - 0x021D80)
console.log('\n## Extended context (0x021D00 - 0x021D80)');
var extRows = disasmRange(0x021D00, 0x021D80);
printRows(extRows, 'Extended region (0x021D00 - 0x021D80)');

// 4. Find all CALL/JP that reference 0x021D80-0x021E58
console.log('\n## Callers of dispatcher region (0x021D80 - 0x021E58)');
var callers1 = findCallersOf(0x021D80, JUMP_TABLE_BASE);
if (callers1.length === 0) {
  console.log('  (none found in ROM)');
} else {
  for (var c of callers1) {
    console.log('  ' + hex(c.from) + '  ' + c.tag + (c.condition ? ' ' + c.condition : '') + '  -> ' + hex(c.target));
  }
}

// Also find callers of specific function entries we see in the disassembly
console.log('\n## Callers of addresses 0x021D00 - 0x021E58 (broader scan)');
var callers2 = findCallersOf(0x021D00, JUMP_TABLE_BASE);
if (callers2.length === 0) {
  console.log('  (none found in ROM)');
} else {
  for (var c of callers2) {
    console.log('  ' + hex(c.from) + '  ' + c.tag + (c.condition ? ' ' + c.condition : '') + '  -> ' + hex(c.target));
  }
}

// 5. Examine each jump target prologue (first 16 bytes)
console.log('\n## Jump Target Prologues');
for (var i = 0; i < targets.length; i++) {
  var t = targets[i];
  var prologueRows = disasmRange(t, t + 24);
  console.log('\n--- Target ' + i + ': ' + hex(t) + ' ---');
  for (var r of prologueRows) {
    console.log('  ' + hex(r.pc) + '  ' + r.bytes.padEnd(20) + ' ' + r.dasm);
  }
  // Identify: stack frame setup?
  var firstTag = prologueRows[0] && prologueRows[0].inst.tag;
  var hasFrameSetup = prologueRows.some(function (r) {
    return r.inst.tag === 'call' && (r.inst.target === 0x000130 || r.inst.target === 0x000138);
  });
  if (hasFrameSetup) {
    console.log('  -> C-style stack frame setup detected');
  }
}

// 6. Analyze the dispatcher mechanism
console.log('\n## Dispatcher Analysis');
console.log('Looking for index computation pattern in 0x021D80-0x021E58...');

// Identify key patterns in the dispatcher:
// - ADD HL, HL (shift left for *2, *4)
// - LD HL, <base> then ADD
// - JP (HL)
var addHlCount = 0;
var jpIndirect = null;
var ldHlImm = null;
for (var r of dispatcherRows) {
  if (r.inst.tag === 'add-pair' && r.inst.src === 'hl') addHlCount++;
  if (r.inst.tag === 'jp-indirect') jpIndirect = r;
  if (r.inst.tag === 'ld-pair-imm' && r.inst.pair === 'hl') ldHlImm = r;
  if (r.inst.tag === 'ld-index-imm') {
    console.log('  LD index: ' + r.dasm + ' at ' + hex(r.pc));
  }
}

if (ldHlImm) console.log('  LD HL base: ' + ldHlImm.dasm + ' at ' + hex(ldHlImm.pc));
if (addHlCount) console.log('  ADD HL,HL count: ' + addHlCount + ' (multiply by ' + Math.pow(2, addHlCount) + ')');
if (jpIndirect) console.log('  JP indirect: ' + jpIndirect.dasm + ' at ' + hex(jpIndirect.pc));

// Look for the register that holds the initial index
// Common patterns: LD L,A / LD H,0 or LD HL,<something>
for (var r of dispatcherRows) {
  if (r.inst.tag === 'ld-reg-reg' && r.inst.dest === 'l') {
    console.log('  Index source: LD L,' + r.inst.src + ' at ' + hex(r.pc) + '  (A->L means A is the index)');
  }
  if (r.inst.tag === 'ld-reg-imm' && r.inst.dest === 'h' && r.inst.value === 0) {
    console.log('  Clear H: LD H,0 at ' + hex(r.pc) + '  (HL = zero-extended index)');
  }
  if (r.inst.tag === 'ld-reg-mem' && r.inst.dest === 'a') {
    console.log('  Load index: LD A,(' + hex(r.inst.addr) + ') at ' + hex(r.pc));
  }
  if (r.inst.tag === 'alu-imm' && r.inst.op === 'cp') {
    console.log('  Range check: CP ' + hexByte(r.inst.value) + ' at ' + hex(r.pc));
  }
}

// 7. The ENTIRE region is a jump table. Find the actual dispatcher by scanning
//    ROM for code that loads addresses in this range.
//    Look for LD HL, 0x021xxx or LEA instructions targeting this table.
console.log('\n## Scanning for computed-jump dispatchers referencing this table');

// Search for the base address bytes in ROM (little-endian: 0x58 0x1E 0x02)
// and also for any address that could be a base of a sub-table
var baseBytes = [0x021D00, 0x021D40, 0x021D80, 0x021E00, 0x021E58, 0x021C00, 0x021B00];
for (var base of baseBytes) {
  var lo = base & 0xFF;
  var mid = (base >> 8) & 0xFF;
  var hi = (base >> 16) & 0xFF;
  // Scan ROM for 3-byte sequence (immediate operand in LD HL,nn instruction)
  for (var pc = 0; pc < 0x400000 - 4; pc++) {
    if (rom[pc] === lo && rom[pc+1] === mid && rom[pc+2] === hi) {
      // Check if preceded by LD HL opcode (0x21) or LD DE (0x11) or LD BC (0x01)
      var prev = rom[pc-1];
      var prevPrev = pc >= 2 ? rom[pc-2] : 0;
      // In ADL mode, LD HL,nn is 21 lo mid hi (4 bytes)
      // Could also be after a mode prefix (0x40, 0x49, 0x52, 0x5B)
      if (prev === 0x21 || prev === 0x11 || prev === 0x01) {
        // Found LD pair, imm with this address
        var instrStart = pc - 1;
        var rows2 = disasmRange(Math.max(0, instrStart - 16), instrStart + 20);
        console.log('\n  Found reference to ' + hex(base) + ' at ' + hex(instrStart) + ':');
        for (var r of rows2) {
          var marker = (r.pc === instrStart) ? ' <<< ' : '     ';
          console.log(marker + hex(r.pc) + '  ' + r.bytes.padEnd(20) + ' ' + r.dasm);
        }
      }
      // Check for mode-prefixed LD
      if ((prevPrev === 0x40 || prevPrev === 0x49 || prevPrev === 0x52 || prevPrev === 0x5B) &&
          (prev === 0x21 || prev === 0x11 || prev === 0x01)) {
        var instrStart2 = pc - 2;
        if (instrStart2 !== pc - 1 - 1) { // avoid duplicate with above
          var rows3 = disasmRange(Math.max(0, instrStart2 - 16), instrStart2 + 20);
          console.log('\n  Found mode-prefixed reference to ' + hex(base) + ' at ' + hex(instrStart2) + ':');
          for (var r of rows3) {
            var marker2 = (r.pc === instrStart2) ? ' <<< ' : '     ';
            console.log(marker2 + hex(r.pc) + '  ' + r.bytes.padEnd(20) + ' ' + r.dasm);
          }
        }
      }
    }
  }
}

// 8. Check if there's a bigger jump table starting earlier - find where the JPs begin
console.log('\n## Finding the extent of the full jump table');
var tableStart = 0x021E58;
// Walk backwards from 0x021E58 checking if every 4 bytes is a JP (0xC3)
var checkPc = tableStart - 4;
while (checkPc >= 0x020000 && rom[checkPc] === 0xC3) {
  tableStart = checkPc;
  checkPc -= 4;
}
// Walk forward from 0x021E78
var tableEnd = 0x021E78 + 4;
while (tableEnd < 0x022000 && rom[tableEnd] === 0xC3) {
  tableEnd += 4;
}
console.log('  Full JP table: ' + hex(tableStart) + ' - ' + hex(tableEnd));
console.log('  Entries: ' + ((tableEnd - tableStart) / 4));

// Now search for references to the full table start
console.log('\n## Searching for references to table start ' + hex(tableStart));
var tsLo = tableStart & 0xFF;
var tsMid = (tableStart >> 8) & 0xFF;
var tsHi = (tableStart >> 16) & 0xFF;
for (var pc2 = 0; pc2 < 0x400000 - 4; pc2++) {
  if (rom[pc2] === tsLo && rom[pc2+1] === tsMid && rom[pc2+2] === tsHi) {
    var prev2 = rom[pc2-1];
    if (prev2 === 0x21 || prev2 === 0x11 || prev2 === 0x01) {
      var instrStart3 = pc2 - 1;
      var rows4 = disasmRange(Math.max(0, instrStart3 - 24), instrStart3 + 28);
      console.log('\n  Found reference to ' + hex(tableStart) + ' at ' + hex(instrStart3) + ':');
      for (var r of rows4) {
        var marker3 = (r.pc === instrStart3) ? ' <<< ' : '     ';
        console.log(marker3 + hex(r.pc) + '  ' + r.bytes.padEnd(20) + ' ' + r.dasm);
      }
    }
  }
}

// 9. This is the OS bcall vector table! Each JP entry is a bcall handler.
// bcall mechanism: RST 28h pushes return address, then uses the 3-byte
// inline argument as a bcall number to index into the vector table.
// Let's decode the RST 28h handler to confirm.
console.log('\n## RST 28h handler (bcall dispatch)');
var rstRows = disasmRange(0x000028, 0x000028 + 40);
printRows(rstRows, 'RST 28h at 0x000028');

// Also check RST 0x28 in ADL mode (the actual bcall vector)
console.log('\n## Checking 0x000028 and nearby for bcall dispatcher');
var rst2Rows = disasmRange(0x000020, 0x000060);
printRows(rst2Rows, '0x000020 - 0x000060');

// 10. Compute the bcall numbers for our 9 entries at 0x021E58
// bcall_number = (entry_address - table_start) / 4
console.log('\n## bcall numbers for entries at 0x021E58');
var entryAddrs = [];
for (var i = 0; i < 9; i++) {
  entryAddrs.push(0x021E58 + i * 4);
}
for (var addr of entryAddrs) {
  var bcallNum = (addr - tableStart) / 4;
  var target2 = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
  console.log('  ' + hex(addr) + '  bcall ' + hex(bcallNum, 4) + ' (0x' + bcallNum.toString(16).padStart(4, '0') + ')  -> ' + hex(target2));
}

// 11. Now search ROM for RST 28h (0xEF) followed by the bcall number for entry 8 (0x05D5C2)
// to find WHO calls bcall for the key action table initializer
console.log('\n## Searching for callers of each bcall');
for (var i2 = 0; i2 < 9; i2++) {
  var entryAddr2 = 0x021E58 + i2 * 4;
  var bcallNum2 = (entryAddr2 - tableStart) / 4;
  // In eZ80 ADL mode, RST 28h is 0xEF followed by 3-byte LE bcall number
  var bLo = bcallNum2 & 0xFF;
  var bMid = (bcallNum2 >> 8) & 0xFF;
  var bHi = (bcallNum2 >> 16) & 0xFF;
  var callersList = [];
  for (var pc3 = 0; pc3 < 0x400000 - 4; pc3++) {
    if (rom[pc3] === 0xEF && rom[pc3+1] === bLo && rom[pc3+2] === bMid && rom[pc3+3] === bHi) {
      callersList.push(pc3);
    }
  }
  var target3 = rom[entryAddr2+1] | (rom[entryAddr2+2] << 8) | (rom[entryAddr2+3] << 16);
  console.log('\n  bcall ' + hex(bcallNum2, 4) + ' -> ' + hex(target3) + ': ' + callersList.length + ' callers');
  for (var caller of callersList.slice(0, 10)) {
    console.log('    ' + hex(caller));
    // Show context around the caller
    var ctxRows = disasmRange(Math.max(0, caller - 8), caller + 12);
    for (var r of ctxRows) {
      var m = (r.pc === caller) ? ' >>> ' : '     ';
      console.log(m + hex(r.pc) + '  ' + r.bytes.padEnd(20) + ' ' + r.dasm);
    }
  }
}

// 12. Also check: maybe it's not RST 28h. Check what the bcall mechanism actually is.
// TI-84 CE uses CALL 0x000028 or RST 28h for bcalls. Let's also try CALL 021E78 directly.
console.log('\n## Direct CALL/JP to 0x021E78 (the specific JP 0x05D5C2 entry)');
var directCallers = findCallersOf(0x021E78, 0x021E7C);
if (directCallers.length === 0) {
  console.log('  (none found)');
} else {
  for (var c of directCallers) {
    console.log('  ' + hex(c.from) + '  ' + c.tag + '  -> ' + hex(c.target));
  }
}

// 13. The RST 28h handler jumps to 0x02011C. Decode the bcall dispatcher there.
console.log('\n## bcall dispatcher at 0x020100 - 0x020180');
var bcallDispRows = disasmRange(0x020100, 0x020180);
printRows(bcallDispRows, 'bcall dispatcher (0x020100-0x020180)');

// 14. Now let's understand the actual bcall invocation.
// TI-84 CE bcall is: RST 28h followed by 2-byte (z80) or 3-byte (ADL) bcall number.
// The RST handler reads the inline bcall number from the return address on stack.
// Since RST 28h at 0x000028 does: DI; LD A, MB; LIL JP 0x02011C
// The LIL prefix means it runs in ADL mode. The bcall number is read from (SP) after RST.
// Let's check the dispatcher at 0x02011C more carefully.
console.log('\n## Detailed dispatcher decode at 0x020118-0x020160');
var detailRows = disasmRange(0x020118, 0x020160);
printRows(detailRows, 'Dispatcher 0x020118-0x020160');

// 15. Since EF (RST 28h) + bcall_num didn't find callers, the bcall number might
// be 2-byte (Z80 mode). Try searching for RST 28h (0xEF) + 2-byte LE bcall number.
console.log('\n## Searching for 2-byte bcall invocations (z80 mode)');
for (var i3 = 0; i3 < 9; i3++) {
  var entryAddr3 = 0x021E58 + i3 * 4;
  var bcallNum3 = (entryAddr3 - tableStart) / 4;
  // 2-byte LE
  var bLo2 = bcallNum3 & 0xFF;
  var bMid2 = (bcallNum3 >> 8) & 0xFF;
  var callersList2 = [];
  for (var pc4 = 0; pc4 < 0x400000 - 3; pc4++) {
    if (rom[pc4] === 0xEF && rom[pc4+1] === bLo2 && rom[pc4+2] === bMid2) {
      callersList2.push(pc4);
    }
  }
  var target4 = rom[entryAddr3+1] | (rom[entryAddr3+2] << 8) | (rom[entryAddr3+3] << 16);
  if (callersList2.length > 0) {
    console.log('\n  bcall ' + hex(bcallNum3, 4) + ' -> ' + hex(target4) + ': ' + callersList2.length + ' callers (2-byte)');
    for (var caller2 of callersList2.slice(0, 5)) {
      console.log('    ' + hex(caller2));
      var ctxRows2 = disasmRange(Math.max(0, caller2 - 8), caller2 + 12);
      for (var r of ctxRows2) {
        var m2 = (r.pc === caller2) ? ' >>> ' : '     ';
        console.log(m2 + hex(r.pc) + '  ' + r.bytes.padEnd(20) + ' ' + r.dasm);
      }
    }
  }
}

// 16. Also search for CALL to the target addresses directly (not through vector table)
console.log('\n## Direct CALLs to jump target addresses');
var directTargets = [0x07c6c7, 0x07c6b4, 0x07c6d0, 0x07f7fa, 0x07f7a8, 0x07d18d, 0x04a59a, 0x04897f, 0x05d5c2];
for (var dt of directTargets) {
  var directCalls = findCallersOf(dt, dt + 1);
  if (directCalls.length > 0) {
    console.log('\n  ' + hex(dt) + ': ' + directCalls.length + ' direct callers');
    for (var dc of directCalls.slice(0, 5)) {
      console.log('    ' + hex(dc.from) + '  ' + dc.tag + '  -> ' + hex(dc.target));
    }
  }
}

// 17. The RST 28h handler at 0x000028 jumps to 0x02011C -> JP 0x04AB69.
// Decode the actual bcall dispatcher at 0x04AB69.
console.log('\n## Actual bcall dispatcher at 0x04AB50 - 0x04AC20');
var realDispRows = disasmRange(0x04AB50, 0x04AC20);
printRows(realDispRows, 'bcall dispatcher (0x04AB50-0x04AC20)');

// 18. The RST 20h (0x000020) jumps to 0x020118 -> JP 0x04AB65
// RST 28h (0x000028) jumps to 0x02011C -> JP 0x04AB69
// RST 30h (0x000030) jumps to 0x020120 -> JP 0x04AB6D
// These are the 3 bcall entry points (for different calling modes).
// Decode the differences.
console.log('\n## Three bcall entry points');
console.log('  RST 20h -> 0x020118 -> 0x04AB65');
console.log('  RST 28h -> 0x02011C -> 0x04AB69');
console.log('  RST 30h -> 0x020120 -> 0x04AB6D');

// 19. Now search for RST 28h (opcode 0xEF) in the ROM to find bcall invocations.
// The problem is the bcall number might be 2 bytes (Z80 mode) since the table
// offset calculation works differently. The table has the first JP at 0x020104,
// so the table base is 0x020104. Entry at 0x021E78 is index (0x021E78-0x020104)/4 = 0x075D.
// But the bcall number on the TI-84 CE is typically the offset from the start,
// or it could be the raw 2-byte index. Let me check known bcall numbers.
// Known TI-84 CE bcalls: _ClrLCDFull = 0x04F0, _GetKey = 0x04F3, etc.
// These are typically 2-byte numbers used with RST 28h.
console.log('\n## Searching for RST 28h (0xEF) + known bcall patterns');
// Search for EF 5D 07 (bcall 0x075D, the key table init)
var efCallers = [];
for (var pc5 = 0; pc5 < 0x400000 - 3; pc5++) {
  if (rom[pc5] === 0xEF && rom[pc5+1] === 0x5D && rom[pc5+2] === 0x07) {
    efCallers.push(pc5);
  }
}
console.log('  RST 28h + 0x075D: ' + efCallers.length + ' callers');
for (var ec of efCallers) {
  var ctxRows3 = disasmRange(Math.max(0, ec - 12), ec + 16);
  console.log('\n  At ' + hex(ec) + ':');
  for (var r of ctxRows3) {
    var m3 = (r.pc === ec) ? ' >>> ' : '     ';
    console.log(m3 + hex(r.pc) + '  ' + r.bytes.padEnd(20) + ' ' + r.dasm);
  }
}

// 20. Let's also look at session 401's finding about the caller at 0x021E78.
// Session 401 said "0x05D5C2 has only 1 direct caller: a JP at 0x021E78".
// That JP is in the vector table. Now let's find who calls 0x05D5C2 through
// any mechanism. Search for the raw address bytes of 0x05D5C2 in the ROM.
console.log('\n## All references to 0x05D5C2 in ROM');
var refCount = 0;
for (var pc6 = 0; pc6 < 0x400000 - 3; pc6++) {
  if (rom[pc6] === 0xC2 && rom[pc6+1] === 0xD5 && rom[pc6+2] === 0x05) {
    refCount++;
    // Check what kind of instruction contains this
    var ctx = disasmRange(Math.max(0, pc6 - 4), pc6 + 8);
    var found = false;
    for (var r of ctx) {
      if (r.pc <= pc6 && r.pc + r.len > pc6) {
        if (r.inst.target === 0x05D5C2 || r.inst.value === 0x05D5C2 || r.inst.addr === 0x05D5C2) {
          console.log('  ' + hex(r.pc) + '  ' + r.dasm);
          found = true;
        }
      }
    }
    if (!found) {
      console.log('  ' + hex(pc6) + '  raw bytes C2 D5 05');
    }
  }
}
console.log('  Total references: ' + refCount);

console.log('\nDone.');
