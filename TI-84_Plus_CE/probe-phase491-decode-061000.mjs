import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

function ensureTranspiledRom() {
  const transpiled = new URL('./ROM.transpiled.js', import.meta.url);
  const gz = new URL('./ROM.transpiled.js.gz', import.meta.url);
  if (fs.existsSync(transpiled) || !fs.existsSync(gz)) return;
  console.log('ROM.transpiled.js missing; expanding ROM.transpiled.js.gz');
  try {
    execFileSync('gzip', ['-dk', fileURLToPath(gz)], {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      stdio: 'inherit',
    });
  } catch (error) {
    console.log(`gzip failed (${error.message}); falling back to node:zlib`);
    fs.writeFileSync(transpiled, zlib.gunzipSync(fs.readFileSync(gz)));
  }
}

ensureTranspiledRom();

const { createCPU } = await import('./cpu-runtime.js');
const { createPeripheralBus } = await import('./peripherals.js');

const FUNC_ADDR = 0x061000;
const VRAM_START = 0xD40000;
const VRAM_SIZE = 320 * 240;
const VRAM_END = VRAM_START + VRAM_SIZE - 1;
const CURSOR_ROW = 0xD00595;
const CURSOR_COL = 0xD00596;
const VRAM_PTR = 0xD0059C;
const LCD_X_START = 0xD008D2;
const LCD_Y_START = 0xD008D5;
const STACK_TOP = 0xD1A87E;
const RETURN_ADDR = 0x064910;
const ADDR_MASK = 0xFFFFFF;
const MAX_TRACE_STEPS = 50000;
const BOOT_STEPS = 120000;

const romPath = new URL('./ROM.rom', import.meta.url);
const rom = fs.readFileSync(romPath);

