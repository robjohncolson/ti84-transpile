#!/usr/bin/env node

import { readFileSync } from 'node:fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const ENTRY = 0x010220;
const EPILOGUE = 0x01038D;
const RETURN = 0x0103A3;
const NEXT_FUNCTION = 0x0103A4;

const SYMBOLS = new Map([
  [0xD000BF, 'D000BF'],
  [0xD177BC, 'D177BC'],
  [0xD177BD, 'D177BD'],
  [0xD177C0, 'D177C0'],
  [0xD177C3, 'D177C3'],
  [0xD177C6, 'D177C6'],
  [0xD177C9, 'D177C9'],
  [0xD177D6, 'D177D6'],
  [0xD177D7, 'D177D7'],
  [0xD177E1, 'D177E1'],
]);

const CALL_NOTES = new Map([
  [0x002197, '__frameset: reserves 1 local byte at (IX-1)'],
  [0x0021C2, 'null-check helper: returns Z when HL == 0'],
  [0x002288, '_indcall trampoline: JP (IY)'],
  [0x007CAD, 'mask/write helper for port 0x8020 (called with BC=2 here)'],
  [0x007CD3, 'reads port 0x8020 and returns the byte in A'],
  [0x007CF1, 'writes the latched D177D7 byte to port 0x8020'],
  [0x007DC7, 'reads port 0x8034 and returns the byte in A'],
  [0x007DDB, 'writes the final sampled byte back to port 0x8034'],
  [0x010090, 'slot-3 pre-dispatch helper; its body reads D177DB/D177D8'],
]);

const SITE_NOTES = new Map([
  [0x01022D, 'master enable == 0 skips directly to the common epilogue'],
  [0x01023D, 'sampled status bit0 gates the entire slot0-3 consume pass'],
  [0x010246, 'non-zero D177D7 triggers a port 0x8020 write before slot0'],
  [0x010256, 'D177D7 is explicitly cleared before slot0 dispatch'],
  [0x010272, 'no pending D177D6 bits skips slots1-3 and jumps to the arm phase'],
  [0x010284, 'consume slot1: clear D177D6 bit1 before callback'],
  [0x01028F, 'consume slot1 side effect: SET 5,(0xD000BF)'],
  [0x0102B6, 'consume slot2: clear D177D6 bit2 before callback'],
  [0x0102DB, 'consume slot3: clear D177D6 bit3 before callback'],
  [0x0102DF, 'slot3-only helper call before callback null-check'],
  [0x010315, 'arm next pass: set D177D6 bit1 from sampled status bit1'],
  [0x010325, 'reuses existing D177D7 latch when already non-zero'],
  [0x01033F, 'arm next pass: set D177D6 bit2 from sampled status bit2'],
  [0x01034F, 'same D177D7 latch reuse for sampled status bit3'],
  [0x010369, 'arm next pass: set D177D6 bit3 from sampled status bit3'],
  [0x010376, 'slot4 immediate side effect: D177E1 = 1'],
  [0x01038D, 'all paths merge here before the final return'],
  [0x01039F, 'frame teardown starts here: LD SP,IX; POP IX; RET'],
]);

