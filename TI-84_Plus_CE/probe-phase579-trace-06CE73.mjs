import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x06CE73;
const MAX_BYTES = 300;
const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';

const rom = fs.readFileSync(ROM_PATH);
const IY_BASE = 0xD00080;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

function readU24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function signed8(b) {
  return b < 128 ? b : b - 256;
}

// Convert decoder structured output to asm string
function formatAsm(d) {
  const t = d.tag;
  if (!t) return `db ${hexByte(rom[d.pc])}`;

  // Helper for displacement text
  const dispText = (reg, disp) => {
    if (disp >= 0) return `(${reg}+${hex(disp, 2)})`;
    return `(${reg}-${hex(-disp, 2)})`;
  };

  switch (t) {
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'daa': return 'DAA';
    case 'neg': return 'NEG';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rld': return 'RLD';
    case 'rrd': return 'RRD';
    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'ini': return 'INI';
    case 'inir': return 'INIR';
    case 'ind': return 'IND';
    case 'indr': return 'INDR';
    case 'outi': return 'OUTI';
    case 'otir': return 'OTIR';
    case 'outd': return 'OUTD';
    case 'otdr': return 'OTDR';
    case 'exx': return 'EXX';
    case 'ex-af': return "EX AF, AF'";
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-sp-index': return `EX (SP), ${d.indexRegister.toUpperCase()}`;

    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${d.condition.toUpperCase()}`;

    case 'rst': return `RST ${hex(d.vector, 2)}`;

    case 'jp': return `JP ${hex(d.target)}`;
    case 'jp-conditional': return `JP ${d.condition.toUpperCase()}, ${hex(d.target)}`;
    case 'jp-hl': return 'JP (HL)';
    case 'jp-index': return `JP (${d.indexRegister.toUpperCase()})`;

    case 'jr': return `JR ${hex(d.target)}`;
    case 'jr-conditional': return `JR ${d.condition.toUpperCase()}, ${hex(d.target)}`;
    case 'djnz': return `DJNZ ${hex(d.target)}`;

    case 'call': return `CALL ${hex(d.target)}`;
    case 'call-conditional': return `CALL ${d.condition.toUpperCase()}, ${hex(d.target)}`;

    case 'push': return `PUSH ${d.pair.toUpperCase()}`;
    case 'pop': return `POP ${d.pair.toUpperCase()}`;

    case 'ld-reg-reg': return `LD ${d.dest.toUpperCase()}, ${d.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${d.dest.toUpperCase()}, ${hex(d.value, 2)}`;
    case 'ld-reg-ind': return `LD ${d.dest.toUpperCase()}, (${(d.indirectRegister || d.src || 'hl').toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${(d.dest || d.indirectRegister || 'hl').toUpperCase()}), ${d.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${d.dest.toUpperCase()}, (${hex(d.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(d.addr)}), ${d.src.toUpperCase()}`;
    case 'ld-ind-imm': return `LD (${(d.indirectRegister || d.dest || 'hl').toUpperCase()}), ${hex(d.value, 2)}`;

    case 'ld-pair-imm': return `LD ${d.pair.toUpperCase()}, ${hex(d.value)}`;
    case 'ld-pair-mem': return `LD ${d.pair.toUpperCase()}, (${hex(d.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(d.addr)}), ${d.pair.toUpperCase()}`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ld-sp-index': return `LD SP, ${d.indexRegister.toUpperCase()}`;

    case 'ld-i-a': return 'LD I, A';
    case 'ld-a-i': return 'LD A, I';
    case 'ld-r-a': return 'LD R, A';
    case 'ld-a-r': return 'LD A, R';
    case 'ld-mb-a': return 'LD MB, A';
    case 'ld-a-mb': return 'LD A, MB';

    case 'alu-reg': return `${d.op.toUpperCase()} A, ${d.src.toUpperCase()}`;
    case 'alu-imm': return `${d.op.toUpperCase()} A, ${hex(d.value, 2)}`;
    case 'alu-ind': return `${d.op.toUpperCase()} A, (${d.indirectRegister.toUpperCase()})`;

    case 'inc-reg': return `INC ${d.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${d.reg.toUpperCase()}`;
    case 'inc-ind': return `INC (${d.indirectRegister.toUpperCase()})`;
    case 'dec-ind': return `DEC (${d.indirectRegister.toUpperCase()})`;
    case 'inc-pair': return `INC ${d.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${d.pair.toUpperCase()}`;

    case 'add-hl-pair': return `ADD HL, ${d.pair.toUpperCase()}`;
    case 'adc-hl-pair': return `ADC HL, ${d.pair.toUpperCase()}`;
    case 'sbc-hl-pair': return `SBC HL, ${d.pair.toUpperCase()}`;

    case 'in-reg-c': return `IN ${d.reg.toUpperCase()}, (C)`;
    case 'out-c-reg': return `OUT (C), ${d.reg.toUpperCase()}`;
    case 'in-a-imm': return `IN A, (${hex(d.port, 2)})`;
    case 'out-imm-a': return `OUT (${hex(d.port, 2)}), A`;

    case 'im': return `IM ${d.mode_value ?? d.im_mode ?? '?'}`;

    case 'rotate-reg': return `${d.op.toUpperCase()} ${d.reg.toUpperCase()}`;
    case 'rotate-ind': return `${d.op.toUpperCase()} (${d.indirectRegister.toUpperCase()})`;
    case 'bit-test': return `BIT ${d.bit}, ${d.reg.toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${d.bit}, (${d.indirectRegister.toUpperCase()})`;
    case 'bit-set': return `SET ${d.bit}, ${d.reg.toUpperCase()}`;
    case 'bit-set-ind': return `SET ${d.bit}, (${d.indirectRegister.toUpperCase()})`;
    case 'bit-res': return `RES ${d.bit}, ${d.reg.toUpperCase()}`;
    case 'bit-res-ind': return `RES ${d.bit}, (${d.indirectRegister.toUpperCase()})`;

    // Indexed versions (IX/IY + displacement)
    case 'indexed-ld-reg':
      return `LD ${d.dest.toUpperCase()}, ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;
    case 'indexed-ld-store':
      return `LD ${dispText(d.indexRegister.toUpperCase(), d.displacement)}, ${d.src.toUpperCase()}`;
    case 'indexed-ld-imm':
      return `LD ${dispText(d.indexRegister.toUpperCase(), d.displacement)}, ${hex(d.value, 2)}`;
    case 'indexed-alu':
      return `${d.op.toUpperCase()} A, ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;
    case 'indexed-inc':
      return `INC ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;
    case 'indexed-dec':
      return `DEC ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;

    case 'indexed-cb-rotate':
      return `${d.operation.toUpperCase()} ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${d.bit}, ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${d.bit}, ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${d.bit}, ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;

    case 'add-index-pair':
      return `ADD ${d.indexRegister.toUpperCase()}, ${d.pair.toUpperCase()}`;

    case 'ld-index-imm':
      return `LD ${d.indexRegister.toUpperCase()}, ${hex(d.value)}`;
    case 'ld-index-mem':
      return `LD ${d.indexRegister.toUpperCase()}, (${hex(d.addr)})`;
    case 'ld-mem-index':
      return `LD (${hex(d.addr)}), ${d.indexRegister.toUpperCase()}`;
    case 'push-index':
      return `PUSH ${d.indexRegister.toUpperCase()}`;
    case 'pop-index':
      return `POP ${d.indexRegister.toUpperCase()}`;
    case 'inc-index':
      return `INC ${d.indexRegister.toUpperCase()}`;
    case 'dec-index':
      return `DEC ${d.indexRegister.toUpperCase()}`;

    case 'ld-index-reg':
      return `LD ${d.dest.toUpperCase()}, ${d.src.toUpperCase()}`;
    case 'ld-reg-index':
      return `LD ${d.dest.toUpperCase()}, ${d.src.toUpperCase()}`;

    case 'lea-index':
      return `LEA ${d.dest.toUpperCase()}, ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;
    case 'lea-pair':
      return `LEA ${d.dest.toUpperCase()}, ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;
    case 'pea':
      return `PEA ${dispText(d.indexRegister.toUpperCase(), d.displacement)}`;

    case 'tst-a-reg':
      return `TST A, ${d.src.toUpperCase()}`;
    case 'tst-a-imm':
      return `TST A, ${hex(d.value, 2)}`;

    case 'mlt':
      return `MLT ${d.pair.toUpperCase()}`;

    case 'stmix': return 'STMIX';
    case 'rsmix': return 'RSMIX';
    case 'slp': return 'SLP';
    case 'tstio':
      return `TSTIO ${hex(d.value, 2)}`;

    case 'inim': return 'INIM';
    case 'otim': return 'OTIM';
    case 'ini2': return 'INI2';
    case 'indm': return 'INDM';
    case 'otdm': return 'OTDM';
    case 'ind2': return 'IND2';
    case 'inimr': return 'INIMR';
    case 'otimr': return 'OTIMR';
    case 'ini2r': return 'INI2R';
    case 'indmr': return 'INDMR';
    case 'otdmr': return 'OTDMR';
    case 'ind2r': return 'IND2R';
    case 'oti2r': return 'OTI2R';
    case 'otd2r': return 'OTD2R';
    case 'in0': return `IN0 ${d.reg.toUpperCase()}, (${hex(d.port, 2)})`;
    case 'out0': return `OUT0 (${hex(d.port, 2)}), ${d.reg.toUpperCase()}`;

    default:
      // Fallback: serialize the tag and key fields
      const parts = [t.toUpperCase()];
      for (const [k, v] of Object.entries(d)) {
        if (['pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'fallthrough', 'terminates'].includes(k)) continue;
        parts.push(`${k}=${v}`);
      }
      return parts.join(' ');
  }
}

function findCallers(target) {
  const callers = [];
  for (let i = 0; i <= rom.length - 4; i += 1) {
    if (rom[i] === 0xCD && readU24LE(i + 1) === target) {
      callers.push(i);
    }
  }
  return callers;
}

function decodeFunction(start) {
  const rows = [];
  const subCalls = [];
  const ramRefs = [];
  const iyOps = [];
  const portIo = [];
  let offset = start;
  const limit = Math.min(rom.length, start + MAX_BYTES);

  while (offset < limit) {
    const decoded = decodeInstruction(rom, offset, 'adl');
    const length = decoded?.length || 1;
    const asm = formatAsm(decoded);
    const bytes = Array.from(rom.subarray(offset, offset + length), hexByte).join(' ');

    rows.push({ address: offset, bytes, asm, length });

    // Sub-CALLs
    if (asm.includes('CALL')) {
      const target = decoded.target;
      if (target != null) {
        subCalls.push({ address: offset, target, asm });
      }
    }

    // RAM refs (addresses >= 0xD00000)
    if (decoded.addr != null && decoded.addr >= 0xD00000) {
      ramRefs.push({ address: offset, target: decoded.addr, asm });
    }
    if (decoded.value != null && decoded.value >= 0xD00000) {
      ramRefs.push({ address: offset, target: decoded.value, asm });
    }

    // IY operations (indexed with iy)
    if (decoded.indexRegister === 'iy' && decoded.displacement != null) {
      const iyAddr = IY_BASE + decoded.displacement;
      iyOps.push({ address: offset, asm, displacement: decoded.displacement, iyAddr });
    }

    // Port I/O
    if (decoded.tag?.startsWith('in') || decoded.tag?.startsWith('out') ||
        decoded.tag === 'in-reg-c' || decoded.tag === 'out-c-reg' ||
        decoded.tag === 'in-a-imm' || decoded.tag === 'out-imm-a' ||
        decoded.tag === 'in0' || decoded.tag === 'out0') {
      if (decoded.port != null) {
        portIo.push({ address: offset, asm });
      }
    }

    offset += length;

    // Stop at unconditional RET or JP (function boundary)
    if (decoded.tag === 'ret' || decoded.tag === 'jp') {
      break;
    }
  }

  return {
    start,
    end: offset,
    bytes: offset - start,
    terminated: offset < limit,
    rows,
    subCalls,
    ramRefs,
    iyOps,
    portIo,
  };
}

// Also scan for JP targets to the function (not just CALL)
function findJpCallers(target) {
  const callers = [];
  // JP nn = C3 lo mid hi
  for (let i = 0; i <= rom.length - 4; i += 1) {
    if (rom[i] === 0xC3 && readU24LE(i + 1) === target) {
      callers.push({ address: i, type: 'JP' });
    }
  }
  return callers;
}

const result = decodeFunction(TARGET);
const callers = findCallers(TARGET);
const jpCallers = findJpCallers(TARGET);

console.log('TRACE 0x06CE73 -- second CALL in event loop body');
console.log('');
console.log('=== Function bounds ===');
console.log(`  start: ${hex(result.start)}`);
console.log(`  end:   ${hex(result.end)} (${result.bytes} bytes decoded)`);
console.log(`  stop:  ${result.terminated ? 'terminator reached' : `max window reached (${MAX_BYTES} bytes)`}`);
console.log('');
console.log('=== Disassembly ===');
for (const row of result.rows) {
  console.log(`${hex(row.address)}  ${row.bytes.padEnd(16)}  ${row.asm}`);
}
console.log('');
console.log('=== Sub-CALLs ===');
if (result.subCalls.length === 0) {
  console.log('  none');
} else {
  for (const call of result.subCalls) {
    console.log(`  ${hex(call.address)} -> ${hex(call.target)}  ${call.asm}`);
  }
}
console.log('');
console.log('=== RAM refs >= 0xD00000 ===');
if (result.ramRefs.length === 0) {
  console.log('  none');
} else {
  for (const ref of result.ramRefs) {
    console.log(`  ${hex(ref.address)}  ${hex(ref.target)}  ${ref.asm}`);
  }
}
console.log('');
console.log('=== IY flag operations ===');
if (result.iyOps.length === 0) {
  console.log('  none');
} else {
  for (const op of result.iyOps) {
    console.log(`  ${hex(op.address)}  IY+${hex(op.displacement, 2)} = ${hex(op.iyAddr)}  ${op.asm}`);
  }
}
console.log('');
console.log('=== Port I/O ===');
if (result.portIo.length === 0) {
  console.log('  none');
} else {
  for (const io of result.portIo) {
    console.log(`  ${hex(io.address)}  ${io.asm}`);
  }
}
console.log('');
console.log('=== Caller scan (CALL 0x06CE73 = CD 73 CE 06) ===');
console.log(`  CALL callers: ${callers.length}`);
for (const caller of callers) {
  console.log(`  ${hex(caller)}`);
}
console.log(`  JP callers: ${jpCallers.length}`);
for (const jp of jpCallers) {
  console.log(`  ${hex(jp.address)}`);
}

// Decode sub-targets
function printSubFunction(label, addr) {
  console.log('');
  console.log(`=== ${label}: ${hex(addr)} ===`);
  const sub = decodeFunction(addr);
  console.log(`  bounds: ${hex(sub.start)} - ${hex(sub.end)} (${sub.bytes}B, ${sub.terminated ? 'terminator' : 'max window'})`);
  console.log('  --- disassembly ---');
  for (const row of sub.rows) {
    console.log(`  ${hex(row.address)}  ${row.bytes.padEnd(16)}  ${row.asm}`);
  }
  if (sub.subCalls.length > 0) {
    console.log('  --- sub-CALLs ---');
    for (const call of sub.subCalls) {
      console.log(`    ${hex(call.address)} -> ${hex(call.target)}  ${call.asm}`);
    }
  }
  if (sub.ramRefs.length > 0) {
    console.log('  --- RAM refs ---');
    for (const ref of sub.ramRefs) {
      console.log(`    ${hex(ref.address)}  ${hex(ref.target)}  ${ref.asm}`);
    }
  }
  if (sub.iyOps.length > 0) {
    console.log('  --- IY ops ---');
    for (const op of sub.iyOps) {
      console.log(`    ${hex(op.address)}  IY+${hex(op.displacement, 2)} = ${hex(op.iyAddr)}  ${op.asm}`);
    }
  }
  const subCallers = findCallers(addr);
  console.log(`  callers: ${subCallers.length} [${subCallers.map(c => hex(c)).join(', ')}]`);
  return sub;
}

// Trace CALL 0x06CE7F (the real worker called by 0x06CE73)
const sub1 = printSubFunction('CALL target 0x06CE7F (inner worker)', 0x06CE7F);

// Trace JP 0x06C8AB (tail jump from 0x06CE73)
printSubFunction('JP target 0x06C8AB (tail jump)', 0x06C8AB);

// Also trace any sub-calls found in the inner worker
for (const call of sub1.subCalls) {
  printSubFunction(`Sub-call from inner worker`, call.target);
}
