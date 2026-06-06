import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const BASE = 0x0994D7;
const MAIN_LEN = 120;
const TARGET_LEN = 24;

const rom = readFileSync(ROM_PATH);

function readROM(addr, len) {
  return Array.from(rom.slice(addr, addr + len));
}

function hex(b) {
  return b.toString(16).padStart(2, '0');
}

function hex6(a) {
  return '0x' + a.toString(16).padStart(6, '0');
}

function addr24(bytes, off) {
  return bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16);
}

function signed8(b) {
  return b > 127 ? b - 256 : b;
}

function dumpBytes(label, addr, bytes) {
  console.log(label);
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    console.log(hex6(addr + i) + ': ' + chunk.map(hex).join(' '));
  }
}

function mnemonicForControl(op) {
  const names = {
    0x18: 'JR',
    0x20: 'JR NZ',
    0x28: 'JR Z',
    0x30: 'JR NC',
    0x38: 'JR C',
    0xC0: 'RET NZ',
    0xC2: 'JP NZ',
    0xC3: 'JP',
    0xC4: 'CALL NZ',
    0xC8: 'RET Z',
    0xC9: 'RET',
    0xCA: 'JP Z',
    0xCC: 'CALL Z',
    0xCD: 'CALL',
    0xD0: 'RET NC',
    0xD2: 'JP NC',
    0xD4: 'CALL NC',
    0xD8: 'RET C',
    0xDA: 'JP C',
    0xDC: 'CALL C',
  };
  return names[op] ?? 'UNKNOWN';
}

function instructionLength(bytes, pc) {
  const op = bytes[pc];

  if (op === undefined) return 1;

  // eZ80 ADL mode: absolute CALL/JP/LD pointer operands are 24-bit.
  if ([0x01, 0x11, 0x21, 0x31, 0x22, 0x2A, 0x32, 0x3A].includes(op)) return 4;
  if ([0xC2, 0xC3, 0xC4, 0xCA, 0xCC, 0xCD, 0xD2, 0xD4, 0xDA, 0xDC].includes(op)) return 4;

  if ([0x06, 0x0E, 0x10, 0x16, 0x18, 0x1E, 0x20, 0x26, 0x28, 0x2E, 0x30, 0x36, 0x38, 0x3E].includes(op)) return 2;
  if ([0xC6, 0xCE, 0xD3, 0xD6, 0xDB, 0xDE, 0xE6, 0xEE, 0xF6, 0xFE].includes(op)) return 2;

  if (op === 0xCB) return 2;

  if (op === 0xDD || op === 0xFD) {
    const next = bytes[pc + 1];
    if (next === 0xCB) return 4;
    if ([0x21, 0x22, 0x2A].includes(next)) return 5;
    if ([0x34, 0x35, 0x36, 0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7E, 0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE].includes(next)) {
      return next === 0x36 ? 4 : 3;
    }
    return 2;
  }

  if (op === 0xED) {
    const next = bytes[pc + 1];
    if ([0x43, 0x4B, 0x53, 0x5B, 0x73, 0x7B].includes(next)) return 5;
    return 2;
  }

  return 1;
}

function describeInstruction(bytes, pc, base) {
  const op = bytes[pc];
  const addr = base + pc;
  const len = Math.min(instructionLength(bytes, pc), bytes.length - pc);
  const raw = bytes.slice(pc, pc + len).map(hex).join(' ');

  if ([0xCD, 0xCC, 0xC4, 0xDC, 0xD4, 0xC3, 0xCA, 0xC2, 0xDA, 0xD2].includes(op) && pc + 3 < bytes.length) {
    return { addr, len, raw, text: `${mnemonicForControl(op)} ${hex6(addr24(bytes, pc + 1))}` };
  }

  if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op) && pc + 1 < bytes.length) {
    const target = addr + 2 + signed8(bytes[pc + 1]);
    return { addr, len, raw, text: `${mnemonicForControl(op)} ${hex6(target)}` };
  }

  if ([0xC9, 0xC8, 0xC0, 0xD8, 0xD0].includes(op)) {
    return { addr, len, raw, text: mnemonicForControl(op) };
  }

  if (op === 0x3A && pc + 3 < bytes.length) return { addr, len, raw, text: `LD A,(${hex6(addr24(bytes, pc + 1))})` };
  if (op === 0x32 && pc + 3 < bytes.length) return { addr, len, raw, text: `LD (${hex6(addr24(bytes, pc + 1))}),A` };
  if (op === 0x3E && pc + 1 < bytes.length) return { addr, len, raw, text: `LD A,0x${hex(bytes[pc + 1])}` };
  if (op === 0xFE && pc + 1 < bytes.length) return { addr, len, raw, text: `CP 0x${hex(bytes[pc + 1])}` };
  if (op === 0xE6 && pc + 1 < bytes.length) return { addr, len, raw, text: `AND 0x${hex(bytes[pc + 1])}` };

  if (op === 0xDD || op === 0xFD) {
    const reg = op === 0xDD ? 'IX' : 'IY';
    if (bytes[pc + 1] === 0xCB && pc + 3 < bytes.length) return { addr, len, raw, text: `${reg} CB-prefixed op` };
    return { addr, len, raw, text: `${reg}-prefixed op` };
  }

  if ([0xC7, 0xCF, 0xD7, 0xDF, 0xE7, 0xEF, 0xF7, 0xFF].includes(op)) {
    return { addr, len, raw, text: `RST 0x${hex(op & 0x38)}` };
  }

  return { addr, len, raw, text: `db 0x${hex(op)}` };
}

