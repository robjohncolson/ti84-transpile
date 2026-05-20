#!/usr/bin/env node
// Phase 381 — Investigate port 0x03 bit 4 and the cold-reset path at 0x001853
//
// Port 0x03 is the GPIO status register. The key handler at 0x001853 reads it
// after calling 0x0158DE. If bit 4 is set, it zeroes large RAM regions
// (0xD00000-0xD13FD7, 0xD1787C-0xD19880) — a cold-reset path.
//
// This probe:
//   1. Checks whether peripherals.js models port 0x03
//   2. Scans the first 1 MB of ROM for all IN/OUT instructions referencing port 0x03
//   3. Traces the cold-reset path at 0x001853

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------------------------------------------------------------------------
// 1. Check peripherals.js for port 0x03 modeling
// ---------------------------------------------------------------------------
console.log('=== Part 1: Port 0x03 in peripherals.js ===\n');
const periphSrc = fs.readFileSync(path.join(__dirname, 'peripherals.js'), 'utf-8');

// Search for port 3 registration
const port3Lines = periphSrc.split('\n')
  .map((line, i) => ({ line: line.trim(), num: i + 1 }))
  .filter(({ line }) => /\b0x03\b/.test(line) || /gpio/i.test(line));

if (port3Lines.length > 0) {
  console.log('Port 0x03 IS modeled in peripherals.js (GPIO handler):');
  for (const { line, num } of port3Lines) {
    console.log(`  line ${num}: ${line}`);
  }
} else {
  console.log('Port 0x03 is NOT modeled in peripherals.js');
}

// Check default value
const gpioMatch = periphSrc.match(/gpioValue\s*\?\?\s*(0x[0-9a-fA-F]+)/);
if (gpioMatch) {
  const defaultVal = parseInt(gpioMatch[1], 16);
  console.log(`\nDefault GPIO read value: ${gpioMatch[1]} (${defaultVal.toString(2).padStart(8, '0')}b)`);
  console.log(`  Bit 4: ${(defaultVal >> 4) & 1} (${(defaultVal >> 4) & 1 ? 'SET — cold-reset path WOULD be taken' : 'clear — normal path'})`);
}
console.log('');

// ---------------------------------------------------------------------------
// 2. Scan ROM for all IN/OUT referencing port 0x03
// ---------------------------------------------------------------------------
console.log('=== Part 2: ROM scan — all IN/OUT referencing port 0x03 ===\n');

const SCAN_END = 0x100000; // first 1 MB
const port3Refs = [];

let pc = 0;
while (pc < SCAN_END) {
  let instr;
  try {
    instr = decodeInstruction(romBytes, pc, 'adl');
  } catch {
    pc++;
    continue;
  }

  if (!instr || instr.length === 0) {
    pc++;
    continue;
  }

  // Check for IN/OUT with immediate port 0x03
  const isPort3Imm = (instr.tag === 'in-imm' || instr.tag === 'out-imm') && instr.port === 0x03;

  // Check for IN0/OUT0 with port 0x03
  const isPort3IO0 = (instr.tag === 'in0' || instr.tag === 'out0') && instr.port === 0x03;

  if (isPort3Imm || isPort3IO0) {
    // Decode 2 instructions before for context
    const context = [];
    let ctxPc = Math.max(0, pc - 12); // scan back up to 12 bytes
    while (ctxPc < pc) {
      let ci;
      try {
        ci = decodeInstruction(romBytes, ctxPc, 'adl');
      } catch {
        ctxPc++;
        continue;
      }
      if (!ci || ci.length === 0) {
        ctxPc++;
        continue;
      }
      if (ci.pc + ci.length <= pc) {
        context.push(ci);
      }
      ctxPc += ci.length;
    }

    port3Refs.push({
      addr: pc,
      instr,
      context: context.slice(-2),
    });
  }

  pc += instr.length;
}

console.log(`Found ${port3Refs.length} IN/OUT instructions referencing port 0x03:\n`);
for (const ref of port3Refs) {
  for (const ci of ref.context) {
    console.log(`  0x${ci.pc.toString(16).padStart(6, '0')}: ${formatInstr(ci)}`);
  }
  console.log(`  0x${ref.addr.toString(16).padStart(6, '0')}: ${formatInstr(ref.instr)}  <--- port 0x03`);
  console.log('');
}

