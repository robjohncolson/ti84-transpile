/**
 * Phase 317 — 0x0217B0 JP Vector Table Analysis
 *
 * Dumps and analyzes the JP vector table at 0x0217B0, which is a sub-region
 * of the massive OS master vector table at 0x020110-0x022308 (2175 entries).
 *
 * The 0x0217B0 sub-table contains 727 entries (indices 0-726), spanning
 * 0x0217B0 to 0x022308. Each entry is a 4-byte ADL JP (C3 xx xx xx).
 *
 * Dispatch mechanism: BCALL operand + 0x020000 = table entry address.
 * So BCALL 0x17B0 -> JP at 0x0217B0, BCALL 0x17C0 -> JP at 0x0217C0, etc.
 * RST 28h (0xEF) = B_CALL (call + return), RST 30h (0xF7) = B_JUMP (tail call).
 */

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TABLE_START = 0x0217B0;
const TABLE_END   = 0x022308;
const MEGA_START  = 0x020110;

// ── 1. Dump all entries ──────────────────────────────────────────────

console.log('=== 0x0217B0 JP Vector Table (727 entries) ===\n');

const entries = [];
for (let addr = TABLE_START; addr <= TABLE_END; addr += 4) {
  const idx = (addr - TABLE_START) / 4;
  if (rom[addr] !== 0xC3) {
    console.log(`[${idx}] 0x${addr.toString(16)} — NOT JP (0x${rom[addr].toString(16).padStart(2, '0')})`);
    break;
  }
  const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
  const bcallNum = addr - 0x020000;
  entries.push({ idx, addr, target, bcallNum });
}

for (const e of entries) {
  console.log(
    `  [${String(e.idx).padStart(3)}] ` +
    `0x${e.addr.toString(16)} → 0x${e.target.toString(16).padStart(6, '0')}  ` +
    `(BCALL 0x${e.bcallNum.toString(16).padStart(4, '0')})`
  );
}
console.log(`\nTotal entries: ${entries.length}`);

// ── 2. Find dispatchers (BCALL / B_JUMP / direct refs) ──────────────

console.log('\n=== Dispatcher Analysis ===\n');

const refsByIdx = {};
for (let i = 0; i < entries.length; i++) refsByIdx[i] = { bcall: [], bjump: [], directTable: [], directTarget: [] };

// Build target→idx map for direct-target detection
const targetToIdx = new Map();
for (const e of entries) {
  // Multiple entries can point to the same target; store first occurrence
  if (!targetToIdx.has(e.target)) targetToIdx.set(e.target, e.idx);
}

for (let addr = 0; addr < rom.length - 4; addr++) {
  // Skip addresses inside the mega-table itself
  if (addr >= MEGA_START && addr <= TABLE_END + 4) continue;

  const op = rom[addr];

  // RST 28h (B_CALL)
  if (op === 0xEF && addr + 3 <= rom.length) {
    const bcallOp = rom[addr + 1] | (rom[addr + 2] << 8);
    const tAddr = 0x020000 + bcallOp;
    if (tAddr >= TABLE_START && tAddr <= TABLE_END && ((tAddr - MEGA_START) % 4 === 0)) {
      const idx = (tAddr - TABLE_START) / 4;
      refsByIdx[idx].bcall.push(addr);
    }
  }

  // RST 30h (B_JUMP)
  if (op === 0xF7 && addr + 3 <= rom.length) {
    const bjumpOp = rom[addr + 1] | (rom[addr + 2] << 8);
    const tAddr = 0x020000 + bjumpOp;
    if (tAddr >= TABLE_START && tAddr <= TABLE_END && ((tAddr - MEGA_START) % 4 === 0)) {
      const idx = (tAddr - TABLE_START) / 4;
      refsByIdx[idx].bjump.push(addr);
    }
  }

  // Direct CALL/JP to table entry address
  if (op === 0xCD || op === 0xC3) {
    const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
    if (target >= TABLE_START && target <= TABLE_END && ((target - TABLE_START) % 4 === 0)) {
      const idx = (target - TABLE_START) / 4;
      refsByIdx[idx].directTable.push(addr);
    }
    // Direct call to the JP target (bypassing table)
    if (targetToIdx.has(target)) {
      refsByIdx[targetToIdx.get(target)].directTarget.push(addr);
    }
  }
}

let entriesWithCallers = 0;
let bcallEntries = 0, bjumpEntries = 0, directTargetEntries = 0;

for (let i = 0; i < entries.length; i++) {
  const r = refsByIdx[i];
  const total = r.bcall.length + r.bjump.length + r.directTable.length + r.directTarget.length;
  if (total > 0) entriesWithCallers++;
  if (r.bcall.length > 0) bcallEntries++;
  if (r.bjump.length > 0) bjumpEntries++;
  if (r.directTarget.length > 0) directTargetEntries++;
}

