import fs from 'node:fs';
import { createCPU } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const START = 0x05E400;
const END = 0x05E55F;
const CANDIDATE = 0x05E400;
const RENDERER = 0x0A23C0;
const RENDERER_ALT = 0x0A239E;

const ROW_VAR = 0xD00595;
const COL_VAR = 0xD00596;
const CURSOR_FLAGS = 0xD00092;
const COL_SCRATCH = 0xD0059C;
const LCD_WINDOW_1 = 0xD008D2;
const LCD_WINDOW_2 = 0xD008D5;

const LCD_BUFFER = {
  name: 'LCD VRAM candidate D40000',
  start: 0xD40000,
  length: 320 * 240 * 2,
  width: 320,
  bytesPerPixel: 2,
};

const WATCHED = new Map([
  [ROW_VAR, 'D00595 text row'],
  [COL_VAR, 'D00596 text column'],
  [CURSOR_FLAGS, 'D00092 cursor flags'],
  [COL_SCRATCH, 'D0059C column scratch'],
  [LCD_WINDOW_1, 'D008D2 LCD window register'],
  [LCD_WINDOW_2, 'D008D5 LCD window register'],
  [RENDERER, '0A23C0 pixel renderer'],
  [RENDERER_ALT, '0A239E render helper'],
]);

const rom = fs.readFileSync(new URL('./ROM.rom', import.meta.url));

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexBare(value, width = 2) {
  return (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function rom8(address) {
  const offset = address >>> 0;
  if (offset >= rom.length) {
    throw new Error(`ROM read out of range at ${hex(address, 6)}`);
  }
  return rom[offset];
}

function romLe(address, bytes) {
  let value = 0;
  for (let i = 0; i < bytes; i += 1) {
    value |= rom8(address + i) << (8 * i);
  }
  return value >>> 0;
}

function instructionBytes(address, length) {
  const bytes = [];
  for (let i = 0; i < length; i += 1) {
    bytes.push(rom8(address + i));
  }
  return bytes;
}

function formatBytes(bytes) {
  return bytes.map((byte) => hexBare(byte)).join(' ');
}

const r = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
const rp = ['bc', 'de', 'hl', 'sp'];
const rp2 = ['bc', 'de', 'hl', 'af'];
const cc = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'];
const alu = ['add a', 'adc a', 'sub', 'sbc a', 'and', 'xor', 'or', 'cp'];
const rot = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];
const misc = ['rlca', 'rrca', 'rla', 'rra', 'daa', 'cpl', 'scf', 'ccf'];

function rel(address, displacement) {
  return (address + 2 + signed8(displacement)) & 0xFFFFFF;
}

function decodeBase(address) {
  const op = rom8(address);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xCB) return decodeCB(address);
  if (op === 0xED) return decodeED(address);
  if (op === 0xDD) return decodeIndex(address, 'ix');
  if (op === 0xFD) return decodeIndex(address, 'iy');

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return decoded(1, 'nop');
      if (y === 1) return decoded(1, "ex af,af'");
      if (y === 2) return decoded(2, `djnz ${hex(rel(address, rom8(address + 1)), 6)}`);
      if (y === 3) return decoded(2, `jr ${hex(rel(address, rom8(address + 1)), 6)}`);
      return decoded(2, `jr ${cc[y - 4]},${hex(rel(address, rom8(address + 1)), 6)}`);
    }
    if (z === 1) {
      if (q === 0) return decoded(4, `ld ${rp[p]},${hex(romLe(address + 1, 3), 6)}`);
      return decoded(1, `add hl,${rp[p]}`);
    }
    if (z === 2) {
      if (q === 0) {
        if (p === 0) return decoded(1, 'ld (bc),a');
        if (p === 1) return decoded(1, 'ld (de),a');
        if (p === 2) return decoded(4, `ld (${hex(romLe(address + 1, 3), 6)}),hl`);
        return decoded(4, `ld (${hex(romLe(address + 1, 3), 6)}),a`);
      }
      if (p === 0) return decoded(1, 'ld a,(bc)');
      if (p === 1) return decoded(1, 'ld a,(de)');
      if (p === 2) return decoded(4, `ld hl,(${hex(romLe(address + 1, 3), 6)})`);
      return decoded(4, `ld a,(${hex(romLe(address + 1, 3), 6)})`);
    }
    if (z === 3) return decoded(1, `${q === 0 ? 'inc' : 'dec'} ${rp[p]}`);
    if (z === 4) return decoded(1, `inc ${r[y]}`);
    if (z === 5) return decoded(1, `dec ${r[y]}`);
    if (z === 6) return decoded(2, `ld ${r[y]},${hex(rom8(address + 1), 2)}`);
    return decoded(1, misc[y]);
  }

  if (x === 1) {
    if (op === 0x76) return decoded(1, 'halt');
    return decoded(1, `ld ${r[y]},${r[z]}`);
  }

  if (x === 2) {
    return decoded(1, `${alu[y]} ${r[z]}`);
  }

  if (z === 0) return decoded(1, `ret ${cc[y]}`);
  if (z === 1) {
    if (q === 0) return decoded(1, `pop ${rp2[p]}`);
    if (p === 0) return decoded(1, 'ret');
    if (p === 1) return decoded(1, 'exx');
    if (p === 2) return decoded(1, 'jp (hl)');
    return decoded(1, 'ld sp,hl');
  }
  if (z === 2) return decoded(4, `jp ${cc[y]},${hex(romLe(address + 1, 3), 6)}`);
  if (z === 3) {
    if (y === 0) return decoded(4, `jp ${hex(romLe(address + 1, 3), 6)}`);
    if (y === 1) return decodeCB(address);
    if (y === 2) return decoded(2, `out (${hex(rom8(address + 1), 2)}),a`);
    if (y === 3) return decoded(2, `in a,(${hex(rom8(address + 1), 2)})`);
    if (y === 4) return decoded(1, 'ex (sp),hl');
    if (y === 5) return decoded(1, 'ex de,hl');
    if (y === 6) return decoded(1, 'di');
    return decoded(1, 'ei');
  }
  if (z === 4) return decoded(4, `call ${cc[y]},${hex(romLe(address + 1, 3), 6)}`);
  if (z === 5) {
    if (q === 0) return decoded(1, `push ${rp2[p]}`);
    if (p === 0) return decoded(4, `call ${hex(romLe(address + 1, 3), 6)}`);
    if (p === 1) return decodeIndex(address, 'ix');
    if (p === 2) return decodeED(address);
    return decodeIndex(address, 'iy');
  }
  if (z === 6) return decoded(2, `${alu[y]} ${hex(rom8(address + 1), 2)}`);
  return decoded(1, `rst ${hex(y * 8, 2)}`);
}

