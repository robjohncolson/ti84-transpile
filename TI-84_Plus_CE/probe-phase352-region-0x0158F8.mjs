#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const REGIONS = [
  {
    label: 'Boot-reached region',
    start: 0x0158F8,
    end: 0x015980,
    note: 'Phase 351 reached this window by step 464. It overlaps the 0x015930 scanner-wrapper family.',
  },
  {
    label: 'Deep-init block A',
    start: 0x005B00,
    end: 0x005B40,
    note: 'This sits just before the known 0x005B96 VRAM-fill primitive and the 0x005BB1 LCD re-init entry.',
  },
  {
    label: 'Deep-init block B',
    start: 0x005E00,
    end: 0x005E40,
    note: 'This sits inside the known 0x005BB1..0x0060F6 LCD re-init / SPI tail range.',
  },
];

const MODES = ['adl', 'z80'];

const KNOWN_TARGET_NOTES = new Map([
  [0x000066, 'NMI vector / crash handler'],
  [0x0059C6, 'single-character draw routine'],
  [0x0059E9, 'text/string walker'],
  [0x0060F7, 'LCD SPI helper: send register index / command byte'],
  [0x0060FA, 'LCD SPI helper: send LCD data byte'],
  [0x0158DE, 'hardware settle delay'],
  [0x015930, 'scanner wrapper / pre-NMI gate'],
]);

const KNOWN_PORT_NOTES = new Map([
  [0x06, 'low-level control / flash-style port (bit 2 toggled by wrappers)'],
  [0x24, 'wrapper selector port used by scanner/error helpers'],
  [0x28, 'PLL / status handshake port'],
  [0x5004, 'interrupt/SPI-related control byte'],
  [0x500C, 'interrupt/SPI-related control byte'],
  [0xD018, 'LCD SPI data port'],
]);

