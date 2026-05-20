#!/usr/bin/env node

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const ROM_BYTES = new Uint8Array(readFileSync(ROM_PATH));

const MODE = 'adl';
const ROM_LIMIT = Math.min(ROM_BYTES.length, 0x400000);
const MAX_INSTRUCTIONS = 500;

const ENTRY_POINTS = [0x005B96, 0x005BB1];
const RAM_START = 0xD00000;
const RAM_END = 0xD1FFFF;

const NORMAL_KEY_HANDLER = 0x001853;
const POST_KEY_DISPATCHER = 0x0158DE;

const KNOWN_LABELS = new Map([
  [NORMAL_KEY_HANDLER, 'normal key handler'],
  [POST_KEY_DISPATCHER, 'post-key dispatcher'],
  [0x0158BC, 'post-key helper'],
  [0x005B96, 'phase-381 entry A'],
  [0x005BB1, 'phase-381 entry B'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function bytesToHex(memory, start, length) {
  const addr = (Number(start) || 0) & 0xFFFFFF;
  const end = Math.min(memory.length, addr + Math.max(length, 0));
  return Array.from(
    memory.subarray(addr, end),
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

    default: {
      const operands = fallbackOperands(inst);
      return { mnemonic: inst?.tag ?? 'unknown', operands };
    }
  }
}

function formatInstruction(inst) {
  const rendered = renderInstruction(inst);
  const text = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return withPrefix(inst, text);
}

function safeDecode(memory, pc) {
  try {
    const decoded = decodeInstruction(memory, pc, MODE);
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
    };
  }
}

function isInRom(addr) {
  return Number.isInteger(addr) && addr >= 0 && addr < ROM_LIMIT;
}

function isRamAddress(addr) {
  return Number.isInteger(addr) && addr >= RAM_START && addr <= RAM_END;
}

function getTarget(inst) {
  if (inst?.target === undefined || inst?.target === null) return null;
  return Number(inst.target) & 0xFFFFFF;
}

function getFallthrough(pc, inst) {
  if (Number.isInteger(inst?.fallthrough)) {
    return Number(inst.fallthrough) & 0xFFFFFF;
  }
  return (pc + Math.max(inst?.length ?? 1, 1)) & 0xFFFFFF;
}

function labelAddress(addr) {
  const label = KNOWN_LABELS.get(addr);
  return label ? `${hex(addr)} (${label})` : hex(addr);
}

function formatPort(port) {
  if (typeof port === 'number') return hexByte(port);
  return String(port).toUpperCase();
}

function dedupePush(map, key, value) {
  if (!map.has(key)) {
    map.set(key, []);
  }
  map.get(key).push(value);
}

function pickNextQueueIndex(queue) {
  let bestIndex = 0;
  for (let i = 1; i < queue.length; i += 1) {
    const current = queue[i];
    const best = queue[bestIndex];
    if (current.depth < best.depth || (current.depth === best.depth && current.seq < best.seq)) {
      bestIndex = i;
    }
  }
  return bestIndex;
}

function compressRanges(rows) {
  if (rows.length === 0) return [];
  const ordered = [...rows].sort((a, b) => a.pc - b.pc);
  const ranges = [];
  let start = ordered[0].pc;
  let end = ordered[0].pc + ordered[0].length - 1;

  for (let i = 1; i < ordered.length; i += 1) {
    const row = ordered[i];
    const rowStart = row.pc;
    const rowEnd = row.pc + row.length - 1;
    if (rowStart <= end + 1) {
      end = Math.max(end, rowEnd);
      continue;
    }
    ranges.push({ start, end });
    start = rowStart;
    end = rowEnd;
  }

  ranges.push({ start, end });
  return ranges;
}

function summarizeRole(analysis) {
  const ramAddrs = analysis.ramWrites.map((write) => write.addr);
  const hasPortIO = analysis.portIO.length > 0;
  const hasDirectKeyboardPort = analysis.portIO.some((entry) => entry.port === 0x09);
  const touchesKeyState = ramAddrs.some((addr) => addr >= 0xD00580 && addr <= 0xD005FF);
  const touchesLowState = ramAddrs.some((addr) => addr >= 0xD00000 && addr <= 0xD000FF);
  const callsPostDispatcherDirect = analysis.specialCalls.postDispatcher.direct;
  const callsPostDispatcherAnywhere = analysis.specialCalls.postDispatcher.anywhere;
  const directCallTargetCount = [...analysis.callTargets.values()].filter((entry) => entry.sites.some((site) => site.depth === 0)).length;

  let headline = 'Likely role: small internal helper.';
  if (hasPortIO && touchesKeyState) {
    headline = 'Likely role: low-level keyboard-state updater.';
  } else if (hasPortIO) {
    headline = 'Likely role: hardware-facing scan/helper routine.';
  } else if (touchesKeyState || touchesLowState) {
    headline = 'Likely role: state/flag maintenance around the key pipeline.';
  } else if (callsPostDispatcherDirect || callsPostDispatcherAnywhere || directCallTargetCount >= 3) {
    headline = 'Likely role: higher-level dispatcher/orchestrator.';
  }

  const evidence = [];
  if (hasDirectKeyboardPort) evidence.push('direct port 0x09 access');
  if (hasPortIO && !hasDirectKeyboardPort) evidence.push('direct port I/O');
  if (touchesKeyState) evidence.push('writes in the 0xD0058x key-state block');
  if (touchesLowState) evidence.push('writes in low system-state RAM');
  if (callsPostDispatcherDirect) evidence.push(`direct call to ${labelAddress(POST_KEY_DISPATCHER)}`);
  else if (callsPostDispatcherAnywhere) evidence.push(`reachable nested call to ${labelAddress(POST_KEY_DISPATCHER)}`);
  if (analysis.rsts.length > 0) evidence.push('RST-based OS dispatch');
  if (analysis.specialCalls.normalKeyHandler.direct) evidence.push(`direct call to ${labelAddress(NORMAL_KEY_HANDLER)}`);
  else if (analysis.specialCalls.normalKeyHandler.anywhere) evidence.push(`reachable nested call to ${labelAddress(NORMAL_KEY_HANDLER)}`);

  if (evidence.length === 0) {
    return `${headline} Evidence: no direct hardware I/O or absolute RAM writes into 0xD00000-0xD1FFFF were found statically.`;
  }
  return `${headline} Evidence: ${evidence.join('; ')}.`;
}

function analyzeSubroutine(entryPoint) {
  const visited = new Set();
  const queued = new Set();
  const queue = [];
  let nextSeq = 0;

  const rows = [];
  const callTargets = new Map();
  const portIO = [];
  const ramWrites = [];
  const rsts = [];
  const exits = {
    ret: [],
    reti: [],
    retn: [],
    conditionalRet: [],
    halts: [],
    indirectJumps: [],
    unconditionalJumps: [],
    offRomTargets: [],
  };

  const specialCalls = {
    postDispatcher: { direct: false, anywhere: false },
    normalKeyHandler: { direct: false, anywhere: false },
  };

  function enqueue(pc, depth) {
    if (!isInRom(pc) || visited.has(pc) || queued.has(pc)) return;
    queue.push({ pc, depth, seq: nextSeq });
    queued.add(pc);
    nextSeq += 1;
  }

  function recordSpecialCall(target, depth) {
    if (target === POST_KEY_DISPATCHER) {
      specialCalls.postDispatcher.anywhere = true;
      if (depth === 0) specialCalls.postDispatcher.direct = true;
    }
    if (target === NORMAL_KEY_HANDLER) {
      specialCalls.normalKeyHandler.anywhere = true;
      if (depth === 0) specialCalls.normalKeyHandler.direct = true;
    }
  }

  enqueue(entryPoint, 0);
  let truncated = false;

  while (queue.length > 0) {
    if (visited.size >= MAX_INSTRUCTIONS) {
      truncated = true;
      break;
    }

    const queueIndex = pickNextQueueIndex(queue);
    const [{ pc, depth }] = queue.splice(queueIndex, 1);
    queued.delete(pc);
    if (!isInRom(pc) || visited.has(pc)) continue;

    const inst = safeDecode(ROM_BYTES, pc);
    const length = Math.max(inst.length ?? 1, 1);
    const bytes = bytesToHex(ROM_BYTES, pc, length);
    const text = formatInstruction(inst);
    const note = inst.decodeError ? `decode error: ${inst.decodeError}` : '';

    visited.add(pc);
    rows.push({ pc, depth, length, bytes, text, note, tag: inst.tag });

    if (inst.tag === 'ld-mem-reg' && isRamAddress(inst.addr)) {
      ramWrites.push({ pc, depth, addr: inst.addr, text });
    } else if (inst.tag === 'ld-mem-pair' && isRamAddress(inst.addr)) {
      ramWrites.push({ pc, depth, addr: inst.addr, text });
    } else if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem' && isRamAddress(inst.addr)) {
      ramWrites.push({ pc, depth, addr: inst.addr, text });
    }

    if (inst.tag === 'in-reg' || inst.tag === 'out-reg' || inst.tag === 'in-imm' || inst.tag === 'out-imm' || inst.tag === 'in0' || inst.tag === 'out0') {
      const direction = inst.tag.startsWith('in') ? 'IN' : 'OUT';
      portIO.push({ pc, depth, direction, port: inst.port ?? 'c', text });
    }

    if (inst.tag === 'rst') {
      const target = getTarget(inst);
      rsts.push({ pc, depth, target, text });
      enqueue(getFallthrough(pc, inst), depth);
      continue;
    }

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      const target = getTarget(inst);
      if (target !== null) {
        if (!callTargets.has(target)) {
          callTargets.set(target, { target, sites: [] });
        }
        callTargets.get(target).sites.push({ pc, depth, conditional: inst.tag === 'call-conditional' });
        recordSpecialCall(target, depth);
        enqueue(target, depth + 1);
      }
      enqueue(getFallthrough(pc, inst), depth);
      continue;
    }

    if (inst.tag === 'ret') {
      exits.ret.push({ pc, depth });
      continue;
    }
    if (inst.tag === 'reti') {
      exits.reti.push({ pc, depth });
      continue;
    }
    if (inst.tag === 'retn') {
      exits.retn.push({ pc, depth });
      continue;
    }
    if (inst.tag === 'ret-conditional') {
      exits.conditionalRet.push({ pc, depth, condition: inst.condition });
      enqueue(getFallthrough(pc, inst), depth);
      continue;
    }
    if (inst.tag === 'halt' || inst.tag === 'slp') {
      exits.halts.push({ pc, depth, tag: inst.tag });
      continue;
    }
    if (inst.tag === 'jp-indirect') {
      exits.indirectJumps.push({ pc, depth, register: inst.indirectRegister, text });
      continue;
    }

    if (inst.tag === 'jp' || inst.tag === 'jr') {
      const target = getTarget(inst);
      exits.unconditionalJumps.push({ pc, depth, target, text });
      if (target !== null && isInRom(target)) {
        enqueue(target, depth);
      } else if (target !== null) {
        exits.offRomTargets.push({ pc, depth, target, text });
      }
      continue;
    }

    if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
      const target = getTarget(inst);
      if (target !== null && isInRom(target)) {
        enqueue(target, depth);
      } else if (target !== null) {
        exits.offRomTargets.push({ pc, depth, target, text });
      }
      enqueue(getFallthrough(pc, inst), depth);
      continue;
    }

    enqueue(getFallthrough(pc, inst), depth);
  }

  rows.sort((a, b) => a.pc - b.pc);

  const ranges = compressRanges(rows);
  const minPc = rows.length > 0 ? rows[0].pc : entryPoint;
  const maxPc = rows.length > 0 ? Math.max(...rows.map((row) => row.pc + row.length - 1)) : entryPoint;

  return {
    entryPoint,
    rows,
    callTargets,
    portIO,
    ramWrites,
    rsts,
    exits,
    specialCalls,
    truncated,
    instructionCount: rows.length,
    minPc,
    maxPc,
    ranges,
  };
}

