#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const rom = readFileSync(ROM_PATH);
const mod = await import('./ROM.transpiled.js');
const RAW_BLOCKS =
  mod.PRELIFTED_BLOCKS ??
  mod.default?.PRELIFTED_BLOCKS ??
  mod.default ??
  mod;
const BLOCKS = normalizeBlocks(RAW_BLOCKS);

const MEM_SIZE = 0x1000000;
const ROM_SCAN_LIMIT = 0x0c0000;
const TARGET = 0x051cf3;
const END = 0x051e00;
const BOUND_END = 0x051e80;
const WRITE_SITE = 0x051d4d;
const D0059F = 0xd0059f;
const STACK_TOP = 0xd1a87e;
const SENTINEL = 0x7ffffe;
const MBASE = 0xd0;
const IY = 0xd00080;
const IX = 0xd1a860;
const CASES = [0x8f, 0x76, 0x00, 0x5b];

const BRANCH_SITES = [
  {
    site: '0x051D63',
    detail: 'LD A,(D0059F) at 0x051D63, BIT 7,A at 0x051D67, JR NZ at 0x051D69',
    blocks: [0x051d60, 0x051d62],
    taken: 0x051d91,
    fallthrough: 0x051d6b,
  },
  {
    site: '0x051D7A',
    detail: 'LD A,(D0059F) at 0x051D7A, BIT 6,A at 0x051D7E, JR NZ at 0x051D80',
    blocks: [0x051d6b],
    taken: 0x051da6,
    fallthrough: 0x051d82,
  },
  {
    site: '0x051DC1',
    detail: 'Block 0x051DC1 starts BIT 6 at 0x051DC5, then BIT 7 at 0x051DCF, then BIT 5 at 0x051DD9',
    blocks: [0x051dc1],
    taken: 0x051dcf,
    fallthrough: 0x051dc9,
  },
  {
    site: '0x051DCF',
    detail: 'BIT 7,A at 0x051DCF, JR Z at 0x051DD1',
    blocks: [0x051dcf],
    taken: 0x051dd9,
    fallthrough: 0x051dd3,
  },
  {
    site: '0x051DD9',
    detail: 'BIT 5,A at 0x051DD9, JR Z at 0x051DDB',
    blocks: [0x051dd9],
    taken: 0x051de3,
    fallthrough: 0x051ddd,
  },
];

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return raw ?? {};
}

function hex(v, w = 6) {
  if (v === null || v === undefined || Number.isNaN(v)) return null;
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function hb(v) {
  return hex((v ?? 0) & 0xff, 2);
}

function bhex(buf, start, len) {
  return Array.from(buf.slice(Math.max(0, start), Math.min(buf.length, start + len)), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function w24(buf, addr, value) {
  const a = addr & 0xffffff;
  buf[a] = value & 0xff;
  buf[a + 1] = (value >>> 8) & 0xff;
  buf[a + 2] = (value >>> 16) & 0xff;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  w24(mem, cpu.sp, value & 0xffffff);
}

function stopError(name) {
  const error = new Error('__PHASE226_STOP__');
  error.stopName = name;
  return error;
}

function bid(addr, mode = 'adl') {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function effAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xff) << 16) | (inst.addr & 0xffff)) >>> 0;
  }
  return inst.addr >>> 0;
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc & 0xffffff, 'adl');
  } catch {
    return null;
  }
}