function hex(value, width = 6) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  if (!Number.isFinite(value)) {
    return 'n/a';
  }
  return `${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function hexAddr(value) {
  return hex(value, value > 0xFFFF ? 6 : 4);
}

function hexPort(value) {
  return hex(value, value > 0xFF ? 4 : 2);
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ${text}` : text;
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${String(indexRegister).toUpperCase()}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) {
    return 'db ??';
  }

  switch (inst.tag) {
    case 'adc-pair':
      return withModePrefix(inst, `adc hl, ${String(inst.src).toUpperCase()}`);
    case 'add-pair':
      return withModePrefix(inst, `add ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`);
    case 'alu-imm': {
      const op = String(inst.op).toLowerCase();
      if (op === 'add' || op === 'adc' || op === 'sbc') {
        return withModePrefix(inst, `${op} a, ${hex(inst.value, 2)}`);
      }
      return withModePrefix(inst, `${op} ${hex(inst.value, 2)}`);
    }
    case 'alu-reg': {
      const op = String(inst.op).toLowerCase();
      if (op === 'add' || op === 'adc' || op === 'sbc') {
        return withModePrefix(inst, `${op} a, ${String(inst.src).toLowerCase()}`);
      }
      return withModePrefix(inst, `${op} ${String(inst.src).toLowerCase()}`);
    }
    case 'bit-res':
      return withModePrefix(inst, `res ${inst.bit}, ${String(inst.reg).toLowerCase()}`);
    case 'bit-set':
      return withModePrefix(inst, `set ${inst.bit}, ${String(inst.reg).toLowerCase()}`);
    case 'bit-test':
      return withModePrefix(inst, `bit ${inst.bit}, ${String(inst.reg).toLowerCase()}`);
    case 'bit-test-ind':
      return withModePrefix(inst, `bit ${inst.bit}, (${String(inst.indirectRegister).toLowerCase()})`);
    case 'call':
      return withModePrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `call ${String(inst.condition).toLowerCase()}, ${hex(inst.target)}`);
    case 'ccf':
    case 'cpl':
    case 'daa':
    case 'di':
    case 'ei':
    case 'ex-af':
    case 'ex-de-hl':
    case 'ex-sp-hl':
    case 'exx':
    case 'halt':
    case 'ld-sp-hl':
    case 'neg':
    case 'nop':
    case 'ret':
    case 'rla':
    case 'rlca':
    case 'rra':
    case 'rrca':
    case 'rsmix':
    case 'scf':
    case 'stmix':
      return withModePrefix(inst, inst.tag.toLowerCase());
    case 'dec-pair':
      return withModePrefix(inst, `dec ${String(inst.pair).toLowerCase()}`);
    case 'dec-reg':
      return withModePrefix(inst, `dec ${String(inst.reg).toLowerCase()}`);
    case 'djnz':
      return withModePrefix(inst, `djnz ${hex(inst.target)}`);
    case 'im':
      return withModePrefix(inst, `im ${inst.value}`);
    case 'in-imm':
      return withModePrefix(inst, `in a, (${hexPort(inst.port)})`);
    case 'in-reg':
      return withModePrefix(inst, `in ${String(inst.reg).toLowerCase()}, (c)`);
    case 'in0':
      return withModePrefix(inst, `in0 ${String(inst.reg).toLowerCase()}, (${hexPort(inst.port)})`);
    case 'inc-pair':
      return withModePrefix(inst, `inc ${String(inst.pair).toLowerCase()}`);
    case 'inc-reg':
      return withModePrefix(inst, `inc ${String(inst.reg).toLowerCase()}`);
    case 'indexed-cb-bit':
      return withModePrefix(inst, `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withModePrefix(inst, `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-rotate':
      return withModePrefix(inst, `${String(inst.operation).toLowerCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withModePrefix(inst, `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'jp':
      return withModePrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `jp ${String(inst.condition).toLowerCase()}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withModePrefix(inst, `jp (${String(inst.indirectRegister).toLowerCase()})`);
    case 'jr':
      return withModePrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `jr ${String(inst.condition).toLowerCase()}, ${hex(inst.target)}`);
    case 'ld-ind-imm':
      return withModePrefix(inst, `ld (hl), ${hex(inst.value, 2)}`);
    case 'ld-ind-pair':
      return withModePrefix(inst, `ld (${String(inst.dest).toLowerCase()}), ${String(inst.pair).toLowerCase()}`);
    case 'ld-ind-reg':
      return withModePrefix(inst, `ld (${String(inst.dest).toLowerCase()}), ${String(inst.src).toLowerCase()}`);
    case 'ld-ixd-reg':
      return withModePrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toLowerCase()}`);
    case 'ld-mem-pair':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${String(inst.pair).toLowerCase()}`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${String(inst.src).toLowerCase()}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `ld ${String(inst.pair).toLowerCase()}, ${hex(inst.value)}`);
    case 'ld-pair-indexed':
      return withModePrefix(inst, `ld ${String(inst.pair).toLowerCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-pair-ind':
      return withModePrefix(inst, `ld ${String(inst.pair).toLowerCase()}, (${String(inst.src).toLowerCase()})`);
    case 'ld-pair-mem': {
      if (inst.direction === 'to-mem') {
        return withModePrefix(inst, `ld (${hex(inst.addr)}), ${String(inst.pair).toLowerCase()}`);
      }
      return withModePrefix(inst, `ld ${String(inst.pair).toLowerCase()}, (${hex(inst.addr)})`);
    }
    case 'ld-reg-imm':
      return withModePrefix(inst, `ld ${String(inst.dest).toLowerCase()}, ${hex(inst.value, 2)}`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `ld ${String(inst.dest).toLowerCase()}, (${String(inst.src).toLowerCase()})`);
    case 'ld-reg-ixd':
      return withModePrefix(inst, `ld ${String(inst.dest).toLowerCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-reg-mem':
      return withModePrefix(inst, `ld ${String(inst.dest).toLowerCase()}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `ld ${String(inst.dest).toLowerCase()}, ${String(inst.src).toLowerCase()}`);
    case 'out-imm':
      return withModePrefix(inst, `out (${hexPort(inst.port)}), a`);
    case 'out-reg':
      return withModePrefix(inst, `out (c), ${String(inst.reg).toLowerCase()}`);
    case 'out0':
      return withModePrefix(inst, `out0 (${hexPort(inst.port)}), ${String(inst.reg).toLowerCase()}`);
    case 'pop':
      return withModePrefix(inst, `pop ${String(inst.pair).toLowerCase()}`);
    case 'push':
      return withModePrefix(inst, `push ${String(inst.pair).toLowerCase()}`);
    case 'ret-conditional':
      return withModePrefix(inst, `ret ${String(inst.condition).toLowerCase()}`);
    case 'rotate-ind':
      return withModePrefix(inst, `${String(inst.op).toLowerCase()} (${String(inst.indirectRegister).toLowerCase()})`);
    case 'rotate-reg':
      return withModePrefix(inst, `${String(inst.op).toLowerCase()} ${String(inst.reg).toLowerCase()}`);
    case 'rst':
      return withModePrefix(inst, `rst ${hexPort(inst.target)}`);
    case 'sbc-pair':
      return withModePrefix(inst, `sbc hl, ${String(inst.src).toLowerCase()}`);
    default: {
      const ignored = new Set([
        'fallthrough',
        'kind',
        'length',
        'mode',
        'modePrefix',
        'nextMode',
        'nextPc',
        'pc',
        'targetMode',
        'terminates',
      ]);
      const parts = [];
      for (const [key, value] of Object.entries(inst ?? {})) {
        if (key === 'tag' || ignored.has(key) || value === undefined || value === null) {
          continue;
        }
        if (typeof value === 'number') {
          parts.push(`${key}=${hex(value)}`);
        } else {
          parts.push(`${key}=${value}`);
        }
      }
      return withModePrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : String(inst.tag));
    }
  }
}