const SLOT_SUMMARY = [
  {
    slot: 0,
    ptr: 0xD177BD,
    range: '0x010241-0x010269',
    gate: 'sampled status bit0 (IX-1 & 0x01)',
    queue: 'none',
    sideEffects: 'optional CALL 0x007CF1 using D177D7, then D177D7 cleared',
    dispatchPc: 0x010269,
  },
  {
    slot: 1,
    ptr: 0xD177C0,
    range: '0x010276-0x0102A4',
    gate: 'existing D177D6 bit1',
    queue: 'bit1 is cleared before dispatch; re-armed later from sampled status bit1',
    sideEffects: 'SET 5,(0xD000BF) before callback',
    dispatchPc: 0x0102A4,
  },
  {
    slot: 2,
    ptr: 0xD177C3,
    range: '0x0102A8-0x0102C9',
    gate: 'existing D177D6 bit2',
    queue: 'bit2 is cleared before dispatch; re-armed later from sampled status bit2',
    sideEffects: 'none besides the bit clear',
    dispatchPc: 0x0102C9,
  },
  {
    slot: 3,
    ptr: 0xD177C6,
    range: '0x0102CD-0x0102F2',
    gate: 'existing D177D6 bit3',
    queue: 'bit3 is cleared before dispatch; re-armed later from sampled status bit3',
    sideEffects: 'CALL 0x010090 before pointer null-check',
    dispatchPc: 0x0102F2,
  },
  {
    slot: 4,
    ptr: 0xD177C9,
    range: '0x01036D-0x010389',
    gate: 'sampled status bit4 (IX-1 & 0x10)',
    queue: 'not queued through D177D6',
    sideEffects: 'D177E1 = 1 before callback',
    dispatchPc: 0x010389,
  },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function formatDisp(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + length), hexByte).join(' ');
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
    };
  }
}

