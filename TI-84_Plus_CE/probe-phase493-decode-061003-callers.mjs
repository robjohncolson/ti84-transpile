import { readFileSync } from 'fs';
import { createCPU, createMemory } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const CALLER_SITES = [
  { address: 0x05ee3e, label: '0x05EE3E', kind: 'CALL' },
  { address: 0x060f51, label: '0x060F51', kind: 'CALL' },
  { address: 0x060fc3, label: '0x060FC3', kind: 'mid-function entry' },
  { address: 0x06104e, label: '0x06104E', kind: 'mid-function entry' },
  { address: 0x020e04, label: '0x020E04', kind: 'JP' },
];

const DYNAMIC_TARGETS = [0x05ee3e, 0x060f51];
const TEXT_SYSTEM_MIN = 0x060000;
const TEXT_SYSTEM_MAX = 0x062000;
const DISASSEMBLY_BYTES = 192;
const KNOWN_NOT_DRAW = new Set([0x061000, 0x061003, 0x06029d]);
const WATCH_ADDRS = new Map([
  [0xd00595, 'cursor row D00595'],
  [0xd00596, 'cursor col D00596'],
  [0xd02658, 'timer/counter D02658'],
  [0xd02505, 'timer/counter D02505'],
]);
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const RAM_SCAN_BASE = 0xd00000;
const RAM_SCAN_SIZE = 0x80000;
const RETURN_SENTINEL = 0x0ff000;

