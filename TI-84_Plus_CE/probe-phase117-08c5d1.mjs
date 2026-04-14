#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

const REPORT_URL = new URL('./phase117-report.md', import.meta.url);

const ENTRY_08C5D1 = 0x08c5d1;
const ENTRY_08C4A3 = 0x08c4a3;
const KEY_EVENT_ADDR = 0xd0058e;

const VRAM_START = 0xd40000;
const VRAM_END = 0xd4bfff;
const IY_START = 0xd00080;
const IY_END = 0xd000ff;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'ld-reg-mem':
      return 'ld ' + inst.dest + ', (' + hex(inst.addr) + ')';
    case 'ld-mem-reg':
      return 'ld (' + hex(inst.addr) + '), ' + inst.src;
    case 'ld-reg-imm':
      return 'ld ' + inst.dest + ', ' + hexByte(inst.value);
    case 'ld-reg-reg':
      return 'ld ' + inst.dest + ', ' + inst.src;
    case 'ld-pair-imm':
      return 'ld ' + inst.pair + ', ' + hex(inst.value);
    case 'ld-mem-reg':
      return 'ld (' + hex(inst.addr) + '), ' + inst.src;
    case 'alu-reg':
      return inst.op + ' ' + inst.src;
    case 'alu-imm':
      return inst.op + ' ' + hexByte(inst.value);
    case 'jr-conditional':
      return 'jr ' + inst.condition + ', ' + hex(inst.target);
    case 'jr':
      return 'jr ' + hex(inst.target);
    case 'jp':
      return 'jp ' + hex(inst.target);
    case 'jp-conditional':
      return 'jp ' + inst.condition + ', ' + hex(inst.target);
    case 'call':
      return 'call ' + hex(inst.target);
    case 'call-conditional':
      return 'call ' + inst.condition + ', ' + hex(inst.target);
    case 'indexed-cb-bit': {
      var sign = inst.displacement >= 0 ? '+' : '';
      return 'bit ' + inst.bit + ', (' + inst.indexRegister + sign + inst.displacement + ')';
    }
    case 'push':
      return 'push ' + inst.pair;
    case 'pop':
      return 'pop ' + inst.pair;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return 'ret ' + inst.condition;
    default:
      return inst.tag;
  }
}

function disassembleRange(romBytes, startPc, byteCount) {
  var rows = [];
  var pc = startPc;
  var endPc = startPc + byteCount;

  while (pc < endPc) {
    var inst = decodeInstruction(romBytes, pc, 'adl');
    var rawBytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      function (v) { return v.toString(16).padStart(2, '0'); }
    ).join(' ');
    rows.push({
      pc: inst.pc,
      bytes: rawBytes,
      dasm: formatInstruction(inst),
    });
    pc += inst.length;
  }

  return rows;
}

function bootEnvironment() {
  var romBytes = decodeEmbeddedRom();
  var mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  var peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  var executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: peripherals });
  var cpu = executor.cpu;

  var coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3;

  var osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;

  var postInit = executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return { romBytes: romBytes, mem: mem, executor: executor, cpu: cpu, coldBoot: coldBoot, osInit: osInit, postInit: postInit };
}

function summarizeRun(run) {
  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc || 0,
  };
}

function snapshotState(mem, cpu) {
  var ramSnap = new Uint8Array(RAM_END - RAM_START);
  ramSnap.set(mem.subarray(RAM_START, RAM_END));

  var cpuSnap = {};
  var fields = ['a', 'f', 'b', 'c', 'd', 'e', 'h', 'l', 'sp', 'pc', 'ix', '_iy', 'mbase', 'iff1', 'iff2', 'halted'];
  for (var i = 0; i < fields.length; i++) {
    cpuSnap[fields[i]] = cpu[fields[i]];
  }

  return { ramSnap: ramSnap, cpuSnap: cpuSnap };
}

function restoreState(mem, cpu, snap) {
  mem.set(snap.ramSnap, RAM_START);

  var fields = Object.keys(snap.cpuSnap);
  for (var i = 0; i < fields.length; i++) {
    cpu[fields[i]] = snap.cpuSnap[fields[i]];
  }
}

function setupStack(cpu, mem) {
  cpu.sp = 0xd1a87e - 3;
  mem[cpu.sp] = 0xff;
  mem[cpu.sp + 1] = 0xff;
  mem[cpu.sp + 2] = 0xff;
}

