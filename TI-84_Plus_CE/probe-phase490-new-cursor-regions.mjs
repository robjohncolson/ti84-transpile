import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function ensureTranspiledRom() {
  const transpiled = new URL('./ROM.transpiled.js', import.meta.url);
  const gz = new URL('./ROM.transpiled.js.gz', import.meta.url);
  if (fs.existsSync(transpiled) || !fs.existsSync(gz)) return;

  console.log('ROM.transpiled.js missing; expanding ROM.transpiled.js.gz');
  execFileSync('gzip', ['-dk', fileURLToPath(gz)], {
    cwd: fileURLToPath(new URL('.', import.meta.url)),
    stdio: 'inherit',
  });
}

ensureTranspiledRom();

const { createCPU } = await import('./cpu-runtime.js');
const { createPeripheralBus } = await import('./peripherals.js');

const REGIONS = [0x005800, 0x028800, 0x061000];
const POSITIONS = [
  { label: 'A', row: 0, col: 0 },
  { label: 'B', row: 5, col: 13 },
];

const ROW_VAR = 0xD00595;
const COL_VAR = 0xD00596;
const CURSOR_FLAGS = 0xD00092;
const RENDERER = 0x0A23C0;
const RENDERER_ALT = 0x0A239E;

const VRAM = {
  start: 0xD40000,
  end: 0xD52BFF,
  length: 0xD52BFF - 0xD40000 + 1,
  width: 320,
  bytesPerPixel: 1,
};

const rom = fs.readFileSync(new URL('./ROM.rom', import.meta.url));

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function firstSuccessful(label, attempts) {
  const errors = [];
  for (const attempt of attempts) {
    try {
      const value = attempt();
      if (value) return value;
      errors.push('returned empty value');
    } catch (error) {
      errors.push(error.message);
    }
  }
  throw new Error(`${label} failed: ${errors.join(' | ')}`);
}

function makePeripherals() {
  return firstSuccessful('createPeripheralBus', [
    () => createPeripheralBus({ timerInterrupt: false }),
    () => createPeripheralBus(undefined, { timerInterrupt: false }),
    () => createPeripheralBus(),
  ]);
}

function makeCPU(peripherals) {
  return firstSuccessful('createCPU', [
    () => createCPU({ rom, romBytes: rom, peripherals, peripheralBus: peripherals }),
    () => createCPU(rom, peripherals),
    () => createCPU(rom, { peripherals, peripheralBus: peripherals }),
    () => createCPU({ rom, romBytes: rom }, peripherals),
    () => createCPU({ peripherals, peripheralBus: peripherals }),
    () => createCPU(),
  ]);
}

function objectCandidates(cpu, peripherals) {
  return [
    cpu,
    cpu?.state,
    cpu?.registers,
    cpu?.regs,
    cpu?.memory,
    cpu?.bus,
    cpu?.mmu,
    peripherals,
    peripherals?.memory,
    peripherals?.bus,
  ].filter(Boolean);
}

function callFirst(objects, names, args) {
  for (const object of objects) {
    for (const name of names) {
      if (typeof object[name] === 'function') {
        return { called: true, value: object[name](...args) };
      }
    }
  }
  return { called: false, value: undefined };
}

function read8(cpu, peripherals, address) {
  const result = callFirst(objectCandidates(cpu, peripherals), ['read8', 'readByte', 'readMemory', 'peek8', 'peek'], [address >>> 0]);
  if (result.called && result.value !== undefined) return result.value & 0xFF;
  throw new Error(`No read8-compatible CPU API found for ${hex(address, 6)}`);
}

function write8(cpu, peripherals, address, value) {
  const result = callFirst(objectCandidates(cpu, peripherals), ['write8', 'writeByte', 'writeMemory', 'poke8', 'poke'], [address >>> 0, value & 0xFF]);
  if (!result.called) throw new Error(`No write8-compatible CPU API found for ${hex(address, 6)}`);
}

function write24(cpu, peripherals, address, value) {
  const result = callFirst(objectCandidates(cpu, peripherals), ['write24', 'writeUint24'], [address >>> 0, value & 0xFFFFFF]);
  if (result.called) return;
  write8(cpu, peripherals, address, value);
  write8(cpu, peripherals, address + 1, value >> 8);
  write8(cpu, peripherals, address + 2, value >> 16);
}

