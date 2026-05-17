#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHELL_PATH = path.join(__dirname, 'browser-shell.html');

if (!fs.existsSync(SHELL_PATH)) {
  console.error(`Missing file: ${SHELL_PATH}`);
  process.exit(1);
}

const html = fs.readFileSync(SHELL_PATH, 'utf8');
const htmlLines = html.split(/\r?\n/);

function dedupeMatches(matches) {
  const seen = new Set();
  const deduped = [];
  for (const match of matches) {
    const key = `${match.line}:${match.column}:${match.snippet}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(match);
  }
  deduped.sort((a, b) => a.line - b.line || a.column - b.column);
  return deduped;
}

function collectLiteralMatches(literals) {
  const list = Array.isArray(literals) ? literals : [literals];
  const matches = [];

  for (let lineIndex = 0; lineIndex < htmlLines.length; lineIndex += 1) {
    const sourceLine = htmlLines[lineIndex];
    for (const literal of list) {
      if (!literal) continue;
      let start = 0;
      while (start <= sourceLine.length) {
        const found = sourceLine.indexOf(literal, start);
        if (found === -1) break;
        matches.push({
          line: lineIndex + 1,
          column: found + 1,
          snippet: sourceLine.trim(),
        });
        start = found + Math.max(literal.length, 1);
      }
    }
  }

  return dedupeMatches(matches);
}

function formatMatchLines(matches, limit = 4) {
  if (!matches.length) return 'Lines: none';
  const rendered = matches.slice(0, limit).map((match) => `L${match.line}`);
  const suffix = matches.length > limit ? ` (+${matches.length - limit} more)` : '';
  return `Lines: ${rendered.join(', ')}${suffix}`;
}

function countLinesBeforeIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

function extractScriptBlocks(source) {
  const blocks = [];
  const scriptRegex = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match = scriptRegex.exec(source);

  while (match) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const full = match[0];
    const bodyOffset = full.indexOf(body);
    const bodyStartIndex = match.index + Math.max(bodyOffset, 0);
    blocks.push({
      attrs,
      text: body,
      startLine: countLinesBeforeIndex(source, bodyStartIndex),
    });
    match = scriptRegex.exec(source);
  }

  return blocks;
}

function scanJavaScriptBalance(scriptText, baseLine) {
  const issues = [];
  const delimiterStack = [];
  const modeStack = [{ type: 'code', fromTemplate: false }];

  let index = 0;
  let line = baseLine;
  let column = 1;

  function currentMode() {
    return modeStack[modeStack.length - 1];
  }

  function advance(char) {
    if (char === '\n') {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  function pushIssue(message, issueLine = line, issueColumn = column) {
    issues.push({ line: issueLine, column: issueColumn, message });
  }

  function pushDelimiter(char, expected, kind = 'delimiter') {
    delimiterStack.push({ char, expected, kind, line, column });
  }

  while (index < scriptText.length) {
    const mode = currentMode();
    const char = scriptText[index];
    const next = scriptText[index + 1] ?? '';

    if (mode.type === 'lineComment') {
      if (char === '\n') modeStack.pop();
      advance(char);
      index += 1;
      continue;
    }

    if (mode.type === 'blockComment') {
      if (char === '*' && next === '/') {
        advance(char);
        advance(next);
        index += 2;
        modeStack.pop();
        continue;
      }
      advance(char);
      index += 1;
      continue;
    }

    if (mode.type === 'singleQuote' || mode.type === 'doubleQuote') {
      const closer = mode.type === 'singleQuote' ? '\'' : '"';
      if (char === '\\') {
        advance(char);
        index += 1;
        if (index < scriptText.length) {
          advance(scriptText[index]);
          index += 1;
        }
        continue;
      }
      if (char === closer) {
        advance(char);
        index += 1;
        modeStack.pop();
        continue;
      }
      advance(char);
      index += 1;
      continue;
    }

    if (mode.type === 'template') {
      if (char === '\\') {
        advance(char);
        index += 1;
        if (index < scriptText.length) {
          advance(scriptText[index]);
          index += 1;
        }
        continue;
      }
      if (char === '`') {
        advance(char);
        index += 1;
        modeStack.pop();
        continue;
      }
      if (char === '$' && next === '{') {
        pushDelimiter('{', '}', 'templateInterpolation');
        modeStack.push({ type: 'code', fromTemplate: true });
        advance(char);
        advance(next);
        index += 2;
        continue;
      }
      advance(char);
      index += 1;
      continue;
    }

    if (char === '/' && next === '/') {
      modeStack.push({ type: 'lineComment' });
      advance(char);
      advance(next);
      index += 2;
      continue;
    }

    if (char === '/' && next === '*') {
      modeStack.push({ type: 'blockComment' });
      advance(char);
      advance(next);
      index += 2;
      continue;
    }

    if (char === '\'') {
      modeStack.push({ type: 'singleQuote' });
      advance(char);
      index += 1;
      continue;
    }

    if (char === '"') {
      modeStack.push({ type: 'doubleQuote' });
      advance(char);
      index += 1;
      continue;
    }

    if (char === '`') {
      modeStack.push({ type: 'template' });
      advance(char);
      index += 1;
      continue;
    }

    if (char === '(') {
      pushDelimiter('(', ')');
      advance(char);
      index += 1;
      continue;
    }

    if (char === '[') {
      pushDelimiter('[', ']');
      advance(char);
      index += 1;
      continue;
    }

    if (char === '{') {
      pushDelimiter('{', '}');
      advance(char);
      index += 1;
      continue;
    }

    if (char === ')' || char === ']' || char === '}') {
      const opener = delimiterStack[delimiterStack.length - 1];
      if (!opener) {
        pushIssue(`Unexpected closing ${char}`);
      } else if (opener.expected !== char) {
        pushIssue(
          `Mismatched closing ${char}; expected ${opener.expected} for ${opener.char} from L${opener.line}:C${opener.column}`,
        );
        delimiterStack.pop();
      } else {
        delimiterStack.pop();
        if (
          char === '}' &&
          mode.type === 'code' &&
          mode.fromTemplate === true &&
          opener.kind === 'templateInterpolation'
        ) {
          modeStack.pop();
        }
      }
      advance(char);
      index += 1;
      continue;
    }

    advance(char);
    index += 1;
  }

  for (let i = modeStack.length - 1; i >= 1; i -= 1) {
    const mode = modeStack[i];
    if (mode.type === 'singleQuote') pushIssue('Unclosed single-quoted string', line, column);
    if (mode.type === 'doubleQuote') pushIssue('Unclosed double-quoted string', line, column);
    if (mode.type === 'template') pushIssue('Unclosed template literal', line, column);
    if (mode.type === 'lineComment') pushIssue('Unclosed line comment state', line, column);
    if (mode.type === 'blockComment') pushIssue('Unclosed block comment', line, column);
  }

  for (let i = delimiterStack.length - 1; i >= 0; i -= 1) {
    const opener = delimiterStack[i];
    pushIssue(
      `Unclosed ${opener.char}; expected ${opener.expected}`,
      opener.line,
      opener.column,
    );
  }

  return issues;
}

