#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction as dec } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase182-home-handler-disasm-report.md');
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const { PRELIFTED_BLOCKS: BLOCKS } = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);

const MEM_SIZE = 0x1000000;
const BOOT = 0x000000;
const KERNEL_INIT = 0x08c331;
const POST_INIT = 0x0802b2;
const MEM_INIT = 0x09dee0;
const STACK_TOP = 0xd1a87e;
const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;
const MBASE = 0xd0;
const IY = 0xd00080;
const IX = 0xd1a860;
const HOME_ENTRY = 0x058241;
const HOME_BODY_START = 0x0582b8;
const HOME_BODY_END = 0x058700;
const DISPATCH_START = 0x058693;
const DISPATCH_END = 0x0586d0;
const BUF_INSERT = 0x05e2a0;
const BUF_NEAR_START = 0x05e200;
const BUF_NEAR_END = 0x05e300;
const HOME_TARGET_START = 0x058000;
const HOME_TARGET_END = 0x05a000;
const KBD_KEY = 0xd0058c;
const KBD_GETKY = 0xd0058d;
const KBD_SCAN = 0xd0058e;
const RAW_SCAN = 0xd00587;
const EDIT_START = 0xd00a00;
const EDIT_END = 0xd00b00;
const MMIO_START = 0xe00800;
const MMIO_END = 0xe00920;
const TRACE_KEY = 0x90;
const TRACE_SCAN = 0x31;
const TRACE_STEPS = 500;
const EVENT_LIMIT = 512;
const CPU_FIELDS = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];

