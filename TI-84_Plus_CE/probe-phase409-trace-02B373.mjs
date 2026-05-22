#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase409-trace-02B373-report.md');

const ENTRY = 0x02B373;
const CALL_GATE = 0x0004A0;
const DISPATCHER = 0x05D58F;
const TARGET = 0x02B373;
const TRACE_BUDGET_BYTES = 0x200;
const MAX_TRACE_STEPS = 400;
const MAX_BODY_BYTES = 0x100;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function raw(pc, length) {
  return Array.from(rom.subarray(pc, pc + length), byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
    };
  }
}

function formatIndexed(reg, displacement) {
  return `(${String(reg).toUpperCase()}${displacement < 0 ? '-' : '+'}${hex(Math.abs(displacement), 2)})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'retn':
      return 'RETN';
    case 'reti':
      return 'RETI';
    case 'push':
      return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()},${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg':
      return `LD (${String(inst.dest).toUpperCase()}),${String(inst.src).toUpperCase()}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ld-pair-indexed':
      return `LD ${String(inst.pair).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.pair).toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `ADD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `ADC HL,${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `SBC HL,${String(inst.src).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-ixd':
      return `${String(inst.op).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'lea':
      return `LEA ${String(inst.dest).toUpperCase()},${String(inst.base).toUpperCase()}${inst.displacement < 0 ? '' : '+'}${inst.displacement}`;
    case 'in-reg':
      return `IN ${String(inst.reg).toUpperCase()},(C)`;
    case 'out-reg':
      return `OUT (C),${String(inst.reg).toUpperCase()}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'ei':
      return 'EI';
    case 'di':
      return 'DI';
    case 'nop':
      return 'NOP';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return inst.tag;
  }
}

function formatListing(instructions) {
  return instructions.map(inst => `${hex(inst.pc)}  ${raw(inst.pc, inst.length).padEnd(14)} ${formatInstruction(inst)}`);
}

function decodeBody(entry) {
  const instructions = [];
  let pc = entry;

  while (pc < rom.length && pc < entry + MAX_BODY_BYTES && instructions.length < 128) {
    const inst = safeDecode(pc);
    instructions.push(inst);
    pc = inst.nextPc;
    if (inst.tag === 'ret' || inst.tag === 'retn' || inst.tag === 'reti') {
      break;
    }
  }

  return instructions;
}

function followControlFlow(entry, budgetBytes = TRACE_BUDGET_BYTES, maxSteps = MAX_TRACE_STEPS) {
  const queue = [{ pc: entry, source: 'entry' }];
  const seen = new Set();
  const trace = [];
  let uniqueBytes = 0;

  while (queue.length > 0 && uniqueBytes < budgetBytes && trace.length < maxSteps) {
    const frame = queue.shift();
    let pc = frame.pc;

    while (pc < rom.length && !seen.has(pc) && uniqueBytes < budgetBytes && trace.length < maxSteps) {
      const inst = safeDecode(pc);
      seen.add(pc);
      trace.push({ ...frame, inst });
      uniqueBytes += inst.length;

      if (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'rst') {
        if (typeof inst.target === 'number' && inst.target >= 0 && inst.target < rom.length && !seen.has(inst.target)) {
          queue.push({ pc: inst.target, source: hex(inst.pc) });
        }
      }

      if (inst.tag === 'jp' || inst.tag === 'jr') {
        if (typeof inst.target === 'number' && inst.target >= 0 && inst.target < rom.length) {
          pc = inst.target;
          continue;
        }
        break;
      }

      if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
        if (typeof inst.target === 'number' && inst.target >= 0 && inst.target < rom.length && !seen.has(inst.target)) {
          queue.push({ pc: inst.target, source: hex(inst.pc) });
        }
        pc = inst.nextPc;
        continue;
      }

      if (inst.tag === 'ret' || inst.tag === 'retn' || inst.tag === 'reti' || inst.tag === 'jp-indirect') {
        break;
      }

      pc = inst.nextPc;
    }
  }

  return {
    trace,
    uniqueBytes,
    uniqueInstructions: trace.length,
  };
}

function makeState() {
  return { bc: null, de: null, hl: null, ix: null, iy: null };
}

