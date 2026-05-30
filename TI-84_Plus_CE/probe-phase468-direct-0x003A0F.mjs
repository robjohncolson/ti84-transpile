import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hex = (value, width = 6) =>
  `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const TRACKED_PCS = new Set([
  0x003A0F,
  0x003A70,
  0x003D5A,
  0x003A7D,
  0x001713,
  0x001933,
  0x003A89,
  0x001853,
  0x0059C6,
  0x003AE6,
]);

const BOOT_STAGES = [
  { name: 'boot entry', pc: 0x000000, maxSteps: 2_000_000 },
  { name: 'kernel init', pc: 0x08C331, maxSteps: 1_000_000 },
  { name: 'post-init', pc: 0x0802B2, maxSteps: 1_000_000 },
];

const DIRECT_ENTRY = 0x003A0F;
const GET_CSC = 0x003D5A;
const ERROR_HANDLER_CONVERGE = 0x003A7D;
const ISR_GUARD = 0x001713;
const SLEEP_UNTIL_IRQ = 0x001933;

const KEY_SCAN_ADDR = 0xD00587;
const KEY_FLAGS_ADDR = 0xD00080;
const ISR_GUARD_ADDR = 0xD177BA;
const HALT_TRAP_ADDR = 0xD177B7;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD52C00;

const romUrl = pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href;
const romModule = await import(romUrl);
const peripheralBus = createPeripheralBus();
const executor = createProbeExecutor(romModule, peripheralBus);
const memory = findMemory(executor, peripheralBus);

console.log('probe-phase468-direct-0x003A0F');
console.log('=================================');
console.log(`ROM module: ${romUrl}`);

for (const stage of BOOT_STAGES) {
  console.log(`\n[boot] ${stage.name} @ ${hex(stage.pc)}`);
  runFrom(stage.pc, {
    maxSteps: stage.maxSteps,
    timerInterrupt: true,
    timerInterval: 500,
  });
  console.log(`[boot] complete pc=${hex(readPC(), 6)} A=${hex(readReg8('A'), 2)}`);
}

write8(KEY_SCAN_ADDR, 0x92);
write8(KEY_FLAGS_ADDR, read8(KEY_FLAGS_ADDR) | 0x08);
write8(ISR_GUARD_ADDR, 0x7F);
write8(HALT_TRAP_ADDR, 0x00);

const vramBefore = checksumRange(VRAM_START, VRAM_END);

console.log('\n[state]');
console.log(`D00587=${hex(read8(KEY_SCAN_ADDR), 2)} key scan code`);
console.log(`D00080=${hex(read8(KEY_FLAGS_ADDR), 2)} key available flag`);
console.log(`D177BA=${hex(read8(ISR_GUARD_ADDR), 2)} ISR guard`);
console.log(`D177B7=${hex(read8(HALT_TRAP_ADDR), 2)} HALT trap guard`);
console.log(`VRAM before checksum=${hex(vramBefore, 8)}`);

setPC(DIRECT_ENTRY);

const hits = new Map([...TRACKED_PCS].map((pc) => [pc, 0]));
let pendingGetCsc = null;
let pendingIsrGuard = null;
let firstGetCsc = true;
let keyFoundAtStep = null;
let lastIsrGuardReturn = null;

console.log('\n[direct]');
console.log(`entry=${hex(DIRECT_ENTRY)} maxSteps=500000 timerInterrupt=true timerInterval=500`);

for (let step = 0; step < 500_000; step += 1) {
  const pc = readPC();

  if (pendingGetCsc && isErrorLoopPc(pc)) {
    console.log(
      `[GetCSC return] step=${step} pc=${hex(pc)} A=${hex(readReg8('A'), 2)} ` +
        `before=${hex(pendingGetCsc.aBefore, 2)} D00587=${hex(read8(KEY_SCAN_ADDR), 2)}`
    );
    if (readReg8('A') !== 0 && keyFoundAtStep === null) {
      keyFoundAtStep = step;
      console.log(`[key found] A=${hex(readReg8('A'), 2)} returned from _GetCSC`);
    }
    pendingGetCsc = null;
  }

  if (pendingIsrGuard && pc === pendingIsrGuard.returnPc) {
    const aAfter = readReg8('A');
    lastIsrGuardReturn = { step, pc, aBefore: pendingIsrGuard.aBefore, aAfter };
    console.log(
      `[ISR guard return] step=${step} pc=${hex(pc)} ` +
        `A=${hex(aAfter, 2)} clobbered=${aAfter !== pendingIsrGuard.aBefore}`
    );
    pendingIsrGuard = null;
  }

  if (TRACKED_PCS.has(pc)) {
    hits.set(pc, hits.get(pc) + 1);
    console.log(`[pc] step=${step} hit=${hex(pc)} count=${hits.get(pc)} A=${hex(readReg8('A'), 2)}`);
  }

  if (pc === GET_CSC) {
    const aBefore = readReg8('A');
    console.log(`[GetCSC entry] step=${step} A(before)=${hex(aBefore, 2)} D00587=${hex(read8(KEY_SCAN_ADDR), 2)}`);
    if (firstGetCsc) {
      console.log(`[GetCSC first] D00587 still 0x92: ${read8(KEY_SCAN_ADDR) === 0x92}`);
      firstGetCsc = false;
    }
    pendingGetCsc = { step, aBefore };
  }

  if (pc === ERROR_HANDLER_CONVERGE) {
    console.log(
      `[0x003A7D] step=${step} A=${hex(readReg8('A'), 2)} ` +
        `HL=${hex(readReg16('HL'), 4)} DE=${hex(readReg16('DE'), 4)} BC=${hex(readReg16('BC'), 4)} ` +
        `D00587=${hex(read8(KEY_SCAN_ADDR), 2)}`
    );
    console.log('[0x003A7D] scan code save before ISR guard: no store observed before CALL 0x001713');
  }

  if (pc === ISR_GUARD) {
    const returnPc = readReturnAddress24();
    pendingIsrGuard = {
      step,
      aBefore: readReg8('A'),
      returnPc: returnPc ?? 0x003A80,
    };
    console.log(
      `[ISR guard entry] step=${step} A=${hex(pendingIsrGuard.aBefore, 2)} ` +
        `returnPc=${returnPc === null ? '<unknown>' : hex(returnPc)}`
    );
  }

  if (pc === SLEEP_UNTIL_IRQ && lastIsrGuardReturn) {
    console.log(
      `[post ISR guard] execution reached ${hex(SLEEP_UNTIL_IRQ)} after return at ` +
        `${hex(lastIsrGuardReturn.pc)} A=${hex(readReg8('A'), 2)}`
    );
  }

  stepOnce(pc, {
    timerInterrupt: true,
    timerInterval: 500,
  });
}

const vramAfter = checksumRange(VRAM_START, VRAM_END);

console.log('\n[summary]');
for (const pc of [...TRACKED_PCS].sort((a, b) => a - b)) {
  console.log(`${hex(pc)} hits=${hits.get(pc)}`);
}
console.log(`keyFoundAtStep=${keyFoundAtStep === null ? '<none>' : keyFoundAtStep}`);
console.log(`VRAM after checksum=${hex(vramAfter, 8)}`);
console.log(`VRAM changed=${vramBefore !== vramAfter}`);

function createProbeExecutor(moduleValue, bus) {
  const payload = moduleValue.default ?? moduleValue;
  const attempts = [
    () => createExecutor(payload, { peripheralBus: bus, peripherals: bus, bus }),
    () => createExecutor(moduleValue, { peripheralBus: bus, peripherals: bus, bus }),
    () => createExecutor({ ...payload, peripheralBus: bus, peripherals: bus, bus }),
    () => createExecutor(payload?.blocks ?? payload?.routines ?? payload, bus),
    () => createExecutor(payload?.blocks ?? payload?.routines ?? payload),
  ];

  for (const attempt of attempts) {
    try {
      const candidate = attempt();
      if (candidate && (typeof candidate.runFrom === 'function' || typeof candidate.step === 'function')) {
        return candidate;
      }
    } catch {
      // Try the next known probe/runtime construction shape.
    }
  }

  throw new Error('Unable to create executor from ROM.transpiled.js');
}

function runFrom(pc, options) {
  if (typeof executor.runFrom !== 'function') {
    setPC(pc);
    for (let i = 0; i < options.maxSteps; i += 1) {
      stepOnce(readPC(), options);
    }
    return;
  }

  executor.runFrom(pc, options);
}

function stepOnce(pc, options) {
  if (typeof executor.step === 'function') {
    executor.step(options);
    return;
  }

  if (typeof executor.runFrom === 'function') {
    executor.runFrom(pc, { ...options, maxSteps: 1 });
    return;
  }

  throw new Error('Executor does not expose step() or runFrom()');
}

function findMemory(...containers) {
  const queue = [...containers];
  const seen = new Set();

  while (queue.length > 0) {
    const item = queue.shift();
    if (!item || seen.has(item)) continue;
    seen.add(item);

    if (isByteMemory(item)) return item;

    for (const key of ['mem', 'memory', 'ram', 'bus', 'peripheralBus', 'peripherals', 'state', 'cpu']) {
      if (item[key]) queue.push(item[key]);
    }
  }

  throw new Error('Unable to locate memory buffer on executor/peripheral bus');
}

function isByteMemory(value) {
  return (
    value instanceof Uint8Array ||
    value instanceof Uint8ClampedArray ||
    (typeof value.read8 === 'function' && typeof value.write8 === 'function')
  );
}

function read8(addr) {
  const masked = addr >>> 0;
  if (typeof memory.read8 === 'function') return memory.read8(masked) & 0xFF;
  return memory[masked] & 0xFF;
}

function write8(addr, value) {
  const masked = addr >>> 0;
  if (typeof memory.write8 === 'function') {
    memory.write8(masked, value & 0xFF);
    return;
  }
  memory[masked] = value & 0xFF;
}

function checksumRange(start, end) {
  let hash = 0x811C9DC5;
  for (let addr = start; addr < end; addr += 1) {
    hash ^= read8(addr);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function getState() {
  if (typeof executor.getState === 'function') return executor.getState();
  return executor.state ?? executor.cpu?.state ?? executor.cpu ?? executor.registers ?? executor;
}

function readPC() {
  return readStateNumber(['pc', 'PC', 'programCounter', 'program_counter']) & 0xFFFFFF;
}

function setPC(pc) {
  if (typeof executor.setPC === 'function') {
    executor.setPC(pc & 0xFFFFFF);
    return;
  }

  const state = getState();
  for (const key of ['pc', 'PC', 'programCounter', 'program_counter']) {
    if (typeof state[key] === 'number') {
      state[key] = pc & 0xFFFFFF;
      return;
    }
  }

  throw new Error('Unable to set PC');
}

function readReg8(name) {
  const upper = name.toUpperCase();
  const lower = name.toLowerCase();
  const value = readStateNumber([lower, upper, `reg${upper}`, `r${upper}`], null);
  if (value !== null) return value & 0xFF;

  if (upper === 'A') {
    const af = readStateNumber(['af', 'AF'], null);
    if (af !== null) return (af >>> 8) & 0xFF;
  }

  return 0;
}

function readReg16(name) {
  const upper = name.toUpperCase();
  const lower = name.toLowerCase();
  const value = readStateNumber([lower, upper, `reg${upper}`, `r${upper}`], null);
  if (value !== null) return value & 0xFFFF;

  return ((readReg8(upper[0]) << 8) | readReg8(upper[1])) & 0xFFFF;
}

function readSP() {
  return readStateNumber(['sp', 'SP', 'stackPointer', 'stack_pointer'], null);
}

function readReturnAddress24() {
  const sp = readSP();
  if (sp === null) return null;

  const low = read8(sp);
  const mid = read8((sp + 1) & 0xFFFFFF);
  const high = read8((sp + 2) & 0xFFFFFF);
  return (low | (mid << 8) | (high << 16)) & 0xFFFFFF;
}

function readStateNumber(keys, fallback = 0) {
  const roots = [getState(), executor.state, executor.cpu, executor.registers, executor];
  for (const root of roots) {
    if (!root) continue;
    for (const key of keys) {
      if (typeof root[key] === 'number') return root[key];
      if (root.regs && typeof root.regs[key] === 'number') return root.regs[key];
      if (root.registers && typeof root.registers[key] === 'number') return root.registers[key];
    }
  }
  return fallback;
}

function isErrorLoopPc(pc) {
  return pc >= 0x003A70 && pc < ERROR_HANDLER_CONVERGE && pc !== GET_CSC;
}
