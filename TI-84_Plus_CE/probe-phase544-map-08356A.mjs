import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const TARGET = 0x08356A;
const CALL_PATTERN = [0xCD, 0x6A, 0x35, 0x08];
const CONTEXT_BEFORE = 16;

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex2(value) {
  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function bytesAt(start, length) {
  return Array.from(rom.slice(start, start + length))
    .map(b => b.toString(16).padStart(2, '0').toUpperCase())
    .join(' ');
}

function formatInstruction(inst) {
  const h = (v, w) => hex(v, w);
  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'push': return `PUSH ${inst.pair?.toUpperCase() ?? 'AF'}`;
    case 'pop': return `POP ${inst.pair?.toUpperCase() ?? 'AF'}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition?.toUpperCase()}`;
    case 'call': return `CALL ${h(inst.target)}`;
    case 'jp': return `JP ${h(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition?.toUpperCase()},${h(inst.target)}`;
    case 'jr': return `JR ${h(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition?.toUpperCase()},${h(inst.target)}`;
    case 'ld-reg-imm': return `LD ${(inst.dest ?? inst.reg)?.toUpperCase()},${hex2(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest?.toUpperCase()},${inst.src?.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg?.toUpperCase()}`;
    case 'inc-reg': return `INC ${inst.reg?.toUpperCase()}`;
    case 'alu-imm': return `${inst.op?.toUpperCase()} ${hex2(inst.value)}`;
    case 'alu-reg': return `${inst.op?.toUpperCase()} ${inst.src?.toUpperCase()}`;
    case 'cp-imm': return `CP ${hex2(inst.value)}`;
    case 'and-imm': return `AND ${hex2(inst.value)}`;
    case 'or-imm': return `OR ${hex2(inst.value)}`;
    case 'xor-imm': return `XOR ${hex2(inst.value)}`;
    case 'sub-imm': return `SUB ${hex2(inst.value)}`;
    case 'add-imm': return `ADD A,${hex2(inst.value)}`;
    default: return inst.tag ?? '???';
  }
}

// --- Disassemble from TARGET ---

console.log('Phase 544 probe: FULL MAP of 0x08356A error offset converter');
console.log(`ROM size: ${rom.length} bytes`);

// Context before
console.log(`\n=== Context: ${CONTEXT_BEFORE} bytes before ${hex(TARGET)} ===`);
let pc = TARGET - CONTEXT_BEFORE;
while (pc < TARGET) {
  const inst = decodeInstruction(rom, pc, 'adl');
  console.log(`  ${hex(pc)}: [${bytesAt(pc, inst.length)}]  ${formatInstruction(inst)}`);
  pc += inst.length;
}

// Main disassembly - decode 50 instructions from TARGET
console.log(`\n=== Disassembly from ${hex(TARGET)} ===`);
pc = TARGET;
for (let i = 0; i < 50; i++) {
  const inst = decodeInstruction(rom, pc, 'adl');
  const bytes = bytesAt(pc, inst.length);
  const asm = formatInstruction(inst);

  // Annotate branch targets
  let annotation = '';
  if (inst.tag === 'jr-conditional' || inst.tag === 'jr' ||
      inst.tag === 'jp-conditional' || inst.tag === 'jp') {
    annotation = `  ; -> ${hex(inst.target)}`;
  }
  if (inst.tag === 'ret-conditional') {
    annotation = `  ; returns if ${inst.condition}`;
  }

  console.log(`  ${hex(pc)}: [${bytes}]  ${asm}${annotation}`);
  pc += inst.length;
}

// --- Simulate the case-switch for all A values ---

console.log('\n=== SIMULATION: trace each A value through the switch ===');