function fmt(inst) {
  if (!inst) return 'db ?';
  const p = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  const ix = (r, d) => `(${String(r).toUpperCase()}${d >= 0 ? '+' : ''}${d})`;
  switch (inst.tag) {
    case 'nop': return `${p}nop`;
    case 'halt': return `${p}halt`;
    case 'ret': return `${p}ret`;
    case 'ret-conditional': return `${p}ret ${String(inst.condition).toUpperCase()}`;
    case 'call': return `${p}call ${hex(inst.target)}`;
    case 'call-conditional': return `${p}call ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${p}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${p}jp ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${p}jp (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${p}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${p}jr ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `${p}djnz ${hex(inst.target)}`;
    case 'push': return `${p}push ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${p}pop ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `${p}ld ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${p}ld (${hex(effAddr(inst) ?? inst.addr)}), ${String(inst.pair).toUpperCase()}`
        : `${p}ld ${String(inst.pair).toUpperCase()}, (${hex(effAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${p}ld (${hex(effAddr(inst) ?? inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm': return `${p}ld ${String(inst.dest).toUpperCase()}, ${hb(inst.value)}`;
    case 'ld-reg-reg': return `${p}ld ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${p}ld ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${p}ld (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${p}ld ${String(inst.dest).toUpperCase()}, (${hex(effAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${p}ld (${hex(effAddr(inst) ?? inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${p}ld ${String(inst.dest).toUpperCase()}, ${ix(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${p}ld ${ix(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'inc-pair': return `${p}inc ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${p}dec ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${p}inc ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${p}dec ${String(inst.reg).toUpperCase()}`;
    case 'add-pair': return `${p}add ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return inst.op === 'cp' ? `${p}cp ${hb(inst.value)}` : `${p}${String(inst.op).toUpperCase()} ${hb(inst.value)}`;
    case 'alu-reg': return inst.op === 'cp' ? `${p}cp ${String(inst.src).toUpperCase()}` : `${p}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'bit-test': return `${p}bit ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `${p}bit ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind': return `${p}res ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind': return `${p}set ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit': return `${p}bit ${inst.bit}, ${ix(inst.indexRegister, inst.displacement)}`;
    case 'ex-de-hl': return `${p}ex de, hl`;
    case 'ex-af': return `${p}ex af, af'`;
    case 'exx': return `${p}exx`;
    case 'ld-sp-hl': return `${p}ld sp, hl`;
    case 'cpl': return `${p}cpl`;
    case 'daa': return `${p}daa`;
    case 'scf': return `${p}scf`;
    case 'ccf': return `${p}ccf`;
    case 'di': return `${p}di`;
    case 'ei': return `${p}ei`;
    default: {
      const extra = Object.fromEntries(
        Object.entries(inst).filter(([k]) => !['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(k)),
      );
      return `${p}${inst.tag}${Object.keys(extra).length ? ` ${JSON.stringify(extra)}` : ''}`;
    }
  }
}

function row(pc) {
  const inst = decodeSafe(pc);
  if (!inst || !inst.length || inst.nextPc <= pc || inst.nextPc > rom.length) {
    return { pc, bytes: bhex(rom, pc, 1), text: `db ${hb(rom[pc])}`, blockEntry: Boolean(BLOCKS[bid(pc)]), inst: null };
  }
  return { pc, bytes: bhex(rom, pc, inst.length), text: fmt(inst), blockEntry: Boolean(BLOCKS[bid(pc)]), inst };
}

function disasm(start, end) {
  const out = [];
  for (let pc = start; pc < Math.min(end, rom.length);) {
    const r = row(pc);
    out.push(r);
    pc += r.inst?.length ?? 1;
  }
  return out;
}

function tags(r) {
  const i = r.inst;
  if (!i) return [];
  const out = [];
  if (i.tag === 'ld-mem-reg' && effAddr(i) === D0059F) out.push('d0059f-write');
  if (i.tag === 'ld-reg-mem' && effAddr(i) === D0059F) out.push('d0059f-read');
  if (i.tag === 'ld-pair-imm' && ['hl', 'de', 'bc'].includes(i.pair) && i.value < ROM_SCAN_LIMIT) out.push(`rom-${i.pair}-load`);
  if (i.tag === 'alu-imm' && i.op === 'cp') out.push('cp');
  if (i.tag === 'jr' || i.tag === 'jr-conditional') out.push('jr');
  if (i.tag === 'jp' || i.tag === 'jp-conditional' || i.tag === 'jp-indirect') out.push('jp');
  if (String(i.tag).startsWith('ret')) out.push('ret');
  return out;
}

function serial(rows) {
  return rows.map((r) => ({ pc: hex(r.pc), bytes: r.bytes, text: r.text, blockEntry: r.blockEntry, tags: tags(r) }));
}

function transferScan(target) {
  const lo = target & 0xff;
  const mid = (target >>> 8) & 0xff;
  const hi = (target >>> 16) & 0xff;
  const hits = [];
  for (let pc = 0; pc <= ROM_SCAN_LIMIT - 4; pc++) {
    if (rom[pc + 1] !== lo || rom[pc + 2] !== mid || rom[pc + 3] !== hi) continue;
    if (rom[pc] !== 0xcd && rom[pc] !== 0xc3) continue;
    hits.push({
      pc: hex(pc),
      kind: rom[pc] === 0xcd ? 'CALL' : 'JP',
      target: hex(target),
      bytes: bhex(rom, pc, 4),
      context: bhex(rom, Math.max(0, pc - 8), 20),
    });
  }
  return hits;
}

function rangeTransferScan(start, end) {
  const hits = [];
  for (let pc = 0; pc <= ROM_SCAN_LIMIT - 4; pc++) {
    if (rom[pc] !== 0xcd && rom[pc] !== 0xc3) continue;
    const target = ((rom[pc + 1] & 0xff) | ((rom[pc + 2] & 0xff) << 8) | ((rom[pc + 3] & 0xff) << 16)) >>> 0;
    if (target < start || target > end) continue;
    hits.push({
      pc: hex(pc),
      kind: rom[pc] === 0xcd ? 'CALL' : 'JP',
      target: hex(target),
      bytes: bhex(rom, pc, 4),
      context: bhex(rom, Math.max(0, pc - 8), 20),
    });
  }
  return hits;
}

function uniqueRomLoads(rows) {
  const seen = new Set();
  return rows.filter((r) => {
    const i = r.inst;
    if (!(i?.tag === 'ld-pair-imm' && ['hl', 'de', 'bc'].includes(i.pair) && i.value < ROM_SCAN_LIMIT)) return false;
    const key = `${i.pair}:${i.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dumpTable(addr, len = 32) {
  const bytes = Array.from(rom.slice(addr, Math.min(rom.length, addr + len)), (b) => b & 0xff);
  const magicHits = bytes
    .map((b, idx) => ({ b, idx }))
    .filter(({ b }) => [0xfa, 0xfb, 0xfc, 0xfe].includes(b))
    .map(({ b, idx }) => ({ addr: hex(addr + idx), offset: idx, value: hb(b) }));
  return { address: hex(addr), length: len, bytesHex: bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' '), magicHits };
}

function boundary(rows) {
  const retRows = rows.filter((r) => ['ret', 'ret-conditional', 'reti', 'retn'].includes(r.inst?.tag));
  const finalRet = [...retRows].reverse().find((r) => r.inst?.tag === 'ret') ?? null;
  return {
    retSites: retRows.map((r) => ({ pc: hex(r.pc), text: r.text })),
    finalRet: finalRet ? { pc: hex(finalRet.pc), text: finalRet.text } : null,
  };
}

function preWrite(rows) {
  const before = rows.filter((r) => r.pc < WRITE_SITE);
  const romLoads = before.filter((r) => r.inst?.tag === 'ld-pair-imm' && ['hl', 'de', 'bc'].includes(r.inst.pair) && r.inst.value < ROM_SCAN_LIMIT);
  const hlRows = before.filter((r) => {
    const i = r.inst;
    return i?.tag === 'ld-pair-imm' && i.pair === 'hl'
      || i?.tag === 'ld-pair-mem' && i.pair === 'hl'
      || i?.tag === 'inc-pair' && i.pair === 'hl'
      || i?.tag === 'dec-pair' && i.pair === 'hl'
      || i?.tag === 'add-pair' && i.dest === 'hl'
      || i?.tag === 'ex-de-hl';
  });
  return {
    writeInstruction: serial(rows.filter((r) => r.pc === WRITE_SITE))[0] ?? null,
    romLoadsBeforeWrite: serial(romLoads),
    hlAffectingRows: serial(hlRows),
    window: serial(rows.filter((r) => r.pc >= WRITE_SITE - 0x20 && r.pc <= WRITE_SITE + 0x10)),
  };
}

function mkMem() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function mkRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetCpu(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY;
  cpu.ix = IX;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem[D0059F] = 0x00;
  mem.fill(0xff, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function branchDecisions(visited) {
  const out = [];
  for (let i = 0; i < visited.length - 1; i++) {
    for (const site of BRANCH_SITES) {
      if (!site.blocks.includes(visited[i])) continue;
      let decision = 'unexpected';
      if (visited[i + 1] === site.taken) decision = `branch to ${hex(site.taken)}`;
      if (visited[i + 1] === site.fallthrough) decision = `fallthrough to ${hex(site.fallthrough)}`;
      out.push({ site: site.site, from: hex(visited[i]), to: hex(visited[i + 1]), detail: site.detail, decision });
    }
  }
  return out;
}

function runCase(inputA) {
  const mem = mkMem();
  const { executor, cpu } = mkRuntime(mem);
  resetCpu(cpu, mem);
  cpu.a = inputA & 0xff;
  push24(cpu, mem, SENTINEL);

  const visited = [];
  const writes = [];
  const origWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    if ((addr & 0xffffff) === D0059F) {
      const ptr = (cpu.hl - 1) & 0xffffff;
      writes.push({
        blockPc: hex(cpu._currentBlockPc ?? null),
        writePc: hex(WRITE_SITE),
        valueWritten: hb(value),
        lookupPointer: hex(ptr),
        lookupPointerNumeric: ptr,
        lookupByte: hb(mem[ptr] ?? 0),
        hlAfterIncrement: hex(cpu.hl),
        a: hb(cpu.a),
      });
    }
    return origWrite8(addr, value);
  };

  let term = 'max_steps';
  let result = null;
  try {
    result = executor.runFrom(TARGET, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 256,
      onBlock(pc) {
        const n = pc & 0xffffff;
        if (n === SENTINEL) throw stopError('ret');
        visited.push(n);
      },
      onMissingBlock(pc) {
        const n = pc & 0xffffff;
        if (n === SENTINEL) throw stopError('ret');
        visited.push(n);
      },
    });
    term = result?.termination ?? term;
  } catch (error) {
    if (error?.message === '__PHASE226_STOP__' && error.stopName === 'ret') term = 'sentinel';
    else throw error;
  } finally {
    cpu.write8 = origWrite8;
  }

  return {
    inputA: hb(inputA),
    initialD0059F: hb(0x00),
    finalD0059F: hb(mem[D0059F]),
    termination: term,
    visitedBlocks: visited.map((pc) => hex(pc)),
    d0059fWrites: writes.map(({ lookupPointerNumeric, ...rest }) => rest),
    branchDecisions: branchDecisions(visited),
    runResult: result ? { steps: result.steps, lastPc: hex(result.lastPc), lastMode: result.lastMode, loopsForced: result.loopsForced } : null,
  };
}

function correlate(loadRows, cases) {
  return cases.flatMap((c) => c.d0059fWrites.map((w) => {
    const ptr = parseInt(w.lookupPointer, 16);
    return {
      inputA: c.inputA,
      lookupPointer: w.lookupPointer,
      matchingBases: loadRows
        .map((r) => ({ loadPc: hex(r.pc), pair: r.inst.pair, base: hex(r.inst.value), delta: ptr - r.inst.value }))
        .filter((m) => m.delta >= 0 && m.delta < 0x200),
    };
  }));
}

function branchStatic() {
  return BRANCH_SITES.map((s) => ({
    site: s.site,
    detail: s.detail,
    blocks: s.blocks.map((addr) => ({
      blockStart: hex(addr),
      exits: (BLOCKS[bid(addr)]?.exits ?? []).map((e) => ({ type: e.type, target: hex(e.target), targetMode: e.targetMode ?? null })),
    })),
  }));
}

function main() {
  const rows = disasm(TARGET, END);
  const boundRows = disasm(TARGET, BOUND_END);
  const loads = uniqueRomLoads(boundRows);
  const exact = transferScan(TARGET);
  const nearby = rangeTransferScan(0x051cf0, 0x051d00);
  const cases = CASES.map(runCase);
  const report = {
    probe: 'probe-phase226-051cf3-d0059f-writer.mjs',
    generatedAt: new Date().toISOString(),
    target: { functionStart: hex(TARGET), writeSite: hex(WRITE_SITE), d0059f: hex(D0059F) },
    runtimeNotes: {
      requestedPromptSurface: 'ez80CPU.bindMemory + step',
      repoSurfaceUsed: 'createExecutor(...).runFrom(...)',
      note: 'cpu-runtime.js in this repo exposes the lifted executor, not a bindMemory/step API.',
    },
    staticDisassembly: {
      rangeStart: hex(TARGET),
      rangeEndExclusive: hex(END),
      rows: serial(rows),
      cpRows: serial(rows.filter((r) => r.inst?.tag === 'alu-imm' && r.inst.op === 'cp')),
      branchRows: serial(rows.filter((r) => ['jr', 'jr-conditional', 'jp', 'jp-conditional', 'jp-indirect'].includes(r.inst?.tag))),
      boundary: boundary(boundRows),
      preWrite: preWrite(boundRows),
    },
    callers: {
      exactTarget: exact,
      nearby051CF0_051D00: nearby,
    },
    tableLoads: loads.map((r) => ({ loadPc: hex(r.pc), pair: r.inst.pair, address: hex(r.inst.value), text: r.text, dump: dumpTable(r.inst.value, 32) })),
    bitBranchControls: {
      static: branchStatic(),
      note: [
        'The user-referenced blocks 0x051D63, 0x051D7A, and 0x051DC1 begin D0059F-read paths.',
        'The actual BIT opcodes are at 0x051D67, 0x051D7E, 0x051DC5, then 0x051DCF and 0x051DD9 in the follow-on chain.',
      ],
    },
    dynamicTrace: {
      setup: { mbase: hex(MBASE, 2), iy: hex(IY), ix: hex(IX), stackTop: hex(STACK_TOP), returnSentinel: hex(SENTINEL), baseline: 'ROM loaded into 16MB memory, RAM zeroed, timerInterrupt=false' },
      cases,
      pointerCorrelations: correlate(loads, cases),
    },
    summary: {
      exactCallers: exact.filter((h) => h.kind === 'CALL').map((h) => h.pc),
      exactJumps: exact.filter((h) => h.kind === 'JP').map((h) => h.pc),
      nearbyTargets: nearby.map((h) => `${h.kind}@${h.pc}->${h.target}`),
      immediateRomLoadsBeforeWrite: preWrite(boundRows).romLoadsBeforeWrite.map((r) => `${r.pc}:${r.text}`),
      finalRet: boundary(boundRows).finalRet?.pc ?? null,
      d0059fByInput: Object.fromEntries(cases.map((c) => [c.inputA, c.finalD0059F])),
    },
  };
  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase226-051cf3-d0059f-writer.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
