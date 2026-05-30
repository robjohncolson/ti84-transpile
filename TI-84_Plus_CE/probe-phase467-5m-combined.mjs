#!/usr/bin/env node
// Phase 467: 5M-step combined fix test.
//
// This probe is derived from probe-phase466-combined-fix-test.mjs and applies
// only the Phase 467 deltas before executing the inherited probe body.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BASE_PROBE_PATH = resolve(HERE, 'probe-phase466-combined-fix-test.mjs');
const BASE_PROBE_URL = pathToFileURL(BASE_PROBE_PATH).href;

let source = readFileSync(BASE_PROBE_PATH, 'utf8');

function replaceRequired(pattern, replacement, description) {
  const next = source.replace(pattern, replacement);
  if (next === source) {
    throw new Error(`Unable to apply Phase 467 change: ${description}`);
  }
  source = next;
}

function appendToArray(arrayNames, entries, description) {
  const additions = entries
    .filter(({ needle }) => !source.includes(needle))
    .map(({ code }) => `\n  ${code},`)
    .join('');

  if (additions.length === 0) {
    return;
  }

  for (const arrayName of arrayNames) {
    const escapedName = arrayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
      `((?:export\\s+)?(?:const|let|var)\\s+${escapedName}\\s*=\\s*\\[[\\s\\S]*?)(\\r?\\n\\s*\\]\\s*;)`,
    );

    if (pattern.test(source)) {
      source = source.replace(pattern, (_match, head, close) => `${head}${additions}${close}`);
      return;
    }
  }

  throw new Error(`Unable to apply Phase 467 change: ${description}`);
}

source = source.replace(/Phase 466:[^"'`\r\n]*/g, 'Phase 467: 5M-step combined fix test');
source = source.replace(/Phase 466/g, 'Phase 467');

replaceRequired(
  /\bSCHEDULER_MAX_STEPS\s*=\s*2_?000_?000\b/g,
  'SCHEDULER_MAX_STEPS = 5000000',
  'increase scheduler max steps to 5M',
);
replaceRequired(
  /\bSCHEDULER_MAX_LOOP_ITERATIONS\s*=\s*50_?000\b/g,
  'SCHEDULER_MAX_LOOP_ITERATIONS = 250000',
  'increase loop iteration cap to 250000',
);

appendToArray(
  ['TRACKED_PCS'],
  [
    { needle: '0x003D5A', code: "[0x003D5A, 'key polling function']" },
    { needle: '0x003A7D', code: "[0x003A7D, 'scheduler re-entry check']" },
    { needle: '0x001778', code: "[0x001778, 'countdown setter']" },
    { needle: '0x0017BC', code: "[0x0017BC, 'event handler cleanup']" },
    { needle: '0x001713', code: "[0x001713, 'ISR guard entry']" },
  ],
  'add Phase 467 tracked PCs',
);

appendToArray(
  ['WATCHED_ADDRS'],
  [{ needle: '0xD00595', code: '0xD00595' }],
  'watch D00595',
);

appendToArray(
  ['checks', 'CHECKS'],
  [
    {
      needle: 'Key polling 0x003D5A reached',
      code: "['Key polling 0x003D5A reached', (trackedState.get(0x003D5A)?.count ?? 0) > 0]",
    },
    {
      needle: 'D00587 scan code consumed',
      code: "['D00587 scan code consumed (changed to 0)', after.get(0xD00587) === 0]",
    },
  ],
  'add Phase 467 checks',
);

source = source.replace(
  /(from\s+)(['"])(\.\/[^'"]+)\2/g,
  (_match, prefix, _quote, specifier) => `${prefix}${JSON.stringify(new URL(specifier, BASE_PROBE_URL).href)}`,
);
source = source.replace(
  /(import\s*\(\s*)(['"])(\.\/[^'"]+)\2(\s*\))/g,
  (_match, prefix, _quote, specifier, suffix) =>
    `${prefix}${JSON.stringify(new URL(specifier, BASE_PROBE_URL).href)}${suffix}`,
);
source = source.replace(/\bimport\.meta\.url\b/g, JSON.stringify(BASE_PROBE_URL));

await import(`data:text/javascript;base64,${Buffer.from(source, 'utf8').toString('base64')}`);