function decoded(length, mnemonic) {
  return { length, mnemonic };
}

function decodeCB(address) {
  const op = rom8(address + 1);
  return decoded(2, decodeCBOp(op, r));
}

function decodeCBOp(op, registers) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) return `${rot[y]} ${registers[z]}`;
  if (x === 1) return `bit ${y},${registers[z]}`;
  if (x === 2) return `res ${y},${registers[z]}`;
  return `set ${y},${registers[z]}`;
}

function decodeED(address) {
  const op = rom8(address + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (x === 1) {
    if (z === 0) return decoded(2, y === 6 ? 'in (c)' : `in ${r[y]},(c)`);
    if (z === 1) return decoded(2, y === 6 ? 'out (c),0' : `out (c),${r[y]}`);
    if (z === 2) return decoded(2, `${q === 0 ? 'sbc' : 'adc'} hl,${rp[p]}`);
    if (z === 3) {
      const target = hex(romLe(address + 2, 3), 6);
      if (q === 0) return decoded(5, `ld (${target}),${rp[p]}`);
      return decoded(5, `ld ${rp[p]},(${target})`);
    }
    if (z === 4) return decoded(2, 'neg');
    if (z === 5) return decoded(2, y === 1 ? 'reti' : 'retn');
    if (z === 6) return decoded(2, `im ${[0, 0, 1, 2, 0, 0, 1, 2][y]}`);
    const names = ['ld i,a', 'ld r,a', 'ld a,i', 'ld a,r', 'rrd', 'rld', 'nop', 'nop'];
    return decoded(2, names[y]);
  }

  const block = {
    0xA0: 'ldi',
    0xA1: 'cpi',
    0xA2: 'ini',
    0xA3: 'outi',
    0xA8: 'ldd',
    0xA9: 'cpd',
    0xAA: 'ind',
    0xAB: 'outd',
    0xB0: 'ldir',
    0xB1: 'cpir',
    0xB2: 'inir',
    0xB3: 'otir',
    0xB8: 'lddr',
    0xB9: 'cpdr',
    0xBA: 'indr',
    0xBB: 'otdr',
  };
  if (block[op]) return decoded(2, block[op]);

  return decoded(2, `db ED,${hex(op, 2)}`);
}

function decodeIndex(address, index) {
  const op = rom8(address + 1);
  const high = index === 'ix' ? 'ixh' : 'iyh';
  const low = index === 'ix' ? 'ixl' : 'iyl';
  const idxRegs = ['b', 'c', 'd', 'e', high, low, `(${index}+d)`, 'a'];

  if (op === 0xCB) {
    const displacement = signed8(rom8(address + 2));
    const cbOp = rom8(address + 3);
    const operand = `(${index}${displacement < 0 ? '-' : '+'}${hex(Math.abs(displacement), 2)})`;
    const registers = ['b', 'c', 'd', 'e', 'h', 'l', operand, 'a'];
    return decoded(4, decodeCBOp(cbOp, registers));
  }

  if (op === 0x21) return decoded(5, `ld ${index},${hex(romLe(address + 2, 3), 6)}`);
  if (op === 0x22) return decoded(5, `ld (${hex(romLe(address + 2, 3), 6)}),${index}`);
  if (op === 0x2A) return decoded(5, `ld ${index},(${hex(romLe(address + 2, 3), 6)})`);
  if (op === 0x23) return decoded(2, `inc ${index}`);
  if (op === 0x2B) return decoded(2, `dec ${index}`);
  if (op === 0x34) return decoded(3, `inc (${index}${fmtDisp(rom8(address + 2))})`);
  if (op === 0x35) return decoded(3, `dec (${index}${fmtDisp(rom8(address + 2))})`);
  if (op === 0x36) return decoded(4, `ld (${index}${fmtDisp(rom8(address + 2))}),${hex(rom8(address + 3), 2)}`);
  if (op === 0x39) return decoded(2, `add ${index},sp`);
  if (op === 0xE1) return decoded(2, `pop ${index}`);
  if (op === 0xE3) return decoded(2, `ex (sp),${index}`);
  if (op === 0xE5) return decoded(2, `push ${index}`);
  if (op === 0xE9) return decoded(2, `jp (${index})`);
  if (op === 0xF9) return decoded(2, `ld sp,${index}`);

  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 1 && op !== 0x76) {
    if (y === 6) return decoded(3, `ld (${index}${fmtDisp(rom8(address + 2))}),${idxRegs[z]}`);
    if (z === 6) return decoded(3, `ld ${idxRegs[y]},(${index}${fmtDisp(rom8(address + 2))})`);
    return decoded(2, `ld ${idxRegs[y]},${idxRegs[z]}`);
  }
  if (x === 2 && z === 6) return decoded(3, `${alu[y]} (${index}${fmtDisp(rom8(address + 2))})`);
  if (op === 0x24) return decoded(2, `inc ${high}`);
  if (op === 0x25) return decoded(2, `dec ${high}`);
  if (op === 0x26) return decoded(3, `ld ${high},${hex(rom8(address + 2), 2)}`);
  if (op === 0x2C) return decoded(2, `inc ${low}`);
  if (op === 0x2D) return decoded(2, `dec ${low}`);
  if (op === 0x2E) return decoded(3, `ld ${low},${hex(rom8(address + 2), 2)}`);

  const inner = decodeBase(address + 1);
  return decoded(inner.length + 1, inner.mnemonic.replace(/\bhl\b/g, index).replace(/\(hl\)/g, `(${index})`));
}

