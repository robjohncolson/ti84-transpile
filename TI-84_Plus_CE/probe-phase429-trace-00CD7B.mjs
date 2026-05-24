#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x00CD7B;
const SCAN_LIMIT = 0x700;
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const KNOWN_ADDRS = new Map([
  [0xD13FD8, 'descriptor-table slot base'],
  [0xD13FDB, 'descriptor-table slot base +1'],
  [0xD13FDE, 'descriptor-table slot base +2'],
  [0xD13FE1, 'descriptor-table slot base +3'],
  [0xD13FFC, 'primary live descriptor pointer'],
  [0xD13FFF, 'secondary live descriptor pointer'],
  [0xD14002, 'tertiary live descriptor pointer'],
  [0xD141BE, 'descriptor/config source buffer'],
]);

const CALL_LABELS = new Map([
  [0x00211B, '_seqcase sparse'],
  [0x002197, '__frameset'],
  [0x0021C2, 'zero/null check'],
  [0x0025E8, 'post-walk predicate'],
  [0x002623, '_seqcase dense'],
  [0x00276B, 'u24 pack/convert helper'],
  [0x0027E8, 'copy/helper'],
  [0x00CB7B, 'descriptor tail constructor'],
  [0x00CBE9, 'descriptor header/link constructor'],
  [0x00E06D, 'slab alloc (selector 0)'],
  [0x00E1CC, 'slab free (selector 0)'],
  [0x00E583, 'sibling walker'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readU16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function readU24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function parseSeqTable(addr) {
  const count = readU16(addr);
  const base = readU24(addr + 2);
  const targets = [];
  let cursor = addr + 5;
  for (let i = 0; i < count; i += 1, cursor += 3) {
    targets.push(readU24(cursor));
  }
  const defaultTarget = readU24(cursor);
  return { addr, count, base, targets, defaultTarget, end: cursor + 3 };
}

function parseSparseTable(addr) {
  const count = readU16(addr);
  const entries = [];
  let cursor = addr + 2;
  for (let i = 0; i < count; i += 1, cursor += 4) {
    entries.push({ key: rom[cursor], target: readU24(cursor + 1) });
  }
  const defaultTarget = readU24(cursor);
  return { addr, count, entries, defaultTarget, end: cursor + 3 };
}

function addSummaryRef(map, addr, kind, pc) {
  const key = addr >>> 0;
  if (!map.has(key)) {
    map.set(key, { addr: key, kinds: new Map(), pcs: [] });
  }
  const entry = map.get(key);
  entry.kinds.set(kind, (entry.kinds.get(kind) || 0) + 1);
  if (entry.pcs.length < 8) {
    entry.pcs.push(pc);
  }
}

function walkFunction(start) {
  const visited = new Map();
  const worklist = [start];
  const callCounts = new Map();
  const seqTables = [];
  const sparseTables = [];
  const ramRefs = new Map();
  const immRefs = new Map();
  const ports = [];
  const backwardBranches = [];

  while (worklist.length > 0) {
    let pc = worklist.pop();

    while (pc >= start && pc < start + SCAN_LIMIT && !visited.has(pc)) {
      const inst = decodeInstruction(rom, pc, 'adl');
      visited.set(pc, inst);

      if (inst.tag === 'call' || inst.tag === 'call-conditional') {
        callCounts.set(inst.target, (callCounts.get(inst.target) || 0) + 1);
      }

      if (
        (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') &&
        typeof inst.target === 'number' &&
        inst.target < pc
      ) {
        backwardBranches.push({ pc, target: inst.target, tag: inst.tag });
      }

      if (typeof inst.addr === 'number' && inst.addr >= RAM_MIN && inst.addr <= RAM_MAX) {
        addSummaryRef(ramRefs, inst.addr, inst.tag, pc);
      }

      if (inst.tag === 'ld-pair-imm' && typeof inst.value === 'number' && inst.value >= RAM_MIN && inst.value <= RAM_MAX) {
        addSummaryRef(immRefs, inst.value, inst.tag, pc);
      }

      if (['in-reg', 'in-imm', 'in0', 'out-reg', 'out-imm', 'out0'].includes(inst.tag)) {
        ports.push({ pc, tag: inst.tag, port: inst.port ?? null });
      }

      if (inst.tag === 'call' && inst.target === 0x002623) {
        const table = parseSeqTable(inst.nextPc);
        seqTables.push({ pc, ...table });
        worklist.push(table.defaultTarget, ...table.targets);
        break;
      }

      if (inst.tag === 'call' && inst.target === 0x00211B) {
        const table = parseSparseTable(inst.nextPc);
        sparseTables.push({ pc, ...table });
        worklist.push(table.defaultTarget, ...table.entries.map((entry) => entry.target));
        break;
      }

      if (inst.tag === 'jp' || inst.tag === 'jr') {
        if (inst.target >= start && inst.target < start + SCAN_LIMIT) {
          worklist.push(inst.target);
        }
        break;
      }

      if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') {
        if (inst.target >= start && inst.target < start + SCAN_LIMIT) {
          worklist.push(inst.target);
        }
        pc = inst.nextPc;
        continue;
      }

      if (inst.tag === 'ret' || inst.tag === 'jp-indirect' || inst.tag === 'rst') {
        break;
      }

      if (inst.tag === 'ret-conditional') {
        pc = inst.nextPc;
        continue;
      }

      pc = inst.nextPc;
    }
  }

  const instructions = [...visited.keys()].sort((a, b) => a - b).map((pc) => visited.get(pc));
  const end = Math.max(...instructions.map((inst) => inst.nextPc - 1));

  return {
    instructions,
    end,
    callCounts,
    seqTables,
    sparseTables,
    ramRefs,
    immRefs,
    ports,
    backwardBranches,
  };
}

function formatCountMap(map) {
  return [...map.entries()]
    .map(([kind, count]) => `${kind}:${count}`)
    .join(', ');
}

function formatPcList(pcs) {
  return pcs.map((pc) => hex(pc)).join(', ');
}

function formatRamEntries(map) {
  const entries = [...map.values()].sort((a, b) => a.addr - b.addr);
  if (entries.length === 0) {
    return ['- none'];
  }
  return entries.map((entry) => {
    const label = KNOWN_ADDRS.get(entry.addr);
    return `- ${hex(entry.addr)}${label ? ` (${label})` : ''}: ${formatCountMap(entry.kinds)} at ${formatPcList(entry.pcs)}`;
  });
}

const trace = walkFunction(START);
const lines = [];

lines.push('Phase 429 - Trace 0x00CD7B: Descriptor Table Builder');
lines.push(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
lines.push('');

lines.push('=== FUNCTION BOUNDS ===');
lines.push(`- Start: ${hex(START)}`);
lines.push(`- End:   ${hex(trace.end)}`);
lines.push(`- Size:  ${trace.end - START + 1} bytes (${hex(trace.end - START + 1, 4)})`);
lines.push(`- Reachable instructions: ${trace.instructions.length}`);
lines.push('');

lines.push('=== HIGH-LEVEL CONTROL FLOW ===');
lines.push('- Prologue uses a 3-byte local frame: `IX-2` is the status/result byte, `IX-1` is the normalized builder selector.');
lines.push('- Stage 1 dispatch: read packet byte 0, shift right 5 times, mask with 3, then jump through a 3-entry dense table.');
lines.push('- Stage 2 request decode:');
lines.push('  type 0 -> dense 12-entry `bRequest` table at `0x00CDCA`');
lines.push('  type 1 -> sparse 6-entry `bRequest` table at `0x00CE16`');
lines.push('  type 2 -> direct compares against `0xFF`, `0xF9`, `0xF8`');
lines.push('  type 3/default -> selector remains 0 and the function exits early');
lines.push('- The request decode collapses all request variants into selector values `1`, `2`, `3`, or `0` (no-build).');
lines.push('- Allocation phase is linear and rollback-safe: allocate `D13FFC`, then `D13FFF`, then optionally `D14002`; each success is checked immediately and failures free already-allocated slabs.');
lines.push('- After allocation there is a common descriptor prefill block, then a second dense selector dispatch chooses one of three unrolled constructor branches.');
lines.push('- There are no backward branches in the reachable body, so this builder is not loop-driven. It is a multi-stage switch with unrolled allocation/construction paths.');
lines.push('');

lines.push('=== INLINE DISPATCH TABLES ===');
for (const table of trace.seqTables.sort((a, b) => a.pc - b.pc)) {
  lines.push(`- Dense table after CALL ${hex(table.pc)}: count=${table.count}, base=${hex(table.base)}, default=${hex(table.defaultTarget)}`);
  table.targets.forEach((target, index) => {
    lines.push(`  ${hex(table.base + index)} -> ${hex(target)}`);
  });
}
for (const table of trace.sparseTables.sort((a, b) => a.pc - b.pc)) {
  lines.push(`- Sparse table after CALL ${hex(table.pc)}: count=${table.count}, default=${hex(table.defaultTarget)}`);
  table.entries.forEach((entry) => {
    lines.push(`  key ${hex(entry.key, 2)} -> ${hex(entry.target)}`);
  });
}
lines.push('');

lines.push('=== BUILDER SELECTOR MEANING ===');
lines.push('- `selector = 1`: branch at `0x00CFE2` -> allocates/uses all three live descriptor slabs and executes 2x `0x00CB7B` + 2x `0x00CBE9`.');
lines.push('- `selector = 2`: branch at `0x00D0D5` -> skips the third slab allocation (`D14002`) and executes 1x `0x00CB7B` + 1x `0x00CBE9`.');
lines.push('- `selector = 3`: branch at `0x00D14E` -> allocates/uses all three live descriptor slabs and executes 2x `0x00CB7B` + 2x `0x00CBE9`, with an extra conditional copy/helper block before the second constructor pair.');
lines.push('- `selector = 0`: falls through to the epilogue path without building descriptors.');
lines.push('');

lines.push('=== CONSTRUCTOR CALL SITES ===');
lines.push('- `0x00CB7B` sites: `0x00CFF2`, `0x00D00E`, `0x00D0E5`, `0x00D162`, `0x00D1A8`');
lines.push('- `0x00CBE9` sites: `0x00D021`, `0x00D033`, `0x00D0F8`, `0x00D1BB`, `0x00D1CD`');
lines.push('- A single invocation executes either 4 constructor calls (`selector 1` or `selector 3`) or 2 constructor calls (`selector 2`).');
lines.push('');

lines.push('=== SIBLING-WALK HANDOFF ===');
lines.push('- Final handoff begins at `0x00D26B` and calls `0x00E583` once at `0x00D295`.');
lines.push('- It computes `D13FD8 + 3 * arg0`, loads the 24-bit table entry at that slot, and passes it together with `*(D13FFC)` and constant `0x1388` to the sibling walker.');
lines.push('- This is the only direct reference to the descriptor-table base array in the function body.');
lines.push('');

lines.push('=== CALL TARGETS ===');
for (const [target, count] of [...trace.callCounts.entries()].sort((a, b) => a[0] - b[0])) {
  const label = CALL_LABELS.get(target);
  lines.push(`- ${hex(target)}${label ? ` (${label})` : ''}: ${count}`);
}
lines.push('');

lines.push('=== PORT I/O ===');
if (trace.ports.length === 0) {
  lines.push('- none');
} else {
  for (const port of trace.ports) {
    lines.push(`- ${hex(port.pc)} ${port.tag} ${port.port == null ? '(C)' : hex(port.port, 2)}`);
  }
}
lines.push('');

lines.push('=== ABSOLUTE RAM ACCESSES (D0xxxx-D1xxxx) ===');
lines.push(...formatRamEntries(trace.ramRefs));
lines.push('');

lines.push('=== ABSOLUTE RAM BASE/POINTER CONSTANTS ===');
lines.push(...formatRamEntries(trace.immRefs));
lines.push('- Computed base note: `0x00D287` loads `0xD13FD8`, then adds `3 * arg0`, so runtime-selected slots can land on `D13FD8`, `D13FDB`, `D13FDE`, `D13FE1`, and later 3-byte entries.');
lines.push('');

lines.push('=== LOOPS / BACKWARD BRANCHES ===');
if (trace.backwardBranches.length === 0) {
  lines.push('- none in reachable code');
} else {
  for (const branch of trace.backwardBranches) {
    lines.push(`- ${hex(branch.pc)} ${branch.tag} -> ${hex(branch.target)}`);
  }
}
lines.push('');

lines.push('=== BOTTOM LINE ===');
lines.push('- `0x00CD7B` is a fixed-shape descriptor builder, not an iterative table walker.');
lines.push('- It first normalizes the incoming request into selector `1`, `2`, or `3`.');
lines.push('- Selector `2` builds a 2-descriptor configuration (`D13FFC` + `D13FFF`), while selectors `1` and `3` build 3-descriptor configurations (`D13FFC` + `D13FFF` + `D14002`).');
lines.push('- The follow-on structure assembly is fully unrolled, then handed to `0x00E583` for sibling-chain processing.');

console.log(lines.join('\n'));
