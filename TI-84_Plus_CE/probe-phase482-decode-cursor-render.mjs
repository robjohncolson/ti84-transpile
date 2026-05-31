import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TEMPLATE_PATH = path.join(__dirname, 'probe-phase478-char-output-test.mjs');

const RANGES = [
  { label: '0x0A23C0 cursor character render', start: 0x0A23C0, end: 0x0A2450 },
  { label: '0x0A239E width/final pixel render helper', start: 0x0A239E, end: 0x0A23C0 },
  { label: '0x030173 cursor blink caller', start: 0x030173, end: 0x030210 },
];

const BOOT_STAGES = [
  { label: 'stage 1', start: 0x0802B2, intercepts: [0x08C331], maxSteps: 700000 },
  { label: 'stage 2', start: 0x08C331, intercepts: [0x08BF22], maxSteps: 300000 },
  {
    label: 'stage 3',
    start: 0x08BF22,
    intercepts: [
      0x030173,
      0x030202,
      0x0A23C0,
      0x0A239E,
      0x0059C6,
      0x005A75,
    ],
    maxSteps: 500000,
  },
];

const TRACE_HITS = [0x0A23C0, 0x0A239E, 0x030173, 0x030202, 0x0059C6, 0x005A75];
const VRAM_BASE = 0xD40000;
const VRAM_LENGTH = 320 * 240 * 2;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)) >>> 0;
}

function read16(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8)) >>> 0;
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function bytesAt(bytes, offset, length) {
  return Array.from(bytes.subarray(offset, offset + length), hexByte).join(' ');
}

function formatRelative(base, offset, displacement, size) {
  const target = (base + offset + size + signed8(displacement)) & 0xFFFFFF;
  return `${signed8(displacement) >= 0 ? '+' : ''}${signed8(displacement)} -> ${hex(target)}`;
}

function conditionName(opcode, groupBase) {
  return ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][(opcode - groupBase) >> 3];
}

function registerName(code) {
  return ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][code & 7];
}

function rrName(opcode) {
  return ['BC', 'DE', 'HL', 'SP'][(opcode >> 4) & 3];
}

function qqName(opcode) {
  return ['BC', 'DE', 'HL', 'AF'][(opcode >> 4) & 3];
}

function decodeBitOpcode(opcode, target) {
  const group = opcode >> 6;
  const bit = (opcode >> 3) & 7;
  const reg = registerName(opcode);
  const operand = target ?? reg;

  if (group === 1) return `BIT ${bit},${operand}`;
  if (group === 2) return `RES ${bit},${operand}`;
  if (group === 3) return `SET ${bit},${operand}`;

  const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][bit];
  return `${rot} ${operand}`;
}