function bump(value, delta) {
  return typeof value === 'number' ? ((value + delta) & 0xFFFFFF) : null;
}

function updateState(state, inst) {
  const next = { ...state };

  switch (inst.tag) {
    case 'ld-pair-imm':
      if (inst.pair in next) next[inst.pair] = inst.value;
      break;
    case 'ld-pair-mem':
      if (inst.pair in next) next[inst.pair] = null;
      break;
    case 'ld-pair-indexed':
      if (inst.pair in next) next[inst.pair] = null;
      break;
    case 'ld-ixiy-indexed':
      if (inst.dest in next) next[inst.dest] = null;
      break;
    case 'add-pair':
      if (inst.dest in next) {
        const left = next[inst.dest];
        const right = next[inst.src];
        next[inst.dest] = typeof left === 'number' && typeof right === 'number'
          ? ((left + right) & 0xFFFFFF)
          : null;
      }
      break;
    case 'inc-pair':
      if (inst.pair in next) next[inst.pair] = bump(next[inst.pair], 1);
      break;
    case 'dec-pair':
      if (inst.pair in next) next[inst.pair] = bump(next[inst.pair], -1);
      break;
    case 'lea':
      if (inst.dest in next) {
        const base = next[inst.base];
        next[inst.dest] = typeof base === 'number' ? ((base + inst.displacement) & 0xFFFFFF) : null;
      }
      break;
    case 'pop':
      if (inst.pair in next) next[inst.pair] = null;
      break;
    default:
      break;
  }

  return next;
}

function resolvedIndexed(state, register, displacement) {
  const base = state[register];
  return typeof base === 'number' ? ((base + displacement) & 0xFFFFFF) : null;
}

function collectAccesses(instructions) {
  const reads = [];
  const writes = [];
  let state = makeState();

  for (const inst of instructions) {
    switch (inst.tag) {
      case 'ld-reg-mem':
        reads.push({ pc: inst.pc, addr: inst.addr, text: formatInstruction(inst) });
        break;
      case 'ld-pair-mem':
        reads.push({ pc: inst.pc, addr: inst.addr, text: formatInstruction(inst) });
        break;
      case 'ld-reg-ind':
        if (typeof state[inst.src] === 'number') {
          reads.push({ pc: inst.pc, addr: state[inst.src], text: formatInstruction(inst) });
        }
        break;
      case 'ld-reg-ixd': {
        const addr = resolvedIndexed(state, inst.indexRegister, inst.displacement);
        if (typeof addr === 'number') {
          reads.push({ pc: inst.pc, addr, text: formatInstruction(inst) });
        }
        break;
      }
      case 'ld-pair-indexed': {
        const addr = resolvedIndexed(state, inst.indexRegister, inst.displacement);
        if (typeof addr === 'number') {
          reads.push({ pc: inst.pc, addr, text: formatInstruction(inst) });
        }
        break;
      }
      case 'ld-mem-reg':
        writes.push({ pc: inst.pc, addr: inst.addr, text: formatInstruction(inst) });
        break;
      case 'ld-mem-pair':
        writes.push({ pc: inst.pc, addr: inst.addr, text: formatInstruction(inst) });
        break;
      case 'ld-ind-reg':
        if (typeof state[inst.dest] === 'number') {
          writes.push({ pc: inst.pc, addr: state[inst.dest], text: formatInstruction(inst) });
        }
        break;
      case 'ld-ind-imm':
        if (typeof state.hl === 'number') {
          writes.push({ pc: inst.pc, addr: state.hl, text: formatInstruction(inst) });
        }
        break;
      case 'ld-ixd-reg': {
        const addr = resolvedIndexed(state, inst.indexRegister, inst.displacement);
        if (typeof addr === 'number') {
          writes.push({ pc: inst.pc, addr, text: formatInstruction(inst) });
        }
        break;
      }
      case 'ld-ixd-imm': {
        const addr = resolvedIndexed(state, inst.indexRegister, inst.displacement);
        if (typeof addr === 'number') {
          writes.push({ pc: inst.pc, addr, text: formatInstruction(inst) });
        }
        break;
      }
      case 'ld-indexed-pair': {
        const addr = resolvedIndexed(state, inst.indexRegister, inst.displacement);
        if (typeof addr === 'number') {
          writes.push({ pc: inst.pc, addr, text: formatInstruction(inst) });
        }
        break;
      }
      default:
        break;
    }

    state = updateState(state, inst);
  }

  return { reads, writes };
}

