// Ground-truth replay experiment (2026-06-13).
// A real CEmu capture showed that on a real calc, the home edit context is fully
// live before any key and pressing '2' does a SURGICAL insert: 0x32 lands at
// editCursorB (D0243A -> 0xD1A8CC), cursor advances, NO bulk wipe (0x0018F8).
// The synthetic state builds its edit context at the WRONG addresses, so '2'
// routes to cleanup. This probe A/Bs: Digit2 control vs Digit2 after SEEDING the
// real edit-context layout, to see if the surgical insert finally happens.
// Real values from ground-truth/edit-context-ground-truth.json (RAM_BASE 0x4A0A00).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'ground-truth-replay.md');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_TOP = 0xD1A87E, HALT = 0x0019B5, WARM_IDLE = 0x0019BE, OUTER_LOOP = 0x08C331, HOME_REPAINT = 0x058241;
const WIPE = 0x0018F8;
const TOKEN_HOOKS = { tupleSave: 0x08F54B, tokenExit: 0x08F5E1, tokenGate: 0x090992, saveCall: 0x08F547 };

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
const write24 = (mem, a, v) => { mem[a] = v & 0xFF; mem[a + 1] = (v >> 8) & 0xFF; mem[a + 2] = (v >> 16) & 0xFF; };
const read = (mem, a, n) => { let v = 0; for (let i = 0; i < n; i++) v |= mem[a + i] << (8 * i); return v >>> 0; };
const fillSentinel = (mem, sp, n) => { for (let i = 0; i < n; i++) mem[sp + i] = 0xC9; };

const EDIT_FIELDS = [
  ['D0231A', 0xD0231A, 3], ['D0231D', 0xD0231D, 3], ['D02317', 0xD02317, 3],
  ['D0243A', 0xD0243A, 3], ['D0243D', 0xD0243D, 3], ['D000A3', 0xD000A3, 1],
  ['D007CA', 0xD007CA, 3], ['D007E0', 0xD007E0, 1], ['D00082', 0xD00082, 1],
  ['D02A29', 0xD02A29, 2], ['D1A8CC(buf)', 0xD1A8CC, 1], ['D1A8C0(hdr)', 0xD1A8C0, 3],
];
const snapEdit = (mem) => Object.fromEntries(EDIT_FIELDS.map(([n, a, l]) => [n, hex(read(mem, a, l), l * 2)]));

function makeMachine() {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, mem.length));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function bootSystem() {
  const { mem, peripherals, executor, cpu } = makeMachine();
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  executor.runFrom(OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3; fillSentinel(mem, cpu.sp, 3);
  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12; fillSentinel(mem, cpu.sp, 12);
  executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 });
  peripherals.setTimerEnabled(false);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const launchSp = STACK_TOP - 24; cpu.sp = launchSp; write24(mem, launchSp, WARM_IDLE); write24(mem, 0xD008E0, launchSp);
  executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
  peripherals.setTimerEnabled(true);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF; write24(mem, cpu.sp, HALT);
  executor.runFrom(HOME_REPAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
  return { mem, peripherals, executor, cpu };
}

// Seed the REAL edit-context layout captured from CEmu (home screen, pre-key).
function seedRealEditContext(mem) {
  // PC trio + token cursor (point into tempMem region 0xD2A8xx).
  const blkD02317 = [0x3e, 0xa8, 0xd2, 0x3e, 0xa8, 0xd2, 0x3d, 0xa8, 0xd2]; // D02317..D0231F
  blkD02317.forEach((b, i) => { mem[0xD02317 + i] = b; });
  // Edit descriptor block D02430..D0245F verbatim from the real calc.
  const blkD02430 = [0x00,0x00,0x00,0x00,0x00,0x00,0x00, 0xcc,0xa8,0xd1, 0xcc,0xa8,0xd1,
    0x3e,0xa8,0xd2, 0x3e,0xa8,0xd2, 0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,0x00,
    0x89,0xfe,0xd3, 0x00,0x00,0x00,0x00,0x00, 0x07, 0x00,0x00,0x00,0x00,0x00,0x00,0x00, 0x01, 0x00];
  blkD02430.forEach((b, i) => { mem[0xD02430 + i] = b; });
  mem[0xD000A3] = 0x0A;          // edit-active flags
  write24(mem, 0xD02A40, 0xD2A83E);
  mem[0xD02A29] = 0; mem[0xD02A2A] = 0;
  // Edit buffer header + free cell where '2' should land.
  mem[0xD1A8C0] = 0x0C; mem[0xD1A8C1] = 0x00; mem[0xD1A8C2] = 0x07;
  for (let a = 0xD1A8CC; a < 0xD1A8E0; a++) mem[a] = 0;
}

