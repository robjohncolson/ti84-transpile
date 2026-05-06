#!/usr/bin/env node
/**
 * probe-phase196-lddr-block-inspect.mjs
 *
 * Phase 196 P2: Inspect transpiled block 0x092263 to determine whether
 * a LD BC,(addr) instruction before the LDDR overwrites the caller's BC=0x19.
 *
 * Experiments:
 *   A. Static ROM disassembly at 0x092263 (ADL mode, up to 20 instructions)
 *   B. Find transpiled block function for 092263 in ROM.transpiled.js (streaming)
 *   C. Static ROM disassembly at predecessor block 0x092259
 *   D. Trace BC through 0x092259 -> 0x092263 with seeded list data
 */

import fs from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);

// -- Formatting helpers --

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(v) {
  return hex(v & 0xff, 2);
}

function idx(base, disp) {
  return `(${base}${disp >= 0 ? '+' : ''}${disp})`;
}

function fmtAddr(addr, prefix) {
  if (typeof addr !== 'number') return 'n/a';
  const MBASE = 0xD0;
  const isShort = prefix === 'sis' || prefix === 'lis';
  if (!isShort) return hex(addr);
  return `${hex(addr)} => ${hex(((MBASE << 16) | (addr & 0xffff)) & 0xffffff)}`;
}

