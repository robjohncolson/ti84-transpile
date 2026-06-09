#!/usr/bin/env node

/**
 * Phase 585 — Trace all type-0x09 event callers of 0x0236F9
 *
 * Session 584 resolved the event system: 0x0236F9 is the central event posting
 * dispatch (30 bytes, 42 callers). It writes a 3-byte record [type, mode, context]
 * to a stack-local buffer, then reads port 0xDCA0.
 *
 * Type 0x09 is the most frequent event type with 8 callers. This probe:
 * 1. Finds all CALL references to 0x0236F9 across the ROM
 * 2. Filters for callers that load A with 0x09 before the call
 * 3. Disassembles context around each call site
 * 4. Looks for post-call LDIR copies and RAM address references
 * 5. Summarizes findings with hypotheses
 */

import { readFileSync } from 'node:fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));
const ROM_SIZE = rom.length;

// ── Helpers ──────────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'push':
      text = `push ${inst.pair}`;
      break;
    case 'pop':
      text = `pop ${inst.pair}`;
      break;
    case 'ld-pair-imm':
      text = `ld ${inst.pair}, ${hex(inst.value)}`;
      break;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        text = `ld (${hex(inst.addr)}), ${inst.pair}`;
      } else {
        text = `ld ${inst.pair}, (${hex(inst.addr)})`;
      }
      break;
    case 'ld-reg-imm':
      text = `ld ${inst.dest}, ${hexByte(inst.value)}`;
      break;
    case 'ld-reg-reg':
      text = `ld ${inst.dest}, ${inst.src}`;
      break;
    case 'ld-reg-ind':
      text = `ld ${inst.dest}, (${inst.src})`;
      break;
    case 'ld-ind-reg':
      text = `ld (${inst.dest}), ${inst.src}`;
      break;
    case 'ld-ind-imm':
      text = `ld (hl), ${hexByte(inst.value)}`;
      break;
    case 'ld-reg-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld ${inst.dest}, (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'ld-ixd-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${inst.src}`;
      break;
    }
    case 'ld-ixd-imm': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `ld (${inst.indexRegister}${sign}${inst.displacement}), ${hexByte(inst.value)}`;
      break;
    }
    case 'alu-imm':
      text = `${inst.op} ${hexByte(inst.value)}`;
      break;
    case 'alu-reg':
      text = `${inst.op} ${inst.src}`;
      break;
    case 'alu-ixd': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `${inst.op} (${inst.indexRegister}${sign}${inst.displacement})`;
      break;
    }
    case 'call':
      text = `call ${hex(inst.target)}`;
      break;
    case 'call-conditional':
      text = `call ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jp':
      text = `jp ${hex(inst.target)}`;
      break;
    case 'jp-conditional':
      text = `jp ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jp-indirect':
      text = `jp (${inst.indirectRegister})`;
      break;
    case 'jr':
      text = `jr ${hex(inst.target)}`;
      break;
    case 'jr-conditional':
      text = `jr ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'ret':
      text = 'ret';
      break;
    case 'ret-conditional':
      text = `ret ${inst.condition}`;
      break;
    case 'inc-pair':
      text = `inc ${inst.pair}`;
      break;
    case 'dec-pair':
      text = `dec ${inst.pair}`;
      break;
    case 'inc-reg':
      text = `inc ${inst.reg}`;
      break;
    case 'dec-reg':
      text = `dec ${inst.reg}`;
      break;
    case 'add-pair':
      text = `add ${inst.dest}, ${inst.src}`;
      break;
    case 'djnz':
      text = `djnz ${hex(inst.target)}`;
      break;
    case 'rotate-reg':
      text = `${inst.op} ${inst.reg}`;
      break;
    case 'rotate-ind':
      text = `${inst.op} (${inst.indirectRegister})`;
      break;
    case 'bit-test':
      text = `bit ${inst.bit}, ${inst.reg}`;
      break;
    case 'bit-test-ind':
      text = `bit ${inst.bit}, (${inst.indirectRegister})`;
      break;
    case 'bit-set':
      text = `set ${inst.bit}, ${inst.reg}`;
      break;
    case 'bit-reset':
      text = `res ${inst.bit}, ${inst.reg}`;
      break;
    case 'ex-de-hl':
      text = 'ex de, hl';
      break;
    case 'ex-sp-pair':
      text = `ex (sp), ${inst.pair}`;
      break;
    case 'ldir':
      text = 'ldir';
      break;
    case 'ldi':
      text = 'ldi';
      break;
    case 'lddr':
      text = 'lddr';
      break;
    case 'ldd':
      text = 'ldd';
      break;
    case 'cpir':
      text = 'cpir';
      break;
    case 'in-port':
      text = `in a, (${hexByte(inst.port)})`;
      break;
    case 'in-reg-c':
      text = `in ${inst.dest}, (c)`;
      break;
    case 'out-port':
      text = `out (${hexByte(inst.port)}), a`;
      break;
    case 'out-c-reg':
      text = `out (c), ${inst.src}`;
      break;
    case 'rst':
      text = `rst ${hexByte(inst.target)}`;
      break;
    case 'di':
      text = 'di';
      break;
    case 'ei':
      text = 'ei';
      break;
    case 'halt':
      text = 'halt';
      break;
    case 'nop':
      text = 'nop';
      break;
    case 'lea': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `lea ${inst.dest}, ${inst.indexRegister}${sign}${inst.displacement}`;
      break;
    }
    case 'pea': {
      const sign = inst.displacement >= 0 ? '+' : '';
      text = `pea ${inst.indexRegister}${sign}${inst.displacement}`;
      break;
    }
    default:
      break;
  }

  return `${prefix}${text}`;
}

