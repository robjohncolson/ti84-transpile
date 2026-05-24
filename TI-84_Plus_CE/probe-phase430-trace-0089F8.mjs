#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const rom = readFileSync(ROM_PATH);

const FUNC_START = 0x0089F8;
const FUNC_END = 0x008BE9; // exclusive
const DISPATCH_HELPER = 0x00211B;

const CALL_LABELS = new Map([
  [0x002197, 'frame setup helper'],
  [0x00211B, 'sparse _seqcase dispatcher'],
  [0x00883C, 'status/event reporter'],
  [0x014FA0, 'short delay helper'],
  [0x00CC71, 'descriptor bootstrap wrapper'],
  [0x00DCB6, 'link-ready handshake gate'],
  [0x00D681, 'secondary descriptor/bootstrap stage'],
  [0x00D9EE, 'USB side-band helper'],
  [0x00B8BC, 'DI-wrapped recovery helper'],
  [0x014E3F, 'long wait helper'],
  [0x012456, 'controller re-arm helper'],
  [0x0125EA, 'status-submit helper'],
  [0x012933, 'post-submit follow-up helper'],
]);

const RAM_LABELS = new Map([
  [0xD177B8, 'selector/event byte'],
  [0xD177B7, 'armed sentinel (0x55)'],
  [0xD14073, 'USB/link mode latch'],
  [0xD14082, 'service latch'],
  [0xD1440E, 'notification lock'],
  [0xD1440F, 'abort/delivery flag'],
]);