function fmtInst(inst) {
  const p = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'call': return `${p}call ${hex(inst.target)}`;
    case 'call-conditional': return `${p}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${p}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}jp (${inst.indirectRegister})`;
    case 'jr': return `${p}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return `${p}ret`;
    case 'ret-conditional': return `${p}ret ${inst.condition}`;
    case 'reti': return `${p}reti`;
    case 'retn': return `${p}retn`;
    case 'push': return `${p}push ${inst.pair}`;
    case 'pop': return `${p}pop ${inst.pair}`;
    case 'ld-pair-imm': return `${p}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${p}ld (${fmtAddr(inst.addr, inst.modePrefix)}), ${inst.pair}`
        : `${p}ld ${inst.pair}, (${fmtAddr(inst.addr, inst.modePrefix)})`;
    case 'ld-mem-pair': return `${p}ld (${fmtAddr(inst.addr, inst.modePrefix)}), ${inst.pair}`;
    case 'ld-reg-mem': return `${p}ld ${inst.dest}, (${fmtAddr(inst.addr, inst.modePrefix)})`;
    case 'ld-mem-reg': return `${p}ld (${fmtAddr(inst.addr, inst.modePrefix)}), ${inst.src}`;
    case 'ld-reg-imm': return `${p}ld ${inst.dest}, ${hex8(inst.value)}`;
    case 'ld-reg-reg': return `${p}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${p}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${p}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm': return `${p}ld (hl), ${hex8(inst.value)}`;
    case 'ld-pair-ind': return `${p}ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair': return `${p}ld (${inst.dest}), ${inst.pair}`;
    case 'ld-reg-ixd': return `${p}ld ${inst.dest}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${p}ld ${idx(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm': return `${p}ld ${idx(inst.indexRegister, inst.displacement)}, ${hex8(inst.value)}`;
    case 'inc-reg': return `${p}inc ${inst.reg}`;
    case 'dec-reg': return `${p}dec ${inst.reg}`;
    case 'inc-pair': return `${p}inc ${inst.pair}`;
    case 'dec-pair': return `${p}dec ${inst.pair}`;
    case 'inc-ixd': return `${p}inc ${idx(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `${p}dec ${idx(inst.indexRegister, inst.displacement)}`;
    case 'add-pair': return `${p}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${p}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${p}sbc hl, ${inst.src}`;
    case 'alu-imm': return `${p}${inst.op} ${hex8(inst.value)}`;
    case 'alu-reg': return `${p}${inst.op} ${inst.src}`;
    case 'alu-ixd': return `${p}${inst.op} ${idx(inst.indexRegister, inst.displacement)}`;
    case 'bit-test': return `${p}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${p}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res': return `${p}res ${inst.bit}, ${inst.reg}`;
    case 'bit-res-ind': return `${p}res ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set': return `${p}set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `${p}set ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': return `${p}bit ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${p}res ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${p}set ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'lea': return `${p}lea ${inst.dest}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'rotate-reg': return `${p}${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${p}${inst.op} (${inst.indirectRegister})`;
    case 'djnz': return `${p}djnz ${hex(inst.target)}`;
    case 'ex-af': return `${p}ex af, af'`;
    case 'ex-de-hl': return `${p}ex de, hl`;
    case 'exx': return `${p}exx`;
    case 'nop': return `${p}nop`;
    case 'halt': return `${p}halt`;
    case 'di': return `${p}di`;
    case 'ei': return `${p}ei`;
    case 'im': return `${p}im ${inst.mode ?? '?'}`;
    case 'rlca': return `${p}rlca`;
    case 'rrca': return `${p}rrca`;
    case 'rla': return `${p}rla`;
    case 'rra': return `${p}rra`;
    case 'daa': return `${p}daa`;
    case 'cpl': return `${p}cpl`;
    case 'scf': return `${p}scf`;
    case 'ccf': return `${p}ccf`;
    case 'rst': return `${p}rst ${hex(inst.target, 2)}`;
    case 'ldi': return `${p}ldi`;
    case 'ldir': return `${p}ldir`;
    case 'ldd': return `${p}ldd`;
    case 'lddr': return `${p}lddr`;
    case 'cpi': return `${p}cpi`;
    case 'cpir': return `${p}cpir`;
    case 'cpd': return `${p}cpd`;
    case 'cpdr': return `${p}cpdr`;
    case 'ini': return `${p}ini`;
    case 'inir': return `${p}inir`;
    case 'ind': return `${p}ind`;
    case 'indr': return `${p}indr`;
    case 'outi': return `${p}outi`;
    case 'otir': return `${p}otir`;
    case 'outd': return `${p}outd`;
    case 'otdr': return `${p}otdr`;
    case 'in-reg-c': return `${p}in ${inst.reg}, (c)`;
    case 'out-c-reg': return `${p}out (c), ${inst.reg}`;
    case 'in-a-n': return `${p}in a, (${hex8(inst.port)})`;
    case 'out-n-a': return `${p}out (${hex8(inst.port)}), a`;
    case 'neg': return `${p}neg`;
    case 'mlt': return `${p}mlt ${inst.pair}`;
    case 'tst-a-reg': return `${p}tst a, ${inst.src}`;
    case 'tst-a-imm': return `${p}tst a, ${hex8(inst.value)}`;
    case 'ex-sp-hl': return `${p}ex (sp), hl`;
    case 'ex-sp-ix': return `${p}ex (sp), ${inst.indexRegister}`;
    case 'ld-sp-hl': return `${p}ld sp, hl`;
    case 'ld-sp-ix': return `${p}ld sp, ${inst.indexRegister}`;
    default: return `${p}${inst.tag}`;
  }
}

// -- Disassembly helper --

function disassembleFrom(startAddr, maxInstructions) {
  const results = [];
  let pc = startAddr;

  for (let i = 0; i < maxInstructions; i += 1) {
    if (pc >= romBytes.length) break;

    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch (err) {
      results.push({
        address: hex(pc),
        rawByte: hex(romBytes[pc], 2),
        error: err.message,
      });
      pc += 1;
      continue;
    }

    const len = inst.length || 1;
    const rawBytes = Array.from(romBytes.subarray(pc, pc + len))
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');

    const dasm = fmtInst(inst);

    const entry = {
      address: hex(pc),
      bytes: rawBytes,
      length: len,
      mnemonic: dasm,
      tag: inst.tag,
    };

    // Annotate BC-related instructions
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      entry.bcEffect = `LD BC, ${hex(inst.value)} -- sets BC to ${inst.value}`;
    }
    if (inst.tag === 'ld-pair-mem' && inst.pair === 'bc') {
      entry.bcEffect = `LD BC, (${hex(inst.addr)}) -- loads BC from memory`;
    }
    if (inst.tag === 'pop' && inst.pair === 'bc') {
      entry.bcEffect = 'POP BC -- loads BC from stack';
    }
    if (inst.tag === 'ld-reg-imm' && (inst.dest === 'b' || inst.dest === 'c')) {
      entry.bcEffect = `LD ${inst.dest.toUpperCase()}, ${hex8(inst.value)} -- partial BC write`;
    }
    if (inst.tag === 'ld-reg-reg' && (inst.dest === 'b' || inst.dest === 'c')) {
      entry.bcEffect = `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()} -- partial BC write`;
    }
    if (inst.tag === 'ld-reg-mem' && (inst.dest === 'b' || inst.dest === 'c')) {
      entry.bcEffect = `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)}) -- partial BC write from memory`;
    }
    if (inst.tag === 'ld-reg-ind' && (inst.dest === 'b' || inst.dest === 'c')) {
      entry.bcEffect = `LD ${inst.dest.toUpperCase()}, (${inst.src}) -- partial BC write indirect`;
    }
    if (['lddr', 'ldir', 'ldd', 'ldi'].includes(inst.tag)) {
      entry.bcEffect = `${inst.tag.toUpperCase()} -- decrements BC (block transfer)`;
    }
    if (inst.tag === 'inc-pair' && inst.pair === 'bc') {
      entry.bcEffect = 'INC BC -- increments BC';
    }
    if (inst.tag === 'dec-pair' && inst.pair === 'bc') {
      entry.bcEffect = 'DEC BC -- decrements BC';
    }
    if (inst.tag === 'mlt' && inst.pair === 'bc') {
      entry.bcEffect = 'MLT BC -- B*C -> BC';
    }

    results.push(entry);

    // Stop at unconditional terminating instructions
    if (['ret', 'jp', 'jr', 'halt', 'reti', 'retn'].includes(inst.tag)) {
      break;
    }

    pc += len;
  }

  return results;
}

// -- Experiment A: Static disassembly at 0x092263 --

function experimentA() {
  console.log('=== Experiment A: Static disassembly at 0x092263 ===');
  const instructions = disassembleFrom(0x092263, 20);

  const bcWriters = instructions.filter((i) => i.bcEffect);

  return {
    startAddress: '0x092263',
    mode: 'adl',
    instructionCount: instructions.length,
    instructions,
    bcWritingInstructions: bcWriters,
    summary: bcWriters.length > 0
      ? `Found ${bcWriters.length} BC-affecting instruction(s) before/at LDDR`
      : 'No BC-writing instructions found before LDDR',
  };
}

// -- Experiment B: Find transpiled block in ROM.transpiled.js --

async function experimentB() {
  console.log('=== Experiment B: Find transpiled block 092263 ===');

  if (!fs.existsSync(TRANSPILED_PATH)) {
    return { error: 'ROM.transpiled.js not found. Run: node scripts/transpile-ti84-rom.mjs' };
  }

  const rl = createInterface({ input: createReadStream(TRANSPILED_PATH) });
  let capturing = false;
  const lines = [];
  let braceDepth = 0;

  for await (const line of rl) {
    if (!capturing && line.includes('092263')) {
      capturing = true;
      braceDepth = 0;
    }
    if (capturing) {
      lines.push(line);
      for (const ch of line) {
        if (ch === '{') braceDepth += 1;
        if (ch === '}') braceDepth -= 1;
      }
      // Stop once we close the outermost brace of the block
      if (braceDepth <= 0 && lines.length > 1) break;
      // Safety: don't capture more than 500 lines
      if (lines.length > 500) break;
    }
  }

  rl.close();

  // Also search for predecessor block 092259
  const rl2 = createInterface({ input: createReadStream(TRANSPILED_PATH) });
  let capturing2 = false;
  const lines2 = [];
  let braceDepth2 = 0;

  for await (const line of rl2) {
    if (!capturing2 && line.includes('092259')) {
      capturing2 = true;
      braceDepth2 = 0;
    }
    if (capturing2) {
      lines2.push(line);
      for (const ch of line) {
        if (ch === '{') braceDepth2 += 1;
        if (ch === '}') braceDepth2 -= 1;
      }
      if (braceDepth2 <= 0 && lines2.length > 1) break;
      if (lines2.length > 500) break;
    }
  }

  rl2.close();

  const body092263 = lines.join('\n');
  const body092259 = lines2.join('\n');

  // Look for BC-related patterns in the transpiled JS
  const bcPatterns092263 = lines
    .filter((l) => /\b(bc|_bc)\b/i.test(l) || /\bbc\s*=/i.test(l))
    .map((l) => l.trim());

  return {
    block092263: {
      found: lines.length > 0,
      lineCount: lines.length,
      body: body092263,
      bcRelatedLines: bcPatterns092263,
    },
    block092259: {
      found: lines2.length > 0,
      lineCount: lines2.length,
      body: body092259,
    },
  };
}

// -- Experiment C: Static disassembly at 0x092259 --

function experimentC() {
  console.log('=== Experiment C: Static disassembly at 0x092259 ===');
  const instructions = disassembleFrom(0x092259, 20);

  const bcWriters = instructions.filter((i) => i.bcEffect);

  return {
    startAddress: '0x092259',
    mode: 'adl',
    instructionCount: instructions.length,
    instructions,
    bcWritingInstructions: bcWriters,
  };
}

// -- Experiment D: Trace BC through blocks --

async function experimentD() {
  console.log('=== Experiment D: BC trace through 0x092259 -> 0x092263 ===');

  const MEM_SIZE = 0x1000000;
  const STACK_TOP = 0xD1A87E;
  const RETURN_SENTINEL = 0x7FFFFE;
  const TRACE_STOP = '__PHASE196_TRACE_STOP__';

  const LIST_DATA_ADDR = 0xD10000;
  const LIST_ELEMENTS = [
    Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Uint8Array.from([0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  ];

  // Load transpiled blocks
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  let BLOCKS = romModule.PRELIFTED_BLOCKS;
  if (Array.isArray(BLOCKS)) {
    BLOCKS = Object.fromEntries(BLOCKS.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  BLOCKS = BLOCKS ?? {};

  // Create memory and load ROM
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  // Seed list data
  const write16 = (addr, value) => {
    mem[addr & 0xFFFFFF] = value & 0xFF;
    mem[(addr + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  };
  const write24 = (addr, value) => {
    mem[addr & 0xFFFFFF] = value & 0xFF;
    mem[(addr + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
    mem[(addr + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
  };

  write16(LIST_DATA_ADDR, LIST_ELEMENTS.length);
  for (let i = 0; i < LIST_ELEMENTS.length; i += 1) {
    const offset = LIST_DATA_ADDR + 2 + (i * 9);
    for (let j = 0; j < 9; j += 1) {
      mem[(offset + j) & 0xFFFFFF] = LIST_ELEMENTS[i][j];
    }
  }

  // Seed allocator pointers (same as phase 195)
  const VAT_ENTRY_ADDR = 0xD1A800;
  const VAT_ENTRY_BYTES = Uint8Array.from([
    0x01,
    LIST_DATA_ADDR & 0xFF,
    (LIST_DATA_ADDR >>> 8) & 0xFF,
    (LIST_DATA_ADDR >>> 16) & 0xFF,
    0x00, 0x00, 0x01, 0x00,
  ]);
  for (let i = 0; i < VAT_ENTRY_BYTES.length; i += 1) {
    mem[(VAT_ENTRY_ADDR + i) & 0xFFFFFF] = VAT_ENTRY_BYTES[i];
  }

  write24(0xD02590, VAT_ENTRY_ADDR); // OPBASE
  write24(0xD02593, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length); // OPS
  write24(0xD0259A, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length); // PTEMP
  write24(0xD0259D, VAT_ENTRY_ADDR); // PROGPTR
  write24(0xD025A0, LIST_DATA_ADDR + 2 + LIST_ELEMENTS.length * 9); // NEWDATA_PTR

  write24(0xD01508, LIST_DATA_ADDR); // LIST_PTR_TABLE
  mem[0xD0150B] = 0x01; // LIST_COUNT
  mem[0xD0150C] = 0x01; // ACTIVE_LIST

  mem[0xD00089] |= 0x40; // STATFLAGS
  mem[0xD0009A] |= 0x04; // STATFLAGS2

  // Set up peripherals and executor
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Set up CPU state
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP;

  // Push return sentinel
  cpu.sp -= 3;
  write24(cpu.sp, RETURN_SENTINEL);

  // Set BC=0x19 (what predecessor should set)
  cpu._bc = 0x000019;

  // Set PC to 0x092259
  const ENTRY = 0x092259;
  const TARGET = 0x092263;

  const bcTrace = [];
  let stepCount = 0;
  const MAX_STEPS = 100;

  function makeStop(name, pc) {
    const error = new Error(TRACE_STOP);
    error.stopName = name;
    error.stopPc = pc;
    return error;
  }

  try {
    executor.runFrom(ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: 200,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xFFFFFF;
        stepCount = (step ?? 0) + 1;
        const bcVal = cpu._bc & 0xFFFFFF;
        bcTrace.push({
          step: stepCount,
          pc: hex(norm),
          mode: mode ?? 'adl',
          bc: hex(bcVal),
          bcRaw: bcVal,
          event: 'block',
        });

        // Stop after we see the target block execute
        if (norm === TARGET) {
          // Record one more then stop
          throw makeStop('target_reached', norm);
        }
        if (norm === RETURN_SENTINEL) {
          throw makeStop('return_sentinel', norm);
        }
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xFFFFFF;
        stepCount = (step ?? 0) + 1;
        const bcVal = cpu._bc & 0xFFFFFF;
        bcTrace.push({
          step: stepCount,
          pc: hex(norm),
          mode: mode ?? 'adl',
          bc: hex(bcVal),
          bcRaw: bcVal,
          event: 'missing_block',
        });

        if (norm === RETURN_SENTINEL) {
          throw makeStop('return_sentinel', norm);
        }
      },
    });
  } catch (err) {
    if (err?.message !== TRACE_STOP) {
      return {
        error: err?.stack ?? String(err),
        bcTrace,
      };
    }
  }

  // Final BC
  const finalBc = cpu._bc & 0xFFFFFF;

  // Find BC changes
  const bcChanges = [];
  for (let i = 1; i < bcTrace.length; i += 1) {
    if (bcTrace[i].bcRaw !== bcTrace[i - 1].bcRaw) {
      bcChanges.push({
        atStep: bcTrace[i].step,
        atPc: bcTrace[i].pc,
        previousBc: bcTrace[i - 1].bc,
        newBc: bcTrace[i].bc,
        previousBlock: bcTrace[i - 1].pc,
      });
    }
  }

  return {
    entryAddress: hex(ENTRY),
    targetAddress: hex(TARGET),
    initialBc: '0x000019',
    finalBc: hex(finalBc),
    totalSteps: bcTrace.length,
    bcTrace,
    bcChanges,
    bcChangedFromInitial: finalBc !== 0x19,
    summary: bcChanges.length > 0
      ? `BC changed ${bcChanges.length} time(s) during transition`
      : 'BC did not change during 0x092259 -> 0x092263 transition',
  };
}

// -- Main --

async function main() {
  const results = {};

  results.experimentA = experimentA();
  console.log(JSON.stringify(results.experimentA, null, 2));

  results.experimentC = experimentC();
  console.log(JSON.stringify(results.experimentC, null, 2));

  results.experimentB = await experimentB();
  console.log(JSON.stringify(results.experimentB, null, 2));

  results.experimentD = await experimentD();
  console.log(JSON.stringify(results.experimentD, null, 2));

  // Final summary
  console.log('\n=== FINAL SUMMARY ===');
  const bcWritersA = results.experimentA.bcWritingInstructions;
  if (bcWritersA.length > 0) {
    console.log('Block 0x092263 has BC-affecting instructions:');
    for (const w of bcWritersA) {
      console.log(`  ${w.address} ${w.mnemonic} -- ${w.bcEffect}`);
    }
  } else {
    console.log('Block 0x092263 has NO instructions that write BC before LDDR.');
  }

  if (results.experimentD.bcChanges?.length > 0) {
    console.log('BC CHANGED during trace:');
    for (const c of results.experimentD.bcChanges) {
      console.log(`  Step ${c.atStep} at ${c.atPc}: ${c.previousBc} -> ${c.newBc} (previous block: ${c.previousBlock})`);
    }
  } else {
    console.log('BC remained 0x19 throughout the trace.');
  }

  // Write structured output
  fs.writeFileSync(
    path.join(__dirname, 'phase196-lddr-block-inspect-results.json'),
    JSON.stringify(results, null, 2),
  );
  console.log('\nResults written to phase196-lddr-block-inspect-results.json');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
