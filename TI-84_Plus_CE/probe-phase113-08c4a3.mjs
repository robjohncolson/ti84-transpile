#!/usr/bin/env node

/**
 * Phase 113 — Deep investigation of dispatch entry 0x08C4A3
 *
 * Phase 107 found this entry ran 624 steps before hitting missing_block,
 * and it wrote 0x00 to key event byte 0xD0058E (clearing it).
 * This probe performs static disassembly + dynamic trace to understand
 * what 0x08C4A3 does before it dies.
 */

import { writeFileSync } from 'node:fs';
import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

// ── Constants ──────────────────────────────────────────────────────────
const KEY_EVENT_ADDR = 0xd0058e;
const CUR_ROW_ADDR  = 0xd00595;
const CUR_COL_ADDR  = 0xd00596;
const VRAM_START    = 0xd40000;
const VRAM_END      = 0xd52c00;
const TARGET_ADDR   = 0x08c4a3;

function hex(v, w = 2) {
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

// ── 1. Boot environment (same as phase 107) ────────────────────────────
function bootEnvironment() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3;

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;

  const postInit = executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return { mem, peripherals, executor, cpu, romBytes, coldBoot, osInit, postInit };
}

// ── 2. Static disassembly ──────────────────────────────────────────────
function staticDisassembly(romBytes) {
  const lines = [];
  lines.push(`\n=== Static Disassembly: ${hex(TARGET_ADDR, 6)} (64 bytes) ===\n`);

  const OPCODES = {
    0xc9: { name: 'ret',        len: 1 },
    0xc3: { name: 'jp nn',      len: 4 },
    0xcd: { name: 'call nn',    len: 4 },
    0x3e: { name: 'ld a,n',     len: 2 },
    0x32: { name: 'ld (nn),a',  len: 4 },
    0x21: { name: 'ld hl,nn',   len: 4 },
    0x11: { name: 'ld de,nn',   len: 4 },
    0x01: { name: 'ld bc,nn',   len: 4 },
    0x22: { name: 'ld (nn),hl', len: 4 },
    0x2a: { name: 'ld hl,(nn)', len: 4 },
    0x3a: { name: 'ld a,(nn)',  len: 4 },
    0xc0: { name: 'ret nz',    len: 1 },
    0xc8: { name: 'ret z',     len: 1 },
    0xd0: { name: 'ret nc',    len: 1 },
    0xd8: { name: 'ret c',     len: 1 },
    0xc2: { name: 'jp nz,nn',  len: 4 },
    0xca: { name: 'jp z,nn',   len: 4 },
    0xd2: { name: 'jp nc,nn',  len: 4 },
    0xda: { name: 'jp c,nn',   len: 4 },
    0xc4: { name: 'call nz,nn', len: 4 },
    0xcc: { name: 'call z,nn',  len: 4 },
    0xd4: { name: 'call nc,nn', len: 4 },
    0xdc: { name: 'call c,nn',  len: 4 },
    0x18: { name: 'jr e',      len: 2 },
    0x20: { name: 'jr nz,e',   len: 2 },
    0x28: { name: 'jr z,e',    len: 2 },
    0x30: { name: 'jr nc,e',   len: 2 },
    0x38: { name: 'jr c,e',    len: 2 },
    0xfe: { name: 'cp n',      len: 2 },
    0xe6: { name: 'and n',     len: 2 },
    0xf6: { name: 'or n',      len: 2 },
    0xee: { name: 'xor n',     len: 2 },
    0xc6: { name: 'add a,n',   len: 2 },
    0xd6: { name: 'sub n',     len: 2 },
    0xf3: { name: 'di',        len: 1 },
    0xfb: { name: 'ei',        len: 1 },
    0x00: { name: 'nop',       len: 1 },
    0x76: { name: 'halt',      len: 1 },
    0xaf: { name: 'xor a',     len: 1 },
    0xb7: { name: 'or a',      len: 1 },
    0xe5: { name: 'push hl',   len: 1 },
    0xd5: { name: 'push de',   len: 1 },
    0xc5: { name: 'push bc',   len: 1 },
    0xf5: { name: 'push af',   len: 1 },
    0xe1: { name: 'pop hl',    len: 1 },
    0xd1: { name: 'pop de',    len: 1 },
    0xc1: { name: 'pop bc',    len: 1 },
    0xf1: { name: 'pop af',    len: 1 },
  };

  let offset = 0;
  while (offset < 64) {
    const addr = TARGET_ADDR + offset;
    const byte = romBytes[addr];
    const hexBytes = [];
    let annotation = '';

    if (byte === 0xed || byte === 0xcb || byte === 0xdd || byte === 0xfd) {
      // Prefix byte — show 2 bytes
      const next = romBytes[addr + 1];
      hexBytes.push(hex(byte, 2), hex(next, 2));
      if (byte === 0xed) annotation = `ED prefix (extended op ${hex(next, 2)})`;
      else if (byte === 0xcb) annotation = `CB prefix (bit op ${hex(next, 2)})`;
      else if (byte === 0xdd) annotation = `DD prefix (IX op ${hex(next, 2)})`;
      else if (byte === 0xfd) annotation = `FD prefix (IY op ${hex(next, 2)})`;
      offset += 2;
      // If extended might have more operand bytes, just show 2 for simplicity
    } else if (OPCODES[byte]) {
      const op = OPCODES[byte];
      for (let i = 0; i < op.len; i++) {
        hexBytes.push(hex(romBytes[addr + i], 2));
      }
      if (op.len === 4) {
        const nn = romBytes[addr + 1] | (romBytes[addr + 2] << 8) | (romBytes[addr + 3] << 16);
        annotation = `${op.name} ; ${hex(nn, 6)}`;
      } else if (op.len === 2 && op.name.startsWith('jr')) {
        const e = romBytes[addr + 1];
        const signed = e > 127 ? e - 256 : e;
        const target = addr + 2 + signed;
        annotation = `${op.name} ; -> ${hex(target, 6)}`;
      } else if (op.len === 2) {
        annotation = `${op.name} ; ${hex(romBytes[addr + 1], 2)}`;
      } else {
        annotation = op.name;
      }
      offset += op.len;
    } else {
      hexBytes.push(hex(byte, 2));
      annotation = `db ${hex(byte, 2)}`;
      offset += 1;
    }

    lines.push(`  ${hex(addr, 6)}:  ${hexBytes.map(h => h.slice(2)).join(' ').padEnd(16)} ${annotation}`);
  }

  return lines.join('\n');
}

