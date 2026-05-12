/**
 * probe-phase298-secondary-scanner.mjs
 *
 * Disassemble and annotate the secondary keyboard scanner at 0x040F16-0x040F59,
 * within the larger keyboard init/scan routine at 0x040EE0-0x040F6F.
 * Compare with the primary GetCSC scanner at 0x0159C0.
 */

import { readFileSync } from 'fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

// ─── Helpers ────────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + v.toString(16).padStart(w, '0').toUpperCase();
}

function signedByte(b) {
  return b < 128 ? b : b - 256;
}

function imm24(rom, pc) {
  return rom[pc] | (rom[pc + 1] << 8) | (rom[pc + 2] << 16);
}

function imm16(rom, pc) {
  return rom[pc] | (rom[pc + 1] << 8);
}

// ─── MMIO Annotation ────────────────────────────────────────────────────────

const MMIO_NAMES = {
  0xE00800: 'KB_MODE',
  0xE00803: 'KB_??_03',
  0xE00804: 'KB_??_04',
  0xE00807: 'KB_??_07',
  0xE00808: 'KB_INT_ENABLE',
  0xE00809: 'KB_??_09',
  0xE0080C: 'KB_GROUP_SELECT',
  0xE0080F: 'KB_ROW_MASK',
  0xE00810: 'KB_GROUP0_DATA',
  0xE00811: 'KB_GROUP1_DATA',
  0xE00812: 'KB_GROUP2_DATA',
  0xE00813: 'KB_GROUP3_DATA',
  0xE00814: 'KB_GROUP4_DATA',
  0xE00815: 'KB_GROUP5_DATA',
  0xE00816: 'KB_GROUP6_DATA',
  0xE00817: 'KB_GROUP7_DATA',
  0xE00818: 'KB_SCAN_STATUS',
  0xE00824: 'KB_INT_STATUS',
  0xE00900: 'KB_DATA',
};

function mmioName(addr) {
  return MMIO_NAMES[addr] || (addr >= 0xE00800 && addr <= 0xE00FFF ? `KB_MMIO_${hex(addr)}` : null);
}

// ─── Simple eZ80 ADL Decoder ────────────────────────────────────────────────