function isControlTransfer(inst) {
  return Boolean(inst && typeof inst.target === 'number' && (
    inst.tag === 'call'
    || inst.tag === 'call-conditional'
    || inst.tag === 'jp'
    || inst.tag === 'jp-conditional'
    || inst.tag === 'jr'
    || inst.tag === 'jr-conditional'
    || inst.tag === 'djnz'
    || inst.tag === 'rst'
  ));
}

function isBackwardBranch(inst, pc) {
  return isControlTransfer(inst) && inst.target < pc;
}

function isPortRead(inst) {
  return Boolean(inst && (
    inst.tag === 'in-imm'
    || inst.tag === 'in-reg'
    || inst.tag === 'in0'
  ));
}

function lookupPortNote(port) {
  return KNOWN_PORT_NOTES.get(port) ?? null;
}

function lookupTargetNote(target) {
  return KNOWN_TARGET_NOTES.get(target) ?? null;
}

function extractD0Refs(inst) {
  const refs = [];
  if (!inst) {
    return refs;
  }
  if (typeof inst.addr === 'number' && inst.addr >= 0xD00000 && inst.addr <= 0xD0FFFF) {
    refs.push({
      kind: 'direct',
      addr: inst.addr >>> 0,
      text: `${formatInstruction(inst)} -> ${hex(inst.addr)}`,
    });
  }
  if (inst.tag === 'ld-pair-imm' && typeof inst.value === 'number' && inst.value >= 0xD00000 && inst.value <= 0xD0FFFF) {
    refs.push({
      kind: 'pointer',
      addr: inst.value >>> 0,
      text: `${String(inst.pair).toLowerCase()} <= ${hex(inst.value)}`,
    });
  }
  return refs;
}

function createRegisterTracker() {
  return {
    b: null,
    c: null,
  };
}

