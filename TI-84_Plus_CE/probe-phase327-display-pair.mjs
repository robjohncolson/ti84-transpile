#!/usr/bin/env node
// Phase 327: Investigate the "display rendering pair" at 0x07C8B7 and 0x07C77F.
//
// Both are called by the LCD timing diagnostic at 0x05749C.
// Session 150 identified 0x07C77F as FPAdd entry (SET 6,(IY+89); RES 6,(IY+14);
// CALL 0x07CC36). This probe verifies that and freshly disassembles 0x07C8B7.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

// ─── Helpers ────────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function nextPc(inst) {
  return inst.nextPc ?? (inst.pc + inst.length);
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${upper(indexRegister)}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  const prefix = inst.modePrefix ? `${upper(inst.modePrefix)} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${upper(inst.condition)}`;
    case 'reti': return `${prefix}RETI`;
    case 'retn': return `${prefix}RETN`;
    case 'halt': return `${prefix}HALT`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${upper(inst.indirectRegister)})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'push': return `${prefix}PUSH ${upper(inst.pair ?? inst.reg ?? inst.src)}`;
    case 'pop': return `${prefix}POP ${upper(inst.pair ?? inst.reg ?? inst.dest)}`;
    case 'inc-reg': return `${prefix}INC ${upper(inst.reg)}`;
    case 'dec-reg': return `${prefix}DEC ${upper(inst.reg)}`;
    case 'inc-pair': return `${prefix}INC ${upper(inst.pair)}`;
    case 'dec-pair': return `${prefix}DEC ${upper(inst.pair)}`;
    case 'add-pair': return `${prefix}ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'adc-pair': return `${prefix}ADC HL, ${upper(inst.src)}`;
    case 'sbc-pair': return `${prefix}SBC HL, ${upper(inst.src)}`;
    case 'alu-reg': return `${prefix}${upper(inst.op)} ${upper(inst.src ?? inst.reg)}`;
    case 'alu-imm': return `${prefix}${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `${prefix}LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${prefix}LD ${upper(inst.dest)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'ld-ind-imm': return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ind': return `${prefix}LD ${upper(inst.dest)}, (${upper(inst.indirectRegister ?? inst.src)})`;
    case 'ld-ind-reg': return `${prefix}LD (${upper(inst.indirectRegister ?? inst.dest)}), ${upper(inst.src)}`;
    case 'ld-reg-mem': return `${prefix}LD ${upper(inst.dest)}, (${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr ?? inst.address)}), ${upper(inst.src)}`;
    case 'ld-pair-mem': {
      const w = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      if (inst.direction === 'to-mem') return `LD (${hex(inst.addr, w)}), ${upper(inst.pair)}`;
      return `LD ${upper(inst.pair)}, (${hex(inst.addr, w)})`;
    }
    case 'ld-mem-pair': {
      const w = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      return `LD (${hex(inst.addr, w)}), ${upper(inst.pair)}`;
    }
    case 'ld-ixd-imm': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-ixd-reg': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${upper(inst.src)}`;
    case 'ld-reg-ixd': return `${prefix}LD ${upper(inst.dest)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-pair-indexed': return `${prefix}LD ${upper(inst.pair)}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'lea': return `${prefix}LEA ${upper(inst.dest)}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'bit-test': return `${prefix}BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res': return `${prefix}RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set': return `${prefix}SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-test-ind': return `${prefix}BIT ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-res-ind': return `${prefix}RES ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'bit-set-ind': return `${prefix}SET ${inst.bit}, (${upper(inst.indirectRegister)})`;
    case 'indexed-cb-bit': return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ldir': return `${prefix}LDIR`;
    case 'lddr': return `${prefix}LDDR`;
    case 'ldi': return `${prefix}LDI`;
    case 'ldd': return `${prefix}LDD`;
    case 'cpir': return `${prefix}CPIR`;
    case 'cpdr': return `${prefix}CPDR`;
    case 'ex-af': return `${prefix}EX AF, AF'`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'exx': return `${prefix}EXX`;
    case 'ex-sp-hl': return `${prefix}EX (SP), HL`;
    case 'ex-sp-ix': return `${prefix}EX (SP), IX`;
    case 'ex-sp-iy': return `${prefix}EX (SP), IY`;
    case 'rst': return `${prefix}RST ${hexByte(inst.target)}`;
    case 'out-imm': return `${prefix}OUT (${hexByte(inst.port)}), A`;
    case 'in-imm': return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out-c': return `${prefix}OUT (C), ${upper(inst.reg)}`;
    case 'in-c': return `${prefix}IN ${upper(inst.reg)}, (C)`;
    case 'im': return `${prefix}IM ${inst.mode}`;
    case 'rlca': return `${prefix}RLCA`;
    case 'rrca': return `${prefix}RRCA`;
    case 'rla': return `${prefix}RLA`;
    case 'rra': return `${prefix}RRA`;
    case 'daa': return `${prefix}DAA`;
    case 'cpl': return `${prefix}CPL`;
    case 'scf': return `${prefix}SCF`;
    case 'ccf': return `${prefix}CCF`;
    case 'neg': return `${prefix}NEG`;
    case 'rrd': return `${prefix}RRD`;
    case 'rld': return `${prefix}RLD`;
    case 'rotate-reg': return `${prefix}${upper(inst.op)} ${upper(inst.reg)}`;
    case 'rotate-ind': return `${prefix}${upper(inst.op)} (${upper(inst.indirectRegister)})`;
    default: {
      let text = `${prefix}[${inst.tag}]`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
      return text;
    }
  }
}

