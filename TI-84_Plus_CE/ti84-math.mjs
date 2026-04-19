import { readFileSync } from 'node:fs';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const ZERO_REAL = [0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

const OP1 = 0xD005F8;
const OP2 = 0xD00603;  // 11-byte OP slot spacing (9 data + 2 name/type)
const OP3 = 0xD0060E;
const OP4 = 0xD00619;
const OP5 = 0xD00624;
const OP6 = 0xD0062F;
const OP_SIZE = 9;

const STACK_TOP = 0xD1A87E;
const SENTINEL = 0xFFFFFF;
const OP_ADDRS = [OP1, OP2, OP3, OP4, OP5, OP6];

const KNOWN_FUNCTIONS = new Map([
  [0x07C77F, 'FPAdd'],
  [0x07C8B7, 'FPMult'],
  [0x07CAB9, 'FPDiv'],
  [0x07DF66, 'SqRoot'],
  [0x07E57B, 'Sin'],
  [0x07E5B5, 'Cos'],
  [0x07E5D8, 'Tan'],
  [0x07E053, 'LnX'],
  [0x07E071, 'LogX'],
  [0x07E20D, 'EToX'],
  [0x0AFD41, 'YToX'],
  [0x0A9325, 'OneVar'],
]);

const CODEC_TESTS = [
  { value: 0, hex: '00 80 00 00 00 00 00 00 00', tol: 0 },
  { value: 1, hex: '00 80 10 00 00 00 00 00 00', tol: 0 },
  { value: -1, hex: '80 80 10 00 00 00 00 00 00', tol: 0 },
  { value: 100, hex: '00 82 10 00 00 00 00 00 00', tol: 0 },
  { value: 0.5, hex: '00 7F 50 00 00 00 00 00 00', tol: 0 },
  { value: -42.7, hex: '80 81 42 70 00 00 00 00 00', tol: 1e-12 },
  { value: 3.14159265359, hex: '00 80 31 41 59 26 53 59 00', tol: 1e-10 },
];

const SMOKE_TESTS = [
  { name: 'FPAdd', addr: 0x07C77F, args: [2, 3], expect: 5, tol: 1e-12 },
  { name: 'FPMult', addr: 0x07C8B7, args: [6, 7], expect: 42, tol: 1e-12 },
  { name: 'FPDiv', addr: 0x07CAB9, args: [22, 7], expect: 22 / 7, tol: 1e-10 },
  { name: 'LnX', addr: 0x07E053, args: [Math.E], expect: 1, tol: 1e-10 },
  { name: 'LnX', addr: 0x07E053, args: [1], expect: 0, tol: 1e-12 },
  { name: 'LogX', addr: 0x07E071, args: [100], expect: 2, tol: 1e-12 },
  { name: 'LogX', addr: 0x07E071, args: [1000], expect: 3, tol: 1e-12 },
  { name: 'EToX', addr: 0x07E20D, args: [0], expect: 1, tol: 1e-12 },
  { name: 'EToX', addr: 0x07E20D, args: [1], expect: Math.E, tol: 1e-10 },
  { name: 'YToX', addr: 0x0AFD41, args: [2, 3], expect: 8, tol: 1e-12 },
  { name: 'YToX', addr: 0x0AFD41, args: [10, 2], expect: 100, tol: 1e-12 },
];

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const romBuffer = readFileSync(ROM_PATH);

function createMemory() {
  const memory = new Uint8Array(0x1000000);
  memory.set(romBuffer);
  return memory;
}

function clamp(value, min, max) {
  if (value < min) {
    return min;
  }

  if (value > max) {
    return max;
  }

  return value;
}

function toHexByte(value) {
  return value.toString(16).padStart(2, '0');
}

function toHexAddr(value) {
  return `0x${value.toString(16).padStart(6, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, toHexByte).join(' ').toUpperCase();
}

function parseHexBytes(text) {
  return Uint8Array.from(
    text.split(' ').map((part) => Number.parseInt(part, 16))
  );
}

function bytesEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) {
      return false;
    }
  }

  return true;
}

function resetCpu(cpu) {
  cpu.a = 0;
  cpu.f = 0;
  cpu.b = 0;
  cpu.c = 0;
  cpu.d = 0;
  cpu.e = 0;
  cpu.h = 0;
  cpu.l = 0;
  cpu.sp = STACK_TOP;
  cpu._ix = 0;
  cpu._iy = 0xD00080;
  cpu.i = 0;
  cpu.im = 1;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.halted = false;
}

function writeBytes(memory, addr, bytes) {
  for (let i = 0; i < bytes.length; i++) {
    memory[addr + i] = bytes[i];
  }
}

function readBytes(memory, addr, length) {
  return memory.slice(addr, addr + length);
}

function pushSentinel(memory, cpu) {
  cpu.sp -= 3;
  memory[cpu.sp] = SENTINEL & 0xFF;
  memory[cpu.sp + 1] = (SENTINEL >> 8) & 0xFF;
  memory[cpu.sp + 2] = (SENTINEL >> 16) & 0xFF;
}

export function jsToTIReal(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    throw new RangeError('TI real codec only supports finite numbers');
  }

  if (Math.abs(numericValue) < 1e-99) {
    return Uint8Array.from(ZERO_REAL);
  }

  const result = new Uint8Array(OP_SIZE);
  const sign = numericValue < 0 ? 0x80 : 0x00;
  const absValue = Math.abs(numericValue);
  const rawExp = Math.floor(Math.log10(absValue));

  let exp = clamp(rawExp, -128, 127);
  let mantissa = absValue / Math.pow(10, exp);

  if (rawExp > 127) {
    mantissa = 9.9999999999999;
  }

  if (rawExp < -128) {
    return Uint8Array.from(ZERO_REAL);
  }

  let digits = Math.round(mantissa * 1e13);

  if (digits >= 1e14) {
    digits = Math.floor(digits / 10);
    exp = clamp(exp + 1, -128, 127);
  }

  const digitString = String(digits).padStart(14, '0');

  result[0] = sign;
  result[1] = exp + 0x80;

  for (let i = 0; i < 7; i++) {
    const high = Number(digitString[i * 2]);
    const low = Number(digitString[i * 2 + 1]);
    result[2 + i] = (high << 4) | low;
  }

  return result;
}

export function tiRealToJS(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);

  if (source.length < OP_SIZE) {
    throw new RangeError(`Expected ${OP_SIZE} bytes, received ${source.length}`);
  }

  let isZero = true;

  for (let i = 2; i < OP_SIZE; i++) {
    if (source[i] !== 0) {
      isZero = false;
      break;
    }
  }

  if (isZero) {
    return 0;
  }

  const sign = (source[0] & 0x80) !== 0 ? -1 : 1;
  const exp = source[1] - 0x80;

  let digits = 0;
  for (let i = 2; i < OP_SIZE; i++) {
    const byte = source[i];
    const high = (byte >> 4) & 0x0f;
    const low = byte & 0x0f;
    digits = (digits * 100) + (high * 10) + low;
  }

  const mantissa = digits / 1e13;
  return sign * mantissa * Math.pow(10, exp);
}

export function discoverSystemCalls(romBytes) {
  const calls = new Map();

  for (let pos = 0; pos <= romBytes.length - 4; pos++) {
    if (romBytes[pos] !== 0xEF) {
      continue;
    }

    const target = romBytes[pos + 1] |
      (romBytes[pos + 2] << 8) |
      (romBytes[pos + 3] << 16);

    if (target <= 0x000100 || target >= 0x100000) {
      continue;
    }

    const entry = calls.get(target);
    if (entry) {
      entry.count++;
      entry.sites.push(pos);
      continue;
    }

    calls.set(target, {
      count: 1,
      sites: [pos],
    });
  }

  return new Map(
    [...calls.entries()].sort((left, right) => {
      return right[1].count - left[1].count || left[0] - right[0];
    })
  );
}

export function callFunction(entryPoint, args = [], options = {}) {
  if (!Number.isInteger(entryPoint)) {
    throw new TypeError('entryPoint must be an integer ROM address');
  }

  if (!Array.isArray(args)) {
    throw new TypeError('args must be an array of JS numbers');
  }

  if (args.length > OP_ADDRS.length) {
    throw new RangeError(`TI OS math calls accept at most ${OP_ADDRS.length} operands`);
  }

  const maxSteps = options.maxSteps ?? 10000;
  const trace = options.trace === true;
  const memory = createMemory();
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, memory, { peripherals });
  const { cpu } = executor;

  resetCpu(cpu);

  for (let i = 0; i < args.length; i++) {
    writeBytes(memory, OP_ADDRS[i], jsToTIReal(args[i]));
  }

  pushSentinel(memory, cpu);

  const execution = executor.runFrom(entryPoint, 'adl', {
    maxSteps,
    maxLoopIterations: 200,
    onBlock: trace ? (pc, mode, meta, step) => {
      const dasm = meta?.instructions?.[0]?.dasm ?? '???';
      console.log(`  [${step}] ${pc.toString(16).padStart(6, '0')}:${mode} ${dasm}`);
    } : undefined,
  });

  const rawResult = readBytes(memory, OP1, OP_SIZE);

  return {
    result: tiRealToJS(rawResult),
    rawResult,
    steps: execution.steps,
    termination: execution.termination,
  };
}

function identifyFunction(addr) {
  const tests = [
    { args: [2, 3], expect: 5, name: 'FPAdd' },
    { args: [7, 3], expect: 4, name: 'FPSub' },
    { args: [6, 7], expect: 42, name: 'FPMult' },
    { args: [22, 7], expect: 22 / 7, name: 'FPDiv', tol: 1e-10 },
    { args: [9], expect: 3, name: 'SqRoot' },
    { args: [Math.E], expect: 1, name: 'LnX' },
    { args: [100], expect: 2, name: 'LogX' },
    { args: [0], expect: 1, name: 'EToX' },
  ];

  for (const test of tests) {
    try {
      const result = callFunction(addr, test.args, { maxSteps: 5000 });

      if (result.termination !== 'missing_block' && result.termination !== 'halt') {
        continue;
      }

      const diff = Math.abs(result.result - test.expect);
      if (diff < (test.tol || 1e-12)) {
        return { name: test.name, steps: result.steps };
      }
    } catch {
      return null;
    }
  }

  return null;
}

function runCodecTests() {
  console.log('Codec Tests');
  console.log('===========');

  let passed = 0;

  for (const test of CODEC_TESTS) {
    const expected = parseHexBytes(test.hex);
    const encoded = jsToTIReal(test.value);
    const decoded = tiRealToJS(encoded);
    const bytesMatch = bytesEqual(encoded, expected);
    const valueMatch = Math.abs(decoded - test.value) <= test.tol;
    const ok = bytesMatch && valueMatch;

    if (ok) {
      passed++;
    }

    console.log(
      `${ok ? 'PASS' : 'FAIL'} value=${test.value} ` +
      `bytes=${bytesToHex(encoded)} decoded=${decoded}`
    );
  }

  console.log('');
  return { passed, total: CODEC_TESTS.length };
}

function printDiscoveryTable(systemCalls, limit = 30) {
  console.log('System Call Discovery');
  console.log('=====================');
  console.log('Address    Calls');

  let index = 0;
  for (const [addr, info] of systemCalls.entries()) {
    if (index >= limit) {
      break;
    }

    console.log(`${toHexAddr(addr).padEnd(10)} ${String(info.count).padStart(5)}`);
    index++;
  }

  console.log('');
}

function runSmokeTests() {
  console.log('Known Address Smoke Test');
  console.log('========================');

  let passed = 0;

  for (const test of SMOKE_TESTS) {
    const response = callFunction(test.addr, test.args, { maxSteps: 10000 });
    const diff = Math.abs(response.result - test.expect);
    const ok = diff <= test.tol;

    if (ok) {
      passed++;
    }

    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${test.name} ${toHexAddr(test.addr)} ` +
      `args=[${test.args.join(', ')}] result=${response.result} ` +
      `steps=${response.steps} termination=${response.termination}`
    );
  }

  console.log('');
  return { passed, total: SMOKE_TESTS.length };
}

