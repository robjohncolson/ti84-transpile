#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(romPath);

const START = 0x009118;
const FRAME_SETUP = 0x002197;
const CALLER_PATTERN = [0xCD, 0x18, 0x91, 0x00];

const PRIORITY_NOTES = new Map([
  [0x0089F8, 'known from prior phases as USB init via 0x00CC71(0, 2, 2000)'],
  [0x008DA0, 'known from prior phases as Link init via 0x00CC71(0, 1, 300)'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readU24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function readS8(addr) {
  const value = rom[addr];
  return value >= 0x80 ? value - 0x100 : value;
}

function formatDisp(disp) {
  return disp < 0 ? `-${Math.abs(disp)}` : `+${disp}`;
}

function bytesFor(addr, length) {
  return Array.from(rom.slice(addr, addr + length))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function decodeAt(addr) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];
  const b2 = rom[addr + 2];
  const b3 = rom[addr + 3];

  if (b0 === 0x21) {
    const imm = readU24(addr + 1);
    return {
      addr,
      len: 4,
      bytes: bytesFor(addr, 4),
      type: 'ld-hl-imm',
      text: `LD HL,${hex(imm)}`,
      imm,
    };
  }

  if (b0 === 0xCD) {
    const target = readU24(addr + 1);
    return {
      addr,
      len: 4,
      bytes: bytesFor(addr, 4),
      type: 'call',
      text: `CALL ${hex(target)}`,
      target,
    };
  }

  if (b0 === 0xDD && b1 === 0x36) {
    const disp = readS8(addr + 2);
    const imm = rom[addr + 3];
    return {
      addr,
      len: 4,
      bytes: bytesFor(addr, 4),
      type: 'ld-ixd-imm',
      text: `LD (IX${formatDisp(disp)}),${hex(imm, 2)}`,
      disp,
      imm,
    };
  }

  if (b0 === 0xDD && b1 === 0x77) {
    const disp = readS8(addr + 2);
    return {
      addr,
      len: 3,
      bytes: bytesFor(addr, 3),
      type: 'ld-ixd-a',
      text: `LD (IX${formatDisp(disp)}),A`,
      disp,
    };
  }

  if (b0 === 0xDD && b1 === 0x7E) {
    const disp = readS8(addr + 2);
    return {
      addr,
      len: 3,
      bytes: bytesFor(addr, 3),
      type: 'ld-a-ixd',
      text: `LD A,(IX${formatDisp(disp)})`,
      disp,
    };
  }

  if (b0 === 0xFE) {
    const imm = rom[addr + 1];
    return {
      addr,
      len: 2,
      bytes: bytesFor(addr, 2),
      type: 'cp-imm',
      text: `CP ${hex(imm, 2)}`,
      imm,
    };
  }

  if (b0 === 0x28) {
    const offset = readS8(addr + 1);
    const target = (addr + 2 + offset) & 0xffffff;
    return {
      addr,
      len: 2,
      bytes: bytesFor(addr, 2),
      type: 'jr-z',
      text: `JR Z,${hex(target)}`,
      target,
      offset,
    };
  }

  if (b0 === 0xDD && b1 === 0xF9) {
    return {
      addr,
      len: 2,
      bytes: bytesFor(addr, 2),
      type: 'ld-sp-ix',
      text: 'LD SP,IX',
    };
  }

  if (b0 === 0xDD && b1 === 0xE1) {
    return {
      addr,
      len: 2,
      bytes: bytesFor(addr, 2),
      type: 'pop-ix',
      text: 'POP IX',
    };
  }

  if (b0 === 0xC9) {
    return {
      addr,
      len: 1,
      bytes: bytesFor(addr, 1),
      type: 'ret',
      text: 'RET',
    };
  }

  throw new Error(`Unsupported opcode at ${hex(addr)}: ${bytesFor(addr, 6)}`);
}

function disassembleFunction(start) {
  const instructions = [];
  let addr = start;

  for (;;) {
    const instruction = decodeAt(addr);
    instructions.push(instruction);
    addr += instruction.len;
    if (instruction.type === 'ret') {
      break;
    }
  }

  return instructions;
}

function findCallers(targetPattern) {
  const hits = [];
  for (let addr = 0; addr <= rom.length - targetPattern.length; addr += 1) {
    let matched = true;
    for (let i = 0; i < targetPattern.length; i += 1) {
      if (rom[addr + i] !== targetPattern[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(addr);
    }
  }
  return hits;
}

function annotateInstruction(instruction, priorities, fallback) {
  if (instruction.addr === START) {
    return 'prepare HL=-1 for 1-byte local frame';
  }
  if (instruction.type === 'call' && instruction.target === FRAME_SETUP) {
    return 'common frame setup helper';
  }
  if (instruction.type === 'ld-ixd-imm' && instruction.disp === -1 && instruction.imm === 0) {
    return 'initialize local result byte';
  }

  const priority = priorities.find((entry) => entry.call.addr === instruction.addr);
  if (priority) {
    const note = PRIORITY_NOTES.get(priority.call.target);
    return `priority ${priority.priority} attempt${note ? `; ${note}` : ''}`;
  }

  const postStore = priorities.find((entry) => entry.store.addr === instruction.addr);
  if (postStore) {
    return `cache priority ${postStore.priority} return A into local scratch`;
  }

  const postLoad = priorities.find((entry) => entry.reload.addr === instruction.addr);
  if (postLoad) {
    return `reload cached result for priority ${postLoad.priority}`;
  }

  const postCompare = priorities.find((entry) => entry.compare.addr === instruction.addr);
  if (postCompare) {
    return `success test for priority ${postCompare.priority}: A must equal 1`;
  }

  const postJump = priorities.find((entry) => entry.branch.addr === instruction.addr);
  if (postJump) {
    return `if priority ${postJump.priority} returned 1, exit immediately via epilogue`;
  }

  if (fallback && fallback.call.addr === instruction.addr) {
    return 'terminal fallback call if priorities 1-6 all missed';
  }
  if (fallback && fallback.store.addr === instruction.addr) {
    return 'cache fallback return A before epilogue';
  }
  if (instruction.type === 'ld-sp-ix') {
    return 'common epilogue';
  }
  return '';
}

const instructions = disassembleFunction(START);
const end = instructions[instructions.length - 1].addr;
const size = end - START + 1;

const priorities = [];
let fallback = null;

for (let i = 0; i < instructions.length; i += 1) {
  const call = instructions[i];
  if (call.type !== 'call' || call.target === FRAME_SETUP) {
    continue;
  }

  const store = instructions[i + 1];
  const reload = instructions[i + 2];
  const compare = instructions[i + 3];
  const branch = instructions[i + 4];

  const isPriority =
    store?.type === 'ld-ixd-a' &&
    store.disp === -1 &&
    reload?.type === 'ld-a-ixd' &&
    reload.disp === -1 &&
    compare?.type === 'cp-imm' &&
    compare.imm === 0x01 &&
    branch?.type === 'jr-z';

  if (isPriority) {
    priorities.push({
      priority: priorities.length + 1,
      call,
      store,
      reload,
      compare,
      branch,
    });
    continue;
  }

  if (store?.type === 'ld-ixd-a' && store.disp === -1) {
    fallback = { call, store };
  }
}

const localWrites = instructions.filter((instruction) => instruction.type === 'ld-ixd-imm' || instruction.type === 'ld-ixd-a');
const localReads = instructions.filter((instruction) => instruction.type === 'ld-a-ixd');
const callerHits = findCallers(CALLER_PATTERN);

const out = [];

out.push('Phase 430 - Trace 0x009118 Sequential Priority Init Chain');
out.push(`ROM: ${romPath}`);
out.push('');
out.push('=== FUNCTION BOUNDS ===');
out.push(`Start: ${hex(START)}`);
out.push(`End:   ${hex(end)}`);
out.push(`Size:  ${size} bytes (${hex(size, 4)})`);
out.push('');
out.push('=== DIRECT CALLERS ===');
for (const caller of callerHits) {
  out.push(`- ${hex(caller)}`);
}
out.push('');
out.push('=== DISASSEMBLY ===');
for (const instruction of instructions) {
  const comment = annotateInstruction(instruction, priorities, fallback);
  out.push(
    `${hex(instruction.addr)}  ${instruction.bytes.padEnd(15, ' ')}  ${instruction.text.padEnd(18, ' ')}${comment ? ` ; ${comment}` : ''}`
  );
}
out.push('');
out.push('=== PRIORITY CHAIN ===');
for (const priority of priorities) {
  const note = PRIORITY_NOTES.get(priority.call.target);
  out.push(
    `- Priority ${priority.priority}: ${hex(priority.call.target)} (CALL at ${hex(priority.call.addr)})${note ? ` - ${note}` : ''}`
  );
}
if (fallback) {
  out.push(`- Fallback after priority 6 miss: ${hex(fallback.call.target)} (CALL at ${hex(fallback.call.addr)})`);
}
out.push('');
out.push('=== SUCCESS TEST LOGIC ===');
out.push('- Each priority attempt uses the same four-instruction check:');
out.push('  `LD (IX-1),A` -> `LD A,(IX-1)` -> `CP 0x01` -> `JR Z,0x00917F`');
out.push('- The branch target is the shared epilogue at `0x00917F`, so the first callee that returns `A=1` wins.');
out.push('- The store/reload pair does not compute a priority index; it only caches the callee result byte in the 1-byte local scratch slot.');
out.push('');
out.push('=== RAM / I-O ===');
out.push(`- Local scratch writes: ${localWrites.map((instruction) => hex(instruction.addr)).join(', ')}`);
out.push(`- Local scratch reads:  ${localReads.map((instruction) => hex(instruction.addr)).join(', ')}`);
out.push('- Absolute RAM references in 0x009118: none');
out.push('- Port I/O instructions in 0x009118: none');
out.push('');
out.push('=== RETURN VALUE ===');
out.push('- On an early success, `JR Z` jumps straight to the epilogue, leaving the successful callee\'s `A` value intact.');
out.push('- If priorities 1-6 all fail (`A != 1` each time), the wrapper executes `CALL 0x009087` and returns whatever `A` that fallback leaves behind.');
out.push('- Therefore 0x009118 returns a status byte, not the priority number that succeeded.');
out.push('');
out.push('=== INTERPRETATION ===');
out.push('- The byte stream confirms six compare-gated priority initializers.');
out.push('- The function is not just six calls plus RET: it ends with a seventh, ungated fallback call to `0x009087`.');

console.log(out.join('\n'));