function traceValue(inputA) {
  let a = inputA & 0xFF;
  let pc = TARGET;

  for (let step = 0; step < 100; step++) {
    const inst = decodeInstruction(rom, pc, 'adl');
    const nextPC = pc + inst.length;

    // CP (appears as alu-imm with op=cp, or cp-imm)
    if ((inst.tag === 'alu-imm' && inst.op === 'cp') || inst.tag === 'cp-imm') {
      const cmpVal = inst.value;
      const z = (a & 0xFF) === cmpVal;
      const c = (a & 0xFF) < cmpVal;

      // Check next instruction for conditional branch/ret
      const next = decodeInstruction(rom, nextPC, 'adl');
      if (next.tag === 'jr-conditional' || next.tag === 'jp-conditional') {
        const taken = evalCondition(next.condition, z, c);
        pc = taken ? next.target : nextPC + next.length;
      } else if (next.tag === 'ret-conditional') {
        const taken = evalCondition(next.condition, z, c);
        if (taken) return { input: inputA, output: a & 0xFF, at: nextPC };
        pc = nextPC + next.length;
      } else {
        pc = nextPC;
      }
      continue;
    }

    // AND imm (appears as alu-imm with op=and, or and-imm)
    if ((inst.tag === 'alu-imm' && inst.op === 'and') || inst.tag === 'and-imm') {
      a = a & inst.value;
      pc = nextPC;
      continue;
    }

    // XOR reg (appears as alu-reg with op=xor)
    if (inst.tag === 'alu-reg' && inst.op === 'xor' && inst.src === 'a') {
      a = 0;
      pc = nextPC;
      continue;
    }

    // LD A, imm
    if (inst.tag === 'ld-reg-imm' && (inst.dest === 'a' || inst.reg === 'a')) {
      a = inst.value;
      pc = nextPC;
      continue;
    }

    // DEC A
    if (inst.tag === 'dec-reg' && inst.reg === 'a') {
      a = (a - 1) & 0xFF;
      pc = nextPC;
      continue;
    }

    // INC A
    if (inst.tag === 'inc-reg' && inst.reg === 'a') {
      a = (a + 1) & 0xFF;
      pc = nextPC;
      continue;
    }

    // SUB imm
    if ((inst.tag === 'alu-imm' && inst.op === 'sub') || inst.tag === 'sub-imm') {
      const oldA = a;
      a = (a - inst.value) & 0xFF;
      const z = a === 0;
      const c = (oldA & 0xFF) < inst.value;
      // Check next for conditional
      const next = decodeInstruction(rom, nextPC, 'adl');
      if (next.tag === 'jr-conditional' || next.tag === 'jp-conditional') {
        const taken = evalCondition(next.condition, z, c);
        pc = taken ? next.target : nextPC + next.length;
      } else if (next.tag === 'ret-conditional') {
        const taken = evalCondition(next.condition, z, c);
        if (taken) return { input: inputA, output: a, at: nextPC };
        pc = nextPC + next.length;
      } else {
        pc = nextPC;
      }
      continue;
    }

    // ADD A, imm
    if ((inst.tag === 'alu-imm' && inst.op === 'add') || inst.tag === 'add-imm') {
      a = (a + inst.value) & 0xFF;
      pc = nextPC;
      continue;
    }

    // OR A (alu-reg op=or src=a) - does not change A, just sets flags
    if (inst.tag === 'alu-reg' && inst.op === 'or' && inst.src === 'a') {
      // flags: Z if A==0, C=0
      pc = nextPC;
      continue;
    }

    // Unconditional RET
    if (inst.tag === 'ret') {
      return { input: inputA, output: a & 0xFF, at: pc };
    }

    // Unconditional JR/JP
    if (inst.tag === 'jr' || inst.tag === 'jp') {
      pc = inst.target;
      continue;
    }

    // Conditional JR/JP/RET without preceding CP - skip (shouldn't happen in clean trace)
    if (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'ret-conditional') {
      // Without flag context, fall through
      pc = nextPC;
      continue;
    }

    // NOP
    if (inst.tag === 'nop') {
      pc = nextPC;
      continue;
    }

    return { input: inputA, output: null, at: pc, error: `UNHANDLED: ${inst.tag}` };
  }

  return { input: inputA, output: null, at: pc, error: 'MAX_STEPS' };
}

function evalCondition(cond, z, c) {
  switch (cond) {
    case 'z': return z;
    case 'nz': return !z;
    case 'c': return c;
    case 'nc': return !c;
    default: return false;
  }
}

// Run simulation for all 256 input values
const results = [];
for (let a = 0; a <= 0xFF; a++) {
  results.push(traceValue(a));
}

// Print full mapping for error-relevant range (0x00-0x3F)
console.log('\nInput A -> Output A (0x00-0x3F, post-AND range):');
for (let a = 0; a <= 0x3F; a++) {
  const r = results[a];
  const outStr = r.output !== null ? hex2(r.output) : `ERROR: ${r.error}`;
  console.log(`  A=${hex2(a)} -> ${outStr}  [${r.error ? r.error : 'RET at ' + hex(r.at)}]`);
}

// Print unique mappings for upper range
console.log('\nUpper range (0x40-0xFF) unique outputs:');
const seen = new Set();
for (let a = 0x40; a <= 0xFF; a++) {
  const r = results[a];
  const key = `${r.output}|${r.at}`;
  if (!seen.has(key)) {
    seen.add(key);
    const outStr = r.output !== null ? hex2(r.output) : `ERROR: ${r.error}`;
    console.log(`  A=${hex2(a)} -> ${outStr}  [${r.error ? r.error : 'RET at ' + hex(r.at)}]`);
  }
}

