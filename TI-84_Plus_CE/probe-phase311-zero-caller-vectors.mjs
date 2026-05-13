#!/usr/bin/env node

/**
 * Phase 311 Probe: Trace the 14 zero-caller jump vector table entries
 *
 * Session 309 mapped all 56 entries in the jump vector table at 0x000578.
 * 14 of these entries have ZERO direct CALL sites to the vector address.
 * This probe traces each one to determine why: computed jump, direct-target
 * calls bypassing the vector, dead code, or app-API-only usage.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Constants ────────────────────────────────────────────────────────

const TABLE_START = 0x000578;
const ENTRY_SIZE = 4;

// The 14 zero-caller indices (from session 309)
const ZERO_CALLER_INDICES = [1, 4, 32, 40, 45, 46, 47, 48, 49, 51, 52, 53, 54, 55];

// SDK names from ti84pceg.inc (vector address -> name)
const SDK_NAMES = {
  0x000578: 'CheckIfEmulated',
  0x00057C: 'boot.GetOnInt',
  0x000580: 'boot.RTCIntHandler',
  0x000584: 'boot.RTCInitialize',
  0x000588: 'boot.RTCGetInitStatus',
  0x00058C: 'boot.RTCEnable',
  0x000590: 'boot.RTCDisable',
  0x000594: 'boot.RTCSet24Hours',
  0x0005A0: 'boot.RTCAckAlarmInt',
  0x0005A8: 'boot.RTCWriteTime',
  0x0005AC: 'boot.RTCGetTime12Hour',
  0x0005B0: 'boot.RTCGetTime',
  0x0005B4: 'boot.RTCSetTime',
  0x0005B8: 'boot.RTCGetAlarm',
  0x0005BC: 'boot.RTCSetAlarmSafe',
  0x0005C0: 'boot.RTCCheckAlarmInt',
  0x0005C4: 'boot.RTCSetAlarmInt',
  0x0005C8: 'boot.RTCIsAfternoon',
  0x0005CC: 'boot.RTCGetDay',
  0x0005D0: 'boot.RTCSetAlarmIntSafe',
  0x0005D4: 'boot.RTCSetAlarm',
  0x0005D8: 'boot.RTCEnableInt',
  0x0005DC: 'boot.RTCDisableInt',
  0x0005E0: 'boot.RTCSetCallback',
  0x0005E4: 'boot.RTCResetTimeStruct',
  0x0005EC: 'boot.RTCSetFlags',
  0x0005F4: 'CheckEmulationBit',
  0x0005F8: 'usb_SetDMAAddress',
  0x000600: 'boot.SectorsBegin',
  0x000608: 'usb_InEndpointClrStall',
  0x00060C: 'usb_InEndpointSetStall',
  0x000610: 'usb_InEndpointClrReset',
  0x000614: 'usb_InEndpointSetReset',
  0x000618: 'usb_InEndpointSendZlp',
  0x00061C: 'usb_OutEndpointClrStall',
  0x000620: 'usb_OutEndpointSetStall',
  0x000624: 'usb_OutEndpointClrReset',
  0x000628: 'usb_OutEndpointSetReset',
  0x00062C: 'usb_SetFifoMap',
  0x000630: 'usb_SetEndpointConfig',
  0x000634: 'usb_ClrEndpointConfig',
  0x000638: 'usb_SetFifoConfig',
  0x00063C: '(unlabeled_63C)',
  0x000640: '(unlabeled_640)',
  0x000644: '(unlabeled_644)',
  0x000648: '(unlabeled_648)',
  0x00064C: '(unlabeled_64C)',
  0x000650: '(unlabeled_650)',
  0x000654: '(unlabeled_654)',
};

const KNOWN_TARGETS = {
  0x0158A6: 'CheckIfEmulated',
};

// ── Helpers ──────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, Math.min(addr + length, rom.length)))
    .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function formatInst(inst) {
  if (!inst) return '<decode error>';
  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'in-reg-port': return `IN ${inst.reg?.toUpperCase?.() || 'A'}, (${hex(inst.port || 0, 2)})`;
    case 'out-port-reg': return `OUT (${hex(inst.port || 0, 2)}), ${inst.reg?.toUpperCase?.() || 'A'}`;
    default:
      if (inst.dasm) return inst.dasm;
      return `[${inst.tag}]`;
  }
}

function disasmLinear(start, maxInstructions) {
  const lines = [];
  let pc = start;

  for (let i = 0; i < maxInstructions && pc < rom.length; i++) {
    let inst;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }

    if (!inst || !inst.length) {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }

    const text = formatInst(inst);
    const knownName = KNOWN_TARGETS[inst.target] ? ` ; ${KNOWN_TARGETS[inst.target]}` : '';
    lines.push({ addr: pc, bytes: bytesAt(pc, inst.length), text: text + knownName, inst });
    pc += inst.length;

    if (inst.tag === 'ret') break;
  }

  return lines;
}

function countCallersOf(targetAddr) {
  const b0 = targetAddr & 0xFF;
  const b1 = (targetAddr >> 8) & 0xFF;
  const b2 = (targetAddr >> 16) & 0xFF;
  let count = 0;

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
      count++;
    }
  }

  return count;
}

function countJPsTo(targetAddr) {
  const b0 = targetAddr & 0xFF;
  const b1 = (targetAddr >> 8) & 0xFF;
  const b2 = (targetAddr >> 16) & 0xFF;
  let count = 0;

  for (let i = 0; i < rom.length - 3; i++) {
    // JP unconditional = 0xC3, conditional JP = C2/CA/D2/DA/E2/EA/F2/FA
    const op = rom[i];
    const isJP = op === 0xC3 || (op & 0x07) === 0x02 && (op & 0xC0) === 0xC0;
    if (isJP && rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
      // Exclude the vector table entry itself
      if (i >= TABLE_START && i < TABLE_START + 56 * ENTRY_SIZE) continue;
      count++;
    }
  }

  return count;
}

function find3ByteRefs(targetAddr) {
  // Find ALL 3-byte LE references to targetAddr in ROM (not just CALL/JP)
  const b0 = targetAddr & 0xFF;
  const b1 = (targetAddr >> 8) & 0xFF;
  const b2 = (targetAddr >> 16) & 0xFF;
  const refs = [];

  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === b0 && rom[i + 1] === b1 && rom[i + 2] === b2) {
      // Skip the vector table entry itself
      if (i >= TABLE_START && i < TABLE_START + 56 * ENTRY_SIZE) continue;
      // Classify: what opcode precedes this?
      const prevByte = i > 0 ? rom[i - 1] : null;
      let refType = 'data';
      if (prevByte === 0xCD) refType = 'CALL';
      else if (prevByte === 0xC3) refType = 'JP';
      else if (prevByte !== null) {
        // Check for conditional JP/CALL
        if ((prevByte & 0x07) === 0x02 && (prevByte & 0xC0) === 0xC0) refType = 'JP-cond';
        if ((prevByte & 0x07) === 0x04 && (prevByte & 0xC0) === 0xC0) refType = 'CALL-cond';
        // Check for LD pair, imm24: 01/11/21/31
        if (prevByte === 0x01 || prevByte === 0x11 || prevByte === 0x21 || prevByte === 0x31) {
          refType = 'LD-pair-imm';
        }
      }
      refs.push({ addr: i - 1, refAddr: i, type: refType });
    }
  }

  return refs;
}

function printSection(title) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(title);
  console.log('='.repeat(80));
}

function printDisasm(lines) {
  for (const line of lines) {
    console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text}`);
  }
}

// ── Read vector table entries ────────────────────────────────────────

function readVectorEntry(idx) {
  const addr = TABLE_START + idx * ENTRY_SIZE;
  const opcode = rom[addr];
  const target = rom[addr + 1] | (rom[addr + 2] << 8) | (rom[addr + 3] << 16);
  const sdkName = SDK_NAMES[addr] || `(unknown_idx${idx})`;
  return { index: idx, addr, opcode, target, sdkName };
}

// ======================================================================
// MAIN
// ======================================================================

console.log('Phase 311: Zero-Caller Vector Table Entry Trace');
console.log(`Examining ${ZERO_CALLER_INDICES.length} entries with 0 CALL sites to vector address\n`);

const results = [];

for (const idx of ZERO_CALLER_INDICES) {
  const entry = readVectorEntry(idx);
  const callsToVector = countCallersOf(entry.addr);
  const jpsToVector = countJPsTo(entry.addr);
  const callsToTarget = countCallersOf(entry.target);
  const jpsToTarget = countJPsTo(entry.target);
  const allRefsToVector = find3ByteRefs(entry.addr);

  results.push({
    ...entry,
    callsToVector,
    jpsToVector,
    callsToTarget,
    jpsToTarget,
    allRefsToVector,
  });
}

// ======================================================================
// SECTION 1: Overview table
// ======================================================================

printSection('SECTION 1: Overview of all 14 zero-caller entries');

console.log();
console.log(
  '  Idx  Vector      SDK Name                      Target      ' +
  'CALLs(vec)  JPs(vec)  3-byte refs(vec)  CALLs(tgt)  JPs(tgt)'
);
console.log('  ' + '-'.repeat(120));

for (const r of results) {
  console.log(
    `  ${String(r.index).padStart(3)}  ${hex(r.addr)}  ${r.sdkName.padEnd(30)}${hex(r.target)}  ` +
    `${String(r.callsToVector).padStart(6)}      ` +
    `${String(r.jpsToVector).padStart(4)}      ` +
    `${String(r.allRefsToVector.length).padStart(8)}          ` +
    `${String(r.callsToTarget).padStart(4)}        ` +
    `${String(r.jpsToTarget).padStart(4)}`
  );
}

// ======================================================================
// SECTION 2: Detailed disassembly of each target
// ======================================================================

printSection('SECTION 2: Detailed disassembly of each target (up to 15 instructions or RET)');

for (const r of results) {
  console.log(`\n  --- [${r.index}] ${r.sdkName} ---`);
  console.log(`  Vector: ${hex(r.addr)} -> Target: ${hex(r.target)}`);
  console.log(`  CALLs to vector: ${r.callsToVector}  |  JPs to vector: ${r.jpsToVector}  |  3-byte refs to vector: ${r.allRefsToVector.length}`);
  console.log(`  CALLs to target: ${r.callsToTarget}  |  JPs to target: ${r.jpsToTarget}`);

  if (r.target >= rom.length) {
    console.log('    (target is beyond ROM bounds)');
    continue;
  }

  const lines = disasmLinear(r.target, 15);
  printDisasm(lines);
}

// ======================================================================
// SECTION 3: 3-byte reference details for entries with any refs
// ======================================================================

printSection('SECTION 3: 3-byte LE reference details (computed jumps / data refs to vector address)');

for (const r of results) {
  if (r.allRefsToVector.length === 0) continue;

  console.log(`\n  --- [${r.index}] ${r.sdkName} (${hex(r.addr)}) — ${r.allRefsToVector.length} refs ---`);

  for (const ref of r.allRefsToVector) {
    // Disassemble context around the reference
    const contextStart = Math.max(0, ref.addr - 4);
    console.log(`    ${hex(ref.refAddr)}: type=${ref.type}  bytes=${bytesAt(ref.addr, 8)}`);
  }
}

// ======================================================================
// SECTION 4: Special analysis for entries 51/52 (high direct-target callers)
// ======================================================================

printSection('SECTION 4: Entries 51 & 52 — high direct-target callers, 0 vector callers');

for (const r of results.filter((e) => e.index === 51 || e.index === 52)) {
  console.log(`\n  --- [${r.index}] ${r.sdkName} ---`);
  console.log(`  Vector ${hex(r.addr)} -> Target ${hex(r.target)}`);
  console.log(`  Direct CALLs to target: ${r.callsToTarget} | Direct JPs to target: ${r.jpsToTarget}`);
  console.log(`  CALLs/JPs to vector: ${r.callsToVector}/${r.jpsToVector}`);
  console.log();
  console.log('  Interpretation: All callers bypass the vector and call the target directly.');
  console.log('  The vector slot exists for ABI compatibility (apps/TI-Connect could use it)');
  console.log('  but the OS itself never routes through the vector address.');

  // Show first few direct callers to the target
  const b0 = r.target & 0xFF;
  const b1 = (r.target >> 8) & 0xFF;
  const b2 = (r.target >> 16) & 0xFF;
  const callerAddrs = [];

  for (let i = 0; i < rom.length - 3 && callerAddrs.length < 8; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === b0 && rom[i + 2] === b1 && rom[i + 3] === b2) {
      callerAddrs.push(i);
    }
  }

  if (callerAddrs.length > 0) {
    console.log(`\n  First ${callerAddrs.length} direct CALL sites to target ${hex(r.target)}:`);
    for (const addr of callerAddrs) {
      console.log(`    CALL at ${hex(addr)}`);
    }
  }
}

// ======================================================================
// SECTION 5: Entry 55 special analysis (CheckIfEmulated call)
// ======================================================================

printSection('SECTION 5: Entry 55 — calls CheckIfEmulated (0x0158A6)');

const entry55 = results.find((e) => e.index === 55);
if (entry55) {
  console.log(`\n  Vector ${hex(entry55.addr)} -> Target ${hex(entry55.target)}`);
  console.log(`  SDK name: ${entry55.sdkName}`);
  console.log();
  console.log('  Extended disassembly (25 instructions to see past CheckIfEmulated call):');

  const lines = disasmLinear(entry55.target, 25);
  printDisasm(lines);

  // Find the CALL to CheckIfEmulated and note what follows
  let foundCheck = false;
  for (const line of lines) {
    if (line.inst?.tag === 'call' && line.inst.target === 0x0158A6) {
      foundCheck = true;
      console.log(`\n  CheckIfEmulated call found at ${hex(line.addr)}`);
      console.log('  Post-call behavior determines: emulated vs. real hardware branch');
    }
  }

  if (!foundCheck) {
    console.log('\n  NOTE: CheckIfEmulated call not found in first 25 instructions.');
    console.log('  The call may be deeper in a subroutine or conditional path.');
  }
}

// ======================================================================
// SECTION 6: Categorized summary
// ======================================================================

printSection('SECTION 6: Categorized summary');

const categories = {
  'USB (known from phase 310)': [],
  'Boot / RTC': [],
  'App API (vector exists for ABI, OS bypasses)': [],
  'OS internal': [],
  'Dead / unreferenced': [],
};

for (const r of results) {
  const totalRefs = r.callsToVector + r.jpsToVector + r.allRefsToVector.length;
  const totalTargetRefs = r.callsToTarget + r.jpsToTarget;
  const name = r.sdkName;

  if (name.startsWith('usb_')) {
    categories['USB (known from phase 310)'].push(r);
  } else if (name.startsWith('boot.')) {
    categories['Boot / RTC'].push(r);
  } else if (totalRefs === 0 && totalTargetRefs > 10) {
    categories['App API (vector exists for ABI, OS bypasses)'].push(r);
  } else if (totalRefs === 0 && totalTargetRefs === 0) {
    categories['Dead / unreferenced'].push(r);
  } else {
    categories['OS internal'].push(r);
  }
}

for (const [cat, entries] of Object.entries(categories)) {
  if (entries.length === 0) continue;

  console.log(`\n  ${cat} (${entries.length}):`);

  for (const r of entries) {
    const totalRefs = r.callsToVector + r.jpsToVector + r.allRefsToVector.length;
    const totalTargetRefs = r.callsToTarget + r.jpsToTarget;
    console.log(
      `    [${String(r.index).padStart(2)}] ${r.sdkName.padEnd(30)} ` +
      `vec-refs=${totalRefs}  tgt-refs=${totalTargetRefs}`
    );
  }
}

// ======================================================================
// SECTION 7: Statistics
// ======================================================================

printSection('SECTION 7: Statistics');

const withVectorRefs = results.filter((r) => r.allRefsToVector.length > 0);
const withTargetCalls = results.filter((r) => r.callsToTarget > 0);
const trulyDead = results.filter((r) =>
  r.callsToVector === 0 && r.jpsToVector === 0 &&
  r.allRefsToVector.length === 0 && r.callsToTarget === 0 && r.jpsToTarget === 0
);

console.log(`
  Total zero-caller entries examined: ${results.length}
  Entries with non-CALL refs to vector address: ${withVectorRefs.length}
  Entries with direct calls to target (bypassing vector): ${withTargetCalls.length}
  Truly dead (no refs to vector OR target): ${trulyDead.length}
  ${trulyDead.length > 0 ? `  Dead indices: [${trulyDead.map((r) => r.index).join(', ')}]` : ''}
`);

console.log('Done.');
