#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x008527;
const MAX_INSTRUCTIONS = 200;
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const CALL_LABELS = new Map([
  [0x006EB6, 'alternate USB-ready / usb_SelfPowered gate (phase 410: IN0 0x0F bit 6)'],
  [0x012456, 'controller/link re-arm helper; toggles 0x3080 bits and clears D14082'],
  [0x0125EA, 'USB mode-transition / port-ready gate; waits on 0x3082 bit 1 then submits status'],
  [0x00E91E, 'pre-enumerate setup helper'],
  [0x00D9EE, 'USB PHY link-speed negotiation / init-stage helper'],
  [0x00DA8C, 'legacy link disconnect/toggle helper'],
  [0x01253F, 'shorter 0x3082-ready/status-submit sibling of 0x0125EA'],
  [0x01322D, 'indirect callback wrapper through slot D14026'],
]);

const RAM_LABELS = new Map([
  [0xD177B8, 'notification/state byte'],
  [0xD14075, 'follow-up gate byte'],
]);

const PORT_LABELS = new Map([
  [0x3082, 'USB controller status'],
  [0x3114, 'USB endpoint/control register'],
]);

const SITE_NOTES = new Map([
  [0x008527, 'function entry; gate on alternate ready/self-powered check'],
  [0x00852C, 'if 0x006EB6 says ready, skip straight to the state-byte branch'],
  [0x008536, 'if 0x3082 bit 3 is clear, skip the 0x012456 re-arm preface'],
  [0x008542, 'optional controller re-arm before the first status-submit gate'],
  [0x008548, 'first direct 0x3114 enable sequence'],
  [0x008567, 'first status-submit gate, using the 0x0125EA helper family'],
  [0x00856F, 'special branch keyed on D177B8 == 0x98'],
  [0x008577, 'special-state pre-enumerate setup'],
  [0x008580, 'special-state PHY/config helper'],
  [0x00858A, 'special-state link-state toggle'],
  [0x00858F, 'second direct 0x3114 enable sequence'],
  [0x0085AE, 'second, shorter status-submit gate'],
  [0x0085B5, 'clear D14075 before the delayed indirect callback'],
  [0x0085BE, 'invoke the D14026 callback slot with 0x0800'],
]);

