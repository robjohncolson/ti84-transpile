#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction as decodeEz80 } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const perph = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const ex = createExecutor(BLOCKS, mem, { peripherals: perph });
const c = ex.cpu;

const REPORT_PATH = path.join(__dirname, 'phase181-fgkbd-scan-report.md');

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEM_INIT_ENTRY = 0x09dee0;
const SCAN_ENTRY = 0x0159c0;
const SHARED_EPILOGUE_ENTRY = 0x000db6;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_MAX_STEPS = 50000;
const TRACE_MAX_LOOP_ITERATIONS = 8192;

const STACK_RESET_TOP = 0xd1a87e;
const FAKE_RET = 0x7ffffe;
const IY_BASE = 0xd00080;
const IX_BASE = 0xd1a860;
const MBASE = 0xd0;

const KBD_SCAN_CODE_ADDR = 0xd00587;
const KBD_KEY_ADDR = 0xd0058c;
const KBD_GET_KY_ADDR = 0xd0058d;

const KBD_MMIO_START = 0xe00800;
const KBD_MMIO_END = 0xe00920;
const KBD_TABLE_ADDR = 0x09f79b;
const KBD_TABLE_END = KBD_TABLE_ADDR + 0x39 * 4;

const TRACKED_RAM_WRITES = new Set([
  KBD_SCAN_CODE_ADDR,
  KBD_KEY_ADDR,
  KBD_GET_KY_ADDR,
]);

if (!perph.keyMatrix && perph.keyboard?.keyMatrix) {
  perph.keyMatrix = perph.keyboard.keyMatrix;
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatBytes(start, length) {
  return Array.from(
    romBytes.slice(start, start + length),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join(' ');
}

function read24(addr) {
  return (
    (mem[addr] & 0xff) |
    ((mem[addr + 1] & 0xff) << 8) |
    ((mem[addr + 2] & 0xff) << 16)
  ) >>> 0;
}

function write24(addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function resetStageStack(size = 3) {
  c.sp = STACK_RESET_TOP - size;
  mem.fill(0xff, c.sp, c.sp + size);
}

function prepareCallState() {
  c.halted = false;
  c.iff1 = 0;
  c.iff2 = 0;
  c.madl = 1;
  c.mbase = MBASE;
  c._iy = IY_BASE;
  c._ix = IX_BASE;
  c.f = 0x40;
  c.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, c.sp, c.sp + 12);
}

function pushMemInitReturn() {
  c.sp -= 3;
  write24(c.sp, FAKE_RET);
}

function pushForegroundReturnFrame() {
  // 0x0159C0 restores IY, then POPs DE, then tail-jumps to a shared
  // epilogue that finally RETs. Leave one dummy 24-bit word above FAKE_RET
  // so the RET still lands on the sentinel after POP DE consumes a word.
  c.sp -= 6;
  write24(c.sp, 0x000000);
  write24(c.sp + 3, FAKE_RET);
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'nop':
      return `${prefix}nop`;
    case 'push':
      return `${prefix}push ${inst.pair}`;
    case 'pop':
      return `${prefix}pop ${inst.pair}`;
    case 'ret':
      return `${prefix}ret`;
    case 'ret-conditional':
      return `${prefix}ret ${inst.condition}`;
    case 'call':
      return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}djnz ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `${prefix}ld ${inst.pair}, ${hex(inst.value, inst.value > 0xffff ? 6 : 4)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`
        : `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-ind':
      return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-reg':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-indexed-pair':
      return `${prefix}ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${inst.pair}`;
    case 'ld-pair-indexed':
      return `${prefix}ld ${inst.pair}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `${prefix}ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${inst.src}`;
    case 'ld-reg-ixd':
      return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'ld-ixd-imm':
      return `${prefix}ld (${inst.indexRegister}${signedDisp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'inc-reg':
      return `${prefix}inc ${inst.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${inst.reg}`;
    case 'inc-pair':
      return `${prefix}inc ${inst.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${inst.pair}`;
    case 'inc-ixd':
      return `${prefix}inc (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'dec-ixd':
      return `${prefix}dec (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'add-pair':
      return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair':
      return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair':
      return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-reg':
      return `${prefix}${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ixd':
      return `${prefix}${inst.op} (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'bit-test':
      return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set-ind':
      return `${prefix}set ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res-ind':
      return `${prefix}res ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit':
      return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `${prefix}set ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `${prefix}res ${inst.bit}, (${inst.indexRegister}${signedDisp(inst.displacement)})`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function formatDisassemblyRow(pc, inst) {
  return `${hex(pc)}  ${formatBytes(pc, inst.length).padEnd(14)}  ${formatInstruction(inst)}`;
}

function disassembleEntrySweep(startPc, maxInstructions = 200) {
  const rows = [];
  let pc = startPc;
  let depth = 0;

  for (let index = 0; index < maxInstructions; index += 1) {
    const inst = decodeEz80(romBytes, pc, 'adl');
    rows.push(formatDisassemblyRow(pc, inst));

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      depth += 1;
    } else if (inst.tag === 'ret' || inst.tag === 'ret-conditional') {
      if (depth === 0) break;
      depth -= 1;
    } else if (inst.tag === 'jp' && inst.target === SHARED_EPILOGUE_ENTRY) {
      break;
    }

    pc += inst.length;
  }

  return rows;
}

function disassembleUntilRet(startPc, maxInstructions = 24) {
  const rows = [];
  let pc = startPc;

  for (let index = 0; index < maxInstructions; index += 1) {
    const inst = decodeEz80(romBytes, pc, 'adl');
    rows.push(formatDisassemblyRow(pc, inst));
    pc += inst.length;
    if (inst.tag === 'ret') break;
  }

  return rows;
}

function coldBoot() {
  const bootResult = ex.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  c.halted = false;
  c.iff1 = 0;
  c.iff2 = 0;
  resetStageStack();

  const kernelInitResult = ex.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  c.mbase = MBASE;
  c._iy = IY_BASE;
  c._hl = 0;
  c.halted = false;
  c.iff1 = 0;
  c.iff2 = 0;
  resetStageStack();

  const postInitResult = ex.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });

  return { bootResult, kernelInitResult, postInitResult };
}

function runMemInit() {
  prepareCallState();
  pushMemInitReturn();

  let returnHit = false;
  let result = null;

  try {
    result = ex.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xffffff) === FAKE_RET) {
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === FAKE_RET) {
          throw new Error('__RET__');
        }
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      returnHit = true;
    } else {
      throw error;
    }
  }

  return {
    returnHit,
    result,
    fps: read24(0xd0258d),
    opBase: read24(0xd02590),
    ops: read24(0xd02593),
  };
}

