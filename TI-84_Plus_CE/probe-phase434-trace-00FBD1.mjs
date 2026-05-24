#!/usr/bin/env node

import { createRequire } from 'node:module';

process.emitWarning = () => {};

const require = createRequire(import.meta.url);
const fs = require('fs');
const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const START = 0x00FBD1;
const MAX_INSTRUCTIONS = 300;
const DIRECT_RAM_MIN = 0xD00000;
const DIRECT_RAM_MAX = 0xD1FFFF;

const CALL_LABELS = new Map([
  [0x00218A, '__frameset / IX-frame prologue (with locals)'],
  [0x0021A7, '__ibitAND / 24-bit bitmask AND test'],
  [0x0021C2, '__icmpzero / HL==0 test (sets Z flag)'],
  [0x00883C, 'USB state-machine dispatch (2-arg: event code, sub-event)'],
  [0x014EF8, 'USB port 0x3082 speed/mode negotiation helper'],
  [0x0123AD, 'USB host reset / bus-reset trigger'],
  [0x006EB6, 'USB link-ready check (returns NZ if not ready)'],
  [0x00B9E8, 'USB cleanup / teardown helper'],
  [0x00C9A0, 'USB port enable / final handshake'],
]);

const RAM_LABELS = new Map([
  [0xD14074, 'USB active flag (1 = USB subsystem active)'],
  [0xD1772D, 'USB sub-state / phase tracker A'],
  [0xD176FB, 'USB sub-state / phase tracker B'],
  [0xD177B8, 'USB device speed code (0x01=LS, 0x06/0x07=FS/HS, 0x40=???, 0x80+=???, 0xC0+=???, 0xFF=disconnected)'],
  [0xD1407C, 'USB endpoint state byte 0'],
  [0xD14078, 'USB endpoint config byte 0'],
  [0xD14079, 'USB endpoint config byte 1'],
  [0xD1407A, 'USB endpoint config byte 2'],
  [0xD1407B, 'USB endpoint config byte 3'],
  [0xD1407E, 'USB endpoint config byte 4'],
  [0xD1407F, 'USB endpoint config byte 5'],
  [0xD14080, 'USB endpoint config byte 6'],
  [0xD14081, 'USB endpoint config byte 7'],
  [0xD1408D, 'USB endpoint config byte 8'],
]);

const PORT_LABELS = new Map([
  [0x3082, 'USB PHY status register (bits: 5=device attached, 4=???)'],
  [0x3010, 'USB host control register (bit manipulation for reset/suspend)'],
  [0x314C, 'USB port enable register'],
]);

