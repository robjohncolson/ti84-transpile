#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const { decodeInstruction } = await import(pathToFileURL(path.join(__dirname, 'ez80-decoder.js')).href);

const START = 0x00883C;
const MAX_BYTES = 1024;
const INLINE_DISPATCHER = 0x00211B;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function upper(text) {
  return String(text).toUpperCase();
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatImm(value) {
  return hex(value, value <= 0xFFFF ? 4 : 6);
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `CALL ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `JP ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target, 4)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${upper(inst.condition)},${hex(inst.target, 4)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatImm(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(inst, `LD ${upper(inst.pair)},(${hex(inst.addr)})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${upper(inst.src)})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${upper(inst.dest)}),${upper(inst.src)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ld-pair-indexed':
      return withPrefix(
        inst,
        `LD ${upper(inst.pair)},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`
      );
    case 'ld-reg-ixd':
      return withPrefix(
        inst,
        `LD ${upper(inst.dest)},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`
      );
    case 'ld-ixd-reg':
      return withPrefix(
        inst,
        `LD (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${upper(inst.src)}`
      );
    case 'ld-ixd-imm':
      return withPrefix(
        inst,
        `LD (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${hex(inst.value, 2)}`
      );
    case 'inc-pair':
      return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'dec-pair':
      return withPrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'inc-reg':
      return withPrefix(inst, `INC ${upper(inst.reg)}`);
    case 'dec-reg':
      return withPrefix(inst, `DEC ${upper(inst.reg)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'alu-ind':
      return withPrefix(inst, `${upper(inst.op)} (${upper(inst.src)})`);
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL,${upper(inst.src)}`);
    case 'add-pair':
      return withPrefix(inst, `ADD HL,${upper(inst.src)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    case 'ret-conditional':
      return withPrefix(inst, `RET ${upper(inst.condition)}`);
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'ex':
      return withPrefix(inst, `EX ${upper(inst.left)},${upper(inst.right)}`);
    case 'bit':
      return withPrefix(inst, `BIT ${inst.bit},${upper(inst.reg)}`);
    case 'set':
      return withPrefix(inst, `SET ${inst.bit},${upper(inst.reg)}`);
    case 'res':
      return withPrefix(inst, `RES ${inst.bit},${upper(inst.reg)}`);
    case 'rotate':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.reg)}`);
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'daa':
    case 'exx':
    case 'reti':
    case 'retn':
    case 'ldir':
    case 'lddr':
    case 'cpir':
    case 'cpdr':
    case 'inir':
    case 'otir':
    case 'neg':
      return upper(inst.tag);
    case 'in':
      if (inst.port !== undefined) return withPrefix(inst, `IN A,(${hex(inst.port, 2)})`);
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'out':
      if (inst.port !== undefined) return withPrefix(inst, `OUT (${hex(inst.port, 2)}),A`);
      return withPrefix(inst, `OUT (C),${upper(inst.reg)}`);
    case 'djnz':
      return withPrefix(inst, `DJNZ ${hex(inst.target, 4)}`);
    case 'jp-ind':
      return withPrefix(inst, `JP (${upper(inst.reg)})`);
    default:
      return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

// Disassemble a region, stopping at a terminal instruction or max bytes
function disassembleRegion(start, maxBytes) {
  const instructions = [];
  let pc = start;
  const end = start + maxBytes;

  while (pc < end) {
    const inst = decodeInstruction(rom, pc, 'adl');
    instructions.push(inst);
    pc = inst.nextPc;

    // Stop at unconditional RET or JP (tail call) that ends the function
    // But don't stop at conditional returns/jumps
    if (inst.tag === 'ret') {
      break;
    }
  }

  return instructions;
}

// Scan for all CALL sites to a target in the ROM
function scanCallSites(target) {
  const pattern = [0xCD, target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const hits = [];

  for (let i = 0; i < rom.length - 3; i += 1) {
    if (
      rom[i] === pattern[0]
      && rom[i + 1] === pattern[1]
      && rom[i + 2] === pattern[2]
      && rom[i + 3] === pattern[3]
    ) {
      hits.push(i);
    }
  }

  return hits;
}

// Scan for JP targets to a given address
function scanJpSites(target) {
  const pattern = [0xC3, target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const hits = [];

  for (let i = 0; i < rom.length - 3; i += 1) {
    if (
      rom[i] === pattern[0]
      && rom[i + 1] === pattern[1]
      && rom[i + 2] === pattern[2]
      && rom[i + 3] === pattern[3]
    ) {
      hits.push(i);
    }
  }

  return hits;
}

// Try to decode an inline case table used by 0x00211B dispatcher
// Format: 2-byte count (LE) + N * (1-byte case + 3-byte addr) + fall-through code
function decodeInlineCaseTable(afterCallPc) {
  const count = rom[afterCallPc] | (rom[afterCallPc + 1] << 8);
  if (count < 1 || count > 64) return null;  // sanity check

  const entries = [];
  let offset = afterCallPc + 2;

  for (let i = 0; i < count; i++) {
    const caseVal = rom[offset];
    const addr = rom[offset + 1] | (rom[offset + 2] << 8) | (rom[offset + 3] << 16);
    entries.push({ caseVal, addr });
    offset += 4;
  }

  // 3-byte fall-through address follows the table
  const fallThrough = rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);

  return { count, entries, fallThrough, tableEnd: offset + 3 };
}

// ---- Main Analysis ----

const lines = [];
lines.push('Phase 435 - Decode of 0x00883C (USB state machine dispatch)');
lines.push('=============================================================');
lines.push('');
lines.push(`ROM: TI-84_Plus_CE/ROM.rom`);
lines.push(`Start address: ${hex(START)}`);
lines.push('');

// Step 1: Disassemble from 0x00883C
lines.push('--- Linear Disassembly (up to 1024 bytes) ---');
lines.push('');

const allInstructions = disassembleRegion(START, MAX_BYTES);
const lastInst = allInstructions[allInstructions.length - 1];
const endPc = lastInst.nextPc;
const size = endPc - START;

lines.push(`Function range: ${hex(START)}-${hex(endPc - 1)}`);
lines.push(`Size: ${size} bytes (0x${size.toString(16).toUpperCase()})`);
lines.push(`Instructions decoded: ${allInstructions.length}`);
lines.push('');

// Collect all CALL/JP targets, CP values, RAM references, and inline dispatcher usage
const callTargets = [];
const jpTargets = [];
const cpValues = [];
const ramReads = [];
const ramWrites = [];
const inlineDispatcherCalls = [];
const conditionalJps = [];
const conditionalJrs = [];

for (const inst of allInstructions) {
  if (inst.tag === 'call') {
    callTargets.push({ pc: inst.pc, target: inst.target });
    if (inst.target === INLINE_DISPATCHER) {
      inlineDispatcherCalls.push(inst);
    }
  }
  if (inst.tag === 'call-conditional') {
    callTargets.push({ pc: inst.pc, target: inst.target, condition: inst.condition });
  }
  if (inst.tag === 'jp') {
    jpTargets.push({ pc: inst.pc, target: inst.target });
  }
  if (inst.tag === 'jp-conditional') {
    conditionalJps.push({ pc: inst.pc, target: inst.target, condition: inst.condition });
  }
  if (inst.tag === 'jr-conditional') {
    conditionalJrs.push({ pc: inst.pc, target: inst.target, condition: inst.condition });
  }
  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    cpValues.push({ pc: inst.pc, value: inst.value });
  }
  // RAM reads
  if (inst.tag === 'ld-reg-mem' && inst.addr >= 0xD00000) {
    ramReads.push({ pc: inst.pc, addr: inst.addr });
  }
  if (inst.tag === 'ld-pair-mem' && inst.addr >= 0xD00000) {
    ramReads.push({ pc: inst.pc, addr: inst.addr });
  }
  // RAM writes
  if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000) {
    ramWrites.push({ pc: inst.pc, addr: inst.addr });
  }
  if (inst.tag === 'ld-mem-pair' && inst.addr >= 0xD00000) {
    ramWrites.push({ pc: inst.pc, addr: inst.addr });
  }
}

// Print full disassembly
for (const inst of allInstructions) {
  const bytesStr = formatBytes(inst.pc, inst.length).padEnd(17);
  let annotation = '';

  // Annotate calls to inline dispatcher
  if (inst.tag === 'call' && inst.target === INLINE_DISPATCHER) {
    annotation = '  ; inline case dispatcher';
  }

  lines.push(`${hex(inst.pc)}  ${bytesStr}  ${formatInstruction(inst)}${annotation}`);

  // If this is a call to the inline dispatcher, decode the table that follows
  if (inst.tag === 'call' && inst.target === INLINE_DISPATCHER) {
    const table = decodeInlineCaseTable(inst.nextPc);
    if (table) {
      lines.push(`          ; case table: ${table.count} entries`);
      for (const entry of table.entries) {
        lines.push(`          ;   case 0x${hexByte(entry.caseVal)} -> ${hex(entry.addr)}`);
      }
      lines.push(`          ;   fall-through -> ${hex(table.fallThrough)}`);
    }
  }
}

lines.push('');

// Step 2: Check for inline dispatcher usage
lines.push('--- Dispatch Mechanism Analysis ---');
lines.push('');

if (inlineDispatcherCalls.length > 0) {
  lines.push(`Uses 0x00211B inline case dispatcher: ${inlineDispatcherCalls.length} call(s)`);
  lines.push('');

  for (const inst of inlineDispatcherCalls) {
    const table = decodeInlineCaseTable(inst.nextPc);
    if (table) {
      lines.push(`Inline case table at ${hex(inst.pc)} (after CALL ${hex(INLINE_DISPATCHER)}):`);
      lines.push(`  Entry count: ${table.count}`);
      lines.push(`  Table spans: ${hex(inst.nextPc)}-${hex(table.tableEnd - 1)}`);
      lines.push('');
      lines.push('  Case Value  ->  Handler Address');
      lines.push('  ----------     ---------------');
      for (const entry of table.entries) {
        lines.push(`  0x${hexByte(entry.caseVal)}         ->  ${hex(entry.addr)}`);
      }
      lines.push(`  default      ->  ${hex(table.fallThrough)} (fall-through)`);
      lines.push('');

      // Now decode each handler target briefly
      lines.push('  Handler summaries:');
      const handlerTargets = [...table.entries.map(e => ({ label: `case 0x${hexByte(e.caseVal)}`, addr: e.addr })),
                              { label: 'default', addr: table.fallThrough }];

      for (const handler of handlerTargets) {
        const handlerInsts = disassembleRegion(handler.addr, 64);
        const handlerSize = handlerInsts.length > 0
          ? handlerInsts[handlerInsts.length - 1].nextPc - handler.addr
          : 0;
        const handlerCalls = handlerInsts.filter(i => i.tag === 'call').map(i => hex(i.target));
        const handlerJps = handlerInsts.filter(i => i.tag === 'jp').map(i => hex(i.target));
        lines.push(`    ${handler.label} -> ${hex(handler.addr)} (${handlerSize}B, ${handlerInsts.length} insns)`);
        if (handlerCalls.length > 0) {
          lines.push(`      CALLs: ${handlerCalls.join(', ')}`);
        }
        if (handlerJps.length > 0) {
          lines.push(`      JPs: ${handlerJps.join(', ')}`);
        }
      }
      lines.push('');
    }
  }
} else {
  lines.push('Does NOT use 0x00211B inline case dispatcher.');
  lines.push('');
}

if (cpValues.length > 0) {
  lines.push(`CP cascade values (${cpValues.length} comparisons):`);
  for (const cp of cpValues) {
    lines.push(`  ${hex(cp.pc)}: CP 0x${hexByte(cp.value)}`);
  }
  lines.push('');
}

// Step 3: CALL targets summary
lines.push('--- CALL Targets ---');
lines.push('');

const uniqueCallTargets = new Map();
for (const ct of callTargets) {
  if (!uniqueCallTargets.has(ct.target)) {
    uniqueCallTargets.set(ct.target, []);
  }
  uniqueCallTargets.get(ct.target).push(ct.pc);
}

for (const [target, sites] of [...uniqueCallTargets.entries()].sort((a, b) => a[0] - b[0])) {
  const cond = callTargets.find(c => c.target === target && c.condition);
  const condStr = cond ? ` (conditional: ${upper(cond.condition)})` : '';
  lines.push(`  ${hex(target)} called from ${sites.map(s => hex(s)).join(', ')}${condStr}`);
}
lines.push('');

// Step 4: JP targets
lines.push('--- JP Targets ---');
lines.push('');
for (const jt of jpTargets) {
  lines.push(`  ${hex(jt.pc)}: JP ${hex(jt.target)}`);
}
lines.push('');

// Step 5: Conditional branches
if (conditionalJps.length > 0 || conditionalJrs.length > 0) {
  lines.push('--- Conditional Branches ---');
  lines.push('');
  for (const cj of conditionalJps) {
    lines.push(`  ${hex(cj.pc)}: JP ${upper(cj.condition)},${hex(cj.target)}`);
  }
  for (const cj of conditionalJrs) {
    lines.push(`  ${hex(cj.pc)}: JR ${upper(cj.condition)},${hex(cj.target, 4)}`);
  }
  lines.push('');
}

// Step 6: RAM references
lines.push('--- RAM References ---');
lines.push('');

const allRam = [...ramReads.map(r => ({ ...r, type: 'read' })), ...ramWrites.map(r => ({ ...r, type: 'write' }))];
const uniqueRam = new Map();
for (const r of allRam) {
  const key = r.addr;
  if (!uniqueRam.has(key)) {
    uniqueRam.set(key, { addr: r.addr, reads: [], writes: [] });
  }
  uniqueRam.get(key)[r.type === 'read' ? 'reads' : 'writes'].push(r.pc);
}

for (const [addr, info] of [...uniqueRam.entries()].sort((a, b) => a[0] - b[0])) {
  const ops = [];
  if (info.reads.length > 0) ops.push(`read at ${info.reads.map(p => hex(p)).join(', ')}`);
  if (info.writes.length > 0) ops.push(`write at ${info.writes.map(p => hex(p)).join(', ')}`);
  lines.push(`  ${hex(addr)}: ${ops.join('; ')}`);
}
lines.push('');

// Step 7: Caller analysis
const callers = scanCallSites(START);
const jpCallers = scanJpSites(START);

lines.push('--- Caller Analysis ---');
lines.push('');
lines.push(`CALL sites: ${callers.length}`);
if (callers.length <= 100) {
  const callerGroups = [];
  for (let i = 0; i < callers.length; i += 12) {
    callerGroups.push(`  ${callers.slice(i, i + 12).map(a => hex(a)).join(', ')}`);
  }
  lines.push(callerGroups.join('\n'));
}
lines.push('');
lines.push(`JP sites: ${jpCallers.length}`);
if (jpCallers.length <= 20) {
  for (const jp of jpCallers) {
    lines.push(`  ${hex(jp)}`);
  }
}
lines.push('');

// Step 8: Look deeper if the function is very short (might be a trampoline)
if (size < 32) {
  lines.push('--- NOTE: Function is very short, likely a trampoline ---');
  lines.push('');

  // If it's a JP, follow it
  if (allInstructions.length >= 1 && allInstructions[0].tag === 'jp') {
    const realTarget = allInstructions[0].target;
    lines.push(`Trampoline jumps to ${hex(realTarget)}, decoding that target:`);
    lines.push('');

    const realInstructions = disassembleRegion(realTarget, MAX_BYTES);
    const realLast = realInstructions[realInstructions.length - 1];
    const realEnd = realLast.nextPc;
    const realSize = realEnd - realTarget;

    lines.push(`Real function range: ${hex(realTarget)}-${hex(realEnd - 1)}`);
    lines.push(`Real size: ${realSize} bytes`);
    lines.push(`Instructions: ${realInstructions.length}`);
    lines.push('');

    for (const inst of realInstructions) {
      const bytesStr = formatBytes(inst.pc, inst.length).padEnd(17);
      let annotation = '';
      if (inst.tag === 'call' && inst.target === INLINE_DISPATCHER) {
        annotation = '  ; inline case dispatcher';
      }
      lines.push(`${hex(inst.pc)}  ${bytesStr}  ${formatInstruction(inst)}${annotation}`);

      if (inst.tag === 'call' && inst.target === INLINE_DISPATCHER) {
        const table = decodeInlineCaseTable(inst.nextPc);
        if (table) {
          lines.push(`          ; case table: ${table.count} entries`);
          for (const entry of table.entries) {
            lines.push(`          ;   case 0x${hexByte(entry.caseVal)} -> ${hex(entry.addr)}`);
          }
          lines.push(`          ;   fall-through -> ${hex(table.fallThrough)}`);
        }
      }
    }
    lines.push('');

    // Analyze the real function's dispatch mechanism
    const realInlineDispatchers = realInstructions.filter(i => i.tag === 'call' && i.target === INLINE_DISPATCHER);
    const realCpValues = realInstructions.filter(i => i.tag === 'alu-imm' && i.op === 'cp');

    if (realInlineDispatchers.length > 0) {
      lines.push(`Real function uses inline dispatcher: ${realInlineDispatchers.length} call(s)`);
      for (const inst of realInlineDispatchers) {
        const table = decodeInlineCaseTable(inst.nextPc);
        if (table) {
          lines.push(`  Table at ${hex(inst.nextPc)}: ${table.count} entries`);
          for (const entry of table.entries) {
            lines.push(`    case 0x${hexByte(entry.caseVal)} -> ${hex(entry.addr)}`);
          }
          lines.push(`    default -> ${hex(table.fallThrough)}`);

          // Decode handler summaries
          lines.push('');
          lines.push('  Handler summaries:');
          const handlerTargets = [...table.entries.map(e => ({ label: `case 0x${hexByte(e.caseVal)}`, addr: e.addr })),
                                  { label: 'default', addr: table.fallThrough }];
          for (const handler of handlerTargets) {
            const handlerInsts = disassembleRegion(handler.addr, 128);
            const handlerSize = handlerInsts.length > 0
              ? handlerInsts[handlerInsts.length - 1].nextPc - handler.addr
              : 0;
            const hCalls = handlerInsts.filter(i => i.tag === 'call').map(i => hex(i.target));
            const hJps = handlerInsts.filter(i => i.tag === 'jp').map(i => hex(i.target));
            const hCps = handlerInsts.filter(i => i.tag === 'alu-imm' && i.op === 'cp');
            const hRamR = handlerInsts.filter(i => (i.tag === 'ld-reg-mem' || i.tag === 'ld-pair-mem') && i.addr >= 0xD00000);
            const hRamW = handlerInsts.filter(i => (i.tag === 'ld-mem-reg' || i.tag === 'ld-mem-pair') && i.addr >= 0xD00000);

            lines.push(`    ${handler.label} -> ${hex(handler.addr)} (${handlerSize}B, ${handlerInsts.length} insns)`);
            if (hCalls.length > 0) lines.push(`      CALLs: ${hCalls.join(', ')}`);
            if (hJps.length > 0) lines.push(`      JPs: ${hJps.join(', ')}`);
            if (hCps.length > 0) lines.push(`      CPs: ${hCps.map(c => `0x${hexByte(c.value)}`).join(', ')}`);
            if (hRamR.length > 0) lines.push(`      RAM reads: ${[...new Set(hRamR.map(r => hex(r.addr)))].join(', ')}`);
            if (hRamW.length > 0) lines.push(`      RAM writes: ${[...new Set(hRamW.map(r => hex(r.addr)))].join(', ')}`);

            // Check if handler itself uses inline dispatcher (nested dispatch)
            const nestedDispatchers = handlerInsts.filter(i => i.tag === 'call' && i.target === INLINE_DISPATCHER);
            if (nestedDispatchers.length > 0) {
              for (const nd of nestedDispatchers) {
                const nt = decodeInlineCaseTable(nd.nextPc);
                if (nt) {
                  lines.push(`      Nested dispatch at ${hex(nd.pc)}: ${nt.count} entries`);
                  for (const ne of nt.entries) {
                    lines.push(`        sub-case 0x${hexByte(ne.caseVal)} -> ${hex(ne.addr)}`);
                  }
                  lines.push(`        sub-default -> ${hex(nt.fallThrough)}`);
                }
              }
            }
          }
        }
      }
    }

    if (realCpValues.length > 0) {
      lines.push('');
      lines.push(`CP cascade in real function (${realCpValues.length} comparisons):`);
      for (const cp of realCpValues) {
        lines.push(`  ${hex(cp.pc)}: CP 0x${hexByte(cp.value)}`);
      }
    }

    // Real function RAM references
    const realRamReads = realInstructions.filter(i => (i.tag === 'ld-reg-mem' || i.tag === 'ld-pair-mem') && i.addr >= 0xD00000);
    const realRamWrites = realInstructions.filter(i => (i.tag === 'ld-mem-reg' || i.tag === 'ld-mem-pair') && i.addr >= 0xD00000);
    if (realRamReads.length > 0 || realRamWrites.length > 0) {
      lines.push('');
      lines.push('RAM references in real function:');
      const uniqueAddrs = new Set([...realRamReads.map(r => r.addr), ...realRamWrites.map(r => r.addr)]);
      for (const addr of [...uniqueAddrs].sort((a, b) => a - b)) {
        const reads = realRamReads.filter(r => r.addr === addr);
        const writes = realRamWrites.filter(r => r.addr === addr);
        const ops = [];
        if (reads.length > 0) ops.push(`read at ${reads.map(r => hex(r.pc)).join(', ')}`);
        if (writes.length > 0) ops.push(`write at ${writes.map(r => hex(r.pc)).join(', ')}`);
        lines.push(`  ${hex(addr)}: ${ops.join('; ')}`);
      }
    }
  }
}

// Step 9: Map the 0x00FBD1 event codes to dispatch entries (if inline dispatch found)
lines.push('');
lines.push('--- Event Code Mapping (from 0x00FBD1 USB demultiplexer) ---');
lines.push('');
lines.push('0x00FBD1 sends these (event_code, sub_event) pairs to 0x00883C:');
lines.push('  (0x06, 0x03), (0x44, 0x02), (0x81, 0x10), (0x01, 0x00),');
lines.push('  (0xC3, 0x12), (0x45, 0x02), (0x80, 0x10), (0x84, 0x11)');
lines.push('');
lines.push('The dispatch mechanism at 0x00883C determines how these are routed.');
lines.push('If using inline case dispatcher on event_code:');

const eventCodes = [0x06, 0x44, 0x81, 0x01, 0xC3, 0x45, 0x80, 0x84];

// Check if we found an inline dispatch table; if so, match event codes
let foundTable = null;

// Look through all inline dispatcher calls in the main function
for (const inst of allInstructions) {
  if (inst.tag === 'call' && inst.target === INLINE_DISPATCHER) {
    const table = decodeInlineCaseTable(inst.nextPc);
    if (table) {
      foundTable = table;
      break;
    }
  }
}

// Also check if we followed a trampoline
if (!foundTable && allInstructions.length >= 1 && allInstructions[0].tag === 'jp') {
  const realTarget = allInstructions[0].target;
  const realInstructions = disassembleRegion(realTarget, MAX_BYTES);
  for (const inst of realInstructions) {
    if (inst.tag === 'call' && inst.target === INLINE_DISPATCHER) {
      const table = decodeInlineCaseTable(inst.nextPc);
      if (table) {
        foundTable = table;
        break;
      }
    }
  }
}

if (foundTable) {
  const caseMap = new Map(foundTable.entries.map(e => [e.caseVal, e.addr]));
  for (const code of eventCodes) {
    const handler = caseMap.get(code);
    if (handler) {
      lines.push(`  event 0x${hexByte(code)} -> ${hex(handler)}`);
    } else {
      lines.push(`  event 0x${hexByte(code)} -> default (${hex(foundTable.fallThrough)})`);
    }
  }
} else {
  lines.push('  (No inline case table found at top level - check CP cascade or nested dispatch)');
}

console.log(lines.join('\n'));
