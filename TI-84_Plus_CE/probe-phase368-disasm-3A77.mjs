#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_RESET_TOP = 0xD1A87E;

function hex(v, w = 6) {
  return v == null ? 'n/a' : '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function hex8(v) { return '0x' + (v & 0xff).toString(16).padStart(2, '0'); }

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const { cpu } = executor;

console.log('=== Phase 368 — Disassemble 0x003A77-0x003A7B ===\n');

// =========================================================================
// Part 1: Static disassembly of ROM 0x003A60..0x003A90
// =========================================================================
console.log('--- Part 1: Static Disassembly (0x003A60 - 0x003A90) ---\n');

const START = 0x003A60;
const END   = 0x003AA0;  // extra room so last instruction doesn't overrun
const slice = romBytes.slice(START, END);

// Hex dump
const hexRows = [];
for (let i = 0; i < slice.length; i += 16) {
  const addr = START + i;
  const bytes = [];
  for (let j = 0; j < 16 && i + j < slice.length; j++) {
    bytes.push(slice[i + j].toString(16).padStart(2, '0'));
  }
  hexRows.push(`${hex(addr)}: ${bytes.join(' ')}`);
}
console.log('Hex dump:');
for (const row of hexRows) console.log(`  ${row}`);
console.log();

// eZ80 ADL-mode disassembly (manual decode of common instructions)
function disasmEz80Adl(buf, baseAddr) {
  const lines = [];
  let i = 0;

  function u8() { return i < buf.length ? buf[i++] : 0; }
  function u16() { const lo = u8(); return lo | (u8() << 8); }
  function u24() { const lo = u8(); const mid = u8(); return lo | (mid << 8) | (u8() << 16); }
  function s8() { const v = u8(); return v < 128 ? v : v - 256; }

  const r8names = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
  const r16names = ['bc', 'de', 'hl', 'sp'];
  const ccNames = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'];

  while (i < buf.length) {
    const pc = baseAddr + i;
    const startI = i;
    const op = u8();
    let mnemonic = '';

    // Prefixes for IX/IY
    let idxReg = null;
    let actualOp = op;
    if (op === 0xDD || op === 0xFD) {
      idxReg = op === 0xDD ? 'ix' : 'iy';
      actualOp = u8();
    }

    if (idxReg === null) {
      // Unprefixed instructions
      switch (op) {
        case 0x00: mnemonic = 'nop'; break;
        case 0x01: mnemonic = `ld bc, ${hex(u24())}`; break;
        case 0x02: mnemonic = 'ld (bc), a'; break;
        case 0x03: mnemonic = 'inc bc'; break;
        case 0x04: mnemonic = 'inc b'; break;
        case 0x05: mnemonic = 'dec b'; break;
        case 0x06: mnemonic = `ld b, ${hex8(u8())}`; break;
        case 0x07: mnemonic = 'rlca'; break;
        case 0x08: mnemonic = "ex af, af'"; break;
        case 0x09: mnemonic = 'add hl, bc'; break;
        case 0x0A: mnemonic = 'ld a, (bc)'; break;
        case 0x0B: mnemonic = 'dec bc'; break;
        case 0x0C: mnemonic = 'inc c'; break;
        case 0x0D: mnemonic = 'dec c'; break;
        case 0x0E: mnemonic = `ld c, ${hex8(u8())}`; break;
        case 0x0F: mnemonic = 'rrca'; break;
        case 0x10: { const d = s8(); mnemonic = `djnz ${hex(pc + 2 + d)}`; break; }
        case 0x11: mnemonic = `ld de, ${hex(u24())}`; break;
        case 0x12: mnemonic = 'ld (de), a'; break;
        case 0x13: mnemonic = 'inc de'; break;
        case 0x14: mnemonic = 'inc d'; break;
        case 0x15: mnemonic = 'dec d'; break;
        case 0x16: mnemonic = `ld d, ${hex8(u8())}`; break;
        case 0x17: mnemonic = 'rla'; break;
        case 0x18: { const d = s8(); mnemonic = `jr ${hex(pc + 2 + d)}`; break; }
        case 0x19: mnemonic = 'add hl, de'; break;
        case 0x1A: mnemonic = 'ld a, (de)'; break;
        case 0x1B: mnemonic = 'dec de'; break;
        case 0x1C: mnemonic = 'inc e'; break;
        case 0x1D: mnemonic = 'dec e'; break;
        case 0x1E: mnemonic = `ld e, ${hex8(u8())}`; break;
        case 0x1F: mnemonic = 'rra'; break;
        case 0x20: { const d = s8(); mnemonic = `jr nz, ${hex(pc + 2 + d)}`; break; }
        case 0x21: mnemonic = `ld hl, ${hex(u24())}`; break;
        case 0x22: mnemonic = `ld (${hex(u24())}), hl`; break;
        case 0x23: mnemonic = 'inc hl'; break;
        case 0x24: mnemonic = 'inc h'; break;
        case 0x25: mnemonic = 'dec h'; break;
        case 0x26: mnemonic = `ld h, ${hex8(u8())}`; break;
        case 0x27: mnemonic = 'daa'; break;
        case 0x28: { const d = s8(); mnemonic = `jr z, ${hex(pc + 2 + d)}`; break; }
        case 0x29: mnemonic = 'add hl, hl'; break;
        case 0x2A: mnemonic = `ld hl, (${hex(u24())})`; break;
        case 0x2B: mnemonic = 'dec hl'; break;
        case 0x2C: mnemonic = 'inc l'; break;
        case 0x2D: mnemonic = 'dec l'; break;
        case 0x2E: mnemonic = `ld l, ${hex8(u8())}`; break;
        case 0x2F: mnemonic = 'cpl'; break;
        case 0x30: { const d = s8(); mnemonic = `jr nc, ${hex(pc + 2 + d)}`; break; }
        case 0x31: mnemonic = `ld sp, ${hex(u24())}`; break;
        case 0x32: mnemonic = `ld (${hex(u24())}), a`; break;
        case 0x33: mnemonic = 'inc sp'; break;
        case 0x34: mnemonic = 'inc (hl)'; break;
        case 0x35: mnemonic = 'dec (hl)'; break;
        case 0x36: mnemonic = `ld (hl), ${hex8(u8())}`; break;
        case 0x37: mnemonic = 'scf'; break;
        case 0x38: { const d = s8(); mnemonic = `jr c, ${hex(pc + 2 + d)}`; break; }
        case 0x39: mnemonic = 'add hl, sp'; break;
        case 0x3A: mnemonic = `ld a, (${hex(u24())})`; break;
        case 0x3B: mnemonic = 'dec sp'; break;
        case 0x3C: mnemonic = 'inc a'; break;
        case 0x3D: mnemonic = 'dec a'; break;
        case 0x3E: mnemonic = `ld a, ${hex8(u8())}`; break;
        case 0x3F: mnemonic = 'ccf'; break;

        // LD r, r' block (0x40-0x7F except 0x76=HALT)
        default:
          if (op >= 0x40 && op <= 0x7F) {
            if (op === 0x76) {
              mnemonic = 'halt';
            } else {
              const dst = (op >> 3) & 7;
              const src = op & 7;
              mnemonic = `ld ${r8names[dst]}, ${r8names[src]}`;
            }
          } else if (op >= 0x80 && op <= 0xBF) {
            const aluOps = ['add a,', 'adc a,', 'sub', 'sbc a,', 'and', 'xor', 'or', 'cp'];
            const aluIdx = (op >> 3) & 7;
            const src = op & 7;
            mnemonic = `${aluOps[aluIdx]} ${r8names[src]}`;
          } else if (op >= 0xC0 && op <= 0xFF) {
            // Misc C0-FF
            switch (op) {
              case 0xC0: mnemonic = 'ret nz'; break;
              case 0xC1: mnemonic = 'pop bc'; break;
              case 0xC2: mnemonic = `jp nz, ${hex(u24())}`; break;
              case 0xC3: mnemonic = `jp ${hex(u24())}`; break;
              case 0xC4: mnemonic = `call nz, ${hex(u24())}`; break;
              case 0xC5: mnemonic = 'push bc'; break;
              case 0xC6: mnemonic = `add a, ${hex8(u8())}`; break;
              case 0xC7: mnemonic = 'rst 0x00'; break;
              case 0xC8: mnemonic = 'ret z'; break;
              case 0xC9: mnemonic = 'ret'; break;
              case 0xCA: mnemonic = `jp z, ${hex(u24())}`; break;
              case 0xCB: mnemonic = `[CB prefix at ${hex(pc)}]`; break;
              case 0xCC: mnemonic = `call z, ${hex(u24())}`; break;
              case 0xCD: mnemonic = `call ${hex(u24())}`; break;
              case 0xCE: mnemonic = `adc a, ${hex8(u8())}`; break;
              case 0xCF: mnemonic = 'rst 0x08'; break;
              case 0xD0: mnemonic = 'ret nc'; break;
              case 0xD1: mnemonic = 'pop de'; break;
              case 0xD2: mnemonic = `jp nc, ${hex(u24())}`; break;
              case 0xD3: mnemonic = `out (${hex8(u8())}), a`; break;
              case 0xD4: mnemonic = `call nc, ${hex(u24())}`; break;
              case 0xD5: mnemonic = 'push de'; break;
              case 0xD6: mnemonic = `sub ${hex8(u8())}`; break;
              case 0xD7: mnemonic = 'rst 0x10'; break;
              case 0xD8: mnemonic = 'ret c'; break;
              case 0xD9: mnemonic = 'exx'; break;
              case 0xDA: mnemonic = `jp c, ${hex(u24())}`; break;
              case 0xDB: mnemonic = `in a, (${hex8(u8())})`; break;
              case 0xDC: mnemonic = `call c, ${hex(u24())}`; break;
              case 0xDE: mnemonic = `sbc a, ${hex8(u8())}`; break;
              case 0xDF: mnemonic = 'rst 0x18'; break;
              case 0xE0: mnemonic = 'ret po'; break;
              case 0xE1: mnemonic = 'pop hl'; break;
              case 0xE2: mnemonic = `jp po, ${hex(u24())}`; break;
              case 0xE3: mnemonic = 'ex (sp), hl'; break;
              case 0xE4: mnemonic = `call po, ${hex(u24())}`; break;
              case 0xE5: mnemonic = 'push hl'; break;
              case 0xE6: mnemonic = `and ${hex8(u8())}`; break;
              case 0xE7: mnemonic = 'rst 0x20'; break;
              case 0xE8: mnemonic = 'ret pe'; break;
              case 0xE9: mnemonic = 'jp (hl)'; break;
              case 0xEA: mnemonic = `jp pe, ${hex(u24())}`; break;
              case 0xEB: mnemonic = 'ex de, hl'; break;
              case 0xEC: mnemonic = `call pe, ${hex(u24())}`; break;
              case 0xED: {
                const ed = u8();
                switch (ed) {
                  case 0x43: mnemonic = `ld (${hex(u24())}), bc`; break;
                  case 0x4B: mnemonic = `ld bc, (${hex(u24())})`; break;
                  case 0x53: mnemonic = `ld (${hex(u24())}), de`; break;
                  case 0x5B: mnemonic = `ld de, (${hex(u24())})`; break;
                  case 0x63: mnemonic = `ld (${hex(u24())}), hl [ED]`; break;
                  case 0x6B: mnemonic = `ld hl, (${hex(u24())}) [ED]`; break;
                  case 0x73: mnemonic = `ld (${hex(u24())}), sp`; break;
                  case 0x7B: mnemonic = `ld sp, (${hex(u24())})`; break;
                  case 0x44: mnemonic = 'neg'; break;
                  case 0x45: mnemonic = 'retn'; break;
                  case 0x46: mnemonic = 'im 0'; break;
                  case 0x47: mnemonic = 'ld i, a'; break;
                  case 0x4D: mnemonic = 'reti'; break;
                  case 0x4F: mnemonic = 'ld r, a'; break;
                  case 0x56: mnemonic = 'im 1'; break;
                  case 0x57: mnemonic = 'ld a, i'; break;
                  case 0x5E: mnemonic = 'im 2'; break;
                  case 0x5F: mnemonic = 'ld a, r'; break;
                  case 0xA0: mnemonic = 'ldi'; break;
                  case 0xA1: mnemonic = 'cpi'; break;
                  case 0xA8: mnemonic = 'ldd'; break;
                  case 0xB0: mnemonic = 'ldir'; break;
                  case 0xB1: mnemonic = 'cpir'; break;
                  case 0xB8: mnemonic = 'lddr'; break;
                  default: {
                    // IN r,(C) / OUT (C),r
                    if ((ed & 0xC7) === 0x40) {
                      const r = (ed >> 3) & 7;
                      mnemonic = `in ${r8names[r]}, (c)`;
                    } else if ((ed & 0xC7) === 0x41) {
                      const r = (ed >> 3) & 7;
                      mnemonic = `out (c), ${r8names[r]}`;
                    } else {
                      mnemonic = `[ED ${hex8(ed)}]`;
                    }
                  }
                }
                break;
              }
              case 0xEE: mnemonic = `xor ${hex8(u8())}`; break;
              case 0xEF: mnemonic = 'rst 0x28'; break;
              case 0xF0: mnemonic = 'ret p'; break;
              case 0xF1: mnemonic = 'pop af'; break;
              case 0xF2: mnemonic = `jp p, ${hex(u24())}`; break;
              case 0xF3: mnemonic = 'di'; break;
              case 0xF4: mnemonic = `call p, ${hex(u24())}`; break;
              case 0xF5: mnemonic = 'push af'; break;
              case 0xF6: mnemonic = `or ${hex8(u8())}`; break;
              case 0xF7: mnemonic = 'rst 0x30'; break;
              case 0xF8: mnemonic = 'ret m'; break;
              case 0xF9: mnemonic = 'ld sp, hl'; break;
              case 0xFA: mnemonic = `jp m, ${hex(u24())}`; break;
              case 0xFB: mnemonic = 'ei'; break;
              case 0xFC: mnemonic = `call m, ${hex(u24())}`; break;
              case 0xFE: mnemonic = `cp ${hex8(u8())}`; break;
              case 0xFF: mnemonic = 'rst 0x38'; break;
              default: mnemonic = `[unknown ${hex8(op)}]`; break;
            }
          } else {
            mnemonic = `[unknown ${hex8(op)}]`;
          }
          break;
      }
    } else {
      // DD/FD prefixed — decode IX/IY variants
      switch (actualOp) {
        case 0x21: mnemonic = `ld ${idxReg}, ${hex(u24())}`; break;
        case 0x22: mnemonic = `ld (${hex(u24())}), ${idxReg}`; break;
        case 0x23: mnemonic = `inc ${idxReg}`; break;
        case 0x2A: mnemonic = `ld ${idxReg}, (${hex(u24())})`; break;
        case 0x2B: mnemonic = `dec ${idxReg}`; break;
        case 0x34: { const d = s8(); mnemonic = `inc (${idxReg}+${d})`; break; }
        case 0x35: { const d = s8(); mnemonic = `dec (${idxReg}+${d})`; break; }
        case 0x36: { const d = s8(); const n = u8(); mnemonic = `ld (${idxReg}+${d}), ${hex8(n)}`; break; }
        case 0x46: { const d = s8(); mnemonic = `ld b, (${idxReg}+${d})`; break; }
        case 0x4E: { const d = s8(); mnemonic = `ld c, (${idxReg}+${d})`; break; }
        case 0x56: { const d = s8(); mnemonic = `ld d, (${idxReg}+${d})`; break; }
        case 0x5E: { const d = s8(); mnemonic = `ld e, (${idxReg}+${d})`; break; }
        case 0x66: { const d = s8(); mnemonic = `ld h, (${idxReg}+${d})`; break; }
        case 0x6E: { const d = s8(); mnemonic = `ld l, (${idxReg}+${d})`; break; }
        case 0x70: { const d = s8(); mnemonic = `ld (${idxReg}+${d}), b`; break; }
        case 0x71: { const d = s8(); mnemonic = `ld (${idxReg}+${d}), c`; break; }
        case 0x72: { const d = s8(); mnemonic = `ld (${idxReg}+${d}), d`; break; }
        case 0x73: { const d = s8(); mnemonic = `ld (${idxReg}+${d}), e`; break; }
        case 0x74: { const d = s8(); mnemonic = `ld (${idxReg}+${d}), h`; break; }
        case 0x75: { const d = s8(); mnemonic = `ld (${idxReg}+${d}), l`; break; }
        case 0x77: { const d = s8(); mnemonic = `ld (${idxReg}+${d}), a`; break; }
        case 0x7E: { const d = s8(); mnemonic = `ld a, (${idxReg}+${d})`; break; }
        case 0x86: { const d = s8(); mnemonic = `add a, (${idxReg}+${d})`; break; }
        case 0x8E: { const d = s8(); mnemonic = `adc a, (${idxReg}+${d})`; break; }
        case 0x96: { const d = s8(); mnemonic = `sub (${idxReg}+${d})`; break; }
        case 0x9E: { const d = s8(); mnemonic = `sbc a, (${idxReg}+${d})`; break; }
        case 0xA6: { const d = s8(); mnemonic = `and (${idxReg}+${d})`; break; }
        case 0xAE: { const d = s8(); mnemonic = `xor (${idxReg}+${d})`; break; }
        case 0xB6: { const d = s8(); mnemonic = `or (${idxReg}+${d})`; break; }
        case 0xBE: { const d = s8(); mnemonic = `cp (${idxReg}+${d})`; break; }
        case 0xE1: mnemonic = `pop ${idxReg}`; break;
        case 0xE3: mnemonic = `ex (sp), ${idxReg}`; break;
        case 0xE5: mnemonic = `push ${idxReg}`; break;
        case 0xE9: mnemonic = `jp (${idxReg})`; break;
        case 0xF9: mnemonic = `ld sp, ${idxReg}`; break;
        case 0x09: mnemonic = `add ${idxReg}, bc`; break;
        case 0x19: mnemonic = `add ${idxReg}, de`; break;
        case 0x29: mnemonic = `add ${idxReg}, ${idxReg}`; break;
        case 0x39: mnemonic = `add ${idxReg}, sp`; break;
        default: mnemonic = `[${idxReg} prefix + ${hex8(actualOp)}]`; break;
      }
    }

    const rawBytes = [];
    for (let j = startI; j < i; j++) rawBytes.push(buf[j].toString(16).padStart(2, '0'));

    lines.push({
      addr: pc,
      bytes: rawBytes.join(' '),
      mnemonic
    });
  }
  return lines;
}

const disasm = disasmEz80Adl(slice, START);
console.log('Disassembly (eZ80 ADL mode):');
for (const { addr, bytes, mnemonic } of disasm) {
  if (addr >= 0x003A90) break;  // stop after region of interest
  console.log(`  ${hex(addr)}: ${bytes.padEnd(16)} ${mnemonic}`);
}
console.log();

// =========================================================================
// Part 2: Dynamic block trace — cold boot then event loop with onBlock
// =========================================================================
console.log('--- Part 2: Dynamic Block Trace ---\n');

// Phase 1: Z80 cold boot
const r1 = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log(`Phase 1 (Z80 cold boot): steps=${r1.steps} term=${r1.termination}`);

cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Phase 2: Kernel init
const r2 = executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
console.log(`Phase 2 (Kernel init): steps=${r2.steps} term=${r2.termination}`);

cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Phase 3: Post-init
const r3 = executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
console.log(`Phase 3 (Post-init): steps=${r3.steps} term=${r3.termination}`);
console.log();

// Phase 4: Event loop with block tracing
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.f = 0x40;
cpu._ix = 0xD1A860;
cpu._iy = 0xD00080;
cpu.sp = STACK_RESET_TOP - 12;
mem.fill(0xFF, cpu.sp, cpu.sp + 12);

const TARGET_A = 0x003A77;
const TARGET_B = 0x003A7B;

// Tracking state
const recentBlocks = [];     // sliding window of recent block PCs
const visitCounts = {};       // pc -> count for targets
const firstEntryLogged = {};  // pc -> boolean
const followBlocks = {};      // pc -> array of blocks that follow
const followCountdown = {};   // pc -> how many more follow-blocks to capture
const MAX_FOLLOW = 5;
const MAX_RECENT = 6;         // 5 preceding + the current one

visitCounts[TARGET_A] = 0;
visitCounts[TARGET_B] = 0;
followBlocks[TARGET_A] = [];
followBlocks[TARGET_B] = [];

function cpuStateStr() {
  return [
    `PC=${hex(cpu._pc || cpu.pc)} SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`,
    `A=${hex8(cpu.a)} F=${hex8(cpu.f)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)}`,
    `MBASE=${hex8(cpu.mbase)} IFF1=${cpu.iff1} IFF2=${cpu.iff2} IM=${cpu.im}`
  ].join('\n    ');
}

const r4 = executor.runFrom(0x003A73, 'adl', {
  maxSteps: 50000,
  maxLoopIterations: 500,
  onBlock(pc, mode, meta, steps) {
    // Track follow-blocks for targets
    for (const tgt of [TARGET_A, TARGET_B]) {
      if (followCountdown[tgt] > 0) {
        followBlocks[tgt].push({ pc, step: steps });
        followCountdown[tgt]--;
      }
    }

    // Check if this is a target
    if (pc === TARGET_A || pc === TARGET_B) {
      visitCounts[pc]++;

      // Log first entry with preceding blocks and CPU state
      if (!firstEntryLogged[pc]) {
        firstEntryLogged[pc] = true;
        console.log(`\n** First entry to ${hex(pc)} at step ${steps} **`);
        console.log(`  Preceding 5 blocks: ${recentBlocks.slice(-5).map(b => hex(b.pc)).join(' -> ')}`);
        console.log(`  CPU state:\n    ${cpuStateStr()}`);
      }

      // Start capturing follow-blocks (only on first few visits to keep output manageable)
      if (visitCounts[pc] <= 3) {
        followCountdown[pc] = MAX_FOLLOW;
      }
    }

    // Maintain sliding window
    recentBlocks.push({ pc, step: steps });
    if (recentBlocks.length > MAX_RECENT) recentBlocks.shift();
  }
});

console.log(`\nPhase 4 (50K event loop): steps=${r4.steps} term=${r4.termination} lastPc=${hex(r4.lastPc)}`);

console.log(`\nTarget block visit counts:`);
console.log(`  ${hex(TARGET_A)}: ${visitCounts[TARGET_A]} visits`);
console.log(`  ${hex(TARGET_B)}: ${visitCounts[TARGET_B]} visits`);

for (const tgt of [TARGET_A, TARGET_B]) {
  if (followBlocks[tgt].length > 0) {
    console.log(`\n  Blocks following ${hex(tgt)} (first few visits):`);
    for (const fb of followBlocks[tgt]) {
      console.log(`    -> ${hex(fb.pc)} (step ${fb.step})`);
    }
  }
}

// =========================================================================
// Part 3: RAM context after event loop
// =========================================================================
console.log('\n--- Part 3: RAM Context ---\n');

const KEY_EVENT_BUFFER = 0xD0058E;
const KB_FLAGS = 0xD00587;

console.log(`KEY_EVENT_BUFFER (0xD0058E): ${hex8(mem[KEY_EVENT_BUFFER])}`);
console.log(`Keyboard flags   (0xD00587): ${hex8(mem[KB_FLAGS])}`);

// IY-relative offsets (IY = 0xD00080)
const IY = 0xD00080;
console.log(`\nIY-relative memory (IY = ${hex(IY)}):`);
const iyOffsets = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x08, 0x09, 0x0C, 0x0D, 0x0E,
                   0x10, 0x12, 0x14, 0x18, 0x1C, 0x20, 0x24, 0x28, 0x30, 0x38, 0x40];
for (const off of iyOffsets) {
  const addr = IY + off;
  const val = mem[addr];
  console.log(`  (IY+${off.toString(16).padStart(2, '0')}) = ${hex(addr)}: ${hex8(val)}`);
}

// Extra: a few bytes around KEY_EVENT_BUFFER
console.log(`\nMemory around KEY_EVENT_BUFFER (0xD00580..0xD00598):`);
const kbStart = 0xD00580;
for (let row = 0; row < 2; row++) {
  const addr = kbStart + row * 12;
  const bytes = [];
  for (let j = 0; j < 12; j++) bytes.push(mem[addr + j].toString(16).padStart(2, '0'));
  console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
}

console.log(`\nFinal CPU state:\n    ${cpuStateStr()}`);
console.log(`\nDone.`);