function decodeInstruction(bytes, offset, base) {
  const op = bytes[offset];
  const addr = base + offset;
  const remain = bytes.length - offset;
  const need = (length) => remain >= length;

  if (!need(1)) return { size: 1, text: 'DB <truncated>' };

  if (op === 0x40) {
    return { size: 1, text: '.SIS prefix / LD B,B (context-dependent eZ80 prefix)' };
  }

  if (op === 0xCB && need(2)) {
    return { size: 2, text: decodeBitOpcode(bytes[offset + 1]) };
  }

  if (op === 0xED && need(2)) {
    const op2 = bytes[offset + 1];
    const mlt = new Map([
      [0x4C, 'MLT BC'],
      [0x5C, 'MLT DE'],
      [0x6C, 'MLT HL'],
      [0x7C, 'MLT SP'],
    ]);
    const block = new Map([
      [0xA0, 'LDI'],
      [0xA1, 'CPI'],
      [0xA2, 'INI'],
      [0xA3, 'OUTI'],
      [0xA8, 'LDD'],
      [0xA9, 'CPD'],
      [0xAA, 'IND'],
      [0xAB, 'OUTD'],
      [0xB0, 'LDIR'],
      [0xB1, 'CPIR'],
      [0xB2, 'INIR'],
      [0xB3, 'OTIR'],
      [0xB8, 'LDDR'],
      [0xB9, 'CPDR'],
      [0xBA, 'INDR'],
      [0xBB, 'OTDR'],
    ]);

    if (mlt.has(op2)) return { size: 2, text: mlt.get(op2) };
    if (block.has(op2)) return { size: 2, text: block.get(op2) };
    if ([0x43, 0x53, 0x63, 0x73].includes(op2) && need(5)) {
      return { size: 5, text: `LD (${hex(read24(bytes, offset + 2))}),${rrName(op2)}` };
    }
    if ([0x4B, 0x5B, 0x6B, 0x7B].includes(op2) && need(5)) {
      return { size: 5, text: `LD ${rrName(op2)},(${hex(read24(bytes, offset + 2))})` };
    }
    if (op2 === 0x44) return { size: 2, text: 'NEG' };
    if (op2 === 0x45) return { size: 2, text: 'RETN' };
    if (op2 === 0x4D) return { size: 2, text: 'RETI' };
    if ([0x46, 0x56, 0x5E].includes(op2)) return { size: 2, text: `IM ${op2 === 0x46 ? 0 : op2 === 0x56 ? 1 : 2}` };
    return { size: 2, text: `ED ${hexByte(op2)} (extended/unknown)` };
  }

  if ((op === 0xDD || op === 0xFD) && need(2)) {
    const index = op === 0xDD ? 'IX' : 'IY';
    const op2 = bytes[offset + 1];

    if (op === 0xDD && op2 === 0x49) {
      return { size: 2, text: '.SIL prefix (eZ80 mode control)' };
    }
    if (op2 === 0xCB && need(4)) {
      const displacement = bytes[offset + 2];
      return {
        size: 4,
        text: `${decodeBitOpcode(bytes[offset + 3], `(${index}${signed8(displacement) >= 0 ? '+' : ''}${signed8(displacement)})`)}`,
      };
    }
    if (op2 === 0x21 && need(5)) return { size: 5, text: `LD ${index},${hex(read24(bytes, offset + 2))}` };
    if (op2 === 0x22 && need(5)) return { size: 5, text: `LD (${hex(read24(bytes, offset + 2))}),${index}` };
    if (op2 === 0x2A && need(5)) return { size: 5, text: `LD ${index},(${hex(read24(bytes, offset + 2))})` };
    if (op2 === 0x36 && need(4)) return { size: 4, text: `LD (${index}${signed8(bytes[offset + 2]) >= 0 ? '+' : ''}${signed8(bytes[offset + 2])}),${hex(bytes[offset + 3], 2)}` };
    if ([0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E].includes(op2) && need(3)) {
      return { size: 3, text: `LD ${registerName(op2 >> 3)},(${index}${signed8(bytes[offset + 2]) >= 0 ? '+' : ''}${signed8(bytes[offset + 2])})` };
    }
    if ([0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77].includes(op2) && need(3)) {
      return { size: 3, text: `LD (${index}${signed8(bytes[offset + 2]) >= 0 ? '+' : ''}${signed8(bytes[offset + 2])}),${registerName(op2)}` };
    }
    return { size: 2, text: `${index} prefix ${hexByte(op2)} (likely indexed op or eZ80 mode prefix)` };
  }

  const fixed = new Map([
    [0x00, 'NOP'],
    [0x02, 'LD (BC),A'],
    [0x03, 'INC BC'],
    [0x04, 'INC B'],
    [0x05, 'DEC B'],
    [0x07, 'RLCA'],
    [0x08, 'EX AF,AF\'' ],
    [0x09, 'ADD HL,BC'],
    [0x0A, 'LD A,(BC)'],
    [0x0B, 'DEC BC'],
    [0x0C, 'INC C'],
    [0x0D, 'DEC C'],
    [0x0F, 'RRCA'],
    [0x12, 'LD (DE),A'],
    [0x13, 'INC DE'],
    [0x14, 'INC D'],
    [0x15, 'DEC D'],
    [0x17, 'RLA'],
    [0x19, 'ADD HL,DE'],
    [0x1A, 'LD A,(DE)'],
    [0x1B, 'DEC DE'],
    [0x1C, 'INC E'],
    [0x1D, 'DEC E'],
    [0x1F, 'RRA'],
    [0x23, 'INC HL'],
    [0x24, 'INC H'],
    [0x25, 'DEC H'],
    [0x27, 'DAA'],
    [0x29, 'ADD HL,HL'],
    [0x2B, 'DEC HL'],
    [0x2C, 'INC L'],
    [0x2D, 'DEC L'],
    [0x2F, 'CPL'],
    [0x33, 'INC SP'],
    [0x34, 'INC (HL)'],
    [0x35, 'DEC (HL)'],
    [0x37, 'SCF'],
    [0x39, 'ADD HL,SP'],
    [0x3B, 'DEC SP'],
    [0x3C, 'INC A'],
    [0x3D, 'DEC A'],
    [0x3F, 'CCF'],
    [0x76, 'HALT'],
    [0xC9, 'RET'],
    [0xD9, 'EXX'],
    [0xE3, 'EX (SP),HL'],
    [0xE9, 'JP (HL)'],
    [0xEB, 'EX DE,HL'],
    [0xF3, 'DI'],
    [0xF9, 'LD SP,HL'],
    [0xFB, 'EI'],
  ]);
  if (fixed.has(op)) return { size: 1, text: fixed.get(op) };

  if ([0x01, 0x11, 0x21, 0x31].includes(op) && need(4)) {
    return { size: 4, text: `LD ${rrName(op)},${hex(read24(bytes, offset + 1))}` };
  }
  if ([0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, 0x36, 0x3E].includes(op) && need(2)) {
    return { size: 2, text: `LD ${registerName(op >> 3)},${hex(bytes[offset + 1], 2)}` };
  }
  if (op === 0x10 && need(2)) return { size: 2, text: `DJNZ ${formatRelative(base, offset, bytes[offset + 1], 2)}` };
  if (op === 0x18 && need(2)) return { size: 2, text: `JR ${formatRelative(base, offset, bytes[offset + 1], 2)}` };
  if ([0x20, 0x28, 0x30, 0x38].includes(op) && need(2)) {
    return { size: 2, text: `JR ${['NZ', 'Z', 'NC', 'C'][(op - 0x20) >> 3]},${formatRelative(base, offset, bytes[offset + 1], 2)}` };
  }
  if (op === 0x22 && need(4)) return { size: 4, text: `LD (${hex(read24(bytes, offset + 1))}),HL` };
  if (op === 0x2A && need(4)) return { size: 4, text: `LD HL,(${hex(read24(bytes, offset + 1))})` };
  if (op === 0x32 && need(4)) return { size: 4, text: `LD (${hex(read24(bytes, offset + 1))}),A` };
  if (op === 0x3A && need(4)) return { size: 4, text: `LD A,(${hex(read24(bytes, offset + 1))})` };
  if (op >= 0x40 && op <= 0x7F) return { size: 1, text: `LD ${registerName(op >> 3)},${registerName(op)}` };
  if (op >= 0x80 && op <= 0xBF) {
    const ops = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
    return { size: 1, text: `${ops[(op >> 3) & 7]} ${registerName(op)}` };
  }
  if ([0xC0, 0xC8, 0xD0, 0xD8, 0xE0, 0xE8, 0xF0, 0xF8].includes(op)) {
    return { size: 1, text: `RET ${conditionName(op, 0xC0)}` };
  }
  if ([0xC1, 0xD1, 0xE1, 0xF1].includes(op)) return { size: 1, text: `POP ${qqName(op)}` };
  if ([0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA].includes(op) && need(4)) {
    return { size: 4, text: `JP ${conditionName(op, 0xC2)},${hex(read24(bytes, offset + 1))}` };
  }
  if (op === 0xC3 && need(4)) return { size: 4, text: `JP ${hex(read24(bytes, offset + 1))}` };
  if ([0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC].includes(op) && need(4)) {
    return { size: 4, text: `CALL ${conditionName(op, 0xC4)},${hex(read24(bytes, offset + 1))}` };
  }
  if ([0xC5, 0xD5, 0xE5, 0xF5].includes(op)) return { size: 1, text: `PUSH ${qqName(op)}` };
  if ([0xC6, 0xCE, 0xD6, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(op) && need(2)) {
    const ops = new Map([
      [0xC6, 'ADD A'],
      [0xCE, 'ADC A'],
      [0xD6, 'SUB'],
      [0xDE, 'SBC A'],
      [0xE6, 'AND'],
      [0xEE, 'XOR'],
      [0xF6, 'OR'],
      [0xFE, 'CP'],
    ]);
    return { size: 2, text: `${ops.get(op)} ${hex(bytes[offset + 1], 2)}` };
  }
  if (op === 0xCD && need(4)) return { size: 4, text: `CALL ${hex(read24(bytes, offset + 1))}` };
  if (op === 0xD3 && need(2)) return { size: 2, text: `OUT (${hex(bytes[offset + 1], 2)}),A` };
  if (op === 0xDB && need(2)) return { size: 2, text: `IN A,(${hex(bytes[offset + 1], 2)})` };

  return { size: 1, text: `DB ${hexByte(op)} (unknown/common decoder gap)` };
}

function disassembleLikely(bytes, base) {
  const lines = [];
  let offset = 0;
  while (offset < bytes.length) {
    const decoded = decodeInstruction(bytes, offset, base);
    const size = Math.max(1, Math.min(decoded.size, bytes.length - offset));
    lines.push(`${hex(base + offset)}  ${bytesAt(bytes, offset, size).padEnd(14)}  ${decoded.text}`);
    offset += size;
  }
  return lines;
}

function dumpRange(rom, range) {
  const bytes = rom.subarray(range.start, range.end);
  console.log(`\n=== ${range.label}: ${hex(range.start)}..${hex(range.end - 1)} (${bytes.length} bytes) ===`);
  console.log('raw bytes:');
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const row = bytes.subarray(offset, offset + 16);
    console.log(`${hex(range.start + offset)}  ${Array.from(row, hexByte).join(' ')}`);
  }
  console.log('\nlikely eZ80 decode:');
  for (const line of disassembleLikely(bytes, range.start)) {
    console.log(line);
  }
}