function hex(value, width = 2) {
  return `$${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function addrHex(value) {
  return hex(value & ADDR_MASK, 6);
}

function bytesHex(buf, start, length) {
  const out = [];
  for (let i = 0; i < length; i++) out.push((buf[start + i] ?? 0).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function readLE(buf, pos, bytes) {
  let value = 0;
  for (let i = 0; i < bytes; i++) value |= (buf[pos + i] ?? 0) << (i * 8);
  return value >>> 0;
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function dispText(value) {
  const signed = signed8(value);
  if (signed === 0) return '+0';
  return signed > 0 ? `+${signed}` : `${signed}`;
}

const r = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
const rp = ['bc', 'de', 'hl', 'sp'];
const rp2 = ['bc', 'de', 'hl', 'af'];
const cc = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'];
const alu = ['add a,', 'adc a,', 'sub', 'sbc a,', 'and', 'xor', 'or', 'cp'];
const rot = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];

function relTarget(pc, length, disp) {
  return (pc + length + signed8(disp)) & ADDR_MASK;
}

function addrOperand(buf, pos, bytes) {
  return hex(readLE(buf, pos, bytes), bytes * 2);
}

function indexedRegName(code, index, displacement) {
  if (code === 6) return `(${index}${dispText(displacement)})`;
  if (code === 4) return `${index}h`;
  if (code === 5) return `${index}l`;
  return r[code];
}

function decodeCB(op, target) {
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) return `${rot[y]} ${target ?? r[z]}`;
  if (x === 1) return `bit ${y},${target ?? r[z]}`;
  if (x === 2) return `res ${y},${target ?? r[z]}`;
  return `set ${y},${target ?? r[z]}`;
}

function decodeED(buf, pc, mode) {
  const op = buf[pc + 1] ?? 0;
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const addrBytes = mode.addrBytes;

  const leaIx = new Map([[0x02, 'bc'], [0x12, 'de'], [0x22, 'hl'], [0x32, 'ix']]);
  const leaIy = new Map([[0x03, 'bc'], [0x13, 'de'], [0x23, 'hl'], [0x33, 'iy']]);
  if (leaIx.has(op)) return { length: 3, mnemonic: `lea ${leaIx.get(op)},ix${dispText(buf[pc + 2] ?? 0)}` };
  if (leaIy.has(op)) return { length: 3, mnemonic: `lea ${leaIy.get(op)},iy${dispText(buf[pc + 2] ?? 0)}` };
  if (op === 0x65) return { length: 3, mnemonic: `pea ix${dispText(buf[pc + 2] ?? 0)}` };
  if (op === 0x66) return { length: 3, mnemonic: `pea iy${dispText(buf[pc + 2] ?? 0)}` };

  const mlt = new Map([[0x4C, 'bc'], [0x5C, 'de'], [0x6C, 'hl'], [0x7C, 'sp']]);
  if (mlt.has(op)) return { length: 2, mnemonic: `mlt ${mlt.get(op)}` };

  if (x === 1) {
    if (z === 0) return { length: 2, mnemonic: y === 6 ? 'in (c)' : `in ${r[y]},(c)` };
    if (z === 1) return { length: 2, mnemonic: y === 6 ? 'out (c),0' : `out (c),${r[y]}` };
    if (z === 2) return { length: 2, mnemonic: `${q ? 'adc' : 'sbc'} hl,${rp[p]}` };
    if (z === 3) {
      const a = addrOperand(buf, pc + 2, addrBytes);
      return { length: 2 + addrBytes, mnemonic: q ? `ld ${rp[p]},(${a})` : `ld (${a}),${rp[p]}` };
    }
    if (z === 4) return { length: 2, mnemonic: 'neg' };
    if (z === 5) return { length: 2, mnemonic: y === 1 ? 'reti' : 'retn' };
    if (z === 6) {
      const im = [0, 0, 1, 2, 0, 0, 1, 2][y];
      return { length: 2, mnemonic: `im ${im}` };
    }
    const special = ['ld i,a', 'ld r,a', 'ld a,i', 'ld a,r', 'rrd', 'rld', 'nop', 'nop'][y];
    return { length: 2, mnemonic: special };
  }

  const block = new Map([
    [0xA0, 'ldi'], [0xA1, 'cpi'], [0xA2, 'ini'], [0xA3, 'outi'],
    [0xA8, 'ldd'], [0xA9, 'cpd'], [0xAA, 'ind'], [0xAB, 'outd'],
    [0xB0, 'ldir'], [0xB1, 'cpir'], [0xB2, 'inir'], [0xB3, 'otir'],
    [0xB8, 'lddr'], [0xB9, 'cpdr'], [0xBA, 'indr'], [0xBB, 'otdr'],
  ]);
  if (block.has(op)) return { length: 2, mnemonic: block.get(op) };

  return { length: 2, mnemonic: `ed ${hex(op)}` };
}

function decodeBase(buf, pc, mode = { addrBytes: 3, index: null }) {
  const op = buf[pc] ?? 0;
  const addrBytes = mode.addrBytes;

  if (op === 0xCB) {
    const cb = buf[pc + 1] ?? 0;
    return { length: 2, mnemonic: decodeCB(cb) };
  }
  if (op === 0xED) return decodeED(buf, pc, mode);
  if (op === 0xDD || op === 0xFD) return decodeIndexed(buf, pc, op === 0xDD ? 'ix' : 'iy', mode);

  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { length: 1, mnemonic: 'nop' };
      if (y === 1) return { length: 1, mnemonic: "ex af,af'" };
      if (y === 2) return { length: 2, mnemonic: `djnz ${addrHex(relTarget(pc, 2, buf[pc + 1] ?? 0))}` };
      if (y === 3) return { length: 2, mnemonic: `jr ${addrHex(relTarget(pc, 2, buf[pc + 1] ?? 0))}` };
      return { length: 2, mnemonic: `jr ${cc[y - 4]},${addrHex(relTarget(pc, 2, buf[pc + 1] ?? 0))}` };
    }
    if (z === 1) {
      if (q === 0) return { length: 1 + addrBytes, mnemonic: `ld ${rp[p]},${addrOperand(buf, pc + 1, addrBytes)}` };
      return { length: 1, mnemonic: `add hl,${rp[p]}` };
    }
    if (z === 2) {
      if (p === 0) return { length: 1, mnemonic: q ? 'ld a,(bc)' : 'ld (bc),a' };
      if (p === 1) return { length: 1, mnemonic: q ? 'ld a,(de)' : 'ld (de),a' };
      if (p === 2) return { length: 1 + addrBytes, mnemonic: q ? `ld hl,(${addrOperand(buf, pc + 1, addrBytes)})` : `ld (${addrOperand(buf, pc + 1, addrBytes)}),hl` };
      return { length: 1 + addrBytes, mnemonic: q ? `ld a,(${addrOperand(buf, pc + 1, addrBytes)})` : `ld (${addrOperand(buf, pc + 1, addrBytes)}),a` };
    }
    if (z === 3) return { length: 1, mnemonic: `${q ? 'dec' : 'inc'} ${rp[p]}` };
    if (z === 4) return { length: 1, mnemonic: `inc ${r[y]}` };
    if (z === 5) return { length: 1, mnemonic: `dec ${r[y]}` };
    if (z === 6) return { length: 2, mnemonic: `ld ${r[y]},${hex(buf[pc + 1] ?? 0)}` };
    const misc = ['rlca', 'rrca', 'rla', 'rra', 'daa', 'cpl', 'scf', 'ccf'][y];
    return { length: 1, mnemonic: misc };
  }

  if (x === 1) {
    if (op === 0x76) return { length: 1, mnemonic: 'halt' };
    return { length: 1, mnemonic: `ld ${r[y]},${r[z]}` };
  }

  if (x === 2) return { length: 1, mnemonic: `${alu[y]} ${r[z]}` };

  if (z === 0) return { length: 1, mnemonic: `ret ${cc[y]}` };
  if (z === 1) {
    if (q === 0) return { length: 1, mnemonic: `pop ${rp2[p]}` };
    if (p === 0) return { length: 1, mnemonic: 'ret' };
    if (p === 1) return { length: 1, mnemonic: 'exx' };
    if (p === 2) return { length: 1, mnemonic: 'jp (hl)' };
    return { length: 1, mnemonic: 'ld sp,hl' };
  }
  if (z === 2) return { length: 1 + addrBytes, mnemonic: `jp ${cc[y]},${addrOperand(buf, pc + 1, addrBytes)}` };
  if (z === 3) {
    if (y === 0) return { length: 1 + addrBytes, mnemonic: `jp ${addrOperand(buf, pc + 1, addrBytes)}` };
    if (y === 1) return { length: 2, mnemonic: decodeCB(buf[pc + 1] ?? 0) };
    if (y === 2) return { length: 2, mnemonic: `out (${hex(buf[pc + 1] ?? 0)}),a` };
    if (y === 3) return { length: 2, mnemonic: `in a,(${hex(buf[pc + 1] ?? 0)})` };
    if (y === 4) return { length: 1, mnemonic: 'ex (sp),hl' };
    if (y === 5) return { length: 1, mnemonic: 'ex de,hl' };
    if (y === 6) return { length: 1, mnemonic: 'di' };
    return { length: 1, mnemonic: 'ei' };
  }
  if (z === 4) return { length: 1 + addrBytes, mnemonic: `call ${cc[y]},${addrOperand(buf, pc + 1, addrBytes)}` };
  if (z === 5) {
    if (q === 0) return { length: 1, mnemonic: `push ${rp2[p]}` };
    if (p === 0) return { length: 1 + addrBytes, mnemonic: `call ${addrOperand(buf, pc + 1, addrBytes)}` };
  }
  if (z === 6) return { length: 2, mnemonic: `${alu[y]} ${hex(buf[pc + 1] ?? 0)}` };
  return { length: 1, mnemonic: `rst ${hex(y * 8)}` };
}

function decodeIndexed(buf, pc, index, mode) {
  const op = buf[pc + 1] ?? 0;
  const addrBytes = mode.addrBytes;
  if (op === 0xCB) {
    const d = buf[pc + 2] ?? 0;
    const cb = buf[pc + 3] ?? 0;
    const z = cb & 7;
    const target = `(${index}${dispText(d)})`;
    const mnemonic = z === 6 ? decodeCB(cb, target) : `${decodeCB(cb, target)},${r[z]}`;
    return { length: 4, mnemonic };
  }
  if (op === 0xED) return { length: 2, mnemonic: `${index}-prefix ed` };

  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (x === 0) {
    if (z === 1) {
      if (q === 0 && p === 2) return { length: 2 + addrBytes, mnemonic: `ld ${index},${addrOperand(buf, pc + 2, addrBytes)}` };
      if (q === 1 && p === 2) return { length: 2, mnemonic: `add ${index},${index}` };
      if (q === 1) return { length: 2, mnemonic: `add ${index},${rp[p]}` };
    }
    if (z === 2 && p === 2) {
      return { length: 2 + addrBytes, mnemonic: q ? `ld ${index},(${addrOperand(buf, pc + 2, addrBytes)})` : `ld (${addrOperand(buf, pc + 2, addrBytes)}),${index}` };
    }
    if (z === 3 && p === 2) return { length: 2, mnemonic: `${q ? 'dec' : 'inc'} ${index}` };
    if ((z === 4 || z === 5) && y === 6) return { length: 3, mnemonic: `${z === 4 ? 'inc' : 'dec'} (${index}${dispText(buf[pc + 2] ?? 0)})` };
    if (z === 4 || z === 5) return { length: 2, mnemonic: `${z === 4 ? 'inc' : 'dec'} ${indexedRegName(y, index, 0)}` };
    if (z === 6 && y === 6) return { length: 4, mnemonic: `ld (${index}${dispText(buf[pc + 2] ?? 0)}),${hex(buf[pc + 3] ?? 0)}` };
    if (z === 6) return { length: 3, mnemonic: `ld ${indexedRegName(y, index, 0)},${hex(buf[pc + 2] ?? 0)}` };
  }

  if (x === 1) {
    if (op === 0x76) return { length: 2, mnemonic: 'halt' };
    if (y === 6 || z === 6) {
      const d = buf[pc + 2] ?? 0;
      return { length: 3, mnemonic: `ld ${indexedRegName(y, index, d)},${indexedRegName(z, index, d)}` };
    }
    return { length: 2, mnemonic: `ld ${indexedRegName(y, index, 0)},${indexedRegName(z, index, 0)}` };
  }

  if (x === 2) {
    if (z === 6) return { length: 3, mnemonic: `${alu[y]} (${index}${dispText(buf[pc + 2] ?? 0)})` };
    return { length: 2, mnemonic: `${alu[y]} ${indexedRegName(z, index, 0)}` };
  }

  if (op === 0xE1) return { length: 2, mnemonic: `pop ${index}` };
  if (op === 0xE3) return { length: 2, mnemonic: `ex (sp),${index}` };
  if (op === 0xE5) return { length: 2, mnemonic: `push ${index}` };
  if (op === 0xE9) return { length: 2, mnemonic: `jp (${index})` };
  if (op === 0xF9) return { length: 2, mnemonic: `ld sp,${index}` };

  const decoded = decodeBase(buf, pc + 1, mode);
  return { length: 1 + decoded.length, mnemonic: `${index}-prefix ${decoded.mnemonic}` };
}

function disassembleFunction() {
  console.log('\n=== Static disassembly of 0x061000 ===');
  let pc = FUNC_ADDR;
  let count = 0;
  const maxBytes = 0x800;
  while (pc < rom.length && pc < FUNC_ADDR + maxBytes) {
    const decoded = decodeBase(rom, pc, { addrBytes: 3, index: null });
    console.log(`${addrHex(pc)}  ${bytesHex(rom, pc, decoded.length).padEnd(16)}  ${decoded.mnemonic}`);
    pc += decoded.length;
    count++;
    if (decoded.mnemonic === 'ret') {
      console.log(`Decoded ${count} instructions, ${pc - FUNC_ADDR} bytes, stopped at first unconditional RET.`);
      return;
    }
  }
  console.log(`Stopped after ${pc - FUNC_ADDR} bytes without finding an unconditional RET.`);
}

function findPattern(buf, pattern) {
  const hits = [];
  outer:
  for (let i = 0; i <= buf.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (buf[i + j] !== pattern[j]) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

function searchReferences() {
  console.log('\n=== ROM references to 0x061000 ===');
  const calls = findPattern(rom, [0xCD, 0x00, 0x10, 0x06]);
  const jumps = findPattern(rom, [0xC3, 0x00, 0x10, 0x06]);
  console.log(`CALL 0x061000 pattern CD 00 10 06: ${calls.length ? calls.map(addrHex).join(', ') : '(none)'}`);
  console.log(`JP   0x061000 pattern C3 00 10 06: ${jumps.length ? jumps.map(addrHex).join(', ') : '(none)'}`);
  return { calls, jumps };
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function candidateContainers(cpu, bus) {
  const out = [];
  const add = (value) => {
    if (value && typeof value === 'object' && !out.includes(value)) out.push(value);
  };
  add(cpu);
  add(bus);
  for (const root of [cpu, bus]) {
    for (const key of ['state', 'regs', 'registers', 'r', 'cpu', 'bus', 'memory', 'mem']) add(root?.[key]);
  }
  return out;
}

function findRegisterContainer(cpu, reg) {
  const names = unique([reg, reg.toLowerCase(), reg.toUpperCase()]);
  for (const obj of candidateContainers(cpu, null)) {
    for (const name of names) {
      if (name in obj && typeof obj[name] !== 'function') return { obj, name };
    }
  }
  return null;
}

function makeRuntimeAdapter(cpu, bus) {
  const containers = candidateContainers(cpu, bus);

  const methodNames = {
    read: ['readByte', 'read8', 'read', 'peekByte', 'peek8', 'peek', 'memRead', 'memoryRead', 'readMemory', 'readMem'],
    write: ['writeByte', 'write8', 'write', 'pokeByte', 'poke8', 'poke', 'memWrite', 'memoryWrite', 'writeMemory', 'writeMem'],
  };

  function findMethod(kind) {
    for (const obj of containers) {
      for (const name of methodNames[kind]) {
        if (typeof obj?.[name] === 'function') return { obj, name, fn: obj[name] };
      }
    }
    return null;
  }

  function findByteArray() {
    for (const obj of containers) {
      for (const key of ['bytes', 'data', 'memory', 'mem', 'ram', 'addressSpace']) {
        const value = obj?.[key];
        if (value && typeof value.length === 'number' && value.length > VRAM_END) return value;
      }
    }
    return null;
  }

  const readMethod = findMethod('read');
  const writeMethod = findMethod('write');
  const byteArray = findByteArray();

  function readByte(address) {
    const a = address & ADDR_MASK;
    if (readMethod) return readMethod.fn.call(readMethod.obj, a) & 0xFF;
    if (byteArray) return byteArray[a] & 0xFF;
    throw new Error('No byte-read API found on CPU or peripheral bus');
  }

  function writeByte(address, value) {
    const a = address & ADDR_MASK;
    const v = value & 0xFF;
    if (writeMethod) {
      writeMethod.fn.call(writeMethod.obj, a, v);
      return;
    }
    if (byteArray) {
      byteArray[a] = v;
      return;
    }
    throw new Error('No byte-write API found on CPU or peripheral bus');
  }

  function getReg(reg) {
    if (reg === 'PC') {
      for (const name of ['getPC', 'getPc', 'pc']) {
        if (typeof cpu[name] === 'function') return cpu[name]() & ADDR_MASK;
      }
    }
    if (reg === 'SP') {
      for (const name of ['getSP', 'getSp']) {
        if (typeof cpu[name] === 'function') return cpu[name]() & ADDR_MASK;
      }
    }
    if (typeof cpu.getRegister === 'function') {
      try {
        const value = cpu.getRegister(reg);
        if (typeof value === 'number') return value >>> 0;
      } catch {
        // Try object properties below.
      }
    }
    const direct = findRegisterContainer(cpu, reg);
    if (direct) return Number(direct.obj[direct.name]) >>> 0;
    if (['HL', 'DE', 'BC'].includes(reg)) {
      const hi = getReg(reg[0]);
      const lo = getReg(reg[1]);
      if (hi != null && lo != null) return ((hi & 0xFF) << 8) | (lo & 0xFF);
    }
    return null;
  }

  function setReg(reg, value) {
    const masked = value & ADDR_MASK;
    if (reg === 'PC') {
      for (const name of ['setPC', 'setPc']) {
        if (typeof cpu[name] === 'function') {
          cpu[name](masked);
          return;
        }
      }
    }
    if (reg === 'SP') {
      for (const name of ['setSP', 'setSp']) {
        if (typeof cpu[name] === 'function') {
          cpu[name](masked);
          return;
        }
      }
    }
    if (typeof cpu.setRegister === 'function') {
      try {
        cpu.setRegister(reg, masked);
        return;
      } catch {
        // Try object properties below.
      }
    }
    const direct = findRegisterContainer(cpu, reg);
    if (direct) {
      direct.obj[direct.name] = masked;
      return;
    }
    throw new Error(`No register setter found for ${reg}`);
  }

  function step() {
    for (const name of ['step', 'executeInstruction', 'instruction', 'tick', 'cycle']) {
      if (typeof cpu[name] !== 'function') continue;
      try {
        return cpu[name]();
      } catch (firstError) {
        try {
          return cpu[name](bus);
        } catch {
          throw firstError;
        }
      }
    }
    throw new Error('No CPU step method found');
  }

  return { cpu, bus, readByte, writeByte, getReg, setReg, step, containers };
}

let activeMemoryLog = null;

function patchMemoryTracing(adapter) {
  const readNames = new Set(['readByte', 'read8', 'read', 'peekByte', 'peek8', 'peek', 'memRead', 'memoryRead', 'readMemory', 'readMem']);
  const writeNames = new Set(['writeByte', 'write8', 'write', 'pokeByte', 'poke8', 'poke', 'memWrite', 'memoryWrite', 'writeMemory', 'writeMem']);
  let patched = 0;

  for (const obj of adapter.containers) {
    for (const name of Object.getOwnPropertyNames(obj)) {
      const original = obj[name];
      if (typeof original !== 'function' || original.__phase491Wrapped) continue;
      const isRead = readNames.has(name);
      const isWrite = writeNames.has(name);
      if (!isRead && !isWrite) continue;
      const wrapped = function wrappedMemoryAccess(...args) {
        const address = typeof args[0] === 'number' ? args[0] & ADDR_MASK : null;
        if (isRead) {
          const value = original.apply(this, args);
          if (activeMemoryLog && address != null) activeMemoryLog.push({ kind: 'R', address, value: Number(value) & 0xFF, source: name });
          return value;
        }
        if (activeMemoryLog && address != null) activeMemoryLog.push({ kind: 'W', address, value: Number(args[1]) & 0xFF, source: name });
        return original.apply(this, args);
      };
      wrapped.__phase491Wrapped = true;
      try {
        obj[name] = wrapped;
        patched++;
      } catch {
        // Some runtime objects may expose read-only methods.
      }
    }
  }
  console.log(`Memory trace wrappers installed: ${patched}`);
}

function createRuntime() {
  const bus = createPeripheralBus({ timerInterrupt: false });
  const attempts = [
    ['createCPU(bus)', () => createCPU(bus)],
    ['createCPU({ bus })', () => createCPU({ bus })],
    ['createCPU({ peripheralBus: bus })', () => createCPU({ peripheralBus: bus })],
    ['createCPU()', () => createCPU()],
  ];
  const errors = [];
  for (const [label, make] of attempts) {
    try {
      const cpu = make();
      if (!cpu || typeof cpu !== 'object') throw new Error('createCPU returned no CPU object');
      console.log(`Runtime constructed with ${label}`);
      return makeRuntimeAdapter(cpu, bus);
    } catch (error) {
      errors.push(`${label}: ${error.message}`);
    }
  }
  throw new Error(`Unable to construct CPU runtime:\n${errors.join('\n')}`);
}

function regLine(adapter) {
  const regs = ['A', 'HL', 'DE', 'BC', 'IX', 'IY', 'SP'];
  return regs.map((reg) => {
    const value = adapter.getReg(reg);
    if (value == null) return `${reg}=??`;
    return `${reg}=${hex(value, reg === 'A' ? 2 : 6)}`;
  }).join(' ');
}

function memOpsLine(ops) {
  if (!ops.length) return '(none captured)';
  const deduped = [];
  const seen = new Set();
  for (const op of ops) {
    const key = `${op.kind}:${op.address}:${op.value}:${op.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(op);
  }
  const shown = deduped.slice(0, 48).map((op) => `${op.kind}${addrHex(op.address)}=${hex(op.value)}`);
  if (deduped.length > shown.length) shown.push(`... ${deduped.length - shown.length} more`);
  return shown.join(' ');
}

