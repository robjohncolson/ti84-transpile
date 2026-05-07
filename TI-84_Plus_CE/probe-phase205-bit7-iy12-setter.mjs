#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const IY_BASE = 0xD00080;
const IY_PLUS_0C = IY_BASE + 0x0C;

const KNOWN_ADDRESSES = new Map([
  [0x058293, 'HomeHandler gate test: BIT 7,(IY+12)'],
  [0x058297, 'HomeHandler branch: JP NZ -> 0x058483'],
  [0x058483, 'Level 1 branch entry'],
  [0x0584A3, 'Seeded Copy9 entry'],
  [0x0585E9, 'cxMain second-pass handler'],
  [0x0620C4, '0x0620xx helper path calls HomeHandler'],
  [0x0620E6, '0x0620xx helper return stub'],
]);

const EXACT_PATTERNS = [
  { key: 'set7', label: 'SET 7,(IY+0x0C)', bytes: [0xFD, 0xCB, 0x0C, 0xFE] },
  { key: 'res7', label: 'RES 7,(IY+0x0C)', bytes: [0xFD, 0xCB, 0x0C, 0xBE] },
  { key: 'bit7', label: 'BIT 7,(IY+0x0C)', bytes: [0xFD, 0xCB, 0x0C, 0x7E] },
];

const DIRECT_PATTERNS = [
  {
    label: 'LD (0xD0008C),A',
    bytes: [0x32, 0x8C, 0x00, 0xD0],
    skipIfPrefixedByEd: true,
  },
  {
    label: 'ED LD (0xD0008C),A',
    bytes: [0xED, 0x32, 0x8C, 0x00, 0xD0],
  },
  {
    label: 'LD A,(0xD0008C)',
    bytes: [0x3A, 0x8C, 0x00, 0xD0],
    skipIfPrefixedByEd: true,
  },
  {
    label: 'ED LD A,(0xD0008C)',
    bytes: [0xED, 0x3A, 0x8C, 0x00, 0xD0],
  },
];

const INDEXED_REG_WRITER = {
  label: 'LD (IY+0x0C),A',
  bytes: [0xFD, 0x77, 0x0C],
};

const INDEXED_REG_READER = {
  label: 'LD A,(IY+0x0C)',
  bytes: [0xFD, 0x7E, 0x0C],
};

const INDEXED_IMM_WRITER = {
  label: 'LD (IY+0x0C),n',
  bytes: [0xFD, 0x36, 0x0C],
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesAt(start, length) {
  const sliceStart = Math.max(0, start);
  const sliceEnd = Math.min(rom.length, sliceStart + length);
  return Array.from(rom.slice(sliceStart, sliceEnd), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function areaLabel(addr) {
  if (addr < 0x010000) return 'boot / ISR / low ROM';
  if (addr < 0x040000) return 'low OS / state tables';
  if (addr < 0x060000) return 'Home / key dispatch';
  if (addr < 0x080000) return 'editor / UI helpers';
  if (addr < 0x0A0000) return 'core OS / parser';
  return 'upper OS';
}

function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((0xD0 & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';

  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `${prefix}ld ${inst.pair}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(resolveMemAddr(inst))}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(resolveMemAddr(inst))})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(resolveMemAddr(inst))}), ${inst.src}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'ld-ixd-reg': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
    case 'ld-ixd-imm': return `${prefix}ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'alu-imm': return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'ldir': return `${prefix}ldir`;
    case 'lddr': return `${prefix}lddr`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'nop': return `${prefix}nop`;
    case 'halt': return `${prefix}halt`;
    default: return `${prefix}${inst.tag}`;
  }
}

function decodeSafe(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
    };
  }
}

function scanPattern(pattern, options = {}) {
  const hits = [];
  const extraLength = options.trailingImmediate ? 1 : 0;
  const fullLength = pattern.bytes.length + extraLength;

  for (let addr = 0; addr <= rom.length - fullLength; addr += 1) {
    if (pattern.skipIfPrefixedByEd && addr > 0 && rom[addr - 1] === 0xED) continue;

    let matched = true;
    for (let index = 0; index < pattern.bytes.length; index += 1) {
      if (rom[addr + index] !== pattern.bytes[index]) {
        matched = false;
        break;
      }
    }
    if (!matched) continue;

    hits.push({
      addr,
      bytes: bytesAt(addr, fullLength),
      immediate: options.trailingImmediate ? rom[addr + pattern.bytes.length] : null,
    });
  }

  return hits;
}

function collectBefore(target, count, lookbackBytes = 96) {
  const rows = [];
  let pc = Math.max(0, target - lookbackBytes);
  while (pc < target) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.length > 0 ? (inst.pc + inst.length) : (pc + 1);
  }
  return rows.filter((inst) => inst.pc < target).slice(-count);
}