let projectDecoderExports = [];
try {
  const projectDecoder = await import('./ez80-decoder.js');
  projectDecoderExports = Object.keys(projectDecoder);
} catch (error) {
  projectDecoderExports = [`import failed: ${error.message}`];
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function fmtDisp(value) {
  const s = signed8(value);
  return s < 0 ? `-${hex(-s, 2)}` : `+${hex(s, 2)}`;
}

function readRom8(address) {
  return address >= 0 && address < rom.length ? rom[address] : 0;
}

function readRom24(address) {
  return readRom8(address) | (readRom8(address + 1) << 8) | (readRom8(address + 2) << 16);
}

function bytesAt(address, length) {
  const bytes = [];
  for (let i = 0; i < length; i += 1) bytes.push(hexByte(readRom8(address + i)));
  return bytes.join(' ');
}

function isCallOpcode(op) {
  return op === 0xcd || op === 0xc4 || op === 0xcc || op === 0xd4 || op === 0xdc ||
    op === 0xe4 || op === 0xec || op === 0xf4 || op === 0xfc;
}

function isJpOpcode(op) {
  return op === 0xc3 || op === 0xc2 || op === 0xca || op === 0xd2 || op === 0xda ||
    op === 0xe2 || op === 0xea || op === 0xf2 || op === 0xfa;
}

function conditionName(op) {
  return ({
    0xc0: 'nz', 0xc2: 'nz', 0xc4: 'nz',
    0xc8: 'z', 0xca: 'z', 0xcc: 'z',
    0xd0: 'nc', 0xd2: 'nc', 0xd4: 'nc',
    0xd8: 'c', 0xda: 'c', 0xdc: 'c',
    0xe0: 'po', 0xe2: 'po', 0xe4: 'po',
    0xe8: 'pe', 0xea: 'pe', 0xec: 'pe',
    0xf0: 'p', 0xf2: 'p', 0xf4: 'p',
    0xf8: 'm', 0xfa: 'm', 0xfc: 'm',
  })[op] ?? '';
}

function decodeCbOpcode(op, indexedReg = '(HL)') {
  const bit = (op >> 3) & 7;
  const regNames = ['B', 'C', 'D', 'E', 'H', 'L', indexedReg, 'A'];
  const reg = regNames[op & 7];
  if (op < 0x40) {
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return `${ops[(op >> 3) & 7]} ${reg}`;
  }
  if (op < 0x80) return `BIT ${bit},${reg}`;
  if (op < 0xc0) return `RES ${bit},${reg}`;
  return `SET ${bit},${reg}`;
}

function annotateAddress(address, notes) {
  const label = WATCH_ADDRS.get(address);
  if (label) notes.push(label);
  if (address >= TEXT_SYSTEM_MIN && address < TEXT_SYSTEM_MAX) {
    notes.push(KNOWN_NOT_DRAW.has(address) ? 'known text-system target' : 'text-system candidate target');
  }
}

function decodeIndexed(pc, prefix) {
  const index = prefix === 0xdd ? 'IX' : 'IY';
  const op = readRom8(pc + 1);
  const notes = [];
  if (op === 0xcb) {
    const displacement = readRom8(pc + 2);
    const cbOp = readRom8(pc + 3);
    const target = `(${index}${fmtDisp(displacement)})`;
    const text = decodeCbOpcode(cbOp, target);
    if (index === 'IY' && /^(BIT|SET|RES) /.test(text)) notes.push('IY flag bit op');
    return { len: 4, text, notes };
  }
  if (op === 0xe5) return { len: 2, text: `PUSH ${index}`, notes: index === 'IY' ? ['IY prologue/state save'] : [] };
  if (op === 0xe1) return { len: 2, text: `POP ${index}`, notes: [] };
  if (op === 0x21) return { len: 5, text: `LD ${index},${hex(readRom24(pc + 2))}`, notes: [] };
  if (op === 0x22) {
    const addr = readRom24(pc + 2);
    annotateAddress(addr, notes);
    return { len: 5, text: `LD (${hex(addr)}),${index}`, notes };
  }
  if (op === 0x2a) {
    const addr = readRom24(pc + 2);
    annotateAddress(addr, notes);
    return { len: 5, text: `LD ${index},(${hex(addr)})`, notes };
  }
  if (op === 0x36) return { len: 4, text: `LD (${index}${fmtDisp(readRom8(pc + 2))}),${hex(readRom8(pc + 3), 2)}`, notes: index === 'IY' ? ['IY indexed write'] : [] };
  if (op === 0x34) return { len: 3, text: `INC (${index}${fmtDisp(readRom8(pc + 2))})`, notes: index === 'IY' ? ['IY indexed write'] : [] };
  if (op === 0x35) return { len: 3, text: `DEC (${index}${fmtDisp(readRom8(pc + 2))})`, notes: index === 'IY' ? ['IY indexed write'] : [] };
  if ((op >= 0x40 && op <= 0x7f && op !== 0x76) || [0x86, 0x8e, 0x96, 0x9e, 0xa6, 0xae, 0xb6, 0xbe].includes(op)) {
    const offsetOps = new Set([0x46, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7e, 0x86, 0x8e, 0x96, 0x9e, 0xa6, 0xae, 0xb6, 0xbe]);
    if (offsetOps.has(op)) return { len: 3, text: `indexed ${index} opcode ${hex(op, 2)} (${index}${fmtDisp(readRom8(pc + 2))})`, notes: index === 'IY' ? ['IY indexed access'] : [] };
  }
  const base = decodeInstruction(pc + 1, { suppressPrefix: true });
  return { len: Math.max(2, base.len + 1), text: `${index} prefix ${base.text}`, notes: base.notes ?? [] };
}

function decodeEd(pc) {
  const op = readRom8(pc + 1);
  const notes = [];
  const absOps = new Map([
    [0x43, 'LD ({addr}),BC'],
    [0x4b, 'LD BC,({addr})'],
    [0x53, 'LD ({addr}),DE'],
    [0x5b, 'LD DE,({addr})'],
    [0x63, 'LD ({addr}),HL'],
    [0x6b, 'LD HL,({addr})'],
    [0x73, 'LD ({addr}),SP'],
    [0x7b, 'LD SP,({addr})'],
  ]);
  if (absOps.has(op)) {
    const addr = readRom24(pc + 2);
    annotateAddress(addr, notes);
    return { len: 5, text: absOps.get(op).replace('{addr}', hex(addr)), notes };
  }
  return { len: 2, text: `ED ${hex(op, 2)}`, notes };
}

function decodeInstruction(pc, options = {}) {
  const op = readRom8(pc);
  const notes = [];
  if (!options.suppressPrefix && (op === 0xdd || op === 0xfd)) return decodeIndexed(pc, op);
  if (!options.suppressPrefix && op === 0xed) return decodeEd(pc);
  if (op === 0xcb) return { len: 2, text: decodeCbOpcode(readRom8(pc + 1)), notes };
  if (isCallOpcode(op)) {
    const target = readRom24(pc + 1);
    annotateAddress(target, notes);
    const cc = op === 0xcd ? '' : `${conditionName(op)} `;
    return { len: 4, text: `CALL ${cc}${hex(target)}`, type: 'CALL', target, notes };
  }
  if (isJpOpcode(op)) {
    const target = readRom24(pc + 1);
    annotateAddress(target, notes);
    const cc = op === 0xc3 ? '' : `${conditionName(op)} `;
    return { len: 4, text: `JP ${cc}${hex(target)}`, type: 'JP', target, notes };
  }
  if (op === 0xe9) return { len: 1, text: 'JP (HL)', type: 'JP_INDIRECT', notes };
  if (op === 0x10) return { len: 2, text: `DJNZ ${hex((pc + 2 + signed8(readRom8(pc + 1))) & 0xffffff)}`, type: 'JR', target: (pc + 2 + signed8(readRom8(pc + 1))) & 0xffffff, notes };
  if (op === 0x18 || op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
    const target = (pc + 2 + signed8(readRom8(pc + 1))) & 0xffffff;
    const cc = op === 0x18 ? '' : `${conditionName(op + 0xa2)} `;
    return { len: 2, text: `JR ${cc}${hex(target)}`, type: 'JR', target, notes };
  }
  if (op === 0xc9) return { len: 1, text: 'RET', notes };
  if ([0xc0, 0xc8, 0xd0, 0xd8, 0xe0, 0xe8, 0xf0, 0xf8].includes(op)) return { len: 1, text: `RET ${conditionName(op)}`, notes };
  if ([0xc5, 0xd5, 0xe5, 0xf5].includes(op)) return { len: 1, text: `PUSH ${['BC', 'DE', 'HL', 'AF'][(op - 0xc5) >> 4]}`, notes: op === 0xf5 ? ['AF prologue/state save'] : [] };
  if ([0xc1, 0xd1, 0xe1, 0xf1].includes(op)) return { len: 1, text: `POP ${['BC', 'DE', 'HL', 'AF'][(op - 0xc1) >> 4]}`, notes };
  if ([0x01, 0x11, 0x21, 0x31].includes(op)) return { len: 4, text: `LD ${['BC', 'DE', 'HL', 'SP'][op >> 4]},${hex(readRom24(pc + 1))}`, notes };
  if ([0x22, 0x2a, 0x32, 0x3a].includes(op)) {
    const addr = readRom24(pc + 1);
    annotateAddress(addr, notes);
    const text = ({
      0x22: `LD (${hex(addr)}),HL`,
      0x2a: `LD HL,(${hex(addr)})`,
      0x32: `LD (${hex(addr)}),A`,
      0x3a: `LD A,(${hex(addr)})`,
    })[op];
    return { len: 4, text, notes };
  }
  if ([0x06, 0x0e, 0x16, 0x1e, 0x26, 0x2e, 0x36, 0x3e].includes(op)) {
    const reg = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][(op - 0x06) >> 3];
    return { len: 2, text: `LD ${reg},${hex(readRom8(pc + 1), 2)}`, notes };
  }
  if ([0xc6, 0xce, 0xd3, 0xd6, 0xdb, 0xde, 0xe6, 0xee, 0xf6, 0xfe].includes(op)) return { len: 2, text: `imm8 opcode ${hex(op, 2)} ${hex(readRom8(pc + 1), 2)}`, notes };
  if (op === 0x00) return { len: 1, text: 'NOP', notes };
  if (op === 0x76) return { len: 1, text: 'HALT', notes };
  return { len: 1, text: `DB ${hex(op, 2)}`, notes };
}