function stepCPU(cpu) {
  const result = callFirst([cpu, cpu?.state].filter(Boolean), ['step', 'executeInstruction', 'tick'], []);
  if (!result.called) throw new Error('No step-compatible CPU API found');
  return result.value;
}

function getRegister(cpu, logicalName) {
  const methodMap = {
    pc: ['getPC', 'getPc', 'getProgramCounter'],
    sp: ['getSP', 'getSp', 'getStackPointer'],
  };
  const propMap = {
    pc: ['pc', 'PC', 'programCounter', 'ProgramCounter'],
    sp: ['sp', 'SP', 'stackPointer', 'StackPointer'],
    a: ['a', 'A'],
    f: ['f', 'F'],
    b: ['b', 'B'],
    c: ['c', 'C'],
    d: ['d', 'D'],
    e: ['e', 'E'],
    h: ['h', 'H'],
    l: ['l', 'L'],
    bc: ['bc', 'BC'],
    de: ['de', 'DE'],
    hl: ['hl', 'HL'],
    ix: ['ix', 'IX'],
    iy: ['iy', 'IY'],
  };

  for (const name of methodMap[logicalName] ?? []) {
    if (typeof cpu[name] === 'function') return cpu[name]() >>> 0;
  }
  for (const object of [cpu, cpu?.state, cpu?.registers, cpu?.regs].filter(Boolean)) {
    for (const name of propMap[logicalName] ?? []) {
      if (typeof object[name] === 'number') return object[name] >>> 0;
    }
  }
  return undefined;
}

function setRegister(cpu, logicalName, value) {
  const methodMap = {
    pc: ['setPC', 'setPc', 'setProgramCounter'],
    sp: ['setSP', 'setSp', 'setStackPointer'],
  };
  const propMap = {
    pc: ['pc', 'PC', 'programCounter', 'ProgramCounter'],
    sp: ['sp', 'SP', 'stackPointer', 'StackPointer'],
  };

  for (const name of methodMap[logicalName] ?? []) {
    if (typeof cpu[name] === 'function') {
      cpu[name](value >>> 0);
      return;
    }
  }
  for (const object of [cpu, cpu?.state, cpu?.registers, cpu?.regs].filter(Boolean)) {
    for (const name of propMap[logicalName] ?? []) {
      if (typeof object[name] === 'number') {
        object[name] = value >>> 0;
        return;
      }
    }
  }
  throw new Error(`No setter found for register ${logicalName}`);
}

function forceAdl(cpu) {
  for (const object of [cpu, cpu?.state].filter(Boolean)) {
    if (typeof object.madl === 'number') object.madl = 1;
    if (typeof object.halted === 'boolean') object.halted = false;
  }
}

function bootToIdle(cpu) {
  const idleAddresses = new Set([0x03030E, 0x030310, 0x030312, 0x030314]);
  let idleHits = 0;
  let steps = 0;
  let lastPC;
  for (; steps < 80000; steps += 1) {
    const pc = getRegister(cpu, 'pc');
    if (pc !== undefined) {
      lastPC = pc & 0xFFFFFF;
      if (idleAddresses.has(lastPC)) idleHits += 1;
      if (steps > 1000 && idleHits >= 6) break;
    }
    stepCPU(cpu);
  }
  return { steps, lastPC, idleHits };
}

function snapshotRange(cpu, peripherals, range) {
  const bytes = new Uint8Array(range.length);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = read8(cpu, peripherals, range.start + i);
  }
  return bytes;
}

function coordFor(range, address) {
  const offset = address - range.start;
  const pixel = Math.floor(offset / range.bytesPerPixel);
  return {
    x: pixel % range.width,
    y: Math.floor(pixel / range.width),
    byteInPixel: offset % range.bytesPerPixel,
  };
}

function diffRange(before, after, range) {
  const changes = [];
  for (let i = 0; i < before.length; i += 1) {
    if (before[i] !== after[i]) {
      const address = range.start + i;
      changes.push({ address, before: before[i], after: after[i], coord: coordFor(range, address) });
    }
  }
  return changes;
}