function extractTemplateImports(source) {
  const imports = new Set();
  const importRegex = /import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of source.matchAll(importRegex)) imports.add(match[1]);
  return [...imports];
}

function walkMjsFiles(root) {
  const results = [];
  const skip = new Set(['.git', 'node_modules', 'state', 'coverage', 'dist', 'build']);
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.claude') continue;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) stack.push(full);
      } else if (entry.isFile() && entry.name.endsWith('.mjs') && !entry.name.startsWith('probe-phase')) {
        results.push(full);
      }
    }
  }
  return results;
}

async function importModule(filePath) {
  return import(pathToFileURL(filePath).href);
}

async function loadCandidateModules(templateSource) {
  const candidates = new Set();
  for (const spec of extractTemplateImports(templateSource)) {
    if (spec.startsWith('.')) {
      const resolved = path.resolve(__dirname, spec);
      candidates.add(resolved.endsWith('.mjs') ? resolved : `${resolved}.mjs`);
    }
  }

  const roots = [__dirname, path.resolve(__dirname, '..')];
  for (const root of roots) {
    for (const file of walkMjsFiles(root)) {
      let source = '';
      try {
        source = fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      if (
        source.includes('createPeripheralBus') ||
        source.includes('class CPU') ||
        source.includes('class EZ80') ||
        source.includes('createCPU') ||
        source.includes('createEZ80') ||
        source.includes('stepInstruction')
      ) {
        candidates.add(file);
      }
    }
  }

  const loaded = [];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      loaded.push({ file, module: await importModule(file) });
    } catch (error) {
      console.log(`skipping module import ${file}: ${error.message}`);
    }
  }
  return loaded;
}