function fmtDisp(byte) {
  const value = signed8(byte);
  return `${value < 0 ? '-' : '+'}${hex(Math.abs(value), 2)}`;
}

function refsFor(address, bytes, mnemonic) {
  const refs = [];
  for (let offset = 1; offset <= bytes.length - 3; offset += 1) {
    const value = bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
    if (WATCHED.has(value)) {
      refs.push(`${WATCHED.get(value)} via immediate +${offset}`);
    }
  }
  if (mnemonic.includes(hex(RENDERER, 6))) refs.push('calls/branches to 0A23C0 renderer');
  if (mnemonic.includes(hex(RENDERER_ALT, 6))) refs.push('calls/branches to 0A239E render helper');
  if (address === RENDERER) refs.push('renderer entry');
  return refs;
}

function disassemble() {
  console.log('=== Static disassembly 0x05E400-0x05E55F ===');
  const findings = [];
  let address = START;
  while (address <= END) {
    let item;
    try {
      item = decodeBase(address);
    } catch (error) {
      item = decoded(1, `db ${hex(rom8(address), 2)} ; decode error: ${error.message}`);
    }
    const length = Math.max(1, Math.min(item.length, END - address + 1));
    const bytes = instructionBytes(address, length);
    const refs = refsFor(address, bytes, item.mnemonic);
    const suffix = refs.length ? ` ; ${refs.join('; ')}` : '';
    console.log(`${hex(address, 6)}  ${formatBytes(bytes).padEnd(14)}  ${item.mnemonic}${suffix}`);
    for (const ref of refs) {
      findings.push({ address, mnemonic: item.mnemonic, ref });
    }
    address += length;
  }

  console.log('\n=== Static watch summary ===');
  if (findings.length === 0) {
    console.log('No watched immediates found by this decoder.');
  } else {
    for (const finding of findings) {
      console.log(`${hex(finding.address, 6)} ${finding.ref}: ${finding.mnemonic}`);
    }
  }
}