function recordVramWrite(log, range, label, method, baseAddress, value, width) {
  if (!Number.isFinite(baseAddress)) return;
  const address = baseAddress & 0xFFFFFF;
  const numericValue = Number(value);
  for (let byteIndex = 0; byteIndex < width; byteIndex += 1) {
    const byteAddress = (address + byteIndex) & 0xFFFFFF;
    if (byteAddress < range.start || byteAddress > range.end) continue;
    log.push({
      label,
      method,
      address: byteAddress,
      baseAddress: address,
      byteIndex,
      value: Number.isFinite(numericValue) ? (numericValue >> (8 * byteIndex)) & 0xFF : undefined,
    });
  }
}

function installVramWriteRecorder(cpu, peripherals, range) {
  const log = [];
  const seen = new Set();
  const methodWidths = new Map([
    ['write8', 1],
    ['writeByte', 1],
    ['writeMemory', 1],
    ['poke8', 1],
    ['poke', 1],
    ['write16', 2],
    ['writeUint16', 2],
    ['write24', 3],
    ['writeUint24', 3],
  ]);

  for (const [index, object] of objectCandidates(cpu, peripherals).entries()) {
    if (!object || seen.has(object)) continue;
    seen.add(object);
    for (const [name, width] of methodWidths.entries()) {
      if (typeof object[name] !== 'function') continue;
      const original = object[name];
      try {
        object[name] = function wrappedVramWrite(...args) {
          recordVramWrite(log, range, `object${index}`, name, Number(args[0]), args[1], width);
          return original.apply(this, args);
        };
      } catch {
        // Some host objects may be sealed; skip those without failing the probe.
      }
    }
  }

  return log;
}

function registerSnapshot(cpu) {
  const names = ['pc', 'sp', 'a', 'f', 'b', 'c', 'd', 'e', 'h', 'l', 'bc', 'de', 'hl', 'ix', 'iy'];
  const result = {};
  for (const name of names) {
    const value = getRegister(cpu, name);
    if (value !== undefined) result[name.toUpperCase()] = hex(value, name.length === 1 ? 2 : 6);
  }
  return result;
}

function executeRegion(cpu, peripherals, entry) {
  const sentinel = 0x0FCAFE;
  let sp = getRegister(cpu, 'sp');
  if (sp === undefined || sp < 0x400000) {
    sp = 0xD1FF00;
    setRegister(cpu, 'sp', sp);
  }

  forceAdl(cpu);
  write24(cpu, peripherals, sp, sentinel);
  setRegister(cpu, 'pc', entry);

  const renderCalls = [];
  let steps = 0;
  let terminated = false;
  let finalPC;
  let error;

  for (; steps < 60000; steps += 1) {
    const pc = getRegister(cpu, 'pc');
    if (pc !== undefined) {
      finalPC = pc & 0xFFFFFF;
      if (finalPC === sentinel) {
        terminated = true;
        break;
      }
      if (finalPC === RENDERER || finalPC === RENDERER_ALT) {
        renderCalls.push({ step: steps, target: finalPC, registers: registerSnapshot(cpu) });
      }
    }

    try {
      stepCPU(cpu);
    } catch (caught) {
      error = caught;
      break;
    }
  }

  return {
    steps,
    terminated,
    finalPC,
    renderCalls,
    error: error ? `${error.name}: ${error.message}` : undefined,
  };
}

function summarizeAddresses(addresses) {
  if (addresses.length === 0) {
    return { count: 0, box: undefined, sample: [] };
  }

  let minAddress = Infinity;
  let maxAddress = -Infinity;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const address of addresses) {
    const coord = coordFor(VRAM, address);
    minAddress = Math.min(minAddress, address);
    maxAddress = Math.max(maxAddress, address);
    minX = Math.min(minX, coord.x);
    maxX = Math.max(maxX, coord.x);
    minY = Math.min(minY, coord.y);
    maxY = Math.max(maxY, coord.y);
  }

  return {
    count: addresses.length,
    box: { minAddress, maxAddress, minX, maxX, minY, maxY },
    sample: addresses.slice(0, 16).map((address) => ({ address, coord: coordFor(VRAM, address) })),
  };
}