function findExport(modules, name) {
  for (const entry of modules) {
    if (typeof entry.module[name] !== 'undefined') return entry.module[name];
  }
  return undefined;
}

function callMaybe(object, names, ...args) {
  for (const name of names) {
    if (object && typeof object[name] === 'function') {
      try {
        return { ok: true, value: object[name](...args), name };
      } catch {
        continue;
      }
    }
  }
  return { ok: false };
}

function objectCandidates(bus, cpu) {
  const candidates = [bus, cpu, cpu?.bus, cpu?.memory, cpu?.mem, bus?.memory, bus?.mem, bus?.mmu, bus?.ram, bus?.rom];
  return candidates.filter(Boolean);
}

function makeMemoryAdapter(bus, cpu) {
  const readNames = ['read8', 'readByte', 'peek8', 'peekByte', 'readMemory', 'memRead', 'readMem', 'read', 'peek', 'getByte'];
  const writeNames = ['write8', 'writeByte', 'poke8', 'pokeByte', 'writeMemory', 'memWrite', 'writeMem', 'write', 'poke', 'setByte'];
  const arrayProps = ['memory', 'mem', 'bytes', 'data', 'ram', 'rom'];

  function read8(address) {
    address &= 0xFFFFFF;
    for (const object of objectCandidates(bus, cpu)) {
      for (const name of readNames) {
        if (typeof object[name] === 'function') {
          try {
            const value = object[name](address);
            if (Number.isFinite(value)) return value & 0xFF;
          } catch {
            // Try the next shape.
          }
        }
      }
      for (const prop of arrayProps) {
        const array = object[prop];
        if (array && typeof array.length === 'number' && address < array.length) return array[address] & 0xFF;
      }
    }
    throw new Error(`no memory reader accepted ${hex(address)}`);
  }

  function write8(address, value) {
    address &= 0xFFFFFF;
    value &= 0xFF;
    for (const object of objectCandidates(bus, cpu)) {
      for (const name of writeNames) {
        if (typeof object[name] === 'function') {
          try {
            object[name](address, value);
            return;
          } catch {
            // Try the next shape.
          }
        }
      }
      for (const prop of arrayProps) {
        const array = object[prop];
        if (array && typeof array.length === 'number' && address < array.length && !Object.isFrozen(array)) {
          array[address] = value;
          return;
        }
      }
    }
    throw new Error(`no memory writer accepted ${hex(address)}`);
  }

  return { read8, write8 };
}

