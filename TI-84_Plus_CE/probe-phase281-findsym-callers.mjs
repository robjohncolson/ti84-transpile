#!/usr/bin/env node
// Phase 281: Categorize unconditional FindSym callers by OS subsystem.
//
// This probe does a static ROM scan for:
//   CALL 0x0846EA  => CD EA 46 08
//   JP   0x0846EA  => C3 EA 46 08
//
// It groups the 235 raw hits discovered in phase 275 by coarse TI-OS
// subsystem ranges and annotates each site with the nearest known jump-table
// targets from phase25h-a-jump-table.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

// Keep the usual probe skeleton imports available even though this phase is
// static and does not execute lifted ROM blocks.
void createExecutor;
void createPeripheralBus;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const JUMP_TABLE_PATH = path.join(__dirname, 'phase25h-a-jump-table.json');

const FIND_SYM = 0x0846EA;
const CALL_PATTERN = Buffer.from([0xCD, 0xEA, 0x46, 0x08]);
const JP_PATTERN = Buffer.from([0xC3, 0xEA, 0x46, 0x08]);
const EXPECTED_PHASE275_HITS = 235;
const EXAMPLE_LIMIT = 6;
const NEARBY_LIMIT = 3;
const ADDRESS_WRAP = 8;

const SUBSYSTEMS = [
  {
    name: 'STAT',
    ranges: [
      [0x09DD00, 0x09F000],
      [0x040B00, 0x040D00],
    ],
  },
  {
    name: 'Graph',
    ranges: [
      [0x04E000, 0x055000],
    ],
  },
  {
    name: 'Home/Edit',
    ranges: [
      [0x057000, 0x05A000],
    ],
  },
  {
    name: 'Link/USB',
    ranges: [
      [0x06A000, 0x070000],
    ],
  },
  {
    name: 'Y= Editor',
    ranges: [
      [0x09A000, 0x09D000],
    ],
  },
  {
    name: 'Table',
    ranges: [
      [0x096000, 0x09A000],
    ],
  },
  {
    name: 'Program Editor',
    ranges: [
      [0x060000, 0x065000],
    ],
  },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function rangeLabel([start, endExclusive]) {
  return `${hex(start)}-${hex(endExclusive - 1)}`;
}

function inRange(addr, start, endExclusive) {
  return addr >= start && addr < endExclusive;
}

function formatDelta(delta) {
  if (delta === 0) {
    return 'same';
  }
  const sign = delta > 0 ? '+' : '-';
  return `${sign}${hex(Math.abs(delta), 0)}`;
}

function scanPattern(rom, pattern, kind) {
  const hits = [];

  for (let addr = rom.indexOf(pattern); addr !== -1; addr = rom.indexOf(pattern, addr + 1)) {
    hits.push({
      address: addr >>> 0,
      kind,
      target: FIND_SYM,
      rawBytes: Array.from(pattern),
    });
  }

  return hits;
}

function classifySubsystem(addr) {
  for (const subsystem of SUBSYSTEMS) {
    for (const range of subsystem.ranges) {
      if (inRange(addr, range[0], range[1])) {
        return {
          subsystem: subsystem.name,
          matchedRange: rangeLabel(range),
        };
      }
    }
  }

  return {
    subsystem: 'Unclassified',
    matchedRange: null,
  };
}

function loadKnownFunctions() {
  if (!fs.existsSync(JUMP_TABLE_PATH)) {
    return [];
  }

  const entries = JSON.parse(fs.readFileSync(JUMP_TABLE_PATH, 'utf8'));
  const deduped = new Map();

  for (const entry of entries) {
    const addr = Number(entry?.targetNum);
    const name = String(entry?.name ?? '').trim();
    if (!Number.isFinite(addr) || !name) {
      continue;
    }

    const key = `${addr}:${name}`;
    if (!deduped.has(key)) {
      deduped.set(key, {
        address: addr >>> 0,
        name,
      });
    }
  }

  return [...deduped.values()].sort((left, right) => {
    if (left.address !== right.address) {
      return left.address - right.address;
    }
    return left.name.localeCompare(right.name);
  });
}

function nearbyKnownFunctions(addr, knownFunctions, limit = NEARBY_LIMIT) {
  return knownFunctions
    .map((entry) => ({
      ...entry,
      delta: entry.address - addr,
      distance: Math.abs(entry.address - addr),
    }))
    .sort((left, right) => {
      if (left.distance !== right.distance) {
        return left.distance - right.distance;
      }
      if (left.address !== right.address) {
        return left.address - right.address;
      }
      return left.name.localeCompare(right.name);
    })
    .slice(0, limit);
}

function summarizeExamples(callers, limit = EXAMPLE_LIMIT) {
  const examples = callers.slice(0, limit).map((caller) => hex(caller.address));
  if (callers.length > limit) {
    examples.push('...');
  }
  return examples.join(', ');
}

function formatNearby(entries) {
  if (entries.length === 0) {
    return '(none)';
  }

  return entries
    .map((entry) => `${entry.name}@${hex(entry.address)}(${formatDelta(entry.delta)})`)
    .join(', ');
}

function chunk(items, size) {
  const out = [];
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size));
  }
  return out;
}