function printDisassembly(analysis) {
  console.log(`=== DISASSEMBLY ${labelAddress(analysis.entryPoint)} ===`);
  for (const row of analysis.rows) {
    const note = row.note ? ` [${row.note}]` : '';
    console.log(`  ${hex(row.pc)} [d${row.depth}] ${row.bytes.padEnd(24)} ${row.text}${note}`);
  }
  if (analysis.rows.length === 0) {
    console.log('  none');
  }
  console.log('');
}

function printRanges(analysis) {
  const spans = analysis.ranges.map((range) => `${hex(range.start)}-${hex(range.end)}`);
  console.log(`Address range covered: ${hex(analysis.minPc)}-${hex(analysis.maxPc)}`);
  console.log(`Contiguous spans: ${spans.length > 0 ? spans.join(', ') : 'none'}`);
}

function printCallTargets(analysis) {
  console.log(`CALL targets: ${analysis.callTargets.size}`);
  if (analysis.callTargets.size === 0) {
    console.log('  none');
    return;
  }

  for (const { target, sites } of [...analysis.callTargets.values()].sort((a, b) => a.target - b.target)) {
    const siteText = sites
      .sort((a, b) => a.pc - b.pc)
      .map((site) => `${hex(site.pc)}[d${site.depth}${site.conditional ? ',cond' : ''}]`)
      .join(', ');
    console.log(`  ${labelAddress(target)} <- ${siteText}`);
  }
}

