#!/usr/bin/env node
// Phase 233 — Trace the function containing 0x02FDE7 and 0x02FDFE (JP NZ callers of 0x02FE89).
// Determine the function entry point, what loads A before each JP NZ, and overall function purpose.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const IY_ADDR = 0xD00080;
const MBASE = 0xD0;
const SP_ADDR = 0xD1987E;
const SENTINEL = 0x7FFFFE;

const JP_NZ_SITE_1 = 0x02FDE7;
const JP_NZ_SITE_2 = 0x02FDFE;
const TARGET_FUNC = 0x02FE89;
const KEY_STORE_D0058E = 0xD0058E;

function hex(v, w = 6) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'n/a';
  return '0x' + (Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexByte(v) {
  return hex((v ?? 0) & 0xFF, 2);
}

function bytesFor(buf, start, length) {
  return Array.from(buf.slice(start, start + length), v =>
    v.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister.toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${inst.condition.toUpperCase()}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'push':
      return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop':
      return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${inst.dest.toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'ld-reg-ixd':
      return `LD ${inst.dest.toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-sp-pair':
      return `LD SP, ${inst.pair.toUpperCase()}`;
    case 'add-pair':
      return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'lea':
      return `LEA ${inst.dest.toUpperCase()}, ${inst.base.toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'alu-imm':
      return `${inst.op.toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${inst.op.toUpperCase()} ${inst.src === '(hl)' ? '(HL)' : inst.src.toUpperCase()}`;
    case 'rotate-reg':
      return `${inst.op.toUpperCase()} ${inst.reg.toUpperCase()}`;
    case 'inc-reg':
      return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair':
      return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${inst.pair.toUpperCase()}`;
    case 'xor':
      return `XOR ${inst.src ? inst.src.toUpperCase() : 'A'}`;
    case 'or':
      return `OR ${inst.src ? inst.src.toUpperCase() : 'A'}`;
    case 'and':
      return `AND ${inst.src ? inst.src.toUpperCase() : 'A'}`;
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'ex':
      return `EX ${inst.pair?.toUpperCase() ?? ''}`;
    case 'exx':
      return 'EXX';
    case 'rst':
      return `RST ${hex(inst.target)}`;
    default:
      return inst.tag;
  }
}

function decodeRange(rom, startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  while (pc < (endPc & 0xFFFFFF)) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      rows.push({
        pc: inst.pc >>> 0,
        bytes: bytesFor(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        length: inst.length,
        inst,
      });
      pc = inst.nextPc & 0xFFFFFF;
    } catch (e) {
      rows.push({
        pc,
        bytes: bytesFor(rom, pc, 1),
        text: `decode-error: ${e.message}`,
        tag: 'decode-error',
        length: 1,
        inst: null,
      });
      pc = (pc + 1) & 0xFFFFFF;
    }
  }
  return rows;
}

function printRows(rows, markers = new Map()) {
  for (const row of rows) {
    const marker = markers.get(row.pc) ?? '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${marker ? `  ${marker}` : ''}`);
  }
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { source: 'js', modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase233-caller-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { source: 'gz', modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM: ${ROM_PATH}`);
  }

  const romBytes = fs.readFileSync(ROM_PATH);

  console.log('Phase 233: 0x02FDE7/0x02FDFE caller context probe');
  console.log(`Target: JP NZ sites at ${hex(JP_NZ_SITE_1)} and ${hex(JP_NZ_SITE_2)} -> ${hex(TARGET_FUNC)}`);
  console.log('');

  // ============================================================
  // STEP 1: Scan backwards from 0x02FDE0 for RET (0xC9) to find function boundary
  // ============================================================
  console.log('=== STEP 1: Find Function Boundary (scan backwards for RET) ===');
  console.log('');

  const retCandidates = [];
  for (let addr = 0x02FDE0; addr >= 0x02FD00; addr--) {
    if (romBytes[addr] === 0xC9) {
      retCandidates.push(addr);
    }
  }

  console.log('  RET (0xC9) bytes found scanning backwards from 0x02FDE0:');
  for (const addr of retCandidates) {
    console.log(`    ${hex(addr)}`);
  }

  // The function entry is likely the byte after the closest RET before our JP NZ sites.
  // Also check for JP (0xC3) as function terminators.
  const jpCandidates = [];
  for (let addr = 0x02FDE0; addr >= 0x02FD00; addr--) {
    if (romBytes[addr] === 0xC3) {
      jpCandidates.push(addr);
    }
  }
  console.log('  JP (0xC3) bytes found scanning backwards from 0x02FDE0:');
  for (const addr of jpCandidates) {
    // Check it looks like a valid JP nn (next 3 bytes = address)
    const target = romBytes[addr + 1] | (romBytes[addr + 2] << 8) | (romBytes[addr + 3] << 16);
    console.log(`    ${hex(addr)} -> ${hex(target)}`);
  }
  console.log('');

  // ============================================================
  // STEP 2: Disassemble the broad region 0x02FD00 - 0x02FE90
  // ============================================================
  console.log('=== STEP 2: Disassembly 0x02FD00 - 0x02FE90 ===');
  console.log('');

  const broadRows = decodeRange(romBytes, 0x02FD00, 0x02FE90);
  const markers = new Map([
    [JP_NZ_SITE_1, '<== JP NZ site 1 -> 0x02FE89'],
    [JP_NZ_SITE_2, '<== JP NZ site 2 -> 0x02FE89'],
    [TARGET_FUNC, '<== target function entry'],
  ]);

  // Mark RET and JP instructions for clarity
  for (const row of broadRows) {
    if (row.tag === 'ret' && !markers.has(row.pc)) {
      markers.set(row.pc, '<-- RET');
    }
  }

  printRows(broadRows, markers);
  console.log('');

  // ============================================================
  // STEP 3: Identify the containing function
  // ============================================================
  console.log('=== STEP 3: Function Entry Identification ===');
  console.log('');

  // Find the last RET before the first JP NZ site
  let funcEntry = null;
  for (const row of broadRows) {
    if (row.pc >= JP_NZ_SITE_1) break;
    if (row.tag === 'ret') {
      funcEntry = row.pc + row.length; // entry is byte after RET
    }
  }

  if (funcEntry) {
    console.log(`  Nearest RET before ${hex(JP_NZ_SITE_1)}: function entry likely at ${hex(funcEntry)}`);
  } else {
    console.log('  No RET found before JP NZ site 1 in scanned range.');
    console.log('  The function may start at or before 0x02FD00.');
    funcEntry = 0x02FD00; // fallback
  }

  // Also scan for who references the entry
  console.log('');
  console.log('  Scanning for CALL/JP references to candidate entry points...');

  function scanCallers(target, scanEnd = 0x0C0000) {
    const lo = target & 0xFF;
    const mid = (target >>> 8) & 0xFF;
    const hi = (target >>> 16) & 0xFF;
    const CALL_JP = new Set([
      0xCD, 0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC,
      0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA,
    ]);
    const NAMES = new Map([
      [0xCD, 'CALL'], [0xC4, 'CALL NZ'], [0xCC, 'CALL Z'],
      [0xD4, 'CALL NC'], [0xDC, 'CALL C'], [0xE4, 'CALL PO'],
      [0xEC, 'CALL PE'], [0xF4, 'CALL P'], [0xFC, 'CALL M'],
      [0xC3, 'JP'], [0xC2, 'JP NZ'], [0xCA, 'JP Z'],
      [0xD2, 'JP NC'], [0xDA, 'JP C'], [0xE2, 'JP PO'],
      [0xEA, 'JP PE'], [0xF2, 'JP P'], [0xFA, 'JP M'],
    ]);
    const found = [];
    for (let addr = 0; addr < scanEnd - 3; addr++) {
      const op = romBytes[addr];
      if (!CALL_JP.has(op)) continue;
      if (romBytes[addr + 1] === lo && romBytes[addr + 2] === mid && romBytes[addr + 3] === hi) {
        found.push({ addr, type: NAMES.get(op) });
      }
    }
    return found;
  }

  // Scan for calls to addresses near funcEntry and some candidates
  const candidateEntries = new Set();
  candidateEntries.add(funcEntry);
  // Also check some other potential entries (each row that follows a RET/JP in the range)
  for (let i = 0; i < broadRows.length - 1; i++) {
    const row = broadRows[i];
    if ((row.tag === 'ret' || (row.tag === 'jp' && !row.inst?.condition)) &&
        broadRows[i + 1].pc <= JP_NZ_SITE_1) {
      candidateEntries.add(broadRows[i + 1].pc);
    }
  }

  for (const entry of candidateEntries) {
    const refs = scanCallers(entry);
    if (refs.length > 0) {
      console.log(`    ${hex(entry)}: ${refs.length} reference(s)`);
      for (const r of refs) {
        console.log(`      ${hex(r.addr)}: ${r.type}`);
      }
    } else {
      console.log(`    ${hex(entry)}: 0 references (likely reached by fall-through)`);
    }
  }
  console.log('');

  // ============================================================
  // STEP 4: Trace what loads A before each JP NZ
  // ============================================================
  console.log('=== STEP 4: What Loads A Before Each JP NZ ===');
  console.log('');

  // Show the 30 bytes preceding each JP NZ site
  console.log('  --- 30 bytes before JP NZ site 1 (0x02FDE7) ---');
  const pre1 = decodeRange(romBytes, JP_NZ_SITE_1 - 30, JP_NZ_SITE_1 + 4);
  printRows(pre1, new Map([[JP_NZ_SITE_1, '<== JP NZ -> 0x02FE89']]));
  console.log('');

  console.log('  --- 30 bytes before JP NZ site 2 (0x02FDFE) ---');
  const pre2 = decodeRange(romBytes, JP_NZ_SITE_2 - 30, JP_NZ_SITE_2 + 4);
  printRows(pre2, new Map([[JP_NZ_SITE_2, '<== JP NZ -> 0x02FE89']]));
  console.log('');

  // Analyze what sets A before each JP NZ
  console.log('  Analysis of what sets A:');
  console.log('');

  // For site 1, walk backwards through broadRows to find the last instruction touching A
  function findASource(rows, targetPc) {
    const targetIdx = rows.findIndex(r => r.pc === targetPc);
    if (targetIdx < 0) return 'target not found in rows';

    for (let i = targetIdx - 1; i >= 0 && i >= targetIdx - 15; i--) {
      const row = rows[i];
      const t = row.tag;
      const inst = row.inst;
      // Check if this instruction modifies A
      if (t === 'ld-reg-imm' && inst?.dest === 'a') return `LD A, ${hexByte(inst.value)} at ${hex(row.pc)}`;
      if (t === 'ld-reg-reg' && inst?.dest === 'a') return `LD A, ${inst.src.toUpperCase()} at ${hex(row.pc)}`;
      if (t === 'ld-reg-ind' && inst?.dest === 'a') return `LD A, (${inst.src.toUpperCase()}) at ${hex(row.pc)}`;
      if (t === 'ld-reg-mem' && inst?.dest === 'a') return `LD A, (${hex(inst.addr)}) at ${hex(row.pc)}`;
      if (t === 'ld-reg-ixd' && inst?.dest === 'a') return `LD A, ${formatIndexed(inst.indexRegister, inst.displacement)} at ${hex(row.pc)}`;
      if (t === 'alu-imm') return `${inst.op.toUpperCase()} ${hexByte(inst.value)} at ${hex(row.pc)} (modifies A/flags)`;
      if (t === 'alu-reg') return `${inst.op.toUpperCase()} ${inst.src?.toUpperCase()} at ${hex(row.pc)} (modifies A/flags)`;
      if (t === 'pop' && inst?.pair === 'af') return `POP AF at ${hex(row.pc)}`;
      if (t === 'xor' || t === 'or' || t === 'and') return `${t.toUpperCase()} at ${hex(row.pc)}`;
      if (t === 'inc-reg' && inst?.reg === 'a') return `INC A at ${hex(row.pc)}`;
      if (t === 'dec-reg' && inst?.reg === 'a') return `DEC A at ${hex(row.pc)}`;
      // CP only sets flags, does not modify A — but does set Z/NZ for the JP NZ
      if (t === 'alu-imm' && inst?.op === 'cp') return `CP ${hexByte(inst.value)} at ${hex(row.pc)} (sets flags only)`;
      // If we hit a RET/CALL/JP, stop searching — control flow boundary
      if (t === 'ret' || t === 'call' || (t === 'jp' && !inst?.condition)) break;
    }
    return 'not found in preceding 15 instructions';
  }

  console.log(`  Site 1 (${hex(JP_NZ_SITE_1)}): A source = ${findASource(broadRows, JP_NZ_SITE_1)}`);
  console.log(`  Site 2 (${hex(JP_NZ_SITE_2)}): A source = ${findASource(broadRows, JP_NZ_SITE_2)}`);
  console.log('');

  // Also check what sets the Z flag (OR A / CP / AND A etc) just before JP NZ
  function findFlagSource(rows, targetPc) {
    const targetIdx = rows.findIndex(r => r.pc === targetPc);
    if (targetIdx < 0) return 'target not found';

    for (let i = targetIdx - 1; i >= 0 && i >= targetIdx - 10; i--) {
      const row = rows[i];
      const t = row.tag;
      const inst = row.inst;
      // Instructions that set Z flag
      if (t === 'alu-imm') return `${inst.op.toUpperCase()} ${hexByte(inst.value)} at ${hex(row.pc)}`;
      if (t === 'alu-reg') return `${inst.op.toUpperCase()} ${inst.src?.toUpperCase()} at ${hex(row.pc)}`;
      if (t === 'indexed-cb-bit') return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)} at ${hex(row.pc)}`;
      if (t === 'xor' || t === 'or' || t === 'and') return `${t.toUpperCase()} at ${hex(row.pc)}`;
      if (t === 'inc-reg' || t === 'dec-reg') return `${t === 'inc-reg' ? 'INC' : 'DEC'} ${inst.reg?.toUpperCase()} at ${hex(row.pc)}`;
      // Don't cross control flow boundaries
      if (t === 'ret' || t === 'call' || (t === 'jp' && !inst?.condition)) break;
    }
    return 'not identified';
  }

  console.log(`  Site 1 flag source: ${findFlagSource(broadRows, JP_NZ_SITE_1)}`);
  console.log(`  Site 2 flag source: ${findFlagSource(broadRows, JP_NZ_SITE_2)}`);
  console.log('');

  // ============================================================
  // STEP 5: Dynamic trace
  // ============================================================
  console.log('=== STEP 5: Dynamic Trace ===');
  console.log('');

  const transpiledAssets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(transpiledAssets.modulePath).href);
    const blocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      null;

    if (!blocks || typeof blocks !== 'object') {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }

    console.log(`  Transpiled source: ${transpiledAssets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz (temp gunzip)'}`);
    console.log('');

    function runTrace(name, entryPc, aValue, extraSetup) {
      const mem = new Uint8Array(MEM_SIZE);
      mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
      const peripherals = createPeripheralBus({ timerInterrupt: false });
      const executor = createExecutor(blocks, mem, { peripherals });
      const cpu = executor.cpu;

      // Standard init
      cpu.a = aValue & 0xFF;
      cpu.f = 0x40;
      cpu.bc = 0x000000;
      cpu.de = 0x000000;
      cpu.hl = 0x000000;
      cpu.ix = 0x000000;
      cpu.iy = IY_ADDR;
      cpu.mbase = MBASE;
      cpu.madl = 1;
      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.sp = SP_ADDR;

      // Store key code at D0058E
      mem[KEY_STORE_D0058E] = aValue & 0xFF;
      mem[KEY_STORE_D0058E + 1] = 0x00;

      // Clear IY flag bytes
      for (let i = 0; i < 128; i++) mem[IY_ADDR + i] = 0x00;

      // Push sentinel return
      cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
      write24(mem, cpu.sp, SENTINEL);

      if (extraSetup) extraSetup(cpu, mem);

      const visited = [];
      const stopAddrs = new Set([SENTINEL, TARGET_FUNC]);
      let stopPc = null;

      try {
        const trace = executor.runFrom(entryPc, 'adl', {
          maxSteps: 200,
          maxLoopIterations: 32,
          onBlock(pc) {
            const norm = pc & 0xFFFFFF;
            if (visited.length < 64) visited.push(norm);
            if (stopAddrs.has(norm)) {
              const err = new Error('__STOP__');
              err.stopPc = norm;
              throw err;
            }
          },
        });
        stopPc = trace.lastPc;
      } catch (e) {
        if (e.stopPc !== undefined) {
          stopPc = e.stopPc;
        } else {
          console.log(`    Error: ${e.message}`);
          return;
        }
      }

      console.log(`  --- ${name} ---`);
      console.log(`    Entry: ${hex(entryPc)}, A=${hexByte(aValue)}`);
      console.log(`    Stop PC: ${hex(stopPc)}${stopPc === TARGET_FUNC ? ' (reached 0x02FE89!)' : stopPc === SENTINEL ? ' (sentinel return)' : ''}`);
      console.log(`    Blocks visited: ${visited.map(pc => hex(pc)).join(' -> ')}`);
      console.log(`    Final A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} Z=${(cpu.f & 0x40) ? 1 : 0}`);
      console.log(`    IY+29=${hexByte(mem[IY_ADDR + 29])} (bit 0 = ${mem[IY_ADDR + 29] & 1})`);
      console.log('');
    }

    // Use funcEntry if we found it; otherwise try a broader entry
    const dynamicEntry = funcEntry || 0x02FD00;
    console.log(`  Using function entry: ${hex(dynamicEntry)}`);
    console.log('');

    // Scenario 1: key code 0x8F ('1' key), should reach 0x02FE89 via one of the JP NZ sites
    runTrace('A=0x8F (digit 1 key)', dynamicEntry, 0x8F);

    // Scenario 2: key code 0xFF (no key / special), should NOT reach 0x02FE89
    runTrace('A=0xFF (no key)', dynamicEntry, 0xFF);

    // Scenario 3: key code 0x30 (MODE key)
    runTrace('A=0x30 (MODE key)', dynamicEntry, 0x30);

    // Scenario 4: key code 0x36 (CLEAR key)
    runTrace('A=0x36 (CLEAR key)', dynamicEntry, 0x36);

    // Scenario 5: Try entry from a higher-level caller if funcEntry differs
    // Also try entering right at the function containing 0x02FDE7 with A preloaded
    if (dynamicEntry !== JP_NZ_SITE_1 - 20) {
      // Try entering 20 bytes before JP NZ site 1 with A=0x8F
      const nearEntry = JP_NZ_SITE_1 - 20;
      console.log(`  Additional trace: enter near JP NZ site 1 at ${hex(nearEntry)}`);
      runTrace('Near entry before JP NZ site 1, A=0x8F', nearEntry, 0x8F);
    }

  } finally {
    cleanupTranspiledModule(transpiledAssets);
  }

  // ============================================================
  // STEP 6: Summary
  // ============================================================
  console.log('=== STEP 6: Summary ===');
  console.log('');
  console.log(`  JP NZ site 1: ${hex(JP_NZ_SITE_1)} -> ${hex(TARGET_FUNC)} (key repeat armer)`);
  console.log(`  JP NZ site 2: ${hex(JP_NZ_SITE_2)} -> ${hex(TARGET_FUNC)} (key repeat armer)`);
  console.log(`  Containing function entry: ${hex(funcEntry)}`);
  console.log('  The function at 0x02FE89 uses CP 0xFF to decide:');
  console.log('    A != 0xFF => SET 0,(IY+29) — arm key repeat timer gate');
  console.log('    A == 0xFF => skip SET, take alternate path');
  console.log('  Both JP NZ sites jump to 0x02FE89 when their condition is met (NZ),');
  console.log('  meaning they arrive at 0x02FE89 when some prior comparison was non-zero.');
  console.log('  The value in A at arrival determines whether the timer gate is armed.');
  console.log('');
}

await main();