const EVENT_NOTES = new Map([
  [0x41, 'controller/PHY arm path: 0x00D9EE, set bit 0 on port 0x3114, wait on 0x3082 bit 4, clear D1440E, set D14073, status(0,1)'],
  [0x45, 'descriptor bootstrap path: delay, then 0x00CC71(0,2,2000), then status 0x46 or 0x86'],
  [0x46, 'ready-gate path: 0x00DCB6 twice with delays, then 0x00D681 and status 0x41 or 0x47'],
  [0x47, 'DI-protected recovery/timer path: call 0x00B8BC(3000), report status 0x83, restore interrupt state'],
  [0xC0, 'vendor/control follow-up: optional 0x012456, then 0x0125EA(0x12,0xC0), then 0x012933 on success'],
  [0xC1, 'shared follow-up with 0xC2: 0x012456, then 0x0125EA(0x10,0xFF)'],
  [0xC2, 'shared follow-up with 0xC1: 0x012456, then 0x0125EA(0x10,0xFF)'],
  [0xC4, 'recognized no-op: jump straight to the common epilogue with retval still 1'],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function scanCalls() {
  const calls = [];
  for (let pc = FUNC_START; pc <= FUNC_END - 4; pc++) {
    if (rom[pc] === 0xCD) {
      calls.push({ pc, target: read24(pc + 1) });
      pc += 3;
    }
  }
  return calls;
}

function parseDispatch(calls) {
  const call = calls.find((entry) => entry.target === DISPATCH_HELPER);
  if (!call) {
    throw new Error('CALL 0x00211B not found inside 0x0089F8');
  }

  const tableStart = call.pc + 4;
  const count = read16(tableStart);
  const entries = [];
  let cursor = tableStart + 2;

  for (let i = 0; i < count; i++) {
    const code = rom[cursor];
    const target = read24(cursor + 1);
    entries.push({
      code,
      target,
      field: cursor,
    });
    cursor += 4;
  }

  const defaultField = cursor;
  const defaultTarget = read24(defaultField);
  const bodyStart = defaultField + 3;
  const falseLinearStart = defaultField - 4;

  return {
    call,
    tableStart,
    count,
    entries,
    defaultField,
    defaultTarget,
    bodyStart,
    falseLinearStart,
  };
}

function summarizeCases(dispatch) {
  const boundaries = [...new Set([
    ...dispatch.entries.map((entry) => entry.target),
    dispatch.defaultTarget,
    FUNC_END,
  ])].sort((a, b) => a - b);

  const nextBoundary = (target) => boundaries.find((boundary) => boundary > target) ?? FUNC_END;

  const cases = dispatch.entries.map((entry) => {
    const end = nextBoundary(entry.target);
    return {
      ...entry,
      end,
      size: end - entry.target,
      note: EVENT_NOTES.get(entry.code) ?? 'unlabeled',
    };
  });

  const defaultEnd = nextBoundary(dispatch.defaultTarget);

  return {
    cases,
    defaultCase: {
      target: dispatch.defaultTarget,
      end: defaultEnd,
      size: defaultEnd - dispatch.defaultTarget,
      note: 'default failure path: LD (IX-1),0 at 0x008BDD, then fall into epilogue at 0x008BE1',
    },
  };
}

function scanPorts() {
  const ops = [];
  let bcValue = null;

  for (let pc = FUNC_START; pc < FUNC_END; pc++) {
    if (rom[pc] === 0x40 && rom[pc + 1] === 0x01) {
      bcValue = read16(pc + 2);
      pc += 3;
      continue;
    }

    if (rom[pc] === 0x01) {
      bcValue = read24(pc + 1) & 0xFFFF;
      pc += 3;
      continue;
    }

    if (rom[pc] === 0xED && rom[pc + 1] === 0x78) {
      ops.push({ pc, op: 'IN A,(C)', port: bcValue });
      pc += 1;
      continue;
    }

    if (rom[pc] === 0xED && rom[pc + 1] === 0x79) {
      ops.push({ pc, op: 'OUT (C),A', port: bcValue });
      pc += 1;
      continue;
    }
  }

  return ops;
}

function scanRam() {
  const refs = [];

  for (let pc = FUNC_START; pc <= FUNC_END - 4; pc++) {
    if (rom[pc] === 0x3A) {
      refs.push({ pc, op: 'LD A,(nn)', addr: read24(pc + 1) });
      pc += 3;
      continue;
    }

    if (rom[pc] === 0x32) {
      refs.push({ pc, op: 'LD (nn),A', addr: read24(pc + 1) });
      pc += 3;
    }
  }

  return refs;
}

function groupCounts(items, keyFn) {
  const grouped = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  }
  return grouped;
}

const calls = scanCalls();
const dispatch = parseDispatch(calls);
const caseSummary = summarizeCases(dispatch);
const portOps = scanPorts();
const ramRefs = scanRam();

console.log('# Phase 430 Probe: Trace 0x0089F8');
console.log('');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Function entry: ${hex(FUNC_START)}..${hex(FUNC_END - 1)} (${FUNC_END - FUNC_START} bytes, full callable span)`);
console.log(`Inline table: ${hex(dispatch.tableStart)}..${hex(dispatch.defaultField + 2)} (${dispatch.defaultField + 3 - dispatch.tableStart} bytes)`);
console.log(`Post-table body: ${hex(dispatch.bodyStart)}..${hex(FUNC_END - 1)} (${FUNC_END - dispatch.bodyStart} bytes)`);
console.log('');
console.log('Size clarification:');
console.log(`- Full entry span is ${FUNC_END - FUNC_START} bytes.`);
console.log(`- The often-quoted 439-byte span is ${hex(dispatch.falseLinearStart)}..${hex(FUNC_END - 1)} because the last inline-table entry bytes "C4 E1 8B 00" look like code if you ignore _seqcase.`);
console.log(`- In reality ${hex(dispatch.falseLinearStart)} is inside the case table, and the real default target field is ${hex(dispatch.defaultField)} -> ${hex(dispatch.defaultTarget)}.`);
console.log('');

console.log('## Dispatcher');
console.log(`CALL ${hex(DISPATCH_HELPER)} at ${hex(dispatch.call.pc)}`);
console.log(`Selector source: LD A,(${hex(0xD177B8)}) at ${hex(0x008A08)}; then OR A / SBC HL,HL / LD L,A before the call`);
console.log(`Inline format: [u16 count][count x {u8 code,u24 target}][u24 default]`);
console.log(`Entry count: ${dispatch.count}`);
console.log(`Default target field: ${hex(dispatch.defaultField)} -> ${hex(dispatch.defaultTarget)}`);
console.log('');
for (const entry of caseSummary.cases) {
  console.log(`- ${hex(entry.code, 2)} -> ${hex(entry.target)} (${entry.size} bytes until ${hex(entry.end)})`);
  console.log(`  ${entry.note}`);
}
console.log(`- default -> ${hex(caseSummary.defaultCase.target)} (${caseSummary.defaultCase.size} bytes until ${hex(caseSummary.defaultCase.end)})`);
console.log(`  ${caseSummary.defaultCase.note}`);
console.log('');

console.log('## Direct CALL Targets');
const callsByTarget = groupCounts(calls, (entry) => entry.target);
for (const [target, sites] of [...callsByTarget.entries()].sort((a, b) => a[0] - b[0])) {
  const label = CALL_LABELS.get(target) ?? 'unknown';
  console.log(`- ${hex(target)} (${sites.length} site${sites.length === 1 ? '' : 's'}): ${label}`);
  console.log(`  sites: ${sites.map((site) => hex(site.pc)).join(', ')}`);
}
console.log('');
console.log('Targets beyond 0x00CC71 and 0x00211B:');
for (const [target, sites] of [...callsByTarget.entries()].sort((a, b) => a[0] - b[0])) {
  if (target === 0x00CC71 || target === 0x00211B) {
    continue;
  }
  const label = CALL_LABELS.get(target) ?? 'unknown';
  console.log(`- ${hex(target)} (${sites.length}): ${label}`);
}
console.log('');

console.log('## Direct Port I/O');
for (const op of portOps) {
  console.log(`- ${hex(op.pc)}  ${op.op}  port=${hex(op.port ?? 0, 4)}`);
}
console.log('');
console.log('Port notes:');
console.log('- 0x3114 is only read-modify-written once: the code sets bit 0, then runs a BC-register assertion loop.');
console.log('- The actual wait loop is on 0x3082 bit 4 in the 0x41 case body.');
console.log('- 0x3082 is read again in the 0xC0 case to test bit 3 before the optional 0x012456 call.');
console.log('');

console.log('## Direct Absolute RAM Accesses');
const ramByAddr = groupCounts(ramRefs, (entry) => entry.addr);
for (const [addr, refs] of [...ramByAddr.entries()].sort((a, b) => a[0] - b[0])) {
  const label = RAM_LABELS.get(addr) ?? 'unlabeled';
  console.log(`- ${hex(addr)}: ${label}`);
  console.log(`  ${refs.map((ref) => `${ref.op} @ ${hex(ref.pc)}`).join(', ')}`);
}
console.log('');
console.log('Local frame bytes:');
console.log('- (IX-1) is the return latch. It is seeded to 1 at 0x008A00 and returned in A at 0x008BE1.');
console.log('- (IX-2) is seeded to 0 at 0x008A04 and not read directly again inside 0x0089F8.');
console.log('');

console.log('## Return Value Logic');
console.log('- Prologue: LD (IX-1),1 at 0x008A00 means "success/handled" by default.');
console.log('- Common epilogue: 0x008BE1 loads A from (IX-1), restores the IX frame, and RETs.');
console.log('- Unknown/default selector clears (IX-1) at 0x008BDD before falling into the epilogue.');
console.log('- The 0xC0 path also clears (IX-1) at 0x008BAF if 0x0125EA returns zero.');
console.log('- All other recognized cases keep (IX-1)=1, so any caller, including 0x009118, sees A=1 as long as the case-specific code does not clear that latch.');
console.log('');

console.log('## Minimal Flow');
console.log('1. Build a 2-byte IX frame and seed retval=1.');
console.log('2. Load selector from D177B8 and dispatch through the inline _seqcase table.');
console.log('3. Run one of eight case bodies or the default failure body.');
console.log('4. Return A=(IX-1) through the shared epilogue at 0x008BE1.');