function isConditionalFlow(inst) {
  return ['jr-conditional', 'jp-conditional', 'ret-conditional', 'djnz', 'call-conditional'].includes(inst.tag);
}

function isHardExit(inst) {
  return ['ret', 'reti', 'retn', 'jp', 'jp-indirect', 'jr'].includes(inst.tag);
}

// ─── Static disassembly: collect all reachable instructions ─────────────────

function collectFunction(start, maxInstructions = 500) {
  const queue = [start];
  const queued = new Set(queue);
  const visitedStarts = new Set();
  const instructions = new Map();
  const blockStarts = new Set([start]);
  const directCalls = new Map();

  while (queue.length && instructions.size < maxInstructions) {
    const blockStart = queue.shift();
    if (visitedStarts.has(blockStart)) continue;
    visitedStarts.add(blockStart);

    let pc = blockStart;
    while (pc >= 0 && pc < rom.length && instructions.size < maxInstructions) {
      if (instructions.has(pc)) break;

      const inst = decodeSafe(pc);
      if (!inst || !inst.length) break;
      instructions.set(pc, inst);

      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        if (inst.target !== undefined) {
          if (!directCalls.has(inst.target)) directCalls.set(inst.target, []);
          directCalls.get(inst.target).push(inst.pc);
        }
        const fallthrough = inst.fallthrough ?? nextPc(inst);
        blockStarts.add(fallthrough);
        pc = fallthrough;
        continue;
      }

      if (isConditionalFlow(inst)) {
        if (inst.target !== undefined) {
          blockStarts.add(inst.target);
          if (!visitedStarts.has(inst.target) && !queued.has(inst.target)) {
            queue.push(inst.target);
            queued.add(inst.target);
          }
        }
        const fallthrough = inst.fallthrough ?? nextPc(inst);
        blockStarts.add(fallthrough);
        pc = fallthrough;
        continue;
      }

      if (isHardExit(inst)) break;
      pc = nextPc(inst);
    }
  }

  return {
    ordered: [...instructions.values()].sort((a, b) => a.pc - b.pc),
    blockStarts: [...blockStarts].sort((a, b) => a - b),
    directCalls: [...directCalls.entries()].map(([target, sites]) => ({ target, sites })),
  };
}

// ─── Caller scan: search ROM for CALL opcodes targeting an address ──────────

function countCallers(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const callers = [];

  for (let i = 0; i < rom.length - 3; i++) {
    // CD xx xx xx is CALL in ADL mode (4-byte)
    if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      callers.push(i);
    }
  }
  return callers;
}

// ─── Print disassembly report for one function ──────────────────────────────