function setBC(tracker, value) {
  const low16 = value & 0xFFFF;
  tracker.b = (low16 >>> 8) & 0xFF;
  tracker.c = low16 & 0xFF;
}

function updateTracker(tracker, inst) {
  if (!inst) {
    return;
  }
  if (inst.tag === 'ld-pair-imm' && String(inst.pair).toLowerCase() === 'bc' && typeof inst.value === 'number') {
    setBC(tracker, inst.value);
    return;
  }
  if (inst.tag === 'ld-reg-imm') {
    const dest = String(inst.dest).toLowerCase();
    if (dest === 'b') tracker.b = inst.value & 0xFF;
    if (dest === 'c') tracker.c = inst.value & 0xFF;
    return;
  }
  if (inst.tag === 'ld-reg-reg') {
    const dest = String(inst.dest).toLowerCase();
    const src = String(inst.src).toLowerCase();
    if (dest === 'b') tracker.b = src === 'c' ? tracker.c : null;
    if (dest === 'c') tracker.c = src === 'b' ? tracker.b : null;
    return;
  }
  if (inst.tag === 'inc-pair' && String(inst.pair).toLowerCase() === 'bc' && tracker.b !== null && tracker.c !== null) {
    const next = (((tracker.b << 8) | tracker.c) + 1) & 0xFFFF;
    setBC(tracker, next);
    return;
  }
  if (inst.tag === 'dec-pair' && String(inst.pair).toLowerCase() === 'bc' && tracker.b !== null && tracker.c !== null) {
    const next = (((tracker.b << 8) | tracker.c) - 1) & 0xFFFF;
    setBC(tracker, next);
    return;
  }
  if (inst.tag === 'inc-reg') {
    const reg = String(inst.reg).toLowerCase();
    if (reg === 'b' && tracker.b !== null) tracker.b = (tracker.b + 1) & 0xFF;
    if (reg === 'c' && tracker.c !== null) tracker.c = (tracker.c + 1) & 0xFF;
    return;
  }
  if (inst.tag === 'dec-reg') {
    const reg = String(inst.reg).toLowerCase();
    if (reg === 'b' && tracker.b !== null) tracker.b = (tracker.b - 1) & 0xFF;
    if (reg === 'c' && tracker.c !== null) tracker.c = (tracker.c - 1) & 0xFF;
  }
}

function inferPort(inst, tracker) {
  if (!inst) {
    return null;
  }

  if (
    (inst.tag === 'in-imm' || inst.tag === 'out-imm' || inst.tag === 'in0' || inst.tag === 'out0')
    && typeof inst.port === 'number'
  ) {
    return {
      port: inst.port >>> 0,
      explicit: true,
    };
  }

  if ((inst.tag === 'in-reg' || inst.tag === 'out-reg') && tracker.c !== null) {
    if (tracker.b !== null) {
      return {
        port: (((tracker.b & 0xFF) << 8) | (tracker.c & 0xFF)) >>> 0,
        explicit: false,
      };
    }
    return {
      port: tracker.c & 0xFF,
      explicit: false,
    };
  }

  return null;
}

function decodeRegion(romBytes, decodeInstruction, region, mode) {
  const tracker = createRegisterTracker();
  const rows = [];
  let decodeErrors = 0;

  for (let pc = region.start; pc < region.end;) {
    let inst = null;
    let length = 1;
    let text = '';
    let bytes = '';
    let error = null;

    try {
      inst = decodeInstruction(romBytes, pc, mode);
      length = Math.max(1, inst?.length ?? 1);
      text = formatInstruction(inst);
    } catch (caught) {
      error = caught;
      decodeErrors += 1;
      inst = null;
      length = 1;
      text = `db ${hexPort(romBytes[pc] ?? 0)}  ; decode error: ${caught.message}`;
    }

    bytes = hexBytes(romBytes, pc, length);
    const portInfo = inferPort(inst, tracker);
    const d0Refs = extractD0Refs(inst);

    rows.push({
      pc,
      inst,
      length,
      bytes,
      text,
      error,
      portInfo,
      d0Refs,
      crossesWindow: pc + length > region.end,
    });

    updateTracker(tracker, inst);
    pc += length;
  }

  return {
    mode,
    rows,
    decodeErrors,
    analysis: analyzeRows(rows),
  };
}