function runTestCase(env, snap, label, entryPoint, setupFn) {
  restoreState(env.mem, env.cpu, snap);
  setupStack(env.cpu, env.mem);
  setupFn(env.cpu, env.mem);

  var vramWriteCount = 0;
  var keyEventWrites = [];
  var iyWrites = [];
  var blocksVisited = new Set();
  var missing = [];

  var originalWrite8 = env.cpu.write8.bind(env.cpu);
  env.cpu.write8 = function (addr, value) {
    var maskedAddr = addr & 0xffffff;
    var maskedValue = value & 0xff;

    if (maskedAddr >= VRAM_START && maskedAddr <= VRAM_END) {
      vramWriteCount++;
    }

    if (maskedAddr === KEY_EVENT_ADDR) {
      keyEventWrites.push({ addr: maskedAddr, value: maskedValue });
    }

    if (maskedAddr >= IY_START && maskedAddr <= IY_END) {
      iyWrites.push({ addr: maskedAddr, value: maskedValue });
    }

    return originalWrite8(addr, value);
  };

  var raw;
  try {
    raw = env.executor.runFrom(entryPoint, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 5000,
      onBlock: function (pc) {
        blocksVisited.add(pc);
      },
      onMissingBlock: function (pc, mode, steps) {
        missing.push({ pc: pc, mode: mode, steps: steps });
      },
    });
  } finally {
    env.cpu.write8 = originalWrite8;
  }

  return {
    label: label,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc || 0,
    vramWriteCount: vramWriteCount,
    keyEventWrites: keyEventWrites,
    iyWrites: iyWrites,
    blocksVisitedCount: blocksVisited.size,
    missing: missing,
  };
}

function buildReport(env, staticDisasm, testResults) {
  var lines = [];

  lines.push('# Phase 117 - 0x08C5D1 Special-Key Handler Investigation');
  lines.push('');

  lines.push('## Boot Environment');
  lines.push('');
  lines.push('| stage | steps | termination | last pc |');
  lines.push('|-------|------:|-------------|---------|');
  var cb = summarizeRun(env.coldBoot);
  var oi = summarizeRun(env.osInit);
  var pi = summarizeRun(env.postInit);
  lines.push('| coldBoot | ' + cb.steps + ' | ' + cb.termination + ' | ' + hex(cb.lastPc) + ' |');
  lines.push('| osInit | ' + oi.steps + ' | ' + oi.termination + ' | ' + hex(oi.lastPc) + ' |');
  lines.push('| postInit | ' + pi.steps + ' | ' + pi.termination + ' | ' + hex(pi.lastPc) + ' |');
  lines.push('');

  lines.push('## Static Disassembly (0x08C5D1, first 60 bytes, ADL)');
  lines.push('');
  lines.push('```text');
  for (var i = 0; i < staticDisasm.length; i++) {
    var row = staticDisasm[i];
    lines.push(hex(row.pc) + '  ' + row.bytes.padEnd(14) + '  ' + row.dasm);
  }
  lines.push('```');
  lines.push('');

  lines.push('## Dynamic Test Results');
  lines.push('');
  lines.push('| test | steps | termination | lastPc | VRAM writes | blocks visited | key writes | IY writes |');
  lines.push('|------|------:|-------------|--------|------------:|---------------:|-----------:|----------:|');

  for (var j = 0; j < testResults.length; j++) {
    var r = testResults[j];
    var keyEvtSummary = r.keyEventWrites.length === 0
      ? 'none'
      : r.keyEventWrites.map(function (w) { return hexByte(w.value); }).join(', ');
    var iySummary = r.iyWrites.length === 0
      ? 'none'
      : r.iyWrites.length + ' writes';
    lines.push('| ' + r.label + ' | ' + r.steps + ' | ' + r.termination + ' | ' + hex(r.lastPc) + ' | ' + r.vramWriteCount + ' | ' + r.blocksVisitedCount + ' | ' + keyEvtSummary + ' | ' + iySummary + ' |');
  }
  lines.push('');

  lines.push('## Detailed Test Notes');
  lines.push('');

  for (var k = 0; k < testResults.length; k++) {
    var t = testResults[k];
    lines.push('### ' + t.label);
    lines.push('');
    lines.push('- Steps: ' + t.steps + ', termination: ' + t.termination);
    lines.push('- Last PC: ' + hex(t.lastPc));
    lines.push('- VRAM writes: ' + t.vramWriteCount);
    lines.push('- Blocks visited: ' + t.blocksVisitedCount);

    if (t.keyEventWrites.length > 0) {
      lines.push('- Key event writes to ' + hex(KEY_EVENT_ADDR) + ':');
      for (var m = 0; m < t.keyEventWrites.length; m++) {
        lines.push('  - ' + hexByte(t.keyEventWrites[m].value));
      }
    } else {
      lines.push('- No writes to ' + hex(KEY_EVENT_ADDR));
    }

    if (t.iyWrites.length > 0) {
      lines.push('- IY-range writes (' + hex(IY_START) + '-' + hex(IY_END) + '):');
      var limit = Math.min(t.iyWrites.length, 20);
      for (var n = 0; n < limit; n++) {
        lines.push('  - ' + hex(t.iyWrites[n].addr) + ' = ' + hexByte(t.iyWrites[n].value));
      }
      if (t.iyWrites.length > 20) {
        lines.push('  - ... and ' + (t.iyWrites.length - 20) + ' more');
      }
    } else {
      lines.push('- No IY-range writes');
    }

    if (t.missing.length > 0) {
      lines.push('- Missing blocks hit: ' + t.missing.map(function (m) { return hex(m.pc); }).join(', '));
    }
    lines.push('');
  }

  lines.push('## Assessment');
  lines.push('');

  var allVram = testResults.reduce(function (sum, r) { return sum + r.vramWriteCount; }, 0);
  var allIy = testResults.reduce(function (sum, r) { return sum + r.iyWrites.length; }, 0);
  var allMissing = [];
  for (var p = 0; p < testResults.length; p++) {
    for (var q = 0; q < testResults[p].missing.length; q++) {
      allMissing.push(testResults[p].missing[q]);
    }
  }

  if (allVram > 0) {
    lines.push('0x08C5D1 triggers VRAM activity (' + allVram + ' total writes across tests), suggesting it involves display updates or screen rendering.');
  } else {
    lines.push('0x08C5D1 does not write to VRAM in any test case, ruling out direct screen rendering.');
  }

  if (allIy > 0) {
    lines.push('It writes to the IY flag area (' + allIy + ' total IY-range writes), indicating OS state flag manipulation.');
  } else {
    lines.push('No IY-range writes detected - this handler does not modify OS state flags directly.');
  }

  if (allMissing.length > 0) {
    var seen = {};
    var uniqueMissing = [];
    for (var u = 0; u < allMissing.length; u++) {
      var key = hex(allMissing[u].pc);
      if (!seen[key]) {
        seen[key] = true;
        uniqueMissing.push(key);
      }
    }
    lines.push('Missing block(s) encountered: ' + uniqueMissing.join(', ') + '. These may need transpiler seeds or represent dynamic callbacks.');
  }

  lines.push('');

  return lines.join('\n');
}

