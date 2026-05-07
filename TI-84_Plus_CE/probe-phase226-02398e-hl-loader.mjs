#!/usr/bin/env node

/**
 * Phase 226: Investigate 0x02398E — the NZ-path HL loader for D0059F magic values.
 *
 * When BIT 1,(IY+53) is SET, the caller at 0x051D43 does CALL NZ,0x02398E.
 * This function loads HL to point at data containing magic values 0xFA/0xFB/0xFC/0xFE.
 * A = 0xD8 on entry (set at 0x051D3D).
 *
 * Parts:
 *   A — Static disassembly of 0x02398E..0x023A20
 *   B — Find all callers (CALL/JP 0x02398E) in ROM
 *   C — Dynamic trace with A=0xD8 and various D0033A seeds
 *   D — Table dump if a table reference is found
 *   E — Scan for SET 1,(IY+53) and RES 1,(IY+53) sites
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!existsSync(transpiledPath)) {
  throw new Error(
    existsSync(transpiledGzipPath)
      ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.'
      : 'ROM.transpiled.js is missing.',
  );
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const rom = readFileSync(romPath);

const MEM_SIZE = 0x1000000;
const IY_ADDR = 0xd00080;
const MBASE = 0xd0;
const DEFAULT_STACK_TOP = 0xd1a87e;
const IX_ADDR = 0xd1a860;
const D0059F_ADDR = 0xd0059f;
const D0033A_ADDR = 0xd0033a;
const D000B5_ADDR = 0xd000b5; // IY+53

const TARGET_FUNC = 0x02398e;
const DISASM_START = 0x02398e;
const DISASM_END = 0x023a20;

const SENTINEL_RET = 0x7ffff6;

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xff, 2);
}

function read24(mem, addr) {
  const a = addr & 0xffffff;
  return ((mem[a] & 0xff) | ((mem[a + 1] & 0xff) << 8) | ((mem[a + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xffffff;
  mem[a] = value & 0xff;
  mem[a + 1] = (value >>> 8) & 0xff;
  mem[a + 2] = (value >>> 16) & 0xff;
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function makeStop(name, detail = null) {
  const error = new Error('__PHASE226_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

function formatInstruction(d) {
  const tag = d.tag ?? 'unknown';
  const h = (v, w = 6) => `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

  switch (tag) {
    case 'push': return `PUSH ${(d.reg ?? '?').toUpperCase()}`;
    case 'pop': return `POP ${(d.reg ?? '?').toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${(d.dest ?? '?').toUpperCase()},${(d.src ?? '?').toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${(d.reg ?? '?').toUpperCase()},${h(d.value ?? 0)}`;
    case 'ld-reg16-imm': return `LD ${(d.reg ?? '?').toUpperCase()},${h(d.value ?? 0)}`;
    case 'ld-ind-reg': return `LD (${(d.dest ?? d.indirectRegister ?? '?').toUpperCase()}),${(d.src ?? d.reg ?? '?').toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${(d.dest ?? d.reg ?? '?').toUpperCase()},(${(d.src ?? d.indirectRegister ?? '?').toUpperCase()})`;
    case 'ld-mem-reg': return `LD (${h(d.address ?? 0)}),${(d.reg ?? '?').toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${(d.reg ?? '?').toUpperCase()},(${h(d.address ?? 0)})`;
    case 'ld-mem-reg16': return `LD (${h(d.address ?? 0)}),${(d.reg ?? '?').toUpperCase()}`;
    case 'ld-reg16-mem': return `LD ${(d.reg ?? '?').toUpperCase()},(${h(d.address ?? 0)})`;
    case 'ld-ind-imm': return `LD (${(d.indirectRegister ?? '?').toUpperCase()}),${h(d.value ?? 0, 2)}`;
    case 'ld-idx-reg': return `LD (${(d.indexReg ?? 'IX').toUpperCase()}+${d.offset ?? 0}),${(d.src ?? d.reg ?? '?').toUpperCase()}`;
    case 'ld-reg-idx': return `LD ${(d.dest ?? d.reg ?? '?').toUpperCase()},(${(d.indexReg ?? 'IX').toUpperCase()}+${d.offset ?? 0})`;
    case 'ld-idx-imm': return `LD (${(d.indexReg ?? 'IX').toUpperCase()}+${d.offset ?? 0}),${h(d.value ?? 0, 2)}`;
    case 'call': return `CALL ${h(d.target ?? 0)}`;
    case 'call-cc': return `CALL ${(d.cc ?? '?').toUpperCase()},${h(d.target ?? 0)}`;
    case 'jp': return `JP ${h(d.target ?? 0)}`;
    case 'jp-cc': return `JP ${(d.cc ?? '?').toUpperCase()},${h(d.target ?? 0)}`;
    case 'jp-ind': return `JP (${(d.reg ?? 'HL').toUpperCase()})`;
    case 'jr': return `JR ${h(d.target ?? 0)}`;
    case 'jr-cc': return `JR ${(d.cc ?? '?').toUpperCase()},${h(d.target ?? 0)}`;
    case 'ret': return 'RET';
    case 'ret-cc': return `RET ${(d.cc ?? '?').toUpperCase()}`;
    case 'rst': return `RST ${h(d.target ?? 0, 2)}`;
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'cp-imm': return `CP ${h(d.value ?? 0, 2)}`;
    case 'cp-reg': return `CP ${(d.reg ?? '?').toUpperCase()}`;
    case 'cp-ind': return `CP (${(d.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'or-imm': return `OR ${h(d.value ?? 0, 2)}`;
    case 'or-reg': return `OR ${(d.reg ?? '?').toUpperCase()}`;
    case 'and-imm': return `AND ${h(d.value ?? 0, 2)}`;
    case 'and-reg': return `AND ${(d.reg ?? '?').toUpperCase()}`;
    case 'xor-imm': return `XOR ${h(d.value ?? 0, 2)}`;
    case 'xor-reg': return `XOR ${(d.reg ?? '?').toUpperCase()}`;
    case 'add-reg': return `ADD A,${(d.reg ?? '?').toUpperCase()}`;
    case 'add-imm': return `ADD A,${h(d.value ?? 0, 2)}`;
    case 'sub-reg': return `SUB ${(d.reg ?? '?').toUpperCase()}`;
    case 'sub-imm': return `SUB ${h(d.value ?? 0, 2)}`;
    case 'inc-reg': return `INC ${(d.reg ?? '?').toUpperCase()}`;
    case 'dec-reg': return `DEC ${(d.reg ?? '?').toUpperCase()}`;
    case 'inc-reg16': return `INC ${(d.reg ?? '?').toUpperCase()}`;
    case 'dec-reg16': return `DEC ${(d.reg ?? '?').toUpperCase()}`;
    case 'inc-ind': return `INC (${(d.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'dec-ind': return `DEC (${(d.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'add-hl-reg16': return `ADD HL,${(d.reg ?? '?').toUpperCase()}`;
    case 'sbc-hl-reg16': return `SBC HL,${(d.reg ?? '?').toUpperCase()}`;
    case 'adc-hl-reg16': return `ADC HL,${(d.reg ?? '?').toUpperCase()}`;
    case 'ex-de-hl': return 'EX DE,HL';
    case 'ex-sp-hl': return 'EX (SP),HL';
    case 'ex-af': return "EX AF,AF'";
    case 'exx': return 'EXX';
    case 'djnz': return `DJNZ ${h(d.target ?? 0)}`;
    case 'bit-test': return `BIT ${d.bit ?? '?'},${(d.reg ?? '?').toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${d.bit ?? '?'},(${(d.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'bit-set': return `SET ${d.bit ?? '?'},${(d.reg ?? '?').toUpperCase()}`;
    case 'bit-set-ind': return `SET ${d.bit ?? '?'},(${(d.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'bit-res': return `RES ${d.bit ?? '?'},${(d.reg ?? '?').toUpperCase()}`;
    case 'bit-res-ind': return `RES ${d.bit ?? '?'},(${(d.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'bit-test-idx': return `BIT ${d.bit ?? '?'},(${(d.indexReg ?? 'IX').toUpperCase()}+${d.offset ?? 0})`;
    case 'bit-set-idx': return `SET ${d.bit ?? '?'},(${(d.indexReg ?? 'IX').toUpperCase()}+${d.offset ?? 0})`;
    case 'bit-res-idx': return `RES ${d.bit ?? '?'},(${(d.indexReg ?? 'IX').toUpperCase()}+${d.offset ?? 0})`;
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'daa': return 'DAA';
    case 'neg': return 'NEG';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'rotate-reg': return `${(d.op ?? 'RL').toUpperCase()} ${(d.reg ?? '?').toUpperCase()}`;
    case 'rotate-ind': return `${(d.op ?? 'RL').toUpperCase()} (${(d.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'ldi': return 'LDI';
    case 'ldir': return 'LDIR';
    case 'ldd': return 'LDD';
    case 'lddr': return 'LDDR';
    case 'cpi': return 'CPI';
    case 'cpir': return 'CPIR';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'in-reg-c': return `IN ${(d.reg ?? '?').toUpperCase()},(C)`;
    case 'out-c-reg': return `OUT (C),${(d.reg ?? '?').toUpperCase()}`;
    case 'in-a-imm': return `IN A,(${h(d.port ?? 0, 2)})`;
    case 'out-imm-a': return `OUT (${h(d.port ?? 0, 2)}),A`;
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'im': return `IM ${d.mode ?? '?'}`;
    case 'ld-sp-hl': return 'LD SP,HL';
    case 'mode-sis': return `SIS prefix`;
    case 'mode-lis': return `LIS prefix`;
    case 'mode-sil': return `SIL prefix`;
    case 'mode-lil': return `LIL prefix`;
    default: {
      // Fallback: show all decoded fields
      const keys = Object.keys(d).filter((k) => !['pc', 'nextPc', 'length', 'mode', 'modePrefix'].includes(k));
      return `[${tag}] ${keys.map((k) => `${k}=${JSON.stringify(d[k])}`).join(' ')}`;
    }
  }
}

// ─── Part A: Static disassembly of 0x02398E..0x023A20 ───

function staticDisassembly() {
  console.log('--- Part A: Static disassembly of 0x02398E..0x023A20 ---\n');

  const results = [];
  let pc = DISASM_START;

  while (pc < DISASM_END) {
    let decoded;
    try {
      decoded = decodeInstruction(rom, pc, 'adl');
    } catch {
      // If decoder fails, show raw byte and advance
      console.log(`  ${hex(pc)}: [decode error] raw=${hexByte(rom[pc])}`);
      results.push({ addr: hex(pc), error: true, raw: hexByte(rom[pc]) });
      pc++;
      continue;
    }

    if (!decoded || !decoded.length) {
      console.log(`  ${hex(pc)}: [no decode] raw=${hexByte(rom[pc])}`);
      results.push({ addr: hex(pc), error: true, raw: hexByte(rom[pc]) });
      pc++;
      continue;
    }

    const instrLen = decoded.length;
    const rawBytes = [];
    for (let j = pc; j < pc + instrLen && j < rom.length; j++) {
      rawBytes.push(hexByte(rom[j]));
    }

    // Build a readable mnemonic from the decoded fields
    const mnemonic = formatInstruction(decoded);
    const line = `  ${hex(pc)}: ${rawBytes.join(' ').padEnd(24)} ${mnemonic}`;
    console.log(line);

    // Flag notable instructions
    const flags = [];
    const tag = decoded.tag ?? '';
    if (tag.includes('ld') && (decoded.dest === 'hl' || decoded.src === 'hl' ||
        decoded.reg === 'hl' || decoded.dest === 'l' || decoded.dest === 'h')) {
      flags.push('HL_LOAD');
    }
    if (tag === 'ret' || tag === 'ret-cc') {
      flags.push('RET');
    }
    if (tag.includes('call') || tag.includes('jp')) {
      flags.push('BRANCH');
    }

    results.push({
      addr: hex(pc),
      bytes: rawBytes.join(' '),
      mnemonic,
      tag,
      length: instrLen,
      decoded: { ...decoded, pc: undefined, nextPc: undefined },
      flags: flags.length > 0 ? flags : undefined,
    });

    pc += instrLen;
  }

  // Summarize notable instructions
  console.log('\n  Notable instructions:');
  for (const r of results) {
    if (r.flags && r.flags.length > 0) {
      console.log(`    ${r.addr}: ${r.mnemonic}  [${r.flags.join(', ')}]`);
    }
  }

  // Also do a raw hex dump for reference
  console.log('\n  Raw hex dump 0x02398E..0x023A20:');
  for (let row = DISASM_START; row < DISASM_END; row += 16) {
    const end = Math.min(row + 16, DISASM_END);
    const bytes = [];
    for (let j = row; j < end; j++) {
      bytes.push(hexByte(rom[j]));
    }
    console.log(`    ${hex(row)}: ${bytes.join(' ')}`);
  }

  return results;
}

// ─── Part B: Find all callers of 0x02398E ───

function findCallers() {
  console.log('\n--- Part B: Find all CALL/JP sites to 0x02398E ---\n');

  // CALL nn = CD xx xx xx (eZ80 ADL: 4 bytes)
  // JP nn   = C3 xx xx xx
  // Target in LE: 8E 39 02
  const targetLE = [0x8e, 0x39, 0x02];
  const callOpcode = 0xcd;
  const jpOpcode = 0xc3;

  // Also check conditional calls/jumps
  // CALL cc,nn: C4/CC/D4/DC/E4/EC/F4/FC + 3-byte addr
  // JP cc,nn: C2/CA/D2/DA/E2/EA/F2/FA + 3-byte addr
  const condCallOpcodes = [0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc];
  const condJpOpcodes = [0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea, 0xf2, 0xfa];

  const condNames = {
    0xc4: 'CALL NZ', 0xcc: 'CALL Z', 0xd4: 'CALL NC', 0xdc: 'CALL C',
    0xe4: 'CALL PO', 0xec: 'CALL PE', 0xf4: 'CALL P', 0xfc: 'CALL M',
    0xc2: 'JP NZ', 0xca: 'JP Z', 0xd2: 'JP NC', 0xda: 'JP C',
    0xe2: 'JP PO', 0xea: 'JP PE', 0xf2: 'JP P', 0xfa: 'JP M',
  };

  const allOpcodes = new Set([callOpcode, jpOpcode, ...condCallOpcodes, ...condJpOpcodes]);
  const hits = [];
  const scanEnd = Math.min(rom.length - 3, 0x0c0000);

  for (let i = 0; i < scanEnd; i++) {
    if (!allOpcodes.has(rom[i])) continue;
    if (rom[i + 1] === targetLE[0] && rom[i + 2] === targetLE[1] && rom[i + 3] === targetLE[2]) {
      const opcode = rom[i];
      let type;
      if (opcode === callOpcode) type = 'CALL';
      else if (opcode === jpOpcode) type = 'JP';
      else type = condNames[opcode] ?? `?? ${hexByte(opcode)}`;

      hits.push({ addr: hex(i), type });
      console.log(`  ${hex(i)}: ${type} 0x02398E`);
    }
  }

  if (hits.length === 0) {
    console.log('  No CALL/JP sites found.');
  }

  console.log(`\n  Total call/jump sites: ${hits.length}`);
  return hits;
}

// ─── Part C: Dynamic trace of 0x02398E ───

function dynamicTrace() {
  console.log('\n--- Part C: Dynamic trace of 0x02398E ---\n');

  const d0033aSeeds = [0, 5, 10, 0x20, 0x40, 0x80];
  const results = [];

  for (const seed of d0033aSeeds) {
    const mem = createMemoryWithRom();
    const { executor, cpu } = createRuntime(mem);

    // Set up CPU state as the caller would
    cpu.a = 0xd8;
    cpu.iy = IY_ADDR;
    cpu.mbase = MBASE;
    cpu.madl = 1;
    cpu.ix = IX_ADDR;
    cpu.sp = DEFAULT_STACK_TOP;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;

    // Set IY+53 bit 1 (this is the NZ condition that triggers this call)
    mem[D000B5_ADDR] = mem[D000B5_ADDR] | 0x02;

    // Seed D0033A
    mem[D0033A_ADDR] = seed & 0xff;

    // Push sentinel return address
    cpu.sp -= 3;
    write24(mem, cpu.sp, SENTINEL_RET);

    // Track visited PCs
    const visitedPCs = [];
    let returned = false;
    let runResult = null;
    let errorMsg = null;

    try {
      runResult = executor.runFrom(TARGET_FUNC, 'adl', {
        maxSteps: 5000,
        maxLoopIterations: 100,
        onBlock(pc) {
          visitedPCs.push(pc & 0xffffff);
          if ((pc & 0xffffff) === SENTINEL_RET) throw makeStop('returned');
        },
        onMissingBlock(pc) {
          visitedPCs.push(pc & 0xffffff);
          if ((pc & 0xffffff) === SENTINEL_RET) throw makeStop('returned');
        },
      });
    } catch (error) {
      if (error?.message === '__PHASE226_STOP__' && error.stopName === 'returned') {
        returned = true;
      } else {
        errorMsg = error?.message ?? String(error);
      }
    }

    const hlAfter = cpu.hl & 0xffffff;
    const aAfter = cpu.a & 0xff;

    // Read bytes pointed to by HL
    const hlBytes = [];
    for (let j = 0; j < 16; j++) {
      const addr = (hlAfter + j) & 0xffffff;
      hlBytes.push(mem[addr] & 0xff);
    }

    const result = {
      seed: hexByte(seed),
      returned,
      hlAfter: hex(hlAfter),
      aAfter: hexByte(aAfter),
      hlBytes: hlBytes.map(hexByte).join(' '),
      steps: runResult?.steps ?? null,
      termination: returned ? 'sentinel' : (runResult?.termination ?? errorMsg ?? null),
      visitedCount: visitedPCs.length,
      firstPCs: visitedPCs.slice(0, 20).map(hex),
    };

    // Check for magic values in HL bytes
    const magicFound = [];
    for (let j = 0; j < hlBytes.length; j++) {
      if (hlBytes[j] === 0xfa) magicFound.push({ offset: j, value: '0xFA (AlphaLock)' });
      if (hlBytes[j] === 0xfb) magicFound.push({ offset: j, value: '0xFB (Alpha)' });
      if (hlBytes[j] === 0xfc) magicFound.push({ offset: j, value: '0xFC (2nd)' });
      if (hlBytes[j] === 0xfe) magicFound.push({ offset: j, value: '0xFE (Fn)' });
    }
    result.magicFound = magicFound;

    results.push(result);

    console.log(`  D0033A seed=${hexByte(seed)}:`);
    console.log(`    returned=${returned}, HL=${hex(hlAfter)}, A=${hexByte(aAfter)}`);
    console.log(`    HL points to: ${result.hlBytes}`);
    if (magicFound.length > 0) {
      console.log(`    MAGIC VALUES FOUND: ${magicFound.map((m) => `[${m.offset}]=${m.value}`).join(', ')}`);
    }
    console.log(`    steps=${result.steps}, termination=${result.termination}`);
    console.log(`    first PCs: ${result.firstPCs.join(' -> ')}`);
    console.log('');
  }

  return results;
}

// ─── Part D: Table dump ───

function tableDump(disasmResults) {
  console.log('\n--- Part D: Table references found in disassembly ---\n');

  // Extract addresses from decoded instruction fields
  const tableAddrs = [];

  for (const r of disasmResults) {
    if (r.error || !r.decoded) continue;
    const tag = r.tag ?? '';
    const d = r.decoded;

    // LD HL,imm or LD reg16,imm where reg is hl
    if ((tag === 'ld-reg16-imm' || tag === 'ld-reg-imm') && (d.reg === 'hl')) {
      const addr = d.value ?? 0;
      if (addr > 0x000100) {
        tableAddrs.push({ source: r.addr, type: 'LD_HL', addr });
      }
    }

    // CALL/JP targets
    if (tag === 'call' || tag === 'call-cc' || tag === 'jp' || tag === 'jp-cc') {
      const addr = d.target ?? 0;
      if (addr > 0x000100 && addr < 0x400000) {
        tableAddrs.push({ source: r.addr, type: 'CALL/JP', addr });
      }
    }

    // Also catch any address field
    if (d.address && d.address > 0x000100) {
      tableAddrs.push({ source: r.addr, type: 'MEM_REF', addr: d.address });
    }
  }

  if (tableAddrs.length === 0) {
    console.log('  No table addresses found in disassembly.');
    return [];
  }

  const dumps = [];
  for (const t of tableAddrs) {
    console.log(`  ${t.source}: ${t.type} -> ${hex(t.addr)}`);

    // Dump 48 bytes from the address (if it's in ROM)
    if (t.addr < rom.length - 48) {
      const bytes = [];
      for (let j = 0; j < 48; j++) {
        bytes.push(rom[t.addr + j] & 0xff);
      }

      console.log(`    First 48 bytes: ${bytes.map(hexByte).join(' ')}`);

      // Check for magic values
      const magics = [];
      for (let j = 0; j < bytes.length; j++) {
        if (bytes[j] === 0xfa) magics.push(`[${j}]=0xFA`);
        if (bytes[j] === 0xfb) magics.push(`[${j}]=0xFB`);
        if (bytes[j] === 0xfc) magics.push(`[${j}]=0xFC`);
        if (bytes[j] === 0xfe) magics.push(`[${j}]=0xFE`);
      }
      if (magics.length > 0) {
        console.log(`    MAGIC VALUES: ${magics.join(', ')}`);
      }

      dumps.push({ ...t, bytes: bytes.map(hexByte), magics });
    }
    console.log('');
  }

  return dumps;
}

// ─── Part D2: Dynamic trace after full boot ───

function dynamicTraceAfterBoot() {
  console.log('\n--- Part D2: Dynamic trace of 0x02398E after full boot ---\n');

  const BOOT_ENTRY = 0x000000;
  const KERNEL_INIT_ENTRY = 0x08c331;
  const POST_INIT_ENTRY = 0x0802b2;
  const MEM_INIT_ENTRY = 0x09dee0;
  const MEM_INIT_RET = 0x7ffff6;
  const BOOT_MAX_STEPS = 20000;
  const KERNEL_INIT_MAX_STEPS = 100000;
  const POST_INIT_MAX_STEPS = 100;
  const MEM_INIT_MAX_STEPS = 100000;
  const MAX_LOOP_ITERATIONS = 8192;

  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  // Full boot sequence
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: BOOT_MAX_STEPS, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = DEFAULT_STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: KERNEL_INIT_MAX_STEPS, maxLoopIterations: 10000 });
  cpu.mbase = MBASE; cpu.iy = IY_ADDR; cpu.hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = DEFAULT_STACK_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: POST_INIT_MAX_STEPS, maxLoopIterations: 32 });

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = MBASE; cpu.iy = IY_ADDR; cpu.ix = IX_ADDR;
  cpu.sp = DEFAULT_STACK_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS, maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('ret'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEM_INIT_RET) throw makeStop('ret'); },
    });
  } catch (e) {
    if (!(e?.message === '__PHASE226_STOP__')) throw e;
  }

  // Dump RAM areas referenced by the function
  const ramAddrs = [0xD02611, 0xD025E1, 0xD025E4, 0xD025E7, 0xD025EA, 0xD025CF];
  console.log('  RAM state after full boot:');
  for (const addr of ramAddrs) {
    const bytes = [];
    for (let j = 0; j < 16; j++) bytes.push(hexByte(mem[(addr + j) & 0xffffff]));
    const ptr = read24(mem, addr);
    console.log(`    ${hex(addr)}: ${bytes.join(' ')}  (as ptr: ${hex(ptr)})`);
  }

  // Check IY+53 state
  console.log(`    IY+53 (${hex(D000B5_ADDR)}): ${hexByte(mem[D000B5_ADDR])} (bit 1 = ${(mem[D000B5_ADDR] >> 1) & 1})`);

  // Now try calling 0x02398E with the booted memory state
  const results = [];
  const aValues = [0xD8, 0x00, 0xFF];

  for (const aVal of aValues) {
    // Reset CPU for isolated call
    cpu.a = aVal;
    cpu.iy = IY_ADDR;
    cpu.mbase = MBASE;
    cpu.madl = 1;
    cpu.ix = IX_ADDR;
    cpu.sp = DEFAULT_STACK_TOP;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;

    // Set IY+53 bit 1
    mem[D000B5_ADDR] = mem[D000B5_ADDR] | 0x02;

    cpu.sp -= 3;
    write24(mem, cpu.sp, SENTINEL_RET);

    const visitedPCs = [];
    let returned = false;

    try {
      executor.runFrom(TARGET_FUNC, 'adl', {
        maxSteps: 5000,
        maxLoopIterations: 100,
        onBlock(pc) {
          visitedPCs.push(pc & 0xffffff);
          if ((pc & 0xffffff) === SENTINEL_RET) throw makeStop('returned');
        },
        onMissingBlock(pc) {
          visitedPCs.push(pc & 0xffffff);
          if ((pc & 0xffffff) === SENTINEL_RET) throw makeStop('returned');
        },
      });
    } catch (e) {
      if (e?.message === '__PHASE226_STOP__' && e.stopName === 'returned') returned = true;
      else console.log(`    Error: ${e?.message}`);
    }

    const hlAfter = cpu.hl & 0xffffff;
    const aAfter = cpu.a & 0xff;
    const hlBytes = [];
    for (let j = 0; j < 16; j++) hlBytes.push(mem[(hlAfter + j) & 0xffffff] & 0xff);

    const magicFound = [];
    for (let j = 0; j < hlBytes.length; j++) {
      if ([0xfa, 0xfb, 0xfc, 0xfe].includes(hlBytes[j])) {
        const names = { 0xfa: 'AlphaLock', 0xfb: 'Alpha', 0xfc: '2nd', 0xfe: 'Fn' };
        magicFound.push(`[${j}]=${hexByte(hlBytes[j])} (${names[hlBytes[j]]})`);
      }
    }

    console.log(`\n  A=${hexByte(aVal)}, after boot:`);
    console.log(`    returned=${returned}, HL=${hex(hlAfter)}, A=${hexByte(aAfter)}`);
    console.log(`    HL points to: ${hlBytes.map(hexByte).join(' ')}`);
    if (magicFound.length > 0) {
      console.log(`    MAGIC VALUES: ${magicFound.join(', ')}`);
    }
    console.log(`    first PCs: ${visitedPCs.slice(0, 20).map(hex).join(' -> ')}`);

    results.push({ aVal: hexByte(aVal), returned, hlAfter: hex(hlAfter), aAfter: hexByte(aAfter), hlBytes: hlBytes.map(hexByte), magicFound });
  }

  // Also dump what's at 0xD02611 as a pointer and follow it
  const ptr2611 = read24(mem, 0xD02611);
  console.log(`\n  Following pointer at D02611: ${hex(ptr2611)}`);
  if (ptr2611 > 0 && ptr2611 < 0x1000000) {
    const ptrBytes = [];
    for (let j = 0; j < 32; j++) ptrBytes.push(hexByte(mem[(ptr2611 + j) & 0xffffff]));
    console.log(`    Data at ${hex(ptr2611)}: ${ptrBytes.join(' ')}`);
  }

  // Also check 0x025758 (the called function) - what does it do?
  console.log('\n  Disassembly of called function 0x025758 (first 20 instrs):');
  let dpc = 0x025758;
  for (let i = 0; i < 20 && dpc < 0x025800; i++) {
    try {
      const d = decodeInstruction(rom, dpc, 'adl');
      const mn = formatInstruction(d);
      const rawBytes = [];
      for (let j = dpc; j < dpc + d.length; j++) rawBytes.push(hexByte(rom[j]));
      console.log(`    ${hex(dpc)}: ${rawBytes.join(' ').padEnd(24)} ${mn}`);
      dpc += d.length;
      if (d.tag === 'ret') break;
    } catch {
      console.log(`    ${hex(dpc)}: [decode error]`);
      dpc++;
    }
  }

  // And 0x025762 (the JP Z target from the function)
  console.log('\n  Disassembly of JP Z target 0x025762 (first 20 instrs):');
  dpc = 0x025762;
  for (let i = 0; i < 20 && dpc < 0x0257C0; i++) {
    try {
      const d = decodeInstruction(rom, dpc, 'adl');
      const mn = formatInstruction(d);
      const rawBytes = [];
      for (let j = dpc; j < dpc + d.length; j++) rawBytes.push(hexByte(rom[j]));
      console.log(`    ${hex(dpc)}: ${rawBytes.join(' ').padEnd(24)} ${mn}`);
      dpc += d.length;
      if (d.tag === 'ret') break;
    } catch {
      console.log(`    ${hex(dpc)}: [decode error]`);
      dpc++;
    }
  }

  return results;
}

// ─── Part E: Scan for SET 1,(IY+53) and RES 1,(IY+53) ───

function scanIyBit1() {
  console.log('\n--- Part E: SET 1,(IY+53) and RES 1,(IY+53) sites ---\n');

  // SET 1,(IY+53): FD CB 35 CE
  // RES 1,(IY+53): FD CB 35 8E
  const setPattern = [0xfd, 0xcb, 0x35, 0xce];
  const resPattern = [0xfd, 0xcb, 0x35, 0x8e];

  const setSites = [];
  const resSites = [];
  const scanEnd = Math.min(rom.length - 3, 0x0c0000);

  for (let i = 0; i < scanEnd; i++) {
    if (rom[i] !== 0xfd) continue;
    if (rom[i + 1] !== 0xcb) continue;
    if (rom[i + 2] !== 0x35) continue;

    if (rom[i + 3] === 0xce) {
      setSites.push(hex(i));
      console.log(`  SET 1,(IY+53) at ${hex(i)}`);
    } else if (rom[i + 3] === 0x8e) {
      resSites.push(hex(i));
      console.log(`  RES 1,(IY+53) at ${hex(i)}`);
    }
  }

  // Also scan for BIT 1,(IY+53): FD CB 35 4E
  const bitPattern = [0xfd, 0xcb, 0x35, 0x4e];
  const bitSites = [];
  for (let i = 0; i < scanEnd; i++) {
    if (rom[i] === 0xfd && rom[i + 1] === 0xcb && rom[i + 2] === 0x35 && rom[i + 3] === 0x4e) {
      bitSites.push(hex(i));
    }
  }

  console.log(`\n  SET 1,(IY+53) sites: ${setSites.length}`);
  console.log(`  RES 1,(IY+53) sites: ${resSites.length}`);
  console.log(`  BIT 1,(IY+53) sites: ${bitSites.length}`);

  if (bitSites.length > 0) {
    console.log(`  BIT 1,(IY+53) addresses: ${bitSites.join(', ')}`);
  }

  // For each SET site, show surrounding context (8 bytes before/after)
  console.log('\n  Context around SET sites:');
  for (const site of setSites) {
    const addr = parseInt(site.replace('0x', ''), 16);
    const before = Math.max(0, addr - 8);
    const after = Math.min(rom.length, addr + 12);
    const bytes = [];
    for (let j = before; j < after; j++) {
      bytes.push(hexByte(rom[j]));
    }
    console.log(`    ${site}: ${bytes.join(' ')}`);
  }

  return { setSites, resSites, bitSites };
}

// ─── Main ───

function main() {
  console.log('=== Phase 226: 0x02398E HL Loader Investigation ===');
  console.log('Target: 0x02398E — called when BIT 1,(IY+53) is SET');
  console.log('Purpose: loads HL for D0059F write at 0x051D4D');
  console.log('Entry condition: A = 0xD8\n');

  // Part A
  const disasmResults = staticDisassembly();

  // Part B
  const callers = findCallers();

  // Part C
  const dynamicResults = dynamicTrace();

  // Part D
  const tableDumps = tableDump(disasmResults);

  // Part D2
  const bootedResults = dynamicTraceAfterBoot();

  // Part E
  const iyResults = scanIyBit1();

  // Summary
  console.log('\n=== Phase 226 Summary ===');
  console.log(`  Disassembled ${disasmResults.length} instructions in 0x02398E..0x023A20`);
  console.log(`  Found ${callers.length} call/jump sites to 0x02398E`);
  console.log(`  Dynamic traces completed for ${dynamicResults.length} D0033A seeds`);

  const anyMagic = dynamicResults.some((r) => r.magicFound && r.magicFound.length > 0);
  console.log(`  Magic values found in HL output: ${anyMagic ? 'YES' : 'NO'}`);

  if (anyMagic) {
    for (const r of dynamicResults) {
      if (r.magicFound && r.magicFound.length > 0) {
        console.log(`    seed=${r.seed}: HL=${r.hlAfter} -> ${r.magicFound.map((m) => m.value).join(', ')}`);
      }
    }
  }

  console.log(`  SET 1,(IY+53) sites: ${iyResults.setSites.length}`);
  console.log(`  RES 1,(IY+53) sites: ${iyResults.resSites.length}`);
  console.log(`  BIT 1,(IY+53) test sites: ${iyResults.bitSites.length}`);

  // JSON report
  console.log('\n--- JSON Report ---');
  console.log(JSON.stringify({
    probe: 'probe-phase226-02398e-hl-loader.mjs',
    generatedAt: new Date().toISOString(),
    partA: { instructionCount: disasmResults.length, instructions: disasmResults },
    partB: { callerCount: callers.length, callers },
    partC: { traceCount: dynamicResults.length, traces: dynamicResults },
    partD: { tableDumpCount: tableDumps.length, tableDumps },
    partD2: { bootedTraces: bootedResults },
    partE: iyResults,
  }, null, 2));

  console.log('\n=== Phase 226 Complete ===');
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase226-02398e-hl-loader.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