function tryLoadRom(bus, cpu, rom) {
  const loadTargets = objectCandidates(bus, cpu);
  const loadNames = ['loadROM', 'loadRom', 'loadFirmware', 'loadImage', 'load', 'setROM', 'setRom'];
  for (const target of loadTargets) {
    const loaded = callMaybe(target, loadNames, rom);
    if (loaded.ok) return `loaded ROM via ${loaded.name}`;
  }

  for (const target of loadTargets) {
    for (const prop of ['rom', 'ROM', 'flash', 'memory', 'mem', 'bytes']) {
      const array = target?.[prop];
      if (array && typeof array.set === 'function' && array.length >= rom.length) {
        array.set(rom, 0);
        return `copied ROM into ${prop}`;
      }
    }
  }

  return 'no direct ROM load method found; relying on bus/module default ROM mapping';
}

async function createCpuFromModules(modules, bus, rom) {
  const factoryNames = ['createCPU', 'createCpu', 'createEZ80', 'createEz80', 'createECPU', 'createCore', 'createProcessor', 'createEmulator', 'createMachine', 'createSystem'];
  const constructorNames = ['CPU', 'Cpu', 'EZ80', 'Ez80', 'EZ80CPU', 'Ez80Cpu', 'Processor', 'Core', 'Emulator'];

  for (const name of factoryNames) {
    const factory = findExport(modules, name);
    if (typeof factory !== 'function') continue;
    const attempts = [
      () => factory({ bus, rom, mode: 'adl' }),
      () => factory(bus, rom),
      () => factory(bus),
      () => factory(rom, bus),
    ];
    for (const attempt of attempts) {
      try {
        const value = await attempt();
        if (value?.cpu) return value.cpu;
        if (value?.processor) return value.processor;
        if (value?.core) return value.core;
        if (value && typeof value === 'object') return value;
      } catch {
        // Try the next constructor shape.
      }
    }
  }

  for (const name of constructorNames) {
    const Constructor = findExport(modules, name);
    if (typeof Constructor !== 'function') continue;
    const attempts = [
      () => new Constructor({ bus, rom, mode: 'adl' }),
      () => new Constructor(bus, rom),
      () => new Constructor(bus),
      () => new Constructor(rom, bus),
    ];
    for (const attempt of attempts) {
      try {
        return attempt();
      } catch {
        // Try the next constructor shape.
      }
    }
  }

  throw new Error('could not discover a CPU/EZ80 constructor or factory from template imports');
}

function setNestedProperty(object, names, value) {
  for (const name of names) {
    if (!object) continue;
    if (name in object) {
      try {
        object[name] = value;
        return true;
      } catch {
        // Try the next property.
      }
    }
  }
  return false;
}

