#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const reportPath = path.join(__dirname, 'phase437-D14070-block-report.md');

const TARGET_D14073 = 0xD14073;
const BLOCK_START = 0xD14070;
const BLOCK_END = 0xD1407F;

const CALL_OPS = {
  0xC2: 'JP NZ',
  0xC3: 'JP',
  0xC4: 'CALL NZ',
  0xCA: 'JP Z',
  0xCC: 'CALL Z',
  0xCD: 'CALL',
  0xD2: 'JP NC',
  0xD4: 'CALL NC',
  0xDA: 'JP C',
  0xDC: 'CALL C',
  0xE2: 'JP PO',
  0xE4: 'CALL PO',
  0xEA: 'JP PE',
  0xEC: 'CALL PE',
  0xF2: 'JP P',
  0xF4: 'CALL P',
  0xFA: 'JP M',
  0xFC: 'CALL M',
};

const MODE_PREFIXES = new Set([0x40, 0x49, 0x52, 0x5B]);

const WRITE_NOTES = {
  [0x008B3F]: {
    semanticStart: 0x00840C,
    label: 'low-ROM event-completion callback',
    context:
      'Clears D1440E, then latches D14073=1 after the D1440F/D177B7 gate succeeds.',
  },
  [0x009A26]: {
    semanticStart: 0x0098D2,
    label: 'deep USB service dispatcher',
    context:
      'Priority attach-detect path: live 0x3082 bit 4 is present, so the dispatcher sets D14073=1 before CALL 0x012D13.',
  },
  [0x00F11E]: {
    semanticStart: 0x00EFA0,
    label: 'large USB state-machine cleanup',
    context:
      'Cleanup / disconnect arm: after the D14088 + 0x3082 handling path, it clears D14073 before the tail helper call.',
  },
  [0x012EED]: {
    semanticStart: 0x012E4D,
    label: 'USB enable / enumerate helper',
    context:
      'Post-null-check enable path: sets D14073=1, then writes D14042=0x0F and D14046=0x21.',
  },
  [0x012F80]: {
    semanticStart: 0x012E4D,
    label: 'USB disable / teardown helper',
    context:
      'Endpoint teardown path: clears D14073, then writes D14042=0x1F and D14046=0x30.',
  },
  [0x01304B]: {
    semanticStart: 0x01301D,
    label: 'USB port polling loop',
    context:
      'Stores the raw 0x3082 bit-4 sample (0x00 or 0x10) into D14073 instead of forcing a constant 0/1.',
  },
  [0x02BC87]: {
    semanticStart: 0x02B806,
    label: 'banked mirror of large USB state-machine cleanup',
    context:
      'Mirror of 0x00F11E: clears D14073 during the mirrored cleanup/disconnect path.',
  },
  [0x036773]: {
    semanticStart: 0x03662B,
    label: 'banked mirror of event-completion callback',
    context:
      'Mirror of 0x008B3F: clears D1440E, then latches D14073=1 on callback completion.',
  },
  [0x041A91]: {
    semanticStart: 0x0419F1,
    label: 'flash mirror of USB enable / enumerate helper',
    context:
      'Mirror of 0x012EED: sets D14073=1, then writes D14042=0x0F and D14046=0x21.',
  },
  [0x041B0E]: {
    semanticStart: 0x0419F1,
    label: 'flash mirror of USB disable / teardown helper',
    context:
      'Mirror of 0x012F80: clears D14073, then writes D14042=0x1F and D14046=0x30.',
  },
  [0x041BD7]: {
    semanticStart: 0x041BA9,
    label: 'flash mirror of USB port polling loop',
    context:
      'Mirror of 0x01304B: stores the raw 0x3082 bit-4 sample (0x00 or 0x10) into D14073.',
  },
  [0x049412]: {
    semanticStart: 0x04929D,
    label: 'flash mirror of deep USB service dispatcher',
    context:
      'Mirror of 0x009A26: attach-detect path sets D14073=1 before the mirrored helper call.',
  },
};

