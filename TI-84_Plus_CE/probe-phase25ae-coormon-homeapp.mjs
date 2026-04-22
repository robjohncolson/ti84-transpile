#!/usr/bin/env node

/**
 * Phase 25AE: CoorMon with cxCurApp seeded for the home screen
 *
 * Goal:
 *   1. Cold boot + MEM_INIT
 *   2. Seed keyboard matrix with ENTER key pressed
 *   3. Seed cxCurApp (0xD007E0) to home-screen app ID 0x40
 *   4. Run CoorMon at 0x08C331 with 200K step budget
 *   5. Capture a detailed dispatch trace, including:
 *      - GetCSC visits
 *      - ParseInp visits
 *      - PCs between GetCSC and the next known routine
 *      - JT slot visits
 *      - Reads from cxMain..cxCurApp (0xD007CA-0xD007E1)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25ae-coormon-homeapp-report.md');
const REPORT_TITLE = 'Phase 25AE - CoorMon Home-Screen Dispatch Probe with Seeded cxCurApp';

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const COORMON_ENTRY = 0x08c331;
const GETCSC_ADDR = 0x03fa09;
const PARSEINP_ADDR = 0x099914;
const SCANCODE_TABLE_AREA_START = 0x09f700;
const SCANCODE_TABLE_AREA_END = 0x09f900;
const JT_SLOT_START = 0x020100;
const JT_SLOT_END = 0x0210ff;
const COORMON_SUBDISPATCH_START = 0x08c300;
const COORMON_SUBDISPATCH_END = 0x08c330;

const IY_ADDR = 0xd00080;
const KBD_FLAGS_ADDR = 0xd00080;
const KBD_SCAN_CODE_ADDR = 0xd00587;
const KBD_KEY_ADDR = 0xd0058c;
const KBD_GETKY_ADDR = 0xd0058d;

const CX_MAIN_ADDR = 0xd007ca;
const CX_CONTEXT_END_ADDR = 0xd007e1;
const CX_CUR_APP_ADDR = 0xd007e0;
const HOME_SCREEN_APP_ID = 0x40;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;

const MEMINIT_RET = 0x7ffff6;
const COORMON_RET = 0x7ffffe;
const FAKE_RET = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const COORMON_BUDGET = 200000;
const MAX_LOOP_ITER = 2000;
const SK_ENTER = 0x09;

const CX_CONTEXT_FIELDS = [
  { name: 'cxMain', addr: 0xd007ca, width: 3 },
  { name: 'cxPPutAway', addr: 0xd007cd, width: 3 },
  { name: 'cxPutAway', addr: 0xd007d0, width: 3 },
  { name: 'cxReDisp', addr: 0xd007d3, width: 3 },
  { name: 'cxErrorEP', addr: 0xd007d6, width: 3 },
  { name: 'cxSizeWind', addr: 0xd007d9, width: 3 },
  { name: 'cxPage', addr: 0xd007dc, width: 3 },
  { name: 'cxCurApp', addr: 0xd007e0, width: 2 },
];

const KNOWN_ROUTINES = [
  { name: 'GetCSC', start: 0x03fa09, end: 0x03fb00 },
  { name: 'ParseInp', start: 0x099914, end: 0x099a00 },
  { name: 'ScancodeTable', start: SCANCODE_TABLE_AREA_START, end: SCANCODE_TABLE_AREA_END },
  { name: 'JT_Slots', start: JT_SLOT_START, end: JT_SLOT_END },
  { name: 'CoorMonSubDispatch', start: COORMON_SUBDISPATCH_START, end: COORMON_SUBDISPATCH_END },
  { name: 'CoorMon', start: 0x08c331, end: 0x08c400 },
  { name: 'BootArea', start: 0x000000, end: 0x001000 },
  { name: 'ISR_area', start: 0x000700, end: 0x000800 },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function read16(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8)) >>> 0;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errSP: read24(mem, ERR_SP_ADDR),
  };
}

function formatPointerSnapshot(s) {
  return [
    `tempMem=${hex(s.tempMem)}`,
    `FPSbase=${hex(s.fpsBase)}`,
    `FPS=${hex(s.fps)}`,
    `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`,
    `errNo=${hex(s.errNo, 2)}`,
    `errSP=${hex(s.errSP)}`,
  ].join(' ');
}

function cxFieldValue(mem, field) {
  return field.width === 2 ? read16(mem, field.addr) : read24(mem, field.addr);
}

function snapshotCxContext(mem) {
  const snapshot = {
    rawHex: hexBytes(mem, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR - CX_MAIN_ADDR + 1),
  };

  for (const field of CX_CONTEXT_FIELDS) {
    snapshot[field.name] = cxFieldValue(mem, field);
  }

  return snapshot;
}

function formatCxContextSnapshot(snapshot) {
  const parts = [];
  for (const field of CX_CONTEXT_FIELDS) {
    parts.push(`${field.name}=${hex(snapshot[field.name], field.width === 2 ? 4 : 6)}`);
  }
  parts.push(`raw=[${snapshot.rawHex}]`);
  return parts.join(' ');
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return bootResult;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function classifyPc(pc) {
  for (const routine of KNOWN_ROUTINES) {
    if (pc >= routine.start && pc <= routine.end) return routine.name;
  }
  return null;
}

function overlapsRange(addr, width, rangeStart, rangeWidth) {
  const addrEnd = addr + width - 1;
  const rangeEnd = rangeStart + rangeWidth - 1;
  return addr <= rangeEnd && rangeStart <= addrEnd;
}

function cxFieldsForAccess(addr, width) {
  const names = [];
  for (const field of CX_CONTEXT_FIELDS) {
    if (overlapsRange(addr, width, field.addr, field.width)) names.push(field.name);
  }
  return names;
}

function installCxReadTracer(cpu, mem, traceState) {
  const reads = [];
  const origRead8 = cpu.read8.bind(cpu);
  const origRead16 = cpu.read16.bind(cpu);
  const origRead24 = cpu.read24.bind(cpu);

  const record = (kind, addr, width, value) => {
    const norm = addr & 0xffffff;
    if (!overlapsRange(norm, width, CX_MAIN_ADDR, CX_CONTEXT_END_ADDR - CX_MAIN_ADDR + 1)) return;

    reads.push({
      step: traceState.currentStep,
      pc: (cpu._currentBlockPc ?? 0) & 0xffffff,
      kind,
      addr: norm,
      width,
      value: value >>> 0,
      valueHex: hex(value, width * 2),
      bytesHex: hexBytes(mem, norm, width),
      fields: cxFieldsForAccess(norm, width),
    });
  };

  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    record('read8', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = origRead16(addr);
    record('read16', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = origRead24(addr);
    record('read24', addr, 3, value);
    return value;
  };

  return {
    reads,
    restore() {
      cpu.read8 = origRead8;
      cpu.read16 = origRead16;
      cpu.read24 = origRead24;
    },
  };
}

function getRoutineStats(map, name) {
  if (!map.has(name)) {
    map.set(name, {
      count: 0,
      uniquePcs: new Set(),
      firstHits: [],
    });
  }
  return map.get(name);
}

function formatPcSample(pcs, limit = 20) {
  const list = [...pcs];
  const shown = list.slice(0, limit).map((pc) => hex(pc)).join(', ');
  const extra = list.length > limit ? ` (+${list.length - limit} more)` : '';
  return shown || '-' + extra;
}

function summarizeCxReadCounts(reads) {
  const byField = new Map();
  const byAddr = new Map();

  for (const read of reads) {
    byAddr.set(read.addr, (byAddr.get(read.addr) || 0) + 1);
    const fields = read.fields.length > 0 ? read.fields : ['(unmapped)'];
    for (const field of fields) {
      byField.set(field, (byField.get(field) || 0) + 1);
    }
  }

  return { byField, byAddr };
}

function findDispatchWindowAfterGetCSC(pcTrace) {
  let sawGetCSC = false;
  let leftGetCSC = false;
  const between = [];
  const seenBetween = new Set();

  for (let i = 0; i < pcTrace.length; i++) {
    const pc = pcTrace[i];
    const routine = classifyPc(pc);

    if (!sawGetCSC) {
      if (routine === 'GetCSC') sawGetCSC = true;
      continue;
    }

    if (!leftGetCSC) {
      if (routine === 'GetCSC') continue;
      leftGetCSC = true;
    }

    if (routine && routine !== 'GetCSC') {
      return {
        sawGetCSC: true,
        between,
        nextKnownRoutine: routine,
        nextKnownPc: pc,
        traceIndex: i,
      };
    }

    if (!routine && !seenBetween.has(pc)) {
      seenBetween.add(pc);
      between.push(pc);
    }
  }

  if (!sawGetCSC) {
    return {
      sawGetCSC: false,
      between: [],
      nextKnownRoutine: null,
      nextKnownPc: null,
      traceIndex: -1,
    };
  }

  return {
    sawGetCSC: true,
    between,
    nextKnownRoutine: null,
    nextKnownPc: null,
    traceIndex: pcTrace.length > 0 ? pcTrace.length - 1 : -1,
  };
}

function writeReport(details) {
  const lines = [];
  lines.push(`# ${REPORT_TITLE}`);
  lines.push('');
  lines.push('## Date');
  lines.push('');
  lines.push(new Date().toISOString().slice(0, 10));
  lines.push('');
  lines.push('## Objective');
  lines.push('');
  lines.push('Seed `cxCurApp=0x0040` (home screen), run `CoorMon` with an ENTER keypress, and determine whether the event loop dispatches into `ParseInp` while recording app-context reads from `cxMain..cxCurApp`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Cold boot, `MEM_INIT`, and keyboard seeding copied from `probe-phase25ad-event-loop-trace.mjs`.');
  lines.push('- Timer IRQ disabled with `createPeripheralBus({ timerInterrupt: false })`.');
  lines.push(`- CoorMon entry: \`${hex(COORMON_ENTRY)}\``);
  lines.push(`- GetCSC: \`${hex(GETCSC_ADDR)}\``);
  lines.push(`- ParseInp: \`${hex(PARSEINP_ADDR)}\``);
  lines.push(`- cxCurApp: \`${hex(CX_CUR_APP_ADDR)}\` seeded to \`${hex(HOME_SCREEN_APP_ID, 2)}\``);
  lines.push(`- CoorMon budget: ${COORMON_BUDGET} steps, maxLoopIterations=${MAX_LOOP_ITER}`);
  lines.push('');

  lines.push('## Stage 0: Boot');
  lines.push('');
  lines.push(`- Boot result: steps=${details.bootResult.steps} term=${details.bootResult.termination} lastPc=${hex(details.bootResult.lastPc ?? 0)}`);
  lines.push(`- Post-boot pointers: ${formatPointerSnapshot(details.postBootPointers)}`);
  lines.push(`- Post-boot cx context: ${formatCxContextSnapshot(details.postBootCx)}`);
  lines.push('');

  lines.push('## Stage 1: MEM_INIT');
  lines.push('');
  lines.push(`- Returned: ${details.memInitReturnHit}`);
  lines.push(`- Termination: ${details.memInitTermination}`);
  lines.push(`- Steps: ${details.memInitSteps}`);
  lines.push(`- Post-MEM_INIT pointers: ${formatPointerSnapshot(details.postMemInitPointers)}`);
  lines.push(`- Post-MEM_INIT cx context: ${formatCxContextSnapshot(details.postMemInitCx)}`);
  lines.push('');

  if (!details.memInitReturnHit) {
    lines.push('## Result');
    lines.push('');
    lines.push('MEM_INIT did not return, so CoorMon was not executed.');
    lines.push('');
    lines.push('## Console Output');
    lines.push('');
    lines.push('```text');
    lines.push(...details.transcript);
    lines.push('```');
    fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
    return;
  }

  lines.push('## Stage 2: Keyboard + Home-App Seed');
  lines.push('');
  lines.push(`- keyMatrix[1]: \`${hex(details.keyboardSeed.keyMatrix1, 2)}\` (ENTER pressed)`);
  lines.push(`- kbdScanCode: \`${hex(details.keyboardSeed.scanCode, 2)}\``);
  lines.push(`- kbdFlags: \`${hex(details.keyboardSeed.flags, 2)}\``);
  lines.push(`- kbdKey: \`${hex(details.keyboardSeed.key, 2)}\``);
  lines.push(`- kbdGetKy: \`${hex(details.keyboardSeed.getKy, 2)}\``);
  lines.push(`- cxCurApp before explicit seed: \`${hex(details.cxCurAppBeforeSeed, 4)}\``);
  lines.push(`- cxCurApp before CoorMon: \`${hex(details.preCoorMonCx.cxCurApp, 4)}\``);
  lines.push(`- Pre-CoorMon cx context: ${formatCxContextSnapshot(details.preCoorMonCx)}`);
  lines.push('');

  lines.push('## Stage 3: CoorMon');
  lines.push('');
  lines.push(`- Termination: ${details.coormonTermination}`);
  lines.push(`- Steps: ${details.coormonSteps}`);
  lines.push(`- Final PC: \`${hex(details.coormonFinalPc)}\``);
  lines.push(`- Returned to sentinel: ${details.coormonReturnHit}`);
  lines.push(`- Missing block observed: ${details.coormonMissingBlock}`);
  lines.push(`- Loops forced by executor: ${details.coormonLoopsForced}`);
  lines.push(`- Unique PCs visited: ${details.uniquePcList.length}`);
  lines.push(`- ParseInp exact entry reached: ${details.parseInpReached}`);
  lines.push(`- GetCSC exact entry count: ${details.pcCounts.get(GETCSC_ADDR) || 0}`);
  lines.push(`- ParseInp exact entry count: ${details.pcCounts.get(PARSEINP_ADDR) || 0}`);
  lines.push(`- JT slots called: ${details.jtSlotsCalled}`);
  lines.push(`- cxCurApp after CoorMon: \`${hex(details.postCoormonCx.cxCurApp, 4)}\``);
  lines.push(`- Post-CoorMon pointers: ${formatPointerSnapshot(details.postCoormonPointers)}`);
  lines.push(`- Post-CoorMon cx context: ${formatCxContextSnapshot(details.postCoormonCx)}`);
  lines.push('');

  lines.push('### Known Routine Hit Summary');
  lines.push('');
  lines.push('| Routine | Count | Unique PCs | Sample PCs |');
  lines.push('|---------|-------|------------|------------|');
  for (const routine of KNOWN_ROUTINES) {
    const stats = details.routineHits.get(routine.name);
    if (!stats) {
      lines.push(`| ${routine.name} | 0 | 0 | - |`);
      continue;
    }
    lines.push(`| ${routine.name} | ${stats.count} | ${stats.uniquePcs.size} | ${formatPcSample(stats.uniquePcs)} |`);
  }
  lines.push('');

  lines.push('### GetCSC Dispatch Window');
  lines.push('');
  if (!details.dispatchWindow.sawGetCSC) {
    lines.push('GetCSC was never reached.');
  } else {
    lines.push(`- Next known routine after GetCSC: ${details.dispatchWindow.nextKnownRoutine || '(none within trace)'}${details.dispatchWindow.nextKnownPc !== null ? ` @ \`${hex(details.dispatchWindow.nextKnownPc)}\`` : ''}`);
    lines.push(`- Unique unknown PCs between GetCSC and the next known routine: ${details.dispatchWindow.between.length}`);
    if (details.dispatchWindow.between.length > 0) {
      for (let i = 0; i < details.dispatchWindow.between.length; i++) {
        lines.push(`${i + 1}. \`${hex(details.dispatchWindow.between[i])}\``);
      }
    } else {
      lines.push('- No unknown PCs appeared between GetCSC and the next known routine.');
    }
  }
  lines.push('');

  lines.push('### Dynamic Targets');
  lines.push('');
  if (details.dynamicTargets.length === 0) {
    lines.push('(none)');
  } else {
    for (const entry of details.dynamicTargets) {
      lines.push(`- step=${entry.step} from=${hex(entry.fromPc)} target=${hex(entry.target)}`);
    }
  }
  lines.push('');

  lines.push('### Missing Blocks');
  lines.push('');
  if (details.missingBlocks.length === 0) {
    lines.push('(none)');
  } else {
    for (const block of details.missingBlocks) {
      lines.push(`- ${block}`);
    }
  }
  lines.push('');

  lines.push('### First 200 Unique PCs');
  lines.push('');
  const first200 = details.uniquePcList.slice(0, 200);
  for (let i = 0; i < first200.length; i++) {
    const pc = first200[i];
    const routine = classifyPc(pc);
    lines.push(`${i + 1}. \`${hex(pc)}\`${routine ? ` (${routine})` : ''}`);
  }
  lines.push('');

  lines.push('### cxMain..cxCurApp Read Summary');
  lines.push('');
  lines.push(`- Total read events: ${details.cxReadLog.length}`);
  if (details.cxReadLog.length > 0) {
    lines.push('- Reads by field:');
    for (const [field, count] of [...details.cxReadSummary.byField.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`  - ${field}: ${count}`);
    }
    lines.push('- Reads by starting address:');
    for (const [addr, count] of [...details.cxReadSummary.byAddr.entries()].sort((a, b) => a[0] - b[0])) {
      lines.push(`  - ${hex(addr)}: ${count}`);
    }
  }
  lines.push('');

  lines.push('### cxMain..cxCurApp Raw Read Log');
  lines.push('');
  if (details.cxReadLog.length === 0) {
    lines.push('(none)');
  } else {
    for (let i = 0; i < details.cxReadLog.length; i++) {
      const read = details.cxReadLog[i];
      const fields = read.fields.length > 0 ? read.fields.join(', ') : '(unmapped)';
      lines.push(`${i + 1}. step=${read.step} pc=${hex(read.pc)} ${read.kind} addr=${hex(read.addr)} value=${read.valueHex} bytes=[${read.bytesHex}] fields=${fields}`);
    }
  }
  lines.push('');

  lines.push('## Final State');
  lines.push('');
  lines.push(`- errNo: \`${hex(details.finalErrNo, 2)}\``);
  lines.push(`- errSP: \`${hex(details.finalErrSp)}\``);
  lines.push(`- OP1 bytes @ \`${hex(OP1_ADDR)}\`: \`${details.finalOp1Hex}\``);
  lines.push(`- Pointer snapshot: ${formatPointerSnapshot(details.postCoormonPointers)}`);
  lines.push(`- cx context snapshot: ${formatCxContextSnapshot(details.postCoormonCx)}`);
  lines.push('');

  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText, transcript) {
  const lines = [
    `# ${REPORT_TITLE} FAILED`,
    '',
    '## Console Output',
    '',
    '```text',
    ...transcript,
    '```',
    '',
    '## Error',
    '',
    '```text',
    ...String(errorText).split(/\r?\n/),
    '```',
  ];

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    const text = String(line);
    transcript.push(text);
    console.log(text);
  };

  log('=== Phase 25AE: CoorMon Home-Screen Dispatch Probe ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  const postBootPointers = snapshotPointers(mem);
  const postBootCx = snapshotCxContext(mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);
  log(`post-boot cx context: ${formatCxContextSnapshot(postBootCx)}`);

  log('\n=== STAGE 1: MEM_INIT ===');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let memInitTermination = 'unknown';
  let memInitSteps = 0;
  let memInitReturnHit = false;

  try {
    const result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xffffff;
        if (typeof step === 'number') memInitSteps = Math.max(memInitSteps, step + 1);
        if (norm === MEMINIT_RET) throw new Error('__RETURN__');
      },
      onMissingBlock(pc, _mode, step) {
        const norm = pc & 0xffffff;
        if (typeof step === 'number') memInitSteps = Math.max(memInitSteps, step + 1);
        if (norm === MEMINIT_RET) throw new Error('__RETURN__');
      },
    });
    memInitTermination = result.termination ?? 'unknown';
    memInitSteps = Math.max(memInitSteps, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN__') {
      memInitReturnHit = true;
      memInitTermination = 'return_hit';
    } else {
      throw error;
    }
  }

  const postMemInitPointers = snapshotPointers(mem);
  const postMemInitCx = snapshotCxContext(mem);
  log(`MEM_INIT: returned=${memInitReturnHit} term=${memInitTermination} steps=${memInitSteps}`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMemInitPointers)}`);
  log(`post-MEM_INIT cx context: ${formatCxContextSnapshot(postMemInitCx)}`);

  if (!memInitReturnHit) {
    writeReport({
      transcript,
      bootResult,
      postBootPointers,
      postBootCx,
      memInitReturnHit,
      memInitTermination,
      memInitSteps,
      postMemInitPointers,
      postMemInitCx,
    });
    process.exitCode = 1;
    return;
  }

  log('\n=== STAGE 2: Seed Keyboard + cxCurApp ===');
  peripherals.keyboard.keyMatrix[1] = 0xfe;
  mem[KBD_SCAN_CODE_ADDR] = SK_ENTER;
  mem[KBD_FLAGS_ADDR] |= (1 << 3);
  mem[KBD_FLAGS_ADDR] |= (1 << 4);
  mem[KBD_KEY_ADDR] = 0x05;
  mem[KBD_GETKY_ADDR] = 0x05;

  const cxCurAppBeforeSeed = read16(mem, CX_CUR_APP_ADDR);
  mem[CX_CUR_APP_ADDR] = HOME_SCREEN_APP_ID;
  mem[CX_CUR_APP_ADDR + 1] = 0x00;

  const preCoorMonCx = snapshotCxContext(mem);

  log(`keyMatrix[1]=${hex(peripherals.keyboard.keyMatrix[1], 2)} (ENTER pressed)`);
  log(`kbdScanCode=${hex(mem[KBD_SCAN_CODE_ADDR], 2)} kbdFlags=${hex(mem[KBD_FLAGS_ADDR], 2)} kbdKey=${hex(mem[KBD_KEY_ADDR], 2)} kbdGetKy=${hex(mem[KBD_GETKY_ADDR], 2)}`);
  log(`cxCurApp before seed=${hex(cxCurAppBeforeSeed, 4)} after seed=${hex(preCoorMonCx.cxCurApp, 4)}`);
  log(`pre-CoorMon cx context: ${formatCxContextSnapshot(preCoorMonCx)}`);

  log('\n=== STAGE 3: CoorMon ===');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, COORMON_RET);

  const pcTrace = [];
  const pcCounts = new Map();
  const routineHits = new Map();
  const uniquePcList = [];
  const seenPcs = new Set();
  const dynamicTargets = [];
  let coormonSteps = 0;
  let coormonTermination = 'unknown';
  let coormonReturnHit = false;
  let coormonFinalPc = 0;
  let coormonMissingBlock = false;
  let coormonLoopsForced = 0;
  const traceState = { currentStep: 0 };
  const cxTracer = installCxReadTracer(cpu, mem, traceState);

  const recordPc = (pc, step) => {
    const norm = pc & 0xffffff;
    traceState.currentStep = typeof step === 'number' ? step : traceState.currentStep;
    if (typeof step === 'number') coormonSteps = Math.max(coormonSteps, step + 1);
    coormonFinalPc = norm;

    pcTrace.push(norm);
    pcCounts.set(norm, (pcCounts.get(norm) || 0) + 1);

    if (!seenPcs.has(norm)) {
      seenPcs.add(norm);
      uniquePcList.push(norm);
    }

    const routine = classifyPc(norm);
    if (routine) {
      const stats = getRoutineStats(routineHits, routine);
      stats.count++;
      stats.uniquePcs.add(norm);
      if (stats.firstHits.length < 50) stats.firstHits.push({ pc: norm, step });
    }

    if (norm === COORMON_RET) throw new Error('__RETURN__');
    if (norm === FAKE_RET || norm === 0xffffff) throw new Error('__MISSING_BLOCK__');
  };

  try {
    const result = executor.runFrom(COORMON_ENTRY, 'adl', {
      maxSteps: COORMON_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        recordPc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        coormonMissingBlock = true;
        recordPc(pc, step);
      },
      onDynamicTarget(target, _mode, fromPc, step) {
        dynamicTargets.push({
          step,
          fromPc: fromPc & 0xffffff,
          target: target & 0xffffff,
        });
      },
    });
    coormonTermination = result.termination ?? 'unknown';
    coormonSteps = Math.max(coormonSteps, result.steps ?? 0);
    coormonLoopsForced = result.loopsForced ?? 0;
    for (const block of result.missingBlocks ?? []) {
      if (!pcTrace.includes(block)) {
        // no-op: raw block keys are kept from result for reporting only
      }
    }
  } catch (error) {
    if (error?.message === '__RETURN__') {
      coormonReturnHit = true;
      coormonTermination = 'return_hit';
    } else if (error?.message === '__MISSING_BLOCK__') {
      coormonTermination = 'missing_block';
      coormonMissingBlock = true;
    } else {
      cxTracer.restore();
      throw error;
    }
  }

  cxTracer.restore();

  const postCoormonPointers = snapshotPointers(mem);
  const postCoormonCx = snapshotCxContext(mem);
  const dispatchWindow = findDispatchWindowAfterGetCSC(pcTrace);
  const cxReadSummary = summarizeCxReadCounts(cxTracer.reads);

  const resultMeta = executor.runFrom ? null : null;
  void resultMeta;

  log(`CoorMon: term=${coormonTermination} steps=${coormonSteps} finalPc=${hex(coormonFinalPc)}`);
  log(`CoorMon: returned=${coormonReturnHit} missingBlock=${coormonMissingBlock} loopsForced=${coormonLoopsForced}`);
  log(`CoorMon: unique PCs visited=${uniquePcList.length}`);
  log(`post-CoorMon pointers: ${formatPointerSnapshot(postCoormonPointers)}`);
  log(`post-CoorMon cx context: ${formatCxContextSnapshot(postCoormonCx)}`);
  log(`GetCSC exact count=${pcCounts.get(GETCSC_ADDR) || 0} ParseInp exact count=${pcCounts.get(PARSEINP_ADDR) || 0}`);
  log(`cxMain..cxCurApp reads=${cxTracer.reads.length}`);

  const coormonResult = executor.runFrom(COORMON_ENTRY, 'adl', { maxSteps: 0 });
  void coormonResult;

  writeReport({
    transcript,
    bootResult,
    postBootPointers,
    postBootCx,
    memInitReturnHit,
    memInitTermination,
    memInitSteps,
    postMemInitPointers,
    postMemInitCx,
    keyboardSeed: {
      keyMatrix1: peripherals.keyboard.keyMatrix[1] & 0xff,
      scanCode: mem[KBD_SCAN_CODE_ADDR] & 0xff,
      flags: mem[KBD_FLAGS_ADDR] & 0xff,
      key: mem[KBD_KEY_ADDR] & 0xff,
      getKy: mem[KBD_GETKY_ADDR] & 0xff,
    },
    cxCurAppBeforeSeed,
    preCoorMonCx,
    coormonTermination,
    coormonSteps,
    coormonReturnHit,
    coormonMissingBlock,
    coormonLoopsForced,
    coormonFinalPc,
    uniquePcList,
    pcCounts,
    routineHits,
    dispatchWindow,
    dynamicTargets,
    missingBlocks: [],
    cxReadLog: cxTracer.reads,
    cxReadSummary,
    postCoormonPointers,
    postCoormonCx,
    parseInpReached: seenPcs.has(PARSEINP_ADDR),
    jtSlotsCalled: Boolean(routineHits.get('JT_Slots')?.count),
    finalErrNo: mem[ERR_NO_ADDR] & 0xff,
    finalErrSp: read24(mem, ERR_SP_ADDR),
    finalOp1Hex: hexBytes(mem, OP1_ADDR, 9),
  });

  log(`report=${REPORT_PATH}`);
  process.exitCode = 0;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  console.error(message);
  writeFailureReport(message, String(message).split(/\r?\n/));
  process.exitCode = 1;
}
