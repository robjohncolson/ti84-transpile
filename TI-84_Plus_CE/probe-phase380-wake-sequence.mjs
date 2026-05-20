#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MODE = 'adl';

// --- Known addresses ---

const WAKE_ENTRY = 0x0019BE;
const EVENT_LOOP_ENTRY = 0x003A73;
const HALT_ADDR = 0x0019BD;
const SLEEP_ENTRY = 0x0019B5;

// Max instructions per branch before giving up
const MAX_INSN_PER_BRANCH = 100;
// Max total branches to explore
const MAX_BRANCHES = 64;

// --- Utilities ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  const addr = (Number(start) || 0) & 0xFFFFFF;
  const end = Math.min(buffer.length, addr + Math.max(length, 0));
  return Array.from(
    buffer.subarray(addr, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatSigned(value) {
  const normalized = Number(value ?? 0);
  const abs = Math.abs(normalized);
  return `${normalized >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${indexRegister}${formatSigned(displacement)})`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc', 'length', 'nextPc', 'mode', 'modePrefix',
    'terminates', 'fallthrough', 'decodeError', 'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${formatSigned(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  switch (inst?.tag) {
    case 'db': return { mnemonic: 'db', operands: hexByte(inst.value) };
    case 'nop': case 'halt': case 'slp': case 'di': case 'ei':
    case 'ret': case 'reti': case 'retn':
    case 'rlca': case 'rrca': case 'rla': case 'rra':
    case 'daa': case 'cpl': case 'scf': case 'ccf': case 'neg':
    case 'rrd': case 'rld':
    case 'ldi': case 'ldd': case 'ldir': case 'lddr':
    case 'cpi': case 'cpd': case 'cpir': case 'cpdr':
    case 'ini': case 'ind': case 'inir': case 'indr':
    case 'outi': case 'outd': case 'otir': case 'otdr':
    case 'otimr': case 'stmix': case 'rsmix': case 'exx':
      return { mnemonic: inst.tag, operands: '' };

    case 'ret-conditional': return { mnemonic: 'ret', operands: inst.condition };
    case 'jr': return { mnemonic: 'jr', operands: hex(inst.target) };
    case 'jr-conditional': return { mnemonic: 'jr', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'djnz': return { mnemonic: 'djnz', operands: hex(inst.target) };
    case 'jp': return { mnemonic: 'jp', operands: hex(inst.target) };
    case 'jp-conditional': return { mnemonic: 'jp', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'jp-indirect': return { mnemonic: 'jp', operands: `(${inst.indirectRegister})` };
    case 'call': return { mnemonic: 'call', operands: hex(inst.target) };
    case 'call-conditional': return { mnemonic: 'call', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'rst': return { mnemonic: 'rst', operands: hexByte(inst.target) };

    case 'push': return { mnemonic: 'push', operands: inst.pair };
    case 'pop': return { mnemonic: 'pop', operands: inst.pair };

    case 'ld-pair-imm': return { mnemonic: 'ld', operands: `${inst.pair}, ${hex(inst.value)}` };
    case 'ld-reg-imm': return { mnemonic: 'ld', operands: `${inst.dest}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg': return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-reg-ind': return { mnemonic: 'ld', operands: `${inst.dest}, (${inst.src})` };
    case 'ld-ind-reg': return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.src}` };
    case 'ld-ind-imm': return { mnemonic: 'ld', operands: `(hl), ${hexByte(inst.value)}` };
    case 'ld-reg-mem': return { mnemonic: 'ld', operands: `${inst.dest}, (${hex(inst.addr)})` };
    case 'ld-mem-reg': return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.src}` };
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
      }
      return { mnemonic: 'ld', operands: `${inst.pair}, (${hex(inst.addr)})` };
    case 'ld-mem-pair': return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
    case 'ld-pair-ind': return { mnemonic: 'ld', operands: `${inst.pair}, (${inst.src})` };
    case 'ld-ind-pair': return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.pair}` };
    case 'ld-sp-hl': return { mnemonic: 'ld', operands: 'sp, hl' };
    case 'ld-sp-pair': return { mnemonic: 'ld', operands: `sp, ${inst.pair}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'ld', operands: `${inst.pair}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'ld-ixiy-indexed':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-special': return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-mb-a': return { mnemonic: 'ld', operands: 'mb, a' };
    case 'ld-a-mb': return { mnemonic: 'ld', operands: 'a, mb' };

    case 'inc-pair': return { mnemonic: 'inc', operands: inst.pair };
    case 'dec-pair': return { mnemonic: 'dec', operands: inst.pair };
    case 'inc-reg': return { mnemonic: 'inc', operands: inst.reg };
    case 'dec-reg': return { mnemonic: 'dec', operands: inst.reg };
    case 'inc-ixd': return { mnemonic: 'inc', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
    case 'dec-ixd': return { mnemonic: 'dec', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'add-pair': return { mnemonic: 'add', operands: `${inst.dest}, ${inst.src}` };
    case 'adc-pair': return { mnemonic: 'adc', operands: `hl, ${inst.src}` };
    case 'sbc-pair': return { mnemonic: 'sbc', operands: `hl, ${inst.src}` };
    case 'alu-reg': return { mnemonic: inst.op, operands: inst.src };
    case 'alu-imm': return { mnemonic: inst.op, operands: hexByte(inst.value) };
    case 'alu-ixd': return { mnemonic: inst.op, operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'bit-test': return { mnemonic: 'bit', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-test-ind': return { mnemonic: 'bit', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-set': return { mnemonic: 'set', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-set-ind': return { mnemonic: 'set', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-res': return { mnemonic: 'res', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-res-ind': return { mnemonic: 'res', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'indexed-cb-bit':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'rotate-reg': return { mnemonic: inst.op, operands: inst.reg };
    case 'rotate-ind': return { mnemonic: inst.op, operands: `(${inst.indirectRegister})` };
    case 'indexed-cb-rotate':
      return {
        mnemonic: inst.operation ?? inst.op ?? 'rotate',
        operands: formatIndexedOperand(inst.indexRegister, inst.displacement),
      };

    case 'in-reg': return { mnemonic: 'in', operands: `${inst.reg}, (c)` };
    case 'out-reg': return { mnemonic: 'out', operands: `(c), ${inst.reg}` };
    case 'in-imm': return { mnemonic: 'in', operands: `a, (${hexByte(inst.port)})` };
    case 'out-imm': return { mnemonic: 'out', operands: `(${hexByte(inst.port)}), a` };
    case 'in0': return { mnemonic: 'in0', operands: `${inst.reg}, (${hexByte(inst.port)})` };
    case 'out0': return { mnemonic: 'out0', operands: `(${hexByte(inst.port)}), ${inst.reg}` };

    case 'ex-af': return { mnemonic: 'ex', operands: "af, af'" };
    case 'ex-de-hl': return { mnemonic: 'ex', operands: 'de, hl' };
    case 'ex-sp-hl': return { mnemonic: 'ex', operands: '(sp), hl' };
    case 'ex-sp-pair': return { mnemonic: 'ex', operands: `(sp), ${inst.pair}` };

    case 'im': return { mnemonic: 'im', operands: String(inst.value) };
    case 'mlt': return { mnemonic: 'mlt', operands: inst.reg };
    case 'tst-reg': return { mnemonic: 'tst', operands: `a, ${inst.reg}` };
    case 'tst-ind': return { mnemonic: 'tst', operands: 'a, (hl)' };
    case 'tst-imm': return { mnemonic: 'tst', operands: `a, ${hexByte(inst.value)}` };
    case 'tstio': return { mnemonic: 'tstio', operands: hexByte(inst.value) };
    case 'lea': return { mnemonic: 'lea', operands: `${inst.dest}, ${formatIndexedOperand(inst.base, inst.displacement)}` };
    case 'pea': return { mnemonic: 'pea', operands: `${inst.base}${formatSigned(inst.displacement)}` };

    default:
      return { mnemonic: inst?.tag ?? 'unknown', operands: fallbackOperands(inst) };
  }
}

function formatInstruction(inst) {
  const rendered = renderInstruction(inst);
  const text = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return withPrefix(inst, text);
}

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
      mode,
    };
  }
}

// --- Branch extraction ---

function extractTargets(inst) {
  const targets = [];
  const tag = inst?.tag;

  if (!tag) return targets;

  // Unconditional jumps: follow target only, no fallthrough
  if (tag === 'jp' || tag === 'jr') {
    targets.push({ addr: inst.target, type: 'jump', unconditional: true });
    return targets;
  }

  // Conditional jumps: follow both target and fallthrough
  if (tag === 'jp-conditional' || tag === 'jr-conditional') {
    targets.push({ addr: inst.target, type: `jump-${inst.condition}`, unconditional: false });
    return targets;
  }

  // CALL: follow target as a sub-branch, fallthrough continues
  if (tag === 'call') {
    targets.push({ addr: inst.target, type: 'call', unconditional: false });
    return targets;
  }

  // Conditional CALL
  if (tag === 'call-conditional') {
    targets.push({ addr: inst.target, type: `call-${inst.condition}`, unconditional: false });
    return targets;
  }

  // DJNZ
  if (tag === 'djnz') {
    targets.push({ addr: inst.target, type: 'djnz', unconditional: false });
    return targets;
  }

  // RST
  if (tag === 'rst') {
    targets.push({ addr: inst.target, type: 'rst', unconditional: false });
    return targets;
  }

  return targets;
}

function isTerminator(inst) {
  const tag = inst?.tag;
  if (!tag) return false;

  return tag === 'ret' || tag === 'reti' || tag === 'retn'
    || tag === 'halt' || tag === 'slp'
    || tag === 'jp' || tag === 'jr'
    || tag === 'jp-indirect';
}

// --- BFS disassembler ---

function disassembleWakePath(rom) {
  const visited = new Set();
  const branches = [];
  const queue = [{ addr: WAKE_ENTRY, label: 'wake-entry', depth: 0, parent: null }];
  let reachesEventLoop = false;
  const pathsToEventLoop = [];

  while (queue.length > 0 && branches.length < MAX_BRANCHES) {
    const { addr, label, depth, parent } = queue.shift();
    const branchKey = addr & 0xFFFFFF;

    if (visited.has(branchKey)) continue;
    if (branchKey >= 0x400000) continue;  // outside ROM
    visited.add(branchKey);

    const rows = [];
    let pc = branchKey;
    let terminated = false;
    let terminationReason = null;

    for (let i = 0; i < MAX_INSN_PER_BRANCH; i += 1) {
      if (pc >= rom.length || pc >= 0x400000) {
        terminationReason = 'out-of-rom';
        terminated = true;
        break;
      }

      // Check for known addresses before decoding
      if (pc === EVENT_LOOP_ENTRY && pc !== branchKey) {
        rows.push({
          pc,
          bytes: '',
          text: `>>> REACHES EVENT LOOP (${hex(EVENT_LOOP_ENTRY)}) <<<`,
          note: 'event-loop-reached',
        });
        reachesEventLoop = true;
        pathsToEventLoop.push({ branch: label, depth, addr: pc });
        terminationReason = 'event-loop-reached';
        terminated = true;
        break;
      }

      if (pc === HALT_ADDR && pc !== branchKey) {
        rows.push({
          pc,
          bytes: '',
          text: `>>> REACHES HALT (${hex(HALT_ADDR)}) — loops back to sleep <<<`,
          note: 'halt-reached',
        });
        terminationReason = 'halt-loop';
        terminated = true;
        break;
      }

      const inst = safeDecode(rom, pc, MODE);
      const length = Math.max(inst.length ?? 1, 1);

      rows.push({
        pc,
        bytes: bytesToHex(rom, pc, length),
        text: formatInstruction(inst),
        decodeError: inst.decodeError ?? null,
        tag: inst.tag,
      });

      // Extract branch targets
      const targets = extractTargets(inst);
      for (const target of targets) {
        const targetAddr = target.addr & 0xFFFFFF;
        if (!visited.has(targetAddr) && targetAddr < 0x400000) {
          const targetLabel = `${hex(targetAddr)} (${target.type} from ${hex(pc)} in ${label})`;
          queue.push({ addr: targetAddr, label: targetLabel, depth: depth + 1, parent: label });
        }
      }

      // Check if this instruction terminates the branch
      if (isTerminator(inst)) {
        terminationReason = inst.tag;
        terminated = true;
        break;
      }

      pc += length;
    }

    if (!terminated) {
      terminationReason = 'max-instructions';
    }

    branches.push({
      addr: branchKey,
      label,
      depth,
      parent,
      rows,
      terminationReason,
    });
  }

  return { branches, reachesEventLoop, pathsToEventLoop };
}

// --- Output ---

function printBranch(branch) {
  const depthPrefix = '  '.repeat(Math.min(branch.depth, 4));
  const header = `${depthPrefix}--- Branch: ${branch.label} (depth=${branch.depth}) ---`;
  console.log(header);

  for (const row of branch.rows) {
    const note = row.decodeError ? ` [decode error: ${row.decodeError}]` : '';
    if (row.note) {
      console.log(`${depthPrefix}  ${hex(row.pc)}: ${row.text}`);
    } else {
      console.log(`${depthPrefix}  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${note}`);
    }
  }

  console.log(`${depthPrefix}  [terminated: ${branch.terminationReason}]`);
  console.log('');
}

function printSummary(result) {
  console.log('=== SUMMARY ===');
  console.log(`branches_explored: ${result.branches.length}`);
  console.log(`reaches_event_loop: ${result.reachesEventLoop ? 'YES' : 'NO'}`);
  console.log('');

  if (result.pathsToEventLoop.length > 0) {
    console.log('Paths to event loop (0x003A73):');
    for (const p of result.pathsToEventLoop) {
      console.log(`  depth=${p.depth} branch="${p.branch}"`);
    }
    console.log('');
  }

  // Summarize termination reasons
  const reasons = {};
  for (const branch of result.branches) {
    const r = branch.terminationReason;
    reasons[r] = (reasons[r] ?? 0) + 1;
  }
  console.log('Termination reasons:');
  for (const [reason, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${reason}: ${n}`);
  }
  console.log('');

  // List unique addresses visited
  const allAddrs = new Set();
  for (const branch of result.branches) {
    for (const row of branch.rows) {
      if (!row.note) allAddrs.add(row.pc);
    }
  }
  console.log(`unique_instruction_addresses: ${allAddrs.size}`);

  // Known address hits
  const knownAddrs = [
    [WAKE_ENTRY, 'wake entry (post-HALT)'],
    [SLEEP_ENTRY, 'DI (sleep entry)'],
    [HALT_ADDR, 'HALT'],
    [EVENT_LOOP_ENTRY, 'event loop'],
    [0x003A7D, 'dispatch entry'],
    [0x001713, 'gate caller'],
    [0x0067F8, 'gpio check'],
    [0x001853, 'normal key handler'],
  ];
  console.log('');
  console.log('Known address reachability:');
  for (const [addr, name] of knownAddrs) {
    const reached = allAddrs.has(addr)
      || result.pathsToEventLoop.some((p) => p.addr === addr)
      || result.branches.some((b) => b.addr === addr);
    console.log(`  ${hex(addr)} ${name}: ${reached ? 'REACHED' : 'not reached'}`);
  }
  console.log('');
}

// --- Context: show the sleep region around 0x0019B5 ---

function printSleepRegionContext(rom) {
  console.log('=== CONTEXT: SLEEP REGION (0x0019B0 - 0x0019E0) ===');
  let pc = 0x0019B0;
  const end = 0x0019E0;

  while (pc <= end && pc < rom.length) {
    const inst = safeDecode(rom, pc, MODE);
    const length = Math.max(inst.length ?? 1, 1);
    const marker = pc === WAKE_ENTRY ? ' <-- WAKE ENTRY'
      : pc === HALT_ADDR ? ' <-- HALT'
      : pc === SLEEP_ENTRY ? ' <-- DI (sleep entry)'
      : '';
    console.log(`  ${hex(pc)}: ${bytesToHex(rom, pc, length).padEnd(20)} ${formatInstruction(inst)}${marker}`);
    pc += length;
  }
  console.log('');
}

// --- Main ---

function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }

  const rom = new Uint8Array(fs.readFileSync(ROM_PATH));

  console.log('=== PROBE: PHASE 380 — WAKE SEQUENCE DISASSEMBLY ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`wake_entry: ${hex(WAKE_ENTRY)} (first instruction after HALT at ${hex(HALT_ADDR)})`);
  console.log(`event_loop: ${hex(EVENT_LOOP_ENTRY)}`);
  console.log(`max_insn_per_branch: ${MAX_INSN_PER_BRANCH}`);
  console.log(`max_branches: ${MAX_BRANCHES}`);
  console.log('');

  // Show context around the sleep region first
  printSleepRegionContext(rom);

  // Disassemble the wake path via BFS
  console.log('=== WAKE PATH DISASSEMBLY (BFS from 0x0019BE) ===');
  console.log('');

  const result = disassembleWakePath(rom);

  for (const branch of result.branches) {
    printBranch(branch);
  }

  printSummary(result);

  // Assessment
  console.log('=== ASSESSMENT ===');
  if (result.reachesEventLoop) {
    console.log('The wake path DOES reach the event loop at 0x003A73.');
    console.log('After HALT, the OS reads the interrupt status register and eventually');
    console.log('re-enters the main event loop, resuming normal operation.');
  } else {
    console.log('The wake path does NOT directly reach the event loop at 0x003A73');
    console.log('within the explored branches. The path may reach it indirectly');
    console.log('through deeper call chains, or may loop back to sleep.');
  }
  console.log('');
  console.log('=== END PROBE ===');
}

main();
