// probe-phase554-decode-07B75F.mjs
// Decodes ROM function at 0x07B75F: 4bpp row/nibble calculator
// Called from 0x0A1A9D framebuffer-address computation in 4bpp mode.
//
// Run via watchdog:
//   node scripts/run-probe.mjs --max-time 60 TI-84_Plus_CE/probe-phase554-decode-07B75F.mjs

import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const rom = readFileSync(ROM_PATH);

// ── helpers ──────────────────────────────────────────────────────────────────

function rb(offset)  { return rom[offset]; }
function w24(offset) { return rom[offset] | (rom[offset+1] << 8) | (rom[offset+2] << 16); }
function w16(offset) { return rom[offset] | (rom[offset+1] << 8); }
function hex(v, pad = 2) { return v.toString(16).toUpperCase().padStart(pad, '0'); }
function addr(v)     { return '0x' + hex(v, 6); }

// ── hex dump ─────────────────────────────────────────────────────────────────

const FN_START = 0x07B75F;
const FN_END   = 0x07B800;   // RET at 0x07B7FF + 1
const DUMP_LEN = FN_END - FN_START;

console.log('=== HEX DUMP: ' + addr(FN_START) + ' – ' + addr(FN_END - 1) + ' ===');
for (let i = 0; i < DUMP_LEN; i++) {
  if (i % 16 === 0) process.stdout.write('\n' + addr(FN_START + i) + ':  ');
  process.stdout.write(hex(rb(FN_START + i)) + ' ');
}
console.log('\n');

// ── disassembler ──────────────────────────────────────────────────────────────
// eZ80 ADL mode (24-bit registers/addresses).
// SIS prefix (0x40) forces one instruction into 16-bit IS mode;
// the 16-bit address is extended by the MB register (0xD0 for RAM segment).