function collectAfter(target, count) {
  const rows = [];
  let pc = target;
  while (rows.length < count && pc < rom.length) {
    const inst = decodeSafe(pc);
    rows.push(inst);
    pc = inst.length > 0 ? (inst.pc + inst.length) : (pc + 1);
  }
  return rows;
}

function contextRows(target, before = 5, after = 5) {
  return [...collectBefore(target, before), ...collectAfter(target, after + 1)];
}

function formatContext(target, before = 5, after = 5) {
  return contextRows(target, before, after).map((inst) => {
    const marker = inst.pc === target ? '=>' : '  ';
    const bytes = bytesAt(inst.pc, inst.length || 1).padEnd(20, ' ');
    const text = inst.tag === 'decode-error'
      ? `decode-error: ${inst.errorMessage}`
      : formatInstruction(inst);
    return `${marker} ${hex(inst.pc)}  ${bytes} ${text}`;
  });
}

function describeSite(addr) {
  if (KNOWN_ADDRESSES.has(addr)) return KNOWN_ADDRESSES.get(addr);
  if (addr >= 0x058483 && addr <= 0x0584A7) {
    return 'Level 1 home-token chain immediately before Copy9 @ 0x0584A3';
  }
  if (addr >= 0x062055 && addr <= 0x0620EB) {
    return '0x0620xx dispatcher/helper cluster; 0x0620C4 can re-enter HomeHandler';
  }
  if (addr >= 0x05FE0F && addr <= 0x05FFB2) {
    return '0x05FExx / 0x05FFxx cleanup helper that clears/tests the gate';
  }
  if (addr >= 0x0A5A10 && addr <= 0x0A5B2C) {
    return '0x0A5Axx / 0x0A5Bxx upper-OS text/UI routine around the same gate';
  }
  if (addr >= 0x0A6744 && addr <= 0x0A68D9) {
    return '0x0A6744 / 0x0A6862 / 0x0A68C5 upper-OS text/UI routine';
  }
  if (addr >= 0x033841 && addr <= 0x033DBB) {
    return 'Whole-byte state writer that stores 0x80 or 0x00 into IY+0x0C';
  }
  return areaLabel(addr);
}

function isLoadAFromIY0C(inst) {
  return (
    (inst.tag === 'ld-reg-ixd'
      && inst.dest === 'a'
      && inst.indexRegister === 'iy'
      && inst.displacement === 12)
    || (inst.tag === 'ld-reg-mem'
      && inst.dest === 'a'
      && resolveMemAddr(inst) === IY_PLUS_0C)
  );
}

function isStoreAToIY0C(inst) {
  return (
    (inst.tag === 'ld-ixd-reg'
      && inst.src === 'a'
      && inst.indexRegister === 'iy'
      && inst.displacement === 12)
    || (inst.tag === 'ld-mem-reg'
      && inst.src === 'a'
      && resolveMemAddr(inst) === IY_PLUS_0C)
  );
}