const hex = (v, w = 6) => v === undefined || v === null || Number.isNaN(v) ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const bhex = (v) => hex(v & 0xff, 2);
const hx = (addr, len) => Array.from(rom.slice(addr, addr + len), (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
const rd24 = (buf, a) => ((buf[a] & 0xff) | ((buf[a + 1] & 0xff) << 8) | ((buf[a + 2] & 0xff) << 16)) >>> 0;
const wr24 = (buf, a, v) => { buf[a] = v & 0xff; buf[a + 1] = (v >>> 8) & 0xff; buf[a + 2] = (v >>> 16) & 0xff; };
const snap = (cpu) => Object.fromEntries(CPU_FIELDS.map((k) => [k, cpu[k]]));
const cap = (arr, item) => { if (arr.length < EVENT_LIMIT) arr.push(item); };

function memAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') return ((MBASE << 16) | (inst.addr & 0xffff)) >>> 0;
  return inst.addr >>> 0;
}

function fmt(inst) {
  if (!inst) return 'decode-error';
  const d = (n) => n >= 0 ? `+${n}` : `${n}`;
  const m = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'call': return `${m}call ${hex(inst.target)}`;
    case 'call-conditional': return `${m}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${m}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${m}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${m}jp (${inst.indirectRegister})`;
    case 'jr': return `${m}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${m}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `${m}djnz ${hex(inst.target)}`;
    case 'ret': return `${m}ret`;
    case 'ret-conditional': return `${m}ret ${inst.condition}`;
    case 'push': return `${m}push ${inst.pair}`;
    case 'pop': return `${m}pop ${inst.pair}`;
    case 'inc-pair': return `${m}inc ${inst.pair}`;
    case 'dec-pair': return `${m}dec ${inst.pair}`;
    case 'inc-reg': return `${m}inc ${inst.reg}`;
    case 'dec-reg': return `${m}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${m}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${m}ld ${inst.pair}, (${hex(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${m}ld (${hex(memAddr(inst) ?? inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${m}ld ${inst.dest}, ${bhex(inst.value)}`;
    case 'ld-reg-reg': return `${m}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${m}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${m}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${m}ld ${inst.dest}, (${hex(memAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${m}ld (${hex(memAddr(inst) ?? inst.addr)}), ${inst.src}`;
    case 'ld-reg-ixd': return `${m}ld ${inst.dest}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'ld-ixd-reg': return `${m}ld (${inst.indexRegister}${d(inst.displacement)}), ${inst.src}`;
    case 'indexed-cb-res': return `${m}res ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'indexed-cb-set': return `${m}set ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'indexed-cb-bit': return `${m}bit ${inst.bit}, (${inst.indexRegister}${d(inst.displacement)})`;
    case 'alu-imm': return `${m}${inst.op} ${bhex(inst.value)}`;
    case 'alu-reg': return `${m}${inst.op} ${inst.src}`;
    default: return `${m}${inst.tag}`;
  }
}

function disRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    try {
      const inst = dec(rom, pc, 'adl');
      rows.push({ pc: inst.pc, bytes: hx(inst.pc, inst.length), inst, text: fmt(inst), addr: memAddr(inst) });
      pc += inst.length;
    } catch (error) {
      rows.push({ pc, bytes: hx(pc, 1), inst: null, text: `decode error: ${error.message}`, addr: null });
      pc += 1;
    }
  }
  return rows;
}

const hasTarget = (inst) => ['call','call-conditional','jp','jp-conditional','jr','jr-conditional','djnz'].includes(inst?.tag) && Number.isInteger(inst?.target);
const isCallOrJp = (inst) => ['call','call-conditional','jp','jp-conditional'].includes(inst?.tag) && Number.isInteger(inst?.target);
const tclass = (t) => t === BUF_INSERT ? 'BufInsert' : t >= BUF_NEAR_START && t < BUF_NEAR_END ? 'BufInsert-near' : t >= HOME_TARGET_START && t < HOME_TARGET_END ? 'home-58/59xxx' : 'other';

function analyze(rows) {
  const targetMap = new Map();
  const callRefs = [];
  const memRefs = [];
  const cpBranches = [];
  const indirect = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const inst = row.inst;
    if (!inst) continue;
    if (hasTarget(inst)) {
      const ref = { pc: row.pc, target: inst.target >>> 0, tag: inst.tag, text: row.text, class: tclass(inst.target >>> 0) };
      if (isCallOrJp(inst)) callRefs.push(ref);
      const cur = targetMap.get(ref.target) ?? { target: ref.target, class: ref.class, pcs: [], tags: new Set() };
      cur.pcs.push(ref.pc);
      cur.tags.add(ref.tag);
      targetMap.set(ref.target, cur);
    }
    if (inst.tag === 'jp-indirect') indirect.push({ pc: row.pc, text: row.text });
    if (row.addr === KBD_KEY || row.addr === KBD_SCAN || row.addr === KBD_GETKY || row.addr === RAW_SCAN || (row.addr !== null && row.addr >= EDIT_START && row.addr < EDIT_END)) {
      const category = row.addr === KBD_KEY ? 'kbdKey' : row.addr === KBD_SCAN ? 'kbdScanCode' : row.addr === KBD_GETKY ? 'kbdGetKy/nearby' : row.addr === RAW_SCAN ? 'kbdScanRaw/nearby' : 'edit-buffer';
      memRefs.push({ pc: row.pc, addr: row.addr, category, text: row.text });
    }
    if (inst.tag === 'alu-imm' && inst.op === 'cp') {
      for (let j = i + 1; j < Math.min(rows.length, i + 4); j += 1) {
        const next = rows[j].inst;
        if (!next) break;
        if (next.tag === 'jr-conditional' || next.tag === 'jp-conditional') {
          cpBranches.push({ comparePc: row.pc, compare: row.text, branchPc: rows[j].pc, branch: rows[j].text });
          break;
        }
        if (hasTarget(next) || next.tag === 'jp-indirect' || next.tag === 'ret' || next.tag === 'ret-conditional') break;
      }
    }
  }
  return {
    targets: [...targetMap.values()].map((e) => ({ ...e, pcs: e.pcs.sort((a, b) => a - b), tags: [...e.tags].sort() })).sort((a, b) => a.target - b.target),
    callRefs,
    memRefs,
    cpBranches,
    indirect,
    bufInsertRefs: callRefs.filter((r) => r.target >= BUF_NEAR_START && r.target < BUF_NEAR_END),
  };
}

function ptrRuns(start, end) {
  const runs = [];
  for (let align = 0; align < 3; align += 1) {
    let cur = [];
    for (let pc = start + align; pc + 2 < end; pc += 3) {
      const v = rd24(rom, pc);
      const hit = v === BUF_INSERT || (v >= BUF_NEAR_START && v < BUF_NEAR_END) || (v >= HOME_TARGET_START && v < HOME_TARGET_END);
      if (hit) cur.push({ pc, value: v });
      else if (cur.length >= 2) { runs.push({ align, cur }); cur = []; } else cur = [];
    }
    if (cur.length >= 2) runs.push({ align, cur });
  }
  return runs;
}

function env() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);
  const executor = createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  const kernel = executor.runFrom(KERNEL_INIT, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu._iy = IY; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  const post = executor.runFrom(POST_INIT, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return { boot, kernel, post };
}

function prep(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = MBASE; cpu._iy = IY; cpu._ix = IX; cpu.f = 0x40; cpu.sp = STACK_TOP - 12; mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function memInit(executor, cpu, mem) {
  prep(cpu, mem);
  cpu.sp -= 3;
  wr24(mem, cpu.sp, MEMINIT_RET);
  let returned = false;
  let result = null;
  try {
    result = executor.runFrom(MEM_INIT, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 4096,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (error) {
    if (error?.message === '__RET__') returned = true;
    else throw error;
  }
  return { returned, result, fps: rd24(mem, 0xd0258d), opBase: rd24(mem, 0xd02590), ops: rd24(mem, 0xd02593) };
}

function hook(cpu) {
  const events = { reads: [], writes: [], mmioReads: [], mmioWrites: [] };
  const r8 = cpu.read8.bind(cpu);
  const w8 = cpu.write8.bind(cpu);
  cpu.read8 = (addr) => {
    const a = Number(addr) & 0xffffff;
    const v = r8(a);
    const pc = cpu._currentBlockPc & 0xffffff;
    if (a === KBD_KEY || a === KBD_SCAN || a === KBD_GETKY || a === RAW_SCAN || (a >= EDIT_START && a < EDIT_END)) cap(events.reads, { pc, addr: a, value: v });
    if (a >= MMIO_START && a < MMIO_END) cap(events.mmioReads, { pc, addr: a, value: v });
    return v;
  };
  cpu.write8 = (addr, value) => {
    const a = Number(addr) & 0xffffff;
    const before = r8(a);
    w8(a, value);
    const after = r8(a);
    const pc = cpu._currentBlockPc & 0xffffff;
    if (a === KBD_KEY || a === KBD_SCAN || a === KBD_GETKY || a === RAW_SCAN || (a >= EDIT_START && a < EDIT_END)) cap(events.writes, { pc, addr: a, value: value & 0xff, before, after });
    if (a >= MMIO_START && a < MMIO_END) cap(events.mmioWrites, { pc, addr: a, value: value & 0xff, before, after });
  };
  return () => { cpu.read8 = r8; cpu.write8 = w8; return events; };
}

function trace(executor, cpu, mem) {
  prep(cpu, mem);
  mem[KBD_KEY] = TRACE_KEY;
  mem[KBD_SCAN] = TRACE_SCAN;
  cpu.a = TRACE_KEY;
  cpu.sp -= 3;
  wr24(mem, cpu.sp, FAKE_RET);
  const done = hook(cpu);
  const blocks = [];
  const visits = new Map();
  const dyn = [];
  let returned = false;
  let result = null;
  let lastPc = HOME_BODY_START;
  try {
    result = executor.runFrom(HOME_BODY_START, 'adl', {
      maxSteps: TRACE_STEPS,
      maxLoopIterations: 4096,
      onBlock(pc, mode, meta, step) {
        const p = pc & 0xffffff;
        lastPc = p;
        visits.set(p, (visits.get(p) ?? 0) + 1);
        const ins = meta?.instructions ?? [];
        blocks.push({ step, pc: p, mode, first: ins[0]?.dasm ?? '???', a: cpu.a & 0xff, f: cpu.f & 0xff, hl: cpu.hl & 0xffffff, sp: cpu.sp & 0xffffff, controls: ins.filter((i) => isCallOrJp(i) || i.tag === 'jp-indirect').map((i) => i.dasm) });
        if (p === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc, mode, step) {
        const p = pc & 0xffffff;
        lastPc = p;
        visits.set(p, (visits.get(p) ?? 0) + 1);
        blocks.push({ step, pc: p, mode, first: 'MISSING', a: cpu.a & 0xff, f: cpu.f & 0xff, hl: cpu.hl & 0xffffff, sp: cpu.sp & 0xffffff, controls: [] });
        if (p === FAKE_RET) throw new Error('__RET__');
      },
      onDynamicTarget(target, mode, sourcePc, step) { dyn.push({ step, sourcePc: sourcePc & 0xffffff, target: target & 0xffffff, mode }); },
    });
  } catch (error) {
    if (error?.message === '__RET__') returned = true;
    else throw error;
  }
  return { returned, result, lastPc: returned ? FAKE_RET : (result?.lastPc ?? lastPc), termination: returned ? 'sentinel_return' : (result?.termination ?? 'unknown'), visits: [...visits.entries()].sort((a, b) => b[1] - a[1]), blocks, dyn, events: done(), finalA: cpu.a & 0xff, finalF: cpu.f & 0xff, finalHl: cpu.hl & 0xffffff, finalSp: cpu.sp & 0xffffff };
}

const render = (rows) => rows.map((r) => `${hex(r.pc)}: ${r.bytes.padEnd(24)} ${r.text}`).join('\n');
const rowset = (rows, pcs, radius = 3) => [...new Set(pcs)].flatMap((pc) => { const i = rows.findIndex((r) => r.pc === pc); if (i < 0) return []; return [{ pc, rows: rows.slice(Math.max(0, i - radius), Math.min(rows.length, i + radius + 1)) }]; });
const mdTable = (head, rows) => [head, head.replace(/[^|]/g, '-'), ...rows].join('\n');
const fmtPcs = (vals) => vals.length ? vals.map((v) => hex(v)).join(', ') : '(none)';
const addrLabel = (a) => a === KBD_KEY ? 'kbdKey' : a === KBD_SCAN ? 'kbdScanCode' : a === KBD_GETKY ? 'kbdGetKy' : a === RAW_SCAN ? 'kbdScanRaw?' : a >= EDIT_START && a < EDIT_END ? 'editBuf' : a >= MMIO_START && a < MMIO_END ? 'kbdMmio' : '';

function eventLines(events) {
  const map = new Map();
  for (const e of events) {
    const cur = map.get(e.addr) ?? { addr: e.addr, count: 0, pcs: new Set(), vals: new Set() };
    cur.count += 1;
    cur.pcs.add(e.pc);
    if (Number.isInteger(e.value)) cur.vals.add(e.value & 0xff);
    map.set(e.addr, cur);
  }
  return [...map.values()].sort((a, b) => a.addr - b.addr).map((e) => `- ${hex(e.addr)}${addrLabel(e.addr) ? ` (${addrLabel(e.addr)})` : ''}: count=${e.count}; pcs=[${[...e.pcs].sort((a, b) => a - b).map((v) => hex(v)).join(', ')}]; values=[${[...e.vals].sort((a, b) => a - b).map((v) => bhex(v)).join(', ')}]`);
}

function report(data) {
  const { boot, meminit, homeRows, dispatchRows, homeInfo, dispatchInfo, traceInfo } = data;
  const bufSites = homeInfo.bufInsertRefs.filter((r) => r.target === BUF_INSERT).map((r) => r.pc).sort((a, b) => a - b);
  const targets = homeInfo.targets.filter((t) => t.class !== 'other' || t.target === BUF_INSERT);
  const ptrs = ptrRuns(DISPATCH_START, DISPATCH_END);
  const lines = [];
  lines.push('# Phase 182 - Home Handler Disassembly Probe', '', `Generated by \`probe-phase182-home-handler-disasm.mjs\` on ${new Date().toISOString()}.`, '', '## Scope', '', `- Home entry reference: \`${hex(HOME_ENTRY)}\``, `- Static disassembly window: \`${hex(HOME_BODY_START)}..${hex(HOME_BODY_END)}\``, `- Dispatch focus window: \`${hex(DISPATCH_START)}..${hex(DISPATCH_END)}\``, `- Trace seed: \`A=${bhex(TRACE_KEY)}\`, \`kbdKey=${bhex(TRACE_KEY)} @ ${hex(KBD_KEY)}\`, \`kbdScanCode=${bhex(TRACE_SCAN)} @ ${hex(KBD_SCAN)}\``, '', '## Boot Baseline', '', '| stage | steps | termination | lastPc |', '| --- | ---: | --- | --- |', `| cold boot | ${boot.boot.steps} | ${boot.boot.termination} | ${hex(boot.boot.lastPc)} |`, `| kernel init | ${boot.kernel.steps} | ${boot.kernel.termination} | ${hex(boot.kernel.lastPc)} |`, `| post init | ${boot.post.steps} | ${boot.post.termination} | ${hex(boot.post.lastPc)} |`, `| MEM_INIT | ${meminit.result?.steps ?? 'sentinel'} | ${meminit.returned ? 'sentinel_return' : (meminit.result?.termination ?? 'unknown')} | ${meminit.returned ? hex(MEMINIT_RET) : hex(meminit.result?.lastPc ?? 0)} |`, '', `Post-MEM_INIT pointers: \`FPS=${hex(meminit.fps)}\`, \`OPBase=${hex(meminit.opBase)}\`, \`OPS=${hex(meminit.ops)}\`.`, '', '## Findings', '', `- Direct \`BufInsert\` calls in the scanned home-handler body: ${fmtPcs(bufSites)}.`, `- CP/branch candidates: ${fmtPcs(homeInfo.cpBranches.map((e) => e.comparePc))}.`, `- Indirect-jump sites: ${fmtPcs(homeInfo.indirect.map((e) => e.pc))}.`, `- Keyboard / edit-buffer refs in the main window: ${fmtPcs(homeInfo.memRefs.map((e) => e.pc))}.`, `- Keyboard / edit-buffer refs in the dispatch window: ${fmtPcs(dispatchInfo.memRefs.map((e) => e.pc))}.`, `- Trace termination: \`${traceInfo.termination}\` at ${hex(traceInfo.lastPc)}; hottest block ${traceInfo.visits[0] ? `${hex(traceInfo.visits[0][0])} x${traceInfo.visits[0][1]}` : '(none)'}.`, '', '## Full Disassembly (0x0582B8..0x058700)', '', '```text', render(homeRows), '```', '', '## Dispatch Window (0x058693..0x0586D0)', '', '```text', render(dispatchRows), '```', '', '## CALL/JP Targets', '', mdTable('| target | class | refs | tags |', targets.map((t) => `| ${hex(t.target)} | ${t.class} | ${fmtPcs(t.pcs)} | ${t.tags.join(', ')} |`)), '', '## BufInsert Context Windows', '');
  if (bufSites.length === 0) lines.push('- none', '');
  else for (const w of rowset(homeRows, bufSites)) lines.push(`### Around ${hex(w.pc)}`, '', '```text', render(w.rows), '```', '');
  lines.push('## Key-Code Compare / Branch Candidates', '', homeInfo.cpBranches.length ? mdTable('| compare pc | compare | branch pc | branch |', homeInfo.cpBranches.map((e) => `| ${hex(e.comparePc)} | \`${e.compare}\` | ${hex(e.branchPc)} | \`${e.branch}\` |`)) : '- none', '', '## Keyboard / Edit-Buffer References', '', '### Home Handler Window', '', homeInfo.memRefs.length ? mdTable('| pc | address | category | instruction |', homeInfo.memRefs.map((e) => `| ${hex(e.pc)} | ${hex(e.addr)} | ${e.category} | \`${e.text}\` |`)) : '- none', '', '### Dispatch Window', '', dispatchInfo.memRefs.length ? mdTable('| pc | address | category | instruction |', dispatchInfo.memRefs.map((e) => `| ${hex(e.pc)} | ${hex(e.addr)} | ${e.category} | \`${e.text}\` |`)) : '- none', '', '## Jump-Table Heuristics', '', '### Indirect Jumps', '', homeInfo.indirect.length ? homeInfo.indirect.map((e) => `- ${hex(e.pc)}: \`${e.text}\``).join('\n') : '- none', '', '### Raw 24-bit Pointer Runs In Dispatch Window', '', ptrs.length ? ptrs.map((r) => `- alignment=${r.align}: ${r.cur.map((e) => `${hex(e.pc)}=>${hex(e.value)}`).join(', ')}`).join('\n') : '- none', '', '## Execution Trace From 0x0582B8', '', '| metric | value |', '| --- | --- |', `| termination | ${traceInfo.termination} |`, `| last pc | ${hex(traceInfo.lastPc)} |`, `| returned via sentinel | ${traceInfo.returned ? 'yes' : 'no'} |`, `| final A | ${bhex(traceInfo.finalA)} |`, `| final F | ${bhex(traceInfo.finalF)} |`, `| final HL | ${hex(traceInfo.finalHl)} |`, `| final SP | ${hex(traceInfo.finalSp)} |`, `| dynamic targets observed | ${traceInfo.dyn.length ? traceInfo.dyn.map((e) => `${hex(e.sourcePc)}=>${hex(e.target)}`).join(', ') : '(none)'} |`, '', '### Hot Blocks', '');
  lines.push(...(traceInfo.visits.length ? traceInfo.visits.slice(0, 20).map(([pc, count]) => `- ${hex(pc)}: visits=${count}`) : ['- none']), '', '### Per-Block Trace', '', '```text');
  for (const b of traceInfo.blocks) lines.push(`step=${String(b.step).padStart(3, ' ')} pc=${hex(b.pc)} ${b.first} A=${bhex(b.a)} F=${bhex(b.f)} HL=${hex(b.hl)} SP=${hex(b.sp)} controls=[${b.controls.length ? b.controls.join(' | ') : '-'}]`);
  lines.push('```', '', '### Trace RAM Reads', '', ...(eventLines(traceInfo.events.reads).length ? eventLines(traceInfo.events.reads) : ['- none']), '', '### Trace RAM Writes', '', ...(eventLines(traceInfo.events.writes).length ? eventLines(traceInfo.events.writes) : ['- none']), '', '### Trace Keyboard MMIO Reads', '', ...(eventLines(traceInfo.events.mmioReads).length ? eventLines(traceInfo.events.mmioReads) : ['- none']), '', '### Trace Keyboard MMIO Writes', '', ...(eventLines(traceInfo.events.mmioWrites).length ? eventLines(traceInfo.events.mmioWrites) : ['- none']), '');
  return `${lines.join('\n')}\n`;
}

function fail(error) {
  return `# Phase 182 - Home Handler Disassembly Probe\n\n## Failure\n\n\`\`\`text\n${error.stack || error}\n\`\`\`\n`;
}

try {
  const homeRows = disRange(HOME_BODY_START, HOME_BODY_END);
  const dispatchRows = disRange(DISPATCH_START, DISPATCH_END);
  const homeInfo = analyze(homeRows);
  const dispatchInfo = analyze(dispatchRows);
  const e = env();
  const boot = coldBoot(e.executor, e.cpu, e.mem);
  const meminit = memInit(e.executor, e.cpu, e.mem);
  const cpu0 = snap(e.cpu);
  const mem0 = new Uint8Array(e.mem);
  e.mem.set(mem0);
  for (const k of CPU_FIELDS) e.cpu[k] = cpu0[k];
  const traceInfo = trace(e.executor, e.cpu, e.mem);
  const out = report({ boot, meminit, homeRows, dispatchRows, homeInfo, dispatchInfo, traceInfo });
  fs.writeFileSync(REPORT_PATH, out, 'utf8');
  console.log(out);
  console.log(`Wrote ${REPORT_PATH}`);
} catch (error) {
  fs.writeFileSync(REPORT_PATH, fail(error), 'utf8');
  throw error;
}