function uniqueSortedAddresses(items) {
  return [...new Set(items.map((item) => item.address))].sort((a, b) => a - b);
}

function summarizeWrites(writes) {
  const uniqueAddresses = uniqueSortedAddresses(writes);
  return {
    totalBytes: writes.length,
    addresses: uniqueAddresses,
    unique: summarizeAddresses(uniqueAddresses),
    sample: writes.slice(0, 16).map((write) => ({ ...write, coord: coordFor(VRAM, write.address) })),
  };
}

function summarizeDiffs(changes) {
  const uniqueAddresses = uniqueSortedAddresses(changes);
  return {
    totalBytes: changes.length,
    addresses: uniqueAddresses,
    unique: summarizeAddresses(uniqueAddresses),
    sample: changes.slice(0, 16),
  };
}

function rendererCounts(renderCalls) {
  let primary = 0;
  let alt = 0;
  for (const call of renderCalls) {
    if (call.target === RENDERER) primary += 1;
    if (call.target === RENDERER_ALT) alt += 1;
  }
  return { primary, alt };
}

function setCursorPosition(cpu, peripherals, row, col) {
  write8(cpu, peripherals, ROW_VAR, row);
  write8(cpu, peripherals, COL_VAR, col);
  write8(cpu, peripherals, CURSOR_FLAGS, 0x16);
}

function runCase(entry, position) {
  const result = {
    entry,
    label: position.label,
    row: position.row,
    col: position.col,
  };

  try {
    const peripherals = makePeripherals();
    const cpu = makeCPU(peripherals);
    result.boot = bootToIdle(cpu);

    setCursorPosition(cpu, peripherals, position.row, position.col);
    const before = snapshotRange(cpu, peripherals, VRAM);
    const writes = installVramWriteRecorder(cpu, peripherals, VRAM);
    result.call = executeRegion(cpu, peripherals, entry);
    const after = snapshotRange(cpu, peripherals, VRAM);
    const changes = diffRange(before, after, VRAM);

    result.writeSummary = summarizeWrites(writes);
    result.diffSummary = summarizeDiffs(changes);
  } catch (error) {
    result.error = `${error.name}: ${error.message}`;
    result.writeSummary = summarizeWrites([]);
    result.diffSummary = summarizeDiffs([]);
  }

  return result;
}

function addressArraysDiffer(a, b) {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return true;
  }
  return false;
}

function comparisonData(a, b) {
  const writePositionChanged = addressArraysDiffer(
    uniqueSortedAddressesFromSummary(a.writeSummary),
    uniqueSortedAddressesFromSummary(b.writeSummary),
  );
  const diffPositionChanged = addressArraysDiffer(
    uniqueSortedAddressesFromSummary(a.diffSummary),
    uniqueSortedAddressesFromSummary(b.diffSummary),
  );

  return {
    writePositionChanged,
    diffPositionChanged,
    anyWrites: (a.writeSummary?.totalBytes ?? 0) > 0 || (b.writeSummary?.totalBytes ?? 0) > 0,
    anyDiffs: (a.diffSummary?.totalBytes ?? 0) > 0 || (b.diffSummary?.totalBytes ?? 0) > 0,
  };
}

function uniqueSortedAddressesFromSummary(summary) {
  if (Array.isArray(summary?.addresses)) return summary.addresses;
  if (!summary?.unique?.sample) return [];
  return summary.unique.sample.map((item) => item.address).sort((a, b) => a - b);
}

function printBox(prefix, summary) {
  if (!summary?.unique?.box) {
    console.log(`${prefix}: 0`);
    return;
  }
  const box = summary.unique.box;
  console.log(
    `${prefix}: ${summary.totalBytes} bytes, ${summary.unique.count} unique addresses, ` +
    `addr ${hex(box.minAddress, 6)}-${hex(box.maxAddress, 6)}, ` +
    `pixels x=${box.minX}-${box.maxX} y=${box.minY}-${box.maxY}`,
  );
}