function snapshotRange(adapter, start, length) {
  const out = new Uint8Array(length);
  for (let i = 0; i < length; i++) out[i] = adapter.readByte(start + i);
  return out;
}

function fillRange(adapter, start, length, value) {
  for (let i = 0; i < length; i++) adapter.writeByte(start + i, value);
}

function pushReturnAddress(adapter, value) {
  const sp = (adapter.getReg('SP') - 3) & ADDR_MASK;
  adapter.writeByte(sp, value & 0xFF);
  adapter.writeByte(sp + 1, (value >> 8) & 0xFF);
  adapter.writeByte(sp + 2, (value >> 16) & 0xFF);
  adapter.setReg('SP', sp);
  return sp;
}

function diffVram(before, after) {
  const changes = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;
    changes.push({
      offset: i,
      address: VRAM_START + i,
      x: i % 320,
      y: Math.floor(i / 320),
      before: before[i],
      after: after[i],
    });
  }
  return changes;
}

function summarizeDiff(changes) {
  if (!changes.length) return null;
  const xs = changes.map((c) => c.x);
  const ys = changes.map((c) => c.y);
  const summary = {
    count: changes.length,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    allWhite: changes.every((c) => c.after === 0xFF),
  };
  summary.width = summary.maxX - summary.minX + 1;
  summary.height = summary.maxY - summary.minY + 1;
  summary.startOffset = summary.minY * 320 + summary.minX;
  summary.startAddress = VRAM_START + summary.startOffset;
  return summary;
}

