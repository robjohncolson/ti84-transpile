#!/usr/bin/env node

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

// ── Helpers ──

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function bytesAt(addr, length) {
  const end = Math.min(addr + length, rom.length);
  return Array.from(rom.subarray(addr, end), hexByte).join(' ');
}

function formatInstruction(inst) {
  const tag = inst.tag || 'unknown';

  switch (tag) {
    case 'nop': return 'nop';
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'ex-af': return "ex af, af'";
    case 'exx': return 'exx';
    case 'ex-de-hl': return 'ex de, hl';
    case 'ex-sp-hl': return 'ex (sp), hl';
    case 'rlca': return 'rlca';
    case 'rrca': return 'rrca';
    case 'rla': return 'rla';
    case 'rra': return 'rra';
    case 'daa': return 'daa';
    case 'cpl': return 'cpl';
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';

    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-ind-imm': return `ld (hl), ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-a-mem': return `ld a, (${hex(inst.address || inst.addr)})`;
    case 'ld-mem-a': return `ld (${hex(inst.address || inst.addr)}), a`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.address || inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.address || inst.addr)}), ${inst.src}`;
    case 'ld-mem-pair': return `ld (${hex(inst.address || inst.addr)}), ${inst.pair}`;
    case 'ld-pair-mem': return `ld ${inst.pair}, (${hex(inst.address || inst.addr)})`;
    case 'ld-sp-hl': return 'ld sp, hl';

    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;

    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'alu-reg': return `${inst.op} ${inst.src || inst.reg || ''}`.trim();
    case 'alu-imm': return `${inst.op} ${hex(inst.value, 2)}`;
    case 'alu-ind': return `${inst.op} (${inst.src || 'hl'})`;

    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;

    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${inst.indirectRegister})`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'rst': return `rst ${hex(inst.vector, 2)}`;

    case 'in-port': return `in a, (${hex(inst.port, 2)})`;
    case 'out-port': return `out (${hex(inst.port, 2)}), a`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'out-reg': return `out (c), ${inst.reg}`;

    case 'rotate-reg': return `${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${inst.op} (${inst.indirectRegister || 'hl'})`;
    case 'bit-test-reg': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister || 'hl'})`;
    case 'bit-set-reg': return `set ${inst.bit}, ${inst.reg}`;
    case 'bit-set-ind': return `set ${inst.bit}, (${inst.indirectRegister || 'hl'})`;
    case 'bit-reset-reg': return `res ${inst.bit}, ${inst.reg}`;
    case 'bit-reset-ind': return `res ${inst.bit}, (${inst.indirectRegister || 'hl'})`;

    case 'im': return `im ${inst.mode}`;
    case 'ld-i-a': return 'ld i, a';
    case 'ld-a-i': return 'ld a, i';
    case 'ld-r-a': return 'ld r, a';
    case 'ld-a-r': return 'ld a, r';
    case 'rld': return 'rld';
    case 'rrd': return 'rrd';
    case 'neg': return 'neg';
    case 'retn': return 'retn';
    case 'reti': return 'reti';

    case 'ldi': return 'ldi';
    case 'ldir': return 'ldir';
    case 'ldd': return 'ldd';
    case 'lddr': return 'lddr';
    case 'cpi': return 'cpi';
    case 'cpir': return 'cpir';
    case 'cpd': return 'cpd';
    case 'cpdr': return 'cpdr';
    case 'ini': return 'ini';
    case 'inir': return 'inir';
    case 'ind': return 'ind';
    case 'indr': return 'indr';
    case 'outi': return 'outi';
    case 'otir': return 'otir';
    case 'outd': return 'outd';
    case 'otdr': return 'otdr';

    case 'mlt': return `mlt ${inst.pair}`;
    case 'tst-reg': return `tst ${inst.reg}`;
    case 'tst-imm': return `tst ${hex(inst.value, 2)}`;
    case 'tstio': return `tstio ${hex(inst.value, 2)}`;
    case 'slp': return 'slp';
    case 'stmix': return 'stmix';
    case 'rsmix': return 'rsmix';
    case 'lea': return `lea ${inst.dest}, ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'pea': return `pea ${inst.base}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;

    case 'adc-pair': return `adc hl, ${inst.src}`;
    case 'sbc-pair': return `sbc hl, ${inst.src}`;

    case 'ld-index-imm': return `ld ${inst.indexReg}, ${hex(inst.value)}`;
    case 'ld-index-mem': return `ld ${inst.indexReg}, (${hex(inst.address)})`;
    case 'ld-mem-index': return `ld (${hex(inst.address)}), ${inst.indexReg}`;
    case 'ld-sp-index': return `ld sp, ${inst.indexReg}`;
    case 'push-index': return `push ${inst.indexReg}`;
    case 'pop-index': return `pop ${inst.indexReg}`;
    case 'add-index': return `add ${inst.indexReg}, ${inst.src}`;
    case 'inc-index': return `inc ${inst.indexReg}`;
    case 'dec-index': return `dec ${inst.indexReg}`;
    case 'ex-sp-index': return `ex (sp), ${inst.indexReg}`;

    case 'ld-index-offset-reg':
      return `ld (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src}`;
    case 'ld-reg-index-offset':
      return `ld ${inst.dest}, (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-index-offset-imm':
      return `ld (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${hex(inst.value, 2)}`;
    case 'alu-index-offset':
      return `${inst.op} (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'inc-index-offset':
      return `inc (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'dec-index-offset':
      return `dec (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'bit-test-index-offset':
      return `bit ${inst.bit}, (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'bit-set-index-offset':
      return `set ${inst.bit}, (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'bit-reset-index-offset':
      return `res ${inst.bit}, (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'rotate-index-offset':
      return `${inst.op} (${inst.indexReg}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;

    case 'indexed-cb-rotate': {
      const d = inst.displacement;
      return `${inst.operation} (${inst.indexRegister}${d >= 0 ? '+' : ''}${d})`;
    }
    case 'indexed-cb-bit': {
      const d = inst.displacement;
      return `bit ${inst.bit}, (${inst.indexRegister}${d >= 0 ? '+' : ''}${d})`;
    }
    case 'indexed-cb-res': {
      const d = inst.displacement;
      return `res ${inst.bit}, (${inst.indexRegister}${d >= 0 ? '+' : ''}${d})`;
    }
    case 'indexed-cb-set': {
      const d = inst.displacement;
      return `set ${inst.bit}, (${inst.indexRegister}${d >= 0 ? '+' : ''}${d})`;
    }

    default:
      // Fallback: show raw tag + key fields
      const notable = {};
      for (const key of ['op', 'target', 'pair', 'reg', 'dest', 'src', 'value', 'address', 'condition']) {
        if (inst[key] !== undefined) notable[key] = inst[key];
      }
      return `[${tag}] ${JSON.stringify(notable)}`;
  }
}

function disassemble(startAddr, byteCount) {
  const endAddr = startAddr + byteCount;
  const rows = [];
  let pc = startAddr;
  while (pc < endAddr && pc < rom.length) {
    const inst = decodeInstruction(rom, pc, 1); // mode=1 is ADL mode
    const len = inst.length || 1;
    const bytes = bytesAt(pc, len);
    const text = formatInstruction(inst);
    const prefix = inst.modePrefix ? `{${inst.modePrefix}} ` : '';
    rows.push({ addr: pc, bytes, text: prefix + text, tag: inst.tag, inst });
    pc += len;
  }
  return rows;
}

function printDisassembly(title, startAddr, byteCount) {
  console.log(title);
  const rows = disassemble(startAddr, byteCount);
  for (const row of rows) {
    console.log(`  ${hex(row.addr)}  ${row.bytes.padEnd(20)} ${row.text}`);
  }
  console.log('');
  return rows;
}

// ── Part 1: Disassemble 0x08C33D and 0x08C308 ──

console.log('=== Phase 255 - 0x08C33D Dispatch Trace ===');
console.log(`ROM size: ${rom.length} bytes (${hex(rom.length, 8)})`);
console.log('');

const rows08C33D = printDisassembly(
  '=== 1a. Disassembly of 0x08C33D (100 bytes) ===',
  0x08C33D, 100
);

const rows08C308 = printDisassembly(
  '=== 1b. Disassembly of 0x08C308 (60 bytes) ===',
  0x08C308, 60
);

// ── Part 1 analysis: check for dispatch mechanisms ──

console.log('=== 1c. Dispatch Mechanism Check ===');

const allRows = [...rows08C33D, ...rows08C308];

const jpHlHits = allRows.filter(r => r.tag === 'jp-indirect');
const pushRetHits = [];
// Check for PUSH HL + RET pattern (trampoline)
for (let i = 0; i < allRows.length - 1; i++) {
  const cur = allRows[i];
  const next = allRows[i + 1];
  if ((cur.tag === 'push' && cur.inst.pair === 'hl') || cur.tag === 'push-index') {
    if (next.tag === 'ret') {
      pushRetHits.push({ pushAddr: cur.addr, retAddr: next.addr });
    }
  }
}

console.log(`JP (HL) / JP (IX) / JP (IY) instructions found: ${jpHlHits.length}`);
for (const hit of jpHlHits) {
  console.log(`  at ${hex(hit.addr)}: ${hit.text}`);
}

console.log(`PUSH+RET trampolines found: ${pushRetHits.length}`);
for (const hit of pushRetHits) {
  console.log(`  PUSH at ${hex(hit.pushAddr)}, RET at ${hex(hit.retAddr)}`);
}

// Check for RST-based dispatch
const rstHits = allRows.filter(r => r.tag === 'rst');
console.log(`RST instructions found: ${rstHits.length}`);
for (const hit of rstHits) {
  console.log(`  at ${hex(hit.addr)}: ${hit.text}`);
}

// Check for raw 0xE9 byte at 0x08C33D region
const e9Check = rom[0x08C33D];
console.log(`\nRaw byte at 0x08C33D: ${hexByte(e9Check)} (${e9Check === 0xE9 ? 'JP (HL)' : 'not JP (HL)'})`);
console.log('');

// ── Part 2: Search ROM for callers of 0x08C33D ──

console.log('=== 2. Caller Search for 0x08C33D ===');

const ABSOLUTE_BRANCH_OPCODES = new Map([
  [0xC3, 'jp'],
  [0xC2, 'jp nz,'],
  [0xCA, 'jp z,'],
  [0xD2, 'jp nc,'],
  [0xDA, 'jp c,'],
  [0xE2, 'jp po,'],
  [0xEA, 'jp pe,'],
  [0xF2, 'jp p,'],
  [0xFA, 'jp m,'],
  [0xCD, 'call'],
  [0xC4, 'call nz,'],
  [0xCC, 'call z,'],
  [0xD4, 'call nc,'],
  [0xDC, 'call c,'],
  [0xE4, 'call po,'],
  [0xEC, 'call pe,'],
  [0xF4, 'call p,'],
  [0xFC, 'call m,'],
]);

const TARGET = 0x08C33D;
const targetLow = TARGET & 0xff;
const targetMid = (TARGET >>> 8) & 0xff;
const targetHigh = (TARGET >>> 16) & 0xff;

const callers = [];
const dataRefs = [];

for (let addr = 0; addr <= rom.length - 4; addr++) {
  if (rom[addr + 1] === targetLow && rom[addr + 2] === targetMid && rom[addr + 3] === targetHigh) {
    const opcode = rom[addr];
    const mnemonic = ABSOLUTE_BRANCH_OPCODES.get(opcode);
    if (mnemonic) {
      callers.push({ addr, opcode, mnemonic, bytes: bytesAt(addr, 4) });
    }
  }
}

// Also find raw 3-byte pattern (data references / pointer tables)
for (let addr = 0; addr <= rom.length - 3; addr++) {
  if (rom[addr] === targetLow && rom[addr + 1] === targetMid && rom[addr + 2] === targetHigh) {
    const prevByte = addr > 0 ? rom[addr - 1] : 0;
    const isBranch = ABSOLUTE_BRANCH_OPCODES.has(prevByte);
    dataRefs.push({ addr, prevByte, isBranch, bytes: bytesAt(Math.max(0, addr - 1), 5) });
  }
}

console.log(`Absolute branch callers of ${hex(TARGET)}: ${callers.length}`);
for (const caller of callers) {
  console.log(`  ${hex(caller.addr)}  ${caller.bytes}  ${caller.mnemonic} ${hex(TARGET)}`);
}
console.log('');

console.log(`All 24-bit data references to ${hex(TARGET)}: ${dataRefs.length}`);
for (const ref of dataRefs) {
  const label = ref.isBranch ? ' (branch)' : ' (data/pointer)';
  console.log(`  ${hex(ref.addr)}  ${ref.bytes}${label}  prevByte=${hexByte(ref.prevByte)}`);
}
console.log('');

// Also search for relative branches to 0x08C33D
const RELATIVE_BRANCH_FORMS = new Map([
  [0x10, 'djnz'],
  [0x18, 'jr'],
  [0x20, 'jr nz,'],
  [0x28, 'jr z,'],
  [0x30, 'jr nc,'],
  [0x38, 'jr c,'],
]);

const relCallers = [];
for (let addr = 0; addr <= rom.length - 2; addr++) {
  const mnemonic = RELATIVE_BRANCH_FORMS.get(rom[addr]);
  if (!mnemonic) continue;
  const displacement = rom[addr + 1];
  const target = (addr + 2 + (displacement < 128 ? displacement : displacement - 256)) & 0xFFFFFF;
  if (target === TARGET) {
    relCallers.push({ addr, mnemonic, bytes: bytesAt(addr, 2) });
  }
}

console.log(`Relative branch callers of ${hex(TARGET)}: ${relCallers.length}`);
for (const caller of relCallers) {
  console.log(`  ${hex(caller.addr)}  ${caller.bytes}  ${caller.mnemonic} ${hex(TARGET)}`);
}
console.log('');

// ── Part 3: Boot + execution trace ──

console.log('=== 3. Boot + Execution Trace ===');

try {
  const { createExecutor } = await import('./cpu-runtime.js');
  const { createPeripheralBus } = await import('./peripherals.js');
  const { gunzipSync } = await import('zlib');
  const fs = await import('fs');
  const path = await import('path');
  const os = await import('os');
  const { fileURLToPath, pathToFileURL } = await import('url');

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
  const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

  let modulePath = TRANSPILED_JS_PATH;
  let tempModulePath = null;

  if (!fs.existsSync(TRANSPILED_JS_PATH)) {
    if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
      console.log('WARNING: Neither ROM.transpiled.js nor ROM.transpiled.js.gz found. Skipping execution trace.');
      process.exit(0);
    }
    tempModulePath = path.join(os.tmpdir(), `ti84-phase255-${process.pid}.mjs`);
    fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
    modulePath = tempModulePath;
  }

  try {
    const romModule = await import(pathToFileURL(modulePath).href);

    // Normalize blocks
    let blocks = romModule.PRELIFTED_BLOCKS;
    if (Array.isArray(blocks)) {
      blocks = Object.fromEntries(blocks.filter(b => b?.id).map(b => [b.id, b]));
    }
    blocks = blocks || {};

    if (Object.keys(blocks).length === 0) {
      console.log('WARNING: PRELIFTED_BLOCKS is empty. Skipping execution trace.');
      process.exit(0);
    }

    const MEM_SIZE = 0x1000000;
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const bus = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals: bus });
    const cpu = executor.cpu;

    cpu.connectBus = (nextBus) => {
      cpu._ioRead = (port) => nextBus.read(port);
      cpu._ioWrite = (port, value) => nextBus.write(port, value);
    };
    cpu.connectBus(bus);

    // Cold boot
    const STACK_TOP = 0xD1A87E;
    const MBASE = 0xD0;
    const IX_BASE = 0xD1A860;
    const IY_BASE = 0xD00080;

    cpu.pc = 0x000000;
    cpu.sp = STACK_TOP;
    cpu.iy = IY_BASE;
    cpu.ix = IX_BASE;
    cpu.mbase = MBASE;

    console.log('Running cold boot (20000 steps)...');
    const bootResult = executor.runFrom(0x000000, 'z80', {
      maxSteps: 20000,
      maxLoopIterations: 32,
    });
    console.log(`  cold_boot: term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

    // Prepare for kernel init
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_TOP - 3;
    mem.fill(0xFF, cpu.sp, cpu.sp + 3);

    console.log('Running kernel init at 0x08C331 (100000 steps)...');
    const kernelResult = executor.runFrom(0x08C331, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 10000,
    });
    console.log(`  kernel_init: term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);

    // Reset for event loop trace
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.mbase = MBASE;
    cpu._iy = IY_BASE;
    cpu.sp = STACK_TOP - 3;
    mem.fill(0xFF, cpu.sp, cpu.sp + 3);

    // Track hits on target addresses
    const watchAddresses = [0x08C33D, 0x08C308, 0x062055, 0x08C79F, 0x08C331, 0x08C808];
    const hits = {};
    watchAddresses.forEach(a => { hits[a] = []; });

    console.log('Running post-init trace (5000 steps) watching for target addresses...');
    let traceStep = 0;
    const traceResult = executor.runFrom(0x0802B2, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 500,
      onBlock(pc, blockMode, _meta, step) {
        traceStep = (step ?? 0) + 1;
        const normalPc = pc & 0xFFFFFF;
        if (hits[normalPc] !== undefined) {
          hits[normalPc].push(traceStep);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        traceStep = (step ?? 0) + 1;
        const normalPc = pc & 0xFFFFFF;
        if (hits[normalPc] !== undefined) {
          hits[normalPc].push(traceStep);
        }
      },
    });

    console.log(`  post_init: term=${traceResult.termination} lastPc=${hex(traceResult.lastPc)} steps=${traceStep}`);
    console.log('');

    console.log('Watch address hits during post-init trace:');
    for (const addr of watchAddresses) {
      const hitList = hits[addr];
      console.log(`  ${hex(addr)}: hit ${hitList.length} times ${hitList.length > 0 ? hitList.slice(0, 15).join(', ') : ''}`);
    }
    console.log('');

  } finally {
    if (tempModulePath) {
      try { fs.unlinkSync(tempModulePath); } catch {}
    }
  }

} catch (err) {
  console.log(`Execution trace error: ${err.message}`);
  console.log(err.stack);
}

// ── Conclusion ──

console.log('=== 4. Conclusion ===');

const hasJpHl = rows08C33D.some(r => r.tag === 'jp-indirect') || rows08C308.some(r => r.tag === 'jp-indirect');
const hasTrampoline = pushRetHits.length > 0;

if (hasJpHl) {
  const jpHlInsts = [...rows08C33D, ...rows08C308].filter(r => r.tag === 'jp-indirect');
  console.log('FOUND indirect dispatch:');
  for (const inst of jpHlInsts) {
    console.log(`  JP (${inst.inst.indirectRegister}) at ${hex(inst.addr)}`);
  }
} else if (hasTrampoline) {
  console.log('FOUND PUSH+RET trampoline dispatch:');
  for (const hit of pushRetHits) {
    console.log(`  PUSH at ${hex(hit.pushAddr)}, RET at ${hex(hit.retAddr)}`);
  }
} else {
  console.log('No JP (HL), CALL (HL), or PUSH+RET trampoline found in the disassembled range.');
  console.log('The dispatch mechanism may be:');
  console.log('  - A computed address loaded into a register pair and jumped to');
  console.log('  - An indexed table lookup followed by a JP/CALL');
  console.log('  - A different indirect pattern outside the disassembled range');
}

console.log('');
console.log(`Direct branch callers: ${callers.length} absolute, ${relCallers.length} relative`);
console.log(`Data/pointer references: ${dataRefs.filter(r => !r.isBranch).length}`);
