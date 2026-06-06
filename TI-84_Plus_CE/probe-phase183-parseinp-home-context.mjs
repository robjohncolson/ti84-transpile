#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const { PRELIFTED_BLOCKS: BLOCKS } = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);

const MEM_SIZE = 0x1000000;
const ROM_END = 0x400000;
const STACK_TOP = 0xD1A87E;
const FIXED_IX = 0xD1A860;
const OS_IY = 0xD00080;
const OS_MBASE = 0xD0;

const BOOT = 0x000000;
const KERNEL_INIT = 0x08C331;
const POST_INIT = 0x0802B2;
const MEM_INIT = 0x09DEE0;
const CREATE_REAL = 0x08238A;
const BUFINSERT = 0x05E2A0;
const HOME_SETUP = 0x05845D;
const HOME_STOP = 0x058483;
const PARSEINP = 0x099914;
const ERR_DISPATCH = 0x1BC300;

const OP1 = 0xD005F8;
const ERRNO = 0xD008DF;
const ERRSP = 0xD008E0;
const CX_PUTAWAY = 0xD007D0;
const CX_REDISP = 0xD007D3;
const CX_ERROREP = 0xD007D6;
const CX_SIZEWIND = 0xD007D9;
const CX_PAGE = 0xD007DC;
const CX_CURAPP = 0xD007E0;
const BEGPC = 0xD02317;
const CURPC = 0xD0231A;
const ENDPC = 0xD0231D;
const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;
const FPSBASE = 0xD0258A;
const FPS = 0xD0258D;
const OPS = 0xD02593;
const HOME_FLAG = 0xD02A92;
const APPERR0 = 0xD02500;
const APPERR1 = 0xD025FF;
const CXERR0 = 0xD007D0;
const CXERR1 = 0xD007FF;
const BUF0 = 0xD00A00;
const BUF1 = 0xD00B00;

const FAKE_RET = 0x7FFFFE;
const ERR_CATCH = 0x7FFFFA;
const MEMINIT_RET = 0x7FFFF6;
const HOME_RET = 0x7FFFF0;

const MAX_BOOT = 20000;
const MAX_KERNEL = 100000;
const MAX_POST = 100;
const MAX_MEMINIT = 100000;
const MAX_CREATE_REAL = 50000;
const MAX_BUFINSERT = 10000;
const MAX_HOME = 500;
const MAX_PARSE = 500;
const LOOP_BOOT = 32;
const LOOP_KERNEL = 10000;
const LOOP_POST = 32;
const LOOP_OS = 8192;
const BYTE_SAMPLE = 24;

const ANS_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TOKENS = Uint8Array.from([0x32, 0x70, 0x33]);
const LABELS = new Map([
  [HOME_SETUP, 'HomeSetupPostLcd'],
  [0x058467, 'SetCxErrorEP'],
  [0x06EDFE, 'InstallErrorHandler'],
  [0x061DB6, 'HomeSetupAltPath'],
  [HOME_STOP, 'HomeKeyLoop'],
  [PARSEINP, 'ParseInp'],
  [0x061D3A, 'LoadErrUndefined'],
  [0x061DB2, 'JError'],
  [ERR_DISPATCH, 'ErrorDispatch1BC300'],
  [FAKE_RET, 'FakeReturn'],
  [ERR_CATCH, 'ErrCatch'],
  [HOME_RET, 'HomeReturnSentinel'],
]);

const hx = (v, w = 6) => v === null || v === undefined ? 'n/a' : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const hb = (v) => (v & 0xFF).toString(16).toUpperCase().padStart(2, '0');
const hbs = (mem, a, n) => Array.from(mem.slice(a, a + n), hb).join(' ');
const lbl = (pc) => LABELS.get(pc & 0xFFFFFF) ?? null;
const r24 = (mem, a) => ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
const w24 = (mem, a, v) => { mem[a] = v & 0xFF; mem[a + 1] = (v >>> 8) & 0xFF; mem[a + 2] = (v >>> 16) & 0xFF; };
const eName = (n) => n === 0x8D ? 'E_Undefined' : null;

function dump(mem, start, end, stride = 16) {
  const lines = [];
  for (let a = start; a <= end; a += stride) lines.push(`${hx(a)}: ${hbs(mem, a, Math.min(stride, end - a + 1))}`);
  return { start: hx(start), end: hx(end), lines };
}

function erased(mem, addr, len = 16) {
  if (addr < 0x100000 || addr >= ROM_END) return false;
  const end = Math.min(addr + len, ROM_END);
  for (let i = addr; i < end; i += 1) if ((mem[i] & 0xFF) !== 0xFF) return false;
  return end > addr;
}

