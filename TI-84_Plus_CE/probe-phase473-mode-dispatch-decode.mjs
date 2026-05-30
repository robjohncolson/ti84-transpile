import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as runtime from './cpu-runtime.js';
import * as peripherals from './peripherals.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(HERE, 'ROM.rom');
const ROM_JS_PATH = path.join(HERE, 'ROM.transpiled.js');

const DISPATCH_START = 0x02ffed;
const DISPATCH_LEN = 51;
const DISPATCH_END_EXCLUSIVE = DISPATCH_START + DISPATCH_LEN;
const ENTRY_PC = 0x02ffae;
const ENTER_KEY = 0x05;
const HOME_MODE = 0x48;
const KEY_SCRATCH_ADDR = 0xd1a870;

const KNOWN_ADDRS = new Map([
  [0xd00824, 'D00824(mode char)'],
  [0xd007e0, 'D007E0(companion mode)'],
  [0xd14091, 'D14091'],
  [0xd00587, 'D00587'],
  [0xd00080, 'D00080(IY flags)'],
  [0xd177ba, 'D177BA'],
  [0xd177b7, 'D177B7'],
]);

const rawRom = fs.readFileSync(ROM_PATH);
if (rawRom.length < DISPATCH_END_EXCLUSIVE) {
  throw new Error(`ROM.rom is too short for ${hex24(DISPATCH_START)}..${hex24(DISPATCH_END_EXCLUSIVE - 1)}`);
}

console.log(`ROM hex dump ${hex24(DISPATCH_START)}..${hex24(DISPATCH_END_EXCLUSIVE - 1)} (${DISPATCH_LEN} bytes)`);
hexDump(rawRom, DISPATCH_START, DISPATCH_LEN);

console.log(`\nManual eZ80 decode ${hex24(DISPATCH_START)}..${hex24(DISPATCH_END_EXCLUSIVE - 1)}`);
const decodedDispatch = decodeRange(rawRom, DISPATCH_START, DISPATCH_END_EXCLUSIVE);
for (const ins of decodedDispatch) {
  console.log(`${hex24(ins.addr)}  ${formatBytes(ins.bytes).padEnd(14)}  ${ins.mnemonic}`);
}

const romModule = await import(pathToFileURL(ROM_JS_PATH).href);
const createPeripheralBus = pickFunction(peripherals, ['createPeripheralBus']);
const peripheralBus = createPeripheralBus({ timerInterrupt: false });

let mem = new Uint8Array(0x1000000);
mem.set(rawRom.subarray(0, Math.min(rawRom.length, mem.length)), 0);

const machine = createMachine(runtime, romModule, mem, peripheralBus);
const executor = machine.executor;
const cpu = machine.cpu;
mem = machine.mem;
loadRomIntoMemory(mem, rawRom);

// Boot sequence (copied exactly from the task; needed for ROM.transpiled.js blocks).
const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

console.log('\nBoot results');
console.log(`boot:     ${summarizeRunResult(bootResult)}`);
console.log(`kernel:   ${summarizeRunResult(kernelResult)}`);
console.log(`postInit: ${summarizeRunResult(postInitResult)}`);

write8(0xd00824, HOME_MODE);
write8(0xd007e0, HOME_MODE);
write8(0xd14091, 0x01);
write8(0xd00587, 0x09);
write8(0xd00080, read8(0xd00080) | 0x08);
write8(0xd177ba, 0x7f);
write8(0xd177b7, 0x00);

cpu.mbase = 0xd0;
cpu._iy = 0xd00080;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xff, cpu.sp, cpu.sp + 3);

// The entry stub reloads A from (HL) before jumping to 0x02FFED. Point HL at a
// scratch byte containing the requested translated ENTER key code.
cpu._hl = KEY_SCRATCH_ADDR;
write8(KEY_SCRATCH_ADDR, ENTER_KEY);
setA(cpu, ENTER_KEY);

const staticPath = simulateRecognizedPath({
  startPc: ENTRY_PC,
  initialA: ENTER_KEY,
  initialHl: cpu._hl,
  initialIy: cpu._iy,
  maxInstructions: 80,
});

const blockTrace = [];
let totalBlocks = 0;
const dispatchResult = executor.runFrom(ENTRY_PC, 'adl', {
  maxSteps: 5000,
  onBlock: (...args) => {
    totalBlocks += 1;
    if (blockTrace.length >= 50) {
      return;
    }
    blockTrace.push({
      index: totalBlocks,
      pc: extractPcFromOnBlock(args, cpu),
      args: args.map(describeBlockArg),
    });
  },
});