console.log(`Entries with any callers: ${entriesWithCallers} / ${entries.length}`);
console.log(`  via B_CALL (RST 28h):        ${bcallEntries} entries`);
console.log(`  via B_JUMP (RST 30h):        ${bjumpEntries} entries`);
console.log(`  via direct CALL/JP to target: ${directTargetEntries} entries`);

// Show BCALL and B_JUMP references
console.log('\nEntries called via BCALL/B_JUMP:');
for (let i = 0; i < entries.length; i++) {
  const r = refsByIdx[i];
  if (r.bcall.length + r.bjump.length > 0) {
    const e = entries[i];
    const parts = [];
    if (r.bcall.length > 0) parts.push(`${r.bcall.length} BCALL`);
    if (r.bjump.length > 0) parts.push(`${r.bjump.length} B_JUMP`);
    console.log(
      `  [${String(i).padStart(3)}] BCALL 0x${e.bcallNum.toString(16).padStart(4, '0')} → 0x${e.target.toString(16).padStart(6, '0')} (${parts.join(', ')})`
    );
  }
}

// ── 3. Cross-reference with 0x0241A3 orchestrator ────────────────────

console.log('\n=== Cross-Reference with 0x0241A3 Orchestrator ===\n');

// Entry[4] = JP 0x0241A3 (the orchestrator itself)
const orchIdx = 4;
const orchEntry = entries[orchIdx];
console.log(`Entry[${orchIdx}] @ 0x${orchEntry.addr.toString(16)} → 0x${orchEntry.target.toString(16).padStart(6, '0')} (orchestrator direct)`);
const orchRefs = refsByIdx[orchIdx];
console.log(`  Direct target callers: ${orchRefs.directTarget.length} (from: ${orchRefs.directTarget.slice(0, 5).map(a => '0x' + a.toString(16)).join(', ')}${orchRefs.directTarget.length > 5 ? '...' : ''})`);

// Find the 9 orchestrator wrappers at 0x0242E6
// Pattern: 3E xx CD A3 41 02 C9 (7 bytes each)
console.log('\nOrchestrator wrappers (LD A,cmd; CALL 0x0241A3; RET):');
const wrappers = [];
let wAddr = 0x0242E6;
while (rom[wAddr] === 0x3E && rom[wAddr + 2] === 0xCD && rom[wAddr + 3] === 0xA3 && rom[wAddr + 4] === 0x41 && rom[wAddr + 5] === 0x02 && rom[wAddr + 6] === 0xC9) {
  const cmdByte = rom[wAddr + 1];
  wrappers.push({ addr: wAddr, cmdByte });
  wAddr += 7;
}

for (const w of wrappers) {
  // Find callers of this wrapper
  const callers = [];
  const wLo = w.addr & 0xFF, wMid = (w.addr >> 8) & 0xFF, wHi = (w.addr >> 16) & 0xFF;
  for (let a = 0; a < rom.length - 4; a++) {
    if ((rom[a] === 0xCD || rom[a] === 0xC3) && rom[a + 1] === wLo && rom[a + 2] === wMid && rom[a + 3] === wHi) {
      callers.push({ addr: a, op: rom[a] === 0xCD ? 'CALL' : 'JP' });
    }
  }
  // Check if any caller is a table entry
  const tableCallers = callers.filter(c => c.addr >= 0x020110 && c.addr <= TABLE_END && c.op === 'JP');
  const externalCallers = callers.filter(c => c.addr < 0x020110 || c.addr > TABLE_END);

  console.log(`  0x${w.addr.toString(16)}: LD A, 0x${w.cmdByte.toString(16).padStart(2, '0')} — ${callers.length} callers`);
  for (const tc of tableCallers) {
    const tidx = (tc.addr - TABLE_START) / 4;
    if (tc.addr >= TABLE_START) {
      console.log(`    → JP from mega-table entry at 0x${tc.addr.toString(16)} (0x0217B0 idx ${tidx})`);
    } else {
      console.log(`    → JP from mega-table at 0x${tc.addr.toString(16)}`);
    }
  }
  for (const ec of externalCallers) {
    console.log(`    → ${ec.op} from 0x${ec.addr.toString(16)}`);
  }
}

// ── 4. Mega-table context ────────────────────────────────────────────

console.log('\n=== Mega-Table Context ===\n');
console.log('The OS master vector table spans 0x020110 to 0x022308 (2175 contiguous JP entries).');
console.log('Previously identified sub-regions:');
console.log('  0x020110 — 0x0213BF : entries 0-1195   (pre-0x0213C0 region)');
console.log('  0x0213C0 — 0x0217AF : entries 1196-1447 (session 229 sub-table, 252 entries)');
console.log('  0x0217B0 — 0x022308 : entries 1448-2174 (this analysis, 727 entries)');
console.log('\nDispatch: RST 28h (B_CALL) and RST 30h (B_JUMP) use a 2-byte operand.');
console.log('Effective address = 0x020000 + operand, which lands in the table.');
console.log('Most entries are called by their JP target address directly (506 of 727),');
console.log('not via BCALL. Only 16 entries have BCALL/B_JUMP callers.');

console.log('\n=== DONE ===');
