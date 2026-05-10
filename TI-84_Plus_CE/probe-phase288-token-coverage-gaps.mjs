#!/usr/bin/env node
/**
 * Phase 288: Token Coverage Gap Analysis
 *
 * Compares the ROM token name table at 0x0A0806 (593 entries, format:
 * token_id u8, strlen u8, chars[strlen]) against the EVAL_TOKEN_MAP in
 * browser-shell.html. Reports which ROM tokens are missing from the
 * browser-shell map.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const HTML_PATH = path.join(__dirname, 'browser-shell.html');

const TABLE_BASE = 0x0A0806;
const TABLE_END = 0x0A1799;

// --- ROM token table parsing ---

function parseRomTokenTable(rom) {
  const tokens = new Map();
  let addr = TABLE_BASE;

  while (addr < TABLE_END && addr + 1 < rom.length) {
    const tokenId = rom[addr];
    const strlen = rom[addr + 1];

    // Stop on zero-length or if we'd read past the end
    if (strlen === 0 || addr + 2 + strlen > rom.length || addr + 2 + strlen > TABLE_END + 16) {
      break;
    }

    const bytes = rom.subarray(addr + 2, addr + 2 + strlen);
    const name = renderTokenName(bytes);
    tokens.set(tokenId, name);
    addr += 2 + strlen;
  }

  return tokens;
}

function renderTokenName(bytes) {
  let result = '';
  for (const byte of bytes) {
    if (byte >= 0x20 && byte <= 0x7E) {
      result += String.fromCharCode(byte);
    } else if (byte >= 0x80 && byte <= 0x89) {
      result += String(byte - 0x80);  // Digit display codes
    } else if (byte === 0xC1) {
      result += '[';
    } else {
      result += `\\x${(byte & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
    }
  }
  return result;
}

// --- Browser-shell EVAL_TOKEN_MAP extraction ---

function extractBrowserShellTokenIds(html) {
  const ids = new Set();

  // Find the EVAL_TOKEN_MAP object literal block
  const mapStart = html.indexOf('const EVAL_TOKEN_MAP = {');
  if (mapStart === -1) {
    console.error('ERROR: Could not find EVAL_TOKEN_MAP in browser-shell.html');
    return ids;
  }

  // Find closing brace of the object
  const mapEnd = html.indexOf('};', mapStart);
  const mapBlock = html.substring(mapStart, mapEnd + 2);

  // Extract hex values (the token IDs are the VALUES in the map, e.g. '0': 0x30)
  const hexPattern = /0x([0-9A-Fa-f]+)/g;
  let match;
  while ((match = hexPattern.exec(mapBlock)) !== null) {
    ids.add(parseInt(match[1], 16));
  }

  // The for loop adds A-Z (0x41-0x5A)
  for (let code = 0x41; code <= 0x5A; code++) {
    ids.add(code);
  }

  // Also look for any other token IDs defined nearby (TI_NEGATE_TOKEN, etc.)
  // Search a broader region after the map for additional token references
  const extendedBlock = html.substring(mapStart, Math.min(html.length, mapStart + 3000));

  // Look for patterns like EVAL_TOKEN_MAP[...] = 0xNN or EVAL_TOKEN_MAP.X = 0xNN
  const assignPattern = /EVAL_TOKEN_MAP\[.*?\]\s*=\s*0x([0-9A-Fa-f]+)/g;
  while ((match = assignPattern.exec(extendedBlock)) !== null) {
    ids.add(parseInt(match[1], 16));
  }
  const dotAssignPattern = /EVAL_TOKEN_MAP\.\w+\s*=\s*0x([0-9A-Fa-f]+)/g;
  while ((match = dotAssignPattern.exec(extendedBlock)) !== null) {
    ids.add(parseInt(match[1], 16));
  }

  // TI_NEGATE_TOKEN = 0xB0 and EVAL_E_CONSTANT_TOKENS contain token IDs
  // that are emitted but let's add them too
  ids.add(0xB0);  // negation
  // e^(1) sequence: 0xBF, 0x10, 0x31, 0x11
  ids.add(0xBF);

  return ids;
}

// --- Categorization ---

function categorizeToken(name) {
  const lower = name.toLowerCase();

  // Math functions
  if (/^(sin|cos|tan|ln|log|sqrt|abs|int|min|max|lcm|gcd|remainder|fpart|ipart|round|iprt|dim|sum|prod|seq|cumsum|augment|rowswap|det|identity|fill|ref|rref|rand|nderiv|fnint|solve|fmin|fmax|sign|ceil|floor|conj|real|imag|angle|phasor)/.test(lower)) {
    return 'Math';
  }
  if (/sinh|cosh|tanh|asin|acos|atan/.test(lower)) return 'Math';
  if (/\^|nroot|e\^|10\^/.test(lower)) return 'Math';

  // Statistics
  if (/var|reg|test|stat|med|anova|chi|norm|binom|poisson|geom|sample|zscore|ttest|ztest|linreg|quadreg|cubicreg|quartreg|lnreg|expreg|pwrreg|logistic|sinreg|resid|freq/.test(lower)) {
    return 'Stats';
  }

  // System/IO commands
  if (/^(clr|disp|output|input|prompt|pause|stop|return|goto|lbl|if|then|else|end|for|while|repeat|menu|get|send|is>|ds<|delvar|graph|draw|text|pxl|pt-|line|circle|shade|tangent|vert|horiz|stor|rcl|fnon|fnoff|printscrn)/.test(lower)) {
    return 'System';
  }

  // Variables
  if (/^(ans|pi|theta|[a-z]$|xmin|xmax|ymin|ymax|xscl|yscl|tmin|tmax|tstep|nmin|nmax|plotstart|plotstep|znmin|znmax|ztmin|ztmax|deltax|deltay)/.test(lower)) {
    return 'Variables';
  }

  // List/Matrix
  if (/^(l[1-6]|mat|list|\[)/.test(lower)) return 'List/Matrix';

  // Graph/Window
  if (/^(zoom|trace|graph|func|pol|par|seq|connected|dot|simul|full|horiz|window|format)/.test(lower)) {
    return 'Graph/Window';
  }

  // String functions
  if (/^(str|sub|length|instring|expr|string)/.test(lower)) return 'String';

  // Probability/combinatorics
  if (/^(npr|ncr|rand|!|comb|perm|factorial)/.test(lower)) return 'Probability';

  return 'Other';
}

// --- Main ---

function main() {
  console.log('Phase 288: Token Coverage Gap Analysis');
  console.log('======================================\n');

  // Parse ROM token table
  const rom = fs.readFileSync(ROM_PATH);
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);

  const romTokens = parseRomTokenTable(rom);
  console.log(`ROM token table at 0x0A0806: ${romTokens.size} entries parsed\n`);

  // Extract browser-shell token IDs
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const shellTokenIds = extractBrowserShellTokenIds(html);
  console.log(`Browser-shell EVAL_TOKEN_MAP: ${shellTokenIds.size} token IDs covered\n`);

  // Find gaps
  const gaps = [];
  for (const [tokenId, name] of romTokens) {
    if (!shellTokenIds.has(tokenId)) {
      gaps.push({ tokenId, name, category: categorizeToken(name) });
    }
  }

  // Also find which shell tokens are NOT in the ROM table (for reference)
  const shellOnlyIds = [];
  for (const id of shellTokenIds) {
    if (!romTokens.has(id)) {
      shellOnlyIds.push(id);
    }
  }

  // Summary
  console.log('=== COVERAGE SUMMARY ===');
  console.log(`  ROM tokens:           ${romTokens.size}`);
  console.log(`  Browser-shell tokens: ${shellTokenIds.size}`);
  console.log(`  Gaps (ROM not in shell): ${gaps.length}`);
  console.log(`  Shell-only (not in ROM table): ${shellOnlyIds.length}`);
  console.log(`  Coverage: ${((romTokens.size - gaps.length) / romTokens.size * 100).toFixed(1)}%\n`);

  // Categorized gap list
  const categories = {};
  for (const gap of gaps) {
    if (!categories[gap.category]) categories[gap.category] = [];
    categories[gap.category].push(gap);
  }

  console.log('=== GAPS BY CATEGORY ===\n');
  const sortedCategories = Object.keys(categories).sort();
  for (const cat of sortedCategories) {
    const items = categories[cat];
    console.log(`--- ${cat} (${items.length} tokens) ---`);
    for (const item of items) {
      const idHex = `0x${item.tokenId.toString(16).toUpperCase().padStart(2, '0')}`;
      console.log(`  ${idHex}  ${item.name}`);
    }
    console.log('');
  }

  // Full gap table
  console.log('=== FULL GAP LIST (sorted by token ID) ===\n');
  console.log('  ID   | Name                          | Category');
  console.log('  -----|-------------------------------|----------');
  gaps.sort((a, b) => a.tokenId - b.tokenId);
  for (const gap of gaps) {
    const idHex = `0x${gap.tokenId.toString(16).toUpperCase().padStart(2, '0')}`;
    console.log(`  ${idHex} | ${gap.name.padEnd(29)} | ${gap.category}`);
  }

  // Shell-only tokens (informational)
  if (shellOnlyIds.length > 0) {
    console.log(`\n=== SHELL-ONLY TOKEN IDs (not in ROM table, ${shellOnlyIds.length} total) ===`);
    console.log('  These may be structural tokens (parens, brackets) not in the STAT CALC name table.');
    const sorted = [...shellOnlyIds].sort((a, b) => a - b);
    const hexList = sorted.map(id => `0x${id.toString(16).toUpperCase().padStart(2, '0')}`);
    // Print in rows of 10
    for (let i = 0; i < hexList.length; i += 10) {
      console.log(`  ${hexList.slice(i, i + 10).join(' ')}`);
    }
  }

  console.log('\n=== ROM TOKEN TABLE (first 30 for reference) ===\n');
  console.log('  ID   | Name');
  console.log('  -----|-----');
  let count = 0;
  for (const [tokenId, name] of romTokens) {
    if (count >= 30) break;
    const idHex = `0x${tokenId.toString(16).toUpperCase().padStart(2, '0')}`;
    const inShell = shellTokenIds.has(tokenId) ? ' [in shell]' : '';
    console.log(`  ${idHex} | ${name}${inShell}`);
    count++;
  }
  if (romTokens.size > 30) console.log(`  ... (${romTokens.size - 30} more)`);
}

main();
