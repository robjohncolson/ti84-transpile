#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

const rom = fs.readFileSync(ROM_PATH);

const REQUEST_START = 0x046508;
const REQUEST_END = 0x046673;
const TAIL_START = 0x046677;
const TAIL_END = 0x046688;
const ENTRY_START = 0x0464D3;
const PREAMBLE_START = 0x0464D3;
const PREAMBLE_END = 0x046506;
const CALLER_CONTEXT_START = 0x046689;
const CALLER_CONTEXT_MAX_INSTR = 16;

const DIRECT_CALL_046508 = [0xCD, 0x08, 0x65, 0x04];
const DIRECT_CALL_046500 = [0xCD, 0x00, 0x65, 0x04];
const DIRECT_CALL_0464D3 = [0xCD, 0xD3, 0x64, 0x04];
const Z80_CALL_64D3 = [0xCD, 0xD3, 0x64];

const ADDR_NAMES = new Map([
  [0xE00900, 'keyboard data latch'],
  [0xE00818, 'keyboard scan-status'],
  [0xE00824, 'keyboard ready/ack'],
  [0xE00830, 'keyboard ctrl[0x30]'],
  [0xE00831, 'keyboard ctrl[0x31]'],
  [0xE00832, 'keyboard ctrl[0x32]'],
  [0xE00833, 'keyboard ctrl[0x33]'],
  [0xE00800, 'keyboard ctrl[0x00..0x02]'],
  [0xE00803, 'keyboard ctrl[0x03]'],
  [0xE00804, 'keyboard ctrl[0x04..0x06]'],
  [0xE00807, 'keyboard ctrl[0x07]'],
  [0xE00808, 'keyboard ctrl[0x08]'],
  [0xE00809, 'keyboard ctrl[0x09..0x0B]'],
  [0xE0080C, 'keyboard ctrl[0x0C..0x0E]'],
  [0xE0080F, 'keyboard ctrl[0x0F]'],
  [0xD17731, 'scan_buf[0]'],
  [0xD17732, 'scan_buf[1]'],
  [0xD17733, 'scan_buf[2]'],
  [0xD17734, 'scan_buf[3]'],
  [0xD17735, 'scan_buf[4]'],
  [0xD17736, 'scan_buf[5]'],
  [0xD17737, 'scan_buf[6]'],
  [0xD17738, 'scan_buf[7]'],
  [0xD17739, 'scan_buf[8]'],
  [0xD1773A, 'scan_buf[9]'],
  [0xD1773B, 'scan_buf[10]'],
  [0xD1773C, 'scan_buf[11]'],
  [0xD1773D, 'scan_buf[12]'],
  [0xD1773E, 'scan_buf[13]'],
  [0xD1773F, 'scan_buf[14]'],
  [0xD17740, 'scan_buf[15]'],
  [0xD17741, 'scan_buf[16]'],
  [0xD00595, 'UI text-position/control'],
]);

const EXTRA_NOTES = new Map([
  [0x046508, 'stage 1: sample first raw keyboard byte'],
  [0x046511, 'busy-wait until ready bit 0 becomes set'],
  [0x046519, 'acknowledge the ready flag by writing the masked value back'],
  [0x04651D, 'snapshot controller byte 0x33 into the scan buffer'],
  [0x046525, 'snapshot controller byte 0x32 into the scan buffer'],
  [0x04652D, 'snapshot controller byte 0x31 into the scan buffer'],
  [0x046535, 'snapshot controller byte 0x30 into the scan buffer'],
  [0x04653D, 'load command 0x35 for the next scan phase'],
  [0x046544, 'busy-wait until scan-status bit 1 becomes set'],
  [0x04654C, 'stage 2: sample another raw keyboard byte'],
  [0x046555, 'busy-wait for ready after the second sample'],
  [0x046561, 'load command 0x15 for the comparison/verification phase'],
  [0x046568, 'busy-wait until scan-status bit 1 becomes set again'],
  [0x046570, 'stage 3: sample a third raw keyboard byte'],
  [0x046585, 'test D17736 low bits; matching value skips the retry path'],
  [0x04658F, 'test D17737 bits 5-6; matching value also skips the retry path'],
  [0x046599, 'enter retry/reconfigure path'],
  [0x0465A7, 'issue command 0x06'],
  [0x0465B8, 'set ctrl[0x08] = 0x01'],
  [0x0465C0, 'issue command 0x11'],
  [0x0465C6, 'write 0x60 to keyboard data/group-select register'],
  [0x0465D8, 'clear ctrl[0x0C] and jump back to re-test the signature'],
  [0x0465DE, 'success path: reset controller before the bulk group capture'],
  [0x046611, 'issue command 0x4B before the 8-byte batch read'],
  [0x046620, 'load HL with the destination base for the 8-byte batch'],
  [0x046624, 'B = 8, so the loop below captures exactly 8 bytes'],
  [0x04662A, 'loop body: store the current E00900 byte into D17738..D1773F via HL'],
  [0x04662B, 'advance the batch destination pointer'],
  [0x04662F, 'busy-wait for ready after the 8-byte batch loop'],
  [0x04663B, 'start final trailer capture sequence'],
  [0x04664D, 'issue command 0x11 for the trailer sample'],
  [0x04665E, 'issue command 0x94 before the final two reads'],
  [0x046663, 'busy-wait until scan-status bit 1 becomes set for the trailer'],
  [0x04666B, 'sample trailer byte 0 into D17740'],
  [0x046673, 'requested window ends on the read that feeds D17741; the matching store is just past the boundary'],
  [0x046677, 'tail context: store trailer byte 1 into D17741'],
  [0x04667C, 'tail context: final ready poll before return'],
  [0x046688, 'tail context: return to the caller'],
  [0x0466A6, 'switch decode/execution mode to Z80 before the page-local call'],
  [0x0466B7, 'real entry: Z80-mode CALL 0x64D3 on page 0x04, which lands at ROM 0x0464D3'],
]);