function disassemble(startOff, byteCount) {
  const lines = [];
  let i = startOff;
  const end = startOff + byteCount;

  // helper: format signed 8-bit branch displacement as target address
  const jrTarget = (raw) => {
    const d = raw > 127 ? raw - 256 : raw;
    return addr(i + 2 + d) + '  (d=' + d + ')';
  };

  while (i < end) {
    const pc = i;
    const op = rb(i);
    let dis  = '???';
    let len  = 1;

    switch (op) {
      // ── stack ──
      case 0xC5: dis = 'PUSH BC';  break;
      case 0xD5: dis = 'PUSH DE';  break;
      case 0xE5: dis = 'PUSH HL';  break;
      case 0xF5: dis = 'PUSH AF';  break;
      case 0xC1: dis = 'POP BC';   break;
      case 0xD1: dis = 'POP DE';   break;
      case 0xE1: dis = 'POP HL';   break;
      case 0xF1: dis = 'POP AF';   break;

      // ── returns ──
      case 0xC9: dis = 'RET';      break;
      case 0xC0: dis = 'RET NZ';   break;
      case 0xC8: dis = 'RET Z';    break;
      case 0xD8: dis = 'RET C';    break;
      case 0xD0: dis = 'RET NC';   break;

      // ── 8-bit register loads ──
      case 0x47: dis = 'LD B,A';   break;
      case 0x4F: dis = 'LD C,A';   break;
      case 0x78: dis = 'LD A,B';   break;
      case 0x79: dis = 'LD A,C';   break;
      case 0x6F: dis = 'LD L,A';   break;
      case 0x7E: dis = 'LD A,(HL)'; break;
      case 0x77: dis = 'LD (HL),A'; break;

      // ── 8-bit immediate loads ──
      case 0x3E: dis = 'LD A,0x' + hex(rb(i+1));  len = 2; break;
      case 0x26: dis = 'LD H,0x' + hex(rb(i+1));  len = 2; break;

      // ── 8-bit memory loads ──
      case 0x3A: dis = 'LD A,(' + addr(w24(i+1)) + ')';  len = 4; break;
      case 0x32: dis = 'LD (' + addr(w24(i+1)) + '),A';  len = 4; break;

      // ── 24-bit immediate loads ──
      case 0x21: dis = 'LD HL,' + addr(w24(i+1));        len = 4; break;
      case 0x11: dis = 'LD DE,' + addr(w24(i+1));        len = 4; break;
      case 0x01: dis = 'LD BC,' + addr(w24(i+1));        len = 4; break;

      // ── 24-bit memory loads/stores ──
      case 0x2A: dis = 'LD HL,(' + addr(w24(i+1)) + ')'; len = 4; break;
      case 0x22: dis = 'LD (' + addr(w24(i+1)) + '),HL'; len = 4; break;

      // ── arithmetic ──
      case 0x91: dis = 'SUB C';    break;
      case 0x3D: dis = 'DEC A';    break;
      case 0x87: dis = 'ADD A,A';  break;
      case 0x07: dis = 'RLCA';     break;
      case 0x09: dis = 'ADD HL,BC'; break;
      case 0x19: dis = 'ADD HL,DE'; break;
      case 0x29: dis = 'ADD HL,HL'; break;
      case 0xFE: dis = 'CP 0x' + hex(rb(i+1));            len = 2; break;
      case 0xBD: dis = 'CP L';     break;

      // ── logic ──
      case 0xAF: dis = 'XOR A';    break;
      case 0xA9: dis = 'XOR C';    break;
      case 0xB7: dis = 'OR A';     break;
      case 0xB0: dis = 'OR B';     break;
      case 0xB1: dis = 'OR C';     break;

      // ── misc ──
      case 0x37: dis = 'SCF';      break;
      case 0xEB: dis = 'EX DE,HL'; break;

      // ── branches ──
      case 0x18: dis = 'JR '    + jrTarget(rb(i+1));      len = 2; break;
      case 0x20: dis = 'JR NZ,' + jrTarget(rb(i+1));      len = 2; break;
      case 0x28: dis = 'JR Z,'  + jrTarget(rb(i+1));      len = 2; break;
      case 0x38: dis = 'JR C,'  + jrTarget(rb(i+1));      len = 2; break;
      case 0x30: dis = 'JR NC,' + jrTarget(rb(i+1));      len = 2; break;
      case 0xCA: dis = 'JP Z,'  + addr(w24(i+1));          len = 4; break;
      case 0xC3: dis = 'JP '    + addr(w24(i+1));          len = 4; break;
      case 0xCD: dis = 'CALL '  + addr(w24(i+1));          len = 4; break;

      // ── CB prefix (bit ops / shifts) ──
      case 0xCB: {
        const op2 = rb(i+1);
        len = 2;
        if      (op2 === 0x43) dis = 'BIT 0,E';
        else if (op2 === 0x3A) dis = 'SRL D';
        else if (op2 === 0x1B) dis = 'RR E';
        else if (op2 === 0x79) dis = 'BIT 7,C';
        else if (op2 === 0x27) dis = 'SLA A';
        else                   dis = 'CB ' + hex(op2);
        break;
      }

      // ── ED prefix ──
      case 0xED: {
        const op2 = rb(i+1);
        len = 2;
        if      (op2 === 0x6C) dis = 'MLT HL          ; H×L → HL (unsigned 8×8→16)';
        else if (op2 === 0x52) dis = 'SBC HL,DE';
        else                   dis = 'ED ' + hex(op2);
        break;
      }

      // ── FD prefix (IY) ──
      case 0xFD: {
        const op2 = rb(i+1);
        if (op2 === 0xCB) {
          // FDCB d opcode (4-byte encoding)
          const rawD = rb(i+2);
          const d    = rawD > 127 ? rawD - 256 : rawD;
          const op3  = rb(i+3);
          const iy   = 'IY' + (d >= 0 ? '+' : '') + d;
          len = 4;
          if      (op3 === 0x56) dis = 'BIT 2,(' + iy + ')';
          else if (op3 === 0x4E) dis = 'BIT 1,(' + iy + ')';
          else if (op3 === 0x5E) dis = 'BIT 3,(' + iy + ')';
          else if (op3 === 0x46) dis = 'BIT 0,(' + iy + ')';
          else                   dis = 'FDCB ' + hex(rawD) + ' ' + hex(op3);
        } else {
          dis = 'FD ' + hex(op2);
          len = 2;
        }
        break;
      }

      // ── SIS prefix (0x40) ──
      // Forces the following instruction into 16-bit IS mode (legacy Z80 mode).
      // In TI eZ80, the MB register = 0xD0 for the RAM segment, so a 16-bit address nn
      // becomes the full 24-bit address 0xD0_0000 | nn.
      case 0x40: {
        const op2 = rb(i+1);
        if (op2 === 0x2A) {
          const nn     = w16(i+2);
          const full24 = 0xD00000 | nn;
          dis = 'SIS LD HL,(0x' + hex(nn, 4) + ')' +
                '  ; full addr ' + addr(full24) + '  [16-bit IS mode, MB=0xD0]';
          len = 4;
        } else {
          dis = 'SIS + ' + hex(op2);
          len = 2;
        }
        break;
      }

      default:
        dis = '?? ' + hex(op);
    }

    // format raw bytes column
    let raw = '';
    for (let j = 0; j < len; j++) raw += hex(rb(i+j)) + ' ';

    lines.push({ pc, raw: raw.trimEnd().padEnd(14), dis });
    i += len;

    // stop after the terminal RET at the end of this cluster
    if (op === 0xC9 && pc === 0x07B7FF) break;
  }
  return lines;
}

