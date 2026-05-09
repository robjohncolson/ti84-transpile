#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const KERNEL_INIT_REQUEST_PC = 0x000280;
const KERNEL_INIT_FALLBACK_PC = 0x020028;
const KERNEL_INIT_STEPS = 5000;
const KERNEL_INIT_LOOP_LIMIT = 10000;

const CALLER_TRACE_STEPS = 200;
const POST_WINDOW_SIZE = 20;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const D3F_START = 0xD3F000;
const D3F_END = 0xD3FFFF;
const TOP_ENTRY_START = 0xD3FFF7;

const D005F8 = 0xD005F8;
const D005F9 = 0xD005F9;
const D005FA = 0xD005FA;
const D005FB = 0xD005FB;
const D0259D = 0xD0259D;
const D025A3 = 0xD025A3;

const LOOKUP_KEY_FB = 0x01;
const LOOKUP_KEY_FA = 0x02;
const LOOKUP_KEY_F9 = 0x03;
const HANDLER_ADDRESS = 0x058241;
const FINDSYM_TARGET = 0x0846EA;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const DIRECT_CONTROL_OPS = new Map([
  [0xCD, { kind: 'call', label: 'CALL', condition: null }],
  [0xC3, { kind: 'jp', label: 'JP', condition: null }],
  [0xC4, { kind: 'call', label: 'CALL NZ', condition: 'nz' }],
  [0xCC, { kind: 'call', label: 'CALL Z', condition: 'z' }],
  [0xD4, { kind: 'call', label: 'CALL NC', condition: 'nc' }],
  [0xDC, { kind: 'call', label: 'CALL C', condition: 'c' }],
  [0xE4, { kind: 'call', label: 'CALL PO', condition: 'po' }],
  [0xEC, { kind: 'call', label: 'CALL PE', condition: 'pe' }],
  [0xF4, { kind: 'call', label: 'CALL P', condition: 'p' }],
  [0xFC, { kind: 'call', label: 'CALL M', condition: 'm' }],
  [0xC2, { kind: 'jp', label: 'JP NZ', condition: 'nz' }],
  [0xCA, { kind: 'jp', label: 'JP Z', condition: 'z' }],
  [0xD2, { kind: 'jp', label: 'JP NC', condition: 'nc' }],
  [0xDA, { kind: 'jp', label: 'JP C', condition: 'c' }],
  [0xE2, { kind: 'jp', label: 'JP PO', condition: 'po' }],
  [0xEA, { kind: 'jp', label: 'JP PE', condition: 'pe' }],
  [0xF2, { kind: 'jp', label: 'JP P', condition: 'p' }],
  [0xFA, { kind: 'jp', label: 'JP M', condition: 'm' }],
]);

const RET_OPS = new Map([
  [0xC9, { text: 'ret', condition: null }],
  [0xC0, { text: 'ret nz', condition: 'nz' }],
  [0xC8, { text: 'ret z', condition: 'z' }],
  [0xD0, { text: 'ret nc', condition: 'nc' }],
  [0xD8, { text: 'ret c', condition: 'c' }],
  [0xE0, { text: 'ret po', condition: 'po' }],
  [0xE8, { text: 'ret pe', condition: 'pe' }],
  [0xF0, { text: 'ret p', condition: 'p' }],
  [0xF8, { text: 'ret m', condition: 'm' }],
]);

