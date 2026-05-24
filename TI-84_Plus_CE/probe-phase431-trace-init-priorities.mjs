#!/usr/bin/env node
// Phase 431 - Decode init priority functions P2/P4/P5/P6
// Targets: 0x008BE9 (P2), 0x008F16 (P4), 0x008FC3 (P5), 0x00904C (P6)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

// Known helper addresses
const FRAME_SETUP   = 0x002197;  // common prologue: save IX, set up frame
const CASE_DISPATCH = 0x00211B;  // sparse case dispatcher (session 430)
const ALT_DISPATCH  = 0x002623;  // alternate dispatcher variant
const DESCRIPTOR_INIT = 0x00883C; // descriptor init wrapper (0x00CC71 equivalent)
const LINK_READY    = 0x006EB6;  // link-ready gate (port 0x3031 handshake)

// RAM ranges
const RAM_LO = 0xD00000;
const RAM_HI = 0xD1FFFF;

function isRam(addr) {
  return addr >= RAM_LO && addr <= RAM_HI;
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readU24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function readS8(addr) {
  const b = rom[addr];
  return b >= 0x80 ? b - 0x100 : b;
}

function bytesFor(addr, length) {
  return Array.from(rom.slice(addr, addr + length))
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

// Minimal eZ80 ADL-mode decoder covering opcodes found in these functions
function decodeAt(addr) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];
  const b3 = rom[addr + 3];

  // DD prefix — IX operations
  if (b0 === 0xDD) {
    if (b1 === 0x36) {
      const disp = readS8(addr + 2);
      const imm  = rom[addr + 3];
      return { addr, len: 4, bytes: bytesFor(addr, 4), text: `LD (IX${disp<0?disp:'+'+disp}),${hex(imm,2)}`, tag: 'ld-ixd-imm', disp, imm };
    }
    if (b1 === 0x77) {
      const disp = readS8(addr + 2);
      return { addr, len: 3, bytes: bytesFor(addr, 3), text: `LD (IX${disp<0?disp:'+'+disp}),A`, tag: 'ld-ixd-a', disp };
    }
    if (b1 === 0x7E) {
      const disp = readS8(addr + 2);
      return { addr, len: 3, bytes: bytesFor(addr, 3), text: `LD A,(IX${disp<0?disp:'+'+disp})`, tag: 'ld-a-ixd', disp };
    }
    if (b1 === 0x0F) {
      const disp = readS8(addr + 2);
      return { addr, len: 3, bytes: bytesFor(addr, 3), text: `LD C,(IX${disp<0?disp:'+'+disp})`, tag: 'ld-c-ixd', disp };
    }
    if (b1 === 0xF9) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'LD SP,IX', tag: 'ld-sp-ix' };
    }
    if (b1 === 0xE1) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'POP IX', tag: 'pop-ix' };
    }
    if (b1 === 0xE5) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'PUSH IX', tag: 'push-ix' };
    }
    if (b1 === 0x21) {
      const imm = readU24(addr + 2);
      return { addr, len: 5, bytes: bytesFor(addr, 5), text: `LD IX,${hex(imm)}`, tag: 'ld-ix-imm', imm };
    }
    if (b1 === 0x09) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'ADD IX,BC', tag: 'add-ix-bc' };
    }
    if (b1 === 0x19) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'ADD IX,DE', tag: 'add-ix-de' };
    }
  }

  // FD prefix — IY operations
  if (b0 === 0xFD) {
    if (b1 === 0xE1) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'POP IY', tag: 'pop-iy' };
    }
    if (b1 === 0xE5) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'PUSH IY', tag: 'push-iy' };
    }
    if (b1 === 0x7E) {
      const disp = readS8(addr + 2);
      return { addr, len: 3, bytes: bytesFor(addr, 3), text: `LD A,(IY${disp<0?disp:'+'+disp})`, tag: 'ld-a-iyd', disp };
    }
  }

  // ED prefix — extended opcodes
  if (b0 === 0xED) {
    if (b1 === 0x78) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'IN A,(C)', tag: 'in-a-c' };
    }
    if (b1 === 0x79) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'OUT (C),A', tag: 'out-c-a' };
    }
    if (b1 === 0x42) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'SBC HL,BC', tag: 'sbc-hl-bc' };
    }
    if (b1 === 0x52) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'SBC HL,DE', tag: 'sbc-hl-de' };
    }
    if (b1 === 0x62) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'SBC HL,HL', tag: 'sbc-hl-hl' };
    }
    if (b1 === 0x12) {
      const size = rom[addr + 2];
      return { addr, len: 3, bytes: bytesFor(addr, 3), text: `(frame alloc ${size}b)`, tag: 'frame-alloc', size };
    }
    if (b1 === 0x33) {
      const size = rom[addr + 2];
      return { addr, len: 3, bytes: bytesFor(addr, 3), text: `(frame alloc ${size}b)`, tag: 'frame-alloc', size };
    }
    if (b1 === 0x57) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: 'LD A,I', tag: 'ld-a-i' };
    }
    if (b1 === 0x38) {
      const size = rom[addr + 2];
      return { addr, len: 3, bytes: bytesFor(addr, 3), text: `(alloc ${size}b stack)`, tag: 'frame-alloc', size };
    }
    if (b1 === 0x39) {
      const size = rom[addr + 2];
      return { addr, len: 3, bytes: bytesFor(addr, 3), text: `(dealloc ${size}b stack)`, tag: 'frame-dealloc', size };
    }
  }

  // CALL nn
  if (b0 === 0xCD) {
    const target = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `CALL ${hex(target)}`, tag: 'call', target };
  }

  // JP nn
  if (b0 === 0xC3) {
    const target = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `JP ${hex(target)}`, tag: 'jp', target };
  }

  // JP cc,nn
  if ((b0 & 0xC7) === 0xC2) {
    const target = readU24(addr + 1);
    const conditions = ['NZ','Z','NC','C','PO','PE','P','M'];
    const cond = conditions[(b0 >> 3) & 7];
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `JP ${cond},${hex(target)}`, tag: 'jp-cond', target, cond };
  }

  // JR e (0x18)
  if (b0 === 0x18) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFFFF;
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `JR ${hex(target)}`, tag: 'jr', target, offset };
  }

  // JR cc,e
  if (b0 === 0x20) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFFFF;
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `JR NZ,${hex(target)}`, tag: 'jr-nz', target };
  }
  if (b0 === 0x28) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFFFF;
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `JR Z,${hex(target)}`, tag: 'jr-z', target };
  }
  if (b0 === 0x38) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFFFF;
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `JR C,${hex(target)}`, tag: 'jr-c', target };
  }
  if (b0 === 0x30) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFFFF;
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `JR NC,${hex(target)}`, tag: 'jr-nc', target };
  }

  // RET
  if (b0 === 0xC9) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'RET', tag: 'ret' };
  }

  // RET cc
  if ((b0 & 0xC7) === 0xC0) {
    const conditions = ['NZ','Z','NC','C','PO','PE','P','M'];
    const cond = conditions[(b0 >> 3) & 7];
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `RET ${cond}`, tag: 'ret-cond', cond };
  }

  // CALL cc,nn
  if ((b0 & 0xC7) === 0xC4) {
    const target = readU24(addr + 1);
    const conditions = ['NZ','Z','NC','C','PO','PE','P','M'];
    const cond = conditions[(b0 >> 3) & 7];
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `CALL ${cond},${hex(target)}`, tag: 'call-cond', target, cond };
  }

  // PUSH rr
  if ((b0 & 0xCF) === 0xC5) {
    const pairs = ['BC','DE','HL','AF'];
    const pair = pairs[(b0 >> 4) & 3];
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `PUSH ${pair}`, tag: 'push', pair };
  }

  // POP rr
  if ((b0 & 0xCF) === 0xC1) {
    const pairs = ['BC','DE','HL','AF'];
    const pair = pairs[(b0 >> 4) & 3];
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `POP ${pair}`, tag: 'pop', pair };
  }

  // LD rr,nn (0x01/0x11/0x21/0x31)
  if (b0 === 0x01) {
    const imm = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `LD BC,${hex(imm)}`, tag: 'ld-bc-imm', imm };
  }
  if (b0 === 0x11) {
    const imm = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `LD DE,${hex(imm)}`, tag: 'ld-de-imm', imm };
  }
  if (b0 === 0x21) {
    const imm = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `LD HL,${hex(imm)}`, tag: 'ld-hl-imm', imm };
  }
  if (b0 === 0x31) {
    const imm = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `LD SP,${hex(imm)}`, tag: 'ld-sp-imm', imm };
  }

  // LD A,(nn) — 3A nn nn nn
  if (b0 === 0x3A) {
    const ramAddr = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `LD A,(${hex(ramAddr)})`, tag: 'ld-a-mem', ramAddr };
  }

  // LD (nn),A — 32 nn nn nn
  if (b0 === 0x32) {
    const ramAddr = readU24(addr + 1);
    return { addr, len: 4, bytes: bytesFor(addr, 4), text: `LD (${hex(ramAddr)}),A`, tag: 'ld-mem-a', ramAddr };
  }

  // LD A,n
  if (b0 === 0x3E) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `LD A,${hex(b1,2)}`, tag: 'ld-a-imm', imm: b1 };
  }

  // LD r,r group (0x40-0x7F except 0x76=HALT)
  const regs8 = ['B','C','D','E','H','L','(HL)','A'];
  if (b0 >= 0x40 && b0 <= 0x7F && b0 !== 0x76) {
    const dst = regs8[(b0 >> 3) & 7];
    const src = regs8[b0 & 7];
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `LD ${dst},${src}`, tag: 'ld-r-r' };
  }

  // XOR A (0xAF)
  if (b0 === 0xAF) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'XOR A', tag: 'xor-a' };
  }

  // OR A (0xB7) — test A for zero
  if (b0 === 0xB7) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'OR A', tag: 'or-a' };
  }

  // CP n
  if (b0 === 0xFE) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `CP ${hex(b1,2)}`, tag: 'cp-imm', imm: b1 };
  }

  // INC/DEC r
  if ((b0 & 0xC7) === 0x04) {
    const r = regs8[(b0 >> 3) & 7];
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `INC ${r}`, tag: 'inc-r' };
  }
  if ((b0 & 0xC7) === 0x05) {
    const r = regs8[(b0 >> 3) & 7];
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `DEC ${r}`, tag: 'dec-r' };
  }

  // INC/DEC rr
  if ((b0 & 0xCF) === 0x03) {
    const pairs = ['BC','DE','HL','SP'];
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `INC ${pairs[(b0>>4)&3]}`, tag: 'inc-rr' };
  }
  if ((b0 & 0xCF) === 0x0B) {
    const pairs = ['BC','DE','HL','SP'];
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `DEC ${pairs[(b0>>4)&3]}`, tag: 'dec-rr' };
  }

  // ADD HL,rr
  if ((b0 & 0xCF) === 0x09) {
    const pairs = ['BC','DE','HL','SP'];
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `ADD HL,${pairs[(b0>>4)&3]}`, tag: 'add-hl-rr' };
  }

  // EX DE,HL
  if (b0 === 0xEB) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'EX DE,HL', tag: 'ex-de-hl' };
  }

  // EX (SP),HL
  if (b0 === 0xE3) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'EX (SP),HL', tag: 'ex-sp-hl' };
  }

  // AND/OR/XOR/CP r with immediate patterns
  if (b0 === 0xE6) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `AND ${hex(b1,2)}`, tag: 'and-imm', imm: b1 };
  }
  if (b0 === 0xF6) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `OR ${hex(b1,2)}`, tag: 'or-imm', imm: b1 };
  }
  if (b0 === 0xEE) {
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `XOR ${hex(b1,2)}`, tag: 'xor-imm', imm: b1 };
  }

  // NOP
  if (b0 === 0x00) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'NOP', tag: 'nop' };
  }

  // CB prefix — bit operations
  if (b0 === 0xCB) {
    const group = (b1 >> 6) & 3;
    const bit   = (b1 >> 3) & 7;
    const reg   = regs8[b1 & 7];
    const rotOps = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
    if (group === 0) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: `${rotOps[bit]} ${reg}`, tag: 'cb-rotate' };
    }
    if (group === 1) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: `BIT ${bit},${reg}`, tag: 'bit-test', bit, reg };
    }
    if (group === 2) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: `RES ${bit},${reg}`, tag: 'bit-res', bit, reg };
    }
    if (group === 3) {
      return { addr, len: 2, bytes: bytesFor(addr, 2), text: `SET ${bit},${reg}`, tag: 'bit-set', bit, reg };
    }
  }

  // DI / EI
  if (b0 === 0xF3) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'DI', tag: 'di' };
  }
  if (b0 === 0xFB) {
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: 'EI', tag: 'ei' };
  }

  // DJNZ
  if (b0 === 0x10) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xFFFFFF;
    return { addr, len: 2, bytes: bytesFor(addr, 2), text: `DJNZ ${hex(target)}`, tag: 'djnz', target };
  }

  // RST
  if ((b0 & 0xC7) === 0xC7) {
    const vec = b0 & 0x38;
    return { addr, len: 1, bytes: bytesFor(addr, 1), text: `RST ${hex(vec,2)}`, tag: 'rst', vec };
  }

  // Fallback: emit raw byte
  return { addr, len: 1, bytes: bytesFor(addr, 1), text: `DB ${hex(b0,2)}`, tag: 'unknown', raw: b0 };
}