function analyzeRows(rows) {
  const ports = new Map();
  const targets = new Map();
  const d0Refs = [];
  const selfLoops = [];
  const backwardBranches = [];
  let hasHalt = false;

  for (const row of rows) {
    const { inst, portInfo } = row;
    if (portInfo) {
      const key = portInfo.port >>> 0;
      if (!ports.has(key)) {
        ports.set(key, {
          port: key,
          note: lookupPortNote(key),
          seenAt: [],
          explicit: portInfo.explicit,
        });
      }
      ports.get(key).seenAt.push(row.pc);
    }

    if (isControlTransfer(inst)) {
      const key = inst.target >>> 0;
      if (!targets.has(key)) {
        targets.set(key, {
          target: key,
          note: lookupTargetNote(key),
          tags: new Set(),
          seenAt: [],
        });
      }
      const targetInfo = targets.get(key);
      targetInfo.tags.add(inst.tag);
      targetInfo.seenAt.push(row.pc);

      if (inst.target === row.pc) {
        selfLoops.push({
          pc: row.pc,
          text: row.text,
        });
      }

      if (isBackwardBranch(inst, row.pc)) {
        backwardBranches.push({
          pc: row.pc,
          target: inst.target >>> 0,
          text: row.text,
        });
      }
    }

    if (inst?.tag === 'halt') {
      hasHalt = true;
    }

    for (const ref of row.d0Refs) {
      d0Refs.push({
        ...ref,
        pc: row.pc,
      });
    }
  }

  return {
    ports: Array.from(ports.values()),
    targets: Array.from(targets.values()).map((entry) => ({
      ...entry,
      tags: Array.from(entry.tags.values()).sort(),
    })),
    d0Refs,
    hasHalt,
    selfLoops,
    backwardBranches,
    pollingPatterns: detectPollingPatterns(rows),
  };
}