function printPortIO(analysis) {
  const uniquePorts = [...new Set(analysis.portIO.map((entry) => formatPort(entry.port)))];
  console.log(`Port I/O: ${analysis.portIO.length}`);
  console.log(`Ports touched: ${uniquePorts.length > 0 ? uniquePorts.join(', ') : 'none'}`);
  if (analysis.portIO.length === 0) {
    console.log('  none');
    return;
  }
  for (const entry of analysis.portIO.sort((a, b) => a.pc - b.pc)) {
    console.log(`  ${hex(entry.pc)}[d${entry.depth}] ${entry.direction} port=${formatPort(entry.port)} | ${entry.text}`);
  }
}

function printRamWrites(analysis) {
  console.log(`RAM writes in ${hex(RAM_START)}-${hex(RAM_END)}: ${analysis.ramWrites.length}`);
  if (analysis.ramWrites.length === 0) {
    console.log('  none');
    return;
  }
  for (const write of analysis.ramWrites.sort((a, b) => a.pc - b.pc)) {
    console.log(`  ${hex(write.pc)}[d${write.depth}] ${labelAddress(write.addr)} | ${write.text}`);
  }
}

function printRsts(analysis) {
  console.log(`RST instructions: ${analysis.rsts.length}`);
  if (analysis.rsts.length === 0) {
    console.log('  none');
    return;
  }
  for (const rst of analysis.rsts.sort((a, b) => a.pc - b.pc)) {
    const target = rst.target === null ? 'n/a' : hexByte(rst.target);
    console.log(`  ${hex(rst.pc)}[d${rst.depth}] target=${target} | ${rst.text}`);
  }
}