// ── Step 1: Find all CALL 0x0236F9 sites ────────────────────────────────────

console.log('=== Phase 585: Trace type-0x09 event callers of 0x0236F9 ===\n');

const TARGET = 0x0236F9;
const callSites = [];

// Pattern 1: CD F9 36 02 (ADL CALL nn — 4 bytes: CD + 3-byte LE address)
for (let i = 0; i < ROM_SIZE - 3; i++) {
  if (rom[i] === 0xCD && rom[i + 1] === 0xF9 && rom[i + 2] === 0x36 && rom[i + 3] === 0x02) {
    callSites.push({ addr: i, pattern: 'CD (ADL CALL)', length: 4 });
  }
}

// Pattern 2: .SIS prefix + CALL — prefix bytes 0x40/0x49/0x52/0x5B then CD
for (const prefix of [0x40, 0x49, 0x52, 0x5B]) {
  for (let i = 0; i < ROM_SIZE - 4; i++) {
    if (rom[i] === prefix && rom[i + 1] === 0xCD && rom[i + 2] === 0xF9 && rom[i + 3] === 0x36 && rom[i + 4] === 0x02) {
      if (!callSites.some(s => s.addr === i)) {
        callSites.push({ addr: i, pattern: `prefixed CALL (${hex(prefix, 2)})`, length: 5 });
      }
    }
  }
}

// Sort by address
callSites.sort((a, b) => a.addr - b.addr);

console.log(`Found ${callSites.length} total CALL sites to 0x0236F9\n`);

// ── Step 2: Find type-0x09 callers ──────────────────────────────────────────

// Look backward from each CALL for LD A, imm8 (3E xx)
const type09Callers = [];
const otherCallers = new Map(); // eventType -> [addresses]

for (const site of callSites) {
  const searchStart = Math.max(0, site.addr - 20);
  let foundType = null;

  // Search backward for LD A, imm8 (3E xx) — the closest one before the CALL
  for (let j = site.addr - 2; j >= searchStart; j--) {
    if (rom[j] === 0x3E) {
      foundType = rom[j + 1];
      break;
    }
  }

  if (foundType === 0x09) {
    type09Callers.push(site);
  } else {
    const key = foundType !== null ? `0x${foundType.toString(16).padStart(2, '0')}` : 'unknown';
    if (!otherCallers.has(key)) otherCallers.set(key, []);
    otherCallers.get(key).push(site.addr);
  }
}