function formatInstruction(inst) {
  const u = value => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${u(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${u(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'push':
      return `PUSH ${u(inst.pair)}`;
    case 'pop':
      return `POP ${u(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${u(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr)}),${u(inst.pair)}`;
      }
      return `LD ${u(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-reg-imm':
      return `LD ${u(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${u(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${u(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${u(inst.dest)},${u(inst.src)}`;
    case 'ld-reg-ixd':
      return `LD ${u(inst.dest)},(IX${formatDisp(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `LD (IX${formatDisp(inst.displacement)}),${u(inst.src)}`;
    case 'inc-pair':
      return `INC ${u(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${u(inst.pair)}`;
    case 'alu-reg':
      return `${u(inst.op)} ${u(inst.src)}`;
    case 'alu-imm':
      return `${u(inst.op)} ${hex(inst.value, 2)}`;
    case 'bit-res':
      return `RES ${inst.bit},${u(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit},${u(inst.reg)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},(${u(inst.indexRegister)}${formatDisp(inst.displacement)})`;
    case 'ld-sp-pair':
      return `LD SP,${u(inst.pair)}`;
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function decodeRange(start, end) {
  const rows = [];
  let pc = start;

  while (pc < end) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!inst || inst.nextPc <= pc) {
      break;
    }
    pc = inst.nextPc;
  }

  return rows;
}

function renderRows(rows) {
  return rows.map(({ pc, inst }) => {
    const bytes = rawBytes(pc, inst.length).padEnd(18, ' ');
    const parts = [`${hex(pc)}  ${bytes}  ${formatInstruction(inst)}`];

    if (inst.tag === 'call' && CALL_NOTES.has(inst.target)) {
      parts.push(`; ${CALL_NOTES.get(inst.target)}`);
    }
    if (SITE_NOTES.has(pc)) {
      parts.push(`; ${SITE_NOTES.get(pc)}`);
    }

    return parts.join(' ');
  }).join('\n');
}

function patternHits(bytes) {
  const hits = [];

  for (let pc = 0; pc <= rom.length - bytes.length; pc++) {
    let matched = true;
    for (let i = 0; i < bytes.length; i++) {
      if (rom[pc + i] !== bytes[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(pc);
    }
  }

  return hits;
}

function addAccess(groups, key, label, width, kind, pc) {
  if (!groups.has(key)) {
    groups.set(key, {
      label,
      width,
      reads: [],
      writes: [],
    });
  }
  groups.get(key)[kind].push(pc);
}

function collectRamAccesses(rows) {
  const groups = new Map();
  let iyBase = null;

  for (const { pc, inst } of rows) {
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'iy') {
      iyBase = inst.value;
    }
    if (inst.tag === 'ld-pair-mem' && inst.pair === 'iy') {
      iyBase = null;
    }
    if (inst.tag === 'pop' && inst.pair === 'iy') {
      iyBase = null;
    }

    if (inst.tag === 'ld-reg-mem' && inst.addr >= 0xD00000) {
      addAccess(groups, inst.addr, SYMBOLS.get(inst.addr) ?? hex(inst.addr), 1, 'reads', pc);
    } else if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000) {
      addAccess(groups, inst.addr, SYMBOLS.get(inst.addr) ?? hex(inst.addr), 1, 'writes', pc);
    } else if (inst.tag === 'ld-pair-mem' && inst.addr >= 0xD00000) {
      const width = 3;
      if (inst.direction === 'to-mem') {
        addAccess(groups, inst.addr, SYMBOLS.get(inst.addr) ?? hex(inst.addr), width, 'writes', pc);
      } else {
        addAccess(groups, inst.addr, SYMBOLS.get(inst.addr) ?? hex(inst.addr), width, 'reads', pc);
      }
    } else if (inst.tag === 'ld-reg-ixd') {
      addAccess(groups, `ix:${inst.displacement}`, `FRAME(IX${formatDisp(inst.displacement)})`, 1, 'reads', pc);
    } else if (inst.tag === 'ld-ixd-reg') {
      addAccess(groups, `ix:${inst.displacement}`, `FRAME(IX${formatDisp(inst.displacement)})`, 1, 'writes', pc);
    } else if (inst.tag === 'indexed-cb-set' && inst.indexRegister === 'iy' && iyBase !== null) {
      const addr = (iyBase + inst.displacement) >>> 0;
      if (addr >= 0xD00000) {
        addAccess(groups, addr, SYMBOLS.get(addr) ?? hex(addr), 1, 'writes', pc);
      }
    }
  }

  return [...groups.entries()].sort((a, b) => {
    const [keyA] = a;
    const [keyB] = b;
    const rank = key => typeof key === 'number' ? key : 0xFFFFFF + parseInt(String(key).split(':')[1] ?? '0', 10);
    return rank(keyA) - rank(keyB);
  }).map(([, entry]) => entry);
}

function renderAccessSites(sites) {
  if (sites.length === 0) {
    return '-';
  }
  return sites.map(pc => hex(pc)).join(', ');
}

const rows = decodeRange(ENTRY, NEXT_FUNCTION);
const ramAccesses = collectRamAccesses(rows);
const directCalls = patternHits([0xCD, 0x20, 0x02, 0x01]);
const directJumps = patternHits([0xC3, 0x20, 0x02, 0x01]);

const lines = [];
lines.push('# Phase 418 Probe: Trace 0x010220 Display Callback Dispatcher', '');
lines.push('## Entry Points', '');
lines.push(`- ${hex(0x000580)}: OS vector 224 relay (${rawBytes(0x000580, 4)} = JP ${hex(ENTRY)})`);

for (const pc of directCalls) {
  lines.push(`- ${hex(pc)}: direct CALL ${hex(ENTRY)}`);
}
for (const pc of directJumps) {
  if (pc !== 0x000580) {
    lines.push(`- ${hex(pc)}: direct JP ${hex(ENTRY)}`);
  }
}

lines.push('', '## Exit Points', '');
lines.push(`- Early exit: ${hex(0x01022D)} branches to the common epilogue at ${hex(EPILOGUE)} when D177BC == 0.`);
lines.push(`- Main epilogue: ${hex(EPILOGUE)}-${hex(RETURN)} re-samples 0x8034, calls ${hex(0x007DDB)}, tears down the frame, and returns at ${hex(RETURN)}.`);
lines.push(`- Internal join targets that feed the same return path: ${hex(0x0102F6)}, ${hex(0x010319)}, ${hex(0x010343)}, ${hex(0x01036D)}, ${hex(EPILOGUE)}.`, '');

lines.push(`## Disassembly Window (${hex(ENTRY)}-${hex(RETURN)})`, '', '```text');
lines.push(renderRows(rows));
lines.push('```', '');

lines.push('## Direct RAM Reads/Writes Inside 0x010220', '');
lines.push('| Symbol | Width | Reads | Writes |');
lines.push('| --- | --- | --- | --- |');
for (const entry of ramAccesses) {
  lines.push(`| ${entry.label} | ${entry.width} byte${entry.width === 1 ? '' : 's'} | ${renderAccessSites(entry.reads)} | ${renderAccessSites(entry.writes)} |`);
}

lines.push('', '## Dispatch Structure', '');
lines.push('- There is no counted loop, pointer increment, or slot-index variable. The function is a fully unrolled five-slot dispatcher over the fixed addresses D177BD/D177C0/D177C3/D177C6/D177C9.');
lines.push('- The routine has two distinct phases for slots 1-3:');
lines.push('  1. Consume existing pending bits from D177D6 and dispatch slots 1-3 immediately if those bits were already set on entry.');
lines.push('  2. Re-arm D177D6 bits 1-3 from the current sampled status byte after the consume pass completes.');
lines.push('- Because the arm phase happens after slots 1-3 have already been checked, newly set D177D6 bits are deferred to the next dispatcher invocation.');
lines.push('- Slot 0 and slot 4 are immediate-status callbacks. Slot 0 is gated by sampled status bit0; slot 4 is gated by sampled status bit4 and sets D177E1 first.', '');

lines.push('## Per-Slot Summary', '');
lines.push('| Slot | Pointer | Range | Gate | Queue Behavior | Side Effects | Dispatch |');
lines.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const slot of SLOT_SUMMARY) {
  lines.push(
    `| ${slot.slot} | ${SYMBOLS.get(slot.ptr)} | ${slot.range} | ${slot.gate} | ${slot.queue} | ${slot.sideEffects} | ${hex(slot.dispatchPc)} |`
  );
}

lines.push('', '## Functional Walkthrough', '');
lines.push(`1. ${hex(ENTRY)}-${hex(0x010240)}: frame setup via ${hex(0x002197)}, read master enable D177BC, sample LCD/display status through ${hex(0x007DC7)}, store the byte in FRAME(IX-1), and use bit0 to decide whether the slot0-3 consume pass runs at all.`);
lines.push(`2. ${hex(0x010241)}-${hex(0x010269)}: if D177D7 is non-zero, send it through ${hex(0x007CF1)}, then clear D177D7 and dispatch slot0 if D177BD is non-null.`);
lines.push(`3. ${hex(0x01026D)}-${hex(0x0102F2)}: consume existing D177D6 bits 1/2/3 in order. Each block clears its bit first, then does the null-check and the shared JP (IY) trampoline call. Slot1 also sets D000BF bit5; slot3 also calls ${hex(0x010090)}.`);
lines.push(`4. ${hex(0x0102F6)}-${hex(0x010369)}: arm the next pass. Sampled status bits 1/2/3 set D177D6 bits 1/2/3. Bits 2 and 3 optionally refresh D177D7 from ${hex(0x007CD3)} and replay ${hex(0x007CAD)} with argument 2 if the latch is still zero.`);
lines.push(`5. ${hex(0x01036D)}-${hex(0x010389)}: if sampled status bit4 is set, write D177E1 = 1 and dispatch slot4 immediately. This path does not read D177D6 at all.`);
lines.push(`6. ${hex(EPILOGUE)}-${hex(RETURN)}: read 0x8034 again via ${hex(0x007DC7)}, store the final sample back into FRAME(IX-1), zero-extend it into BC, call ${hex(0x007DDB)}, then return.`, '');

lines.push('## Key Findings', '');
lines.push('- The "display callback loop" is structurally an unrolled pipeline, not a real loop over a pointer table.');
lines.push('- D177D6 is a deferred-work byte for slots 1-3 only. Slot4 is immediate and uses D177E1 instead of D177D6.');
lines.push('- D177D7 is cleared before slot0, then reused as a latch during the later bit2/bit3 arm paths.');
lines.push('- The one-byte local at FRAME(IX-1) is the sampled status byte from port 0x8034 and is reused across the whole dispatch pass.');

console.log(lines.join('\n'));
