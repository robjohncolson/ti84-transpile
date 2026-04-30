import { readReal } from './fp-real.mjs';

const MEMINIT_ENTRY = 0x09dee0;
const PARSEINP_ENTRY = 0x099914;
const CREATEREAL_ENTRY = 0x08238a;

const USER_MEM_ADDR = 0xd1a881;
const SYM_TABLE_END = 0xd3ffff;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;

const STACK_TOP = 0xd1a87e;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;
const CREATEREAL_RET = 0x7ffff2;
const SENTINEL_RET = 0xffffff;

const MEMINIT_BUDGET = 128;
const PARSE_BUDGET = 5000;
const CREATEREAL_BUDGET = 512;
const MAX_LOOP_ITER = 8192;

const ANS_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles', '_currentBlockPc',
];

const memReader = (memory) => ({
  read8(addr) {
    return memory[addr & 0xffffff] & 0xff;
  },
});

function requireExecutor(cpu) {
  const executor = cpu?.__executor;
  if (!executor?.runFrom) {
    throw new Error('Direct eval requires cpu.__executor to be bound.');
  }
  return executor;
}

function read24(memory, addr) {
  return ((memory[addr] & 0xff) | ((memory[addr + 1] & 0xff) << 8) | ((memory[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(memory, addr, value) {
  memory[addr] = value & 0xff;
  memory[addr + 1] = (value >>> 8) & 0xff;
  memory[addr + 2] = (value >>> 16) & 0xff;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function prepareCallState(cpu, memory) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_TOP - 12;
  memory.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrorFrame(cpu, memory, returnPc, errReturnPc = ERR_CATCH_ADDR, previousErrSp = 0) {
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(memory, cpu.sp, returnPc);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  write24(memory, errFrameBase, errReturnPc);
  write24(memory, errFrameBase + 3, previousErrSp);
  write24(memory, ERR_SP_ADDR, errFrameBase);
  memory[ERR_NO_ADDR] = 0x00;
}

function runCall(executor, cpu, memory, { entry, budget, returnPc, allowSentinelRet = false }) {
  let lastPc = entry & 0xffffff;
  let steps = 0;
  let returnHit = false;
  let errCaught = false;
  let sentinelRet = false;
  let termination = 'unknown';

  const trap = (pc, step) => {
    lastPc = pc & 0xffffff;
    steps = Math.max(steps, step + 1);
    if (lastPc === returnPc) throw new Error('__RET__');
    if (lastPc === ERR_CATCH_ADDR) throw new Error('__ERR__');
    if (allowSentinelRet && lastPc === SENTINEL_RET) throw new Error('__SENT__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        trap(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        trap(pc, step);
      },
    });
    lastPc = result.lastPc ?? lastPc;
    steps = Math.max(steps, result.steps ?? 0);
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__RET__') {
      returnHit = true;
      lastPc = returnPc;
      termination = 'return_hit';
    } else if (error?.message === '__ERR__') {
      errCaught = true;
      lastPc = ERR_CATCH_ADDR;
      termination = 'err_caught';
    } else if (error?.message === '__SENT__') {
      sentinelRet = true;
      lastPc = SENTINEL_RET;
      termination = 'sentinel_ret';
    } else {
      throw error;
    }
  }

  return {
    steps,
    lastPc,
    returnHit,
    errCaught,
    sentinelRet,
    termination,
    error: memory[ERR_NO_ADDR] & 0xff,
    de: cpu.de & 0xffffff,
  };
}

function runMemInit(executor, cpu, memory) {
  prepareCallState(cpu, memory);
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(memory, cpu.sp, MEMINIT_RET);
  memory[ERR_NO_ADDR] = 0x00;
  return runCall(executor, cpu, memory, {
    entry: MEMINIT_ENTRY,
    budget: MEMINIT_BUDGET,
    returnPc: MEMINIT_RET,
  });
}

function suspendInterrupts(cpu) {
  const peripherals = cpu?.__peripherals;
  if (!peripherals) return () => {};

  const saved = {
    tick: peripherals.tick,
    hasPendingIRQ: peripherals.hasPendingIRQ,
    hasPendingNMI: peripherals.hasPendingNMI,
    acknowledgeIRQ: peripherals.acknowledgeIRQ,
    acknowledgeNMI: peripherals.acknowledgeNMI,
  };

  peripherals.tick = () => {};
  peripherals.hasPendingIRQ = () => false;
  peripherals.hasPendingNMI = () => false;
  peripherals.acknowledgeIRQ = () => {};
  peripherals.acknowledgeNMI = () => {};

  return () => {
    peripherals.tick = saved.tick;
    peripherals.hasPendingIRQ = saved.hasPendingIRQ;
    peripherals.hasPendingNMI = saved.hasPendingNMI;
    peripherals.acknowledgeIRQ = saved.acknowledgeIRQ;
    peripherals.acknowledgeNMI = saved.acknowledgeNMI;
  };
}

function decodeOp1(memory) {
  try {
    return readReal(memReader(memory), OP1_ADDR);
  } catch {
    return Number.NaN;
  }
}

export function initializeDirectEval(cpu, memory = cpu?.memory) {
  const executor = requireExecutor(cpu);
  const snapshot = snapshotCpu(cpu);

  try {
    const memInit = runMemInit(executor, cpu, memory);
    return {
      ok: memInit.returnHit || memInit.sentinelRet,
      steps: memInit.steps,
      error: memInit.error,
    };
  } finally {
    restoreCpu(cpu, snapshot);
  }
}

export function evaluateExpression(cpu, memory = cpu?.memory, tokenBytes) {
  if (!(tokenBytes instanceof Uint8Array) || tokenBytes.length === 0) {
    throw new Error('evaluateExpression requires a non-empty Uint8Array token buffer.');
  }

  const executor = requireExecutor(cpu);
  const snapshot = snapshotCpu(cpu);
  let totalSteps = 0;

  try {
    const memInit = runMemInit(executor, cpu, memory);
    totalSteps += memInit.steps;
    if (!(memInit.returnHit || memInit.sentinelRet)) {
      return { value: Number.NaN, steps: totalSteps, error: memInit.error };
    }

    memory.fill(0x00, USER_MEM_ADDR, USER_MEM_ADDR + tokenBytes.length + 1);
    memory.set(tokenBytes, USER_MEM_ADDR);
    memory.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
    write24(memory, BEGPC_ADDR, USER_MEM_ADDR);
    write24(memory, CURPC_ADDR, USER_MEM_ADDR);
    write24(memory, ENDPC_ADDR, USER_MEM_ADDR + tokenBytes.length);

    prepareCallState(cpu, memory);
    seedErrorFrame(cpu, memory, FAKE_RET);

    const resumeInterrupts = suspendInterrupts(cpu);
    let parseRun;
    try {
      parseRun = runCall(executor, cpu, memory, {
        entry: PARSEINP_ENTRY,
        budget: PARSE_BUDGET,
        returnPc: FAKE_RET,
        allowSentinelRet: true,
      });
    } finally {
      resumeInterrupts();
    }

    totalSteps += parseRun.steps;
    const valueBytes = Uint8Array.from(memory.subarray(OP1_ADDR, OP1_ADDR + 9));
    const value = decodeOp1(memory);

    write24(memory, FPS_ADDR, read24(memory, FPSBASE_ADDR));
    write24(memory, OPBASE_ADDR, SYM_TABLE_END);
    write24(memory, OPS_ADDR, SYM_TABLE_END);

    if (parseRun.returnHit || parseRun.sentinelRet) {
      memory.set(ANS_OP1, OP1_ADDR);
      prepareCallState(cpu, memory);
      cpu.a = 0x00;
      cpu._hl = 0x000009;
      seedErrorFrame(cpu, memory, CREATEREAL_RET);

      const createRun = runCall(executor, cpu, memory, {
        entry: CREATEREAL_ENTRY,
        budget: CREATEREAL_BUDGET,
        returnPc: CREATEREAL_RET,
        allowSentinelRet: true,
      });

      totalSteps += createRun.steps;
      const dataPtr = createRun.de & 0xffffff;
      if (dataPtr >= 0 && dataPtr + valueBytes.length <= memory.length) {
        memory.set(valueBytes, dataPtr);
      }
    }

    memory.set(valueBytes, OP1_ADDR);
    return {
      value,
      steps: totalSteps,
      error: memory[ERR_NO_ADDR] & 0xff,
    };
  } finally {
    restoreCpu(cpu, snapshot);
  }
}