function installTraceHooks() {
  const events = {
    mmioReads: [],
    mmioWrites: [],
    tableReads: [],
    ramWrites: [],
  };

  const originalRead8 = c.read8.bind(c);
  const originalWrite8 = c.write8.bind(c);

  c.read8 = (addr) => {
    const normalized = Number(addr) & 0xffffff;
    const value = originalRead8(normalized);

    if (normalized >= KBD_MMIO_START && normalized < KBD_MMIO_END) {
      events.mmioReads.push({
        pc: c._currentBlockPc & 0xffffff,
        addr: normalized,
        value,
      });
    }

    if (normalized >= KBD_TABLE_ADDR && normalized < KBD_TABLE_END) {
      events.tableReads.push({
        pc: c._currentBlockPc & 0xffffff,
        addr: normalized,
        value,
      });
    }

    return value;
  };

  c.write8 = (addr, value) => {
    const normalized = Number(addr) & 0xffffff;
    const before = originalRead8(normalized);
    const result = originalWrite8(normalized, value);
    const after = originalRead8(normalized);

    if (normalized >= KBD_MMIO_START && normalized < KBD_MMIO_END) {
      events.mmioWrites.push({
        pc: c._currentBlockPc & 0xffffff,
        addr: normalized,
        value: value & 0xff,
        before,
        after,
      });
    }

    if (TRACKED_RAM_WRITES.has(normalized)) {
      events.ramWrites.push({
        pc: c._currentBlockPc & 0xffffff,
        addr: normalized,
        value: value & 0xff,
        before,
        after,
      });
    }

    return result;
  };

  return () => {
    c.read8 = originalRead8;
    c.write8 = originalWrite8;
    return events;
  };
}

function readKeyboardState() {
  return {
    kbdScanCode: mem[KBD_SCAN_CODE_ADDR] & 0xff,
    kbdKey: mem[KBD_KEY_ADDR] & 0xff,
    kbdGetKy: mem[KBD_GET_KY_ADDR] & 0xff,
  };
}

