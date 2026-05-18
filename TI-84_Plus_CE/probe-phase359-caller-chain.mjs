#!/usr/bin/env node

/**
 * probe-phase359-caller-chain.mjs
 *
 * Trace the caller chain leading to 0x000D82 (code-copy routine) during boot.
 *
 * Part 1: Static disassembly of key ROM ranges
 *   a) 0x000D7E-0x000D81 — entry prefix before the known code at 0x000D82
 *   b) 0x000E9D-0x000EE0 — code after the CALL 0x000D7E at 0x000E99
 *   c) 0x000E80-0x000E99 — the caller block
 *
 * Part 2: Dynamic call stack trace during boot
 *   Track block transitions, dump last 20 blocks + stack when 0x000D82 is hit
 *
 * Part 3: Report findings
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
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 10000;
const MAX_LOOP_ITERATIONS = 100000;

const TARGET_PC = 0x000D82;
const ENTRY_PC = 0x000D7E;

const TERMINATOR_TAGS = new Set([
  'ret', 'reti', 'retn', 'ret-conditional',
  'jp', 'jp-conditional', 'jp-indirect',
  'jr', 'jr-conditional',
]);

// ── helpers ──

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, start + Math.max(0, length)),
    (b) => b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function signedDisp(v) {
  return v >= 0 ? `+${v}` : `${v}`;
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ${text}` : text;
}

function formatInstruction(inst) {
  if (!inst) return '(decode failed)';

  const ixd = (reg, d) => `(${reg.toUpperCase()}${signedDisp(d)})`;

  switch (inst.tag) {
    case 'nop': return withModePrefix(inst, 'NOP');
    case 'halt': return withModePrefix(inst, 'HALT');
    case 'slp': return withModePrefix(inst, 'SLP');
    case 'di': return withModePrefix(inst, 'DI');
    case 'ei': return withModePrefix(inst, 'EI');
    case 'ret': return withModePrefix(inst, 'RET');
    case 'reti': return withModePrefix(inst, 'RETI');
    case 'retn': return withModePrefix(inst, 'RETN');
    case 'ret-conditional': return withModePrefix(inst, `RET ${inst.condition.toUpperCase()}`);
    case 'jp': return withModePrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional': return withModePrefix(inst, `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'jp-indirect': return withModePrefix(inst, `JP (${inst.indirectRegister.toUpperCase()})`);
    case 'jr': return withModePrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional': return withModePrefix(inst, `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'call': return withModePrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional': return withModePrefix(inst, `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`);
    case 'push': return withModePrefix(inst, `PUSH ${inst.pair.toUpperCase()}`);
    case 'pop': return withModePrefix(inst, `POP ${inst.pair.toUpperCase()}`);
    case 'ld-reg-imm': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`);
    case 'ld-reg-reg': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'ld-reg-ind': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`);
    case 'ld-ind-reg': return withModePrefix(inst, `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`);
    case 'ld-reg-mem': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`);
    case 'ld-mem-reg': return withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, ${hex(inst.value, inst.value > 0xFFFF ? 6 : 4)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`)
        : withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`);
    case 'ld-mem-pair': return withModePrefix(inst, `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`);
    case 'ld-special': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'ld-mb-a': return withModePrefix(inst, 'LD MB, A');
    case 'ld-a-mb': return withModePrefix(inst, 'LD A, MB');
    case 'ld-sp-hl': return withModePrefix(inst, 'LD SP, HL');
    case 'ld-sp-pair': return withModePrefix(inst, `LD SP, ${inst.pair.toUpperCase()}`);
    case 'ld-pair-ind': return withModePrefix(inst, `LD ${inst.pair.toUpperCase()}, (${inst.src.toUpperCase()})`);
    case 'ld-ind-pair': return withModePrefix(inst, `LD (${inst.dest.toUpperCase()}), ${inst.pair.toUpperCase()}`);
    case 'ld-reg-ixd': return withModePrefix(inst, `LD ${inst.dest.toUpperCase()}, ${ixd(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg': return withModePrefix(inst, `LD ${ixd(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`);
    case 'ld-ixd-imm': return withModePrefix(inst, `LD ${ixd(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`);
    case 'inc-reg': return withModePrefix(inst, `INC ${inst.reg.toUpperCase()}`);
    case 'dec-reg': return withModePrefix(inst, `DEC ${inst.reg.toUpperCase()}`);
    case 'inc-pair': return withModePrefix(inst, `INC ${inst.pair.toUpperCase()}`);
    case 'dec-pair': return withModePrefix(inst, `DEC ${inst.pair.toUpperCase()}`);
    case 'alu-reg':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${inst.src.toUpperCase()}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`);
    case 'alu-imm':
      return (inst.op === 'add' || inst.op === 'adc' || inst.op === 'sbc')
        ? withModePrefix(inst, `${inst.op.toUpperCase()} A, ${hex(inst.value, 2)}`)
        : withModePrefix(inst, `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`);
    case 'add-pair': return withModePrefix(inst, `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`);
    case 'adc-pair': return withModePrefix(inst, `ADC HL, ${inst.src.toUpperCase()}`);
    case 'sbc-pair': return withModePrefix(inst, `SBC HL, ${inst.src.toUpperCase()}`);
    case 'bit-test': return withModePrefix(inst, `BIT ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-test-ind': return withModePrefix(inst, `BIT ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'bit-set': return withModePrefix(inst, `SET ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-set-ind': return withModePrefix(inst, `SET ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'bit-res': return withModePrefix(inst, `RES ${inst.bit}, ${inst.reg.toUpperCase()}`);
    case 'bit-res-ind': return withModePrefix(inst, `RES ${inst.bit}, (${inst.indirectRegister.toUpperCase()})`);
    case 'exx': return withModePrefix(inst, 'EXX');
    case 'ex-af': return withModePrefix(inst, "EX AF, AF'");
    case 'ex-de-hl': return withModePrefix(inst, 'EX DE, HL');
    case 'ex-sp-hl': return withModePrefix(inst, 'EX (SP), HL');
    case 'rrd': return withModePrefix(inst, 'RRD');
    case 'rld': return withModePrefix(inst, 'RLD');
    case 'scf': return withModePrefix(inst, 'SCF');
    case 'ccf': return withModePrefix(inst, 'CCF');
    case 'cpl': return withModePrefix(inst, 'CPL');
    case 'daa': return withModePrefix(inst, 'DAA');
    case 'neg': return withModePrefix(inst, 'NEG');
    case 'in0': return withModePrefix(inst, `IN0 ${inst.reg.toUpperCase()}, (${hex(inst.port, 2)})`);
    case 'out0': return withModePrefix(inst, `OUT0 (${hex(inst.port, 2)}), ${inst.reg.toUpperCase()}`);
    case 'in-reg': return withModePrefix(inst, `IN ${inst.reg.toUpperCase()}, (C)`);
    case 'out-reg': return withModePrefix(inst, `OUT (C), ${inst.reg.toUpperCase()}`);
    case 'in-imm': return withModePrefix(inst, `IN A, (${hex(inst.port, 2)})`);
    case 'out-imm': return withModePrefix(inst, `OUT (${hex(inst.port, 2)}), A`);
    case 'rra': return withModePrefix(inst, 'RRA');
    case 'rla': return withModePrefix(inst, 'RLA');
    case 'rlca': return withModePrefix(inst, 'RLCA');
    case 'rrca': return withModePrefix(inst, 'RRCA');
    case 'ldir': return withModePrefix(inst, 'LDIR');
    case 'lddr': return withModePrefix(inst, 'LDDR');
    case 'ldi': return withModePrefix(inst, 'LDI');
    case 'ldd': return withModePrefix(inst, 'LDD');
    case 'cpir': return withModePrefix(inst, 'CPIR');
    case 'djnz': return withModePrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'rst': return withModePrefix(inst, `RST ${hex(inst.target ?? 0, 2)}`);
    case 'im': return withModePrefix(inst, `IM ${inst.value}`);
    case 'rsmix': return withModePrefix(inst, 'RSMIX');
    case 'stmix': return withModePrefix(inst, 'STMIX');
    default: {
      const fields = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['tag', 'length', 'pc', 'nextPc', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(key)) continue;
        if (value === undefined || value === null) continue;
        fields.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${String(value)}`);
      }
      return withModePrefix(inst, fields.length > 0 ? `${inst.tag} ${fields.join(' ')}` : inst.tag);
    }
  }
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) return false;
  const hint = fs.existsSync(TRANSPILED_GZ_PATH) ? `${path.basename(TRANSPILED_GZ_PATH)} present; ` : '';
  console.log(`${hint}${path.basename(TRANSPILED_PATH)} missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });
  if (!fs.existsSync(TRANSPILED_PATH)) throw new Error('Transpiled ROM still missing after transpile.');
  return true;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) return Object.fromEntries(raw.filter((b) => b?.id).map((b) => [b.id, b]));
  return raw ?? {};
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function disassembleRange(romBytes, startPc, endPc, mode = 'adl', maxInstructions = 128) {
  const rows = [];
  let pc = startPc;
  while (pc < endPc && rows.length < maxInstructions) {
    const inst = decodeInstruction(romBytes, pc, mode);
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: formatInstruction(inst),
      tag: inst?.tag ?? null,
    });
    pc += length;
  }
  return rows;
}

function disassembleUntilTerminator(romBytes, startPc, mode = 'adl', maxInstructions = 128) {
  const rows = [];
  let pc = startPc;
  for (let i = 0; i < maxInstructions; i++) {
    const inst = decodeInstruction(romBytes, pc, mode);
    const length = Math.max(inst?.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(romBytes, pc, length),
      text: formatInstruction(inst),
      tag: inst?.tag ?? null,
    });
    if (TERMINATOR_TAGS.has(inst?.tag)) break;
    pc += length;
  }
  return rows;
}

function printDisassembly(title, rows) {
  console.log(title);
  console.log('-'.repeat(title.length));
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text}`);
  }
  console.log('');
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function extractInstrumentedBody(source) {
  const bodyStart = source.indexOf('{') + 1;
  const bodyEnd = source.lastIndexOf('}');
  const body = source.slice(bodyStart, bodyEnd);
  const lines = body.split('\n');
  const output = [];
  let pendingPc = null;
  for (const line of lines) {
    const commentMatch = line.match(/^\s*\/\/\s*0x([0-9a-fA-F]{6})\b/);
    if (commentMatch) {
      pendingPc = Number.parseInt(commentMatch[1], 16);
      output.push(line);
      continue;
    }
    if (pendingPc !== null && line.trim() !== '' && !line.trimStart().startsWith('//')) {
      output.push(`  cpu._probeInstrPc = 0x${pendingPc.toString(16)};`);
      pendingPc = null;
    }
    output.push(line);
  }
  return output.join('\n');
}

function instrumentCompiledBlocks(executor) {
  for (const [key, meta] of Object.entries(executor.blockMeta ?? {})) {
    if (!meta?.source || !executor.compiledBlocks?.[key]) continue;
    const instrumentedBody = extractInstrumentedBody(meta.source);
    executor.compiledBlocks[key] = new Function('cpu', instrumentedBody);
  }
}

// ── main ──

async function main() {
  if (!fs.existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');

  const regenerated = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  console.log('Phase 359: Caller Chain of 0x000D82 + Disassemble 0x000D7E Entry Point');
  console.log('=======================================================================');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled ROM: ${regenerated ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log('');

  // ──────────────────────────────────────────────
  // Part 1: Static disassembly
  // ──────────────────────────────────────────────

  console.log('PART 1: Static Disassembly from ROM Bytes');
  console.log('=========================================');
  console.log('');

  // 1a) Raw bytes + disassembly at 0x000D7E-0x000D81
  console.log(`Raw bytes at ${hex(ENTRY_PC)}-${hex(0x000D81)}: ${bytesAt(romBytes, ENTRY_PC, 4)}`);
  console.log('');
  const entryRows = disassembleRange(romBytes, ENTRY_PC, 0x000D82, 'adl', 8);
  printDisassembly(`1a) Disassembly of ${hex(ENTRY_PC)}-${hex(0x000D81)} (entry prefix)`, entryRows);

  // Also show the full function from 0x000D7E until terminator
  const fullFunc = disassembleUntilTerminator(romBytes, ENTRY_PC, 'adl', 64);
  printDisassembly(`1a-ext) Full function from ${hex(ENTRY_PC)} until terminator`, fullFunc);

  // 1b) Code after CALL at 0x000E9D-0x000EE0
  const postCallRows = disassembleRange(romBytes, 0x000E9D, 0x000EE1, 'adl', 64);
  printDisassembly(`1b) Disassembly of 0x000E9D-0x000EE0 (post-CALL continuation)`, postCallRows);

  // 1c) Caller block 0x000E80-0x000E99
  const callerRows = disassembleRange(romBytes, 0x000E80, 0x000E9D, 'adl', 64);
  printDisassembly(`1c) Disassembly of 0x000E80-0x000E9C (caller block)`, callerRows);

  // Wider context: 0x000E60-0x000EE0
  const wideContext = disassembleRange(romBytes, 0x000E60, 0x000EE1, 'adl', 128);
  printDisassembly(`1d) Wide context: 0x000E60-0x000EE0`, wideContext);

  // ──────────────────────────────────────────────
  // Part 2: Dynamic call stack trace during boot
  // ──────────────────────────────────────────────

  console.log('PART 2: Dynamic Call Stack Trace During Boot');
  console.log('============================================');
  console.log('');

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  instrumentCompiledBlocks(executor);

  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;
  cpu._probeInstrPc = null;

  // Track all block transitions
  const blockHistory = [];        // last N block PCs
  const HISTORY_SIZE = 40;
  let reachedTarget = false;
  let targetStep = null;
  let targetMode = null;
  let snapshotHistory = null;
  let snapshotSP = null;
  let snapshotStack = null;
  let reachedEntry = false;
  let entryStep = null;

  const allBlocks = [];           // every block visited in order

  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const normPc = pc & 0xFFFFFF;
      const normMode = mode ?? 'adl';

      blockHistory.push({ pc: normPc, mode: normMode, step: step + 1 });
      if (blockHistory.length > HISTORY_SIZE) blockHistory.shift();

      allBlocks.push({ pc: normPc, mode: normMode, step: step + 1 });

      // Check for entry point hit
      if (normPc === ENTRY_PC && !reachedEntry) {
        reachedEntry = true;
        entryStep = step + 1;
      }

      // Check for target hit
      if (normPc === TARGET_PC && !reachedTarget) {
        reachedTarget = true;
        targetStep = step + 1;
        targetMode = normMode;
        snapshotHistory = [...blockHistory];

        // Read SP and stack
        const sp = cpu.sp & 0xFFFFFF;
        snapshotSP = sp;
        const stackBytes = [];
        for (let i = 0; i < 30; i++) {
          stackBytes.push(mem[(sp + i) & 0xFFFFFF]);
        }
        snapshotStack = stackBytes;
      }
    },
    onMissingBlock(pc, mode, step) {
      const normPc = pc & 0xFFFFFF;
      blockHistory.push({ pc: normPc, mode: mode ?? 'adl', step: step + 1, missing: true });
      if (blockHistory.length > HISTORY_SIZE) blockHistory.shift();
      allBlocks.push({ pc: normPc, mode: mode ?? 'adl', step: step + 1, missing: true });
    },
  });

  console.log('Boot summary');
  console.log('------------');
  console.log(`  termination:       ${result.termination}`);
  console.log(`  steps:             ${result.steps}`);
  console.log(`  last pc:           ${hex(result.lastPc)}:${result.lastMode}`);
  console.log(`  reached 0x000D7E:  ${reachedEntry ? `yes (step ${entryStep})` : 'no'}`);
  console.log(`  reached 0x000D82:  ${reachedTarget ? `yes (step ${targetStep})` : 'no'}`);
  console.log('');

  if (reachedTarget && snapshotHistory) {
    console.log(`Last ${snapshotHistory.length} blocks before/at ${hex(TARGET_PC)} (step ${targetStep}):`);
    console.log('-'.repeat(70));
    for (const entry of snapshotHistory) {
      const marker = entry.pc === TARGET_PC ? ' <<<< TARGET' :
                     entry.pc === ENTRY_PC ? ' <<<< ENTRY 0x000D7E' : '';
      const miss = entry.missing ? ' [MISSING BLOCK]' : '';
      console.log(`  step=${String(entry.step).padStart(5)}  ${hex(entry.pc)}:${entry.mode}${miss}${marker}`);
    }
    console.log('');

    console.log(`SP at target hit: ${hex(snapshotSP)}`);
    console.log(`Stack contents [SP..SP+29]:`);
    const stackHex = snapshotStack.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`  ${stackHex}`);
    console.log('');

    // Decode return addresses from stack (3 bytes each in ADL mode)
    console.log('Possible return addresses on stack (24-bit, little-endian):');
    for (let i = 0; i + 2 < snapshotStack.length; i += 3) {
      const addr = snapshotStack[i] | (snapshotStack[i + 1] << 8) | (snapshotStack[i + 2] << 16);
      const inRom = addr < romBytes.length;
      const label = inRom ? '' : ' (outside ROM)';
      console.log(`  SP+${String(i).padStart(2, '0')}: ${hex(addr)}${label}`);
    }
    console.log('');
  } else if (!reachedTarget) {
    console.log(`Boot did NOT reach ${hex(TARGET_PC)} within ${BOOT_MAX_STEPS} steps.`);
    console.log('');

    // Show last 20 blocks
    const tail = allBlocks.slice(-20);
    console.log(`Last ${tail.length} blocks visited:`);
    for (const entry of tail) {
      const miss = entry.missing ? ' [MISSING]' : '';
      console.log(`  step=${String(entry.step).padStart(5)}  ${hex(entry.pc)}:${entry.mode}${miss}`);
    }
    console.log('');
  }

  // Count how many times each block was visited
  const blockCounts = new Map();
  for (const entry of allBlocks) {
    const key = `${hex(entry.pc)}:${entry.mode}`;
    blockCounts.set(key, (blockCounts.get(key) ?? 0) + 1);
  }

  // Show blocks visited more than once (likely loops)
  const hotBlocks = [...blockCounts.entries()]
    .filter(([, count]) => count > 1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (hotBlocks.length > 0) {
    console.log('Hot blocks (visited > 1 time, top 20):');
    console.log('-'.repeat(40));
    for (const [key, count] of hotBlocks) {
      console.log(`  ${key}  x${count}`);
    }
    console.log('');
  }

  // ──────────────────────────────────────────────
  // Part 3: Analysis / findings
  // ──────────────────────────────────────────────

  console.log('PART 3: Analysis');
  console.log('================');
  console.log('');

  // What are the 4 bytes at 0x000D7E?
  const d7eBytes = Array.from(romBytes.subarray(0x000D7E, 0x000D82));
  console.log(`Bytes at 0x000D7E: ${d7eBytes.map((b) => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
  if (entryRows.length > 0) {
    console.log(`Decoded as: ${entryRows.map((r) => r.text).join(' ; ')}`);
  }
  console.log('');

  // Does boot reach 0x000D82 via NMI (0x001D37) or via 0x000E94 path?
  if (reachedTarget && snapshotHistory) {
    const nmiVisited = snapshotHistory.some((e) => e.pc === 0x001D37);
    const callerVisited = snapshotHistory.some((e) => e.pc >= 0x000E80 && e.pc <= 0x000E99);
    const e94Visited = snapshotHistory.some((e) => e.pc === 0x000E94);
    console.log(`Path to ${hex(TARGET_PC)}:`);
    console.log(`  Via NMI (0x001D37):     ${nmiVisited ? 'YES' : 'no'}`);
    console.log(`  Via caller 0x000E80-99: ${callerVisited ? 'YES' : 'no'}`);
    console.log(`  Via 0x000E94:           ${e94Visited ? 'YES' : 'no'}`);
    console.log('');
  }

  // Show the complete ordered block path leading to target
  if (reachedTarget) {
    const targetIdx = allBlocks.findIndex((e) => e.pc === TARGET_PC);
    if (targetIdx >= 0) {
      const pathStart = Math.max(0, targetIdx - 30);
      const pathSlice = allBlocks.slice(pathStart, targetIdx + 1);
      console.log(`Complete block path to ${hex(TARGET_PC)} (last ${pathSlice.length} blocks):`);
      console.log('-'.repeat(70));
      for (const entry of pathSlice) {
        const marker = entry.pc === TARGET_PC ? ' <<<< TARGET' :
                       entry.pc === ENTRY_PC ? ' <<<< ENTRY' : '';
        console.log(`  step=${String(entry.step).padStart(5)}  ${hex(entry.pc)}:${entry.mode}${marker}`);
      }
      console.log('');
    }
  }

  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
