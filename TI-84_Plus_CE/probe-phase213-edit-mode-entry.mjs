#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');
if (!existsSync(transpiledPath)) throw new Error(existsSync(transpiledGzipPath) ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.' : 'ROM.transpiled.js is missing.');
if (!existsSync(romPath)) throw new Error('ROM.rom is missing.');

const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');
const rom = readFileSync(romPath);
const BLOCKS = Array.isArray(PRELIFTED_BLOCKS) ? Object.fromEntries(PRELIFTED_BLOCKS.filter((b) => b?.id).map((b) => [b.id, b])) : (PRELIFTED_BLOCKS ?? {});

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY_PLUS_5 = 0xD00085;
const TARGET_A = 0x0612B0;
const TARGET_B = 0x0612E4;
const DISASM_START = 0x061280;
const DISASM_END = 0x061320;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MAX_LOOP_ITERATIONS = 8192;
const TRACE_MAX_STEPS = 500;
const IY_WINDOW = 0x40;

const EXACT = [[0xCD, 'CALL'], [0xC3, 'JP']];
const DIRECT = new Map([[0xCD, 'CALL'], [0xC3, 'JP'], [0xCC, 'CALL Z'], [0xC4, 'CALL NZ'], [0xDC, 'CALL C'], [0xD4, 'CALL NC'], [0xEC, 'CALL PE'], [0xE4, 'CALL PO'], [0xFC, 'CALL M'], [0xF4, 'CALL P'], [0xCA, 'JP Z'], [0xC2, 'JP NZ'], [0xDA, 'JP C'], [0xD2, 'JP NC'], [0xEA, 'JP PE'], [0xE2, 'JP PO'], [0xFA, 'JP M'], [0xF2, 'JP P']]);

const hex = (v, w = 6) => v === null || v === undefined || Number.isNaN(v) ? null : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const hexByte = (v) => hex((v ?? 0) & 0xFF, 2);
const bytesAt = (buf, start, len) => Array.from(buf.slice(Math.max(0, start), Math.min(buf.length, Math.max(0, start) + Math.max(0, len))), (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
const blockKey = (addr, mode = 'adl') => `${addr.toString(16).padStart(6, '0')}:${mode}`;
function win(addr, r = 8) { const l0 = Math.max(0, addr - r); const l = bytesAt(rom, l0, addr - l0); const m = bytesAt(rom, addr, 4); const r0 = Math.min(rom.length, addr + 4); const rr = bytesAt(rom, r0, Math.min(r, rom.length - r0)); return `${l}${l ? ' ' : ''}[${m}]${rr ? ` ${rr}` : ''}`; }
function write24(mem, addr, value) { const a = addr & 0xFFFFFF; mem[a] = value & 0xFF; mem[a + 1] = (value >>> 8) & 0xFF; mem[a + 2] = (value >>> 16) & 0xFF; }
function push24(cpu, mem, value) { cpu.sp = (cpu.sp - 3) & 0xFFFFFF; write24(mem, cpu.sp, value & 0xFFFFFF); }
const snap = (mem, start, len) => Array.from(mem.slice(start, start + len), (b) => b & 0xFF);
function diff(before, after, base) { const out = []; for (let i = 0; i < Math.min(before.length, after.length); i += 1) if (before[i] !== after[i]) out.push({ offset: i, addr: (base + i) & 0xFFFFFF, offsetHex: `IY+${hexByte(i)}`, before: hexByte(before[i]), after: hexByte(after[i]), delta: hexByte(before[i] ^ after[i]) }); return out; }
function eff(inst) { if (!Number.isInteger(inst?.addr)) return null; return inst.modePrefix === 'sis' || inst.modePrefix === 'lis' ? (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0 : inst.addr >>> 0; }
function dec(pc) { try { return decodeInstruction(rom, pc, 'adl'); } catch (e) { return { pc, length: 1, tag: 'decode-error', errorMessage: e?.message ?? String(e) }; } }
function idx(reg, d) { return `(${String(reg).toUpperCase()}${d >= 0 ? '+' : ''}${d})`; }
function fmt(inst) {
  const p = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'call': return `${p}CALL ${hex(inst.target)}`; case 'call-conditional': return `${p}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${p}JP ${hex(inst.target)}`; case 'jp-conditional': return `${p}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`; case 'jp-indirect': return `${p}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${p}JR ${hex(inst.target)}`; case 'jr-conditional': return `${p}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${p}RET`; case 'ret-conditional': return `${p}RET ${String(inst.condition).toUpperCase()}`; case 'reti': return `${p}RETI`; case 'retn': return `${p}RETN`;
    case 'ld-pair-imm': return `${p}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`; case 'ld-reg-imm': return `${p}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${p}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`; case 'ld-reg-ind': return `${p}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`; case 'ld-ind-reg': return `${p}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${p}LD ${String(inst.dest).toUpperCase()}, (${hex(eff(inst) ?? inst.addr)})`; case 'ld-mem-reg': return `${p}LD (${hex(eff(inst) ?? inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `${p}LD ${String(inst.dest).toUpperCase()}, ${idx(inst.indexRegister, inst.displacement)}`; case 'ld-ixd-reg': return `${p}LD ${idx(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-bit': return `${p}BIT ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`; case 'indexed-cb-set': return `${p}SET ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`; case 'indexed-cb-res': return `${p}RES ${inst.bit}, ${idx(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg': return `${p}${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`; case 'add-pair': return `${p}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`; case 'inc-reg': return `${p}INC ${String(inst.reg).toUpperCase()}`; case 'dec-reg': return `${p}DEC ${String(inst.reg).toUpperCase()}`; case 'inc-pair': return `${p}INC ${String(inst.pair).toUpperCase()}`; case 'dec-pair': return `${p}DEC ${String(inst.pair).toUpperCase()}`;
    case 'alu-imm': return `${p}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`; case 'alu-reg': return `${p}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`; case 'alu-ixd': return `${p}${String(inst.op).toUpperCase()} ${idx(inst.indexRegister, inst.displacement)}`;
    case 'push': return `${p}PUSH ${String(inst.pair).toUpperCase()}`; case 'pop': return `${p}POP ${String(inst.pair).toUpperCase()}`; case 'ldir': return `${p}LDIR`; case 'lddr': return `${p}LDDR`; case 'nop': return `${p}NOP`;
    default: { const extra = Object.entries(inst).filter(([k]) => !['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates', 'fallthrough'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'number' ? hex(v) : String(v)}`).join(' '); return `${p}[${inst.tag}]${extra ? ` ${extra}` : ''}`; }
  }
}

const hard = (inst) => Boolean(inst) && ['ret', 'reti', 'retn', 'jp', 'jr', 'halt', 'slp'].includes(inst.tag);
const retish = (inst) => Boolean(inst) && ['ret', 'ret-conditional', 'reti', 'retn'].includes(inst.tag);
function reaches(start, target, limit = 0x180) { if (start === target) return true; let pc = start; const end = Math.min(rom.length, start + limit); while (pc < target && pc < end) { const inst = dec(pc); if (inst.tag === 'decode-error') return false; pc += Math.max(1, inst.length ?? 1); } return pc === target; }
function entryInfo(target, lookback = 0x100) { const floor = Math.max(0, target - lookback); for (let addr = target - 1; addr >= floor; addr -= 1) { const inst = dec(addr); const next = addr + Math.max(1, inst.length ?? 1); if (next > target || !hard(inst) || !reaches(next, target)) continue; return { target, entry: next, boundaryPc: addr, boundaryTag: inst.tag, heuristic: `after_${inst.tag}` }; } return { target, entry: target, boundaryPc: null, boundaryTag: null, heuristic: 'self' }; }
function scanExact(target) { const lo = target & 0xFF, mid = (target >>> 8) & 0xFF, hi = (target >>> 16) & 0xFF, out = []; for (const [op, kind] of EXACT) for (let addr = 0; addr <= rom.length - 4; addr += 1) if (rom[addr] === op && rom[addr + 1] === lo && rom[addr + 2] === mid && rom[addr + 3] === hi) out.push({ addr, kind, target, bytes: bytesAt(rom, addr, 4), window: win(addr) }); return out.sort((a, b) => a.addr - b.addr); }
function scanDirect(target) { const lo = target & 0xFF, mid = (target >>> 8) & 0xFF, hi = (target >>> 16) & 0xFF, out = []; for (let addr = 0; addr <= rom.length - 4; addr += 1) { const kind = DIRECT.get(rom[addr]); if (!kind || rom[addr + 1] !== lo || rom[addr + 2] !== mid || rom[addr + 3] !== hi) continue; const inst = dec(addr), caller = entryInfo(addr); out.push({ addr, kind, target, bytes: bytesAt(rom, addr, 4), window: win(addr), decoded: inst.tag === 'decode-error' ? kind : fmt(inst), callerEntry: caller.entry, callerBoundaryPc: caller.boundaryPc, callerBoundaryTag: caller.boundaryTag }); } return out.sort((a, b) => a.addr - b.addr); }
function disasm(start, end) { const rows = []; for (let pc = start; pc < end;) { const inst = dec(pc); const len = Math.max(1, inst.length ?? 1); rows.push({ pc, inst, bytes: bytesAt(rom, pc, len), text: inst.tag === 'decode-error' ? `decode-error: ${inst.errorMessage}` : fmt(inst), marker: pc === TARGET_A ? 'A>' : pc === TARGET_B ? 'B>' : '  ' }); pc += len; } return rows; }

function memWithRom() { const mem = new Uint8Array(MEM_SIZE); mem.set(rom.subarray(0, Math.min(mem.length, rom.length))); return mem; }
function runtime(mem) { const peripherals = createPeripheralBus({ timerInterrupt: false }); const executor = createExecutor(BLOCKS, mem, { peripherals }); return { executor, cpu: executor.cpu }; }
function reset(cpu, mem) { cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = MBASE; cpu.iy = IY_ADDR; cpu.ix = IX_ADDR; cpu.hl = 0; cpu.de = 0; cpu.bc = 0; cpu.a = 0x00; cpu.f = 0x40; cpu.sp = STACK_TOP; mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20)); }
function coldBoot(executor, cpu, mem) { const boot = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: 32 }); cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3); const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: KERNEL_INIT_MAX_STEPS, maxLoopIterations: 10000 }); cpu.mbase = MBASE; cpu.iy = IY_ADDR; cpu.hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3); const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: POST_INIT_MAX_STEPS, maxLoopIterations: 32 }); return { boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc ?? 0) }, kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc ?? 0) }, postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc ?? 0) } }; }
function memInit(executor, cpu, mem) { reset(cpu, mem); cpu.sp -= 3; write24(mem, cpu.sp, MEM_INIT_RET); let returned = false; let result = null; try { result = executor.runFrom(MEM_INIT_ENTRY, 'adl', { maxSteps: MEM_INIT_MAX_STEPS, maxLoopIterations: MAX_LOOP_ITERATIONS, onBlock(pc) { if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__'); }, onMissingBlock(pc) { if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__'); } }); } catch (e) { if (e?.message === '__MEMINIT_RET__') returned = true; else throw e; } return { returned, steps: result?.steps ?? null, termination: returned ? 'sentinel' : (result?.termination ?? null) }; }
function baseline() { const mem = memWithRom(); const { executor, cpu } = runtime(mem); return { boot: coldBoot(executor, cpu, mem), memInit: memInit(executor, cpu, mem), memory: new Uint8Array(mem) }; }
function traceDirect(baselineMem, target) {
  const mem = new Uint8Array(baselineMem); const { executor, cpu } = runtime(mem); reset(cpu, mem); cpu.sp = STACK_TOP; cpu.ix = IX_ADDR; cpu.iy = IY_ADDR; cpu.mbase = MBASE;
  const before = snap(mem, IY_ADDR, IY_WINDOW); push24(cpu, mem, RETURN_SENTINEL);
  const visitedBlocks = []; const missingBlocks = []; let result = null; let stopStep = null; let termination = 'max_steps'; let errorMessage = null;
  try { result = executor.runFrom(target, 'adl', { maxSteps: TRACE_MAX_STEPS, maxLoopIterations: 256, onBlock(pc, _m, _meta, step) { const addr = pc & 0xFFFFFF; visitedBlocks.push(hex(addr)); if (addr === RETURN_SENTINEL) { stopStep = step ?? 0; throw new Error('__TRACE_STOP__'); } }, onMissingBlock(pc, _m, step) { const addr = pc & 0xFFFFFF; missingBlocks.push(hex(addr)); visitedBlocks.push(`MISSING:${hex(addr)}`); if (addr === RETURN_SENTINEL) { stopStep = step ?? 0; throw new Error('__TRACE_STOP__'); } } }); termination = result.termination ?? termination; } catch (e) { if (e?.message === '__TRACE_STOP__') termination = 'sentinel'; else { termination = 'exception'; errorMessage = e?.stack ?? String(e); } }
  const after = snap(mem, IY_ADDR, IY_WINDOW); const changes = diff(before, after, IY_ADDR); const otherIyChanges = changes.filter((c) => c.offset !== 0x05);
  return { targetAddr: hex(target), exactBlockExists: Boolean(BLOCKS[blockKey(target)]), bridgeBlockExists: Boolean(BLOCKS[blockKey(0x061287)]), stepsTaken: result?.steps ?? stopStep ?? 0, termination, errorMessage, visitedBlocks, missingBlocks, iyPlus5Before: hexByte(before[5]), iyPlus5After: hexByte(after[5]), bit4SetAfter: (after[5] & 0x10) !== 0, iyChanges: changes, otherIyChanges };
}

function printHits(label, hits) {
  console.log(`--- ${label} (${hits.length}) ---`);
  if (hits.length === 0) { console.log('  none'); console.log(); return; }
  for (const hit of hits) {
    console.log(`  ${hex(hit.addr)}  ${hit.kind} ${hex(hit.target)}${hit.decoded ? `  [${hit.decoded}]` : ''}`);
    if (hit.callerEntry !== undefined) console.log(`    caller entry: ${hex(hit.callerEntry)}${hit.callerBoundaryPc !== null ? ` via ${String(hit.callerBoundaryTag).toUpperCase()} at ${hex(hit.callerBoundaryPc)}` : ''}`);
    console.log(`    bytes:  ${hit.bytes}`);
    console.log(`    window: ${hit.window}`);
  }
  console.log();
}

function main() {
  const infoA = entryInfo(TARGET_A), infoB = entryInfo(TARGET_B), sharedEntry = infoA.entry === infoB.entry ? infoA.entry : null;
  const exactA = scanExact(TARGET_A), exactB = scanExact(TARGET_B), exactEntry = sharedEntry !== null ? scanExact(sharedEntry) : [];
  const directA = scanDirect(TARGET_A), directB = scanDirect(TARGET_B), directEntry = sharedEntry !== null ? scanDirect(sharedEntry) : [];
  const rows = disasm(DISASM_START, DISASM_END);
  const firstRetAfterB = rows.find((r) => r.pc > TARGET_B && retish(r.inst)) ?? null;
  const branchesPastFirstRet = firstRetAfterB ? rows.some((r) => r.pc < firstRetAfterB.pc && typeof r.inst?.target === 'number' && r.inst.target > firstRetAfterB.pc && ['jr', 'jr-conditional', 'jp', 'jp-conditional'].includes(r.inst.tag)) : false;
  const cpRows = rows.filter((r) => r.inst?.tag === 'alu-imm' && r.inst?.op === 'cp');
  const caseA = [...cpRows].reverse().find((r) => r.pc < TARGET_A) ?? null;
  const caseB = [...cpRows].reverse().find((r) => r.pc < TARGET_B) ?? null;
  const chain = directEntry.filter((h) => h.callerEntry !== sharedEntry).map((h) => ({ callerSite: h.addr, callerEntry: h.callerEntry, upstream: scanDirect(h.callerEntry) }));
  const base = baseline();
  const traceA = traceDirect(base.memory, TARGET_A);

  console.log('=== Phase 213: Trace 0x0612B0 / 0x0612E4 edit-mode entry points ===\n');
  console.log('=== PART A: Static ROM scan for callers ===\n');
  console.log(`Inferred entry for ${hex(TARGET_A)}: ${hex(infoA.entry)} (${infoA.heuristic}${infoA.boundaryPc !== null ? ` from ${hex(infoA.boundaryPc)} ${String(infoA.boundaryTag).toUpperCase()}` : ''})`);
  console.log(`Inferred entry for ${hex(TARGET_B)}: ${hex(infoB.entry)} (${infoB.heuristic}${infoB.boundaryPc !== null ? ` from ${hex(infoB.boundaryPc)} ${String(infoB.boundaryTag).toUpperCase()}` : ''})`);
  if (sharedEntry !== null) console.log(`Shared entry: ${hex(sharedEntry)}`);
  console.log();
  printHits(`Exact raw CALL/JP sites for ${hex(TARGET_A)}`, exactA);
  printHits(`Exact raw CALL/JP sites for ${hex(TARGET_B)}`, exactB);
  if (sharedEntry !== null) printHits(`Exact raw CALL/JP sites for inferred entry ${hex(sharedEntry)}`, exactEntry);
  printHits(`Direct CALL/JP transfers to ${hex(TARGET_A)} (conditional included)`, directA);
  printHits(`Direct CALL/JP transfers to ${hex(TARGET_B)} (conditional included)`, directB);
  if (sharedEntry !== null) printHits(`Direct CALL/JP transfers to inferred entry ${hex(sharedEntry)} (conditional included)`, directEntry);
  console.log('--- Home-screen reachability hint ---');
  if (sharedEntry === null || directEntry.length === 0) console.log('  No direct transfer into the inferred entry was found, so a home-screen path is not statically proven here.');
  else for (const item of chain) { console.log(`  ${hex(sharedEntry)} is reached from ${hex(item.callerSite)} inside function ${hex(item.callerEntry)}.`); if (item.upstream.length === 0) console.log(`    No direct CALL/JP into ${hex(item.callerEntry)} was found, so the chain stops there in this scan.`); else for (const u of item.upstream) console.log(`    Upstream: ${hex(u.addr)} ${u.kind} ${hex(u.target)} [${u.decoded}]`); }
  console.log();
  console.log('=== PART B: Static disassembly of 0x061280-0x061320 ===\n');
  for (const row of rows) console.log(`${row.marker} ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  console.log();
  console.log('--- Boundary analysis ---');
  console.log(`  Before ${hex(TARGET_A)}: ${infoA.boundaryPc !== null ? `${hex(infoA.boundaryPc)} ${String(infoA.boundaryTag).toUpperCase()} -> ${hex(infoA.entry)}` : 'not found'}`);
  console.log(`  Before ${hex(TARGET_B)}: ${infoB.boundaryPc !== null ? `${hex(infoB.boundaryPc)} ${String(infoB.boundaryTag).toUpperCase()} -> ${hex(infoB.entry)}` : 'not found'}`);
  if (firstRetAfterB) { console.log(`  First RET after ${hex(TARGET_B)}: ${hex(firstRetAfterB.pc)} ${firstRetAfterB.text}`); if (branchesPastFirstRet) console.log('  Note: a branch in-range crosses beyond that RET, so it is a path-local return, not necessarily the whole-function end.'); }
  if (cpRows.length) console.log(`  Compare cases in-window: ${cpRows.map((r) => `${hex(r.pc)}=CP ${hexByte(r.inst.value)}`).join(', ')}`);
  if (caseA) console.log(`  ${hex(TARGET_A)} follows ${hex(caseA.pc)} CP ${hexByte(caseA.inst.value)}.`);
  if (caseB) console.log(`  ${hex(TARGET_B)} follows ${hex(caseB.pc)} CP ${hexByte(caseB.inst.value)}.`);
  console.log();
  console.log('=== PART C: Dynamic trace ===\n');
  console.log(JSON.stringify({ bootSequence: `${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`, boot: base.boot, memInit: base.memInit, runtimeSetup: { sp: hex(STACK_TOP), ix: hex(IX_ADDR), iy: hex(IY_ADDR), mbase: hexByte(MBASE), returnSentinel: hex(RETURN_SENTINEL), traceMaxSteps: TRACE_MAX_STEPS } }, null, 2));
  console.log();
  console.log(JSON.stringify(traceA, null, 2));
  console.log();
  console.log(`Dynamic summary: steps=${traceA.stepsTaken}, blocks=${traceA.visitedBlocks.length}, final IY+5=${traceA.iyPlus5After}, bit4=${traceA.bit4SetAfter ? 'SET' : 'clear'}`);
  console.log(traceA.otherIyChanges.length === 0 ? 'Other IY-window changes: none' : `Other IY-window changes: ${traceA.otherIyChanges.map((c) => `${c.offsetHex}:${c.before}->${c.after}`).join(', ')}`);
  console.log();
  console.log(JSON.stringify({ probe: 'probe-phase213-edit-mode-entry.mjs', generatedAt: new Date().toISOString(), targets: { setSiteA: hex(TARGET_A), setSiteB: hex(TARGET_B), entryA: hex(infoA.entry), entryB: hex(infoB.entry) }, staticScan: { exactA: exactA.map((h) => ({ addr: hex(h.addr), kind: h.kind })), exactB: exactB.map((h) => ({ addr: hex(h.addr), kind: h.kind })), exactEntry: exactEntry.map((h) => ({ addr: hex(h.addr), kind: h.kind })), directEntry: directEntry.map((h) => ({ addr: hex(h.addr), kind: h.kind, callerEntry: hex(h.callerEntry) })) }, dynamicTrace: { target: hex(TARGET_A), stepsTaken: traceA.stepsTaken, termination: traceA.termination, finalIyPlus5: traceA.iyPlus5After, bit4SetAfter: traceA.bit4SetAfter, otherIyChanges: traceA.otherIyChanges, visitedBlocks: traceA.visitedBlocks, missingBlocks: traceA.missingBlocks } }, null, 2));
}

try { main(); } catch (error) { console.log(JSON.stringify({ probe: 'probe-phase213-edit-mode-entry.mjs', error: { message: error?.message ?? String(error), stack: error?.stack ?? String(error) } }, null, 2)); process.exitCode = 1; }