// ── 3. Dynamic trace ───────────────────────────────────────────────────
function dynamicTrace(env) {
  const { mem, executor, cpu } = env;
  const lines = [];
  lines.push(`\n=== Dynamic Trace: ${hex(TARGET_ADDR, 6)} with ENTER (0x10) ===\n`);

  // Seed ENTER key
  mem[KEY_EVENT_ADDR] = 0x10;

  // Write hooks
  const writes = { keyEvent: [], curRow: [], curCol: [], vramCount: 0, allInteresting: [] };
  const originalWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    const a = addr & 0xffffff;
    const v = value & 0xff;
    if (a === KEY_EVENT_ADDR) {
      writes.keyEvent.push({ step: blockTrace.length, value: hex(v, 2) });
    } else if (a === CUR_ROW_ADDR) {
      writes.curRow.push({ step: blockTrace.length, value: hex(v, 2) });
    } else if (a === CUR_COL_ADDR) {
      writes.curCol.push({ step: blockTrace.length, value: hex(v, 2) });
    } else if (a >= VRAM_START && a < VRAM_END) {
      writes.vramCount++;
    }
    return originalWrite8(addr, value);
  };

  // Block trace via onBlock callback
  const blockTrace = [];
  let run;
  try {
    run = executor.runFrom(TARGET_ADDR, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 500,
      onBlock: (pc, mode, meta, step) => {
        blockTrace.push({ pc: hex(pc, 6), mode, step });
      },
    });
  } finally {
    cpu.write8 = originalWrite8;
  }

  // Run summary
  lines.push(`Steps: ${run.steps}`);
  lines.push(`Termination: ${run.termination}`);
  lines.push(`Last PC: ${hex(run.lastPc ?? 0, 6)}`);
  lines.push(`Missing blocks: ${[...(run.missingBlocks ?? [])].join(', ') || 'none'}`);
  lines.push('');

  // Write summary
  lines.push(`Key event writes (0xD0058E): ${writes.keyEvent.length}`);
  for (const w of writes.keyEvent) {
    lines.push(`  block #${w.step}: wrote ${w.value}`);
  }
  lines.push(`Cursor row writes (0xD00595): ${writes.curRow.length}`);
  for (const w of writes.curRow) {
    lines.push(`  block #${w.step}: wrote ${w.value}`);
  }
  lines.push(`Cursor col writes (0xD00596): ${writes.curCol.length}`);
  for (const w of writes.curCol) {
    lines.push(`  block #${w.step}: wrote ${w.value}`);
  }
  lines.push(`VRAM writes: ${writes.vramCount}`);
  lines.push('');

  // Block trace
  lines.push(`Blocks visited: ${blockTrace.length}`);
  if (blockTrace.length <= 100) {
    lines.push('Full block trace:');
    for (const b of blockTrace) {
      lines.push(`  ${b.pc} [${b.mode}] step=${b.step}`);
    }
  } else {
    lines.push('First 30 blocks:');
    for (const b of blockTrace.slice(0, 30)) {
      lines.push(`  ${b.pc} [${b.mode}] step=${b.step}`);
    }
    lines.push('...');
    lines.push('Last 20 blocks:');
    for (const b of blockTrace.slice(-20)) {
      lines.push(`  ${b.pc} [${b.mode}] step=${b.step}`);
    }
  }

  return { text: lines.join('\n'), run, blockTrace, writes };
}