const LOOP_NOTES = new Map([
  [0x046517, 'back-edge to 0x046511: ready-flag poll loop'],
  [0x04654A, 'back-edge to 0x046544: scan-status poll loop'],
  [0x04655B, 'back-edge to 0x046555: ready-flag poll loop'],
  [0x04656E, 'back-edge to 0x046568: scan-status poll loop'],
  [0x04657F, 'back-edge to 0x046579: ready-flag poll loop'],
  [0x0465B2, 'back-edge to 0x0465AC: ready-flag poll loop'],
  [0x0465DC, 'back-edge to 0x046561: retry/reconfigure loop'],
  [0x04661E, 'back-edge to 0x046618: scan-status poll loop'],
  [0x04662C, 'DJNZ loop: 8 consecutive E00900 reads into D17738..D1773F'],
  [0x046635, 'back-edge to 0x04662F: ready-flag poll loop'],
  [0x046669, 'back-edge to 0x046663: scan-status poll loop'],
  [0x046682, 'back-edge to 0x04667C: final ready-flag poll loop'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function unique(values) {
  return [...new Set(values)];
}

function addrLabel(addr) {
  return ADDR_NAMES.has(addr) ? `${hex(addr)} [${ADDR_NAMES.get(addr)}]` : hex(addr);
}

function isKeyboardMmio(addr) {
  return addr >= 0xE00800 && addr <= 0xE009FF;
}

function isRam(addr) {
  return addr >= 0xD00000 && addr <= 0xD3FFFF;
}

function absoluteAccess(inst) {
  if (inst?.tag === 'ld-reg-mem') return { kind: 'read', addr: inst.addr, reg: inst.dest ?? inst.dst };
  if (inst?.tag === 'ld-mem-reg') return { kind: 'write', addr: inst.addr, reg: inst.src };
  if (inst?.tag === 'ld-mem-pair') return { kind: 'write', addr: inst.addr, reg: inst.pair };
  if (inst?.tag === 'ld-pair-mem') return { kind: inst.direction === 'from-mem' ? 'read' : 'write', addr: inst.addr, reg: inst.pair };
  return null;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ret':
      return 'RET';
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? `LD ${upper(inst.pair)}, (${hex(inst.addr)})`
        : `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-ind-reg':
      return `LD (HL), ${upper(inst.src)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit}, ${upper(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit}, ${upper(inst.reg)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'out0':
      return `OUT0 (${hexByte(inst.port)}), ${upper(inst.reg)}`;
    case 'in0':
      return `IN0 ${upper(inst.reg)}, (${hexByte(inst.port)})`;
    case 'rsmix':
      return `RSMIX -> ${upper(inst.nextMode ?? '?')}`;
    case 'im':
      return `IM ${inst.value}`;
    default:
      return upper(inst?.tag ?? 'UNKNOWN');
  }
}

function decodeWindow(start, endStartInclusive, mode = 'adl') {
  const rows = [];
  let pc = start;
  while (pc <= endStartInclusive) {
    const inst = decodeInstruction(rom, pc, mode);
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      mode,
      inst,
      length,
      bytes: bytesToHex(rom.subarray(pc, pc + length)),
      text: formatInstruction(inst),
    });
    pc += length;
  }
  return rows;
}

function decodeModeAwareContext(startPc, maxInstr, initialMode = 'adl') {
  const rows = [];
  let pc = startPc;
  let mode = initialMode;
  for (let i = 0; i < maxInstr; i++) {
    const inst = decodeInstruction(rom, pc, mode);
    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      mode,
      inst,
      length,
      bytes: bytesToHex(rom.subarray(pc, pc + length)),
      text: formatInstruction(inst),
    });
    pc += length;
    if (inst?.tag === 'rsmix' && inst.nextMode) mode = inst.nextMode;
  }
  return rows;
}

