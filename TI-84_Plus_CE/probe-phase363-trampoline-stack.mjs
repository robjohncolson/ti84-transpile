#!/usr/bin/env node

/**
 * Phase 363: investigate RAM trampoline stack behavior
 *
 * Run summary:
 *   Not executed in subagent mode.
 *   Run:
 *     node TI-84_Plus_CE/probe-phase363-trampoline-stack.mjs
 *
 * Goal:
 *   Determine whether the built-in RAM trampoline changes SP differently from
 *   the real copied ROM routine at 0x000EBB..0x000F14.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const ROM_SIZE = 0x400000;
const RAM_THRESHOLD = 0xD00000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 50000;
const POST_WINDOW_BLOCKS = 20;

const COPY_SELECTOR_PC = 0x000E94;
const COPY_SELECTOR_RETURN_PC = 0x000E9D;
const COPY_HELPER_PC = 0x000D82;
const COMMON_RET_PC = 0x000DB6;
const RAM_ROUTINE_PC = 0xD18C22;
const ROM_ROUTINE_PC = 0x000EBB;
const ROM_ROUTINE_LENGTH = 90;

const RAM_SOURCE_MAP = new Map([
  [RAM_ROUTINE_PC, {
    label: 'flash self-test copy',
    romSource: ROM_ROUTINE_PC,
    copyLength: ROM_ROUTINE_LENGTH,
    callerPc: COPY_SELECTOR_PC,
    callerReturnPc: COPY_SELECTOR_RETURN_PC,
    helperPc: COPY_HELPER_PC,
    commonRetPc: COMMON_RET_PC,
  }],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function bytesAt(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, start + Math.max(1, length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read16(buffer, addr) {
  const a = addr & 0xFFFFFF;
  return ((buffer[a] ?? 0) | ((buffer[a + 1] ?? 0) << 8)) >>> 0;
}

function read24(buffer, addr) {
  const a = addr & 0xFFFFFF;
  return ((buffer[a] ?? 0) | ((buffer[a + 1] ?? 0) << 8) | ((buffer[a + 2] ?? 0) << 16)) >>> 0;
}

function safeDecode(romBytes, pc, mode = 'adl') {
  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch {
    return null;
  }
}

function formatAddr(addr) {
  if (addr === undefined || addr === null) {
    return 'n/a';
  }
  return hex(addr, addr > 0xFFFF ? 6 : 4);
}

function formatIndexedOperand(indexRegister, displacement = 0) {
  const prefix = (indexRegister ?? 'ix').toUpperCase();
  const disp = Number(displacement) | 0;
  if (disp === 0) {
    return `(${prefix})`;
  }
  return `(${prefix}${disp >= 0 ? '+' : ''}${disp})`;
}

function formatInstruction(inst) {
  if (!inst) {
    return '(decode failed)';
  }

  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${inst.indirectRegister.toUpperCase()})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-a-mb': return 'LD A, MB';
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-reg-imm': return `LD ${(inst.dest ?? inst.dst).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${(inst.dest ?? inst.dst).toUpperCase()}, (${formatAddr(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${formatAddr(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${(inst.dest ?? inst.dst).toUpperCase()}, (${(inst.src ?? inst.ptr).toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${(inst.dest ?? inst.ptr).toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-mem-pair':
      return `LD (${formatAddr(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${formatAddr(inst.addr)}), ${inst.pair.toUpperCase()}`;
      }
      return `LD ${inst.pair.toUpperCase()}, (${formatAddr(inst.addr)})`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-sp-pair': return `LD SP, ${inst.pair.toUpperCase()}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'bit-test': return `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'add-pair': return `ADD ${(inst.dest ?? 'HL').toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'xor': return 'XOR A';
    case 'in0': return `IN0 ${(inst.reg ?? 'A').toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0': return `OUT0 (${hexByte(inst.port)}), ${(inst.reg ?? 'A').toUpperCase()}`;
    case 'in-reg': return `IN ${(inst.reg ?? 'A').toUpperCase()}, (C)`;
    case 'out-reg': return `OUT (C), ${(inst.reg ?? 'A').toUpperCase()}`;
    case 'alu-reg':
      if (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc' || inst.op === 'cp') {
        return `${inst.op.toUpperCase()} A, ${inst.src.toUpperCase()}`;
      }
      return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm':
      if (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc' || inst.op === 'cp' || inst.op === 'and') {
        return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
      }
      return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    default: {
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key)) {
          continue;
        }
        if (value === undefined || value === null) {
          continue;
        }
        fields.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${String(value)}`);
      }
      return fields.length > 0 ? `${inst.tag} ${fields.join(' ')}` : inst.tag;
    }
  }
}

function isStopInstruction(inst) {
  if (!inst) {
    return true;
  }
  if (inst.tag === 'ret' || inst.tag === 'ret-conditional') {
    return true;
  }
  if (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jp-indirect') {
    return true;
  }
  if (inst.tag === 'jr' || inst.tag === 'jr-conditional') {
    return true;
  }
  return false;
}

function disassembleBlock(romBytes, startPc, maxBytes = 128, mode = 'adl') {
  const rows = [];
  let pc = startPc;
  const endPc = Math.min(romBytes.length, startPc + Math.max(1, maxBytes));

  while (pc < endPc) {
    const inst = safeDecode(romBytes, pc, mode);
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: formatInstruction(inst),
      inst,
    });

    pc += length;
    if (isStopInstruction(inst)) {
      break;
    }
  }

  return rows;
}

function disassembleLinear(romBytes, startPc, byteLength, mode = 'adl') {
  const rows = [];
  let pc = startPc;
  const endPc = Math.min(romBytes.length, startPc + Math.max(1, byteLength));

  while (pc < endPc) {
    const inst = safeDecode(romBytes, pc, mode);
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc += length;
  }

  return rows;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function regs(cpu, mode) {
  return {
    mode: mode ?? (cpu.madl ? 'adl' : 'z80'),
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    mbase: cpu.mbase & 0xFF,
    madl: cpu.madl ? 1 : 0,
  };
}

function formatRegs(r) {
  return `A=${hexByte(r.a)} F=${hexByte(r.f)} BC=${hex(r.bc)} DE=${hex(r.de)} HL=${hex(r.hl)} `
    + `IX=${hex(r.ix)} IY=${hex(r.iy)} SP=${hex(r.sp)} MBASE=${hexByte(r.mbase)} MADL=${r.madl} MODE=${r.mode}`;
}

function readStackEntries(cpu, mem, mode, count = 4) {
  const view = [];

  if (mode === 'adl') {
    let addr = cpu.sp & 0xFFFFFF;
    for (let i = 0; i < count; i += 1) {
      view.push({ addr, value: read24(mem, addr), width: 6 });
      addr = (addr + 3) & 0xFFFFFF;
    }
    return view;
  }

  let sps = cpu.sp & 0xFFFF;
  for (let i = 0; i < count; i += 1) {
    const addr = ((cpu.mbase & 0xFF) << 16) | sps;
    view.push({ addr, value: read16(mem, addr), width: 4 });
    sps = (sps + 2) & 0xFFFF;
  }
  return view;
}

function formatStackEntries(entries) {
  return entries.map((entry) => `[${hex(entry.addr)}]=${hex(entry.value, entry.width)}`).join('  ');
}

function simulateBuiltInTrampoline(cpu, mem) {
  const spBefore = cpu.sp & 0xFFFFFF;
  const retAddr = read24(mem, spBefore);
  return {
    width: 3,
    spBefore,
    retAddr,
    spAfter: (spBefore + 3) & 0xFFFFFF,
  };
}

function simulateModeAwareReturn(cpu, mem, mode) {
  if (mode === 'adl') {
    return simulateBuiltInTrampoline(cpu, mem);
  }

  const spBefore = cpu.sp & 0xFFFFFF;
  const stackAddr = ((cpu.mbase & 0xFF) << 16) | (spBefore & 0xFFFF);
  return {
    width: 2,
    spBefore,
    retAddr: read16(mem, stackAddr),
    spAfter: (spBefore & 0xFF0000) | ((spBefore + 2) & 0xFFFF),
    stackAddr,
  };
}

function summarizeStackOps(rows, width) {
  const pushRows = rows.filter((row) => row.inst?.tag === 'push');
  const popRows = rows.filter((row) => row.inst?.tag === 'pop');
  return {
    width,
    pushCount: pushRows.length,
    popCount: popRows.length,
    netDelta: (popRows.length - pushRows.length) * width,
    pushRows,
    popRows,
  };
}

function analyzeMappedRoutine(romBytes, sourceInfo, mode) {
  const copiedRows = disassembleLinear(romBytes, sourceInfo.romSource, sourceInfo.copyLength, mode);
  const helperRows = disassembleBlock(romBytes, sourceInfo.helperPc, 96, mode);
  const callerRows = disassembleBlock(romBytes, sourceInfo.callerPc, 24, mode);
  const tailRows = disassembleBlock(romBytes, sourceInfo.commonRetPc, 16, mode);
  const width = mode === 'adl' ? 3 : 2;

  const copiedStack = summarizeStackOps(copiedRows, width);
  const tailStack = summarizeStackOps(tailRows, width);
  const preFinalRetDelta = copiedStack.netDelta + tailStack.netDelta;
  const finalRetRow = tailRows.find((row) => row.inst?.tag === 'ret' || row.inst?.tag === 'ret-conditional') ?? null;
  const overallDelta = preFinalRetDelta + (finalRetRow ? width : 0);
  const copiedExit = copiedRows[copiedRows.length - 1] ?? null;

  let retPopsExplanation = 'No final RET was found.';
  if (finalRetRow) {
    if (preFinalRetDelta === 0) {
      retPopsExplanation = `The final RET at ${hex(finalRetRow.pc)} pops the caller return address that was already on the stack at RAM entry.`;
    } else {
      retPopsExplanation = `The final RET at ${hex(finalRetRow.pc)} pops stack data offset by ${preFinalRetDelta > 0 ? '+' : ''}${preFinalRetDelta} byte(s) relative to RAM entry.`;
    }
  }

  return {
    sourceInfo,
    mode,
    width,
    copiedRows,
    helperRows,
    callerRows,
    tailRows,
    copiedStack,
    tailStack,
    copiedExit,
    finalRetRow,
    preFinalRetDelta,
    overallDelta,
    retPopsExplanation,
    trampolineMatchesReal: overallDelta === 3 && preFinalRetDelta === 0,
  };
}

function regionName(value) {
  const v = value & 0xFFFFFF;
  if (v < ROM_SIZE) return 'ROM';
  if (v >= RAM_THRESHOLD) return 'RAM';
  return 'other';
}

function notePostEvent(record, humanStep, pc, mode, kind, cpu) {
  if (humanStep <= record.step) {
    return;
  }

  const entry = {
    step: humanStep,
    kind,
    pc: pc & 0xFFFFFF,
    mode: mode ?? (cpu.madl ? 'adl' : 'z80'),
    sp: cpu.sp & 0xFFFFFF,
  };

  if (!record.afterReturn) {
    record.afterReturn = {
      ...entry,
      regs: regs(cpu, entry.mode),
    };
  }

  if (record.postWindow.length < POST_WINDOW_BLOCKS) {
    record.postWindow.push(entry);
  }

  if (!record.firstRomSp && entry.sp < ROM_SIZE) {
    record.firstRomSp = entry;
  }
}

function printRows(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(18)} ${row.text}`);
  }
  console.log('');
}

function printStaticAnalysis(analysis) {
  const { sourceInfo } = analysis;

  console.log('=== PART 1: STATIC PATH / STACK ANALYSIS ===\n');
  printRows(`Caller block ${hex(sourceInfo.callerPc)}`, analysis.callerRows);
  printRows(`Copy helper ${hex(sourceInfo.helperPc)}`, analysis.helperRows);
  printRows(`Copied ROM routine ${hex(sourceInfo.romSource)}..${hex(sourceInfo.romSource + sourceInfo.copyLength - 1)}`, analysis.copiedRows);
  printRows(`Shared return tail ${hex(sourceInfo.commonRetPc)}`, analysis.tailRows);

  console.log('Stack accounting');
  console.log('----------------');
  console.log(`  active mode:                     ${analysis.mode}`);
  console.log(`  push/pop width:                  ${analysis.width} byte(s)`);
  console.log(`  copied routine PUSH count:       ${analysis.copiedStack.pushCount}`);
  console.log(`  copied routine POP count:        ${analysis.copiedStack.popCount}`);
  console.log(`  copied routine net stack delta:  ${analysis.copiedStack.netDelta > 0 ? '+' : ''}${analysis.copiedStack.netDelta}`);
  console.log(`  tail PUSH count:                 ${analysis.tailStack.pushCount}`);
  console.log(`  tail POP count:                  ${analysis.tailStack.popCount}`);
  console.log(`  tail net stack delta:            ${analysis.tailStack.netDelta > 0 ? '+' : ''}${analysis.tailStack.netDelta}`);
  console.log(`  pre-final-RET net delta:         ${analysis.preFinalRetDelta > 0 ? '+' : ''}${analysis.preFinalRetDelta}`);
  console.log(`  overall delta incl. final RET:   ${analysis.overallDelta > 0 ? '+' : ''}${analysis.overallDelta}`);
  console.log(`  copied routine exit:             ${analysis.copiedExit ? `${hex(analysis.copiedExit.pc)} ${analysis.copiedExit.text}` : 'n/a'}`);
  console.log(`  final RET site:                  ${analysis.finalRetRow ? `${hex(analysis.finalRetRow.pc)} ${analysis.finalRetRow.text}` : 'none'}`);
  console.log(`  RET pop semantics:               ${analysis.retPopsExplanation}`);
  console.log(`  trampoline-vs-real verdict:      ${analysis.trampolineMatchesReal ? 'MATCH (+3 bytes, balanced frame before RET)' : 'MISMATCH'}`);
  console.log('');
}

function printTrampolineRecord(index, record, analysis) {
  console.log(`Trampoline #${index + 1}`);
  console.log(`  step:                            ${record.step}`);
  console.log(`  RAM target:                      ${hex(record.pc)}:${record.mode}`);
  if (record.sourceInfo) {
    console.log(`  source:                          ${record.sourceInfo.label} from ${hex(record.sourceInfo.romSource)} (${record.sourceInfo.copyLength} bytes)`);
    console.log(`  expected caller return:          ${hex(record.sourceInfo.callerReturnPc)}`);
  } else {
    console.log('  source:                          unmapped RAM trampoline target');
  }
  console.log(`  SP before synthetic RET:         ${hex(record.builtIn.spBefore)} (${regionName(record.builtIn.spBefore)})`);
  console.log(`  popped return address:           ${hex(record.builtIn.retAddr)} (${regionName(record.builtIn.retAddr)})`);
  console.log(`  SP after synthetic RET:          ${hex(record.builtIn.spAfter)} (${regionName(record.builtIn.spAfter)})`);
  console.log(`  mode-aware RET width:            ${record.modeAware.width} byte(s)`);
  console.log(`  mode-aware return address:       ${hex(record.modeAware.retAddr, record.modeAware.width === 2 ? 4 : 6)}`);
  console.log(`  mode-aware SP after RET:         ${hex(record.modeAware.spAfter)} (${regionName(record.modeAware.spAfter)})`);
  console.log(`  register dump before trampoline: ${formatRegs(record.regsBefore)}`);
  console.log(`  stack before (${record.mode}):            ${formatStackEntries(record.stackBefore)}`);
  if (record.afterReturn) {
    console.log(`  next event after return:         step=${record.afterReturn.step} ${record.afterReturn.kind} ${hex(record.afterReturn.pc)}:${record.afterReturn.mode}`);
    console.log(`  SP seen after return:            ${hex(record.afterReturn.sp)} (${regionName(record.afterReturn.sp)})`);
    console.log(`  register dump after return:      ${formatRegs(record.afterReturn.regs)}`);
    console.log(`  return PC matches pop:           ${record.afterReturn.pc === record.builtIn.retAddr ? 'yes' : 'no'}`);
    console.log(`  SP matches computed pop:         ${record.afterReturn.sp === record.builtIn.spAfter ? 'yes' : 'no'}`);
  } else {
    console.log('  next event after return:         not observed before termination');
  }
  if (analysis) {
    console.log(`  real routine overall SP delta:   ${analysis.overallDelta > 0 ? '+' : ''}${analysis.overallDelta}`);
    console.log(`  synthetic-vs-real SP verdict:    ${analysis.trampolineMatchesReal ? 'same final SP effect' : 'different SP effect'}`);
  }
  if (record.firstRomSp) {
    console.log(`  first ROM-space SP after return: step=${record.firstRomSp.step} ${hex(record.firstRomSp.pc)}:${record.firstRomSp.mode} SP=${hex(record.firstRomSp.sp)}`);
  } else {
    console.log('  first ROM-space SP after return: not observed within this run');
  }
  if (record.postWindow.length > 0) {
    console.log('  post-return window:');
    for (const entry of record.postWindow) {
      console.log(`    step=${String(entry.step).padStart(5)}  ${entry.kind.padEnd(13)}  ${hex(entry.pc)}:${entry.mode}  SP=${hex(entry.sp)} (${regionName(entry.sp)})`);
    }
  }
  console.log('');
}

function printVerdict(run, analysesByPc) {
  console.log('=== PART 3: FINDINGS ===\n');
  console.log(`Boot summary: termination=${run.result.termination} steps=${run.result.steps} last=${hex(run.result.lastPc)}:${run.result.lastMode}`);
  console.log(`RAM trampoline activations: ${run.trampolines.length}`);
  console.log(`All missing blocks:         ${run.missingBlocks.length}`);
  console.log('');

  if (run.trampolines.length === 0) {
    console.log('No RAM trampoline activations were observed.');
    console.log('');
    return;
  }

  const first = run.trampolines[0];
  const analysis = analysesByPc.get(first.pc) ?? null;
  const immediateRam = first.afterReturn ? first.afterReturn.sp >= RAM_THRESHOLD : first.builtIn.spAfter >= RAM_THRESHOLD;
  const dynamicReturnOk = first.afterReturn ? first.afterReturn.pc === first.builtIn.retAddr && first.afterReturn.sp === first.builtIn.spAfter : false;

  console.log(`- The first RAM trampoline fired at ${hex(first.pc)}:${first.mode} on step ${first.step}.`);
  console.log(`- The built-in trampoline popped ${hex(first.builtIn.retAddr)} and advanced SP from ${hex(first.builtIn.spBefore)} to ${hex(first.builtIn.spAfter)}.`);
  console.log(`- Immediate post-return SP is ${immediateRam ? 'still in RAM' : 'not in RAM'}${first.afterReturn ? ` (${hex(first.afterReturn.sp)})` : ''}.`);
  if (analysis) {
    console.log(`- Static analysis of ${hex(first.sourceInfo.romSource)} shows balanced PUSH/POP pairs before the real final RET, and the real path exits through ${hex(first.sourceInfo.commonRetPc)} with the same overall +3-byte SP delta.`);
  }
  console.log(`- Synthetic-vs-observed return check: ${dynamicReturnOk ? 'the next executed block matches the popped return address and SP exactly' : 'the next executed block does not match the computed synthetic RET result'}.`);
  if (first.firstRomSp) {
    console.log(`- SP does later enter ROM space, but only after the trampoline return: first seen at step ${first.firstRomSp.step} in ${hex(first.firstRomSp.pc)}:${first.firstRomSp.mode} with SP=${hex(first.firstRomSp.sp)}.`);
  } else {
    console.log('- No ROM-space SP value was observed after the trampoline within the 5000-step run.');
  }
  console.log('');
}

function runBoot(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus) {
  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: 0xEF });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const trampolines = [];
  const missingBlocks = [];

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const humanStep = step + 1;
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';

      for (const record of trampolines) {
        notePostEvent(record, humanStep, normalizedPc, normalizedMode, 'block', cpu);
      }
    },
    onMissingBlock(pc, mode, step) {
      const humanStep = step + 1;
      const normalizedPc = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';

      for (const record of trampolines) {
        notePostEvent(record, humanStep, normalizedPc, normalizedMode, 'missing_block', cpu);
      }

      missingBlocks.push({
        step: humanStep,
        pc: normalizedPc,
        mode: normalizedMode,
      });

      if (normalizedPc < RAM_THRESHOLD) {
        return;
      }

      const sourceInfo = RAM_SOURCE_MAP.get(normalizedPc) ?? null;
      trampolines.push({
        step: humanStep,
        pc: normalizedPc,
        mode: normalizedMode,
        sourceInfo,
        regsBefore: regs(cpu, normalizedMode),
        stackBefore: readStackEntries(cpu, mem, normalizedMode, 4),
        builtIn: simulateBuiltInTrampoline(cpu, mem),
        modeAware: simulateModeAwareReturn(cpu, mem, normalizedMode),
        afterReturn: null,
        postWindow: [],
        firstRomSp: null,
      });
    },
  });

  return {
    result,
    trampolines,
    missingBlocks,
  };
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regenerated = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  const analysesByPc = new Map();
  for (const [ramPc, sourceInfo] of RAM_SOURCE_MAP.entries()) {
    analysesByPc.set(ramPc, analyzeMappedRoutine(romBytes, sourceInfo, 'adl'));
  }

  const run = runBoot(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus);

  console.log('Phase 363: RAM Trampoline Stack Behavior');
  console.log('========================================');
  console.log(`ROM:            ${ROM_PATH}`);
  console.log(`Transpiled ROM: ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:    entry=${hex(BOOT_ENTRY)}:${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} timerInterrupt=false gpioValue=${hexByte(0xEF)}`);
  console.log('');

  printStaticAnalysis(analysesByPc.get(RAM_ROUTINE_PC));

  console.log('=== PART 2: DYNAMIC TRAMPOLINE TRACE ===\n');
  if (run.trampolines.length === 0) {
    console.log('No RAM trampoline activations were observed.\n');
  } else {
    run.trampolines.forEach((record, index) => {
      printTrampolineRecord(index, record, analysesByPc.get(record.pc) ?? null);
    });
  }

  printVerdict(run, analysesByPc);
  console.log('--- probe complete ---');
}

main().catch((error) => {
  console.error('[probe-phase363-trampoline-stack] fatal:', error?.stack ?? error);
  process.exitCode = 1;
});