const PORT_SITE_NOTES = new Map([
  [0x008532, 'read 0x3082, then AND 0x08 to test bit 3 before the optional 0x012456 call'],
  [0x00854C, 'read 0x3114 before SET 0,A'],
  [0x008550, 'write 0x3114 with bit 0 raised'],
  [0x008593, 'read 0x3114 before SET 0,A on the D177B8==0x98 branch'],
  [0x008597, 'write 0x3114 with bit 0 raised again'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function upper(value) {
  return String(value).toUpperCase();
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatImm(value) {
  return hex(value, value <= 0xFFFF ? 4 : 6);
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    throw new Error(
      `Decode failed at ${hex(pc)}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatImm(inst.value)}`);
    case 'in-reg':
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'bit-set':
      return withPrefix(inst, `SET ${inst.bit},${upper(inst.reg)}`);
    case 'out-reg':
      return withPrefix(inst, `OUT (C),${upper(inst.reg)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    default:
      return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function disassembleUntilRet(start) {
  const instructions = [];
  let pc = start;

  for (let i = 0; i < MAX_INSTRUCTIONS; i += 1) {
    const inst = safeDecode(pc);
    instructions.push(inst);
    pc = inst.nextPc;
    if (inst.tag === 'ret') {
      return instructions;
    }
  }

  throw new Error(`No RET found within ${MAX_INSTRUCTIONS} instructions from ${hex(start)}`);
}

function isRam(addr) {
  return addr >= RAM_MIN && addr <= RAM_MAX;
}

function collectCalls(instructions) {
  const byTarget = new Map();

  for (const inst of instructions) {
    if (inst.tag !== 'call') {
      continue;
    }
    if (!byTarget.has(inst.target)) {
      byTarget.set(inst.target, []);
    }
    byTarget.get(inst.target).push(inst.pc);
  }

  return byTarget;
}

function collectRamRefs(instructions) {
  const refs = [];

  for (const inst of instructions) {
    if (inst.tag === 'ld-reg-mem' && isRam(inst.addr)) {
      refs.push({ addr: inst.addr, site: inst.pc, access: 'read' });
    } else if (inst.tag === 'ld-mem-reg' && isRam(inst.addr)) {
      refs.push({ addr: inst.addr, site: inst.pc, access: 'write' });
    }
  }

  return refs;
}

function collectPortOps(instructions) {
  const refs = [];
  let bcLiteral = null;

  for (const inst of instructions) {
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      bcLiteral = inst.value;
    } else if (inst.tag === 'pop' && inst.pair === 'bc') {
      bcLiteral = null;
    } else if (inst.tag === 'call') {
      bcLiteral = null;
    }

    if ((inst.tag === 'in-reg' || inst.tag === 'out-reg') && bcLiteral != null) {
      refs.push({
        site: inst.pc,
        port: bcLiteral,
        access: inst.tag === 'in-reg' ? 'read' : 'write',
      });
    }
  }

  return refs;
}

function summarizePurpose() {
  return [
    'Shared USB/controller follow-up helper, not a top-level success/failure wrapper.',
    'Front half: if 0x006EB6 does not report ready, optionally call 0x012456 based on 0x3082 bit 3, then set 0x3114 bit 0 and run 0x0125EA as the first port-ready/status-submit gate.',
    'Special branch: if D177B8 == 0x98, run 0x00E91E -> 0x00D9EE(1) -> 0x00DA8C(0), raise 0x3114 bit 0 again, and run the shorter 0x01253F status-submit helper.',
    'Common tail: clear D14075, invoke 0x01322D with 0x0800, and return after scheduling the delayed follow-up.',
  ];
}

const instructions = disassembleUntilRet(START);
const endPc = instructions[instructions.length - 1].pc;
const size = instructions[instructions.length - 1].nextPc - START;
const callTargets = collectCalls(instructions);
const ramRefs = collectRamRefs(instructions);
const portOps = collectPortOps(instructions);

const lines = [];
lines.push('# Phase 432 Probe: Trace of 0x008527');
lines.push('');
lines.push(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
lines.push(`Decoder: ${path.join(__dirname, 'ez80-decoder.js')} (ADL mode)`);
lines.push('');
lines.push('Function Bounds');
lines.push(`- Start: ${hex(START)}`);
lines.push(`- End:   ${hex(endPc)}`);
lines.push(`- Size:  ${size} bytes`);
lines.push(`- Instructions decoded: ${instructions.length}`);
lines.push('');
lines.push('Disassembly');

for (const inst of instructions) {
  const note = SITE_NOTES.get(inst.pc);
  lines.push(
    `${hex(inst.pc)}  ${formatBytes(inst.pc, inst.length).padEnd(19)}  ${formatInstruction(inst).padEnd(30)}${note ? ` ; ${note}` : ''}`
  );
}

lines.push('');
lines.push('Direct CALL Targets');
for (const [target, sites] of callTargets) {
  const label = CALL_LABELS.get(target) ?? 'unlabeled helper';
  lines.push(`- ${hex(target)} @ ${sites.map((site) => hex(site)).join(', ')} -- ${label}`);
}

lines.push('');
lines.push('Direct Port I/O');
for (const ref of portOps) {
  const label = PORT_LABELS.get(ref.port) ?? 'unlabeled port';
  const note = PORT_SITE_NOTES.get(ref.site) ?? '';
  lines.push(
    `- ${hex(ref.port, 4)} ${ref.access} @ ${hex(ref.site)} -- ${label}${note ? `; ${note}` : ''}`
  );
}

lines.push('');
lines.push('Direct Absolute RAM References');
for (const ref of ramRefs) {
  const label = RAM_LABELS.get(ref.addr) ?? 'unlabeled RAM byte';
  lines.push(`- ${hex(ref.addr)} ${ref.access} @ ${hex(ref.site)} -- ${label}`);
}

lines.push('');
lines.push('Purpose Assessment');
for (const bullet of summarizePurpose()) {
  lines.push(`- ${bullet}`);
}

lines.push('');
lines.push('Key Notes');
lines.push('- The only direct RAM access used as a branch key is D177B8, and it only matters for the special 0x98 branch.');
lines.push('- The function performs no direct 0x3080 access; those controller writes live inside the nested 0x012456 helper.');
lines.push('- The common tail is side-effect oriented: after XOR A / LD (D14075),A, the final RET follows 0x01322D rather than a local boolean return latch.');

console.log(lines.join('\n'));
