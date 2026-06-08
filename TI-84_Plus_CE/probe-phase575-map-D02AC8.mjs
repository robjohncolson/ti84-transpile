import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');
const decoderPath = path.join(__dirname, 'ez80-decoder.js');
const reportPath = path.join(__dirname, 'phase575p3-map-D02AC8-report.md');

const TARGET = 0xd02ac8;
const PATTERN = Buffer.from([0xc8, 0x2a, 0xd0]);

const knownFunctions = [
  { name: '0x06F6E7 font param writer', start: 0x06f6e7, end: 0x06f780 },
  { name: '0x0A89FE LCD param computation', start: 0x0a89fe, end: 0x0a8b40 },
  { name: '0x0BA57E LCD param setter', start: 0x0ba57e, end: 0x0ba650 },
];

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

async function loadDecoder() {
  try {
    const mod = await import(pathToFileURL(decoderPath).href);
    const candidates = [
      mod.decodeInstruction,
      mod.decode,
      mod.default?.decodeInstruction,
      mod.default?.decode,
      typeof mod.default === 'function' ? mod.default : null,
    ].filter(Boolean);
    for (const fn of candidates) {
      try {
        const sample = fn(Buffer.from([0x00]), 0);
        if (sample) return fn;
      } catch {
        // Try the next export shape below.
      }
    }
  } catch {
    // Manual fallback below is enough for D02AC8 LD forms.
  }
  return null;
}

function normalizeDecoded(decoded, offset) {
  if (!decoded) return null;
  if (typeof decoded === 'string') return { text: decoded, size: 1 };
  const text =
    decoded.text ??
    decoded.asm ??
    decoded.mnemonic ??
    decoded.instruction ??
    decoded.disasm ??
    String(decoded);
  const size = decoded.size ?? decoded.length ?? decoded.bytes ?? decoded.byteLength ?? 1;
  return { text, size: Number.isFinite(size) && size > 0 ? size : 1, offset };
}

function manualDecode(rom, offset) {
  const op = rom[offset];
  const b1 = rom[offset + 1];
  const b2 = rom[offset + 2];
  const b3 = rom[offset + 3];
  const addr = b1 | (b2 << 8) | (b3 << 16);
  const regs = {
    0x3a: 'A',
    0x32: 'A',
    0x01: 'BC',
    0x11: 'DE',
    0x21: 'HL',
    0x22: 'HL',
    0x2a: 'HL',
    0xed4b: 'BC',
    0xed43: 'BC',
    0xed5b: 'DE',
    0xed53: 'DE',
    0xed6b: 'HL',
    0xed63: 'HL',
    0xed7b: 'SP',
    0xed73: 'SP',
  };

  if (addr === TARGET) {
    if (op === 0x3a) return { text: `LD A,(${hex(TARGET)})`, size: 4 };
    if (op === 0x32) return { text: `LD (${hex(TARGET)}),A`, size: 4 };
    if (op === 0x2a) return { text: `LD HL,(${hex(TARGET)})`, size: 4 };
    if (op === 0x22) return { text: `LD (${hex(TARGET)}),HL`, size: 4 };
  }

  if (op === 0xed) {
    const edop = (op << 8) | b1;
    const edAddr = b2 | (b3 << 8) | (rom[offset + 4] << 16);
    if (edAddr === TARGET) {
      if ([0xed4b, 0xed5b, 0xed6b, 0xed7b].includes(edop)) {
        return { text: `LD ${regs[edop]},(${hex(TARGET)})`, size: 5 };
      }
      if ([0xed43, 0xed53, 0xed63, 0xed73].includes(edop)) {
        return { text: `LD (${hex(TARGET)}),${regs[edop]}`, size: 5 };
      }
    }
  }

  return { text: `DB ${hex(op, 2)}`, size: 1 };
}

function decodeAt(rom, offset, decoder) {
  if (decoder) {
    try {
      const decoded = normalizeDecoded(decoder(rom, offset), offset);
      if (decoded) return decoded;
    } catch {
      try {
        const decoded = normalizeDecoded(decoder(rom.subarray(offset), offset), offset);
        if (decoded) return decoded;
      } catch {
        // Use targeted fallback.
      }
    }
  }
  return manualDecode(rom, offset);
}

function classify(text) {
  const upper = text.toUpperCase().replace(/\s+/g, '');
  if (upper.includes(`(${hex(TARGET).toUpperCase()})`) || upper.includes('(D02AC8H)') || upper.includes('($D02AC8)')) {
    if (upper.startsWith('LD(') || upper.includes(`LD(${hex(TARGET).toUpperCase()}),`) || upper.includes('LD(D02AC8H),')) return 'write';
    if (upper.startsWith('LD') && upper.includes(`,(${hex(TARGET).toUpperCase()})`)) return 'read';
  }
  if (upper.includes('C82AD0')) return 'embedded-data-or-undecoded';
  return 'unknown';
}

