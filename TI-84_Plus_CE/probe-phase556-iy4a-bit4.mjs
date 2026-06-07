import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const ROM_START = 0x000000;
const ROM_END = Math.min(0x3fffff, rom.length - 1);
const CLUSTER_START = 0x045000;
const CLUSTER_END = 0x046fff;
const RENDERER_START = 0x0a2000;
const RENDERER_END = 0x0a2fff;

const patterns = [
  { type: 'BIT', mnemonic: 'BIT 4,(IY+0x4A)', bytes: [0xfd, 0xcb, 0x4a, 0x66] },
  { type: 'SET', mnemonic: 'SET 4,(IY+0x4A)', bytes: [0xfd, 0xcb, 0x4a, 0xe6] },
  { type: 'RES', mnemonic: 'RES 4,(IY+0x4A)', bytes: [0xfd, 0xcb, 0x4a, 0xa6] },
];

function hexAddr(addr) {
  return `0x${addr.toString(16).toUpperCase().padStart(6, '0')}`;
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function hex24(value) {
  return `0x${(value & 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`;
}

function bytesToHex(start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rom.length, safeStart + length);
  const bytes = [];

  for (let addr = safeStart; addr < safeEnd; addr += 1) {
    bytes.push(hexByte(rom[addr]));
  }

  return bytes.join(' ');
}

function contextBefore(addr, length) {
  return bytesToHex(Math.max(0, addr - length), Math.min(length, addr));
}

function contextAfter(addr, length) {
  return bytesToHex(addr + 4, length);
}

function fullContext(addr, radius) {
  const start = Math.max(0, addr - radius);
  const end = Math.min(rom.length, addr + 4 + radius);
  const lines = [];

  for (let lineStart = start; lineStart < end; lineStart += 16) {
    const lineLength = Math.min(16, end - lineStart);
    lines.push(`    ${hexAddr(lineStart)}: ${bytesToHex(lineStart, lineLength)}`);
  }

  return lines.join('\n');
}

function matchesAt(addr, bytes) {
  if (addr + bytes.length > rom.length) {
    return false;
  }

  for (let offset = 0; offset < bytes.length; offset += 1) {
    if (rom[addr + offset] !== bytes[offset]) {
      return false;
    }
  }

  return true;
}

function scanReferences() {
  const refs = [];

  for (let addr = ROM_START; addr <= ROM_END - 3; addr += 1) {
    for (const pattern of patterns) {
      if (matchesAt(addr, pattern.bytes)) {
        refs.push({ addr, type: pattern.type, mnemonic: pattern.mnemonic });
      }
    }
  }

  return refs.sort((a, b) => a.addr - b.addr);
}

