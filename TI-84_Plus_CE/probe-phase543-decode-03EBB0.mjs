import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const START = 0x03ebb0;
const RAW_LEN = 200;
const MAX_INSTRUCTIONS = 60;

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const hexFmt = (value, width = 2) => value.toString(16).toUpperCase().padStart(width, '0');
const addrHex = (value) => `0x${hexFmt(value, 6)}`;

function formatBytes(bytes) {
  return bytes.map((byte) => hexFmt(byte)).join(' ');
}

function formatInstr(inst) {
  const t = inst.tag;
  if (!t) return '???';

  // Simple no-operand instructions
  if (['nop', 'ret', 'reti', 'retn', 'halt', 'di', 'ei', 'exx', 'ex-af',
       'ex-de-hl', 'cpl', 'ccf', 'scf', 'daa', 'neg', 'rla', 'rra',
       'rlca', 'rrca', 'ldi', 'ldir', 'ldd', 'lddr', 'cpi', 'cpir',
       'cpd', 'cpdr', 'ini', 'inir', 'ind', 'indr', 'outi', 'otir',
       'outd', 'otdr', 'rld', 'rrd', 'slp'].includes(t)) {
    return t.toUpperCase().replace(/-/g, ' ');
  }

  if (t === 'ret-conditional') return `RET ${inst.condition}`;

  // Loads
  if (t === 'ld-reg-imm') return `LD ${inst.dest}, ${addrHex(inst.value)}`;
  if (t === 'ld-pair-imm') return `LD ${inst.pair}, ${addrHex(inst.value)}`;
  if (t === 'ld-reg-reg') return `LD ${inst.dest}, ${inst.src}`;
  if (t === 'ld-reg-ind') return `LD ${inst.dest}, (${inst.src})`;
  if (t === 'ld-ind-reg') return `LD (${inst.dest}), ${inst.src}`;
  if (t === 'ld-mem-reg') return `LD (${addrHex(inst.addr)}), ${inst.src}`;
  if (t === 'ld-reg-mem') return `LD ${inst.dest}, (${addrHex(inst.addr)})`;
  if (t === 'ld-mem-pair') return `LD (${addrHex(inst.addr)}), ${inst.pair}`;
  if (t === 'ld-pair-mem') {
    if (inst.direction === 'to-mem') return `LD (${addrHex(inst.addr)}), ${inst.pair}`;
    return `LD ${inst.pair}, (${addrHex(inst.addr)})`;
  }
  if (t === 'ld-sp-pair') return `LD SP, ${inst.pair || inst.src}`;
  if (t === 'ld-sp-hl') return 'LD SP, HL';
  if (t === 'ld-ind-imm') return `LD (${inst.dest}), ${addrHex(inst.value)}`;

  // Indexed loads
  if (t === 'ld-indexed-reg') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `LD (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
  }
  if (t === 'ld-reg-indexed') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `LD ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
  }
  if (t === 'ld-indexed-imm') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `LD (${inst.indexRegister}${sign}${inst.displacement}), ${addrHex(inst.value)}`;
  }

  // Stack
  if (t === 'push') return `PUSH ${inst.pair}`;
  if (t === 'pop') return `POP ${inst.pair}`;
  if (t === 'ex-sp-pair') return `EX (SP), ${inst.pair}`;
  if (t === 'ex-sp-hl') return 'EX (SP), HL';

  // ALU
  if (t === 'alu-reg') return `${(inst.op || inst.operation || '??').toUpperCase()} ${inst.src}`;
  if (t === 'alu-imm') return `${(inst.op || inst.operation || '??').toUpperCase()} ${addrHex(inst.value)}`;
  if (t === 'alu-indexed') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `${(inst.op || inst.operation || '??').toUpperCase()} (${inst.indexRegister}${sign}${inst.displacement})`;
  }
  if (t === 'alu-ind') return `${(inst.op || inst.operation || '??').toUpperCase()} (${inst.src})`;

  // 16-bit arithmetic
  if (t === 'add-pair') return `ADD ${inst.dest}, ${inst.src}`;
  if (t === 'adc-pair') return `ADC ${inst.dest || 'hl'}, ${inst.src}`;
  if (t === 'sbc-pair') return `SBC ${inst.dest || 'hl'}, ${inst.src}`;
  if (t === 'inc-pair') return `INC ${inst.pair}`;
  if (t === 'dec-pair') return `DEC ${inst.pair}`;
  if (t === 'inc-reg') return `INC ${inst.reg}`;
  if (t === 'dec-reg') return `DEC ${inst.reg}`;
  if (t === 'inc-ind') return `INC (${inst.target})`;
  if (t === 'dec-ind') return `DEC (${inst.target})`;
  if (t === 'inc-indexed') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `INC (${inst.indexRegister}${sign}${inst.displacement})`;
  }
  if (t === 'dec-indexed') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `DEC (${inst.indexRegister}${sign}${inst.displacement})`;
  }

  // Jumps
  if (t === 'jp') return `JP ${addrHex(inst.target)}`;
  if (t === 'jp-conditional') return `JP ${inst.condition}, ${addrHex(inst.target)}`;
  if (t === 'jr') return `JR ${addrHex(inst.target)}`;
  if (t === 'jr-conditional') return `JR ${inst.condition}, ${addrHex(inst.target)}`;
  if (t === 'jp-ind') return `JP (${inst.target})`;
  if (t === 'jp-indirect') return `JP (${inst.indirectRegister})`;
  if (t === 'djnz') return `DJNZ ${addrHex(inst.target)}`;

  // Calls
  if (t === 'call') return `CALL ${addrHex(inst.target)}`;
  if (t === 'call-conditional') return `CALL ${inst.condition}, ${addrHex(inst.target)}`;
  if (t === 'rst') return `RST ${addrHex(inst.target)}`;

  // Bit manipulation
  if (t === 'bit-reg') return `BIT ${inst.bit}, ${inst.reg}`;
  if (t === 'set-reg') return `SET ${inst.bit}, ${inst.reg}`;
  if (t === 'res-reg') return `RES ${inst.bit}, ${inst.reg}`;
  if (t === 'bit-ind') return `BIT ${inst.bit}, (${inst.target})`;
  if (t === 'set-ind') return `SET ${inst.bit}, (${inst.target})`;
  if (t === 'res-ind') return `RES ${inst.bit}, (${inst.target})`;
  if (t === 'bit-test') return `BIT ${inst.bit}, ${inst.reg}`;
  if (t === 'bit-test-ind') return `BIT ${inst.bit}, (${inst.indirectRegister})`;

  // Indexed bit ops
  if (t === 'indexed-cb-bit') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `BIT ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
  }
  if (t === 'indexed-cb-set') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `SET ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
  }
  if (t === 'indexed-cb-res') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `RES ${inst.bit}, (${inst.indexRegister}${sign}${inst.displacement})`;
  }
  if (t === 'indexed-cb-rotate') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `${(inst.operation || inst.op || '??').toUpperCase()} (${inst.indexRegister}${sign}${inst.displacement})`;
  }

  // Rotate/shift
  if (t === 'rotate-reg') return `${(inst.operation || inst.op || '??').toUpperCase()} ${inst.reg}`;
  if (t === 'rotate-ind') return `${(inst.operation || inst.op || '??').toUpperCase()} (${inst.target || inst.indirectRegister})`;

  // I/O
  if (t === 'in-reg-c') return `IN ${inst.reg}, (C)`;
  if (t === 'out-c-reg') return `OUT (C), ${inst.reg}`;
  if (t === 'in-a-imm') return `IN A, (${addrHex(inst.port)})`;
  if (t === 'out-imm-a') return `OUT (${addrHex(inst.port)}), A`;
  if (t === 'in0') return `IN0 ${inst.reg}, (${addrHex(inst.port)})`;
  if (t === 'out0') return `OUT0 (${addrHex(inst.port)}), ${inst.reg}`;

  // LD special
  if (t === 'ld-special') return `LD ${inst.dest}, ${inst.src}`;
  if (t === 'ld-i-a') return 'LD I, A';
  if (t === 'ld-a-i') return 'LD A, I';
  if (t === 'ld-r-a') return 'LD R, A';
  if (t === 'ld-a-r') return 'LD A, R';
  if (t === 'ld-mb-a') return 'LD MB, A';
  if (t === 'ld-a-mb') return 'LD A, MB';

  // IM
  if (t === 'im') return `IM ${inst.mode}`;

  // MLT
  if (t === 'mlt') return `MLT ${inst.pair}`;

  // TST
  if (t === 'tst-reg') return `TST ${inst.reg}`;
  if (t === 'tst-imm') return `TST ${addrHex(inst.value)}`;

  // LEA
  if (t === 'lea') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `LEA ${inst.dest}, ${inst.indexRegister}${sign}${inst.displacement}`;
  }

  // PEA
  if (t === 'pea') {
    const sign = inst.displacement >= 0 ? '+' : '';
    return `PEA ${inst.indexRegister}${sign}${inst.displacement}`;
  }

  // STMIX / RSMIX
  if (t === 'stmix') return 'STMIX';
  if (t === 'rsmix') return 'RSMIX';

  // Fallback
  const extra = Object.entries(inst)
    .filter(([k]) => !['tag', 'pc', 'length', 'nextPc', 'mode', 'modePrefix'].includes(k))
    .map(([k, v]) => `${k}=${typeof v === 'number' ? addrHex(v) : v}`)
    .join(', ');
  return extra ? `${t} [${extra}]` : t;
}