function decode(rom, pc) {
  const b0 = rom[pc];

  // NOP
  if (b0 === 0x00) return { len: 1, mnem: 'NOP' };

  // RET
  if (b0 === 0xC9) return { len: 1, mnem: 'RET' };

  // XOR A (AF)
  if (b0 === 0xAF) return { len: 1, mnem: 'XOR A' };

  // OR A (B7)
  if (b0 === 0xB7) return { len: 1, mnem: 'OR A' };

  // LD B,A (47)
  if (b0 === 0x47) return { len: 1, mnem: 'LD B,A' };

  // LD A,B (78)
  if (b0 === 0x78) return { len: 1, mnem: 'LD A,B' };

  // LD A,n (3E nn)
  if (b0 === 0x3E) {
    return { len: 2, mnem: `LD A,${hex(rom[pc + 1], 2)}` };
  }

  // AND n (E6 nn)
  if (b0 === 0xE6) {
    return { len: 2, mnem: `AND ${hex(rom[pc + 1], 2)}` };
  }

  // CP n (FE nn)
  if (b0 === 0xFE) {
    return { len: 2, mnem: `CP ${hex(rom[pc + 1], 2)}` };
  }

  // JR Z,d (28 dd)
  if (b0 === 0x28) {
    const d = signedByte(rom[pc + 1]);
    const target = pc + 2 + d;
    return { len: 2, mnem: `JR Z,${hex(target)}` };
  }

  // JR NZ,d (20 dd)
  if (b0 === 0x20) {
    const d = signedByte(rom[pc + 1]);
    const target = pc + 2 + d;
    return { len: 2, mnem: `JR NZ,${hex(target)}` };
  }

  // JR d (18 dd)
  if (b0 === 0x18) {
    const d = signedByte(rom[pc + 1]);
    const target = pc + 2 + d;
    return { len: 2, mnem: `JR ${hex(target)}` };
  }

  // LD A,(imm24) (3A lo mid hi)
  if (b0 === 0x3A) {
    const addr = imm24(rom, pc + 1);
    return { len: 4, mnem: `LD A,(${hex(addr)})`, mmio: addr };
  }

  // LD (imm24),A (32 lo mid hi)
  if (b0 === 0x32) {
    const addr = imm24(rom, pc + 1);
    return { len: 4, mnem: `LD (${hex(addr)}),A`, mmio: addr };
  }

  // CALL imm24 (CD)
  if (b0 === 0xCD) {
    const addr = imm24(rom, pc + 1);
    return { len: 4, mnem: `CALL ${hex(addr)}` };
  }

  // JP imm24 (C3)
  if (b0 === 0xC3) {
    const addr = imm24(rom, pc + 1);
    return { len: 4, mnem: `JP ${hex(addr)}` };
  }

  // RET Z (C8)
  if (b0 === 0xC8) return { len: 1, mnem: 'RET Z' };

  // RET NZ (C0)
  if (b0 === 0xC0) return { len: 1, mnem: 'RET NZ' };

  // LD E,n (1E nn)
  if (b0 === 0x1E) {
    return { len: 2, mnem: `LD E,${hex(rom[pc + 1], 2)}` };
  }

  // LD DE,imm24 (11 lo mid hi)
  if (b0 === 0x11) {
    const addr = imm24(rom, pc + 1);
    return { len: 4, mnem: `LD DE,${hex(addr)}` };
  }

  // ED prefix
  if (b0 === 0xED) {
    const b1 = rom[pc + 1];
    // ED 53 lo mid hi = LD (imm24),DE
    if (b1 === 0x53) {
      const addr = imm24(rom, pc + 2);
      return { len: 5, mnem: `LD (${hex(addr)}),DE`, mmio: addr };
    }
    return { len: 2, mnem: `DB 0xED,${hex(b1, 2)}` };
  }

  // CB prefix
  if (b0 === 0xCB) {
    const b1 = rom[pc + 1];
    const bit = (b1 >> 3) & 7;
    const reg = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
    const group = (b1 >> 6) & 3;
    if (group === 1) {
      return { len: 2, mnem: `BIT ${bit},${reg}` };
    }
    return { len: 2, mnem: `CB ${hex(b1, 2)}` };
  }

  return { len: 1, mnem: `DB ${hex(b0, 2)}` };
}

// ─── Disassemble a range ────────────────────────────────────────────────────

function disassembleRange(rom, start, end, label) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(70)}`);

  const mmioAccesses = [];
  let pc = start;

  while (pc <= end) {
    const inst = decode(rom, pc);
    const bytesArr = [];
    for (let i = 0; i < inst.len; i++) {
      bytesArr.push(rom[pc + i].toString(16).padStart(2, '0'));
    }
    const bytesStr = bytesArr.join(' ').padEnd(15);

    // Build annotation
    let annotation = '';
    if (inst.mmio !== undefined) {
      const name = mmioName(inst.mmio);
      if (name) {
        annotation = `; ${name}`;
        mmioAccesses.push({ addr: pc, mmio: inst.mmio, name, mnem: inst.mnem });
      }
    }

    // Special annotations for known patterns
    if (inst.mnem === 'XOR A') annotation = '; A = 0';
    if (inst.mnem === 'OR A') annotation = '; set flags from A (test if zero)';
    if (inst.mnem === 'NOP') annotation = '; timing delay';
    if (inst.mnem.startsWith('RET Z')) annotation = '; return if zero';
    if (inst.mnem.startsWith('RET') && inst.mnem === 'RET') annotation = '; return';
    if (inst.mnem.startsWith('JR Z,')) {
      const target = parseInt(inst.mnem.split(',')[1], 16);
      if (target === pc) annotation = '; spin-wait loop (wait for flag)';
      else if (target < pc) annotation = '; loop back (wait for flag)';
    }

    console.log(`  ${hex(pc)}: ${bytesStr}  ${inst.mnem.padEnd(28)} ${annotation}`);
    pc += inst.len;
  }

  return mmioAccesses;
}

// ─── Main ───────────────────────────────────────────────────────────────────

console.log('Phase 298: Secondary Keyboard Scanner Analysis');
console.log(`ROM size: ${rom.length} bytes`);

// First disassemble the full containing routine 0x040EE0-0x040F6F
const mmioFull = disassembleRange(rom, 0x040EE0, 0x040F6F,
  'Full keyboard routine: 0x040EE0 - 0x040F6F (called from 0x040A56)');

// Then highlight just the requested range
console.log('\n');
const mmioTarget = disassembleRange(rom, 0x040F16, 0x040F59,
  'Target range: 0x040F16 - 0x040F59 (secondary scanner portion)');

// ─── Caller search ──────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(70)}`);
console.log('  Caller Analysis');
console.log(`${'='.repeat(70)}`);