function setRegister(cpu, register, value) {
  const names = [register, register.toLowerCase()];
  if (setNestedProperty(cpu, names, value)) return true;
  for (const containerName of ['regs', 'registers', 'state', 'r']) {
    if (setNestedProperty(cpu?.[containerName], names, value)) return true;
  }
  const setters = [`set${register}`, 'setRegister', 'setReg'];
  for (const setter of setters) {
    if (typeof cpu?.[setter] === 'function') {
      try {
        if (setter === 'setRegister' || setter === 'setReg') cpu[setter](register, value);
        else cpu[setter](value);
        return true;
      } catch {
        // Try the next setter.
      }
    }
  }
  return false;
}

function getRegister(cpu, register) {
  const names = [register, register.toLowerCase()];
  for (const object of [cpu, cpu?.regs, cpu?.registers, cpu?.state, cpu?.r]) {
    for (const name of names) {
      const value = object?.[name];
      if (Number.isFinite(value)) return value >>> 0;
    }
  }
  for (const getter of [`get${register}`, 'getRegister', 'getReg']) {
    if (typeof cpu?.[getter] === 'function') {
      try {
        const value = getter === 'getRegister' || getter === 'getReg' ? cpu[getter](register) : cpu[getter]();
        if (Number.isFinite(value)) return value >>> 0;
      } catch {
        // Try the next getter.
      }
    }
  }
  throw new Error(`could not read ${register}`);
}

function setPc(cpu, value) {
  if (!setRegister(cpu, 'PC', value & 0xFFFFFF)) throw new Error('could not set PC');
}

function getPc(cpu) {
  return getRegister(cpu, 'PC') & 0xFFFFFF;
}

function setAddressMode(cpu, mode) {
  if (typeof cpu?.setMode === 'function') {
    try {
      cpu.setMode(mode);
    } catch {
      // Continue with property attempts.
    }
  }
  if (typeof cpu?.setADL === 'function') {
    try {
      cpu.setADL(mode === 'adl');
    } catch {
      // Continue with property attempts.
    }
  }
  for (const object of [cpu, cpu?.regs, cpu?.registers, cpu?.state]) {
    setNestedProperty(object, ['mode'], mode);
    setNestedProperty(object, ['adl', 'ADL'], mode === 'adl');
    setNestedProperty(object, ['suffix', 'addressMode'], mode);
  }
}

function resolveStepper(cpu, bus) {
  const stepNames = ['step', 'stepInstruction', 'executeInstruction', 'executeOne', 'cycle', 'tick', 'execute'];
  for (const name of stepNames) {
    if (typeof cpu?.[name] !== 'function') continue;
    const attempts = [
      () => cpu[name](),
      () => cpu[name](bus),
      () => cpu[name]({ bus }),
    ];
    for (const attempt of attempts) {
      try {
        attempt();
        return () => {
          const value = cpu[name]();
          return value;
        };
      } catch {
        // Try the next shape.
      }
    }
  }
  throw new Error('could not find a CPU step method');
}

function makeRunner(cpu, bus) {
  const step = resolveStepper(cpu, bus);

  return function runFrom(start, mode, { maxSteps, intercepts = [], hits = undefined, label = 'run' } = {}) {
    const interceptSet = new Set(intercepts.map((value) => value & 0xFFFFFF));
    const hitSet = hits ? new Set(Object.keys(hits).map((key) => Number(key))) : new Set();
    setAddressMode(cpu, mode);
    setPc(cpu, start);

    let lastPc = start & 0xFFFFFF;
    for (let count = 0; count < maxSteps; count += 1) {
      const pc = getPc(cpu);
      lastPc = pc;
      if (count > 0 && interceptSet.has(pc)) {
        return { label, steps: count, pc, hitIntercept: pc };
      }
      if (hitSet.has(pc)) hits[pc] += 1;
      step();
    }
    return { label, steps: maxSteps, pc: lastPc, hitIntercept: null };
  };
}

function snapshotMemory(read8, base, length) {
  const data = new Uint8Array(length);
  let unreadable = 0;
  for (let offset = 0; offset < length; offset += 1) {
    try {
      data[offset] = read8(base + offset);
    } catch {
      unreadable += 1;
    }
  }
  return { data, unreadable };
}

