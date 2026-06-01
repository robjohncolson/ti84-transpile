import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROM_PATH = resolve(SCRIPT_DIR, 'ROM.rom');
const ROM_SIZE = 0x400000;
const MAX_ROM_ADDR = ROM_SIZE - 1;
const CURSOR_MIN = 0x060000;
const CURSOR_MAX = 0x062000;

const TARGETS = [
  { name: '0x061000', address: 0x061000, bytes: [0x00, 0x10, 0x06] },
  { name: '0x061003', address: 0x061003, bytes: [0x03, 0x10, 0x06] },
  { name: '0x06029D', address: 0x06029d, bytes: [0x9d, 0x02, 0x06] },
];

const TARGET_ADDRESS_SET = new Set(TARGETS.map((target) => target.address));

const DIRECT_BRANCH_OPCODES = new Map([
  [0xc2, 'JP NZ'],
  [0xc3, 'JP'],
  [0xc4, 'CALL NZ'],
  [0xca, 'JP Z'],
  [0xcc, 'CALL Z'],
  [0xcd, 'CALL'],
  [0xd2, 'JP NC'],
  [0xd4, 'CALL NC'],
  [0xda, 'JP C'],
  [0xdc, 'CALL C'],
  [0xe2, 'JP PO'],
  [0xe4, 'CALL PO'],
  [0xea, 'JP PE'],
  [0xec, 'CALL PE'],
  [0xf2, 'JP P'],
  [0xf4, 'CALL P'],
  [0xfa, 'JP M'],
  [0xfc, 'CALL M'],
]);

function fmtAddr(value) {
  return `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
}

function fmtOffset(value) {
  return `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
}

function read24(rom, offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function isValidRomAddress(value) {
  return value >= 0 && value <= MAX_ROM_ADDR;
}

function isCursorTextAddress(value) {
  return value >= CURSOR_MIN && value <= CURSOR_MAX;
}

function isAllFF(rom, start, end) {
  for (let i = start; i < end; i++) {
    if (rom[i] !== 0xff) return false;
  }
  return true;
}

function isMostlyErasedAround(rom, offset, radius = 32) {
  const start = Math.max(0, offset - radius);
  const end = Math.min(rom.length, offset + 3 + radius);
  let checked = 0;
  let ff = 0;

  for (let i = start; i < end; i++) {
    if (i >= offset && i < offset + 3) continue;
    checked++;
    if (rom[i] === 0xff) ff++;
  }

  return checked > 0 && ff / checked >= 0.95;
}

function searchPattern(rom, b0, b1, b2) {
  const matches = [];
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === b0 && rom[i + 1] === b1 && rom[i + 2] === b2) {
      matches.push(i);
    }
  }
  return matches;
}

function classifyDirectBranchOperand(rom, offset) {
  if (offset <= 0) return null;

  const opcode = rom[offset - 1];
  const mnemonic = DIRECT_BRANCH_OPCODES.get(opcode);
  if (mnemonic) {
    return {
      offset: offset - 1,
      opcode,
      mnemonic,
    };
  }

  return null;
}

function hexWindow(rom, center, radius = 16) {
  const start = Math.max(0, center - radius);
  const end = Math.min(rom.length, center + 3 + radius);
  const bytes = [];

  for (let i = start; i < end; i++) {
    const byte = rom[i].toString(16).toUpperCase().padStart(2, '0');
    bytes.push(i >= center && i < center + 3 ? `[${byte}]` : ` ${byte} `);
  }

  return `${fmtOffset(start)}: ${bytes.join('')}`;
}

function findNearby06Addresses(rom, offset, radius = 16) {
  const start = Math.max(0, offset - radius);
  const end = Math.min(rom.length - 2, offset + 3 + radius);
  const found = [];

  for (let i = start; i < end; i++) {
    if (i === offset) continue;
    if (rom[i + 2] !== 0x06) continue;
    if (isAllFF(rom, i, i + 3)) continue;

    const address = read24(rom, i);
    if (isValidRomAddress(address)) {
      found.push({
        offset: i,
        address,
        rel: i - offset,
        alignedWithMatch: (i - offset) % 3 === 0,
      });
    }
  }

  return found;
}

