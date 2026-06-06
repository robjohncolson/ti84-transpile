import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romModuleUrl = pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href;
const { PRELIFTED_BLOCKS: BLOCKS } = await import(romModuleUrl);

const D177B7 = 0xd177b7;
const TIMER_OPTIONS = {
  timerInterrupt: true,
  timerInterval: 500,
};

const TRACKED_PCS = new Map([
  [0x030078, 'key wait loop'],
  [0x03fa09, 'key processor'],
  [0x021ab8, 'jump table entry +0'],
  [0x021abc, 'jump table entry +4'],
  [0x021ac0, 'jump table entry +8'],
  [0x021ac4, 'jump table entry +12'],
  [0x02ba85, 'home screen mode init'],
  [0x0015f7, 'scheduler loop entry'],
  [0x001794, 'event handler'],
  [0x003a0f, 'error handler'],
]);

const hits = new Map(
  [...TRACKED_PCS].map(([pc, label]) => [
    pc,
    {
      pc,
      label,
      count: 0,
      firstStep: undefined,
      firstBlock: undefined,
      firstOrder: undefined,
      registers: undefined,
    },
  ]),
);

let observedBlocks = 0;
let firstHitOrder = 0;

function hex(value, width = 6) {
  if (!Number.isFinite(value)) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function normalizePc(value) {
  if (!Number.isFinite(value)) return undefined;
  return (value >>> 0) & 0xffffff;
}

function isObject(value) {
  return value !== null && typeof value === 'object';
}

function firstNumber(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function readField(source, names) {
  if (!isObject(source)) return undefined;
  for (const name of names) {
    const value = source[name];
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function readNestedField(source, names) {
  const queue = [source];
  const seen = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!isObject(current) || seen.has(current)) continue;
    seen.add(current);

    const value = readField(current, names);
    if (Number.isFinite(value)) return value;

    for (const key of ['cpu', 'state', 'regs', 'registers']) {
      if (isObject(current[key])) queue.push(current[key]);
    }
  }

  return undefined;
}

function readRegisterPair(source, pairName, highName, lowName) {
  const direct = readNestedField(source, [pairName, pairName.toLowerCase()]);
  if (Number.isFinite(direct)) return direct & 0xffffff;

  const high = readNestedField(source, [highName, highName.toLowerCase()]);
  const low = readNestedField(source, [lowName, lowName.toLowerCase()]);
  if (Number.isFinite(high) && Number.isFinite(low)) {
    return (((high & 0xff) << 8) | (low & 0xff)) & 0xffff;
  }

  return undefined;
}

function readRegisters(source, pcFallback) {
  return {
    A: readNestedField(source, ['A', 'a']) & 0xff,
    HL: readRegisterPair(source, 'HL', 'H', 'L'),
    BC: readRegisterPair(source, 'BC', 'B', 'C'),
    DE: readRegisterPair(source, 'DE', 'D', 'E'),
    SP: readNestedField(source, ['SP', 'sp']) & 0xffffff,
    PC: normalizePc(firstNumber(readNestedField(source, ['PC', 'pc']), pcFallback)),
  };
}

function formatRegisters(registers) {
  return [
    `A=${hex(registers.A, 2)}`,
    `HL=${hex(registers.HL, 6)}`,
    `BC=${hex(registers.BC, 6)}`,
    `DE=${hex(registers.DE, 6)}`,
    `SP=${hex(registers.SP, 6)}`,
    `PC=${hex(registers.PC, 6)}`,
  ].join(' ');
}

function extractPc(args) {
  for (const arg of args) {
    if (Number.isFinite(arg)) return normalizePc(arg);
    const pc = readNestedField(arg, ['blockPC', 'startPC', 'startPc', 'addr', 'address', 'PC', 'pc']);
    if (Number.isFinite(pc)) return normalizePc(pc);
  }
  return undefined;
}

function extractStep(args) {
  for (const arg of args) {
    const step = readNestedField(arg, [
      'step',
      'steps',
      'stepCount',
      'instructionCount',
      'instructions',
      'totalSteps',
    ]);
    if (Number.isFinite(step)) return step;
  }
  return undefined;
}

function extractState(args) {
  for (const arg of args) {
    if (!isObject(arg)) continue;
    if (isObject(arg.state)) return arg.state;
    if (isObject(arg.cpu)) return arg.cpu;
    if (isObject(arg.regs)) return arg.regs;
    if (isObject(arg.registers)) return arg.registers;
    if (Number.isFinite(arg.PC) || Number.isFinite(arg.pc)) return arg;
  }
  return undefined;
}

function makeOnBlock(executor) {
  return (...args) => {
    observedBlocks += 1;

    const pc = extractPc(args);
    if (!TRACKED_PCS.has(pc)) return;

    const record = hits.get(pc);
    record.count += 1;

    if (record.firstOrder === undefined) {
      const callbackState = extractState(args);
      record.firstOrder = ++firstHitOrder;
      record.firstStep = extractStep(args);
      record.firstBlock = observedBlocks;
      record.registers = readRegisters(callbackState ?? executor, pc);
    }
  };
}

function makeBus() {
  const attempts = [
    () => createPeripheralBus(),
    () => createPeripheralBus({}),
  ];

  for (const attempt of attempts) {
    try {
      const bus = attempt();
      if (bus) return bus;
    } catch {
      // Try the next known construction shape.
    }
  }

  throw new Error('Unable to create peripheral bus');
}

function makeExecutor(bus) {
  const attempts = [
    () => createExecutor(BLOCKS, { bus }),
    () => createExecutor(BLOCKS, { peripheralBus: bus }),
    () => createExecutor(BLOCKS, bus),
    () => createExecutor({ blocks: BLOCKS, bus }),
    () => createExecutor({ blocks: BLOCKS, peripheralBus: bus }),
    () => createExecutor({ PRELIFTED_BLOCKS: BLOCKS, bus }),
  ];

  for (const attempt of attempts) {
    try {
      const executor = attempt();
      if (executor && typeof executor.runFrom === 'function') return executor;
    } catch {
      // Try the next known construction shape.
    }
  }

  throw new Error('Unable to create executor with runFrom()');
}

function writeArrayByte(arrayLike, address, value) {
  if (!arrayLike || typeof arrayLike.length !== 'number') return false;

  if (address >= 0 && address < arrayLike.length) {
    arrayLike[address] = value & 0xff;
    return true;
  }

  const ramOffset = address >= 0xd00000 ? address - 0xd00000 : address;
  if (ramOffset >= 0 && ramOffset < arrayLike.length) {
    arrayLike[ramOffset] = value & 0xff;
    return true;
  }

  return false;
}

function writeByte(target, address, value) {
  if (!target) return false;

  const methods = [
    'write8',
    'writeByte',
    'poke',
    'memWrite',
    'writeMemory',
    'memoryWrite',
    'setMemory',
    'setMem',
  ];

  for (const method of methods) {
    if (typeof target[method] !== 'function') continue;
    try {
      target[method](address, value & 0xff);
      return true;
    } catch {
      // Some APIs use RAM offsets rather than full eZ80 addresses.
    }

    try {
      target[method](address - 0xd00000, value & 0xff);
      return true;
    } catch {
      // Keep trying other write surfaces.
    }
  }

  if (writeArrayByte(target, address, value)) return true;

  for (const key of ['memory', 'mem', 'ram', 'bytes', 'u8', 'data', 'state', 'cpu', 'bus', 'peripherals']) {
    if (writeByte(target[key], address, value)) return true;
  }

  return false;
}

function forceNoHaltTrap(executor, bus) {
  if (writeByte(executor, D177B7, 0x00)) return;
  if (writeByte(bus, D177B7, 0x00)) return;
  throw new Error(`Unable to write ${hex(D177B7)} = 0x00`);
}

function resultPc(result, executor, fallback) {
  return normalizePc(firstNumber(
    readNestedField(result, ['nextPC', 'nextPc', 'PC', 'pc']),
    readNestedField(executor, ['nextPC', 'nextPc', 'PC', 'pc']),
    fallback,
  ));
}

function resultSteps(result) {
  return firstNumber(readNestedField(result, [
    'steps',
    'stepCount',
    'instructionCount',
    'instructions',
    'totalSteps',
  ]));
}

function resultReason(result) {
  if (!isObject(result)) return undefined;
  return result.reason ?? result.stopReason ?? result.status ?? result.haltReason;
}

function printRunSummary(name, result, executor, fallbackPc) {
  const pc = resultPc(result, executor, fallbackPc);
  const steps = resultSteps(result);
  const reason = resultReason(result);
  console.log(`${name}: nextPC=${hex(pc)} steps=${steps ?? 'n/a'} reason=${reason ?? 'n/a'}`);
}

async function runStage(executor, bus, name, pc, mode, maxSteps, maxLoopIterations) {
  forceNoHaltTrap(executor, bus);
  console.log(`${name}: start=${hex(pc)} mode=${mode} maxSteps=${maxSteps} maxLoopIterations=${maxLoopIterations}`);

  const result = await executor.runFrom(pc, mode, {
    ...TIMER_OPTIONS,
    maxSteps,
    maxLoopIterations,
  });

  forceNoHaltTrap(executor, bus);
  printRunSummary(name, result, executor, pc);
  return result;
}

function printTimeline() {
  const ordered = [...hits.values()]
    .filter((record) => record.firstOrder !== undefined)
    .sort((left, right) => left.firstOrder - right.firstOrder);

  console.log('');
  console.log('Tracked PC timeline after boot:');

  if (ordered.length === 0) {
    console.log('  No tracked PCs were reached.');
  } else {
    for (const record of ordered) {
      const step = record.firstStep === undefined ? `block#${record.firstBlock}` : record.firstStep;
      console.log(
        `  ${String(record.firstOrder).padStart(2, ' ')}. step=${step} ` +
        `pc=${hex(record.pc)} ${record.label} hits=${record.count} ` +
        formatRegisters(record.registers),
      );
    }
  }

  console.log('');
  console.log('Unreached tracked PCs:');
  for (const record of hits.values()) {
    if (record.firstOrder === undefined) {
      console.log(`  ${hex(record.pc)} ${record.label}`);
    }
  }
}

const bus = makeBus();
const executor = makeExecutor(bus);

console.log('Phase 469: cold boot to mode trace');
console.log(`Tracked PCs: ${[...TRACKED_PCS.keys()].map((pc) => hex(pc)).join(', ')}`);
console.log(`HALT trap guard: ${hex(D177B7)} = 0x00`);

forceNoHaltTrap(executor, bus);

const stage1a = await runStage(executor, bus, 'Stage 1a', 0x000000, 'z80', 20_000, 32);
const stage1b = await runStage(executor, bus, 'Stage 1b', 0x0802b2, 'adl', 50_000, 32);
const stage1cStart = resultPc(stage1b, executor, 0x0802b2);
const stage1c = await runStage(executor, bus, 'Stage 1c', stage1cStart, 'adl', 500_000, 64);
const postBootStart = resultPc(stage1c, executor, stage1cStart);

forceNoHaltTrap(executor, bus);
console.log('');
console.log(`Post-boot trace: start=${hex(postBootStart)} mode=adl maxSteps=1250000 maxLoopIterations=1000000`);

const postBoot = await executor.runFrom(postBootStart, 'adl', {
  ...TIMER_OPTIONS,
  maxSteps: 1_250_000,
  maxLoopIterations: 1_000_000,
  onBlock: makeOnBlock(executor),
});

forceNoHaltTrap(executor, bus);
printRunSummary('Post-boot trace', postBoot, executor, postBootStart);
printTimeline();

const reachedHomePath = [0x030078, 0x03fa09, 0x021ab8].some((pc) => hits.get(pc)?.firstOrder !== undefined);
const reachedErrorHandler = hits.get(0x003a0f)?.firstOrder !== undefined;

console.log('');
console.log(`Reached home/key path: ${reachedHomePath ? 'yes' : 'no'}`);
console.log(`Reached error handler ${hex(0x003a0f)}: ${reachedErrorHandler ? 'yes' : 'no'}`);
