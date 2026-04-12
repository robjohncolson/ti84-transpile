#!/usr/bin/env node
// Phase 40 Task B: trace dynamic subroutine call frequency for 0x0296dd.
// This follows the same boot + OS init pattern as probe-mode-screen.mjs and
// rewrites the trailing RESULTS block with full stdout each time it runs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_PATH = __filename;
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const ENTRY = 0x0296dd;
const INIT_ENTRY = 0x08c331;
const BOOT_ENTRY = 0x000000;
const VRAM_BASE = 0xd40000;
const VRAM_SIZE = 320 * 240 * 2;
const STACK_SENTINEL_BASE = 0xd1a87e;
const STACK_SENTINEL_SIZE = 0x18;
const ROM_LIMIT = 0x400000;
const PRIMITIVE_MIN = 0x0a1700;
const PRIMITIVE_MAX = 0x0a1d00;

const KNOWN_CHAIN = new Map([
  [0x028f02, 'label-draw primitive'],
  [0x080244, 'text helper'],
  [0x029374, 'string staging -> 0xd026ea'],
  [0x0a1cac, 'text loop'],
  [0x0a1b5b, 'per-char dispatch'],
  [0x0a1799, 'glyph draw'],
]);

const capturedLines = [];
const rawLog = console.log.bind(console);
const rawError = console.error.bind(console);

function formatArg(value) {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.stack || value.message;
  return String(value);
}

function capture(method, args) {
  const line = args.map(formatArg).join(' ');
  capturedLines.push(line);
  method(...args);
}

console.log = (...args) => capture(rawLog, args);
console.error = (...args) => capture(rawError, args);

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function isPrimitive(addr) {
  return addr >= PRIMITIVE_MIN && addr <= PRIMITIVE_MAX;
}

function formatTargetTags(addr) {
  const tags = [];
  if (KNOWN_CHAIN.has(addr)) tags.push(`[KNOWN ${KNOWN_CHAIN.get(addr)}]`);
  if (isPrimitive(addr)) tags.push('[PRIMITIVE]');
  return tags.length ? ' ' + tags.join(' ') : '';
}

function incrementCount(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

function getCount(map, key) {
  return map.get(key) || 0;
}

function sortedEntries(map) {
  return [...map.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0] - b[0];
  });
}

function sortedSourceEntries(map) {
  return [...map.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

function freshEnv() {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { ex, cpu: ex.cpu, mem };
}

function seedTopLevelStack(cpu, mem, bytes = STACK_SENTINEL_SIZE) {
  cpu.sp = STACK_SENTINEL_BASE - bytes;
  mem.fill(0xff, cpu.sp, cpu.sp + bytes);
}

function bootAndInit(env) {
  const { ex, cpu, mem } = env;

  ex.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  seedTopLevelStack(cpu, mem, 3);

  ex.runFrom(INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });
}

function findCallTargets(meta) {
  if (!meta?.exits) return { callTargets: [], callReturnTargets: [] };

  const callTargets = [];
  const callReturnTargets = [];

  for (const exit of meta.exits) {
    if (!exit || typeof exit.type !== 'string' || typeof exit.target !== 'number') continue;
    if (!exit.type.includes('call')) continue;

    if (exit.type.includes('return')) callReturnTargets.push(exit.target);
    else callTargets.push(exit.target);
  }

  return { callTargets, callReturnTargets };
}

function updateResultsBlock(stdout) {
  const marker = '

/* RESULTS */
/*
Trace entry: 0x0296dd
Run: 49858 steps -> missing_block at 0xffffff
Total blocks executed: 49858
Unique blocks visited: 147
Call detections via meta-qualified push: 2977
Call detections via fallback push: 0
Top 30 call targets:
   1. 0x0a1a3b  count=2376 [PRIMITIVE]
   2. 0x000380  count=66
   3. 0x00038c  count=66
   4. 0x07bf3e  count=66
   5. 0x0a1799  count=66 [KNOWN glyph draw] [PRIMITIVE]
   6. 0x0a1b5b  count=66 [KNOWN per-char dispatch] [PRIMITIVE]
   7. 0x0a237e  count=66
   8. 0x0a2a37  count=66
   9. 0x0a2d4c  count=66
  10. 0x001ca6  count=10
  11. 0x001c7d  count=8
  12. 0x029374  count=8 [KNOWN string staging -> 0xd026ea]
  13. 0x080244  count=8 [KNOWN text helper]
  14. 0x0a1cac  count=8 [KNOWN text loop] [PRIMITIVE]
  15. 0x028f02  count=4 [KNOWN label-draw primitive]
  16. 0x0293e0  count=4
  17. 0x02976c  count=3
  18. 0x00030c  count=2
  19. 0x000310  count=2
  20. 0x001c33  count=2
  21. 0x025758  count=2
  22. 0x029776  count=2
  23. 0x0421a7  count=2
  24. 0x042366  count=2
  25. 0x02398e  count=1
  26. 0x023a1c  count=1
  27. 0x028ef8  count=1
  28. 0x028f2b  count=1
  29. 0x028f49  count=1
  30. 0x028f6b  count=1
Known text chain counts:
  0x028f02  count=4 [label-draw primitive]
  0x080244  count=8 [text helper]
  0x029374  count=8 [string staging -> 0xd026ea]
  0x0a1cac  count=8 [text loop]
  0x0a1b5b  count=66 [per-char dispatch]
  0x0a1799  count=66 [glyph draw]
Top source blocks for hot targets:
  0x0a1a3b <- 0x0a1965:adl x1188, 0x0a1a17:adl x1188
  0x000380 <- 0x07bf5c:adl x66
  0x00038c <- 0x0a17d0:adl x66
  0x07bf3e <- 0x0a17b8:adl x66
  0x0a1799 <- 0x0a1b77:adl x66
0x028f02 sources: 0x029782:adl x2, 0x0296f7:adl x1, 0x029733:adl x1
0x028f02 called multiple times: YES (4)
Top 5 unique call targets:
  1. 0x0a1a3b  count=2376 [PRIMITIVE]
  2. 0x000380  count=66
  3. 0x00038c  count=66
  4. 0x07bf3e  count=66
  5. 0x0a1799  count=66 [KNOWN glyph draw] [PRIMITIVE]
Surprises:
  - Primitive-range traffic: 0x0a1a3b (2376), 0x0a1799 (66), 0x0a1b5b (66).
*/