function makePeripherals() {
  const attempts = [
    () => createPeripheralBus({ timerInterrupt: false }),
    () => createPeripheralBus(undefined, { timerInterrupt: false }),
    () => createPeripheralBus(),
  ];
  return firstSuccessful('createPeripheralBus', attempts);
}

function makeCPU(peripherals) {
  const attempts = [
    () => createCPU({ rom, romBytes: rom, peripherals, peripheralBus: peripherals }),
    () => createCPU(rom, peripherals),
    () => createCPU(rom, { peripherals, peripheralBus: peripherals }),
    () => createCPU({ rom, romBytes: rom }, peripherals),
    () => createCPU({ peripherals, peripheralBus: peripherals }),
    () => createCPU(),
  ];
  return firstSuccessful('createCPU', attempts);
}

function firstSuccessful(label, attempts) {
  const errors = [];
  for (const attempt of attempts) {
    try {
      const value = attempt();
      if (value) return value;
      errors.push('returned empty value');
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(`${label} failed: ${errors.join(' | ')}`);
}

function candidates(cpu, peripherals) {
  return [
    cpu,
    cpu?.state,
    cpu?.registers,
    cpu?.regs,
    cpu?.memory,
    cpu?.bus,
    cpu?.mmu,
    peripherals,
    peripherals?.memory,
    peripherals?.bus,
  ].filter(Boolean);
}

function invokeMethod(objects, names, args) {
  for (const object of objects) {
    for (const name of names) {
      if (typeof object[name] === 'function') {
        return object[name](...args);
      }
    }
  }
  return undefined;
}

function read8(cpu, peripherals, address) {
  const value = invokeMethod(candidates(cpu, peripherals), ['read8', 'readByte', 'readMemory', 'peek8', 'peek'], [address >>> 0]);
  if (value !== undefined) return value & 0xFF;
  throw new Error('No read8-compatible CPU API found');
}

function write8(cpu, peripherals, address, value) {
  const written = invokeMethod(candidates(cpu, peripherals), ['write8', 'writeByte', 'writeMemory', 'poke8', 'poke'], [address >>> 0, value & 0xFF]);
  if (written !== undefined) return;
  throw new Error('No write8-compatible CPU API found');
}

function write24(cpu, peripherals, address, value) {
  const direct = invokeMethod(candidates(cpu, peripherals), ['write24', 'writeUint24'], [address >>> 0, value & 0xFFFFFF]);
  if (direct !== undefined) return;
  write8(cpu, peripherals, address, value);
  write8(cpu, peripherals, address + 1, value >> 8);
  write8(cpu, peripherals, address + 2, value >> 16);
}

function stepCPU(cpu) {
  const stepped = invokeMethod([cpu, cpu?.state].filter(Boolean), ['step', 'executeInstruction', 'tick'], []);
  if (stepped !== undefined) return;
  throw new Error('No step-compatible CPU API found');
}

function getRegister(cpu, logicalName) {
  const methodMap = {
    pc: ['getPC', 'getPc', 'getProgramCounter'],
    sp: ['getSP', 'getSp', 'getStackPointer'],
  };
  const propMap = {
    pc: ['pc', 'PC', 'programCounter', 'ProgramCounter'],
    sp: ['sp', 'SP', 'stackPointer', 'StackPointer'],
    a: ['a', 'A'],
    f: ['f', 'F'],
    b: ['b', 'B'],
    c: ['c', 'C'],
    d: ['d', 'D'],
    e: ['e', 'E'],
    h: ['h', 'H'],
    l: ['l', 'L'],
    bc: ['bc', 'BC'],
    de: ['de', 'DE'],
    hl: ['hl', 'HL'],
    ix: ['ix', 'IX'],
    iy: ['iy', 'IY'],
  };

  for (const name of methodMap[logicalName] ?? []) {
    if (typeof cpu[name] === 'function') return cpu[name]() >>> 0;
  }
  for (const object of [cpu, cpu?.state, cpu?.registers, cpu?.regs].filter(Boolean)) {
    for (const name of propMap[logicalName] ?? []) {
      if (typeof object[name] === 'number') return object[name] >>> 0;
    }
  }
  return undefined;
}

function setRegister(cpu, logicalName, value) {
  const methodMap = {
    pc: ['setPC', 'setPc', 'setProgramCounter'],
    sp: ['setSP', 'setSp', 'setStackPointer'],
  };
  const propMap = {
    pc: ['pc', 'PC', 'programCounter', 'ProgramCounter'],
    sp: ['sp', 'SP', 'stackPointer', 'StackPointer'],
  };

  for (const name of methodMap[logicalName] ?? []) {
    if (typeof cpu[name] === 'function') {
      cpu[name](value >>> 0);
      return;
    }
  }
  for (const object of [cpu, cpu?.state, cpu?.registers, cpu?.regs].filter(Boolean)) {
    for (const name of propMap[logicalName] ?? []) {
      if (typeof object[name] === 'number') {
        object[name] = value >>> 0;
        return;
      }
    }
  }
  throw new Error(`No setter found for register ${logicalName}`);
}

function bootToIdle(cpu) {
  const idleAddresses = new Set([0x03030E, 0x030310, 0x030312, 0x030314]);
  let idleHits = 0;
  let steps = 0;
  let lastPC;
  for (; steps < 80000; steps += 1) {
    const pc = getRegister(cpu, 'pc');
    if (pc !== undefined) {
      lastPC = pc & 0xFFFFFF;
      if (idleAddresses.has(lastPC)) idleHits += 1;
      if (steps > 1000 && idleHits >= 6) break;
    }
    stepCPU(cpu);
  }
  return { steps, lastPC, idleHits };
}

function snapshotRange(cpu, peripherals, range) {
  const bytes = new Uint8Array(range.length);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = read8(cpu, peripherals, range.start + i);
  }
  return bytes;
}

function diffRange(before, after, range) {
  const changes = [];
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) {
      const address = range.start + i;
      changes.push({ address, before: before[i], after: after[i], coord: coordFor(range, address) });
    }
  }
  return changes;
}

