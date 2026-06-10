import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as Decoder from './ez80-decoder.js';
import * as Runtime from './cpu-runtime.js';
import * as Peripherals from './peripherals.js';
import './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMAND_ENTRY = 0x05899d;
const STATIC_LEN = 512;
const COMMAND_REGION_START = 0x058900;
const COMMAND_REGION_END = 0x05a000;
const WATCH_PCS = [0x05899d, 0x099921, 0x05884c, 0x058854, 0x0587e9, 0x058b73];

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
const hexByte = (value) => (value & 0xff).toString(16).padStart(2, '0');

function readRom() {
  const romPath = path.join(__dirname, 'ROM.rom');
  return fs.readFileSync(romPath);
}

function rel8(targetPc, offset) {
  const signed = offset & 0x80 ? offset - 0x100 : offset;
  return (targetPc + signed) & 0xffffff;
}

function rel24(targetPc, b0, b1, b2) {
  const raw = b0 | (b1 << 8) | (b2 << 16);
  const signed = raw & 0x800000 ? raw - 0x1000000 : raw;
  return (targetPc + signed) & 0xffffff;
}

function localDecode(rom, pc) {
  const b0 = rom[pc];
  const b1 = rom[pc + 1];
  const b2 = rom[pc + 2];
  const b3 = rom[pc + 3];

  if (b0 === 0xcd) return { size: 4, text: `CALL ${hex(b1 | (b2 << 8) | (b3 << 16))}`, target: b1 | (b2 << 8) | (b3 << 16), kind: 'CALL' };
  if (b0 === 0xc3) return { size: 4, text: `JP ${hex(b1 | (b2 << 8) | (b3 << 16))}`, target: b1 | (b2 << 8) | (b3 << 16), kind: 'JP' };
  if (b0 === 0xc2) return { size: 4, text: `JP NZ, ${hex(b1 | (b2 << 8) | (b3 << 16))}`, target: b1 | (b2 << 8) | (b3 << 16), kind: 'JP' };
  if (b0 === 0xca) return { size: 4, text: `JP Z, ${hex(b1 | (b2 << 8) | (b3 << 16))}`, target: b1 | (b2 << 8) | (b3 << 16), kind: 'JP' };
  if (b0 === 0xd2) return { size: 4, text: `JP NC, ${hex(b1 | (b2 << 8) | (b3 << 16))}`, target: b1 | (b2 << 8) | (b3 << 16), kind: 'JP' };
  if (b0 === 0xda) return { size: 4, text: `JP C, ${hex(b1 | (b2 << 8) | (b3 << 16))}`, target: b1 | (b2 << 8) | (b3 << 16), kind: 'JP' };
  if (b0 === 0x18) return { size: 2, text: `JR ${hex(rel8(pc + 2, b1))}`, target: rel8(pc + 2, b1), kind: 'JR' };
  if (b0 === 0x20) return { size: 2, text: `JR NZ, ${hex(rel8(pc + 2, b1))}`, target: rel8(pc + 2, b1), kind: 'JR' };
  if (b0 === 0x28) return { size: 2, text: `JR Z, ${hex(rel8(pc + 2, b1))}`, target: rel8(pc + 2, b1), kind: 'JR' };
  if (b0 === 0x30) return { size: 2, text: `JR NC, ${hex(rel8(pc + 2, b1))}`, target: rel8(pc + 2, b1), kind: 'JR' };
  if (b0 === 0x38) return { size: 2, text: `JR C, ${hex(rel8(pc + 2, b1))}`, target: rel8(pc + 2, b1), kind: 'JR' };
  if (b0 === 0xed && b1 === 0x5b) return { size: 5, text: `LEA ${hex(b2 | (b3 << 8) | (rom[pc + 4] << 16))}` };
  if (b0 === 0xfb && b1 === 0x18) return { size: 5, text: `JAR ${hex(rel24(pc + 5, b2, b3, rom[pc + 4]))}`, target: rel24(pc + 5, b2, b3, rom[pc + 4]), kind: 'JR' };
  if (b0 === 0xfe) return { size: 2, text: `CP ${hex(b1, 2)}`, kind: 'CP' };
  if (b0 >= 0xb8 && b0 <= 0xbf) return { size: 1, text: `CP ${['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][b0 - 0xb8]}`, kind: 'CP' };

  return { size: 1, text: `DB ${hex(b0, 2)}` };
}