// Disassemble a function until RET (handles simple linear flow only)
function disassembleFunction(start, maxBytes = 600) {
  const instructions = [];
  let addr = start;
  const end = start + maxBytes;

  while (addr < end) {
    let instr;
    try {
      instr = decodeAt(addr);
    } catch (e) {
      instr = { addr, len: 1, bytes: bytesFor(addr, 1), text: `?? ${e.message}`, tag: 'error' };
    }
    instructions.push(instr);
    addr += instr.len;
    if (instr.tag === 'ret') break;
  }

  return instructions;
}

// Collect analysis from a disassembled function
function analyze(instrs, startAddr) {
  const calls    = [];
  const jumps    = [];
  const ramReads = [];
  const ramWrites = [];
  const portIns  = [];
  const portOuts = [];

  // Track register state to identify port addresses (BC before IN/OUT)
  let lastBC = null;

  for (let i = 0; i < instrs.length; i++) {
    const ins = instrs[i];

    if (ins.tag === 'ld-bc-imm') {
      lastBC = ins.imm;
    } else if (ins.tag === 'call' || ins.tag === 'call-cond') {
      calls.push({ addr: ins.addr, target: ins.target });
      lastBC = null;
    } else if (ins.tag === 'jp' || ins.tag === 'jp-cond' || ins.tag === 'jr' || ins.tag === 'jr-z' || ins.tag === 'jr-nz' || ins.tag === 'jr-c' || ins.tag === 'jr-nc') {
      jumps.push({ addr: ins.addr, target: ins.target, kind: ins.tag });
    } else if (ins.tag === 'ld-a-mem') {
      if (isRam(ins.ramAddr)) ramReads.push({ addr: ins.addr, ramAddr: ins.ramAddr });
    } else if (ins.tag === 'ld-mem-a') {
      if (isRam(ins.ramAddr)) ramWrites.push({ addr: ins.addr, ramAddr: ins.ramAddr });
    } else if (ins.tag === 'in-a-c') {
      portIns.push({ addr: ins.addr, port: lastBC });
    } else if (ins.tag === 'out-c-a') {
      portOuts.push({ addr: ins.addr, port: lastBC });
    }
  }

  const endInstr  = instrs[instrs.length - 1];
  const size      = endInstr.addr - startAddr + endInstr.len;
  const uniqueCallTargets = [...new Set(calls.map(c => c.target))];

  return { calls, uniqueCallTargets, jumps, ramReads, ramWrites, portIns, portOuts, size, endAddr: endInstr.addr };
}