const insns = disassemble(FN_START, DUMP_LEN);

// ── per-line annotations ──────────────────────────────────────────────────────

const notes = {
  // ── ENTRY A: row→byte-offset calculator ──────────────────────────────────
  0x07B75F: '; [ENTRY A] PUSH BC, PUSH DE  — preserve inputs',
  0x07B761: '; test IY+0x2B bit2 = 4bpp mode flag (0=8bpp, 1=4bpp)',
  0x07B765: '; 4bpp: jump to 4bpp path at 07B78B',
  0x07B767: '; 8bpp PATH: A = D014FE  (display row count / height param)',
  0x07B76B: '; A -= C  (C = input row; subtract from max)',
  0x07B76C: '; A--  (convert to 0-indexed from top)',
  0x07B76D: '; L = A  (row index, y-flipped)',
  0x07B76E: '; H = 0x85 (133) — default 8bpp bytes/row stride divisor',
  0x07B770: '; test IY+0x14 bit1 = alternate stride/large-font flag',
  0x07B774: '; if clear, keep H=0x85',
  0x07B776: '; H = 0x5D (93) — alternate stride',
  0x07B778: '; [SHARED TAIL] MLT HL: HL = H × L  (stride × row index → row byte offset)',
  0x07B77A: '; BIT 0,E — test x-column even/odd (selects high vs low nibble)',
  0x07B77C: '; PUSH AF — save nibble flag (Z=even x → high nibble)',
  0x07B77D: '; SRL D — shift D right, carry ← D bit0',
  0x07B77F: '; RR E  — DE >>= 1  (x column → byte offset; 2 pixels per byte)',
  0x07B781: '; HL += DE  (add x byte offset to row offset)',
  0x07B782: '; POP AF  (restore nibble Z flag)',
  0x07B783: '; POP DE, POP BC  (restore caller registers)',
  0x07B785: '; A = 0x0F  (low-nibble mask: odd x column)',
  0x07B787: '; RET NZ — Z=0 means odd x → nibble in bits[3:0], A=0x0F',
  0x07B788: '; A = 0xF0  (high-nibble mask: even x column)',
  0x07B78A: '; RET — even x → nibble in bits[7:4], A=0xF0',

  // ── 4bpp alternate path ───────────────────────────────────────────────────
  0x07B78B: '; 4bpp PATH: A = 0xEF (239)',
  0x07B78D: '; A -= C  (239 - row; 240-row display, y-flip)',
  0x07B78E: '; L = A',
  0x07B78F: '; H = 0xA0 (160) — 4bpp bytes/row (320px / 2)',
  0x07B791: '; JR back to shared MLT HL tail at 07B778',

  // ── ENTRY B: bounds-check / clip guard ───────────────────────────────────
  0x07B793: '; [ENTRY B] PUSH AF, PUSH HL  — bounds check entry (callers: 07B518 CALL, 02110D JP)',
  0x07B795: '; test IY+0x2B bit2 = 4bpp mode',
  0x07B799: '; 4bpp: jump to LD HL,0x000140 path at 07B7B6',
  0x07B79B: '; 8bpp: SIS LD HL,(D01501)  — display width (16-bit, MB=0xD0)',
  0x07B79F: '; OR A  — clear carry',
  0x07B7A0: '; SBC HL,DE  — test if DE (x) >= display width',
  0x07B7A2: '; JR C → out-of-bounds (x too large)',
  0x07B7A4: '; SIS LD HL,(D014FE)  — display height/row count (16-bit)',
  0x07B7A8: '; A=C (row), CP L  — test row < height',
  0x07B7AA: '; JR NC → out-of-bounds (row >= height)',
  0x07B7AC: '; POP HL, POP AF, OR A (carry clear), RET  — in-bounds',
  0x07B7B0: '; POP HL, POP AF, SCF, RET  — out-of-bounds (carry set)',
  // 4bpp clip path entry (fall-through from JR NZ at 07B799)
  0x07B7B4: '; (4bpp bounds fall-through from PUSH AF/PUSH HL at 07B793)',
  0x07B7B6: '; 4bpp: HL = 0x000140 (320 = display width)',
  0x07B7BA: '; EX DE,HL  — DE=width into HL, HL into DE',
  0x07B7BB: '; CALL 0x04C979  — character width clip util (carry set if overflow)',
  0x07B7BF: '; EX DE,HL',
  0x07B7C0: '; JR NC → out-of-bounds',
  0x07B7C2: '; CP 0xF0  — row must be < 240',
  0x07B7C5: '; JR NC → out-of-bounds',
  0x07B7C7: '; → in-bounds: POP HL, POP AF, OR A, RET',

  // ── ENTRY C: write nibble value = 0 ──────────────────────────────────────
  0x07B7C9: '; [ENTRY C] XOR A  — pixel value = 0; fall into ENTRY D (caller: 07B5FF)',
  0x07B7CA: '; JR → skip "LD C,A" at 07B7CC',

  // ── ENTRY D: write nibble (general) ──────────────────────────────────────
  0x07B7CC: '; [ENTRY D] LD C,A  — C = pixel nibble value (callers: 07B653, 07B663, 07B6A3, 07B6B3)',
  0x07B7CD: '; A = (D02A60)  — read current x coordinate',
  0x07B7D1: '; B = A  (save x)',
  0x07B7D2: '; DE = 0xD09466  — 4bpp framebuffer base (normal buffer)',
  0x07B7D6: '; test IY+0x3C bit3 = alternate buffer select',
  0x07B7DA: '; Z=1 → use default D09466',
  0x07B7DC: '; DE = 0xD0EA1F  — alternate 4bpp buffer',
  0x07B7E0: '; HL += DE  — apply framebuffer base to row offset → final pixel byte addr',
  0x07B7E1: '; A = B  (restore x)',
  0x07B7E2: '; BIT 7,C  — C bit7=1 means nibble goes in high position (mask was 0xF0)',
  0x07B7E4: '; Z=1 (bit7 clear) → low nibble, skip 4× SLA A',
  0x07B7E8: '; SLA A  (×4) — shift pixel value into bits[7:4]',
  0x07B7F0: '; B = A  (positioned nibble bits)',
  0x07B7F1: '; A = (HL)  — read existing packed byte',
  0x07B7F2: '; OR C   — set nibble mask bits (1s where nibble lives)',
  0x07B7F3: '; XOR C  — clear those bits (nibble field now 0)',
  0x07B7F4: '; OR B   — write new nibble value into cleared field',
  0x07B7F5: '; LD (HL),A  — store merged byte back',
  0x07B7F6: '; LD (D02A8D),HL  — save last-written pixel address for caller',
  0x07B7FA: '; A = C',
  0x07B7FB: '; LD (D02A90),A  — save nibble mask byte (0x0F or 0xF0)',
  0x07B7FF: '; RET',
};