function pushPatternLength(address) {
  const b0 = readRom8(address);
  const b1 = readRom8(address + 1);
  if ([0xc5, 0xd5, 0xe5, 0xf5].includes(b0)) return 1;
  if ((b0 === 0xdd || b0 === 0xfd) && b1 === 0xe5) return 2;
  return 0;
}

function findLikelyEntry(site) {
  const start = Math.max(0, site - 0x80);
  let best = { address: Math.max(0, site - 0x20), score: -1000, pushes: 0 };
  for (let candidate = start; candidate < site; candidate += 1) {
    let cursor = candidate;
    let pushes = 0;
    let bytes = 0;
    let sawPreferred = false;
    for (let i = 0; i < 6; i += 1) {
      const len = pushPatternLength(cursor);
      if (!len) break;
      const first = readRom8(cursor);
      sawPreferred ||= first === 0xf5 || first === 0xdd || first === 0xfd;
      pushes += 1;
      bytes += len;
      cursor += len;
    }
    if (!pushes) continue;
    const prev = readRom8(candidate - 1);
    const delimiter = prev === 0xc9 || prev === 0xc3 || prev === 0xe9 || prev === 0x18;
    const score = pushes * 20 + (sawPreferred ? 8 : 0) + (delimiter ? 6 : 0) - ((site - candidate) / 16);
    if (score > best.score) best = { address: candidate, score, pushes, bytes };
  }
  return best;
}

