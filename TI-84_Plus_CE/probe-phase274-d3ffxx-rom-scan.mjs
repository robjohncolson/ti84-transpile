#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const D3_RANGE_START = 0xD30000;
const D3_RANGE_END = 0xD3FFFF;
const D3F_RANGE_START = 0xD3F000;
const D3F_RANGE_END = 0xD3FFFF;
const D3FF_RANGE_START = 0xD3FF00;
const D3FF_RANGE_END = 0xD3FFFF;

const CONTEXT_RADIUS = 16;
const POINTER_STORE_WINDOW = 32;
const BLOCK_TRANSFER_LOOKBACK = 64;
const BLOCK_TRANSFER_LOOKAHEAD = 16;

const MODE_PREFIXES = [
  { byte: 0x52, name: 'sil' },
  { byte: 0x5B, name: 'lil' },
];

const REGS8 = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];

const DIRECT_STORE_DEFS = [
  {
    group: 'LD (nn),A',
    register: 'a',
    opcodeBytes: [0x32],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld (${hex(addr)}), a`,
  },
  {
    group: 'LD (nn),HL (0x22)',
    register: 'hl',
    opcodeBytes: [0x22],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld (${hex(addr)}), hl`,
  },
  {
    group: 'LD (nn),BC (ED 43)',
    register: 'bc',
    opcodeBytes: [0xED, 0x43],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld (${hex(addr)}), bc`,
  },
  {
    group: 'LD (nn),DE (ED 53)',
    register: 'de',
    opcodeBytes: [0xED, 0x53],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld (${hex(addr)}), de`,
  },
  {
    group: 'LD (nn),HL (ED 63)',
    register: 'hl',
    opcodeBytes: [0xED, 0x63],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld (${hex(addr)}), hl`,
  },
  {
    group: 'LD (nn),SP (ED 73)',
    register: 'sp',
    opcodeBytes: [0xED, 0x73],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld (${hex(addr)}), sp`,
  },
  {
    group: 'LD (nn),IX (DD 22)',
    register: 'ix',
    opcodeBytes: [0xDD, 0x22],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld (${hex(addr)}), ix`,
  },
  {
    group: 'LD (nn),IY (FD 22)',
    register: 'iy',
    opcodeBytes: [0xFD, 0x22],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld (${hex(addr)}), iy`,
  },
];

const POINTER_LOAD_DEFS = [
  {
    group: 'LD BC,nn',
    register: 'bc',
    opcodeBytes: [0x01],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld bc, ${hex(addr)}`,
  },
  {
    group: 'LD DE,nn',
    register: 'de',
    opcodeBytes: [0x11],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld de, ${hex(addr)}`,
  },
  {
    group: 'LD HL,nn',
    register: 'hl',
    opcodeBytes: [0x21],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld hl, ${hex(addr)}`,
  },
  {
    group: 'LD IX,nn',
    register: 'ix',
    opcodeBytes: [0xDD, 0x21],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld ix, ${hex(addr)}`,
  },
  {
    group: 'LD IY,nn',
    register: 'iy',
    opcodeBytes: [0xFD, 0x21],
    render: (addr, prefixName) => `${prefixText(prefixName)}ld iy, ${hex(addr)}`,
  },
];

