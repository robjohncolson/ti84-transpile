import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction as decodeEz80 } from '../TI-84_Plus_CE/ez80-decoder.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const romPath = path.join(repoRoot, 'TI-84_Plus_CE', 'ROM.rom');
const outPath = path.join(repoRoot, 'TI-84_Plus_CE', 'ROM.transpiled.js');
const reportPath = path.join(repoRoot, 'TI-84_Plus_CE', 'ROM.transpiled.report.json');

const romBytes = fs.readFileSync(romPath);
const romBase64 = romBytes.toString('base64');

// --- Utilities ---

function hex(value, width = 2) {
  return `0x${value.toString(16).padStart(width, '0')}`;
}

function formatKey(pc, mode) {
  return `${pc.toString(16).padStart(6, '0')}:${mode}`;
}

function bytesToHex(address, length) {
  return Array.from(romBytes.slice(address, address + length))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join(' ');
}

function wrap24(value) {
  return value & 0xffffff;
}

function getWordByteWidth(instruction) {
  if (instruction.prefix === 'SIS' || instruction.prefix === 'LIS') return 2;
  if (instruction.prefix === 'SIL' || instruction.prefix === 'LIL') return 3;
  return instruction.mode === 'adl' ? 3 : 2;
}

function getWordReadAccessor(instruction) {
  return getWordByteWidth(instruction) === 2 ? 'read16' : 'read24';
}

function getWordWriteAccessor(instruction) {
  return getWordByteWidth(instruction) === 2 ? 'write16' : 'write24';
}

// --- Disassembly string builder (for source comments) ---