console.log('\nSeeded state');
console.log(`A=${hex8(getA(cpu))}  HL=${hex24(cpu._hl)}  (HL)=${hex8(read8(cpu._hl))}  IY=${hex24(cpu._iy)}  MBASE=${hex8(cpu.mbase)}`);
console.log(`D00824=${hex8(read8(0xd00824))}  D007E0=${hex8(read8(0xd007e0))}  D00080=${hex8(read8(0xd00080))}`);

console.log('\nExecution trace from 0x02FFAE (first 50 onBlock PCs)');
if (blockTrace.length === 0) {
  console.log('No onBlock callbacks were captured.');
} else {
  for (const hit of blockTrace) {
    const local = instructionAt(decodedDispatch, hit.pc);
    const suffix = local ? `  ${local.mnemonic}` : '';
    console.log(`${String(hit.index).padStart(2, '0')}: ${hex24(hit.pc)}${suffix}`);
  }
  if (totalBlocks > blockTrace.length) {
    console.log(`... ${totalBlocks - blockTrace.length} additional block(s) omitted`);
  }
}
console.log(`dispatch run: ${summarizeRunResult(dispatchResult)}`);

console.log('\nMode-specific dispatch report for D00824=0x48');
for (const event of staticPath.events) {
  console.log(event.message);
}
if (staticPath.comparisons.length === 0) {
  console.log('comparisons: none reached by the recognized path');
} else {
  console.log('comparisons:');
  for (const cmp of staticPath.comparisons) {
    console.log(`  ${hex24(cmp.addr)} CP ${hex8(cmp.value)} with A=${hex8(cmp.a)} => ${cmp.match ? 'MATCH' : 'no match'}`);
  }
}
if (staticPath.branches.length === 0) {
  console.log('branches: none reached by the recognized path');
} else {
  console.log('branches:');
  for (const branch of staticPath.branches) {
    console.log(`  ${hex24(branch.addr)} ${branch.mnemonic} => ${branch.taken ? 'taken' : 'not taken'}${branch.target == null ? '' : ` (${hex24(branch.target)})`}`);
  }
}
if (staticPath.calls.length === 0) {
  console.log('function called: none before the recognized path stopped');
} else {
  console.log(`function called: ${staticPath.calls.map((call) => hex24(call.target)).join(', ')}`);
}
if (staticPath.stopReason) {
  console.log(`path stop: ${staticPath.stopReason}`);
}

function createMachine(runtimeModule, romJsModule, memory, bus) {
  const createExecutor = pickFunction(runtimeModule, ['createExecutor']);
  const createCpu = optionalFunction(runtimeModule, ['createCPU', 'createCpu']);
  const blocks = pickRomBlocks(romJsModule);
  const cpuCandidate = createCpu ? createCpu() : {};
  const options = {
    cpu: cpuCandidate,
    mem: memory,
    memory,
    ram: memory,
    rom: rawRom,
    romBytes: rawRom,
    blocks,
    blockTable: blocks,
    peripheralBus: bus,
    peripherals: bus,
    bus,
  };

  const attempts = [
    ['createExecutor(options)', () => createExecutor(options)],
    ['createExecutor(blocks, options)', () => createExecutor(blocks, options)],
    ['createExecutor(cpu, mem, blocks, bus)', () => createExecutor(cpuCandidate, memory, blocks, bus)],
    ['createExecutor(mem, cpu, blocks, bus)', () => createExecutor(memory, cpuCandidate, blocks, bus)],
    ['createExecutor(blocks, mem, cpu, bus)', () => createExecutor(blocks, memory, cpuCandidate, bus)],
    ['createExecutor(blocks, mem, bus)', () => createExecutor(blocks, memory, bus)],
    ['createExecutor(mem, blocks, bus)', () => createExecutor(memory, blocks, bus)],
  ];

  const failures = [];
  for (const [label, attempt] of attempts) {
    try {
      const executor = attempt();
      if (executor && typeof executor.runFrom === 'function') {
        return {
          executor,
          cpu: executor.cpu ?? executor.CPU ?? executor.state?.cpu ?? cpuCandidate,
          mem: executor.mem ?? executor.memory ?? executor.ram ?? memory,
        };
      }
      failures.push(`${label}: returned ${typeof executor}`);
    } catch (error) {
      failures.push(`${label}: ${error?.message ?? error}`);
    }
  }

  throw new Error(`Unable to create executor:\n${failures.join('\n')}`);
}