function scanRawReferences(start, length) {
  const refs = [];
  for (let pc = start; pc < start + length - 2; pc += 1) {
    const value = readRom24(pc);
    if (WATCH_ADDRS.has(value)) refs.push({ pc, value, label: WATCH_ADDRS.get(value) });
  }
  return refs;
}

function scanRawTransfers(start, length) {
  const transfers = [];
  for (let pc = start; pc < start + length - 3; pc += 1) {
    const op = readRom8(pc);
    if (!isCallOpcode(op) && !isJpOpcode(op)) continue;
    const target = readRom24(pc + 1);
    if (target >= 0 && target < rom.length) {
      transfers.push({ pc, op, type: isCallOpcode(op) ? 'CALL?' : 'JP?', target });
    }
  }
  return transfers;
}

function disassembleFunction(site) {
  const entry = findLikelyEntry(site);
  const start = entry.address;
  const end = start + DISASSEMBLY_BYTES;
  const transfers = [];
  const watched = [];
  const iyFlags = [];
  console.log(`\n=== Caller ${hex(site)} (${CALLER_SITES.find((x) => x.address === site)?.kind ?? 'unknown'}) ===`);
  console.log(`likely entry: ${hex(start)} (push-score ${entry.score.toFixed(1)}, pushes ${entry.pushes}); exact listed address: ${hex(site)}`);
  for (let pc = start; pc < end;) {
    const decoded = decodeInstruction(pc);
    const marker = pc === site ? ' <== listed address' : '';
    const noteText = decoded.notes?.length ? ` ; ${decoded.notes.join(', ')}` : '';
    console.log(`${hex(pc)}  ${bytesAt(pc, decoded.len).padEnd(15)}  ${decoded.text}${noteText}${marker}`);
    if (decoded.type === 'CALL' || decoded.type === 'JP') transfers.push({ pc, type: decoded.type, target: decoded.target, aligned: true });
    for (const note of decoded.notes ?? []) {
      if (note.includes('D005') || note.includes('D026') || note.includes('D025')) watched.push({ pc, note });
      if (note.includes('IY')) iyFlags.push({ pc, note, text: decoded.text });
    }
    pc += Math.max(1, decoded.len);
  }
  const rawRefs = scanRawReferences(start, DISASSEMBLY_BYTES);
  const rawTransfers = scanRawTransfers(start, DISASSEMBLY_BYTES);
  console.log('\nAligned CALL/JP targets:');
  if (!transfers.length) console.log('  none found in aligned disassembly');
  for (const transfer of transfers) {
    const candidate = transfer.target >= TEXT_SYSTEM_MIN && transfer.target < TEXT_SYSTEM_MAX && !KNOWN_NOT_DRAW.has(transfer.target);
    console.log(`  ${hex(transfer.pc)} ${transfer.type} -> ${hex(transfer.target)}${candidate ? '  NEW_CURSOR_DRAW_CANDIDATE' : ''}`);
  }
  console.log('Raw CALL/JP opcode scan in same window:');
  if (!rawTransfers.length) console.log('  none');
  for (const transfer of rawTransfers) {
    const candidate = transfer.target >= TEXT_SYSTEM_MIN && transfer.target < TEXT_SYSTEM_MAX && !KNOWN_NOT_DRAW.has(transfer.target);
    console.log(`  ${hex(transfer.pc)} ${transfer.type} opcode ${hex(readRom8(transfer.pc), 2)} -> ${hex(transfer.target)}${candidate ? '  possible candidate' : ''}`);
  }
  console.log('IY flag/indexed operations:');
  if (!iyFlags.length) console.log('  none found');
  for (const item of iyFlags) console.log(`  ${hex(item.pc)} ${item.text} (${item.note})`);
  console.log('Cursor/timer references:');
  if (!watched.length && !rawRefs.length) console.log('  none found');
  for (const item of watched) console.log(`  ${hex(item.pc)} ${item.note}`);
  for (const ref of rawRefs) console.log(`  ${hex(ref.pc)} raw ${hex(ref.value)} (${ref.label})`);
  return { site, start, transfers, rawTransfers };
}

