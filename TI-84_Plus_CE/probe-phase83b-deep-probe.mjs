#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

console.log('Loading ROM...');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const romMod = await import(pathToFileURL(transpiledPath).href);
const BLOCKS = romMod.PRELIFTED_BLOCKS;
console.log(`Loaded ${Object.keys(BLOCKS).length} blocks`);

const { createExecutor } = await import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href);
const { createPeripheralBus } = await import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href);

function vramStats(mem) {
  const vram = mem.slice(0xD40000, 0xD40000 + 320 * 240 * 2);
  let fg = 0;
  let bg = 0;
  let rMin = 240;
  let rMax = -1;
  let cMin = 320;
  let cMax = -1;

  for (let i = 0; i < 320 * 240; i++) {
    const lo = vram[i * 2];
    const hi = vram[i * 2 + 1];
    const px = lo | (hi << 8);
    const sentinel = 0xAAAA;

    if (px !== sentinel && px !== 0xFFFF) {
      const r = Math.floor(i / 320);
      const c = i % 320;

      if (px === 0x0000) {
        fg++;
      } else {
        bg++;
      }

      if (r < rMin) rMin = r;
      if (r > rMax) rMax = r;
      if (c < cMin) cMin = c;
      if (c > cMax) cMax = c;
    }
  }

  const bbox = rMax < 0 ? 'none' : `r${rMin}-${rMax} c${cMin}-${cMax}`;
  return { total: fg + bg, fg, bg, bbox };
}

const snapMem = new Uint8Array(0x1000000);
snapMem.set(romBytes);
const snapP = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const snapEx = createExecutor(BLOCKS, snapMem, { peripherals: snapP });
const snapCpu = snapEx.cpu;

snapEx.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
snapCpu.halted = false;
snapCpu.iff1 = 0;
snapCpu.iff2 = 0;
snapCpu.sp = 0xD1A87E - 3;
snapMem.fill(0xFF, snapCpu.sp, snapCpu.sp + 3);
snapEx.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
snapCpu.halted = false;
snapCpu.iff1 = 0;
snapCpu.iff2 = 0;
snapCpu._iy = 0xD00080;
snapCpu.hl = 0x000000;
snapEx.runFrom(0x0802b2, 'adl', { maxSteps: 100 });

const snapCpuState = JSON.parse(JSON.stringify(snapCpu));
const snapMemCopy = new Uint8Array(snapMem);

function runProbe(entryAddr, maxSteps = 150000) {
  const mem = new Uint8Array(snapMemCopy);
  const p = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const ex = createExecutor(BLOCKS, mem, { peripherals: p });
  const cpu = ex.cpu;

  Object.assign(cpu, snapCpuState);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.sp = 0xD1A87E - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.f = 0x40;

  const vStart = 0xD40000;
  for (let i = 0; i < 320 * 240; i++) {
    mem[vStart + i * 2] = 0xAA;
    mem[vStart + i * 2 + 1] = 0xAA;
  }

  const chars = [];
  const r = ex.runFrom(entryAddr, 'adl', {
    maxSteps,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (pc === 0x0a1799) {
        chars.push({ col: cpu._de & 0xFFFF, code: cpu.a });
      }
    },
  });

  const stats = vramStats(mem);
  return { ...r, ...stats, chars };
}

const PROBES = [0x09c98c, 0x09cd5a];
const MAX_STEPS = 150000;

console.log(`Running ${PROBES.length} deep probes with maxSteps=${MAX_STEPS}...`);

const results = [];
for (const addr of PROBES) {
  const hex = '0x' + addr.toString(16).padStart(6, '0');
  console.log(`  Probing ${hex}...`);
  const r = runProbe(addr, MAX_STEPS);
  results.push({ addr, hex, ...r });
  console.log(
    `    steps=${r.steps} term=${r.termination} total=${r.total}px bbox=${r.bbox} chars=${r.chars.length}`,
  );
}

const lines = ['# Phase 83b - Deep Probe: 0x09c98c + 0x09cd5a (150k steps)\n'];
lines.push('## Results\n');
lines.push('| addr | steps | termination | total px | fg px | bg px | bbox | chars |');
lines.push('|------|------:|-------------|-------:|----:|----:|------|------:|');
for (const r of results) {
  lines.push(
    `| \`${r.hex}\` | ${r.steps} | ${r.termination} | ${r.total} | ${r.fg} | ${r.bg} | ${r.bbox} | ${r.chars.length} |`,
  );
}

for (const r of results) {
  lines.push(`\n## ${r.hex} - ${r.total}px\n`);
  if (r.chars.length > 0) {
    const text = r.chars
      .map((c) =>
        c.code >= 0x20 && c.code < 0x7f
          ? String.fromCharCode(c.code)
          : `[0x${c.code.toString(16).padStart(2, '0')}]`,
      )
      .join('');
    lines.push(`Decoded text: \`${text}\`\n`);
    lines.push('| col | code | char |');
    lines.push('|-----|------|------|');
    for (const c of r.chars) {
      const ch =
        c.code >= 0x20 && c.code < 0x7f
          ? `\`${String.fromCharCode(c.code)}\``
          : `[0x${c.code.toString(16)}]`;
      lines.push(`| ${c.col} | 0x${c.code.toString(16).padStart(2, '0')} | ${ch} |`);
    }
  } else {
    lines.push('No chars decoded (0x0a1799 never hit).\n');
  }
}

const reportPath = path.join(__dirname, 'phase83b-deep-probe-report.md');
fs.writeFileSync(reportPath, lines.join('\n'));
console.log(`Report written to ${reportPath}`);