function printDisassembly(label, start) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`=== ${label}: ${hex(start)} ===`);
  console.log('='.repeat(70));

  const trace = collectFunction(start);
  const blockSet = new Set(trace.blockStarts);

  console.log(`\nFull disassembly (${trace.ordered.length} instructions, ${trace.blockStarts.length} blocks):\n`);
  for (const inst of trace.ordered) {
    if (blockSet.has(inst.pc)) {
      console.log(`  [block ${hex(inst.pc)}]`);
    }
    const bytes = bytesToHex(rom.subarray(inst.pc, inst.pc + inst.length)).padEnd(20);
    const text = formatInstruction(inst).padEnd(38);
    console.log(`    ${hex(inst.pc)}: ${bytes} ${text}`);
  }

  if (trace.directCalls.length) {
    console.log(`\n  Direct CALL targets from this function:`);
    for (const call of trace.directCalls) {
      const sites = call.sites.map((s) => hex(s)).join(', ');
      console.log(`    ${hex(call.target)} called from ${sites}`);

      // Show first few instructions of the target
      let pc2 = call.target;
      const preview = [];
      const seen = new Set();
      while (preview.length < 6 && pc2 >= 0 && pc2 < rom.length && !seen.has(pc2)) {
        const inst2 = decodeSafe(pc2);
        if (!inst2 || !inst2.length) break;
        preview.push(inst2);
        seen.add(pc2);
        if (isHardExit(inst2)) break;
        pc2 = nextPc(inst2);
      }
      for (const inst2 of preview) {
        const bytes2 = bytesToHex(rom.subarray(inst2.pc, inst2.pc + inst2.length)).padEnd(20);
        console.log(`      ${hex(inst2.pc)}: ${bytes2} ${formatInstruction(inst2)}`);
      }
    }
  }

  return trace;
}

// ─── Dynamic trace ──────────────────────────────────────────────────────────