function decoderDecode(rom, pc) {
  const fn = Decoder.decodeInstruction ?? Decoder.decode ?? Decoder.disassembleOne ?? Decoder.default;
  if (typeof fn !== 'function') return null;

  try {
    const result = fn(rom, pc);
    if (!result) return null;
    if (typeof result === 'string') return { size: localDecode(rom, pc).size, text: result };
    const size = result.size ?? result.length ?? result.bytes?.length ?? localDecode(rom, pc).size;
    const text = result.text ?? result.mnemonic ?? result.asm ?? String(result);
    return { size, text };
  } catch {
    try {
      const result = fn(pc, rom);
      if (!result) return null;
      const size = result.size ?? result.length ?? result.bytes?.length ?? localDecode(rom, pc).size;
      const text = result.text ?? result.mnemonic ?? result.asm ?? String(result);
      return { size, text };
    } catch {
      return null;
    }
  }
}

function decodeAt(rom, pc) {
  const local = localDecode(rom, pc);
  const decoded = decoderDecode(rom, pc);
  return { ...local, text: decoded?.text ?? local.text, size: decoded?.size ?? local.size };
}

function printStaticDecode(rom) {
  console.log('=== Part A: static decode from 0x05899d ===');
  const callTargets = new Set();
  for (let pc = COMMAND_ENTRY; pc < COMMAND_ENTRY + STATIC_LEN;) {
    const decoded = decodeAt(rom, pc);
    const bytes = Array.from(rom.subarray(pc, pc + decoded.size)).map(hexByte).join(' ');
    const notes = [];
    if (decoded.kind) notes.push(decoded.kind);
    if (decoded.target !== undefined) {
      notes.push(`target=${hex(decoded.target)}`);
      if (decoded.kind === 'CALL') callTargets.add(decoded.target);
      if (decoded.target === 0x099921) notes.push('*** references 0x099921 ***');
    }
    if (decoded.kind === 'CP' || /\bCP\b/i.test(decoded.text)) notes.push('dispatch-compare');
    console.log(`${hex(pc)}  ${bytes.padEnd(14)}  ${decoded.text}${notes.length ? `  ; ${notes.join(', ')}` : ''}`);
    pc += Math.max(decoded.size || 1, 1);
  }
  console.log(`Static CALL targets: ${[...callTargets].map((target) => hex(target)).join(', ') || '(none)'}`);
}

function firstFunction(module, names) {
  for (const name of names) {
    if (typeof module[name] === 'function') return module[name];
  }
  return null;
}

function makeMachine() {
  const createPeripherals = firstFunction(Peripherals, ['createPeripherals', 'makePeripherals', 'default']);
  const createRuntime = firstFunction(Runtime, ['createRuntime', 'createCpuRuntime', 'createCPU', 'createCpu', 'makeRuntime', 'default']);
  if (!createRuntime) throw new Error(`No runtime factory export found. Runtime exports: ${Object.keys(Runtime).join(', ')}`);

  const peripherals = createPeripherals ? createPeripherals() : undefined;
  const machine = createRuntime.length === 0 ? createRuntime() : createRuntime({ peripherals });
  return machine?.cpu ? machine : { cpu: machine, peripherals };
}

function writeMem(cpu, addr, value) {
  if (typeof cpu.writeMem === 'function') return cpu.writeMem(addr, value & 0xff);
  if (typeof cpu.write8 === 'function') return cpu.write8(addr, value & 0xff);
  if (typeof cpu.memWrite === 'function') return cpu.memWrite(addr, value & 0xff);
  if (cpu.memory) cpu.memory[addr] = value & 0xff;
  else if (cpu.mem) cpu.mem[addr] = value & 0xff;
  else throw new Error('No byte memory writer found on CPU');
}

