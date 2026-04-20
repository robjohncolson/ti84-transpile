#!/usr/bin/env node
// Phase 202E - Static scan: find every ROM location that could write to LCD
// upbase register (0xE00010-0xE00012).
//
// Strategy: stream through ROM.transpiled.js, parse the PRELIFTED_BLOCKS
// dictionary incrementally, and flag blocks whose instruction dasm references
// the upbase MMIO cells via any of:
//   (a) Direct 24-bit address literal (ld (0xe00010), ...   ld hl, 0xe00010 ...)
//   (b) Port-IO pattern with bc = 0xD010/0xD011/0xD012 (sis + out (c), r)
//   (c) Register-based store after loading hl/de/ix with 0xe00010
//
// Produces phase202e-upbase-writer-scan-report.md with PC / dasm / reason,
// plus caller cross-reference (block CALL edges).

import fs from 'node:fs';
import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRANSPILED_JS = path.join(__dirname, 'ROM.transpiled.js');
const REPORT_PATH = path.join(__dirname, 'phase202e-upbase-writer-scan-report.md');

// ---------------------------------------------------------------------------
// Detection patterns
// ---------------------------------------------------------------------------

// Literal upbase address: e00010 / e00011 / e00012 (case-insensitive, ADL mode).
const LITERAL_ADDR_RE = /0x(?:00)?e000(?:10|11|12)\b/i;

// Port-IO idiom: ld bc, 0xd010 / 0xd011 / 0xd012 (sis-prefixed eZ80 port write)
// Includes 24-bit forms.
const PORTIO_BC_RE = /\bld\s+bc\s*,\s*0x(?:[0-9a-f]{2})?d01[012]\b/i;

// OUT-C on any register (only flagged if same block has a qualifying bc load).
const OUT_C_RE = /\bout\s*\(\s*c\s*\)\s*,/i;