// --- Helper: decode a region and return { disassembly, targets, retAddrs } ---
function decodeRegion(label, base, length) {
  const bytes = readROM(base, length);
  dumpBytes(`=== ${hex6(base)} ROM bytes (${length}) — ${label} ===`, base, bytes);

  const targets = [];
  const retAddrs = [];
  const disassembly = [];

  for (let pc = 0; pc < bytes.length;) {
    const op = bytes[pc];
    const addr = base + pc;
    const decoded = describeInstruction(bytes, pc, base);
    disassembly.push(decoded);

    if ([0xCD, 0xCC, 0xC4, 0xDC, 0xD4, 0xC3, 0xCA, 0xC2, 0xDA, 0xD2].includes(op) && pc + 3 < bytes.length) {
      targets.push({ from: addr, target: addr24(bytes, pc + 1), op: mnemonicForControl(op) });
    } else if ([0x18, 0x20, 0x28, 0x30, 0x38].includes(op) && pc + 1 < bytes.length) {
      targets.push({ from: addr, target: addr + 2 + signed8(bytes[pc + 1]), op: mnemonicForControl(op) });
    } else if ([0xC9, 0xC8, 0xC0, 0xD8, 0xD0].includes(op)) {
      retAddrs.push({ addr, op: mnemonicForControl(op) });
    }

    pc += decoded.len;
  }

  console.log(`\n=== Linear decode — ${label} ===`);
  for (const ins of disassembly) {
    console.log(`${hex6(ins.addr)}  ${ins.raw.padEnd(14)}  ${ins.text}`);
  }

  console.log(`\n=== Branch targets — ${label} ===`);
  if (targets.length === 0) {
    console.log('(none found in scanned window)');
  } else {
    for (const t of targets) {
      console.log(`${hex6(t.from)} [${t.op}] -> ${hex6(t.target)}`);
    }
  }

  console.log(`\n=== RET locations — ${label} ===`);
  if (retAddrs.length === 0) {
    console.log('(none found in scanned window)');
  } else {
    for (const r of retAddrs) {
      console.log(`${hex6(r.addr)} [${r.op}]`);
    }
  }

  return { disassembly, targets, retAddrs };
}

// --- Pass 1: 0x0994D7 stub (5-byte: LD (DE),A; INC DE; SUB A; LD (DE),A; RET) ---
const pass1 = decodeRegion('0x0994D7 stub', BASE, 5);

// --- Pass 2: 0x0994DC main function (~120 bytes) ---
const FUNC_BASE = 0x0994DC;
const FUNC_LEN = 120;
const pass2 = decodeRegion('0x0994DC main function', FUNC_BASE, FUNC_LEN);

// --- Merge targets from both passes for sub-target dumps ---
const allTargets = [...pass1.targets, ...pass2.targets];
const allRetAddrs = [...pass1.retAddrs, ...pass2.retAddrs];
const allDisassembly = [...pass1.disassembly, ...pass2.disassembly];

const uniqueTargets = [...new Set(allTargets.map(t => t.target))].sort((a, b) => a - b);
console.log('\n=== Unique target byte dumps (both passes) ===');
if (uniqueTargets.length === 0) {
  console.log('(none)');
}

for (const t of uniqueTargets) {
  if (t >= 0 && t < rom.length) {
    const bytes = readROM(t, TARGET_LEN);
    dumpBytes(`\n=== ${hex6(t)} (${TARGET_LEN} bytes) ===`, t, bytes);
  } else {
    console.log(`\n=== ${hex6(t)} ===`);
    console.log('target outside ROM range');
  }
}

const callCount = allTargets.filter(t => t.op.startsWith('CALL')).length;
const jpCount = allTargets.filter(t => t.op.startsWith('JP')).length;
const jrCount = allTargets.filter(t => t.op.startsWith('JR')).length;
const hasLoop = allTargets.some(t => t.target < t.from);
const externalCalls = allTargets.filter(t => t.op.startsWith('CALL') && (t.target < FUNC_BASE || t.target >= FUNC_BASE + FUNC_LEN));

console.log('\n=== Findings ===');
console.log(`Pass 1: ${pass1.disassembly.length} instructions at ${hex6(BASE)} (5-byte stub).`);
console.log(`Pass 2: ${pass2.disassembly.length} instructions at ${hex6(FUNC_BASE)} (${FUNC_LEN} bytes).`);
console.log(`Total control flow: ${callCount} CALL(s), ${jpCount} JP(s), ${jrCount} JR(s), ${allRetAddrs.length} RET-family instruction(s).`);
console.log(`Backward branch present: ${hasLoop ? 'yes, likely contains or reaches a loop' : 'no in this scanned window'}.`);
console.log(`External sub-targets: ${externalCalls.length ? externalCalls.map(t => hex6(t.target)).join(', ') : 'none found'}.`);
console.log('Interpretation guide: multiple external CALLs with little local branching suggests a wrapper; dense JP/JR range tests suggest a dispatcher; backward JR/JP with character rendering calls suggests a rendering loop.');
