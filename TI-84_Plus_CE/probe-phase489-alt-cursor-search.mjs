import fs from 'node:fs';
import { createCPU } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const romBytes = fs.readFileSync(ROM_PATH);

const BOOT_STEPS = 40000;
const CALL_STEP_LIMIT = 60000;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const LCD_PORT_START = 0x4000;
const LCD_PORT_END = 0x4020;

const CANDIDATES = [0x061BC0, 0x08B3C0, 0x0A2300];
const CURSOR_CASES = [
  { name: 'row=3 col=10', d00595: 3, d00596: 10 },
  { name: 'row=7 col=20', d00595: 7, d00596: 20 },
];

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function makePeripheralBus() {
  const attempts = [
    () => createPeripheralBus({ timerInterrupt: false }),
    () => createPeripheralBus({ timerInterrupt: false, rom: romBytes }),
    () => createPeripheralBus(false),
    () => createPeripheralBus(),
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Unable to create peripheral bus');
}

function tryLoadRom(cpu, peripherals) {
  const targets = [cpu, cpu?.memory, cpu?.mem, cpu?.mmu, peripherals].filter(Boolean);
  const methodNames = ['loadROM', 'loadRom', 'load', 'loadImage', 'setROM', 'setRom'];

  for (const target of targets) {
    for (const name of methodNames) {
      if (typeof target[name] !== 'function') continue;
      try {
        target[name](romBytes);
        return;
      } catch {
        // Try the next plausible loader shape.
      }
    }
  }

  for (const array of findByteArrays(cpu)) {
    if (array.length >= romBytes.length) {
      try {
        array.set(romBytes, 0);
        return;
      } catch {
        // Keep looking for a writable backing store.
      }
    }
  }
}

function createCpuInstance(peripherals) {
  const attempts = [
    () => createCPU({ rom: romBytes, romBytes, peripherals, bus: peripherals }),
    () => createCPU(romBytes, peripherals),
    () => createCPU(romBytes, { peripherals, bus: peripherals }),
    () => createCPU(peripherals, romBytes),
    () => createCPU({ peripherals, bus: peripherals }),
    () => createCPU(),
  ];

  let lastError;
  for (const attempt of attempts) {
    try {
      const cpu = attempt();
      if (!cpu) continue;
      tryLoadRom(cpu, peripherals);
      return cpu;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error('Unable to create CPU');
}

function stepCPU(cpu) {
  const stepMethods = ['step', 'executeInstruction', 'runInstruction', 'tick'];
  for (const name of stepMethods) {
    if (typeof cpu[name] === 'function') {
      return cpu[name]();
    }
  }
  throw new Error('CPU exposes no step-like method');
}

function bootCPU() {
  const errors = [];
  const attempts = 6;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const peripherals = makePeripheralBus();
      const cpu = createCpuInstance(peripherals);
      for (let i = 0; i < BOOT_STEPS; i += 1) {
        stepCPU(cpu);
      }
      return { cpu, peripherals };
    } catch (error) {
      errors.push(error?.stack ?? String(error));
    }
  }

  throw new Error(`Unable to boot CPU after ${attempts} attempts:\n${errors.join('\n---\n')}`);
}

function unique(values) {
  return [...new Set(values)];
}

function isByteArray(value) {
  return value instanceof Uint8Array || value instanceof Uint8ClampedArray || Buffer.isBuffer(value);
}

function findByteArrays(root) {
  if (!root || typeof root !== 'object') return [];

  const arrays = [];
  const seen = new Set();
  const queue = [root];
  const likelyNames = [
    'memory',
    'mem',
    'ram',
    'vram',
    'lcdMemory',
    'lcdRam',
    'videoMemory',
    'rom',
  ];

  while (queue.length > 0 && arrays.length < 24) {
    const current = queue.shift();
    if (!current || typeof current !== 'object' || seen.has(current)) continue;
    seen.add(current);

    if (isByteArray(current)) {
      arrays.push(current);
      continue;
    }

    for (const name of likelyNames) {
      try {
        const value = current[name];
        if (isByteArray(value)) arrays.push(value);
        else if (value && typeof value === 'object' && !seen.has(value)) queue.push(value);
      } catch {
        // Ignore getter failures while probing runtime shape.
      }
    }
  }

  return unique(arrays);
}

function candidateOffsetsForArray(array, address) {
  const addr = address >>> 0;
  const offsets = [
    addr,
    addr & 0xFFFFFF,
    addr - 0xD00000,
    addr - VRAM_START,
    addr & (array.length - 1),
  ];

  return unique(offsets.filter((offset) => Number.isInteger(offset) && offset >= 0 && offset < array.length));
}

function readByte(cpu, address) {
  const targets = [cpu, cpu?.memory, cpu?.mem, cpu?.mmu, cpu?.bus, cpu?.peripherals].filter(Boolean);
  const methods = ['read8', 'readByte', 'readMemory', 'readMem', 'memRead', 'peek8', 'peek', 'getByte', 'load8', 'read'];

  for (const target of targets) {
    for (const name of methods) {
      if (typeof target[name] !== 'function') continue;
      try {
        const value = target[name](address >>> 0);
        if (Number.isFinite(value)) return value & 0xFF;
      } catch {
        // Try the next reader.
      }
    }
  }

  for (const array of findByteArrays(cpu)) {
    for (const offset of candidateOffsetsForArray(array, address)) {
      const value = array[offset];
      if (Number.isFinite(value)) return value & 0xFF;
    }
  }

  throw new Error(`Unable to read byte at ${hex(address)}`);
}

function writeByte(cpu, address, value) {
  const targets = [cpu, cpu?.memory, cpu?.mem, cpu?.mmu, cpu?.bus, cpu?.peripherals].filter(Boolean);
  const methods = ['write8', 'writeByte', 'writeMemory', 'writeMem', 'memWrite', 'poke8', 'poke', 'setByte', 'store8', 'write'];

  for (const target of targets) {
    for (const name of methods) {
      if (typeof target[name] !== 'function') continue;
      try {
        target[name](address >>> 0, value & 0xFF);
        return;
      } catch {
        // Try the next writer.
      }
    }
  }

  for (const array of findByteArrays(cpu)) {
    for (const offset of candidateOffsetsForArray(array, address)) {
      try {
        array[offset] = value & 0xFF;
        return;
      } catch {
        // Try another backing store.
      }
    }
  }

  throw new Error(`Unable to write byte at ${hex(address)}`);
}

function getRegisterSlot(cpu, names) {
  const roots = [cpu, cpu?.regs, cpu?.registers, cpu?.state, cpu?.r, cpu?.reg].filter(Boolean);

  for (const root of roots) {
    for (const name of names) {
      if (!(name in root)) continue;
      const value = root[name];
      if (typeof value === 'number') return { root, name, boxed: false };
      if (value && typeof value === 'object' && typeof value.value === 'number') {
        return { root: value, name: 'value', boxed: false };
      }
    }
  }

  return null;
}

function getRegister(cpu, names) {
  const slot = getRegisterSlot(cpu, names);
  return slot ? slot.root[slot.name] >>> 0 : null;
}

function setRegister(cpu, names, value) {
  const slot = getRegisterSlot(cpu, names);
  if (!slot) return false;
  slot.root[slot.name] = value >>> 0;
  return true;
}

function snapshotVRAM(cpu) {
  const snapshot = new Uint8Array(VRAM_END - VRAM_START);
  for (let address = VRAM_START; address < VRAM_END; address += 1) {
    snapshot[address - VRAM_START] = readByte(cpu, address);
  }
  return snapshot;
}

function diffVRAM(before, after) {
  const changed = [];
  let hash = 2166136261;

  for (let i = 0; i < before.length; i += 1) {
    if (before[i] === after[i]) continue;
    const address = VRAM_START + i;
    changed.push(address);
    hash ^= address & 0xFF;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= (address >>> 8) & 0xFF;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= after[i];
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return summarizeAddresses(changed, hash);
}

function summarizeAddresses(addresses, hashSeed = 2166136261) {
  if (addresses.length === 0) {
    return { count: 0, min: null, max: null, hash: 0, sample: [] };
  }

  let min = Infinity;
  let max = -Infinity;
  let hash = hashSeed >>> 0;

  for (const address of addresses) {
    if (address < min) min = address;
    if (address > max) max = address;
    hash ^= address & 0xFF;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= (address >>> 8) & 0xFF;
    hash = Math.imul(hash, 16777619) >>> 0;
    hash ^= (address >>> 16) & 0xFF;
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return { count: addresses.length, min, max, hash, sample: addresses.slice(0, 12) };
}

function pixelForVramByte(address) {
  const byteOffset = Math.max(0, address - VRAM_START);
  const pixel = Math.floor(byteOffset / 2);
  return { x: pixel % 320, y: Math.floor(pixel / 320) };
}

function formatRange(summary) {
  if (!summary || summary.count === 0) return 'none';
  const start = pixelForVramByte(summary.min);
  const end = pixelForVramByte(summary.max);
  return `${hex(summary.min)}..${hex(summary.max)} approx pixels (${start.x},${start.y})..(${end.x},${end.y})`;
}

function installWriteRecorder(cpu, peripherals, writes) {
  const targets = [cpu, peripherals, cpu?.memory, cpu?.mem, cpu?.mmu, cpu?.bus, cpu?.peripherals].filter(Boolean);
  const methods = ['write8', 'writeByte', 'writeMemory', 'writeMem', 'memWrite', 'poke8', 'poke', 'setByte', 'store8', 'write'];
  const wrapped = [];

  for (const target of targets) {
    for (const name of methods) {
      if (typeof target[name] !== 'function') continue;
      const original = target[name];
      try {
        target[name] = function wrappedWrite(address, value, ...rest) {
          const numericAddress = Number(address) >>> 0;
          if (numericAddress >= VRAM_START && numericAddress < VRAM_END) {
            writes.push(numericAddress);
          }
          return original.call(this, address, value, ...rest);
        };
        wrapped.push({ target, name, original });
      } catch {
        // Non-writable methods are fine; VRAM diffing remains as a fallback.
      }
    }
  }

  return () => {
    for (const { target, name, original } of wrapped.reverse()) {
      try {
        target[name] = original;
      } catch {
        // Ignore restore failures in one-shot probes.
      }
    }
  };
}

function setCursorState(cpu, d00595, d00596) {
  writeByte(cpu, 0xD00595, d00595);
  writeByte(cpu, 0xD00596, d00596);
  writeByte(cpu, 0xD00092, 0x16);
}

function runDirectCall(cpu, address) {
  const directMethods = ['runFunction', 'callFunction', 'executeFunction', 'invoke', 'call'];

  const sp = getRegister(cpu, ['sp', 'SP', 'stackPointer', 'StackPointer']);
  const canSetPC = setRegister(cpu, ['pc', 'PC', 'programCounter', 'ProgramCounter'], address);

  if (canSetPC && sp !== null) {
    const sentinel = 0x00FFEE;
    writeByte(cpu, sp, sentinel & 0xFF);
    writeByte(cpu, sp + 1, (sentinel >>> 8) & 0xFF);
    writeByte(cpu, sp + 2, (sentinel >>> 16) & 0xFF);

    for (let steps = 0; steps < CALL_STEP_LIMIT; steps += 1) {
      stepCPU(cpu);
      const pc = getRegister(cpu, ['pc', 'PC', 'programCounter', 'ProgramCounter']);
      if (pc === sentinel) {
        return { returned: true, steps: steps + 1, mode: 'pc+stack-sentinel' };
      }
    }
    return { returned: false, steps: CALL_STEP_LIMIT, mode: 'pc+stack-sentinel' };
  }

  for (const name of directMethods) {
    if (typeof cpu[name] !== 'function') continue;
    try {
      const result = cpu[name](address, { maxSteps: CALL_STEP_LIMIT });
      return { returned: true, steps: null, mode: name, result };
    } catch {
      try {
        const result = cpu[name](address);
        return { returned: true, steps: null, mode: name, result };
      } catch {
        // Try the next direct-call helper.
      }
    }
  }

  throw new Error('Unable to call function directly: no PC/SP or direct call helper available');
}

function runCandidateCase(address, cursorCase) {
  const { cpu, peripherals } = bootCPU();
  setCursorState(cpu, cursorCase.d00595, cursorCase.d00596);

  const before = snapshotVRAM(cpu);
  const capturedWrites = [];
  const restoreRecorder = installWriteRecorder(cpu, peripherals, capturedWrites);

  let callResult;
  try {
    callResult = runDirectCall(cpu, address);
  } finally {
    restoreRecorder();
  }

  const after = snapshotVRAM(cpu);
  const writeSummary = summarizeAddresses(capturedWrites);
  const diffSummary = diffVRAM(before, after);

  return { cursorCase, callResult, writeSummary, diffSummary };
}

function signatureForResult(result) {
  const active = result.writeSummary.count > 0 ? result.writeSummary : result.diffSummary;
  return `${active.count}:${active.min ?? -1}:${active.max ?? -1}:${active.hash}`;
}

function printDynamicResult(address, first, second) {
  console.log(`\nCandidate ${hex(address)} dynamic test`);

  for (const result of [first, second]) {
    console.log(`  ${result.cursorCase.name}:`);
    console.log(`    call mode: ${result.callResult.mode}, returned=${result.callResult.returned}, steps=${result.callResult.steps ?? 'n/a'}`);
    console.log(`    captured VRAM writes: ${result.writeSummary.count}, range=${formatRange(result.writeSummary)}`);
    console.log(`    changed VRAM bytes: ${result.diffSummary.count}, range=${formatRange(result.diffSummary)}`);
    if (result.writeSummary.sample.length > 0) {
      console.log(`    write sample: ${result.writeSummary.sample.map((addr) => hex(addr)).join(', ')}`);
    } else if (result.diffSummary.sample.length > 0) {
      console.log(`    changed-byte sample: ${result.diffSummary.sample.map((addr) => hex(addr)).join(', ')}`);
    }
  }

  const firstActive = first.writeSummary.count > 0 || first.diffSummary.count > 0;
  const secondActive = second.writeSummary.count > 0 || second.diffSummary.count > 0;

  if (!firstActive && !secondActive) {
    console.log(`  Conclusion: ${hex(address)} produced no observed VRAM activity for either cursor position.`);
    return;
  }

  if (signatureForResult(first) === signatureForResult(second)) {
    console.log(`  Conclusion: ${hex(address)} produced VRAM activity, but the affected positions did not change with D00595/D00596.`);
    return;
  }

  console.log(`  Conclusion: ${hex(address)} changed affected VRAM positions when D00595/D00596 changed; keep as a cursor-blink candidate.`);
}

function findPattern(buffer, pattern) {
  const hits = [];
  const last = buffer.length - pattern.length;

  for (let offset = 0; offset <= last; offset += 1) {
    let matches = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (buffer[offset + i] !== pattern[i]) {
        matches = false;
        break;
      }
    }
    if (matches) hits.push(offset);
  }

  return hits;
}

function opcodeName(byte) {
  const names = {
    0x01: 'LD BC,imm',
    0x02: 'LD (BC),A',
    0x11: 'LD DE,imm',
    0x12: 'LD (DE),A',
    0x21: 'LD HL,imm',
    0x22: 'LD (imm),HL',
    0x32: 'LD (imm),A',
    0x36: 'LD (HL),imm',
    0x70: 'LD (HL),B',
    0x71: 'LD (HL),C',
    0x72: 'LD (HL),D',
    0x73: 'LD (HL),E',
    0x74: 'LD (HL),H',
    0x75: 'LD (HL),L',
    0x77: 'LD (HL),A',
    0xD3: 'OUT (n),A',
  };
  return names[byte] ?? `opcode ${hex(byte, 2)}`;
}

function isIndirectStoreOpcode(byte) {
  return byte === 0x02 || byte === 0x12 || byte === 0x36 || (byte >= 0x70 && byte <= 0x77);
}

function isOutOpcode(buffer, offset) {
  if (buffer[offset] === 0xD3) return true;
  if (buffer[offset] !== 0xED || offset + 1 >= buffer.length) return false;
  return [0x41, 0x49, 0x51, 0x59, 0x61, 0x69, 0x71, 0x79, 0xA3, 0xAB, 0xB3, 0xBB].includes(buffer[offset + 1]);
}

function scanVramEvidence(buffer, start, end) {
  const evidence = [];
  const writeOps = [];

  for (let offset = start; offset < end; offset += 1) {
    const opcode = buffer[offset];
    if (isIndirectStoreOpcode(opcode) || opcode === 0x22 || opcode === 0x32) {
      writeOps.push({ offset, opcode });
    }
  }

  for (let offset = start; offset <= end - 3; offset += 1) {
    const address = buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
    if (address < VRAM_START || address >= VRAM_END) continue;

    const preceding = offset > 0 ? buffer[offset - 1] : null;
    const directAbsoluteWrite = preceding === 0x22 || preceding === 0x32;
    const nearbyWrite = writeOps
      .map((op) => ({ ...op, distance: Math.abs(op.offset - offset) }))
      .sort((a, b) => a.distance - b.distance)[0];

    evidence.push({
      offset,
      address,
      kind: directAbsoluteWrite
        ? `${opcodeName(preceding)} to VRAM immediate`
        : nearbyWrite
          ? `VRAM immediate near ${opcodeName(nearbyWrite.opcode)}`
          : 'VRAM immediate',
      writeOffset: nearbyWrite?.offset ?? null,
    });
  }

  return evidence;
}

function scanLcdEvidence(buffer, start, end) {
  const outOps = [];
  const evidence = [];

  for (let offset = start; offset < end; offset += 1) {
    if (isOutOpcode(buffer, offset)) outOps.push(offset);
  }

  for (let offset = start; offset <= end - 2; offset += 1) {
    const port = buffer[offset] | (buffer[offset + 1] << 8);
    if (port < LCD_PORT_START || port > LCD_PORT_END) continue;

    const nearestOut = outOps
      .map((outOffset) => ({ outOffset, distance: Math.abs(outOffset - offset) }))
      .sort((a, b) => a.distance - b.distance)[0];

    evidence.push({
      offset,
      port,
      kind: nearestOut ? `LCD port immediate near OUT at ${hex(nearestOut.outOffset)}` : 'LCD port immediate',
      outOffset: nearestOut?.outOffset ?? null,
    });
  }

  return evidence;
}

function scanCursorRelatedMechanisms() {
  const cursorPatterns = [
    { name: 'LD A,(D00595)', variable: 'D00595', bytes: [0x3A, 0x95, 0x05, 0xD0] },
    { name: 'LD HL,(D00595)', variable: 'D00595', bytes: [0x2A, 0x95, 0x05, 0xD0] },
    { name: 'LD A,(D00596)', variable: 'D00596', bytes: [0x3A, 0x96, 0x05, 0xD0] },
    { name: 'LD HL,(D00596)', variable: 'D00596', bytes: [0x2A, 0x96, 0x05, 0xD0] },
  ];

  const refs = [];
  for (const pattern of cursorPatterns) {
    for (const offset of findPattern(romBytes, pattern.bytes)) {
      const start = Math.max(0, offset - 100);
      const end = Math.min(romBytes.length, offset + pattern.bytes.length + 100);
      refs.push({
        ...pattern,
        offset,
        windowStart: start,
        windowEnd: end,
        vram: scanVramEvidence(romBytes, start, end),
        lcd: scanLcdEvidence(romBytes, start, end),
      });
    }
  }

  refs.sort((a, b) => a.offset - b.offset);
  return refs;
}

function groupInterestingRefs(refs) {
  const interesting = refs.filter((ref) => ref.vram.length > 0 || ref.lcd.length > 0);
  const groups = [];

  for (const ref of interesting) {
    const last = groups[groups.length - 1];
    if (last && ref.offset - last.end <= 160) {
      last.refs.push(ref);
      last.end = Math.max(last.end, ref.windowEnd);
      continue;
    }
    groups.push({ start: ref.windowStart, end: ref.windowEnd, refs: [ref] });
  }

  return groups;
}

function summarizeEvidence(evidence, mapper, limit = 5) {
  if (evidence.length === 0) return 'none';
  const shown = evidence.slice(0, limit).map(mapper);
  if (evidence.length > limit) shown.push(`... ${evidence.length - limit} more`);
  return shown.join('; ');
}

function printScanResults(refs) {
  const groups = groupInterestingRefs(refs);
  const vramGroups = groups.filter((group) => group.refs.some((ref) => ref.vram.length > 0));
  const lcdGroups = groups.filter((group) => group.refs.some((ref) => ref.lcd.length > 0));

  console.log('\nROM byte-pattern scan');
  console.log(`  Cursor-position references found: ${refs.length}`);
  console.log(`  Direct/indirect VRAM writer regions within 100 bytes: ${vramGroups.length}`);
  console.log(`  LCD-port/XOR-style regions within 100 bytes: ${lcdGroups.length}`);

  if (groups.length === 0) {
    console.log('  No cursor-position references had nearby VRAM immediates or LCD port immediates.');
    return;
  }

  for (const group of groups) {
    const functionGuess = group.refs.reduce((min, ref) => Math.min(min, ref.offset), Infinity) & ~0x3F;
    const refsText = group.refs.map((ref) => `${ref.name} at ${hex(ref.offset)}`).join(', ');
    const vramEvidence = group.refs.flatMap((ref) => ref.vram);
    const lcdEvidence = group.refs.flatMap((ref) => ref.lcd);

    console.log(`\n  Function/region ${hex(functionGuess)} (${hex(group.start)}..${hex(group.end)})`);
    console.log(`    cursor refs: ${refsText}`);
    console.log(`    VRAM mechanism: ${summarizeEvidence(vramEvidence, (item) => `${item.kind} ${hex(item.address)} at ${hex(item.offset)}`)}`);
    console.log(`    LCD mechanism: ${summarizeEvidence(lcdEvidence, (item) => `${item.kind} port ${hex(item.port, 4)} at ${hex(item.offset)}`)}`);
  }
}

function printSummary(dynamicResults, refs) {
  const groups = groupInterestingRefs(refs);

  console.log('\nSummary');
  for (const result of dynamicResults) {
    if (result.error) {
      console.log(`  ${hex(result.address)}: dynamic test failed: ${result.error}`);
      continue;
    }

    const firstActive = result.first.writeSummary.count > 0 || result.first.diffSummary.count > 0;
    const secondActive = result.second.writeSummary.count > 0 || result.second.diffSummary.count > 0;
    const moved = signatureForResult(result.first) !== signatureForResult(result.second);
    const mechanism = firstActive || secondActive
      ? moved ? 'VRAM positions move with cursor variables' : 'VRAM activity does not move with cursor variables'
      : 'no observed VRAM activity';
    console.log(`  ${hex(result.address)}: ${mechanism}`);
  }

  if (groups.length === 0) {
    console.log('  Pattern search: no alternate direct-VRAM or LCD-port cursor mechanisms found near D00595/D00596 reads.');
    return;
  }

  for (const group of groups) {
    const functionGuess = group.refs.reduce((min, ref) => Math.min(min, ref.offset), Infinity) & ~0x3F;
    const variables = unique(group.refs.map((ref) => ref.variable)).join('/');
    const hasVram = group.refs.some((ref) => ref.vram.length > 0);
    const hasLcd = group.refs.some((ref) => ref.lcd.length > 0);
    const mechanisms = [
      hasVram ? 'nearby VRAM immediate/store pattern' : null,
      hasLcd ? 'nearby LCD port/OUT pattern' : null,
    ].filter(Boolean).join(', ');
    console.log(`  ${hex(functionGuess)}: reads ${variables}; ${mechanisms}`);
  }
}

console.log('Phase 489 alternative text cursor blink search');
console.log(`ROM size: ${romBytes.length} bytes`);

const dynamicResults = [];
for (const address of CANDIDATES) {
  try {
    const first = runCandidateCase(address, CURSOR_CASES[0]);
    const second = runCandidateCase(address, CURSOR_CASES[1]);
    printDynamicResult(address, first, second);
    dynamicResults.push({ address, first, second });
  } catch (error) {
    const message = error?.stack ?? String(error);
    console.log(`\nCandidate ${hex(address)} dynamic test failed`);
    console.log(message);
    dynamicResults.push({ address, error: message.split('\n')[0] });
  }
}

const cursorRefs = scanCursorRelatedMechanisms();
printScanResults(cursorRefs);
printSummary(dynamicResults, cursorRefs);
