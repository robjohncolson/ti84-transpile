#!/usr/bin/env node

/*
 * Phase 347: 0x0019B5 HALT continuation probe
 *
 * Key answers
 * - 0x0019B5 is the entry of the crash/halt stub, not the HALT opcode itself.
 * - The actual HALT byte is 0x0019BD.
 * - 0x0019B6 is not the post-HALT continuation. It is still inside the stub:
 *   LD A,0x10. The true "resume after HALT" PC would be 0x0019BE.
 * - No EI precedes this HALT. The stub begins with DI at 0x0019B5, so IFF1 is
 *   forced low before HALT executes.
 * - Boot sets IM 1 at 0x00069A (ED 56). A maskable IRQ would therefore use
 *   vector 0x000038, but only if IFF1 were 1. With DI in effect, the modeled
 *   timer IRQ cannot wake this halt. Only NMI at 0x000066 could wake it.
 *
 * Full z80 disassembly of ROM bytes 0x001980-0x001A20
 *
 * 0x001980: 28 04          JR Z,0x001986          ; quick success exit
 * 0x001982: 06 A5          LD B,0xA5
 * 0x001984: 10 FE          DJNZ 0x001984          ; short delay loop
 * 0x001986: C1             POP BC
 * 0x001987: C9             RET
 *
 * 0x001988: F3             DI
 * 0x001989: C5             PUSH BC
 * 0x00198A: ED 38 03       IN0 A,(0x03)
 * 0x00198D: CB 67          BIT 4,A
 * 0x00198F: 20 18          JR NZ,0x0019A9
 * 0x001991: 40 01 05 10    LD.SIS BC,0x1005
 * 0x001995: 3E 04          LD A,0x04
 * 0x001997: ED 79          OUT (C),A
 * 0x001999: FE 04          CP 0x04
 * 0x00199B: 28 01          JR Z,0x00199E
 * 0x00199D: CF             RST 0x08
 * 0x00199E: 78             LD A,B
 * 0x00199F: FE 10          CP 0x10
 * 0x0019A1: 28 01          JR Z,0x0019A4
 * 0x0019A3: CF             RST 0x08
 * 0x0019A4: 79             LD A,C
 * 0x0019A5: FE 05          CP 0x05
 * 0x0019A7: 20 FA          JR NZ,0x0019A3
 *
 * 0x0019A9: 3E 03          LD A,0x03
 * 0x0019AB: ED 39 01       OUT0 (0x01),A
 * 0x0019AE: FE 03          CP 0x03
 * 0x0019B0: 28 01          JR Z,0x0019B3
 * 0x0019B2: CF             RST 0x08
 * 0x0019B3: C1             POP BC
 * 0x0019B4: C9             RET
 *
 * 0x0019B5: F3             DI                      ; stub entry seen in boot
 * 0x0019B6: 3E 10          LD A,0x10               ; requested "PC+1"
 * 0x0019B8: ED 39 00       OUT0 (0x00),A           ; CPU control port
 * 0x0019BB: 00             NOP
 * 0x0019BC: 00             NOP
 * 0x0019BD: 76             HALT                    ; actual HALT opcode
 *
 * 0x0019BE: 40 01 15 50    LD.SIS BC,0x5015        ; true post-HALT resume PC
 * 0x0019C2: ED 78          IN A,(C)                ; masked status byte 1
 * 0x0019C4: 28 29          JR Z,0x0019EF
 * 0x0019C6: 0E 09          LD C,0x09               ; ack byte 1 at 0x5009
 * 0x0019C8: 17             RLA
 * 0x0019C9: 17             RLA
 * 0x0019CA: 38 7F          JR C,0x001A4B           ; original byte1 bit6
 * 0x0019CC: 17             RLA
 * 0x0019CD: DA 77 1A       JP C,0x001A77           ; original byte1 bit5
 * 0x0019D0: 00             NOP
 * 0x0019D1: 17             RLA
 * 0x0019D2: DA 8D 1A       JP C,0x001A8D           ; original byte1 bit4
 * 0x0019D5: 00             NOP
 * 0x0019D6: 17             RLA
 * 0x0019D7: 17             RLA
 * 0x0019D8: DA BB 1A       JP C,0x001ABB           ; original byte1 bit2
 * 0x0019DB: 00             NOP
 * 0x0019DC: 17             RLA
 * 0x0019DD: 17             RLA
 * 0x0019DE: 3E FF          LD A,0xFF
 * 0x0019E0: ED 79          OUT (C),A               ; default ack for byte 1
 * 0x0019E2: 78             LD A,B
 * 0x0019E3: FE 50          CP 0x50
 * 0x0019E5: 28 01          JR Z,0x0019E8
 * 0x0019E7: CF             RST 0x08
 * 0x0019E8: 79             LD A,C
 * 0x0019E9: FE 09          CP 0x09
 * 0x0019EB: 20 FA          JR NZ,0x0019E7
 * 0x0019ED: 18 43          JR 0x001A32
 *
 * 0x0019EF: 0D             DEC C
 * 0x0019F0: ED 78          IN A,(C)                ; masked status byte 0
 * 0x0019F2: 28 23          JR Z,0x001A17
 * 0x0019F4: 0E 08          LD C,0x08               ; ack byte 0 at 0x5008
 * 0x0019F6: 1F             RRA
 * 0x0019F7: 1F             RRA
 * 0x0019F8: 1F             RRA
 * 0x0019F9: 1F             RRA
 * 0x0019FA: DA A3 1A       JP C,0x001AA3           ; original byte0 bit3
 * 0x0019FD: 00             NOP
 * 0x0019FE: 1F             RRA
 * 0x0019FF: DA CF 1A       JP C,0x001ACF           ; original byte0 bit4
 * 0x001A02: 00             NOP
 * 0x001A03: 1F             RRA
 * 0x001A04: 1F             RRA
 * 0x001A05: 1F             RRA
 * 0x001A06: 3E FF          LD A,0xFF
 * 0x001A08: ED 79          OUT (C),A               ; default ack for byte 0
 * 0x001A0A: 78             LD A,B
 * 0x001A0B: FE 50          CP 0x50
 * 0x001A0D: 28 01          JR Z,0x001A10
 * 0x001A0F: CF             RST 0x08
 * 0x001A10: 79             LD A,C
 * 0x001A11: FE 08          CP 0x08
 * 0x001A13: 20 FA          JR NZ,0x001A0F
 * 0x001A15: 18 1B          JR 0x001A32
 *
 * 0x001A17: 0C             INC C
 * 0x001A18: 0C             INC C
 * 0x001A19: ED 78          IN A,(C)                ; masked status byte 2
 * 0x001A1B: 0E 0A          LD C,0x0A               ; ack byte 2 at 0x500A
 * 0x001A1D: 1F             RRA
 * 0x001A1E: 1F             RRA
 * 0x001A1F: 1F             RRA
 * 0x001A20: 1F             RRA                     ; original byte2 bit3 -> carry
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const HALT_STUB_ENTRY = 0x0019B5;
const HALT_OPCODE = 0x0019BD;
const POST_HALT_PC = 0x0019BE;
const IM1_SETUP_PC = 0x00069A;
const IRQ_VECTOR = 0x000038;
const NMI_VECTOR = 0x000066;
const DISASM_START = 0x001980;
const DISASM_END = 0x001A21;
const NATURAL_TIMER_INTERVAL = 1;
const NATURAL_MAX_STEPS = 256;
const NATURAL_MAX_LOOP_ITERATIONS = 500000;
const SYNTHETIC_SEGMENT_MAX_STEPS = 64;
const POST_HALT_TRACE_BLOCKS = 128;
const SYNTHETIC_STACK_TOP = 0xD0FFF8;
const TIMER_MASK_BYTE0_BIT4 = 0x000010;
const RELEVANT_IO_SAMPLE_LIMIT = 64;

let createExecutor = null;
let createPeripheralBus = null;
let PRELIFTED_BLOCKS = null;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function hexPort(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0')}`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function snapshotCpu(cpu) {
  return {
    a: cpu.a,
    f: cpu.f,
    bc: cpu.bc,
    de: cpu.de,
    hl: cpu.hl,
    ix: cpu.ix,
    iy: cpu.iy,
    sp: cpu.sp,
    i: cpu.i,
    im: cpu.im,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    madl: cpu.madl,
    mbase: cpu.mbase,
    halted: cpu.halted,
    cycles: cpu.cycles,
    a2: cpu._a2,
    f2: cpu._f2,
    bc2: cpu._bc2,
    de2: cpu._de2,
    hl2: cpu._hl2,
  };
}

function restoreCpu(cpu, snapshot) {
  cpu.a = snapshot.a;
  cpu.f = snapshot.f;
  cpu.bc = snapshot.bc;
  cpu.de = snapshot.de;
  cpu.hl = snapshot.hl;
  cpu.ix = snapshot.ix;
  cpu.iy = snapshot.iy;
  cpu.sp = snapshot.sp;
  cpu.i = snapshot.i;
  cpu.im = snapshot.im;
  cpu.iff1 = snapshot.iff1;
  cpu.iff2 = snapshot.iff2;
  cpu.madl = snapshot.madl;
  cpu.mbase = snapshot.mbase;
  cpu.halted = snapshot.halted;
  cpu.cycles = snapshot.cycles;
  cpu._a2 = snapshot.a2;
  cpu._f2 = snapshot.f2;
  cpu._bc2 = snapshot.bc2;
  cpu._de2 = snapshot.de2;
  cpu._hl2 = snapshot.hl2;
}

function formatCpu(cpu) {
  return [
    `A=${hexByte(cpu.a)}`,
    `F=${hexByte(cpu.f)}`,
    `BC=${hex(cpu.bc)}`,
    `DE=${hex(cpu.de)}`,
    `HL=${hex(cpu.hl)}`,
    `IX=${hex(cpu.ix)}`,
    `IY=${hex(cpu.iy)}`,
    `SP=${hex(cpu.sp)}`,
    `I=${hexByte(cpu.i)}`,
    `IM=${cpu.im}`,
    `IFF1=${cpu.iff1}`,
    `IFF2=${cpu.iff2}`,
    `MBASE=${hexByte(cpu.mbase)}`,
    `MADL=${cpu.madl}`,
    `HALT=${cpu.halted}`,
  ].join(' ');
}

function bytesFor(buffer, addr, len) {
  return Array.from(
    buffer.slice(addr, addr + len),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function conditionName(condition) {
  return condition ? condition.toUpperCase() : '';
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `.${inst.modePrefix.toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'nop':
      return 'NOP';
    case 'im':
      return `IM ${inst.value}`;
    case 'push':
      return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop':
      return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${inst.dest.toUpperCase()},${hexByte(inst.value)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${inst.pair.toUpperCase()},${hex(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${inst.dest.toUpperCase()},${inst.src.toUpperCase()}`;
    case 'out0':
      return `${prefix}OUT0 (${hexByte(inst.port)}),${inst.reg.toUpperCase()}`;
    case 'in0':
      return `${prefix}IN0 ${inst.reg.toUpperCase()},(${hexByte(inst.port)})`;
    case 'out-reg':
      return `${prefix}OUT (C),${inst.reg.toUpperCase()}`;
    case 'in-reg':
      return `${prefix}IN ${inst.reg.toUpperCase()},(C)`;
    case 'alu-imm':
      return `${prefix}${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit},${inst.reg.toUpperCase()}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${conditionName(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${conditionName(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return inst.cond ? `${prefix}RET ${conditionName(inst.cond)}` : `${prefix}RET`;
    case 'rst':
      return `${prefix}RST 0x${inst.target.toString(16).toUpperCase().padStart(2, '0')}`;
    case 'rla':
      return `${prefix}RLA`;
    case 'rra':
      return `${prefix}RRA`;
    case 'dec-reg':
      return `${prefix}DEC ${inst.reg.toUpperCase()}`;
    case 'inc-reg':
      return `${prefix}INC ${inst.reg.toUpperCase()}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    default:
      return JSON.stringify(inst);
  }
}

function printDisassembly(romBytes, start, end) {
  console.log('ROM disassembly 0x001980-0x001A20');
  console.log('----------------------------------');

  let pc = start;
  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, 'z80');
    const len = Math.max(1, inst.length || 1);
    const raw = bytesFor(romBytes, pc, len).padEnd(14, ' ');
    console.log(`  ${hex(pc)}: ${raw} ${formatInstruction(inst)}`);
    pc += len;
  }
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function isRelevantPort(port) {
  const normalized = port & 0xFFFF;
  return normalized === 0x0000
    || normalized === 0x0001
    || normalized === 0x0028
    || normalized === 0x003D
    || normalized === 0x003E
    || (normalized >= 0x5004 && normalized <= 0x5016);
}

function attachRelevantIoTrace(cpu, sink) {
  const originalOnIoRead = cpu.onIoRead?.bind(cpu) ?? (() => {});
  const originalOnIoWrite = cpu.onIoWrite?.bind(cpu) ?? (() => {});

  cpu.onIoRead = (port, value) => {
    if (sink.length < RELEVANT_IO_SAMPLE_LIMIT && isRelevantPort(port)) {
      sink.push({ dir: 'R', port: port & 0xFFFF, value: value & 0xFF });
    }
    originalOnIoRead(port, value);
  };

  cpu.onIoWrite = (port, value) => {
    if (sink.length < RELEVANT_IO_SAMPLE_LIMIT && isRelevantPort(port)) {
      sink.push({ dir: 'W', port: port & 0xFFFF, value: value & 0xFF });
    }
    originalOnIoWrite(port, value);
  };
}

function createEnvironment(romBytes, peripheralOptions = {}) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus(peripheralOptions);
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function installIntcShadow(peripherals) {
  const state = {
    rawStatus: 0,
    enableMask: 0,
    ackWrites: [],
  };

  function maskedStatus() {
    return (state.rawStatus & state.enableMask) >>> 0;
  }

  peripherals.register({ start: 0x5000, end: 0x501F }, {
    read(port) {
      const reg = port & 0x1F;
      if (reg === 0x00) return state.rawStatus & 0xFF;
      if (reg === 0x01) return (state.rawStatus >> 8) & 0xFF;
      if (reg === 0x02) return (state.rawStatus >> 16) & 0xFF;
      if (reg === 0x04) return state.enableMask & 0xFF;
      if (reg === 0x05) return (state.enableMask >> 8) & 0xFF;
      if (reg === 0x06) return (state.enableMask >> 16) & 0xFF;
      if (reg === 0x14) return maskedStatus() & 0xFF;
      if (reg === 0x15) return (maskedStatus() >> 8) & 0xFF;
      if (reg === 0x16) return (maskedStatus() >> 16) & 0xFF;
      return 0x00;
    },

    write(port, value) {
      const reg = port & 0x1F;
      if (reg === 0x04) {
        state.enableMask = (state.enableMask & 0xFFFF00) | value;
        return;
      }
      if (reg === 0x05) {
        state.enableMask = (state.enableMask & 0xFF00FF) | (value << 8);
        return;
      }
      if (reg === 0x06) {
        state.enableMask = (state.enableMask & 0x00FFFF) | (value << 16);
        return;
      }
      if (reg === 0x08) {
        state.rawStatus &= ~value;
      } else if (reg === 0x09) {
        state.rawStatus &= ~(value << 8);
      } else if (reg === 0x0A) {
        state.rawStatus &= ~(value << 16);
      } else {
        return;
      }

      if (state.ackWrites.length < RELEVANT_IO_SAMPLE_LIMIT) {
        state.ackWrites.push({
          port: port & 0xFFFF,
          value: value & 0xFF,
          maskedAfter: maskedStatus(),
        });
      }
    },
  });

  return {
    arm(mask) {
      state.rawStatus = mask >>> 0;
      state.enableMask = mask >>> 0;
    },

    snapshot() {
      return {
        rawStatus: state.rawStatus >>> 0,
        enableMask: state.enableMask >>> 0,
        maskedStatus: maskedStatus(),
      };
    },

    ackWrites: state.ackWrites,
  };
}

function printIoSamples(title, samples) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));

  if (samples.length === 0) {
    console.log('  none');
    return;
  }

  for (const entry of samples) {
    console.log(`  ${entry.dir}${hexPort(entry.port)}=${hexByte(entry.value)}`);
  }
}

function printBlockTrace(title, trace, formatter = null) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));

  if (trace.length === 0) {
    console.log('  none');
    return;
  }

  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i];
    const suffix = formatter ? ` ${formatter(entry)}` : '';
    console.log(
      `  [${String(i + 1).padStart(3, '0')}] `
      + `step=${String(entry.step).padStart(4, ' ')} `
      + `pc=${hex(entry.pc)}:${entry.mode}${suffix}`,
    );
  }
}

function runNaturalBoot(romBytes) {
  const env = createEnvironment(romBytes, {
    timerInterrupt: true,
    timerInterval: NATURAL_TIMER_INTERVAL,
  });
  const trace = [];
  const interrupts = [];
  const ioSamples = [];

  attachRelevantIoTrace(env.cpu, ioSamples);

  const result = env.executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: NATURAL_MAX_STEPS,
    maxLoopIterations: NATURAL_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, steps) {
      trace.push({
        step: steps,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      });
    },
    onInterrupt(type, returnPc, vector, steps) {
      interrupts.push({
        type,
        returnPc: returnPc & 0xFFFFFF,
        vector: vector & 0xFFFFFF,
        step: steps,
      });
    },
  });

  return {
    trace,
    interrupts,
    ioSamples,
    result,
    cpuSummary: formatCpu(env.cpu),
    cpuSnapshot: snapshotCpu(env.cpu),
    memSnapshot: new Uint8Array(env.mem),
  };
}

function runSyntheticVector(romBytes, bootState, vectorPc, label) {
  const env = createEnvironment(romBytes, { timerInterrupt: false });
  env.mem.set(bootState.memSnapshot);
  restoreCpu(env.cpu, bootState.cpuSnapshot);
  env.cpu.halted = false;
  env.cpu.madl = 0;
  env.cpu.push(POST_HALT_PC);
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;

  const trace = [];
  const result = env.executor.runFrom(vectorPc, 'z80', {
    maxSteps: SYNTHETIC_SEGMENT_MAX_STEPS,
    maxLoopIterations: NATURAL_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, steps) {
      trace.push({
        step: steps,
        pc: pc & 0xFFFFFF,
        mode: mode ?? 'adl',
      });
    },
  });

  return {
    label,
    vectorPc,
    trace,
    result,
    cpuSummary: formatCpu(env.cpu),
  };
}

function seedSyntheticResumeFrame(cpu) {
  cpu.halted = false;
  cpu.madl = 0;
  cpu.mbase = 0xD0;
  cpu.sp = SYNTHETIC_STACK_TOP;

  // RETI will eventually pop HALT_STUB_ENTRY. Before that, 0x001A32 pops IX/IY
  // and the callback pointer into HL, so push in reverse order.
  cpu.push(HALT_STUB_ENTRY);
  cpu.push(0x0000);
  cpu.push(0x0000);
  cpu.push(POST_HALT_PC);
}

function runForcedResumeSeries(romBytes, bootState, options) {
  const { label, mask } = options;
  const env = createEnvironment(romBytes, { timerInterrupt: false });
  env.mem.set(bootState.memSnapshot);
  restoreCpu(env.cpu, bootState.cpuSnapshot);

  const intcShadow = installIntcShadow(env.peripherals);
  const trace = [];
  const segmentSummaries = [];
  const ioSamples = [];

  attachRelevantIoTrace(env.cpu, ioSamples);

  let cycle = 0;
  while (trace.length < POST_HALT_TRACE_BLOCKS) {
    cycle++;
    intcShadow.arm(mask);
    seedSyntheticResumeFrame(env.cpu);

    const segment = env.executor.runFrom(POST_HALT_PC, 'z80', {
      maxSteps: SYNTHETIC_SEGMENT_MAX_STEPS,
      maxLoopIterations: NATURAL_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, _meta, steps) {
        if (trace.length >= POST_HALT_TRACE_BLOCKS) {
          return;
        }
        trace.push({
          step: trace.length,
          pc: pc & 0xFFFFFF,
          mode: mode ?? 'adl',
          cycle,
          segmentStep: steps,
        });
      },
    });

    segmentSummaries.push({
      cycle,
      termination: segment.termination,
      lastPc: segment.lastPc & 0xFFFFFF,
      lastMode: segment.lastMode ?? 'adl',
      maskedAfter: intcShadow.snapshot().maskedStatus,
    });

    if (segment.termination !== 'halt' || (segment.lastPc & 0xFFFFFF) !== HALT_STUB_ENTRY) {
      break;
    }
  }

  return {
    label,
    mask,
    trace,
    segmentSummaries,
    ioSamples,
    intcSnapshot: intcShadow.snapshot(),
    ackWrites: intcShadow.ackWrites,
    cpuSummary: formatCpu(env.cpu),
  };
}

function printInterruptSummary(interrupts) {
  console.log('\nInterrupt callbacks');
  console.log('-------------------');

  if (interrupts.length === 0) {
    console.log('  none');
    return;
  }

  for (const entry of interrupts) {
    console.log(
      `  step=${formatCount(entry.step)} `
      + `${entry.type} returnPc=${hex(entry.returnPc)} vector=${hex(entry.vector)}`,
    );
  }
}

function printSegmentSummaries(title, segments) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));

  for (const entry of segments) {
    console.log(
      `  cycle=${String(entry.cycle).padStart(2, '0')} `
      + `termination=${entry.termination} `
      + `lastPc=${hex(entry.lastPc)}:${entry.lastMode} `
      + `maskedAfter=${hex(entry.maskedAfter)}`,
    );
  }
}

function mainSummary(natural, syntheticIrq, syntheticNmi, forcedClear, forcedTimer) {
  const knownLoopPcs = new Set([0x001713, 0x0067F8, 0x001C33]);
  const knownLoopSeen = forcedTimer.trace.some((entry) => knownLoopPcs.has(entry.pc))
    || forcedClear.trace.some((entry) => knownLoopPcs.has(entry.pc))
    || natural.trace.some((entry) => knownLoopPcs.has(entry.pc));

  console.log('\nSummary');
  console.log('-------');
  console.log(`EI before HALT:           no (stub starts with DI at ${hex(HALT_STUB_ENTRY)})`);
  console.log(`Requested PC+1:           ${hex(HALT_STUB_ENTRY + 1)} = LD A,0x10`);
  console.log(`Actual HALT opcode:       ${hex(HALT_OPCODE)}`);
  console.log(`True post-HALT PC:        ${hex(POST_HALT_PC)} = LD.SIS BC,0x5015`);
  console.log(`Interrupt mode:           IM 1 at ${hex(IM1_SETUP_PC)} -> maskable vector ${hex(IRQ_VECTOR)}`);
  console.log(`NMI vector:               ${hex(NMI_VECTOR)}`);
  console.log(`Natural timer wake:       ${natural.interrupts.length > 0 ? 'yes' : 'no'}`);
  console.log(`Natural boot halt:        ${hex(natural.result.lastPc)}:${natural.result.lastMode}`);
  console.log(`Natural boot CPU:         ${natural.cpuSummary}`);
  console.log(`Synthetic IRQ vector:     ${syntheticIrq.trace.map((entry) => hex(entry.pc)).join(' -> ')}`);
  console.log(`Synthetic NMI vector:     ${syntheticNmi.trace.map((entry) => hex(entry.pc)).join(' -> ')}`);
  console.log(
    `Forced resume (clear):    ${forcedClear.trace.slice(0, 7).map((entry) => hex(entry.pc)).join(' -> ')}`
    + ' -> ...',
  );
  console.log(
    `Forced resume (timer):    ${forcedTimer.trace.slice(0, 9).map((entry) => hex(entry.pc)).join(' -> ')}`
    + ' -> ...',
  );
  console.log(
    'Diagnosis:                timer IRQs do not wake this boot halt because IM1 is set but IFF1 is 0 at '
    + `${hex(HALT_OPCODE)}. The current vector-side peripheral model also routes synthetic IRQ/NMI entry `
    + `back through ${hex(NMI_VECTOR)} -> 0x000047 -> 0x0008BB -> 0x00004C -> ${hex(HALT_STUB_ENTRY)} `
    + 'instead of returning to 0x0019BE.',
  );
  console.log(
    'Natural continuation fix: a faithful wake needs both a wake-capable source at HALT '
    + '(NMI, or a path that leaves IFF1 enabled) and interrupt-controller responses on '
    + '0x5014/0x5015/0x5016 that let the 0x0019BE dispatcher service a real source.',
  );
  console.log(
    `Known 0x001713 -> 0x0067F8 -> 0x001C33 loop reached: ${knownLoopSeen ? 'yes' : 'no'}`,
  );
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();
const romBytes = fs.readFileSync(ROM_PATH);

({ createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href));
({ createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href));
({ PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href));

console.log('Phase 347: 0x0019B5 HALT continuation');
console.log('=====================================');
console.log(`ROM:                     ${path.basename(ROM_PATH)}`);
console.log(`Transpiled ROM:          ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
console.log(`Timer interval (probe):  ${formatCount(NATURAL_TIMER_INTERVAL)} block`);
console.log(`HALT stub entry:         ${hex(HALT_STUB_ENTRY)}`);
console.log(`Actual HALT opcode:      ${hex(HALT_OPCODE)}`);
console.log(`True post-HALT PC:       ${hex(POST_HALT_PC)}`);

printDisassembly(romBytes, DISASM_START, DISASM_END);

const natural = runNaturalBoot(romBytes);
const syntheticIrq = runSyntheticVector(romBytes, natural, IRQ_VECTOR, 'synthetic-irq');
const syntheticNmi = runSyntheticVector(romBytes, natural, NMI_VECTOR, 'synthetic-nmi');
const forcedClear = runForcedResumeSeries(romBytes, natural, {
  label: 'forced-clear-status',
  mask: 0x000000,
});
const forcedTimer = runForcedResumeSeries(romBytes, natural, {
  label: 'forced-byte0-bit4-timer',
  mask: TIMER_MASK_BYTE0_BIT4,
});

printBlockTrace('Natural boot path with timerInterrupt: true', natural.trace);
printInterruptSummary(natural.interrupts);
printIoSamples('Natural boot relevant I/O', natural.ioSamples);

printBlockTrace(`Synthetic IRQ vector from halted state (${hex(IRQ_VECTOR)})`, syntheticIrq.trace);
console.log(`\nSynthetic IRQ CPU: ${syntheticIrq.cpuSummary}`);

printBlockTrace(`Synthetic NMI vector from halted state (${hex(NMI_VECTOR)})`, syntheticNmi.trace);
console.log(`\nSynthetic NMI CPU: ${syntheticNmi.cpuSummary}`);

printBlockTrace('Forced post-HALT resume trace (all masked-status bytes clear)', forcedClear.trace, (entry) => {
  return `cycle=${String(entry.cycle).padStart(2, '0')} segStep=${String(entry.segmentStep).padStart(2, '0')}`;
});
printSegmentSummaries('Forced all-clear segment summary', forcedClear.segmentSummaries);
printIoSamples('Forced all-clear relevant I/O', forcedClear.ioSamples);

printBlockTrace('Forced post-HALT resume trace (masked-status byte0 bit4 set)', forcedTimer.trace, (entry) => {
  return `cycle=${String(entry.cycle).padStart(2, '0')} segStep=${String(entry.segmentStep).padStart(2, '0')}`;
});
printSegmentSummaries('Forced timer segment summary', forcedTimer.segmentSummaries);
printIoSamples('Forced timer relevant I/O', forcedTimer.ioSamples);

console.log('\nForced timer INTC shadow');
console.log('------------------------');
console.log(`  rawStatus=${hex(forcedTimer.intcSnapshot.rawStatus)}`);
console.log(`  enableMask=${hex(forcedTimer.intcSnapshot.enableMask)}`);
console.log(`  maskedStatus=${hex(forcedTimer.intcSnapshot.maskedStatus)}`);
if (forcedTimer.ackWrites.length > 0) {
  for (const entry of forcedTimer.ackWrites) {
    console.log(
      `  ack ${hexPort(entry.port)}=${hexByte(entry.value)} maskedAfter=${hex(entry.maskedAfter)}`,
    );
  }
}

mainSummary(natural, syntheticIrq, syntheticNmi, forcedClear, forcedTimer);
