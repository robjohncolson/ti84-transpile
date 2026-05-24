/**
 * probe-phase423-trace-00E583.mjs
 *
 * Traces 0x00E583 — sibling list walker (923 bytes, 0x00E583–0x00E91D).
 * Extracts function bytes, disassembles key structures, scans for callers,
 * and prints a structured report.
 *
 * Usage:  node TI-84_Plus_CE/probe-phase423-trace-00E583.mjs
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const FUNC_START = 0x00E583;
const FUNC_END   = 0x00E91D;  // inclusive (RET byte)
const FUNC_SIZE  = FUNC_END - FUNC_START + 1;

console.log('='.repeat(72));
console.log('Phase 423 — Trace 0x00E583: Sibling List Walker');
console.log('='.repeat(72));
console.log();

// ── 1. Basic info ──────────────────────────────────────────────────────
console.log(`Function range : 0x${FUNC_START.toString(16).padStart(6, '0')}–0x${FUNC_END.toString(16).padStart(6, '0')}`);
console.log(`Size           : ${FUNC_SIZE} bytes (0x${FUNC_SIZE.toString(16)})`);
console.log();

// ── 2. Hex dump (first 64 bytes + last 16) ─────────────────────────────
function hexRow(offset, count) {
  const bytes = [];
  for (let i = 0; i < count && offset + i < rom.length; i++) {
    bytes.push(rom[offset + i].toString(16).padStart(2, '0'));
  }
  return offset.toString(16).padStart(6, '0') + ': ' + bytes.join(' ');
}

console.log('── Hex dump (first 64 bytes) ──');
for (let r = 0; r < 4; r++) console.log(hexRow(FUNC_START + r * 16, 16));
console.log('  ...');
console.log(hexRow(FUNC_END - 15, 16));
console.log();

// ── 3. Instruction scan ────────────────────────────────────────────────
const calls = [];
const jps   = [];
const rams  = [];
const ports = [];
const jrs   = [];

function addr24(i) { return rom[i] | (rom[i + 1] << 8) | (rom[i + 2] << 16); }

for (let i = FUNC_START; i <= FUNC_END; ) {
  const b = rom[i];

  // CALL imm24
  if (b === 0xCD && i + 3 <= FUNC_END) {
    calls.push({ from: i, to: addr24(i + 1) });
    i += 4; continue;
  }
  // JP imm24
  if (b === 0xC3 && i + 3 <= FUNC_END) {
    jps.push({ from: i, to: addr24(i + 1) });
    i += 4; continue;
  }
  // JR variants
  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(b) && i + 1 <= FUNC_END) {
    const names = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
    const off = rom[i + 1] >= 128 ? rom[i + 1] - 256 : rom[i + 1];
    jrs.push({ from: i, op: names[b], offset: off, target: i + 2 + off });
    i += 2; continue;
  }
  // LD A,(imm24)
  if (b === 0x3A && i + 3 <= FUNC_END) {
    rams.push({ from: i, addr: addr24(i + 1), op: 'LD A,(nn)' });
    i += 4; continue;
  }
  // LD (imm24),A
  if (b === 0x32 && i + 3 <= FUNC_END) {
    rams.push({ from: i, addr: addr24(i + 1), op: 'LD (nn),A' });
    i += 4; continue;
  }
  // LD HL,(imm24)
  if (b === 0x2A && i + 3 <= FUNC_END) {
    rams.push({ from: i, addr: addr24(i + 1), op: 'LD HL,(nn)' });
    i += 4; continue;
  }
  // LD (imm24),HL
  if (b === 0x22 && i + 3 <= FUNC_END) {
    rams.push({ from: i, addr: addr24(i + 1), op: 'LD (nn),HL' });
    i += 4; continue;
  }
  // ED-prefixed loads
  if (b === 0xED && i + 1 <= FUNC_END) {
    const b2 = rom[i + 1];
    if (b2 === 0x4B && i + 4 <= FUNC_END) { // LD BC,(nn)
      rams.push({ from: i, addr: addr24(i + 2), op: 'LD BC,(nn)' });
      i += 5; continue;
    }
    if (b2 === 0x43 && i + 4 <= FUNC_END) { // LD (nn),BC
      rams.push({ from: i, addr: addr24(i + 2), op: 'LD (nn),BC' });
      i += 5; continue;
    }
    if (b2 === 0x78) { ports.push({ from: i, op: 'IN A,(C)' }); i += 2; continue; }
    if (b2 === 0x79) { ports.push({ from: i, op: 'OUT (C),A' }); i += 2; continue; }
    i += 2; continue;
  }
  // FD 2A = LD IY,(nn)
  if (b === 0xFD && i + 1 <= FUNC_END && rom[i + 1] === 0x2A && i + 4 <= FUNC_END) {
    rams.push({ from: i, addr: addr24(i + 2), op: 'LD IY,(nn)' });
    i += 5; continue;
  }
  // DD/FD prefix — skip prefix byte
  if (b === 0xDD || b === 0xFD) { i += 1; continue; }

  i += 1;
}

// ── 4. CALL targets ────────────────────────────────────────────────────
console.log('── CALL targets (24 calls) ──');
const callMap = new Map();
for (const c of calls) {
  if (!callMap.has(c.to)) callMap.set(c.to, []);
  callMap.get(c.to).push(c.from);
}
for (const [target, froms] of [...callMap.entries()].sort((a, b) => a[0] - b[0])) {
  const label = {
    0x002197: 'stack frame setup',
    0x0021C2: 'validate/check helper',
    0x00229D: 'shift-combine helper',
    0x0022F9: 'shift-extract helper',
    0x002330: 'bitfield extract',
    0x0027E8: 'unknown helper (0x27E8)',
    0x00276B: 'unknown helper (0x276B)',
    0x006EAF: 'USB status check',
    0x00DA8C: 'link-state toggle',
    0x00E1CC: 'slab free helper',
    0x00E4E8: 'header field extractor',
    0x014E3F: 'unknown helper (0x14E3F)',
  }[target] || '(unknown)';
  console.log(`  0x${target.toString(16).padStart(6, '0')}  ${label}`);
  console.log(`    called from: ${froms.map(f => '0x' + f.toString(16).padStart(6, '0')).join(', ')}`);
  console.log(`    count: ${froms.length}`);
}
console.log();

// ── 5. JP targets (exits) ──────────────────────────────────────────────
console.log('── JP targets (4 exits to epilogue) ──');
for (const j of jps) {
  console.log(`  0x${j.from.toString(16).padStart(6, '0')} -> 0x${j.to.toString(16).padStart(6, '0')}`);
}
console.log();

// ── 6. JR branches (loops + conditionals) ──────────────────────────────
console.log('── JR branches (26 total) ──');
const backJumps = jrs.filter(j => j.target < j.from);
const fwdJumps  = jrs.filter(j => j.target >= j.from);
console.log(`  Back-jumps (loops): ${backJumps.length}`);
for (const j of backJumps) {
  console.log(`    0x${j.from.toString(16).padStart(6, '0')}: ${j.op} ${j.offset} -> 0x${j.target.toString(16).padStart(6, '0')}`);
}
console.log(`  Forward-jumps (conditionals/skips): ${fwdJumps.length}`);
for (const j of fwdJumps) {
  console.log(`    0x${j.from.toString(16).padStart(6, '0')}: ${j.op} +${j.offset} -> 0x${j.target.toString(16).padStart(6, '0')}`);
}
console.log();

// ── 7. RAM addresses ───────────────────────────────────────────────────
console.log('── RAM addresses ──');
const uniqueAddrs = [...new Set(rams.map(r => r.addr))].sort((a, b) => a - b);
for (const addr of uniqueAddrs) {
  const refs = rams.filter(r => r.addr === addr);
  const reads  = refs.filter(r => r.op.includes('(nn)') && !r.op.startsWith('LD ('));
  const writes = refs.filter(r => r.op.startsWith('LD ('));
  console.log(`  0x${addr.toString(16).padStart(6, '0')}  R:${reads.length} W:${writes.length}  total:${refs.length}`);
}
console.log();

// ── 8. Port I/O ────────────────────────────────────────────────────────
console.log('── Port I/O (4 reads) ──');
for (const p of ports) {
  console.log(`  0x${p.from.toString(16).padStart(6, '0')}: ${p.op}`);
}
console.log(`  Port 0x3030 (USB status) — checks bit 0 for busy/ready`);
console.log();

// ── 9. Scan for callers of 0x00E583 ────────────────────────────────────
console.log('── Callers of 0x00E583 ──');
const callPattern = [0xCD, 0x83, 0xE5, 0x00];
const jpPattern   = [0xC3, 0x83, 0xE5, 0x00];
const callers = [];
const jumpers = [];

for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i] === callPattern[0] && rom[i + 1] === callPattern[1] &&
      rom[i + 2] === callPattern[2] && rom[i + 3] === callPattern[3]) {
    callers.push(i);
  }
  if (rom[i] === jpPattern[0] && rom[i + 1] === jpPattern[1] &&
      rom[i + 2] === jpPattern[2] && rom[i + 3] === jpPattern[3]) {
    jumpers.push(i);
  }
}

console.log(`  CALL 0x00E583 (CD 83 E5 00): ${callers.length} refs`);
for (const c of callers) {
  console.log(`    0x${c.toString(16).padStart(6, '0')}`);
}
console.log(`  JP 0x00E583 (C3 83 E5 00): ${jumpers.length} refs`);
for (const j of jumpers) {
  console.log(`    0x${j.toString(16).padStart(6, '0')}`);
}
console.log();

// ── 10. Structural analysis ────────────────────────────────────────────
console.log('── Structural Analysis ──');
console.log();
console.log('PROLOGUE (0xE583–0xE5A2):');
console.log('  LD HL,-10 ; CALL 0x2197 (stack frame, allocates locals)');
console.log('  IX-3 (0xFD) = 0x01 (return value init)');
console.log('  Stores 0x01 to D141EC (active-transfer flag)');
console.log('  Reads IX-7/IX+7 pairs, loads IX-10/IX+7');
console.log('  CALL 0x6EAF (USB status check)');
console.log();
console.log('EARLY EXIT CHECK (0xE5A3–0xE5BB):');
console.log('  If USB status == 0: check port 0x3030 bit 0');
console.log('    If busy: load IX-3 (return val), JP to epilogue 0xE919');
console.log('  Else: fall through to main body');
console.log();
console.log('PHASE 1 — Build linked-list node (0xE5BC–0xE61E):');
console.log('  Reads IY+0x10 and IY+0x12 header fields via 0x22F9 (shift-extract)');
console.log('  Combines via 0x229D (shift-combine) into address components');
console.log('  Stores results to D14008 (current node ptr) and D14011 (sibling ptr)');
console.log('  CALL 0x27E8 with BC from D14008');
console.log('  Stores BC to D14005 (block-list head) and D14011');
console.log();
console.log('LOOP 1 — Sibling linked-list walk (0xE623–0xE679):');
console.log('  IY = (D14011) — load sibling pointer');
console.log('  Check IY+0 AND 0x01: if zero (type mismatch), JR to exit loop');
console.log('  Check IY+0 AND 0xE0 — extract upper bits');
console.log('  Extract IY+1 and IY+2 via 0x22F9/0x229D (shift-extract/combine)');
console.log('  Store combined addr to D14011 — advance to next sibling');
console.log('  JR back to 0xE623 (loop top)');
console.log('  This walks a linked list where each node has:');
console.log('    byte 0: type/flags (bit 0 = valid, bits 7:5 = upper addr)');
console.log('    byte 1: addr bits 7:0');
console.log('    byte 2: addr bits 15:8');
console.log('    byte 3+: additional fields');
console.log();
console.log('POST-LOOP 1 — Process result (0xE67B–0xE72A):');
console.log('  Reads D14005 header flags, updates D14011');
console.log('  Extracts bitfields via 0x2330');
console.log('  CALL 0x14E3F — further processing');
console.log('  Clears IX-4, stores D141BB');
console.log('  Updates IY+0x10 flags (CB 87 = RES 0,A — clear bit 0)');
console.log('  Sets D176FB = 0x01');
console.log();
console.log('VALIDATION BLOCK (0xE72B–0xE7AE):');
console.log('  Checks IX+0x0F (NZ = has more data)');
console.log('  CALL 0x21C2 (validate) — if fail, zero out IX+0x12');
console.log('  Increments D14076 counter');
console.log('  Checks port 0x3030 bit 0 — if busy, return 0x01 via JP 0xE919');
console.log('  Reads IY from D14008, sets IY+8 bit 7 (CB FF = SET 7,A)');
console.log('  Returns 0 (AF) via JP 0xE919');
console.log();
console.log('SECONDARY PATH (0xE7AF–0xE83B):');
console.log('  Compares IX-2:IX-1 against 0x012C (300 decimal) — iteration limit');
console.log('  Reads D141EC (active-transfer flag)');
console.log('  Checks D1440F and D177B7 for state conditions');
console.log('  CALL 0xDA8C (link-state toggle) on some paths');
console.log('  Clears D1440E');
console.log();
console.log('PHASE 2 — Process sibling entries (0xE83C–0xE91D):');
console.log('  Loads BC from D14008, stores to D1400B');
console.log('  Reads IY from D1400B — walks the node');
console.log('  Extracts IY+0x0B field, masks off bit 7 (CB BF = RES 7,A)');
console.log('  Computes offset: A * entry_size, adds to base');
console.log('  CALL 0x276B (helper) then CALL 0xE4E8 (header field extractor)');
console.log('  CALL 0x21C2 (validate) — stores extracted fields to IX+0x12');
console.log('  Extracts IY+0 fields via 0x22F9/0x229D, stores to D1400E');
console.log('  CALL 0xE1CC (slab free) with BC=0');
console.log('  Advances: BC from D1400E, stores to D1400B');
console.log('  Compares D1400B against D14005 (block-list head)');
console.log('  JR NZ back to 0xE8A3 — LOOP 2 (walks until back to head)');
console.log();
console.log('EPILOGUE (0xE916–0xE91D):');
console.log('  LD A,(IX-3)   — load return value');
console.log('  LD SP,IX      — restore stack');
console.log('  POP IX        — restore caller IX');
console.log('  RET');
console.log();

// ── 11. Relationship summary ───────────────────────────────────────────
console.log('── Relationship to 0x00E4E8 and 0x00FE10 ──');
console.log();
console.log('0x00E4E8 (header field extractor, 155 bytes):');
console.log('  Called once at 0xE882 during Phase 2 sibling processing.');
console.log('  Extracts header fields from the current sibling node, used to');
console.log('  determine the next link in the list and validate entry type.');
console.log();
console.log('0x00FE10 (transfer engine, 638 bytes):');
console.log('  Not called directly by 0xE583, but both operate on the same');
console.log('  data structures: D14008 (current node), D14005 (block-list head),');
console.log('  D14011 (sibling ptr). 0xE583 walks the sibling list to build/');
console.log('  validate the linked structure that 0xFE10 then transfers.');
console.log();
console.log('0x00DA8C (link-state toggle, 218 bytes):');
console.log('  Called at 0xE829 — toggles link state during list processing.');
console.log();
console.log('0x00E1CC (slab free, 287 bytes):');
console.log('  Called at 0xE8F8 — frees slab entries after processing siblings.');
console.log();

console.log('='.repeat(72));
console.log('Probe complete.');
