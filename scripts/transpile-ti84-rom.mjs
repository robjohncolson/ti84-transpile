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
    if (instruction.reg === '(hl)') return ['cpu.ioRead(cpu.c);'];
    return [`cpu.${instruction.reg} = cpu.ioRead(cpu.c);`];
  }
  if (tag === 'out-reg') {
    if (instruction.reg === '(hl)') return ['cpu.ioWrite(cpu.c, 0);'];
    return [`cpu.ioWrite(cpu.c, cpu.${instruction.reg});`];
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
    blockLimit: 65536,
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