function scanExactPattern(pattern) {
  const hits = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let matched = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }
  return hits;
}

function scanZ80Calls(target16) {
  const rawHits = scanExactPattern([0xCD, target16 & 0xFF, (target16 >>> 8) & 0xFF]);
  return rawHits.filter((pc) => {
    try {
      const inst = decodeInstruction(rom, pc, 'z80');
      return inst?.tag === 'call' && inst.target === target16;
    } catch {
      return false;
    }
  });
}

function annotationForRow(row) {
  const pieces = [];
  const access = absoluteAccess(row.inst);

  if (EXTRA_NOTES.has(row.pc)) pieces.push(EXTRA_NOTES.get(row.pc));

  if (access) {
    if (isKeyboardMmio(access.addr)) {
      pieces.push(`MMIO ${access.kind}: ${addrLabel(access.addr)}`);
    } else if (isRam(access.addr)) {
      pieces.push(`RAM ${access.kind}: ${addrLabel(access.addr)}`);
    } else {
      pieces.push(`absolute ${access.kind}: ${addrLabel(access.addr)}`);
    }
  }

  if (row.pc === 0x04662A) {
    pieces.push('HL starts at D17738 and advances once per iteration');
  }

  if (row.pc === 0x046673) {
    pieces.push('next instruction at 0x046677 stores this byte into D17741');
  }

  if (row.inst?.target !== undefined) {
    const target = hex(row.inst.target);
    if (LOOP_NOTES.has(row.pc)) {
      pieces.push(LOOP_NOTES.get(row.pc));
    } else {
      pieces.push(`branch target ${target}`);
    }
  }

  if (row.mode !== 'adl') {
    pieces.push(`decode mode ${upper(row.mode)}`);
  }

  return pieces.length ? unique(pieces).join('; ') : 'scan/control instruction';
}

function collectMmio(rows) {
  return rows
    .map((row) => {
      const access = absoluteAccess(row.inst);
      if (!access || !isKeyboardMmio(access.addr)) return null;
      return `${hex(row.pc)} ${access.kind.toUpperCase()} ${addrLabel(access.addr)}`;
    })
    .filter(Boolean);
}

function collectRamWrites(mainRows, tailRows) {
  const writes = [];
  for (const row of [...mainRows, ...tailRows]) {
    const access = absoluteAccess(row.inst);
    if (access && access.kind === 'write' && isRam(access.addr)) {
      writes.push(`${hex(row.pc)} -> ${addrLabel(access.addr)}`);
    }
  }
  writes.push('0x04662A loop -> 0xD17738..0xD1773F [8 consecutive bytes via HL + DJNZ]');
  return writes;
}

function collectTargets(rows) {
  return rows
    .filter((row) => row.inst?.target !== undefined)
    .map((row) => `${hex(row.pc)} -> ${hex(row.inst.target)} (${upper(row.inst.tag)})`);
}

function renderRow(row) {
  return `${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text.padEnd(26)} ; ${annotationForRow(row)}`;
}

function printSection(title) {
  console.log(title);
  console.log('');
}

const mainRows = decodeWindow(REQUEST_START, REQUEST_END, 'adl');
const tailRows = decodeWindow(TAIL_START, TAIL_END, 'adl');
const callerContextRows = decodeModeAwareContext(CALLER_CONTEXT_START, CALLER_CONTEXT_MAX_INSTR, 'adl');

const direct046508Calls = scanExactPattern(DIRECT_CALL_046508);
const direct046500Calls = scanExactPattern(DIRECT_CALL_046500);
const direct0464D3Calls = scanExactPattern(DIRECT_CALL_0464D3);
const z80PageLocal64D3Calls = scanZ80Calls(0x64D3);