function findInstructionStart(rom, patternOffset, decoder) {
  for (let start = Math.max(0, patternOffset - 3); start <= patternOffset; start++) {
    const decoded = decodeAt(rom, start, decoder);
    if (start + decoded.size > patternOffset && start + decoded.size <= patternOffset + PATTERN.length + 2) {
      const bytes = rom.subarray(start, start + decoded.size);
      if (bytes.includes(PATTERN[0]) && bytes.includes(PATTERN[1]) && bytes.includes(PATTERN[2])) return start;
    }
  }
  return patternOffset;
}

function context(rom, center, decoder) {
  const rows = [];
  let pc = Math.max(0, center - 16);
  while (pc < Math.min(rom.length, center + 18)) {
    const decoded = decodeAt(rom, pc, decoder);
    const bytes = [...rom.subarray(pc, pc + decoded.size)].map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    rows.push({ pc, bytes, text: decoded.text, mark: pc === center });
    pc += decoded.size;
  }
  return rows;
}

function knownFunctionFor(offset) {
  return knownFunctions.find((fn) => offset >= fn.start && offset < fn.end)?.name ?? 'unknown / unmapped';
}

function renderReport(refs) {
  const reads = refs.filter((r) => r.kind === 'read');
  const writes = refs.filter((r) => r.kind === 'write');
  const other = refs.filter((r) => r.kind !== 'read' && r.kind !== 'write');
  const lines = [];
  lines.push('# Phase 575 P3 - D02AC8 Reference Map');
  lines.push('');
  lines.push(`Target RAM address: \`${hex(TARGET)}\``);
  lines.push(`Little-endian byte pattern: \`C8 2A D0\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total raw pattern references: ${refs.length}`);
  lines.push(`- Reads: ${reads.length}`);
  lines.push(`- Writes: ${writes.length}`);
  lines.push(`- Other / undecoded: ${other.length}`);
  lines.push('');
  lines.push('## References');
  lines.push('');
  lines.push('| Pattern offset | Instruction start | Kind | Instruction | Known function |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const ref of refs) {
    lines.push(`| \`${hex(ref.patternOffset)}\` | \`${hex(ref.instructionOffset)}\` | ${ref.kind} | \`${ref.instruction}\` | ${ref.knownFunction} |`);
  }
  lines.push('');
  lines.push('## Read References');
  lines.push('');
  if (!reads.length) lines.push('None found.');
  for (const ref of reads) lines.push(`- \`${hex(ref.instructionOffset)}\`: \`${ref.instruction}\` (${ref.knownFunction})`);
  lines.push('');
  lines.push('## Write References');
  lines.push('');
  if (!writes.length) lines.push('None found.');
  for (const ref of writes) lines.push(`- \`${hex(ref.instructionOffset)}\`: \`${ref.instruction}\` (${ref.knownFunction})`);
  lines.push('');
  lines.push('## Surrounding Context');
  for (const ref of refs) {
    lines.push('');
    lines.push(`### ${hex(ref.instructionOffset)} - ${ref.kind}`);
    lines.push('');
    lines.push(`Known function: ${ref.knownFunction}`);
    lines.push('');
    lines.push('```asm');
    for (const row of ref.context) {
      lines.push(`${row.mark ? '=> ' : '   '}${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}`);
    }
    lines.push('```');
  }
  lines.push('');
  lines.push('## Cross-Reference Notes');
  lines.push('');
  for (const fn of knownFunctions) {
    const hits = refs.filter((r) => r.instructionOffset >= fn.start && r.instructionOffset < fn.end);
    lines.push(`- ${fn.name}: ${hits.length ? hits.map((h) => `\`${hex(h.instructionOffset)}\``).join(', ') : 'no D02AC8 references found'}.`);
  }
  lines.push('');
  lines.push('## Hypothesis');
  lines.push('');
  lines.push('D02AC8 is likely a compact display/font parameter selector or mode byte. The confirmed session-574 write at 0x06F768 is guarded by `CP 0x04`, which suggests the stored value is a small enumerated parameter rather than a pointer or counter. If all discovered references cluster around font and LCD parameter routines, D02AC8 should be treated as shared state feeding display/font layout computation.');
  lines.push('');
  lines.push('Generated by `probe-phase575-map-D02AC8.mjs`.');
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const rom = fs.readFileSync(romPath);
  const decoder = await loadDecoder();
  const refs = [];

  for (let i = 0; i <= rom.length - PATTERN.length; i++) {
    if (rom[i] !== PATTERN[0] || rom[i + 1] !== PATTERN[1] || rom[i + 2] !== PATTERN[2]) continue;
    const instructionOffset = findInstructionStart(rom, i, decoder);
    const decoded = decodeAt(rom, instructionOffset, decoder);
    refs.push({
      patternOffset: i,
      instructionOffset,
      instruction: decoded.text,
      kind: classify(decoded.text),
      knownFunction: knownFunctionFor(instructionOffset),
      context: context(rom, instructionOffset, decoder),
    });
  }

  fs.writeFileSync(reportPath, renderReport(refs));
  console.log(`D02AC8 references: ${refs.length}`);
  console.log(`Report: ${reportPath}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