function printReturnBehavior(analysis) {
  const formatSites = (items, mapper = (item) => hex(item.pc)) => (items.length > 0 ? items.map(mapper).join(', ') : 'none');

  console.log('Return / exit behavior:');
  console.log(`  RET: ${formatSites(analysis.exits.ret, (item) => `${hex(item.pc)}[d${item.depth}]`)}`);
  console.log(`  RETI: ${formatSites(analysis.exits.reti, (item) => `${hex(item.pc)}[d${item.depth}]`)}`);
  console.log(`  RETN: ${formatSites(analysis.exits.retn, (item) => `${hex(item.pc)}[d${item.depth}]`)}`);
  console.log(`  Conditional RET: ${formatSites(analysis.exits.conditionalRet, (item) => `${hex(item.pc)}[d${item.depth},${item.condition}]`)}`);
  console.log(`  HALT/SLP: ${formatSites(analysis.exits.halts, (item) => `${hex(item.pc)}[d${item.depth},${item.tag}]`)}`);
  console.log(`  JP (indirect): ${formatSites(analysis.exits.indirectJumps, (item) => `${hex(item.pc)}[d${item.depth},${item.register}]`)}`);
  if (analysis.exits.unconditionalJumps.length > 0) {
    console.log('  Unconditional JP/JR edges:');
    for (const jump of analysis.exits.unconditionalJumps.sort((a, b) => a.pc - b.pc)) {
      const targetText = jump.target === null ? 'n/a' : labelAddress(jump.target);
      console.log(`    ${hex(jump.pc)}[d${jump.depth}] -> ${targetText}`);
    }
  } else {
    console.log('  Unconditional JP/JR edges: none');
  }
  if (analysis.exits.offRomTargets.length > 0) {
    console.log('  Off-ROM branch targets:');
    for (const jump of analysis.exits.offRomTargets.sort((a, b) => a.pc - b.pc)) {
      console.log(`    ${hex(jump.pc)}[d${jump.depth}] -> ${hex(jump.target)}`);
    }
  }
}