// ── print disassembly ─────────────────────────────────────────────────────────

console.log('=== DISASSEMBLY: ' + addr(FN_START) + ' ===\n');
for (const { pc, raw, dis } of insns) {
  const note = notes[pc] ? '  ' + notes[pc] : '';
  console.log(addr(pc) + ':  ' + raw + '  ' + dis + note);
}

// ── byte-level verification ───────────────────────────────────────────────────

// Spot-check key known bytes against actual ROM content.
const checks = [
  { off: 0x07B75F, expect: 0xC5, label: 'PUSH BC (entry)' },
  { off: 0x07B761, expect: 0xFD, label: 'FD prefix (BIT 2,(IY+43))' },
  { off: 0x07B778, expect: 0xED, label: 'ED prefix (MLT HL)' },
  { off: 0x07B779, expect: 0x6C, label: 'MLT HL opcode byte 2' },
  { off: 0x07B78A, expect: 0xC9, label: 'RET (8bpp path end)' },
  { off: 0x07B7D2, expect: 0x11, label: 'LD DE,0xD09466' },
  { off: 0x07B7F5, expect: 0x77, label: 'LD (HL),A (pixel write)' },
  { off: 0x07B7FF, expect: 0xC9, label: 'RET (final)' },
];

console.log('\n=== BYTE VERIFICATION ===\n');
let allPass = true;
for (const { off, expect, label } of checks) {
  const got  = rb(off);
  const pass = got === expect;
  if (!pass) allPass = false;
  console.log(
    (pass ? 'PASS' : 'FAIL') + '  ' + addr(off) +
    '  expected 0x' + hex(expect) + '  got 0x' + hex(got) +
    '  (' + label + ')'
  );
}
console.log('\nAll checks ' + (allPass ? 'PASSED' : 'FAILED'));

// ── summary ───────────────────────────────────────────────────────────────────