function makeMemory() {
  const mem = createMemory();
  if (typeof mem.set === 'function') mem.set(rom, 0);
  else {
    for (let i = 0; i < rom.length; i += 1) writeMem8(mem, i, rom[i]);
  }
  return mem;
}

function readMem8(mem, address) {
  const a = address & 0xffffff;
  if (typeof mem.read8 === 'function') return mem.read8(a) & 0xff;
  if (typeof mem.peek8 === 'function') return mem.peek8(a) & 0xff;
  if (typeof mem.get === 'function') return mem.get(a) & 0xff;
  return mem[a] & 0xff;
}

function writeMem8(mem, address, value) {
  const a = address & 0xffffff;
  const v = value & 0xff;
  if (typeof mem.write8 === 'function') mem.write8(a, v);
  else if (typeof mem.poke8 === 'function') mem.poke8(a, v);
  else if (typeof mem.set === 'function' && typeof mem.length !== 'number') mem.set(a, v);
  else mem[a] = v;
}

function writeMem24(mem, address, value) {
  writeMem8(mem, address, value);
  writeMem8(mem, address + 1, value >> 8);
  writeMem8(mem, address + 2, value >> 16);
}

function getStateContainer(cpu) {
  return cpu.registers ?? cpu.regs ?? cpu.state ?? cpu;
}

function getRegister(cpu, names) {
  const containers = [cpu, cpu.registers, cpu.regs, cpu.state].filter(Boolean);
  for (const container of containers) {
    for (const name of names) {
      if (typeof container[name] === 'number') return container[name] & 0xffffff;
    }
  }
  return undefined;
}

function setRegister(cpu, names, value) {
  const containers = [cpu, cpu.registers, cpu.regs, cpu.state].filter(Boolean);
  let wrote = false;
  for (const container of containers) {
    for (const name of names) {
      if (typeof container[name] === 'number') {
        container[name] = value & 0xffffff;
        wrote = true;
      }
    }
  }
  if (!wrote) {
    const state = getStateContainer(cpu);
    state[names[0]] = value & 0xffffff;
  }
}

function getPC(cpu) {
  return getRegister(cpu, ['pc', 'PC', 'programCounter']);
}

function setPC(cpu, value) {
  setRegister(cpu, ['pc', 'PC', 'programCounter'], value);
}

function getSP(cpu) {
  return getRegister(cpu, ['sp', 'SP', 'stackPointer']);
}

function setSP(cpu, value) {
  setRegister(cpu, ['sp', 'SP', 'stackPointer'], value);
}

function stepCPU(cpu) {
  if (typeof cpu.step === 'function') return cpu.step();
  if (typeof cpu.executeInstruction === 'function') return cpu.executeInstruction();
  if (typeof cpu.execute === 'function') return cpu.execute(1);
  if (typeof cpu.tick === 'function') return cpu.tick();
  if (typeof cpu.run === 'function') return cpu.run(1);
  throw new Error('No supported CPU step method found');
}