const JR_OPS = new Map([
  [0x18, { text: 'jr', condition: null }],
  [0x20, { text: 'jr nz', condition: 'nz' }],
  [0x28, { text: 'jr z', condition: 'z' }],
  [0x30, { text: 'jr nc', condition: 'nc' }],
  [0x38, { text: 'jr c', condition: 'c' }],
  [0x10, { text: 'djnz', condition: 'b' }],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return `0x${((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatBytes(bytes) {
  return bytes.map((byte) => hexByte(byte)).join(' ');
}

function formatAddr(value, mode) {
  return hex(value, mode === 'z80' ? 4 : 6);
}

function sign8(value) {
  return (value & 0x80) ? value - 0x100 : value;
}

function readLeValue(bytes, offset, size) {
  let value = 0;
  for (let index = 0; index < size; index++) {
    value |= (bytes[offset + index] ?? 0) << (index * 8);
  }
  return value >>> 0;
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0)
    | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8)
    | ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function write16Raw(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase275-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function resolveKernelInitEntry(blocks) {
  const candidates = [
    { key: '000280:adl', pc: KERNEL_INIT_REQUEST_PC, mode: 'adl' },
    { key: '000280:z80', pc: KERNEL_INIT_REQUEST_PC, mode: 'z80' },
    { key: '020028:adl', pc: KERNEL_INIT_FALLBACK_PC, mode: 'adl' },
  ];

  for (const candidate of candidates) {
    if (blocks[candidate.key]) {
      return candidate;
    }
  }

  throw new Error('Unable to locate a lifted kernelInit block for 0x000280 or 0x020028.');
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function snapshotRuntime(cpu, mem) {
  return {
    cpu: snapshotCpu(cpu),
    memory: new Uint8Array(mem),
  };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  restoreCpu(cpu, snapshot.cpu);
}

function prepareScenarioState(cpu, mem, mode) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = mode === 'z80' ? 0 : 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;

  if (mode === 'z80') {
    const sps = ((STACK_TOP - 2) & 0xFFFF);
    cpu.sp = (STACK_TOP & 0xFF0000) | sps;
    write16Raw(mem, (cpu.mbase << 16) | sps, RETURN_SENTINEL & 0xFFFF);
  } else {
    cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;
    write24(mem, cpu.sp, RETURN_SENTINEL);
  }

  mem[D005F8 & MEM_MASK] = 0x00;
  mem[D005F9 & MEM_MASK] = LOOKUP_KEY_F9;
  mem[D005FA & MEM_MASK] = LOOKUP_KEY_FA;
  mem[D005FB & MEM_MASK] = LOOKUP_KEY_FB;
  write24(mem, D0259D, TOP_ENTRY_START);
  write24(mem, D025A3, D3F_END);

  mem.fill(0x00, D3F_START, D3F_END + 1);

  mem[(TOP_ENTRY_START + 0) & MEM_MASK] = LOOKUP_KEY_FB;
  mem[(TOP_ENTRY_START + 1) & MEM_MASK] = LOOKUP_KEY_FA;
  mem[(TOP_ENTRY_START + 2) & MEM_MASK] = LOOKUP_KEY_F9;
  mem[(TOP_ENTRY_START + 3) & MEM_MASK] = (HANDLER_ADDRESS >>> 16) & 0xFF;
  mem[(TOP_ENTRY_START + 4) & MEM_MASK] = (HANDLER_ADDRESS >>> 8) & 0xFF;
  mem[(TOP_ENTRY_START + 5) & MEM_MASK] = HANDLER_ADDRESS & 0xFF;
  mem[(TOP_ENTRY_START + 6) & MEM_MASK] = 0x00;
  mem[(TOP_ENTRY_START + 7) & MEM_MASK] = 0x00;
  mem[(TOP_ENTRY_START + 8) & MEM_MASK] = 0x00;
}

function keyFor(addr, mode) {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
}

function extractFirstInstruction(block) {
  const match = block?.source?.match(/\/\/\s*0x([0-9a-f]{6})\s+([0-9a-f ]+)\s+([^\n]+)/i);
  if (!match) {
    return null;
  }
  return {
    addr: parseInt(match[1], 16) >>> 0,
    bytes: match[2].trim().split(/\s+/).filter(Boolean),
    text: match[3].trim().toLowerCase(),
  };
}

function extractTargetFromText(text) {
  const match = String(text ?? '').match(/0x([0-9a-f]+)/i);
  return match ? parseInt(match[1], 16) >>> 0 : null;
}

function annotateLiftedSite(hit, blocks) {
  const adlBlock = blocks[keyFor(hit.address, 'adl')];
  const z80Block = blocks[keyFor(hit.address, 'z80')];
  const adlInstr = extractFirstInstruction(adlBlock);
  const z80Instr = extractFirstInstruction(z80Block);
  const adlTarget = extractTargetFromText(adlInstr?.text);
  const z80Target = extractTargetFromText(z80Instr?.text);

  hit.lifted = {
    adl: adlInstr ? `${adlInstr.text}` : null,
    z80: z80Instr ? `${z80Instr.text}` : null,
  };

  hit.executable = false;
  hit.runtimeMode = null;
  hit.runtimeReason = null;

  if (hit.scanMode === 'adl') {
    if (adlInstr && adlTarget === FINDSYM_TARGET) {
      hit.executable = true;
      hit.runtimeMode = 'adl';
      hit.runtimeReason = 'validated_adl_block';
      return;
    }

    if (z80Instr && z80Target === 0x46EA) {
      hit.runtimeReason = 'z80_block_uses_lower16_target';
      return;
    }

    hit.runtimeReason = adlInstr ? 'adl_block_targets_other_address' : 'no_exact_lifted_block';
    return;
  }

  if (z80Instr && z80Target === 0x46EA) {
    hit.executable = true;
    hit.runtimeMode = 'z80';
    hit.runtimeReason = 'validated_z80_block';
    return;
  }

  if (adlInstr) {
    hit.runtimeReason = `overlaps_adl_${adlInstr.text.replace(/\s+/g, '_')}`;
    return;
  }

  hit.runtimeReason = 'raw_lower16_match_only';
}

function scanRomForCallers(rom) {
  const hits = [];

  for (let addr = 0; addr < rom.length - 4; addr++) {
    const info = DIRECT_CONTROL_OPS.get(rom[addr]);
    if (!info) {
      continue;
    }

    if (rom[addr + 1] === 0xEA && rom[addr + 2] === 0x46 && rom[addr + 3] === 0x08) {
      const length = 4;
      hits.push({
        address: addr >>> 0,
        opcode: rom[addr],
        opName: info.label,
        opKind: info.kind,
        condition: info.condition,
        scanMode: 'adl',
        target: FINDSYM_TARGET,
        overlapTarget: null,
        rawBytes: Array.from(rom.slice(addr, addr + length)),
        postBytes: Array.from(rom.slice(addr + length, addr + length + POST_WINDOW_SIZE)),
      });
      continue;
    }

    if (rom[addr + 1] === 0xEA && rom[addr + 2] === 0x46) {
      const length = 3;
      hits.push({
        address: addr >>> 0,
        opcode: rom[addr],
        opName: `${info.label} (z80 lower-16 candidate)`,
        opKind: info.kind,
        condition: info.condition,
        scanMode: 'z80-candidate',
        target: 0x46EA,
        overlapTarget: readLeValue(rom, addr + 1, 3),
        rawBytes: Array.from(rom.slice(addr, addr + length)),
        postBytes: Array.from(rom.slice(addr + length, addr + length + POST_WINDOW_SIZE)),
      });
    }
  }

  return hits;
}

function decodeAbsoluteOp(bytes, offset, mode, info) {
  const addrSize = mode === 'z80' ? 2 : 3;
  if (offset + 1 + addrSize > bytes.length) {
    return null;
  }

  const target = readLeValue(bytes, offset + 1, addrSize);
  return {
    size: 1 + addrSize,
    text: `${info.label.toLowerCase()} ${formatAddr(target, mode)}`.trim(),
    tags: [
      info.kind,
      `${info.kind}_abs`,
      info.condition ? `${info.kind}_cond` : `${info.kind}_uncond`,
      info.condition ? `cond_${info.condition}` : 'cond_uncond',
    ],
    condition: info.condition,
    target,
  };
}

function decodeInstruction(bytes, offset, mode) {
  const direct = DIRECT_CONTROL_OPS.get(bytes[offset]);
  if (direct) {
    return decodeAbsoluteOp(bytes, offset, mode, direct);
  }

  const retInfo = RET_OPS.get(bytes[offset]);
  if (retInfo) {
    return {
      size: 1,
      text: retInfo.text,
      tags: ['ret', retInfo.condition ? 'ret_cond' : 'ret_uncond', retInfo.condition ? `cond_${retInfo.condition}` : 'cond_uncond'],
      condition: retInfo.condition,
      target: null,
    };
  }

  const jrInfo = JR_OPS.get(bytes[offset]);
  if (jrInfo && offset + 2 <= bytes.length) {
    const displacement = sign8(bytes[offset + 1]);
    const target = offset + 2 + displacement;
    return {
      size: 2,
      text: `${jrInfo.text} ${displacement >= 0 ? '+' : ''}${displacement} (rel ${target})`,
      tags: ['jr', jrInfo.condition ? 'jr_cond' : 'jr_uncond', jrInfo.condition ? `cond_${jrInfo.condition}` : 'cond_uncond'],
      condition: jrInfo.condition,
      target: null,
    };
  }

  switch (bytes[offset]) {
    case 0xD5:
      return { size: 1, text: 'push de', tags: ['push_de', 'uses_de'], condition: null, target: null };
    case 0xD1:
      return { size: 1, text: 'pop de', tags: ['pop_de', 'uses_de'], condition: null, target: null };
    case 0xE5:
      return { size: 1, text: 'push hl', tags: [], condition: null, target: null };
    case 0xE1:
      return { size: 1, text: 'pop hl', tags: [], condition: null, target: null };
    case 0xC5:
      return { size: 1, text: 'push bc', tags: [], condition: null, target: null };
    case 0xC1:
      return { size: 1, text: 'pop bc', tags: [], condition: null, target: null };
    case 0xF5:
      return { size: 1, text: 'push af', tags: [], condition: null, target: null };
    case 0xF1:
      return { size: 1, text: 'pop af', tags: [], condition: null, target: null };
    case 0xEB:
      return { size: 1, text: 'ex de, hl', tags: ['ex_de_hl', 'uses_de'], condition: null, target: null };
    case 0xE9:
      return { size: 1, text: 'jp (hl)', tags: ['jp_hl_indirect'], condition: null, target: null };
    case 0xAF:
      return { size: 1, text: 'xor a', tags: [], condition: null, target: null };
    case 0xB7:
      return { size: 1, text: 'or a', tags: [], condition: null, target: null };
    case 0x40:
      return { size: 1, text: 'ld b, b', tags: [], condition: null, target: null };
    case 0x3E:
      if (offset + 2 <= bytes.length) {
        return { size: 2, text: `ld a, ${hexByte(bytes[offset + 1])}`, tags: [], condition: null, target: null };
      }
      break;
    case 0x32:
    case 0x3A:
    case 0x21:
    case 0x11:
    case 0x01:
    case 0x31:
    case 0x22:
    case 0x2A: {
      const addrSize = mode === 'z80' ? 2 : 3;
      if (offset + 1 + addrSize <= bytes.length) {
        const value = readLeValue(bytes, offset + 1, addrSize);
        const texts = {
          0x32: `ld (${formatAddr(value, mode)}), a`,
          0x3A: `ld a, (${formatAddr(value, mode)})`,
          0x21: `ld hl, ${formatAddr(value, mode)}`,
          0x11: `ld de, ${formatAddr(value, mode)}`,
          0x01: `ld bc, ${formatAddr(value, mode)}`,
          0x31: `ld sp, ${formatAddr(value, mode)}`,
          0x22: `ld (${formatAddr(value, mode)}), hl`,
          0x2A: `ld hl, (${formatAddr(value, mode)})`,
        };
        const tags = bytes[offset] === 0x11 ? ['uses_de'] : [];
        return { size: 1 + addrSize, text: texts[bytes[offset]], tags, condition: null, target: null };
      }
      break;
    }
    case 0xCB:
      if (offset + 2 <= bytes.length) {
        return { size: 2, text: `cb ${hexByte(bytes[offset + 1])}`, tags: [], condition: null, target: null };
      }
      break;
    case 0xED: {
      if (offset + 2 > bytes.length) {
        break;
      }
      const op2 = bytes[offset + 1];
      const addrSize = mode === 'z80' ? 2 : 3;
      const storeLoadOps = new Map([
        [0x43, { text: 'ld (%ADDR%), bc', tags: [] }],
        [0x4B, { text: 'ld bc, (%ADDR%)', tags: [] }],
        [0x53, { text: 'ld (%ADDR%), de', tags: ['ld_mem_de', 'uses_de'] }],
        [0x5B, { text: 'ld de, (%ADDR%)', tags: ['uses_de'] }],
        [0x63, { text: 'ld (%ADDR%), hl', tags: [] }],
        [0x6B, { text: 'ld hl, (%ADDR%)', tags: [] }],
        [0x73, { text: 'ld (%ADDR%), sp', tags: [] }],
        [0x7B, { text: 'ld sp, (%ADDR%)', tags: [] }],
      ]);
      const spec = storeLoadOps.get(op2);
      if (spec && offset + 2 + addrSize <= bytes.length) {
        const target = readLeValue(bytes, offset + 2, addrSize);
        return {
          size: 2 + addrSize,
          text: spec.text.replace('%ADDR%', formatAddr(target, mode)),
          tags: spec.tags,
          condition: null,
          target: null,
        };
      }
      return { size: 2, text: `ed ${hexByte(op2)}`, tags: [], condition: null, target: null };
    }
    case 0xDD:
    case 0xFD: {
      const prefixName = bytes[offset] === 0xDD ? 'ix' : 'iy';
      if (offset + 2 > bytes.length) {
        break;
      }
      const op2 = bytes[offset + 1];
      if (op2 === 0xCB && offset + 4 <= bytes.length) {
        return {
          size: 4,
          text: `${prefixName}cb ${hexByte(bytes[offset + 2])} ${hexByte(bytes[offset + 3])}`,
          tags: [],
          condition: null,
          target: null,
        };
      }
      if ((op2 === 0x21 || op2 === 0x22 || op2 === 0x2A) && offset + 2 + (mode === 'z80' ? 2 : 3) <= bytes.length) {
        const addrSize = mode === 'z80' ? 2 : 3;
        const value = readLeValue(bytes, offset + 2, addrSize);
        const textMap = {
          0x21: `ld ${prefixName}, ${formatAddr(value, mode)}`,
          0x22: `ld (${formatAddr(value, mode)}), ${prefixName}`,
          0x2A: `ld ${prefixName}, (${formatAddr(value, mode)})`,
        };
        return { size: 2 + addrSize, text: textMap[op2], tags: [], condition: null, target: null };
      }
      return { size: 2, text: `${prefixName} ${hexByte(op2)}`, tags: [], condition: null, target: null };
    }
    default:
      return { size: 1, text: `db ${hexByte(bytes[offset])}`, tags: [], condition: null, target: null };
  }

  return { size: 1, text: `db ${hexByte(bytes[offset])}`, tags: [], condition: null, target: null };
}

function decodeWindow(bytes, mode) {
  const instructions = [];
  let offset = 0;

  while (offset < bytes.length) {
    const instruction = decodeInstruction(bytes, offset, mode);
    if (!instruction || instruction.size <= 0) {
      break;
    }
    instructions.push({
      offset,
      ...instruction,
    });
    offset += instruction.size;
  }

  return instructions;
}

function analyzePostInstructions(instructions) {
  const signals = [];
  const dispatchMechanisms = [];
  const deTouches = [];

  if (instructions.length > 0) {
    const first = instructions[0];
    if (first.condition) {
      signals.push(`immediate ${first.text} depends on 0x0846EA flags`);
    }
  }

  for (let index = 0; index < instructions.length; index++) {
    const instruction = instructions[index];
    const next = instructions[index + 1];

    if (instruction.tags.includes('push_de')) {
      deTouches.push('push de');
      const retIndex = instructions.slice(index + 1).findIndex((item) => item.tags.includes('ret'));
      if (retIndex !== -1) {
        dispatchMechanisms.push('push de + ret stack-dispatch');
      }
    }

    if (instruction.tags.includes('ex_de_hl')) {
      deTouches.push('ex de, hl');
      if (next?.tags.includes('jp_hl_indirect')) {
        dispatchMechanisms.push('ex de, hl + jp (hl) indirect-dispatch');
      }
    }

    if (instruction.tags.includes('ld_mem_de')) {
      deTouches.push('ld (nn), de');
      dispatchMechanisms.push('stores handler from de to memory');
    }
  }

  if (dispatchMechanisms.length === 0 && deTouches.length === 0) {
    signals.push('no direct DE use in first 20 bytes');
  } else if (dispatchMechanisms.length === 0 && deTouches.length > 0) {
    signals.push(`DE touched without an immediate dispatch pattern: ${[...new Set(deTouches)].join(', ')}`);
  }

  return {
    signals,
    dispatchMechanisms: [...new Set(dispatchMechanisms)],
  };
}

function runDynamicTrace(executor, cpu, mem, bootSnapshot, hit) {
  restoreRuntime(cpu, mem, bootSnapshot);
  prepareScenarioState(cpu, mem, hit.runtimeMode);

  const seenBlocks = new Set();
  const blockOrder = [];
  const dynamicTargets = [];
  let reachedHandler = false;
  let firstHandlerStep = null;

  const result = executor.runFrom(hit.address, hit.runtimeMode, {
    maxSteps: CALLER_TRACE_STEPS,
    maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
    onBlock(pc, mode, _meta, step) {
      const blockKey = `${hex(pc)}:${mode}`;
      if (!seenBlocks.has(blockKey)) {
        seenBlocks.add(blockKey);
        blockOrder.push(blockKey);
      }
      if (!reachedHandler && (pc >>> 0) === HANDLER_ADDRESS) {
        reachedHandler = true;
        firstHandlerStep = step;
      }
    },
    onDynamicTarget(target, mode, pc, step) {
      dynamicTargets.push({
        target: target >>> 0,
        mode,
        fromPc: pc >>> 0,
        step,
      });
      if (!reachedHandler && (target >>> 0) === HANDLER_ADDRESS) {
        reachedHandler = true;
        firstHandlerStep = step;
      }
    },
  });

  return {
    status: 'ran',
    reachedHandler,
    firstHandlerStep,
    termination: result.termination,
    steps: result.steps,
    lastPc: result.lastPc >>> 0,
    lastMode: result.lastMode,
    missingBlocks: result.missingBlocks,
    dynamicTargets: dynamicTargets.map((entry) => ({
      target: hex(entry.target),
      mode: entry.mode,
      fromPc: hex(entry.fromPc),
      step: entry.step,
    })),
    blockOrder,
  };
}

function compactHitSummary(hit) {
  return {
    address: hex(hit.address),
    scanMode: hit.scanMode,
    opName: hit.opName,
    rawBytes: formatBytes(hit.rawBytes),
    postBytes: formatBytes(hit.postBytes),
    lifted: hit.lifted,
    runtimeMode: hit.runtimeMode,
    runtimeReason: hit.runtimeReason,
    postInstructions: hit.postInstructions.map((instruction) => instruction.text),
    analysis: hit.analysis,
    dynamic: hit.dynamic?.status === 'ran'
      ? {
          status: hit.dynamic.status,
          reachedHandler: hit.dynamic.reachedHandler,
          firstHandlerStep: hit.dynamic.firstHandlerStep,
          termination: hit.dynamic.termination,
          steps: hit.dynamic.steps,
          lastPc: hex(hit.dynamic.lastPc),
          lastMode: hit.dynamic.lastMode,
          firstBlocks: hit.dynamic.blockOrder.slice(0, 10),
          firstDynamicTargets: hit.dynamic.dynamicTargets.slice(0, 10),
        }
      : hit.dynamic,
  };
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    const hits = scanRomForCallers(rom);
    for (const hit of hits) {
      annotateLiftedSite(hit, blocks);
      const decodeMode = hit.scanMode === 'z80-candidate' ? 'z80' : 'adl';
      hit.postInstructions = decodeWindow(hit.postBytes, decodeMode);
      hit.analysis = analyzePostInstructions(hit.postInstructions);
    }

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    const kernelInit = resolveKernelInitEntry(blocks);
    const bootResult = executor.runFrom(kernelInit.pc, kernelInit.mode, {
      maxSteps: KERNEL_INIT_STEPS,
      maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
    });
    const bootSnapshot = snapshotRuntime(cpu, mem);

    for (const hit of hits) {
      if (hit.executable && hit.runtimeMode === 'adl') {
        hit.dynamic = runDynamicTrace(executor, cpu, mem, bootSnapshot, hit);
      } else if (hit.executable && hit.runtimeMode === 'z80') {
        hit.dynamic = {
          status: 'skipped',
          reason: 'z80-mode caller validation exists, but this probe leaves z80 MBASE-dependent dispatch unresolved',
        };
      } else {
        hit.dynamic = {
          status: 'skipped',
          reason: hit.runtimeReason,
        };
      }
    }

    const adlHits = hits.filter((hit) => hit.scanMode === 'adl');
    const z80Candidates = hits.filter((hit) => hit.scanMode === 'z80-candidate');
    const executableAdlHits = hits.filter((hit) => hit.executable && hit.runtimeMode === 'adl');
    const reachedHandlerHits = hits.filter((hit) => hit.dynamic?.status === 'ran' && hit.dynamic.reachedHandler);
    const directMechanismHits = hits.filter((hit) => hit.analysis.dispatchMechanisms.length > 0);

    console.log('=== Phase 275: 0x0846EA Caller Trace ===');
    console.log(
      `kernelInit=${hex(kernelInit.pc)}:${kernelInit.mode}`
      + ` steps=${bootResult.steps} term=${bootResult.termination}`
      + ` lastPc=${hex(bootResult.lastPc)}:${bootResult.lastMode}`
    );
    console.log(
      `synthetic dispatch entry=${hex(TOP_ENTRY_START)} handler=${hex(HANDLER_ADDRESS)}`
      + ` key=[${hexByte(LOOKUP_KEY_FB)} ${hexByte(LOOKUP_KEY_FA)} ${hexByte(LOOKUP_KEY_F9)}]`
    );
    console.log(
      `static hits: adl=${adlHits.length} z80_lower16_candidates=${z80Candidates.length}`
      + ` executable_adl=${executableAdlHits.length}`
      + ` dynamic_reached_handler=${reachedHandlerHits.length}`
      + ` direct_mechanism_sites=${directMechanismHits.length}`
    );

    console.log('\n--- ADL Static Hits ---');
    for (const hit of adlHits) {
      console.log(
        `${hex(hit.address)} ${hit.opName} raw=[${formatBytes(hit.rawBytes)}]`
        + ` post=[${formatBytes(hit.postBytes)}]`
      );
      console.log(`  lifted adl=${hit.lifted.adl ?? 'none'} z80=${hit.lifted.z80 ?? 'none'}`);
      console.log(`  post-return: ${hit.postInstructions.map((instruction) => instruction.text).join(' | ')}`);
      console.log(`  analysis: ${[...hit.analysis.dispatchMechanisms, ...hit.analysis.signals].join(' ; ') || 'none'}`);
      if (hit.dynamic.status === 'ran') {
        console.log(
          `  dynamic: reachedHandler=${hit.dynamic.reachedHandler}`
          + ` term=${hit.dynamic.termination}`
          + ` steps=${hit.dynamic.steps}`
          + ` last=${hex(hit.dynamic.lastPc)}:${hit.dynamic.lastMode}`
        );
        if (hit.dynamic.dynamicTargets.length > 0) {
          console.log(
            `  dynamic-targets: ${hit.dynamic.dynamicTargets.slice(0, 8).map((entry) => `${entry.target}@${entry.step}`).join(', ')}`
          );
        }
      } else {
        console.log(`  dynamic: skipped (${hit.dynamic.reason})`);
      }
    }

    console.log('\n--- Z80 Lower-16 Candidates ---');
    for (const hit of z80Candidates) {
      console.log(
        `${hex(hit.address)} ${hit.opName} raw=[${formatBytes(hit.rawBytes)}]`
        + ` overlap-adl-target=${hex(hit.overlapTarget)}`
        + ` post=[${formatBytes(hit.postBytes)}]`
      );
      console.log(`  lifted adl=${hit.lifted.adl ?? 'none'} z80=${hit.lifted.z80 ?? 'none'}`);
      console.log(`  post-return: ${hit.postInstructions.map((instruction) => instruction.text).join(' | ')}`);
      console.log(`  analysis: ${[...hit.analysis.dispatchMechanisms, ...hit.analysis.signals].join(' ; ') || 'none'}`);
      console.log(`  dynamic: skipped (${hit.dynamic.reason})`);
    }

    console.log('\nsummary:');
    console.log(JSON.stringify({
      phase: 275,
      target: hex(FINDSYM_TARGET),
      handler: hex(HANDLER_ADDRESS),
      counts: {
        adlHits: adlHits.length,
        z80Lower16Candidates: z80Candidates.length,
        executableAdlHits: executableAdlHits.length,
        reachedHandlerHits: reachedHandlerHits.length,
        directMechanismHits: directMechanismHits.length,
      },
      callers: hits.map(compactHitSummary),
    }, null, 2));
  } finally {
    cleanupTranspiledModule(assets);
  }
}

await main();