function printCheck(label, present, detail, evidence = []) {
  console.log(`[${present ? 'YES' : 'NO'}] ${label}`);
  if (detail) {
    console.log(`      ${detail}`);
  }
  if (evidence.length) {
    console.log(`      ${formatMatchLines(evidence)}`);
  }
}

const coorMonMarkerMatches = collectLiteralMatches([
  'CoorMon',
  'coormon',
  'COORMON_',
  'cxMain',
  '0x08C331',
  '0x058241',
]);

const entryEvidence = collectLiteralMatches([
  'const COORMON_ENTRY = 0x08C331;',
  'runFrom(COORMON_ENTRY',
  'runFrom(0x08C331',
]);
const iyEvidence = collectLiteralMatches([
  'cpu.iy = 0xD00080;',
  'cpu._iy = 0xD00080;',
  'IY=0xD00080',
]);
const cxMainEvidence = collectLiteralMatches([
  'const COORMON_HOME_HANDLER = 0x058241;',
  'evalWrite24(cpu.memory, COORMON_CXMAIN_ADDR, COORMON_HOME_HANDLER);',
  'cxMain=0x${hex(COORMON_HOME_HANDLER, 6)}',
]);
const rafEvidence = collectLiteralMatches([
  'function autoRunFrame() {',
  'requestAnimationFrame(autoRunFrame);',
]);
const keyboardEvidence = collectLiteralMatches([
  "document.addEventListener('keydown', kbdDown);",
  "document.addEventListener('keyup', kbdUp);",
  'kbd.handleKeyDown(e);',
  'kbd.handleKeyUp(e);',
  'writeCoorMonKeyEventFromState();',
  'keyMatrix',
  'KEY_EVENT_BUFFER_ADDR = 0xD0058E;',
]);
const scanEvidence = collectLiteralMatches([
  'getCoorMonScanCodeForPcCode',
  'getActiveCoorMonScanCode',
  'scanCode',
  '0xD0058C',
  '0xD0058E',
]);
const romGzEvidence = collectLiteralMatches([
  "fetch('./ROM.transpiled.js.gz')",
]);
const romJsEvidence = collectLiteralMatches([
  "import('./ROM.transpiled.js')",
]);
const runtimeImportEvidence = collectLiteralMatches([
  "import { createExecutor } from './cpu-runtime.js';",
  "import { createPeripheralBus } from './peripherals.js';",
]);