function printCase(result) {
  console.log(`\n--- case ${result.label}: row=${result.row} col=${result.col} ---`);
  if (result.boot) {
    console.log(
      `boot: ${result.boot.steps} steps, idleHits=${result.boot.idleHits}, ` +
      `lastPC=${result.boot.lastPC === undefined ? 'unknown' : hex(result.boot.lastPC, 6)}`,
    );
  }
  if (result.call) {
    const counts = rendererCounts(result.call.renderCalls);
    console.log(
      `direct call: ${result.call.steps} steps, returned=${result.call.terminated}, ` +
      `finalPC=${result.call.finalPC === undefined ? 'unknown' : hex(result.call.finalPC, 6)}`,
    );
    if (result.call.error) console.log(`direct call error: ${result.call.error}`);
    console.log(`0x0A23C0 calls: ${counts.primary}; 0x0A239E calls: ${counts.alt}`);
    for (const renderCall of result.call.renderCalls.slice(0, 8)) {
      console.log(`  renderer step ${renderCall.step}: ${hex(renderCall.target, 6)} regs=${JSON.stringify(renderCall.registers)}`);
    }
  }
  if (result.error) console.log(`case error: ${result.error}`);

  printBox('total VRAM bytes written', result.writeSummary);
  for (const write of result.writeSummary.sample) {
    const value = write.value === undefined ? 'unknown' : hex(write.value, 2);
    console.log(`  write ${hex(write.address, 6)} pixel(${write.coord.x},${write.coord.y}) byte=${write.coord.byteInPixel} via ${write.method} value=${value}`);
  }

  printBox('VRAM byte diffs', result.diffSummary);
  for (const change of result.diffSummary.sample) {
    console.log(`  diff ${hex(change.address, 6)} pixel(${change.coord.x},${change.coord.y}): ${hex(change.before, 2)} -> ${hex(change.after, 2)}`);
  }
}

function printRegionConclusion(entry, cases) {
  const [a, b] = cases;
  const comparison = comparisonData(a, b);
  const writeMoved = comparison.anyWrites && comparison.writePositionChanged;
  const diffMoved = !comparison.anyWrites && comparison.anyDiffs && comparison.diffPositionChanged;
  const isCandidate = writeMoved || diffMoved;
  const rendererSeen = cases.some((item) => (item.call?.renderCalls?.length ?? 0) > 0);

  console.log(`\n=== Comparison for ${hex(entry, 6)} ===`);
  console.log(`VRAM write positions changed: ${writeMoved ? 'YES' : 'NO'}`);
  console.log(`VRAM diff positions changed: ${diffMoved ? 'YES' : 'NO'}`);
  console.log(`0x0A23C0/0x0A239E called: ${rendererSeen ? 'YES' : 'NO'}`);
  console.log(`CONCLUSION ${hex(entry, 6)}: ${isCandidate ? 'CURSOR CANDIDATE' : 'ELIMINATED'}`);

  return { entry, conclusion: isCandidate ? 'CURSOR CANDIDATE' : 'ELIMINATED', rendererSeen, writeMoved, diffMoved };
}

console.log('=== Phase 490 dynamic test: new cursor regions ===');
console.log(`VRAM watch range: ${hex(VRAM.start, 6)}-${hex(VRAM.end, 6)} (${VRAM.length} bytes)`);
console.log(`Cursor variables: D00595 row, D00596 col; positions ${POSITIONS.map((p) => `${p.label}=(${p.row},${p.col})`).join(', ')}`);
console.log(`Renderer watch: ${hex(RENDERER, 6)} and ${hex(RENDERER_ALT, 6)}`);

const conclusions = [];
for (const entry of REGIONS) {
  console.log(`\n\n=== Region ${hex(entry, 6)} ===`);
  const cases = POSITIONS.map((position) => runCase(entry, position));
  for (const result of cases) printCase(result);
  conclusions.push(printRegionConclusion(entry, cases));
}

console.log('\n=== Final summary ===');
for (const item of conclusions) {
  console.log(
    `${hex(item.entry, 6)}: ${item.conclusion}; ` +
    `writeMoved=${item.writeMoved ? 'YES' : 'NO'}; ` +
    `diffMoved=${item.diffMoved ? 'YES' : 'NO'}; ` +
    `rendererCalled=${item.rendererSeen ? 'YES' : 'NO'}`,
  );
}