function diffSnapshots(before, after, base, limit = 64) {
  const samples = [];
  let changed = 0;
  const length = Math.min(before.data.length, after.data.length);
  for (let offset = 0; offset < length; offset += 1) {
    if (before.data[offset] !== after.data[offset]) {
      changed += 1;
      if (samples.length < limit) {
        samples.push({
          address: base + offset,
          before: before.data[offset],
          after: after.data[offset],
        });
      }
    }
  }
  return { changed, samples };
}

function write24(write8, address, value) {
  write8(address, value & 0xFF);
  write8(address + 1, (value >> 8) & 0xFF);
  write8(address + 2, (value >> 16) & 0xFF);
}

function setupCursorState(write8, cpu) {
  write8(0xD00092, 0x16);
  write8(0xD000C6, 0x01);
  write8(0xD00000, 0x00);
  write8(0xD00080, 0x18);
  write8(0xD00595, 0x00);
  write8(0xD00596, 0x00);
  write8(0xD0058B, 0x70);
  write24(write8, 0xD0059C, 0xD40000);

  setRegister(cpu, 'MBASE', 0xD0);
  setRegister(cpu, 'IY', 0xD00080);
}

async function main() {
  console.log('phase 482 cursor render decode probe');
  console.log(`template source: ${TEMPLATE_PATH}`);

  const templateSource = fs.readFileSync(TEMPLATE_PATH, 'utf8');
  console.log(`read template probe (${templateSource.length} bytes) before building this probe's runtime context`);

  const rom = fs.readFileSync(ROM_PATH);
  console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);

  for (const range of RANGES) dumpRange(rom, range);

  console.log('\n=== trace experiment setup ===');
  const modules = await loadCandidateModules(templateSource);
  console.log(`loaded ${modules.length} candidate emulator modules`);

  const createPeripheralBus = findExport(modules, 'createPeripheralBus');
  if (typeof createPeripheralBus !== 'function') {
    throw new Error('createPeripheralBus export not found in template imports/candidate emulator modules');
  }

  const bus = createPeripheralBus({ timerInterrupt: false });
  const cpu = await createCpuFromModules(modules, bus, rom);
  console.log(tryLoadRom(bus, cpu, rom));

  const { read8, write8 } = makeMemoryAdapter(bus, cpu);
  const runFrom = makeRunner(cpu, bus);

  for (const stage of BOOT_STAGES) {
    const result = runFrom(stage.start, 'adl', {
      maxSteps: stage.maxSteps,
      intercepts: stage.intercepts,
      label: stage.label,
    });
    const intercept = result.hitIntercept === null ? 'none' : hex(result.hitIntercept);
    console.log(`${stage.label}: start=${hex(stage.start)} steps=${result.steps} pc=${hex(result.pc)} intercept=${intercept}`);
  }

  setupCursorState(write8, cpu);
  const before = snapshotMemory(read8, VRAM_BASE, VRAM_LENGTH);

  const hits = Object.fromEntries(TRACE_HITS.map((address) => [address, 0]));
  const trace = runFrom(0x030173, 'adl', {
    maxSteps: 10000,
    hits,
    label: 'cursor render trace',
  });

  const after = snapshotMemory(read8, VRAM_BASE, VRAM_LENGTH);
  const diff = diffSnapshots(before, after, VRAM_BASE);

  console.log('\n=== trace results ===');
  console.log(`entry=0x030173 steps=${trace.steps} finalPC=${hex(trace.pc)}`);
  console.log('hit counts:');
  for (const address of TRACE_HITS) {
    console.log(`  ${hex(address)}: ${hits[address]}`);
  }

  console.log(`VRAM snapshot: base=${hex(VRAM_BASE)} length=${VRAM_LENGTH}`);
  console.log(`VRAM unreadable bytes: before=${before.unreadable} after=${after.unreadable}`);
  console.log(`VRAM changed bytes: ${diff.changed}`);
  for (const sample of diff.samples) {
    console.log(`  ${hex(sample.address)}: ${hex(sample.before, 2)} -> ${hex(sample.after, 2)}`);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
