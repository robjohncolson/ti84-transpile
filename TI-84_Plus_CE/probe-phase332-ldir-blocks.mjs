#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const rom = fs.readFileSync(ROM_PATH);

const MODE_RECORDS = [
  { name: '16bpp', romAddr: 0x05550C },
  { name: '8bpp', romAddr: 0x055519 },
];

const LDIR_LEN = 13;
const SCALE_BASE = 0x05320F;
const SCALE_RECORDS = 4;
const SCALE_RECORD_SIZE = 12;
const SCALE_FIELD_NAMES = [
  'horizontal width kernel ptr',
  'vertical height kernel ptr',
  'horizontal repeat kernel ptr',
  'vertical repeat kernel ptr',
];

const FIELD_SPECS = [
  {
    name: 'display width',
    offset: 0,
    size: 3,
    ramAddr: 0xD02FD9,
    note:
      'Reader sites subtract this from candidate X coordinates, so it is the right-edge width bound.',
  },
  {
    name: 'display height',
    offset: 3,
    size: 3,
    ramAddr: 0xD02FDC,
    note:
      'Reader sites compare or subtract this against Y/row values, so it is the bottom-edge height bound.',
  },
  {
    name: 'mode / bpp byte',
    offset: 6,
    size: 1,
    ramAddr: 0xD02FDF,
    note:
      'The only direct reader compares it to 0x08 and chooses a 1-byte vs 2-byte seed path before LDIR.',
  },
  {
    name: 'row stride (bytes)',
    offset: 7,
    size: 3,
    ramAddr: 0xD02FE0,
    note:
      'Reader sites feed this into row-offset multiplication helpers, so it is bytes per framebuffer row.',
  },
  {
    name: 'VRAM base address',
    offset: 10,
    size: 3,
    ramAddr: 0xD02FE3,
    note:
      'Reader sites add this after row/column byte offsets are computed, so it is the framebuffer base.',
  },
];