function seedKey(mem) {
  mem[0xD0058C] = 0x90; mem[0xD0058D] = 0x90; mem[0xD0058E] = 0x90;
  mem[0xD00587] = 0x1A;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
}
function rearmHome(mem) {
  for (let i = 0; i < 21; i++) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function runCase(label, { seedReal }) {
  const { mem, executor, cpu } = bootSystem();
  const synthBaseline = snapEdit(mem);
  rearmHome(mem);
  if (seedReal) seedRealEditContext(mem);
  const seeded = snapEdit(mem);
  seedKey(mem);
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1; cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 24; write24(mem, cpu.sp, HALT); write24(mem, 0xD008E0, cpu.sp);

  const counts = { WIPE: 0, ...Object.fromEntries(Object.keys(TOKEN_HOOKS).map((k) => [k, 0])) };
  let depositBlock = null; // when 0x32 first appears at D1A8CC
  let block = 0;
  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 450000, maxLoopIterations: 450000,
    onBlock(pc) {
      block++;
      const a = pc & 0xFFFFFF;
      if (a === WIPE) counts.WIPE++;
      for (const [k, t] of Object.entries(TOKEN_HOOKS)) if (a === t) counts[k]++;
      if (depositBlock === null && mem[0xD1A8CC] === 0x32) depositBlock = block;
    },
  });
  return {
    label, seedReal, steps: result.steps, termination: result.termination, lastPc: hex(result.lastPc),
    blocks: block, counts, depositBlock,
    synthBaseline, seeded, after: snapEdit(mem),
    d1a8ccAfter: hex(mem[0xD1A8CC], 2), tokenHookFired: counts.tupleSave > 0 || counts.tokenExit > 0,
  };
}

const cases = [runCase('Digit2-control', { seedReal: false }), runCase('Digit2-realseed', { seedReal: true })];

const lines = ['# Ground-Truth Replay Experiment', '',
  'Seed the real CEmu edit-context layout into the synthetic state, press \'2\', and',
  'check for the real calc\'s surgical insert (0x32 at D1A8CC, no 0x0018F8 wipe).', '',
  '| metric | control | real-seed |', '|---|---|---|'];
const m = (f) => `| ${f} | ${f(cases[0])} | ${f(cases[1])} |`;
lines.push(`| steps | ${cases[0].steps} | ${cases[1].steps} |`);
lines.push(`| 0x0018F8 wipe hits | ${cases[0].counts.WIPE} | ${cases[1].counts.WIPE} |`);
lines.push(`| token save 0x08F54B | ${cases[0].counts.tupleSave} | ${cases[1].counts.tupleSave} |`);
lines.push(`| token exit 0x08F5E1 | ${cases[0].counts.tokenExit} | ${cases[1].counts.tokenExit} |`);
lines.push(`| token gate 0x090992 | ${cases[0].counts.tokenGate} | ${cases[1].counts.tokenGate} |`);
lines.push(`| D1A8CC after (0x32='2'?) | ${cases[0].d1a8ccAfter} | ${cases[1].d1a8ccAfter} |`);
lines.push(`| '2' deposit block | ${cases[0].depositBlock ?? 'never'} | ${cases[1].depositBlock ?? 'never'} |`);
lines.push(`| D0243A after | ${cases[0].after.D0243A} | ${cases[1].after.D0243A} |`);
lines.push(`| D007CA after | ${cases[0].after.D007CA} | ${cases[1].after.D007CA} |`);
lines.push('', '## Full JSON', '', '```json', JSON.stringify(cases, null, 2), '```', '');
fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n');

for (const c of cases) {
  console.log(`\n=== ${c.label} ===`);
  console.log(`steps=${c.steps} wipe=${c.counts.WIPE} tokenSave(0x08F54B)=${c.counts.tupleSave} tokenExit(0x08F5E1)=${c.counts.tokenExit} gate(0x090992)=${c.counts.tokenGate}`);
  console.log(`D1A8CC after=${c.d1a8ccAfter} ('2'=0x32?) depositBlock=${c.depositBlock ?? 'never'} D0243A after=${c.after.D0243A} D007CA after=${c.after.D007CA}`);
  console.log(`tokenHookFired=${c.tokenHookFired}`);
}
const ctrl = cases[0], seed = cases[1];
const breakthrough = (seed.d1a8ccAfter === '0x32' && ctrl.d1a8ccAfter !== '0x32') || (seed.tokenHookFired && !ctrl.tokenHookFired);
console.log(`\n>>> VERDICT: ${breakthrough ? 'BREAKTHROUGH — real-seed changed the routing' : 'no change — real-seed alone insufficient'}`);
console.log(`wrote ${path.basename(REPORT_PATH)}`);