function printDiffSummary(label, changes) {
  const summary = summarizeDiff(changes);
  if (!summary) {
    console.log(`${label}: no VRAM byte changes detected`);
    return null;
  }
  console.log(`${label}: ${summary.count} VRAM byte changes`);
  console.log(`  bounds: x=${summary.minX}-${summary.maxX}, y=${summary.minY}-${summary.maxY}, size=${summary.width}x${summary.height}, start=${addrHex(summary.startAddress)}, all after=0xFF: ${summary.allWhite}`);

  const rows = new Map();
  for (const change of changes) {
    if (!rows.has(change.y)) rows.set(change.y, []);
    rows.get(change.y).push(change);
  }
  for (const [y, row] of [...rows.entries()].sort((a, b) => a[0] - b[0]).slice(0, 20)) {
    const minX = Math.min(...row.map((c) => c.x));
    const maxX = Math.max(...row.map((c) => c.x));
    console.log(`  row y=${y}: x=${minX}-${maxX}, count=${row.length}, after=${unique(row.map((c) => hex(c.after))).join('/')}`);
  }
  return summary;
}

function readStateBytes(adapter) {
  const read3 = (addr) => adapter.readByte(addr) | (adapter.readByte(addr + 1) << 8) | (adapter.readByte(addr + 2) << 16);
  return {
    row: adapter.readByte(CURSOR_ROW),
    col: adapter.readByte(CURSOR_COL),
    vramPtr: read3(VRAM_PTR),
    lcdXStart: read3(LCD_X_START),
    lcdYStart: read3(LCD_Y_START),
  };
}

