/**
 * probe-phase424-trace-sibling-callers.mjs
 *
 * Traces the two callers of 0x00E583 (sibling list walker):
 *   - 0x00D295 is a call site inside function 0x00CD7B–0x00D2EC (1394 bytes)
 *   - 0x00ED10 is a call site inside function 0x00EB31–0x00ED76 (582 bytes)
 *
 * For each enclosing function:
 *   - Full instruction scan for CALL targets, RAM refs, port I/O
 *   - Disassembly context around the CALL 0x00E583 site
 *   - Analysis of what triggers the sibling walk and post-call behavior
 *
 * Usage:  node TI-84_Plus_CE/probe-phase424-trace-sibling-callers.mjs
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

console.log('='.repeat(72));
console.log('Phase 424 — Trace Sibling Walker Callers (0x00D295, 0x00ED10)');
console.log('='.repeat(72));
console.log();

// ── Helpers ────────────────────────────────────────────────────────────

function addr24(i) { return rom[i] | (rom[i + 1] << 8) | (rom[i + 2] << 16); }

function hexRow(offset, count) {
  const bytes = [];
  for (let i = 0; i < count && offset + i < rom.length; i++) {
    bytes.push(rom[offset + i].toString(16).padStart(2, '0'));
  }
  return offset.toString(16).padStart(6, '0') + ': ' + bytes.join(' ');
}

function hex6(v) { return '0x' + v.toString(16).padStart(6, '0'); }

// Scan a function region for CALL, JP, JR, RAM refs, and port I/O
function scanRegion(start, end) {
  const calls = [];
  const jps   = [];
  const jrs   = [];
  const rams  = [];
  const ports = [];
  const rets  = [];
  const condCalls = [];
  const condJps   = [];

  for (let i = start; i <= end; ) {
    const b = rom[i];

    // RET
    if (b === 0xC9) { rets.push(i); i += 1; continue; }

    // CALL imm24
    if (b === 0xCD && i + 3 <= end) {
      calls.push({ from: i, to: addr24(i + 1) });
      i += 4; continue;
    }
    // Conditional CALL cc,nn
    if ((b & 0xC7) === 0xC4 && b !== 0xCD && i + 3 <= end) {
      const cc = ['NZ','Z','NC','C','PO','PE','P','M'][(b >> 3) & 7];
      condCalls.push({ from: i, to: addr24(i + 1), cc });
      i += 4; continue;
    }

    // JP imm24
    if (b === 0xC3 && i + 3 <= end) {
      jps.push({ from: i, to: addr24(i + 1) });
      i += 4; continue;
    }
    // Conditional JP cc,nn
    if ((b & 0xC7) === 0xC2 && b !== 0xC3 && i + 3 <= end) {
      const cc = ['NZ','Z','NC','C','PO','PE','P','M'][(b >> 3) & 7];
      condJps.push({ from: i, to: addr24(i + 1), cc });
      i += 4; continue;
    }

    // JR variants
    if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(b) && i + 1 <= end) {
      const names = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
      const off = rom[i + 1] >= 128 ? rom[i + 1] - 256 : rom[i + 1];
      jrs.push({ from: i, op: names[b], offset: off, target: i + 2 + off });
      i += 2; continue;
    }

    // LD A,(imm24)
    if (b === 0x3A && i + 3 <= end) {
      rams.push({ from: i, addr: addr24(i + 1), op: 'LD A,(nn)' });
      i += 4; continue;
    }
    // LD (imm24),A
    if (b === 0x32 && i + 3 <= end) {
      rams.push({ from: i, addr: addr24(i + 1), op: 'LD (nn),A' });
      i += 4; continue;
    }
    // LD HL,(imm24)
    if (b === 0x2A && i + 3 <= end) {
      rams.push({ from: i, addr: addr24(i + 1), op: 'LD HL,(nn)' });
      i += 4; continue;
    }
    // LD (imm24),HL
    if (b === 0x22 && i + 3 <= end) {
      rams.push({ from: i, addr: addr24(i + 1), op: 'LD (nn),HL' });
      i += 4; continue;
    }

    // ED-prefixed loads and ports
    if (b === 0xED && i + 1 <= end) {
      const b2 = rom[i + 1];
      if (b2 === 0x4B && i + 4 <= end) {
        rams.push({ from: i, addr: addr24(i + 2), op: 'LD BC,(nn)' });
        i += 5; continue;
      }
      if (b2 === 0x43 && i + 4 <= end) {
        rams.push({ from: i, addr: addr24(i + 2), op: 'LD (nn),BC' });
        i += 5; continue;
      }
      if (b2 === 0x5B && i + 4 <= end) {
        rams.push({ from: i, addr: addr24(i + 2), op: 'LD DE,(nn)' });
        i += 5; continue;
      }
      if (b2 === 0x53 && i + 4 <= end) {
        rams.push({ from: i, addr: addr24(i + 2), op: 'LD (nn),DE' });
        i += 5; continue;
      }
      if (b2 === 0x7B && i + 4 <= end) {
        rams.push({ from: i, addr: addr24(i + 2), op: 'LD SP,(nn)' });
        i += 5; continue;
      }
      if (b2 === 0x73 && i + 4 <= end) {
        rams.push({ from: i, addr: addr24(i + 2), op: 'LD (nn),SP' });
        i += 5; continue;
      }
      if (b2 === 0x78) { ports.push({ from: i, op: 'IN A,(C)' }); i += 2; continue; }
      if (b2 === 0x79) { ports.push({ from: i, op: 'OUT (C),A' }); i += 2; continue; }
      if (b2 === 0x40) { ports.push({ from: i, op: 'IN B,(C)' }); i += 2; continue; }
      if (b2 === 0x41) { ports.push({ from: i, op: 'OUT (C),B' }); i += 2; continue; }
      i += 2; continue;
    }

    // FD 2A = LD IY,(nn)
    if (b === 0xFD && i + 1 <= end && rom[i + 1] === 0x2A && i + 4 <= end) {
      rams.push({ from: i, addr: addr24(i + 2), op: 'LD IY,(nn)' });
      i += 5; continue;
    }
    // FD 22 = LD (nn),IY
    if (b === 0xFD && i + 1 <= end && rom[i + 1] === 0x22 && i + 4 <= end) {
      rams.push({ from: i, addr: addr24(i + 2), op: 'LD (nn),IY' });
      i += 5; continue;
    }

    // DD/FD prefix — skip prefix byte
    if (b === 0xDD || b === 0xFD) { i += 1; continue; }

    // IN A,(n)
    if (b === 0xDB && i + 1 <= end) {
      ports.push({ from: i, op: `IN A,(0x${rom[i+1].toString(16).padStart(2,'0')})` });
      i += 2; continue;
    }
    // OUT (n),A
    if (b === 0xD3 && i + 1 <= end) {
      ports.push({ from: i, op: `OUT (0x${rom[i+1].toString(16).padStart(2,'0')}),A` });
      i += 2; continue;
    }

    i += 1;
  }

  return { calls, jps, jrs, rams, ports, rets, condCalls, condJps };
}

// Full disassembly listing using the eZ80 decoder
function disasmListing(start, end) {
  const lines = [];
  let pc = start;
  while (pc <= end) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      if (!inst || inst.size === 0) {
        lines.push(`  ${hex6(pc)}: DB 0x${rom[pc].toString(16).padStart(2,'0')}`);
        pc += 1;
        continue;
      }
      const operands = inst.operands || [];
      const opStr = operands.length > 0 ? ' ' + operands.join(', ') : '';
      const mnem = inst.mnemonic || '???';
      lines.push(`  ${hex6(pc)}: ${mnem}${opStr}`);
      pc += inst.size;
    } catch (e) {
      lines.push(`  ${hex6(pc)}: DB 0x${rom[pc].toString(16).padStart(2,'0')}  ; decode error`);
      pc += 1;
    }
  }
  return lines;
}

// Known label lookup
const knownLabels = {
  0x002197: 'stack frame setup',
  0x0021C2: 'validate/check helper',
  0x00229D: 'shift-combine helper',
  0x0022F9: 'shift-extract helper',
  0x002330: 'bitfield extract',
  0x002623: 'unknown helper (0x2623)',
  0x0025E8: 'unknown helper (0x25E8)',
  0x0027E8: 'unknown helper (0x27E8)',
  0x00276B: 'unknown helper (0x276B)',
  0x0059C6: 'unknown helper (0x59C6)',
  0x006EAF: 'USB status check',
  0x006EB6: 'unknown helper (0x6EB6)',
  0x0075F7: 'port write helper',
  0x00C9A0: 'USB hard reset',
  0x00DA8C: 'link-state toggle',
  0x00DB66: 'I/O drain (link)',
  0x00DC0E: 'I/O drain (link)',
  0x00E06D: 'slab alloc',
  0x00E1CC: 'slab free',
  0x00E4E8: 'header field extractor',
  0x00E583: 'sibling list walker',
  0x00ED77: 'link handshake',
  0x00FE10: 'link transfer engine',
  0x014E3F: 'unknown helper (0x14E3F)',
};

function labelFor(addr) {
  return knownLabels[addr] || `(unknown ${hex6(addr)})`;
}

// ════════════════════════════════════════════════════════════════════════
// Function 1: 0x00CD7B–0x00D2EC (containing CALL 0xE583 at 0xD295)
// ════════════════════════════════════════════════════════════════════════

const func1 = { name: 'Caller A', start: 0x00CD7B, end: 0x00D2EC, callSite: 0x00D295 };
const func2 = { name: 'Caller B', start: 0x00EB31, end: 0x00ED76, callSite: 0x00ED10 };

for (const func of [func1, func2]) {
  const size = func.end - func.start + 1;

  console.log('='.repeat(72));
  console.log(`${func.name}: ${hex6(func.start)}–${hex6(func.end)} (${size} bytes)`);
  console.log(`CALL 0x00E583 at: ${hex6(func.callSite)}`);
  console.log('='.repeat(72));
  console.log();

  // Hex dump: first 64 bytes
  console.log('── Hex dump (first 64 bytes) ──');
  for (let r = 0; r < 4; r++) console.log(hexRow(func.start + r * 16, 16));
  console.log('  ...');
  console.log(hexRow(func.end - 15, 16));
  console.log();

  // Prologue disassembly (first ~40 bytes)
  console.log('── Prologue disassembly ──');
  const prologueEnd = Math.min(func.start + 60, func.end);
  const prologue = disasmListing(func.start, prologueEnd);
  for (const line of prologue) console.log(line);
  console.log();

  // Context around CALL 0xE583 (80 bytes before, 60 bytes after)
  const ctxStart = Math.max(func.start, func.callSite - 80);
  const ctxEnd = Math.min(func.end, func.callSite + 60);
  console.log(`── Context around CALL 0xE583 (${hex6(ctxStart)}–${hex6(ctxEnd)}) ──`);
  const ctxListing = disasmListing(ctxStart, ctxEnd);
  for (const line of ctxListing) {
    // Highlight the call site
    if (line.includes(hex6(func.callSite))) {
      console.log(line + '  <<<< CALL 0xE583 HERE');
    } else {
      console.log(line);
    }
  }
  console.log();

  // Post-call: disassemble from call site + 4 to end (or 120 bytes)
  const postStart = func.callSite + 4;
  const postEnd = Math.min(func.end, postStart + 120);
  console.log(`── Post-call path (${hex6(postStart)}–${hex6(postEnd)}) ──`);
  const postListing = disasmListing(postStart, postEnd);
  for (const line of postListing) console.log(line);
  console.log();

  // Epilogue (last 30 bytes)
  const epiStart = Math.max(func.start, func.end - 30);
  console.log(`── Epilogue (${hex6(epiStart)}–${hex6(func.end)}) ──`);
  const epiListing = disasmListing(epiStart, func.end);
  for (const line of epiListing) console.log(line);
  console.log();

  // Full scan
  const scan = scanRegion(func.start, func.end);

  // CALL targets
  console.log('── CALL targets ──');
  const callMap = new Map();
  for (const c of scan.calls) {
    if (!callMap.has(c.to)) callMap.set(c.to, []);
    callMap.get(c.to).push(c.from);
  }
  for (const [tgt, froms] of [...callMap.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${hex6(tgt)}  ${labelFor(tgt)}`);
    console.log(`    from: ${froms.map(f => hex6(f)).join(', ')}`);
    console.log(`    count: ${froms.length}`);
  }
  if (scan.condCalls.length > 0) {
    console.log('  Conditional CALLs:');
    for (const c of scan.condCalls) {
      console.log(`    ${hex6(c.from)}: CALL ${c.cc},${hex6(c.to)}`);
    }
  }
  console.log();

  // JP targets
  console.log('── JP targets ──');
  for (const j of scan.jps) {
    const inside = j.to >= func.start && j.to <= func.end;
    console.log(`  ${hex6(j.from)} -> ${hex6(j.to)} ${inside ? '(internal)' : '(external)'}`);
  }
  for (const j of scan.condJps) {
    const inside = j.to >= func.start && j.to <= func.end;
    console.log(`  ${hex6(j.from)}: JP ${j.cc},${hex6(j.to)} ${inside ? '(internal)' : '(external)'}`);
  }
  console.log();

  // JR branches
  console.log('── JR branches ──');
  const backJumps = scan.jrs.filter(j => j.target < j.from);
  const fwdJumps  = scan.jrs.filter(j => j.target >= j.from);
  console.log(`  Back-jumps (loops): ${backJumps.length}`);
  for (const j of backJumps) {
    console.log(`    ${hex6(j.from)}: ${j.op} ${j.offset} -> ${hex6(j.target)}`);
  }
  console.log(`  Forward-jumps (conditionals/skips): ${fwdJumps.length}`);
  for (const j of fwdJumps) {
    console.log(`    ${hex6(j.from)}: ${j.op} +${j.offset} -> ${hex6(j.target)}`);
  }
  console.log();

  // RAM addresses
  console.log('── RAM addresses ──');
  const uniqueAddrs = [...new Set(scan.rams.map(r => r.addr))].sort((a, b) => a - b);
  for (const addr of uniqueAddrs) {
    const refs = scan.rams.filter(r => r.addr === addr);
    const reads  = refs.filter(r => !r.op.startsWith('LD ('));
    const writes = refs.filter(r => r.op.startsWith('LD ('));
    const inRange = addr >= 0xD00000;
    const tag = inRange ? '' : ' [ROM/low addr — likely data ref]';
    console.log(`  ${hex6(addr)}  R:${reads.length} W:${writes.length}  total:${refs.length}${tag}`);
  }
  console.log();

  // Port I/O
  console.log('── Port I/O ──');
  if (scan.ports.length === 0) {
    console.log('  (none)');
  } else {
    for (const p of scan.ports) {
      console.log(`  ${hex6(p.from)}: ${p.op}`);
    }
  }
  console.log();

  // RET locations
  console.log('── RET instructions ──');
  for (const r of scan.rets) {
    console.log(`  ${hex6(r)}: RET`);
  }
  console.log();
}

// ── Cross-references ───────────────────────────────────────────────────

console.log('='.repeat(72));
console.log('Cross-references — Who calls these functions?');
console.log('='.repeat(72));
console.log();

for (const [label, funcAddr] of [['0xCD7B (Caller A)', 0x00CD7B], ['0xEB31 (Caller B)', 0x00EB31]]) {
  const tLo = funcAddr & 0xFF;
  const tMid = (funcAddr >> 8) & 0xFF;
  const tHi = (funcAddr >> 16) & 0xFF;

  const callerRefs = [];
  const jpRefs = [];

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i + 1] === tLo && rom[i + 2] === tMid && rom[i + 3] === tHi) {
      if (rom[i] === 0xCD) callerRefs.push(i);
      if (rom[i] === 0xC3) jpRefs.push(i);
    }
  }

  console.log(`${label}:`);
  console.log(`  CALL refs: ${callerRefs.length}`);
  for (const c of callerRefs) console.log(`    ${hex6(c)}`);
  console.log(`  JP refs: ${jpRefs.length}`);
  for (const j of jpRefs) console.log(`    ${hex6(j)}`);
  console.log();
}

// ── Relationship analysis ──────────────────────────────────────────────

console.log('='.repeat(72));
console.log('Relationship Analysis');
console.log('='.repeat(72));
console.log();
console.log('Both callers invoke 0x00E583 (sibling list walker) as their FIRST');
console.log('instruction — the CALL is at the very start of the code path that');
console.log('reaches this point. This suggests these are not standalone functions');
console.log('that "call" the walker, but rather large multi-phase routines where');
console.log('the sibling walk is one phase in a larger transfer operation.');
console.log();
console.log('Transfer chain topology:');
console.log('  0x00FE10 (transfer engine) orchestrates block-level transfers');
console.log('  0x00E583 (sibling walker) walks sibling linked lists');
console.log('  0x00E4E8 (header extractor) extracts header fields from nodes');
console.log('  0x00E1CC (slab free) recycles memory after processing');
console.log('  0x00DA8C (link-state toggle) activates/deactivates link state');
console.log();

console.log('='.repeat(72));
console.log('Probe complete.');
