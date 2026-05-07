#!/usr/bin/env node

/**
 * Phase 209 — Investigate BufInsert call site at 0x0568BA
 *
 * Questions:
 * 1. What sets DE=0x0082 before CALL 0x05E2A0?
 * 2. Is 0x0082 a token value or something else?
 * 3. What happens post-call?
 * 4. Can we reach BufInsert from this block at runtime?
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const TARGET_SITE = 0x0568BA;
const BUF_INSERT = 0x05E2A0;
const CONTEXT_BEFORE = 32;
const CONTEXT_AFTER = 16;
const POST_CALL_BYTES = 16;

// ─── Utilities ───────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (v) => hexByte(v)).join(' ');
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix.toUpperCase()} ` : '';

  switch (inst.tag) {
    case 'nop': return `${prefix}NOP`;
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'from-mem') return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr)})`;
      return `${prefix}LD (${hex(inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-ind': return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-pair': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.pair).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'indexed-load-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'indexed-store-reg': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement}), ${String(inst.src).toUpperCase()}`;
    }
    case 'indexed-store-imm': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}LD (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement}), ${hexByte(inst.value)}`;
    }
    case 'indexed-alu': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}${String(inst.op).toUpperCase()} (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'indexed-inc': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}INC (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'indexed-dec': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}DEC (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'indexed-cb-bit': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'indexed-cb-set': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'indexed-cb-res': {
      const sign = inst.displacement >= 0 ? '+' : '';
      return `${prefix}RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${sign}${inst.displacement})`;
    }
    case 'rst': return `${prefix}RST ${hexByte(inst.target)}`;
    default: return `${prefix}${inst.tag}`;
  }
}

function disassembleRange(rom, start, end, mode = 'adl') {
  const rows = [];
  let pc = start;
  while (pc < end && rows.length < 64) {
    const inst = decodeInstruction(rom, pc, mode);
    const len = Math.max(1, inst.length ?? 1);
    rows.push({
      address: hex(pc),
      bytes: bytesToHex(rom.slice(pc, pc + len)),
      text: formatInstruction(inst),
      length: len,
      tag: inst.tag,
      inst,
    });
    pc += len;
  }
  return rows;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const results = {
    probe: 'phase209-0568ba-bufinsert-trace',
    target: hex(TARGET_SITE),
    bufInsert: hex(BUF_INSERT),
  };

  // Load ROM
  const rom = fs.readFileSync(ROM_PATH);
  console.log(`ROM loaded: ${rom.length} bytes`);

  // ─── Part 1: Disassemble context around 0x0568BA ───────────────────────────
  const disasmStart = TARGET_SITE - CONTEXT_BEFORE;
  const disasmEnd = TARGET_SITE + 4 + POST_CALL_BYTES; // CALL is 4 bytes in ADL

  console.log(`\n=== PART 1: Static disassembly around ${hex(TARGET_SITE)} ===`);
  console.log(`Range: ${hex(disasmStart)} - ${hex(disasmEnd)} (${disasmEnd - disasmStart} bytes)\n`);

  const contextRows = disassembleRange(rom, disasmStart, disasmEnd);
  const callSiteRow = contextRows.find(r => r.address === hex(TARGET_SITE));

  for (const row of contextRows) {
    const marker = row.address === hex(TARGET_SITE) ? ' <<<' : '';
    console.log(`  ${row.address}: ${row.bytes.padEnd(20)} ${row.text}${marker}`);
  }

  results.disassembly = {
    range: { start: hex(disasmStart), end: hex(disasmEnd) },
    instructions: contextRows.map(r => ({
      address: r.address,
      bytes: r.bytes,
      text: r.text,
    })),
    callSiteFound: !!callSiteRow,
  };

  // Look for LD DE,0x0082 in the pre-call context
  const ldDERow = contextRows.find(r =>
    r.tag === 'ld-pair-imm' && r.inst.pair === 'de' && r.inst.value === 0x0082
  );
  if (ldDERow) {
    console.log(`\n  Found LD DE,0x0082 at ${ldDERow.address} (${TARGET_SITE - parseInt(ldDERow.address.slice(2), 16)} bytes before CALL)`);
    results.ldDE = {
      address: ldDERow.address,
      distanceToCall: TARGET_SITE - parseInt(ldDERow.address.slice(2), 16),
      value: '0x0082',
      interpretation: '0x0082 = 130 decimal. Could be tColon token (0x3E) or buffer size or edit-buffer command code.',
    };
  } else {
    console.log('\n  LD DE,0x0082 NOT found in immediate pre-context. Checking raw bytes...');
    // Manual scan for 0x11 0x82 0x00 0x00 (LD DE, 0x000082 in ADL)
    for (let i = TARGET_SITE - 48; i < TARGET_SITE; i++) {
      if (rom[i] === 0x11 && rom[i+1] === 0x82 && rom[i+2] === 0x00 && rom[i+3] === 0x00) {
        console.log(`  Raw LD DE,0x000082 found at ${hex(i)}`);
        results.ldDE = { address: hex(i), rawMatch: true };
        break;
      }
    }
    if (!results.ldDE) {
      results.ldDE = { found: false, note: 'LD DE pattern not in 48-byte pre-context' };
    }
  }

  // ─── Part 2: Post-call disassembly ─────────────────────────────────────────
  const postCallStart = TARGET_SITE + 4; // After the 4-byte CALL
  const postCallEnd = postCallStart + POST_CALL_BYTES;

  console.log(`\n=== PART 2: Post-call disassembly (${hex(postCallStart)} - ${hex(postCallEnd)}) ===\n`);

  const postRows = disassembleRange(rom, postCallStart, postCallEnd);
  for (const row of postRows) {
    console.log(`  ${row.address}: ${row.bytes.padEnd(20)} ${row.text}`);
  }
  results.postCall = postRows.map(r => ({ address: r.address, bytes: r.bytes, text: r.text }));

  // ─── Part 3: Try to find transpiled block ──────────────────────────────────
  console.log('\n=== PART 3: Look for transpiled blocks ===\n');

  const candidateAddresses = [
    0x0568BA, 0x0568B0, 0x0568A0, 0x056890, 0x056880, 0x056870, 0x056860,
  ];

  let blocks = null;
  let blocksLoaded = false;

  if (fs.existsSync(TRANSPILED_PATH)) {
    console.log('  Loading ROM.transpiled.js...');
    try {
      const module = await import(`file://${TRANSPILED_PATH.replace(/\\/g, '/')}`);
      blocks = module.default || module.blocks || module;
      blocksLoaded = true;
      console.log('  Transpiled module loaded successfully.');
    } catch (err) {
      console.log(`  Failed to load transpiled JS: ${err.message}`);
    }
  } else {
    console.log('  ROM.transpiled.js not found, skipping runtime trace.');
  }

  const foundBlocks = [];
  if (blocksLoaded && blocks) {
    for (const addr of candidateAddresses) {
      const key = `${addr.toString(16).padStart(6, '0')}:adl`;
      const altKey = addr.toString(16).padStart(6, '0');
      const fn = blocks[key] || blocks[altKey];
      if (fn) {
        foundBlocks.push({ address: hex(addr), key: fn === blocks[key] ? key : altKey });
        console.log(`  Block FOUND: ${key}`);
      } else {
        console.log(`  Block NOT found: ${key}`);
      }
    }
  }

  results.transpiledBlocks = {
    loaded: blocksLoaded,
    candidates: candidateAddresses.map(a => hex(a)),
    found: foundBlocks,
  };

  // ─── Part 4: Runtime trace (if block found) ────────────────────────────────
  console.log('\n=== PART 4: Runtime trace ===\n');

  if (foundBlocks.length > 0 && blocksLoaded) {
    try {
      const runtime = await import(`file://${path.join(__dirname, 'cpu-runtime.js').replace(/\\/g, '/')}`);
      const { createCPU, createMemory, loadROM, createPeripheralBus } = runtime;

      const mem = createMemory();
      loadROM(mem, rom);
      const periph = createPeripheralBus({ timerInterrupt: false });
      const cpu = createCPU(mem, periph);

      // Setup: edit buffer at 0xD00A00, cursor pointer, A=0x34
      const EDIT_BUF = 0xD00A00;
      // Write a small buffer: length=0 initially
      mem[EDIT_BUF] = 0x00;
      mem[EDIT_BUF + 1] = 0x00;

      // Set cursor pointer (common OS location for edit cursor)
      // Store cursor address at a known location
      cpu.registers.a = 0x34; // digit "4" token
      cpu.registers.de = 0x0082;
      cpu.registers.hl = EDIT_BUF;

      // Set SP to valid RAM
      cpu.registers.sp = 0xD1A87E;

      // Use the first found block address as entry
      const entryAddr = parseInt(foundBlocks[0].address.slice(2), 16);
      cpu.registers.pc = entryAddr;

      const blocksVisited = [];
      const MAX_STEPS = 500;
      let hitBufInsert = false;
      let steps = 0;

      // Snapshot RAM before
      const ramBefore = Buffer.from(mem.slice(EDIT_BUF, EDIT_BUF + 0x20));

      console.log(`  Entry: ${hex(entryAddr)}, A=${hexByte(cpu.registers.a)}, DE=${hex(cpu.registers.de)}, HL=${hex(cpu.registers.hl)}`);

      for (steps = 0; steps < MAX_STEPS; steps++) {
        const pc = cpu.registers.pc;
        blocksVisited.push(hex(pc));

        if (pc === BUF_INSERT) {
          hitBufInsert = true;
          console.log(`  *** BufInsert (${hex(BUF_INSERT)}) REACHED at step ${steps} ***`);
          break;
        }

        // Try to execute the block
        const blockKey = `${pc.toString(16).padStart(6, '0')}:adl`;
        const blockFn = blocks[blockKey] || blocks[pc.toString(16).padStart(6, '0')];
        if (!blockFn) {
          console.log(`  Stopped: no block at ${hex(pc)} (step ${steps})`);
          break;
        }

        try {
          blockFn(cpu, mem);
        } catch (err) {
          console.log(`  Execution error at ${hex(pc)}: ${err.message}`);
          break;
        }
      }

      // Snapshot RAM after
      const ramAfter = Buffer.from(mem.slice(EDIT_BUF, EDIT_BUF + 0x20));

      // RAM diff
      const ramWrites = [];
      for (let i = 0; i < 0x20; i++) {
        if (ramBefore[i] !== ramAfter[i]) {
          ramWrites.push({
            address: hex(EDIT_BUF + i),
            before: hexByte(ramBefore[i]),
            after: hexByte(ramAfter[i]),
          });
        }
      }

      console.log(`\n  Steps executed: ${steps}`);
      console.log(`  BufInsert reached: ${hitBufInsert}`);
      console.log(`  Unique blocks visited: ${[...new Set(blocksVisited)].length}`);
      console.log(`  First 10 blocks: ${blocksVisited.slice(0, 10).join(' -> ')}`);
      if (ramWrites.length > 0) {
        console.log(`\n  RAM writes to 0xD00A00-0xD00A1F:`);
        for (const w of ramWrites) {
          console.log(`    ${w.address}: ${w.before} -> ${w.after}`);
        }
      } else {
        console.log('  No RAM writes to 0xD00A00-0xD00A1F');
      }

      results.trace = {
        entry: hex(entryAddr),
        steps,
        hitBufInsert,
        blocksVisited: [...new Set(blocksVisited)],
        ramWrites,
      };
    } catch (err) {
      console.log(`  Runtime trace failed: ${err.message}`);
      results.trace = { error: err.message };
    }
  } else {
    console.log('  No reachable block found — skipping runtime trace.');
    results.trace = { skipped: true, reason: 'no transpiled block found' };
  }

  // ─── Part 5: Token interpretation ─────────────────────────────────────────
  console.log('\n=== PART 5: Analysis of 0x0082 ===\n');

  const analysis = {
    decimal: 130,
    hex: '0x0082',
    possibleMeanings: [
      'TI-OS 2-byte token prefix (tokens 0x0082xx are system/mode tokens)',
      'Buffer operation parameter (insert position or count)',
      'Edit buffer command/mode indicator',
    ],
    note: 'In TI-OS token encoding, 0x00-0xFF are 1-byte tokens. 0x82 as a standalone 1-byte token does not correspond to a standard printable character. If DE is loaded as a 24-bit value 0x000082, this is likely a parameter to BufInsert (e.g., number of bytes to insert, or a token code).',
  };

  console.log(`  Value: ${analysis.hex} (${analysis.decimal} decimal)`);
  for (const meaning of analysis.possibleMeanings) {
    console.log(`  - ${meaning}`);
  }
  console.log(`  Note: ${analysis.note}`);

  results.analysis = analysis;

  // ─── Final JSON output ─────────────────────────────────────────────────────
  console.log('\n=== FINAL RESULTS (JSON) ===\n');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