// Group by output
console.log('\n=== DISTINCT OUTPUT GROUPS ===');
const groups = {};
for (const r of results) {
  const key = r.output !== null ? r.output : 'ERROR';
  if (!groups[key]) groups[key] = [];
  groups[key].push(r.input);
}

for (const [output, inputs] of Object.entries(groups).sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const key = output === 'ERROR' ? 'ERROR' : hex2(Number(output));
  const inputList = inputs.map(i => hex2(i));
  if (inputList.length <= 15) {
    console.log(`  output=${key}: [${inputList.join(', ')}]`);
  } else {
    console.log(`  output=${key}: ${inputList.length} inputs, first 15: [${inputList.slice(0, 15).join(', ')}]`);
  }
}

// Manual analysis of the switch structure
console.log('\n=== MANUAL ANALYSIS OF CASE-SWITCH STRUCTURE ===');
console.log('');
console.log('0x08356A: CP 0x0D; JR NZ,0x83571');
console.log('  -> if A == 0x0D: LD A,1; RET   (input 0x0D -> output 0x01)');
console.log('');
console.log('0x083571: CP 0x06; JR NZ,0x83577');
console.log('  -> if A == 0x06: DEC A; RET     (input 0x06 -> output 0x05)');
console.log('');
console.log('0x083577: CP 0x0B; JR NZ,0x8357E');
console.log('  -> if A == 0x0B: LD A,3; RET   (input 0x0B -> output 0x03)');
console.log('');
console.log('0x08357E: AND 0x3F  (mask to 6 bits)');
console.log('  All values >= 0x40 now map to their lower 6 bits');
console.log('');
console.log('0x083580: CP 0x18; JR Z,0x83599  -> if (A & 0x3F) == 0x18: XOR A; RET (output 0x00)');
console.log('0x083584: CP 0x19; JR Z,0x83599  -> if (A & 0x3F) == 0x19: XOR A; RET (output 0x00)');
console.log('0x083588: CP 0x1B; RET C          -> if (A & 0x3F) < 0x1B: RET with A & 0x3F');
console.log('  (values 0x00-0x1A except 0x18, 0x19 return themselves)');
console.log('0x08358B: CP 0x1C; JR Z,0x83599  -> if (A & 0x3F) == 0x1C: XOR A; RET (output 0x00)');
console.log('0x08358F: CP 0x20; JR NC,0x83596 -> if (A & 0x3F) >= 0x20: goto 0x83596');
console.log('  else (0x1B, 0x1D, 0x1E, 0x1F): LD A,0x0C; RET (output 0x0C)');
console.log('0x083596: CP 0x1C; RET NC         -> A >= 0x20 >= 0x1C, always returns A & 0x3F');
console.log('0x083599: XOR A; RET              -> output 0x00');

// Xref scan
console.log('\n=== XREF SCAN: CALL 0x08356A (CD 6A 35 08) ===');
const callers = [];
for (let addr = 0; addr <= rom.length - CALL_PATTERN.length; addr++) {
  if (rom[addr] === CALL_PATTERN[0] &&
      rom[addr + 1] === CALL_PATTERN[1] &&
      rom[addr + 2] === CALL_PATTERN[2] &&
      rom[addr + 3] === CALL_PATTERN[3]) {
    callers.push(addr);
  }
}

if (callers.length === 0) {
  console.log('  No callers found');
} else {
  for (const addr of callers) {
    const after = decodeInstruction(rom, addr + 4, 'adl');
    console.log(`  ${hex(addr)}: CALL ${hex(TARGET)}  (next: ${formatInstruction(after)})`);
  }
}

console.log('\n=== SUMMARY: COMPLETE MAPPING TABLE ===');
console.log('Pre-AND-mask special cases (checked before AND 0x3F):');
console.log('  0x06 -> 0x05 (DEC A)');
console.log('  0x0B -> 0x03 (LD A,3)');
console.log('  0x0D -> 0x01 (LD A,1)');
console.log('');
console.log('Post-AND-mask (A & 0x3F) cases:');
console.log('  0x00-0x17 -> pass through (A & 0x3F)  [except 0x06, 0x0B, 0x0D caught above]');
console.log('  0x18      -> 0x00 (XOR A)');
console.log('  0x19      -> 0x00 (XOR A)');
console.log('  0x1A      -> 0x1A (pass through, < 0x1B)');
console.log('  0x1B      -> 0x0C (LD A,0x0C)');
console.log('  0x1C      -> 0x00 (XOR A)');
console.log('  0x1D      -> 0x0C (LD A,0x0C)');
console.log('  0x1E      -> 0x0C (LD A,0x0C)');
console.log('  0x1F      -> 0x0C (LD A,0x0C)');
console.log('  0x20-0x3F -> pass through (A & 0x3F)');

console.log('\nDone.');