function runForegroundScan() {
  perph.keyMatrix.fill(0xff);
  perph.keyMatrix[1] = 0xfe;

  prepareCallState();
  pushForegroundReturnFrame();

  const before = readKeyboardState();
  const blockTrace = [];
  let returnHit = false;
  let result = null;

  const restoreHooks = installTraceHooks();

  try {
    result = ex.runFrom(SCAN_ENTRY, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        const normalized = pc & 0xffffff;
        blockTrace.push({
          step,
          pc: normalized,
          mode,
          dasm: meta?.instructions?.[0]?.dasm ?? '???',
          a: c.a & 0xff,
          b: c.b & 0xff,
        });

        if (normalized === FAKE_RET) {
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc, mode, step) {
        const normalized = pc & 0xffffff;
        blockTrace.push({
          step,
          pc: normalized,
          mode,
          dasm: 'MISSING',
          a: c.a & 0xff,
          b: c.b & 0xff,
        });

        if (normalized === FAKE_RET) {
          throw new Error('__RET__');
        }
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      returnHit = true;
    } else {
      throw error;
    }
  }

  const events = restoreHooks();
  const after = {
    ...readKeyboardState(),
    a: c.a & 0xff,
    b: c.b & 0xff,
  };

  return { before, after, blockTrace, returnHit, result, events };
}

function addrLabel(addr) {
  switch (addr) {
    case 0xe00803: return 'kbd.mode';
    case 0xe00807: return 'kbd.enable';
    case 0xe00808: return 'kbd.column';
    case 0xe0080f: return 'kbd.interval';
    case 0xe00818: return 'kbd.status';
    case 0xe00824: return 'kbd.ready';
    case 0xe00900: return 'kbd.scanResult';
    case KBD_SCAN_CODE_ADDR: return 'kbdScanCode';
    case KBD_KEY_ADDR: return 'kbdKey';
    case KBD_GET_KY_ADDR: return 'kbdGetKy';
    default: return '';
  }
}

function summarizeByAddress(events) {
  const grouped = new Map();

  for (const event of events) {
    const key = event.addr;
    if (!grouped.has(key)) {
      grouped.set(key, {
        addr: key,
        pcs: new Set(),
        values: new Set(),
        count: 0,
      });
    }

    const entry = grouped.get(key);
    entry.count += 1;
    entry.pcs.add(event.pc);
    entry.values.add(event.value);
  }

  return [...grouped.values()].sort((left, right) => left.addr - right.addr);
}

function renderEventSummary(lines, title, events) {
  lines.push(`### ${title}`);
  lines.push('');

  if (events.length === 0) {
    lines.push('- none');
    lines.push('');
    return;
  }

  for (const entry of summarizeByAddress(events)) {
    const pcs = [...entry.pcs].sort((left, right) => left - right).map((pc) => hex(pc)).join(', ');
    const values = [...entry.values].sort((left, right) => left - right).map((value) => hexByte(value)).join(', ');
    const label = addrLabel(entry.addr);
    const suffix = label ? ` (${label})` : '';
    lines.push(`- ${hex(entry.addr)}${suffix}: count=${entry.count}; pcs=[${pcs}]; values=[${values}]`);
  }

  lines.push('');
}

function buildReport(bootState, memInitState, scanState) {
  const lines = [];
  const entryDisasm = disassembleEntrySweep(SCAN_ENTRY, 200);
  const epilogueDisasm = disassembleUntilRet(SHARED_EPILOGUE_ENTRY, 16);
  const blockChain = scanState.blockTrace.map((entry) => hex(entry.pc)).join(' -> ');

  lines.push('# Phase 181 - Foreground Keyboard Scan at 0x0159C0');
  lines.push('');
  lines.push('Generated by `probe-phase181-fgkbd-scan.mjs`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Boot recipe: cold boot from `0x000000` in z80 mode (20000 steps), kernel init from `0x08C331` in adl mode (100000 steps), post-init from `0x0802B2` in adl mode (100 steps), then `MEM_INIT` from `0x09DEE0` with `FAKE_RET=0x7FFFFE`.');
  lines.push('- Foreground scan call state: `madl=1`, `mbase=0xD0`, `iy=0xD00080`, `ix=0xD1A860`, `f=0x40`, `sp=0xD1A872` after staging the standalone return frame.');
  lines.push('- Seeded keyboard matrix: `keyMatrix[1] = 0xFE` (ENTER pressed in SDK group 6).');
  lines.push('');
  lines.push('| Stage | Steps | Termination | Last PC |');
  lines.push('| --- | ---: | --- | --- |');
  lines.push(`| Cold boot | ${bootState.bootResult.steps} | ${bootState.bootResult.termination} | ${hex(bootState.bootResult.lastPc)} |`);
  lines.push(`| Kernel init | ${bootState.kernelInitResult.steps} | ${bootState.kernelInitResult.termination} | ${hex(bootState.kernelInitResult.lastPc)} |`);
  lines.push(`| Post-init | ${bootState.postInitResult.steps} | ${bootState.postInitResult.termination} | ${hex(bootState.postInitResult.lastPc)} |`);
  lines.push(`| MEM_INIT | ${memInitState.result?.steps ?? 'sentinel'} | ${memInitState.returnHit ? 'sentinel_return' : (memInitState.result?.termination ?? 'unknown')} | ${memInitState.returnHit ? hex(FAKE_RET) : hex(memInitState.result?.lastPc ?? 0)} |`);
  lines.push('');
  lines.push(`Post-MEM_INIT pointers: \`FPS=${hex(memInitState.fps)}\`, \`OPBase=${hex(memInitState.opBase)}\`, \`OPS=${hex(memInitState.ops)}\`.`);
  lines.push('');
  lines.push('## Disassembly');
  lines.push('');
  lines.push('### Entry Sweep (0x0159C0)');
  lines.push('');
  lines.push('```text');
  lines.push(...entryDisasm);
  lines.push('```');
  lines.push('');
  lines.push('### Shared Epilogue (0x000DB6)');
  lines.push('');
  lines.push('```text');
  lines.push(...epilogueDisasm);
  lines.push('```');
  lines.push('');
  lines.push('## Trace Results');
  lines.push('');
  lines.push('| Byte | Before | After |');
  lines.push('| --- | --- | --- |');
  lines.push(`| \`kbdScanCode (0xD00587)\` | ${hexByte(scanState.before.kbdScanCode)} | ${hexByte(scanState.after.kbdScanCode)} |`);
  lines.push(`| \`kbdKey (0xD0058C)\` | ${hexByte(scanState.before.kbdKey)} | ${hexByte(scanState.after.kbdKey)} |`);
  lines.push(`| \`kbdGetKy (0xD0058D)\` | ${hexByte(scanState.before.kbdGetKy)} | ${hexByte(scanState.after.kbdGetKy)} |`);
  lines.push('');
  lines.push(`Returned via sentinel: ${scanState.returnHit ? 'yes' : 'no'}. Final registers: \`A=${hexByte(scanState.after.a)}\`, \`B=${hexByte(scanState.after.b)}\`.`);
  lines.push('');
  lines.push('Block chain:');
  lines.push('');
  lines.push('```text');
  lines.push(blockChain);
  lines.push('```');
  lines.push('');
  lines.push('Per-block trace:');
  lines.push('');
  lines.push('```text');
  for (const entry of scanState.blockTrace) {
    lines.push(
      `step=${String(entry.step).padStart(2, ' ')} pc=${hex(entry.pc)} ${entry.dasm} A=${hexByte(entry.a)} B=${hexByte(entry.b)}`,
    );
  }
  lines.push('```');
  lines.push('');
  renderEventSummary(lines, 'Keyboard MMIO Reads', scanState.events.mmioReads);
  renderEventSummary(lines, 'Keyboard MMIO Writes', scanState.events.mmioWrites);
  renderEventSummary(lines, 'Translation-Table Reads (0x09F79B)', scanState.events.tableReads);
  renderEventSummary(lines, 'Tracked RAM Writes', scanState.events.ramWrites);
  lines.push('## Findings');
  lines.push('');
  lines.push('- `0x0159C0` is a raw foreground keyboard MMIO scanner in this runtime. On the ENTER-seeded path it programs keyboard registers at `0xE00803`, `0xE00807`, `0xE00808`, and `0xE0080F`, polls `0xE00818` until ready, reads the raw scan byte from `0xE00900`, and acknowledges readiness via `0xE00824`.');
  lines.push('- The raw ENTER scan observed at `0xE00900` is `0x10`, and the routine returns that raw value in both `A` and `B` through the shared epilogue at `0x000DB6`.');
  lines.push('- No reads from the scan-to-keycode table at `0x09F79B` were observed anywhere in the traced call, and no writes to `kbdScanCode`, `kbdKey`, or `kbdGetKy` occurred. In the exact standalone foreground-scan setup requested here, those bytes stay `0x00` before and after the call.');
  lines.push('- The special `CP 0x28` branch inside `0x0159C0` is still visible in the static disassembly, but the ENTER path (`0x10`) takes the direct `JR NZ,0x015A40` exit path and never reaches that longer handshake sequence.');
  lines.push('- The Phase 141 translation table at `0x09F79B` therefore appears to belong to later key-processing code, not to the low-level foreground MMIO routine at `0x0159C0` itself.');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const bootState = coldBoot();
  const memInitState = runMemInit();
  const scanState = runForegroundScan();
  const report = buildReport(bootState, memInitState, scanState);

  fs.writeFileSync(REPORT_PATH, `${report}\n`, 'utf8');
  console.log(report);
  console.log('');
  console.log(`Wrote ${path.basename(REPORT_PATH)}`);
}

main();