function scanReadModifyWrite() {
  const loadHits = [
    ...scanPattern(INDEXED_REG_READER),
    ...scanPattern(DIRECT_PATTERNS[2]),
    ...scanPattern(DIRECT_PATTERNS[3]),
  ].sort((left, right) => left.addr - right.addr);

  const rmwHits = [];

  for (const hit of loadHits) {
    const loadInst = decodeSafe(hit.addr);
    if (!isLoadAFromIY0C(loadInst)) continue;

    const window = collectAfter(hit.addr, 7);
    for (let index = 1; index < window.length; index += 1) {
      const inst = window[index];
      const isMaskOp = (
        inst.tag === 'alu-imm'
        && (inst.op === 'or' || inst.op === 'and')
      );
      if (!isMaskOp) continue;

      for (let follow = index + 1; follow < Math.min(window.length, index + 4); follow += 1) {
        const storeInst = window[follow];
        if (!isStoreAToIY0C(storeInst)) continue;

        rmwHits.push({
          loadAddr: loadInst.pc,
          aluAddr: inst.pc,
          storeAddr: storeInst.pc,
          op: inst.op,
          mask: inst.value,
        });
      }
    }
  }

  return rmwHits;
}

function printSiteGroup(label, hits) {
  console.log(`--- ${label} (${hits.length}) ---`);
  if (!hits.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const hit of hits) {
    console.log(`${hex(hit.addr)}  ${describeSite(hit.addr)}`);
    console.log(`  area: ${areaLabel(hit.addr)}`);
    if (hit.immediate !== null) {
      console.log(`  immediate: ${hexByte(hit.immediate)} (bit7=${hit.immediate & 0x80 ? '1' : '0'})`);
    }
    for (const line of formatContext(hit.addr)) {
      console.log(`  ${line}`);
    }
    console.log();
  }
}

function printSimpleGroup(label, hits) {
  console.log(`--- ${label} (${hits.length}) ---`);
  if (!hits.length) {
    console.log('  none');
    console.log();
    return;
  }

  for (const hit of hits) {
    console.log(`${hex(hit.addr)}  ${describeSite(hit.addr)}`);
  }
  console.log();
}

const exactHits = new Map();
for (const pattern of EXACT_PATTERNS) {
  exactHits.set(pattern.key, scanPattern(pattern));
}

const directHits = new Map();
for (const pattern of DIRECT_PATTERNS) {
  directHits.set(pattern.label, scanPattern(pattern));
}

const indexedImmHits = scanPattern(INDEXED_IMM_WRITER, { trailingImmediate: true });
const indexedImmSetHits = indexedImmHits.filter((hit) => (hit.immediate & 0x80) !== 0);
const indexedImmClearHits = indexedImmHits.filter((hit) => (hit.immediate & 0x80) === 0);
const indexedRegWriterHits = scanPattern(INDEXED_REG_WRITER);
const rmwHits = scanReadModifyWrite();