function cxErrClass(mem, value = r24(mem, CX_ERROREP)) {
  let classification = 'rom_code';
  if (value === 0) classification = 'zero';
  else if (value === 0xFFFFFF) classification = 'invalid_uninitialized_ff';
  else if (value >= ROM_END && value !== 0xFFFFFF) classification = 'invalid_out_of_range';
  else if (erased(mem, value)) classification = 'erased_flash';
  else if (value >= 0xD00000) classification = 'ram_pointer';
  return { value: hx(value), rawBytes: hbs(mem, CX_ERROREP, 3), classification, sample: value < ROM_END ? hbs(mem, value, Math.min(16, ROM_END - value)) : null };
}

function snapCx(mem) {
  return {
    cxPutAway: hx(r24(mem, CX_PUTAWAY)),
    cxReDisp: hx(r24(mem, CX_REDISP)),
    cxErrorEP: cxErrClass(mem),
    cxSizeWind: hx(r24(mem, CX_SIZEWIND)),
    cxPage: hx(r24(mem, CX_PAGE)),
    cxCurApp: hx(mem[CX_CURAPP], 2),
    rawRange: dump(mem, 0xD007D0, 0xD007E0),
  };
}

function snapPtrs(mem) {
  return {
    begPC: hx(r24(mem, BEGPC)),
    curPC: hx(r24(mem, CURPC)),
    endPC: hx(r24(mem, ENDPC)),
    editTop: hx(r24(mem, EDIT_TOP)),
    editCursor: hx(r24(mem, EDIT_CURSOR)),
    editTail: hx(r24(mem, EDIT_TAIL)),
    editBottom: hx(r24(mem, EDIT_BTM)),
    fpsBase: hx(r24(mem, FPSBASE)),
    fps: hx(r24(mem, FPS)),
    ops: hx(r24(mem, OPS)),
    errNo: hx(mem[ERRNO], 2),
    errSP: hx(r24(mem, ERRSP)),
    op1: hbs(mem, OP1, 9),
    editBufferPreview: hbs(mem, BUF0, 16),
  };
}

function snapFull(mem, cpu) {
  return {
    registers: {
      a: hx(cpu.a, 2), f: hx(cpu.f, 2), bc: hx(cpu.bc), de: hx(cpu.de), hl: hx(cpu.hl),
      sp: hx(cpu.sp), ix: hx(cpu.ix), iy: hx(cpu.iy), mbase: hx(cpu.mbase, 2), madl: cpu.madl,
    },
    checkedFlagByte: { addr: hx(HOME_FLAG), value: hx(mem[HOME_FLAG], 2) },
    cxWindow: snapCx(mem),
    parserPointers: snapPtrs(mem),
    ranges: {
      appErrVectorArea: dump(mem, APPERR0, APPERR1),
      cxAndErrArea: dump(mem, CXERR0, CXERR1),
      homeFlagNeighborhood: dump(mem, 0xD02A90, 0xD02A97),
    },
  };
}

function bcd(bytes) {
  const neg = (bytes[0] & 0x80) !== 0;
  const exp = (bytes[1] & 0xFF) - 0x80;
  let man = 0;
  for (let i = 2; i < 9; i += 1) man = (man * 100) + (((bytes[i] >> 4) & 0xF) * 10) + (bytes[i] & 0xF);
  const val = man * Math.pow(10, exp - 13);
  return neg ? -val : val;
}

function op1Val(mem) {
  try {
    const val = bcd(mem.slice(OP1, OP1 + 9));
    return Number.isFinite(val) ? val : null;
  } catch {
    return null;
  }
}

function runtime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, executor, cpu: executor.cpu };
}