// Named helpers for annotation
const KNOWN_HELPERS = new Map([
  [0x002197, 'frame-setup (save IX, alloc frame)'],
  [0x00211B, 'sparse-case-dispatcher (N×4-byte table: count+cases+handlers)'],
  [0x002623, 'alt-case-dispatcher (variant)'],
  [0x00883C, 'descriptor-init-wrapper (initialise interface descriptor)'],
  [0x006EB6, 'link-ready-gate (port 0x3031 handshake)'],
  [0x00CC71, 'descriptor-builder (USB standard request parser)'],
  [0x00883C, 'interface-init (calls descriptor-builder internally)'],
  [0x006E1E, 'E9 dispatcher variant'],
  [0x00D9EE, 'D9EE dispatcher'],
  [0x00DA8C, 'DA8C dispatcher'],
  [0x00884F, 'send-helper'],
  [0x014FA0, 'USB packet handler'],
  [0x014F01, 'port-config helper'],
  [0x004E81, '4E81 helper'],
  [0x008527, '8527 helper'],
  [0x00854E, '854E helper'],
  [0x004581, 'set-mode/state helper'],
  [0x006EAF, '6EAF link helper'],
]);

function describeTarget(target) {
  return KNOWN_HELPERS.get(target) || '';
}

function printFunction(label, start, maxBytes = 600) {
  const out = [];
  const instrs = disassembleFunction(start, maxBytes);
  const info   = analyze(instrs, start);

  out.push(`\n${'='.repeat(70)}`);
  out.push(`FUNCTION ${label}: ${hex(start)}`);
  out.push(`${'='.repeat(70)}`);
  out.push(`Size: ${info.size} bytes  (end: ${hex(info.endAddr)})`);
  out.push('');

  out.push('--- DISASSEMBLY ---');
  for (const ins of instrs) {
    const note = describeTarget(ins.target);
    const suffix = note ? `  ; ${note}` : '';
    out.push(`  ${hex(ins.addr)}  ${ins.bytes.padEnd(18)}  ${ins.text}${suffix}`);
  }
  out.push('');

  out.push('--- CALL TARGETS ---');
  if (info.uniqueCallTargets.length === 0) {
    out.push('  (none)');
  } else {
    for (const t of info.uniqueCallTargets) {
      const note = describeTarget(t);
      out.push(`  ${hex(t)}${note ? '  — ' + note : ''}`);
    }
  }
  out.push('');

  out.push('--- RAM ACCESSES ---');
  if (info.ramReads.length === 0 && info.ramWrites.length === 0) {
    out.push('  (none direct)');
  }
  for (const r of info.ramReads) {
    out.push(`  READ  ${hex(r.ramAddr)}  at ${hex(r.addr)}`);
  }
  for (const w of info.ramWrites) {
    out.push(`  WRITE ${hex(w.ramAddr)}  at ${hex(w.addr)}`);
  }
  out.push('');

  out.push('--- PORT I/O ---');
  if (info.portIns.length === 0 && info.portOuts.length === 0) {
    out.push('  (none in function body — see callee analysis)');
  }
  for (const p of info.portIns) {
    const portStr = p.port !== null ? hex(p.port) : '(dynamic)';
    out.push(`  IN  A,(C)  port=${portStr}  at ${hex(p.addr)}`);
  }
  for (const p of info.portOuts) {
    const portStr = p.port !== null ? hex(p.port) : '(dynamic)';
    out.push(`  OUT (C),A  port=${portStr}  at ${hex(p.addr)}`);
  }

  return out.join('\n');
}