function coordFor(range, address) {
  const offset = address - range.start;
  const pixel = Math.floor(offset / range.bytesPerPixel);
  return {
    x: pixel % range.width,
    y: Math.floor(pixel / range.width),
    byteInPixel: offset % range.bytesPerPixel,
  };
}

function installWriteRecorder(cpu, peripherals) {
  const log = [];
  const seen = new Set();
  const methodNames = ['write8', 'write16', 'write24', 'writeByte', 'writeMemory', 'poke8', 'poke'];
  for (const [label, object] of candidates(cpu, peripherals).map((object, index) => [`object${index}`, object])) {
    if (!object || seen.has(object)) continue;
    seen.add(object);
    for (const name of methodNames) {
      if (typeof object[name] !== 'function') continue;
      const original = object[name];
      object[name] = function wrappedWrite(...args) {
        const address = Number(args[0]);
        const value = Number(args[1]);
        if (Number.isFinite(address)) {
          log.push({
            label,
            method: name,
            address: address & 0xFFFFFF,
            value: Number.isFinite(value) ? value >>> 0 : undefined,
          });
        }
        return original.apply(this, args);
      };
    }
  }
  return log;
}

function registerSnapshot(cpu) {
  const names = ['pc', 'sp', 'a', 'f', 'b', 'c', 'd', 'e', 'h', 'l', 'bc', 'de', 'hl', 'ix', 'iy'];
  const result = {};
  for (const name of names) {
    const value = getRegister(cpu, name);
    if (value !== undefined) result[name.toUpperCase()] = hex(value, name.length === 1 ? 2 : 6);
  }
  return result;
}