function resetOs(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = OS_MBASE; cpu._iy = OS_IY; cpu.f = 0x40; cpu._ix = FIXED_IX;
  cpu.sp = STACK_TOP - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function resetHome(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.madl = 1; cpu.mbase = OS_MBASE; cpu._iy = OS_IY; cpu.f = 0x40; cpu._ix = FIXED_IX;
  cpu.sp = STACK_TOP; mem.fill(0xFF, STACK_TOP - 0x20, STACK_TOP + 0x10); w24(mem, STACK_TOP, HOME_RET);
}

function runTo(executor, mem, entry, mode, sentinels, maxSteps, maxLoopIterations) {
  const STOP = '__STOP__';
  let hit = null; let steps = 0; let lastPc = entry & 0xFFFFFF; let termination = null; let errorMessage = null;
  const note = (pc, step) => {
    const p = pc & 0xFFFFFF; lastPc = p; if (typeof step === 'number') steps = Math.max(steps, step + 1);
    for (const [name, addr] of Object.entries(sentinels)) if (p === addr) { hit = name; throw new Error(STOP); }
  };
  try {
    const r = executor.runFrom(entry, mode, { maxSteps, maxLoopIterations, onBlock(pc, _m, _meta, s) { note(pc, s); }, onMissingBlock(pc, _m, s) { note(pc, s); } });
    steps = Math.max(steps, r?.steps ?? 0); if (r?.lastPc !== undefined && r?.lastPc !== null) lastPc = r.lastPc & 0xFFFFFF; termination = r?.termination ?? null;
  } catch (e) {
    if (e?.message === STOP) termination = 'sentinel'; else { termination = 'exception'; errorMessage = e?.stack ?? String(e); }
  }
  return { hit, steps, lastPc, termination, errorMessage };
}

function reqHit(label, r, want) {
  if (r.errorMessage) throw new Error(`${label} threw ${r.errorMessage}`);
  if (r.hit !== want) throw new Error(`${label} expected ${want}, saw ${r.hit ?? 'none'} (termination=${r.termination ?? 'n/a'} lastPc=${hx(r.lastPc)})`);
}

function boot(executor, cpu, mem) {
  executor.runFrom(BOOT, 'z80', { maxSteps: MAX_BOOT, maxLoopIterations: LOOP_BOOT });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT, 'adl', { maxSteps: MAX_KERNEL, maxLoopIterations: LOOP_KERNEL });
  cpu.mbase = OS_MBASE; cpu._iy = OS_IY; cpu._hl = 0; cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT, 'adl', { maxSteps: MAX_POST, maxLoopIterations: LOOP_POST });
}

function memInit(executor, cpu, mem) {
  resetOs(cpu, mem); cpu.sp -= 3; w24(mem, cpu.sp, MEMINIT_RET); mem[ERRNO] = 0x00;
  return runTo(executor, mem, MEM_INIT, 'adl', { ret: MEMINIT_RET }, MAX_MEMINIT, LOOP_OS);
}

function createRealAns(executor, cpu, mem) {
  mem.set(ANS_OP1, OP1); resetOs(cpu, mem); cpu.sp -= 3; w24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF; w24(mem, errBase, ERR_CATCH); w24(mem, errBase + 3, 0); w24(mem, ERRSP, errBase); mem[ERRNO] = 0x00; cpu.a = 0x00; cpu._hl = 0x000009;
  return { errBase, ...runTo(executor, mem, CREATE_REAL, 'adl', { ret: FAKE_RET, err: ERR_CATCH }, MAX_CREATE_REAL, LOOP_OS) };
}

function bufInsert(executor, cpu, mem, token) {
  resetOs(cpu, mem); cpu.sp -= 3; w24(mem, cpu.sp, FAKE_RET); cpu._de = token & 0xFF;
  return runTo(executor, mem, BUFINSERT, 'adl', { ret: FAKE_RET }, MAX_BUFINSERT, LOOP_OS);
}

function prepParse(executor, cpu, mem) {
  const cr = createRealAns(executor, cpu, mem);
  if (cr.hit === 'err') throw new Error(`CreateReal(Ans) hit ERR_CATCH with errNo=${hx(mem[ERRNO], 2)}`);
  reqHit('CreateReal(Ans)', cr, 'ret');
  const post = { ops: r24(mem, OPS), fps: r24(mem, FPS), fpsBase: r24(mem, FPSBASE) };
  w24(mem, EDIT_TOP, BUF0); w24(mem, EDIT_CURSOR, BUF0); w24(mem, EDIT_TAIL, BUF1); w24(mem, EDIT_BTM, BUF1); mem.fill(0x00, BUF0, BUF1);
  const ins = [];
  for (const t of TOKENS) {
    const r = bufInsert(executor, cpu, mem, t); reqHit(`BufInsert(${hx(t, 2)})`, r, 'ret');
    ins.push({ token: hx(t, 2), hit: r.hit, steps: r.steps, lastPc: hx(r.lastPc), termination: r.termination });
  }
  const cursor = r24(mem, EDIT_CURSOR); const preGap = cursor - BUF0;
  w24(mem, BEGPC, BUF0); w24(mem, CURPC, BUF0); w24(mem, ENDPC, BUF0 + preGap - 1);
  w24(mem, OPS, post.ops); w24(mem, FPS, post.fps); w24(mem, FPSBASE, post.fpsBase);
  return {
    inputTokens: Array.from(TOKENS, (t) => hx(t, 2)),
    createReal: { hit: cr.hit, steps: cr.steps, lastPc: hx(cr.lastPc), termination: cr.termination, errBase: hx(cr.errBase) },
    postCreatePointers: { ops: hx(post.ops), fps: hx(post.fps), fpsBase: hx(post.fpsBase) },
    bufInsertRuns: ins, cursorAfterInsert: hx(cursor), preGapLength: preGap, bufferPreview: hbs(mem, BUF0, 16), parserPointers: snapPtrs(mem),
  };
}
