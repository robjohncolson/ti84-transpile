#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const TARGETS = {
  D176C9: { addr: 0xD176C9, bytes: [0xC9, 0x76, 0xD1], label: 'Channel 3 active/armed flag' },
  D176CA: { addr: 0xD176CA, bytes: [0xCA, 0x76, 0xD1], label: 'Channel 3 completion/status byte' },
};

// Known functions to disassemble in full
const TRACE_ENTRIES = [
  { addr: 0x0151A7, label: 'suspected Channel 3 staging function (adjacent to 0x015185 RET)' },
  { addr: 0x014E81, label: 'teardown (disarms all 3 notification channels)' },
];

const SEARCH_PATTERNS = [
  { opcode: 0x3A, name: 'LD A,(addr)',    type: 'read',  width: 4 },
  { opcode: 0x32, name: 'LD (addr),A',    type: 'write', width: 4 },
  { opcode: null, prefix: [0xED, 0x4B], name: 'LD BC,(addr)',   type: 'read',  width: 5 },
  { opcode: null, prefix: [0xED, 0x43], name: 'LD (addr),BC',   type: 'write', width: 5 },
  { opcode: 0x2A, name: 'LD HL,(addr)',   type: 'read',  width: 4 },
  { opcode: 0x22, name: 'LD (addr),HL',   type: 'write', width: 4 },
  { opcode: null, prefix: [0xED, 0x5B], name: 'LD DE,(addr)',   type: 'read',  width: 5 },
  { opcode: null, prefix: [0xED, 0x53], name: 'LD (addr),DE',   type: 'write', width: 5 },
];

const CODE_LABELS = new Map([
  [0x00218A, 'common IX stack-frame prologue helper'],
  [0x014E81, 'teardown (disarms all 3 notification channels)'],
  [0x015185, 'Channel 2 completion callback'],
  [0x0151A7, 'suspected Channel 3 staging function'],
  [0x0151FE, 'Channel 2 pre-delivery staging'],
  [0x0155BC, 'notification wrapper sibling A'],
  [0x01567C, 'notification wrapper sibling B'],
  [0x0004DC, 'jump-table JP stub'],
]);

const RAM_LABELS = new Map([
  [0xD14038, 'global notification/link context source'],
  [0xD1440E, 'Channel 1 active/armed flag (USB lock)'],
  [0xD1440F, 'Channel 1 completion/status byte'],
  [0xD176C9, 'Channel 3 active/armed flag'],
  [0xD176CA, 'Channel 3 completion/status byte'],
  [0xD17770, 'Channel 2 staged callback pointer slot'],
  [0xD17773, 'Channel 2 staged callback argument slot'],
  [0xD17776, 'Channel 2 staged context mirror slot'],
  [0xD17779, 'Channel 2 active/armed flag (Link protocol)'],
  [0xD1777A, 'Channel 2 completion/state byte'],
  [0xD17795, 'protocol FSM state byte'],
]);

const MAX_BYTES = 300;
const MAX_INSTRUCTIONS = 128;
const CONTEXT_INSTRUCTIONS = 8;

