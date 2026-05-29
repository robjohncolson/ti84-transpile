#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const MODE = 'adl';
const IRQ_START = 0x000710;
const IRQ_END = 0x000721;
const GUARD_START = 0x001713;
const GUARD_END = 0x00172A;
const CTX_START = 0x001900;
const CTX_END = 0x001A00;
const WRAPPER_START = 0x001933;
const WRAPPER_END = 0x00194C;
const DISPATCH_START = 0x0019B5;
const DISPATCH_HALT = 0x0019BD;
const ENTRY = 0x0019BE;
const FN_START = 0x0019B5;
const FN_END = 0x001B00;
const LINEAR_LIMIT = 150;
const BYTE_LIMIT = 0x200;
const WALK_LIMIT = 150;

const RAM_LABELS = new Map([
  [0xD02AD7, 'callbackPtr'],
  [0xD02AD9, 'callbackStatusByte'],
  [0xD177BA, 'gateFlag'],
  [0xD02658, 'timerCountdown24'],
  [0xD02651, 'timerCountdown8'],
  [0xD00080, 'systemFlagsBase'],
  [0xD0009B, 'irqStateByte'],
  [0xD0058F, 'port03Shadow'],
]);

const TARGET_LABELS = new Map([
  [0x001933, 'separate HALT-wait wrapper'],
  [0x001943, 'wrapper tail after HALT'],
  [0x0019B5, 'dispatcher prologue / HALT gate'],
  [0x0019BE, 'alternate entry after HALT'],
  [0x0019EF, 'byte0 masked-status path'],
  [0x001A17, 'byte2 masked-status path'],
  [0x001A32, 'common exit -> EI / RETI'],
  [0x001A4B, 'byte1 bit6 service'],
  [0x001A5D, 'byte2 bit3 service'],
  [0x001A77, 'byte1 bit5 service'],
  [0x001A8D, 'byte1 bit4 service -> display callback dispatcher'],
  [0x001AA3, 'byte0 bit3 service'],
  [0x001ABB, 'byte1 bit2 service'],
  [0x001ACF, 'byte0 bit4 timer/countdown service'],
  [0x009B35, 'byte1 bit5 helper'],
  [0x010220, 'display callback dispatcher'],
  [0x014DAB, 'byte0 bit3 helper'],
]);

function hex(v, w = 6) {
  if (v === undefined || v === null || Number.isNaN(Number(v))) return 'n/a';
  return `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function upper(v) {
  return String(v ?? '').toUpperCase();
}

function bytesToHex(start, len) {
  return Array.from(
    rom.subarray(start, Math.min(rom.length, start + Math.max(len, 0))),
    (b) => (b & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) throw new Error('bad decode');
    return inst;
  } catch (error) {
    return {
      pc,
      nextPc: pc + 1,
      length: 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function fb(inst) {
  const skip = new Set(['pc', 'nextPc', 'length', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates', 'decodeError']);
  return Object.entries(inst ?? {})
    .filter(([k, v]) => !skip.has(k) && v !== undefined && v !== null)
    .map(([k, v]) => (typeof v === 'number' ? `${k}=${hex(v, v > 0xFF ? 6 : 2)}` : `${k}=${String(v)}`))
    .join(' ');
}

function fmt(inst) {
  const a = inst.addr ?? inst.address;
  switch (inst?.tag) {
    case 'db': return `DB ${hex(inst.value, 2)}`;
    case 'ret': case 'reti': case 'retn': case 'di': case 'ei': case 'halt': case 'nop': case 'rla': case 'rra': return upper(inst.tag);
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${upper(inst.indirectRegister)})`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ret-conditional': return `RET ${upper(inst.condition)}`;
    case 'push': return `PUSH ${upper(inst.pair)}`;
    case 'pop': return `POP ${upper(inst.pair)}`;
    case 'inc-pair': return `INC ${upper(inst.pair)}`;
    case 'dec-pair': return `DEC ${upper(inst.pair)}`;
    case 'inc-reg': return `INC ${upper(inst.reg)}`;
    case 'dec-reg': return `DEC ${upper(inst.reg)}`;
    case 'ld-pair-imm': return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-ind': return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg': return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'ld-reg-mem': return `LD ${upper(inst.dest)},(${hex(a)})`;
    case 'ld-mem-reg': return `LD (${hex(a)}),${upper(inst.src)}`;
    case 'ld-pair-mem': return `LD ${upper(inst.pair)},(${hex(a)})`;
    case 'ld-mem-pair': return `LD (${hex(a)}),${upper(inst.pair)}`;
    case 'alu-reg': return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm': return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'in0': return `IN0 ${upper(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0': return `OUT0 (${hex(inst.port, 2)}),${upper(inst.reg)}`;
    case 'in-reg': return `IN ${upper(inst.reg)},(C)`;
    case 'out-reg': return `OUT (C),${upper(inst.reg)}`;
    case 'bit-test': return `BIT ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set': return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res': return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set': return `SET ${inst.bit},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res': return `RES ${inst.bit},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'rst': return `RST ${hex(inst.target ?? 0, 2)}`;
    default: {
      const tail = fb(inst);
      return tail ? `${upper(inst.tag)} ${tail}` : upper(inst.tag);
    }
  }
}