function readLe24(addr) {
  if (addr + 2 >= rom.length) {
    return null;
  }

  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function findCallTargets(start, end) {
  const calls = [];
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(rom.length - 4, end);

  for (let addr = safeStart; addr <= safeEnd; addr += 1) {
    if (rom[addr] === 0xcd) {
      const target = readLe24(addr + 1);
      if (target !== null) {
        calls.push({ addr, target });
      }
    }
  }

  return calls;
}

function groupClusterBrackets(clusterRefs) {
  const brackets = [];
  const ordered = clusterRefs
    .filter((ref) => ref.type === 'SET' || ref.type === 'RES')
    .sort((a, b) => a.addr - b.addr);

  for (let i = 0; i < ordered.length; i += 1) {
    const current = ordered[i];
    const next = ordered[i + 1];

    if (
      current?.type === 'SET' &&
      next?.type === 'RES' &&
      next.addr - current.addr <= 64
    ) {
      brackets.push({
        set: current,
        res: next,
        calls: findCallTargets(current.addr + 4, next.addr - 1),
      });
      i += 1;
      continue;
    }

    brackets.push({
      set: current.type === 'SET' ? current : null,
      res: current.type === 'RES' ? current : null,
      calls: [],
      unpaired: current,
    });
  }

  return brackets;
}

function signed8(value) {
  return value >= 0x80 ? value - 0x100 : value;
}

function branchInfo(bitAddr) {
  const start = bitAddr + 4;

  for (let addr = start; addr < Math.min(rom.length, start + 16); addr += 1) {
    const opcode = rom[addr];

    if (opcode === 0x28 || opcode === 0x20) {
      const condition = opcode === 0x28 ? 'Z' : 'NZ';
      const target = (addr + 2 + signed8(rom[addr + 1])) & 0xffffff;
      const when = condition === 'Z'
        ? 'branch is taken when bit 4 is clear'
        : 'branch is taken when bit 4 is set';

      return {
        text: `JR ${condition} to ${hex24(target)} at ${hexAddr(addr)} (${when})`,
        condition,
        target,
        when,
      };
    }

    if (opcode === 0xca || opcode === 0xc2) {
      const condition = opcode === 0xca ? 'Z' : 'NZ';
      const target = readLe24(addr + 1);
      const when = condition === 'Z'
        ? 'branch is taken when bit 4 is clear'
        : 'branch is taken when bit 4 is set';

      return {
        text: `JP ${condition} to ${hex24(target ?? 0)} at ${hexAddr(addr)} (${when})`,
        condition,
        target,
        when,
      };
    }
  }

  return {
    text: 'No JR/JP Z/NZ found within 16 bytes after BIT test',
    condition: null,
    target: null,
    when: 'Unable to infer branch behavior from nearby bytes',
  };
}

function printReference(ref, radius = 32) {
  console.log(`${hexAddr(ref.addr)}: ${ref.mnemonic}`);
  console.log(`  Context before: ${contextBefore(ref.addr, radius)}`);
  console.log(`  Instruction: ${bytesToHex(ref.addr, 4)}`);
  console.log(`  Context after: ${contextAfter(ref.addr, radius)}`);
}

function printCluster(clusterRefs) {
  console.log('--- 0x045xxx-0x046xxx CLUSTER ---');

  if (clusterRefs.length === 0) {
    console.log('No IY+0x4A bit 4 references found in cluster range.');
    console.log('');
    return;
  }

  for (const ref of clusterRefs) {
    printReference(ref, 32);
  }

  console.log('');
  console.log('Bracket groups within 64 bytes:');

  const brackets = groupClusterBrackets(clusterRefs);
  for (const bracket of brackets) {
    if (bracket.set && bracket.res) {
      const callText = bracket.calls.length > 0
        ? bracket.calls.map((call) => `${hexAddr(call.addr)} -> ${hex24(call.target)}`).join(', ')
        : 'none';

      console.log(`  ${hexAddr(bracket.set.addr)} SET ... ${hexAddr(bracket.res.addr)} RES`);
      console.log(`    CALL targets between SET/RES: ${callText}`);
      continue;
    }

    console.log(`  ${hexAddr(bracket.unpaired.addr)} ${bracket.unpaired.mnemonic} (unpaired within 64 bytes)`);
    console.log('    CALL targets between SET/RES: n/a');
  }

  console.log('');
}

function printRenderer(rendererRefs) {
  console.log('--- RENDERER REGION 0x0A2xxx ---');

  if (rendererRefs.length === 0) {
    console.log('No BIT 4,(IY+0x4A) references found in renderer range.');
    console.log('');
    return;
  }

  for (const ref of rendererRefs) {
    const branch = branchInfo(ref.addr);

    console.log(`${hexAddr(ref.addr)}: ${ref.mnemonic}`);
    console.log('  Context:');
    console.log(fullContext(ref.addr, 48));
    console.log(`  Branch: ${branch.text}`);
    console.log(`  Meaning: ${branch.when}; the opposite path is used when the bit has the other state.`);
  }

  console.log('');
}

const refs = scanReferences();
const clusterRefs = refs.filter((ref) => ref.addr >= CLUSTER_START && ref.addr <= CLUSTER_END);
const rendererRefs = refs.filter(
  (ref) => ref.type === 'BIT' && ref.addr >= RENDERER_START && ref.addr <= RENDERER_END,
);

console.log('=== IY+0x4A BIT 4 CONTEXT ===');
console.log(`Total references found: ${refs.length}`);
console.log('');

console.log('All references:');
for (const ref of refs) {
  printReference(ref, 32);
}
console.log('');

printCluster(clusterRefs);
printRenderer(rendererRefs);