function buildDasm(d) {
  const disp = (v) => (v >= 0 ? `+${v}` : `${v}`);
  const ixd = (reg, displacement) => `(${reg}${disp(displacement)})`;

  switch (d.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'cpl': return 'cpl';
    case 'daa': return 'daa';
    case 'neg': return 'neg';
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'rrd': return 'rrd';
    case 'rld': return 'rld';
    case 'exx': return 'exx';
    case 'ex-af': return "ex af, af'";
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'stmix': return 'stmix';
    case 'rsmix': return 'rsmix';
    case 'slp': return 'slp';
    case 'otimr': return 'otimr';
    case 'ini': return 'ini';
    case 'ind': return 'ind';
    case 'outi': return 'outi';
    case 'outd': return 'outd';
    case 'inir': return 'inir';
    case 'indr': return 'indr';
    case 'otir': return 'otir';
    case 'otdr': return 'otdr';

    case 'ld-reg-reg': return `ld ${d.dest}, ${d.src}`;
    case 'ld-reg-imm': return `ld ${d.dest}, ${hex(d.value)}`;
    case 'ld-reg-ind': return `ld ${d.dest}, (${d.src})`;
    case 'ld-ind-reg': return `ld (${d.dest}), ${d.src}`;
    case 'ld-reg-mem': return `ld ${d.dest}, (${hex(d.addr, 6)})`;
    case 'ld-mem-reg': return `ld (${hex(d.addr, 6)}), ${d.src}`;
    case 'ld-pair-imm': return `ld ${d.pair}, ${hex(d.value, 6)}`;
    case 'ld-pair-mem':
      return d.direction === 'to-mem'
        ? `ld (${hex(d.addr, 6)}), ${d.pair}`
        : `ld ${d.pair}, (${hex(d.addr, 6)})`;
    case 'ld-mem-pair': return `ld (${hex(d.addr, 6)}), ${d.pair}`;
    case 'ld-ind-imm': return `ld (hl), ${hex(d.value)}`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'ld-sp-pair': return `ld sp, ${d.pair}`;
    case 'ld-special': return `ld ${d.dest}, ${d.src}`;
    case 'ld-pair-ind': return `ld ${d.pair}, (${d.src})`;
    case 'ld-ind-pair': return `ld (${d.dest}), ${d.pair}`;

    case 'ld-reg-ixd': return `ld ${d.dest}, ${ixd(d.indexRegister, d.displacement)}`;
    case 'ld-ixd-reg': return `ld ${ixd(d.indexRegister, d.displacement)}, ${d.src}`;
    case 'ld-ixd-imm': return `ld ${ixd(d.indexRegister, d.displacement)}, ${hex(d.value)}`;

    case 'alu-reg': {
      const prefix = (d.op === 'add' || d.op === 'adc' || d.op === 'sbc') ? `${d.op} a, ` : `${d.op} `;
      return d.src === '(hl)' ? `${prefix}(hl)` : `${prefix}${d.src}`;
    }
    case 'alu-imm': {
      const prefix = (d.op === 'add' || d.op === 'adc' || d.op === 'sbc') ? `${d.op} a, ` : `${d.op} `;
      return `${prefix}${hex(d.value)}`;
    }
    case 'alu-ixd': {
      const prefix = (d.op === 'add' || d.op === 'adc' || d.op === 'sbc') ? `${d.op} a, ` : `${d.op} `;
      return `${prefix}${ixd(d.indexRegister, d.displacement)}`;
    }

    case 'inc-reg': return `inc ${d.reg}`;
    case 'dec-reg': return `dec ${d.reg}`;
    case 'inc-pair': return `inc ${d.pair}`;
    case 'dec-pair': return `dec ${d.pair}`;
    case 'inc-ixd': return `inc ${ixd(d.indexRegister, d.displacement)}`;
    case 'dec-ixd': return `dec ${ixd(d.indexRegister, d.displacement)}`;

    case 'add-pair': return `add ${d.dest}, ${d.src}`;
    case 'sbc-pair': return `sbc hl, ${d.src}`;
    case 'adc-pair': return `adc hl, ${d.src}`;

    case 'push': return `push ${d.pair}`;
    case 'pop': return `pop ${d.pair}`;

    case 'bit-test': return `bit ${d.bit}, ${d.reg}`;
    case 'bit-set': return `set ${d.bit}, ${d.reg}`;
    case 'bit-res': return `res ${d.bit}, ${d.reg}`;
    case 'bit-test-ind': return `bit ${d.bit}, (${d.indirectRegister})`;
    case 'bit-set-ind': return `set ${d.bit}, (${d.indirectRegister})`;
    case 'bit-res-ind': return `res ${d.bit}, (${d.indirectRegister})`;

    case 'rotate-reg': return `${d.op} ${d.reg}`;
    case 'rotate-ind': return `${d.op} (${d.indirectRegister})`;

    case 'indexed-cb-rotate': return `${d.operation} ${ixd(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-bit': return `bit ${d.bit}, ${ixd(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-res': return `res ${d.bit}, ${ixd(d.indexRegister, d.displacement)}`;
    case 'indexed-cb-set': return `set ${d.bit}, ${ixd(d.indexRegister, d.displacement)}`;

    case 'jp': return `jp ${hex(d.target, 6)}`;
    case 'jr': return `jr ${hex(d.target, 6)}`;
    case 'jp-conditional': return `jp ${d.condition}, ${hex(d.target, 6)}`;
    case 'jr-conditional': return `jr ${d.condition}, ${hex(d.target, 6)}`;
    case 'jp-indirect': return `jp (${d.indirectRegister})`;
    case 'djnz': return `djnz ${hex(d.target, 6)}`;
    case 'call': return `call ${hex(d.target, 6)}`;
    case 'call-conditional': return `call ${d.condition}, ${hex(d.target, 6)}`;
    case 'ret': return 'ret';
    case 'retn': return 'retn';
    case 'reti': return 'reti';
    case 'ret-conditional': return `ret ${d.condition}`;
    case 'rst': return `rst ${hex(d.target)}`;

    case 'im': return `im ${d.value}`;

    case 'in0': return `in0 ${d.reg}, (${hex(d.port)})`;
    case 'out0': return `out0 (${hex(d.port)}), ${d.reg}`;
    case 'in-reg': return `in ${d.reg}, (c)`;
    case 'out-reg': return `out (c), ${d.reg}`;
    case 'in-imm': return `in a, (${hex(d.port)})`;
    case 'out-imm': return `out (${hex(d.port)}), a`;

    case 'mlt': return `mlt ${d.reg}`;
    case 'tst-reg': return `tst a, ${d.reg}`;
    case 'tst-ind': return 'tst a, (hl)';
    case 'tst-imm': return `tst a, ${hex(d.value)}`;
    case 'tstio': return `tstio ${hex(d.value)}`;

    case 'lea': return `lea ${d.dest}, ${d.base}${disp(d.displacement)}`;
    case 'ex-sp-pair': return `ex (sp), ${d.pair}`;

    default: return `??? tag=${d.tag}`;
  }
}

// --- Decoder adapter: wraps ez80-decoder output for buildBlock compatibility ---

function decodeInstruction(pc, mode) {
  const decoded = decodeEz80(romBytes, pc, mode);
  const bytes = bytesToHex(pc, decoded.length);
  const dasm = buildDasm(decoded);

  // Determine target execution mode from prefix
  const prefixMode = decoded.modePrefix
    ? (decoded.modePrefix[0] === 's' ? 'z80' : 'adl')
    : mode;

  const result = {
    pc: decoded.pc,
    mode,
    tag: decoded.tag,
    length: decoded.length,
    nextMode: mode,
    prefix: decoded.modePrefix ? decoded.modePrefix.toUpperCase() : null,
    dasm,
    bytes,
  };

  // Copy all tag-specific fields from decoder (target, fallthrough, condition, etc.)
  for (const key of Object.keys(decoded)) {
    if (key !== 'pc' && key !== 'length' && key !== 'nextPc' &&
        key !== 'mode' && key !== 'modePrefix' && !(key in result)) {
      result[key] = decoded[key];
    }
  }

  // Wrap addresses to 24 bits
  if (result.target !== undefined && typeof result.target === 'number') {
    result.target = wrap24(result.target);
  }
  if (result.fallthrough !== undefined) {
    result.fallthrough = wrap24(result.fallthrough);
  }

  // Map tags to control flow kind (used by buildBlock for block termination)
  switch (decoded.tag) {
    case 'jp': case 'jr': case 'rst':
      result.kind = 'jump';
      result.targetMode = prefixMode;
      break;
    case 'jp-indirect':
      result.kind = 'jump-indirect';
      break;
    case 'jp-conditional': case 'jr-conditional':
      result.kind = 'branch';
      result.targetMode = prefixMode;
      break;
    case 'djnz':
      result.kind = 'branch';
      result.condition = 'djnz';
      result.targetMode = prefixMode;
      break;
    case 'call':
      result.kind = 'call';
      result.targetMode = prefixMode;
      break;
    case 'call-conditional':
      result.kind = 'call';
      result.targetMode = prefixMode;
      break;
    case 'ret': case 'retn': case 'reti':
      result.kind = 'return';
      break;
    case 'ret-conditional':
      result.kind = 'return-conditional';
      break;
    case 'halt': case 'slp':
      result.kind = 'halt';
      break;
  }

  return result;
}

// --- ALU emit helper ---

function emitAlu(op, srcExpr) {
  switch (op) {
    case 'add': return [`cpu.a = cpu.add8(cpu.a, ${srcExpr});`];
    case 'adc': return [`cpu.a = cpu.addWithCarry8(cpu.a, ${srcExpr});`];
    case 'sub': return [`cpu.a = cpu.subtract8(cpu.a, ${srcExpr});`];
    case 'sbc': return [`cpu.a = cpu.subtractWithBorrow8(cpu.a, ${srcExpr});`];
    case 'and': return [`cpu.a &= ${srcExpr};`, 'cpu.updateLogicFlags(cpu.a);'];
    case 'xor': return [`cpu.a ^= ${srcExpr};`, 'cpu.updateOrXorFlags(cpu.a);'];
    case 'or': return [`cpu.a |= ${srcExpr};`, 'cpu.updateOrXorFlags(cpu.a);'];
    case 'cp': return [`cpu.compare(cpu.a, ${srcExpr});`];
    default: return [];
  }
}

// --- Instruction emitter: direct tag dispatch (no regex/mnemonic parsing) ---

function emitInstructionJs(instruction) {
  const { tag } = instruction;

  // --- NOP / HALT / SLP ---
  if (tag === 'nop') return [];
  if (tag === 'halt') return ['return cpu.halt();'];
  if (tag === 'slp') return ['return cpu.sleep();'];

  // --- Control flow ---
  if (tag === 'jp' || tag === 'jr' || tag === 'rst') {
    return [`return ${hex(instruction.target, 6)};`];
  }
  if (tag === 'jp-indirect') {
    return [`return cpu.${instruction.indirectRegister};`];
  }
  if (tag === 'jp-conditional' || tag === 'jr-conditional') {
    return [
      `if (cpu.checkCondition('${instruction.condition}')) return ${hex(instruction.target, 6)};`,
      `return ${hex(instruction.fallthrough, 6)};`,
    ];
  }
  if (tag === 'djnz') {
    return [
      `if (cpu.decrementAndCheckB()) return ${hex(instruction.target, 6)};`,
      `return ${hex(instruction.fallthrough, 6)};`,
    ];
  }
  if (tag === 'call') {
    return [
      `cpu.push(${hex(instruction.fallthrough, 6)});`,
      `return ${hex(instruction.target, 6)};`,
    ];
  }
  if (tag === 'call-conditional') {
    return [
      `if (cpu.checkCondition('${instruction.condition}')) { cpu.push(${hex(instruction.fallthrough, 6)}); return ${hex(instruction.target, 6)}; }`,
      `return ${hex(instruction.fallthrough, 6)};`,
    ];
  }
  if (tag === 'ret' || tag === 'retn' || tag === 'reti') {
    return ['return cpu.popReturn();'];
  }
  if (tag === 'ret-conditional') {
    return [
      `if (cpu.checkCondition('${instruction.condition}')) return cpu.popReturn();`,
      `return ${hex(instruction.fallthrough, 6)};`,
    ];
  }

  // --- LD register ↔ register ---
  if (tag === 'ld-reg-reg') return [`cpu.${instruction.dest} = cpu.${instruction.src};`];
  if (tag === 'ld-reg-imm') return [`cpu.${instruction.dest} = ${hex(instruction.value)};`];
  if (tag === 'ld-reg-ind') return [`cpu.${instruction.dest} = cpu.readIndirect8('${instruction.src}');`];
  if (tag === 'ld-ind-reg') return [`cpu.writeIndirect8('${instruction.dest}', cpu.${instruction.src});`];
  if (tag === 'ld-reg-mem') return [`cpu.${instruction.dest} = cpu.read8(${hex(instruction.addr, 6)});`];
  if (tag === 'ld-mem-reg') return [`cpu.write8(${hex(instruction.addr, 6)}, cpu.${instruction.src});`];
  if (tag === 'ld-ind-imm') return [`cpu.writeIndirect8('hl', ${hex(instruction.value)});`];

  // --- LD pair ---
  if (tag === 'ld-pair-imm') return [`cpu.${instruction.pair} = ${hex(instruction.value, 6)};`];
  if (tag === 'ld-pair-mem') {
    if (instruction.direction === 'to-mem') {
      return [`cpu.${getWordWriteAccessor(instruction)}(${hex(instruction.addr, 6)}, cpu.${instruction.pair});`];
    }
    return [`cpu.${instruction.pair} = cpu.${getWordReadAccessor(instruction)}(${hex(instruction.addr, 6)});`];
  }
  if (tag === 'ld-mem-pair') {
    return [`cpu.${getWordWriteAccessor(instruction)}(${hex(instruction.addr, 6)}, cpu.${instruction.pair});`];
  }
  if (tag === 'ld-sp-hl') return ['cpu.sp = cpu.hl;'];
  if (tag === 'ld-sp-pair') return [`cpu.sp = cpu.${instruction.pair};`];
  if (tag === 'ld-special') return [`cpu.${instruction.dest} = cpu.${instruction.src};`];

  // --- LD pair ↔ indirect (eZ80: ld ix,(hl) etc.) ---
  if (tag === 'ld-pair-ind') return [`cpu.${instruction.pair} = cpu.readIndirect24('${instruction.src}');`];
  if (tag === 'ld-ind-pair') return [`cpu.writeIndirect24('${instruction.dest}', cpu.${instruction.pair});`];

  // --- LD indexed ---
  if (tag === 'ld-reg-ixd') return [`cpu.${instruction.dest} = cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement});`];
  if (tag === 'ld-ixd-reg') return [`cpu.writeIndexed8('${instruction.indexRegister}', ${instruction.displacement}, cpu.${instruction.src});`];
  if (tag === 'ld-ixd-imm') return [`cpu.writeIndexed8('${instruction.indexRegister}', ${instruction.displacement}, ${hex(instruction.value)});`];

  // --- ALU 8-bit ---
  if (tag === 'alu-reg') {
    const src = instruction.src === '(hl)' ? "cpu.readIndirect8('hl')" : `cpu.${instruction.src}`;
    return emitAlu(instruction.op, src);
  }
  if (tag === 'alu-imm') return emitAlu(instruction.op, hex(instruction.value));
  if (tag === 'alu-ixd') {
    return emitAlu(instruction.op, `cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement})`);
  }

  // --- INC / DEC 8-bit (with flag updates: S, Z, H, PV, N; C preserved) ---
  if (tag === 'inc-reg') {
    if (instruction.reg === '(hl)') return ["cpu.writeIndirect8('hl', cpu.inc8(cpu.readIndirect8('hl')));"];
    return [`cpu.${instruction.reg} = cpu.inc8(cpu.${instruction.reg});`];
  }
  if (tag === 'dec-reg') {
    if (instruction.reg === '(hl)') return ["cpu.writeIndirect8('hl', cpu.dec8(cpu.readIndirect8('hl')));"];
    return [`cpu.${instruction.reg} = cpu.dec8(cpu.${instruction.reg});`];
  }
  if (tag === 'inc-ixd') {
    return [`cpu.writeIndexed8('${instruction.indexRegister}', ${instruction.displacement}, cpu.inc8(cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement})));`];
  }
  if (tag === 'dec-ixd') {
    return [`cpu.writeIndexed8('${instruction.indexRegister}', ${instruction.displacement}, cpu.dec8(cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement})));`];
  }

  // --- INC / DEC 16-bit ---
  if (tag === 'inc-pair') return [`cpu.${instruction.pair} = (cpu.${instruction.pair} + 1) & cpu.addressMask;`];
  if (tag === 'dec-pair') return [`cpu.${instruction.pair} = (cpu.${instruction.pair} - 1) & cpu.addressMask;`];

  // --- 16-bit ALU ---
  if (tag === 'add-pair') return [`cpu.${instruction.dest} = cpu.addWord(cpu.${instruction.dest}, cpu.${instruction.src});`];
  if (tag === 'sbc-pair') return [`cpu.hl = cpu.subtractWithBorrowWord(cpu.hl, cpu.${instruction.src});`];
  if (tag === 'adc-pair') return [`cpu.hl = cpu.addWithCarryWord(cpu.hl, cpu.${instruction.src});`];

  // --- PUSH / POP ---
  if (tag === 'push') return [`cpu.push(cpu.${instruction.pair});`];
  if (tag === 'pop') return [`cpu.${instruction.pair} = cpu.pop();`];

  // --- BIT test/set/res register ---
  if (tag === 'bit-test') return [`cpu.testBit(cpu.${instruction.reg}, ${instruction.bit});`];
  if (tag === 'bit-set') return [`cpu.${instruction.reg} |= ${hex(1 << instruction.bit)};`];
  if (tag === 'bit-res') return [`cpu.${instruction.reg} &= ~${hex(1 << instruction.bit)};`];

  // --- BIT test/set/res indirect (HL) ---
  if (tag === 'bit-test-ind') return [`cpu.testBit(cpu.readIndirect8('${instruction.indirectRegister}'), ${instruction.bit});`];
  if (tag === 'bit-set-ind') return [`cpu.writeIndirect8('${instruction.indirectRegister}', cpu.readIndirect8('${instruction.indirectRegister}') | ${hex(1 << instruction.bit)});`];
  if (tag === 'bit-res-ind') return [`cpu.writeIndirect8('${instruction.indirectRegister}', cpu.readIndirect8('${instruction.indirectRegister}') & ~${hex(1 << instruction.bit)});`];

  // --- Indexed CB (DD/FD CB d op) ---
  if (tag === 'indexed-cb-bit') {
    return [`cpu.testBit(cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement}), ${instruction.bit});`];
  }
  if (tag === 'indexed-cb-rotate') {
    return [
      '{',
      `  const value = cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement});`,
      `  const result = cpu.rotateShift8('${instruction.operation}', value);`,
      `  cpu.writeIndexed8('${instruction.indexRegister}', ${instruction.displacement}, result);`,
      '}',
    ];
  }
  if (tag === 'indexed-cb-res' || tag === 'indexed-cb-set') {
    const operator = tag === 'indexed-cb-res' ? '& ~' : '| ';
    return [
      '{',
      `  const value = cpu.readIndexed8('${instruction.indexRegister}', ${instruction.displacement});`,
      `  const result = value ${operator}${hex(1 << instruction.bit)};`,
      `  cpu.writeIndexed8('${instruction.indexRegister}', ${instruction.displacement}, result);`,
      '}',
    ];
  }

  // --- Rotate/Shift register ---
  if (tag === 'rotate-reg') return [`cpu.${instruction.reg} = cpu.rotateShift8('${instruction.op}', cpu.${instruction.reg});`];
  if (tag === 'rotate-ind') {
    return [
      '{',
      `  const value = cpu.readIndirect8('${instruction.indirectRegister}');`,
      `  const result = cpu.rotateShift8('${instruction.op}', value);`,
      `  cpu.writeIndirect8('${instruction.indirectRegister}', result);`,
      '}',
    ];
  }

  // --- Accumulator rotates ---
  if (tag === 'rlca') return ['cpu.a = cpu.rotateLeftCircular(cpu.a);'];
  if (tag === 'rrca') return ['cpu.a = cpu.rotateRightCircular(cpu.a);'];
  if (tag === 'rla') return ['cpu.a = cpu.rotateLeftThroughCarry(cpu.a);'];
  if (tag === 'rra') return ['cpu.a = cpu.rotateRightThroughCarry(cpu.a);'];

  // --- Exchange ---
  if (tag === 'exx') return ['cpu.swapMainAlternate();'];
  if (tag === 'ex-af') return ['cpu.swapAf();'];
  if (tag === 'ex-de-hl') return ['{', '  const temp = cpu.de;', '  cpu.de = cpu.hl;', '  cpu.hl = temp;', '}'];
  if (tag === 'ex-sp-hl') {
    const r = getWordReadAccessor(instruction);
    const w = getWordWriteAccessor(instruction);
    return ['{', `  const v = cpu.${r}(cpu.sp);`, `  cpu.${w}(cpu.sp, cpu.hl);`, '  cpu.hl = v;', '}'];
  }
  if (tag === 'ex-sp-pair') {
    const r = getWordReadAccessor(instruction);
    const w = getWordWriteAccessor(instruction);
    return ['{', `  const v = cpu.${r}(cpu.sp);`, `  cpu.${w}(cpu.sp, cpu.${instruction.pair});`, `  cpu.${instruction.pair} = v;`, '}'];
  }

  // --- Flags ---
  if (tag === 'scf') return ['cpu.setCarryFlag();'];
  if (tag === 'ccf') return ['cpu.complementCarryFlag();'];
  if (tag === 'cpl') return ['cpu.a = (~cpu.a) & 0xff;', 'cpu.f |= 0x12;']; // set H and N
  if (tag === 'daa') return ['cpu.a = cpu.decimalAdjustAccumulator(cpu.a);'];
  if (tag === 'neg') return ['cpu.a = cpu.negate(cpu.a);'];

  // --- DI / EI ---
  if (tag === 'di') return ['cpu.iff1 = 0;', 'cpu.iff2 = 0;'];
  if (tag === 'ei') return ['cpu.iff1 = 1;', 'cpu.iff2 = 1;'];

  // --- Interrupt mode ---
  if (tag === 'im') return [`cpu.im = ${instruction.value};`];

  // --- Block transfer/compare ---
  if (tag === 'ldi') return ['cpu.ldi();'];
  if (tag === 'ldir') return ['cpu.ldir();'];
  if (tag === 'ldd') return ['cpu.ldd();'];
  if (tag === 'lddr') return ['cpu.lddr();'];
  if (tag === 'cpi') return ['cpu.cpi();'];
  if (tag === 'cpir') return ['cpu.cpir();'];
  if (tag === 'cpd') return ['cpu.cpd();'];
  if (tag === 'cpdr') return ['cpu.cpdr();'];

  // --- BCD rotate ---
  if (tag === 'rrd') return ['cpu.rrd();'];
  if (tag === 'rld') return ['cpu.rld();'];

  // --- Block I/O ---
  if (tag === 'ini') return ['cpu.ini();'];
  if (tag === 'ind') return ['cpu.ind();'];
  if (tag === 'outi') return ['cpu.outi();'];
  if (tag === 'outd') return ['cpu.outd();'];
  if (tag === 'inir') return ['cpu.inir();'];
  if (tag === 'indr') return ['cpu.indr();'];
  if (tag === 'otir') return ['cpu.otir();'];
  if (tag === 'otdr') return ['cpu.otdr();'];

  // --- I/O ---
  if (tag === 'in0') {
    if (instruction.reg === '(hl)') return [`cpu.ioReadPage0(${hex(instruction.port)});`];
    return [`cpu.${instruction.reg} = cpu.ioReadPage0(${hex(instruction.port)});`];
  }
  if (tag === 'out0') {
    if (instruction.reg === '(hl)') return [`cpu.ioWritePage0(${hex(instruction.port)}, cpu.readIndirect8('hl'));`];
    return [`cpu.ioWritePage0(${hex(instruction.port)}, cpu.${instruction.reg});`];
  }
  if (tag === 'in-reg') {
    if (instruction.reg === '(hl)') return ['cpu.ioRead(cpu.bc);'];
    return [`cpu.${instruction.reg} = cpu.ioRead(cpu.bc);`];
  }
  if (tag === 'out-reg') {
    if (instruction.reg === '(hl)') return ['cpu.ioWrite(cpu.bc, 0);'];
    return [`cpu.ioWrite(cpu.bc, cpu.${instruction.reg});`];
  }
  if (tag === 'in-imm') return [`cpu.a = cpu.ioReadImmediate(cpu.a, ${hex(instruction.port)});`];
  if (tag === 'out-imm') return [`cpu.ioWrite(${hex(instruction.port)}, cpu.a);`];

  // --- eZ80 specific ---
  if (tag === 'stmix') return ['cpu.madl = 1;'];
  if (tag === 'rsmix') return ['cpu.madl = 0;'];
  if (tag === 'mlt') return [`cpu.${instruction.reg} = cpu.multiplyBytes(cpu.${instruction.reg});`];
  if (tag === 'tst-reg') return [`cpu.test(cpu.a, cpu.${instruction.reg});`];
  if (tag === 'tst-ind') return ["cpu.test(cpu.a, cpu.readIndirect8('hl'));"];
  if (tag === 'tst-imm') return [`cpu.test(cpu.a, ${hex(instruction.value)});`];
  if (tag === 'tstio') return [`cpu.testIo(${hex(instruction.value)});`];
  if (tag === 'otimr') return ['cpu.otimr();'];
  if (tag === 'lea') {
    const op = instruction.displacement >= 0 ? '+' : '-';
    const mag = Math.abs(instruction.displacement);
    return [`cpu.${instruction.dest} = (cpu.${instruction.base} ${op} ${mag}) & cpu.addressMask;`];
  }

  // --- Fallback ---
  return [`cpu.unimplemented(${hex(instruction.pc, 6)}, ${JSON.stringify(instruction.dasm)});`];
}

// --- Block builder (unchanged from previous phases) ---

function buildBlock(startPc, mode, options) {
  const instructions = [];
  const exits = [];
  let currentPc = startPc;
  let currentMode = mode;

  for (let index = 0; index < options.instructionsPerBlock; index += 1) {
    if (currentPc >= romBytes.length) {
      break;
    }

    const instruction = decodeInstruction(currentPc, currentMode);
    instructions.push({
      ...instruction,
      js: emitInstructionJs(instruction),
    });

    if (instruction.kind === 'call') {
      exits.push({
        type: 'call',
        target: instruction.target,
        targetMode: instruction.targetMode,
      });
      exits.push({
        type: 'call-return',
        target: instruction.fallthrough,
        targetMode: currentMode,
      });
      break;
    }

    if (instruction.kind === 'branch') {
      exits.push({
        type: 'branch',
        condition: instruction.condition,
        target: instruction.target,
        targetMode: instruction.targetMode,
      });
      exits.push({
        type: 'fallthrough',
        target: instruction.fallthrough,
        targetMode: currentMode,
      });
      break;
    }

    if (instruction.kind === 'jump' || instruction.kind === 'jump-indirect') {
      if (instruction.target !== undefined) {
        exits.push({
          type: 'jump',
          target: instruction.target,
          targetMode: instruction.targetMode,
        });
      } else {
        exits.push({
          type: 'jump-indirect',
          via: instruction.indirectRegister,
        });
      }
      break;
    }

    if (instruction.kind === 'return' || instruction.kind === 'halt') {
      exits.push({
        type: instruction.kind,
      });
      break;
    }

    if (instruction.kind === 'return-conditional') {
      exits.push({
        type: 'return-conditional',
        condition: instruction.condition,
      });
      if (instruction.fallthrough !== undefined) {
        exits.push({
          type: 'fallthrough',
          target: instruction.fallthrough,
          targetMode: currentMode,
        });
      }
      break;
    }

    if (instruction.tag === 'unsupported') {
      exits.push({
        type: 'unsupported',
      });
      break;
    }

    currentPc = wrap24(currentPc + instruction.length);
    currentMode = instruction.nextMode;
  }

  const sourceLines = [`function block_${formatKey(startPc, mode).replace(':', '_')}(cpu) {`];

  for (const instruction of instructions) {
    sourceLines.push(`  // ${hex(instruction.pc, 6)}  ${instruction.bytes.padEnd(15)}  ${instruction.dasm}`);

    for (const line of instruction.js) {
      sourceLines.push(`  ${line}`);
    }
  }

  const lastInstruction = instructions.at(-1);

  if (lastInstruction && !lastInstruction.terminates && lastInstruction.kind !== 'call' && lastInstruction.tag !== 'unsupported') {
    const fallthrough = wrap24(lastInstruction.pc + lastInstruction.length);
    sourceLines.push(`  return ${hex(fallthrough, 6)};`);
    exits.push({
      type: 'fallthrough',
      target: fallthrough,
      targetMode: lastInstruction.nextMode,
    });
  }

  sourceLines.push('}');

  return {
    id: formatKey(startPc, mode),
    startPc,
    mode,
    instructionCount: instructions.length,
    instructions: instructions.map((instruction) => ({
      pc: instruction.pc,
      mode: instruction.mode,
      bytes: instruction.bytes,
      dasm: instruction.dasm,
      tag: instruction.tag,
      length: instruction.length,
      target: instruction.target,
      targetMode: instruction.targetMode,
      fallthrough: instruction.fallthrough,
    })),
    exits,
    source: sourceLines.join('\n'),
  };
}

// --- Block walker: seed-based reachability analysis ---

function walkBlocks() {
  const seedEntries = [];
  const knownEntryAnchors = [
    { pc: 0x000100, mode: 'adl' },
    { pc: 0x000658, mode: 'adl' },
    { pc: 0x000800, mode: 'adl' },
    { pc: 0x001afa, mode: 'adl' },
    { pc: 0x004000, mode: 'adl' },
    { pc: 0x020000, mode: 'adl' },
    { pc: 0x020110, mode: 'adl' },
    { pc: 0x021000, mode: 'adl' },
    { pc: 0x030000, mode: 'adl' },
    { pc: 0x040000, mode: 'adl' },
    // Phase 9A: additional seeds for coverage expansion
    // ISR handlers (RST vector table continuations)
    { pc: 0x000040, mode: 'adl' },
    { pc: 0x000048, mode: 'adl' },
    { pc: 0x000050, mode: 'adl' },
    { pc: 0x000058, mode: 'adl' },
    { pc: 0x000060, mode: 'adl' },
    { pc: 0x000068, mode: 'adl' },
    // Known OS jump table entries
    { pc: 0x020008, mode: 'adl' },
    { pc: 0x020010, mode: 'adl' },
    { pc: 0x020018, mode: 'adl' },
    { pc: 0x020020, mode: 'adl' },
    { pc: 0x020028, mode: 'adl' },
    { pc: 0x020030, mode: 'adl' },
    { pc: 0x020038, mode: 'adl' },
    { pc: 0x020040, mode: 'adl' },
    // Mid-ROM function regions
    { pc: 0x004100, mode: 'adl' },
    { pc: 0x004200, mode: 'adl' },
    { pc: 0x005000, mode: 'adl' },
    { pc: 0x008000, mode: 'adl' },
    { pc: 0x010000, mode: 'adl' },
    // Graphics/display routines
    { pc: 0x021100, mode: 'adl' },
    { pc: 0x021200, mode: 'adl' },
    { pc: 0x021400, mode: 'adl' },
    // Upper ROM regions
    { pc: 0x050000, mode: 'adl' },
    { pc: 0x060000, mode: 'adl' },
    { pc: 0x080000, mode: 'adl' },
    { pc: 0x0a0000, mode: 'adl' },
    { pc: 0x0c0000, mode: 'adl' },
    // Phase 10: seeds from coverage gap analysis (OS area gaps)
    { pc: 0x0dcdc6, mode: 'adl' },
    { pc: 0x0c0001, mode: 'adl' },
    { pc: 0x0d2afe, mode: 'adl' },
    { pc: 0x0712fa, mode: 'adl' },
    { pc: 0x015b46, mode: 'adl' },
    { pc: 0x01cbfe, mode: 'adl' },
    { pc: 0x02c0b7, mode: 'adl' },
    { pc: 0x063570, mode: 'adl' },
    { pc: 0x0bd424, mode: 'adl' },
    { pc: 0x0fdd04, mode: 'adl' },
    // Phase 11: dynamic jump targets from executor instrumentation (70 valid)
    { pc: 0x001afe, mode: 'adl' },
    { pc: 0x07f7cb, mode: 'adl' },
    { pc: 0x0801dd, mode: 'adl' },
    { pc: 0x0821b2, mode: 'adl' },
    { pc: 0x08226b, mode: 'adl' },
    { pc: 0x08226f, mode: 'adl' },
    { pc: 0x082294, mode: 'adl' },
    { pc: 0x082505, mode: 'adl' },
    { pc: 0x08250d, mode: 'adl' },
    { pc: 0x082515, mode: 'adl' },
    { pc: 0x08251d, mode: 'adl' },
    { pc: 0x082525, mode: 'adl' },
    { pc: 0x08252d, mode: 'adl' },
    { pc: 0x082535, mode: 'adl' },
    { pc: 0x08253d, mode: 'adl' },
    { pc: 0x082545, mode: 'adl' },
    { pc: 0x08254d, mode: 'adl' },
    { pc: 0x082555, mode: 'adl' },
    { pc: 0x08255d, mode: 'adl' },
    { pc: 0x082565, mode: 'adl' },
    { pc: 0x08256d, mode: 'adl' },
    { pc: 0x082575, mode: 'adl' },
    { pc: 0x08257d, mode: 'adl' },
    { pc: 0x082585, mode: 'adl' },
    { pc: 0x08258d, mode: 'adl' },
    { pc: 0x082595, mode: 'adl' },
    { pc: 0x08259d, mode: 'adl' },
    { pc: 0x0825a5, mode: 'adl' },
    { pc: 0x0825ad, mode: 'adl' },
    { pc: 0x0825b5, mode: 'adl' },
    { pc: 0x0825bd, mode: 'adl' },
    { pc: 0x0825c5, mode: 'adl' },
    { pc: 0x0825cd, mode: 'adl' },
    { pc: 0x082606, mode: 'adl' },
    { pc: 0x082641, mode: 'adl' },
    { pc: 0x082681, mode: 'adl' },
    { pc: 0x08268c, mode: 'adl' },
    { pc: 0x082696, mode: 'adl' },
    { pc: 0x08269f, mode: 'adl' },
    { pc: 0x0826a7, mode: 'adl' },
    { pc: 0x0826e6, mode: 'adl' },
    { pc: 0x0826ef, mode: 'adl' },
    { pc: 0x0826f5, mode: 'adl' },
    { pc: 0x0826f9, mode: 'adl' },
    { pc: 0x0826fd, mode: 'adl' },
    { pc: 0x082717, mode: 'adl' },
    { pc: 0x082750, mode: 'adl' },
    { pc: 0x082754, mode: 'adl' },
    { pc: 0x08276e, mode: 'adl' },
    { pc: 0x08277c, mode: 'adl' },
    { pc: 0x082788, mode: 'adl' },
    { pc: 0x0827a5, mode: 'adl' },
    { pc: 0x0827aa, mode: 'adl' },
    { pc: 0x0827b0, mode: 'adl' },
    { pc: 0x0827d7, mode: 'adl' },
    { pc: 0x0827df, mode: 'adl' },
    { pc: 0x0827e7, mode: 'adl' },
    { pc: 0x0827ef, mode: 'adl' },
    { pc: 0x0827f7, mode: 'adl' },
    { pc: 0x0827ff, mode: 'adl' },
    { pc: 0x082807, mode: 'adl' },
    { pc: 0x08280f, mode: 'adl' },
    { pc: 0x082817, mode: 'adl' },
    { pc: 0x08281f, mode: 'adl' },
    { pc: 0x082855, mode: 'adl' },
    { pc: 0x08285c, mode: 'adl' },
    { pc: 0x082863, mode: 'adl' },
    { pc: 0x082883, mode: 'adl' },
    { pc: 0x082c09, mode: 'adl' },
    { pc: 0x082c10, mode: 'adl' },
    // Phase 22: OS jump table missing implementations (170 seeds)
    { pc: 0x0242fb, mode: 'adl' }, { pc: 0x0243c9, mode: 'adl' },
    { pc: 0x026dc9, mode: 'adl' }, { pc: 0x026dca, mode: 'adl' },
    { pc: 0x0287ea, mode: 'adl' }, { pc: 0x03d69c, mode: 'adl' },
    { pc: 0x03f1db, mode: 'adl' }, { pc: 0x045230, mode: 'adl' },
    { pc: 0x04e958, mode: 'adl' }, { pc: 0x056afe, mode: 'adl' },
    { pc: 0x05da51, mode: 'adl' }, { pc: 0x05daa5, mode: 'adl' },
    { pc: 0x05dac3, mode: 'adl' }, { pc: 0x05db12, mode: 'adl' },
    { pc: 0x05db2e, mode: 'adl' }, { pc: 0x05db45, mode: 'adl' },
    { pc: 0x05dba5, mode: 'adl' }, { pc: 0x05dbf0, mode: 'adl' },
    { pc: 0x05dc04, mode: 'adl' }, { pc: 0x05dd96, mode: 'adl' },
    { pc: 0x05ddd7, mode: 'adl' }, { pc: 0x05de59, mode: 'adl' },
    { pc: 0x05e062, mode: 'adl' }, { pc: 0x05e39e, mode: 'adl' },
    { pc: 0x05e849, mode: 'adl' }, { pc: 0x05e8b6, mode: 'adl' },
    { pc: 0x05f4e3, mode: 'adl' }, { pc: 0x05f515, mode: 'adl' },
    { pc: 0x05f51b, mode: 'adl' }, { pc: 0x05f61f, mode: 'adl' },
    { pc: 0x060f85, mode: 'adl' }, { pc: 0x061d6a, mode: 'adl' },
    { pc: 0x061d6e, mode: 'adl' }, { pc: 0x061da6, mode: 'adl' },
    { pc: 0x061dee, mode: 'adl' }, { pc: 0x06829e, mode: 'adl' },
    { pc: 0x069bfe, mode: 'adl' }, { pc: 0x06abf6, mode: 'adl' },
    { pc: 0x06ad37, mode: 'adl' }, { pc: 0x06cc7f, mode: 'adl' },
    { pc: 0x06e02d, mode: 'adl' }, { pc: 0x06ed3d, mode: 'adl' },
    { pc: 0x06f461, mode: 'adl' }, { pc: 0x06f4c3, mode: 'adl' },
    { pc: 0x06f4d9, mode: 'adl' }, { pc: 0x07bfc5, mode: 'adl' },
    { pc: 0x07bfc9, mode: 'adl' }, { pc: 0x07bfdc, mode: 'adl' },
    { pc: 0x07c43c, mode: 'adl' }, { pc: 0x07c4a8, mode: 'adl' },
    { pc: 0x07c4ca, mode: 'adl' }, { pc: 0x07c4d6, mode: 'adl' },
    { pc: 0x07ec12, mode: 'adl' }, { pc: 0x07ec18, mode: 'adl' },
    { pc: 0x07ec25, mode: 'adl' }, { pc: 0x07f043, mode: 'adl' },
    { pc: 0x07f19f, mode: 'adl' }, { pc: 0x07f1a8, mode: 'adl' },
    { pc: 0x07f1d5, mode: 'adl' }, { pc: 0x07f1dc, mode: 'adl' },
    { pc: 0x07f813, mode: 'adl' }, { pc: 0x07f8e4, mode: 'adl' },
    { pc: 0x07f926, mode: 'adl' }, { pc: 0x07f9e3, mode: 'adl' },
    { pc: 0x07f9e9, mode: 'adl' }, { pc: 0x07fa4c, mode: 'adl' },
    { pc: 0x07fa5c, mode: 'adl' }, { pc: 0x07fb05, mode: 'adl' },
    { pc: 0x07fb06, mode: 'adl' }, { pc: 0x07fce8, mode: 'adl' },
    { pc: 0x07fd04, mode: 'adl' }, { pc: 0x07fe1e, mode: 'adl' },
    { pc: 0x08017c, mode: 'adl' }, { pc: 0x080395, mode: 'adl' },
    { pc: 0x080aaf, mode: 'adl' }, { pc: 0x081670, mode: 'adl' },
    { pc: 0x0822c6, mode: 'adl' }, { pc: 0x08243c, mode: 'adl' },
    { pc: 0x0828a7, mode: 'adl' }, { pc: 0x082930, mode: 'adl' },
    { pc: 0x08297e, mode: 'adl' }, { pc: 0x0829f8, mode: 'adl' },
    { pc: 0x082a1a, mode: 'adl' }, { pc: 0x082a2c, mode: 'adl' },
    { pc: 0x082a32, mode: 'adl' }, { pc: 0x082a40, mode: 'adl' },
    { pc: 0x082a46, mode: 'adl' }, { pc: 0x082a52, mode: 'adl' },
    { pc: 0x082a5e, mode: 'adl' }, { pc: 0x082a76, mode: 'adl' },
    { pc: 0x082aa4, mode: 'adl' }, { pc: 0x082aaa, mode: 'adl' },
    { pc: 0x082b2b, mode: 'adl' }, { pc: 0x082b49, mode: 'adl' },
    { pc: 0x082b4f, mode: 'adl' }, { pc: 0x082b87, mode: 'adl' },
    { pc: 0x082ba1, mode: 'adl' }, { pc: 0x08a88e, mode: 'adl' },
    { pc: 0x095d77, mode: 'adl' }, { pc: 0x096af2, mode: 'adl' },
    { pc: 0x09753f, mode: 'adl' }, { pc: 0x097573, mode: 'adl' },
    { pc: 0x0975aa, mode: 'adl' }, { pc: 0x0976ed, mode: 'adl' },
    { pc: 0x097703, mode: 'adl' }, { pc: 0x097811, mode: 'adl' },
    { pc: 0x097ac8, mode: 'adl' }, { pc: 0x098320, mode: 'adl' },
    { pc: 0x098342, mode: 'adl' }, { pc: 0x098355, mode: 'adl' },
    { pc: 0x09836d, mode: 'adl' }, { pc: 0x098383, mode: 'adl' },
    { pc: 0x099211, mode: 'adl' }, { pc: 0x09927f, mode: 'adl' },
    { pc: 0x099283, mode: 'adl' }, { pc: 0x099491, mode: 'adl' },
    { pc: 0x099910, mode: 'adl' }, { pc: 0x099aa3, mode: 'adl' },
    { pc: 0x099eb2, mode: 'adl' }, { pc: 0x09ac5e, mode: 'adl' },
    { pc: 0x09b276, mode: 'adl' }, { pc: 0x09b280, mode: 'adl' },
    { pc: 0x09b9c4, mode: 'adl' }, { pc: 0x09b9f3, mode: 'adl' },
    { pc: 0x09ba59, mode: 'adl' }, { pc: 0x09d50f, mode: 'adl' },
    { pc: 0x09db67, mode: 'adl' }, { pc: 0x0a1ecb, mode: 'adl' },
    { pc: 0x0a20f5, mode: 'adl' }, { pc: 0x0a215b, mode: 'adl' },
    { pc: 0x0a2172, mode: 'adl' }, { pc: 0x0a27a8, mode: 'adl' },
    { pc: 0x0a29fe, mode: 'adl' }, { pc: 0x0a2a28, mode: 'adl' },
    { pc: 0x0a2a4b, mode: 'adl' }, { pc: 0x0a2c6c, mode: 'adl' },
    { pc: 0x0a2d6d, mode: 'adl' }, { pc: 0x0a3145, mode: 'adl' },
    { pc: 0x0a32af, mode: 'adl' }, { pc: 0x0a34b3, mode: 'adl' },
    { pc: 0x0a3526, mode: 'adl' }, { pc: 0x0a53ff, mode: 'adl' },
    { pc: 0x0a545b, mode: 'adl' }, { pc: 0x0a582a, mode: 'adl' },
    { pc: 0x0a75e3, mode: 'adl' }, { pc: 0x0a75fd, mode: 'adl' },
    { pc: 0x0a9325, mode: 'adl' }, { pc: 0x0ab21b, mode: 'adl' },
    { pc: 0x0ab4e0, mode: 'adl' }, { pc: 0x0ac2cb, mode: 'adl' },
    { pc: 0x0acc4c, mode: 'adl' }, { pc: 0x0acef7, mode: 'adl' },
    { pc: 0x0ad44b, mode: 'adl' }, { pc: 0x0af949, mode: 'adl' },
    { pc: 0x0b007a, mode: 'adl' }, { pc: 0x0b0978, mode: 'adl' },
    { pc: 0x0b0c8b, mode: 'adl' }, { pc: 0x0b0cff, mode: 'adl' },
    { pc: 0x0b0ddb, mode: 'adl' }, { pc: 0x0b0dee, mode: 'adl' },
    { pc: 0x0b0dff, mode: 'adl' }, { pc: 0x0b0fc1, mode: 'adl' },
    { pc: 0x0b119d, mode: 'adl' }, { pc: 0x0b1485, mode: 'adl' },
    { pc: 0x0b15a0, mode: 'adl' }, { pc: 0x0b1729, mode: 'adl' },
    { pc: 0x0b19c7, mode: 'adl' }, { pc: 0x0b2a15, mode: 'adl' },
    { pc: 0x0b37f9, mode: 'adl' }, { pc: 0x0b52e1, mode: 'adl' },
    // Phase 22B: prologue-scan seeds for uncovered OS regions (2025 seeds)
    { pc: 0x000ddd, mode: 'adl' },
    { pc: 0x001459, mode: 'adl' },
    { pc: 0x001474, mode: 'adl' },
    { pc: 0x001f28, mode: 'adl' },
    { pc: 0x001f95, mode: 'adl' },
    { pc: 0x001fba, mode: 'adl' },
    { pc: 0x002010, mode: 'adl' },
    { pc: 0x002011, mode: 'adl' },
    { pc: 0x002077, mode: 'adl' },
    { pc: 0x002079, mode: 'adl' },
    { pc: 0x00207a, mode: 'adl' },
    { pc: 0x0020b4, mode: 'adl' },
    { pc: 0x0020b5, mode: 'adl' },
    { pc: 0x0020e7, mode: 'adl' },
    { pc: 0x0020e9, mode: 'adl' },
    { pc: 0x0020ea, mode: 'adl' },
    { pc: 0x002153, mode: 'adl' },
    { pc: 0x002155, mode: 'adl' },
    { pc: 0x002156, mode: 'adl' },
    { pc: 0x0021ce, mode: 'adl' },
    { pc: 0x002234, mode: 'adl' },
    { pc: 0x002361, mode: 'adl' },
    { pc: 0x002374, mode: 'adl' },
    { pc: 0x0023c3, mode: 'adl' },
    { pc: 0x0023c4, mode: 'adl' },
    { pc: 0x0023d8, mode: 'adl' },
    { pc: 0x002406, mode: 'adl' },
    { pc: 0x002408, mode: 'adl' },
    { pc: 0x002410, mode: 'adl' },
    { pc: 0x00243c, mode: 'adl' },
    { pc: 0x00244b, mode: 'adl' },
    { pc: 0x0024c7, mode: 'adl' },
    { pc: 0x0024e7, mode: 'adl' },
    { pc: 0x0024e8, mode: 'adl' },
    { pc: 0x002512, mode: 'adl' },
    { pc: 0x002514, mode: 'adl' },
    { pc: 0x002522, mode: 'adl' },
    { pc: 0x002588, mode: 'adl' },
    { pc: 0x0025ac, mode: 'adl' },
    { pc: 0x0025bb, mode: 'adl' },
    { pc: 0x0025f5, mode: 'adl' },
    { pc: 0x00265d, mode: 'adl' },
    { pc: 0x00265f, mode: 'adl' },
    { pc: 0x002660, mode: 'adl' },
    { pc: 0x0026a5, mode: 'adl' },
    { pc: 0x0026bd, mode: 'adl' },
    { pc: 0x0026be, mode: 'adl' },
    { pc: 0x0026db, mode: 'adl' },
    { pc: 0x002745, mode: 'adl' },
    { pc: 0x002754, mode: 'adl' },
    { pc: 0x002794, mode: 'adl' },
    { pc: 0x00288a, mode: 'adl' },
    { pc: 0x0028a5, mode: 'adl' },
    { pc: 0x0028ae, mode: 'adl' },
    { pc: 0x0028d2, mode: 'adl' },
    { pc: 0x0028db, mode: 'adl' },
    { pc: 0x0029fe, mode: 'adl' },
    { pc: 0x002a2f, mode: 'adl' },
    { pc: 0x002a64, mode: 'adl' },
    { pc: 0x002aab, mode: 'adl' },
    { pc: 0x002adc, mode: 'adl' },
    { pc: 0x002aff, mode: 'adl' },
    { pc: 0x002b34, mode: 'adl' },
    { pc: 0x002b44, mode: 'adl' },
    { pc: 0x002b5c, mode: 'adl' },
    { pc: 0x0034a7, mode: 'adl' },
    { pc: 0x0034cc, mode: 'adl' },
    { pc: 0x0034ee, mode: 'adl' },
    { pc: 0x003569, mode: 'adl' },
    { pc: 0x003580, mode: 'adl' },
    { pc: 0x00358f, mode: 'adl' },
    { pc: 0x003590, mode: 'adl' },
    { pc: 0x0035e5, mode: 'adl' },
    { pc: 0x0035e7, mode: 'adl' },
    { pc: 0x0035e9, mode: 'adl' },
    { pc: 0x003655, mode: 'adl' },
    { pc: 0x003663, mode: 'adl' },
    { pc: 0x00366c, mode: 'adl' },
    { pc: 0x00372b, mode: 'adl' },
    { pc: 0x00372d, mode: 'adl' },
    { pc: 0x003818, mode: 'adl' },
    { pc: 0x006369, mode: 'adl' },
    { pc: 0x00640b, mode: 'adl' },
    { pc: 0x00658e, mode: 'adl' },
    { pc: 0x006667, mode: 'adl' },
    { pc: 0x0068a5, mode: 'adl' },
    { pc: 0x006d6d, mode: 'adl' },
    { pc: 0x006fd1, mode: 'adl' },
    { pc: 0x006fe9, mode: 'adl' },
    { pc: 0x007001, mode: 'adl' },
    { pc: 0x007003, mode: 'adl' },
    { pc: 0x00702f, mode: 'adl' },
    { pc: 0x007038, mode: 'adl' },
    { pc: 0x00704e, mode: 'adl' },
    { pc: 0x007057, mode: 'adl' },
    { pc: 0x007084, mode: 'adl' },
    { pc: 0x0070c0, mode: 'adl' },
    { pc: 0x0070fc, mode: 'adl' },
    { pc: 0x007235, mode: 'adl' },
    { pc: 0x007265, mode: 'adl' },
    { pc: 0x007295, mode: 'adl' },
    { pc: 0x0072c5, mode: 'adl' },
    { pc: 0x007349, mode: 'adl' },
    { pc: 0x007379, mode: 'adl' },
    { pc: 0x0073a9, mode: 'adl' },
    { pc: 0x0073d9, mode: 'adl' },
    { pc: 0x0075d7, mode: 'adl' },
    { pc: 0x007619, mode: 'adl' },
    { pc: 0x00764e, mode: 'adl' },
    { pc: 0x00770d, mode: 'adl' },
    { pc: 0x0078e4, mode: 'adl' },
    { pc: 0x007937, mode: 'adl' },
    { pc: 0x007c11, mode: 'adl' },
    { pc: 0x007c31, mode: 'adl' },
    { pc: 0x007c51, mode: 'adl' },
    { pc: 0x007e0f, mode: 'adl' },
    { pc: 0x007e84, mode: 'adl' },
    { pc: 0x007ef9, mode: 'adl' },
    { pc: 0x007f6e, mode: 'adl' },
    { pc: 0x008058, mode: 'adl' },
    { pc: 0x0080cd, mode: 'adl' },
    { pc: 0x008142, mode: 'adl' },
    { pc: 0x0081b7, mode: 'adl' },
    { pc: 0x008381, mode: 'adl' },
    { pc: 0x00b4ba, mode: 'adl' },
    { pc: 0x00b586, mode: 'adl' },
    { pc: 0x00fbc2, mode: 'adl' },
    { pc: 0x010d23, mode: 'adl' },
    { pc: 0x013b94, mode: 'adl' },
    { pc: 0x013bc4, mode: 'adl' },
    { pc: 0x013bdf, mode: 'adl' },
    { pc: 0x013c48, mode: 'adl' },
    { pc: 0x013c78, mode: 'adl' },
    { pc: 0x013c93, mode: 'adl' },
    { pc: 0x013e9d, mode: 'adl' },
    { pc: 0x013ef3, mode: 'adl' },
    { pc: 0x013f0e, mode: 'adl' },
    { pc: 0x013fb6, mode: 'adl' },
    { pc: 0x013fb8, mode: 'adl' },
    { pc: 0x0140a2, mode: 'adl' },
    { pc: 0x0140bd, mode: 'adl' },
    { pc: 0x014137, mode: 'adl' },
    { pc: 0x014152, mode: 'adl' },
    { pc: 0x014885, mode: 'adl' },
    { pc: 0x0148b5, mode: 'adl' },
    { pc: 0x0148d0, mode: 'adl' },
    { pc: 0x0149a1, mode: 'adl' },
    { pc: 0x0149a3, mode: 'adl' },
    { pc: 0x01586c, mode: 'adl' },
    { pc: 0x015875, mode: 'adl' },
    { pc: 0x015876, mode: 'adl' },
    { pc: 0x0159c0, mode: 'adl' },
    { pc: 0x016000, mode: 'adl' },
    { pc: 0x016100, mode: 'adl' },
    { pc: 0x016200, mode: 'adl' },
    { pc: 0x016300, mode: 'adl' },
    { pc: 0x016400, mode: 'adl' },
    { pc: 0x016500, mode: 'adl' },
    { pc: 0x016600, mode: 'adl' },
    { pc: 0x016700, mode: 'adl' },
    { pc: 0x016800, mode: 'adl' },
    { pc: 0x016900, mode: 'adl' },
    { pc: 0x016a00, mode: 'adl' },
    { pc: 0x016b00, mode: 'adl' },
    { pc: 0x016c00, mode: 'adl' },
    { pc: 0x016d00, mode: 'adl' },
    { pc: 0x016e00, mode: 'adl' },
    { pc: 0x016f00, mode: 'adl' },
    { pc: 0x017000, mode: 'adl' },
    { pc: 0x017100, mode: 'adl' },
    { pc: 0x017200, mode: 'adl' },
    { pc: 0x017300, mode: 'adl' },
    { pc: 0x017400, mode: 'adl' },
    { pc: 0x017500, mode: 'adl' },
    { pc: 0x017600, mode: 'adl' },
    { pc: 0x017700, mode: 'adl' },
    { pc: 0x017800, mode: 'adl' },
    { pc: 0x017900, mode: 'adl' },
    { pc: 0x017a00, mode: 'adl' },
    { pc: 0x017b00, mode: 'adl' },
    { pc: 0x017c00, mode: 'adl' },
    { pc: 0x017d00, mode: 'adl' },
    { pc: 0x017e00, mode: 'adl' },
    { pc: 0x017f00, mode: 'adl' },
    { pc: 0x018000, mode: 'adl' },
    { pc: 0x018100, mode: 'adl' },
    { pc: 0x018200, mode: 'adl' },
    { pc: 0x018300, mode: 'adl' },
    { pc: 0x018400, mode: 'adl' },
    { pc: 0x018500, mode: 'adl' },
    { pc: 0x018600, mode: 'adl' },
    { pc: 0x018700, mode: 'adl' },
    { pc: 0x018800, mode: 'adl' },
    { pc: 0x018900, mode: 'adl' },
    { pc: 0x018a00, mode: 'adl' },
    { pc: 0x018b00, mode: 'adl' },
    { pc: 0x018c00, mode: 'adl' },
    { pc: 0x018d00, mode: 'adl' },
    { pc: 0x018e00, mode: 'adl' },
    { pc: 0x018f00, mode: 'adl' },
    { pc: 0x019000, mode: 'adl' },
    { pc: 0x019100, mode: 'adl' },
    { pc: 0x019200, mode: 'adl' },
    { pc: 0x019300, mode: 'adl' },
    { pc: 0x019400, mode: 'adl' },
    { pc: 0x019500, mode: 'adl' },
    { pc: 0x019600, mode: 'adl' },
    { pc: 0x019700, mode: 'adl' },
    { pc: 0x019800, mode: 'adl' },
    { pc: 0x019900, mode: 'adl' },
    { pc: 0x019a00, mode: 'adl' },
    { pc: 0x019b00, mode: 'adl' },
    { pc: 0x019c00, mode: 'adl' },
    { pc: 0x019d00, mode: 'adl' },
    { pc: 0x019e00, mode: 'adl' },
    { pc: 0x019f00, mode: 'adl' },
    { pc: 0x01a000, mode: 'adl' },
    { pc: 0x01a100, mode: 'adl' },
    { pc: 0x01a200, mode: 'adl' },
    { pc: 0x01a300, mode: 'adl' },
    { pc: 0x01a400, mode: 'adl' },
    { pc: 0x01a500, mode: 'adl' },
    { pc: 0x01a600, mode: 'adl' },
    { pc: 0x01a700, mode: 'adl' },
    { pc: 0x01a800, mode: 'adl' },
    { pc: 0x01a900, mode: 'adl' },
    { pc: 0x01aa00, mode: 'adl' },
    { pc: 0x01ab00, mode: 'adl' },
    { pc: 0x01ac00, mode: 'adl' },
    { pc: 0x01ad00, mode: 'adl' },
    { pc: 0x01ae00, mode: 'adl' },
    { pc: 0x01af00, mode: 'adl' },
    { pc: 0x01b000, mode: 'adl' },
    { pc: 0x01b100, mode: 'adl' },
    { pc: 0x01b200, mode: 'adl' },
    { pc: 0x01b300, mode: 'adl' },
    { pc: 0x01b400, mode: 'adl' },
    { pc: 0x01b500, mode: 'adl' },
    { pc: 0x01b600, mode: 'adl' },
    { pc: 0x01b700, mode: 'adl' },
    { pc: 0x01b800, mode: 'adl' },
    { pc: 0x01b900, mode: 'adl' },
    { pc: 0x01ba00, mode: 'adl' },
    { pc: 0x01bb00, mode: 'adl' },
    { pc: 0x01bc00, mode: 'adl' },
    { pc: 0x01bd00, mode: 'adl' },
    { pc: 0x01be00, mode: 'adl' },
    { pc: 0x01bf00, mode: 'adl' },
    { pc: 0x01c000, mode: 'adl' },
    { pc: 0x01c100, mode: 'adl' },
    { pc: 0x01c200, mode: 'adl' },
    { pc: 0x01c300, mode: 'adl' },
    { pc: 0x01c400, mode: 'adl' },
    { pc: 0x01c500, mode: 'adl' },
    { pc: 0x01c600, mode: 'adl' },
    { pc: 0x01c700, mode: 'adl' },
    { pc: 0x01c800, mode: 'adl' },
    { pc: 0x01c900, mode: 'adl' },
    { pc: 0x01ca00, mode: 'adl' },
    { pc: 0x01cb00, mode: 'adl' },
    { pc: 0x01cc00, mode: 'adl' },
    { pc: 0x01cd00, mode: 'adl' },
    { pc: 0x01ce00, mode: 'adl' },
    { pc: 0x01cf00, mode: 'adl' },
    { pc: 0x01d000, mode: 'adl' },
    { pc: 0x01d100, mode: 'adl' },
    { pc: 0x01d200, mode: 'adl' },
    { pc: 0x01d300, mode: 'adl' },
    { pc: 0x01d400, mode: 'adl' },
    { pc: 0x01d500, mode: 'adl' },
    { pc: 0x01d600, mode: 'adl' },
    { pc: 0x01d700, mode: 'adl' },
    { pc: 0x01d800, mode: 'adl' },
    { pc: 0x01d900, mode: 'adl' },
    { pc: 0x01da00, mode: 'adl' },
    { pc: 0x01db00, mode: 'adl' },
    { pc: 0x01dc00, mode: 'adl' },
    { pc: 0x01dd00, mode: 'adl' },
    { pc: 0x01de00, mode: 'adl' },
    { pc: 0x01df00, mode: 'adl' },
    { pc: 0x01e000, mode: 'adl' },
    { pc: 0x01e100, mode: 'adl' },
    { pc: 0x01e200, mode: 'adl' },
    { pc: 0x01e300, mode: 'adl' },
    { pc: 0x01e400, mode: 'adl' },
    { pc: 0x01e500, mode: 'adl' },
    { pc: 0x01e600, mode: 'adl' },
    { pc: 0x01e700, mode: 'adl' },
    { pc: 0x01e800, mode: 'adl' },
    { pc: 0x01e900, mode: 'adl' },
    { pc: 0x01ea00, mode: 'adl' },
    { pc: 0x01eb00, mode: 'adl' },
    { pc: 0x01ec00, mode: 'adl' },
    { pc: 0x01ed00, mode: 'adl' },
    { pc: 0x01ee00, mode: 'adl' },
    { pc: 0x01ef00, mode: 'adl' },
    { pc: 0x01f000, mode: 'adl' },
    { pc: 0x01f100, mode: 'adl' },
    { pc: 0x01f200, mode: 'adl' },
    { pc: 0x01f300, mode: 'adl' },
    { pc: 0x01f400, mode: 'adl' },
    { pc: 0x01f500, mode: 'adl' },
    { pc: 0x01f600, mode: 'adl' },
    { pc: 0x01f700, mode: 'adl' },
    { pc: 0x01f800, mode: 'adl' },
    { pc: 0x01f900, mode: 'adl' },
    { pc: 0x01fa00, mode: 'adl' },
    { pc: 0x01fb00, mode: 'adl' },
    { pc: 0x01fc00, mode: 'adl' },
    { pc: 0x01fd00, mode: 'adl' },
    { pc: 0x01fe00, mode: 'adl' },
    { pc: 0x01ff00, mode: 'adl' },
    { pc: 0x022540, mode: 'adl' },
    { pc: 0x0225db, mode: 'adl' },
    { pc: 0x022603, mode: 'adl' },
    { pc: 0x022606, mode: 'adl' },
    { pc: 0x022e73, mode: 'adl' },
    { pc: 0x022e84, mode: 'adl' },
    { pc: 0x022eb1, mode: 'adl' },
    { pc: 0x022ef6, mode: 'adl' },
    { pc: 0x02318a, mode: 'adl' },
    { pc: 0x0231a2, mode: 'adl' },
    { pc: 0x02320f, mode: 'adl' },
    { pc: 0x02323b, mode: 'adl' },
    { pc: 0x023260, mode: 'adl' },
    { pc: 0x023269, mode: 'adl' },
    { pc: 0x02326a, mode: 'adl' },
    { pc: 0x02326d, mode: 'adl' },
    { pc: 0x0233e9, mode: 'adl' },
    { pc: 0x02344d, mode: 'adl' },
    { pc: 0x023462, mode: 'adl' },
    { pc: 0x0234a7, mode: 'adl' },
    { pc: 0x02354d, mode: 'adl' },
    { pc: 0x02356d, mode: 'adl' },
    { pc: 0x023574, mode: 'adl' },
    { pc: 0x023588, mode: 'adl' },
    { pc: 0x0235d6, mode: 'adl' },
    { pc: 0x0235e8, mode: 'adl' },
    { pc: 0x0235eb, mode: 'adl' },
    { pc: 0x02364f, mode: 'adl' },
    { pc: 0x02366c, mode: 'adl' },
    { pc: 0x0239b3, mode: 'adl' },
    { pc: 0x0239b5, mode: 'adl' },
    { pc: 0x023ab8, mode: 'adl' },
    { pc: 0x023aba, mode: 'adl' },
    { pc: 0x023d00, mode: 'adl' },
    { pc: 0x023d4e, mode: 'adl' },
    { pc: 0x023d6e, mode: 'adl' },
    { pc: 0x023ea6, mode: 'adl' },
    { pc: 0x023ec5, mode: 'adl' },
    { pc: 0x023fb6, mode: 'adl' },
    { pc: 0x024000, mode: 'adl' },
    { pc: 0x024013, mode: 'adl' },
    { pc: 0x024043, mode: 'adl' },
    { pc: 0x024060, mode: 'adl' },
    { pc: 0x02407f, mode: 'adl' },
    { pc: 0x0240a5, mode: 'adl' },
    { pc: 0x0240ae, mode: 'adl' },
    { pc: 0x024393, mode: 'adl' },
    { pc: 0x024479, mode: 'adl' },
    { pc: 0x0245ae, mode: 'adl' },
    { pc: 0x0245b0, mode: 'adl' },
    { pc: 0x02474c, mode: 'adl' },
    { pc: 0x02483c, mode: 'adl' },
    { pc: 0x024861, mode: 'adl' },
    { pc: 0x0248ce, mode: 'adl' },
    { pc: 0x02493b, mode: 'adl' },
    { pc: 0x024976, mode: 'adl' },
    { pc: 0x02499b, mode: 'adl' },
    { pc: 0x024a2f, mode: 'adl' },
    { pc: 0x024a5b, mode: 'adl' },
    { pc: 0x024a75, mode: 'adl' },
    { pc: 0x024a80, mode: 'adl' },
    { pc: 0x024b0d, mode: 'adl' },
    { pc: 0x024c10, mode: 'adl' },
    { pc: 0x024c91, mode: 'adl' },
    { pc: 0x024c9a, mode: 'adl' },
    { pc: 0x024cb2, mode: 'adl' },
    { pc: 0x024d38, mode: 'adl' },
    { pc: 0x024d63, mode: 'adl' },
    { pc: 0x024d71, mode: 'adl' },
    { pc: 0x024db3, mode: 'adl' },
    { pc: 0x024dbc, mode: 'adl' },
    { pc: 0x024e04, mode: 'adl' },
    { pc: 0x024e19, mode: 'adl' },
    { pc: 0x024e22, mode: 'adl' },
    { pc: 0x024f73, mode: 'adl' },
    { pc: 0x024f8b, mode: 'adl' },
    { pc: 0x024fb2, mode: 'adl' },
    { pc: 0x025013, mode: 'adl' },
    { pc: 0x0251d0, mode: 'adl' },
    { pc: 0x02528d, mode: 'adl' },
    { pc: 0x02542d, mode: 'adl' },
    { pc: 0x025455, mode: 'adl' },
    { pc: 0x025479, mode: 'adl' },
    { pc: 0x0254c5, mode: 'adl' },
    { pc: 0x02559d, mode: 'adl' },
    { pc: 0x0255b0, mode: 'adl' },
    { pc: 0x025607, mode: 'adl' },
    { pc: 0x025608, mode: 'adl' },
    { pc: 0x025639, mode: 'adl' },
    { pc: 0x02566f, mode: 'adl' },
    { pc: 0x02568d, mode: 'adl' },
    { pc: 0x02568e, mode: 'adl' },
    { pc: 0x0256e9, mode: 'adl' },
    { pc: 0x02573c, mode: 'adl' },
    { pc: 0x02573e, mode: 'adl' },
    { pc: 0x0261a8, mode: 'adl' },
    { pc: 0x026a5c, mode: 'adl' },
    { pc: 0x027306, mode: 'adl' },
    { pc: 0x027319, mode: 'adl' },
    { pc: 0x027324, mode: 'adl' },
    { pc: 0x02739a, mode: 'adl' },
    { pc: 0x02762e, mode: 'adl' },
    { pc: 0x027641, mode: 'adl' },
    { pc: 0x028083, mode: 'adl' },
    { pc: 0x028145, mode: 'adl' },
    { pc: 0x028215, mode: 'adl' },
    { pc: 0x02846f, mode: 'adl' },
    { pc: 0x029386, mode: 'adl' },
    { pc: 0x029388, mode: 'adl' },
    { pc: 0x03267b, mode: 'adl' },
    { pc: 0x032aa5, mode: 'adl' },
    { pc: 0x032e6a, mode: 'adl' },
    { pc: 0x033bb6, mode: 'adl' },
    { pc: 0x033bd3, mode: 'adl' },
    { pc: 0x03ceb7, mode: 'adl' },
    { pc: 0x03d1d2, mode: 'adl' },
    { pc: 0x03d296, mode: 'adl' },
    { pc: 0x03d93f, mode: 'adl' },
    { pc: 0x03e057, mode: 'adl' },
    { pc: 0x03e065, mode: 'adl' },
    { pc: 0x03e0e5, mode: 'adl' },
    { pc: 0x03e230, mode: 'adl' },
    { pc: 0x03e3a8, mode: 'adl' },
    { pc: 0x03e3e2, mode: 'adl' },
    { pc: 0x03e459, mode: 'adl' },
    { pc: 0x03e482, mode: 'adl' },
    { pc: 0x03e4ba, mode: 'adl' },
    { pc: 0x03e9d4, mode: 'adl' },
    { pc: 0x03e9d5, mode: 'adl' },
    { pc: 0x03ea10, mode: 'adl' },
    { pc: 0x03ea11, mode: 'adl' },
    { pc: 0x03ea50, mode: 'adl' },
    { pc: 0x03ec3c, mode: 'adl' },
    { pc: 0x03efaf, mode: 'adl' },
    { pc: 0x03f001, mode: 'adl' },
    { pc: 0x03f019, mode: 'adl' },
    { pc: 0x03f294, mode: 'adl' },
    { pc: 0x03f361, mode: 'adl' },
    { pc: 0x03f379, mode: 'adl' },
    { pc: 0x03f3bc, mode: 'adl' },
    { pc: 0x03f40a, mode: 'adl' },
    { pc: 0x03f463, mode: 'adl' },
    { pc: 0x03f4ec, mode: 'adl' },
    { pc: 0x03fe6b, mode: 'adl' },
    { pc: 0x03fe6c, mode: 'adl' },
    { pc: 0x03fe6f, mode: 'adl' },
    { pc: 0x03fe71, mode: 'adl' },
    { pc: 0x03fea9, mode: 'adl' },
    { pc: 0x03feaa, mode: 'adl' },
    { pc: 0x03fead, mode: 'adl' },
    { pc: 0x03feee, mode: 'adl' },
    { pc: 0x03fefe, mode: 'adl' },
    { pc: 0x03ff00, mode: 'adl' },
    { pc: 0x03ff11, mode: 'adl' },
    { pc: 0x03ff69, mode: 'adl' },
    { pc: 0x03ff7a, mode: 'adl' },
    { pc: 0x03ff7d, mode: 'adl' },
    { pc: 0x03ff8e, mode: 'adl' },
    { pc: 0x03ffad, mode: 'adl' },
    { pc: 0x03ffb7, mode: 'adl' },
    { pc: 0x03ffb8, mode: 'adl' },
    { pc: 0x03ffc3, mode: 'adl' },
    { pc: 0x0401b7, mode: 'adl' },
    { pc: 0x0407de, mode: 'adl' },
    { pc: 0x0421cc, mode: 'adl' },
    { pc: 0x04222e, mode: 'adl' },
    { pc: 0x042532, mode: 'adl' },
    { pc: 0x042ce0, mode: 'adl' },
    { pc: 0x042d58, mode: 'adl' },
    { pc: 0x0432be, mode: 'adl' },
    { pc: 0x04366c, mode: 'adl' },
    { pc: 0x043d05, mode: 'adl' },
    { pc: 0x043da5, mode: 'adl' },
    { pc: 0x04401c, mode: 'adl' },
    { pc: 0x0440fb, mode: 'adl' },
    { pc: 0x045587, mode: 'adl' },
    { pc: 0x04758b, mode: 'adl' },
    { pc: 0x047a82, mode: 'adl' },
    { pc: 0x047aa1, mode: 'adl' },
    { pc: 0x047b61, mode: 'adl' },
    { pc: 0x047b62, mode: 'adl' },
    { pc: 0x047b71, mode: 'adl' },
    { pc: 0x047b75, mode: 'adl' },
    { pc: 0x047bef, mode: 'adl' },
    { pc: 0x047c0d, mode: 'adl' },
    { pc: 0x047c5f, mode: 'adl' },
    { pc: 0x047c88, mode: 'adl' },
    { pc: 0x047c8a, mode: 'adl' },
    { pc: 0x047fb8, mode: 'adl' },
    { pc: 0x049f87, mode: 'adl' },
    { pc: 0x04a025, mode: 'adl' },
    { pc: 0x04a033, mode: 'adl' },
    { pc: 0x04a041, mode: 'adl' },
    { pc: 0x04a04f, mode: 'adl' },
    { pc: 0x04a0eb, mode: 'adl' },
    { pc: 0x04a105, mode: 'adl' },
    { pc: 0x04a122, mode: 'adl' },
    { pc: 0x04a13e, mode: 'adl' },
    { pc: 0x04a208, mode: 'adl' },
    { pc: 0x04a2e0, mode: 'adl' },
    { pc: 0x04a30e, mode: 'adl' },
    { pc: 0x04a37c, mode: 'adl' },
    { pc: 0x04a38b, mode: 'adl' },
    { pc: 0x04a41f, mode: 'adl' },
    { pc: 0x04a436, mode: 'adl' },
    { pc: 0x04a437, mode: 'adl' },
    { pc: 0x04a43e, mode: 'adl' },
    { pc: 0x04a43f, mode: 'adl' },
    { pc: 0x04a46f, mode: 'adl' },
    { pc: 0x04a491, mode: 'adl' },
    { pc: 0x04a52c, mode: 'adl' },
    { pc: 0x04a59a, mode: 'adl' },
    { pc: 0x04a5d3, mode: 'adl' },
    { pc: 0x04a5fa, mode: 'adl' },
    { pc: 0x04a6b6, mode: 'adl' },
    { pc: 0x04a6c9, mode: 'adl' },
    { pc: 0x04a736, mode: 'adl' },
    { pc: 0x04a7b6, mode: 'adl' },
    { pc: 0x04a86f, mode: 'adl' },
    { pc: 0x04a88b, mode: 'adl' },
    { pc: 0x04a8bc, mode: 'adl' },
    { pc: 0x04a8d8, mode: 'adl' },
    { pc: 0x04a900, mode: 'adl' },
    { pc: 0x04a94b, mode: 'adl' },
    { pc: 0x04a984, mode: 'adl' },
    { pc: 0x04a9f7, mode: 'adl' },
    { pc: 0x04a9f9, mode: 'adl' },
    { pc: 0x04aae4, mode: 'adl' },
    { pc: 0x04ab75, mode: 'adl' },
    { pc: 0x04ab8f, mode: 'adl' },
    { pc: 0x04abb3, mode: 'adl' },
    { pc: 0x04abc3, mode: 'adl' },
    { pc: 0x04ac00, mode: 'adl' },
    { pc: 0x04ac29, mode: 'adl' },
    { pc: 0x04ac55, mode: 'adl' },
    { pc: 0x04ac7f, mode: 'adl' },
    { pc: 0x04ac8f, mode: 'adl' },
    { pc: 0x04acb5, mode: 'adl' },
    { pc: 0x04ad6d, mode: 'adl' },
    { pc: 0x04ad80, mode: 'adl' },
    { pc: 0x04adde, mode: 'adl' },
    { pc: 0x04adf4, mode: 'adl' },
    { pc: 0x04ae5b, mode: 'adl' },
    { pc: 0x04ae5d, mode: 'adl' },
    { pc: 0x04ae68, mode: 'adl' },
    { pc: 0x04ae75, mode: 'adl' },
    { pc: 0x04ae77, mode: 'adl' },
    { pc: 0x04aece, mode: 'adl' },
    { pc: 0x04aeea, mode: 'adl' },
    { pc: 0x04af80, mode: 'adl' },
    { pc: 0x04afe5, mode: 'adl' },
    { pc: 0x04b079, mode: 'adl' },
    { pc: 0x04b098, mode: 'adl' },
    { pc: 0x04b0a0, mode: 'adl' },
    { pc: 0x04b0c7, mode: 'adl' },
    { pc: 0x04b102, mode: 'adl' },
    { pc: 0x04b135, mode: 'adl' },
    { pc: 0x04b137, mode: 'adl' },
    { pc: 0x04b139, mode: 'adl' },
    { pc: 0x04b154, mode: 'adl' },
    { pc: 0x04b155, mode: 'adl' },
    { pc: 0x04b156, mode: 'adl' },
    { pc: 0x04b1f8, mode: 'adl' },
    { pc: 0x04b2b3, mode: 'adl' },
    { pc: 0x04b735, mode: 'adl' },
    { pc: 0x04b77e, mode: 'adl' },
    { pc: 0x04b79e, mode: 'adl' },
    { pc: 0x04b7c0, mode: 'adl' },
    { pc: 0x04b7f5, mode: 'adl' },
    { pc: 0x04b82e, mode: 'adl' },
    { pc: 0x04ba24, mode: 'adl' },
    { pc: 0x04ba82, mode: 'adl' },
    { pc: 0x04ba84, mode: 'adl' },
    { pc: 0x04bae9, mode: 'adl' },
    { pc: 0x04bb83, mode: 'adl' },
    { pc: 0x04bb9d, mode: 'adl' },
    { pc: 0x04bbc7, mode: 'adl' },
    { pc: 0x04bc13, mode: 'adl' },
    { pc: 0x04bc47, mode: 'adl' },
    { pc: 0x04bc61, mode: 'adl' },
    { pc: 0x04bc7b, mode: 'adl' },
    { pc: 0x04bc95, mode: 'adl' },
    { pc: 0x04bcaf, mode: 'adl' },
    { pc: 0x04bcc9, mode: 'adl' },
    { pc: 0x04bce1, mode: 'adl' },
    { pc: 0x04bd2a, mode: 'adl' },
    { pc: 0x04bd4f, mode: 'adl' },
    { pc: 0x04bdbf, mode: 'adl' },
    { pc: 0x04bded, mode: 'adl' },
    { pc: 0x04be97, mode: 'adl' },
    { pc: 0x04bf4d, mode: 'adl' },
    { pc: 0x04bf60, mode: 'adl' },
    { pc: 0x04bf62, mode: 'adl' },
    { pc: 0x04bf63, mode: 'adl' },
    { pc: 0x04c023, mode: 'adl' },
    { pc: 0x04c03c, mode: 'adl' },
    { pc: 0x04ca28, mode: 'adl' },
    { pc: 0x04ca41, mode: 'adl' },
    { pc: 0x04ca58, mode: 'adl' },
    { pc: 0x04d0d3, mode: 'adl' },
    { pc: 0x04d0d8, mode: 'adl' },
    { pc: 0x04d0dd, mode: 'adl' },
    { pc: 0x04d4ed, mode: 'adl' },
    { pc: 0x04d4ef, mode: 'adl' },
    { pc: 0x04d853, mode: 'adl' },
    { pc: 0x04d855, mode: 'adl' },
    { pc: 0x04d856, mode: 'adl' },
    { pc: 0x04d94d, mode: 'adl' },
    { pc: 0x04d94f, mode: 'adl' },
    { pc: 0x04da02, mode: 'adl' },
    { pc: 0x04da04, mode: 'adl' },
    { pc: 0x04db08, mode: 'adl' },
    { pc: 0x04db0a, mode: 'adl' },
    { pc: 0x04dbbd, mode: 'adl' },
    { pc: 0x04dbbf, mode: 'adl' },
    { pc: 0x04ebe3, mode: 'adl' },
    { pc: 0x05204c, mode: 'adl' },
    { pc: 0x05208c, mode: 'adl' },
    { pc: 0x0520a1, mode: 'adl' },
    { pc: 0x052183, mode: 'adl' },
    { pc: 0x052293, mode: 'adl' },
    { pc: 0x0522b2, mode: 'adl' },
    { pc: 0x0522bb, mode: 'adl' },
    { pc: 0x0522dc, mode: 'adl' },
    { pc: 0x0522e5, mode: 'adl' },
    { pc: 0x052314, mode: 'adl' },
    { pc: 0x052325, mode: 'adl' },
    { pc: 0x052412, mode: 'adl' },
    { pc: 0x052442, mode: 'adl' },
    { pc: 0x052453, mode: 'adl' },
    { pc: 0x0524f7, mode: 'adl' },
    { pc: 0x052528, mode: 'adl' },
    { pc: 0x05253c, mode: 'adl' },
    { pc: 0x05254d, mode: 'adl' },
    { pc: 0x0525ec, mode: 'adl' },
    { pc: 0x0526f9, mode: 'adl' },
    { pc: 0x052708, mode: 'adl' },
    { pc: 0x052875, mode: 'adl' },
    { pc: 0x0528fe, mode: 'adl' },
    { pc: 0x05293e, mode: 'adl' },
    { pc: 0x052ac3, mode: 'adl' },
    { pc: 0x052ad4, mode: 'adl' },
    { pc: 0x052cda, mode: 'adl' },
    { pc: 0x052ce3, mode: 'adl' },
    { pc: 0x052e4a, mode: 'adl' },
    { pc: 0x052e5b, mode: 'adl' },
    { pc: 0x05324b, mode: 'adl' },
    { pc: 0x053342, mode: 'adl' },
    { pc: 0x05334b, mode: 'adl' },
    { pc: 0x053396, mode: 'adl' },
    { pc: 0x0533bd, mode: 'adl' },
    { pc: 0x053573, mode: 'adl' },
    { pc: 0x053ad9, mode: 'adl' },
    { pc: 0x053af7, mode: 'adl' },
    { pc: 0x0540f5, mode: 'adl' },
    { pc: 0x054181, mode: 'adl' },
    { pc: 0x0541ac, mode: 'adl' },
    { pc: 0x0541f8, mode: 'adl' },
    { pc: 0x054202, mode: 'adl' },
    { pc: 0x05432c, mode: 'adl' },
    { pc: 0x0543a5, mode: 'adl' },
    { pc: 0x0543b0, mode: 'adl' },
    { pc: 0x054434, mode: 'adl' },
    { pc: 0x05446e, mode: 'adl' },
    { pc: 0x05448f, mode: 'adl' },
    { pc: 0x05449a, mode: 'adl' },
    { pc: 0x054544, mode: 'adl' },
    { pc: 0x054555, mode: 'adl' },
    { pc: 0x0546b7, mode: 'adl' },
    { pc: 0x0546dd, mode: 'adl' },
    { pc: 0x05476a, mode: 'adl' },
    { pc: 0x054790, mode: 'adl' },
    { pc: 0x0547fd, mode: 'adl' },
    { pc: 0x054810, mode: 'adl' },
    { pc: 0x05481e, mode: 'adl' },
    { pc: 0x054829, mode: 'adl' },
    { pc: 0x0549c1, mode: 'adl' },
    { pc: 0x0549d4, mode: 'adl' },
    { pc: 0x054a20, mode: 'adl' },
    { pc: 0x054a2b, mode: 'adl' },
    { pc: 0x054bd1, mode: 'adl' },
    { pc: 0x054cd6, mode: 'adl' },
    { pc: 0x054cdf, mode: 'adl' },
    { pc: 0x054d87, mode: 'adl' },
    { pc: 0x054dc3, mode: 'adl' },
    { pc: 0x054e21, mode: 'adl' },
    { pc: 0x054e43, mode: 'adl' },
    { pc: 0x054fc6, mode: 'adl' },
    { pc: 0x054fe7, mode: 'adl' },
    { pc: 0x055167, mode: 'adl' },
    { pc: 0x05517b, mode: 'adl' },
    { pc: 0x0552bf, mode: 'adl' },
    { pc: 0x0552d7, mode: 'adl' },
    { pc: 0x055305, mode: 'adl' },
    { pc: 0x055346, mode: 'adl' },
    { pc: 0x0553fc, mode: 'adl' },
    { pc: 0x0554c5, mode: 'adl' },
    { pc: 0x0554ce, mode: 'adl' },
    { pc: 0x055526, mode: 'adl' },
    { pc: 0x05554a, mode: 'adl' },
    { pc: 0x0555a3, mode: 'adl' },
    { pc: 0x0555e3, mode: 'adl' },
    { pc: 0x05563b, mode: 'adl' },
    { pc: 0x05564e, mode: 'adl' },
    { pc: 0x05572a, mode: 'adl' },
    { pc: 0x055743, mode: 'adl' },
    { pc: 0x056262, mode: 'adl' },
    { pc: 0x05629f, mode: 'adl' },
    { pc: 0x0562c2, mode: 'adl' },
    { pc: 0x0562cb, mode: 'adl' },
    { pc: 0x057953, mode: 'adl' },
    { pc: 0x0579aa, mode: 'adl' },
    { pc: 0x057a20, mode: 'adl' },
    { pc: 0x057a7a, mode: 'adl' },
    { pc: 0x057aa3, mode: 'adl' },
    { pc: 0x057aed, mode: 'adl' },
    { pc: 0x057b1a, mode: 'adl' },
    { pc: 0x057b24, mode: 'adl' },
    { pc: 0x057bd3, mode: 'adl' },
    { pc: 0x057c43, mode: 'adl' },
    { pc: 0x057c4f, mode: 'adl' },
    { pc: 0x057d83, mode: 'adl' },
    { pc: 0x057d92, mode: 'adl' },
    { pc: 0x057efb, mode: 'adl' },
    { pc: 0x057efd, mode: 'adl' },
    { pc: 0x057f1b, mode: 'adl' },
    { pc: 0x0580af, mode: 'adl' },
    { pc: 0x058e73, mode: 'adl' },
    { pc: 0x059096, mode: 'adl' },
    { pc: 0x0590bd, mode: 'adl' },
    { pc: 0x059474, mode: 'adl' },
    { pc: 0x0598e8, mode: 'adl' },
    { pc: 0x059bbb, mode: 'adl' },
    { pc: 0x05a815, mode: 'adl' },
    { pc: 0x05ac43, mode: 'adl' },
    { pc: 0x05ac55, mode: 'adl' },
    { pc: 0x05ae83, mode: 'adl' },
    { pc: 0x05af25, mode: 'adl' },
    { pc: 0x05af3c, mode: 'adl' },
    { pc: 0x05aff3, mode: 'adl' },
    { pc: 0x05b071, mode: 'adl' },
    { pc: 0x05b0b9, mode: 'adl' },
    { pc: 0x05b0bd, mode: 'adl' },
    { pc: 0x05b529, mode: 'adl' },
    { pc: 0x05b57e, mode: 'adl' },
    { pc: 0x05cf98, mode: 'adl' },
    { pc: 0x061e41, mode: 'adl' },
    { pc: 0x063b6d, mode: 'adl' },
    { pc: 0x063c22, mode: 'adl' },
    { pc: 0x06448e, mode: 'adl' },
    { pc: 0x06449f, mode: 'adl' },
    { pc: 0x0662b0, mode: 'adl' },
    { pc: 0x066301, mode: 'adl' },
    { pc: 0x06989f, mode: 'adl' },
    { pc: 0x0698d5, mode: 'adl' },
    { pc: 0x06a315, mode: 'adl' },
    { pc: 0x06b0df, mode: 'adl' },
    { pc: 0x06ba31, mode: 'adl' },
    { pc: 0x071d19, mode: 'adl' },
    { pc: 0x071d70, mode: 'adl' },
    { pc: 0x071d8a, mode: 'adl' },
    { pc: 0x071e35, mode: 'adl' },
    { pc: 0x071f8b, mode: 'adl' },
    { pc: 0x071fc2, mode: 'adl' },
    { pc: 0x071ff1, mode: 'adl' },
    { pc: 0x072070, mode: 'adl' },
    { pc: 0x0720bf, mode: 'adl' },
    { pc: 0x072219, mode: 'adl' },
    { pc: 0x0722b5, mode: 'adl' },
    { pc: 0x0722e3, mode: 'adl' },
    { pc: 0x072325, mode: 'adl' },
    { pc: 0x072348, mode: 'adl' },
    { pc: 0x07238a, mode: 'adl' },
    { pc: 0x07245b, mode: 'adl' },
    { pc: 0x0729fc, mode: 'adl' },
    { pc: 0x072a40, mode: 'adl' },
    { pc: 0x0730cf, mode: 'adl' },
    { pc: 0x07364d, mode: 'adl' },
    { pc: 0x0736d2, mode: 'adl' },
    { pc: 0x0736d3, mode: 'adl' },
    { pc: 0x0736ef, mode: 'adl' },
    { pc: 0x073aac, mode: 'adl' },
    { pc: 0x073aae, mode: 'adl' },
    { pc: 0x073b03, mode: 'adl' },
    { pc: 0x073b04, mode: 'adl' },
    { pc: 0x073b2a, mode: 'adl' },
    { pc: 0x073b2b, mode: 'adl' },
    { pc: 0x073bf9, mode: 'adl' },
    { pc: 0x073c1a, mode: 'adl' },
    { pc: 0x073c1b, mode: 'adl' },
    { pc: 0x073ccd, mode: 'adl' },
    { pc: 0x073d40, mode: 'adl' },
    { pc: 0x073d9b, mode: 'adl' },
    { pc: 0x073dad, mode: 'adl' },
    { pc: 0x073e7c, mode: 'adl' },
    { pc: 0x0745a2, mode: 'adl' },
    { pc: 0x074a7a, mode: 'adl' },
    { pc: 0x074ead, mode: 'adl' },
    { pc: 0x074eaf, mode: 'adl' },
    { pc: 0x074ee0, mode: 'adl' },
    { pc: 0x074ee2, mode: 'adl' },
    { pc: 0x074ee3, mode: 'adl' },
    { pc: 0x074f64, mode: 'adl' },
    { pc: 0x076cc4, mode: 'adl' },
    { pc: 0x076cc6, mode: 'adl' },
    { pc: 0x076cd9, mode: 'adl' },
    { pc: 0x076cdb, mode: 'adl' },
    { pc: 0x076cf3, mode: 'adl' },
    { pc: 0x076cf4, mode: 'adl' },
    { pc: 0x076d2d, mode: 'adl' },
    { pc: 0x076d2f, mode: 'adl' },
    { pc: 0x076d99, mode: 'adl' },
    { pc: 0x076e14, mode: 'adl' },
    { pc: 0x076e94, mode: 'adl' },
    { pc: 0x076e96, mode: 'adl' },
    { pc: 0x076ec6, mode: 'adl' },
    { pc: 0x076ec8, mode: 'adl' },
    { pc: 0x076eca, mode: 'adl' },
    { pc: 0x076f15, mode: 'adl' },
    { pc: 0x077283, mode: 'adl' },
    { pc: 0x077396, mode: 'adl' },
    { pc: 0x077564, mode: 'adl' },
    { pc: 0x0776e8, mode: 'adl' },
    { pc: 0x0777dc, mode: 'adl' },
    { pc: 0x078003, mode: 'adl' },
    { pc: 0x07812e, mode: 'adl' },
    { pc: 0x078175, mode: 'adl' },
    { pc: 0x07828b, mode: 'adl' },
    { pc: 0x078364, mode: 'adl' },
    { pc: 0x0787c4, mode: 'adl' },
    { pc: 0x0787f5, mode: 'adl' },
    { pc: 0x078d15, mode: 'adl' },
    { pc: 0x0792d6, mode: 'adl' },
    { pc: 0x079538, mode: 'adl' },
    { pc: 0x0795af, mode: 'adl' },
    { pc: 0x0795db, mode: 'adl' },
    { pc: 0x0796fc, mode: 'adl' },
    { pc: 0x079aea, mode: 'adl' },
    { pc: 0x079cab, mode: 'adl' },
    { pc: 0x079e32, mode: 'adl' },
    { pc: 0x079e71, mode: 'adl' },
    { pc: 0x079ecb, mode: 'adl' },
    { pc: 0x079f0d, mode: 'adl' },
    { pc: 0x07a3fc, mode: 'adl' },
    { pc: 0x07a586, mode: 'adl' },
    { pc: 0x07aa19, mode: 'adl' },
    { pc: 0x07ab11, mode: 'adl' },
    { pc: 0x07ab43, mode: 'adl' },
    { pc: 0x07acd4, mode: 'adl' },
    { pc: 0x07b1ec, mode: 'adl' },
    { pc: 0x07b46a, mode: 'adl' },
    { pc: 0x07b7b4, mode: 'adl' },
    { pc: 0x07c030, mode: 'adl' },
    { pc: 0x07c13e, mode: 'adl' },
    { pc: 0x07c22d, mode: 'adl' },
    { pc: 0x07c237, mode: 'adl' },
    { pc: 0x07c277, mode: 'adl' },
    { pc: 0x07c281, mode: 'adl' },
    { pc: 0x07c2c3, mode: 'adl' },
    { pc: 0x07c2cd, mode: 'adl' },
    { pc: 0x07c321, mode: 'adl' },
    { pc: 0x07c34e, mode: 'adl' },
    { pc: 0x07c358, mode: 'adl' },
    { pc: 0x082c7c, mode: 'adl' },
    { pc: 0x082c88, mode: 'adl' },
    { pc: 0x082d4c, mode: 'adl' },
    { pc: 0x082d56, mode: 'adl' },
    { pc: 0x082d64, mode: 'adl' },
    { pc: 0x082d89, mode: 'adl' },
    { pc: 0x082d93, mode: 'adl' },
    { pc: 0x082e10, mode: 'adl' },
    { pc: 0x082e1b, mode: 'adl' },
    { pc: 0x0838ca, mode: 'adl' },
    { pc: 0x083921, mode: 'adl' },
    { pc: 0x08392a, mode: 'adl' },
    { pc: 0x083a25, mode: 'adl' },
    { pc: 0x083a7a, mode: 'adl' },
    { pc: 0x083c26, mode: 'adl' },
    { pc: 0x083cb7, mode: 'adl' },
    { pc: 0x083dcc, mode: 'adl' },
    { pc: 0x083e5d, mode: 'adl' },
    { pc: 0x083f89, mode: 'adl' },
    { pc: 0x084020, mode: 'adl' },
    { pc: 0x0840d8, mode: 'adl' },
    { pc: 0x084130, mode: 'adl' },
    { pc: 0x0841c1, mode: 'adl' },
    { pc: 0x084215, mode: 'adl' },
    { pc: 0x084259, mode: 'adl' },
    { pc: 0x0842b2, mode: 'adl' },
    { pc: 0x084310, mode: 'adl' },
    { pc: 0x08433b, mode: 'adl' },
    { pc: 0x084359, mode: 'adl' },
    { pc: 0x084395, mode: 'adl' },
    { pc: 0x0843de, mode: 'adl' },
    { pc: 0x0843f7, mode: 'adl' },
    { pc: 0x084405, mode: 'adl' },
    { pc: 0x0848f5, mode: 'adl' },
    { pc: 0x08be68, mode: 'adl' },
    { pc: 0x08c9ba, mode: 'adl' },
    { pc: 0x08eb34, mode: 'adl' },
    { pc: 0x08eb83, mode: 'adl' },
    { pc: 0x08ed33, mode: 'adl' },
    { pc: 0x08ee69, mode: 'adl' },
    { pc: 0x08f9ff, mode: 'adl' },
    { pc: 0x08fa00, mode: 'adl' },
    { pc: 0x08fed2, mode: 'adl' },
    { pc: 0x08fed3, mode: 'adl' },
    { pc: 0x090342, mode: 'adl' },
    { pc: 0x0903b2, mode: 'adl' },
    { pc: 0x0903f1, mode: 'adl' },
    { pc: 0x09046f, mode: 'adl' },
    { pc: 0x090645, mode: 'adl' },
    { pc: 0x0906e0, mode: 'adl' },
    { pc: 0x0921d5, mode: 'adl' },
    { pc: 0x09231e, mode: 'adl' },
    { pc: 0x0947a1, mode: 'adl' },
    { pc: 0x0947ef, mode: 'adl' },
    { pc: 0x09481c, mode: 'adl' },
    { pc: 0x0956e9, mode: 'adl' },
    { pc: 0x096ad3, mode: 'adl' },
    { pc: 0x09be2a, mode: 'adl' },
    { pc: 0x09cf39, mode: 'adl' },
    { pc: 0x09cfdf, mode: 'adl' },
    { pc: 0x09ee61, mode: 'adl' },
    { pc: 0x09ee64, mode: 'adl' },
    { pc: 0x0a2840, mode: 'adl' },
    { pc: 0x0a2843, mode: 'adl' },
    { pc: 0x0a5931, mode: 'adl' },
    { pc: 0x0a5f6d, mode: 'adl' },
    { pc: 0x0a60b2, mode: 'adl' },
    { pc: 0x0a61c8, mode: 'adl' },
    { pc: 0x0a750c, mode: 'adl' },
    { pc: 0x0a8fab, mode: 'adl' },
    { pc: 0x0adf3e, mode: 'adl' },
    { pc: 0x0ae018, mode: 'adl' },
    { pc: 0x0ae4c9, mode: 'adl' },
    { pc: 0x0aef1e, mode: 'adl' },
    { pc: 0x0af98a, mode: 'adl' },
    { pc: 0x0b2518, mode: 'adl' },
    { pc: 0x0b2fb2, mode: 'adl' },
    { pc: 0x0b67fa, mode: 'adl' },
    { pc: 0x0b681e, mode: 'adl' },
    { pc: 0x0b683d, mode: 'adl' },
    { pc: 0x0b685c, mode: 'adl' },
    { pc: 0x0b69be, mode: 'adl' },
    { pc: 0x0b6e93, mode: 'adl' },
    { pc: 0x0b6e96, mode: 'adl' },
    { pc: 0x0b722c, mode: 'adl' },
    { pc: 0x0b7305, mode: 'adl' },
    { pc: 0x0b7315, mode: 'adl' },
    { pc: 0x0b7331, mode: 'adl' },
    { pc: 0x0b73e0, mode: 'adl' },
    { pc: 0x0b7451, mode: 'adl' },
    { pc: 0x0b7476, mode: 'adl' },
    { pc: 0x0b7484, mode: 'adl' },
    { pc: 0x0b749d, mode: 'adl' },
    { pc: 0x0b777c, mode: 'adl' },
    { pc: 0x0b78af, mode: 'adl' },
    { pc: 0x0b78b1, mode: 'adl' },
    { pc: 0x0b8822, mode: 'adl' },
    { pc: 0x0b8be2, mode: 'adl' },
    { pc: 0x0b8dfd, mode: 'adl' },
    { pc: 0x0b91f0, mode: 'adl' },
    { pc: 0x0b92f3, mode: 'adl' },
    { pc: 0x0b939a, mode: 'adl' },
    { pc: 0x0b93b9, mode: 'adl' },
    { pc: 0x0b93e3, mode: 'adl' },
    { pc: 0x0b9edd, mode: 'adl' },
    { pc: 0x0b9edf, mode: 'adl' },
    { pc: 0x0b9f20, mode: 'adl' },
    { pc: 0x0b9f79, mode: 'adl' },
    { pc: 0x0b9fbe, mode: 'adl' },
    { pc: 0x0b9fe9, mode: 'adl' },
    { pc: 0x0b9feb, mode: 'adl' },
    { pc: 0x0b9fed, mode: 'adl' },
    { pc: 0x0ba045, mode: 'adl' },
    { pc: 0x0ba2cd, mode: 'adl' },
    { pc: 0x0ba527, mode: 'adl' },
    { pc: 0x0ba8a3, mode: 'adl' },
    { pc: 0x0ba9db, mode: 'adl' },
    { pc: 0x0ba9dd, mode: 'adl' },
    { pc: 0x0bab51, mode: 'adl' },
    { pc: 0x0bbd85, mode: 'adl' },
    { pc: 0x0bbe0e, mode: 'adl' },
    { pc: 0x0bbe10, mode: 'adl' },
    { pc: 0x0bbe11, mode: 'adl' },
    { pc: 0x0bbe30, mode: 'adl' },
    { pc: 0x0bbe9e, mode: 'adl' },
    { pc: 0x0bbe9f, mode: 'adl' },
    { pc: 0x0bc71e, mode: 'adl' },
    { pc: 0x0bd3df, mode: 'adl' },
    { pc: 0x0c0100, mode: 'adl' },
    { pc: 0x0c0200, mode: 'adl' },
    { pc: 0x0c0300, mode: 'adl' },
    { pc: 0x0c0400, mode: 'adl' },
    { pc: 0x0c0500, mode: 'adl' },
    { pc: 0x0c0600, mode: 'adl' },
    { pc: 0x0c0700, mode: 'adl' },
    { pc: 0x0c0800, mode: 'adl' },
    { pc: 0x0c0900, mode: 'adl' },
    { pc: 0x0c0a00, mode: 'adl' },
    { pc: 0x0c0b00, mode: 'adl' },
    { pc: 0x0c0c00, mode: 'adl' },
    { pc: 0x0c0d00, mode: 'adl' },
    { pc: 0x0c0e00, mode: 'adl' },
    { pc: 0x0c0f00, mode: 'adl' },
    { pc: 0x0c1000, mode: 'adl' },
    { pc: 0x0c1100, mode: 'adl' },
    { pc: 0x0c1200, mode: 'adl' },
    { pc: 0x0c1300, mode: 'adl' },
    { pc: 0x0c1400, mode: 'adl' },
    { pc: 0x0c1500, mode: 'adl' },
    { pc: 0x0c1600, mode: 'adl' },
    { pc: 0x0c1700, mode: 'adl' },
    { pc: 0x0c1800, mode: 'adl' },
    { pc: 0x0c1900, mode: 'adl' },
    { pc: 0x0c1a00, mode: 'adl' },
    { pc: 0x0c1b00, mode: 'adl' },
    { pc: 0x0c1c00, mode: 'adl' },
    { pc: 0x0c1d00, mode: 'adl' },
    { pc: 0x0c1e00, mode: 'adl' },
    { pc: 0x0c1f00, mode: 'adl' },
    { pc: 0x0c2000, mode: 'adl' },
    { pc: 0x0c2100, mode: 'adl' },
    { pc: 0x0c2200, mode: 'adl' },
    { pc: 0x0c2300, mode: 'adl' },
    { pc: 0x0c2400, mode: 'adl' },
    { pc: 0x0c2500, mode: 'adl' },
    { pc: 0x0c2600, mode: 'adl' },
    { pc: 0x0c2700, mode: 'adl' },
    { pc: 0x0c2800, mode: 'adl' },
    { pc: 0x0c2900, mode: 'adl' },
    { pc: 0x0c2a00, mode: 'adl' },
    { pc: 0x0c2b00, mode: 'adl' },
    { pc: 0x0c2c00, mode: 'adl' },
    { pc: 0x0c2d00, mode: 'adl' },
    { pc: 0x0c2e00, mode: 'adl' },
    { pc: 0x0c2f00, mode: 'adl' },
    { pc: 0x0c3000, mode: 'adl' },
    { pc: 0x0c3100, mode: 'adl' },
    { pc: 0x0c3200, mode: 'adl' },
    { pc: 0x0c3300, mode: 'adl' },
    { pc: 0x0c3400, mode: 'adl' },
    { pc: 0x0c3500, mode: 'adl' },
    { pc: 0x0c3600, mode: 'adl' },
    { pc: 0x0c3700, mode: 'adl' },
    { pc: 0x0c3800, mode: 'adl' },
    { pc: 0x0c3900, mode: 'adl' },
    { pc: 0x0c3a00, mode: 'adl' },
    { pc: 0x0c3b00, mode: 'adl' },
    { pc: 0x0c3c00, mode: 'adl' },
    { pc: 0x0c3d00, mode: 'adl' },
    { pc: 0x0c3e00, mode: 'adl' },
    { pc: 0x0c3f00, mode: 'adl' },
    { pc: 0x0c4000, mode: 'adl' },
    { pc: 0x0c4100, mode: 'adl' },
    { pc: 0x0c4200, mode: 'adl' },
    { pc: 0x0c4300, mode: 'adl' },
    { pc: 0x0c4400, mode: 'adl' },
    { pc: 0x0c4500, mode: 'adl' },
    { pc: 0x0c4600, mode: 'adl' },
    { pc: 0x0c4700, mode: 'adl' },
    { pc: 0x0c4800, mode: 'adl' },
    { pc: 0x0c4900, mode: 'adl' },
    { pc: 0x0c4a00, mode: 'adl' },
    { pc: 0x0c4b00, mode: 'adl' },
    { pc: 0x0c4c00, mode: 'adl' },
    { pc: 0x0c4d00, mode: 'adl' },
    { pc: 0x0c4e00, mode: 'adl' },
    { pc: 0x0c4f00, mode: 'adl' },
    { pc: 0x0c5000, mode: 'adl' },
    { pc: 0x0c5100, mode: 'adl' },
    { pc: 0x0c5200, mode: 'adl' },
    { pc: 0x0c5300, mode: 'adl' },
    { pc: 0x0c5400, mode: 'adl' },
    { pc: 0x0c5500, mode: 'adl' },
    { pc: 0x0c5600, mode: 'adl' },
    { pc: 0x0c5700, mode: 'adl' },
    { pc: 0x0c5800, mode: 'adl' },
    { pc: 0x0c5900, mode: 'adl' },
    { pc: 0x0c5a00, mode: 'adl' },
    { pc: 0x0c5b00, mode: 'adl' },
    { pc: 0x0c5c00, mode: 'adl' },
    { pc: 0x0c5d00, mode: 'adl' },
    { pc: 0x0c5e00, mode: 'adl' },
    { pc: 0x0c5f00, mode: 'adl' },
    { pc: 0x0c6000, mode: 'adl' },
    { pc: 0x0c6100, mode: 'adl' },
    { pc: 0x0c6200, mode: 'adl' },
    { pc: 0x0c6300, mode: 'adl' },
    { pc: 0x0c6400, mode: 'adl' },
    { pc: 0x0c6500, mode: 'adl' },
    { pc: 0x0c6600, mode: 'adl' },
    { pc: 0x0c6700, mode: 'adl' },
    { pc: 0x0c6800, mode: 'adl' },
    { pc: 0x0c6900, mode: 'adl' },
    { pc: 0x0c6a00, mode: 'adl' },
    { pc: 0x0c6b00, mode: 'adl' },
    { pc: 0x0c6c00, mode: 'adl' },
    { pc: 0x0c6d00, mode: 'adl' },
    { pc: 0x0c6e00, mode: 'adl' },
    { pc: 0x0c6f00, mode: 'adl' },
    { pc: 0x0c7000, mode: 'adl' },
    { pc: 0x0c7100, mode: 'adl' },
    { pc: 0x0c7200, mode: 'adl' },
    { pc: 0x0c7300, mode: 'adl' },
    { pc: 0x0c7400, mode: 'adl' },
    { pc: 0x0c7500, mode: 'adl' },
    { pc: 0x0c7600, mode: 'adl' },
    { pc: 0x0c7700, mode: 'adl' },
    { pc: 0x0c7800, mode: 'adl' },
    { pc: 0x0c7900, mode: 'adl' },
    { pc: 0x0c7a00, mode: 'adl' },
    { pc: 0x0c7b00, mode: 'adl' },
    { pc: 0x0c7c00, mode: 'adl' },
    { pc: 0x0c7d00, mode: 'adl' },
    { pc: 0x0c7e00, mode: 'adl' },
    { pc: 0x0c7f00, mode: 'adl' },
    { pc: 0x0c8000, mode: 'adl' },
    { pc: 0x0c8100, mode: 'adl' },
    { pc: 0x0c8200, mode: 'adl' },
    { pc: 0x0c8300, mode: 'adl' },
    { pc: 0x0c8400, mode: 'adl' },
    { pc: 0x0c8500, mode: 'adl' },
    { pc: 0x0c8600, mode: 'adl' },
    { pc: 0x0c8700, mode: 'adl' },
    { pc: 0x0c8800, mode: 'adl' },
    { pc: 0x0c8900, mode: 'adl' },
    { pc: 0x0c8a00, mode: 'adl' },
    { pc: 0x0c8b00, mode: 'adl' },
    { pc: 0x0c8c00, mode: 'adl' },
    { pc: 0x0c8d00, mode: 'adl' },
    { pc: 0x0c8e00, mode: 'adl' },
    { pc: 0x0c8f00, mode: 'adl' },
    { pc: 0x0c9000, mode: 'adl' },
    { pc: 0x0c9100, mode: 'adl' },
    { pc: 0x0c9200, mode: 'adl' },
    { pc: 0x0c9300, mode: 'adl' },
    { pc: 0x0c9400, mode: 'adl' },
    { pc: 0x0c9500, mode: 'adl' },
    { pc: 0x0c9600, mode: 'adl' },
    { pc: 0x0c9700, mode: 'adl' },
    { pc: 0x0c9800, mode: 'adl' },
    { pc: 0x0c9900, mode: 'adl' },
    { pc: 0x0c9a00, mode: 'adl' },
    { pc: 0x0c9b00, mode: 'adl' },
    { pc: 0x0c9c00, mode: 'adl' },
    { pc: 0x0c9d00, mode: 'adl' },
    { pc: 0x0c9e00, mode: 'adl' },
    { pc: 0x0c9f00, mode: 'adl' },
    { pc: 0x0ca000, mode: 'adl' },
    { pc: 0x0ca100, mode: 'adl' },
    { pc: 0x0ca200, mode: 'adl' },
    { pc: 0x0ca300, mode: 'adl' },
    { pc: 0x0ca400, mode: 'adl' },
    { pc: 0x0ca500, mode: 'adl' },
    { pc: 0x0ca600, mode: 'adl' },
    { pc: 0x0ca700, mode: 'adl' },
    { pc: 0x0ca800, mode: 'adl' },
    { pc: 0x0ca900, mode: 'adl' },
    { pc: 0x0caa00, mode: 'adl' },
    { pc: 0x0cab00, mode: 'adl' },
    { pc: 0x0cac00, mode: 'adl' },
    { pc: 0x0cad00, mode: 'adl' },
    { pc: 0x0cae00, mode: 'adl' },
    { pc: 0x0caf00, mode: 'adl' },
    { pc: 0x0cb000, mode: 'adl' },
    { pc: 0x0cb100, mode: 'adl' },
    { pc: 0x0cb200, mode: 'adl' },
    { pc: 0x0cb300, mode: 'adl' },
    { pc: 0x0cb400, mode: 'adl' },
    { pc: 0x0cb500, mode: 'adl' },
    { pc: 0x0cb600, mode: 'adl' },
    { pc: 0x0cb700, mode: 'adl' },
    { pc: 0x0cb800, mode: 'adl' },
    { pc: 0x0cb900, mode: 'adl' },
    { pc: 0x0cba00, mode: 'adl' },
    { pc: 0x0cbb00, mode: 'adl' },
    { pc: 0x0cbc00, mode: 'adl' },
    { pc: 0x0cbd00, mode: 'adl' },
    { pc: 0x0cbe00, mode: 'adl' },
    { pc: 0x0cbf00, mode: 'adl' },
    { pc: 0x0cc000, mode: 'adl' },
    { pc: 0x0cc100, mode: 'adl' },
    { pc: 0x0cc200, mode: 'adl' },
    { pc: 0x0cc300, mode: 'adl' },
    { pc: 0x0cc400, mode: 'adl' },
    { pc: 0x0cc500, mode: 'adl' },
    { pc: 0x0cc600, mode: 'adl' },
    { pc: 0x0cc700, mode: 'adl' },
    { pc: 0x0cc800, mode: 'adl' },
    { pc: 0x0cc900, mode: 'adl' },
    { pc: 0x0cca00, mode: 'adl' },
    { pc: 0x0ccb00, mode: 'adl' },
    { pc: 0x0ccc00, mode: 'adl' },
    { pc: 0x0ccd00, mode: 'adl' },
    { pc: 0x0cce00, mode: 'adl' },
    { pc: 0x0ccf00, mode: 'adl' },
    { pc: 0x0cd000, mode: 'adl' },
    { pc: 0x0cd100, mode: 'adl' },
    { pc: 0x0cd200, mode: 'adl' },
    { pc: 0x0cd300, mode: 'adl' },
    { pc: 0x0cd400, mode: 'adl' },
    { pc: 0x0cd500, mode: 'adl' },
    { pc: 0x0cd600, mode: 'adl' },
    { pc: 0x0cd700, mode: 'adl' },
    { pc: 0x0cd800, mode: 'adl' },
    { pc: 0x0cd900, mode: 'adl' },
    { pc: 0x0cda00, mode: 'adl' },
    { pc: 0x0cdb00, mode: 'adl' },
    { pc: 0x0cdc00, mode: 'adl' },
    { pc: 0x0cdd00, mode: 'adl' },
    { pc: 0x0cde00, mode: 'adl' },
    { pc: 0x0cdf00, mode: 'adl' },
    { pc: 0x0ce000, mode: 'adl' },
    { pc: 0x0ce100, mode: 'adl' },
    { pc: 0x0ce200, mode: 'adl' },
    { pc: 0x0ce300, mode: 'adl' },
    { pc: 0x0ce400, mode: 'adl' },
    { pc: 0x0ce500, mode: 'adl' },
    { pc: 0x0ce600, mode: 'adl' },
    { pc: 0x0ce700, mode: 'adl' },
    { pc: 0x0ce800, mode: 'adl' },
    { pc: 0x0ce900, mode: 'adl' },
    { pc: 0x0cea00, mode: 'adl' },
    { pc: 0x0ceb00, mode: 'adl' },
    { pc: 0x0cec00, mode: 'adl' },
    { pc: 0x0ced00, mode: 'adl' },
    { pc: 0x0cee00, mode: 'adl' },
    { pc: 0x0cef00, mode: 'adl' },
    { pc: 0x0cf000, mode: 'adl' },
    { pc: 0x0cf100, mode: 'adl' },
    { pc: 0x0cf200, mode: 'adl' },
    { pc: 0x0cf300, mode: 'adl' },
    { pc: 0x0cf400, mode: 'adl' },
    { pc: 0x0cf500, mode: 'adl' },
    { pc: 0x0cf600, mode: 'adl' },
    { pc: 0x0cf700, mode: 'adl' },
    { pc: 0x0cf800, mode: 'adl' },
    { pc: 0x0cf900, mode: 'adl' },
    { pc: 0x0cfa00, mode: 'adl' },
    { pc: 0x0cfb00, mode: 'adl' },
    { pc: 0x0cfc00, mode: 'adl' },
    { pc: 0x0cfd00, mode: 'adl' },
    { pc: 0x0cfe00, mode: 'adl' },
    { pc: 0x0cff00, mode: 'adl' },
    { pc: 0x0d0000, mode: 'adl' },
    { pc: 0x0d0100, mode: 'adl' },
    { pc: 0x0d0200, mode: 'adl' },
    { pc: 0x0d0300, mode: 'adl' },
    { pc: 0x0d0400, mode: 'adl' },
    { pc: 0x0d0500, mode: 'adl' },
    { pc: 0x0d0600, mode: 'adl' },
    { pc: 0x0d0700, mode: 'adl' },
    { pc: 0x0d0800, mode: 'adl' },
    { pc: 0x0d0900, mode: 'adl' },
    { pc: 0x0d0a00, mode: 'adl' },
    { pc: 0x0d0b00, mode: 'adl' },
    { pc: 0x0d0c00, mode: 'adl' },
    { pc: 0x0d0d00, mode: 'adl' },
    { pc: 0x0d0e00, mode: 'adl' },
    { pc: 0x0d0f00, mode: 'adl' },
    { pc: 0x0d1000, mode: 'adl' },
    { pc: 0x0d1100, mode: 'adl' },
    { pc: 0x0d1200, mode: 'adl' },
    { pc: 0x0d1300, mode: 'adl' },
    { pc: 0x0d1400, mode: 'adl' },
    { pc: 0x0d1500, mode: 'adl' },
    { pc: 0x0d1600, mode: 'adl' },
    { pc: 0x0d1700, mode: 'adl' },
    { pc: 0x0d1800, mode: 'adl' },
    { pc: 0x0d1900, mode: 'adl' },
    { pc: 0x0d1a00, mode: 'adl' },
    { pc: 0x0d1b00, mode: 'adl' },
    { pc: 0x0d1c00, mode: 'adl' },
    { pc: 0x0d1d00, mode: 'adl' },
    { pc: 0x0d1e00, mode: 'adl' },
    { pc: 0x0d1f00, mode: 'adl' },
    { pc: 0x0d2000, mode: 'adl' },
    { pc: 0x0d2100, mode: 'adl' },
    { pc: 0x0d2200, mode: 'adl' },
    { pc: 0x0d2300, mode: 'adl' },
    { pc: 0x0d2400, mode: 'adl' },
    { pc: 0x0d2500, mode: 'adl' },
    { pc: 0x0d2600, mode: 'adl' },
    { pc: 0x0d2700, mode: 'adl' },
    { pc: 0x0d2800, mode: 'adl' },
    { pc: 0x0d2900, mode: 'adl' },
    { pc: 0x0d2a00, mode: 'adl' },
    { pc: 0x0d2b00, mode: 'adl' },
    { pc: 0x0d2c00, mode: 'adl' },
    { pc: 0x0d2d00, mode: 'adl' },
    { pc: 0x0d2e00, mode: 'adl' },
    { pc: 0x0d2f00, mode: 'adl' },
    { pc: 0x0d3000, mode: 'adl' },
    { pc: 0x0d3100, mode: 'adl' },
    { pc: 0x0d3200, mode: 'adl' },
    { pc: 0x0d3300, mode: 'adl' },
    { pc: 0x0d3400, mode: 'adl' },
    { pc: 0x0d3500, mode: 'adl' },
    { pc: 0x0d3600, mode: 'adl' },
    { pc: 0x0d3700, mode: 'adl' },
    { pc: 0x0d3800, mode: 'adl' },
    { pc: 0x0d3900, mode: 'adl' },
    { pc: 0x0d3a00, mode: 'adl' },
    { pc: 0x0d3b00, mode: 'adl' },
    { pc: 0x0d3c00, mode: 'adl' },
    { pc: 0x0d3d00, mode: 'adl' },
    { pc: 0x0d3e00, mode: 'adl' },
    { pc: 0x0d3f00, mode: 'adl' },
    { pc: 0x0d4000, mode: 'adl' },
    { pc: 0x0d4100, mode: 'adl' },
    { pc: 0x0d4200, mode: 'adl' },
    { pc: 0x0d4300, mode: 'adl' },
    { pc: 0x0d4400, mode: 'adl' },
    { pc: 0x0d4500, mode: 'adl' },
    { pc: 0x0d4600, mode: 'adl' },
    { pc: 0x0d4700, mode: 'adl' },
    { pc: 0x0d4800, mode: 'adl' },
    { pc: 0x0d4900, mode: 'adl' },
    { pc: 0x0d4a00, mode: 'adl' },
    { pc: 0x0d4b00, mode: 'adl' },
    { pc: 0x0d4c00, mode: 'adl' },
    { pc: 0x0d4d00, mode: 'adl' },
    { pc: 0x0d4e00, mode: 'adl' },
    { pc: 0x0d4f00, mode: 'adl' },
    { pc: 0x0d5000, mode: 'adl' },
    { pc: 0x0d5100, mode: 'adl' },
    { pc: 0x0d5200, mode: 'adl' },
    { pc: 0x0d5300, mode: 'adl' },
    { pc: 0x0d5400, mode: 'adl' },
    { pc: 0x0d5500, mode: 'adl' },
    { pc: 0x0d5600, mode: 'adl' },
    { pc: 0x0d5700, mode: 'adl' },
    { pc: 0x0d5800, mode: 'adl' },
    { pc: 0x0d5900, mode: 'adl' },
    { pc: 0x0d5a00, mode: 'adl' },
    { pc: 0x0d5b00, mode: 'adl' },
    { pc: 0x0d5c00, mode: 'adl' },
    { pc: 0x0d5d00, mode: 'adl' },
    { pc: 0x0d5e00, mode: 'adl' },
    { pc: 0x0d5f00, mode: 'adl' },
    { pc: 0x0d6000, mode: 'adl' },
    { pc: 0x0d6100, mode: 'adl' },
    { pc: 0x0d6200, mode: 'adl' },
    { pc: 0x0d6300, mode: 'adl' },
    { pc: 0x0d6400, mode: 'adl' },
    { pc: 0x0d6500, mode: 'adl' },
    { pc: 0x0d6600, mode: 'adl' },
    { pc: 0x0d6700, mode: 'adl' },
    { pc: 0x0d6800, mode: 'adl' },
    { pc: 0x0d6900, mode: 'adl' },
    { pc: 0x0d6a00, mode: 'adl' },
    { pc: 0x0d6b00, mode: 'adl' },
    { pc: 0x0d6c00, mode: 'adl' },
    { pc: 0x0d6d00, mode: 'adl' },
    { pc: 0x0d6e00, mode: 'adl' },
    { pc: 0x0d6f00, mode: 'adl' },
    { pc: 0x0d7000, mode: 'adl' },
    { pc: 0x0d7100, mode: 'adl' },
    { pc: 0x0d7200, mode: 'adl' },
    { pc: 0x0d7300, mode: 'adl' },
    { pc: 0x0d7400, mode: 'adl' },
    { pc: 0x0d7500, mode: 'adl' },
    { pc: 0x0d7600, mode: 'adl' },
    { pc: 0x0d7700, mode: 'adl' },
    { pc: 0x0d7800, mode: 'adl' },
    { pc: 0x0d7900, mode: 'adl' },
    { pc: 0x0d7a00, mode: 'adl' },
    { pc: 0x0d7b00, mode: 'adl' },
    { pc: 0x0d7c00, mode: 'adl' },
    { pc: 0x0d7d00, mode: 'adl' },
    { pc: 0x0d7e00, mode: 'adl' },
    { pc: 0x0d7f00, mode: 'adl' },
    { pc: 0x0d8000, mode: 'adl' },
    { pc: 0x0d8100, mode: 'adl' },
    { pc: 0x0d8200, mode: 'adl' },
    { pc: 0x0d8300, mode: 'adl' },
    { pc: 0x0d8400, mode: 'adl' },
    { pc: 0x0d8500, mode: 'adl' },
    { pc: 0x0d8600, mode: 'adl' },
    { pc: 0x0d8700, mode: 'adl' },
    { pc: 0x0d8800, mode: 'adl' },
    { pc: 0x0d8900, mode: 'adl' },
    { pc: 0x0d8a00, mode: 'adl' },
    { pc: 0x0d8b00, mode: 'adl' },
    { pc: 0x0d8c00, mode: 'adl' },
    { pc: 0x0d8d00, mode: 'adl' },
    { pc: 0x0d8e00, mode: 'adl' },
    { pc: 0x0d8f00, mode: 'adl' },
    { pc: 0x0d9000, mode: 'adl' },
    { pc: 0x0d9100, mode: 'adl' },
    { pc: 0x0d9200, mode: 'adl' },
    { pc: 0x0d9300, mode: 'adl' },
    { pc: 0x0d9400, mode: 'adl' },
    { pc: 0x0d9500, mode: 'adl' },
    { pc: 0x0d9600, mode: 'adl' },
    { pc: 0x0d9700, mode: 'adl' },
    { pc: 0x0d9800, mode: 'adl' },
    { pc: 0x0d9900, mode: 'adl' },
    { pc: 0x0d9a00, mode: 'adl' },
    { pc: 0x0d9b00, mode: 'adl' },
    { pc: 0x0d9c00, mode: 'adl' },
    { pc: 0x0d9d00, mode: 'adl' },
    { pc: 0x0d9e00, mode: 'adl' },
    { pc: 0x0d9f00, mode: 'adl' },
    { pc: 0x0da000, mode: 'adl' },
    { pc: 0x0da100, mode: 'adl' },
    { pc: 0x0da200, mode: 'adl' },
    { pc: 0x0da300, mode: 'adl' },
    { pc: 0x0da400, mode: 'adl' },
    { pc: 0x0da500, mode: 'adl' },
    { pc: 0x0da600, mode: 'adl' },
    { pc: 0x0da700, mode: 'adl' },
    { pc: 0x0da800, mode: 'adl' },
    { pc: 0x0da900, mode: 'adl' },
    { pc: 0x0daa00, mode: 'adl' },
    { pc: 0x0dab00, mode: 'adl' },
    { pc: 0x0dac00, mode: 'adl' },
    { pc: 0x0dad00, mode: 'adl' },
    { pc: 0x0dae00, mode: 'adl' },
    { pc: 0x0daf00, mode: 'adl' },
    { pc: 0x0db000, mode: 'adl' },
    { pc: 0x0db100, mode: 'adl' },
    { pc: 0x0db200, mode: 'adl' },
    { pc: 0x0db300, mode: 'adl' },
    { pc: 0x0db400, mode: 'adl' },
    { pc: 0x0db500, mode: 'adl' },
    { pc: 0x0db600, mode: 'adl' },
    { pc: 0x0db700, mode: 'adl' },
    { pc: 0x0db800, mode: 'adl' },
    { pc: 0x0db900, mode: 'adl' },
    { pc: 0x0dba00, mode: 'adl' },
    { pc: 0x0dbb00, mode: 'adl' },
    { pc: 0x0dbc00, mode: 'adl' },
    { pc: 0x0dbd00, mode: 'adl' },
    { pc: 0x0dbe00, mode: 'adl' },
    { pc: 0x0dbf00, mode: 'adl' },
    { pc: 0x0dc000, mode: 'adl' },
    { pc: 0x0dc100, mode: 'adl' },
    { pc: 0x0dc200, mode: 'adl' },
    { pc: 0x0dc300, mode: 'adl' },
    { pc: 0x0dc400, mode: 'adl' },
    { pc: 0x0dc500, mode: 'adl' },
    { pc: 0x0dc600, mode: 'adl' },
    { pc: 0x0dc700, mode: 'adl' },
    { pc: 0x0dc800, mode: 'adl' },
    { pc: 0x0dc900, mode: 'adl' },
    { pc: 0x0dca00, mode: 'adl' },
    { pc: 0x0dcb00, mode: 'adl' },
    { pc: 0x0dcc00, mode: 'adl' },
    { pc: 0x0dcd00, mode: 'adl' },
    { pc: 0x0dce00, mode: 'adl' },
    { pc: 0x0dcf00, mode: 'adl' },
    { pc: 0x0dd000, mode: 'adl' },
    { pc: 0x0dd100, mode: 'adl' },
    { pc: 0x0dd200, mode: 'adl' },
    { pc: 0x0dd300, mode: 'adl' },
    { pc: 0x0dd400, mode: 'adl' },
    { pc: 0x0dd500, mode: 'adl' },
    { pc: 0x0dd600, mode: 'adl' },
    { pc: 0x0dd700, mode: 'adl' },
    { pc: 0x0dd800, mode: 'adl' },
    { pc: 0x0dd900, mode: 'adl' },
    { pc: 0x0dda00, mode: 'adl' },
    { pc: 0x0ddb00, mode: 'adl' },
    { pc: 0x0ddc00, mode: 'adl' },
    { pc: 0x0ddd00, mode: 'adl' },
    { pc: 0x0dde00, mode: 'adl' },
    { pc: 0x0ddf00, mode: 'adl' },
    { pc: 0x0de000, mode: 'adl' },
    { pc: 0x0de100, mode: 'adl' },
    { pc: 0x0de200, mode: 'adl' },
    { pc: 0x0de300, mode: 'adl' },
    { pc: 0x0de400, mode: 'adl' },
    { pc: 0x0de500, mode: 'adl' },
    { pc: 0x0de600, mode: 'adl' },
    { pc: 0x0de700, mode: 'adl' },
    { pc: 0x0de800, mode: 'adl' },
    { pc: 0x0de900, mode: 'adl' },
    { pc: 0x0dea00, mode: 'adl' },
    { pc: 0x0deb00, mode: 'adl' },
    { pc: 0x0dec00, mode: 'adl' },
    { pc: 0x0ded00, mode: 'adl' },
    { pc: 0x0dee00, mode: 'adl' },
    { pc: 0x0def00, mode: 'adl' },
    { pc: 0x0df000, mode: 'adl' },
    { pc: 0x0df100, mode: 'adl' },
    { pc: 0x0df200, mode: 'adl' },
    { pc: 0x0df300, mode: 'adl' },
    { pc: 0x0df400, mode: 'adl' },
    { pc: 0x0df500, mode: 'adl' },
    { pc: 0x0df600, mode: 'adl' },
    { pc: 0x0df700, mode: 'adl' },
    { pc: 0x0df800, mode: 'adl' },
    { pc: 0x0df900, mode: 'adl' },
    { pc: 0x0dfa00, mode: 'adl' },
    { pc: 0x0dfb00, mode: 'adl' },
    { pc: 0x0dfc00, mode: 'adl' },
    { pc: 0x0dfd00, mode: 'adl' },
    { pc: 0x0dfe00, mode: 'adl' },
    { pc: 0x0dff00, mode: 'adl' },
    { pc: 0x0e0000, mode: 'adl' },
    { pc: 0x0e0100, mode: 'adl' },
    { pc: 0x0e0200, mode: 'adl' },
    { pc: 0x0e0300, mode: 'adl' },
    { pc: 0x0e0400, mode: 'adl' },
    { pc: 0x0e0500, mode: 'adl' },
    { pc: 0x0e0600, mode: 'adl' },
    { pc: 0x0e0700, mode: 'adl' },
    { pc: 0x0e0800, mode: 'adl' },
    { pc: 0x0e0900, mode: 'adl' },
    { pc: 0x0e0a00, mode: 'adl' },
    { pc: 0x0e0b00, mode: 'adl' },
    { pc: 0x0e0c00, mode: 'adl' },
    { pc: 0x0e0d00, mode: 'adl' },
    { pc: 0x0e0e00, mode: 'adl' },
    { pc: 0x0e0f00, mode: 'adl' },
    { pc: 0x0e1000, mode: 'adl' },
    { pc: 0x0e1100, mode: 'adl' },
    { pc: 0x0e1200, mode: 'adl' },
    { pc: 0x0e1300, mode: 'adl' },
    { pc: 0x0e1400, mode: 'adl' },
    { pc: 0x0e1500, mode: 'adl' },
    { pc: 0x0e1600, mode: 'adl' },
    { pc: 0x0e1700, mode: 'adl' },
    { pc: 0x0e1800, mode: 'adl' },
    { pc: 0x0e1900, mode: 'adl' },
    { pc: 0x0e1a00, mode: 'adl' },
    { pc: 0x0e1b00, mode: 'adl' },
    { pc: 0x0e1c00, mode: 'adl' },
    { pc: 0x0e1d00, mode: 'adl' },
    { pc: 0x0e1e00, mode: 'adl' },
    { pc: 0x0e1f00, mode: 'adl' },
    { pc: 0x0e2000, mode: 'adl' },
    { pc: 0x0e2100, mode: 'adl' },
    { pc: 0x0e2200, mode: 'adl' },
    { pc: 0x0e2300, mode: 'adl' },
    { pc: 0x0e2400, mode: 'adl' },
    { pc: 0x0e2500, mode: 'adl' },
    { pc: 0x0e2600, mode: 'adl' },
    { pc: 0x0e2700, mode: 'adl' },
    { pc: 0x0e2800, mode: 'adl' },
    { pc: 0x0e2900, mode: 'adl' },
    { pc: 0x0e2a00, mode: 'adl' },
    { pc: 0x0e2b00, mode: 'adl' },
    { pc: 0x0e2c00, mode: 'adl' },
    { pc: 0x0e2d00, mode: 'adl' },
    { pc: 0x0e2e00, mode: 'adl' },
    { pc: 0x0e2f00, mode: 'adl' },
    { pc: 0x0e3000, mode: 'adl' },
    { pc: 0x0e3100, mode: 'adl' },
    { pc: 0x0e3200, mode: 'adl' },
    { pc: 0x0e3300, mode: 'adl' },
    { pc: 0x0e3400, mode: 'adl' },
    { pc: 0x0e3500, mode: 'adl' },
    { pc: 0x0e3600, mode: 'adl' },
    { pc: 0x0e3700, mode: 'adl' },
    { pc: 0x0e3800, mode: 'adl' },
    { pc: 0x0e3900, mode: 'adl' },
    { pc: 0x0e3a00, mode: 'adl' },
    { pc: 0x0e3b00, mode: 'adl' },
    { pc: 0x0e3c00, mode: 'adl' },
    { pc: 0x0e3d00, mode: 'adl' },
    { pc: 0x0e3e00, mode: 'adl' },
    { pc: 0x0e3f00, mode: 'adl' },
    { pc: 0x0e4000, mode: 'adl' },
    { pc: 0x0e4100, mode: 'adl' },
    { pc: 0x0e4200, mode: 'adl' },
    { pc: 0x0e4300, mode: 'adl' },
    { pc: 0x0e4400, mode: 'adl' },
    { pc: 0x0e4500, mode: 'adl' },
    { pc: 0x0e4600, mode: 'adl' },
    { pc: 0x0e4700, mode: 'adl' },
    { pc: 0x0e4800, mode: 'adl' },
    { pc: 0x0e4900, mode: 'adl' },
    { pc: 0x0e4a00, mode: 'adl' },
    { pc: 0x0e4b00, mode: 'adl' },
    { pc: 0x0e4c00, mode: 'adl' },
    { pc: 0x0e4d00, mode: 'adl' },
    { pc: 0x0e4e00, mode: 'adl' },
    { pc: 0x0e4f00, mode: 'adl' },
    { pc: 0x0e5000, mode: 'adl' },
    { pc: 0x0e5100, mode: 'adl' },
    { pc: 0x0e5200, mode: 'adl' },
    { pc: 0x0e5300, mode: 'adl' },
    { pc: 0x0e5400, mode: 'adl' },
    { pc: 0x0e5500, mode: 'adl' },
    { pc: 0x0e5600, mode: 'adl' },
    { pc: 0x0e5700, mode: 'adl' },
    { pc: 0x0e5800, mode: 'adl' },
    { pc: 0x0e5900, mode: 'adl' },
    { pc: 0x0e5a00, mode: 'adl' },
    { pc: 0x0e5b00, mode: 'adl' },
    { pc: 0x0e5c00, mode: 'adl' },
    { pc: 0x0e5d00, mode: 'adl' },
    { pc: 0x0e5e00, mode: 'adl' },
    { pc: 0x0e5f00, mode: 'adl' },
    { pc: 0x0e6000, mode: 'adl' },
    { pc: 0x0e6100, mode: 'adl' },
    { pc: 0x0e6200, mode: 'adl' },
    { pc: 0x0e6300, mode: 'adl' },
    { pc: 0x0e6400, mode: 'adl' },
    { pc: 0x0e6500, mode: 'adl' },
    { pc: 0x0e6600, mode: 'adl' },
    { pc: 0x0e6700, mode: 'adl' },
    { pc: 0x0e6800, mode: 'adl' },
    { pc: 0x0e6900, mode: 'adl' },
    { pc: 0x0e6a00, mode: 'adl' },
    { pc: 0x0e6b00, mode: 'adl' },
    { pc: 0x0e6c00, mode: 'adl' },
    { pc: 0x0e6d00, mode: 'adl' },
    { pc: 0x0e6e00, mode: 'adl' },
    { pc: 0x0e6f00, mode: 'adl' },
    { pc: 0x0e7000, mode: 'adl' },
    { pc: 0x0e7100, mode: 'adl' },
    { pc: 0x0e7200, mode: 'adl' },
    { pc: 0x0e7300, mode: 'adl' },
    { pc: 0x0e7400, mode: 'adl' },
    { pc: 0x0e7500, mode: 'adl' },
    { pc: 0x0e7600, mode: 'adl' },
    { pc: 0x0e7700, mode: 'adl' },
    { pc: 0x0e7800, mode: 'adl' },
    { pc: 0x0e7900, mode: 'adl' },
    { pc: 0x0e7a00, mode: 'adl' },
    { pc: 0x0e7b00, mode: 'adl' },
    { pc: 0x0e7c00, mode: 'adl' },
    { pc: 0x0e7d00, mode: 'adl' },
    { pc: 0x0e7e00, mode: 'adl' },
    { pc: 0x0e7f00, mode: 'adl' },
    { pc: 0x0e8000, mode: 'adl' },
    { pc: 0x0e8100, mode: 'adl' },
    { pc: 0x0e8200, mode: 'adl' },
    { pc: 0x0e8300, mode: 'adl' },
    { pc: 0x0e8400, mode: 'adl' },
    { pc: 0x0e8500, mode: 'adl' },
    { pc: 0x0e8600, mode: 'adl' },
    { pc: 0x0e8700, mode: 'adl' },
    { pc: 0x0e8800, mode: 'adl' },
    { pc: 0x0e8900, mode: 'adl' },
    { pc: 0x0e8a00, mode: 'adl' },
    { pc: 0x0e8b00, mode: 'adl' },
    { pc: 0x0e8c00, mode: 'adl' },
    { pc: 0x0e8d00, mode: 'adl' },
    { pc: 0x0e8e00, mode: 'adl' },
    { pc: 0x0e8f00, mode: 'adl' },
    { pc: 0x0e9000, mode: 'adl' },
    { pc: 0x0e9100, mode: 'adl' },
    { pc: 0x0e9200, mode: 'adl' },
    { pc: 0x0e9300, mode: 'adl' },
    { pc: 0x0e9400, mode: 'adl' },
    { pc: 0x0e9500, mode: 'adl' },
    { pc: 0x0e9600, mode: 'adl' },
    { pc: 0x0e9700, mode: 'adl' },
    { pc: 0x0e9800, mode: 'adl' },
    { pc: 0x0e9900, mode: 'adl' },
    { pc: 0x0e9a00, mode: 'adl' },
    { pc: 0x0e9b00, mode: 'adl' },
    { pc: 0x0e9c00, mode: 'adl' },
    { pc: 0x0e9d00, mode: 'adl' },
    { pc: 0x0e9e00, mode: 'adl' },
    { pc: 0x0e9f00, mode: 'adl' },
    { pc: 0x0ea000, mode: 'adl' },
    { pc: 0x0ea100, mode: 'adl' },
    { pc: 0x0ea200, mode: 'adl' },
    { pc: 0x0ea300, mode: 'adl' },
    { pc: 0x0ea400, mode: 'adl' },
    { pc: 0x0ea500, mode: 'adl' },
    { pc: 0x0ea600, mode: 'adl' },
    { pc: 0x0ea700, mode: 'adl' },
    { pc: 0x0ea800, mode: 'adl' },
    { pc: 0x0ea900, mode: 'adl' },
    { pc: 0x0eaa00, mode: 'adl' },
    { pc: 0x0eab00, mode: 'adl' },
    { pc: 0x0eac00, mode: 'adl' },
    { pc: 0x0ead00, mode: 'adl' },
    { pc: 0x0eae00, mode: 'adl' },
    { pc: 0x0eaf00, mode: 'adl' },
    { pc: 0x0eb000, mode: 'adl' },
    { pc: 0x0eb100, mode: 'adl' },
    { pc: 0x0eb200, mode: 'adl' },
    { pc: 0x0eb300, mode: 'adl' },
    { pc: 0x0eb400, mode: 'adl' },
    { pc: 0x0eb500, mode: 'adl' },
    { pc: 0x0eb600, mode: 'adl' },
    { pc: 0x0eb700, mode: 'adl' },
    { pc: 0x0eb800, mode: 'adl' },
    { pc: 0x0eb900, mode: 'adl' },
    { pc: 0x0eba00, mode: 'adl' },
    { pc: 0x0ebb00, mode: 'adl' },
    { pc: 0x0ebc00, mode: 'adl' },
    { pc: 0x0ebd00, mode: 'adl' },
    { pc: 0x0ebe00, mode: 'adl' },
    { pc: 0x0ebf00, mode: 'adl' },
    { pc: 0x0ec000, mode: 'adl' },
    { pc: 0x0ec100, mode: 'adl' },
    { pc: 0x0ec200, mode: 'adl' },
    { pc: 0x0ec300, mode: 'adl' },
    { pc: 0x0ec400, mode: 'adl' },
    { pc: 0x0ec500, mode: 'adl' },
    { pc: 0x0ec600, mode: 'adl' },
    { pc: 0x0ec700, mode: 'adl' },
    { pc: 0x0ec800, mode: 'adl' },
    { pc: 0x0ec900, mode: 'adl' },
    { pc: 0x0eca00, mode: 'adl' },
    { pc: 0x0ecb00, mode: 'adl' },
    { pc: 0x0ecc00, mode: 'adl' },
    { pc: 0x0ecd00, mode: 'adl' },
    { pc: 0x0ece00, mode: 'adl' },
    { pc: 0x0ecf00, mode: 'adl' },
    { pc: 0x0ed000, mode: 'adl' },
    { pc: 0x0ed100, mode: 'adl' },
    { pc: 0x0ed200, mode: 'adl' },
    { pc: 0x0ed300, mode: 'adl' },
    { pc: 0x0ed400, mode: 'adl' },
    { pc: 0x0ed500, mode: 'adl' },
    { pc: 0x0ed600, mode: 'adl' },
    { pc: 0x0ed700, mode: 'adl' },
    { pc: 0x0ed800, mode: 'adl' },
    { pc: 0x0ed900, mode: 'adl' },
    { pc: 0x0eda00, mode: 'adl' },
    { pc: 0x0edb00, mode: 'adl' },
    { pc: 0x0edc00, mode: 'adl' },
    { pc: 0x0edd00, mode: 'adl' },
    { pc: 0x0ede00, mode: 'adl' },
    { pc: 0x0edf00, mode: 'adl' },
    { pc: 0x0ee000, mode: 'adl' },
    { pc: 0x0ee100, mode: 'adl' },
    { pc: 0x0ee200, mode: 'adl' },
    { pc: 0x0ee300, mode: 'adl' },
    { pc: 0x0ee400, mode: 'adl' },
    { pc: 0x0ee500, mode: 'adl' },
    { pc: 0x0ee600, mode: 'adl' },
    { pc: 0x0ee700, mode: 'adl' },
    { pc: 0x0ee800, mode: 'adl' },
    { pc: 0x0ee900, mode: 'adl' },
    { pc: 0x0eea00, mode: 'adl' },
    { pc: 0x0eeb00, mode: 'adl' },
    { pc: 0x0eec00, mode: 'adl' },
    { pc: 0x0eed00, mode: 'adl' },
    { pc: 0x0eee00, mode: 'adl' },
    { pc: 0x0eef00, mode: 'adl' },
    { pc: 0x0ef000, mode: 'adl' },
    { pc: 0x0ef100, mode: 'adl' },
    { pc: 0x0ef200, mode: 'adl' },
    { pc: 0x0ef300, mode: 'adl' },
    { pc: 0x0ef400, mode: 'adl' },
    { pc: 0x0ef500, mode: 'adl' },
    { pc: 0x0ef600, mode: 'adl' },
    { pc: 0x0ef700, mode: 'adl' },
    { pc: 0x0ef800, mode: 'adl' },
    { pc: 0x0ef900, mode: 'adl' },
    { pc: 0x0efa00, mode: 'adl' },
    { pc: 0x0efb00, mode: 'adl' },
    { pc: 0x0efc00, mode: 'adl' },
    { pc: 0x0efd00, mode: 'adl' },
    { pc: 0x0efe00, mode: 'adl' },
    { pc: 0x0eff00, mode: 'adl' },
    { pc: 0x0f0000, mode: 'adl' },
    { pc: 0x0f0100, mode: 'adl' },
    { pc: 0x0f0200, mode: 'adl' },
    { pc: 0x0f0300, mode: 'adl' },
    { pc: 0x0f0400, mode: 'adl' },
    { pc: 0x0f0500, mode: 'adl' },
    { pc: 0x0f0600, mode: 'adl' },
    { pc: 0x0f0700, mode: 'adl' },
    { pc: 0x0f0800, mode: 'adl' },
    { pc: 0x0f0900, mode: 'adl' },
    { pc: 0x0f0a00, mode: 'adl' },
    { pc: 0x0f0b00, mode: 'adl' },
    { pc: 0x0f0c00, mode: 'adl' },
    { pc: 0x0f0d00, mode: 'adl' },
    { pc: 0x0f0e00, mode: 'adl' },
    { pc: 0x0f0f00, mode: 'adl' },
    { pc: 0x0f1000, mode: 'adl' },
    { pc: 0x0f1100, mode: 'adl' },
    { pc: 0x0f1200, mode: 'adl' },
    { pc: 0x0f1300, mode: 'adl' },
    { pc: 0x0f1400, mode: 'adl' },
    { pc: 0x0f1500, mode: 'adl' },
    { pc: 0x0f1600, mode: 'adl' },
    { pc: 0x0f1700, mode: 'adl' },
    { pc: 0x0f1800, mode: 'adl' },
    { pc: 0x0f1900, mode: 'adl' },
    { pc: 0x0f1a00, mode: 'adl' },
    { pc: 0x0f1b00, mode: 'adl' },
    { pc: 0x0f1c00, mode: 'adl' },
    { pc: 0x0f1d00, mode: 'adl' },
    { pc: 0x0f1e00, mode: 'adl' },
    { pc: 0x0f1f00, mode: 'adl' },
    { pc: 0x0f2000, mode: 'adl' },
    { pc: 0x0f2100, mode: 'adl' },
    { pc: 0x0f2200, mode: 'adl' },
    { pc: 0x0f2300, mode: 'adl' },
    { pc: 0x0f2400, mode: 'adl' },
    { pc: 0x0f2500, mode: 'adl' },
    { pc: 0x0f2600, mode: 'adl' },
    { pc: 0x0f2700, mode: 'adl' },
    { pc: 0x0f2800, mode: 'adl' },
    { pc: 0x0f2900, mode: 'adl' },
    { pc: 0x0f2a00, mode: 'adl' },
    { pc: 0x0f2b00, mode: 'adl' },
    { pc: 0x0f2c00, mode: 'adl' },
    { pc: 0x0f2d00, mode: 'adl' },
    { pc: 0x0f2e00, mode: 'adl' },
    { pc: 0x0f2f00, mode: 'adl' },
    { pc: 0x0f3000, mode: 'adl' },
    { pc: 0x0f3100, mode: 'adl' },
    { pc: 0x0f3200, mode: 'adl' },
    { pc: 0x0f3300, mode: 'adl' },
    { pc: 0x0f3400, mode: 'adl' },
    { pc: 0x0f3500, mode: 'adl' },
    { pc: 0x0f3600, mode: 'adl' },
    { pc: 0x0f3700, mode: 'adl' },
    { pc: 0x0f3800, mode: 'adl' },
    { pc: 0x0f3900, mode: 'adl' },
    { pc: 0x0f3a00, mode: 'adl' },
    { pc: 0x0f3b00, mode: 'adl' },
    { pc: 0x0f3c00, mode: 'adl' },
    { pc: 0x0f3d00, mode: 'adl' },
    { pc: 0x0f3e00, mode: 'adl' },
    { pc: 0x0f3f00, mode: 'adl' },
    { pc: 0x0f4000, mode: 'adl' },
    { pc: 0x0f4100, mode: 'adl' },
    { pc: 0x0f4200, mode: 'adl' },
    { pc: 0x0f4300, mode: 'adl' },
    { pc: 0x0f4400, mode: 'adl' },
    { pc: 0x0f4500, mode: 'adl' },
    { pc: 0x0f4600, mode: 'adl' },
    { pc: 0x0f4700, mode: 'adl' },
    { pc: 0x0f4800, mode: 'adl' },
    { pc: 0x0f4900, mode: 'adl' },
    { pc: 0x0f4a00, mode: 'adl' },
    { pc: 0x0f4b00, mode: 'adl' },
    { pc: 0x0f4c00, mode: 'adl' },
    { pc: 0x0f4d00, mode: 'adl' },
    { pc: 0x0f4e00, mode: 'adl' },
    { pc: 0x0f4f00, mode: 'adl' },
    { pc: 0x0f5000, mode: 'adl' },
    { pc: 0x0f5100, mode: 'adl' },
    { pc: 0x0f5200, mode: 'adl' },
    { pc: 0x0f5300, mode: 'adl' },
    { pc: 0x0f5400, mode: 'adl' },
    { pc: 0x0f5500, mode: 'adl' },
    { pc: 0x0f5600, mode: 'adl' },
    { pc: 0x0f5700, mode: 'adl' },
    { pc: 0x0f5800, mode: 'adl' },
    { pc: 0x0f5900, mode: 'adl' },
    { pc: 0x0f5a00, mode: 'adl' },
    { pc: 0x0f5b00, mode: 'adl' },
    { pc: 0x0f5c00, mode: 'adl' },
    { pc: 0x0f5d00, mode: 'adl' },
    { pc: 0x0f5e00, mode: 'adl' },
    { pc: 0x0f5f00, mode: 'adl' },
    { pc: 0x0f6000, mode: 'adl' },
    { pc: 0x0f6100, mode: 'adl' },
    { pc: 0x0f6200, mode: 'adl' },
    { pc: 0x0f6300, mode: 'adl' },
    { pc: 0x0f6400, mode: 'adl' },
    { pc: 0x0f6500, mode: 'adl' },
    { pc: 0x0f6600, mode: 'adl' },
    { pc: 0x0f6700, mode: 'adl' },
    { pc: 0x0f6800, mode: 'adl' },
    { pc: 0x0f6900, mode: 'adl' },
    { pc: 0x0f6a00, mode: 'adl' },
    { pc: 0x0f6b00, mode: 'adl' },
    { pc: 0x0f6c00, mode: 'adl' },
    { pc: 0x0f6d00, mode: 'adl' },
    { pc: 0x0f6e00, mode: 'adl' },
    { pc: 0x0f6f00, mode: 'adl' },
    { pc: 0x0f7000, mode: 'adl' },
    { pc: 0x0f7100, mode: 'adl' },
    { pc: 0x0f7200, mode: 'adl' },
    { pc: 0x0f7300, mode: 'adl' },
    { pc: 0x0f7400, mode: 'adl' },
    { pc: 0x0f7500, mode: 'adl' },
    { pc: 0x0f7600, mode: 'adl' },
    { pc: 0x0f7700, mode: 'adl' },
    { pc: 0x0f7800, mode: 'adl' },
    { pc: 0x0f7900, mode: 'adl' },
    { pc: 0x0f7a00, mode: 'adl' },
    { pc: 0x0f7b00, mode: 'adl' },
    { pc: 0x0f7c00, mode: 'adl' },
    { pc: 0x0f7d00, mode: 'adl' },
    { pc: 0x0f7e00, mode: 'adl' },
    { pc: 0x0f7f00, mode: 'adl' },
    { pc: 0x0f8000, mode: 'adl' },
    { pc: 0x0f8100, mode: 'adl' },
    { pc: 0x0f8200, mode: 'adl' },
    { pc: 0x0f8300, mode: 'adl' },
    { pc: 0x0f8400, mode: 'adl' },
    { pc: 0x0f8500, mode: 'adl' },
    { pc: 0x0f8600, mode: 'adl' },
    { pc: 0x0f8700, mode: 'adl' },
    { pc: 0x0f8800, mode: 'adl' },
    { pc: 0x0f8900, mode: 'adl' },
    { pc: 0x0f8a00, mode: 'adl' },
    { pc: 0x0f8b00, mode: 'adl' },
    { pc: 0x0f8c00, mode: 'adl' },
    { pc: 0x0f8d00, mode: 'adl' },
    { pc: 0x0f8e00, mode: 'adl' },
    { pc: 0x0f8f00, mode: 'adl' },
    { pc: 0x0f9000, mode: 'adl' },
    { pc: 0x0f9100, mode: 'adl' },
    { pc: 0x0f9200, mode: 'adl' },
    { pc: 0x0f9300, mode: 'adl' },
    { pc: 0x0f9400, mode: 'adl' },
    { pc: 0x0f9500, mode: 'adl' },
    { pc: 0x0f9600, mode: 'adl' },
    { pc: 0x0f9700, mode: 'adl' },
    { pc: 0x0f9800, mode: 'adl' },
    { pc: 0x0f9900, mode: 'adl' },
    { pc: 0x0f9a00, mode: 'adl' },
    { pc: 0x0f9b00, mode: 'adl' },
    { pc: 0x0f9c00, mode: 'adl' },
    { pc: 0x0f9d00, mode: 'adl' },
    { pc: 0x0f9e00, mode: 'adl' },
    { pc: 0x0f9f00, mode: 'adl' },
    { pc: 0x0fa000, mode: 'adl' },
    { pc: 0x0fa100, mode: 'adl' },
    { pc: 0x0fa200, mode: 'adl' },
    { pc: 0x0fa300, mode: 'adl' },
    { pc: 0x0fa400, mode: 'adl' },
    { pc: 0x0fa500, mode: 'adl' },
    { pc: 0x0fa600, mode: 'adl' },
    { pc: 0x0fa700, mode: 'adl' },
    { pc: 0x0fa800, mode: 'adl' },
    { pc: 0x0fa900, mode: 'adl' },
    { pc: 0x0faa00, mode: 'adl' },
    { pc: 0x0fab00, mode: 'adl' },
    { pc: 0x0fac00, mode: 'adl' },
    { pc: 0x0fad00, mode: 'adl' },
    { pc: 0x0fae00, mode: 'adl' },
    { pc: 0x0faf00, mode: 'adl' },
    { pc: 0x0fb000, mode: 'adl' },
    { pc: 0x0fb100, mode: 'adl' },
    { pc: 0x0fb200, mode: 'adl' },
    { pc: 0x0fb300, mode: 'adl' },
    { pc: 0x0fb400, mode: 'adl' },
    { pc: 0x0fb500, mode: 'adl' },
    { pc: 0x0fb600, mode: 'adl' },
    { pc: 0x0fb700, mode: 'adl' },
    { pc: 0x0fb800, mode: 'adl' },
    { pc: 0x0fb900, mode: 'adl' },
    { pc: 0x0fba00, mode: 'adl' },
    { pc: 0x0fbb00, mode: 'adl' },
    { pc: 0x0fbc00, mode: 'adl' },
    { pc: 0x0fbd00, mode: 'adl' },
    { pc: 0x0fbe00, mode: 'adl' },
    { pc: 0x0fbf00, mode: 'adl' },
    { pc: 0x0fc000, mode: 'adl' },
    { pc: 0x0fc100, mode: 'adl' },
    { pc: 0x0fc200, mode: 'adl' },
    { pc: 0x0fc300, mode: 'adl' },
    { pc: 0x0fc400, mode: 'adl' },
    { pc: 0x0fc500, mode: 'adl' },
    { pc: 0x0fc600, mode: 'adl' },
    { pc: 0x0fc700, mode: 'adl' },
    { pc: 0x0fc800, mode: 'adl' },
    { pc: 0x0fc900, mode: 'adl' },
    { pc: 0x0fca00, mode: 'adl' },
    { pc: 0x0fcb00, mode: 'adl' },
    { pc: 0x0fcc00, mode: 'adl' },
    { pc: 0x0fcd00, mode: 'adl' },
    { pc: 0x0fce00, mode: 'adl' },
    { pc: 0x0fcf00, mode: 'adl' },
    { pc: 0x0fd000, mode: 'adl' },
    { pc: 0x0fd100, mode: 'adl' },
    { pc: 0x0fd200, mode: 'adl' },
    { pc: 0x0fd300, mode: 'adl' },
    { pc: 0x0fd400, mode: 'adl' },
    { pc: 0x0fd500, mode: 'adl' },
    { pc: 0x0fd600, mode: 'adl' },
    { pc: 0x0fd700, mode: 'adl' },
    { pc: 0x0fd800, mode: 'adl' },
    { pc: 0x0fd900, mode: 'adl' },
    { pc: 0x0fda00, mode: 'adl' },
    { pc: 0x0fdb00, mode: 'adl' },
    { pc: 0x0fdc00, mode: 'adl' },
    { pc: 0x0fdd00, mode: 'adl' },
    { pc: 0x0fde00, mode: 'adl' },
    { pc: 0x0fdf00, mode: 'adl' },
    { pc: 0x0fe000, mode: 'adl' },
    { pc: 0x0fe100, mode: 'adl' },
    { pc: 0x0fe200, mode: 'adl' },
    { pc: 0x0fe300, mode: 'adl' },
    { pc: 0x0fe400, mode: 'adl' },
    { pc: 0x0fe500, mode: 'adl' },
    { pc: 0x0fe600, mode: 'adl' },
    { pc: 0x0fe700, mode: 'adl' },
    { pc: 0x0fe800, mode: 'adl' },
    { pc: 0x0fe900, mode: 'adl' },
    { pc: 0x0fea00, mode: 'adl' },
    { pc: 0x0feb00, mode: 'adl' },
    { pc: 0x0fec00, mode: 'adl' },
    { pc: 0x0fed00, mode: 'adl' },
    { pc: 0x0fee00, mode: 'adl' },
    { pc: 0x0fef00, mode: 'adl' },
    { pc: 0x0ff000, mode: 'adl' },
    { pc: 0x0ff100, mode: 'adl' },
    { pc: 0x0ff200, mode: 'adl' },
    { pc: 0x0ff300, mode: 'adl' },
    { pc: 0x0ff400, mode: 'adl' },
    { pc: 0x0ff500, mode: 'adl' },
    { pc: 0x0ff600, mode: 'adl' },
    { pc: 0x0ff700, mode: 'adl' },
    { pc: 0x0ff800, mode: 'adl' },
    { pc: 0x0ff900, mode: 'adl' },
    { pc: 0x0ffa00, mode: 'adl' },
    { pc: 0x0ffb00, mode: 'adl' },
    { pc: 0x0ffc00, mode: 'adl' },
    { pc: 0x0ffd00, mode: 'adl' },
    { pc: 0x0ffe00, mode: 'adl' },
    { pc: 0x0fff00, mode: 'adl' },
    // Phase 22B: prologue-scan seeds for uncovered OS regions (2025 seeds)

  ];

  for (let offset = 0; offset <= 0x38; offset += 0x08) {
    seedEntries.push({ pc: offset, mode: offset === 0 ? 'z80' : 'adl' });
  }

  seedEntries.push(...knownEntryAnchors);

  const queue = [...seedEntries];
  const seen = new Set();
  const blocks = {};
  const byteCoverage = new Set();

  const options = {
    instructionsPerBlock: 64,
    blockLimit: 131072,
  };

  while (queue.length > 0 && Object.keys(blocks).length < options.blockLimit) {
    const current = queue.shift();
    const key = formatKey(current.pc, current.mode);

    if (seen.has(key) || current.pc < 0 || current.pc >= romBytes.length) {
      continue;
    }

    seen.add(key);

    const block = buildBlock(current.pc, current.mode, options);
    blocks[key] = block;

    for (const instruction of block.instructions) {
      for (let offset = 0; offset < instruction.length; offset += 1) {
        byteCoverage.add(instruction.pc + offset);
      }
    }

    for (const exit of block.exits) {
      if (exit.target === undefined) {
        continue;
      }

      queue.push({
        pc: exit.target,
        mode: exit.targetMode ?? current.mode,
      });
    }
  }

  return {
    seedEntries,
    blocks,
    coveredBytes: byteCoverage.size,
  };
}

// --- Generate output ---

const walk = walkBlocks();
const blockEntries = Object.entries(walk.blocks);

const moduleMeta = {
  romPath: path.relative(repoRoot, romPath),
  romSize: romBytes.length,
  generatedAt: new Date().toISOString(),
  generator: path.relative(repoRoot, new URL(import.meta.url).pathname),
  blockCount: blockEntries.length,
  coveredBytes: walk.coveredBytes,
  coveragePercent: Number(((walk.coveredBytes / romBytes.length) * 100).toFixed(4)),
  seedCount: walk.seedEntries.length,
  notes: [
    'This is a byte-lifted JavaScript representation of the TI-84 Plus CE ROM reset/startup control flow.',
    'The module embeds the full ROM image and pre-lifts reachable basic blocks from the vector table.',
    'Instructions outside the supported lift set are retained as block comments and emitted as cpu.unimplemented(...) stubs.',
  ],
};

const moduleSource = [
  '// Generated by scripts/transpile-ti84-rom.mjs',
  '// Source: TI-84_Plus_CE/ROM.rom',
  '',
  `export const TRANSPILATION_META = ${JSON.stringify(moduleMeta, null, 2)};`,
  '',
  `export const ROM_BASE64 = ${JSON.stringify(romBase64)};`,
  '',
  `export const ENTRY_POINTS = ${JSON.stringify(walk.seedEntries, null, 2)};`,
  '',
  `export const PRELIFTED_BLOCKS = ${JSON.stringify(walk.blocks, null, 2)};`,
  '',
  'export function decodeEmbeddedRom() {',
  "  const base64 = typeof atob === 'function'",
  "    ? atob(ROM_BASE64)",
  "    : Buffer.from(ROM_BASE64, 'base64').toString('binary');",
  '  const bytes = new Uint8Array(base64.length);',
  '  for (let index = 0; index < base64.length; index += 1) {',
  '    bytes[index] = base64.charCodeAt(index) & 0xff;',
  '  }',
  '  return bytes;',
  '}',
  '',
].join('\n');

fs.writeFileSync(outPath, moduleSource);
fs.writeFileSync(reportPath, JSON.stringify(moduleMeta, null, 2));

console.log(`Wrote ${path.relative(repoRoot, outPath)}`);
console.log(`Wrote ${path.relative(repoRoot, reportPath)}`);
console.log(`Blocks: ${moduleMeta.blockCount}`);
console.log(`Covered bytes: ${moduleMeta.coveredBytes} (${moduleMeta.coveragePercent}%)`);