console.log(`
=== FUNCTION SUMMARY: 0x07B75F ===

Size:      ~161 bytes (0x07B75F – 0x07B7FF)
Callers:   0x0A1B4D CALL (framebuffer coord converter 0x0A1A9D)
           0x06E7A7 CALL
           0x021111 JP

4 logical entry points share tail code:

─────────────────────────────────────────────────────────────────
ENTRY A  0x07B75F  ROW → BYTE-OFFSET CALCULATOR
─────────────────────────────────────────────────────────────────
Inputs:
  C        = row number (y, bottom-origin, raw from caller)
  DE       = x column (in pixels; DE>>1 = byte offset)
  IY+0x2B bit2 = 0 → 8bpp mode; 1 → 4bpp mode
  IY+0x14 bit1 = 0 → H=0x85 (133) stride; 1 → H=0x5D (93) stride

Algorithm (8bpp path):
  A  = D014FE − C − 1    (y-flip: top-of-screen = largest offset)
  L  = A, H = stride
  MLT HL → HL = stride × row      (row byte offset)
  BIT 0,E → save even/odd x to Z flag
  DE >>= 1                         (pixel column → byte column)
  HL += DE                         (add x byte offset)

Algorithm (4bpp path):
  A  = 0xEF − C    (239 − row; 240-pixel-tall display)
  L  = A, H = 0xA0 (160 = 320px/2 = bytes per 4bpp row)
  → joins shared MLT HL tail above

Outputs:
  HL = byte offset from framebuffer base
  A  = nibble mask: 0x0F (odd x, low nibble) or 0xF0 (even x, high nibble)
  BC, DE restored

Caller at 0x0A1B4D follows with:
  LD DE,0xD09466 ; ADD HL,DE → final framebuffer address

─────────────────────────────────────────────────────────────────
ENTRY B  0x07B793  BOUNDS CHECK / CLIP GUARD
─────────────────────────────────────────────────────────────────
Callers:  0x07B518 CALL, 0x02110D JP
Inputs:   C = row, DE = x column, IY flags
8bpp:     x < (D01501) AND row < (D014FE)
4bpp:     CALL 0x04C979 width clip AND row < 0xF0 (240)
Outputs:  carry CLEAR = in-bounds; carry SET = clipped/out-of-bounds

─────────────────────────────────────────────────────────────────
ENTRY C  0x07B7C9  WRITE NIBBLE VALUE = 0
─────────────────────────────────────────────────────────────────
Caller:   0x07B5FF CALL
Action:   XOR A (A=0) then fall into ENTRY D

─────────────────────────────────────────────────────────────────
ENTRY D  0x07B7CC  WRITE NIBBLE (general)
─────────────────────────────────────────────────────────────────
Callers:  0x07B653, 0x07B663, 0x07B6A3, 0x07B6B3 (4× CALL)
Inputs:
  A  = 4-bit pixel value (0–15)
  HL = row byte-offset (from ENTRY A)
  (D02A60) = current x coordinate
  IY+0x3C bit3 = 0 → normal buffer D09466; 1 → alternate D0EA1F

Algorithm:
  Select buffer base by IY+0x3C bit3
  HL += base → pixel byte address
  If nibble in high position (C bit7=1): A <<= 4 via 4× SLA A
  Merge into existing byte: (HL) = ((HL) | C) ^ C | A
     ↑ clears nibble field then writes new value
  LD (D02A8D),HL   → save pixel address for caller
  LD (D02A90),A    → save nibble mask for caller

─────────────────────────────────────────────────────────────────
RAM ADDRESSES TOUCHED
─────────────────────────────────────────────────────────────────
  D014FE   display row count / height sentinel  (8bpp y-flip base)
  D01501   display width (16-bit, read via SIS LD HL)
  D09466   4bpp framebuffer base — normal buffer
  D0EA1F   4bpp framebuffer base — alternate buffer (IY+0x3C bit3)
  D02A60   current x coordinate
  D02A8D   last-written pixel byte address (output)
  D02A90   last-written nibble mask byte (output)

─────────────────────────────────────────────────────────────────
IY FLAGS USED
─────────────────────────────────────────────────────────────────
  IY+0x2B bit2   4bpp mode select (0=8bpp, 1=4bpp)
  IY+0x14 bit1   alternate row stride (133 vs 93 rows)
  IY+0x3C bit3   alternate framebuffer select

─────────────────────────────────────────────────────────────────
SUB-CALL
─────────────────────────────────────────────────────────────────
  0x04C979   character width clipping utility
             (★★★★ from session 552: SBC HL,DE carry=overflow, 7B)
`);