function main() {
  console.log('Booting environment...');
  var env = bootEnvironment();

  console.log('Static disassembly of 0x08C5D1...');
  var staticDisasm = disassembleRange(env.romBytes, ENTRY_08C5D1, 60);

  console.log('Taking post-boot snapshot...');
  var snap = snapshotState(env.mem, env.cpu);

  console.log('Running Test A: 0x08C5D1 with A=0xFB...');
  var testA = runTestCase(env, snap, 'A: direct 0x08C5D1 A=0xFB', ENTRY_08C5D1, function (cpu) {
    cpu.a = 0xfb;
  });

  console.log('Running Test B: 0x08C4A3 with scancode 0xBC...');
  var testB = runTestCase(env, snap, 'B: 0x08C4A3 scancode=0xBC', ENTRY_08C4A3, function (_cpu, mem) {
    mem[KEY_EVENT_ADDR] = 0xbc;
  });

  console.log('Running Test C: 0x08C4A3 with scancode 0xC0...');
  var testC = runTestCase(env, snap, 'C: 0x08C4A3 scancode=0xC0', ENTRY_08C4A3, function (_cpu, mem) {
    mem[KEY_EVENT_ADDR] = 0xc0;
  });

  var testResults = [testA, testB, testC];

  console.log('Building report...');
  var report = buildReport(env, staticDisasm, testResults);

  writeFileSync(REPORT_URL, report, 'utf8');
  var reportPath = fileURLToPath(REPORT_URL);
  console.log('Wrote ' + reportPath);

  for (var i = 0; i < testResults.length; i++) {
    var r = testResults[i];
    console.log(r.label + ': steps=' + r.steps + ' term=' + r.termination + ' lastPc=' + hex(r.lastPc) + ' vram=' + r.vramWriteCount + ' blocks=' + r.blocksVisitedCount);
  }
}

main();