const SITE_NOTES = new Map([
  [0x00FBD1, 'prologue: CALL __frameset (0x00218A)'],
  [0x00FBD5, 'load bitmask arg from IX+6'],
  [0x00FBD8, 'test bit 2 (bitmask & 0x04)'],
  [0x00FBDA, 'OR A sets flags; SBC HL,HL; LD L,A => HL = (bit2 ? nonzero : 0)'],
  [0x00FBDE, 'CALL __icmpzero — test if bit 2 set'],
  [0x00FBE2, 'JP Z 0x00FC66 — skip bit2 block if not set'],
  [0x00FBE6, 'bit2 handler: set D14074 = 1 (USB active)'],
  [0x00FBED, 'clear D1772D = 0'],
  [0x00FBF2, 'clear D176FB = 0'],
  [0x00FBF6, 'load D177B8 (USB speed code)'],
  [0x00FBFA, 'CP 0x40: if speed < 0x40, branch to low-speed handler'],
  [0x00FBFE, 'low-speed: PUSH 3, PUSH 6 => call 0x00883C(6, 3)'],
  [0x00FC0E, 'JR to bit2 end (0x00FC66)'],
  [0x00FC10, 'speed >= 0x40: CP 0x80'],
  [0x00FC16, 'if speed < 0x80, check if exactly 0x40'],
  [0x00FC18, 'reload D177B8'],
  [0x00FC1C, 'CP 0x40: if speed == 0x40, call 0x00883C(0x44, 2)'],
  [0x00FC1E, 'JR NZ to bit2 end if speed != 0x40'],
  [0x00FC20, 'speed == 0x40: PUSH 2, PUSH 0x44 => call 0x00883C(0x44, 2)'],
  [0x00FC32, 'speed >= 0x80: CP 0xC0'],
  [0x00FC38, 'if speed < 0xC0 => call 0x00883C(0x81, 0x10)'],
  [0x00FC4C, 'speed >= 0xC0: IN A,(0x3082) via SIS prefix'],
  [0x00FC52, 'AND 0x10 — test port 0x3082 bit 4'],
  [0x00FC54, 'JR Z to bit2 end if bit4 clear'],
  [0x00FC56, 'port bit4 set: PUSH 3, PUSH 6 => call 0x00883C(6, 3)'],

  [0x00FC66, 'BIT 3 TEST: load bitmask, AND 0x08'],
  [0x00FC6F, 'CALL __icmpzero — test if bit 3 set'],
  [0x00FC73, 'JR Z to bit3 end (0x00FC84) if not set'],
  [0x00FC75, 'bit3 handler: LD A,I; PUSH AF; DI — save and disable interrupts'],
  [0x00FC7A, 'clear D14074 = 0 (USB inactive)'],
  [0x00FC7E, 'POP AF; JP PO 0x00FC84 — restore IFF; skip EI if was disabled'],
  [0x00FC83, 'EI — re-enable interrupts'],

  [0x00FC84, 'BIT 7 TEST: load bitmask, AND 0x80'],
  [0x00FC8D, 'CALL __icmpzero — test if bit 7 set'],
  [0x00FC91, 'JP Z 0x00FD44 — skip bit7 block if not set'],
  [0x00FC95, 'bit7 handler: CALL 0x014EF8 (speed/mode negotiation)'],
  [0x00FC99, 'IN A,(0x3082) — read USB PHY status'],
  [0x00FC9F, 'AND 0x20 — test bit 5 (device attached?)'],
  [0x00FCA1, 'JR Z 0x00FCFE — if no device, jump to reset-all block'],
  [0x00FCA3, 'device attached: port 0x3010 bit manipulation sequence'],
  [0x00FCA7, 'IN A,(0x3010) — read host control'],
  [0x00FCA9, 'RES 4,A — clear bit 4'],
  [0x00FCAB, 'OUT (C),A — write back'],
  [0x00FCB8, 'IN A,(0x3010) — read again'],
  [0x00FCBC, 'RES 5,A — clear bit 5'],
  [0x00FCC0, 'OUT (C),A — write back'],
  [0x00FCCD, 'IN A,(0x3010) — read again'],
  [0x00FCD3, 'RES 0,A — clear bit 0'],
  [0x00FCD5, 'OUT (C),A — write back'],
  [0x00FCE2, 'PUSH 0 => call 0x0123AD(0) — bus reset'],
  [0x00FCEC, 'PUSH 0, PUSH 1 => call 0x00883C(1, 0) — state machine event'],
  [0x00FCFC, 'JR to 0x00FD40 (cleanup)'],

  [0x00FCFE, 'no-device block: clear 11 endpoint config bytes'],
  [0x00FCFF, 'clear D1407C = 0'],
  [0x00FD04, 'clear D14078 = 0'],
  [0x00FD09, 'clear D14079 = 0'],
  [0x00FD0E, 'clear D1407A = 0'],
  [0x00FD13, 'clear D1407B = 0'],
  [0x00FD18, 'clear D1407E = 0'],
  [0x00FD1D, 'clear D1407F = 0'],
  [0x00FD22, 'clear D14080 = 0'],
  [0x00FD27, 'clear D14081 = 0'],
  [0x00FD2C, 'clear D1408D = 0'],
  [0x00FD30, 'PUSH 0x12, PUSH 0xC3 => call 0x00883C(0xC3, 0x12) — disconnected event'],
  [0x00FD40, 'CALL 0x00B9E8 — USB cleanup/teardown'],

  [0x00FD44, 'BIT 6 TEST: load bitmask, AND 0x40'],
  [0x00FD4D, 'CALL __icmpzero — test if bit 6 set'],
  [0x00FD51, 'JR Z 0x00FDB5 — skip bit6 block if not set'],
  [0x00FD53, 'bit6 handler: load D177B8 (speed code)'],
  [0x00FD57, 'CP 0xFF — check if disconnected'],
  [0x00FD59, 'JR Z skip — if disconnected, skip speed negotiation'],
  [0x00FD5B, 'CALL 0x014EF8 (speed/mode negotiation)'],
  [0x00FD5F, 'IN A,(0x3082) — read PHY status'],
  [0x00FD65, 'AND 0x20 — test bit 5 (device attached?)'],
  [0x00FD67, 'JR Z 0x00FD7B — if not attached, try speed-specific'],
  [0x00FD69, 'attached: PUSH 2, PUSH 0x45 => call 0x00883C(0x45, 2)'],
  [0x00FD79, 'JR to bit6 end (0x00FDB5)'],
  [0x00FD7B, 'no device: load D177B8'],
  [0x00FD7F, 'CP 0x01: if speed == 1 (low-speed)'],
  [0x00FD83, 'PUSH 0x10, PUSH 0x80 => call 0x00883C(0x80, 0x10)'],
  [0x00FD95, 'load D177B8 again'],
  [0x00FD99, 'CP 0x07: if speed == 7'],
  [0x00FD9D, 'CP 0x06: or if speed == 6'],
  [0x00FDA5, 'speed 6 or 7: PUSH 0x11, PUSH 0x84 => call 0x00883C(0x84, 0x11)'],

  [0x00FDB5, 'BIT 1 TEST: load bitmask, AND 0x02'],
  [0x00FDBE, 'CALL __icmpzero — test if bit 1 set'],
  [0x00FDC2, 'JR Z 0x00FDD5 — skip bit1 block if not set'],
  [0x00FDC4, 'bit1 handler: CALL 0x006EB6 (link-ready check)'],
  [0x00FDC8, 'OR A — test return value'],
  [0x00FDC9, 'JR NZ 0x00FDD5 — skip if not ready (nonzero)'],
  [0x00FDCB, 'link ready: PUSH 0 => call 0x0123AD(0) — bus reset'],

  [0x00FDD5, 'REMAINING BITS TEST: LD BC,0x0800'],
  [0x00FDD9, 'LD HL,(IX+6) — reload full bitmask'],
  [0x00FDDC, 'CALL 0x0021A7 (__ibitAND) — test bitmask & 0x0800'],
  [0x00FDE0, 'CALL __icmpzero — test result'],
  [0x00FDE4, 'JR Z epilogue — skip if bit 11 not set'],
  [0x00FDE6, 'bit11 handler: clear D14074 = 0 (USB inactive)'],
  [0x00FDEB, 'load D177B8 (speed code)'],
  [0x00FDEF, 'CP 0x01: if speed == 1 (low-speed)'],
  [0x00FDF1, 'JR NZ epilogue — skip port write if not low-speed'],
  [0x00FDF3, 'low-speed only: OUT (0x314C),1 — enable USB port'],
  [0x00FDF7, 'LD A,1'],
  [0x00FDF9, 'OUT (C),A — write 1 to port 0x314C'],
  [0x00FE06, 'CALL 0x00C9A0 — USB port enable / final handshake'],

  [0x00FE0A, 'epilogue: LD SP,IX; POP IX; RET'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function upper(text) {
  return String(text).toUpperCase();
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
  return decodeInstruction(rom, pc, 'adl');
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `JP ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${upper(inst.condition)},${hex(inst.target)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatImm(inst.value)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-reg-ixd':
      return withPrefix(
        inst,
        `LD ${upper(inst.dest)},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`
      );
    case 'ld-ixd-reg':
      return withPrefix(
        inst,
        `LD (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${upper(inst.src)}`
      );
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'ld-pair-mem':
      return withPrefix(inst, `LD ${upper(inst.pair)},(${hex(inst.addr)})`);
    case 'ld-pair-indexed':
      return withPrefix(
        inst,
        `LD ${upper(inst.pair)},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`
      );
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL,${upper(inst.src)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    case 'di':
      return withPrefix(inst, 'DI');
    case 'ei':
      return withPrefix(inst, 'EI');
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'in-reg':
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'out-reg':
      return withPrefix(inst, `OUT (C),${upper(inst.reg)}`);
    case 'ld-special':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'bit-res':
      return withPrefix(inst, `RES ${inst.bit},${upper(inst.reg)}`);
    default:
      return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function disassembleRange(start, maxInstructions) {
  const instructions = [];
  let pc = start;

  for (let i = 0; i < maxInstructions; i += 1) {
    const inst = safeDecode(pc);
    instructions.push(inst);
    pc = inst.nextPc;
    if (inst.tag === 'ret') {
      return instructions;
    }
  }

  throw new Error(`No RET found within ${maxInstructions} instructions from ${hex(start)}`);
}

function scanCallSites(target) {
  const pattern = [0xCD, target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const hits = [];

  for (let i = 0; i < rom.length - 3; i += 1) {
    if (
      rom[i] === pattern[0]
      && rom[i + 1] === pattern[1]
      && rom[i + 2] === pattern[2]
      && rom[i + 3] === pattern[3]
    ) {
      hits.push(i);
    }
  }

  return hits;
}

function scanJpSites(target) {
  const pattern = [0xC3, target & 0xFF, (target >> 8) & 0xFF, (target >> 16) & 0xFF];
  const hits = [];

  for (let i = 0; i < rom.length - 3; i += 1) {
    if (
      rom[i] === pattern[0]
      && rom[i + 1] === pattern[1]
      && rom[i + 2] === pattern[2]
      && rom[i + 3] === pattern[3]
    ) {
      hits.push(i);
    }
  }

  return hits;
}

function collectDirectCalls(instructions) {
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

function collectRamAccess(instructions) {
  const refs = [];

  for (const inst of instructions) {
    if (inst.tag === 'ld-reg-mem' && inst.addr >= DIRECT_RAM_MIN && inst.addr <= DIRECT_RAM_MAX) {
      refs.push({ site: inst.pc, addr: inst.addr, access: 'read8' });
    } else if (inst.tag === 'ld-pair-mem' && inst.addr >= DIRECT_RAM_MIN && inst.addr <= DIRECT_RAM_MAX) {
      refs.push({ site: inst.pc, addr: inst.addr, access: 'read24' });
    } else if (inst.tag === 'ld-mem-reg' && inst.addr >= DIRECT_RAM_MIN && inst.addr <= DIRECT_RAM_MAX) {
      refs.push({ site: inst.pc, addr: inst.addr, access: 'write8' });
    }
  }

  return refs;
}

function collectPortIO(instructions) {
  const refs = [];

  for (const inst of instructions) {
    if (inst.tag === 'in-reg') {
      refs.push({ site: inst.pc, direction: 'IN' });
    } else if (inst.tag === 'out-reg') {
      refs.push({ site: inst.pc, direction: 'OUT' });
    }
  }

  return refs;
}

function collect883CCalls(instructions) {
  const calls = [];
  for (let i = 0; i < instructions.length; i += 1) {
    const inst = instructions[i];
    if (inst.tag !== 'call' || inst.target !== 0x00883C) {
      continue;
    }
    // Walk backward to find the two PUSH BC pairs that precede the call
    let arg1 = null;
    let arg2 = null;
    for (let j = i - 1; j >= 0 && j >= i - 6; j -= 1) {
      const prev = instructions[j];
      if (prev.tag === 'push' && prev.pair === 'bc') {
        if (arg1 === null) {
          // First push found (closest to CALL) = arg1 (pushed second)
          // Look for the LD BC before it
          if (j > 0 && instructions[j - 1].tag === 'ld-pair-imm' && instructions[j - 1].pair === 'bc') {
            arg1 = instructions[j - 1].value;
          }
        } else if (arg2 === null) {
          if (j > 0 && instructions[j - 1].tag === 'ld-pair-imm' && instructions[j - 1].pair === 'bc') {
            arg2 = instructions[j - 1].value;
          }
        }
      }
    }
    calls.push({ site: inst.pc, arg1, arg2 });
  }
  return calls;
}

const instructions = disassembleRange(START, MAX_INSTRUCTIONS);
const endPc = instructions[instructions.length - 1].pc;
const size = instructions[instructions.length - 1].nextPc - START;
const calls = collectDirectCalls(instructions);
const ramAccess = collectRamAccess(instructions);
const portIO = collectPortIO(instructions);
const directCallers = scanCallSites(START);
const jpCallers = scanJpSites(START);
const dispatchCalls = collect883CCalls(instructions);

const lines = [];
lines.push('Phase 434 - Trace of 0x00FBD1 (Universal USB Event Callback)');
lines.push('=============================================================');
lines.push('');
lines.push(`ROM: TI-84_Plus_CE/ROM.rom`);
lines.push(`Function range: ${hex(START)}-${hex(endPc + 1)}`);
lines.push(`Size: ${size} bytes (0x${size.toString(16).toUpperCase()})`);
lines.push(`Instructions decoded: ${instructions.length}`);
lines.push('');

lines.push('High-level summary');
lines.push('------------------');
lines.push('0x00FBD1 is the universal USB event callback stored at D14026.');
lines.push('It receives a bitmask at IX+6 and tests bits individually:');
lines.push('  bit 2 (0x04) — device connect: set USB active, dispatch speed-dependent event');
lines.push('  bit 3 (0x08) — device disconnect: clear USB active flag (DI-protected)');
lines.push('  bit 7 (0x80) — port change: negotiate speed, attach/detach/reset logic');
lines.push('  bit 6 (0x40) — suspend/resume: speed-dependent re-attach or disconnect event');
lines.push('  bit 1 (0x02) — link ready: if link check passes, trigger bus reset');
lines.push('  bit 11 (0x0800) — final cleanup: clear USB active, optional port enable for low-speed');
lines.push('Each bit handler dispatches to 0x00883C(event_code, sub_event) with hardcoded arguments.');
lines.push('The function is a flat bitmask dispatcher — no loops, no recursion.');
lines.push('');

lines.push('Bitmask bit handlers');
lines.push('--------------------');
for (const c of dispatchCalls) {
  lines.push(`  0x00883C(${hex(c.arg1, 2)}, ${hex(c.arg2, 2)}) @ ${hex(c.site)}`);
}
lines.push('');

lines.push('Direct callers (CALL 0x00FBD1)');
if (directCallers.length === 0) {
  lines.push('  (none — called only via indirect dispatch through D14026)');
} else {
  for (const site of directCallers) {
    lines.push(`  ${hex(site)}`);
  }
}
lines.push('');

lines.push('JP references');
for (const site of jpCallers) {
  lines.push(`  ${hex(site)} — low-ROM thunk table entry (JP 0x00FBD1)`);
}
lines.push('');

lines.push('Disassembly');
for (const inst of instructions) {
  const note = SITE_NOTES.get(inst.pc);
  lines.push(
    `${hex(inst.pc)}  ${formatBytes(inst.pc, inst.length).padEnd(19)}  ${formatInstruction(inst).padEnd(40)}${note ? ` ; ${note}` : ''}`
  );
}
lines.push('');

lines.push('CALL targets');
for (const [target, sites] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
  const label = CALL_LABELS.get(target) ?? 'unlabeled helper';
  lines.push(`  ${hex(target)} x${sites.length} @ ${sites.map((site) => hex(site)).join(', ')} — ${label}`);
}
lines.push('');

lines.push('Direct absolute RAM access');
const seenRam = new Map();
for (const ref of ramAccess) {
  const key = `${ref.addr}-${ref.access}`;
  if (!seenRam.has(key)) {
    seenRam.set(key, []);
  }
  seenRam.get(key).push(ref.site);
}
for (const [key, sites] of [...seenRam.entries()].sort()) {
  const [addrStr, access] = key.split('-');
  const addr = parseInt(addrStr);
  const label = RAM_LABELS.get(addr) ?? 'unlabeled RAM';
  lines.push(`  ${hex(addr)} ${access} x${sites.length} @ ${sites.map(s => hex(s)).join(', ')} — ${label}`);
}
lines.push('');

lines.push('Port I/O');
for (const ref of portIO) {
  const note = SITE_NOTES.get(ref.site) ?? '';
  lines.push(`  ${hex(ref.site)} ${ref.direction} — ${note}`);
}
lines.push('Port addresses used:');
for (const [port, label] of PORT_LABELS) {
  lines.push(`  0x${port.toString(16).toUpperCase()} — ${label}`);
}
lines.push('');

lines.push('Speed-code dispatch table (D177B8 values)');
lines.push('  < 0x40          => 0x00883C(0x06, 0x03) — low-speed connect');
lines.push('  == 0x40         => 0x00883C(0x44, 0x02) — full-speed connect');
lines.push('  0x40..0x7F      => (skipped — JR NZ to end)');
lines.push('  0x80..0xBF      => 0x00883C(0x81, 0x10) — high-speed connect');
lines.push('  >= 0xC0 + p3082 bit4 => 0x00883C(0x06, 0x03) — fallback connect');
lines.push('  >= 0xC0 + !bit4 => (skipped)');
lines.push('');

lines.push('Assessment');
lines.push('----------');
lines.push('0x00FBD1 is a 574-byte multi-section bitmask dispatcher that converts raw USB');
lines.push('hardware events into TI-OS USB state machine transitions via 0x00883C. It is the');
lines.push('single callback for ALL USB event types — connect, disconnect, port change, suspend,');
lines.push('link ready, and final cleanup. The speed code at D177B8 drives secondary dispatch');
lines.push('within the connect and suspend handlers. Port 0x3082 (PHY status) and port 0x3010');
lines.push('(host control) are read/written directly for hardware-level attach/detach sequencing.');
lines.push('The function clears 11 endpoint config bytes on disconnect (0xD14078-0xD1408D range).');

console.log(lines.join('\n'));