function printTable(rows) {
  const widths = {
    subsystem: Math.max('Subsystem'.length, ...rows.map((row) => row.subsystem.length)),
    count: Math.max('Count'.length, ...rows.map((row) => String(row.count).length)),
    calls: Math.max('CALL'.length, ...rows.map((row) => String(row.calls).length)),
    jps: Math.max('JP'.length, ...rows.map((row) => String(row.jps).length)),
  };

  const header =
    `${'Subsystem'.padEnd(widths.subsystem)}  `
    + `${'Count'.padStart(widths.count)}  `
    + `${'CALL'.padStart(widths.calls)}  `
    + `${'JP'.padStart(widths.jps)}  `
    + 'Example addresses';

  console.log(header);
  console.log('-'.repeat(header.length));

  for (const row of rows) {
    console.log(
      `${row.subsystem.padEnd(widths.subsystem)}  `
      + `${String(row.count).padStart(widths.count)}  `
      + `${String(row.calls).padStart(widths.calls)}  `
      + `${String(row.jps).padStart(widths.jps)}  `
      + `${row.examples}`
    );
  }
}

function printGroupedAddresses(rows) {
  for (const row of rows) {
    console.log(`\n${row.subsystem} (${row.count})`);
    for (const parts of chunk(row.callers.map((caller) => `${hex(caller.address)}:${caller.kind}`), ADDRESS_WRAP)) {
      console.log(`  ${parts.join(', ')}`);
    }
  }
}

function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const knownFunctions = loadKnownFunctions();

  const callers = [
    ...scanPattern(rom, CALL_PATTERN, 'CALL'),
    ...scanPattern(rom, JP_PATTERN, 'JP'),
  ]
    .map((caller) => {
      const classification = classifySubsystem(caller.address);
      return {
        ...caller,
        subsystem: classification.subsystem,
        matchedRange: classification.matchedRange,
        nearby: nearbyKnownFunctions(caller.address, knownFunctions),
      };
    })
    .sort((left, right) => {
      if (left.address !== right.address) {
        return left.address - right.address;
      }
      return left.kind.localeCompare(right.kind);
    });

  const groupOrder = [...SUBSYSTEMS.map((entry) => entry.name), 'Unclassified'];
  const rows = groupOrder.map((subsystem) => {
    const grouped = callers.filter((caller) => caller.subsystem === subsystem);
    return {
      subsystem,
      callers: grouped,
      count: grouped.length,
      calls: grouped.filter((caller) => caller.kind === 'CALL').length,
      jps: grouped.filter((caller) => caller.kind === 'JP').length,
      examples: summarizeExamples(grouped),
    };
  });

  const unclassified = callers.filter((caller) => caller.subsystem === 'Unclassified');

  console.log('=== Phase 281: FindSym Caller Subsystem Map ===');
  console.log(`target=${hex(FIND_SYM)} romBytes=${hex(rom.length)} jumpTableTargets=${knownFunctions.length}`);
  console.log(
    `patterns: CALL=[${CALL_PATTERN.toString('hex').toUpperCase().match(/../g).join(' ')}] `
    + `JP=[${JP_PATTERN.toString('hex').toUpperCase().match(/../g).join(' ')}]`
  );
  console.log(
    `rawHits=${callers.length} CALL=${rows.reduce((sum, row) => sum + row.calls, 0)} `
    + `JP=${rows.reduce((sum, row) => sum + row.jps, 0)} `
    + `phase275Match=${callers.length === EXPECTED_PHASE275_HITS ? 'yes' : 'no'}`
  );

  console.log('\nSubsystem ranges:');
  for (const subsystem of SUBSYSTEMS) {
    console.log(`  ${subsystem.name}: ${subsystem.ranges.map(rangeLabel).join(', ')}`);
  }

  console.log('\n--- Summary Table ---');
  printTable(rows);

  console.log('\n--- Grouped Caller Addresses ---');
  printGroupedAddresses(rows.filter((row) => row.count > 0));

  console.log('\n--- Unclassified Callers ---');
  if (unclassified.length === 0) {
    console.log('none');
  } else {
    for (const caller of unclassified) {
      console.log(
        `${hex(caller.address)} ${caller.kind.padEnd(4)} `
        + `nearestJumpTableTargets=${formatNearby(caller.nearby)}`
      );
    }
  }
}

main();