function runSteps(cpu, count) {
  for (let i = 0; i < count; i += 1) stepCPU(cpu);
}

function bootRuntime() {
  const mem = makeMemory();
  const bus = createPeripheralBus({ timerInterrupt: false });
  const cpu = createCPU(mem, bus);
  setPC(cpu, 0x000000);
  runSteps(cpu, 12000);
  setPC(cpu, 0x0002b0);
  runSteps(cpu, 5000);
  setPC(cpu, 0x020000);
  runSteps(cpu, 35000);
  return { cpu, mem, bus };
}

function snapshotRange(mem, base, size) {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i += 1) out[i] = readMem8(mem, base + i);
  return out;
}

function fillRange(mem, base, size, value) {
  for (let i = 0; i < size; i += 1) writeMem8(mem, base + i, value);
}

function diffRange(before, mem, base, size, maxItems = 32) {
  const samples = [];
  let changed = 0;
  let nonWhite = 0;
  for (let i = 0; i < size; i += 1) {
    const after = readMem8(mem, base + i);
    if (after === before[i]) continue;
    changed += 1;
    if (after !== 0xff) nonWhite += 1;
    if (samples.length < maxItems) samples.push({ address: base + i, before: before[i], after });
  }
  return { changed, nonWhite, samples };
}

function traceTransferAt(mem, pc) {
  const op = readMem8(mem, pc);
  if (!isCallOpcode(op) && !isJpOpcode(op)) return null;
  const target = readMem8(mem, pc + 1) | (readMem8(mem, pc + 2) << 8) | (readMem8(mem, pc + 3) << 16);
  return { pc, type: isCallOpcode(op) ? 'CALL' : 'JP', target };
}

function runDynamicTarget(target) {
  console.log(`\n=== Dynamic target ${hex(target)} ===`);
  try {
    const { cpu, mem } = bootRuntime();
    writeMem8(mem, 0xd00595, 5);
    writeMem8(mem, 0xd00596, 13);
    fillRange(mem, VRAM_BASE, VRAM_SIZE, 0xff);
    const beforeRam = snapshotRange(mem, RAM_SCAN_BASE, RAM_SCAN_SIZE);
    const beforeVram = snapshotRange(mem, VRAM_BASE, VRAM_SIZE);
    const currentSP = getSP(cpu) ?? 0xd1ff00;
    const callSP = (currentSP - 3) & 0xffffff;
    writeMem24(mem, callSP, RETURN_SENTINEL);
    setSP(cpu, callSP);
    setPC(cpu, target);
    const transfers = [];
    let steps = 0;
    for (; steps < 8000; steps += 1) {
      const pc = getPC(cpu);
      if (pc === RETURN_SENTINEL) break;
      if (typeof pc === 'number') {
        const transfer = traceTransferAt(mem, pc);
        if (transfer) transfers.push(transfer);
      }
      stepCPU(cpu);
    }
    const vramDiff = diffRange(beforeVram, mem, VRAM_BASE, VRAM_SIZE);
    const ramDiff = diffRange(beforeRam, mem, RAM_SCAN_BASE, RAM_SCAN_SIZE);
    console.log(`steps: ${steps}${getPC(cpu) === RETURN_SENTINEL ? ' (returned)' : ' (max/left target)'}`);
    console.log('called/jumped addresses observed:');
    if (!transfers.length) console.log('  none observed');
    for (const transfer of transfers.slice(0, 80)) {
      const candidate = transfer.target >= TEXT_SYSTEM_MIN && transfer.target < TEXT_SYSTEM_MAX && !KNOWN_NOT_DRAW.has(transfer.target);
      console.log(`  ${hex(transfer.pc)} ${transfer.type} -> ${hex(transfer.target)}${candidate ? '  dynamic candidate' : ''}`);
    }
    if (transfers.length > 80) console.log(`  ... ${transfers.length - 80} more`);
    console.log(`VRAM ${hex(VRAM_BASE)}..${hex(VRAM_BASE + VRAM_SIZE - 1)} changed bytes: ${vramDiff.changed}, non-0xFF writes: ${vramDiff.nonWhite}`);
    for (const sample of vramDiff.samples) {
      console.log(`  VRAM ${hex(sample.address)} ${hex(sample.before, 2)} -> ${hex(sample.after, 2)}`);
    }
    console.log(`RAM scan ${hex(RAM_SCAN_BASE)}..${hex(RAM_SCAN_BASE + RAM_SCAN_SIZE - 1)} changed bytes: ${ramDiff.changed}, non-0xFF writes: ${ramDiff.nonWhite}`);
    for (const sample of ramDiff.samples) {
      console.log(`  RAM ${hex(sample.address)} ${hex(sample.before, 2)} -> ${hex(sample.after, 2)}`);
    }
    return { target, transfers, vramDiff, ramDiff };
  } catch (error) {
    console.log(`dynamic test skipped/failed for ${hex(target)}: ${error.stack ?? error.message}`);
    return { target, error: error.message };
  }
}

