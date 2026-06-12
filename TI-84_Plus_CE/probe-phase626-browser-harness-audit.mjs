import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const repoRoot = path.resolve(import.meta.dirname, '..');
const shellPath = path.join(import.meta.dirname, 'browser-shell.html');

function commandOutput(cmd, args = []) {
  try {
    return execFileSync(cmd, args, {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5000,
    }).trim();
  } catch (error) {
    const stdout = error.stdout?.toString?.().trim();
    const stderr = error.stderr?.toString?.().trim();
    return stdout || stderr || `ERROR: ${error.message}`;
  }
}

function existsAny(paths) {
  return paths.filter((candidate) => fs.existsSync(candidate));
}

const browserCandidates = [
  process.env.CHROME_PATH,
  process.env.EDGE_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Microsoft\\Edge\\Application\\msedge.exe'),
].filter(Boolean);

const installedBrowsers = existsAny(browserCandidates);
const packageJsonPath = path.join(repoRoot, 'package.json');
const shell = fs.readFileSync(shellPath, 'utf8');

const checks = {
  nodeVersion: process.version,
  builtinWebSocket: typeof globalThis.WebSocket,
  packageJsonExists: fs.existsSync(packageJsonPath),
  playwrightFiles: commandOutput('powershell.exe', [
    '-NoProfile',
    '-Command',
    "Get-ChildItem -Path . -Recurse -Force -Include '*playwright*','*puppeteer*' | Select-Object -First 20 -ExpandProperty FullName",
  ]),
  whereChrome: commandOutput('where.exe', ['chrome']),
  whereMsedge: commandOutput('where.exe', ['msedge']),
  installedBrowsers,
  browserShell: {
    exists: fs.existsSync(shellPath),
    coldbootCheckbox: shell.includes('id="coldbootMode"'),
    preserveDisplayCheckbox: shell.includes('id="preserveDisplay"') && shell.includes('checked'),
    bootButton: shell.includes('id="btnBoot"'),
    lcdCanvas: shell.includes('id="lcd"'),
    keydownHandler: shell.includes("document.addEventListener('keydown'"),
  },
};

const canRunBrowserTest = installedBrowsers.length > 0;

console.log(JSON.stringify({
  probe: 'phase626-browser-harness-audit',
  canRunBrowserTest,
  checks,
  conclusion: canRunBrowserTest
    ? 'A browser executable exists; a raw DevTools or Playwright-style harness is feasible.'
    : 'No Chrome/Edge executable was found on PATH or common Windows install paths; real-browser interactive test remains blocked in this environment.',
}, null, 2));

if (!checks.browserShell.exists || !checks.browserShell.coldbootCheckbox || !checks.browserShell.preserveDisplayCheckbox) {
  process.exitCode = 1;
}