function groupAddresses(accesses) {
  const grouped = new Map();

  for (const access of accesses) {
    const key = access.addr >>> 0;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(access);
  }

  return Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([addr, hits]) => ({ addr, hits }));
}

function scanPattern(bytes, type) {
  const hits = [];

  for (let pc = 0; pc <= rom.length - bytes.length; pc += 1) {
    let match = true;
    for (let i = 0; i < bytes.length; i += 1) {
      if (rom[pc + i] !== bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) hits.push({ pc, type });
  }

  return hits;
}

function scanCallers(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;

  const calls = scanPattern([0xCD, lo, mid, hi], 'CALL');
  const jumps = scanPattern([0xC3, lo, mid, hi], 'JP');

  return [...calls, ...jumps].sort((a, b) => a.pc - b.pc);
}

function summarizeCaller(hit) {
  const start = Math.max(0, hit.pc - 16);
  const bytes = raw(start, hit.pc - start + 4);
  const nearbyHasPrimary = bytes.includes('CD 8F D5 05');

  if (hit.pc === 0x02BDA9) return 'main key-consume path; immediately after CALL 0x05D58F';
  if (hit.pc === 0x02BDE4) return 'alternate key-release/cancel path; immediately after CALL 0x05D58F';
  if (hit.pc === 0x02B545) return 'other helper path; gated by D14050 bit 3 before the call';
  if (hit.pc === 0x02A9AA) return 'earlier init/helper path; calls 0x02B373 after clearing a D140B3-relative slot';
  return nearbyHasPrimary ? 'near 0x05D58F dispatch path' : 'direct caller';
}

function resolveStubChain(start, limit = 4) {
  const chain = [];
  let pc = start;

  for (let i = 0; i < limit && typeof pc === 'number' && pc >= 0 && pc < rom.length; i += 1) {
    const inst = safeDecode(pc);
    chain.push(inst);
    if (inst.tag === 'jp' && typeof inst.target === 'number') {
      pc = inst.target;
      continue;
    }
    break;
  }

  return chain;
}

function classifyFunction(body, reads, writes) {
  const readAddrs = new Set(reads.map(item => item.addr >>> 0));
  const writeAddrs = new Set(writes.map(item => item.addr >>> 0));
  const cpCount = body.filter(inst => (inst.tag === 'alu-imm' || inst.tag === 'alu-reg' || inst.tag === 'alu-ixd') && inst.op === 'cp').length;
  const hasIndirectJump = body.some(inst => inst.tag === 'jp-indirect');
  const directCallCount = body.filter(inst => inst.tag === 'call').length;
  const hasDescriptorInit =
    writeAddrs.has(0xD143E7) &&
    writeAddrs.has(0xD143ED) &&
    writeAddrs.has(0xD143F6) &&
    writeAddrs.has(0xD143FC) &&
    writeAddrs.has(0xD143FF) &&
    writeAddrs.has(0xD14402);

  if (readAddrs.has(0xD141BA) && hasDescriptorInit && directCallCount === 1 && cpCount === 0 && !hasIndirectJump) {
    return 'setup / registration helper (lazy post-dispatch arm for a secondary key-state descriptor)';
  }

  return 'helper routine (exact role unclear)';
}

const body = decodeBody(ENTRY);
const listing = formatListing(body);
const accesses = collectAccesses(body);
const readGroups = groupAddresses(accesses.reads);
const writeGroups = groupAddresses(accesses.writes);
const trace = followControlFlow(ENTRY);
const callers = scanCallers(TARGET);
const callTargets = body.filter(inst => inst.tag === 'call').map(inst => inst.target);
const stubChains = callTargets.map(target => ({ target, chain: resolveStubChain(target) }));
const classification = classifyFunction(body, accesses.reads, accesses.writes);
const cpCount = body.filter(inst => (inst.tag === 'alu-imm' || inst.tag === 'alu-reg' || inst.tag === 'alu-ixd') && inst.op === 'cp').length;
const hasIndirectJump = body.some(inst => inst.tag === 'jp-indirect');
const traceCallTargets = Array.from(
  new Set(
    trace.trace
      .filter(item => item.inst.tag === 'call' || item.inst.tag === 'call-conditional' || item.inst.tag === 'jp')
      .map(item => item.inst.target)
      .filter(target => typeof target === 'number')
  )
).sort((a, b) => a - b);

const reportLines = [];

reportLines.push('# Phase 409 - Trace 0x02B373');
reportLines.push('');
reportLines.push('## Verdict');
reportLines.push('');
reportLines.push(`- Classification: ${classification}.`);
reportLines.push('- Key source: it does not fetch the key code from A and it does not read 0xD141B5. The only input read in this routine is the guard byte at 0xD141BA (`IY = 0xD141B3`, then `LD A,(IY+7)`).');
reportLines.push(`- Control shape: one ` + '`OR A`' + ` / ` + '`JR NZ`' + ` guard, a fixed descriptor build in RAM, one direct subroutine call, then return. CP count = ${cpCount}; indirect jump = ${hasIndirectJump ? 'yes' : 'no'}.`);
reportLines.push('- Interaction with 0x05D58F: the two key-loop callers (0x02BDA9 and 0x02BDE4) invoke 0x02B373 immediately after the primary dispatcher. 0x02B373 does not consume a register return from 0x05D58F; it uses the shared D141B3/D141BA state block and then arms a secondary descriptor in D143E7..D14402.');
reportLines.push('- Return value: fast path returns immediately with A still non-zero from the D141BA guard test. Init path returns whatever the 0x0004A0 -> 0x00F5B0 helper leaves in A, and also stores that byte to 0xD17725. The key-loop callers ignore the return value.');
reportLines.push('');
reportLines.push('## Direct Body');
reportLines.push('');
reportLines.push('```text');
reportLines.push(...listing);
reportLines.push('```');
reportLines.push('');
reportLines.push('The direct body is 0x5B bytes long (0x02B373..0x02B3CD).');
reportLines.push('');
reportLines.push('## RAM Reads');
reportLines.push('');
if (readGroups.length === 0) {
  reportLines.push('- None resolved.');
} else {
  for (const group of readGroups) {
    const hit = group.hits[0];
    const note = group.addr === 0xD141BA
      ? 'guard byte: if non-zero, the helper exits without building anything'
      : 'direct read';
    reportLines.push(`- ${hex(group.addr)} via \`${hit.text}\` at ${hex(hit.pc)} - ${note}`);
  }
}
reportLines.push('');
reportLines.push('## RAM Writes');
reportLines.push('');
if (writeGroups.length === 0) {
  reportLines.push('- None resolved.');
} else {
  for (const group of writeGroups) {
    const hit = group.hits[0];
    let note = 'descriptor/state write';
    if (group.addr === 0xD143E7) note = 'descriptor head cleared to 0';
    if (group.addr === 0xD143EA) note = 'descriptor field cleared to 0';
    if (group.addr === 0xD143ED) note = 'descriptor payload pointer set to 0xD141B3';
    if (group.addr === 0xD143F6) note = 'descriptor field set to 4';
    if (group.addr === 0xD143F9) note = 'descriptor field cleared to 0';
    if (group.addr === 0xD143FC) note = 'descriptor field set to 8';
    if (group.addr === 0xD143FF) note = 'descriptor type/state byte set to 2';
    if (group.addr === 0xD14402) note = 'descriptor tail cleared to 0';
    if (group.addr === 0xD17725) note = 'stores helper return byte / handle';
    reportLines.push(`- ${hex(group.addr)} via \`${hit.text}\` at ${hex(hit.pc)} - ${note}`);
  }
}
reportLines.push('');
reportLines.push('## Subroutine Calls');
reportLines.push('');
if (stubChains.length === 0) {
  reportLines.push('- No direct CALL instructions.');
} else {
  for (const item of stubChains) {
    const text = item.chain.map(inst => `${hex(inst.pc)}:${formatInstruction(inst)}`).join(' -> ');
    reportLines.push(`- Direct call target ${hex(item.target)}. Resolved chain: ${text}`);
  }
}
reportLines.push('');
reportLines.push('The 0x0004A0 call gate immediately jumps to 0x00F5B0, so the init path is effectively: build descriptor -> call 0x00F5B0 with BC = 0xD143E7 -> store A to 0xD17725 -> RET.');
reportLines.push('');
reportLines.push('## Control-Flow Follow');
reportLines.push('');
reportLines.push(`- Reachable control flow followed from ${hex(ENTRY)} for ${trace.uniqueBytes} unique bytes across ${trace.uniqueInstructions} decoded instructions.`);
reportLines.push(`- Trace budget requested at least 150 bytes; actual reach was ${trace.uniqueBytes} bytes.`);
reportLines.push(`- Reached call/jump targets: ${traceCallTargets.map(target => hex(target)).join(', ') || 'none'}.`);
reportLines.push('');
reportLines.push('This deeper follow confirms that 0x02B373 is only a front-end setup helper. The heavy lifting sits behind the 0x0004A0 -> 0x00F5B0 chain.');
reportLines.push('');
reportLines.push('## Dispatch Shape');
reportLines.push('');
reportLines.push(`- Dispatch table present: no.`);
reportLines.push(`- CP cascade present: ${cpCount > 0 ? 'yes' : 'no'}.`);
reportLines.push(`- JP (HL) / indirect transfer present in the direct body: ${hasIndirectJump ? 'yes' : 'no'}.`);
reportLines.push('- The routine is a fixed guard-and-init sequence, not a comparator ladder or sub-dispatch tree.');
reportLines.push('');
reportLines.push('## Caller Scan');
reportLines.push('');
reportLines.push(`- Total direct CALL hits for ${hex(TARGET)}: ${callers.filter(hit => hit.type === 'CALL').length}`);
reportLines.push(`- Total direct JP hits for ${hex(TARGET)}: ${callers.filter(hit => hit.type === 'JP').length}`);
reportLines.push('');
reportLines.push('| Address | Type | Note |');
reportLines.push('| --- | --- | --- |');
for (const hit of callers) {
  reportLines.push(`| ${hex(hit.pc)} | ${hit.type} | ${summarizeCaller(hit)} |`);
}
reportLines.push('');
reportLines.push('The key-dispatch chain identified in session 408 accounts for two of the four direct callers. The other two call sites reuse the same helper outside that exact 0x02BD96 path, which reinforces that 0x02B373 is a generic setup/registration helper rather than a keycode decoder.');
reportLines.push('');
reportLines.push('## Answers');
reportLines.push('');
reportLines.push('- What does this function do? It lazily initializes and registers a secondary key-state descriptor when the D141BA guard byte is clear. Best classification: setup / registration helper.');
reportLines.push('- Does it read the key code from A register or from RAM? Neither. It does not read the key code at all; it only reads the RAM guard byte at 0xD141BA.');
reportLines.push(`- What RAM addresses does it read/write? Reads: ${readGroups.map(group => hex(group.addr)).join(', ') || 'none'}. Writes: ${writeGroups.map(group => hex(group.addr)).join(', ') || 'none'}.`);
reportLines.push(`- Does it call any subroutines? Yes. Direct CALL: ${stubChains.map(item => hex(item.target)).join(', ') || 'none'}. Resolved direct-call chain: ${stubChains.map(item => item.chain.map(inst => hex(inst.pc)).join(' -> ')).join('; ') || 'none'}.`);
reportLines.push(`- Does it have a dispatch table or CP cascade? No. CP count = ${cpCount}; indirect jump = ${hasIndirectJump ? 'present' : 'absent'}.`);
reportLines.push('- How does it interact with 0x05D58F output? It runs after 0x05D58F in the main key-consume paths, but it does not read the dispatcher return. The interaction is through shared RAM state at D141B3/D141BA and by registering follow-on state after primary dispatch.');
reportLines.push('- What is the return value? On the init path, A is whatever 0x0004A0 / 0x00F5B0 returns and that same byte is stored into 0xD17725. On the guard-hit fast path, it returns early with A still non-zero from the D141BA test.');

const report = reportLines.join('\n') + '\n';

fs.writeFileSync(REPORT_PATH, report);

console.log(report);
console.log(`Report written to ${REPORT_PATH}`);