function runBehavioralSweep(systemCalls) {
  console.log('Behavioral Sweep');
  console.log('================');

  const matches = [];
  const targets = [...systemCalls.keys()].slice(0, 50);

  for (const addr of targets) {
    const match = identifyFunction(addr);
    if (!match) {
      continue;
    }

    const knownName = KNOWN_FUNCTIONS.get(addr);
    const isConfirmed = knownName === match.name;
    matches.push({
      addr,
      name: match.name,
      steps: match.steps,
      knownName,
      isConfirmed,
    });

    const suffix = isConfirmed
      ? ' confirmed jump-table match'
      : knownName
        ? ` jump-table says ${knownName}`
        : '';

    console.log(
      `${toHexAddr(addr)} -> ${match.name} ` +
      `(steps=${match.steps})${suffix}`
    );
  }

  if (matches.length === 0) {
    console.log('No behavioral matches found in the top 50 discovery targets.');
  }

  console.log('');
  return matches;
}

function runSelfTest() {
  console.log('TI-84 Math Harness Self-Test');
  console.log('============================');
  console.log('');

  const codec = runCodecTests();
  const systemCalls = discoverSystemCalls(romBuffer);
  printDiscoveryTable(systemCalls, 30);
  const smoke = runSmokeTests();
  const matches = runBehavioralSweep(systemCalls);

  console.log('Summary');
  console.log('=======');
  console.log(`Codec tests: ${codec.passed}/${codec.total} passed`);
  console.log(`Discovered system call targets: ${systemCalls.size}`);
  console.log(`Known-address smoke tests: ${smoke.passed}/${smoke.total} passed`);
  console.log(`Behavioral matches found: ${matches.length}`);
}

const isMain = process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').replace(/^.*\//, ''));

if (isMain) {
  runSelfTest();
}
