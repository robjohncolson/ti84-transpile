#!/usr/bin/env node
/**
 * Phase 439
 *
 * Static ROM trace for the USB pipe-state companions:
 *   - D14080
 *   - D14082
 *   - D140B2
 *
 * The scan is intentionally phase-specific. It classifies direct ROM
 * references, infers obvious written values, reports the enclosing function
 * range or prologue marker, lists nearby D140xx/D141xx companions and port I/O,
 * and prints a summary tailored to the current USB-state mapping work.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');

if (!fs.existsSync(romPath)) {
  throw new Error(`Missing ROM image: ${romPath}`);
}

const rom = fs.readFileSync(romPath);
const ROM_SIZE = rom.length;

const TARGETS = [
  { name: 'D14080', addr: 0xD14080, baseAddr: 0xD14070, ixOffset: 0x10 },
  { name: 'D14082', addr: 0xD14082, baseAddr: 0xD14070, ixOffset: 0x12 },
  { name: 'D140B2', addr: 0xD140B2, baseAddr: 0xD14040, ixOffset: 0x72 },
];

const FUNCTION_RANGES = [
  { start: 0x00846E, end: 0x008526, label: '0x00846E USB/timer gate wrapper' },
  { start: 0x008BE9, end: 0x008D9F, label: '0x008BE9 P2 init priority' },
  { start: 0x0096CB, end: 0x0098D1, label: '0x0096CB non-initialized USB controller ISR' },
  { start: 0x0098D2, end: 0x009B34, label: '0x0098D2 masked-status service dispatcher' },
  { start: 0x00A84A, end: 0x00A8B9, label: '0x00A84A config-latch helper' },
  { start: 0x00A9A0, end: 0x00AA0E, label: '0x00A9A0 typed D140B2 classifier' },
  { start: 0x00C358, end: 0x00C4B3, label: '0x00C358 usb_DMACXWrite cluster' },
  { start: 0x00C9A0, end: 0x00CA59, label: '0x00C9A0 USB hard reset' },
  { start: 0x00EFA0, end: 0x00F3F3, label: '0x00EFA0 large USB state machine' },
  { start: 0x00FBD1, end: 0x00FD8F, label: '0x00FBD1 USB event demultiplexer' },
  { start: 0x012456, end: 0x012507, label: '0x012456 controller/link re-arm helper' },
  { start: 0x01270B, end: 0x012755, label: '0x01270B pre-service clear helper' },
  { start: 0x012756, end: 0x01275A, label: '0x012756 D14082 getter' },
  { start: 0x01276A, end: 0x0127E8, label: '0x01276A service helper A' },
  { start: 0x012E4D, end: 0x012F56, label: '0x012E4D follow-up sampler/reset helper' },
  { start: 0x012FD7, end: 0x013021, label: '0x012FD7 teardown helper' },
  { start: 0x02A10F, end: 0x02A263, label: '0x02A10F USB batch entry mirror' },
  { start: 0x02A808, end: 0x02AD62, label: '0x02A808 USB config/result cluster mirror' },
  { start: 0x02AE68, end: 0x02AEC6, label: '0x02AE68 typed D140B2 classifier mirror' },
  { start: 0x02B806, end: 0x02BF98, label: '0x02B806 large USB state machine mirror' },
  { start: 0x036D0C, end: 0x036DEF, label: '0x036D0C P2 init priority mirror' },
  { start: 0x041070, end: 0x0410C5, label: '0x041070 controller/link re-arm helper mirror' },
  { start: 0x0412E2, end: 0x04131F, label: '0x0412E2 pre-service clear helper mirror' },
  { start: 0x04132D, end: 0x041331, label: '0x04132D D14082 getter mirror' },
  { start: 0x04133A, end: 0x0413B8, label: '0x04133A service helper A mirror' },
  { start: 0x0413DB, end: 0x041467, label: '0x0413DB controller/link re-arm continuation mirror' },
  { start: 0x041A18, end: 0x041AFB, label: '0x041A18 follow-up sampler/reset helper mirror' },
  { start: 0x041B65, end: 0x041BC2, label: '0x041B65 teardown helper mirror' },
  { start: 0x049656, end: 0x049799, label: '0x049656 USB/timer gate wrapper mirror' },
];

const PORT_NAMES = new Map([
  [0x3010, 'USB/link control'],
  [0x3014, 'link interrupt status'],
  [0x3015, 'link interrupt source'],
  [0x3031, 'link ready / control'],
  [0x3040, 'link control'],
  [0x3080, 'USB controller control'],
  [0x3081, 'USB follow-up control'],
  [0x3082, 'live USB/link status'],
  [0x3100, 'USB controller CSR'],
  [0x3108, 'USB endpoint interrupt control'],
  [0x3114, 'USB interrupt enable'],
  [0x3120, 'USB FIFO control'],
  [0x313C, 'USB transfer control'],
  [0x313D, 'USB transfer status'],
  [0x314A, 'USB status shadow port A'],
  [0x314C, 'USB event register'],
  [0x314D, 'USB event register 2'],
  [0x31CB, 'USB endpoint config'],
  [0x5005, 'system interrupt controller'],
]);

const OPCODE_CLASSIFIERS = new Map([
  [0x01, { type: 'LOAD_ADDR', text: 'LD BC,nn' }],
  [0x11, { type: 'LOAD_ADDR', text: 'LD DE,nn' }],
  [0x21, { type: 'LOAD_ADDR', text: 'LD HL,nn' }],
  [0x31, { type: 'LOAD_ADDR', text: 'LD SP,nn' }],
  [0x22, { type: 'WRITE', text: 'LD (nn),HL' }],
  [0x2A, { type: 'READ', text: 'LD HL,(nn)' }],
  [0x32, { type: 'WRITE', text: 'LD (nn),A' }],
  [0x3A, { type: 'READ', text: 'LD A,(nn)' }],
  [0xC2, { type: 'JUMP/CALL', text: 'JP NZ,nn' }],
  [0xC3, { type: 'JUMP/CALL', text: 'JP nn' }],
  [0xC4, { type: 'JUMP/CALL', text: 'CALL NZ,nn' }],
  [0xCA, { type: 'JUMP/CALL', text: 'JP Z,nn' }],
  [0xCC, { type: 'JUMP/CALL', text: 'CALL Z,nn' }],
  [0xCD, { type: 'JUMP/CALL', text: 'CALL nn' }],
]);

const REG_BY_ED = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexDump(start, length) {
  const parts = [];
  for (let i = 0; i < length; i++) {
    const addr = start + i;
    parts.push(addr >= 0 && addr < ROM_SIZE ? hexByte(rom[addr]) : '??');
  }
  return parts.join(' ');
}

function getBank(addr) {
  if (addr < 0x020000) return 'bank 0x00';
  if (addr < 0x040000) return 'bank 0x02';
  if (addr < 0x060000) return 'bank 0x04';
  return `bank 0x${Math.floor(addr / 0x20000).toString(16).toUpperCase().padStart(2, '0')}`;
}

function classifyRawHit(addrPos, target) {
  const before = addrPos > 0 ? rom[addrPos - 1] : null;
  let instrAddr = addrPos - 1;
  let type = 'UNKNOWN';
  let detail = '';

  if (before != null && OPCODE_CLASSIFIERS.has(before)) {
    const entry = OPCODE_CLASSIFIERS.get(before);
    type = entry.type;
    detail = entry.text.replaceAll('nn', target.name);
  }

  if (addrPos >= 2) {
    const prefix = rom[addrPos - 2];
    if (prefix === 0xDD || prefix === 0xFD) {
      const reg = prefix === 0xDD ? 'IX' : 'IY';
      instrAddr = addrPos - 2;
      if (before === 0x21) {
        type = 'LOAD_ADDR';
        detail = `LD ${reg},${target.name}`;
      } else if (before === 0x22) {
        type = 'WRITE';
        detail = `LD (${target.name}),${reg}`;
      } else if (before === 0x2A) {
        type = 'READ';
        detail = `LD ${reg},(${target.name})`;
      }
    }
    if (prefix === 0xED) {
      instrAddr = addrPos - 2;
      if (before === 0x43) { type = 'WRITE'; detail = `LD (${target.name}),BC`; }
      else if (before === 0x53) { type = 'WRITE'; detail = `LD (${target.name}),DE`; }
      else if (before === 0x63) { type = 'WRITE'; detail = `LD (${target.name}),HL [ED]`; }
      else if (before === 0x73) { type = 'WRITE'; detail = `LD (${target.name}),SP`; }
      else if (before === 0x4B) { type = 'READ'; detail = `LD BC,(${target.name})`; }
      else if (before === 0x5B) { type = 'READ'; detail = `LD DE,(${target.name})`; }
      else if (before === 0x6B) { type = 'READ'; detail = `LD HL,(${target.name}) [ED]`; }
      else if (before === 0x7B) { type = 'READ'; detail = `LD SP,(${target.name})`; }
    }
  }

  return { addrPos, instrAddr, type, detail, rawBefore: before };
}

function inferWrittenValue(writeAddr, targetName) {
  if (targetName === 'D14080' && (writeAddr === 0x008D12 || writeAddr === 0x036D27)) {
    return { label: 'IX scratch -> 0/1 from D177B8==0x85 branch', exact: null };
  }

  for (let back = 1; back <= 28; back++) {
    const pos = writeAddr - back;
    if (pos < 0) break;
    const op = rom[pos];

    if (op === 0x3E && pos + 1 < ROM_SIZE) {
      return { label: `0x${rom[pos + 1].toString(16).toUpperCase().padStart(2, '0')}`, exact: rom[pos + 1] };
    }
    if (op === 0xAF || op === 0x97) {
      return { label: '0x00 (XOR/SUB A)', exact: 0 };
    }
    if (op === 0x3C) {
      return { label: 'INC A (derived nonzero)', exact: null };
    }
    if (op === 0x3D) {
      return { label: 'DEC A (derived value)', exact: null };
    }
    if (op === 0xDD && rom[pos + 1] === 0x7E) {
      return { label: 'IX scratch byte', exact: null };
    }
    if (op === 0xFD && rom[pos + 1] === 0x7E) {
      return { label: 'IY scratch byte', exact: null };
    }
    if ([0xC9, 0xC3, 0xCD, 0x18].includes(op)) {
      break;
    }
  }

  return { label: 'complex / unknown', exact: null };
}

function analyzeRead(readAddr) {
  const notes = [];
  for (let pos = readAddr + 4; pos <= Math.min(ROM_SIZE - 1, readAddr + 20); pos++) {
    const op = rom[pos];
    if (op === 0xB7) notes.push('OR A');
    if (op === 0xA7) notes.push('AND A');
    if (op === 0xFE && pos + 1 < ROM_SIZE) notes.push(`CP 0x${hexByte(rom[pos + 1])}`);
    if (op === 0xE6 && pos + 1 < ROM_SIZE) notes.push(`AND 0x${hexByte(rom[pos + 1])}`);

    if (op === 0x20) { notes.push('JR NZ'); break; }
    if (op === 0x28) { notes.push('JR Z'); break; }
    if (op === 0x30) { notes.push('JR NC'); break; }
    if (op === 0x38) { notes.push('JR C'); break; }
    if (op === 0xC2) { notes.push('JP NZ'); break; }
    if (op === 0xCA) { notes.push('JP Z'); break; }
    if (op === 0xC0) { notes.push('RET NZ'); break; }
    if (op === 0xC8) { notes.push('RET Z'); break; }
  }
  return notes.length > 0 ? notes.join(' -> ') : 'no obvious gate';
}

function findCoAccess(referenceAddr, selfName) {
  const found = new Set();
  const start = Math.max(0, referenceAddr - 30);
  const end = Math.min(ROM_SIZE - 3, referenceAddr + 30);

  for (let pos = start; pos <= end; pos++) {
    const lo = rom[pos];
    const mid = rom[pos + 1];
    const hi = rom[pos + 2];
    if (hi !== 0xD1) continue;

    if (mid === 0x40) found.add(`D140${lo.toString(16).toUpperCase().padStart(2, '0')}`);
    if (mid === 0x41) found.add(`D141${lo.toString(16).toUpperCase().padStart(2, '0')}`);
    if (mid === 0x77) found.add(`D177${lo.toString(16).toUpperCase().padStart(2, '0')}`);
    if (mid === 0x76) found.add(`D176${lo.toString(16).toUpperCase().padStart(2, '0')}`);
  }

  found.delete(selfName);
  return [...found].sort();
}

function findNearbyPortIO(referenceAddr) {
  const hits = [];
  let currentBC = null;
  const start = Math.max(0, referenceAddr - 32);
  const end = Math.min(ROM_SIZE - 1, referenceAddr + 32);

  for (let pos = start; pos <= end; pos++) {
    if (pos + 3 <= end && rom[pos] === 0x01 && rom[pos + 3] === 0x00) {
      currentBC = rom[pos + 1] | (rom[pos + 2] << 8);
      continue;
    }
    if (pos + 1 > end || rom[pos] !== 0xED) continue;

    const op = rom[pos + 1];
    if ((op & 0xC7) === 0x40) {
      const reg = REG_BY_ED[(op >> 3) & 0x07];
      hits.push({
        addr: pos,
        kind: 'IN',
        reg,
        port: currentBC,
      });
    } else if ((op & 0xC7) === 0x41) {
      const reg = REG_BY_ED[(op >> 3) & 0x07];
      hits.push({
        addr: pos,
        kind: 'OUT',
        reg,
        port: currentBC,
      });
    }
  }

  const unique = [];
  const seen = new Set();
  for (const hit of hits) {
    const key = `${hit.addr}:${hit.kind}:${hit.port ?? -1}:${hit.reg}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(hit);
    }
  }
  return unique;
}

function findEnclosingFunction(referenceAddr) {
  for (const range of FUNCTION_RANGES) {
    if (referenceAddr >= range.start && referenceAddr <= range.end) {
      return {
        addr: range.start,
        label: range.label,
        source: 'range',
        offset: referenceAddr - range.start,
      };
    }
  }

  const lower = Math.max(0, referenceAddr - 0x200);
  for (let pos = referenceAddr; pos >= lower; pos--) {
    if (rom[pos] === 0xDD && rom[pos + 1] === 0xE5) {
      return {
        addr: pos,
        label: `PUSH IX prologue @ ${hex(pos)}`,
        source: 'push-ix',
        offset: referenceAddr - pos,
      };
    }
    if (
      rom[pos] === 0xCD &&
      (
        (rom[pos + 1] === 0x8A && rom[pos + 2] === 0x21 && rom[pos + 3] === 0x00) ||
        (rom[pos + 1] === 0x97 && rom[pos + 2] === 0x21 && rom[pos + 3] === 0x00) ||
        (rom[pos + 1] === 0x2C && rom[pos + 2] === 0x01 && rom[pos + 3] === 0x00) ||
        (rom[pos + 1] === 0x30 && rom[pos + 2] === 0x01 && rom[pos + 3] === 0x00)
      )
    ) {
      return {
        addr: pos,
        label: `frameset-style prologue @ ${hex(pos)}`,
        source: 'frameset',
        offset: referenceAddr - pos,
      };
    }
  }

  return null;
}

function findIxLoads(baseAddr) {
  const lo = baseAddr & 0xFF;
  const mid = (baseAddr >>> 8) & 0xFF;
  const hi = (baseAddr >>> 16) & 0xFF;
  const hits = [];

  for (let pos = 0; pos <= ROM_SIZE - 5; pos++) {
    if (
      rom[pos] === 0xDD &&
      rom[pos + 1] === 0x21 &&
      rom[pos + 2] === lo &&
      rom[pos + 3] === mid &&
      rom[pos + 4] === hi
    ) {
      hits.push(pos);
    }
  }

  return hits;
}

function findIxRelativeAccess(baseLoads, target) {
  if (target.ixOffset > 0x7F) return [];

  const hits = [];
  const disp = target.ixOffset;
  for (const loadAddr of baseLoads) {
    for (let pos = loadAddr + 5; pos < Math.min(loadAddr + 200, ROM_SIZE - 3); pos++) {
      if (rom[pos] !== 0xDD) continue;
      const op = rom[pos + 1];
      if (rom[pos + 2] !== disp) continue;

      if ([0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, 0x7E].includes(op)) {
        hits.push({ addr: pos, type: 'READ', detail: `LD r,(IX+${hexByte(disp)})`, baseLoad: loadAddr });
      } else if (op >= 0x70 && op <= 0x77) {
        hits.push({ addr: pos, type: 'WRITE', detail: `LD (IX+${hexByte(disp)}),r`, baseLoad: loadAddr });
      } else if (op === 0x36) {
        hits.push({ addr: pos, type: 'WRITE', detail: `LD (IX+${hexByte(disp)}),imm`, baseLoad: loadAddr });
      } else if (op === 0x34) {
        hits.push({ addr: pos, type: 'READ+WRITE', detail: `INC (IX+${hexByte(disp)})`, baseLoad: loadAddr });
      } else if (op === 0x35) {
        hits.push({ addr: pos, type: 'READ+WRITE', detail: `DEC (IX+${hexByte(disp)})`, baseLoad: loadAddr });
      }
    }
  }
  return hits;
}

function scanTarget(target) {
  const lo = target.addr & 0xFF;
  const mid = (target.addr >>> 8) & 0xFF;
  const hi = (target.addr >>> 16) & 0xFF;

  const rawHits = [];
  for (let pos = 0; pos <= ROM_SIZE - 3; pos++) {
    if (rom[pos] === lo && rom[pos + 1] === mid && rom[pos + 2] === hi) {
      rawHits.push(pos);
    }
  }

  const directHits = rawHits.map((pos) => classifyRawHit(pos, target)).filter((hit) => hit.type !== 'UNKNOWN');
  const ixLoads = findIxLoads(target.baseAddr);
  const ixHits = findIxRelativeAccess(ixLoads, target);

  return { rawHits, directHits, ixLoads, ixHits };
}

function buildHistogram(entries) {
  const hist = new Map();
  for (const entry of entries) {
    hist.set(entry, (hist.get(entry) || 0) + 1);
  }
  return [...hist.entries()].sort((a, b) => b[1] - a[1]);
}

function describeTarget(targetName) {
  if (targetName === 'D14080') {
    return [
      'Assessment: boolean-ish pipe-config / re-arm latch.',
      'Lifecycle: written in the P2 init-priority branch, then cleared by reset, disconnect, and control re-arm helpers.',
      'Key neighbors: D14072, D1407E, D1407F, D14081, D1408D.',
    ];
  }
  if (targetName === 'D14082') {
    return [
      'Assessment: service latch B / OTG re-arm request bit.',
      'Lifecycle: raised by the 0x0098D2 masked-status dispatcher, queried through the tiny getter, then cleared by 0x012456, 0x012E4D, and teardown paths.',
      'Key neighbors: D14083, D14084, D14085, D14086, D14073, D1407B.',
    ];
  }
  return [
    'Assessment: multi-state pipe/result byte, not a boolean.',
    'Lifecycle: 0x00 idle/reset, 0x01 common armed/configured state, 0x02 and 0x04 typed classifier states.',
    'Key neighbors: D14040, D140AF, D1407E, D1407F, D1408B, D14095, D140A2, D140AA.',
  ];
}

console.log('=== Phase 439: D14080 / D14082 / D140B2 USB Pipe State Trace ===');
console.log(`ROM size: ${ROM_SIZE} bytes (${hex(ROM_SIZE)})`);
console.log('');

const allSummaries = [];

for (const target of TARGETS) {
  const result = scanTarget(target);
  const writes = [];
  const reads = [];
  const addrLoads = [];
  const other = [];

  for (const hit of result.directHits) {
    if (hit.type === 'WRITE') writes.push(hit);
    else if (hit.type === 'READ') reads.push(hit);
    else if (hit.type === 'LOAD_ADDR') addrLoads.push(hit);
    else other.push(hit);
  }

  console.log('------------------------------------------------------------------');
  console.log(`${target.name} @ ${hex(target.addr)}  (raw LE hits: ${result.rawHits.length})`);
  console.log('------------------------------------------------------------------');

  console.log(`Direct reads: ${reads.length}`);
  console.log(`Direct writes: ${writes.length}`);
  console.log(`Address loads: ${addrLoads.length}`);
  console.log(`IX base loads: ${result.ixLoads.length}`);
  console.log(`IX-relative refs: ${result.ixHits.length}`);
  console.log('');

  const coAccessCounts = new Map();
  const writeLabels = [];

  console.log('Reference list:');
  for (const hit of [...writes, ...reads, ...addrLoads, ...other]) {
    const functionInfo = findEnclosingFunction(hit.instrAddr);
    const functionText = functionInfo
      ? `${functionInfo.label} (+${hex(functionInfo.offset, 4)})`
      : 'no function marker found within 0x200 bytes';
    const co = findCoAccess(hit.instrAddr, target.name);
    for (const name of co) {
      coAccessCounts.set(name, (coAccessCounts.get(name) || 0) + 1);
    }
    const ports = findNearbyPortIO(hit.instrAddr);
    const portText = ports.length === 0
      ? 'none'
      : ports.map((port) => {
          const portName = port.port != null ? `${hex(port.port, 4)}${PORT_NAMES.has(port.port) ? ` ${PORT_NAMES.get(port.port)}` : ''}` : 'dynamic BC';
          return `${port.kind} ${port.reg},(C) @ ${hex(port.addr)} via ${portName}`;
        }).join(' | ');

    let valueText = '';
    if (hit.type === 'WRITE' && hit.detail === `LD (${target.name}),A`) {
      const value = inferWrittenValue(hit.instrAddr, target.name);
      writeLabels.push(value.label);
      valueText = `  value=${value.label}`;
    }
    if (hit.type === 'READ' && hit.detail === `LD A,(${target.name})`) {
      valueText = `  gate=${analyzeRead(hit.instrAddr)}`;
    }

    console.log(`- ${hex(hit.instrAddr)}  ${hit.type.padEnd(9)} ${hit.detail}${valueText}`);
    console.log(`  function: ${functionText}`);
    console.log(`  co-access: ${co.length > 0 ? co.join(', ') : 'none in +/-30 bytes'}`);
    console.log(`  nearby port I/O: ${portText}`);
    console.log(`  context: ${hexDump(hit.instrAddr - 4, 20)}`);
  }

  if (result.ixHits.length > 0) {
    console.log('');
    console.log('IX-relative references:');
    for (const hit of result.ixHits) {
      console.log(`- ${hex(hit.addr)}  ${hit.type.padEnd(9)} ${hit.detail}  (IX loaded at ${hex(hit.baseLoad)})`);
      console.log(`  context: ${hexDump(hit.addr - 2, 12)}`);
    }
  }

  const writeHistogram = buildHistogram(writeLabels);
  const coHistogram = [...coAccessCounts.entries()].sort((a, b) => b[1] - a[1]);

  console.log('');
  console.log('Summary:');
  if (writeHistogram.length > 0) {
    console.log(`- Write histogram: ${writeHistogram.map(([label, count]) => `${label}(${count}x)`).join(', ')}`);
  } else {
    console.log('- Write histogram: none');
  }
  console.log(`- Co-access leaders: ${coHistogram.length > 0 ? coHistogram.slice(0, 10).map(([label, count]) => `${label}(${count}x)`).join(', ') : 'none'}`);
  for (const line of describeTarget(target.name)) {
    console.log(`- ${line}`);
  }
  console.log('');

  allSummaries.push({
    target,
    reads: reads.length,
    writes: writes.length,
    addrLoads: addrLoads.length,
    ixRefs: result.ixHits.length,
    writeHistogram,
  });
}

console.log('==================================================================');
console.log('Group assessment');
console.log('==================================================================');
console.log('- D14080 and D14082 behave like boolean extension latches just beyond the D14070-D1407F core block.');
console.log('- D140B2 behaves differently: it is the tail status byte of the wider D14040-D140B2 slab and carries multi-state pipe/result information.');
console.log('- 0x00C9A0 clears through D140B2, so D140B2 is the last byte explicitly scrubbed by the USB hard-reset sweep.');
console.log('- The combined picture is: D1407E = pipe-active, D1407F/D14080 = config/arming companions, D14082 = service request, D140B2 = cross-cluster result/state byte.');
console.log('');

console.log('Compact totals:');
for (const summary of allSummaries) {
  console.log(`- ${summary.target.name}: ${summary.reads} reads, ${summary.writes} writes, ${summary.addrLoads} addr-loads, ${summary.ixRefs} IX-relative refs`);
}