function detectPollingPatterns(rows) {
  const patterns = [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (!isPortRead(row.inst)) {
      continue;
    }

    for (let lookahead = index + 1; lookahead <= Math.min(index + 3, rows.length - 1); lookahead += 1) {
      const candidate = rows[lookahead];
      const inst = candidate.inst;
      if (!inst) {
        continue;
      }

      if (
        (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz')
        && typeof inst.target === 'number'
        && inst.target <= row.pc
      ) {
        patterns.push({
          startPc: row.pc,
          branchPc: candidate.pc,
          target: inst.target >>> 0,
          text: `${row.text} ... ${candidate.text}`,
        });
        break;
      }
    }
  }

  return patterns;
}

function scoreMode(result) {
  const analysis = result.analysis;
  const rows = result.rows;
  let score = 0;

  const directD0 = analysis.d0Refs.filter((ref) => ref.kind === 'direct').length;
  const pointerD0 = analysis.d0Refs.filter((ref) => ref.kind === 'pointer').length;
  const conditionalRets = rows.filter((row) => row.inst?.tag === 'ret-conditional').length;
  const nops = rows.filter((row) => row.inst?.tag === 'nop').length;

  score += directD0 * 4;
  score += pointerD0 * 2;
  score += analysis.ports.length * 2;
  score += analysis.targets.length;
  score += rows.filter((row) => row.inst).length * 0.05;
  score -= conditionalRets * 1.25;
  score -= nops * 0.2;
  score -= result.decodeErrors * 2;

  return score;
}

function pickPreferredMode(modeResults) {
  const ranked = modeResults
    .map((result) => ({ ...result, score: scoreMode(result) }))
    .sort((left, right) => right.score - left.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  if (!runnerUp) {
    return {
      mode: best.mode,
      reason: 'only one mode decoded',
      score: best.score,
    };
  }

  if (Math.abs(best.score - runnerUp.score) < 1.5) {
    return {
      mode: 'mixed',
      reason: 'both decodes are similarly plausible in this byte window',
      score: best.score,
    };
  }

  if (best.mode === 'adl' && best.analysis.d0Refs.length > runnerUp.analysis.d0Refs.length) {
    return {
      mode: 'adl',
      reason: 'ADL preserves the 24-bit D0xxxx RAM references that the z80 overlay fractures',
      score: best.score,
    };
  }

  if (best.mode === 'adl' && best.analysis.targets.length >= runnerUp.analysis.targets.length) {
    return {
      mode: 'adl',
      reason: 'ADL keeps the straight-line 24-bit call/jump structure tighter than the z80 overlay',
      score: best.score,
    };
  }

  if (best.mode === 'z80') {
    return {
      mode: 'z80',
      reason: 'z80 decode is materially cleaner in this window',
      score: best.score,
    };
  }

  return {
    mode: best.mode,
    reason: 'best overall coherence score',
    score: best.score,
  };
}

function classifyRegion(region, preferredResult) {
  const ports = new Set(preferredResult.analysis.ports.map((entry) => entry.port));
  const targets = new Set(preferredResult.analysis.targets.map((entry) => entry.target));
  const tags = new Set(preferredResult.rows.map((row) => row.inst?.tag).filter(Boolean));
  const sequentialStores = preferredResult.rows.filter((row) => row.inst?.tag === 'ld-ind-reg' || row.inst?.tag === 'ld-ind-imm').length;
  const directD0 = preferredResult.analysis.d0Refs.filter((ref) => ref.kind === 'direct');

  if (
    ports.has(0x24)
    && ports.has(0x28)
    && tags.has('rsmix')
    && tags.has('im')
  ) {
    const prefix = targets.has(0x0059C6) || targets.has(0x0059E9)
      ? 'Mixed region: front half is text/UI scratch work, then it enters '
      : '';
    const failHard = targets.has(0x000066)
      ? ' and can fail hard to the NMI vector 0x000066'
      : '';
    return `${prefix}the scanner-wrapper / interrupt-handoff path. This is not LCD panel init or timer setup; it disables interrupts, flips execution state, handshakes ports 0x24/0x06/0x28,${failHard}.`;
  }

  if (targets.has(0x0060F7) || targets.has(0x0060FA)) {
    return 'LCD panel initialization command stream. The repeated `ld a, imm ; call 0x0060F7/0x0060FA` pattern is a classic register-index / data-byte SPI script for the LCD controller.';
  }

  if (sequentialStores >= 8 && preferredResult.analysis.ports.length === 0 && directD0.length === 0) {
    return 'Memory-only pixel/VRAM helper. It synthesizes bytes in A and repeatedly splats them to `(hl)`, which fits framebuffer packing or a small fill primitive rather than MMIO bring-up.';
  }

  if (directD0.length > 0) {
    return 'OS-RAM scratch/helper code. The key signals here are direct D0xxxx variable accesses rather than MMIO-heavy initialization.';
  }

  return 'Unclear small helper. This window does not look like a large hardware-init body by itself.';
}

function printRawDump(romBytes, region) {
  console.log('Raw hex dump:');
  for (let offset = region.start; offset < region.end; offset += 16) {
    const length = Math.min(16, region.end - offset);
    console.log(`  ${hex(offset)}: ${hexBytes(romBytes, offset, length)}`);
  }
}

function printMode(result, preferredMode) {
  const preferredMark = preferredMode === result.mode ? '  <-- preferred decode' : '';
  console.log(`\n${result.mode.toUpperCase()} disassembly${preferredMark}`);
  console.log('-'.repeat(14 + result.mode.length + preferredMark.length));

  for (const row of result.rows) {
    const bytes = row.bytes.padEnd(18);
    const suffix = row.crossesWindow ? '  ; spans past window end' : '';
    console.log(`  ${hex(row.pc)}: ${bytes} ${row.text}${suffix}`);
  }

  const analysis = result.analysis;

  console.log('\n  Ports:');
  if (analysis.ports.length === 0) {
    console.log('    none');
  } else {
    for (const entry of analysis.ports) {
      const seen = entry.seenAt.map((pc) => hex(pc)).join(', ');
      const note = entry.note ? ` - ${entry.note}` : '';
      console.log(`    ${hexPort(entry.port)} at ${seen}${note}`);
    }
  }

  console.log('  CALL/JP targets:');
  if (analysis.targets.length === 0) {
    console.log('    none');
  } else {
    for (const entry of analysis.targets) {
      const seen = entry.seenAt.map((pc) => hex(pc)).join(', ');
      const tags = entry.tags.join('/');
      const note = entry.note ? ` - ${entry.note}` : '';
      console.log(`    ${hex(entry.target)} via ${tags} at ${seen}${note}`);
    }
  }

  console.log('  D0xxxx RAM references:');
  if (analysis.d0Refs.length === 0) {
    console.log('    none');
  } else {
    for (const ref of analysis.d0Refs) {
      console.log(`    ${hex(ref.pc)}: ${ref.text}`);
    }
  }

  console.log(`  HALT present: ${analysis.hasHalt ? 'yes' : 'no'}`);

  console.log('  JP/JR-to-self loops:');
  if (analysis.selfLoops.length === 0) {
    console.log('    none');
  } else {
    for (const loop of analysis.selfLoops) {
      console.log(`    ${hex(loop.pc)}: ${loop.text}`);
    }
  }

  console.log('  Conditional polling patterns:');
  if (analysis.pollingPatterns.length === 0) {
    console.log('    none seen in-window');
  } else {
    for (const pattern of analysis.pollingPatterns) {
      console.log(`    ${hex(pattern.startPc)} .. ${hex(pattern.branchPc)} -> ${hex(pattern.target)} : ${pattern.text}`);
    }
  }

  console.log('  Other backward branches:');
  if (analysis.backwardBranches.length === 0) {
    console.log('    none');
  } else {
    for (const branch of analysis.backwardBranches) {
      console.log(`    ${hex(branch.pc)} -> ${hex(branch.target)} : ${branch.text}`);
    }
  }
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);

console.log('Phase 352: Region decode around 0x0158F8');
console.log('=========================================');
console.log(`ROM:     ${ROM_PATH}`);
console.log(`Decoder: ${DECODER_PATH}`);
console.log(`Bytes:   ${romBytes.length.toLocaleString()}`);
console.log('');

const takeaways = [];

for (const region of REGIONS) {
  const modeResults = MODES.map((mode) => decodeRegion(romBytes, decodeInstruction, region, mode));
  const preferred = pickPreferredMode(modeResults);
  const preferredResult = preferred.mode === 'mixed'
    ? modeResults[0]
    : modeResults.find((entry) => entry.mode === preferred.mode) ?? modeResults[0];
  const verdict = classifyRegion(region, preferredResult);

  takeaways.push(`- ${region.label} ${hex(region.start)}..${hex(region.end - 1)}: ${verdict}`);

  console.log(`=== ${region.label} ${hex(region.start)}..${hex(region.end - 1)} (${region.end - region.start} bytes) ===`);
  console.log(region.note);
  console.log(`Quick read: ${verdict}`);
  console.log(`Mode fit:   ${preferred.mode.toUpperCase()} - ${preferred.reason}`);
  console.log('');

  printRawDump(romBytes, region);
  for (const result of modeResults) {
    printMode(result, preferred.mode);
  }
  console.log('');
}

console.log('High-level takeaways');
console.log('--------------------');
for (const line of takeaways) {
  console.log(line);
}
console.log('\n--- probe complete ---');