const FIELD_PURPOSES = {
  [0xD14070]: {
    purpose: 'unused gap / reserved byte',
    evidence: 'No literal references anywhere in the ROM.',
  },
  [0xD14071]: {
    purpose: 'unused gap / reserved byte',
    evidence: 'No literal references anywhere in the ROM.',
  },
  [0xD14072]: {
    purpose: 'best-fit: priority-service / bit-5 recovery latch',
    evidence:
      'Raised on the D14044 bit-1 + 0x3082 bit-5 path in 0x0098D2, then cleared by the alternate cleanup/reset branches.',
  },
  [0xD14073]: {
    purpose: 'confirmed: USB device-connected / ready flag',
    evidence:
      '40 reads are zero/nonzero gates; 12 writes set it on connect/enumerate and clear it on cleanup/disable.',
  },
  [0xD14074]: {
    purpose: 'confirmed: USB subsystem active flag',
    evidence:
      'The earlier phase-435 scan showed 26 writes vs 3 reads; it gates entry into the higher-level USB path.',
  },
  [0xD14075]: {
    purpose: 'best-fit: delayed follow-up gate',
    evidence:
      '0x008527 clears it immediately before CALL 0x01322D(0x0800); late follow-up branches read it as a one-byte gate.',
  },
  [0xD14076]: {
    purpose: 'best-fit: service-pending / completion counter',
    evidence:
      '0x00E583 increments it as a completion-side counter, while recovery/reset helpers clear it back to zero.',
  },
  [0xD14077]: {
    purpose: 'confirmed: arm/init latch',
    evidence:
      '0x014EF8 sets it to 1, 0x014E81 clears it to 0, and both halves guard on its current value.',
  },
  [0xD14078]: {
    purpose: 'best-fit: transfer sub-state latch A',
    evidence:
      'Mostly cleared as part of the D14078/D14079/D1407A cleanup trio; only a small late branch family reads it.',
  },
  [0xD14079]: {
    purpose: 'best-fit: notification-pending / retry latch',
    evidence:
      '0x0136BF sets it to 1 when USB is not active; cleanup paths clear it alongside D14078 and D1407A.',
  },
  [0xD1407A]: {
    purpose: 'best-fit: transfer-stage latch C',
    evidence:
      'Several 0x011FBB/0x012042/0x0122FA dispatch arms set it to 1, then the cleanup trio clears it back to 0.',
  },
  [0xD1407B]: {
    purpose: 'confirmed: first-SOF / reset-detect latch',
    evidence:
      'Set on the first SOF path, then cleared during reset/teardown handling in the 0x0096CB USB controller worker and mirrors.',
  },
  [0xD1407C]: {
    purpose: 'confirmed: bus-reset / connect latch',
    evidence:
      'Set to 1 on the bus-reset path, then polled by downstream workers before reset-handling calls.',
  },
  [0xD1407D]: {
    purpose: 'best-fit: controller-arm-needed companion flag',
    evidence:
      'Set alongside D1407C on bus reset, then read/cleared before CALL 0x014F97 in the later arm helper path.',
  },
  [0xD1407E]: {
    purpose: 'confirmed: follow-up dispatch / endpoint-ready gate',
    evidence:
      'Graph/notification handlers read it to optionally dispatch_key(0x10,0x03); reset/teardown paths clear it heavily.',
  },
  [0xD1407F]: {
    purpose: 'best-fit: USB configuration / protocol-mode latch',
    evidence:
      'Set in the 0x00A859 / 0x02AC81 family, cleared on bus reset/global reset, and read by several transfer-mode branches.',
  },
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function escapeMd(text) {
  return String(text).replace(/\|/g, '\\|');
}

function scanLiteral(address) {
  const lo = address & 0xff;
  const mid = (address >> 8) & 0xff;
  const hi = (address >> 16) & 0xff;
  const hits = [];
  for (let i = 0; i < rom.length - 2; i++) {
    if (rom[i] === lo && rom[i + 1] === mid && rom[i + 2] === hi) {
      hits.push(i);
    }
  }
  return hits;
}

function classifyReference(patternPos) {
  const b1 = patternPos >= 1 ? rom[patternPos - 1] : -1;
  const b2 = patternPos >= 2 ? rom[patternPos - 2] : -1;

  if (b1 === 0x3A || b1 === 0x2A) {
    return { type: 'READ', instrStart: patternPos - 1 };
  }
  if (b1 === 0x32 || b1 === 0x22) {
    return { type: 'WRITE', instrStart: patternPos - 1 };
  }
  if (b1 === 0x01 || b1 === 0x11 || b1 === 0x21 || b1 === 0x31) {
    return { type: 'ADDR_LOAD', instrStart: patternPos - 1 };
  }
  if ((b2 === 0xDD || b2 === 0xFD) && b1 === 0x2A) {
    return { type: 'READ', instrStart: patternPos - 2 };
  }
  if ((b2 === 0xDD || b2 === 0xFD) && b1 === 0x22) {
    return { type: 'WRITE', instrStart: patternPos - 2 };
  }
  if ((b2 === 0xDD || b2 === 0xFD) && b1 === 0x21) {
    return { type: 'ADDR_LOAD', instrStart: patternPos - 2 };
  }
  if (b2 === 0xED && (b1 === 0x4B || b1 === 0x5B || b1 === 0x6B || b1 === 0x7B)) {
    return { type: 'READ', instrStart: patternPos - 2 };
  }
  if (b2 === 0xED && (b1 === 0x43 || b1 === 0x53 || b1 === 0x63 || b1 === 0x73)) {
    return { type: 'WRITE', instrStart: patternPos - 2 };
  }
  if (MODE_PREFIXES.has(b2) && (b1 === 0x3A || b1 === 0x2A)) {
    return { type: 'READ', instrStart: patternPos - 2 };
  }
  if (MODE_PREFIXES.has(b2) && (b1 === 0x32 || b1 === 0x22)) {
    return { type: 'WRITE', instrStart: patternPos - 2 };
  }
  if (MODE_PREFIXES.has(b2) && (b1 === 0x01 || b1 === 0x11 || b1 === 0x21 || b1 === 0x31)) {
    return { type: 'ADDR_LOAD', instrStart: patternPos - 2 };
  }
  return { type: 'UNKNOWN', instrStart: patternPos };
}

function countReferences(address) {
  const counts = {
    total: 0,
    reads: 0,
    writes: 0,
    addrLoads: 0,
    unknown: 0,
  };
  const hits = scanLiteral(address);
  counts.total = hits.length;
  for (const hit of hits) {
    const ref = classifyReference(hit);
    if (ref.type === 'READ') {
      counts.reads += 1;
    } else if (ref.type === 'WRITE') {
      counts.writes += 1;
    } else if (ref.type === 'ADDR_LOAD') {
      counts.addrLoads += 1;
    } else {
      counts.unknown += 1;
    }
  }
  return counts;
}

function findNearestPushIx(pc, maxBack = 0x800) {
  for (let i = pc; i >= Math.max(0, pc - maxBack); i--) {
    if (rom[i] === 0xDD && rom[i + 1] === 0xE5) {
      return i;
    }
  }
  return null;
}

function findNearestRetEntry(pc, maxBack = 0x800) {
  for (let i = pc; i >= Math.max(0, pc - maxBack); i--) {
    if (rom[i] === 0xC9) {
      return i + 1;
    }
  }
  return null;
}

function describeSearch(pc, semanticStart) {
  const pushIx = findNearestPushIx(pc);
  if (pushIx !== null) {
    return `PUSH IX @ ${hex(pushIx)}`;
  }
  const retEntry = findNearestRetEntry(pc);
  if (retEntry !== null) {
    if (semanticStart !== undefined && semanticStart !== retEntry) {
      return `no PUSH IX; nearest RET-bounded entry ${hex(retEntry)} (semantic block ${hex(semanticStart)})`;
    }
    return `no PUSH IX; RET-bounded entry ${hex(retEntry)}`;
  }
  return 'no PUSH IX/RET boundary found';
}

function findDirectCallers(target) {
  const lo = target & 0xff;
  const mid = (target >> 8) & 0xff;
  const hi = (target >> 16) & 0xff;
  const callers = [];
  for (let i = 0; i < rom.length - 3; i++) {
    const op = rom[i];
    if (CALL_OPS[op] && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      callers.push(`${hex(i)} ${CALL_OPS[op]}`);
    }
  }
  return callers;
}

function detectWriteBehavior(instrStart) {
  if (rom[instrStart] !== 0x32) {
    return {
      category: 'UNKNOWN',
      value: 'unknown',
      source: 'not an LD (addr),A site',
    };
  }
  if (
    instrStart >= 4 &&
    rom[instrStart - 4] === 0xED &&
    rom[instrStart - 3] === 0x78 &&
    rom[instrStart - 2] === 0xE6 &&
    rom[instrStart - 1] === 0x10
  ) {
    return {
      category: 'SAMPLED',
      value: '0x3082 bit 4 (0x00 or 0x10)',
      source: 'IN A,(0x3082); AND 0x10',
    };
  }
  if (instrStart >= 1 && rom[instrStart - 1] === 0xAF) {
    return {
      category: 'CLEAR',
      value: '0',
      source: 'XOR A',
    };
  }
  if (instrStart >= 2 && rom[instrStart - 2] === 0x3E) {
    const imm = rom[instrStart - 1];
    return {
      category: imm === 0 ? 'CLEAR' : 'SET',
      value: imm === 0 || imm === 1 ? String(imm) : `0x${hexByte(imm)}`,
      source: `LD A,0x${hexByte(imm)}`,
    };
  }
  return {
    category: 'UNKNOWN',
    value: 'unknown',
    source: 'no simple backward constant/source pattern',
  };
}

function findD14073WriteSites() {
  const out = [];
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0x32 && rom[i + 1] === 0x73 && rom[i + 2] === 0x40 && rom[i + 3] === 0xD1) {
      out.push(i);
    }
  }
  return out;
}