console.log(`Type-0x09 callers: ${type09Callers.length}`);
console.log(`Other callers by event type:`);
for (const [type, addrs] of [...otherCallers.entries()].sort()) {
  console.log(`  type ${type}: ${addrs.length} caller(s) at ${addrs.map(a => hex(a)).join(', ')}`);
}
console.log();

// ── Step 3: Disassemble context around each type-0x09 caller ────────────────

for (const site of type09Callers) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`TYPE-0x09 CALLER at ${hex(site.addr)} (${site.pattern})`);
  console.log('='.repeat(72));

  // Find a reasonable start point ~30 bytes before the CALL for disassembly
  const disasmStart = Math.max(0, site.addr - 30);
  const disasmEnd = Math.min(ROM_SIZE, site.addr + site.length + 40);

  // Disassemble the region
  const instructions = [];
  let pc = disasmStart;

  while (pc < disasmEnd) {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || inst.length === 0) {
      instructions.push({ pc, length: 1, text: `db ${hexByte(rom[pc])}`, raw: null, inst: null });
      pc += 1;
      continue;
    }

    const text = formatInstruction(inst);
    const rawBytes = Array.from(rom.slice(pc, pc + inst.length)).map(b => b.toString(16).padStart(2, '0')).join(' ');

    instructions.push({ pc, length: inst.length, text, raw: rawBytes, inst });
    pc = inst.nextPc;
  }

  // Print with markers
  console.log('\nDisassembly context:');
  for (const entry of instructions) {
    const marker = entry.pc === site.addr ? ' <<<< CALL 0x0236F9' : '';
    const rawStr = entry.raw ? ` [${entry.raw}]` : '';
    console.log(`  ${hex(entry.pc)}: ${entry.text.padEnd(40)}${rawStr}${marker}`);
  }

  // ── Step 4: Look for post-call patterns ─────────────────────────────────

  const postCallInstructions = instructions.filter(e => e.pc > site.addr);

  // Check for LDIR within 30 bytes after the CALL
  let hasLdir = false;
  let ldirAddr = null;
  for (const entry of postCallInstructions) {
    if (entry.pc > site.addr + site.length + 30) break;
    if (entry.text.includes('ldir')) {
      hasLdir = true;
      ldirAddr = entry.pc;
      break;
    }
  }

  // Collect RAM address references from all instructions in context
  const ramRefs = [];
  const seenRam = new Set();
  for (const entry of instructions) {
    if (!entry.inst) continue;
    // Check various fields for RAM addresses
    for (const key of ['addr', 'target', 'value']) {
      const val = entry.inst[key];
      if (typeof val === 'number' && val >= 0xD00000 && val <= 0xD40000) {
        const rkey = `${hex(entry.pc)}-${hex(val)}`;
        if (!seenRam.has(rkey)) {
          seenRam.add(rkey);
          ramRefs.push({ pc: entry.pc, addr: val, field: key });
        }
      }
    }
    // LD pair,imm with RAM address
    if (entry.inst.tag === 'ld-pair-imm' && entry.inst.value >= 0xD00000 && entry.inst.value <= 0xD40000) {
      const rkey = `${hex(entry.pc)}-${hex(entry.inst.value)}-pair`;
      if (!seenRam.has(rkey)) {
        seenRam.add(rkey);
        ramRefs.push({ pc: entry.pc, addr: entry.inst.value, field: 'ld-pair-imm' });
      }
    }
  }

  console.log('\nPost-call analysis:');
  if (hasLdir) {
    console.log(`  LDIR found at ${hex(ldirAddr)} (block copy after event post)`);
  } else {
    console.log('  No LDIR within 30 bytes after CALL');
  }

  if (ramRefs.length > 0) {
    console.log('  RAM references in context:');
    for (const ref of ramRefs) {
      console.log(`    at ${hex(ref.pc)}: ${hex(ref.addr)} (${ref.field})`);
    }
  } else {
    console.log('  No explicit RAM address references found in context');
  }

  // Estimate function start — search backward for RET
  let funcStart = site.addr;
  for (let j = site.addr - 1; j >= Math.max(0, site.addr - 100); j--) {
    if (rom[j] === 0xC9) {
      funcStart = j + 1;
      break;
    }
  }
  console.log(`  Estimated function start: ${hex(funcStart)} (nearest prior RET + 1)`);
}