// ── run ──────────────────────────────────────────────────────────────────────

const out = [];
out.push('Phase 431 - Decode Init Priorities P2/P4/P5/P6');
out.push(`ROM: ${romPath}`);
out.push(`Date: ${new Date().toISOString()}`);
out.push('');
out.push('Priority chain entry point: 0x009118');
out.push('  P1: 0x0089F8  (USB init — fully decoded)');
out.push('  P2: 0x008BE9  <-- this probe');
out.push('  P3: 0x008DA0  (Link init — known)');
out.push('  P4: 0x008F16  <-- this probe');
out.push('  P5: 0x008FC3  <-- this probe');
out.push('  P6: 0x00904C  <-- this probe');
out.push('  P7: 0x009087  (unconditional fallback)');

out.push(printFunction('P2', 0x008BE9, 450));
out.push(printFunction('P4', 0x008F16, 200));
out.push(printFunction('P5', 0x008FC3, 200));
out.push(printFunction('P6', 0x00904C, 100));

// Cross-reference: which known functions are called by multiple priorities?
out.push('\n' + '='.repeat(70));
out.push('CROSS-REFERENCE SUMMARY');
out.push('='.repeat(70));
const allFuncs = [
  { label: 'P2', start: 0x008BE9, maxBytes: 450 },
  { label: 'P4', start: 0x008F16, maxBytes: 200 },
  { label: 'P5', start: 0x008FC3, maxBytes: 200 },
  { label: 'P6', start: 0x00904C, maxBytes: 100 },
];
const callMap = new Map();
for (const f of allFuncs) {
  const instrs = disassembleFunction(f.start, f.maxBytes);
  const info   = analyze(instrs, f.start);
  for (const t of info.uniqueCallTargets) {
    if (!callMap.has(t)) callMap.set(t, []);
    callMap.get(t).push(f.label);
  }
}
for (const [target, callers] of [...callMap.entries()].sort((a, b) => a[0] - b[0])) {
  const note = describeTarget(target);
  out.push(`  ${hex(target)}  called by [${callers.join(', ')}]${note ? '  — ' + note : ''}`);
}

console.log(out.join('\n'));
