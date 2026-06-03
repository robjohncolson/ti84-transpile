#!/usr/bin/env node
// Phase 511: Decode 0x06868A - shared cursor rendering dispatch.
// Called by cursor_draw (0x0B968E), cursor_render (0x0B96B3),
// cursor_erase (0x0B96E3), cursor init main loop (0x0B9473).
// Static ROM disassembly - no execution.

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');

// Known addresses for annotation
const KNOWN = new Map([
  [0x0A1799, 'glyph_to_vram_rasterizer (674B)'],
  [0x0A1B5B, 'column_tracking_wrapper'],
  [0x07D583, 'populator / scanner'],
  [0x0B968E, 'cursor_draw'],
  [0x0B96B3, 'cursor_render'],
  [0x0B96E3, 'cursor_erase'],
  [0x0B9473, 'cursor_init_main_loop'],
  [0x07BF3E, 'font_table_loader'],
  [0x0A2D4C, 'Y_row_calc'],
  [0x00038C, 'X_col_calc'],
  [0x04C885, 'cursor_state_triplet_writer'],
  [0x0B86AB, 'primary_cursor_activator'],
  [0x06868A, 'THIS_FUNCTION (cursor_render_dispatch)'],
]);

const KNOWN_RAM = new Map([
  [0xD005F9, 'active_glyph'],
  [0xD008D2, 'vram_x_pos'],
  [0xD008D5, 'vram_y_pos'],
  [0xD0069F, 'cursor_table_ptr'],
  [0xD005A1, 'font_table_ram'],
  [0xD01EB1, 'populator_gate'],
  [0xD02032, 'write_gate'],
  [0xD00080, 'IY_base'],
  [0xD005F8, 'glyph_flag_or_adj'],
]);

function annotateAddr(addr) {
  if (KNOWN.has(addr)) return `  ; << ${KNOWN.get(addr)} >>`;
  if (KNOWN_RAM.has(addr)) return `  ; << ${KNOWN_RAM.get(addr)} >>`;
  if (addr >= 0xD40000 && addr < 0xD40000 + 320 * 240 * 2) return '  ; << VRAM >>';
  if (addr >= 0xD00000 && addr < 0xD10000) return '  ; << RAM >>';
  return '';
}

