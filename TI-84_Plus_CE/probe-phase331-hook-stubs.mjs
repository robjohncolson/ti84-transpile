#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const rom = fs.readFileSync(ROM_PATH);
const transpiledGzip = fs.readFileSync(TRANSPILED_GZ_PATH);
const transpiledText = gunzipSync(transpiledGzip).toString('utf8');
const romModule = await import(pathToFileURL(TRANSPILED_JS_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const IY_BASE = 0xD00080;
const SLOT_RANGE_START = 0xD025D5;
const SLOT_RANGE_END = 0xD02614;
const FLAG_RANGE_START = IY_BASE + 52;
const FLAG_RANGE_END = IY_BASE + 55;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const TARGET_STUB_START = 0x023B31;
const TARGET_STUB_END_EXCLUSIVE = 0x023BDC;

const HOOK_GROUPS = {
  52: { byteName: 'hookflags2', flagAddr: IY_BASE + 52 },
  53: { byteName: 'hookflags3', flagAddr: IY_BASE + 53 },
  54: { byteName: 'hookflags4', flagAddr: IY_BASE + 54 },
};

export const REGISTRATION_STUBS = [
  {
    index: 1,
    entry: 0x023B31,
    slot: 0xD025D8,
    slotName: 'libraryHookPtr',
    hookName: 'library',
    iyDisp: 52,
    bit: 1,
    flagName: 'libraryHookActive',
  },
  {
    index: 2,
    entry: 0x023B3A,
    slot: 0xD0260B,
    slotName: 'catalog2HookPtr',
    hookName: 'catalog2',
    iyDisp: 52,
    bit: 6,
    flagName: 'catalog2HookActive',
  },
  {
    index: 3,
    entry: 0x023B43,
    slot: 0xD025DE,
    slotName: 'getKeyHookPtr',
    hookName: 'getCSC',
    iyDisp: 52,
    bit: 0,
    flagName: 'getCSCHookActive',
  },
  {
    index: 4,
    entry: 0x023B4C,
    slot: 0xD025D5,
    slotName: 'cursorHookPtr',
    hookName: 'cursor',
    iyDisp: 52,
    bit: 7,
    flagName: 'cursorHookActive',
  },
  {
    index: 5,
    entry: 0x023B55,
    slot: 0xD025DB,
    slotName: 'rawKeyHookPtr',
    hookName: 'rawKey',
    iyDisp: 52,
    bit: 5,
    flagName: 'rawKeyHookActive',
  },
  {
    index: 6,
    entry: 0x023B5E,
    slot: 0xD0260E,
    slotName: 'tokenHookPtr',
    hookName: 'token',
    iyDisp: 53,
    bit: 0,
    flagName: 'tokenHookActive',
  },
  {
    index: 7,
    entry: 0x023B67,
    slot: 0xD02611,
    slotName: 'localizeHookPtr',
    hookName: 'localize',
    iyDisp: 53,
    bit: 1,
    flagName: 'localizeHookActive',
  },
  {
    index: 8,
    entry: 0x023B70,
    slot: 0xD025E1,
    slotName: 'homescreenHookPtr',
    hookName: 'homescreen',
    iyDisp: 52,
    bit: 4,
    flagName: 'homescreenHookActive',
  },
  {
    index: 9,
    entry: 0x023B79,
    slot: 0xD025E4,
    slotName: 'windowHookPtr',
    hookName: 'window',
    iyDisp: 53,
    bit: 2,
    flagName: 'windowHookActive',
  },
  {
    index: 10,
    entry: 0x023B82,
    slot: 0xD025E7,
    slotName: 'graphHookPtr',
    hookName: 'graph',
    iyDisp: 53,
    bit: 3,
    flagName: 'graphHookActive',
  },
  {
    index: 11,
    entry: 0x023B8B,
    slot: 0xD025EA,
    slotName: 'yEqualsHookPtr',
    hookName: 'y=',
    iyDisp: 53,
    bit: 4,
    flagName: 'yEquHookActive',
  },
  {
    index: 12,
    entry: 0x023B94,
    slot: 0xD025ED,
    slotName: 'fontHookPtr',
    hookName: 'font',
    iyDisp: 53,
    bit: 5,
    flagName: 'fontHookActive',
  },
  {
    index: 13,
    entry: 0x023B9D,
    slot: 0xD025F0,
    slotName: 'regraphHookPtr',
    hookName: 'regraph',
    iyDisp: 53,
    bit: 6,
    flagName: 'regraphHookActive',
  },
  {
    index: 14,
    entry: 0x023BA6,
    slot: 0xD025F6,
    slotName: 'traceHookPtr',
    hookName: 'trace',
    iyDisp: 54,
    bit: 0,
    flagName: 'traceHookActive',
  },
  {
    index: 15,
    entry: 0x023BAF,
    slot: 0xD025F9,
    slotName: 'parserHookPtr',
    hookName: 'parser',
    iyDisp: 54,
    bit: 1,
    flagName: 'parserHookActive',
  },
  {
    index: 16,
    entry: 0x023BB8,
    slot: 0xD025FC,
    slotName: 'appChangeHookPtr',
    hookName: 'appChange',
    iyDisp: 54,
    bit: 2,
    flagName: 'appChangeHookActive',
  },
  {
    index: 17,
    entry: 0x023BC1,
    slot: 0xD025F3,
    slotName: 'graphicsHookPtr',
    hookName: 'graphics/drawing',
    iyDisp: 53,
    bit: 7,
    flagName: 'drawingHookActive',
  },
  {
    index: 18,
    entry: 0x023BCA,
    slot: 0xD025FF,
    slotName: 'catalog1HookPtr',
    hookName: 'catalog1',
    iyDisp: 54,
    bit: 3,
    flagName: 'catalog1HookActive',
  },
  {
    index: 19,
    entry: 0x023BD3,
    slot: 0xD02602,
    slotName: 'helpHookPtr',
    hookName: 'help',
    iyDisp: 54,
    bit: 4,
    flagName: 'helpHookActive',
  },
];

const ADJACENT_SIBLINGS = [
  {
    entry: 0x023BDC,
    slot: 0xD02605,
    slotName: 'cxRedispHookPtr',
    iyDisp: 54,
    bit: 5,
    flagName: 'cxRedispHookActive',
  },
  {
    entry: 0x023BE5,
    slot: 0xD02608,
    slotName: 'menuHookPtr',
    iyDisp: 54,
    bit: 6,
    flagName: 'menuHookActive',
  },
  {
    entry: 0x023BEE,
    slot: 0xD02617,
    slotName: 'silentLinkHookPtr',
    iyDisp: 54,
    bit: 7,
    flagName: 'silentLinkHookActive',
  },
];

const STUB_SET = new Set(REGISTRATION_STUBS.map((stub) => stub.entry));
const SLOT_TO_STUB = new Map(REGISTRATION_STUBS.map((stub) => [stub.slot, stub]));
const EDGE_TAGS = new Set(['call', 'call-conditional', 'jp', 'jp-conditional']);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function lowerHex(value, width = 6) {
  return (Number(value) >>> 0).toString(16).padStart(width, '0');
}

function hb(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function blockKey(addr, mode = 'adl') {
  return `${lowerHex(addr)}:${mode}`;
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while (true) {
    const hit = haystack.indexOf(needle, offset);
    if (hit < 0) break;
    count++;
    offset = hit + needle.length;
  }
  return count;
}

function decodeStub(entry) {
  const block = BLOCKS[blockKey(entry)];
  if (block?.instructions?.length) {
    return block.instructions.map((inst) => ({
      pc: inst.pc,
      bytes: inst.bytes,
      dasm: inst.dasm,
      tag: inst.tag,
    }));
  }

  const decoded = [];
  let pc = entry;
  for (let i = 0; i < 4; i++) {
    const inst = decodeInstruction(rom, pc, 'adl');
    decoded.push({
      pc: inst.pc,
      bytes: inst.bytes ?? '',
      dasm: inst.dasm ?? inst.tag,
      tag: inst.tag,
    });
    pc = inst.nextPc ?? (inst.pc + inst.length);
    if (inst.tag === 'ret') break;
  }
  return decoded;
}

function findCallerSites() {
  const byStub = new Map(REGISTRATION_STUBS.map((stub) => [stub.entry, new Map()]));

  for (const [id, block] of Object.entries(BLOCKS)) {
    for (const inst of block.instructions ?? []) {
      if (!EDGE_TAGS.has(inst.tag) || !STUB_SET.has(inst.target)) {
        continue;
      }

      const sites = byStub.get(inst.target);
      const site = sites.get(inst.pc) ?? {
        pc: inst.pc,
        dasm: inst.dasm,
        blockIds: new Set(),
      };
      site.blockIds.add(id);
      sites.set(inst.pc, site);
    }
  }

  return new Map(
    [...byStub.entries()].map(([entry, sites]) => [
      entry,
      [...sites.values()]
        .map((site) => ({
          pc: site.pc,
          dasm: site.dasm,
          blockIds: [...site.blockIds].sort(),
        }))
        .sort((a, b) => a.pc - b.pc),
    ]),
  );
}

function touchesHookSlot(addr, length) {
  const start = addr >>> 0;
  const end = (addr + Math.max(length, 1) - 1) >>> 0;
  if (end < SLOT_RANGE_START || start >= SLOT_RANGE_END) {
    return false;
  }
  return true;
}

function overlapsSlotRange(addr, length, slot) {
  const start = addr >>> 0;
  const end = (addr + Math.max(length, 1) - 1) >>> 0;
  const slotEnd = slot + 2;
  return !(end < slot || start > slotEnd);
}

function bumpConst(value, delta) {
  if (value === null || value === undefined) return null;
  return (value + delta) & 0xFFFFFF;
}

function collectWriteRecords() {
  const records = [];

  for (const [id, block] of Object.entries(BLOCKS)) {
    const regs = { hl: null, de: null, bc: null };

    for (const inst of block.instructions ?? []) {
      switch (inst.tag) {
        case 'ld-pair-imm': {
          const pair = String(inst.pair ?? '').toLowerCase();
          if (pair in regs) {
            regs[pair] = inst.value ?? null;
          }
          break;
        }

        case 'ld-pair-mem': {
          if (inst.direction === 'to-mem') {
            records.push({
              blockId: id,
              blockPc: block.startPc,
              pc: inst.pc,
              kind: 'direct24',
              addr: inst.addr,
              length: 3,
              dasm: inst.dasm,
            });
          } else {
            const pair = String(inst.pair ?? '').toLowerCase();
            if (pair in regs) {
              regs[pair] = null;
            }
          }
          break;
        }

        case 'ld-mem-reg':
          records.push({
            blockId: id,
            blockPc: block.startPc,
            pc: inst.pc,
            kind: 'direct8',
            addr: inst.addr,
            length: 1,
            dasm: inst.dasm,
          });
          break;

        case 'ld-ind-imm':
        case 'ld-ind-reg':
          if (regs.hl !== null) {
            records.push({
              blockId: id,
              blockPc: block.startPc,
              pc: inst.pc,
              kind: 'indirect8',
              addr: regs.hl,
              length: 1,
              dasm: inst.dasm,
            });
          }
          break;

        case 'inc-pair': {
          const pair = String(inst.pair ?? '').toLowerCase();
          if (pair in regs) {
            regs[pair] = bumpConst(regs[pair], 1);
          }
          break;
        }

        case 'dec-pair': {
          const pair = String(inst.pair ?? '').toLowerCase();
          if (pair in regs) {
            regs[pair] = bumpConst(regs[pair], -1);
          }
          break;
        }

        case 'ex-de-hl': {
          const temp = regs.de;
          regs.de = regs.hl;
          regs.hl = temp;
          break;
        }

        case 'ldir': {
          if (regs.de !== null && regs.bc !== null && regs.bc > 0) {
            records.push({
              blockId: id,
              blockPc: block.startPc,
              pc: inst.pc,
              kind: 'ldir',
              addr: regs.de,
              length: regs.bc,
              dasm: inst.dasm,
            });
          }
          regs.de = regs.de !== null && regs.bc !== null ? bumpConst(regs.de, regs.bc) : null;
          regs.hl = regs.hl !== null && regs.bc !== null ? bumpConst(regs.hl, regs.bc) : null;
          regs.bc = 0;
          break;
        }

        case 'pop': {
          const pair = String(inst.pair ?? inst.reg ?? inst.dest ?? '').toLowerCase();
          if (pair in regs) {
            regs[pair] = null;
          }
          break;
        }

        case 'ld-pair-ind':
        case 'ld-pair-indexed': {
          const pair = String(inst.pair ?? '').toLowerCase();
          if (pair in regs) {
            regs[pair] = null;
          }
          break;
        }

        case 'add-pair': {
          const pair = String(inst.dest ?? '').toLowerCase();
          if (pair in regs) {
            regs[pair] = null;
          }
          break;
        }

        case 'sbc-pair':
          regs.hl = null;
          break;

        default:
          break;
      }
    }
  }

  return records.filter((record) => touchesHookSlot(record.addr, record.length));
}

function describeExtraWriter(record) {
  if (record.blockPc === 0x0297CE) {
    return 'boot/init clear range';
  }
  if (record.blockPc === 0x09A26C) {
    return 'explicit 3-byte clear';
  }
  if (record.kind === 'ldir' && record.length === 3) {
    return 'direct 3-byte slot copy';
  }
  if (record.kind === 'ldir') {
    return `range copy (${record.length} bytes)`;
  }
  if (record.kind === 'direct24') {
    return 'direct 24-bit write';
  }
  return 'direct byte write';
}

function findExtraSlotWriters() {
  const writeRecords = collectWriteRecords();
  const perSlot = new Map(REGISTRATION_STUBS.map((stub) => [stub.slot, new Map()]));

  for (const record of writeRecords) {
    for (const stub of REGISTRATION_STUBS) {
      if (record.blockPc === stub.entry) {
        continue;
      }
      if (!overlapsSlotRange(record.addr, record.length, stub.slot)) {
        continue;
      }

      const bucket = perSlot.get(stub.slot);
      const writer = bucket.get(record.blockId) ?? {
        blockId: record.blockId,
        blockPc: record.blockPc,
        kinds: new Set(),
        pcs: new Set(),
      };
      writer.kinds.add(describeExtraWriter(record));
      writer.pcs.add(record.pc);
      bucket.set(record.blockId, writer);
    }
  }

  return new Map(
    [...perSlot.entries()].map(([slot, writers]) => [
      slot,
      [...writers.values()]
        .map((writer) => ({
          blockId: writer.blockId,
          blockPc: writer.blockPc,
          kinds: [...writer.kinds].sort(),
          pcs: [...writer.pcs].sort((a, b) => a - b),
        }))
        .sort((a, b) => a.blockPc - b.blockPc),
    ]),
  );
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function summarizeObservedWrites(logs) {
  const bySite = new Map();
  for (const log of logs) {
    const key = `${log.kind}:${log.pc}:${log.addr}`;
    const site = bySite.get(key) ?? {
      kind: log.kind,
      pc: log.pc,
      addr: log.addr,
      count: 0,
      lastValue: log.value,
    };
    site.count++;
    site.lastValue = log.value;
    bySite.set(key, site);
  }
  return [...bySite.values()].sort((a, b) => a.pc - b.pc || a.addr - b.addr);
}

function runBootProbe() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  const cpu = executor.cpu;

  const slotWrites = [];
  const flagWrites = [];
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const resolved = addr & cpu._memMask;
    if (resolved >= SLOT_RANGE_START && resolved < SLOT_RANGE_END) {
      slotWrites.push({
        kind: 'write8',
        pc: cpu._currentBlockPc ?? 0,
        addr: resolved,
        value: value & 0xFF,
      });
    }
    if (resolved >= FLAG_RANGE_START && resolved < FLAG_RANGE_END) {
      flagWrites.push({
        kind: 'write8',
        pc: cpu._currentBlockPc ?? 0,
        addr: resolved,
        value: value & 0xFF,
      });
    }
    return originalWrite8(addr, value);
  };

  cpu.write24 = (addr, value) => {
    const resolved = addr & cpu._memMask;
    if (resolved >= SLOT_RANGE_START && resolved + 2 < SLOT_RANGE_END) {
      slotWrites.push({
        kind: 'write24',
        pc: cpu._currentBlockPc ?? 0,
        addr: resolved,
        value: value & 0xFFFFFF,
      });
    }
    return originalWrite24(addr, value);
  };

  coldBoot(executor, cpu, mem);

  const slotStates = REGISTRATION_STUBS.map((stub) => ({
    ...stub,
    ptr: read24(mem, stub.slot),
  }));

  const flagStates = {
    52: mem[IY_BASE + 52],
    53: mem[IY_BASE + 53],
    54: mem[IY_BASE + 54],
  };

  const activeHooks = slotStates.filter((stub) => {
    const flagByte = flagStates[stub.iyDisp];
    return stub.ptr !== 0 || ((flagByte >> stub.bit) & 1) !== 0;
  });

  return {
    slotStates,
    flagStates,
    slotWrites: summarizeObservedWrites(slotWrites),
    flagWrites: summarizeObservedWrites(flagWrites),
    activeHooks,
  };
}

function analyzeStatic() {
  const callerSites = findCallerSites();
  const extraSlotWriters = findExtraSlotWriters();

  const stubs = REGISTRATION_STUBS.map((stub) => {
    const group = HOOK_GROUPS[stub.iyDisp];
    const liftedNeedle = `function block_${lowerHex(stub.entry)}_adl(cpu)`;
    const callerNeedle = `return 0x${lowerHex(stub.entry)}`;
    return {
      ...stub,
      flagAddr: group.flagAddr,
      flagByteName: group.byteName,
      liftedBlockPresent: transpiledText.includes(liftedNeedle),
      callerTextHits: countOccurrences(transpiledText, callerNeedle),
      disasm: decodeStub(stub.entry),
      callers: callerSites.get(stub.entry) ?? [],
      extraWriters: extraSlotWriters.get(stub.slot) ?? [],
    };
  });

  return {
    stubs,
    adjacentSiblings: ADJACENT_SIBLINGS,
  };
}

function formatCallerSite(site) {
  const blockSuffix = site.blockIds.length > 1
    ? ` via [${site.blockIds.join(', ')}]`
    : ` via ${site.blockIds[0]}`;
  return `${hex(site.pc)} ${site.dasm}${blockSuffix}`;
}

function formatWriter(writer) {
  const kind = writer.kinds.join(', ');
  return `${hex(writer.blockPc)} ${kind} via ${writer.blockId}`;
}

function printStaticReport(staticResult) {
  console.log('=== Phase 331 Hook Registration Stub Probe ===');
  console.log(`ROM.transpiled.js.gz: ${transpiledGzip.length} bytes compressed, ${transpiledText.length} bytes decompressed`);
  console.log(`PRELIFTED_BLOCKS: ${Object.keys(BLOCKS).length} blocks`);
  console.log(`Target window: [${hex(TARGET_STUB_START)}, ${hex(TARGET_STUB_END_EXCLUSIVE)}) => ${REGISTRATION_STUBS.length} stubs`);
  console.log(
    `Adjacent sibling outside the 19-stub window: ${hex(ADJACENT_SIBLINGS[0].entry)} ` +
    `(${ADJACENT_SIBLINGS[0].slotName}, ${ADJACENT_SIBLINGS[0].flagName})`,
  );
  console.log();

  for (const stub of staticResult.stubs) {
    const code = stub.disasm.map((inst) => inst.dasm).join(' ; ');
    console.log(
      `[${String(stub.index).padStart(2, '0')}] ${hex(stub.entry)} -> ${stub.slotName} ${hex(stub.slot)} ` +
      `(${stub.hookName})`,
    );
    console.log(
      `     flag: ${stub.flagByteName} ${hex(stub.flagAddr)} bit ${stub.bit} -> ${stub.flagName}`,
    );
    console.log(`     code: ${code}`);
    console.log(
      `     lifted block: ${stub.liftedBlockPresent ? 'yes' : 'no'} ` +
      `(return-edge hits in gunzipped JS: ${stub.callerTextHits})`,
    );

    if (stub.callers.length === 0) {
      console.log('     callers: none in PRELIFTED_BLOCKS');
    } else {
      console.log(`     callers (${stub.callers.length} unique sites):`);
      for (const site of stub.callers) {
        console.log(`       ${formatCallerSite(site)}`);
      }
    }

    if (stub.extraWriters.length === 0) {
      console.log('     extra direct slot writers: none beyond the registration stub');
    } else {
      console.log('     extra direct slot writers:');
      for (const writer of stub.extraWriters) {
        console.log(`       ${formatWriter(writer)}`);
      }
    }

    console.log();
  }

  console.log('Adjacent siblings outside the 19-stub target set:');
  for (const sibling of staticResult.adjacentSiblings) {
    const group = HOOK_GROUPS[sibling.iyDisp];
    console.log(
      `  ${hex(sibling.entry)} -> ${sibling.slotName} ${hex(sibling.slot)} | ` +
      `${group.byteName} bit ${sibling.bit} -> ${sibling.flagName}`,
    );
  }
  console.log();
}

function printBootReport(bootResult) {
  console.log('=== Post-Boot Probe ===');
  console.log(
    `Boot path: ${hex(BOOT_ENTRY)} (${BOOT_MODE}) -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} ` +
    'with createPeripheralBus({ timerInterrupt: false })',
  );
  console.log();

  if (bootResult.slotWrites.length === 0) {
    console.log(`Observed slot-range writes ${hex(SLOT_RANGE_START)}-${hex(SLOT_RANGE_END - 1)}: none`);
  } else {
    console.log(`Observed slot-range writes ${hex(SLOT_RANGE_START)}-${hex(SLOT_RANGE_END - 1)}:`);
    for (const site of bootResult.slotWrites) {
      const valueText = site.kind === 'write24' ? hex(site.lastValue) : hb(site.lastValue);
      console.log(
        `  ${hex(site.pc)} ${site.kind} ${hex(site.addr)} value=${valueText} count=${site.count}`,
      );
    }
  }

  if (bootResult.flagWrites.length === 0) {
    console.log(`Observed hook-flag writes ${hex(FLAG_RANGE_START)}-${hex(FLAG_RANGE_END - 1)}: none`);
  } else {
    console.log(`Observed hook-flag writes ${hex(FLAG_RANGE_START)}-${hex(FLAG_RANGE_END - 1)}:`);
    for (const site of bootResult.flagWrites) {
      console.log(
        `  ${hex(site.pc)} ${site.kind} ${hex(site.addr)} value=${hb(site.lastValue)} count=${site.count}`,
      );
    }
  }

  console.log();
  console.log('Post-boot slot values:');
  for (const slot of bootResult.slotStates) {
    console.log(`  ${slot.slotName.padEnd(20)} ${hex(slot.slot)} = ${hex(slot.ptr)}`);
  }

  console.log();
  console.log('Post-boot hook flag bytes:');
  console.log(`  hookflags2 ${hex(IY_BASE + 52)} = ${hb(bootResult.flagStates[52])}`);
  console.log(`  hookflags3 ${hex(IY_BASE + 53)} = ${hb(bootResult.flagStates[53])}`);
  console.log(`  hookflags4 ${hex(IY_BASE + 54)} = ${hb(bootResult.flagStates[54])}`);

  console.log();
  if (bootResult.activeHooks.length === 0) {
    console.log('Active requested hooks after boot/home-entry state: none');
  } else {
    console.log('Active requested hooks after boot/home-entry state:');
    for (const stub of bootResult.activeHooks) {
      console.log(
        `  ${stub.slotName} ptr=${hex(stub.ptr)} flag=${stub.flagName} ` +
        `bit=${stub.bit} in IY+${stub.iyDisp}`,
      );
    }
  }
}

export async function main() {
  const staticResult = analyzeStatic();
  const bootResult = runBootProbe();
  printStaticReport(staticResult);
  printBootReport(bootResult);
}

await main();
