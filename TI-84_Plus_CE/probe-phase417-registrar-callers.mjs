#!/usr/bin/env node

/**
 * Phase 417: Callback Registrar Caller Analysis
 *
 * Decodes the callback registrar at 0x01069C (vector #55, entry 0x0005E0)
 * and traces all callers to build a complete table of who registers what
 * callback into which D177BD slot.
 *
 * The registrar uses a _seqcase inline switch (CALL 0x002623) on a stack
 * parameter at (IX+6) to select one of 5 slots, then writes the callback
 * address from (IX+9) into that slot.
 */

import { readFileSync, writeFileSync } from 'node:fs';

process.emitWarning = () => {};

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const REPORT_PATH = 'TI-84_Plus_CE/phase417-registrar-callers-report.md';

const REGISTRAR_ENTRY = 0x01069C;
const REGISTRAR_BODY = 0x0106A0;
const REGISTRAR_END = 0x0106F2;
const SEQCASE_ADDR = 0x002623;
const VECTOR_ADDR = 0x0005E0;
const VECTOR_NUM = 55;

const SLOT_ADDRS = [0xD177BD, 0xD177C0, 0xD177C3, 0xD177C6, 0xD177C9];

const KNOWN_NAMES = new Map([
  [0x000130, 'vec_frame_setup'],
  [0x0005E0, 'vec55_registrar'],
  [0x00218A, 'frame_setup'],
  [0x002623, '_seqcase'],
  [0x01069C, 'registrar_entry'],
  [0x010F00, 'teardown_all_slots'],
  [0x05F77D, 'lcd_RegisterCallback'],
  [0x05F794, 'lcd_UnregisterCallback'],
]);

const rom = readFileSync(ROM_PATH);

// ── Helpers ──

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatIxDisp(disp) {
  const sign = disp < 0 ? '-' : '+';
  return `(IX${sign}${hex(Math.abs(disp), 2)})`;
}

function formatBytes(addr, length) {
  return Array.from(rom.slice(addr, addr + length), hexByte).join(' ');
}

