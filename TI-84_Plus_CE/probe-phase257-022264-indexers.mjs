#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TABLE_BASE = 0x022264;
const ALT_BASE = 0x022260;
const PAGE_BASE = 0x022200;
const PAGE_MASK = 0xFFFF00;
const WINDOW_RADIUS = 20;
const TABLE_ENTRY_COUNT = 32;
const XREF_ENTRY_COUNT = 5;

const SIMPLE_IMM24_OPS = new Map([
  [0x01, 'LD BC'],
  [0x11, 'LD DE'],
  [0x21, 'LD HL'],
  [0xC3, 'JP'],
  [0xCD, 'CALL'],
]);

const SLA_REG_NAMES = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function byteString(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function bytesAt(start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rom.length, safeStart + Math.max(0, length));
  return byteString(rom.subarray(safeStart, safeEnd));
}

function formatContext(addr, length) {
  const beforeCount = Math.min(4, addr);
  const afterStart = addr + length;
  const afterCount = Math.min(4, Math.max(0, rom.length - afterStart));
  const before = bytesAt(addr - beforeCount, beforeCount);
  const middle = bytesAt(addr, length);
  const after = bytesAt(afterStart, afterCount);

  return `${before ? `${before} ` : ''}[${middle}]${after ? ` ${after}` : ''}`;
}

function readUInt24LE(addr) {
  if (addr < 0 || addr + 2 >= rom.length) {
    return null;
  }

  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function formatSignedByte(byte) {
  if (byte < 0x80) {
    return `+${hexByte(byte)}`;
  }

  return `-${hexByte(0x100 - byte)}`;
}

function describeImmediateLikeHit(addr) {
  const target = readUInt24LE(addr);
  const opcodeAddr = addr - 1;

  if (target === null) {
    return 'decode=unknown (truncated 24-bit value)';
  }

  if (opcodeAddr < 0) {
    return 'decode=unknown (hit at ROM start)';
  }

  const opcode = rom[opcodeAddr];
  const mnemonic = SIMPLE_IMM24_OPS.get(opcode);

  if (!mnemonic) {
    return `decode=unknown (prev ${hexByte(opcode)} @ ${hex(opcodeAddr)})`;
  }

  return `decode=${mnemonic} ${hex(target)} @ ${hex(opcodeAddr)} bytes=${bytesAt(opcodeAddr, 4)}`;
}

function tagForTarget(target) {
  if (target === TABLE_BASE) {
    return 'table-base';
  }

  if (target === ALT_BASE) {
    return 'table-base-minus-4';
  }

  if ((target & PAGE_MASK) === PAGE_BASE) {
    return '0x0222xx';
  }

  return '';
}

function makeReferenceHit(addr) {
  const target = readUInt24LE(addr) ?? 0;

  return {
    addr,
    target,
    tag: tagForTarget(target),
    context: formatContext(addr, 3),
    decode: describeImmediateLikeHit(addr),
  };
}

function findExactImmediateHits(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let addr = 0; addr <= rom.length - 3; addr += 1) {
    if (rom[addr] === lo && rom[addr + 1] === mid && rom[addr + 2] === hi) {
      hits.push(makeReferenceHit(addr));
    }
  }

  return hits;
}

function findPageImmediateHits() {
  const hits = [];

  for (let addr = 0; addr <= rom.length - 3; addr += 1) {
    if (rom[addr + 1] === 0x22 && rom[addr + 2] === 0x02) {
      hits.push(makeReferenceHit(addr));
    }
  }

  return hits;
}

function printReferenceSection(title, hits) {
  console.log(title);
  console.log(`hits=${hits.length}`);

  if (!hits.length) {
    console.log('  none');
    console.log('');
    return;
  }

  for (const hit of hits) {
    const tag = hit.tag ? ` ${hit.tag}` : '';
    console.log(
      `${hex(hit.addr)} -> ${hex(hit.target)}${tag} context=${hit.context} ${hit.decode}`,
    );
  }

  console.log('');
}

function refLabel(ref) {
  return `${hex(ref.addr)}=>${hex(ref.target)}`;
}

function recordSignal(map, key, entry, ref) {
  const existing = map.get(key);

  if (existing) {
    existing.refs.add(refLabel(ref));
    return;
  }

  map.set(key, {
    ...entry,
    refs: new Set([refLabel(ref)]),
  });
}

function collectStrideSignals(referenceHits) {
  const doubleAdds = new Map();
  const slaHits = new Map();

  for (const ref of referenceHits) {
    const windowStart = Math.max(0, ref.addr - WINDOW_RADIUS);
    const windowEnd = Math.min(rom.length, ref.addr + 3 + WINDOW_RADIUS);

    for (let addr = windowStart; addr <= windowEnd - 2; addr += 1) {
      if (rom[addr] === 0x29 && rom[addr + 1] === 0x29) {
        recordSignal(
          doubleAdds,
          `${addr}`,
          {
            addr,
            bytes: bytesAt(addr, 2),
            text: 'ADD HL,HL ; ADD HL,HL',
            context: formatContext(addr, 2),
          },
          ref,
        );
      }

      if (rom[addr] === 0xCB && rom[addr + 1] >= 0x20 && rom[addr + 1] <= 0x27) {
        const opcode = rom[addr + 1];
        recordSignal(
          slaHits,
          `cb:${addr}`,
          {
            addr,
            bytes: bytesAt(addr, 2),
            text: `SLA ${SLA_REG_NAMES[opcode & 0x07]}`,
            context: formatContext(addr, 2),
          },
          ref,
        );
      }

      if (
        addr <= windowEnd - 4 &&
        (rom[addr] === 0xDD || rom[addr] === 0xFD) &&
        rom[addr + 1] === 0xCB &&
        rom[addr + 3] >= 0x20 &&
        rom[addr + 3] <= 0x27
      ) {
        const indexRegister = rom[addr] === 0xDD ? 'IX' : 'IY';
        const displacement = formatSignedByte(rom[addr + 2]);
        recordSignal(
          slaHits,
          `idx:${addr}`,
          {
            addr,
            bytes: bytesAt(addr, 4),
            text: `SLA (${indexRegister}${displacement})`,
            context: formatContext(addr, 4),
          },
          ref,
        );
      }
    }
  }

  return {
    doubleAdds: Array.from(doubleAdds.values()).sort((left, right) => left.addr - right.addr),
    slaHits: Array.from(slaHits.values()).sort((left, right) => left.addr - right.addr),
  };
}