const hasCoorMonMarkers = coorMonMarkerMatches.length > 0;
const hasEntryPoint =
  /const\s+COORMON_ENTRY\s*=\s*0x08C331\s*;/.test(html) &&
  /(runFrom\(COORMON_ENTRY\b|runFrom\(0x08C331\b)/.test(html);
const hasIySetup =
  /function\s+seedCoorMonRuntime\s*\(\)\s*\{[\s\S]*?cpu\.iy\s*=\s*0xD00080\s*;/.test(html) ||
  /IY=0xD00080/.test(html);
const hasCxMain =
  /const\s+COORMON_HOME_HANDLER\s*=\s*0x058241\s*;/.test(html) &&
  /evalWrite24\(cpu\.memory,\s*COORMON_CXMAIN_ADDR,\s*COORMON_HOME_HANDLER\)/.test(html);
const hasRafLoop =
  /function\s+autoRunFrame\s*\(\)\s*\{[\s\S]*?requestAnimationFrame\(autoRunFrame\)\s*;/.test(html);
const hasKeyboardHandlers =
  /document\.addEventListener\('keydown',\s*kbdDown\)/.test(html) &&
  /document\.addEventListener\('keyup',\s*kbdUp\)/.test(html);
const referencesKeyMatrix = /keyMatrix/.test(html);
const writes3B0033 = /0x3B0033|3B0033/.test(html);
const writesKeyEventBuffer =
  /KEY_EVENT_BUFFER_ADDR\s*=\s*0xD0058E\s*;/.test(html) &&
  /(cpu\.memory\[KEY_EVENT_BUFFER_ADDR\]\s*=|cpu\.write8\(KEY_EVENT_BUFFER_ADDR,)/.test(html);
const hasKeyboardPath = hasKeyboardHandlers && (referencesKeyMatrix || writes3B0033 || writesKeyEventBuffer);
const referencesScanCodes =
  /getCoorMonScanCodeForPcCode|getActiveCoorMonScanCode|scanCodeToKeyCode|scanCode/.test(html);
const referencesD0058C = /0xD0058C|D0058C/.test(html);
const loadsRomGz = /fetch\('\.\/ROM\.transpiled\.js\.gz'\)/.test(html);
const loadsRomJs = /import\('\.\/ROM\.transpiled\.js'\)/.test(html);
const importsRuntime = /import\s*\{\s*createExecutor\s*\}\s*from\s*'\.\/cpu-runtime\.js'/.test(html);
const importsPeripherals = /import\s*\{\s*createPeripheralBus\s*\}\s*from\s*'\.\/peripherals\.js'/.test(html);

const scriptBlocks = extractScriptBlocks(html);
const syntaxIssues = scriptBlocks.flatMap((block) => scanJavaScriptBalance(block.text, block.startLine));
const syntaxOk = syntaxIssues.length === 0;

const coreFeatures = [
  hasEntryPoint,
  hasIySetup,
  hasCxMain,
  hasRafLoop,
  hasKeyboardPath,
  referencesScanCodes,
  loadsRomGz || loadsRomJs,
  importsRuntime,
  importsPeripherals,
];

let overallStatus = 'NOT YET INTEGRATED';
if (coreFeatures.every(Boolean) && syntaxOk) {
  overallStatus = 'FULLY INTEGRATED';
} else if (hasCoorMonMarkers || coreFeatures.some(Boolean)) {
  overallStatus = 'PARTIALLY INTEGRATED';
}

const keyboardDetail = [
  hasKeyboardHandlers ? 'keydown/keyup listeners present' : 'keydown/keyup listeners missing',
  referencesKeyMatrix ? 'keyMatrix referenced' : 'no keyMatrix reference',
  writes3B0033 ? 'direct 0x3B0033 reference present' : 'no direct 0x3B0033 reference',
  writesKeyEventBuffer ? 'writes 0xD0058E key-event buffer' : 'no 0xD0058E write detected',
].join('; ');

const scanDetail = referencesD0058C
  ? 'Scan-code handling present, including direct 0xD0058C reference.'
  : 'Scan-code handling present, but no direct 0xD0058C reference was found.';

const romDetail = [
  loadsRomGz ? 'loads ROM.transpiled.js.gz' : 'no .gz ROM loader found',
  loadsRomJs ? 'loads ROM.transpiled.js fallback' : 'no plain .js ROM fallback found',
].join('; ');

console.log('Phase 350 Browser Shell Static Audit');
console.log(`File: ${path.relative(process.cwd(), SHELL_PATH)}`);
console.log('Scope: static text inspection only; this probe does not execute the browser shell.');
console.log('');

console.log('CoorMon integration');
printCheck(
  'General CoorMon markers present',
  hasCoorMonMarkers,
  'Matches include CoorMon/coormon names, cxMain references, and CoorMon constants.',
  coorMonMarkerMatches,
);
printCheck(
  'References CoorMon entry point 0x08C331',
  hasEntryPoint,
  'Expected both a constant definition and a runFrom(...) call path.',
  entryEvidence,
);
printCheck(
  'Sets up IY = 0xD00080',
  hasIySetup,
  'Expected CoorMon runtime seeding to assign IY before frame execution.',
  iyEvidence,
);
printCheck(
  'References cxMain = 0x058241 (HOME_HANDLER)',
  hasCxMain,
  'Expected home-handler constant plus cxMain write into RAM.',
  cxMainEvidence,
);
printCheck(
  'Has a requestAnimationFrame loop',
  hasRafLoop,
  'Expected autoRunFrame() to reschedule itself.',
  rafEvidence,
);
printCheck(
  'Handles keyboard events and ties them into the runtime',
  hasKeyboardPath,
  keyboardDetail,
  keyboardEvidence,
);
printCheck(
  'References scan-code handling',
  referencesScanCodes,
  scanDetail,
  scanEvidence,
);

console.log('');
console.log('ROM/runtime loading');
printCheck(
  'References ROM.transpiled.js.gz',
  loadsRomGz,
  romDetail,
  romGzEvidence,
);
printCheck(
  'References ROM.transpiled.js',
  loadsRomJs,
  romDetail,
  romJsEvidence,
);
printCheck(
  'Imports cpu-runtime.js',
  importsRuntime,
  'Expected createExecutor import from ./cpu-runtime.js.',
  runtimeImportEvidence.filter((match) => match.snippet.includes('cpu-runtime.js')),
);
printCheck(
  'Imports peripherals.js',
  importsPeripherals,
  'Expected createPeripheralBus import from ./peripherals.js.',
  runtimeImportEvidence.filter((match) => match.snippet.includes('peripherals.js')),
);

console.log('');
console.log('Basic JS structure check');
console.log(`[${syntaxOk ? 'PASS' : 'WARN'}] Scanned ${scriptBlocks.length} inline script block(s) for unmatched (), [], {} and unclosed strings/comments.`);
if (!syntaxOk) {
  for (const issue of syntaxIssues.slice(0, 12)) {
    console.log(`      L${issue.line}:C${issue.column} ${issue.message}`);
  }
  if (syntaxIssues.length > 12) {
    console.log(`      ... ${syntaxIssues.length - 12} more issue(s)`);
  }
}

const missingNotes = [];
if (!writes3B0033) {
  missingNotes.push('No direct 0x3B0033 write was found in browser-shell.html.');
}
if (!referencesD0058C) {
  missingNotes.push('No direct 0xD0058C reference was found; the shell uses 0xD0058E as KEY_EVENT_BUFFER_ADDR.');
}
if (!syntaxOk) {
  missingNotes.push('The basic delimiter scan reported potential JS structure issues.');
}

console.log('');
console.log(`Overall status: ${overallStatus}`);

if (overallStatus === 'FULLY INTEGRATED') {
  console.log('Summary: the shell contains the major CoorMon runtime hooks, browser event loop, keyboard/scan-code path, and ROM/runtime loading references needed for the static integration target.');
} else if (overallStatus === 'PARTIALLY INTEGRATED') {
  console.log('Summary: CoorMon integration is present but one or more major runtime pieces are missing or only partially visible in the shell text.');
} else {
  console.log('Summary: the browser shell does not show enough CoorMon-specific wiring to be considered integrated yet.');
}

if (missingNotes.length) {
  console.log('');
  console.log('Missing or not directly observed');
  for (const note of missingNotes) {
    console.log(`- ${note}`);
  }
}