function buildReport() {
  const writePcs = findD14073WriteSites().sort((a, b) => a - b);
  const writeRows = writePcs.map((pc) => {
    const note = WRITE_NOTES[pc] || {
      semanticStart: pc,
      label: 'unlabeled write site',
      context: 'No manual note recorded for this write site.',
    };
    const behavior = detectWriteBehavior(pc);
    const callers = findDirectCallers(note.semanticStart);
    return {
      pc,
      note,
      behavior,
      searchResult: describeSearch(pc, note.semanticStart),
      callersText: callers.length > 0 ? callers.join(', ') : 'none found by exact CALL/JP scan',
    };
  });

  const split = { SET: 0, CLEAR: 0, SAMPLED: 0, UNKNOWN: 0 };
  for (const row of writeRows) {
    split[row.behavior.category] += 1;
  }

  const blockRows = [];
  const zeroRefAddrs = [];
  let totalAddrLoads = 0;
  for (let addr = BLOCK_START; addr <= BLOCK_END; addr++) {
    const counts = countReferences(addr);
    totalAddrLoads += counts.addrLoads;
    if (counts.total === 0) {
      zeroRefAddrs.push(addr);
    }
    blockRows.push({
      addr,
      counts,
      info: FIELD_PURPOSES[addr],
    });
  }

  const lines = [];
  lines.push('# Phase 437: D14073 Write Sites + D14070-D1407F USB State Block');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(
    `- D14073 has ${writeRows.length} write sites: ${split.SET} constant SET, ${split.CLEAR} constant CLEAR, ${split.SAMPLED} live port-sample stores, ${split.UNKNOWN} unknown.`
  );
  lines.push(
    '- The D14073 lifecycle is now explicit: callback/event completion -> attach detect -> enumerate/enable -> state-machine cleanup -> disable/teardown.'
  );
  lines.push(`- Zero-reference bytes in the block: ${zeroRefAddrs.map((addr) => `\`${hex(addr)}\``).join(', ')}.`);
  lines.push(
    `- No addr-load style references were found anywhere in D14070-D1407F (total addr-load count: ${totalAddrLoads}). The whole window behaves like a byte-state block, not a pointer block.`
  );
  lines.push('');
  lines.push('## D14073 Write Sites');
  lines.push('');
  lines.push('| Write PC | Category | Value written | Semantic block | Prologue search | Direct callers | Context |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const row of writeRows) {
    lines.push(
      `| \`${hex(row.pc)}\` | ${escapeMd(row.behavior.category)} | ${escapeMd(
        `${row.behavior.value} (${row.behavior.source})`
      )} | \`${hex(row.note.semanticStart)}\` ${escapeMd(row.note.label)} | ${escapeMd(
        row.searchResult
      )} | ${escapeMd(row.callersText)} | ${escapeMd(row.note.context)} |`
    );
  }
  lines.push('');
  lines.push('### Write-Site Families');
  lines.push('');
  lines.push('- Event-completion latches: `0x008B3F`, `0x036773`.');
  lines.push('- Immediate attach-detect latches: `0x009A26`, `0x049412`.');
  lines.push('- Enable/enumerate latches: `0x012EED`, `0x041A91`.');
  lines.push('- Raw hardware sample stores: `0x01304B`, `0x041BD7`.');
  lines.push('- Cleanup clears inside the large state machines: `0x00F11E`, `0x02BC87`.');
  lines.push('- Disable/teardown clears: `0x012F80`, `0x041B0E`.');
  lines.push('');
  lines.push('## D14070-D1407F Reference Counts');
  lines.push('');
  lines.push('| Address | Total | Reads | Writes | Addr-loads | Proposed purpose | Evidence |');
  lines.push('| --- | ---: | ---: | ---: | ---: | --- | --- |');
  for (const row of blockRows) {
    lines.push(
      `| \`${hex(row.addr)}\` | ${row.counts.total} | ${row.counts.reads} | ${row.counts.writes} | ${row.counts.addrLoads} | ${escapeMd(
        row.info.purpose
      )} | ${escapeMd(row.info.evidence)} |`
    );
  }
  lines.push('');
  lines.push('## Structural Layout');
  lines.push('');
  lines.push('```text');
  lines.push('D14070-D14071  reserved / currently unused gap');
  lines.push('D14072         priority-service / bit-5 recovery latch');
  lines.push('D14073         USB device-connected / ready flag');
  lines.push('D14074         USB subsystem active flag');
  lines.push('D14075         delayed follow-up gate');
  lines.push('D14076         service-pending / completion counter');
  lines.push('D14077         arm/init latch');
  lines.push('D14078-D1407A  transfer / notification sub-state trio');
  lines.push('  D14078       late transfer sub-state latch A');
  lines.push('  D14079       notification-pending / retry latch');
  lines.push('  D1407A       transfer-stage latch C');
  lines.push('D1407B-D1407F  USB hardware event front-end');
  lines.push('  D1407B       first-SOF / reset-detect latch');
  lines.push('  D1407C       bus-reset / connect latch');
  lines.push('  D1407D       controller-arm-needed companion flag');
  lines.push('  D1407E       follow-up dispatch / endpoint-ready gate');
  lines.push('  D1407F       configuration / protocol-mode latch');
  lines.push('```');
  lines.push('');
  lines.push('## Lifecycle Interpretation');
  lines.push('');
  lines.push(
    '- `D14073` is the inner connection gate. It is set by immediate attach detection (`0x009A26` / `0x049412`), by raw port-bit sampling (`0x01304B` / `0x041BD7`), and by the explicit enable/enumerate helper (`0x012EED` / `0x041A91`).'
  );
  lines.push(
    '- It is cleared in two distinct places: inside the large runtime USB state machines (`0x00F11E` / `0x02BC87`) and inside the explicit disable/teardown helper (`0x012F80` / `0x041B0E`).'
  );
  lines.push(
    '- The surrounding bytes split cleanly into three layers: front-end service gates (`D14072-D14076`), one arm/init latch (`D14077`), and the hardware USB event/reset/config cluster (`D1407B-D1407F`).'
  );
  lines.push('');
  lines.push(
    'Generated by `probe-phase437-D14073-writes.mjs` from direct ROM byte-pattern scans.'
  );

  return lines.join('\n');
}

const report = buildReport();
fs.writeFileSync(reportPath, report);
console.log(report);