function runDynamicTrace(label, startAddr, maxSteps = 200) {
  console.log(`\n--- Dynamic trace: ${label} at ${hex(startAddr)}, max ${maxSteps} steps ---`);

  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(rom);

  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = ex.cpu;

  // Minimal OS init
  ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  // Set up IY = 0xD00080 (OS base)
  cpu.iy = 0xD00080;

  // Set up stack with sentinel return address
  cpu.sp = 0xD1A87E;
  cpu.sp -= 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;

  // Track blocks visited
  const blockHits = new Map();
  let blockCount = 0;

  // Track memory regions written
  const regionWrites = new Map();
  const origWrite = cpu.write8.bind(cpu);
  cpu.write8 = function (addr, value) {
    const region = (addr >> 16) & 0xFF;
    regionWrites.set(region, (regionWrites.get(region) || 0) + 1);
    return origWrite(addr, value);
  };

  const result = ex.runFrom(startAddr, 'adl', {
    maxSteps,
    maxLoopIterations: 50,
    onBlock: (pc) => {
      blockCount++;
      blockHits.set(hex(pc), (blockHits.get(hex(pc)) || 0) + 1);
    },
  });

  cpu.write8 = origWrite;

  console.log(`  Steps: ${result.steps}`);
  console.log(`  Termination: ${result.termination} at ${hex(result.lastPc)}`);
  console.log(`  Blocks visited: ${blockCount} total, ${blockHits.size} unique`);

  // Show block visit order
  const topBlocks = [...blockHits.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  console.log(`  Top blocks (by hit count):`);
  for (const [addr, count] of topBlocks) {
    console.log(`    ${addr}: ${count} hit(s)`);
  }

  // Show write regions
  if (regionWrites.size) {
    console.log(`  Memory write regions:`);
    for (const [region, count] of [...regionWrites.entries()].sort((a, b) => a - b)) {
      const regionName =
        region === 0xD0 ? 'OS RAM (0xD0xxxx)' :
        region === 0xD1 ? 'stack/heap (0xD1xxxx)' :
        region === 0xD4 ? 'VRAM (0xD4xxxx)' :
        region === 0xE3 ? 'LCD MMIO (0xE3xxxx)' :
        `0x${region.toString(16).padStart(2, '0')}xxxx`;
      console.log(`    ${regionName}: ${count} writes`);
    }
  }

  // Show final register state
  console.log(`  Final registers:`);
  console.log(`    A=${hexByte(cpu.a)}  F=${hexByte(cpu.f)}  BC=${hex(cpu.bc)}  DE=${hex(cpu.de)}  HL=${hex(cpu.hl)}`);
  console.log(`    IX=${hex(cpu.ix)}  IY=${hex(cpu.iy)}  SP=${hex(cpu.sp)}`);

  return result;
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('Phase 327: Display rendering pair investigation');
console.log(`ROM size: ${hex(rom.length, 8)} bytes`);
console.log('Targets: 0x07C8B7 and 0x07C77F');
console.log('Both called by LCD timing diagnostic at 0x05749C');
console.log();

// ── 1. Static disassembly ───────────────────────────────────────────────────

const trace1 = printDisassembly('Function A (fresh investigation)', 0x07C8B7);
const trace2 = printDisassembly('Function B (claimed FPAdd entry)', 0x07C77F);

// Also disassemble the caller at 0x05749C for context
printDisassembly('Caller: LCD timing diagnostic', 0x05749C);

// ── 2. Caller counts ────────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('=== Caller scan (CALL opcode search across full ROM) ===');
console.log('='.repeat(70));

for (const [label, addr] of [['0x07C8B7', 0x07C8B7], ['0x07C77F', 0x07C77F]]) {
  const callers = countCallers(addr);
  console.log(`\n  ${label}: ${callers.length} caller(s)`);
  for (const caller of callers) {
    console.log(`    CALL at ${hex(caller)}`);
  }
}

// Also count callers for any sub-targets found
const subTargets = new Set();
for (const t of [...trace1.directCalls, ...trace2.directCalls]) {
  subTargets.add(t.target);
}
if (subTargets.size) {
  console.log(`\n  Sub-target caller counts:`);
  for (const addr of [...subTargets].sort((a, b) => a - b)) {
    const callers = countCallers(addr);
    console.log(`    ${hex(addr)}: ${callers.length} caller(s)`);
  }
}

// ── 3. Dynamic traces ──────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('=== Dynamic traces ===');
console.log('='.repeat(70));

runDynamicTrace('0x07C8B7 (Function A)', 0x07C8B7, 200);
runDynamicTrace('0x07C77F (Function B / claimed FPAdd)', 0x07C77F, 200);

// ── 4. Classification ──────────────────────────────────────────────────────

console.log('\n' + '='.repeat(70));
console.log('=== Classification summary ===');
console.log('='.repeat(70));

// Classify based on static analysis
function classify(trace, addr) {
  const tags = new Set();

  for (const inst of trace.ordered) {
    // Check for IY-relative bit operations (OS flag manipulation)
    if (['indexed-cb-set', 'indexed-cb-res', 'indexed-cb-bit'].includes(inst.tag)) {
      tags.add('IY-flag-manipulation');
    }
    // Check for FP-related addresses (0x07CC36 is known FP routine)
    if ((inst.tag === 'call' || inst.tag === 'jp') && inst.target !== undefined) {
      const t = inst.target;
      if (t >= 0x07C000 && t <= 0x07FFFF) tags.add('calls-into-FP-region');
      if (t === 0x07CC36) tags.add('calls-FPAdd-core');
    }
    // Check for VRAM access
    if (inst.tag === 'ld-pair-imm' && inst.value === 0xD40000) tags.add('references-VRAM');
    // Check for LCD MMIO
    if (inst.tag === 'ld-pair-imm' && inst.value >= 0xE30000 && inst.value <= 0xE3FFFF) tags.add('references-LCD-MMIO');
  }

  console.log(`\n  ${hex(addr)}:`);
  console.log(`    Tags: ${[...tags].join(', ') || '(none)'}`);

  if (tags.has('calls-FPAdd-core') || tags.has('calls-into-FP-region')) {
    console.log(`    CLASSIFICATION: FP math function (NOT display rendering)`);
    console.log(`    Evidence: calls into FP region 0x07Cxxx`);
  } else if (tags.has('references-VRAM') || tags.has('references-LCD-MMIO')) {
    console.log(`    CLASSIFICATION: Display/LCD function`);
    console.log(`    Evidence: references VRAM or LCD MMIO`);
  } else if (tags.has('IY-flag-manipulation')) {
    console.log(`    CLASSIFICATION: OS flag utility (IY-relative bit ops)`);
    console.log(`    Evidence: SET/RES/BIT on IY-indexed OS flags`);
  } else {
    console.log(`    CLASSIFICATION: Needs further investigation`);
  }

  return tags;
}

const tags1 = classify(trace1, 0x07C8B7);
const tags2 = classify(trace2, 0x07C77F);

// Final verdict
console.log('\n  --- Final verdict ---');
console.log('  Session 326 listed both as "display rendering pair" called by LCD timing at 0x05749C.');
console.log('  Session 150 identified 0x07C77F as FPAdd entry.');
console.log('  This probe\'s static + dynamic evidence determines the correct interpretation.');
console.log();
