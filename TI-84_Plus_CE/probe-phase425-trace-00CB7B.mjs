#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x00CB7B;
const SCAN_LIMIT = 0x200;
const CALL_PATTERN = [0xCD, 0x7B, 0xCB, 0x00];
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const CALL_LABELS = new Map([
  [0x00218A, 'stack-frame helper (frameless argument shim)'],
  [0x00230B, '24-bit arithmetic right-shift helper (AHL >>= A)'],
  [0x00276B, 'zero-extend BC -> HL helper'],
]);

const DIRECT_CALLER_LABELS = new Map([
  [0x00CFF2, '0x00CD7B caller A: IY = *(D13FFC), arg0 = *(D13FFF)'],
  [0x00D00E, '0x00CD7B caller A: IY = *(D13FFC), arg0 = *(D14002)'],
  [0x00D0E5, '0x00CD7B caller A: IY = *(D14002), arg0 = *(D13FFF)'],
  [0x00D162, '0x00CD7B caller A: IY = *(D13FFF), arg0 = *(D14002)'],
  [0x00D1A8, '0x00CD7B caller A: IY = *(D13FFF), arg0 = *(D14002)'],
  [0x00EBD7, '0x00EB31 caller B: IY inherited, arg0 = local (IX-3)'],
]);

const PC_COMMENTS = new Map([
  [0x00CB7B, ['enter the frameless stack helper; arguments become addressable via IX+6 / IX+9 / IX+12']],
  [0x00CB7F, ['load only the low byte of stack arg1']],
  [0x00CB82, ['root = *(arg0) via a 24-bit self-indexed load from IX+6']],
  [0x00CB85, ['form destination address IY+0x0A']],
  [0x00CB88, ['write IY+0x0A = arg1.low']],
  [0x00CB89, ['read root[+9..+11] as a 24-bit value']],
  [0x00CB8C, ['zero-extend BC into 24-bit HL; only the low 16 bits remain live']],
  [0x00CB90, ['follow the root +6 link once: IX = *(root+6)']],
  [0x00CB95, ['arithmetically shift the staged 24-bit AHL value right by 8']],
  [0x00CB99, ['take the low byte of the shifted result']],
  [0x00CB9A, ['force bit 7 high']],
  [0x00CB9C, ['write IY+0x0B = shiftedByte | 0x80']],
  [0x00CB9F, ['read firstNested[+12..+14] as a 24-bit field']],
  [0x00CBA2, ['follow the +6 link again; the reloaded IX is not dereferenced again before the next store']],
  [0x00CBA5, ['write IY+0x0C..+0x0E = copied 24-bit field']],
  [0x00CBA8, ['clear IY+0x0F']],
  [0x00CBAC, ['follow the +6 link again']],
  [0x00CBB3, ['clear IY+0x10..+0x12 as a 24-bit zero']],
  [0x00CBBB, ['clear IY+0x13']],
  [0x00CBBD, ['follow the +6 link again']],
  [0x00CBC0, ['clear IY+0x14..+0x16 as a 24-bit zero']],
  [0x00CBC8, ['clear IY+0x17']],
  [0x00CBCA, ['follow the +6 link again']],
  [0x00CBCD, ['clear IY+0x18..+0x1A as a 24-bit zero']],
  [0x00CBD5, ['clear IY+0x1B']],
  [0x00CBD7, ['follow the +6 link again']],
  [0x00CBDA, ['clear IY+0x1C..+0x1E as a 24-bit zero']],
  [0x00CBE2, ['clear IY+0x1F']],
  [0x00CBE4, ['manual epilogue: LD SP,IX / POP IX / RET']],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatDisp(value) {
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function isTrackedRam(addr) {
  return typeof addr === 'number' && addr >= RAM_MIN && addr <= RAM_MAX;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstructionParts(inst) {
  switch (inst.tag) {
    case 'call':
      return { mnemonic: 'CALL', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'CALL', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'jp':
      return { mnemonic: 'JP', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'JP', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'DJNZ', operands: hex(inst.target) };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    case 'push':
      return { mnemonic: 'PUSH', operands: upper(inst.pair) };
    case 'pop':
      return { mnemonic: 'POP', operands: upper(inst.pair) };
    case 'ld-pair-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)},${hex(inst.value)}` };
    case 'ld-pair-mem':
      return {
        mnemonic: 'LD',
        operands: inst.direction === 'to-mem'
          ? `(${hex(inst.addr)}),${upper(inst.pair)}`
          : `${upper(inst.pair)},(${hex(inst.addr)})`,
      };
    case 'ld-reg-mem':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},(${hex(inst.addr)})` };
    case 'ld-mem-reg':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}),${upper(inst.src)}` };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${hex(inst.value, 2)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'ld-reg-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},(${upper(inst.src)})` };
    case 'ld-ind-reg':
      return { mnemonic: 'LD', operands: `(${upper(inst.dest)}),${upper(inst.src)}` };
    case 'ld-ind-imm':
      return { mnemonic: 'LD', operands: `(HL),${hex(inst.value, 2)}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}` };
    case 'ld-ixiy-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}` };
    case 'ld-ind-pair':
      return { mnemonic: 'LD', operands: `(${upper(inst.dest)}),${upper(inst.pair)}` };
    case 'ld-sp-pair':
      return { mnemonic: 'LD', operands: `SP,${upper(inst.pair)}` };
    case 'inc-pair':
      return { mnemonic: 'INC', operands: upper(inst.pair) };
    case 'dec-pair':
      return { mnemonic: 'DEC', operands: upper(inst.pair) };
    case 'inc-reg':
      return { mnemonic: 'INC', operands: upper(inst.reg) };
    case 'add-pair':
      return { mnemonic: 'ADD', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'sbc-pair':
      return { mnemonic: 'SBC', operands: `HL,${upper(inst.src)}` };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hex(inst.value, 2) };
    case 'lea': {
      const disp = signedByte(inst.displacement);
      return { mnemonic: 'LEA', operands: `${upper(inst.dest)},${upper(inst.base)}${disp >= 0 ? `+${disp}` : disp}` };
    }
    case 'rotate-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.reg) };
    case 'bit-set':
      return { mnemonic: 'SET', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'bit-res':
      return { mnemonic: 'RES', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'bit-test':
      return { mnemonic: 'BIT', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'in-reg':
      return { mnemonic: 'IN', operands: `${upper(inst.reg)},(C)` };
    case 'in-imm':
      return { mnemonic: 'IN', operands: `A,(${hex(inst.port, 2)})` };
    case 'out-reg':
      return { mnemonic: 'OUT', operands: `(C),${upper(inst.reg)}` };
    case 'out-imm':
      return { mnemonic: 'OUT', operands: `(${hex(inst.port, 2)}),A` };
    case 'nop':
      return { mnemonic: 'NOP', operands: '' };
    case 'rst':
      return { mnemonic: 'RST', operands: hex(inst.target, 2) };
    case 'db':
      return { mnemonic: 'DB', operands: hex(inst.value, 2) };
    default:
      return { mnemonic: `[${inst.tag}]`, operands: '' };
  }
}

function scanFunction(start) {
  const rows = [];
  const summary = {
    callSites: [],
    ramReads: [],
    ramWrites: [],
    portIo: [],
  };
  const pendingForwardTargets = new Set();

  let pc = start;
  while (pc < rom.length && pc < start + SCAN_LIMIT) {
    const inst = safeDecode(pc);
    const comments = [];

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      summary.callSites.push({ pc, target: inst.target });
      const label = CALL_LABELS.get(inst.target);
      if (label) {
        comments.push(`call ${hex(inst.target)} (${label})`);
      }
    }

    if (
      inst.tag === 'ld-pair-mem' ||
      inst.tag === 'ld-reg-mem' ||
      inst.tag === 'ld-mem-reg' ||
      inst.tag === 'ld-mem-pair'
    ) {
      const addr = inst.addr;
      if (isTrackedRam(addr)) {
        if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair' || inst.direction === 'to-mem') {
          summary.ramWrites.push({ pc, addr });
        } else {
          summary.ramReads.push({ pc, addr });
        }
      }
    }

    if (inst.tag === 'in-reg' || inst.tag === 'in-imm' || inst.tag === 'out-reg' || inst.tag === 'out-imm') {
      summary.portIo.push({ pc, inst });
    }

    const manual = PC_COMMENTS.get(pc);
    if (manual) {
      comments.push(...manual);
    }

    const { mnemonic, operands } = formatInstructionParts(inst);
    rows.push({
      pc,
      tag: inst.tag,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      text: withPrefix(inst, `${mnemonic}${operands ? ` ${operands}` : ''}`),
      comments,
    });

    if (
      (inst.tag === 'jr-conditional' ||
        inst.tag === 'jp-conditional' ||
        inst.tag === 'djnz' ||
        inst.tag === 'ret-conditional') &&
      typeof inst.target === 'number' &&
      inst.target > pc &&
      inst.target < start + SCAN_LIMIT
    ) {
      pendingForwardTargets.add(inst.target);
    }

    for (const target of [...pendingForwardTargets]) {
      if (target <= pc) {
        pendingForwardTargets.delete(target);
      }
    }

    if (inst.tag === 'ret' && ![...pendingForwardTargets].some((target) => target > pc)) {
      return { rows, summary, end: pc };
    }

    pc = inst.nextPc;
  }

  throw new Error(`Failed to find a terminating RET for ${hex(start)} within ${SCAN_LIMIT} bytes`);
}

function scanDirectCallers() {
  const callers = [];
  for (let pc = 0; pc <= rom.length - CALL_PATTERN.length; pc += 1) {
    let matched = true;
    for (let i = 0; i < CALL_PATTERN.length; i += 1) {
      if (rom[pc + i] !== CALL_PATTERN[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      callers.push(pc);
    }
  }
  return callers;
}

function uniqueTargets(sites) {
  return [...new Set(sites.map((site) => site.target))].sort((a, b) => a - b);
}

function emitFieldTraffic(lines) {
  lines.push('Derived field traffic:');
  lines.push('- Implicit destination: every visible store is IY-relative; the callee does not take a destination pointer on the stack.');
  lines.push('- Stack arg0 at IX+6 is a 24-bit root pointer. The code reads root[+9..+11], then follows root[+6] once and copies that nested record\'s [+12..+14] field.');
  lines.push('- Stack arg1 at IX+9 contributes only its low byte, copied straight into IY+0x0A.');
  lines.push('- Stack arg2 at IX+12 is never read by this callee.');
  lines.push('- IY+0x0B receives the high byte of the root[+9] word after an 8-bit arithmetic right shift, with bit 7 forced high.');
  lines.push('- IY+0x0C..+0x0E receive a 24-bit copy from the first nested +6 child\'s [+12..+14] field.');
  lines.push('- IY+0x0F is cleared.');
  lines.push('- IY+0x10..+0x13, +0x14..+0x17, +0x18..+0x1B, and +0x1C..+0x1F are all zero-filled.');
  lines.push('- The repeated `LD IX,(IX+6)` instructions at 0x00CBA2/0x00CBAC/0x00CBBD/0x00CBCA/0x00CBD7 reload deeper +6 links, but those reloaded pointers are not dereferenced again before return.');
}

const decoded = scanFunction(START);
const callers = scanDirectCallers();
const callTargets = uniqueTargets(decoded.summary.callSites);
const nextFunctionStart = decoded.end + 1;

const lines = [];
lines.push('Phase 425 - Trace 0x00CB7B: Descriptor Node Constructor');
lines.push(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
lines.push(`Function span: ${hex(START)}..${hex(decoded.end)} (${decoded.end - START + 1} bytes, ${decoded.rows.length} decoded instructions)`);
lines.push(`Next function starts immediately at ${hex(nextFunctionStart)} (0x00CBE9).`);
lines.push('');
lines.push('Stack frame setup:');
lines.push('- 0x00CB7B calls 0x00218A instead of 0x002197; this is the frameless stack shim, so arguments are addressable at IX+6 / IX+9 / IX+12 with no local frame allocation byte preceding the call.');
lines.push('- Manual epilogue is `LD SP,IX` / `POP IX` / `RET` at 0x00CBE4..0x00CBE8.');
lines.push('');
lines.push('Disassembly:');
for (const row of decoded.rows) {
  lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')} ${row.text.padEnd(34, ' ')}${row.comments.length ? ` ; ${row.comments.join(' | ')}` : ''}`);
}
lines.push('');
lines.push('CALL targets:');
for (const target of callTargets) {
  const label = CALL_LABELS.get(target);
  const sites = decoded.summary.callSites.filter((site) => site.target === target).map((site) => hex(site.pc)).join(', ');
  lines.push(`- ${hex(target)}${label ? ` (${label})` : ''} <- ${sites}`);
}
lines.push('');
lines.push('Absolute RAM reads inside 0x00CB7B:');
if (!decoded.summary.ramReads.length) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.ramReads) {
    lines.push(`- ${hex(entry.addr)} at ${hex(entry.pc)}`);
  }
}
lines.push('');
lines.push('Absolute RAM writes inside 0x00CB7B:');
if (!decoded.summary.ramWrites.length) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.ramWrites) {
    lines.push(`- ${hex(entry.addr)} at ${hex(entry.pc)}`);
  }
}
lines.push('');
emitFieldTraffic(lines);
lines.push('');
lines.push('Port I/O inside 0x00CB7B:');
if (!decoded.summary.portIo.length) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.portIo) {
    lines.push(`- ${hex(entry.pc)} ${withPrefix(entry.inst, formatInstructionParts(entry.inst).mnemonic)}`);
  }
}
lines.push('');
lines.push('Direct CALL 0x00CB7B sites:');
for (const caller of callers) {
  lines.push(`- ${hex(caller)}${DIRECT_CALLER_LABELS.has(caller) ? ` | ${DIRECT_CALLER_LABELS.get(caller)}` : ''}`);
}
lines.push('');
lines.push('Assessment:');
lines.push('- 0x00CB7B does not touch any absolute D1xxxx RAM and performs no port I/O; it is a pure stack/indirect-structure copier.');
lines.push('- The routine writes the tail half of an IY-relative 0x20-byte node/subrecord: +0x0A..+0x0F plus four zero-filled 4-byte slots at +0x10..+0x1F.');
lines.push('- The sibling-walker-visible bytes +0..+2 are not written here; those come from sibling/link construction elsewhere (notably 0x00CBE9 plus caller-side bit twiddles).');
lines.push('- The third stack argument is present at all six call sites but is not consumed by 0x00CB7B itself.');

console.log(lines.join('\n'));
