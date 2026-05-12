#!/usr/bin/env node

import { readFileSync } from 'fs';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');

const TARGET = 0x000DB6;
const LINEAR_BYTES = 0x40;
const CE_JUMP_TABLE_BASE = 0x020104;
const HYPOTHETICAL_ENTRY = TARGET / 3;
const HYPOTHETICAL_SLOT = Math.floor(HYPOTHETICAL_ENTRY);
const REAL_JT_SLOT_ADDR = CE_JUMP_TABLE_BASE + HYPOTHETICAL_SLOT * 4;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';
const DISPLAY_BUF_START = 0xD006C0;

const EXACT_CALL_4 = [0xCD, 0xB6, 0x0D, 0x00];
const EXACT_JP_4 = [0xC3, 0xB6, 0x0D, 0x00];
const EXACT_CALL_3 = [0xCD, 0xB6, 0x0D];
const EXACT_JP_3 = [0xC3, 0xB6, 0x0D];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function formatBytes(start, length) {
  return Array.from(rom.subarray(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function read16(buffer, addr) {
  return ((buffer[addr] ?? 0) | ((buffer[addr + 1] ?? 0) << 8)) >>> 0;
}

function read24(buffer, addr) {
  return ((buffer[addr] ?? 0) | ((buffer[addr + 1] ?? 0) << 8) | ((buffer[addr + 2] ?? 0) << 16)) >>> 0;
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix.toUpperCase()} ` : '';
  const ixd = (reg, displacement) => `(${reg}${signedDisp(displacement)})`;

  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'halt': return `${prefix}HALT`;
    case 'slp': return `${prefix}SLP`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'ret': return `${prefix}RET`;
    case 'reti': return `${prefix}RETI`;
    case 'retn': return `${prefix}RETN`;
    case 'ret-conditional': return `${prefix}RET ${inst.condition.toUpperCase()}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${inst.indirectRegister.toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'rst': return `${prefix}RST ${hex(inst.target, 2)}`;
    case 'push': return `${prefix}PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `${prefix}POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm': return `${prefix}LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `${prefix}LD ${inst.pair.toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${prefix}LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`
        : `${prefix}LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'ld-special': return `${prefix}LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-mb-a': return `${prefix}LD MB, A`;
    case 'ld-a-mb': return `${prefix}LD A, MB`;
    case 'ld-sp-hl': return `${prefix}LD SP, HL`;
    case 'ld-sp-pair': return `${prefix}LD SP, ${inst.pair.toUpperCase()}`;
    case 'ld-pair-ind': return `${prefix}LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-ind-pair': return `${prefix}LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`;
    case 'ld-reg-ixd': return `${prefix}LD ${inst.dest.toUpperCase()}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'ld-ixd-imm': return `${prefix}LD ${ixd(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed': return `${prefix}LD ${inst.pair.toUpperCase()}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `${prefix}LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.pair.toUpperCase()}`;
    case 'ld-ixiy-indexed': return `${prefix}LD ${inst.dest.toUpperCase()}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy': return `${prefix}LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'inc-reg': return `${prefix}INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${inst.pair.toUpperCase()}`;
    case 'inc-ixd': return `${prefix}INC ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd': return `${prefix}DEC ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'alu-reg':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? `${prefix}${inst.op.toUpperCase()} A, ${inst.src.toUpperCase()}`
        : `${prefix}${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'alu-imm':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? `${prefix}${inst.op.toUpperCase()} A, ${hexByte(inst.value)}`
        : `${prefix}${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-ixd':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? `${prefix}${inst.op.toUpperCase()} A, ${ixd(inst.indexRegister, inst.displacement)}`
        : `${prefix}${inst.op.toUpperCase()} ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'add-pair': return `${prefix}ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `${prefix}ADC HL, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `${prefix}SBC HL, ${inst.src.toUpperCase()}`;
    case 'bit-test': return `${prefix}BIT ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-test-ind': return `${prefix}BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-set': return `${prefix}SET ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-set-ind': return `${prefix}SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'bit-res': return `${prefix}RES ${inst.bit}, ${inst.reg.toUpperCase()}`;
    case 'bit-res-ind': return `${prefix}RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`;
    case 'indexed-cb-bit': return `${prefix}BIT ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${prefix}SET ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${prefix}RES ${inst.bit}, ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate': return `${prefix}${inst.operation.toUpperCase()} ${ixd(inst.indexRegister, inst.displacement)}`;
    case 'im': return `${prefix}IM ${inst.value}`;
    case 'exx': return `${prefix}EXX`;
    case 'ex-af': return `${prefix}EX AF, AF'`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'ex-sp-hl': return `${prefix}EX (SP), HL`;
    case 'rrd': return `${prefix}RRD`;
    case 'rld': return `${prefix}RLD`;
    case 'scf': return `${prefix}SCF`;
    case 'ccf': return `${prefix}CCF`;
    case 'cpl': return `${prefix}CPL`;
    case 'daa': return `${prefix}DAA`;
    case 'neg': return `${prefix}NEG`;
    case 'mlt': return `${prefix}MLT ${inst.reg.toUpperCase()}`;
    case 'tst-reg': return `${prefix}TST A, ${inst.reg.toUpperCase()}`;
    case 'tst-ind': return `${prefix}TST A, (HL)`;
    case 'tst-imm': return `${prefix}TST A, ${hexByte(inst.value)}`;
    case 'tstio': return `${prefix}TSTIO ${hexByte(inst.value)}`;
    case 'lea': return `${prefix}LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${signedDisp(inst.displacement)}`;
    case 'in0': return `${prefix}IN0 ${inst.reg.toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0': return `${prefix}OUT0 (${hexByte(inst.port)}), ${inst.reg.toUpperCase()}`;
    case 'in-reg': return `${prefix}IN ${inst.reg.toUpperCase()}, (C)`;
    case 'out-reg': return `${prefix}OUT (C), ${inst.reg.toUpperCase()}`;
    case 'in-imm': return `${prefix}IN A, (${hexByte(inst.port)})`;
    case 'out-imm': return `${prefix}OUT (${hexByte(inst.port)}), A`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function decodeLinearWindow(start, mode, byteCount = LINEAR_BYTES) {
  const rows = [];
  const end = start + byteCount;
  let pc = start;

  while (pc < end) {
    try {
      const inst = decodeInstruction(rom, pc, mode);
      rows.push({
        pc,
        length: Math.max(inst.length ?? 1, 1),
        bytes: formatBytes(pc, Math.max(inst.length ?? 1, 1)),
        text: formatInstruction(inst),
      });
      pc += Math.max(inst.length ?? 1, 1);
    } catch (error) {
      rows.push({
        pc,
        length: 1,
        bytes: formatBytes(pc, 1),
        text: `??? (${error.message})`,
      });
      pc += 1;
    }
  }

  return rows;
}

function exploreRoutine(start, mode) {
  const decoded = new Map();
  const queue = [start];
  const queued = new Set(queue);
  const edges = [];
  const exits = [];

  while (queue.length > 0) {
    let pc = queue.shift();

    while (true) {
      if (decoded.has(pc)) {
        break;
      }

      const inst = decodeInstruction(rom, pc, mode);
      decoded.set(pc, inst);

      switch (inst.tag) {
        case 'jr':
          edges.push({ from: pc, kind: 'jr', target: inst.target });
          pc = inst.target;
          continue;
        case 'jr-conditional':
        case 'jp-conditional':
        case 'djnz':
          edges.push({
            from: pc,
            kind: inst.tag,
            target: inst.target,
            fallthrough: inst.fallthrough,
          });
          if (!decoded.has(inst.target) && !queued.has(inst.target)) {
            queue.push(inst.target);
            queued.add(inst.target);
          }
          pc = inst.fallthrough;
          continue;
        case 'ret-conditional':
          edges.push({
            from: pc,
            kind: inst.tag,
            fallthrough: inst.fallthrough,
          });
          pc = inst.fallthrough;
          continue;
        case 'call':
        case 'call-conditional':
          edges.push({
            from: pc,
            kind: inst.tag,
            target: inst.target,
            fallthrough: inst.fallthrough,
          });
          pc = inst.fallthrough;
          continue;
        case 'jp':
        case 'jp-indirect':
        case 'ret':
        case 'reti':
        case 'retn':
        case 'rst':
        case 'halt':
        case 'slp':
          exits.push({ from: pc, kind: inst.tag, target: inst.target });
          break;
        default:
          pc = inst.nextPc;
          continue;
      }

      break;
    }
  }

  return {
    instructions: [...decoded.entries()]
      .sort((left, right) => left[0] - right[0])
      .map(([pc, inst]) => ({ pc, inst })),
    edges,
    exits,
  };
}

function patternScan(pattern) {
  const hits = [];

  for (let i = 0; i <= rom.length - pattern.length; i += 1) {
    let matched = true;
    for (let j = 0; j < pattern.length; j += 1) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(i);
    }
  }

  return hits;
}

function parseIncNames() {
  const inc = readFileSync(INC_PATH, 'utf8');
  const namesByAddr = new Map();
  const re = /^\?([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*0([0-9A-Fa-f]+)h/gm;
  let match;

  while ((match = re.exec(inc)) !== null) {
    const name = match[1];
    const addr = parseInt(match[2], 16);
    const existing = namesByAddr.get(addr);
    if (!existing) {
      namesByAddr.set(addr, name);
    } else if (!existing.split('/').includes(name)) {
      namesByAddr.set(addr, `${existing}/${name}`);
    }
  }

  return namesByAddr;
}

function scanNamedJumpTableTargets(target, namesByAddr) {
  const hits = [];

  for (const [slotAddr, name] of namesByAddr.entries()) {
    if (slotAddr < CE_JUMP_TABLE_BASE || slotAddr + 4 > rom.length) {
      continue;
    }
    if (((slotAddr - CE_JUMP_TABLE_BASE) & 0x03) !== 0) {
      continue;
    }
    if (rom[slotAddr] !== 0xC3) {
      continue;
    }

    const slotTarget = read24(rom, slotAddr + 1);
    if (slotTarget === target) {
      hits.push({
        slot: ((slotAddr - CE_JUMP_TABLE_BASE) / 4) >>> 0,
        slotAddr,
        name,
      });
    }
  }

  return hits.sort((left, right) => left.slotAddr - right.slotAddr);
}

function collectTextFiles(root) {
  const files = [];
  const skip = new Set(['.git', '.claude', 'logs', 'state', 'node_modules']);

  function walk(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) {
          walk(path.join(current, entry.name));
        }
        continue;
      }

      const fullPath = path.join(current, entry.name);
      if (fullPath === CPU_RUNTIME_PATH || entry.name.endsWith('.md') || entry.name.endsWith('.mjs')) {
        files.push(fullPath);
      }
    }
  }

  walk(root);
  return files.sort();
}

function searchProjectStrings(patterns) {
  const files = collectTextFiles(PROJECT_ROOT);
  const results = [];

  for (const filePath of files) {
    const text = readFileSync(filePath, 'utf8');
    const lines = text.split(/\r?\n/);

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (patterns.some((pattern) => line.includes(pattern))) {
        results.push({
          file: path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/'),
          line: index + 1,
          text: line.trim(),
        });
      }
    }
  }

  return results;
}

function seedAscii(mem, start, text) {
  for (let index = 0; index < text.length; index += 1) {
    mem[start + index] = text.charCodeAt(index);
  }
}

function resetStageStack(cpu, mem, size = 3) {
  cpu.sp = STACK_RESET_TOP - size;
  mem.fill(0xFF, cpu.sp, cpu.sp + size);
}

function captureReturnFrame(cpu, mem, mode) {
  const sp24 = cpu.sp & 0xFFFFFF;
  const adlReturn = read24(mem, sp24);
  const z80Addr = ((cpu.mbase << 16) | (cpu.sp & 0xFFFF)) & 0xFFFFFF;
  const z80Return = read16(mem, z80Addr);

  return {
    sp24,
    adlReturn,
    z80Addr,
    z80Return,
    interpretedReturn: mode === 'adl' ? adlReturn : z80Return,
  };
}

function traceDb6Stage(executor, cpu, mem, stageName, entry, mode, options, hits) {
  let previousBlock = null;

  const result = executor.runFrom(entry, mode, {
    ...options,
    onBlock(pc, blockMode, meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      if (normalizedPc === TARGET) {
        hits.push({
          stage: stageName,
          step,
          mode: blockMode,
          previousPc: previousBlock?.pc ?? null,
          previousDasm: previousBlock?.dasm ?? null,
          frame: captureReturnFrame(cpu, mem, blockMode),
          a: cpu.a & 0xFF,
          b: cpu.b & 0xFF,
          iff1: cpu.iff1 & 0xFF,
          iff2: cpu.iff2 & 0xFF,
          mbase: cpu.mbase & 0xFF,
        });
      }

      previousBlock = {
        pc: normalizedPc,
        dasm: meta?.instructions?.[0]?.dasm ?? '???',
      };
    },
  });

  return {
    stage: stageName,
    entry,
    mode,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
  };
}

async function traceBootToHome() {
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(romModule.PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const hits = [];
  const stages = [];

  stages.push(traceDb6Stage(
    executor,
    cpu,
    mem,
    'cold boot',
    BOOT_ENTRY,
    BOOT_MODE,
    { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS },
    hits,
  ));

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStageStack(cpu, mem);

  stages.push(traceDb6Stage(
    executor,
    cpu,
    mem,
    'kernel init',
    KERNEL_INIT_ENTRY,
    'adl',
    { maxSteps: 100000, maxLoopIterations: 10000 },
    hits,
  ));

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStageStack(cpu, mem);

  stages.push(traceDb6Stage(
    executor,
    cpu,
    mem,
    'post init',
    POST_INIT_ENTRY,
    'adl',
    { maxSteps: 100, maxLoopIterations: 32 },
    hits,
  ));

  stages.push(traceDb6Stage(
    executor,
    cpu,
    mem,
    'stage 1 status bar background',
    STAGE_1_ENTRY,
    'adl',
    { maxSteps: 30000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS },
    hits,
  ));

  mem[0xD0009B] &= ~0x40;

  stages.push(traceDb6Stage(
    executor,
    cpu,
    mem,
    'stage 2 status dots',
    STAGE_2_ENTRY,
    'adl',
    { maxSteps: 30000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS },
    hits,
  ));

  seedAscii(mem, MODE_BUF_START, MODE_BUF_TEXT);
  seedAscii(mem, DISPLAY_BUF_START, MODE_BUF_TEXT);

  stages.push(traceDb6Stage(
    executor,
    cpu,
    mem,
    'stage 3 home row strip',
    STAGE_3_ENTRY,
    'adl',
    { maxSteps: 50000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS },
    hits,
  ));

  stages.push(traceDb6Stage(
    executor,
    cpu,
    mem,
    'stage 4 history area',
    STAGE_4_ENTRY,
    'adl',
    { maxSteps: 50000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS },
    hits,
  ));

  return { stages, hits };
}

function printInstructionRows(rows, branchTargets = new Set()) {
  for (const row of rows) {
    const mark = branchTargets.has(row.pc) ? '>' : ' ';
    console.log(`${mark} ${hex(row.pc)}  ${row.bytes.padEnd(17)}  ${row.text}`);
  }
}

function printRoutine(title, routine) {
  const branchTargets = new Set();
  for (const edge of routine.edges) {
    if (edge.target !== undefined) {
      branchTargets.add(edge.target);
    }
    if (edge.fallthrough !== undefined && edge.kind === 'ret-conditional') {
      branchTargets.add(edge.fallthrough);
    }
  }

  console.log(title);
  printInstructionRows(
    routine.instructions.map(({ pc, inst }) => ({
      pc,
      bytes: formatBytes(pc, inst.length),
      text: formatInstruction(inst),
    })),
    branchTargets,
  );
  if (routine.edges.length > 0) {
    console.log('  edges:');
    for (const edge of routine.edges) {
      const parts = [`${hex(edge.from)} ${edge.kind}`];
      if (edge.target !== undefined) {
        parts.push(`target=${hex(edge.target)}`);
      }
      if (edge.fallthrough !== undefined) {
        parts.push(`fallthrough=${hex(edge.fallthrough)}`);
      }
      console.log(`    - ${parts.join('  ')}`);
    }
  }
  if (routine.exits.length > 0) {
    console.log('  exits:');
    for (const exit of routine.exits) {
      console.log(`    - ${hex(exit.from)} ${exit.kind}${exit.target !== undefined ? ` -> ${hex(exit.target)}` : ''}`);
    }
  }
  console.log();
}

function printSection(title) {
  console.log(`=== ${title} ===`);
}

function mainSyncSections(namesByAddr) {
  printSection('Static Disassembly');
  console.log(`Target address: ${hex(TARGET)}\n`);

  console.log('ADL routine walk (scanner path):');
  printRoutine('', exploreRoutine(TARGET, 'adl'));

  console.log('ADL linear 64-byte window:');
  printInstructionRows(decodeLinearWindow(TARGET, 'adl', LINEAR_BYTES));
  console.log();

  console.log('Z80 routine walk (same bytes, different mode):');
  printRoutine('', exploreRoutine(TARGET, 'z80'));

  console.log('Z80 linear 64-byte window:');
  printInstructionRows(decodeLinearWindow(TARGET, 'z80', LINEAR_BYTES));
  console.log();

  printSection('Jump Table Check');
  console.log(`Hypothetical 3-byte entry math from ${hex(TARGET)}:`);
  console.log(`  ${hex(TARGET)} / 3 = ${HYPOTHETICAL_ENTRY} -> slot ${HYPOTHETICAL_SLOT}`);
  console.log(`  ${hex(TARGET)} % 3 = ${TARGET % 3}`);
  console.log(`  ${hex(TARGET)} % 4 = ${TARGET % 4}`);
  console.log('  Surrounding 3-byte chunks at those boundaries:');
  for (let slot = HYPOTHETICAL_SLOT - 2; slot <= HYPOTHETICAL_SLOT + 2; slot += 1) {
    const slotAddr = slot * 3;
    console.log(`    slot ${slot.toString().padStart(4, ' ')} @ ${hex(slotAddr)} : ${formatBytes(slotAddr, 3)}`);
  }
  console.log('  Verdict: 0x000DB6 is 3-byte aligned, but the bytes there are executable code (`PUSH AF ...`), not a jump-table stub.');
  console.log();

  const realSlotName = namesByAddr.get(REAL_JT_SLOT_ADDR) ?? '(unnamed)';
  const realSlotOpcode = rom[REAL_JT_SLOT_ADDR] ?? 0;
  const realSlotTarget = read24(rom, REAL_JT_SLOT_ADDR + 1);
  const realSlotTargetInst = decodeInstruction(rom, realSlotTarget, 'adl');
  const namedTargetHits = scanNamedJumpTableTargets(TARGET, namesByAddr);

  console.log(`Real CE jump table base used by this repo/toolchain: ${hex(CE_JUMP_TABLE_BASE)}`);
  console.log(`  Slot ${HYPOTHETICAL_SLOT} lives at ${hex(REAL_JT_SLOT_ADDR)} (base + slot*4)`);
  console.log(`  Header name: ${realSlotName}`);
  console.log(`  Raw bytes: ${formatBytes(REAL_JT_SLOT_ADDR, 8)}`);
  console.log(`  Slot opcode: ${hexByte(realSlotOpcode)}${realSlotOpcode === 0xC3 ? ' (JP addr24)' : ''}`);
  console.log(`  Slot target: ${hex(realSlotTarget)}`);
  console.log(`  Target decode: ${formatInstruction(realSlotTargetInst)}`);
  console.log(`  Any named CE jump-table slot that targets ${hex(TARGET)}: ${namedTargetHits.length}`);
  if (namedTargetHits.length > 0) {
    for (const hit of namedTargetHits) {
      console.log(`    - slot ${hit.slot} @ ${hex(hit.slotAddr)} ${hit.name}`);
    }
  }
  console.log('  Verdict: slot 1170 is a real CE SDK API slot (`ChkFindSymAsm`), but it is at 0x02134C, not at 0x000DB6.');
  console.log();

  printSection('Other Callers');
  const call4Hits = patternScan(EXACT_CALL_4);
  const jp4Hits = patternScan(EXACT_JP_4);
  const call3Hits = patternScan(EXACT_CALL_3);
  const jp3Hits = patternScan(EXACT_JP_3);
  const uniqueCallerSites = [...new Set([...call4Hits, ...jp4Hits, ...call3Hits, ...jp3Hits])].sort((left, right) => left - right);

  console.log(`Exact ADL CALL pattern CD B6 0D 00 hits: ${call4Hits.length}`);
  console.log(`Exact ADL JP   pattern C3 B6 0D 00 hits: ${jp4Hits.length}`);
  console.log(`Exact Z80 CALL pattern CD B6 0D    hits: ${call3Hits.length}`);
  console.log(`Exact Z80 JP   pattern C3 B6 0D    hits: ${jp3Hits.length}`);
  console.log(`Unique caller sites: ${uniqueCallerSites.length}`);
  for (const site of uniqueCallerSites) {
    const adlInst = decodeInstruction(rom, site, 'adl');
    const z80Inst = decodeInstruction(rom, site, 'z80');
    console.log(`  - ${hex(site)}  bytes=${formatBytes(site, 4).padEnd(11)}  adl=${formatInstruction(adlInst)}  z80=${formatInstruction(z80Inst)}`);
  }
  console.log();

  console.log('Scanner-specific tail site:');
  printInstructionRows(decodeLinearWindow(0x015AD2, 'adl', 7));
  console.log();

  printSection('Project Cross-References');
  const db6Refs = searchProjectStrings(['0x000DB6', '0x000db6', '000DB6', '000db6']);
  const apiRefs = searchProjectStrings(['ChkFindSymAsm', '0x02134C', '0x02134c', '0x0847AF', '0x0847af']);
  const cpuRuntimeRefs = db6Refs.filter((entry) => entry.file.endsWith('cpu-runtime.js'));

  console.log(`cpu-runtime.js explicit 0x000DB6 hits: ${cpuRuntimeRefs.length}`);
  if (cpuRuntimeRefs.length === 0) {
    console.log('  - none');
  } else {
    for (const ref of cpuRuntimeRefs) {
      console.log(`  - ${ref.file}:${ref.line}  ${ref.text}`);
    }
  }
  console.log();

  console.log(`.md/.mjs project hits for 0x000DB6 or 000DB6: ${db6Refs.length}`);
  for (const ref of db6Refs) {
    if (ref.file.endsWith('cpu-runtime.js')) {
      continue;
    }
    console.log(`  - ${ref.file}:${ref.line}  ${ref.text}`);
  }
  console.log();

  console.log(`Project hits for slot-1170 API markers (ChkFindSymAsm / 0x02134C / 0x0847AF): ${apiRefs.length}`);
  if (apiRefs.length === 0) {
    console.log('  - none in project docs/probes/seeds; only the CE SDK header names slot 1170.');
  } else {
    for (const ref of apiRefs) {
      console.log(`  - ${ref.file}:${ref.line}  ${ref.text}`);
    }
  }
  console.log();
}

function printBootTrace(bootTrace) {
  printSection('Dynamic Trace Through Home Screen');
  console.log('Boot sequence mirrored from probe-phase99d-home-verify.mjs.');
  console.log();

  console.log('| Stage | Entry | Mode | Steps | Termination | Last PC |');
  console.log('| --- | --- | --- | ---: | --- | --- |');
  for (const stage of bootTrace.stages) {
    console.log(`| ${stage.stage} | ${hex(stage.entry)} | ${stage.mode} | ${stage.steps} | ${stage.termination} | ${hex(stage.lastPc)} |`);
  }
  console.log();

  console.log(`Entries into ${hex(TARGET)} during boot-to-home-screen trace: ${bootTrace.hits.length}`);
  if (bootTrace.hits.length === 0) {
    console.log('  - none');
    console.log('  - interpretation: cold boot + kernel init + the home-screen drawing stages never enter 0x000DB6.');
  } else {
    for (const hit of bootTrace.hits) {
      console.log(`  - stage=${hit.stage} step=${hit.step} mode=${hit.mode} prev=${hit.previousPc !== null ? hex(hit.previousPc) : 'n/a'} (${hit.previousDasm ?? 'n/a'})`);
      console.log(`    sp=${hex(hit.frame.sp24)}  return(${hit.mode})=${hex(hit.frame.interpretedReturn, hit.mode === 'adl' ? 6 : 4)}  adlTop=${hex(hit.frame.adlReturn)}  z80Top=${hex(hit.frame.z80Return, 4)} @ ${hex(hit.frame.z80Addr)}`);
      console.log(`    A=${hexByte(hit.a)} B=${hexByte(hit.b)} IFF1=${hit.iff1} IFF2=${hit.iff2} MBASE=${hexByte(hit.mbase)}`);
    }
  }
  console.log();
}

function printConclusion() {
  printSection('Conclusion');
  console.log('ADL interpretation (the one reached from the primary scanner) is the important one:');
  console.log(`  ${hex(TARGET)}  PUSH AF`);
  console.log(`  ${hex(TARGET + 1)}  LD A, (${hex(0xD00128)})`);
  console.log(`  ${hex(TARGET + 5)}  BIT 2, A`);
  console.log(`  ${hex(TARGET + 9)}  EI            ; only when bit 2 was set`);
  console.log(`  ${hex(TARGET + 10)}  POP AF`);
  console.log(`  ${hex(TARGET + 11)}  RET`);
  console.log();
  console.log(`Nearby code at ${hex(0x000DCA)}..${hex(0x000DD6)} stores a flags byte into ${hex(0xD00128)} after \`LD A,I\` and \`DI\`,`);
  console.log('so bit 2 matches the saved P/V flag, which on Z80/eZ80 mirrors the prior interrupt-enable state (IFF2) for `LD A,I`.');
  console.log();
  console.log('Why the scanner uses `JP 0x000DB6` instead of `RET`:');
  console.log('  - the scanner does its own cleanup first (`POP IY`, `POP DE`)');
  console.log('  - it then tail-calls a shared epilogue that conditionally re-enables interrupts and returns');
  console.log('  - `JP` reuses that common epilogue without pushing another return address or duplicating the interrupt-restore logic');
  console.log();
  console.log('Classification: shared return stub with conditional `EI` + `RET`.');
  console.log('Not: `RETI`, OS jump-table dispatch, or a stand-alone API entry at 0x000DB6.');
}

async function main() {
  console.log('=== Phase 299: 0x000DB6 Return Path Probe ===');
  console.log();

  const namesByAddr = parseIncNames();
  mainSyncSections(namesByAddr);
  const bootTrace = await traceBootToHome();
  printBootTrace(bootTrace);
  printConclusion();
}

await main();