const mmioLines = collectMmio([...mainRows, ...tailRows]);
const ramWriteLines = collectRamWrites(mainRows, tailRows);
const targetLines = collectTargets(mainRows);

printSection('# Phase 298: Batch Keyboard Scanner Disassembly');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Requested window: ${hex(REQUEST_START)}..${hex(REQUEST_END)} (requested end matches the prompt literal, but the final D17741 store sits immediately after it at 0x046677)`);
console.log(`Enclosing controller-init preamble: ${hex(PREAMBLE_START)}..${hex(PREAMBLE_END)} (falls through into the requested window)`);
console.log('');

printSection('## Requested Window');
for (const row of mainRows) {
  console.log(renderRow(row));
}
console.log('');

printSection('## Immediate Tail Context');
console.log('; needed because the requested window ends one instruction before the D17741 store and final RET');
for (const row of tailRows) {
  console.log(renderRow(row));
}
console.log('');

printSection('## MMIO Accesses');
for (const line of mmioLines) {
  console.log(`- ${line}`);
}
console.log('');

printSection('## RAM Writes');
for (const line of ramWriteLines) {
  console.log(`- ${line}`);
}
console.log('');

printSection('## Loop Structures');
for (const text of unique([...LOOP_NOTES.values()])) {
  console.log(`- ${text}`);
}
console.log('');

printSection('## Branch / Call / Jump Targets');
for (const line of targetLines) {
  console.log(`- ${line}`);
}
console.log('');

printSection('## Direct CALL Scan');
console.log(`- CALL 0x046508 pattern ${bytesToHex(Uint8Array.from(DIRECT_CALL_046508))}: ${direct046508Calls.length ? direct046508Calls.map((pc) => hex(pc)).join(', ') : 'none'}`);
console.log(`- CALL 0x046500 pattern ${bytesToHex(Uint8Array.from(DIRECT_CALL_046500))}: ${direct046500Calls.length ? direct046500Calls.map((pc) => hex(pc)).join(', ') : 'none'}`);
console.log(`- CALL 0x0464D3 pattern ${bytesToHex(Uint8Array.from(DIRECT_CALL_0464D3))}: ${direct0464D3Calls.length ? direct0464D3Calls.map((pc) => hex(pc)).join(', ') : 'none'}`);
console.log(`- Supplemental Z80-mode CALL 0x64D3 pattern ${bytesToHex(Uint8Array.from(Z80_CALL_64D3))}: ${z80PageLocal64D3Calls.length ? z80PageLocal64D3Calls.map((pc) => hex(pc)).join(', ') : 'none'}`);
console.log('');

printSection('## Likely Real Entry Context');
console.log('; mode-aware decode from 0x046689 shows how the surrounding routine reaches the scanner');
for (const row of callerContextRows) {
  console.log(renderRow(row));
}
console.log('');

printSection('## Summary');
console.log('- This is not a simple 8-byte dump. The routine captures a 17-byte keyboard/controller snapshot across three phases:');
console.log('  D17731..D17737 = preamble/status bytes, D17738..D1773F = the 8-byte batch loop, D17740..D17741 = trailer bytes.');
console.log('- The only true 8-iteration batch loop is 0x046626..0x04662C: it loads HL = 0xD17738, B = 8, then repeats `LD A,(0xE00900) / LD (HL),A / INC HL / DJNZ`.');
console.log('- Before that batch loop, the routine samples E00900 into D17731, D17736, and D17737 and snapshots E00833..E00830 into D17732..D17735. It also tests D17736 and D17737; if their bit patterns do not match the expected signature, it reprograms E00808/E0080C/E0080F/E00900 and loops back through 0x046561.');
console.log('- The requested end address 0x046673 lands on the read that feeds D17741. The matching store is the immediate next instruction at 0x046677, followed by one last ready-poll and `RET` at 0x046688.');
console.log('- No direct ADL `CALL 0x046508` exists in the ROM, and there are also no direct ADL calls to 0x046500 or 0x0464D3.');
console.log('- The real entry path is the surrounding routine at 0x046689: after `RSMIX -> Z80`, it issues a page-local Z80 `CALL 0x64D3` at 0x0466B7. On ROM page 0x04 that lands at 0x0464D3, which initializes the keyboard controller, polls 0xE00818 at 0x046500, and then falls through into 0x046508.');
console.log('- The post-call code immediately consumes D17731, D17736, D17737, D17740, and D17741 for UI/decision logic. That makes this routine look like a keyboard-controller diagnostic/self-test snapshotter rather than the foreground GetCSC scanner.');
