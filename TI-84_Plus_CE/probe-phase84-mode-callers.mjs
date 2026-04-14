#!/usr/bin/env node
// Phase 84 - static caller scan for the Phase 75 mode-var readers.
// Goal: find blocks that call the mode readers, then rank nearby callers that
// also touch the text-render path used by the home-screen status bar.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase84-mode-callers-report.md');

const MODE_READERS = [
  { addr: 0x0a2812, label: 'reads 0xd00092' },
  { addr: 0x0a281a, label: 'reads 0xd00085' },
  { addr: 0x0a29a8, label: 'reads 0xd00092 via helper' },
  { addr: 0x0a654e, label: 'reads 0xd0008e' },
];

const TEXT_RENDERERS = [
  { addr: 0x0a1cac, label: 'string printer' },
  { addr: 0x0a1799, label: 'single-char printer' },
  { addr: 0x05e242, label: 'per-char text helper' },
  { addr: 0x0a2b72, label: 'scroll/clear helper' },
];

const modeReaderSet = new Set(MODE_READERS.map((entry) => entry.addr));
const textRendererSet = new Set(TEXT_RENDERERS.map((entry) => entry.addr));

const hex = (value, width = 6) => `0x${(value >>> 0).toString(16).padStart(width, '0')}`;

function getBlockExits(block) {
  return Array.isArray(block?.exits) ? block.exits : [];
}

function getBlockInstructions(block) {
  return Array.isArray(block?.instructions) ? block.instructions : [];
}