function printStateBytes(prefix, state) {
  console.log(`${prefix}: row=${state.row}, col=${state.col}, D0059C=${addrHex(state.vramPtr)}, D008D2=${addrHex(state.lcdXStart)}, D008D5=${addrHex(state.lcdYStart)}`);
}

function collectInterestingReads(traceOps) {
  const reads = new Set();
  const writes = new Set();
  for (const op of traceOps) {
    if (op.address < 0xD00000 || op.address > 0xDFFFFF) continue;
    if (op.kind === 'R') reads.add(op.address);
    if (op.kind === 'W') writes.add(op.address);
  }
  return { reads: [...reads].sort((a, b) => a - b), writes: [...writes].sort((a, b) => a - b) };
}

async function runDynamicTrace() {
  console.log('\n=== Dynamic trace ===');
  const adapter = createRuntime();
  patchMemoryTracing(adapter);

  console.log(`Booting CPU for ${BOOT_STEPS} single steps with timerInterrupt=false`);
  for (let i = 0; i < BOOT_STEPS; i++) adapter.step();
  const bootPc = adapter.getReg('PC');
  console.log(`Boot complete: PC=${bootPc == null ? '??' : addrHex(bootPc)}`);

  const cases = [
    { label: 'Case A row=0 col=0', row: 0, col: 0 },
    { label: 'Case B row=5 col=13', row: 5, col: 13 },
  ];

  const results = [];
  for (const test of cases) {
    console.log(`\n--- ${test.label} ---`);
    activeMemoryLog = null;
    adapter.writeByte(CURSOR_ROW, test.row);
    adapter.writeByte(CURSOR_COL, test.col);
    fillRange(adapter, VRAM_START, VRAM_SIZE, 0x00);
    console.log(`VRAM ${addrHex(VRAM_START)}-${addrHex(VRAM_END)} prefilled with 0x00 before snapshot so white erase writes are visible.`);
    const before = snapshotRange(adapter, VRAM_START, VRAM_SIZE);
    const beforeState = readStateBytes(adapter);
    printStateBytes('State before call', beforeState);

    adapter.setReg('PC', FUNC_ADDR);
    adapter.setReg('SP', STACK_TOP);
    const pushedSp = pushReturnAddress(adapter, RETURN_ADDR);
    console.log(`Entry: PC=${addrHex(FUNC_ADDR)}, SP top=${addrHex(STACK_TOP)}, pushed return=${addrHex(RETURN_ADDR)} at SP=${addrHex(pushedSp)}`);

    const allOps = [];
    let returned = false;
    for (let step = 0; step < MAX_TRACE_STEPS; step++) {
      const pc = adapter.getReg('PC');
      const regs = regLine(adapter);
      const ops = [];
      activeMemoryLog = ops;
      adapter.step();
      activeMemoryLog = null;
      allOps.push(...ops);
      const nextPc = adapter.getReg('PC');
      console.log(`${String(step).padStart(5, '0')} PC=${pc == null ? '??' : addrHex(pc)} ${regs} -> PC=${nextPc == null ? '??' : addrHex(nextPc)} MEM ${memOpsLine(ops)}`);
      if (nextPc === RETURN_ADDR || nextPc === (RETURN_ADDR & 0xFFFF)) {
        returned = true;
        console.log(`Returned to pushed address after ${step + 1} steps.`);
        break;
      }
    }
    if (!returned) console.log(`WARNING: did not return to ${addrHex(RETURN_ADDR)} within ${MAX_TRACE_STEPS} steps.`);

    const afterState = readStateBytes(adapter);
    printStateBytes('State after call ', afterState);
    const after = snapshotRange(adapter, VRAM_START, VRAM_SIZE);
    const changes = diffVram(before, after);
    const summary = printDiffSummary(test.label, changes);
    const interesting = collectInterestingReads(allOps);
    console.log(`RAM reads captured: ${interesting.reads.length ? interesting.reads.map(addrHex).join(', ') : '(none captured)'}`);
    console.log(`RAM writes captured: ${interesting.writes.length ? interesting.writes.map(addrHex).join(', ') : '(none captured)'}`);

    results.push({ ...test, summary, reads: interesting.reads, writes: interesting.writes, beforeState, afterState });
  }
  return results;
}

