#!/usr/bin/env node
// probe-phase431-trace-usb-targets.mjs
// Disassemble 5 undecoded USB handler call targets from session 430.
// Run: node TI-84_Plus_CE/probe-phase431-trace-usb-targets.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

// --- helpers ---

function hex(v, w = 6) {
  return `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
}

function bytesHex(addr, len) {
  return Array.from(rom.slice(addr, addr + len))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function isRam(addr) {
  return addr >= 0xd00000 && addr <= 0xd1ffff;
}

function isPort16(bc) {
  // port addresses stored in BC for IN/OUT (C) instructions
  // we track them as-is; caller can identify them
  return bc >= 0 && bc <= 0xffff;
}

// --- linear disassembler ---
// Does a pure linear scan from `start`, stopping at the first unconditional
// terminator (RET/RETN/RETI/HALT/unconditional JP/JR) whose target is
// outside the function body OR at the address limit.
//
// For the summary we also collect forward branch targets that land within
// the body, but we do NOT recurse into them — the linear scan naturally
// covers them by continuing past conditional branches.
//
// To handle shared epilogues reached via `JP epilogueAddr` where the
// epilogue is AFTER the main body (common in TI-OS), we cap scanning at
// `endHint` if supplied, and treat any JP that jumps backward as a tail-JP
// (exit point).

function disassembleFunction(start, maxBytes = 2000, endHint = null) {
  const instrs = [];
  let pc = start;
  const limit = endHint != null ? endHint + 4 : start + maxBytes;

  while (pc < limit) {
    let instr;
    try {
      instr = decodeInstruction(rom, pc, 'adl');
    } catch (err) {
      // Unknown opcode — emit raw byte as a placeholder and advance 1
      instrs.push({ pc, length: 1, nextPc: pc + 1, tag: 'unknown', byte: rom[pc] });
      pc += 1;
      continue;
    }

    instrs.push(instr);
    pc = instr.nextPc;

    if (!instr.terminates) continue;

    const tag = instr.tag;

    // Unconditional terminator with no fallthrough — done
    if (tag === 'ret' || tag === 'retn' || tag === 'reti' || tag === 'halt' || tag === 'slp') {
      break;
    }
    if (tag === 'jp' || tag === 'jr') {
      // Unconditional jump — if target is inside the body it is a loop,
      // keep scanning linearly. If target is outside, treat as exit.
      const target = instr.target;
      if (target == null || target < start || target >= limit) {
        break;
      }
      // Loop/intra-body JP: continue from the jump target IF it would go
      // backwards (avoid revisiting). Otherwise continue linearly.
      if (target < instr.pc) {
        // backward loop — linear scan already covered it, just continue
        // from nextPc (which is already set)
      }
      // else: fall through naturally in the linear scan
    }
    // For all other terminates (conditional branches, CALL, DJNZ):
    // continue linear scan from fallthrough (already set to nextPc).
  }

  return instrs;
}

// Find the last address touched and compute byte span
function functionBounds(instrs) {
  if (instrs.length === 0) return { start: 0, end: 0, size: 0 };
  const start = instrs[0].pc;
  const last = instrs[instrs.length - 1];
  const end = last.nextPc - 1;
  return { start, end, size: end - start + 1 };
}

// --- instruction formatter ---

function fmtInstr(instr) {
  const { tag } = instr;

  switch (tag) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'ret': return 'RET';
    case 'retn': return 'RETN';
    case 'reti': return 'RETI';
    case 'exx': return 'EXX';
    case 'ex-af': return 'EX AF,AF\'';
    case 'ex-de-hl': return 'EX DE,HL';
    case 'ex-sp-hl': return 'EX (SP),HL';
    case 'ex-sp-pair': return `EX (SP),${instr.pair.toUpperCase()}`;
    case 'daa': return 'DAA';
    case 'cpl': return 'CPL';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'neg': return 'NEG';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rrd': return 'RRD';
    case 'rld': return 'RLD';
    case 'slp': return 'SLP';
    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'ld-mb-a': return 'LD MB,A';
    case 'ld-a-mb': return 'LD A,MB';
    case 'ld-sp-hl': return 'LD SP,HL';
    case 'ld-sp-pair': return `LD SP,${instr.pair.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${instr.dest.toUpperCase()},${instr.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${instr.dest.toUpperCase()},${hex(instr.value, 2)}`;
    case 'ld-reg-ind': return `LD ${instr.dest.toUpperCase()},(${instr.src.toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${instr.dest.toUpperCase()}),${instr.src.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (HL),${hex(instr.value, 2)}`;
    case 'ld-reg-mem': return `LD ${instr.dest.toUpperCase()},(${hex(instr.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(instr.addr)}),${instr.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${instr.pair.toUpperCase()},${hex(instr.value)}`;
    case 'ld-pair-mem': return `LD ${instr.pair.toUpperCase()},(${hex(instr.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(instr.addr)}),${instr.pair.toUpperCase()}`;
    case 'ld-pair-ind': return `LD ${instr.pair.toUpperCase()},(${instr.src.toUpperCase()})`;
    case 'ld-ind-pair': return `LD (${instr.dest.toUpperCase()}),${instr.pair.toUpperCase()}`;
    case 'ld-pair-indexed': return `LD ${instr.pair.toUpperCase()},(${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-indexed-pair': return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}),${instr.pair.toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${instr.dest.toUpperCase()},(${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-ixd-reg': return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}),${instr.src.toUpperCase()}`;
    case 'ld-ixd-imm': return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}),${hex(instr.value, 2)}`;
    case 'ld-ixiy-indexed': return `LD ${instr.dest.toUpperCase()},(${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'ld-indexed-ixiy': return `LD (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}),${instr.src.toUpperCase()}`;
    case 'ld-special': return `LD ${instr.dest.toUpperCase()},${instr.src.toUpperCase()}`;
    case 'push': return `PUSH ${instr.pair.toUpperCase()}`;
    case 'pop': return `POP ${instr.pair.toUpperCase()}`;
    case 'add-pair': return `ADD ${instr.dest.toUpperCase()},${instr.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL,${instr.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL,${instr.src.toUpperCase()}`;
    case 'inc-pair': return `INC ${instr.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${instr.pair.toUpperCase()}`;
    case 'inc-reg': return `INC ${instr.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${instr.reg.toUpperCase()}`;
    case 'inc-ixd': return `INC (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'dec-ixd': return `DEC (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'alu-reg': return `${instr.op.toUpperCase()} A,${instr.src.toUpperCase()}`;
    case 'alu-imm': return `${instr.op.toUpperCase()} A,${hex(instr.value, 2)}`;
    case 'alu-ixd': return `${instr.op.toUpperCase()} A,(${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'alu-reg': return `${instr.op.toUpperCase()} ${instr.src.toUpperCase()}`;
    case 'cp-imm': return `CP ${hex(instr.value, 2)}`;
    case 'call': return `CALL ${hex(instr.target)}`;
    case 'call-conditional': return `CALL ${instr.condition.toUpperCase()},${hex(instr.target)}`;
    case 'ret-conditional': return `RET ${instr.condition.toUpperCase()}`;
    case 'jp': return `JP ${hex(instr.target)}`;
    case 'jp-conditional': return `JP ${instr.condition.toUpperCase()},${hex(instr.target)}`;
    case 'jp-indirect': return `JP (${instr.indirectRegister.toUpperCase()})`;
    case 'jr': return `JR ${hex(instr.target)}`;
    case 'jr-conditional': return `JR ${instr.condition.toUpperCase()},${hex(instr.target)}`;
    case 'djnz': return `DJNZ ${hex(instr.target)}`;
    case 'rst': return `RST ${hex(instr.target, 2)}`;
    case 'in0': return `IN0 ${instr.reg.toUpperCase()},(${hex(instr.port, 2)})`;
    case 'out0': return `OUT0 (${hex(instr.port, 2)}),${instr.reg.toUpperCase()}`;
    case 'in-reg': return `IN ${instr.reg.toUpperCase()},(C)`;
    case 'out-reg': return `OUT (C),${instr.reg.toUpperCase()}`;
    case 'in-imm': return `IN A,(${hex(instr.port, 2)})`;
    case 'out-imm': return `OUT (${hex(instr.port, 2)}),A`;
    case 'ldi': return 'LDI';
    case 'ldd': return 'LDD';
    case 'ldir': return 'LDIR';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpd': return 'CPD';
    case 'cpir': return 'CPIR';
    case 'cpdr': return 'CPDR';
    case 'ini': return 'INI';
    case 'ind': return 'IND';
    case 'inir': return 'INIR';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'outd': return 'OUTD';
    case 'otir': return 'OTIR';
    case 'otdr': return 'OTDR';
    case 'otimr': return 'OTIMR';
    case 'mlt': return `MLT ${instr.reg.toUpperCase()}`;
    case 'tst-reg': return `TST A,${instr.reg.toUpperCase()}`;
    case 'tst-ind': return 'TST A,(HL)';
    case 'tst-imm': return `TST A,${hex(instr.value, 2)}`;
    case 'tstio': return `TSTIO ${hex(instr.value, 2)}`;
    case 'pea': return `PEA ${instr.base.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}`;
    case 'lea': return `LEA ${instr.dest.toUpperCase()},${instr.base.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement}`;
    case 'rotate-reg': return `${instr.op.toUpperCase()} ${instr.reg.toUpperCase()}`;
    case 'rotate-ind': return `${instr.op.toUpperCase()} (${instr.indirectRegister.toUpperCase()})`;
    case 'bit-test': return `BIT ${instr.bit},${instr.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${instr.bit},(${instr.indirectRegister.toUpperCase()})`;
    case 'bit-res': return `RES ${instr.bit},${instr.reg.toUpperCase()}`;
    case 'bit-res-ind': return `RES ${instr.bit},(${instr.indirectRegister.toUpperCase()})`;
    case 'bit-set': return `SET ${instr.bit},${instr.reg.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${instr.bit},(${instr.indirectRegister.toUpperCase()})`;
    case 'indexed-cb-bit': return `BIT ${instr.bit},(${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-res': return `RES ${instr.bit},(${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-set': return `SET ${instr.bit},(${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'indexed-cb-rotate': return `${instr.operation.toUpperCase()} (${instr.indexRegister.toUpperCase()}${instr.displacement >= 0 ? '+' : ''}${instr.displacement})`;
    case 'im': return `IM ${instr.value}`;
    default: return `[${tag}]`;
  }
}

// --- analysis helpers ---

function collectCalls(instrs) {
  return instrs
    .filter((i) => i.tag === 'call' || i.tag === 'call-conditional')
    .map((i) => i.target);
}

function collectJumps(instrs) {
  return instrs
    .filter((i) => (i.tag === 'jp' || i.tag === 'jp-conditional') && i.target != null)
    .map((i) => i.target);
}

function collectRamAccesses(instrs) {
  const addrs = new Set();
  for (const i of instrs) {
    if (i.addr != null && isRam(i.addr)) addrs.add(i.addr);
    // absolute memory references in operands
    if ('addr' in i && i.addr != null && isRam(i.addr)) addrs.add(i.addr);
    if ('target' in i && i.target != null && isRam(i.target)) addrs.add(i.target);
    if ('value' in i && i.value != null && isRam(i.value)) addrs.add(i.value);
  }
  return Array.from(addrs).sort((a, b) => a - b);
}

function collectPorts(instrs) {
  const ports = new Set();
  for (const i of instrs) {
    // IN0/OUT0 with immediate port number
    if ((i.tag === 'in0' || i.tag === 'out0') && i.port != null) {
      ports.add(i.port);
    }
    // IN A,(n) / OUT (n),A
    if ((i.tag === 'in-imm' || i.tag === 'out-imm') && i.port != null) {
      ports.add(i.port);
    }
    // IN r,(C) / OUT (C),r — port is in BC; we cannot determine statically
    // but note the instruction exists for the report
  }
  return Array.from(ports).sort((a, b) => a - b);
}

function hasIndirectPortIO(instrs) {
  return instrs.some((i) => i.tag === 'in-reg' || i.tag === 'out-reg');
}

function findTerminators(instrs) {
  return instrs
    .filter((i) => i.tag === 'ret' || i.tag === 'retn' || i.tag === 'reti')
    .map((i) => hex(i.pc));
}

// --- scan to find BC value before IN/OUT (C) ---
// Simple backward scan: look for LD BC,imm or LD C,imm just before port instruction
function inferBCPort(instrs, portInstrPc) {
  const idx = instrs.findIndex((i) => i.pc === portInstrPc);
  if (idx < 0) return null;
  for (let j = idx - 1; j >= Math.max(0, idx - 5); j--) {
    const i = instrs[j];
    if (i.tag === 'ld-pair-imm' && i.pair === 'bc') return i.value;
    if (i.tag === 'ld-reg-imm' && i.dest === 'c') return i.value; // low byte only
  }
  return null;
}

// --- print one function ---

function analyzeFunction(name, start, context) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`FUNCTION: ${name} @ ${hex(start)}`);
  console.log(`Context: ${context}`);
  console.log('='.repeat(72));

  let instrs;
  try {
    instrs = disassembleFunction(start, 3000);
  } catch (err) {
    console.log(`  ERROR during disassembly: ${err.message}`);
    return;
  }

  if (instrs.length === 0) {
    console.log('  No instructions decoded.');
    return;
  }

  const bounds = functionBounds(instrs);
  console.log(`Size:   ${bounds.size} bytes (${hex(bounds.start)} – ${hex(bounds.end)})`);
  console.log(`Instrs: ${instrs.length} decoded instructions`);

  const calls = collectCalls(instrs);
  const jumps = collectJumps(instrs);
  const ramRefs = collectRamAccesses(instrs);
  const immPorts = collectPorts(instrs);
  const hasIndPort = hasIndirectPortIO(instrs);
  const terminators = findTerminators(instrs);

  console.log('');
  console.log('--- Disassembly ---');
  for (const instr of instrs) {
    const bytes = bytesHex(instr.pc, instr.length);
    const text = fmtInstr(instr);
    const bcHint =
      (instr.tag === 'in-reg' || instr.tag === 'out-reg')
        ? inferBCPort(instrs, instr.pc)
        : null;
    const portComment = bcHint != null ? `  ; port 0x${bcHint.toString(16).toUpperCase()}` : '';
    console.log(`  ${hex(instr.pc)}  ${bytes.padEnd(20)}  ${text.padEnd(30)}${portComment}`);
  }

  console.log('');
  console.log('--- Summary ---');
  console.log(`  Terminators (RET/RETN/RETI): ${terminators.join(', ') || 'none found in window'}`);

  if (calls.length > 0) {
    const unique = [...new Set(calls)];
    console.log(`  CALL targets (${unique.length} unique):`);
    for (const t of unique) {
      const count = calls.filter((c) => c === t).length;
      console.log(`    ${hex(t)}  (called ${count}x)`);
    }
  } else {
    console.log('  CALL targets: none');
  }

  if (jumps.length > 0) {
    const outside = jumps.filter((t) => t < bounds.start || t > bounds.end);
    if (outside.length > 0) {
      console.log(`  External JP targets (tail calls):`);
      for (const t of outside) {
        console.log(`    ${hex(t)}`);
      }
    }
  }

  if (ramRefs.length > 0) {
    console.log(`  RAM references (D00000–D1FFFF):`);
    for (const r of ramRefs) {
      console.log(`    ${hex(r)}`);
    }
  } else {
    console.log('  RAM references: none detected in operands');
  }

  if (immPorts.length > 0) {
    console.log(`  Port I/O (immediate port):`);
    for (const p of immPorts) {
      console.log(`    port 0x${p.toString(16).toUpperCase().padStart(4, '0')}`);
    }
  }
  if (hasIndPort) {
    // Try to infer BC values
    const portInstrs = instrs.filter((i) => i.tag === 'in-reg' || i.tag === 'out-reg');
    console.log(`  Port I/O (BC-indirect, ${portInstrs.length} sites):`);
    for (const pi of portInstrs) {
      const bc = inferBCPort(instrs, pi.pc);
      const dir = pi.tag === 'in-reg' ? 'IN' : 'OUT';
      const portStr = bc != null ? `port 0x${bc.toString(16).toUpperCase().padStart(4, '0')}` : 'BC=unknown';
      console.log(`    ${hex(pi.pc)}  ${dir} (C),${pi.reg?.toUpperCase() ?? '?'}  ${portStr}`);
    }
  }
  if (immPorts.length === 0 && !hasIndPort) {
    console.log('  Port I/O: none');
  }

  console.log('');
}

// --- main ---

console.log('Phase 431 — USB Handler Call Target Disassembly');
console.log(`ROM: ${romPath} (${rom.length} bytes)`);

analyzeFunction(
  '0x00D681 — secondary descriptor/bootstrap stage',
  0x00D681,
  'Called in event 0x46 path (ready-gate), after 0x00DCB6 link-ready gate. Follow-up descriptor processing.',
);

analyzeFunction(
  '0x00D9EE — USB PHY configuration helper',
  0x00D9EE,
  'Called in event 0x41 path (controller/PHY arm) after setting port 0x3114 bit 0.',
);

analyzeFunction(
  '0x00B8BC — DI-wrapped timed recovery helper',
  0x00B8BC,
  'Called in event 0x47 path (DI-protected recovery) with arg 3000 (tick count).',
);

analyzeFunction(
  '0x0125EA — mode transition / status-submit helper',
  0x0125EA,
  'Called with (0x12,0xC0) in event 0xC0 path and (0x10,0xFF) in 0xC1/0xC2 path.',
);

analyzeFunction(
  '0x012933 — post-submit success follow-up',
  0x012933,
  'Called in event 0xC0 path after 0x0125EA on success.',
);

console.log('\nDone.');