function inlineCode(value) {
  const text = String(value ?? '')
    .replace(/`/g, "'")
    .replace(/\|/g, '\\|')
    .replace(/\s+/g, ' ')
    .trim();

  return `\`${text || '-'}\``;
}

function previewDasm(block, count = 4) {
  const preview = getBlockInstructions(block)
    .slice(0, count)
    .map((instruction) => instruction?.dasm || '(no dasm)');

  return preview.length > 0 ? preview.join(' ; ') : '(no instructions)';
}

function formatExit(exit) {
  if (!exit || typeof exit !== 'object') {
    return 'unknown';
  }

  if (typeof exit.target === 'number') {
    return `${exit.type || 'unknown'} ${hex(exit.target)}`;
  }

  return exit.type || 'unknown';
}

function formatExitList(block) {
  const exits = getBlockExits(block).map(formatExit);
  return exits.length > 0 ? `[${exits.join(', ')}]` : '[]';
}

function pageBase(address) {
  return Math.floor(address / 0x1000) * 0x1000;
}

function uniqueSortedNumbers(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function formatHexList(values) {
  const sorted = uniqueSortedNumbers(values);
  if (sorted.length === 0) {
    return '-';
  }

  return sorted.map((value) => hex(value)).join(', ');
}

function sortBlocks(blocks) {
  return [...blocks].sort((left, right) => left.startPc - right.startPc);
}

function ensureArray(map, key) {
  let list = map.get(key);
  if (list) {
    return list;
  }

  list = [];
  map.set(key, list);
  return list;
}

console.log('Loading PRELIFTED_BLOCKS...');
const mod = await import(pathToFileURL(transpiledPath).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;
const blocks = Object.values(BLOCKS);
console.log(`Loaded ${blocks.length} blocks`);

const callersByTarget = new Map();
const callTargetsByPc = new Map();

for (const block of blocks) {
  if (!block || typeof block.startPc !== 'number') {
    continue;
  }

  const callTargets = new Set();

  for (const exit of getBlockExits(block)) {
    if (exit?.type !== 'call' || typeof exit?.target !== 'number') {
      continue;
    }

    callTargets.add(exit.target);
  }

  callTargetsByPc.set(block.startPc, callTargets);

  for (const target of callTargets) {
    ensureArray(callersByTarget, target).push(block);
  }
}

const perTarget = MODE_READERS.map((reader) => ({
  reader,
  callers: sortBlocks(callersByTarget.get(reader.addr) || []),
}));

const directCallerMap = new Map();

for (const entry of perTarget) {
  for (const block of entry.callers) {
    let caller = directCallerMap.get(block.startPc);

    if (!caller) {
      const callTargets = callTargetsByPc.get(block.startPc) || new Set();
      caller = {
        block,
        modeHits: new Set(),
        textHits: new Set(),
      };

      for (const target of callTargets) {
        if (textRendererSet.has(target)) {
          caller.textHits.add(target);
        }
      }

      directCallerMap.set(block.startPc, caller);
    }

    caller.modeHits.add(entry.reader.addr);
  }
}

const directCallers = [...directCallerMap.values()].sort((left, right) => left.block.startPc - right.block.startPc);
const homeCandidates = directCallers.filter((entry) => entry.textHits.size > 0);

const pages = new Map();
for (const entry of directCallers) {
  const page = pageBase(entry.block.startPc);
  ensureArray(pages, page).push(entry.block.startPc);
}

const sortedPages = [...pages.entries()]
  .map(([page, addresses]) => ({ page, addresses: uniqueSortedNumbers(addresses) }))
  .sort((left, right) => left.page - right.page);

const perDirectCallerTwoHop = [];
const twoHopMap = new Map();

for (const entry of directCallers) {
  const parents = sortBlocks(callersByTarget.get(entry.block.startPc) || []);
  const parentAddresses = uniqueSortedNumbers(parents.map((block) => block.startPc));

  perDirectCallerTwoHop.push({
    directCaller: entry,
    parentAddresses,
  });

  for (const parent of parents) {
    let twoHop = twoHopMap.get(parent.startPc);

    if (!twoHop) {
      const callTargets = callTargetsByPc.get(parent.startPc) || new Set();
      twoHop = {
        block: parent,
        directChildren: new Set(),
        indirectModeHits: new Set(),
        textHits: new Set(),
      };

      for (const target of callTargets) {
        if (textRendererSet.has(target)) {
          twoHop.textHits.add(target);
        }
      }

      twoHopMap.set(parent.startPc, twoHop);
    }

    twoHop.directChildren.add(entry.block.startPc);

    for (const modeHit of entry.modeHits) {
      twoHop.indirectModeHits.add(modeHit);
    }
  }
}

const twoHopCallers = [...twoHopMap.values()].sort((left, right) => {
  if (right.directChildren.size !== left.directChildren.size) {
    return right.directChildren.size - left.directChildren.size;
  }

  return left.block.startPc - right.block.startPc;
});

const lines = [];
const push = (line = '') => lines.push(line);

push('# Phase 84 - Mode-Var Reader Callers');
push();
push('Static scan of `Object.values(PRELIFTED_BLOCKS)` for blocks whose `exits`');
push('contain `call` edges to the four Phase 75 mode-var readers.');
push();

push('## Targets scanned');
for (const entry of perTarget) {
  push(`- ${hex(entry.reader.addr)}: ${entry.callers.length} direct callers`);
}
push();

push('## Direct callers by target');
push();

for (const entry of perTarget) {
  push(`### ${hex(entry.reader.addr)} - ${entry.reader.label}`);
  push();

  if (entry.callers.length === 0) {
    push('_none_');
    push();
    continue;
  }

  push('| caller | page | first 4 dasm | all exits |');
  push('|--------|------|--------------|----------|');

  for (const block of entry.callers) {
    push(
      `| ${hex(block.startPc)} | ${hex(pageBase(block.startPc))} | ${inlineCode(previewDasm(block))} | ${inlineCode(formatExitList(block))} |`,
    );
  }

  push();
}

push('## Callers that ALSO call text renderers (home screen candidates)');
push();

if (homeCandidates.length === 0) {
  push('_none_');
} else {
  push('| addr | calls mode-reader | calls text-renderer | dasm preview |');
  push('|------|-------------------|---------------------|--------------|');

  for (const entry of homeCandidates) {
    push(
      `| ${hex(entry.block.startPc)} | ${inlineCode(formatHexList([...entry.modeHits]))} | ${inlineCode(formatHexList([...entry.textHits]))} | ${inlineCode(previewDasm(entry.block))} |`,
    );
  }
}

push();
push('## Page map (all direct callers)');
push();

if (sortedPages.length === 0) {
  push('_none_');
} else {
  push('| page | count | addresses |');
  push('|------|------:|-----------|');

  for (const entry of sortedPages) {
    push(`| ${hex(entry.page)} | ${entry.addresses.length} | ${inlineCode(formatHexList(entry.addresses))} |`);
  }
}

push();
push('## Two-hop callers (callers of the mode-var caller clusters)');
push();

if (directCallers.length === 0) {
  push('_none_');
} else {
  push('### Per direct caller');
  push();
  push('| direct caller | mode-reader hits | two-hop callers |');
  push('|---------------|------------------|-----------------|');

  for (const entry of perDirectCallerTwoHop) {
    push(
      `| ${hex(entry.directCaller.block.startPc)} | ${inlineCode(formatHexList([...entry.directCaller.modeHits]))} | ${inlineCode(formatHexList(entry.parentAddresses))} |`,
    );
  }

  push();
  push('### Unique two-hop caller blocks');
  push();

  if (twoHopCallers.length === 0) {
    push('_none_');
  } else {
    push('| addr | calls direct-caller(s) | indirect mode-reader(s) | text-renderer hits | dasm preview |');
    push('|------|------------------------|-------------------------|--------------------|--------------|');

    for (const entry of twoHopCallers) {
      push(
        `| ${hex(entry.block.startPc)} | ${inlineCode(formatHexList([...entry.directChildren]))} | ${inlineCode(formatHexList([...entry.indirectModeHits]))} | ${inlineCode(formatHexList([...entry.textHits]))} | ${inlineCode(previewDasm(entry.block))} |`,
      );
    }
  }
}

push();
fs.writeFileSync(reportPath, lines.join('\n'));

for (const entry of perTarget) {
  console.log(`${hex(entry.reader.addr)} -> ${entry.callers.length} direct callers`);
}
console.log(`Home-screen candidates: ${homeCandidates.length}`);
console.log(`Direct-caller pages: ${sortedPages.length}`);
console.log(`Unique two-hop callers: ${twoHopCallers.length}`);
console.log(`Wrote report to ${reportPath}`);