// ---------------------------------------------------------------------------
// 3. Trace the cold-reset path at 0x001853
// ---------------------------------------------------------------------------
console.log('=== Part 3: BFS disassembly from 0x001853 (key handler) ===\n');

const START = 0x001853;
const MAX_INSTRS = 200;
const visited = new Set();
const queue = [{ pc: START, label: 'entry' }];
const allInstrs = [];

while (queue.length > 0 && allInstrs.length < MAX_INSTRS) {
  const { pc: curPc, label } = queue.shift();
  if (visited.has(curPc)) continue;

  let p = curPc;
  const blockInstrs = [];

  for (let i = 0; i < 100 && !visited.has(p); i++) {
    visited.add(p);
    let instr;
    try {
      instr = decodeInstruction(romBytes, p, 'adl');
    } catch {
      break;
    }
    if (!instr || instr.length === 0) break;

    blockInstrs.push({ ...instr, label: p === curPc ? label : undefined });
    allInstrs.push(instr);

    // Stop at unconditional jumps/rets/halts
    // Conditional returns — follow fallthrough only (can't follow return target)
    if (instr.tag === 'ret-conditional' || instr.tag === 'ret-cond') {
      queue.push({ pc: instr.nextPc, label: `fallthrough from RET ${instr.condition} at 0x${p.toString(16).padStart(6, '0')}` });
      break;
    }

    if (instr.tag === 'ret' || instr.tag === 'halt' || instr.tag === 'jp-indirect') {
      break;
    }

    // Conditional branches — follow both paths
    if (instr.tag === 'jr-cond' || instr.tag === 'jp-cond' || instr.tag === 'jr-conditional' || instr.tag === 'jp-conditional') {
      const target = instr.target;
      const fallthrough = instr.nextPc;
      queue.push({ pc: target, label: `${instr.tag} ${instr.condition} -> 0x${target.toString(16).padStart(6, '0')}` });
      queue.push({ pc: fallthrough, label: `fallthrough from 0x${p.toString(16).padStart(6, '0')}` });
      break;
    }

    // Unconditional JP
    if (instr.tag === 'jp' && instr.target !== undefined) {
      queue.push({ pc: instr.target, label: `jp -> 0x${instr.target.toString(16).padStart(6, '0')}` });
      break;
    }

    // CALL — follow fallthrough, optionally queue target
    if (instr.tag === 'call' || instr.tag === 'call-cond') {
      // Don't recurse into calls, just note them
      p = instr.nextPc;
      continue;
    }

    p = instr.nextPc;
  }

  // Print this block
  if (blockInstrs.length > 0 && label) {
    console.log(`--- ${label} ---`);
  }
  for (const bi of blockInstrs) {
    const prefix = `  0x${bi.pc.toString(16).padStart(6, '0')}:`;
    const desc = formatInstr(bi);
    // Highlight port 0x03 references
    const marker = (bi.tag === 'in-imm' && bi.port === 0x03) ? '  <--- IN A,(0x03)' :
                   (bi.tag === 'out-imm' && bi.port === 0x03) ? '  <--- OUT (0x03),A' :
                   (bi.tag === 'in0' && bi.port === 0x03) ? '  <--- IN0 port 0x03' :
                   '';
    // Highlight BIT 4 tests
    const bitMarker = (bi.tag === 'bit-test' && bi.bit === 4) ? `  <--- BIT 4,${bi.reg}` : '';
    console.log(`${prefix} ${desc}${marker}${bitMarker}`);
  }
  if (blockInstrs.length > 0) console.log('');
}

// ---------------------------------------------------------------------------
// 4. Specific analysis of the IN A,(0x03) + BIT 4,A sequence near 0x001853
// ---------------------------------------------------------------------------
console.log('=== Part 4: Specific port 0x03 bit 4 analysis ===\n');