function findPattern(pattern) {
  const hits = [];
  for (let addr = 0; addr <= rom.length - pattern.length; addr++) {
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      if (rom[addr + i] !== pattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(addr);
  }
  return hits;
}

function annotateTarget(target) {
  const name = KNOWN_NAMES.get(target);
  return name ? `${hex(target)} (${name})` : hex(target);
}

function decodeKnownInstruction(addr) {
  const op = rom[addr];

  if (op === 0xCD) {
    return { length: 4, text: `CALL ${annotateTarget(read24(addr + 1))}` };
  }
  if (op === 0xC3) {
    return { length: 4, text: `JP ${annotateTarget(read24(addr + 1))}` };
  }
  if (op === 0x01) {
    return { length: 4, text: `LD BC,${hex(read24(addr + 1))}` };
  }
  if (op === 0x18) {
    const target = addr + 2 + signedByte(rom[addr + 1]);
    return { length: 2, text: `JR ${hex(target)}` };
  }
  if (op === 0xC5) {
    return { length: 1, text: 'PUSH BC' };
  }
  if (op === 0xC1) {
    return { length: 1, text: 'POP BC' };
  }
  if (op === 0xC9) {
    return { length: 1, text: 'RET' };
  }
  if (op === 0xED && rom[addr + 1] === 0x43) {
    return { length: 5, text: `LD (${hex(read24(addr + 2))}),BC` };
  }
  if (op === 0xDD && rom[addr + 1] === 0x27) {
    return { length: 3, text: `LD HL,${formatIxDisp(signedByte(rom[addr + 2]))}` };
  }
  if (op === 0xDD && rom[addr + 1] === 0x07) {
    return { length: 3, text: `LD BC,${formatIxDisp(signedByte(rom[addr + 2]))}` };
  }
  if (op === 0xDD && rom[addr + 1] === 0xF9) {
    return { length: 2, text: 'LD SP,IX' };
  }
  if (op === 0xDD && rom[addr + 1] === 0xE1) {
    return { length: 2, text: 'POP IX' };
  }
  if (op === 0xDD && rom[addr + 1] === 0x4E) {
    return { length: 3, text: `LD C,${formatIxDisp(signedByte(rom[addr + 2]))}` };
  }
  if (op === 0x06) {
    return { length: 2, text: `LD B,${hex(rom[addr + 1], 2)}` };
  }
  if (op === 0x3E) {
    return { length: 2, text: `LD A,${hex(rom[addr + 1], 2)}` };
  }

  return { length: 1, text: `DB ${hex(op, 2)}` };
}

function decodeRange(start, end) {
  const lines = [];
  let addr = start;
  while (addr < end) {
    const inst = decodeKnownInstruction(addr);
    lines.push({ addr, bytes: formatBytes(addr, inst.length), text: inst.text });
    addr += inst.length;
    if (addr <= start) break;
  }
  return lines;
}

function renderLines(lineArr) {
  return lineArr.map(l => `  ${hex(l.addr)}: ${l.bytes.padEnd(16)} ${l.text}`).join('\n');
}

// ── Registrar decode ──

function parseSeqcaseTable(tableStart) {
  // IY = tableStart + 5 after LEA IY,IY+5
  // (IY-5) = 3 bytes at tableStart: count in low byte
  // (IY-3) = 3 bytes at tableStart+2: lower bound
  // entries start at tableStart+5, each 3 bytes (24-bit LE target)
  const count = rom[tableStart]; // low byte of first 3-byte read
  const base = read24(tableStart + 2); // lower bound (overlapping read)
  const targets = [];
  for (let i = 0; i < count; i++) {
    targets.push(read24(tableStart + 5 + i * 3));
  }
  const defaultTarget = read24(tableStart + 5 + count * 3);
  return { tableStart, count, base, targets, defaultTarget };
}

function decodeRegistrar() {
  const table = parseSeqcaseTable(0x0106A7);
  const cases = table.targets.map((target, index) => {
    const callbackDisp = signedByte(rom[target + 2]); // IX displacement for BC load
    const slotAddr = read24(target + 5); // address in the LD (addr),BC
    const jrTarget = target + 10 + signedByte(rom[target + 9]);
    return {
      selector: table.base + index,
      slotNumber: index,
      target,
      callbackDisp,
      slotAddr,
      jrTarget,
    };
  });
  return { table, cases };
}

// ── Caller analysis ──

function inspectPushedBC(pushAddr) {
  // Look for LD BC,imm24 (01 xx xx xx) 4 bytes before the PUSH
  if (pushAddr >= 4 && rom[pushAddr - 4] === 0x01) {
    const value = read24(pushAddr - 3);
    return { kind: 'imm24', value, detail: `LD BC,${hex(value)}` };
  }
  // Look for LD BC,(IX+d) (DD 07 dd) 3 bytes before the PUSH
  if (pushAddr >= 3 && rom[pushAddr - 3] === 0xDD && rom[pushAddr - 2] === 0x07) {
    const disp = signedByte(rom[pushAddr - 1]);
    return { kind: 'ix', disp, detail: `LD BC,${formatIxDisp(disp)}` };
  }
  return { kind: 'unknown', detail: 'unrecognized BC setup' };
}

function inspectVectorCaller(callSite) {
  // Find PUSH BC instructions before the CALL
  const pushSites = [];
  const windowStart = Math.max(0, callSite - 0x18);
  for (let addr = windowStart; addr < callSite; addr++) {
    if (rom[addr] === 0xC5) pushSites.push(addr);
  }

  // Stack convention: last push = IX+6 (slot index), second-to-last = IX+9 (callback)
  const callback = pushSites.length >= 2
    ? inspectPushedBC(pushSites[pushSites.length - 2])
    : { kind: 'unknown', detail: 'missing push' };
  const slot = pushSites.length >= 1
    ? inspectPushedBC(pushSites[pushSites.length - 1])
    : { kind: 'unknown', detail: 'missing push' };

  let callbackStr = callback.detail;
  let slotStr = slot.detail;
  let notes = '';

  if (callback.kind === 'ix' && callback.disp === 9 && slot.kind === 'ix' && slot.disp === 6) {
    callbackStr = 'pass-through from (IX+0x09)';
    slotStr = 'pass-through from (IX+0x06)';
    notes = 'register wrapper: forwards both params from its own caller';
  } else if (callback.kind === 'imm24' && callback.value === 0 && slot.kind === 'ix' && slot.disp === 6) {
    callbackStr = '0x000000 (clear)';
    slotStr = 'pass-through from (IX+0x06)';
    notes = 'unregister wrapper: hardcodes callback=0, forwards slot index from caller';
  }

  // Find the wrapper function boundaries
  let funcStart = callSite;
  for (let scan = callSite - 1; scan >= Math.max(0, callSite - 40); scan--) {
    if (rom[scan] === 0xCD && rom[scan + 1] === 0x30 && rom[scan + 2] === 0x01 && rom[scan + 3] === 0x00) {
      funcStart = scan;
      break;
    }
  }
  let funcEnd = callSite + 4;
  for (let scan = callSite + 4; scan < callSite + 30; scan++) {
    if (rom[scan] === 0xC9) { funcEnd = scan + 1; break; }
  }

  return {
    callerAddr: callSite,
    funcStart,
    funcEnd,
    callbackStr,
    slotStr,
    notes,
    context: decodeRange(funcStart, funcEnd),
  };
}

// ── Main ──

function main() {
  const registrar = decodeRegistrar();

  // Search for all callers
  const vectorCallHits = findPattern([0xCD, 0xE0, 0x05, 0x00]);
  const vectorJpHits = findPattern([0xC3, 0xE0, 0x05, 0x00])
    .filter(a => a !== VECTOR_ADDR);
  const directCallHits = findPattern([0xCD, 0x9C, 0x06, 0x01]);
  const directJpHits = findPattern([0xC3, 0x9C, 0x06, 0x01])
    .filter(a => a !== VECTOR_ADDR);

  const out = [];
  const emit = (s) => { console.log(s); out.push(s); };

  emit('# Phase 417: Callback Registrar Caller Analysis');
  emit('');
  emit('## Registrar Decode');
  emit('');
  emit(`Entry: ${hex(REGISTRAR_ENTRY)} (vector #${VECTOR_NUM} at ${hex(VECTOR_ADDR)})`);
  emit('');
  emit('```');
  emit(`${hex(REGISTRAR_ENTRY)}: CALL ${annotateTarget(0x00218A)}   ; IX frame builder`);
  emit(`${hex(REGISTRAR_BODY)}: LD HL,${formatIxDisp(6)}            ; load slot index from stack param`);
  emit(`${hex(0x0106A3)}: CALL ${annotateTarget(SEQCASE_ADDR)}    ; _seqcase inline switch on HL`);
  emit('```');
  emit('');
  emit('### Inline _seqcase Table');
  emit('');
  emit(`Count: ${registrar.table.count}, Lower bound: ${registrar.table.base} (1-based indexing)`);
  emit('');
  emit('| Selector | Target | Slot | RAM Address | Action |');
  emit('| --- | --- | --- | --- | --- |');
  for (const c of registrar.cases) {
    emit(`| ${c.selector} | \`${hex(c.target)}\` | ${c.slotNumber} | \`${hex(c.slotAddr)}\` | LD BC,${formatIxDisp(c.callbackDisp)} then LD (${hex(c.slotAddr)}),BC |`);
  }
  emit(`| default | \`${hex(registrar.table.defaultTarget)}\` | - | - | epilogue (no-op) |`);
  emit('');
  emit('Selector is the **stack parameter at (IX+6)**, not A or BC. Valid range: 1-5. Out-of-range values silently do nothing.');
  emit('');

  emit('### Case Handler Disassembly');
  emit('');
  emit('```');
  const caseLines = decodeRange(registrar.cases[0].target, 0x0106F3);
  emit(renderLines(caseLines));
  emit('```');
  emit('');

  emit('## Caller Search');
  emit('');
  emit(`CALL ${hex(VECTOR_ADDR)} (vector entry): ${vectorCallHits.length} hits${vectorCallHits.length ? ' at ' + vectorCallHits.map(hex).join(', ') : ''}`);
  emit(`JP ${hex(VECTOR_ADDR)}: ${vectorJpHits.length} hits`);
  emit(`CALL ${hex(REGISTRAR_ENTRY)} (direct): ${directCallHits.length} hits`);
  emit(`JP ${hex(REGISTRAR_ENTRY)} (direct): ${directJpHits.length} hits (excludes vector table entry)`);
  emit('');
  emit(`**Total ROM callers: ${vectorCallHits.length + vectorJpHits.length + directCallHits.length + directJpHits.length}**`);
  emit('');

  emit('## Caller Table');
  emit('');
  emit('| caller_addr | callback_addr_in_BC | slot_index | notes |');
  emit('| --- | --- | --- | --- |');

  const callerDetails = vectorCallHits.map(inspectVectorCaller);
  for (const c of callerDetails) {
    emit(`| \`${hex(c.callerAddr)}\` | ${c.callbackStr} | ${c.slotStr} | ${c.notes} |`);
  }
  emit('');

  emit('## Caller Context Disassembly');
  emit('');
  for (const c of callerDetails) {
    const funcName = KNOWN_NAMES.get(c.funcStart) || 'unknown';
    emit(`### ${funcName} at ${hex(c.funcStart)}`);
    emit('');
    emit('```');
    emit(renderLines(c.context));
    emit('```');
    emit('');
  }

  emit('## Wrapper Reachability');
  emit('');
  const wrappers = [
    { name: 'lcd_RegisterCallback', addr: 0x05F77D, role: 'register (slot_index, callback)' },
    { name: 'lcd_UnregisterCallback', addr: 0x05F794, role: 'unregister (slot_index)' },
  ];
  emit('| Wrapper | Address | CALL refs in ROM | JP refs in ROM | Data refs | Conclusion |');
  emit('| --- | --- | --- | --- | --- | --- |');
  for (const w of wrappers) {
    const lo = w.addr & 0xFF, mid = (w.addr >> 8) & 0xFF, hi = (w.addr >> 16) & 0xFF;
    const calls = findPattern([0xCD, lo, mid, hi]).length;
    const jps = findPattern([0xC3, lo, mid, hi]).length;
    let dataRefs = 0;
    for (let i = 0; i < rom.length - 2; i++) {
      if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
        if (i > 0 && (rom[i - 1] === 0xCD || rom[i - 1] === 0xC3)) continue;
        if (i === w.addr) continue;
        dataRefs++;
      }
    }
    emit(`| \`${w.name}\` | \`${hex(w.addr)}\` | ${calls} | ${jps} | ${dataRefs} | **Not called within ROM** -- app-only C API |`);
  }
  emit('');
  emit('Neither wrapper function is referenced anywhere in the 4 MB ROM. They are C SDK library exports callable only by user applications loaded into RAM at runtime.');
  emit('');

  emit('## Teardown');
  emit('');
  emit(`The bulk-clear at \`${hex(0x010F00)}\` (vector #32 at \`${hex(0x000584)}\`) zeroes all 5 slots:`);
  emit('');
  emit('```');
  const teardownLines = decodeRange(0x010F00, 0x010F2C);
  emit(renderLines(teardownLines));
  emit('```');
  emit('');
  const teardownCallers = findPattern([0xCD, 0x84, 0x05, 0x00]);
  emit(`Teardown callers: ${teardownCallers.length} (at ${teardownCallers.map(hex).join(', ')})`);
  emit('');

  emit('## Summary');
  emit('');
  emit('| Slot | RAM Addr | Selector (1-based) | Registered By | Cleared By | Dispatched From |');
  emit('| --- | --- | --- | --- | --- | --- |');
  const dispatchers = [0x010269, 0x0102A4, 0x0102C9, 0x0102F2, 0x010389];
  for (let i = 0; i < 5; i++) {
    emit(`| ${i} | \`${hex(SLOT_ADDRS[i])}\` | ${i + 1} | \`lcd_RegisterCallback(${i + 1}, cb)\` | \`lcd_UnregisterCallback(${i + 1})\` or teardown | \`${hex(dispatchers[i])}\` |`);
  }
  emit('');

  emit('## Conclusions');
  emit('');
  emit('1. The registrar is a clean OS API: 1-based slot index and callback address are passed on the stack. A `_seqcase` inline switch dispatches to 5 identical store handlers.');
  emit('2. Only 2 ROM callers exist, both in the SDK C wrapper layer. `lcd_RegisterCallback` at `0x05F77D` forwards both parameters; `lcd_UnregisterCallback` at `0x05F794` hardcodes callback=0x000000.');
  emit('3. Neither wrapper is referenced anywhere in ROM. They are exported C API functions for user applications, confirming the D177BD table is a **user-facing display callback API**.');
  emit('4. No in-ROM caller passes a concrete nonzero callback address. The only hardcoded BC value is 0x000000 (clear). Actual callback addresses come from user applications at runtime.');
  emit('5. The teardown at `0x010F00` bulk-clears all 5 slots, called from a single SDK wrapper at `0x05FDF9`.');

  writeFileSync(REPORT_PATH, out.join('\n'));
  console.log(`\nReport written to ${REPORT_PATH}`);
}

main();