function decodeAlignedEntriesAround(rom, offset, radius = 64) {
  const windowStart = Math.max(0, offset - radius);
  const windowEnd = Math.min(rom.length, offset + 3 + radius);
  let first = offset;

  while (first - 3 >= windowStart) {
    first -= 3;
  }

  const entries = [];
  for (let entryOffset = first; entryOffset + 2 < windowEnd; entryOffset += 3) {
    const address = read24(rom, entryOffset);
    const erased = isAllFF(rom, entryOffset, entryOffset + 3);
    entries.push({
      offset: entryOffset,
      address,
      valid: !erased && isValidRomAddress(address),
      erased,
      isTarget: entryOffset === offset,
      isCursorText: isCursorTextAddress(address),
    });
  }

  const targetIndex = entries.findIndex((entry) => entry.offset === offset);
  if (targetIndex === -1) {
    return { entries, tableEntries: [] };
  }

  let runStart = targetIndex;
  while (runStart > 0 && entries[runStart - 1].valid) {
    runStart--;
  }

  let runEnd = targetIndex;
  while (runEnd < entries.length - 1 && entries[runEnd + 1].valid) {
    runEnd++;
  }

  return {
    entries,
    tableEntries: entries.slice(runStart, runEnd + 1),
  };
}

function describeEntry(entry, index, targetOffset) {
  const tags = [];
  if (entry.isTarget) tags.push('TARGET');
  if (entry.isCursorText) tags.push('0x060000-0x062000');
  if (!entry.valid) tags.push(entry.erased ? 'ERASED' : 'INVALID');

  const rel = entry.offset - targetOffset;
  const marker = entry.valid ? fmtAddr(entry.address) : 'invalid';
  const suffix = tags.length > 0 ? ` ${tags.map((tag) => `[${tag}]`).join(' ')}` : '';

  return `  [${index.toString().padStart(2, '0')}] ${fmtOffset(entry.offset)} rel ${rel.toString().padStart(4, ' ')} -> ${marker}${suffix}`;
}

function candidateScore(candidate) {
  let score = 0;

  if (isCursorTextAddress(candidate.address)) score += 1000;
  if (candidate.sources.some((source) => source.target === '0x061003')) score += 200;
  if (candidate.sources.some((source) => source.target === '0x061000')) score += 100;

  const bestDistance = Math.min(...candidate.sources.map((source) => Math.abs(source.entryIndex - source.targetIndex)));
  score += Math.max(0, 50 - bestDistance);

  return score;
}