// ── 4. Cross-reference missing blocks ──────────────────────────────────
function crossReference(run) {
  const lines = [];
  lines.push('\n=== Cross-Reference: Missing Block Analysis ===\n');

  const missingBlocks = [...(run.missingBlocks ?? [])];
  if (missingBlocks.length === 0) {
    lines.push('No missing blocks reported.');
    return lines.join('\n');
  }

  for (const mb of missingBlocks) {
    // missingBlocks entries might be strings like "0x08XXXX:adl" or numbers
    let addrStr = String(mb);
    let checkKeys = [];

    // Try parsing as "ADDR:mode"
    if (addrStr.includes(':')) {
      checkKeys.push(addrStr);
    } else {
      // It's a raw address — check both modes
      const numAddr = typeof mb === 'number' ? mb : parseInt(mb, 16);
      const h = hex(numAddr, 6).toUpperCase().replace('0X', '0x');
      checkKeys.push(`${h}:adl`, `${h}:z80`);
      // Also try with uppercase
      const hUp = (numAddr >>> 0).toString(16).padStart(6, '0').toUpperCase();
      checkKeys.push(`${hUp}:adl`, `${hUp}:z80`);
    }

    const found = checkKeys.some(k => PRELIFTED_BLOCKS[k] !== undefined);
    // Also try numeric key lookup
    const numAddr = typeof mb === 'number' ? mb : parseInt(String(mb).replace(/:.*/,''), 16);

    lines.push(`Missing block: ${addrStr}`);
    lines.push(`  In PRELIFTED_BLOCKS: ${found ? 'YES' : 'NO — CANDIDATE TRANSPILER SEED'}`);

    // Check nearby blocks
    const nearby = [];
    for (const key of Object.keys(PRELIFTED_BLOCKS)) {
      const kAddr = parseInt(key.split(':')[0], 16);
      if (!isNaN(kAddr) && Math.abs(kAddr - numAddr) <= 0x100) {
        nearby.push(key);
      }
    }
    if (nearby.length > 0) {
      lines.push(`  Nearby blocks (within 0x100): ${nearby.join(', ')}`);
    }
  }

  return lines.join('\n');
}