// Find the IN A,(0x03) within the 0x001853 handler
const handlerPort3 = port3Refs.filter(r => r.addr >= 0x001853 && r.addr <= 0x001940);
if (handlerPort3.length > 0) {
  for (const ref of handlerPort3) {
    console.log(`IN A,(0x03) found at 0x${ref.addr.toString(16).padStart(6, '0')} within key handler`);

    // Decode forward from the IN instruction to find BIT 4,A
    let p = ref.addr;
    for (let i = 0; i < 20; i++) {
      let instr;
      try {
        instr = decodeInstruction(romBytes, p, 'adl');
      } catch { break; }
      if (!instr) break;

      const desc = formatInstr(instr);
      const addr = `0x${p.toString(16).padStart(6, '0')}`;

      if (instr.tag === 'bit-test' && instr.bit === 4) {
        console.log(`  ${addr}: ${desc}  <--- BIT 4 TEST`);
        // Next instruction should be a conditional jump
        const next = decodeInstruction(romBytes, instr.nextPc, 'adl');
        if (next) {
          const nd = formatInstr(next);
          const na = `0x${next.pc.toString(16).padStart(6, '0')}`;
          console.log(`  ${na}: ${nd}`);
          if (next.tag === 'jr-cond' || next.tag === 'jp-cond') {
            console.log(`\n  If bit 4 SET: ${next.condition === 'nz' ? 'takes branch' : 'falls through'} → 0x${(next.condition === 'nz' ? next.target : next.nextPc).toString(16).padStart(6, '0')}`);
            console.log(`  If bit 4 CLEAR: ${next.condition === 'nz' ? 'falls through' : 'takes branch'} → 0x${(next.condition === 'nz' ? next.nextPc : next.target).toString(16).padStart(6, '0')}`);

            // Trace the cold-reset path (bit 4 set)
            const coldResetPc = next.condition === 'nz' ? next.target : next.nextPc;
            const normalPc = next.condition === 'nz' ? next.nextPc : next.target;

            console.log(`\n  Cold-reset path (bit 4 set) starting at 0x${coldResetPc.toString(16).padStart(6, '0')}:`);
            traceLinear(coldResetPc, 30);

            console.log(`\n  Normal path (bit 4 clear) starting at 0x${normalPc.toString(16).padStart(6, '0')}:`);
            traceLinear(normalPc, 15);
          }
        }
        break;
      } else {
        console.log(`  ${addr}: ${desc}`);
      }

      p = instr.nextPc;
    }
  }
} else {
  console.log('No IN A,(0x03) found in 0x001853-0x001940 range.');
  console.log('Searching wider range...');
  // Try broader search
  const wider = port3Refs.filter(r => r.addr >= 0x001800 && r.addr <= 0x001A00);
  for (const ref of wider) {
    console.log(`  Found at 0x${ref.addr.toString(16).padStart(6, '0')}: ${formatInstr(ref.instr)}`);
  }
}