console.log('Probe phase493: decode callers of 0x061003 cursor erase');
console.log(`ROM bytes: ${rom.length}`);
console.log(`Project decoder exports detected: ${projectDecoderExports.length ? projectDecoderExports.join(', ') : '(none)'}`);
console.log('Static decode uses local ADL-mode transfer/reference decoder so CALL/JP targets are always emitted.');

const staticResults = CALLER_SITES.map((site) => disassembleFunction(site.address));
const candidateSources = new Map();
const rawCandidateSources = new Map();
for (const result of staticResults) {
  for (const transfer of result.transfers) {
    if (transfer.target >= TEXT_SYSTEM_MIN && transfer.target < TEXT_SYSTEM_MAX && !KNOWN_NOT_DRAW.has(transfer.target)) {
      const list = candidateSources.get(transfer.target) ?? [];
      list.push(`${hex(result.site)} via ${hex(transfer.pc)} ${transfer.type}`);
      candidateSources.set(transfer.target, list);
    }
  }
  for (const transfer of result.rawTransfers) {
    if (transfer.target >= TEXT_SYSTEM_MIN && transfer.target < TEXT_SYSTEM_MAX && !KNOWN_NOT_DRAW.has(transfer.target)) {
      const list = rawCandidateSources.get(transfer.target) ?? [];
      list.push(`${hex(result.site)} raw ${hex(transfer.pc)} ${transfer.type}`);
      rawCandidateSources.set(transfer.target, list);
    }
  }
}

console.log('\n=== Cross-reference candidate summary ===');
if (!candidateSources.size) console.log('No aligned new cursor draw candidates found in 0x060000-0x062000.');
for (const [target, sources] of [...candidateSources.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`${hex(target)} NEW_CURSOR_DRAW_CANDIDATE`);
  for (const source of sources) console.log(`  ${source}`);
}
console.log('Raw-scan text-system candidates (lower confidence):');
if (!rawCandidateSources.size) console.log('  none');
for (const [target, sources] of [...rawCandidateSources.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  ${hex(target)}`);
  for (const source of sources) console.log(`    ${source}`);
}

const dynamicResults = DYNAMIC_TARGETS.map((target) => runDynamicTarget(target));
console.log('\n=== Dynamic candidate summary ===');
const dynamicCandidateSources = new Map();
for (const result of dynamicResults) {
  for (const transfer of result.transfers ?? []) {
    if (transfer.target >= TEXT_SYSTEM_MIN && transfer.target < TEXT_SYSTEM_MAX && !KNOWN_NOT_DRAW.has(transfer.target)) {
      const list = dynamicCandidateSources.get(transfer.target) ?? [];
      list.push(`${hex(result.target)} observed at ${hex(transfer.pc)} ${transfer.type}`);
      dynamicCandidateSources.set(transfer.target, list);
    }
  }
}
if (!dynamicCandidateSources.size) console.log('No dynamic new cursor draw candidates observed.');
for (const [target, sources] of [...dynamicCandidateSources.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`${hex(target)} DYNAMIC_CURSOR_DRAW_CANDIDATE`);
  for (const source of sources) console.log(`  ${source}`);
}