function formatBytes(rom, start, count) {
  const bytes = [];
  const end = Math.min(rom.length, start + count);
  for (let i = start; i < end; i++) {
    bytes.push(rom[i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function rel8(byte) {
  return byte < 0x80 ? byte : byte - 0x100;
}

function fallbackDecodeInstruction(rom, pc) {
  const op = rom[pc];
  const b1 = rom[pc + 1] ?? 0;
  const b2 = rom[pc + 2] ?? 0;
  const b3 = rom[pc + 3] ?? 0;
  const branch = DIRECT_BRANCH_OPCODES.get(op);

  if (branch && pc + 3 < rom.length) {
    return {
      size: 4,
      text: `${branch} ${fmtAddr(b1 | (b2 << 8) | (b3 << 16))}`,
    };
  }

  switch (op) {
    case 0x00:
      return { size: 1, text: 'NOP' };
    case 0x01:
      return { size: 3, text: `LD BC,${fmtAddr(b1 | (b2 << 8)).replace('0x00', '0x')}` };
    case 0x06:
      return { size: 2, text: `LD B,0x${b1.toString(16).toUpperCase().padStart(2, '0')}` };
    case 0x0e:
      return { size: 2, text: `LD C,0x${b1.toString(16).toUpperCase().padStart(2, '0')}` };
    case 0x10:
      return { size: 2, text: `DJNZ ${fmtAddr((pc + 2 + rel8(b1)) & 0xffffff)}` };
    case 0x11:
      return { size: 3, text: `LD DE,${fmtAddr(b1 | (b2 << 8)).replace('0x00', '0x')}` };
    case 0x16:
      return { size: 2, text: `LD D,0x${b1.toString(16).toUpperCase().padStart(2, '0')}` };
    case 0x18:
      return { size: 2, text: `JR ${fmtAddr((pc + 2 + rel8(b1)) & 0xffffff)}` };
    case 0x1e:
      return { size: 2, text: `LD E,0x${b1.toString(16).toUpperCase().padStart(2, '0')}` };
    case 0x20:
      return { size: 2, text: `JR NZ,${fmtAddr((pc + 2 + rel8(b1)) & 0xffffff)}` };
    case 0x21:
      return { size: 3, text: `LD HL,${fmtAddr(b1 | (b2 << 8)).replace('0x00', '0x')}` };
    case 0x26:
      return { size: 2, text: `LD H,0x${b1.toString(16).toUpperCase().padStart(2, '0')}` };
    case 0x28:
      return { size: 2, text: `JR Z,${fmtAddr((pc + 2 + rel8(b1)) & 0xffffff)}` };
    case 0x2e:
      return { size: 2, text: `LD L,0x${b1.toString(16).toUpperCase().padStart(2, '0')}` };
    case 0x30:
      return { size: 2, text: `JR NC,${fmtAddr((pc + 2 + rel8(b1)) & 0xffffff)}` };
    case 0x31:
      return { size: 3, text: `LD SP,${fmtAddr(b1 | (b2 << 8)).replace('0x00', '0x')}` };
    case 0x36:
      return { size: 2, text: `LD (HL),0x${b1.toString(16).toUpperCase().padStart(2, '0')}` };
    case 0x38:
      return { size: 2, text: `JR C,${fmtAddr((pc + 2 + rel8(b1)) & 0xffffff)}` };
    case 0x3e:
      return { size: 2, text: `LD A,0x${b1.toString(16).toUpperCase().padStart(2, '0')}` };
    case 0x76:
      return { size: 1, text: 'HALT' };
    case 0xc0:
      return { size: 1, text: 'RET NZ' };
    case 0xc8:
      return { size: 1, text: 'RET Z' };
    case 0xc9:
      return { size: 1, text: 'RET' };
    case 0xd0:
      return { size: 1, text: 'RET NC' };
    case 0xd8:
      return { size: 1, text: 'RET C' };
    case 0xe0:
      return { size: 1, text: 'RET PO' };
    case 0xe8:
      return { size: 1, text: 'RET PE' };
    case 0xf0:
      return { size: 1, text: 'RET P' };
    case 0xf8:
      return { size: 1, text: 'RET M' };
    default:
      return { size: 1, text: `DB 0x${op.toString(16).toUpperCase().padStart(2, '0')}` };
  }
}

function normalizeDecodeResult(result) {
  if (typeof result === 'string') {
    return { size: 1, text: result };
  }

  if (!result || typeof result !== 'object') {
    return null;
  }

  const text =
    result.text ??
    result.asm ??
    result.mnemonic ??
    result.disasm ??
    result.instruction ??
    result.opcode;

  if (!text) {
    return null;
  }

  const size = result.size ?? result.length ?? result.bytes?.length ?? result.byteLength ?? 1;
  return {
    size: Number.isFinite(size) && size > 0 ? size : 1,
    text: String(text),
  };
}

function tryExternalInstructionDecode(decoderModule, rom, pc) {
  if (!decoderModule) return null;

  const fns = [
    decoderModule.decodeInstruction,
    decoderModule.disassembleInstruction,
    decoderModule.decode,
    decoderModule.disassembleOne,
    decoderModule.default,
  ].filter((fn) => typeof fn === 'function');

  for (const fn of fns) {
    const attempts = [
      () => fn(rom, pc),
      () => fn(pc, rom),
      () => fn(rom.subarray(pc, Math.min(rom.length, pc + 16)), pc),
      () => fn({ rom, memory: rom, pc, address: pc }),
    ];

    for (const attempt of attempts) {
      try {
        const decoded = normalizeDecodeResult(attempt());
        if (decoded) return decoded;
      } catch {
        // Keep probing compatible decoder signatures.
      }
    }
  }

  return null;
}

async function loadDecoderModule() {
  try {
    return await import('./ez80-decoder.js');
  } catch (error) {
    console.log(`Decoder import failed; using fallback byte decoder: ${error.message}`);
    return null;
  }
}

function disassembleBytes(rom, address, count, decoderModule) {
  const lines = [];
  const end = Math.min(rom.length, address + count);
  let pc = address;

  while (pc < end) {
    const decoded = tryExternalInstructionDecode(decoderModule, rom, pc) ?? fallbackDecodeInstruction(rom, pc);
    const size = Math.max(1, Math.min(decoded.size, end - pc));
    lines.push(`${fmtAddr(pc)}  ${formatBytes(rom, pc, size).padEnd(14, ' ')} ${decoded.text}`);
    pc += size;
  }

  return lines;
}

function addCandidate(candidateMap, entry, source) {
  if (!isCursorTextAddress(entry.address)) return;
  if (TARGET_ADDRESS_SET.has(entry.address)) return;

  const key = entry.address;
  const existing = candidateMap.get(key) ?? {
    address: entry.address,
    sources: [],
  };

  existing.sources.push(source);
  candidateMap.set(key, existing);
}

function analyzeMatch(rom, target, offset, candidateMap) {
  const directBranch = classifyDirectBranchOperand(rom, offset);
  const mostlyErased = isMostlyErasedAround(rom, offset);
  const nearby06 = findNearby06Addresses(rom, offset, 16);
  const decoded = decodeAlignedEntriesAround(rom, offset, 64);
  const tableEntries = decoded.tableEntries;
  const cursorEntries = tableEntries.filter((entry) => entry.isCursorText);
  const confirmedTable =
    !mostlyErased &&
    !directBranch &&
    tableEntries.length >= 3 &&
    (nearby06.length > 0 || cursorEntries.length > 1);

  console.log('');
  console.log(`${target.name} bytes found at ${fmtOffset(offset)}`);

  if (directBranch) {
    console.log(`  Filter: likely direct ${directBranch.mnemonic} operand at ${fmtOffset(directBranch.offset)}; skipped as code operand.`);
  } else {
    console.log('  Filter: no immediate CALL/JP opcode directly before match.');
  }

  if (mostlyErased) {
    console.log('  Filter: surrounding region is mostly 0xFF; skipped as erased/padded area.');
  } else {
    console.log('  Filter: surrounding region is not erased.');
  }

  if (nearby06.length > 0) {
    console.log(`  Nearby 0x06xxxx values within +/-16 bytes: ${nearby06.length}`);
    for (const found of nearby06) {
      const aligned = found.alignedWithMatch ? 'aligned' : 'unaligned';
      console.log(`    ${fmtOffset(found.offset)} rel ${found.rel >= 0 ? '+' : ''}${found.rel}: ${fmtAddr(found.address)} (${aligned})`);
    }
  } else {
    console.log('  Nearby 0x06xxxx values within +/-16 bytes: none');
  }

  console.log(`  Surrounding bytes: ${hexWindow(rom, offset, 16)}`);

  if (!mostlyErased && !directBranch) {
    console.log(`  Potential 3-byte table run containing ${target.name}: ${tableEntries.length} entries`);
    tableEntries.forEach((entry, index) => {
      console.log(describeEntry(entry, index, offset));
    });

    if (confirmedTable) {
      console.log('  Table classification: CONFIRMED candidate function-pointer table');
      const targetIndex = tableEntries.findIndex((entry) => entry.isTarget);

      tableEntries.forEach((entry, entryIndex) => {
        addCandidate(candidateMap, entry, {
          target: target.name,
          matchOffset: offset,
          entryOffset: entry.offset,
          entryIndex,
          targetIndex,
        });
      });
    } else {
      console.log('  Table classification: weak/unconfirmed table-like run');
    }
  }
}

async function main() {
  const rom = readFileSync(ROM_PATH);
  const decoderModule = await loadDecoderModule();
  const candidateMap = new Map();

  console.log('Phase 493 indirect dispatch table byte-pattern search');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${fmtAddr(rom.length)} bytes${rom.length === ROM_SIZE ? ' (expected 4MB)' : ' (unexpected size)'}`);
  console.log('Target little-endian encodings:');
  for (const target of TARGETS) {
    console.log(`  ${target.name} -> ${target.bytes.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
  }

  const allMatches = [];
  for (const target of TARGETS) {
    const matches = searchPattern(rom, ...target.bytes);
    allMatches.push({ target, matches });
  }

  console.log('');
  console.log('Raw byte-pattern matches:');
  for (const { target, matches } of allMatches) {
    const formatted = matches.length > 0 ? matches.map(fmtOffset).join(', ') : 'none';
    console.log(`  ${target.name}: ${matches.length} match(es): ${formatted}`);
  }

  for (const { target, matches } of allMatches) {
    for (const offset of matches) {
      analyzeMatch(rom, target, offset, candidateMap);
    }
  }

  const candidates = [...candidateMap.values()].sort((a, b) => candidateScore(b) - candidateScore(a) || a.address - b.address);

  console.log('');
  console.log('New cursor/text-system candidates found in confirmed tables:');
  if (candidates.length === 0) {
    console.log('  none');
    return;
  }

  for (const candidate of candidates) {
    const sources = candidate.sources
      .map((source) => `${source.target}@${fmtOffset(source.matchOffset)} entry ${source.entryIndex}`)
      .join('; ');
    console.log(`  ${fmtAddr(candidate.address)} score=${candidateScore(candidate)} sources=${sources}`);
  }

  const best = candidates[0];
  console.log('');
  console.log(`Most promising candidate: ${fmtAddr(best.address)}`);
  console.log('First 50 bytes:');
  console.log(`  ${formatBytes(rom, best.address, 50)}`);
  console.log('Quick static disassembly:');
  for (const line of disassembleBytes(rom, best.address, 50, decoderModule)) {
    console.log(`  ${line}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