function executeCandidate(cpu, peripherals) {
  const sentinel = 0x0FCAFE;
  const sp = getRegister(cpu, 'sp') ?? 0xD1FF00;
  write24(cpu, peripherals, sp, sentinel);
  setRegister(cpu, 'pc', CANDIDATE);

  const renderCalls = [];
  let steps = 0;
  let terminated = false;
  let finalPC;
  for (; steps < 60000; steps += 1) {
    const pc = getRegister(cpu, 'pc');
    if (pc !== undefined) {
      finalPC = pc & 0xFFFFFF;
      if (finalPC === sentinel) {
        terminated = true;
        break;
      }
      if (finalPC === RENDERER || finalPC === RENDERER_ALT) {
        renderCalls.push({ step: steps, target: finalPC, registers: registerSnapshot(cpu) });
      }
    }
    stepCPU(cpu);
  }

  return { steps, terminated, finalPC, renderCalls };
}

function summarizeChanges(changes) {
  if (changes.length === 0) {
    return { count: 0, sample: [], box: undefined };
  }
  let minAddress = Infinity;
  let maxAddress = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const change of changes) {
    minAddress = Math.min(minAddress, change.address);
    maxAddress = Math.max(maxAddress, change.address);
    minX = Math.min(minX, change.coord.x);
    maxX = Math.max(maxX, change.coord.x);
    minY = Math.min(minY, change.coord.y);
    maxY = Math.max(maxY, change.coord.y);
  }
  return {
    count: changes.length,
    box: { minAddress, maxAddress, minX, maxX, minY, maxY },
    sample: changes.slice(0, 12),
  };
}

function summarizeWrites(writes, range) {
  const filtered = writes.filter((write) => write.address >= range.start && write.address < range.start + range.length);
  return {
    count: filtered.length,
    sample: filtered.slice(0, 12).map((write) => ({ ...write, coord: coordFor(range, write.address) })),
  };
}

