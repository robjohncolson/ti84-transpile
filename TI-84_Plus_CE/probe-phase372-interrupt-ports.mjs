#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;
const SYSTEM_FLAGS_BASE = 0xD00080;

// Handler addresses from the ISR polling chain
const HANDLER_ADDRS = [
  0x001A4B, 0x001A5D, 0x001A77, 0x001A8D, 0x001AA3, 0x001ABB, 0x001ACF,
];

// ISR polling chain range
const ISR_CHAIN_START = 0x0019BE;
const ISR_CHAIN_END = 0x001A4A;

// Key addresses for keyboard detection
const SCAN_CODE_BUFFER = 0xD00587;
const KEY_FLAG_ADDR = 0xD00080; // IY+0, bit 3 = key available

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

// --- Formatting helpers ---

function hex(value, width = 6) {
  if (value == null || Number.isNaN(Number(value))) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexWord(value) {
  return ((value ?? 0) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function formatDisp(value) {
  return value >= 0
    ? `+0x${value.toString(16).toUpperCase()}`
    : `-0x${(-value).toString(16).toUpperCase()}`;
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (v) => hexByte(v),
  ).join(' ');
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function usesShortAddressing(inst) {
  return inst?.modePrefix === 'sis' || inst?.modePrefix === 'lis';
}

function formatDirectAddress(addr, shortAddress) {
  return shortAddress ? `0x${hexWord(addr)} [short/MBASE]` : hex(addr);
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatDisp(displacement)})`;
}

function formatInstruction(inst) {
  if (!inst) return 'db ??';
  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'nop');
    case 'halt': return withPrefix(inst, 'halt');
    case 'slp': return withPrefix(inst, 'slp');
    case 'di': return withPrefix(inst, 'di');
    case 'ei': return withPrefix(inst, 'ei');
    case 'ret': return withPrefix(inst, 'ret');
    case 'reti': return withPrefix(inst, 'reti');
    case 'retn': return withPrefix(inst, 'retn');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'rst': return withPrefix(inst, `rst 0x${hexByte(inst.target)}`);
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'inc-pair': return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair': return withPrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'inc-ixd': return withPrefix(inst, `inc ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'dec-ixd': return withPrefix(inst, `dec ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'add-pair': return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'adc-pair': return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'sbc-pair': return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(inst, `ld ${inst.pair}, (${formatDirectAddress(inst.addr, usesShortAddressing(inst))})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `ld (${formatDirectAddress(inst.addr, usesShortAddressing(inst))}), ${inst.pair}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`);
    case 'ld-pair-ind':
      return withPrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-ind-pair':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, 0x${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind': return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg': return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-ind-imm': return withPrefix(inst, `ld (hl), 0x${hexByte(inst.value)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${inst.dest}, (${formatDirectAddress(inst.addr, usesShortAddressing(inst))})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${formatDirectAddress(inst.addr, usesShortAddressing(inst))}), ${inst.src}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, 0x${hexByte(inst.value)}`);
    case 'ld-ixiy-indexed':
      return withPrefix(inst, `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-ixiy':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'ld-sp-hl': return withPrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair': return withPrefix(inst, `ld sp, ${inst.pair}`);
    case 'ld-special': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-mb-a': return withPrefix(inst, 'ld mb, a');
    case 'ld-a-mb': return withPrefix(inst, 'ld a, mb');
    case 'alu-imm': return withPrefix(inst, `${inst.op} 0x${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-ixd': return withPrefix(inst, `${inst.op} ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'bit-test': return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind': return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res': return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind': return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set': return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind': return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-rotate':
      return withPrefix(inst, `${inst.operation ?? inst.op ?? 'rotate'} ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'rotate-reg': return withPrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rotate-ind': return withPrefix(inst, `${inst.op} (${inst.indirectRegister})`);
    case 'out-imm': return withPrefix(inst, `out (0x${hexByte(inst.port)}), a`);
    case 'in-imm': return withPrefix(inst, `in a, (0x${hexByte(inst.port)})`);
    case 'out-reg': return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'in-reg': return withPrefix(inst, `in ${inst.reg}, (c)`);
    case 'out0': return withPrefix(inst, `out0 (0x${hexByte(inst.port)}), ${inst.reg}`);
    case 'in0': return withPrefix(inst, `in0 ${inst.reg}, (0x${hexByte(inst.port)})`);
    case 'tst-reg': return withPrefix(inst, `tst a, ${inst.reg}`);
    case 'tst-ind': return withPrefix(inst, 'tst a, (hl)');
    case 'tst-imm': return withPrefix(inst, `tst a, 0x${hexByte(inst.value)}`);
    case 'tstio': return withPrefix(inst, `tstio 0x${hexByte(inst.value)}`);
    case 'lea': return withPrefix(inst, `lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`);
    case 'pea': return withPrefix(inst, `pea (${inst.base}${formatDisp(inst.displacement)})`);
    case 'neg': return withPrefix(inst, 'neg');
    case 'ex-af': return withPrefix(inst, "ex af, af'");
    case 'exx': return withPrefix(inst, 'exx');
    case 'ex-de-hl': return withPrefix(inst, 'ex de, hl');
    case 'ex-sp-hl': return withPrefix(inst, 'ex (sp), hl');
    case 'rlca': return withPrefix(inst, 'rlca');
    case 'rrca': return withPrefix(inst, 'rrca');
    case 'rla': return withPrefix(inst, 'rla');
    case 'rra': return withPrefix(inst, 'rra');
    case 'daa': return withPrefix(inst, 'daa');
    case 'cpl': return withPrefix(inst, 'cpl');
    case 'scf': return withPrefix(inst, 'scf');
    case 'ccf': return withPrefix(inst, 'ccf');
    case 'im': return withPrefix(inst, `im ${inst.value}`);
    case 'ldi': return withPrefix(inst, 'ldi');
    case 'ldd': return withPrefix(inst, 'ldd');
    case 'ldir': return withPrefix(inst, 'ldir');
    case 'lddr': return withPrefix(inst, 'lddr');
    case 'cpi': return withPrefix(inst, 'cpi');
    case 'cpd': return withPrefix(inst, 'cpd');
    case 'cpir': return withPrefix(inst, 'cpir');
    case 'cpdr': return withPrefix(inst, 'cpdr');
    case 'ini': return withPrefix(inst, 'ini');
    case 'ind': return withPrefix(inst, 'ind');
    case 'inir': return withPrefix(inst, 'inir');
    case 'indr': return withPrefix(inst, 'indr');
    case 'outi': return withPrefix(inst, 'outi');
    case 'outd': return withPrefix(inst, 'outd');
    case 'otir': return withPrefix(inst, 'otir');
    case 'otdr': return withPrefix(inst, 'otdr');
    case 'otimr': return withPrefix(inst, 'otimr');
    case 'stmix': return withPrefix(inst, 'stmix');
    case 'rsmix': return withPrefix(inst, 'rsmix');
    case 'mlt': return withPrefix(inst, `mlt ${inst.reg}`);
    case 'db': return withPrefix(inst, `db 0x${hexByte(inst.value ?? 0)}`);
    default: {
      const parts = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['tag', 'length', 'pc', 'nextPc', 'mode', 'modePrefix', 'nextMode', 'terminates', 'fallthrough', 'kind', 'decodeError'].includes(key)) continue;
        if (value === undefined || value === null) continue;
        parts.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${value}`);
      }
      return withPrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : (inst.tag ?? 'unknown'));
    }
  }
}

