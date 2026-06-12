import fs from 'node:fs';

const html = fs.readFileSync(new URL('./browser-shell.html', import.meta.url), 'utf8');

function extractFunctionBody(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) return null;
  const open = source.indexOf('{', start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return null;
}

const initBody = extractFunctionBody(html, 'initializeColdbootRuntime') ?? '';
const autoRunBody = extractFunctionBody(html, 'autoRunFrame') ?? '';
const keyDownBody = html.slice(html.indexOf('kbdDown = (e) => {'), html.indexOf('kbdUp = (e) => {'));

const checks = {
  eventLoopEntryIsCurrent: /const COLDBOOT_EVENT_LOOP_ENTRY = 0x08C331;/.test(html),
  hasWarmIdleStage: /COLDBOOT_WARM_IDLE_ENTRY/.test(initBody) && /0x0019BE/.test(html),
  hasLaunchHomeStage: /COLDBOOT_LAUNCH_HOME_INIT/.test(initBody) && /0x09DD62/.test(html),
  hasHomeRepaintStage: /COLDBOOT_HOME_REPAINT/.test(initBody) && /0x058241/.test(html),
  initializeDoesNotStartAutoRun: !/startAutoRunLoop\(\)/.test(initBody),
  coldbootAutoRunStopsAfterOneFrame: /isColdbootRuntime\(\)[\s\S]*stopAutoRunLoop\(\)[\s\S]*return;/.test(autoRunBody),
  preserveKeyBurstPreparesEventFrame: /prepareColdbootEventFrame\(\);[\s\S]*vramSnapshotPeak = 0/.test(keyDownBody),
  countVramExposedForHarness: /window\.countVRAMPixels = countVRAMPixels;/.test(html),
};

const pass = Object.values(checks).every(Boolean);
console.log(JSON.stringify({
  probe: 'phase636-browser-shell-coldboot-fix',
  checks,
  pass,
}, null, 2));

if (!pass) process.exitCode = 1;