console.log('=== Phase 205: BIT 7,(IY+12) static ROM scan ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`IY base: ${hex(IY_BASE)}  IY+0x0C: ${hex(IY_PLUS_0C)}`);
console.log();

console.log('Exact bit-7 opcode counts:');
console.log(`  SET 7,(IY+0x0C): ${exactHits.get('set7').length}`);
console.log(`  RES 7,(IY+0x0C): ${exactHits.get('res7').length}`);
console.log(`  BIT 7,(IY+0x0C): ${exactHits.get('bit7').length}`);
console.log(`  Whole-byte LD (IY+0x0C),0x80/0x00: ${indexedImmHits.length}`);
console.log(`  Whole-byte LD (IY+0x0C),A: ${indexedRegWriterHits.length}`);
console.log(`  Direct absolute LD (0xD0008C),A: ${directHits.get('LD (0xD0008C),A').length + directHits.get('ED LD (0xD0008C),A').length}`);
console.log(`  Direct absolute LD A,(0xD0008C): ${directHits.get('LD A,(0xD0008C)').length + directHits.get('ED LD A,(0xD0008C)').length}`);
console.log(`  OR/AND read-modify-write patterns on this byte: ${rmwHits.length}`);
console.log();

printSiteGroup('SET 7,(IY+0x0C) sites', exactHits.get('set7'));
printSiteGroup('RES 7,(IY+0x0C) sites', exactHits.get('res7'));
printSiteGroup('BIT 7,(IY+0x0C) test sites', exactHits.get('bit7'));

printSiteGroup('Whole-byte LD (IY+0x0C),n sites that force bit 7 = 1', indexedImmSetHits);
printSiteGroup('Whole-byte LD (IY+0x0C),n sites that force bit 7 = 0', indexedImmClearHits);

printSimpleGroup('Whole-byte LD (IY+0x0C),A writers (A-dependent bit 7)', indexedRegWriterHits);

console.log('--- Direct absolute references to 0xD0008C ---');
for (const pattern of DIRECT_PATTERNS) {
  const hits = directHits.get(pattern.label);
  console.log(`${pattern.label}: ${hits.length}`);
  for (const hit of hits) {
    console.log(`  ${hex(hit.addr)}  ${describeSite(hit.addr)}`);
    for (const line of formatContext(hit.addr)) {
      console.log(`  ${line}`);
    }
  }
}
if (
  !directHits.get('LD (0xD0008C),A').length
  && !directHits.get('ED LD (0xD0008C),A').length
) {
  console.log('  No absolute store to 0xD0008C was found in ROM.');
}
console.log();

console.log('--- OR/AND read-modify-write patterns ---');
if (!rmwHits.length) {
  console.log('  none');
} else {
  for (const hit of rmwHits) {
    console.log(
      `  load ${hex(hit.loadAddr)} -> ${hit.op} ${hexByte(hit.mask)} @ ${hex(hit.aluAddr)} -> store ${hex(hit.storeAddr)}`
    );
  }
}
console.log();

console.log('--- Cross-reference to known home-handler addresses ---');
console.log('  0x058297: the known gate branch after BIT 7,(IY+12).');
console.log(`    exact BIT hits include ${exactHits.get('bit7').some((hit) => hit.addr === 0x058293) ? '0x058293' : 'none'} immediately before it.`);
console.log('  0x0584A3: seeded Copy9 entry.');
console.log(`    0x05848B is ${hex((0x0584A3 - 0x05848B) & 0xFFFFFF)} bytes upstream and clears bit 7 on the taken Level 1 path.`);
console.log('  0x0585E9: cxMain second-pass handler.');
console.log('    No SET 7 / RES 7 / BIT 7 hit occurs at 0x0585E9 itself; Level 2 does not arm the flag in-place.');
console.log();

console.log('--- Static conclusion ---');
console.log('  1. The only exact SET 7,(IY+0x0C) sites are 0x062077 and 0x0620D6.');
console.log('     Both live in the same 0x0620xx dispatcher/helper cluster, not in boot or MEM_INIT.');
console.log('  2. The Level 1 branch itself immediately clears the gate at 0x05848B before reaching Copy9 at 0x0584A3.');
console.log('  3. Additional clears exist in 0x05FExx / 0x05FFxx and 0x0A5Axx / 0x0A67xx helper regions.');
console.log('  4. Whole-byte immediate writers also force the byte to 0x80 or 0x00 at 0x033841 / 0x0339AC / 0x033AE5 / 0x033C42 / 0x033DBB.');
console.log('  5. No absolute LD (0xD0008C),A store and no OR/AND read-modify-write pattern was found.');
console.log();
console.log('Bias summary:');
console.log(`  exact set sites: ${exactHits.get('set7').length}`);
console.log(`  exact clear sites: ${exactHits.get('res7').length}`);
console.log(`  whole-byte force-set sites: ${indexedImmSetHits.length}`);
console.log(`  whole-byte force-clear sites: ${indexedImmClearHits.length}`);
console.log();
console.log('Answer: statically, bit 7 CLEAR / Level 2 looks like the common steady state.');
console.log('The SET state looks transient: it is armed by a small dispatcher/helper cluster and then cleared again by downstream Level 1 and cleanup paths.');
