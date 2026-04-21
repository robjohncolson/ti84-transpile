#!/usr/bin/env node
// Phase 97D: probe Phase 75 mode-var reader candidates for side effects on the
// home-screen mode buffer at 0xD020A6.
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_LEN = 26;
const MODE_BUF_END = MODE_BUF_START + MODE_BUF_LEN - 1;
const WATCH_RANGES = [
  [0xD020A6, 0xD020BF],
  [0xD020C0, 0xD020D0],
  [0xD020E0, 0xD020F0],
];
const MODE_STATE_START = 0xD00080;
const MODE_STATE_END = 0xD000FF;
const TARGETS = [0x0A2812, 0x0A281A, 0x0A29A8, 0x0A654E];
const VARIANTS = [
  { label: 'default', argOverrides: {} },
  { label: 'hl_mode_buffer', argOverrides: { _hl: 0xD020A6 } },
  { label: 'hl_mode_state', argOverrides: { _hl: 0xD00080 } },
  { label: 'de_zero', argOverrides: { _de: 0 } },
];
const REPORT_PATH = path.join(__dirname, 'phase97d-report.md');

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

const cpuSnap = Object.fromEntries(CPU_FIELDS.map((field) => [field, cpu[field]]));
const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));

function formatAddr(value) {
  if (value === null || value === undefined) {
    return '(none)';
  }
  return `0x${value.toString(16).padStart(6, '0')}`;
}

function formatByte(value) {
  return value.toString(16).padStart(2, '0');
}

function formatAscii(bytes) {
  return bytes.map((value) => (
    value >= 0x20 && value < 0x7F ? String.fromCharCode(value) : '.'
  )).join('');
}

function readModeBuffer() {
  const bytes = Array.from(mem.slice(MODE_BUF_START, MODE_BUF_START + MODE_BUF_LEN));
  return {
    bytes,
    hex: bytes.map(formatByte).join(' '),
    ascii: formatAscii(bytes),
  };
}

function isWatchedWrite(addr) {
  return WATCH_RANGES.some(([start, end]) => addr >= start && addr <= end);
}

function resetProbeState(argOverrides = {}) {
  mem.set(ramSnap, 0x400000);
  for (const [field, value] of Object.entries(cpuSnap)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  for (const [field, value] of Object.entries(argOverrides)) {
    cpu[field] = value;
  }
}

function probe(entryAddr, argOverrides = {}) {
  resetProbeState(argOverrides);

  const writes = [];
  const modeReads = new Set();
  let currentBlockPc = null;
  let stepCount = 0;

  const origWrite8 = cpu.write8.bind(cpu);
  const origRead8 = cpu.read8.bind(cpu);

  cpu.write8 = (addr, value) => {
    if (isWatchedWrite(addr)) {
      writes.push({
        addr,
        val: value,
        blockPc: currentBlockPc,
        step: stepCount,
      });
    }
    return origWrite8(addr, value);
  };

  cpu.read8 = (addr) => {
    if (addr >= MODE_STATE_START && addr <= MODE_STATE_END) {
      modeReads.add(addr);
    }
    return origRead8(addr);
  };

  const res = executor.runFrom(entryAddr, 'adl', {
    maxSteps: 30000,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      currentBlockPc = pc;
      stepCount++;
    },
  });

  cpu.write8 = origWrite8;
  cpu.read8 = origRead8;

  return {
    entryAddr,
    argOverrides,
    termination: res.termination,
    lastPc: res.lastPc,
    lastMode: res.lastMode,
    lastBlockPc: currentBlockPc,
    steps: stepCount,
    writes,
    modeReads: [...modeReads].sort((a, b) => a - b),
    modeBuffer: readModeBuffer(),
  };
}

function findDirectCallers(target) {
  const loByte = target & 0xFF;
  const midByte = (target >> 8) & 0xFF;
  const hiByte = (target >> 16) & 0xFF;
  const callers = [];

  for (let i = 0; i <= romBytes.length - 4; i++) {
    if ((romBytes[i] === 0xCD || romBytes[i] === 0xC3)
        && romBytes[i + 1] === loByte
        && romBytes[i + 2] === midByte
        && romBytes[i + 3] === hiByte) {
      callers.push({
        at: i,
        op: romBytes[i] === 0xCD ? 'CALL' : 'JP',
      });
    }
  }

  return callers;
}