function terminal(tag) {
  return tag === 'ret' || tag === 'reti' || tag === 'retn' || tag === 'halt';
}

function uncondJump(tag) {
  return tag === 'jp' || tag === 'jr' || tag === 'jp-indirect' || tag === 'rst';
}

function condJump(tag) {
  return tag === 'jp-conditional' || tag === 'jr-conditional' || tag === 'djnz';
}

function callLike(tag) {
  return tag === 'call' || tag === 'call-conditional';
}

function withinFn(addr) {
  return addr >= FN_START && addr < FN_END;
}

function row(pc, inst, extra = {}) {
  return { pc, inst, bytes: bytesToHex(pc, inst.length), text: fmt(inst), ...extra };
}

function decodeRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end && pc < rom.length;) {
    const inst = safeDecode(pc);
    rows.push(row(pc, inst));
    if (!Number.isInteger(inst.nextPc) || inst.nextPc <= pc) break;
    pc = inst.nextPc & 0xFFFFFF;
  }
  return rows;
}

function traceLinear(start) {
  const rows = [];
  for (let pc = start; rows.length < LINEAR_LIMIT && pc < rom.length && (pc - start) < BYTE_LIMIT;) {
    const inst = safeDecode(pc);
    rows.push(row(pc, inst));
    if (terminal(inst.tag) || uncondJump(inst.tag)) break;
    if (!Number.isInteger(inst.nextPc) || inst.nextPc <= pc) break;
    pc = inst.nextPc & 0xFFFFFF;
  }
  return rows;
}

function walk() {
  const q = [ENTRY];
  const seen = new Set();
  const rows = [];
  const calls = new Map();
  const jumps = new Map();
  let minPc = ENTRY;
  let maxPc = ENTRY;
  while (q.length && rows.length < WALK_LIMIT) {
    const pc = q.shift() & 0xFFFFFF;
    if (seen.has(pc) || !withinFn(pc) || pc >= rom.length) continue;
    const inst = safeDecode(pc);
    seen.add(pc);
    rows.push(row(pc, inst));
    minPc = Math.min(minPc, pc);
    maxPc = Math.max(maxPc, pc + inst.length - 1);
    const t = typeof inst.target === 'number' ? (inst.target & 0xFFFFFF) : null;
    const n = typeof inst.nextPc === 'number' ? (inst.nextPc & 0xFFFFFF) : null;
    const f = typeof inst.fallthrough === 'number' ? (inst.fallthrough & 0xFFFFFF) : n;
    if (callLike(inst.tag) && t !== null) {
      if (!calls.has(t)) calls.set(t, []);
      calls.get(t).push(pc);
      if (withinFn(t)) q.push(t);
      if (n !== null && withinFn(n)) q.push(n);
      continue;
    }
    if (uncondJump(inst.tag) && t !== null) {
      if (!jumps.has(t)) jumps.set(t, []);
      jumps.get(t).push(pc);
      if (withinFn(t)) q.push(t);
      continue;
    }
    if (condJump(inst.tag) && t !== null) {
      if (!jumps.has(t)) jumps.set(t, []);
      jumps.get(t).push(pc);
      if (withinFn(t)) q.push(t);
      if (f !== null && withinFn(f)) q.push(f);
      continue;
    }
    if (inst.tag === 'ret-conditional') {
      if (n !== null && withinFn(n)) q.push(n);
      continue;
    }
    if (!terminal(inst.tag) && n !== null && withinFn(n)) q.push(n);
  }
  return { rows: rows.sort((a, b) => a.pc - b.pc), calls, jumps, minPc, maxPc };
}