const STORE_MEM_RE = /\bld\s*\(\s*0x(?:00)?e000(?:10|11|12)\b/i;

// Z80-mode (MBASE=0xE0) short-addr stores/loads targeting 0x0010-0x0012.
// These are the PRIMARY upbase idiom on the TI-84 CE — see raw-ROM byte scan.
// Patterns (dasm text as produced by ez80-decoder.js):
//   ld (0x0010), hl / bc / de / a / ix / iy
//   ld hl, 0x0010 / ld bc, 0x0011 / etc.
const Z80_SHORT_STORE_RE = /\bld\s*\(\s*0x0+01[012]\s*\)\s*,\s*(?:hl|bc|de|a|ix|iy)\b/i;
const Z80_SHORT_LOAD_IMM_RE = /\bld\s+(?:hl|bc|de|ix|iy)\s*,\s*0x0+01[012]\b/i;

// ---------------------------------------------------------------------------
// Streaming parser for PRELIFTED_BLOCKS
// ---------------------------------------------------------------------------
//
// The transpiled JS is roughly:
//   export const PRELIFTED_BLOCKS = {
//     "000000:z80": { "id": ..., "startPc": 0, "instructions": [...], "exits": [...], "source": "..." },
//     ...
//   };
//
// Each block is pretty-printed JSON spanning many lines. We detect block
// boundaries by tracking brace depth starting at the first `{` that follows
// the `export const PRELIFTED_BLOCKS = ` token, then slice each depth-1 block
// object and JSON.parse it individually. Much cheaper than parsing the whole
// dictionary in one go (which would OOM at 214 MB).

async function* streamBlocks(filePath) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1 << 20 });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  // Single char-by-char state machine across all lines. State:
  //   phase:
  //     0 = pre-start (haven't seen `export const PRELIFTED_BLOCKS`)
  //     1 = waiting for top-level `{`
  //     2 = inside the outer dictionary at depth 1, waiting for a block `{`
  //     3 = buffering a block object (depth >= 2)
  //     4 = done (saw the closing `}` of the outer dict)
  //   innerDepth: brace depth inside the current block object (starts at 1 when we enter phase 3)
  //   inString: true if currently inside a JSON string literal
  //   escaped: true if the previous char inside a string was a backslash

  let phase = 0;
  let innerDepth = 0;
  let inString = false;
  let escaped = false;
  let buf = '';

  for await (const rawLine of rl) {
    const line = rawLine + '\n';

    if (phase === 0) {
      if (line.includes('PRELIFTED_BLOCKS')) {
        phase = 1;
      } else {
        continue;
      }
    }

    for (let i = 0; i < line.length; i++) {
      const ch = line.charCodeAt(i);

      if (phase === 1) {
        if (ch === 0x7b /* { */) phase = 2;
        continue;
      }

      if (phase === 2) {
        if (ch === 0x7b /* { */) {
          phase = 3;
          innerDepth = 1;
          inString = false;
          escaped = false;
          buf = '{';
          continue;
        }
        if (ch === 0x7d /* } */) {
          phase = 4;
          continue;
        }
        // Whitespace / key chars / comma / quote — ignore at this phase.
        continue;
      }

      if (phase === 3) {
        buf += line[i];
        if (inString) {
          if (escaped) {
            escaped = false;
          } else if (ch === 0x5c /* \ */) {
            escaped = true;
          } else if (ch === 0x22 /* " */) {
            inString = false;
          }
          continue;
        }
        // Not in a string.
        if (ch === 0x22 /* " */) {
          inString = true;
          continue;
        }
        if (ch === 0x7b /* { */) {
          innerDepth++;
        } else if (ch === 0x7d /* } */) {
          innerDepth--;
          if (innerDepth === 0) {
            // Block complete.
            let parsed;
            try {
              parsed = JSON.parse(buf);
              yield parsed;
            } catch (err) {
              // Swallow and keep going — best effort scan.
            }
            buf = '';
            phase = 2;
          }
        }
        continue;
      }

      if (phase === 4) {
        return;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function classifyInstruction(dasm, mode) {
  const reasons = [];
  if (STORE_MEM_RE.test(dasm)) reasons.push('literal-store');
  else if (LITERAL_ADDR_RE.test(dasm)) reasons.push('literal-addr');
  // Z80-mode short-addr variants only count when the block is actually z80.
  if (mode === 'z80') {
    if (Z80_SHORT_STORE_RE.test(dasm)) reasons.push('z80-short-store');
    else if (Z80_SHORT_LOAD_IMM_RE.test(dasm)) reasons.push('z80-short-load-imm');
  }
  return reasons;
}

function blockHasPortIoToUpbase(instructions) {
  // Find any `ld bc, 0x??d01[012]` whose block also has an `out (c), r` later.
  let bcHit = -1;
  let outHit = -1;
  for (let i = 0; i < instructions.length; i++) {
    const dasm = instructions[i].dasm || '';
    if (PORTIO_BC_RE.test(dasm)) bcHit = i;
    if (bcHit >= 0 && i >= bcHit && OUT_C_RE.test(dasm)) {
      outHit = i;
      break;
    }
  }
  if (bcHit >= 0 && outHit >= 0) return { bcPc: instructions[bcHit].pc, outPc: instructions[outHit].pc, bcDasm: instructions[bcHit].dasm, outDasm: instructions[outHit].dasm };
  return null;
}

async function main() {
  if (!fs.existsSync(TRANSPILED_JS)) {
    console.error(`Missing ${TRANSPILED_JS}. Run scripts/transpile-ti84-rom.mjs first.`);
    process.exit(1);
  }

  const candidates = [];
  // caller graph: map targetPc -> Set(callerStartPc)
  const callerGraph = new Map();
  let blockCount = 0;

  for await (const block of streamBlocks(TRANSPILED_JS)) {
    blockCount++;
    if (blockCount % 10000 === 0) {
      process.stderr.write(`  scanned ${blockCount} blocks...\n`);
    }

    const instructions = block.instructions || [];
    const exits = block.exits || [];

    // Build caller graph from exits (call / jump edges).
    for (const exit of exits) {
      if (exit.type === 'call' || exit.type === 'jump' || exit.type === 'conditional-jump' || exit.type === 'conditional-call') {
        if (typeof exit.target === 'number') {
          if (!callerGraph.has(exit.target)) callerGraph.set(exit.target, new Set());
          callerGraph.get(exit.target).add(block.startPc);
        }
      }
    }

    const instrHits = [];
    for (const ins of instructions) {
      const dasm = ins.dasm || '';
      const reasons = classifyInstruction(dasm, block.mode || ins.mode);
      if (reasons.length > 0) {
        instrHits.push({ pc: ins.pc, dasm, reasons });
      }
    }

    const portHit = blockHasPortIoToUpbase(instructions);

    if (instrHits.length === 0 && !portHit) continue;

    candidates.push({
      blockId: block.id,
      startPc: block.startPc,
      mode: block.mode,
      instrHits,
      portHit,
    });
  }

  process.stderr.write(`Scanned ${blockCount} total blocks. Found ${candidates.length} candidate blocks.\n`);

  // -------------------------------------------------------------------------
  // Build markdown report
  // -------------------------------------------------------------------------
  const lines = [];
  lines.push('# Phase 202E - LCD Upbase Writer Static Scan');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`Scanned **${blockCount}** pre-lifted blocks from \`ROM.transpiled.js\`.`);
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push('Find every ROM location that could write to the LCD upbase register at');
  lines.push('`0xE00010-0xE00012`. Prior ISR probes (phase 202C) confirmed the interrupt');
  lines.push('service routines never touch upbase, so the writer is a one-shot init routine.');
  lines.push('');
  lines.push('## Detection rules');
  lines.push('');
  lines.push('| Reason | Pattern |');
  lines.push('|---|---|');
  lines.push('| `literal-store` | `ld (0xe000{10,11,12}), ...` — direct 24-bit ADL memory store |');
  lines.push('| `literal-addr`  | Any instruction whose dasm contains `0xe000{10,11,12}` as a literal operand (typically `ld hl,0xe00010` priming a later `ld (hl), r`) |');
  lines.push('| `port-io`       | Block contains `ld bc, 0x??d01{0,1,2}` followed by `out (c), r` — eZ80 port-write idiom that hits MMIO `0xE000{10,11,12}` |');
  lines.push('| `z80-short-store` | Z80-mode block with `ld (0x001{0,1,2}), reg` — MBASE=0xE0 makes this an upbase write. **Primary TI-84 CE idiom.** |');
  lines.push('| `z80-short-load-imm` | Z80-mode block with `ld reg, 0x001{0,1,2}` — likely priming a pointer to upbase |');
  lines.push('');
  lines.push(`## Summary`);
  lines.push('');
  lines.push(`Total candidate blocks: **${candidates.length}**`);
  const portCount = candidates.filter(c => c.portHit).length;
  const storeCount = candidates.filter(c => c.instrHits.some(h => h.reasons.includes('literal-store'))).length;
  const addrCount = candidates.filter(c => c.instrHits.some(h => h.reasons.includes('literal-addr'))).length;
  const z80StoreCount = candidates.filter(c => c.instrHits.some(h => h.reasons.includes('z80-short-store'))).length;
  const z80LoadCount = candidates.filter(c => c.instrHits.some(h => h.reasons.includes('z80-short-load-imm'))).length;
  lines.push(`- `+'`literal-store`'+` matches: **${storeCount}**`);
  lines.push(`- `+'`literal-addr`'+` matches: **${addrCount}**`);
  lines.push(`- `+'`port-io`'+` matches: **${portCount}**`);
  lines.push(`- `+'`z80-short-store`'+` matches: **${z80StoreCount}**`);
  lines.push(`- `+'`z80-short-load-imm`'+` matches: **${z80LoadCount}**`);
  lines.push('');

  // Highlight ranges of interest
  const OS_INIT_LO = 0x08C000, OS_INIT_HI = 0x08D000;
  const LCD_INIT_LO = 0x005C00, LCD_INIT_HI = 0x006200;
  function rangeTag(pc) {
    if (pc >= OS_INIT_LO && pc < OS_INIT_HI) return ' **[OS-init]**';
    if (pc >= LCD_INIT_LO && pc < LCD_INIT_HI) return ' **[LCD-init]**';
    return '';
  }

  const highlighted = candidates.filter(c => {
    return (c.startPc >= OS_INIT_LO && c.startPc < OS_INIT_HI) ||
           (c.startPc >= LCD_INIT_LO && c.startPc < LCD_INIT_HI);
  });
  if (highlighted.length > 0) {
    lines.push(`## Highlighted candidates (OS-init 0x08C000-0x08D000 or LCD-init 0x005C00-0x006200)`);
    lines.push('');
    lines.push('| Block startPc | Reason | First hit PC | Dasm |');
    lines.push('|---|---|---|---|');
    for (const c of highlighted) {
      let reason = '';
      let hitPc = '';
      let dasm = '';
      if (c.portHit) {
        reason = 'port-io';
        hitPc = '0x' + c.portHit.outPc.toString(16).padStart(6, '0');
        dasm = `${c.portHit.bcDasm} ; ${c.portHit.outDasm}`;
      } else if (c.instrHits.length > 0) {
        reason = c.instrHits[0].reasons.join(',');
        hitPc = '0x' + c.instrHits[0].pc.toString(16).padStart(6, '0');
        dasm = c.instrHits[0].dasm;
      }
      lines.push(`| 0x${c.startPc.toString(16).padStart(6, '0')}${rangeTag(c.startPc)} | ${reason} | ${hitPc} | \`${dasm}\` |`);
    }
    lines.push('');
  }

  // -------------------------------------------------------------------------
  // Full candidate table — sorted by startPc
  // -------------------------------------------------------------------------
  lines.push('## All candidates');
  lines.push('');
  lines.push('| Block startPc | Hit PC | Match reason | Dasm | Callers |');
  lines.push('|---|---|---|---|---|');

  candidates.sort((a, b) => a.startPc - b.startPc);

  for (const c of candidates) {
    const callers = callerGraph.get(c.startPc);
    const callerStr = callers ? [...callers].slice(0, 5).map(pc => '0x' + pc.toString(16).padStart(6, '0')).join(' ') + (callers.size > 5 ? ` (+${callers.size - 5})` : '') : '-';
    const startPcHex = '0x' + c.startPc.toString(16).padStart(6, '0') + rangeTag(c.startPc);

    if (c.portHit) {
      const dasm = `${c.portHit.bcDasm} ; ${c.portHit.outDasm}`;
      const hitPc = '0x' + c.portHit.outPc.toString(16).padStart(6, '0');
      lines.push(`| ${startPcHex} | ${hitPc} | port-io | \`${dasm}\` | ${callerStr} |`);
    }
    for (const h of c.instrHits) {
      const hitPc = '0x' + h.pc.toString(16).padStart(6, '0');
      lines.push(`| ${startPcHex} | ${hitPc} | ${h.reasons.join(',')} | \`${h.dasm}\` | ${callerStr} |`);
    }
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(`Script: \`TI-84_Plus_CE/phase202e-upbase-writer-scan.mjs\`.`);
  lines.push('');

  fs.writeFileSync(REPORT_PATH, lines.join('\n'));
  console.log(`Wrote ${REPORT_PATH}`);
  console.log(`Blocks scanned: ${blockCount}`);
  console.log(`Candidate blocks: ${candidates.length}`);
  console.log(`  port-io: ${portCount}`);
  console.log(`  literal-store: ${storeCount}`);
  console.log(`  literal-addr: ${addrCount}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
