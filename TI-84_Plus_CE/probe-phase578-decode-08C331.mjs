/**
 * probe-phase578-decode-08C331.mjs
 *
 * Decode 0x08C331 — event loop return/preamble.
 * Session 577 decoded 0x08C33D (128B event loop cleanup) which exits via
 * JP 0x08C331. This probe determines what 0x08C331 does — is it the
 * event loop top?
 *
 * ============================================================
 * RESULTS — 0x08C331 IS THE EVENT LOOP TOP
 * ============================================================
 *
 * Function boundaries: 0x08C331 - 0x08C3BC (140 bytes, 40 instructions)
 *   Terminates with JP 0x08C331 (self-loop back to top)
 *
 * Structure: This IS the main event loop iteration body.
 *   0x08C331: RES 5,(IY+0x14) — clear flag, then fall through
 *   0x08C335: CALL 0x05C634   — subsystem call #1
 *   0x08C339: CALL 0x06CE73   — subsystem call #2
 *   0x08C33D: CALL 0x0A349A   — event loop cleanup (decoded in session 577)
 *   0x08C341: CALL 0x05C75B   — subsystem call #3
 *   0x08C345-0x08C36A: IY flag housekeeping (RES 7 IY+08, BIT/RES 5 IY+1F, etc.)
 *   0x08C349: BIT 5,(IY+0x1F) — branch: if set, load D0058C context; if clear, zero it
 *   0x08C372: BIT 0,(IY+0x02) — major branch: text-mode vs graph-mode path
 *     Text path (0x02 bit 0 set):
 *       RES 2,(IY+0x0C), BIT 3,(IY+0x0C) -> CALL Z 0x06F7E4 (font render)
 *     Graph path (0x02 bit 0 clear):
 *       BIT 5,(IY+0x0D) -> similar font render gate
 *   0x08C3A0: SET 0,(IY+0x4A) — mark something active
 *   0x08C3A4: CALL 0x05C634   — subsystem call again
 *   0x08C3A8: CALL 0x0A27DD   — KEY INPUT CHECK (returns A = key code or 0)
 *   0x08C3AC: OR A / JR NZ,0x08C3C3 — if key pressed, exit loop to key handler
 *   0x08C3AF: BIT 0,(IY+0x0D) / JR NZ,0x08C3BD — if flag set, exit to handler
 *   0x08C3B5: RES 4,(IY+0x09) — clear flag
 *   0x08C3B9: JP 0x08C331     — LOOP BACK TO TOP (no key, no flag = idle iteration)
 *
 * Exit paths (when key pressed or flag set):
 *   0x08C3BD: LD A,0x05 / JP 0x08C509 — flag-triggered exit
 *   0x08C3C3: CP 0xB4 / key dispatch cascade — key-triggered exit
 *     Compares key against 0xB4, 0x3F, 0x28, 0x29, 0x58, 0x7F, 0xFE, 0xFC, 0xFA
 *     Routes to various handlers; many paths JP back to 0x08C331
 *
 * CALL targets (7 unique):
 *   0x05C634 — called twice (loop preamble + pre-key-check)
 *   0x06CE73 — subsystem init
 *   0x0A349A — event loop cleanup (session 577)
 *   0x05C75B — subsystem call
 *   0x02FCB3 — context clear helper
 *   0x06F7E4 — font render (conditional, called from both branches)
 *   0x0A27DD — key input check (returns key in A, 0 = no key)
 *
 * IY flag operations (15 total):
 *   RES 5,(IY+0x14), RES 7,(IY+0x08), BIT/RES 5,(IY+0x1F),
 *   RES 7,(IY+0x16), RES 1,(IY+0x1D), BIT 0,(IY+0x02),
 *   RES 2,(IY+0x0C) x2, BIT 3,(IY+0x0C) x2,
 *   BIT 5,(IY+0x0D), SET 0,(IY+0x4A), BIT 0,(IY+0x0D),
 *   RES 4,(IY+0x09)
 *
 * RAM references (D0058C, D0058E):
 *   D0058C — read 3x, write 2x (context save/restore variable)
 *   D0058E — write 1x (zeroed alongside D0058C)
 *
 * External references TO 0x08C331 (4 total):
 *   0x020150: JP 0x08C331  — OS init/reset entry into event loop
 *   0x08C3B9: JP 0x08C331  — self-loop (idle iteration)
 *   0x08C3DF: JP NZ,0x08C331 — key dispatch re-entry
 *   0x08C449: JP 0x08C331  — key handler completion re-entry
 *
 * Role: MAIN EVENT LOOP TOP — the core idle loop of the TI-84 Plus CE OS.
 *   Each iteration: clears flags, calls 4 subsystems (including session 577's
 *   cleanup at 0x0A349A), checks for key input via 0x0A27DD, and either
 *   loops back (no input) or dispatches to key handlers. The loop is entered
 *   from OS init at 0x020150 and re-entered after key handlers complete.
 *
 * Run: node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase578-decode-08C331.mjs
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const START = 0x08C331;
const MAX_INSNS = 80;

// -- helpers (copied from working probe-phase577) --

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function bytesHex(start, len) {
  const out = [];
  for (let i = 0; i < len; i++) out.push(rom[start + i].toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function formatInsn(r) {
  if (r.tag === 'indexed-cb-set') return 'SET ' + r.bit + ',(IY+' + hex(r.displacement, 2) + ')';
  if (r.tag === 'indexed-cb-res') return 'RES ' + r.bit + ',(IY+' + hex(r.displacement, 2) + ')';
  if (r.tag === 'indexed-cb-bit') return 'BIT ' + r.bit + ',(IY+' + hex(r.displacement, 2) + ')';
  if (r.tag === 'ret') return 'RET';
  if (r.tag === 'ret-conditional') return 'RET ' + r.condition.toUpperCase();
  if (r.tag === 'call') return 'CALL ' + hex(r.target);
  if (r.tag === 'call-conditional') return 'CALL ' + r.condition.toUpperCase() + ',' + hex(r.target);
  if (r.tag === 'jp') return r.condition ? 'JP ' + r.condition.toUpperCase() + ',' + hex(r.target) : 'JP ' + hex(r.target);
  if (r.tag === 'jr') return r.condition ? 'JR ' + r.condition.toUpperCase() + ',' + hex(r.target) : 'JR ' + hex(r.target);
  if (r.tag === 'jr-conditional') return 'JR ' + r.condition.toUpperCase() + ',' + hex(r.target);
  if (r.tag === 'ld-reg-mem') {
    const pfx = r.modePrefix ? '.' + r.modePrefix.toUpperCase() + ' ' : '';
    return pfx + 'LD ' + r.dest.toUpperCase() + ',(' + hex(r.addr) + ')';
  }
  if (r.tag === 'ld-mem-reg') {
    const pfx = r.modePrefix ? '.' + r.modePrefix.toUpperCase() + ' ' : '';
    return pfx + 'LD (' + hex(r.addr) + '),' + r.src.toUpperCase();
  }
  if (r.tag === 'ld-pair-mem') {
    const pfx = r.modePrefix ? '.' + r.modePrefix.toUpperCase() + ' ' : '';
    if (r.direction === 'to-mem') return pfx + 'LD (' + hex(r.addr) + '),' + r.pair.toUpperCase();
    return pfx + 'LD ' + r.pair.toUpperCase() + ',(' + hex(r.addr) + ')';
  }
  if (r.tag === 'ld-pair-imm') return 'LD ' + r.pair.toUpperCase() + ',' + hex(r.value);
  if (r.tag === 'ld-reg-imm') return 'LD ' + r.dest.toUpperCase() + ',0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  if (r.tag === 'ld-reg-reg') return 'LD ' + r.dest.toUpperCase() + ',' + r.src.toUpperCase();
  if (r.tag === 'alu-imm') return r.op.toUpperCase() + ' 0x' + r.value.toString(16).toUpperCase().padStart(2, '0');
  if (r.tag === 'alu-reg') return r.op.toUpperCase() + ' ' + r.src.toUpperCase();
  if (r.tag === 'push') return 'PUSH ' + r.pair.toUpperCase();
  if (r.tag === 'pop') return 'POP ' + r.pair.toUpperCase();
  if (r.tag === 'ex-de-hl') return 'EX DE,HL';
  if (r.tag === 'inc-pair') return 'INC ' + r.pair.toUpperCase();
  if (r.tag === 'dec-pair') return 'DEC ' + r.pair.toUpperCase();
  if (r.tag === 'inc-reg') return 'INC ' + (r.reg || r.dest || '?').toUpperCase();
  if (r.tag === 'dec-reg') return 'DEC ' + (r.reg || r.dest || '?').toUpperCase();
  if (r.tag === 'nop') return 'NOP';
  if (r.tag === 'di') return 'DI';
  if (r.tag === 'ei') return 'EI';
  if (r.tag === 'halt') return 'HALT';
  if (r.tag === 'rst') return 'RST ' + hex(r.target, 2);
  if (r.tag === 'ldir') return 'LDIR';
  if (r.tag === 'lddr') return 'LDDR';
  if (r.tag === 'djnz') return 'DJNZ ' + hex(r.target);
  if (r.tag === 'or-reg') return 'OR ' + r.src.toUpperCase();
  if (r.tag === 'and-reg') return 'AND ' + r.src.toUpperCase();
  if (r.tag === 'xor-reg') return 'XOR ' + r.src.toUpperCase();
  if (r.tag === 'cp-reg') return 'CP ' + r.src.toUpperCase();
  if (r.tag === 'cp-imm') return 'CP 0x' + r.value.toString(16).toUpperCase().padStart(2, '0');

  // fallback: show tag + all fields
  const extras = Object.entries(r)
    .filter(function(e) { return !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates'].includes(e[0]); })
    .map(function(e) { return e[0] + '=' + e[1]; })
    .join(' ');
  return '[' + r.tag + '] ' + extras;
}

// -- 1. Disassemble from 0x08C331 --

console.log('=== phase578: Decode 0x08C331 — Event Loop Return/Preamble ===');
console.log('Start: ' + hex(START) + '\n');

const instructions = [];
let pc = START;
for (let i = 0; i < MAX_INSNS && pc < rom.length; i++) {
  const r = decodeInstruction(rom, pc, 'adl');
  if (!r || !r.length) {
    console.log('  ' + hex(pc) + '  ' + bytesHex(pc, 1).padEnd(20) + '  ??? (decode fail)');
    pc++;
    continue;
  }
  instructions.push({
    address: pc,
    bytes: bytesHex(pc, r.length),
    mnemonic: formatInsn(r),
    decoded: r,
  });
  pc = r.nextPc;

  // Stop at unconditional terminator (RET or unconditional JP)
  if (r.tag === 'ret' || r.tag === 'halt' || (r.tag === 'jp' && !r.condition)) {
    break;
  }
}

// -- 2. Print instruction listing --

console.log('=== Instruction Listing ===\n');
console.log('Address   Raw bytes             Mnemonic');
console.log('--------  --------------------  --------');

for (const item of instructions) {
  const marker =
    item.address === START ? ' <<<< START' :
    item.address === 0x08C33D ? ' <<<< 0x08C33D (session 577 cleanup block)' :
    '';
  console.log('  ' + hex(item.address) + '  ' + item.bytes.padEnd(20) + '  ' + item.mnemonic + marker);
}

const blockEnd = instructions.length > 0
  ? instructions[instructions.length - 1].address + instructions[instructions.length - 1].decoded.length
  : START;
console.log('\n  Block size: ' + (blockEnd - START) + ' bytes (' + instructions.length + ' instructions)');

// -- 3. If block was short (just a JP back to itself or similar), decode further context --

if (instructions.length < 5) {
  console.log('\n=== Extended Context: Decode 0x08C300 - 0x08C400 ===\n');
  let epc = 0x08C300;
  while (epc < 0x08C400) {
    const r = decodeInstruction(rom, epc, 'adl');
    if (!r || !r.length) {
      console.log('  ' + hex(epc) + '  ' + bytesHex(epc, 1).padEnd(20) + '  ???');
      epc++;
      continue;
    }
    const mark =
      epc === START ? ' <<<< 0x08C331' :
      epc === 0x08C33D ? ' <<<< 0x08C33D' :
      '';
    console.log('  ' + hex(epc) + '  ' + bytesHex(epc, r.length).padEnd(20) + '  ' + formatInsn(r) + mark);
    epc = r.nextPc;
  }
}

// -- 4. CALL/JP/JR targets --

console.log('\n=== CALL/JP/JR Targets ===\n');

const targets = [];
for (const item of instructions) {
  const r = item.decoded;
  if (r.tag === 'call' || r.tag === 'call-conditional') {
    targets.push({ from: item.address, text: item.mnemonic, type: 'CALL' });
  }
  if (r.tag === 'jp') {
    targets.push({ from: item.address, text: item.mnemonic, type: 'JP' });
  }
  if (r.tag === 'jr' || r.tag === 'jr-conditional') {
    targets.push({ from: item.address, text: item.mnemonic, type: 'JR' });
  }
}
for (const t of targets) {
  console.log('  ' + hex(t.from) + ': ' + t.text);
}
if (!targets.length) console.log('  (none)');

// -- 5. RAM references (D0xxxx) --

console.log('\n=== RAM References (D0xxxx) ===\n');

let ramCount = 0;
for (const item of instructions) {
  const r = item.decoded;
  const addr = r.addr;
  if (addr !== undefined && addr >= 0xD00000 && addr <= 0xDFFFFF) {
    const access = r.tag.includes('mem-reg') ? 'WRITE' :
      (r.tag.includes('reg-mem') || r.tag.includes('pair-mem')) ? 'READ' : 'REF';
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic + '  [' + access + ']');
    ramCount++;
  }
}
if (!ramCount) console.log('  (none)');

// -- 6. IY flag operations --

console.log('\n=== IY Flag Operations ===\n');

let iyCount = 0;
for (const item of instructions) {
  const r = item.decoded;
  if (r.tag && r.tag.startsWith('indexed-cb-')) {
    console.log('  ' + hex(item.address) + ': ' + item.mnemonic);
    iyCount++;
  }
}
if (!iyCount) console.log('  (none)');

// -- 7. Scan ROM for references TO 0x08C331 --
// In eZ80 ADL mode, CALL nn = CD ll mm hh, JP nn = C3 ll mm hh
// 0x08C331 in little-endian = 31 C3 08
// CALL 0x08C331 = CD 31 C3 08
// JP 0x08C331   = C3 31 C3 08
// JP cc,0x08C331 = various: C2/CA/D2/DA/E2/EA/F2/FA + 31 C3 08

console.log('\n=== References TO 0x08C331 ===\n');

const addrBytes = [0x31, 0xC3, 0x08]; // little-endian 0x08C331
const callJpOpcodes = [
  0xCD,                             // CALL nn
  0xC3,                             // JP nn
  0xC2, 0xCA, 0xD2, 0xDA,          // JP cc,nn (NZ, Z, NC, C)
  0xE2, 0xEA, 0xF2, 0xFA,          // JP cc,nn (PO, PE, P, M)
  0xC4, 0xCC, 0xD4, 0xDC,          // CALL cc,nn (NZ, Z, NC, C)
  0xE4, 0xEC, 0xF4, 0xFC,          // CALL cc,nn (PO, PE, P, M)
];

const refs = [];
for (let offset = 0; offset < rom.length - 3; offset++) {
  if (rom[offset + 1] === addrBytes[0] &&
      rom[offset + 2] === addrBytes[1] &&
      rom[offset + 3] === addrBytes[2] &&
      callJpOpcodes.includes(rom[offset])) {
    // Decode the instruction at this offset to confirm
    const r = decodeInstruction(rom, offset, 'adl');
    if (r && r.target === 0x08C331) {
      refs.push({
        address: offset,
        bytes: bytesHex(offset, r.length),
        mnemonic: formatInsn(r),
      });
    }
  }
}

for (const ref of refs) {
  console.log('  ' + hex(ref.address) + '  ' + ref.bytes.padEnd(20) + '  ' + ref.mnemonic);
}
if (!refs.length) console.log('  (none found via CALL/JP opcode scan)');

// Also check for JR references (relative jumps within -128..+127 of target)
console.log('\n=== JR References TO 0x08C331 (relative jumps) ===\n');

const jrOpcodes = [0x18, 0x20, 0x28, 0x30, 0x38]; // JR, JR NZ, JR Z, JR NC, JR C
let jrCount = 0;
for (let offset = Math.max(0, START - 128); offset < Math.min(rom.length - 1, START + 129); offset++) {
  if (jrOpcodes.includes(rom[offset])) {
    const r = decodeInstruction(rom, offset, 'adl');
    if (r && r.target === START) {
      console.log('  ' + hex(offset) + '  ' + bytesHex(offset, r.length).padEnd(20) + '  ' + formatInsn(r));
      jrCount++;
    }
  }
}
if (!jrCount) console.log('  (none)');

// -- 8. Summary --

console.log('\n=== Summary ===\n');
console.log('  Start address: ' + hex(START));
console.log('  Block end: ' + hex(blockEnd));
console.log('  Block size: ' + (blockEnd - START) + ' bytes');
console.log('  Instructions: ' + instructions.length);
console.log('  CALL/JP/JR targets: ' + targets.length);
console.log('  IY flag ops: ' + iyCount);
console.log('  RAM refs: ' + ramCount);
console.log('  External references to ' + hex(START) + ': ' + refs.length + ' (CALL/JP) + ' + jrCount + ' (JR)');

console.log('\nDone.');
process.exit(0);