function isUnconditionalTerminal(tag) {
  return tag === 'ret' || tag === 'jp' || tag === 'jp-ind' || tag === 'jp-indirect';
}

console.log(`Decode probe for ${addrHex(START)} (ADL mode)`);
console.log('');

const raw = Array.from(rom.subarray(START, START + RAW_LEN));
console.log(`Raw ${RAW_LEN} bytes at ${addrHex(START)}:`);
for (let i = 0; i < raw.length; i += 16) {
  const chunk = raw.slice(i, i + 16);
  console.log(`${addrHex(START + i)}: ${formatBytes(chunk)}`);
}
console.log('');

const callTargets = new Set();
const ramRefs = new Set();
const stringPointers = new Set();

let pc = START;
console.log('Disassembly:');
for (let i = 0; i < MAX_INSTRUCTIONS && pc < rom.length; i++) {
  const instr = decodeInstruction(rom, pc, 'adl');
  if (!instr || !instr.tag) {
    console.log(`${addrHex(pc)}  ${hexFmt(rom[pc]).padEnd(18)}  ??? (0x${hexFmt(rom[pc])})`);
    pc++;
    continue;
  }

  const bytes = Array.from(rom.subarray(pc, pc + instr.length));
  const asm = formatInstr(instr);

  // Collect CALL targets
  if (instr.tag === 'call' || instr.tag === 'call-conditional') {
    callTargets.add(addrHex(instr.target));
  }
  if (instr.tag === 'rst') {
    callTargets.add(addrHex(instr.target));
  }

  // Collect RAM refs (0xDxxxxx)
  const ramMatches = asm.matchAll(/0x(D[0-9A-Fa-f]{5})/gi);
  for (const m of ramMatches) {
    ramRefs.add(`0x${m[1].toUpperCase()}`);
  }

  // Collect ROM string pointers (0x06xxxx)
  const strMatches = asm.matchAll(/0x(06[0-9A-Fa-f]{4})/gi);
  for (const m of strMatches) {
    stringPointers.add(`0x${m[1].toUpperCase()}`);
  }

  console.log(`${addrHex(pc)}  ${formatBytes(bytes).padEnd(18)}  ${asm}`);
  pc += instr.length;

  if (isUnconditionalTerminal(instr.tag)) {
    break;
  }
}

console.log('');
console.log(`Decoded through ${addrHex(pc)}`);
console.log(`CALL targets: ${callTargets.size ? Array.from(callTargets).sort().join(', ') : '(none)'}`);
console.log(`RAM refs (0xDxxxxx): ${ramRefs.size ? Array.from(ramRefs).sort().join(', ') : '(none)'}`);
console.log(`ROM string pointers (0x06xxxx): ${stringPointers.size ? Array.from(stringPointers).sort().join(', ') : '(none)'}`);