function readMem(cpu, addr) {
  if (typeof cpu.readMem === 'function') return cpu.readMem(addr) & 0xff;
  if (typeof cpu.read8 === 'function') return cpu.read8(addr) & 0xff;
  if (typeof cpu.memRead === 'function') return cpu.memRead(addr) & 0xff;
  if (cpu.memory) return cpu.memory[addr] & 0xff;
  if (cpu.mem) return cpu.mem[addr] & 0xff;
  throw new Error('No byte memory reader found on CPU');
}

function setPc(cpu, pc) {
  if (typeof cpu.setPC === 'function') return cpu.setPC(pc);
  if (typeof cpu.setPc === 'function') return cpu.setPc(pc);
  cpu.PC = pc;
  cpu.pc = pc;
}

function setTimer(machine, enabled) {
  for (const target of [machine, machine.cpu, machine.peripherals]) {
    if (!target) continue;
    if (typeof target.setTimerInterruptEnabled === 'function') return target.setTimerInterruptEnabled(enabled);
    if (typeof target.setTimerInterrupt === 'function') return target.setTimerInterrupt(enabled);
    if (typeof target.enableTimerInterrupt === 'function') return target.enableTimerInterrupt(enabled);
  }
}

async function runPhase(machine, startPc, options = {}) {
  const cpu = machine.cpu;
  setPc(cpu, startPc);
  const runners = [
    machine.runFrom?.bind(machine),
    machine.run?.bind(machine),
    cpu.runFrom?.bind(cpu),
    cpu.run?.bind(cpu),
    cpu.execute?.bind(cpu),
  ].filter(Boolean);
  if (!runners.length) throw new Error('No runtime runner found');

  let lastError;
  for (const run of runners) {
    try {
      return await run(startPc, options);
    } catch (error) {
      lastError = error;
      try {
        return await run({ startPc, pc: startPc, ...options });
      } catch (inner) {
        lastError = inner;
      }
    }
  }
  throw lastError;
}

async function runDynamicTrace() {
  console.log('\n=== Part B: GRAPH dynamic trace through command handler ===');
  const machine = makeMachine();
  const cpu = machine.cpu;
  const commandBlocks = [];
  const hits = new Map(WATCH_PCS.map((pc) => [pc, 0]));
  const dynamicCallTargets = new Set();
  const onBlock = (pc) => {
    pc &= 0xffffff;
    if (pc >= COMMAND_REGION_START && pc <= COMMAND_REGION_END) {
      if (commandBlocks.length < 200) commandBlocks.push(pc);
      const decoded = decodeAt(readRom.cached, pc);
      if (decoded.kind === 'CALL' && decoded.target !== undefined) dynamicCallTargets.add(decoded.target);
    }
    if (hits.has(pc)) hits.set(pc, hits.get(pc) + 1);
  };

  readRom.cached ??= readRom();
  setTimer(machine, false);
  await runPhase(machine, 0x09dd62, { maxSteps: 600_000, maxLoopIterations: 600_000 });
  setTimer(machine, true);
  await runPhase(machine, 0x058241, { maxSteps: 600_000, maxLoopIterations: 600_000 });

  writeMem(cpu, 0xd0058c, 0x44);
  writeMem(cpu, 0xd0058e, 0x44);
  writeMem(cpu, 0xd0009f, readMem(cpu, 0xd0009f) | 0x20);

  await runPhase(machine, 0x08c331, {
    maxSteps: 600_000,
    maxLoopIterations: 600_000,
    onBlock,
  });

  console.log(`Watched hits: ${[...hits].map(([pc, count]) => `${hex(pc)}=${count}`).join(', ')}`);
  console.log(`Command handler blocks first 200: ${commandBlocks.map((pc) => hex(pc)).join(' -> ') || '(none)'}`);
  console.log(`Reached 0x099921 from 0x05899d path: ${hits.get(0x099921) > 0 ? 'YES' : 'NO'}`);
  console.log(`Dynamically hit CALL targets in handler region: ${[...dynamicCallTargets].map((target) => hex(target)).join(', ') || '(none)'}`);
}

async function main() {
  const rom = readRom();
  readRom.cached = rom;
  printStaticDecode(rom);
  await runDynamicTrace();
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