function printSignalSection(title, signals) {
  console.log(title);
  console.log(`hits=${signals.length}`);

  if (!signals.length) {
    console.log('  none');
    console.log('');
    return;
  }

  for (const signal of signals) {
    const refs = Array.from(signal.refs).sort().join(', ');
    console.log(
      `${hex(signal.addr)} bytes=${signal.bytes} text=${signal.text} refs=${refs} context=${signal.context}`,
    );
  }

  console.log('');
}

function readTableEntries(base, count) {
  const entries = [];

  for (let index = 0; index < count; index += 1) {
    const addr = base + (index * 4);
    const opcode = rom[addr] ?? 0;
    const target = readUInt24LE(addr + 1) ?? 0;

    entries.push({
      index,
      addr,
      opcode,
      target,
      bytes: bytesAt(addr, 4),
    });
  }

  return entries;
}

function tableEntryLabel(entry) {
  if (entry.opcode === 0xC3) {
    return `JP ${hex(entry.target)}`;
  }

  return `opcode=${hexByte(entry.opcode)} imm24=${hex(entry.target)}`;
}

function printTable(entries) {
  console.log('=== 3. Table Dump: 0x022264 entries 0-31 ===');

  for (const entry of entries) {
    const index = String(entry.index).padStart(2, '0');
    console.log(`${index} ${hex(entry.addr)} ${entry.bytes} ${tableEntryLabel(entry)}`);
  }

  console.log('');
}

function findTransferSites(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let addr = 0; addr <= rom.length - 4; addr += 1) {
    const opcode = rom[addr];

    if ((opcode === 0xC3 || opcode === 0xCD) && rom[addr + 1] === lo && rom[addr + 2] === mid && rom[addr + 3] === hi) {
      hits.push({
        addr,
        opcode,
        bytes: bytesAt(addr, 4),
      });
    }
  }

  return hits;
}

function tableIndexForAddress(addr, entries) {
  for (const entry of entries) {
    if (entry.addr === addr) {
      return entry.index;
    }
  }

  return null;
}

function printTargetCrossRefs(entries) {
  console.log('=== 4. Cross-Reference First 5 Table Targets ===');

  for (const entry of entries.slice(0, XREF_ENTRY_COUNT)) {
    const hits = findTransferSites(entry.target);
    console.log(`entry[${entry.index}] ${hex(entry.addr)} -> ${hex(entry.target)} hits=${hits.length}`);

    if (!hits.length) {
      console.log('  none');
      continue;
    }

    for (const hit of hits) {
      const mnemonic = hit.opcode === 0xCD ? 'CALL' : 'JP';
      const tableIndex = tableIndexForAddress(hit.addr, entries);
      const tag = tableIndex === null ? '' : ` [table[${tableIndex}]]`;
      console.log(`  ${hex(hit.addr)} ${hit.bytes} ${mnemonic} ${hex(entry.target)}${tag}`);
    }
  }

  console.log('');
}

function main() {
  console.log('Phase 257 probe: find indexers into vector table 0x022264');
  console.log(`ROM bytes=${rom.length} (${hex(rom.length, 8)})`);
  console.log('');

  const exact022264Hits = findExactImmediateHits(TABLE_BASE);
  const exact022260Hits = findExactImmediateHits(ALT_BASE);
  const pageHits = findPageImmediateHits();

  console.log('=== 1. Static ROM Scan For Address References ===');
  printReferenceSection('--- Exact 0x022264 hits (64 22 02) ---', exact022264Hits);
  printReferenceSection('--- Exact 0x022260 hits (60 22 02) ---', exact022260Hits);
  printReferenceSection('--- Any 0x0222xx hits (00-FF 22 02) ---', pageHits);

  const exactSignals = collectStrideSignals(exact022264Hits);
  const pageSignals = collectStrideSignals(pageHits);

  console.log('=== 2. Search For Table-Stride Patterns ===');
  printSignalSection('--- 29 29 near exact 0x022264 references (+/-20 bytes) ---', exactSignals.doubleAdds);
  printSignalSection('--- 29 29 near any 0x0222xx references (+/-20 bytes) ---', pageSignals.doubleAdds);
  printSignalSection('--- SLA / shift-like hits near any 0x0222xx references (+/-20 bytes) ---', pageSignals.slaHits);

  const tableEntries = readTableEntries(TABLE_BASE, TABLE_ENTRY_COUNT);
  printTable(tableEntries);
  printTargetCrossRefs(tableEntries);
}

main();