function printSummary(label, result) {
  console.log(`\n--- ${label}: row=${result.row} col=${result.col} ---`);
  console.log(`boot: ${result.boot.steps} steps, idleHits=${result.boot.idleHits}, lastPC=${result.boot.lastPC === undefined ? 'unknown' : hex(result.boot.lastPC, 6)}`);
  console.log(`direct call: ${result.call.steps} steps, returned=${result.call.terminated}, finalPC=${result.call.finalPC === undefined ? 'unknown' : hex(result.call.finalPC, 6)}`);
  console.log(`renderer entries observed: ${result.call.renderCalls.length}`);
  for (const renderCall of result.call.renderCalls.slice(0, 8)) {
    console.log(`  step ${renderCall.step}: ${hex(renderCall.target, 6)} regs=${JSON.stringify(renderCall.registers)}`);
  }
  if (result.changeSummary.box) {
    const box = result.changeSummary.box;
    console.log(`VRAM byte diffs: ${result.changeSummary.count}, addr ${hex(box.minAddress, 6)}-${hex(box.maxAddress, 6)}, pixels x=${box.minX}-${box.maxX} y=${box.minY}-${box.maxY}`);
  } else {
    console.log('VRAM byte diffs: 0');
  }
  for (const change of result.changeSummary.sample) {
    console.log(`  diff ${hex(change.address, 6)} pixel(${change.coord.x},${change.coord.y}) byte${change.coord.byteInPixel}: ${hex(change.before, 2)} -> ${hex(change.after, 2)}`);
  }
  console.log(`instrumented VRAM writes: ${result.writeSummary.count}`);
  for (const write of result.writeSummary.sample) {
    const value = write.value === undefined ? 'unknown' : hex(write.value, write.method === 'write8' ? 2 : 6);
    console.log(`  write ${hex(write.address, 6)} pixel(${write.coord.x},${write.coord.y}) via ${write.method} value=${value}`);
  }
}

function runCase(row, col) {
  const peripherals = makePeripherals();
  const cpu = makeCPU(peripherals);
  const boot = bootToIdle(cpu);

  write8(cpu, peripherals, ROW_VAR, row);
  write8(cpu, peripherals, COL_VAR, col);
  write8(cpu, peripherals, CURSOR_FLAGS, 0x16);

  const before = snapshotRange(cpu, peripherals, LCD_BUFFER);
  const writes = installWriteRecorder(cpu, peripherals);
  const call = executeCandidate(cpu, peripherals);
  const after = snapshotRange(cpu, peripherals, LCD_BUFFER);
  const changes = diffRange(before, after, LCD_BUFFER);

  return {
    row,
    col,
    boot,
    call,
    changeSummary: summarizeChanges(changes),
    writeSummary: summarizeWrites(writes, LCD_BUFFER),
  };
}

function boxesDiffer(a, b) {
  const left = a.changeSummary.box;
  const right = b.changeSummary.box;
  if (!left || !right) return false;
  return left.minAddress !== right.minAddress
    || left.maxAddress !== right.maxAddress
    || left.minX !== right.minX
    || left.maxX !== right.maxX
    || left.minY !== right.minY
    || left.maxY !== right.maxY;
}

function printConclusion(a, b) {
  const bothReturned = a.call.terminated && b.call.terminated;
  const bothRendered = a.call.renderCalls.length > 0 && b.call.renderCalls.length > 0;
  const bothTouchedVram = a.changeSummary.count > 0 && b.changeSummary.count > 0;
  const moved = boxesDiffer(a, b);

  console.log('\n=== Comparison ===');
  console.log(`case A diffs=${a.changeSummary.count}, case B diffs=${b.changeSummary.count}, boxes differ=${moved}`);

  if (bothReturned && bothRendered && bothTouchedVram && moved) {
    console.log('CONCLUSION: TEXT CURSOR - renderer calls and VRAM writes moved when D00595/D00596 changed.');
  } else if (bothTouchedVram && !moved) {
    console.log('CONCLUSION: NOT TEXT CURSOR - VRAM writes were fixed despite changing D00595/D00596.');
  } else if (!bothTouchedVram) {
    console.log('CONCLUSION: NOT TEXT CURSOR - direct calls did not produce observable LCD VRAM byte changes in one or both cases.');
  } else {
    console.log('CONCLUSION: NOT TEXT CURSOR - evidence did not show variable cursor-position rendering.');
  }
}

disassemble();

console.log('\n=== Dynamic test: direct call 0x05E400 ===');
console.log(`Setup: D00595/D00596 row/col, D00092=${hex(0x16, 2)}, renderer watch=${hex(RENDERER, 6)}, VRAM range=${hex(LCD_BUFFER.start, 6)}-${hex(LCD_BUFFER.start + LCD_BUFFER.length - 1, 6)}`);

const topLeft = runCase(0, 0);
printSummary('case A', topLeft);

const middle = runCase(5, 13);
printSummary('case B', middle);

printConclusion(topLeft, middle);