function pickFunction(moduleObject, names) {
  const fn = optionalFunction(moduleObject, names);
  if (!fn) {
    throw new Error(`Missing required export: ${names.join(' or ')}`);
  }
  return fn;
}

function optionalFunction(moduleObject, names) {
  for (const name of names) {
    const direct = moduleObject?.[name];
    if (typeof direct === 'function') {
      return direct;
    }
    const nested = moduleObject?.default?.[name];
    if (typeof nested === 'function') {
      return nested;
    }
  }
  if (names.length === 1 && typeof moduleObject?.default === 'function') {
    return moduleObject.default;
  }
  return null;
}

function pickRomBlocks(moduleObject) {
  return (
    moduleObject.blocks ??
    moduleObject.blockTable ??
    moduleObject.romBlocks ??
    moduleObject.default?.blocks ??
    moduleObject.default?.blockTable ??
    moduleObject.default?.romBlocks ??
    moduleObject.default ??
    moduleObject
  );
}

function loadRomIntoMemory(memory, romBytes) {
  if (!memory || typeof memory.set !== 'function') {
    throw new Error('Executor memory does not look like a Uint8Array-compatible object');
  }
  memory.set(romBytes.subarray(0, Math.min(romBytes.length, memory.length)), 0);
}

function decodeRange(bytes, start, endExclusive) {
  const instructions = [];
  let pc = start;
  while (pc < endExclusive) {
    const ins = decodeInstruction(bytes, pc);
    const clippedLength = Math.max(1, Math.min(ins.length, endExclusive - pc));
    instructions.push({
      ...ins,
      bytes: Array.from(bytes.subarray(pc, pc + clippedLength)),
    });
    pc += clippedLength;
  }
  return instructions;
}