function decodeAt(romBytes, pc) {
  try {
    const inst = decodeInstruction(romBytes, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      value: romBytes[pc] ?? 0,
      length: 1,
      pc,
      nextPc: pc + 1,
      mode: MODE,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function disassembleWindow(romBytes, start, byteLimit) {
  const rows = [];
  const end = Math.min(romBytes.length, start + byteLimit);
  let pc = start >>> 0;

  while (pc < end) {
    const inst = decodeAt(romBytes, pc);
    const fullLength = Math.max(inst.length ?? 1, 1);
    const available = end - pc;
    const shownLength = Math.max(1, Math.min(fullLength, available));
    const text = formatInstruction(inst);
    const notes = [];

    // Annotate interesting references
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      const val = inst.value & 0xFFFFFF;
      if (val >= 0xA000 && val <= 0xA010) notes.push('keyboard controller port');
      if (val >= 0x5000 && val <= 0x501F) notes.push('interrupt controller port');
    }
    if ((inst.tag === 'ld-reg-mem' || inst.tag === 'ld-pair-mem') && inst.addr === SCAN_CODE_BUFFER) {
      notes.push('reads scan code buffer 0xD00587');
    }
    if ((inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') && inst.addr === SCAN_CODE_BUFFER) {
      notes.push('writes scan code buffer 0xD00587');
    }
    if (inst.tag === 'ld-ixd-reg' && inst.indexRegister === 'iy' && inst.displacement === 0) {
      notes.push('writes IY+0 (0xD00080 system flags byte)');
    }
    if (inst.tag === 'ld-reg-ixd' && inst.indexRegister === 'iy' && inst.displacement === 0) {
      notes.push('reads IY+0 (0xD00080 system flags byte)');
    }
    if (inst.tag === 'indexed-cb-set' && inst.indexRegister === 'iy' && inst.displacement === 0 && inst.bit === 3) {
      notes.push('SETS bit 3 of IY+0 = key-available flag!');
    }
    if (inst.tag === 'indexed-cb-res' && inst.indexRegister === 'iy' && inst.displacement === 0 && inst.bit === 3) {
      notes.push('CLEARS bit 3 of IY+0 = key-available flag');
    }
    if (inst.tag === 'indexed-cb-bit' && inst.indexRegister === 'iy' && inst.displacement === 0 && inst.bit === 3) {
      notes.push('TESTS bit 3 of IY+0 = key-available flag');
    }

    if (inst.decodeError) notes.push(`decode fallback: ${inst.decodeError}`);

    rows.push({
      pc,
      bytes: hexBytes(romBytes, pc, shownLength),
      text,
      notes,
      tag: inst.tag,
      inst,
    });

    if (fullLength > available) break;
    pc += fullLength;
  }

  return rows;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) return;
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function matchingVisitKeys(result, addr) {
  const prefix = `${addr.toString(16).padStart(6, '0')}:`;
  return Object.keys(result.blockVisits ?? {}).filter((key) => key.startsWith(prefix)).sort();
}

function visitCountForAddress(result, addr) {
  return matchingVisitKeys(result, addr).reduce((sum, key) => sum + (result.blockVisits?.[key] ?? 0), 0);
}

// --- Main ---

async function main() {
  if (!fs.existsSync(ROM_PATH)) throw new Error(`ROM not found: ${ROM_PATH}`);
  if (!fs.existsSync(TRANSPILED_PATH)) throw new Error(`Transpiled blocks not found: ${TRANSPILED_PATH}`);

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const BLOCKS = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default,
  );

  console.log('=== Phase 372: Interrupt Port Investigation ===\n');

  // =======================================================================
  // PART 1: ISR Polling Chain Disassembly (0x0019BE - 0x001A4A)
  // =======================================================================
  console.log('=== ISR POLLING CHAIN (0x0019BE-0x001A4A) ===\n');
  console.log('This chain reads port 0x5015 (masked status byte 1, bits 8-15)');
  console.log('and port 0x5014 (masked status byte 0, bits 0-7), then dispatches');
  console.log('to individual handlers based on which bits are set.\n');

  const chainRows = disassembleWindow(romBytes, ISR_CHAIN_START, ISR_CHAIN_END - ISR_CHAIN_START + 1);
  for (const row of chainRows) {
    const noteText = row.notes.length > 0 ? `  ; ${row.notes.join(' | ')}` : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}${noteText}`);
  }

  // Annotate the bit-to-handler mapping by analyzing the chain
  console.log('\n  --- Bit-to-handler annotation ---');
  console.log('  The ISR reads port 0x5015 into A, then uses RLA/RRA to shift');
  console.log('  bits through carry. Each JP C,handler dispatches on a specific bit.');
  console.log('  After exhausting 0x5015, it reads port 0x5014 similarly.\n');

  // =======================================================================
  // PART 2: Handler Disassembly
  // =======================================================================
  console.log('\n=== HANDLER DISASSEMBLY ===\n');

  const handlerAnalysis = [];
  for (const addr of HANDLER_ADDRS) {
    console.log(`--- ${hex(addr)} ---`);
    const rows = disassembleWindow(romBytes, addr, 60);

    // Track interesting things this handler does
    const analysis = {
      addr,
      readsKeyboardPorts: false,
      writesD00587: false,
      setsBit3IY0: false,
      portAccesses: [],
      memAccesses: [],
      calls: [],
    };

    for (const row of rows) {
      const noteText = row.notes.length > 0 ? `  ; ${row.notes.join(' | ')}` : '';
      console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}${noteText}`);

      const inst = row.inst;
      if (!inst) continue;

      // Check for keyboard port access (0xA000-0xA010)
      if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
        const val = inst.value & 0xFFFFFF;
        if (val >= 0xA000 && val <= 0xA010) analysis.readsKeyboardPorts = true;
      }
      if (inst.tag === 'in-reg' || inst.tag === 'out-reg') {
        analysis.portAccesses.push({ pc: row.pc, text: row.text });
      }
      if (inst.tag === 'in-imm' || inst.tag === 'out-imm' || inst.tag === 'in0' || inst.tag === 'out0') {
        analysis.portAccesses.push({ pc: row.pc, text: row.text });
      }

      // Check for scan code buffer write
      if ((inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') && inst.addr === SCAN_CODE_BUFFER) {
        analysis.writesD00587 = true;
      }
      if (inst.tag === 'ld-ixd-reg' && inst.indexRegister === 'iy') {
        analysis.memAccesses.push({ pc: row.pc, offset: inst.displacement, text: row.text });
      }
      if (inst.tag === 'ld-reg-ixd' && inst.indexRegister === 'iy') {
        analysis.memAccesses.push({ pc: row.pc, offset: inst.displacement, text: row.text });
      }

      // Check for setting bit 3 of IY+0
      if (inst.tag === 'indexed-cb-set' && inst.indexRegister === 'iy' && inst.displacement === 0 && inst.bit === 3) {
        analysis.setsBit3IY0 = true;
      }

      // Track calls
      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        analysis.calls.push({ pc: row.pc, target: inst.target });
      }
    }

    // If handler calls subroutines, disassemble them too (first level only)
    if (analysis.calls.length > 0) {
      console.log(`\n  Subroutine calls from ${hex(addr)}:`);
      for (const call of analysis.calls) {
        console.log(`    ${hex(call.pc)} -> ${hex(call.target)}`);
        // Disassemble first 40 bytes of each called subroutine
        const subRows = disassembleWindow(romBytes, call.target, 40);
        for (const subRow of subRows) {
          const subNotes = subRow.notes.length > 0 ? `  ; ${subRow.notes.join(' | ')}` : '';
          console.log(`      ${hex(subRow.pc)}: ${subRow.bytes.padEnd(24)} ${subRow.text}${subNotes}`);

          const subInst = subRow.inst;
          if (!subInst) continue;
          if (subInst.tag === 'ld-pair-imm' && subInst.pair === 'bc') {
            const val = subInst.value & 0xFFFFFF;
            if (val >= 0xA000 && val <= 0xA010) analysis.readsKeyboardPorts = true;
          }
          if ((subInst.tag === 'ld-mem-reg' || subInst.tag === 'ld-mem-pair') && subInst.addr === SCAN_CODE_BUFFER) {
            analysis.writesD00587 = true;
          }
          if (subInst.tag === 'indexed-cb-set' && subInst.indexRegister === 'iy' && subInst.displacement === 0 && subInst.bit === 3) {
            analysis.setsBit3IY0 = true;
          }
        }
      }
    }

    handlerAnalysis.push(analysis);
    console.log('');
  }

  // =======================================================================
  // PART 3: Boot phases 1-3
  // =======================================================================
  console.log('=== BOOT PHASES 1-3 ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));

  const bootPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const bootExecutor = createExecutor(BLOCKS, mem, { peripherals: bootPeripherals });
  const cpu = bootExecutor.cpu;

  // Phase 1
  const r1 = bootExecutor.runFrom(PHASE1_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`Phase 1: steps=${r1.steps} term=${r1.termination} lastPc=${hex(r1.lastPc)}`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 2
  const r2 = bootExecutor.runFrom(PHASE2_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log(`Phase 2: steps=${r2.steps} term=${r2.termination} lastPc=${hex(r2.lastPc)}`);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 3
  const r3 = bootExecutor.runFrom(PHASE3_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log(`Phase 3: steps=${r3.steps} term=${r3.termination} lastPc=${hex(r3.lastPc)}`);

  // Save post-boot state
  const bootCpuSnapshot = snapshotCpu(cpu);
  const bootLcdSnapshot = bootExecutor.lcdMmio
    ? { upbase: bootExecutor.lcdMmio.upbase, control: bootExecutor.lcdMmio.control }
    : null;

  // Save a copy of post-boot memory for restoring between tests
  const postBootMem = new Uint8Array(mem);

  console.log('');

  // =======================================================================
  // PART 4: Bit-to-handler mapping via dynamic testing
  // =======================================================================
  console.log('=== BIT-TO-HANDLER MAPPING (dynamic test) ===\n');
  console.log('For each bit 0-7 on port 0x5015, we inject that bit into the');
  console.log('masked status and run 10K steps to see which handler blocks');
  console.log('get visited.\n');

  const bitToHandler = {};

  for (let bit = 0; bit < 8; bit++) {
    const testValue = 1 << bit;
    console.log(`--- Testing port 0x5015 bit ${bit} (value=0x${hexByte(testValue)}) ---`);

    // Restore post-boot memory
    mem.set(postBootMem);

    // Create fresh peripherals with timer interrupt enabled
    const testPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });

    // Monkey-patch port 0x5015 to return our test bit
    const origRead = testPeripherals.read;
    testPeripherals.read = (port) => {
      const normalizedPort = port & 0xFFFF;
      if (normalizedPort === 0x5015) return testValue;
      return origRead(port);
    };

    const testExecutor = createExecutor(BLOCKS, mem, { peripherals: testPeripherals });
    const testCpu = testExecutor.cpu;

    restoreCpu(testCpu, bootCpuSnapshot);
    restoreLcdMmio(testExecutor, bootLcdSnapshot);

    testCpu.halted = false;
    testCpu.iff1 = 1;
    testCpu.iff2 = 1;
    testCpu.f = 0x40;
    testCpu._ix = 0xD1A860;
    testCpu._iy = SYSTEM_FLAGS_BASE;
    testCpu.sp = EVENT_RESET_SP;
    mem.fill(0xFF, testCpu.sp, testCpu.sp + 12);

    // Track which handler blocks get visited
    const handlerVisits = new Map();
    for (const addr of HANDLER_ADDRS) {
      handlerVisits.set(addr, 0);
    }

    const result = testExecutor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: 10000,
      maxLoopIterations: 10,
      onBlock(pc) {
        const normalizedPc = pc & 0xFFFFFF;
        if (handlerVisits.has(normalizedPc)) {
          handlerVisits.set(normalizedPc, handlerVisits.get(normalizedPc) + 1);
        }
      },
    });

    const visitedHandlers = [];
    for (const [addr, count] of handlerVisits.entries()) {
      if (count > 0) {
        visitedHandlers.push({ addr, count });
      }
    }

    console.log(`  steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
    if (visitedHandlers.length === 0) {
      console.log('  handlers visited: none');
    } else {
      for (const vh of visitedHandlers) {
        console.log(`  handler ${hex(vh.addr)} visited ${vh.count} times`);
        bitToHandler[bit] = vh.addr;
      }
    }

    // Check block visits for all handler addresses
    for (const addr of HANDLER_ADDRS) {
      const visits = visitCountForAddress(result, addr);
      if (visits > 0) {
        console.log(`  block visits for ${hex(addr)}: ${visits}`);
        if (!bitToHandler[bit]) bitToHandler[bit] = addr;
      }
    }

    // Check RAM state: did anything write to 0xD00587 or set bit 3 of 0xD00080?
    const scanCodeVal = mem[SCAN_CODE_BUFFER];
    const flagByte = mem[KEY_FLAG_ADDR];
    const bit3Set = (flagByte & 0x08) !== 0;
    console.log(`  RAM 0xD00587 (scan code): 0x${hexByte(scanCodeVal)}`);
    console.log(`  RAM 0xD00080 (IY+0): 0x${hexByte(flagByte)} bit3=${bit3Set ? 'SET' : 'clear'}`);
    console.log('');
  }

  // Also test port 0x5014 bits
  console.log('=== PORT 0x5014 BIT TESTS ===\n');

  for (let bit = 0; bit < 8; bit++) {
    const testValue = 1 << bit;
    console.log(`--- Testing port 0x5014 bit ${bit} (value=0x${hexByte(testValue)}) ---`);

    mem.set(postBootMem);

    const testPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
    const origRead = testPeripherals.read;
    testPeripherals.read = (port) => {
      const normalizedPort = port & 0xFFFF;
      if (normalizedPort === 0x5014) return testValue;
      return origRead(port);
    };

    const testExecutor = createExecutor(BLOCKS, mem, { peripherals: testPeripherals });
    const testCpu = testExecutor.cpu;

    restoreCpu(testCpu, bootCpuSnapshot);
    restoreLcdMmio(testExecutor, bootLcdSnapshot);

    testCpu.halted = false;
    testCpu.iff1 = 1;
    testCpu.iff2 = 1;
    testCpu.f = 0x40;
    testCpu._ix = 0xD1A860;
    testCpu._iy = SYSTEM_FLAGS_BASE;
    testCpu.sp = EVENT_RESET_SP;
    mem.fill(0xFF, testCpu.sp, testCpu.sp + 12);

    const handlerVisits = new Map();
    for (const addr of HANDLER_ADDRS) {
      handlerVisits.set(addr, 0);
    }

    const result = testExecutor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: 10000,
      maxLoopIterations: 10,
      onBlock(pc) {
        const normalizedPc = pc & 0xFFFFFF;
        if (handlerVisits.has(normalizedPc)) {
          handlerVisits.set(normalizedPc, handlerVisits.get(normalizedPc) + 1);
        }
      },
    });

    const visitedHandlers = [];
    for (const [addr, count] of handlerVisits.entries()) {
      if (count > 0) {
        visitedHandlers.push({ addr, count });
      }
    }

    console.log(`  steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
    if (visitedHandlers.length === 0) {
      console.log('  handlers visited: none');
    } else {
      for (const vh of visitedHandlers) {
        console.log(`  handler ${hex(vh.addr)} visited ${vh.count} times`);
      }
    }

    for (const addr of HANDLER_ADDRS) {
      const visits = visitCountForAddress(result, addr);
      if (visits > 0) {
        console.log(`  block visits for ${hex(addr)}: ${visits}`);
      }
    }

    const scanCodeVal = mem[SCAN_CODE_BUFFER];
    const flagByte = mem[KEY_FLAG_ADDR];
    const bit3Set = (flagByte & 0x08) !== 0;
    console.log(`  RAM 0xD00587 (scan code): 0x${hexByte(scanCodeVal)}`);
    console.log(`  RAM 0xD00080 (IY+0): 0x${hexByte(flagByte)} bit3=${bit3Set ? 'SET' : 'clear'}`);
    console.log('');
  }

  // =======================================================================
  // PART 5: Also test port 0x5016 (byte 2, bits 16-23) since setKeyboardIRQ
  // uses bit 19 which lands in this byte
  // =======================================================================
  console.log('=== PORT 0x5016 BIT TESTS (checking for keyboard bit bug) ===\n');
  console.log('setKeyboardIRQ sets bit 19 = bit 3 of port 0x5016.');
  console.log('Testing whether the ISR even reads port 0x5016...\n');

  for (let bit = 0; bit < 8; bit++) {
    const testValue = 1 << bit;

    mem.set(postBootMem);

    const testPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
    const origRead = testPeripherals.read;
    testPeripherals.read = (port) => {
      const normalizedPort = port & 0xFFFF;
      if (normalizedPort === 0x5016) return testValue;
      return origRead(port);
    };

    const testExecutor = createExecutor(BLOCKS, mem, { peripherals: testPeripherals });
    const testCpu = testExecutor.cpu;

    restoreCpu(testCpu, bootCpuSnapshot);
    restoreLcdMmio(testExecutor, bootLcdSnapshot);

    testCpu.halted = false;
    testCpu.iff1 = 1;
    testCpu.iff2 = 1;
    testCpu.f = 0x40;
    testCpu._ix = 0xD1A860;
    testCpu._iy = SYSTEM_FLAGS_BASE;
    testCpu.sp = EVENT_RESET_SP;
    mem.fill(0xFF, testCpu.sp, testCpu.sp + 12);

    const handlerVisits = new Map();
    for (const addr of HANDLER_ADDRS) {
      handlerVisits.set(addr, 0);
    }

    const result = testExecutor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: 10000,
      maxLoopIterations: 10,
      onBlock(pc) {
        const normalizedPc = pc & 0xFFFFFF;
        if (handlerVisits.has(normalizedPc)) {
          handlerVisits.set(normalizedPc, handlerVisits.get(normalizedPc) + 1);
        }
      },
    });

    const visitedHandlers = [];
    for (const [addr, count] of handlerVisits.entries()) {
      if (count > 0) visitedHandlers.push({ addr, count });
    }

    // Only report if something happened
    if (visitedHandlers.length > 0) {
      console.log(`  port 0x5016 bit ${bit} (value=0x${hexByte(testValue)}): HANDLER REACHED`);
      for (const vh of visitedHandlers) {
        console.log(`    handler ${hex(vh.addr)} visited ${vh.count} times`);
      }
    } else {
      // Check block visits too
      let anyVisits = false;
      for (const addr of HANDLER_ADDRS) {
        const visits = visitCountForAddress(result, addr);
        if (visits > 0) {
          if (!anyVisits) {
            console.log(`  port 0x5016 bit ${bit} (value=0x${hexByte(testValue)}): BLOCK VISITED`);
            anyVisits = true;
          }
          console.log(`    block ${hex(addr)}: ${visits}`);
        }
      }
      if (!anyVisits) {
        console.log(`  port 0x5016 bit ${bit} (value=0x${hexByte(testValue)}): no handler reached`);
      }
    }
  }

  // =======================================================================
  // PART 6: Keyboard Handler Identification Summary
  // =======================================================================
  console.log('\n=== KEYBOARD HANDLER IDENTIFICATION ===\n');

  console.log('Static analysis of handlers:');
  for (const analysis of handlerAnalysis) {
    const flags = [];
    if (analysis.readsKeyboardPorts) flags.push('READS_KEYBOARD_PORTS');
    if (analysis.writesD00587) flags.push('WRITES_D00587_SCANCODE');
    if (analysis.setsBit3IY0) flags.push('SETS_BIT3_IY0_KEYFLAG');
    if (analysis.calls.length > 0) flags.push(`calls=[${analysis.calls.map(c => hex(c.target)).join(',')}]`);
    if (analysis.portAccesses.length > 0) flags.push(`port_io=[${analysis.portAccesses.map(p => p.text).join('; ')}]`);
    console.log(`  ${hex(analysis.addr)}: ${flags.length > 0 ? flags.join(', ') : 'no keyboard indicators'}`);
  }

  console.log('\nBit-to-handler mapping (port 0x5015):');
  for (let bit = 0; bit < 8; bit++) {
    const handler = bitToHandler[bit];
    console.log(`  bit ${bit} -> ${handler ? hex(handler) : 'no handler reached'}`);
  }

  console.log('\nsetKeyboardIRQ bug analysis:');
  console.log(`  setKeyboardIRQ sets bit 19 of rawStatus (= bit 3 of byte 2)`);
  console.log(`  This means keyboard IRQ appears on port 0x5016, NOT 0x5015`);
  console.log(`  The ISR reads 0x5015 and 0x5014 but check above whether 0x5016 is read`);
  console.log(`  If no 0x5016 handlers fire, the keyboard bit position is WRONG`);
  console.log(`  Correct bit for keyboard (bit 10) would be: bit 2 of port 0x5015`);

  console.log('\n=== Phase 372 Complete ===');
}

await main();