// Search for CALL/JP to 0x040F16
const targets = [0x040F16, 0x040EE0];
for (const target of targets) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const callCallers = [];
  const jpCallers = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      if (rom[i] === 0xCD) callCallers.push(hex(i));
      if (rom[i] === 0xC3) jpCallers.push(hex(i));
    }
  }
  console.log(`\n  ${hex(target)}:`);
  console.log(`    CALL callers: ${callCallers.length > 0 ? callCallers.join(', ') : '(none)'}`);
  console.log(`    JP   callers: ${jpCallers.length > 0 ? jpCallers.join(', ') : '(none)'}`);
}

// Also check who calls the caller at 0x040A56
{
  const target = 0x040A56;
  // Read surrounding bytes to see context
  console.log(`\n  Context around caller at ${hex(target)}:`);
  let pc = target - 8;
  for (let i = 0; i < 20; i += 16) {
    const bytesArr = [];
    for (let j = 0; j < 16 && pc + j < rom.length; j++) {
      bytesArr.push(rom[pc + i + j].toString(16).padStart(2, '0'));
    }
    console.log(`    ${hex(pc + i)}: ${bytesArr.join(' ')}`);
  }
}

// ─── MMIO Summary ───────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(70)}`);
console.log('  MMIO Accesses in Full Routine (0x040EE0-0x040F6F)');
console.log(`${'='.repeat(70)}`);

for (const m of mmioFull) {
  console.log(`  ${hex(m.addr)}: ${m.mnem.padEnd(30)} => ${m.name}`);
}

// ─── Comparison with Primary Scanner ────────────────────────────────────────

console.log(`\n${'='.repeat(70)}`);
console.log('  Comparison: Secondary (0x040EE0) vs Primary GetCSC (0x0159C0)');
console.log(`${'='.repeat(70)}`);

console.log(`
  PRIMARY SCANNER (0x0159C0 - 0x015AD2, ~274 bytes):
    - Called frequently by the OS event loop (GetCSC)
    - Scans all 8 keyboard groups sequentially
    - Returns a scan code (group << 4 | bit) identifying the pressed key
    - Uses IY-relative MMIO access (IY points to 0xE00800 base)
    - Debouncing / repeat logic
    - Returns 0 if no key pressed

  SECONDARY SCANNER (0x040EE0 - 0x040F6F, ~144 bytes):
    - Called from 0x040A56 (single caller)
    - NOT a general key scanner — it's a keyboard controller initialization/reset
    - Uses direct absolute MMIO addresses (LD A,(0xE00824), LD (0xE00808),A, etc.)
    - Writes to KB controller config registers:
      * 0xE00800: mode/control
      * 0xE00803, 0xE00804, 0xE00807, 0xE00808, 0xE00809: config/interrupt regs
      * 0xE0080C: group select
      * 0xE0080F: row mask
    - Reads 0xE00900 (KB_DATA) once to get initial state / clear latch
    - Polls KB_INT_STATUS (0xE00824 bit 0) as a "scan complete" flag
    - Polls KB_SCAN_STATUS (0xE00818 bit 1) at the start
    - Checks if KB_DATA == 0x03 and returns early if so (specific key state check)
    - Ends by writing 0x28 to KB_DATA (0xE00900) — sets group select mask
    - Returns with A=1 and OR A to set flags

  KEY DIFFERENCES:
    1. Purpose: Primary = read which key is pressed. Secondary = initialize/configure keyboard controller
    2. Direction: Primary = read-heavy (scan groups). Secondary = write-heavy (configure registers)
    3. Calling: Primary = called every OS tick. Secondary = called once during init (from 0x040A56)
    4. MMIO style: Primary = IY-relative. Secondary = absolute addresses
    5. The secondary routine configures the keyboard controller hardware BEFORE the
       primary scanner can operate. It sets up group masks, interrupt enables,
       and scan parameters, then verifies the controller responds correctly.
`);

console.log('Phase 298 complete.');