function decodeInstruction(bytes, pc) {
  const op = bytes[pc];
  const b1 = bytes[pc + 1] ?? 0;
  const b2 = bytes[pc + 2] ?? 0;
  const b3 = bytes[pc + 3] ?? 0;
  const u24 = b1 | (b2 << 8) | (b3 << 16);
  const rel = signed8(b1);
  const relTarget = (pc + 2 + rel) & 0xffffff;

  if (op === 0xfd && b1 === 0xcb) {
    const displacement = signed8(b2);
    const cbop = b3;
    if ((cbop & 0xc7) === 0x46) {
      const bit = (cbop >> 3) & 7;
      return makeInstruction(bytes, pc, 4, `BIT ${bit},(IY${formatDisp(displacement)})`, {
        kind: 'bit-iy',
        bit,
        displacement,
      });
    }
    return makeInstruction(bytes, pc, 4, `FD CB ${hex8(b2)} ${hex8(cbop)}`);
  }

  if (op === 0xcb) {
    const reg = REG8[b1 & 7];
    if ((b1 & 0xc0) === 0x40) {
      return makeInstruction(bytes, pc, 2, `BIT ${(b1 >> 3) & 7},${reg}`);
    }
    if ((b1 & 0xc0) === 0x80) {
      return makeInstruction(bytes, pc, 2, `RES ${(b1 >> 3) & 7},${reg}`);
    }
    if ((b1 & 0xc0) === 0xc0) {
      return makeInstruction(bytes, pc, 2, `SET ${(b1 >> 3) & 7},${reg}`);
    }
    return makeInstruction(bytes, pc, 2, `CB ${hex8(b1)}`);
  }

  if (op === 0xed) {
    const edMnemonics = new Map([
      [0x44, 'NEG'],
      [0x45, 'RETN'],
      [0x47, 'LD I,A'],
      [0x4d, 'RETI'],
      [0x57, 'LD A,I'],
      [0x5f, 'LD A,R'],
      [0xa0, 'LDI'],
      [0xa1, 'CPI'],
      [0xa8, 'LDD'],
      [0xa9, 'CPD'],
      [0xb0, 'LDIR'],
      [0xb1, 'CPIR'],
      [0xb8, 'LDDR'],
      [0xb9, 'CPDR'],
    ]);
    return makeInstruction(bytes, pc, 2, edMnemonics.get(b1) ?? `ED ${hex8(b1)}`);
  }

  if (op in JR_CC) {
    const cond = JR_CC[op];
    return makeInstruction(bytes, pc, 2, `JR ${cond},${hex24(relTarget)} ; ${rel >= 0 ? '+' : ''}${rel}`, {
      kind: 'jr',
      cond,
      target: relTarget,
    });
  }
  if (op === 0x18) {
    return makeInstruction(bytes, pc, 2, `JR ${hex24(relTarget)} ; ${rel >= 0 ? '+' : ''}${rel}`, {
      kind: 'jr',
      cond: 'always',
      target: relTarget,
    });
  }
  if (op === 0x10) {
    return makeInstruction(bytes, pc, 2, `DJNZ ${hex24(relTarget)} ; ${rel >= 0 ? '+' : ''}${rel}`);
  }
  if (op in JP_CC) {
    const cond = JP_CC[op];
    return makeInstruction(bytes, pc, 4, `JP ${cond},${hex24(u24)}`, {
      kind: 'jp',
      cond,
      target: u24,
    });
  }
  if (op === 0xc3) {
    return makeInstruction(bytes, pc, 4, `JP ${hex24(u24)}`, {
      kind: 'jp',
      cond: 'always',
      target: u24,
    });
  }
  if (op in CALL_CC) {
    const cond = CALL_CC[op];
    return makeInstruction(bytes, pc, 4, `CALL ${cond},${hex24(u24)}`, {
      kind: 'call',
      cond,
      target: u24,
    });
  }
  if (op === 0xcd) {
    return makeInstruction(bytes, pc, 4, `CALL ${hex24(u24)}`, {
      kind: 'call',
      cond: 'always',
      target: u24,
    });
  }
  if (op in RET_CC) {
    return makeInstruction(bytes, pc, 1, `RET ${RET_CC[op]}`, {
      kind: 'ret',
      cond: RET_CC[op],
    });
  }
  if (op === 0xc9) {
    return makeInstruction(bytes, pc, 1, 'RET', {
      kind: 'ret',
      cond: 'always',
    });
  }
  if (op === 0xfe) {
    return makeInstruction(bytes, pc, 2, `CP ${hex8(b1)}`, {
      kind: 'cp-imm',
      value: b1,
    });
  }
  if (op === 0x3a) {
    return makeInstruction(bytes, pc, 4, `LD A,(${formatAddr(u24)})`, {
      kind: 'ld-a-abs',
      source: u24,
    });
  }
  if (op === 0x32) {
    return makeInstruction(bytes, pc, 4, `LD (${formatAddr(u24)}),A`, {
      kind: 'ld-abs-a',
      target: u24,
    });
  }
  if (op === 0x2a) {
    return makeInstruction(bytes, pc, 4, `LD HL,(${formatAddr(u24)})`);
  }
  if (op === 0x22) {
    return makeInstruction(bytes, pc, 4, `LD (${formatAddr(u24)}),HL`);
  }
  if (op === 0x3e) {
    return makeInstruction(bytes, pc, 2, `LD A,${hex8(b1)}`, {
      kind: 'ld-a-imm',
      value: b1,
    });
  }
  if (op === 0x7e) {
    return makeInstruction(bytes, pc, 1, 'LD A,(HL)', {
      kind: 'ld-a-hl',
    });
  }
  if (op === 0x77) {
    return makeInstruction(bytes, pc, 1, 'LD (HL),A');
  }
  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) {
      return makeInstruction(bytes, pc, 1, 'HALT');
    }
    return makeInstruction(bytes, pc, 1, `LD ${REG8[(op >> 3) & 7]},${REG8[op & 7]}`);
  }
  if (op >= 0x80 && op <= 0xbf) {
    const group = (op >> 3) & 7;
    const reg = REG8[op & 7];
    const mnemonic = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][group];
    return makeInstruction(bytes, pc, 1, `${mnemonic},${reg}`, {
      kind: group === 7 ? 'cp-reg' : group === 6 ? 'or-reg' : 'alu-reg',
      reg,
    });
  }
  if (op in LD_R_N) {
    return makeInstruction(bytes, pc, 2, `LD ${LD_R_N[op]},${hex8(b1)}`);
  }
  if (op in INC_R) {
    return makeInstruction(bytes, pc, 1, `INC ${INC_R[op]}`);
  }
  if (op in DEC_R) {
    return makeInstruction(bytes, pc, 1, `DEC ${DEC_R[op]}`);
  }
  if (op in SIMPLE_OPS) {
    return makeInstruction(bytes, pc, SIMPLE_OPS[op].length, SIMPLE_OPS[op].mnemonic);
  }

  return makeInstruction(bytes, pc, 1, `DB ${hex8(op)}`);
}