// ── Step 5: Summary table ───────────────────────────────────────────────────

console.log(`\n\n${'='.repeat(72)}`);
console.log('SUMMARY: All type-0x09 event callers');
console.log('='.repeat(72));
console.log(`${'Address'.padEnd(14)} ${'Post-LDIR?'.padEnd(12)} ${'RAM Refs'.padEnd(30)} Notes`);
console.log('-'.repeat(72));

for (const site of type09Callers) {
  // Re-check LDIR (ED B0)
  let hasLdir = false;
  for (let j = site.addr + site.length; j < Math.min(ROM_SIZE, site.addr + site.length + 30) - 1; j++) {
    if (rom[j] === 0xED && rom[j + 1] === 0xB0) {
      hasLdir = true;
      break;
    }
  }

  // Collect RAM refs from nearby LD pair,imm patterns
  const nearbyRamRefs = [];
  const scanStart = Math.max(0, site.addr - 20);
  const scanEnd = Math.min(ROM_SIZE, site.addr + site.length + 30);
  for (let j = scanStart; j < scanEnd - 3; j++) {
    // LD BC/DE/HL, imm24: 01/11/21 + 3 bytes
    if ((rom[j] === 0x01 || rom[j] === 0x11 || rom[j] === 0x21) && j + 3 < ROM_SIZE) {
      const val = rom[j + 1] | (rom[j + 2] << 8) | (rom[j + 3] << 16);
      if (val >= 0xD00000 && val <= 0xD40000) {
        const pair = rom[j] === 0x01 ? 'BC' : rom[j] === 0x11 ? 'DE' : 'HL';
        nearbyRamRefs.push(`${pair}=${hex(val)}`);
      }
    }
  }

  const ldirStr = hasLdir ? 'YES' : 'no';
  const ramStr = nearbyRamRefs.length > 0 ? nearbyRamRefs.join(', ') : '-';

  // ROM region hint
  let region = '';
  const addr = site.addr;
  if (addr >= 0x020000 && addr < 0x030000) region = 'OS core';
  else if (addr >= 0x050000 && addr < 0x060000) region = 'token/edit';
  else if (addr >= 0x060000 && addr < 0x070000) region = 'UI/graph';
  else if (addr >= 0x070000 && addr < 0x080000) region = 'app handlers';
  else if (addr >= 0x080000 && addr < 0x090000) region = 'key processing';
  else if (addr >= 0x090000 && addr < 0x0A0000) region = 'math/render';
  else if (addr >= 0x0A0000 && addr < 0x0B0000) region = 'scan/input';
  else region = `region ${hex(addr & 0xFF0000)}`;

  console.log(`${hex(site.addr).padEnd(14)} ${ldirStr.padEnd(12)} ${ramStr.padEnd(30)} ${region}`);
}

console.log(`\n\nTotal CALL 0x0236F9 sites: ${callSites.length}`);
console.log(`Type-0x09 callers: ${type09Callers.length}`);
console.log('\nHypothesis: Event type 0x09 appears to be the most frequent event');
console.log('type posted to the central dispatch. Based on caller locations and');
console.log('post-call behavior (LDIR copies, RAM buffer references), type 0x09');
console.log('likely represents a KEY EVENT or INPUT NOTIFICATION — the event that');
console.log('signals "a key has been processed" to the OS event loop.');
console.log('\nDone.');