// Convert decoder structured output to readable asm string
function formatInst(inst) {
  const h6 = (v) => hex(v, 6);
  const h2 = (v) => hex(v & 0xFF, 2);
  const dispStr = (d) => d >= 0 ? `+${d}` : `${d}`;

  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'exx': return 'EXX';
    case 'ex-de-hl': return 'EX DE,HL';
    case 'ex-sp-hl': return 'EX (SP),HL';
    case 'ex-sp-pair': return `EX (SP),${inst.pair.toUpperCase()}`;
    case 'ccf': return 'CCF';
    case 'scf': return 'SCF';
    case 'cpl': return 'CPL';
    case 'neg': return 'NEG';
    case 'daa': return 'DAA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rrd': return 'RRD';
    case 'rld': return 'RLD';
    case 'ldi': return 'LDI';
    case 'ldd': return 'LDD';
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpd': return 'CPD';
    case 'cpir': return 'CPIR';
    case 'cpdr': return 'CPDR';
    case 'ini': return 'INI';
    case 'ind': return 'IND';
    case 'inir': return 'INIR';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'outd': return 'OUTD';
    case 'otir': return 'OTIR';
    case 'otdr': return 'OTDR';
    case 'otimr': return 'OTIMR';
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'slp': return 'SLP';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'im': return `IM ${inst.value}`;

    // Loads
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()},${h2(inst.value)}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()},(${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}),${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()},${h6(inst.value)}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()},($${h6(inst.addr)})`;
    case 'ld-mem-pair': return `LD ($${h6(inst.addr)}),${inst.pair.toUpperCase()}`;
    case 'ld-a-mem': return `LD A,($${h6(inst.addr)})`;
    case 'ld-mem-a': return `LD ($${h6(inst.addr)}),A`;
    case 'ld-a-ind': return `LD A,(${inst.src.toUpperCase()})`;
    case 'ld-ind-a': return `LD (${inst.dest.toUpperCase()}),A`;
    case 'ld-sp-hl': return 'LD SP,HL';
    case 'ld-sp-pair': return `LD SP,${inst.pair.toUpperCase()}`;
    case 'ld-special': return `LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'ld-pair-ind': return `LD ${inst.pair.toUpperCase()},(${inst.src.toUpperCase()})`;
    case 'ld-ind-pair': return `LD (${inst.dest.toUpperCase()}),${inst.pair.toUpperCase()}`;
    case 'ld-a-mb': return 'LD A,MB';
    case 'ld-mb-a': return 'LD MB,A';

    // Indexed loads
    case 'ld-reg-ixd': return `LD ${inst.dest.toUpperCase()},(${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;
    case 'ld-ixd-reg': return `LD (${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)}),${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm': return `LD (${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)}),${h2(inst.value)}`;
    case 'ld-pair-indexed': return `LD ${inst.pair.toUpperCase()},(${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;
    case 'ld-indexed-pair': return `LD (${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)}),${inst.pair.toUpperCase()}`;
    case 'ld-ixiy-indexed': return `LD ${inst.dest.toUpperCase()},(${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;
    case 'ld-indexed-ixiy': return `LD (${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)}),${inst.src.toUpperCase()}`;

    // ALU
    case 'alu-reg': return `${inst.op.toUpperCase()} A,${inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} A,${h2(inst.value)}`;
    case 'alu-ixd': return `${inst.op.toUpperCase()} A,(${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;

    // 16-bit arith
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL,${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL,${inst.src.toUpperCase()}`;

    // 8-bit inc/dec
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-ind': return 'INC (HL)';
    case 'dec-ind': return 'DEC (HL)';
    case 'inc-ixd': return `INC (${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;
    case 'dec-ixd': return `DEC (${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;

    // Push/Pop
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;

    // Jumps
    case 'jp': return `JP ${h6(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()},${h6(inst.target)}`;
    case 'jp-indirect': return `JP (${inst.indirectRegister.toUpperCase()})`;
    case 'jr': return `JR ${h6(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()},${h6(inst.target)}`;
    case 'djnz': return `DJNZ ${h6(inst.target)}`;

    // Calls
    case 'call': return `CALL ${h6(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()},${h6(inst.target)}`;

    // RST
    case 'rst': return `RST ${h2(inst.target)}`;

    // Bit ops
    case 'bit-test': return `BIT ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit},(HL)`;
    case 'bit-set': return `SET ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${inst.bit},(HL)`;
    case 'bit-reset': return `RES ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'bit-reset-ind': return `RES ${inst.bit},(HL)`;
    case 'indexed-cb-bit': return `BIT ${inst.bit},(${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;
    case 'indexed-cb-set': return `SET ${inst.bit},(${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;
    case 'indexed-cb-res': return `RES ${inst.bit},(${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;
    case 'indexed-cb-rotate': return `${inst.operation.toUpperCase()} (${inst.indexRegister.toUpperCase()}${dispStr(inst.displacement)})`;

    // Rotate
    case 'rotate-reg': return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'rotate-ind': return `${inst.op.toUpperCase()} (HL)`;

    // I/O
    case 'in-imm': return `IN A,(${h2(inst.port)})`;
    case 'out-imm': return `OUT (${h2(inst.port)}),A`;
    case 'in-reg': return `IN ${inst.reg.toUpperCase()},(C)`;
    case 'out-reg': return `OUT (C),${inst.reg.toUpperCase()}`;
    case 'in0': return `IN0 ${inst.reg.toUpperCase()},(${h2(inst.port)})`;
    case 'out0': return `OUT0 (${h2(inst.port)}),${inst.reg.toUpperCase()}`;

    // MLT, TST, LEA, PEA
    case 'mlt': return `MLT ${inst.reg.toUpperCase()}`;
    case 'tst-reg': return `TST A,${inst.reg.toUpperCase()}`;
    case 'tst-ind': return 'TST A,(HL)';
    case 'tst-imm': return `TST A,${h2(inst.value)}`;
    case 'tstio': return `TSTIO ${h2(inst.value)}`;
    case 'lea': return `LEA ${inst.dest.toUpperCase()},${inst.base.toUpperCase()}${dispStr(inst.displacement)}`;
    case 'pea': return `PEA ${inst.base.toUpperCase()}${dispStr(inst.displacement)}`;

    default: return `??? [tag=${inst.tag}]`;
  }
}

function getReferencedAddr(inst) {
  // Return any address this instruction references (for annotation)
  if (inst.target !== undefined) return inst.target;
  if (inst.addr !== undefined) return inst.addr;
  if (inst.value !== undefined && inst.value >= 0xD00000) return inst.value;
  return null;
}

function disasmRange(startAddr, maxBytes, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}: ${hex(startAddr)} - ${hex(startAddr + maxBytes - 1)}`);
  console.log('='.repeat(70));

  const instructions = [];
  const callTargets = [];
  const jpTargets = [];
  const memRefs = [];
  let pc = startAddr;
  const endPc = startAddr + maxBytes;
  let retCount = 0;

  while (pc < endPc && retCount < 3) {
    if (pc >= rom.length) { console.log(`  ${hex(pc)}  <beyond ROM>`); break; }

    let inst;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch (e) {
      console.log(`  ${hex(pc)}  DB ${hex(rom[pc], 2)}  ; decode error: ${e.message}`);
      pc += 1;
      continue;
    }

    if (!inst || !inst.length || inst.length === 0) {
      console.log(`  ${hex(pc)}  DB ${hex(rom[pc], 2)}`);
      pc += 1;
      continue;
    }

    const rawBytes = Array.from(rom.slice(pc, pc + inst.length))
      .map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const dasm = formatInst(inst);

    // Collect targets for summary
    const refAddr = getReferencedAddr(inst);
    let annotation = '';
    if (refAddr !== null) {
      annotation = annotateAddr(refAddr);
    }

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push({ pc, target: inst.target, dasm });
    }
    if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
      jpTargets.push({ pc, target: inst.target, dasm });
    }
    if (inst.addr !== undefined && inst.addr >= 0xD00000) {
      memRefs.push({ pc, addr: inst.addr, dasm });
    }

    const prefix = inst.modePrefix ? `.${inst.modePrefix.toUpperCase()} ` : '';
    console.log(`  ${hex(pc)}  ${rawBytes.padEnd(24)} ${prefix}${dasm}${annotation}`);
    instructions.push({ pc, dasm, inst, rawBytes });

    if (inst.tag === 'ret') retCount++;
    else retCount = 0;

    pc += inst.length;
  }

  return { instructions, callTargets, jpTargets, memRefs, endPc: pc };
}

// -- Main decode --
console.log('# Phase 511: Decode 0x06868A - Cursor Rendering Dispatch\n');

const main = disasmRange(0x06868A, 250, 'PRIMARY: 0x06868A');

console.log('\n-- Call Targets --');
for (const c of main.callTargets) {
  const label = KNOWN.get(c.target) || '';
  console.log(`  ${hex(c.pc)} -> CALL ${hex(c.target)} ${label}`);
}

console.log('\n-- JP Targets --');
for (const j of main.jpTargets) {
  const label = KNOWN.get(j.target) || '';
  console.log(`  ${hex(j.pc)} -> JP ${hex(j.target)} ${label}`);
}

console.log('\n-- Memory References --');
for (const m of main.memRefs) {
  const label = KNOWN_RAM.get(m.addr) || '';
  console.log(`  ${hex(m.pc)} -> ${hex(m.addr)} ${label} -- ${m.dasm}`);
}

// -- Follow first call target if 0x06868A is a thin wrapper --
const firstCallIdx = main.instructions.findIndex(i =>
  i.inst.tag === 'call' || i.inst.tag === 'call-conditional');
if (firstCallIdx >= 0 && firstCallIdx < 8) {
  const target = main.callTargets[0]?.target;
  if (target && target > 0 && target < rom.length && !KNOWN.has(target)) {
    console.log(`\n** Thin wrapper detected (${firstCallIdx + 1} instructions before first CALL)`);
    console.log(`** Following call target ${hex(target)}...\n`);
    const sub = disasmRange(target, 200, `SUB-TARGET: ${hex(target)}`);
    console.log('\n-- Sub-target Call Targets --');
    for (const c of sub.callTargets) {
      const label = KNOWN.get(c.target) || '';
      console.log(`  ${hex(c.pc)} -> CALL ${hex(c.target)} ${label}`);
    }
    console.log('\n-- Sub-target Memory References --');
    for (const m of sub.memRefs) {
      const label = KNOWN_RAM.get(m.addr) || '';
      console.log(`  ${hex(m.pc)} -> ${hex(m.addr)} ${label} -- ${m.dasm}`);
    }
  } else if (target && KNOWN.has(target)) {
    console.log(`\n** Thin wrapper -> ${KNOWN.get(target)} at ${hex(target)}`);
  }
}

// -- Follow JP targets outside main range --
for (const j of main.jpTargets) {
  if (j.target > 0 && j.target < rom.length) {
    if (j.target < 0x06868A || j.target > 0x06868A + 250) {
      const label = KNOWN.has(j.target) ? KNOWN.get(j.target) : null;
      if (!label) {
        console.log(`\n** Following JP target ${hex(j.target)}...\n`);
        const sub = disasmRange(j.target, 150, `JP-TARGET: ${hex(j.target)}`);
        console.log('\n-- JP-sub Call Targets --');
        for (const c of sub.callTargets) {
          const kl = KNOWN.get(c.target) || '';
          console.log(`  ${hex(c.pc)} -> CALL ${hex(c.target)} ${kl}`);
        }
        console.log('\n-- JP-sub Memory References --');
        for (const m of sub.memRefs) {
          const kl = KNOWN_RAM.get(m.addr) || '';
          console.log(`  ${hex(m.pc)} -> ${hex(m.addr)} ${kl} -- ${m.dasm}`);
        }
      } else {
        console.log(`\n** JP to known: ${hex(j.target)} = ${label}`);
      }
    }
  }
}

// -- Scan ROM for callers of 0x06868A --
console.log('\n\n-- ROM Callers of 0x06868A --');
const targetLE = [0x8A, 0x86, 0x06]; // LE encoding
let callerCount = 0;
for (let i = 0; i < Math.min(rom.length, 0x400000) - 4; i++) {
  const op = rom[i];
  if ((op === 0xCD || op === 0xC4 || op === 0xCC || op === 0xD4 || op === 0xDC ||
       op === 0xE4 || op === 0xEC || op === 0xF4 || op === 0xFC ||
       op === 0xC3 || op === 0xC2 || op === 0xCA || op === 0xD2 || op === 0xDA) &&
      rom[i + 1] === targetLE[0] && rom[i + 2] === targetLE[1] && rom[i + 3] === targetLE[2]) {
    const opName = op === 0xCD ? 'CALL' : op === 0xC3 ? 'JP' :
                   op === 0xC4 ? 'CALL NZ' : op === 0xCC ? 'CALL Z' :
                   op === 0xD4 ? 'CALL NC' : op === 0xDC ? 'CALL C' :
                   op === 0xC2 ? 'JP NZ' : op === 0xCA ? 'JP Z' :
                   op === 0xD2 ? 'JP NC' : op === 0xDA ? 'JP C' :
                   `cond(${hex(op, 2)})`;
    console.log(`  ${hex(i)}: ${opName} 0x06868A`);
    callerCount++;
  }
}
console.log(`  Total: ${callerCount} call/jp sites\n`);

console.log('# Done.');