function makeInstruction(bytes, pc, length, mnemonic, extra = {}) {
  return {
    addr: pc,
    length,
    bytes: Array.from(bytes.subarray(pc, pc + length)),
    mnemonic,
    ...extra,
  };
}

function simulateRecognizedPath({ startPc, initialA, initialHl, initialIy, maxInstructions }) {
  const state = {
    pc: startPc,
    a: initialA & 0xff,
    hl: initialHl & 0xffffff,
    iy: initialIy & 0xffffff,
    flags: { z: false, c: false, pv: false, s: false },
  };
  const events = [];
  const comparisons = [];
  const branches = [];
  const calls = [];
  let stopReason = null;

  for (let i = 0; i < maxInstructions; i += 1) {
    const ins = decodeInstruction(rawRom, state.pc);
    switch (ins.kind) {
      case 'ld-a-abs': {
        const value = read8(ins.source);
        state.a = value;
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} -> A=${hex8(value)}`);
        state.pc = (state.pc + ins.length) & 0xffffff;
        break;
      }
      case 'ld-a-hl': {
        const value = read8(state.hl);
        state.a = value;
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} from ${hex24(state.hl)} -> A=${hex8(value)}`);
        state.pc = (state.pc + ins.length) & 0xffffff;
        break;
      }
      case 'ld-a-imm': {
        state.a = ins.value & 0xff;
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} -> A=${hex8(state.a)}`);
        state.pc = (state.pc + ins.length) & 0xffffff;
        break;
      }
      case 'cp-imm': {
        const match = state.a === ins.value;
        state.flags.z = match;
        state.flags.c = state.a < ins.value;
        comparisons.push({ addr: ins.addr, value: ins.value, a: state.a, match });
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} with A=${hex8(state.a)} -> ${match ? 'MATCH' : 'no match'}`);
        state.pc = (state.pc + ins.length) & 0xffffff;
        break;
      }
      case 'cp-reg': {
        if (ins.reg !== 'A') {
          stopReason = `${hex24(ins.addr)} ${ins.mnemonic}: register comparison not simulated`;
          i = maxInstructions;
          break;
        }
        state.flags.z = true;
        state.flags.c = false;
        comparisons.push({ addr: ins.addr, value: state.a, a: state.a, match: true });
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} -> MATCH`);
        state.pc = (state.pc + ins.length) & 0xffffff;
        break;
      }
      case 'or-reg': {
        if (ins.reg !== 'A') {
          stopReason = `${hex24(ins.addr)} ${ins.mnemonic}: OR source not simulated`;
          i = maxInstructions;
          break;
        }
        state.flags.z = state.a === 0;
        state.flags.c = false;
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} -> Z=${state.flags.z ? 1 : 0}`);
        state.pc = (state.pc + ins.length) & 0xffffff;
        break;
      }
      case 'bit-iy': {
        const addr = (state.iy + ins.displacement) & 0xffffff;
        const value = read8(addr);
        const set = (value & (1 << ins.bit)) !== 0;
        state.flags.z = !set;
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} reads ${hex8(value)} at ${hex24(addr)} -> bit ${set ? 'set' : 'clear'}`);
        state.pc = (state.pc + ins.length) & 0xffffff;
        break;
      }
      case 'jr':
      case 'jp': {
        const taken = conditionIsTrue(ins.cond, state.flags);
        branches.push({ addr: ins.addr, mnemonic: ins.mnemonic, taken, target: ins.target });
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} -> ${taken ? 'taken' : 'not taken'}`);
        state.pc = taken ? ins.target : (state.pc + ins.length) & 0xffffff;
        break;
      }
      case 'call': {
        const taken = conditionIsTrue(ins.cond, state.flags);
        branches.push({ addr: ins.addr, mnemonic: ins.mnemonic, taken, target: ins.target });
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} -> ${taken ? 'called' : 'not called'}`);
        if (taken) {
          calls.push({ addr: ins.addr, target: ins.target });
          stopReason = `CALL target reached at ${hex24(ins.target)}`;
          i = maxInstructions;
        } else {
          state.pc = (state.pc + ins.length) & 0xffffff;
        }
        break;
      }
      case 'ret': {
        const taken = conditionIsTrue(ins.cond, state.flags);
        branches.push({ addr: ins.addr, mnemonic: ins.mnemonic, taken, target: null });
        events.push(`${hex24(ins.addr)} ${ins.mnemonic} -> ${taken ? 'return' : 'not taken'}`);
        if (taken) {
          stopReason = 'RET reached';
          i = maxInstructions;
        } else {
          state.pc = (state.pc + ins.length) & 0xffffff;
        }
        break;
      }
      default: {
        if (state.pc < DISPATCH_START || state.pc >= DISPATCH_END_EXCLUSIVE) {
          events.push(`${hex24(ins.addr)} ${ins.mnemonic}`);
        }
        stopReason = `${hex24(ins.addr)} ${ins.mnemonic}: not simulated`;
        i = maxInstructions;
        break;
      }
    }
  }

  return { events, comparisons, branches, calls, stopReason };
}

function conditionIsTrue(cond, flags) {
  switch (cond) {
    case 'always':
      return true;
    case 'NZ':
      return !flags.z;
    case 'Z':
      return flags.z;
    case 'NC':
      return !flags.c;
    case 'C':
      return flags.c;
    case 'PO':
      return !flags.pv;
    case 'PE':
      return flags.pv;
    case 'P':
      return !flags.s;
    case 'M':
      return flags.s;
    default:
      return false;
  }
}

function hexDump(bytes, start, length) {
  for (let offset = 0; offset < length; offset += 16) {
    const chunk = Array.from(bytes.subarray(start + offset, start + Math.min(offset + 16, length)));
    console.log(`${hex24(start + offset)}: ${chunk.map(hex8).join(' ')}`);
  }
}

function instructionAt(instructions, pc) {
  return instructions.find((ins) => ins.addr === pc) ?? null;
}

function extractPcFromOnBlock(args, cpuObject) {
  for (const arg of args) {
    if (Number.isInteger(arg)) {
      return arg & 0xffffff;
    }
    if (!arg || typeof arg !== 'object') {
      continue;
    }
    for (const key of ['pc', 'addr', 'address', 'start', 'entry', 'entryPc', 'blockPc']) {
      if (Number.isInteger(arg[key])) {
        return arg[key] & 0xffffff;
      }
    }
    if (arg.cpu) {
      const pc = getPc(arg.cpu);
      if (pc != null) {
        return pc;
      }
    }
  }
  return getPc(cpuObject) ?? 0;
}

function describeBlockArg(arg) {
  if (Number.isInteger(arg)) {
    return hex24(arg);
  }
  if (!arg || typeof arg !== 'object') {
    return String(arg);
  }
  const out = {};
  for (const key of ['pc', 'addr', 'address', 'start', 'entry', 'entryPc', 'blockPc', 'mode']) {
    if (arg[key] != null) {
      out[key] = Number.isInteger(arg[key]) ? hex24(arg[key]) : arg[key];
    }
  }
  return out;
}

function summarizeRunResult(result) {
  if (result == null) {
    return String(result);
  }
  if (typeof result !== 'object') {
    return String(result);
  }
  const summary = {};
  for (const key of ['steps', 'iterations', 'maxSteps', 'maxLoopIterations', 'halted', 'reason', 'stopReason', 'pc', 'addr', 'address']) {
    if (result[key] != null) {
      summary[key] = Number.isInteger(result[key]) && /pc|addr|address/i.test(key) ? hex24(result[key]) : result[key];
    }
  }
  return Object.keys(summary).length === 0 ? JSON.stringify(result) : JSON.stringify(summary);
}

function read8(addr) {
  return mem[addr & 0xffffff] ?? 0;
}

function write8(addr, value) {
  mem[addr & 0xffffff] = value & 0xff;
}

function setA(cpuObject, value) {
  const v = value & 0xff;
  cpuObject._a = v;
  cpuObject.a = v;
  if (cpuObject.registers && typeof cpuObject.registers === 'object') {
    cpuObject.registers.a = v;
    cpuObject.registers.A = v;
  }
}

function getA(cpuObject) {
  return (cpuObject._a ?? cpuObject.a ?? cpuObject.registers?.a ?? cpuObject.registers?.A ?? 0) & 0xff;
}

function getPc(cpuObject) {
  const value = cpuObject?._pc ?? cpuObject?.pc ?? cpuObject?.PC ?? cpuObject?.registers?.pc ?? cpuObject?.registers?.PC;
  return Number.isInteger(value) ? value & 0xffffff : null;
}

function formatBytes(bytes) {
  return bytes.map(hex8).join(' ');
}

function formatAddr(addr) {
  const name = KNOWN_ADDRS.get(addr);
  return name ? `${hex24(addr)} ${name}` : hex24(addr);
}

function formatDisp(value) {
  if (value === 0) {
    return '+0';
  }
  return value > 0 ? `+${value}` : `${value}`;
}

function signed8(value) {
  const byte = value & 0xff;
  return byte < 0x80 ? byte : byte - 0x100;
}

function hex8(value) {
  return `0x${(value & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function hex24(value) {
  return `0x${(value & 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`;
}

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const JR_CC = {
  0x20: 'NZ',
  0x28: 'Z',
  0x30: 'NC',
  0x38: 'C',
};
const JP_CC = {
  0xc2: 'NZ',
  0xca: 'Z',
  0xd2: 'NC',
  0xda: 'C',
  0xe2: 'PO',
  0xea: 'PE',
  0xf2: 'P',
  0xfa: 'M',
};
const CALL_CC = {
  0xc4: 'NZ',
  0xcc: 'Z',
  0xd4: 'NC',
  0xdc: 'C',
  0xe4: 'PO',
  0xec: 'PE',
  0xf4: 'P',
  0xfc: 'M',
};
const RET_CC = {
  0xc0: 'NZ',
  0xc8: 'Z',
  0xd0: 'NC',
  0xd8: 'C',
  0xe0: 'PO',
  0xe8: 'PE',
  0xf0: 'P',
  0xf8: 'M',
};
const LD_R_N = {
  0x06: 'B',
  0x0e: 'C',
  0x16: 'D',
  0x1e: 'E',
  0x26: 'H',
  0x2e: 'L',
  0x36: '(HL)',
};
const INC_R = {
  0x04: 'B',
  0x0c: 'C',
  0x14: 'D',
  0x1c: 'E',
  0x24: 'H',
  0x2c: 'L',
  0x34: '(HL)',
  0x3c: 'A',
};
const DEC_R = {
  0x05: 'B',
  0x0d: 'C',
  0x15: 'D',
  0x1d: 'E',
  0x25: 'H',
  0x2d: 'L',
  0x35: '(HL)',
  0x3d: 'A',
};
const SIMPLE_OPS = {
  0x00: { length: 1, mnemonic: 'NOP' },
  0x02: { length: 1, mnemonic: 'LD (BC),A' },
  0x07: { length: 1, mnemonic: 'RLCA' },
  0x08: { length: 1, mnemonic: 'EX AF,AF\'' },
  0x0a: { length: 1, mnemonic: 'LD A,(BC)' },
  0x0f: { length: 1, mnemonic: 'RRCA' },
  0x12: { length: 1, mnemonic: 'LD (DE),A' },
  0x17: { length: 1, mnemonic: 'RLA' },
  0x1a: { length: 1, mnemonic: 'LD A,(DE)' },
  0x1f: { length: 1, mnemonic: 'RRA' },
  0x27: { length: 1, mnemonic: 'DAA' },
  0x2f: { length: 1, mnemonic: 'CPL' },
  0x37: { length: 1, mnemonic: 'SCF' },
  0x3f: { length: 1, mnemonic: 'CCF' },
  0xc1: { length: 1, mnemonic: 'POP BC' },
  0xc5: { length: 1, mnemonic: 'PUSH BC' },
  0xd1: { length: 1, mnemonic: 'POP DE' },
  0xd5: { length: 1, mnemonic: 'PUSH DE' },
  0xe1: { length: 1, mnemonic: 'POP HL' },
  0xe3: { length: 1, mnemonic: 'EX (SP),HL' },
  0xe5: { length: 1, mnemonic: 'PUSH HL' },
  0xe9: { length: 1, mnemonic: 'JP (HL)' },
  0xeb: { length: 1, mnemonic: 'EX DE,HL' },
  0xf1: { length: 1, mnemonic: 'POP AF' },
  0xf3: { length: 1, mnemonic: 'DI' },
  0xf5: { length: 1, mnemonic: 'PUSH AF' },
  0xf9: { length: 1, mnemonic: 'LD SP,HL' },
  0xfb: { length: 1, mnemonic: 'EI' },
};