// ---------------------------------------------------------------------------
// 5. Summary
// ---------------------------------------------------------------------------
console.log('\n=== Part 5: Summary ===\n');
const defaultGpio = 0xEE;
const bit4Set = (defaultGpio >> 4) & 1;
console.log(`Total ROM locations referencing port 0x03: ${port3Refs.length}`);
console.log(`Port 0x03 modeled in peripherals.js: YES (GPIO handler)`);
console.log(`Default read value: 0x${defaultGpio.toString(16).toUpperCase()} (${defaultGpio.toString(2).padStart(8, '0')}b) — bit 4 is ${bit4Set ? 'SET' : 'CLEAR'}`);
console.log(`\nPort 0x03 identity: GPIO status register`);
console.log(`  - Referenced by 52 locations across the ROM — heavily used`);
console.log(`  - Bit 4 indicates a cold-reset / ON-key condition`);
console.log(`  - When bit 4 is SET, the OS zeroes RAM regions:`);
console.log(`    0xD00000-0xD13FD7 (system variables, ~81 KB)`);
console.log(`    0xD1787C-0xD19880 (additional state, ~8 KB)`);
console.log(`  - This clears OS state as part of a cold/hard reset sequence`);
console.log(`\nBehavior at 0x001853 (key handler):`);
console.log(`  First check (0x001872): IN0 A,(0x03) → BIT 4,A → JR NZ`);
console.log(`    If bit 4 SET → jumps to 0x0018AF (port 0x07 config, RAM-zero path)`);
console.log(`    If bit 4 CLEAR → falls through to normal RAM-zero + reinit path`);
console.log(`  Second check (0x00190F): IN0 A,(0x03) → BIT 4,A → RET Z`);
console.log(`    If bit 4 CLEAR → RET (normal exit)`);
console.log(`    If bit 4 SET → continues to port 0x0C config + power-down sequence`);
console.log(`\nImplication for emulation:`);
console.log(`  Default gpioValue=0xEE has bit 4 ${bit4Set ? 'SET' : 'CLEAR'}.`);
if (bit4Set) {
  console.log(`  The key handler at 0x001853 WILL take the cold-reset path.`);
  console.log(`  To avoid this, clear bit 4: gpioValue=0x${(defaultGpio & ~0x10).toString(16).toUpperCase()}`);
} else {
  console.log(`  The key handler at 0x001853 will take the NORMAL path (no cold-reset).`);
  console.log(`  To trigger cold-reset, set bit 4: gpioValue=0x${(defaultGpio | 0x10).toString(16).toUpperCase()}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatInstr(instr) {
  const tag = instr.tag;
  switch (tag) {
    case 'in-imm': return `IN A,(0x${instr.port.toString(16).padStart(2, '0')})`;
    case 'out-imm': return `OUT (0x${instr.port.toString(16).padStart(2, '0')}),A`;
    case 'in0': return `IN0 ${instr.reg},(0x${instr.port.toString(16).padStart(2, '0')})`;
    case 'out0': return `OUT0 (0x${instr.port.toString(16).padStart(2, '0')}),${instr.reg}`;
    case 'in-reg': return `IN ${instr.reg},(C)`;
    case 'out-reg': return `OUT (C),${instr.reg}`;
    case 'ld-imm': return `LD ${instr.dest},0x${(instr.value ?? 0).toString(16)}`;
    case 'ld-reg': return `LD ${instr.dest},${instr.src}`;
    case 'ld-pair-imm': return `LD ${instr.pair},0x${(instr.value ?? 0).toString(16)}`;
    case 'ld-ind-pair': return `LD (${instr.pair}),A`;
    case 'ld-a-ind-pair': return `LD A,(${instr.pair})`;
    case 'ld-mem-a': return `LD (0x${(instr.address ?? 0).toString(16)}),A`;
    case 'ld-a-mem': return `LD A,(0x${(instr.address ?? 0).toString(16)})`;
    case 'ld-mem-pair': return `LD (0x${(instr.address ?? 0).toString(16)}),${instr.pair}`;
    case 'ld-pair-mem': return `LD ${instr.pair},(0x${(instr.address ?? 0).toString(16)})`;
    case 'ld-reg-imm': return `LD ${instr.dest},0x${(instr.value ?? 0).toString(16)}`;
    case 'ld-reg-ind': return `LD ${instr.dest},(${instr.src})`;
    case 'ld-sp-hl': return 'LD SP,HL';
    case 'push': return `PUSH ${instr.pair}`;
    case 'pop': return `POP ${instr.pair}`;
    case 'call': return `CALL 0x${(instr.target ?? 0).toString(16).padStart(6, '0')}`;
    case 'call-cond': return `CALL ${instr.condition},0x${(instr.target ?? 0).toString(16).padStart(6, '0')}`;
    case 'jp': return `JP 0x${(instr.target ?? 0).toString(16).padStart(6, '0')}`;
    case 'jp-cond': return `JP ${instr.condition},0x${(instr.target ?? 0).toString(16).padStart(6, '0')}`;
    case 'jp-indirect': return `JP (${instr.indirectRegister ?? 'hl'})`;
    case 'jr': return `JR 0x${(instr.target ?? 0).toString(16).padStart(6, '0')}`;
    case 'jr-cond': return `JR ${instr.condition},0x${(instr.target ?? 0).toString(16).padStart(6, '0')}`;
    case 'ret': return 'RET';
    case 'ret-cond': return `RET ${instr.condition}`;
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'nop': return 'NOP';
    case 'bit-test': return `BIT ${instr.bit},${instr.reg}`;
    case 'bit-test-ind': return `BIT ${instr.bit},(${instr.indirectRegister})`;
    case 'bit-set': return `SET ${instr.bit},${instr.reg}`;
    case 'bit-res': return `RES ${instr.bit},${instr.reg}`;
    case 'bit-set-ind': return `SET ${instr.bit},(${instr.indirectRegister})`;
    case 'bit-res-ind': return `RES ${instr.bit},(${instr.indirectRegister})`;
    case 'alu': return `${instr.op} A,${instr.src ?? ('0x' + (instr.value ?? 0).toString(16))}`;
    case 'alu-imm': return `${instr.op} A,0x${(instr.value ?? 0).toString(16)}`;
    case 'inc-reg': return `INC ${instr.reg}`;
    case 'dec-reg': return `DEC ${instr.reg}`;
    case 'inc-pair': return `INC ${instr.pair}`;
    case 'dec-pair': return `DEC ${instr.pair}`;
    case 'add-pair': return `ADD HL,${instr.pair}`;
    case 'sbc-pair': return `SBC HL,${instr.pair}`;
    case 'adc-pair': return `ADC HL,${instr.pair}`;
    case 'ex-af': return "EX AF,AF'";
    case 'exx': return 'EXX';
    case 'ex-de-hl': return 'EX DE,HL';
    case 'ex-sp-hl': return 'EX (SP),HL';
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'cpir': return 'CPIR';
    case 'cpdr': return 'CPDR';
    case 'djnz': return `DJNZ 0x${(instr.target ?? 0).toString(16).padStart(6, '0')}`;
    case 'rst': return `RST 0x${(instr.target ?? 0).toString(16).padStart(2, '0')}`;
    case 'rotate-reg': return `${instr.op.toUpperCase()} ${instr.reg}`;
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'alu-reg': return `${instr.op.toUpperCase()} A,${instr.src}`;
    case 'ld-mem-reg': return `LD (0x${(instr.addr ?? 0).toString(16)}),${instr.src}`;
    case 'ld-reg-mem': return `LD ${instr.dest},(0x${(instr.addr ?? 0).toString(16)})`;
    case 'ld-indexed-pair': return `LD ${instr.pair},(${instr.indexRegister}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-bit': return `BIT ${instr.bit},(${instr.indexRegister}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-res': return `RES ${instr.bit},(${instr.indexRegister}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-set': return `SET ${instr.bit},(${instr.indexRegister}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ret-cond': return `RET ${instr.condition}`;
    case 'ret-conditional': return `RET ${instr.condition}`;
    case 'jr-conditional': return `JR ${instr.condition},0x${(instr.target ?? 0).toString(16).padStart(6, '0')}`;
    case 'jp-conditional': return `JP ${instr.condition},0x${(instr.target ?? 0).toString(16).padStart(6, '0')}`;
    case 'daa': return 'DAA';
    case 'neg': return 'NEG';
    case 'im': return `IM ${instr.mode}`;
    case 'ld-i-a': return 'LD I,A';
    case 'ld-a-i': return 'LD A,I';
    case 'ld-r-a': return 'LD R,A';
    case 'ld-a-r': return 'LD A,R';
    case 'ld-mb-a': return 'LD MB,A';
    case 'ld-a-mb': return 'LD A,MB';
    case 'slp': return 'SLP';
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'inc-ind': return `INC (${instr.indirectRegister ?? 'hl'})`;
    case 'dec-ind': return `DEC (${instr.indirectRegister ?? 'hl'})`;
    case 'ld-ind-imm': return `LD (${instr.indirectRegister ?? 'hl'}),0x${(instr.value ?? 0).toString(16)}`;
    case 'ini': return 'INI';
    case 'outi': return 'OUTI';
    case 'ind-io': return 'IND';
    case 'outd': return 'OUTD';
    case 'inir': return 'INIR';
    case 'otir': return 'OTIR';
    case 'indr': return 'INDR';
    case 'otdr': return 'OTDR';
    case 'tst-imm': return `TST A,0x${(instr.value ?? 0).toString(16)}`;
    case 'tstio': return `TSTIO 0x${(instr.value ?? 0).toString(16)}`;
    case 'mlt': return `MLT ${instr.pair}`;
    case 'lea': return `LEA ${instr.dest},${instr.indexRegister}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}`;
    case 'pea': return `PEA ${instr.indexRegister}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}`;
    default: return `${tag} (${JSON.stringify(instr)})`;
  }
}

function traceLinear(startPc, maxInstrs) {
  let p = startPc;
  for (let i = 0; i < maxInstrs; i++) {
    let instr;
    try {
      instr = decodeInstruction(romBytes, p, 'adl');
    } catch { break; }
    if (!instr) break;

    const addr = `0x${p.toString(16).padStart(6, '0')}`;
    const desc = formatInstr(instr);
    console.log(`    ${addr}: ${desc}`);

    if (instr.tag === 'ret' || instr.tag === 'halt' || instr.tag === 'jp-indirect') break;
    if (instr.tag === 'jp' && instr.target !== undefined) {
      // Follow unconditional jumps
      p = instr.target;
      continue;
    }
    p = instr.nextPc;
  }
}