function ramRefs(inst, bases) {
  const refs = [];
  const a = inst.addr ?? inst.address;
  if ((inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg' || inst.tag === 'ld-pair-mem' || inst.tag === 'ld-mem-pair') && typeof a === 'number') {
    const addr = a & 0xFFFFFF;
    if (addr >= 0xD00000 && addr <= 0xD1FFFF) refs.push(addr);
  }
  if ((inst.tag === 'indexed-cb-bit' || inst.tag === 'indexed-cb-set' || inst.tag === 'indexed-cb-res') && typeof inst.displacement === 'number' && inst.indexRegister && typeof bases[inst.indexRegister] === 'number') {
    const addr = (bases[inst.indexRegister] + inst.displacement) & 0xFFFFFF;
    if (addr >= 0xD00000 && addr <= 0xD1FFFF) refs.push(addr);
  }
  return [...new Set(refs)];
}

function annotate(rows, source) {
  const hits = new Map();
  const bases = { ix: null, iy: null };
  for (const r of rows) {
    r.ram = ramRefs(r.inst, bases);
    for (const addr of r.ram) {
      if (!hits.has(addr)) hits.set(addr, []);
      hits.get(addr).push({ pc: r.pc, source });
    }
    if (r.inst.tag === 'ld-pair-imm' && (r.inst.pair === 'ix' || r.inst.pair === 'iy')) bases[r.inst.pair] = r.inst.value & 0xFFFFFF;
    if ((r.inst.tag === 'pop' || r.inst.tag === 'ld-pair-mem') && (r.inst.pair === 'ix' || r.inst.pair === 'iy')) bases[r.inst.pair] = null;
  }
  return { rows, hits };
}

function mergeHits(...maps) {
  const out = new Map();
  for (const map of maps) {
    for (const [addr, refs] of map.entries()) {
      if (!out.has(addr)) out.set(addr, []);
      out.get(addr).push(...refs);
    }
  }
  return out;
}

function transferTag(inst) {
  if (inst.tag === 'call') return 'CALL';
  if (inst.tag === 'call-conditional') return `CALL ${upper(inst.condition)}`;
  if (inst.tag === 'jp') return 'JP';
  if (inst.tag === 'jp-conditional') return `JP ${upper(inst.condition)}`;
  if (inst.tag === 'jr') return 'JR';
  if (inst.tag === 'jr-conditional') return `JR ${upper(inst.condition)}`;
  if (inst.tag === 'djnz') return 'DJNZ';
  return upper(inst.tag);
}

function note(r) {
  const notes = [];
  if (r.pc === IRQ_START) notes.push('IRQ front end');
  if (r.pc === 0x000719) notes.push('guard failure enters 0x0019BE');
  if (r.pc === 0x001718) notes.push('reads D177BA before alternate entry');
  if (r.pc === WRAPPER_START) notes.push('separate HALT wrapper starts here');
  if (r.pc === DISPATCH_START) notes.push('dispatcher prologue starts here');
  if (r.pc === DISPATCH_HALT) notes.push('HALT before 0x0019BE');
  if (r.pc === ENTRY) notes.push('alternate entry after HALT');
  if (r.pc === 0x001A32) notes.push('common EI/RETI exit');
  if (r.pc === 0x001ACF) notes.push('timer/countdown service');
  const t = typeof r.inst.target === 'number' ? (r.inst.target & 0xFFFFFF) : null;
  if ((callLike(r.inst.tag) || uncondJump(r.inst.tag) || condJump(r.inst.tag)) && t !== null) {
    notes.push(`${transferTag(r.inst)} -> ${hex(t)}${TARGET_LABELS.has(t) ? ` ${TARGET_LABELS.get(t)}` : ''}`);
  }
  if (r.ram?.length) notes.push(`RAM ${r.ram.map((addr) => `${RAM_LABELS.get(addr) ?? 'ram'}=${hex(addr)}`).join(', ')}`);
  return notes.length ? ` ; ${notes.join(' | ')}` : '';
}

function printRows(title, rows) {
  console.log(title);
  let i = 0;
  for (const r of rows) {
    i += 1;
    console.log(`[${String(i).padStart(3, '0')}] ${hex(r.pc)}  ${r.bytes.padEnd(18)}  ${r.text}${note(r)}`);
  }
  console.log('');
}

function printTransfers(title, map) {
  console.log(title);
  if (map.size === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const [target, froms] of [...map.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${hex(target)}${TARGET_LABELS.has(target) ? ` ${TARGET_LABELS.get(target)}` : ''} <- ${[...new Set(froms.map((pc) => hex(pc)))].join(', ')}`);
  }
  console.log('');
}

function refsTo(target) {
  const refs = [];
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;
  const seen = new Set();
  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    if (rom[pc + 1] !== b0 || rom[pc + 2] !== b1 || rom[pc + 3] !== b2) continue;
    const inst = safeDecode(pc);
    if (!(callLike(inst.tag) || uncondJump(inst.tag) || condJump(inst.tag))) continue;
    if (typeof inst.target !== 'number' || (inst.target & 0xFFFFFF) !== target) continue;
    if (seen.has(pc)) continue;
    seen.add(pc);
    refs.push({ pc, kind: transferTag(inst) });
  }
  return refs.sort((a, b) => a.pc - b.pc);
}

function printRefs(title, refs) {
  console.log(title);
  if (!refs.length) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const ref of refs) console.log(`  ${hex(ref.pc)} ${ref.kind}`);
  console.log('');
}

function printRam(title, hits) {
  console.log(title);
  if (hits.size === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }
  for (const [addr, refs] of [...hits.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${hex(addr)} ${RAM_LABELS.get(addr) ?? 'unlabeled'}: ${[...new Set(refs.map((r) => `${hex(r.pc)} [${r.source}]`))].join(', ')}`);
  }
  console.log('');
}

const irq = annotate(decodeRange(IRQ_START, IRQ_END), 'irq-front');
const guard = annotate(decodeRange(GUARD_START, GUARD_END), 'guard');
const ctx = annotate(decodeRange(CTX_START, CTX_END), 'context');
const linear = annotate(traceLinear(ENTRY), 'linear');
const coreState = walk();
const core = annotate(coreState.rows, 'core');
const allHits = mergeHits(irq.hits, guard.hits, ctx.hits, linear.hits, core.hits);
const bodyHits = mergeHits(linear.hits, core.hits);

const entryRefs = refsTo(ENTRY);
const dispatchRefs = refsTo(DISPATCH_START);
const wrapperRefs = refsTo(WRAPPER_START);

console.log('Phase 459 - Trace 0x0019BE Alternate Processing Path');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Focus entry: ${hex(ENTRY)}`);
console.log(`Context window: ${hex(CTX_START)}-${hex(CTX_END)}`);
console.log(`Dispatcher window: ${hex(FN_START)}-${hex(FN_END - 1)}`);
console.log('');

printRows('=== IRQ Front-End Alternate-Entry Source ===', irq.rows);
printRows('=== Guard Helper 0x001713 ===', guard.rows);
printRows('=== Surrounding Context 0x001900-0x001A00 ===', ctx.rows);
printRows('=== Linear Fallthrough From 0x0019BE ===', linear.rows);
printRows('=== Reachable Dispatcher Body From 0x0019BE ===', core.rows);

console.log('=== Summary ===');
console.log(`  Context instructions: ${ctx.rows.length}`);
console.log(`  Linear 0x0019BE instructions: ${linear.rows.length}`);
console.log(`  Reachable dispatcher instructions: ${core.rows.length}`);
console.log(`  Wrapper boundary: ${hex(WRAPPER_START)}-${hex(WRAPPER_END)}`);
console.log(`  Dispatcher boundary: ${hex(DISPATCH_START)}-${hex(coreState.maxPc)} (${hex(coreState.maxPc - coreState.minPc + 1)} bytes reached from 0x0019BE)`);
console.log('');

printRefs('Direct references to 0x0019BE', entryRefs);
printRefs('Direct references to 0x0019B5', dispatchRefs);
printRefs('Direct references to 0x001933', wrapperRefs);
printTransfers('Direct CALL targets from the dispatcher body', coreState.calls);
printTransfers('Direct JP/JR targets from the dispatcher body', coreState.jumps);
printRam('All RAM accesses seen in 0xD00000-0xD1FFFF', allHits);
printRam('Dispatcher-body RAM accesses', bodyHits);

console.log('=== Interpretation ===');
console.log('  0x0019BE is not the 0x001933 HALT-wait path. A RET at 0x001932 ends the earlier routine, and 0x001933-0x00194C is a separate wrapper.');
console.log('  A second RET at 0x0019B4 starts a new routine at 0x0019B5. 0x0019BE is the first instruction after that routine\'s HALT at 0x0019BD.');
console.log(`  The only direct external entry to 0x0019BE found in ROM is ${entryRefs.length ? entryRefs.map((r) => `${hex(r.pc)} ${r.kind}`).join(', ') : 'none'}, which matches the IRQ front-end guard-failure branch.`);
console.log('  The body reached from 0x0019BE fans out across masked-status bytes 0x5015, 0x5014, and 0x5016, acknowledges via 0x5009/0x5008/0x500A, and exits through 0x001A32 -> EI -> RETI.');
console.log('  The 0x001ACF branch decrements D02658 and D02651, while the common exit stores D02AD7. That is IRQ/event-service behavior, not a standalone error-recovery or power-management helper.');
console.log('  Best fit: alternate entry into the post-HALT masked IRQ dispatcher / event-service loop rooted at 0x0019B5. It bypasses the sleep prologue and jumps straight into pending-event dispatch.');