const USAGE_NOTES = new Map([
  [0x0525F9, 'loads width for region-span and X clipping in a draw-region helper'],
  [0x052601, 'loads height and subtracts D02FD6 clip floor to compute visible rows'],
  [0x052B49, 'loads width to reject pixel X values outside the framebuffer'],
  [0x052FF4, 'loads height to reject pixel Y values outside the framebuffer'],
  [0x053BDF, 'loads width as the right-edge guard inside the glyph-scaler path'],
  [0x053C08, 'sibling width guard inside the glyph-scaler path'],
  [0x0542BB, 'loads height as the bottom-edge guard in a blit/plot path'],
  [0x0548E2, 'loads the height low byte for a row-loop compare'],
  [0x054AE3, 'sibling height low-byte compare'],
  [0x054E7A, 'loads row stride for the variable-width renderer row offset'],
  [0x05501F, 'reuses row stride to convert row counts into byte offsets'],
  [0x055033, 'adds the VRAM base after the byte offset is formed'],
  [0x0555AF, 'public X-range check rejects x >= display width'],
  [0x0555EF, 'sibling X-range check rejects x >= display width'],
  [0x05569E, 'branches on 0x08 vs non-0x08 to choose 8bpp vs 16bpp fill seeding'],
  [0x0556D4, 'loads stride for a rectangle/fill helper'],
  [0x0556DC, 'adds VRAM base, height, and stride while walking rectangle rows'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function read24(buffer, addr) {
  return (
    (buffer[addr] ?? 0) |
    ((buffer[addr + 1] ?? 0) << 8) |
    ((buffer[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase332-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const moduleUrl = pathToFileURL(assets.modulePath).href;
    const romModule = await import(moduleUrl);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;
    return normalizeBlocks(rawBlocks);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

function decodeModeRecord({ name, romAddr }) {
  const raw = rom.subarray(romAddr, romAddr + LDIR_LEN);
  return {
    name,
    romAddr,
    raw,
    fields: {
      width: read24(raw, 0),
      height: read24(raw, 3),
      modeByte: raw[6] ?? 0,
      stride: read24(raw, 7),
      vramBase: read24(raw, 10),
    },
  };
}

function decodeScaleRecord(index) {
  const base = SCALE_BASE + index * SCALE_RECORD_SIZE;
  const raw = rom.subarray(base, base + SCALE_RECORD_SIZE);
  const pointers = [];
  for (let field = 0; field < 4; field += 1) {
    pointers.push(read24(rom, base + field * 3));
  }
  return { index, base, raw, pointers };
}

function byteRole(byteOffset) {
  if (byteOffset <= 2) return `display width byte ${byteOffset}`;
  if (byteOffset <= 5) return `display height byte ${byteOffset - 3}`;
  if (byteOffset === 6) return 'mode / bpp byte';
  if (byteOffset <= 9) return `row stride byte ${byteOffset - 7}`;
  return `VRAM base byte ${byteOffset - 10}`;
}

function firstInstructionPc(lines, fromIndex) {
  for (let index = fromIndex; index >= 0; index -= 1) {
    const match = lines[index].match(/\/\/\s0x([0-9a-f]{6})/i);
    if (match) return parseInt(match[1], 16);
  }
  return null;
}

function extractSnippet(lines, matchIndex) {
  const start = Math.max(0, matchIndex - 1);
  const end = Math.min(lines.length, matchIndex + 3);
  return lines
    .slice(start, end)
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' | ');
}

function collectReaderSites(blocks, addr) {
  const addrHex = `0x${addr.toString(16)}`;
  const sites = new Map();

  for (const [id, block] of Object.entries(blocks)) {
    const source = block.source ?? block.fn?.toString() ?? '';
    if (!source.includes(addrHex)) continue;

    const lines = source.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      let kind = null;

      if (line.includes(`read8(${addrHex})`)) {
        kind = 'read8';
      } else if (line.includes(`read16(${addrHex})`)) {
        kind = 'read16';
      } else if (line.includes(`read24(${addrHex})`)) {
        kind = 'read24';
      } else if (line.includes(`cpu.hl = ${addrHex};`)) {
        const lookahead = lines.slice(index + 1, Math.min(lines.length, index + 4)).join('\n');
        if (lookahead.includes(`readIndirect8('hl')`)) {
          kind = 'indirect8';
        } else if (lookahead.includes(`readIndirect16('hl')`)) {
          kind = 'indirect16';
        } else if (lookahead.includes(`readIndirect24('hl')`)) {
          kind = 'indirect24';
        }
      }

      if (!kind) continue;

      const pc = firstInstructionPc(lines, index) ?? parseInt(id.slice(0, 6), 16);
      const key = `${hex(pc)}:${kind}`;
      if (sites.has(key)) continue;

      sites.set(key, {
        pc,
        blockId: id,
        kind,
        snippet: extractSnippet(lines, index),
        usage: USAGE_NOTES.get(pc) ?? 'reader site found in lifted block source',
      });
    }
  }

  return [...sites.values()].sort((left, right) => left.pc - right.pc);
}

function printByteMap(record) {
  console.log(`${record.name} byte map @ ${hex(record.romAddr)}:`);
  for (let offset = 0; offset < record.raw.length; offset += 1) {
    const ramAddr = 0xD02FD9 + offset;
    console.log(
      `  +${offset.toString().padStart(2, '0')}  ${hex(record.romAddr + offset)} -> ${hex(ramAddr)}  ${hexByte(record.raw[offset])}  ${byteRole(offset)}`,
    );
  }
  console.log('');
}

function printFieldDecode(record) {
  console.log(`${record.name} decoded fields:`);
  console.log(`  width      = ${hex(record.fields.width)} (${record.fields.width})`);
  console.log(`  height     = ${hex(record.fields.height)} (${record.fields.height})`);
  console.log(`  mode byte  = ${hexByte(record.fields.modeByte)}`);
  console.log(`  stride     = ${hex(record.fields.stride)} (${record.fields.stride})`);
  console.log(`  VRAM base  = ${hex(record.fields.vramBase)}`);
  console.log('');
}

function diffLabel(left, right) {
  return left === right ? 'same' : 'DIFF';
}

function valueForField(record, field) {
  if (field.name === 'display width') return record.fields.width;
  if (field.name === 'display height') return record.fields.height;
  if (field.name === 'mode / bpp byte') return record.fields.modeByte;
  if (field.name === 'row stride (bytes)') return record.fields.stride;
  return record.fields.vramBase;
}

function renderFieldValue(field, value) {
  if (field.size === 1) return hexByte(value);
  return `${hex(value)} (${value})`;
}

async function main() {
  const blocks = await loadBlocks();
  const decodedRecords = MODE_RECORDS.map(decodeModeRecord);
  const scaleRecords = Array.from({ length: SCALE_RECORDS }, (_, index) => decodeScaleRecord(index));

  console.log('Phase 332: Decode the 13-byte LDIR source blocks at 0x05550C and 0x055519');
  console.log('');

  console.log('=== 1. Raw 13-byte ROM blocks ===');
  for (const record of decodedRecords) {
    console.log(`${record.name} @ ${hex(record.romAddr)}..${hex(record.romAddr + LDIR_LEN - 1)}:`);
    console.log(`  bytes   = ${bytesToHex(record.raw)}`);
    console.log(`  hex     = ${Buffer.from(record.raw).toString('hex')}`);
    console.log('');
  }

  console.log('=== 2. Byte-by-byte annotation ===');
  for (const record of decodedRecords) {
    printByteMap(record);
    printFieldDecode(record);
  }

  console.log('=== 3. Field-by-field comparison ===');
  for (const field of FIELD_SPECS) {
    const left = valueForField(decodedRecords[0], field);
    const right = valueForField(decodedRecords[1], field);
    console.log(`${field.name} @ ${hex(field.ramAddr)} (+${field.offset}..+${field.offset + field.size - 1}):`);
    console.log(`  16bpp = ${renderFieldValue(field, left)}`);
    console.log(`  8bpp  = ${renderFieldValue(field, right)}`);
    console.log(`  diff  = ${diffLabel(left, right)}`);
    console.log(`  note  = ${field.note}`);
    console.log('');
  }

  console.log('High-level change summary:');
  console.log(`  width/height stay fixed at ${decodedRecords[0].fields.width}x${decodedRecords[0].fields.height}.`);
  console.log(`  mode byte changes ${hexByte(decodedRecords[0].fields.modeByte)} -> ${hexByte(decodedRecords[1].fields.modeByte)}.`);
  console.log(`  stride changes ${decodedRecords[0].fields.stride} -> ${decodedRecords[1].fields.stride}.`);
  console.log(`  VRAM base changes ${hex(decodedRecords[0].fields.vramBase)} -> ${hex(decodedRecords[1].fields.vramBase)}.`);
  console.log('');

  console.log('=== 4. Reader cross-reference for D02FD9..D02FE5 ===');
  const byteReaderSummary = [];
  for (let offset = 0; offset < LDIR_LEN; offset += 1) {
    const addr = 0xD02FD9 + offset;
    const sites = collectReaderSites(blocks, addr);
    byteReaderSummary.push({ offset, addr, sites });
  }

  console.log('Per-byte direct-reader summary:');
  for (const entry of byteReaderSummary) {
    const mode = entry.sites.length === 0 ? 'no standalone reader hit' : `${entry.sites.length} reader site(s)`;
    console.log(`  ${hex(entry.addr)} (+${entry.offset.toString().padStart(2, '0')}): ${mode} -> ${byteRole(entry.offset)}`);
  }
  console.log('');

  for (const field of FIELD_SPECS) {
    const sites = collectReaderSites(blocks, field.ramAddr);
    console.log(`${field.name} readers at ${hex(field.ramAddr)}: ${sites.length} unique site(s)`);
    for (const site of sites) {
      console.log(`  ${hex(site.pc)} [${site.kind}] ${site.usage}`);
      console.log(`    ${site.snippet}`);
    }
    console.log('');
  }

  console.log('Interpretation from reader behavior:');
  console.log('  D02FD9..D02FDB behave as a 24-bit width field.');
  console.log('  D02FDC..D02FDE behave as a 24-bit height field.');
  console.log('  D02FDF is not a generic flag bag: the only direct reader tests it against 0x08 for 8bpp behavior.');
  console.log('  D02FE0..D02FE2 behave as a 24-bit stride field.');
  console.log('  D02FE3..D02FE5 behave as a 24-bit framebuffer base pointer.');
  console.log('');

  console.log('=== 5. Scaling-kernel record dump at 0x05320F ===');
  const scaleRaw = rom.subarray(SCALE_BASE, SCALE_BASE + SCALE_RECORDS * SCALE_RECORD_SIZE);
  console.log(`Raw 48 bytes: ${bytesToHex(scaleRaw)}`);
  console.log(`Hex string : ${Buffer.from(scaleRaw).toString('hex')}`);
  console.log('');

  for (const record of scaleRecords) {
    console.log(`Record ${record.index} @ ${hex(record.base)}..${hex(record.base + SCALE_RECORD_SIZE - 1)}:`);
    console.log(`  bytes    = ${bytesToHex(record.raw)}`);
    for (let field = 0; field < record.pointers.length; field += 1) {
      console.log(`  +${field * 3}..+${field * 3 + 2} -> ${SCALE_FIELD_NAMES[field]} = ${hex(record.pointers[field])}`);
    }
    console.log('');
  }

  console.log('Comparison against the scaling records:');
  console.log('  The LDIR blobs are 13-byte geometry records: [width24, height24, mode8, stride24, vramBase24].');
  console.log('  The scaling records are 12-byte pointer tables: four 24-bit kernel pointers per scale level.');
  console.log('  They only match in superficial layout size (mostly 3-byte chunks); they are not the same structure.');
  console.log('');

  console.log('=== 6. Bottom line ===');
  console.log('  ROM 0x05550C and 0x055519 are alternate LCD/VRAM descriptor records for the same 320x240 display.');
  console.log('  16bpp keeps stride 640 and base 0xD40000 with mode byte 0x10.');
  console.log('  8bpp halves stride to 320, switches base to 0xD52C00, and changes the mode byte to 0x08.');
  console.log('  The scaling table at 0x05320F is unrelated font-kernel metadata, not a second copy of the LCD descriptor format.');
}

main().catch((error) => {
  console.error('Phase 332 probe failed:', error);
  process.exitCode = 1;
});