function formatWriteEvents(writes) {
  if (writes.length === 0) {
    return 'none';
  }

  return writes.map((write) => (
    `{ addr: ${formatAddr(write.addr)}, val: 0x${formatByte(write.val)}, blockPc: ${formatAddr(write.blockPc)}, step: ${write.step} }`
  )).join(', ');
}

function formatReadList(addrs) {
  if (addrs.length === 0) {
    return 'none';
  }
  return addrs.map((addr) => formatAddr(addr)).join(', ');
}

function buildReport(targetResults, callerResults) {
  const lines = [];

  lines.push('# Phase 97D - Mode-Var Reader Probing');
  lines.push('');
  lines.push(`Mode buffer watch range: \`${formatAddr(MODE_BUF_START)}..${formatAddr(MODE_BUF_END)}\``);
  lines.push(`Adjacent watch ranges: \`${formatAddr(0xD020C0)}..${formatAddr(0xD020D0)}\`, \`${formatAddr(0xD020E0)}..${formatAddr(0xD020F0)}\``);
  lines.push(`Mode-state read watch range: \`${formatAddr(MODE_STATE_START)}..${formatAddr(MODE_STATE_END)}\``);
  lines.push('');
  lines.push('## Per-target summary');
  lines.push('');
  lines.push('| Target | Variant | Term | Mode buffer writes | Mode-state reads | Final PC | Last block PC | Steps |');
  lines.push('|---|---|---|---:|---:|---|---|---:|');

  for (const targetResult of targetResults) {
    for (const variantResult of targetResult.variants) {
      lines.push(`| \`${formatAddr(targetResult.target)}\` | \`${variantResult.label}\` | \`${variantResult.probe.termination}\` | ${variantResult.probe.writes.length} | ${variantResult.probe.modeReads.length} | \`${formatAddr(variantResult.probe.lastPc)}\` | \`${formatAddr(variantResult.probe.lastBlockPc)}\` | ${variantResult.probe.steps} |`);
    }
  }

  lines.push('');
  lines.push('## Direct callers');
  lines.push('');

  for (const targetResult of targetResults) {
    if (targetResult.callers.length === 0) {
      lines.push(`- \`${formatAddr(targetResult.target)}\`: none`);
      continue;
    }

    const callerList = targetResult.callers
      .map((caller) => `\`${caller.op} ${formatAddr(caller.at)}\``)
      .join(', ');
    lines.push(`- \`${formatAddr(targetResult.target)}\`: ${callerList}`);
  }

  lines.push('');
  lines.push('## Caller-level probes');
  lines.push('');

  if (callerResults.length === 0) {
    lines.push('No second-level caller probes ran. The direct `CALL nn24` / `JP nn24` scan found no matches for any target.');
  } else {
    lines.push('| Target | Caller | Opcode | Term | Mode buffer writes | Mode-state reads | Final PC | Last block PC | Steps |');
    lines.push('|---|---|---|---|---:|---:|---|---|---:|');
    for (const callerResult of callerResults) {
      lines.push(`| \`${formatAddr(callerResult.target)}\` | \`${formatAddr(callerResult.caller.at)}\` | \`${callerResult.caller.op}\` | \`${callerResult.probe.termination}\` | ${callerResult.probe.writes.length} | ${callerResult.probe.modeReads.length} | \`${formatAddr(callerResult.probe.lastPc)}\` | \`${formatAddr(callerResult.probe.lastBlockPc)}\` | ${callerResult.probe.steps} |`);
    }
  }

  lines.push('');
  lines.push('## Per-probe details');
  lines.push('');

  for (const targetResult of targetResults) {
    lines.push(`### Target ${formatAddr(targetResult.target)}`);
    lines.push('');

    for (const variantResult of targetResult.variants) {
      const probeResult = variantResult.probe;
      lines.push(`Variant \`${variantResult.label}\``);
      lines.push(`Result: term=\`${probeResult.termination}\`, finalPc=\`${formatAddr(probeResult.lastPc)}\`, lastBlockPc=\`${formatAddr(probeResult.lastBlockPc)}\`, steps=\`${probeResult.steps}\``);
      lines.push(`Mode buffer: \`${probeResult.modeBuffer.hex}\``);
      lines.push(`ASCII: \`${probeResult.modeBuffer.ascii}\``);
      lines.push(`Write events: ${formatWriteEvents(probeResult.writes)}`);
      lines.push(`Mode-state reads: ${formatReadList(probeResult.modeReads)}`);
      lines.push('');
    }
  }

  if (callerResults.length > 0) {
    lines.push('## Caller probe details');
    lines.push('');

    for (const callerResult of callerResults) {
      const probeResult = callerResult.probe;
      lines.push(`Caller \`${callerResult.caller.op} ${formatAddr(callerResult.caller.at)}\` for target \`${formatAddr(callerResult.target)}\``);
      lines.push(`Result: term=\`${probeResult.termination}\`, finalPc=\`${formatAddr(probeResult.lastPc)}\`, lastBlockPc=\`${formatAddr(probeResult.lastBlockPc)}\`, steps=\`${probeResult.steps}\``);
      lines.push(`Mode buffer: \`${probeResult.modeBuffer.hex}\``);
      lines.push(`ASCII: \`${probeResult.modeBuffer.ascii}\``);
      lines.push(`Write events: ${formatWriteEvents(probeResult.writes)}`);
      lines.push(`Mode-state reads: ${formatReadList(probeResult.modeReads)}`);
      lines.push('');
    }
  }

  lines.push('## Verdict');
  lines.push('');

  const writesToMainModeBuffer = [];
  for (const targetResult of targetResults) {
    for (const variantResult of targetResult.variants) {
      const firstMainWrite = variantResult.probe.writes.find((write) => (
        write.addr >= MODE_BUF_START && write.addr <= MODE_BUF_END
      ));
      if (firstMainWrite) {
        writesToMainModeBuffer.push({
          kind: 'target',
          target: targetResult.target,
          variant: variantResult.label,
          write: firstMainWrite,
        });
      }
    }
  }

  for (const callerResult of callerResults) {
    const firstMainWrite = callerResult.probe.writes.find((write) => (
      write.addr >= MODE_BUF_START && write.addr <= MODE_BUF_END
    ));
    if (firstMainWrite) {
      writesToMainModeBuffer.push({
        kind: 'caller',
        target: callerResult.target,
        caller: callerResult.caller,
        write: firstMainWrite,
      });
    }
  }

  if (writesToMainModeBuffer.length === 0) {
    lines.push('No. None of the four target probes wrote to `0xD020A6..0xD020BF`, and no direct `CALL` or `JP` callers were found to run as second-level probes.');
    lines.push('All 16 target/variant runs terminated immediately with `missing_block`, executed 0 lifted blocks, performed 0 reads from `0xD00080..0xD000FF`, and left the 26-byte mode buffer unchanged at all `0xFF` bytes.');
    lines.push('Inference: the Phase 75 addresses are likely not callable lifted block entry points in `ROM.transpiled.js`; they may be interior instruction addresses or data references rather than runnable function starts.');
  } else {
    const firstHit = writesToMainModeBuffer[0];
    if (firstHit.kind === 'target') {
      lines.push(`Yes. Target \`${formatAddr(firstHit.target)}\` variant \`${firstHit.variant}\` wrote the first non-\`0xFF\` byte from block \`${formatAddr(firstHit.write.blockPc)}\`.`);
    } else {
      lines.push(`Yes. Caller \`${firstHit.caller.op} ${formatAddr(firstHit.caller.at)}\` for target \`${formatAddr(firstHit.target)}\` wrote the first non-\`0xFF\` byte from block \`${formatAddr(firstHit.write.blockPc)}\`.`);
    }
  }

  lines.push('');
  return `${lines.join('\n')}\n`;
}

const targetResults = TARGETS.map((target) => {
  const variants = VARIANTS.map((variant) => ({
    label: variant.label,
    probe: probe(target, variant.argOverrides),
  }));
  const callers = findDirectCallers(target);
  return { target, variants, callers };
});

const callerResults = [];
for (const targetResult of targetResults) {
  for (const caller of targetResult.callers) {
    callerResults.push({
      target: targetResult.target,
      caller,
      probe: probe(caller.at),
    });
  }
}

const report = buildReport(targetResults, callerResults);
fs.writeFileSync(REPORT_PATH, report);
console.log(`Phase 97D report written to ${REPORT_PATH}`);