const BLOCK_TRANSFER_DEFS = [
  {
    group: 'LDIR',
    opcodeBytes: [0xED, 0xB0],
    render: (prefixName) => `${prefixText(prefixName)}ldir`,
  },
  {
    group: 'LDDR',
    opcodeBytes: [0xED, 0xB8],
    render: (prefixName) => `${prefixText(prefixName)}lddr`,
  },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function prefixText(prefixName) {
  return prefixName ? `${prefixName} ` : '';
}

function formatBytes(bytes) {
  if (!bytes || bytes.length === 0) {
    return '(none)';
  }
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function read24(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function classifyAddress(addr) {
  if (addr >= D3FF_RANGE_START && addr <= D3FF_RANGE_END) {
    return 'D3FFxx';
  }
  if (addr >= D3F_RANGE_START && addr <= D3F_RANGE_END) {
    return 'D3Fxxx';
  }
  if (addr >= D3_RANGE_START && addr <= D3_RANGE_END) {
    return 'D3xxxx-only';
  }
  return 'outside-range';
}

function isD3Range(addr) {
  return addr >= D3_RANGE_START && addr <= D3_RANGE_END;
}

function isD3FOrD3FF(addr) {
  return addr >= D3F_RANGE_START && addr <= D3F_RANGE_END;
}

function isD3FF(addr) {
  return addr >= D3FF_RANGE_START && addr <= D3FF_RANGE_END;
}

function formatContext(buffer, offset, length) {
  const beforeStart = Math.max(0, offset - CONTEXT_RADIUS);
  const before = buffer.subarray(beforeStart, offset);
  const middle = buffer.subarray(offset, offset + length);
  const afterEnd = Math.min(buffer.length, offset + length + CONTEXT_RADIUS);
  const after = buffer.subarray(offset + length, afterEnd);
  return `${formatBytes(before)} [${formatBytes(middle)}] ${formatBytes(after)}`;
}

function expandAddressedDefs(definitions, family) {
  const variants = [];

  for (const definition of definitions) {
    variants.push({
      ...definition,
      family,
      prefixName: null,
      startBytes: definition.opcodeBytes,
      length: definition.opcodeBytes.length + 3,
      addressOffset: definition.opcodeBytes.length,
    });

    for (const prefix of MODE_PREFIXES) {
      variants.push({
        ...definition,
        family,
        prefixName: prefix.name,
        startBytes: [prefix.byte, ...definition.opcodeBytes],
        length: definition.opcodeBytes.length + 4,
        addressOffset: definition.opcodeBytes.length + 1,
      });
    }
  }

  return variants;
}

function expandBlockTransferDefs(definitions) {
  const variants = [];

  for (const definition of definitions) {
    variants.push({
      ...definition,
      family: 'block-transfer',
      prefixName: null,
      startBytes: definition.opcodeBytes,
      length: definition.opcodeBytes.length,
    });

    for (const prefix of MODE_PREFIXES) {
      variants.push({
        ...definition,
        family: 'block-transfer',
        prefixName: prefix.name,
        startBytes: [prefix.byte, ...definition.opcodeBytes],
        length: definition.opcodeBytes.length + 1,
      });
    }
  }

  return variants;
}

function startsWith(buffer, offset, bytes) {
  for (let index = 0; index < bytes.length; index += 1) {
    if (buffer[offset + index] !== bytes[index]) {
      return false;
    }
  }
  return true;
}

function scanAddressedPatterns(buffer, variants) {
  const matches = [];

  for (const variant of variants) {
    const maxOffset = buffer.length - variant.length;
    for (let offset = 0; offset <= maxOffset; offset += 1) {
      if (!startsWith(buffer, offset, variant.startBytes)) {
        continue;
      }

      const address = read24(buffer, offset + variant.addressOffset);
      if (!isD3Range(address)) {
        continue;
      }

      matches.push({
        family: variant.family,
        group: variant.group,
        register: variant.register,
        offset,
        length: variant.length,
        address,
        addressClass: classifyAddress(address),
        prefixName: variant.prefixName,
        instructionBytes: buffer.subarray(offset, offset + variant.length),
        decoded: variant.render(address, variant.prefixName),
        context: formatContext(buffer, offset, variant.length),
      });
    }
  }

  return suppressShadowedMatches(matches);
}

function scanBlockTransfers(buffer, variants) {
  const matches = [];

  for (const variant of variants) {
    const maxOffset = buffer.length - variant.length;
    for (let offset = 0; offset <= maxOffset; offset += 1) {
      if (!startsWith(buffer, offset, variant.startBytes)) {
        continue;
      }

      matches.push({
        family: variant.family,
        group: variant.group,
        offset,
        length: variant.length,
        prefixName: variant.prefixName,
        instructionBytes: buffer.subarray(offset, offset + variant.length),
        decoded: variant.render(variant.prefixName),
        context: formatContext(buffer, offset, variant.length),
      });
    }
  }

  return suppressShadowedMatches(matches);
}

function suppressShadowedMatches(matches) {
  const sorted = [...matches].sort((left, right) => {
    if (left.offset !== right.offset) {
      return left.offset - right.offset;
    }
    return right.length - left.length;
  });

  const kept = [];
  for (const match of sorted) {
    const shadowed = kept.some((other) => {
      if (other.family !== match.family) {
        return false;
      }
      if ((other.address ?? null) !== (match.address ?? null)) {
        return false;
      }
      return other.offset <= match.offset && (other.offset + other.length) >= (match.offset + match.length);
    });

    if (!shadowed) {
      kept.push(match);
    }
  }

  return kept.sort((left, right) => left.offset - right.offset || left.length - right.length);
}

function toSignedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatDisplacement(value) {
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function createNearbyStore(buffer, offset, length, decoded) {
  return {
    offset,
    length,
    decoded,
    instructionBytes: buffer.subarray(offset, offset + length),
    context: formatContext(buffer, offset, length),
  };
}

function scanHlStores(buffer, start, end) {
  const matches = [];

  for (let offset = start; offset < end; offset += 1) {
    const op = buffer[offset];

    if ((op & 0xF8) === 0x70 && op !== 0x76) {
      matches.push(createNearbyStore(buffer, offset, 1, `ld (hl), ${REGS8[op & 0x07]}`));
      continue;
    }

    if (op === 0x36 && offset + 1 < buffer.length) {
      matches.push(createNearbyStore(buffer, offset, 2, `ld (hl), ${hexByte(buffer[offset + 1])}`));
      continue;
    }

    if (op !== 0xED || offset + 1 >= buffer.length) {
      continue;
    }

    const sub = buffer[offset + 1];
    if (sub === 0x0F) {
      matches.push(createNearbyStore(buffer, offset, 2, 'ld (hl), bc'));
    } else if (sub === 0x1F) {
      matches.push(createNearbyStore(buffer, offset, 2, 'ld (hl), de'));
    } else if (sub === 0x2F) {
      matches.push(createNearbyStore(buffer, offset, 2, 'ld (hl), hl'));
    } else if (sub === 0x3E) {
      matches.push(createNearbyStore(buffer, offset, 2, 'ld (hl), iy'));
    } else if (sub === 0x3F) {
      matches.push(createNearbyStore(buffer, offset, 2, 'ld (hl), ix'));
    } else if (sub === 0xA0) {
      matches.push(createNearbyStore(buffer, offset, 2, 'ldi'));
    } else if (sub === 0xA8) {
      matches.push(createNearbyStore(buffer, offset, 2, 'ldd'));
    } else if (sub === 0xB0) {
      matches.push(createNearbyStore(buffer, offset, 2, 'ldir'));
    } else if (sub === 0xB8) {
      matches.push(createNearbyStore(buffer, offset, 2, 'lddr'));
    }
  }

  return dedupeNearbyStores(matches);
}

function scanIndexedStores(buffer, start, end, register) {
  const matches = [];
  const prefix = register === 'ix' ? 0xDD : 0xFD;
  const otherIndex = register === 'ix' ? 'iy' : 'ix';

  for (let offset = start; offset < end; offset += 1) {
    if (buffer[offset] !== prefix || offset + 2 >= buffer.length) {
      continue;
    }

    const op = buffer[offset + 1];
    const displacement = toSignedByte(buffer[offset + 2]);
    const target = `(${register}${formatDisplacement(displacement)})`;

    if ((op & 0xF8) === 0x70 && op !== 0x76) {
      matches.push(createNearbyStore(buffer, offset, 3, `ld ${target}, ${REGS8[op & 0x07]}`));
      continue;
    }

    if (op === 0x36 && offset + 3 < buffer.length) {
      matches.push(createNearbyStore(buffer, offset, 4, `ld ${target}, ${hexByte(buffer[offset + 3])}`));
      continue;
    }

    if (op === 0x0F) {
      matches.push(createNearbyStore(buffer, offset, 3, `ld ${target}, bc`));
    } else if (op === 0x1F) {
      matches.push(createNearbyStore(buffer, offset, 3, `ld ${target}, de`));
    } else if (op === 0x2F) {
      matches.push(createNearbyStore(buffer, offset, 3, `ld ${target}, hl`));
    } else if (op === 0x3E) {
      matches.push(createNearbyStore(buffer, offset, 3, `ld ${target}, ${otherIndex}`));
    } else if (op === 0x3F) {
      matches.push(createNearbyStore(buffer, offset, 3, `ld ${target}, ${register}`));
    }
  }

  return dedupeNearbyStores(matches);
}

function dedupeNearbyStores(matches) {
  const seen = new Set();
  const kept = [];

  for (const match of matches) {
    const key = `${match.offset}:${match.length}:${match.decoded}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    kept.push(match);
  }

  return kept.sort((left, right) => left.offset - right.offset);
}

function collectPointerStoreCandidates(buffer, pointerLoads) {
  const candidates = [];

  for (const load of pointerLoads) {
    if (!['hl', 'ix', 'iy'].includes(load.register)) {
      continue;
    }

    const start = load.offset + load.length;
    const end = Math.min(buffer.length, start + POINTER_STORE_WINDOW);
    const stores =
      load.register === 'hl'
        ? scanHlStores(buffer, start, end)
        : scanIndexedStores(buffer, start, end, load.register);

    if (stores.length === 0) {
      continue;
    }

    candidates.push({
      load,
      stores,
    });
  }

  return candidates.sort((left, right) => left.load.offset - right.load.offset);
}

function annotateBlockTransfers(blockTransfers, pointerLoads) {
  return blockTransfers.map((transfer) => {
    const nearbyLoads = pointerLoads
      .filter((load) => {
        const delta = load.offset - transfer.offset;
        return delta >= -BLOCK_TRANSFER_LOOKBACK && delta <= BLOCK_TRANSFER_LOOKAHEAD;
      })
      .sort((left, right) => left.offset - right.offset);

    return {
      ...transfer,
      nearbyLoads,
    };
  });
}

function groupByInstruction(matches) {
  const groups = new Map();

  for (const match of matches) {
    if (!groups.has(match.group)) {
      groups.set(match.group, []);
    }
    groups.get(match.group).push(match);
  }

  return groups;
}

function printGroupedMatches(title, matches) {
  console.log(`=== ${title} (${matches.length}) ===`);
  if (matches.length === 0) {
    console.log('none');
    console.log('');
    return;
  }

  for (const [group, items] of groupByInstruction(matches)) {
    console.log(`-- ${group} (${items.length})`);
    for (const item of items) {
      console.log(`${hex(item.offset)}  addr=${hex(item.address)}  scope=${item.addressClass}`);
      console.log(`  bytes: ${formatBytes(item.instructionBytes)}`);
      console.log(`  text : ${item.decoded}`);
      console.log(`  ctx  : ${item.context}`);
    }
    console.log('');
  }
}

function printPointerStoreCandidates(candidates) {
  console.log(`=== HL/IX/IY Pointer-Store Candidates (${candidates.length}) ===`);
  if (candidates.length === 0) {
    console.log('none');
    console.log('');
    return;
  }

  for (const candidate of candidates) {
    const { load, stores } = candidate;
    console.log(`${hex(load.offset)}  addr=${hex(load.address)}  scope=${load.addressClass}`);
    console.log(`  load : ${load.decoded}`);
    console.log(`  bytes: ${formatBytes(load.instructionBytes)}`);
    console.log(`  ctx  : ${load.context}`);
    console.log(`  nearby stores within +${hex(POINTER_STORE_WINDOW, 2)} bytes:`);

    for (const store of stores) {
      const delta = store.offset - (load.offset + load.length);
      console.log(`    ${delta >= 0 ? '+' : '-'}${hex(Math.abs(delta), 4)}  ${hex(store.offset)}  ${store.decoded}`);
      console.log(`      bytes: ${formatBytes(store.instructionBytes)}`);
      console.log(`      ctx  : ${store.context}`);
    }

    console.log('');
  }
}

function printBlockTransfers(blockTransfers) {
  console.log(`=== LDIR/LDDR Near D3xxxx Pointer Loads (${blockTransfers.length}) ===`);
  if (blockTransfers.length === 0) {
    console.log('none');
    console.log('');
    return;
  }

  for (const transfer of blockTransfers) {
    console.log(`${hex(transfer.offset)}  ${transfer.decoded}`);
    console.log(`  bytes: ${formatBytes(transfer.instructionBytes)}`);
    console.log(`  ctx  : ${transfer.context}`);

    if (transfer.nearbyLoads.length === 0) {
      console.log(
        `  nearby D3xxxx loads within -${hex(BLOCK_TRANSFER_LOOKBACK, 2)}..+${hex(BLOCK_TRANSFER_LOOKAHEAD, 2)} bytes: none`
      );
    } else {
      console.log(
        `  nearby D3xxxx loads within -${hex(BLOCK_TRANSFER_LOOKBACK, 2)}..+${hex(BLOCK_TRANSFER_LOOKAHEAD, 2)} bytes:`
      );
      for (const load of transfer.nearbyLoads) {
        const delta = load.offset - transfer.offset;
        console.log(
          `    ${delta >= 0 ? '+' : '-'}${hex(Math.abs(delta), 4)}  ${hex(load.offset)}  ${load.decoded}  ` +
          `addr=${hex(load.address)}  scope=${load.addressClass}`
        );
      }
    }

    console.log('');
  }
}

function printSummary(directStores, pointerLoads, pointerStoreCandidates, blockTransfers) {
  const directD3FF = directStores.filter((match) => isD3FF(match.address));
  const directD3F = directStores.filter((match) => isD3FOrD3FF(match.address) && !isD3FF(match.address));
  const directD3Only = directStores.filter((match) => match.addressClass === 'D3xxxx-only');

  const pointerD3FF = pointerLoads.filter((match) => isD3FF(match.address));
  const pointerD3F = pointerLoads.filter((match) => isD3FOrD3FF(match.address) && !isD3FF(match.address));
  const pointerD3Only = pointerLoads.filter((match) => match.addressClass === 'D3xxxx-only');

  const pointerStoreD3FF = pointerStoreCandidates.filter((candidate) => isD3FF(candidate.load.address));
  const pointerStoreD3F = pointerStoreCandidates.filter(
    (candidate) => isD3FOrD3FF(candidate.load.address) && !isD3FF(candidate.load.address)
  );

  const blockTransferDeD3FF = blockTransfers.filter((transfer) =>
    transfer.nearbyLoads.some((load) => load.register === 'de' && isD3FF(load.address))
  );
  const blockTransferDeD3F = blockTransfers.filter((transfer) =>
    transfer.nearbyLoads.some((load) => load.register === 'de' && isD3FOrD3FF(load.address) && !isD3FF(load.address))
  );

  console.log('=== Summary ===');
  console.log(`Direct stores into D3FFxx: ${directD3FF.length}`);
  console.log(`Direct stores into D3F000-D3FEFF: ${directD3F.length}`);
  console.log(`Direct stores into broader D30000-D3EFFF: ${directD3Only.length}`);
  console.log(`Pointer loads of D3FFxx: ${pointerD3FF.length}`);
  console.log(`Pointer loads of D3F000-D3FEFF: ${pointerD3F.length}`);
  console.log(`Pointer loads of broader D30000-D3EFFF: ${pointerD3Only.length}`);
  console.log(`HL/IX/IY pointer-store candidates from D3FFxx loads: ${pointerStoreD3FF.length}`);
  console.log(`HL/IX/IY pointer-store candidates from D3F000-D3FEFF loads: ${pointerStoreD3F.length}`);
  console.log(`LDIR/LDDR sites with nearby DE=D3FFxx: ${blockTransferDeD3FF.length}`);
  console.log(`LDIR/LDDR sites with nearby DE=D3F000-D3FEFF: ${blockTransferDeD3F.length}`);
  console.log('');

  if (
    directD3FF.length === 0 &&
    directD3F.length === 0 &&
    pointerStoreD3FF.length === 0 &&
    pointerStoreD3F.length === 0 &&
    blockTransferDeD3FF.length === 0 &&
    blockTransferDeD3F.length === 0
  ) {
    console.log('No obvious static dispatch-table registration sequence targeting D3F000-D3FFFF was found in the ROM byte scan.');
  } else {
    console.log('Potential D3F000-D3FFFF registration paths exist in ROM; inspect the reported direct stores, pointer-store candidates, and LDIR/LDDR neighborhoods.');
  }

  console.log('The broader D3xxxx matches are included separately in case the registration code stages data nearby before reaching D3Fxxx/D3FFxx.');
}

function main() {
  console.log('Phase 274 probe: static ROM scan for D3Fxxx / D3FFxx dispatch-table registration code');
  console.log('');

  const rom = fs.readFileSync(ROM_PATH);

  console.log(`ROM path=${ROM_PATH}`);
  console.log(`ROM bytes=${rom.length}`);
  console.log('Addressed patterns scanned in unprefixed, SIL (0x52), and LIL (0x5B) forms.');
  console.log('');

  const directStoreVariants = expandAddressedDefs(DIRECT_STORE_DEFS, 'direct-store');
  const pointerLoadVariants = expandAddressedDefs(POINTER_LOAD_DEFS, 'pointer-load');
  const blockTransferVariants = expandBlockTransferDefs(BLOCK_TRANSFER_DEFS);

  const directStores = scanAddressedPatterns(rom, directStoreVariants);
  const pointerLoads = scanAddressedPatterns(rom, pointerLoadVariants);
  const blockTransfers = annotateBlockTransfers(scanBlockTransfers(rom, blockTransferVariants), pointerLoads);
  const pointerStoreCandidates = collectPointerStoreCandidates(rom, pointerLoads);

  const directStoresD3F = directStores.filter((match) => isD3FOrD3FF(match.address));
  const directStoresBroader = directStores.filter((match) => match.addressClass === 'D3xxxx-only');
  const pointerLoadsD3F = pointerLoads.filter((match) => isD3FOrD3FF(match.address));
  const pointerLoadsBroader = pointerLoads.filter((match) => match.addressClass === 'D3xxxx-only');

  printGroupedMatches('Direct Stores Into D3F000-D3FFFF', directStoresD3F);
  printGroupedMatches('Direct Stores Into Broader D30000-D3EFFF', directStoresBroader);
  printGroupedMatches('Pointer Loads Of D3F000-D3FFFF', pointerLoadsD3F);
  printGroupedMatches('Pointer Loads Of Broader D30000-D3EFFF', pointerLoadsBroader);
  printPointerStoreCandidates(pointerStoreCandidates);
  printBlockTransfers(blockTransfers);
  printSummary(directStores, pointerLoads, pointerStoreCandidates, blockTransfers);
}

main();