function hex(value, width = 6) {
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function raw(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    byte => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement < 0 ? '-' : '+';
  return `(${String(indexRegister).toUpperCase()}${sign}${hex(Math.abs(displacement), 2)})`;
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

function formatInstruction(inst) {
  const u = value => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${u(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${u(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${u(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'push':
      return `PUSH ${u(inst.pair)}`;
    case 'pop':
      return `POP ${u(inst.pair)}`;
    case 'push-idx':
      return `PUSH ${u(inst.indexRegister)}`;
    case 'pop-idx':
      return `POP ${u(inst.indexRegister)}`;
    case 'ld-pair-imm':
      return `LD ${u(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${u(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${u(inst.pair)}`;
    case 'ld-reg-imm':
      return `LD ${u(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${u(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${u(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${u(inst.dest)},${u(inst.src)}`;
    case 'ld-pair-indexed':
      return `LD ${u(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixiy-indexed':
      return `LD ${u(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-ixd':
      return `LD ${u(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${u(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ld-sp-pair':
      return `LD SP,${u(inst.pair)}`;
    case 'inc-pair':
      return `INC ${u(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${u(inst.pair)}`;
    case 'inc-reg':
      return `INC ${u(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${u(inst.reg)}`;
    case 'alu-reg':
      return `${u(inst.op)} ${u(inst.src)}`;
    case 'alu-imm':
      return `${u(inst.op)} ${hex(inst.value, 2)}`;
    case 'add-pair':
      return `ADD HL,${u(inst.src ?? inst.pair)}`;
    case 'sbc-pair':
      return `SBC HL,${u(inst.src)}`;
    case 'lea':
      return `LEA ${u(inst.dest)},${u(inst.base)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'xor-a':
      return 'XOR A';
    case 'or-a':
      return 'OR A';
    case 'in0':
      return `IN0 ${u(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${u(inst.reg)}`;
    case 'indexed-cb-test':
      return `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function disassembleUntilRet(entry, maxBytes = MAX_BYTES, maxInstructions = MAX_INSTRUCTIONS) {
  const instructions = [];
  let pc = entry;

  while (pc < rom.length && pc < entry + maxBytes && instructions.length < maxInstructions) {
    const inst = safeDecode(pc);
    instructions.push(inst);
    pc = inst.nextPc;
    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
      break;
    }
  }

  return instructions;
}

function cloneValue(value) {
  return value ? { ...value } : null;
}

function makeState() {
  return { a: null, bc: null, de: null, hl: null, ix: null, iy: null };
}

function indexedSource(state, reg, displacement) {
  const base = state[reg];
  if (base && base.kind === 'imm') {
    return { kind: 'mem', addr: (base.value + displacement) & 0xFFFFFF };
  }
  return { kind: 'indexed', reg, displacement };
}

function getRegisterValue(state, reg) {
  if (reg === 'a') return state.a;
  if (reg === 'bc') return state.bc;
  if (reg === 'de') return state.de;
  if (reg === 'hl') return state.hl;
  if (reg === 'ix') return state.ix;
  if (reg === 'iy') return state.iy;
  return null;
}

function updateState(state, inst) {
  const next = {
    a: cloneValue(state.a),
    bc: cloneValue(state.bc),
    de: cloneValue(state.de),
    hl: cloneValue(state.hl),
    ix: cloneValue(state.ix),
    iy: cloneValue(state.iy),
  };

  switch (inst.tag) {
    case 'ld-pair-imm':
      if (inst.pair in next) next[inst.pair] = { kind: 'imm', value: inst.value };
      break;
    case 'ld-pair-mem':
      if (inst.pair in next) next[inst.pair] = { kind: 'mem', addr: inst.addr };
      break;
    case 'ld-pair-indexed':
      if (inst.pair in next) next[inst.pair] = indexedSource(next, inst.indexRegister, inst.displacement);
      break;
    case 'ld-ixiy-indexed':
      if (inst.dest in next) next[inst.dest] = indexedSource(next, inst.indexRegister, inst.displacement);
      break;
    case 'ld-reg-imm':
      if (inst.dest === 'a') next.a = { kind: 'imm', value: inst.value };
      break;
    case 'ld-reg-mem':
      if (inst.dest === 'a') next.a = { kind: 'mem', addr: inst.addr };
      break;
    case 'ld-reg-reg':
      if (inst.dest === 'a') next.a = getRegisterValue(next, inst.src);
      break;
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') {
        next.a = { kind: 'imm', value: 0 };
      } else if (!(inst.op === 'or' && inst.src === 'a')) {
        next.a = null;
      }
      break;
    case 'xor-a':
      next.a = { kind: 'imm', value: 0 };
      break;
    case 'or-a':
      break;
    case 'call':
    case 'call-conditional':
      next.a = null;
      next.bc = null;
      next.de = null;
      next.hl = null;
      break;
    default:
      break;
  }

  return next;
}

function formatSource(value) {
  if (!value) return '?';
  if (value.kind === 'imm') {
    const label = CODE_LABELS.get(value.value);
    return label ? `${hex(value.value)} (${label})` : hex(value.value);
  }
  if (value.kind === 'mem') {
    const label = RAM_LABELS.get(value.addr);
    return label ? `mem[${hex(value.addr)}] (${label})` : `mem[${hex(value.addr)}]`;
  }
  if (value.kind === 'indexed') {
    return formatIndexed(value.reg, value.displacement);
  }
  return JSON.stringify(value);
}

function labelForRam(addr) {
  return RAM_LABELS.get(addr) ?? '';
}

function collectTrace(instructions) {
  const absoluteRamRefs = [];
  const indexedRefs = [];
  const trackedWrites = [];
  const callTargets = [];
  const portIO = [];

  let state = makeState();

  for (const inst of instructions) {
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push({
        pc: hex(inst.pc),
        target: hex(inst.target),
        label: CODE_LABELS.get(inst.target) ?? '',
      });
    }

    if (inst.tag === 'in0' || inst.tag === 'out0') {
      portIO.push({
        pc: hex(inst.pc),
        type: inst.tag.toUpperCase(),
        port: hex(inst.port, 2),
        register: String(inst.reg).toUpperCase(),
      });
    }

    if (inst.tag === 'ld-pair-indexed' || inst.tag === 'ld-ixiy-indexed' || inst.tag === 'ld-reg-ixd') {
      indexedRefs.push({
        pc: hex(inst.pc),
        type: 'read',
        operand: formatIndexed(inst.indexRegister, inst.displacement),
        via: formatInstruction(inst),
      });
    }

    if (inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-ixd-imm') {
      indexedRefs.push({
        pc: hex(inst.pc),
        type: 'write',
        operand: formatIndexed(inst.indexRegister, inst.displacement),
        via: formatInstruction(inst),
      });
    }

    if (inst.tag === 'ld-pair-mem' && inst.addr >= 0xD00000) {
      absoluteRamRefs.push({
        pc: hex(inst.pc),
        type: 'read',
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        via: formatInstruction(inst),
      });
    }

    if (inst.tag === 'ld-reg-mem' && inst.addr >= 0xD00000) {
      absoluteRamRefs.push({
        pc: hex(inst.pc),
        type: 'read',
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        via: formatInstruction(inst),
      });
    }

    if (inst.tag === 'ld-mem-pair' && inst.addr >= 0xD00000) {
      absoluteRamRefs.push({
        pc: hex(inst.pc),
        type: 'write',
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        via: formatInstruction(inst),
      });
      trackedWrites.push({
        pc: hex(inst.pc),
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        source: formatSource(getRegisterValue(state, inst.pair)),
      });
    }

    if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000) {
      absoluteRamRefs.push({
        pc: hex(inst.pc),
        type: 'write',
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        via: formatInstruction(inst),
      });
      trackedWrites.push({
        pc: hex(inst.pc),
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        source: formatSource(getRegisterValue(state, inst.src)),
      });
    }

    state = updateState(state, inst);
  }

  return { absoluteRamRefs, indexedRefs, trackedWrites, callTargets, portIO };
}

function findBytePattern(bytes) {
  const hits = [];

  for (let i = 0; i <= rom.length - bytes.length; i++) {
    let matched = true;
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }

  return hits;
}

function findCallers(target) {
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;

  return [
    ...findBytePattern([0xCD, b0, b1, b2]).map(addr => ({ addr, type: 'CALL' })),
    ...findBytePattern([0xC3, b0, b1, b2]).map(addr => ({ addr, type: 'JP' })),
  ]
    .sort((left, right) => left.addr - right.addr)
    .map(hit => ({
      pc: hex(hit.addr),
      type: hit.type,
      contextBytes: raw(Math.max(0, hit.addr - 8), 20),
    }));
}

// --- Scan for all references to a 3-byte address in common LD patterns ---

function scanAddressReferences(addrBytes, addrLabel) {
  const results = [];

  for (const pattern of SEARCH_PATTERNS) {
    let searchBytes;
    if (pattern.prefix) {
      searchBytes = [...pattern.prefix, ...addrBytes];
    } else {
      searchBytes = [pattern.opcode, ...addrBytes];
    }

    const hits = findBytePattern(searchBytes);
    for (const hitPc of hits) {
      // Decode context: 5 instructions before, the hit, and 5 after
      const contextBefore = [];
      let scanPc = Math.max(0, hitPc - 20);
      while (scanPc < hitPc && contextBefore.length < CONTEXT_INSTRUCTIONS) {
        const inst = safeDecode(scanPc);
        if (inst.nextPc > hitPc) break;
        contextBefore.push(inst);
        scanPc = inst.nextPc;
      }
      // Keep only last N
      const before = contextBefore.slice(-5);

      // Decode from the hit itself
      const contextAfter = [];
      let afterPc = hitPc;
      while (afterPc < rom.length && contextAfter.length < 6) {
        const inst = safeDecode(afterPc);
        contextAfter.push(inst);
        afterPc = inst.nextPc;
        if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') break;
      }

      results.push({
        pc: hex(hitPc),
        pattern: pattern.name,
        type: pattern.type,
        addr: addrLabel,
        rawBytes: raw(hitPc, pattern.width),
        contextBefore: before.map(i => `${hex(i.pc)}  ${raw(i.pc, i.length).padEnd(18)}  ${formatInstruction(i)}`),
        contextAtAndAfter: contextAfter.map(i => `${hex(i.pc)}  ${raw(i.pc, i.length).padEnd(18)}  ${formatInstruction(i)}`),
      });
    }
  }

  return results.sort((a, b) => parseInt(a.pc) - parseInt(b.pc));
}

// --- Main ---

const rom = fs.readFileSync(ROM_PATH);

console.log('======================================================================');
console.log('Phase 414: Channel 3 D176C9/D176CA Reference Map');
console.log('======================================================================');
console.log('');

// 1. Scan for all references to D176C9
console.log('--- D176C9 (Channel 3 active/armed flag) references ---');
const refsC9 = scanAddressReferences(TARGETS.D176C9.bytes, 'D176C9');
console.log(`Found ${refsC9.length} references:\n`);
for (const ref of refsC9) {
  console.log(`  ${ref.pc}  ${ref.pattern} (${ref.type})  [${ref.rawBytes}]`);
  for (const line of ref.contextBefore) {
    console.log(`    before: ${line}`);
  }
  for (const line of ref.contextAtAndAfter) {
    console.log(`    >>     ${line}`);
  }
  console.log('');
}

// 2. Scan for all references to D176CA
console.log('--- D176CA (Channel 3 completion/status byte) references ---');
const refsCA = scanAddressReferences(TARGETS.D176CA.bytes, 'D176CA');
console.log(`Found ${refsCA.length} references:\n`);
for (const ref of refsCA) {
  console.log(`  ${ref.pc}  ${ref.pattern} (${ref.type})  [${ref.rawBytes}]`);
  for (const line of ref.contextBefore) {
    console.log(`    before: ${line}`);
  }
  for (const line of ref.contextAtAndAfter) {
    console.log(`    >>     ${line}`);
  }
  console.log('');
}

// 3. Disassemble suspected Channel 3 staging function at 0x0151A7
console.log('======================================================================');
console.log('Full disassembly of suspected Channel 3 staging function at 0x0151A7');
console.log('======================================================================');
const staging0151A7 = disassembleUntilRet(0x0151A7);
const trace0151A7 = collectTrace(staging0151A7);
const last0151A7 = staging0151A7.at(-1);
console.log(`  Entry: ${hex(0x0151A7)}`);
console.log(`  Decoded: ${last0151A7 ? last0151A7.nextPc - 0x0151A7 : 0} bytes, ${staging0151A7.length} instructions`);
console.log(`  Stop reason: ${last0151A7 && (last0151A7.tag === 'ret' || last0151A7.tag === 'reti' || last0151A7.tag === 'retn') ? `return at ${hex(last0151A7.pc)}` : 'byte cap'}`);
console.log('');
for (const inst of staging0151A7) {
  console.log(`  ${hex(inst.pc)}  ${raw(inst.pc, inst.length).padEnd(18)}  ${formatInstruction(inst)}`);
}
console.log('');
console.log('  RAM references:');
for (const ref of trace0151A7.absoluteRamRefs) {
  console.log(`    ${ref.pc}  ${ref.type.padEnd(6)} ${ref.addr}  ${ref.label}  via ${ref.via}`);
}
console.log('');
console.log('  Call targets:');
for (const ct of trace0151A7.callTargets) {
  console.log(`    ${ct.pc}  CALL ${ct.target}  ${ct.label}`);
}
console.log('');
console.log('  Tracked writes:');
for (const tw of trace0151A7.trackedWrites) {
  console.log(`    ${tw.pc}  ${tw.addr}  ${tw.label}  <- ${tw.source}`);
}

// 4. Disassemble teardown at 0x014E81 for Channel 3 context
console.log('');
console.log('======================================================================');
console.log('Teardown at 0x014E81 (Channel 3 disarm context)');
console.log('======================================================================');
const teardown = disassembleUntilRet(0x014E81);
const traceTeardown = collectTrace(teardown);
const lastTeardown = teardown.at(-1);
console.log(`  Entry: ${hex(0x014E81)}`);
console.log(`  Decoded: ${lastTeardown ? lastTeardown.nextPc - 0x014E81 : 0} bytes, ${teardown.length} instructions`);
console.log('');
for (const inst of teardown) {
  console.log(`  ${hex(inst.pc)}  ${raw(inst.pc, inst.length).padEnd(18)}  ${formatInstruction(inst)}`);
}
console.log('');
console.log('  RAM references:');
for (const ref of traceTeardown.absoluteRamRefs) {
  console.log(`    ${ref.pc}  ${ref.type.padEnd(6)} ${ref.addr}  ${ref.label}  via ${ref.via}`);
}

// 5. Find callers of 0x0151A7
console.log('');
console.log('======================================================================');
console.log('Callers of 0x0151A7');
console.log('======================================================================');
const callers0151A7 = findCallers(0x0151A7);
console.log(`Found ${callers0151A7.length} callers:`);
for (const c of callers0151A7) {
  console.log(`  ${c.pc}  ${c.type}  context: ${c.contextBytes}`);
}

// 6. Cluster analysis — group D176C9 writes by containing function
console.log('');
console.log('======================================================================');
console.log('Cluster Analysis: D176C9 write sites by address range');
console.log('======================================================================');

const writeSites = refsC9.filter(r => r.type === 'write');
const readSites = refsC9.filter(r => r.type === 'read');

console.log(`  Total D176C9 writes: ${writeSites.length}`);
console.log(`  Total D176C9 reads:  ${readSites.length}`);
console.log(`  Total D176CA writes: ${refsCA.filter(r => r.type === 'write').length}`);
console.log(`  Total D176CA reads:  ${refsCA.filter(r => r.type === 'read').length}`);
console.log('');

// Group writes into clusters (addresses within 64 bytes of each other)
const clusters = [];
let currentCluster = null;
for (const site of writeSites) {
  const pc = parseInt(site.pc, 16);
  if (!currentCluster || pc - currentCluster.lastPc > 64) {
    currentCluster = { startPc: pc, lastPc: pc, sites: [site] };
    clusters.push(currentCluster);
  } else {
    currentCluster.lastPc = pc;
    currentCluster.sites.push(site);
  }
}

for (const cluster of clusters) {
  console.log(`  Cluster ${hex(cluster.startPc)}-${hex(cluster.lastPc)} (${cluster.sites.length} writes):`);
  for (const site of cluster.sites) {
    console.log(`    ${site.pc}  ${site.pattern}`);
  }
  console.log('');
}

// 7. Summary
console.log('======================================================================');
console.log('Summary');
console.log('======================================================================');
console.log(`D176C9 reference count: ${refsC9.length} (${writeSites.length} writes, ${readSites.length} reads)`);
console.log(`D176CA reference count: ${refsCA.length} (${refsCA.filter(r => r.type === 'write').length} writes, ${refsCA.filter(r => r.type === 'read').length} reads)`);
console.log(`Callers of 0x0151A7: ${callers0151A7.length}`);
console.log('');
console.log('Adjacent RAM context:');
console.log('  D176C0-D176CF region is part of a notification/protocol staging block.');
console.log('  The teardown at 0x014E81 treats D176C9/D176CA with the same');
console.log('  read-flag/clear-flag/set-partner pattern as Channels 1 and 2.');
console.log('');
console.log('Interpretation to follow in phase414-channel3-D176C9-report.md');