// ── Main ───────────────────────────────────────────────────────────────
function main() {
  console.log('Phase 113 — Deep investigation of 0x08C4A3\n');

  // Boot
  console.log('Booting environment...');
  const env = bootEnvironment();
  console.log(`  coldBoot: ${env.coldBoot.steps} steps, ${env.coldBoot.termination}`);
  console.log(`  osInit:   ${env.osInit.steps} steps, ${env.osInit.termination}`);
  console.log(`  postInit: ${env.postInit.steps} steps, ${env.postInit.termination}`);

  // Static disassembly
  const disasm = staticDisassembly(env.romBytes);
  console.log(disasm);

  // Save mem snapshot before trace
  const memSnapshot = new Uint8Array(env.mem);

  // Dynamic trace
  const { text: traceText, run, blockTrace, writes } = dynamicTrace(env);
  console.log(traceText);

  // Cross-reference
  const xref = crossReference(run);
  console.log(xref);

  // ── Summary ──────────────────────────────────────────────────────────
  const missingBlocks = [...(run.missingBlocks ?? [])];
  const summary = [
    '',
    '=== SUMMARY ===',
    '',
    `Entry point: ${hex(TARGET_ADDR, 6)}`,
    `Steps before stop: ${run.steps}`,
    `Termination reason: ${run.termination}`,
    `Last PC: ${hex(run.lastPc ?? 0, 6)}`,
    `Blocks visited: ${blockTrace.length}`,
    `Key event cleared: ${writes.keyEvent.some(w => w.value === '0x00') ? 'YES' : 'NO'}`,
    `Cursor writes: row=${writes.curRow.length}, col=${writes.curCol.length}`,
    `VRAM writes: ${writes.vramCount}`,
    `Missing blocks: ${missingBlocks.join(', ') || 'none'}`,
    `Seeds needed: ${missingBlocks.length > 0 ? missingBlocks.filter(mb => {
      const keys = [String(mb)];
      if (!String(mb).includes(':')) {
        const n = typeof mb === 'number' ? mb : parseInt(String(mb).replace(/:.*/,''), 16);
        const h = hex(n, 6);
        keys.push(`${h}:adl`, `${h}:z80`);
      }
      return !keys.some(k => PRELIFTED_BLOCKS[k] !== undefined);
    }).join(', ') : 'none'}`,
  ].join('\n');

  console.log(summary);

  // ── Write report ─────────────────────────────────────────────────────
  const report = [
    '# Phase 113 Report: 0x08C4A3 Deep Investigation',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Boot Environment',
    '',
    `| Stage | Steps | Termination |`,
    `|-------|-------|-------------|`,
    `| coldBoot | ${env.coldBoot.steps} | ${env.coldBoot.termination} |`,
    `| osInit | ${env.osInit.steps} | ${env.osInit.termination} |`,
    `| postInit | ${env.postInit.steps} | ${env.postInit.termination} |`,
    '',
    '## Static Disassembly',
    '',
    '```',
    disasm.trim(),
    '```',
    '',
    '## Dynamic Trace (ENTER key = 0x10)',
    '',
    '```',
    traceText.trim(),
    '```',
    '',
    '## Cross-Reference',
    '',
    '```',
    xref.trim(),
    '```',
    '',
    '## Summary',
    '',
    summary.trim(),
    '',
  ].join('\n');

  writeFileSync(
    new URL('./phase113-report.md', import.meta.url),
    report,
    'utf-8',
  );
  console.log('\nReport written to phase113-report.md');
}

main();
