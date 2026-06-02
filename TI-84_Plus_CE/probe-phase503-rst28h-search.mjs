import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const ROM_SIZE = 4_194_304;
const BCALL_TABLE_BASE = 0x020104;
const BCALL_ENTRIES = 2_178;
const BCALL_ENTRY_SIZE = 4;

const CURSOR_TARGETS = new Set([
  0x061003,
  0x061061,
  0x061980,
]);

const PRIMARY_START = 0x096B00;
const PRIMARY_END = 0x096E00;
const BROADER_START = 0x096000;
const BROADER_END = 0x09A000;

const rom = readFileSync(ROM_PATH);

if (rom.length !== ROM_SIZE) {
  throw new Error(`Expected ${ROM_PATH} to be ${ROM_SIZE} bytes, got ${rom.length}`);
}

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24le(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function isInRange(value, start, end) {
  return value >= start && value <= end;
}

function classifyTarget(target) {
  const flags = [];

  if (CURSOR_TARGETS.has(target)) {
    flags.push('EXACT_CURSOR_TARGET');
  }

  if (isInRange(target, 0x060000, 0x062000)) {
    flags.push('CURSOR_REGION_0x060000-0x062000');
  }

  return flags;
}

function resolveBcall(addr) {
  const index = rom[addr + 1] | (rom[addr + 2] << 8);
  const tableAddr = BCALL_TABLE_BASE + (index * BCALL_ENTRY_SIZE);
  let target = null;
  let valid = false;

  if (
    index < BCALL_ENTRIES &&
    tableAddr + 3 < rom.length &&
    rom[tableAddr] === 0xC3
  ) {
    target = read24le(tableAddr + 1);
    valid = true;
  }

  return { index, tableAddr, target, valid };
}

function scanRange(start, end) {
  const hits = [];

  for (let addr = start; addr <= end && addr + 2 < rom.length; addr += 1) {
    if (rom[addr] !== 0xE7) {
      continue;
    }

    const resolved = resolveBcall(addr);
    const flags = resolved.valid && resolved.target !== null
      ? classifyTarget(resolved.target)
      : [];

    hits.push({ addr, ...resolved, flags });
  }

  return hits;
}

function printHit(hit) {
  const indexLabel = `${hit.index} (${hex(hit.index, 4)})`;
  const targetLabel = hit.valid && hit.target !== null ? hex(hit.target) : 'INVALID_TABLE_ENTRY';
  const flagLabel = hit.flags.length > 0 ? ` [${hit.flags.join(', ')}]` : '';

  console.log(
    `${hex(hit.addr)}: RST 28h index=${indexLabel} table=${hex(hit.tableAddr)} target=${targetLabel}${flagLabel}`,
  );
}

function countCursorRelated(hits) {
  return hits.filter((hit) => hit.flags.length > 0).length;
}

const primaryHits = scanRange(PRIMARY_START, PRIMARY_END);
const broaderHits = scanRange(BROADER_START, BROADER_END);

console.log(`RST 28h / BCALL scan for ${ROM_PATH}`);
console.log('');
console.log(`Primary region ${hex(PRIMARY_START)}-${hex(PRIMARY_END)}:`);

if (primaryHits.length === 0) {
  console.log('  No RST 28h opcodes found.');
} else {
  for (const hit of primaryHits) {
    printHit(hit);
  }
}

console.log('');
console.log(`Broader region ${hex(BROADER_START)}-${hex(BROADER_END)}:`);

if (broaderHits.length === 0) {
  console.log('  No RST 28h opcodes found.');
} else {
  for (const hit of broaderHits) {
    printHit(hit);
  }
}

console.log('');
console.log('Summary:');
console.log(`  Primary E7 bytes found: ${primaryHits.length}`);
console.log(`  Primary cursor-related resolutions: ${countCursorRelated(primaryHits)}`);
console.log(`  Broader E7 bytes found: ${broaderHits.length}`);
console.log(`  Broader cursor-related resolutions: ${countCursorRelated(broaderHits)}`);