function printRecursionChecks(analysis) {
  console.log('Recursion / dispatcher checks:');
  console.log(`  Direct call to ${labelAddress(POST_KEY_DISPATCHER)}: ${analysis.specialCalls.postDispatcher.direct ? 'yes' : 'no'}`);
  console.log(`  Reachable call anywhere to ${labelAddress(POST_KEY_DISPATCHER)}: ${analysis.specialCalls.postDispatcher.anywhere ? 'yes' : 'no'}`);
  console.log(`  Direct call to ${labelAddress(NORMAL_KEY_HANDLER)}: ${analysis.specialCalls.normalKeyHandler.direct ? 'yes' : 'no'}`);
  console.log(`  Reachable call anywhere to ${labelAddress(NORMAL_KEY_HANDLER)}: ${analysis.specialCalls.normalKeyHandler.anywhere ? 'yes' : 'no'}`);
}

function printAnalysis(analysis) {
  console.log(`=== SUBROUTINE ${labelAddress(analysis.entryPoint)} ===`);
  console.log(`Instruction count: ${analysis.instructionCount}${analysis.truncated ? ` (truncated at ${MAX_INSTRUCTIONS})` : ''}`);
  printRanges(analysis);
  console.log('');
  printCallTargets(analysis);
  console.log('');
  printPortIO(analysis);
  console.log('');
  printRamWrites(analysis);
  console.log('');
  printRsts(analysis);
  console.log('');
  printRecursionChecks(analysis);
  console.log('');
  printReturnBehavior(analysis);
  console.log('');
  console.log(summarizeRole(analysis));
  console.log('');
  printDisassembly(analysis);
}

console.log('=== PROBE: PHASE 381 STATIC BFS TRACE OF 0x005B96 AND 0x005BB1 ===');
console.log(`ROM bytes loaded: ${ROM_BYTES.length.toLocaleString('en-US')}`);
console.log(`ROM analysis limit: ${hex(ROM_LIMIT)}`);
console.log(`Mode: ${MODE}`);
console.log(`Per-subroutine instruction cap: ${MAX_INSTRUCTIONS}`);
console.log('');

for (const entryPoint of ENTRY_POINTS) {
  printAnalysis(analyzeSubroutine(entryPoint));
}