function printFormulaAnalysis(results) {
  console.log('\n=== Analysis ===');
  const [a, b] = results;
  if (a?.summary && b?.summary) {
    const colPitch = (b.summary.minX - a.summary.minX) / (b.col - a.col);
    const rowPitch = (b.summary.minY - a.summary.minY) / (b.row - a.row);
    const baseX = a.summary.minX - a.col * colPitch;
    const baseY = a.summary.minY - a.row * rowPitch;
    console.log(`Observed cell origin formula: pixel_x = ${baseX} + col * ${colPitch}; pixel_y = ${baseY} + row * ${rowPitch}`);
    console.log(`Observed write rectangle: ${a.summary.width}x${a.summary.height}; VRAM row stride: 320 bytes.`);
    console.log(`Observed VRAM address formula: addr = 0xD40000 + pixel_y * 320 + pixel_x`);
    console.log(`Case A origin addr: ${addrHex(a.summary.startAddress)}; Case B origin addr: ${addrHex(b.summary.startAddress)}`);
  } else {
    console.log('Diffs were not sufficient to derive formula dynamically.');
    console.log('Expected from prior observations: pixel_x = 2 + col * 12; pixel_y = 37 + row * 20; addr = 0xD40000 + pixel_y * 320 + pixel_x.');
  }

  const allReads = unique(results.flatMap((r) => r.reads.map(addrHex))).sort();
  const allWrites = unique(results.flatMap((r) => r.writes.map(addrHex))).sort();
  const expectedState = new Set([addrHex(CURSOR_ROW), addrHex(CURSOR_COL)]);
  const otherReads = allReads.filter((addr) => !expectedState.has(addr) && !addr.startsWith('$D4') && !addr.startsWith('$D5'));
  console.log(`Captured state reads other than D00595/D00596: ${otherReads.length ? otherReads.join(', ') : '(none captured)'}`);
  console.log(`Captured RAM writes, including VRAM/stack/state: ${allWrites.length ? allWrites.join(', ') : '(none captured)'}`);
  console.log('Entry requirements observed by this probe: PC at 0x061000, ADL-compatible 24-bit return on a valid stack, and cursor row/column bytes at D00595/D00596. No seeded A/HL/DE/BC/IX/IY inputs are required by the observed rectangle formula; review the trace above for any register-dependent path.');
}

disassembleFunction();
searchReferences();

try {
  const dynamicResults = await runDynamicTrace();
  printFormulaAnalysis(dynamicResults);
} catch (error) {
  activeMemoryLog = null;
  console.log('\n=== Dynamic trace failed ===');
  console.log(error?.stack || error?.message || String(error));
  console.log('\n=== Analysis fallback ===');
  console.log('Formula expected from session 490: pixel_x = 2 + col * 12; pixel_y = 37 + row * 20; addr = 0xD40000 + pixel_y * 320 + pixel_x; write rectangle = 12x16 bytes of 0xFF.');
}

