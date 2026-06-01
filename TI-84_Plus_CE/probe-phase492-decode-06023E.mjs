#!/usr/bin/env node
// Probe: decode function 0x06023E — determine if screen-clear, region fill, or cursor draw.
// API pattern copied from probe-phase99d-home-verify.mjs (the golden regression).

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import zlib from 'node:zlib';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure transpiled ROM exists
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const gzPath = path.join(__dirname, 'ROM.transpiled.js.gz');
if (!fs.existsSync(transpiledPath) && fs.existsSync(gzPath)) {
  console.log('Expanding ROM.transpiled.js.gz ...');
  try {
    execFileSync('gzip', ['-dk', gzPath], { cwd: __dirname, stdio: 'inherit' });
  } catch (err) {
    fs.writeFileSync(transpiledPath, zlib.gunzipSync(fs.readFileSync(gzPath)));
  }
}

const romModule = await import(pathToFileURL(transpiledPath).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ---------- constants ----------
const FUNC = 0x06023E;
const NEARBY_A = 0x06029D;
const NEARBY_B = 0x061000;
const VRAM = 0xD40000;
const VRAM_LEN = 320 * 240;
const W = 320;
const CURSOR_ROW = 0xD00595;
const CURSOR_COL = 0xD00596;
const VRAM_PTR = 0xD0059C;
const LCD_X = 0xD008D2;
const LCD_Y = 0xD008D5;
const SP_TOP = 0xD1A87E;
const MEM_SIZE = 0x1000000;
const MASK = 0xFFFFFF;

// Boot constants (same as golden probe)
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT = 0x08C331;
const POST_INIT = 0x021A3C;
const SENTINEL = 0xDEAD00; // RAM address with no transpiled block

// ---------- helpers ----------
function h(v, w) { return (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }
function hex6(v) { return '$' + h(v & MASK, 6); }
function hex2(v) { return '$' + h(v & 0xFF, 2); }
function bytes(buf, off, n) {
  const o = [];
  for (let i = 0; i < n; i++) o.push(h(buf[off + i] ?? 0, 2));
  return o.join(' ');
}
function r24(buf, p) { return (buf[p] | (buf[p+1] << 8) | (buf[p+2] << 16)) >>> 0; }
function s8(v) { return v < 0x80 ? v : v - 0x100; }
function disp(v) { const s = s8(v); return s >= 0 ? `+${s}` : `${s}`; }

// ---------- mini disassembler ----------
const rn = ['b','c','d','e','h','l','(hl)','a'];
const rpn = ['bc','de','hl','sp'];
const rp2n = ['bc','de','hl','af'];
const ccn = ['nz','z','nc','c','po','pe','p','m'];
const aluN = ['add a,','adc a,','sub','sbc a,','and','xor','or','cp'];
const rotN = ['rlc','rrc','rl','rr','sla','sra','sll','srl'];

function dCB(op, tgt) {
  const x=op>>6, y=(op>>3)&7, z=op&7;
  if (x===0) return `${rotN[y]} ${tgt??rn[z]}`;
  if (x===1) return `bit ${y},${tgt??rn[z]}`;
  if (x===2) return `res ${y},${tgt??rn[z]}`;
  return `set ${y},${tgt??rn[z]}`;
}
function imm(buf, p, n) { return '$'+h(r24(buf,p) & (n===2?0xFFFF:0xFFFFFF), n*2); }
function rel(pc, len, d) { return (pc + len + s8(d)) & MASK; }

function ixReg(c, ix, d) {
  if (c===6) return `(${ix}${disp(d)})`;
  if (c===4) return `${ix}h`;
  if (c===5) return `${ix}l`;
  return rn[c];
}

function dED(buf, pc, ab) {
  const op=buf[pc+1]??0, x=op>>6, y=(op>>3)&7, z=op&7, p=y>>1, q=y&1;
  const leaIx=new Map([[2,'bc'],[0x12,'de'],[0x22,'hl'],[0x32,'ix']]);
  const leaIy=new Map([[3,'bc'],[0x13,'de'],[0x23,'hl'],[0x33,'iy']]);
  if (leaIx.has(op)) return {l:3, m:`lea ${leaIx.get(op)},ix${disp(buf[pc+2]??0)}`};
  if (leaIy.has(op)) return {l:3, m:`lea ${leaIy.get(op)},iy${disp(buf[pc+2]??0)}`};
  if (op===0x65) return {l:3, m:`pea ix${disp(buf[pc+2]??0)}`};
  if (op===0x66) return {l:3, m:`pea iy${disp(buf[pc+2]??0)}`};
  const mlt=new Map([[0x4C,'bc'],[0x5C,'de'],[0x6C,'hl'],[0x7C,'sp']]);
  if (mlt.has(op)) return {l:2, m:`mlt ${mlt.get(op)}`};
  if (x===1) {
    if (z===0) return {l:2, m:y===6?'in (c)':`in ${rn[y]},(c)`};
    if (z===1) return {l:2, m:y===6?'out (c),0':`out (c),${rn[y]}`};
    if (z===2) return {l:2, m:`${q?'adc':'sbc'} hl,${rpn[p]}`};
    if (z===3) { const a=imm(buf,pc+2,ab); return {l:2+ab, m:q?`ld ${rpn[p]},(${a})`:`ld (${a}),${rpn[p]}`}; }
    if (z===4) return {l:2, m:'neg'};
    if (z===5) return {l:2, m:y===1?'reti':'retn'};
    if (z===6) return {l:2, m:`im ${[0,0,1,2,0,0,1,2][y]}`};
    return {l:2, m:['ld i,a','ld r,a','ld a,i','ld a,r','rrd','rld','nop','nop'][y]};
  }
  const blk=new Map([[0xA0,'ldi'],[0xA1,'cpi'],[0xA2,'ini'],[0xA3,'outi'],[0xA8,'ldd'],[0xA9,'cpd'],[0xAA,'ind'],[0xAB,'outd'],[0xB0,'ldir'],[0xB1,'cpir'],[0xB2,'inir'],[0xB3,'otir'],[0xB8,'lddr'],[0xB9,'cpdr'],[0xBA,'indr'],[0xBB,'otdr']]);
  if (blk.has(op)) return {l:2, m:blk.get(op)};
  return {l:2, m:`ed $${h(op,2)}`};
}

function dIX(buf, pc, ix, ab) {
  const op=buf[pc+1]??0;
  if (op===0xCB) { const d=buf[pc+2]??0, cb=buf[pc+3]??0, z=cb&7, tgt=`(${ix}${disp(d)})`; return {l:4, m:z===6?dCB(cb,tgt):`${dCB(cb,tgt)},${rn[z]}`}; }
  if (op===0xED) return {l:2, m:`${ix}-ed`};
  const x=op>>6, y=(op>>3)&7, z=op&7, p=y>>1, q=y&1;
  if (x===0) {
    if (z===1) { if (!q&&p===2) return {l:2+ab, m:`ld ${ix},${imm(buf,pc+2,ab)}`}; if (q&&p===2) return {l:2, m:`add ${ix},${ix}`}; if (q) return {l:2, m:`add ${ix},${rpn[p]}`}; }
    if (z===2&&p===2) return {l:2+ab, m:q?`ld ${ix},(${imm(buf,pc+2,ab)})`:`ld (${imm(buf,pc+2,ab)}),${ix}`};
    if (z===3&&p===2) return {l:2, m:`${q?'dec':'inc'} ${ix}`};
    if ((z===4||z===5)&&y===6) return {l:3, m:`${z===4?'inc':'dec'} (${ix}${disp(buf[pc+2]??0)})`};
    if (z===4||z===5) return {l:2, m:`${z===4?'inc':'dec'} ${ixReg(y,ix,0)}`};
    if (z===6&&y===6) return {l:4, m:`ld (${ix}${disp(buf[pc+2]??0)}),${hex2(buf[pc+3]??0)}`};
    if (z===6) return {l:3, m:`ld ${ixReg(y,ix,0)},${hex2(buf[pc+2]??0)}`};
  }
  if (x===1) { if (op===0x76) return {l:2, m:'halt'}; if (y===6||z===6) { const d=buf[pc+2]??0; return {l:3, m:`ld ${ixReg(y,ix,d)},${ixReg(z,ix,d)}`}; } return {l:2, m:`ld ${ixReg(y,ix,0)},${ixReg(z,ix,0)}`}; }
  if (x===2) { if (z===6) return {l:3, m:`${aluN[y]} (${ix}${disp(buf[pc+2]??0)})`}; return {l:2, m:`${aluN[y]} ${ixReg(z,ix,0)}`}; }
  if (op===0xE1) return {l:2, m:`pop ${ix}`};
  if (op===0xE3) return {l:2, m:`ex (sp),${ix}`};
  if (op===0xE5) return {l:2, m:`push ${ix}`};
  if (op===0xE9) return {l:2, m:`jp (${ix})`};
  if (op===0xF9) return {l:2, m:`ld sp,${ix}`};
  const d2=decode(buf, pc+1, ab);
  return {l:1+d2.l, m:`${ix}: ${d2.m}`};
}

function decode(buf, pc, ab) {
  const op=buf[pc]??0;
  if (op===0xCB) return {l:2, m:dCB(buf[pc+1]??0)};
  if (op===0xED) return dED(buf, pc, ab);
  if (op===0xDD||op===0xFD) return dIX(buf, pc, op===0xDD?'ix':'iy', ab);
  if (op===0x40) { const i=decode(buf,pc+1,2); return {l:1+i.l, m:`[SIS] ${i.m}`}; }
  if (op===0x49) { const i=decode(buf,pc+1,3); return {l:1+i.l, m:`[LIS] ${i.m}`}; }
  if (op===0x52) { const i=decode(buf,pc+1,2); return {l:1+i.l, m:`[SIL] ${i.m}`}; }
  if (op===0x5B) { const i=decode(buf,pc+1,3); return {l:1+i.l, m:`[LIL] ${i.m}`}; }

  const x=op>>6, y=(op>>3)&7, z=op&7, p=y>>1, q=y&1;
  if (x===0) {
    if (z===0) { if (y===0) return {l:1,m:'nop'}; if (y===1) return {l:1,m:"ex af,af'"}; if (y===2) return {l:2,m:`djnz ${hex6(rel(pc,2,buf[pc+1]??0))}`}; if (y===3) return {l:2,m:`jr ${hex6(rel(pc,2,buf[pc+1]??0))}`}; return {l:2,m:`jr ${ccn[y-4]},${hex6(rel(pc,2,buf[pc+1]??0))}`}; }
    if (z===1) { if (!q) return {l:1+ab,m:`ld ${rpn[p]},${imm(buf,pc+1,ab)}`}; return {l:1,m:`add hl,${rpn[p]}`}; }
    if (z===2) { if (p===0) return {l:1,m:q?'ld a,(bc)':'ld (bc),a'}; if (p===1) return {l:1,m:q?'ld a,(de)':'ld (de),a'}; if (p===2) return {l:1+ab,m:q?`ld hl,(${imm(buf,pc+1,ab)})`:`ld (${imm(buf,pc+1,ab)}),hl`}; return {l:1+ab,m:q?`ld a,(${imm(buf,pc+1,ab)})`:`ld (${imm(buf,pc+1,ab)}),a`}; }
    if (z===3) return {l:1,m:`${q?'dec':'inc'} ${rpn[p]}`};
    if (z===4) return {l:1,m:`inc ${rn[y]}`};
    if (z===5) return {l:1,m:`dec ${rn[y]}`};
    if (z===6) return {l:2,m:`ld ${rn[y]},${hex2(buf[pc+1]??0)}`};
    return {l:1,m:['rlca','rrca','rla','rra','daa','cpl','scf','ccf'][y]};
  }
  if (x===1) { if (op===0x76) return {l:1,m:'halt'}; return {l:1,m:`ld ${rn[y]},${rn[z]}`}; }
  if (x===2) return {l:1,m:`${aluN[y]} ${rn[z]}`};
  if (z===0) return {l:1,m:`ret ${ccn[y]}`};
  if (z===1) { if (!q) return {l:1,m:`pop ${rp2n[p]}`}; if (p===0) return {l:1,m:'ret'}; if (p===1) return {l:1,m:'exx'}; if (p===2) return {l:1,m:'jp (hl)'}; return {l:1,m:'ld sp,hl'}; }
  if (z===2) return {l:1+ab,m:`jp ${ccn[y]},${imm(buf,pc+1,ab)}`};
  if (z===3) { if (y===0) return {l:1+ab,m:`jp ${imm(buf,pc+1,ab)}`}; if (y===1) return {l:2,m:dCB(buf[pc+1]??0)}; if (y===2) return {l:2,m:`out (${hex2(buf[pc+1]??0)}),a`}; if (y===3) return {l:2,m:`in a,(${hex2(buf[pc+1]??0)})`}; if (y===4) return {l:1,m:'ex (sp),hl'}; if (y===5) return {l:1,m:'ex de,hl'}; if (y===6) return {l:1,m:'di'}; return {l:1,m:'ei'}; }
  if (z===4) return {l:1+ab,m:`call ${ccn[y]},${imm(buf,pc+1,ab)}`};
  if (z===5) { if (!q) return {l:1,m:`push ${rp2n[p]}`}; if (p===0) return {l:1+ab,m:`call ${imm(buf,pc+1,ab)}`}; }
  if (z===6) return {l:2,m:`${aluN[y]} ${hex2(buf[pc+1]??0)}`};
  return {l:1,m:`rst $${h(y*8,2)}`};
}

function disasmRange(buf, start, maxBytes) {
  const out = [];
  let pc = start;
  while (pc < buf.length && pc < start + maxBytes) {
    const d = decode(buf, pc, 3);
    out.push({ pc, len: d.l, m: d.m, raw: bytes(buf, pc, d.l) });
    pc += d.l;
    if (d.m === 'ret') break;
  }
  return out;
}

function annotate(inst) {
  const known = { 0xD00595:'CURSOR_ROW', 0xD00596:'CURSOR_COL', 0xD0059C:'VRAM_PTR', 0xD008D2:'LCD_X_START', 0xD008D5:'LCD_Y_START' };
  const notes = [];
  // check raw bytes for 24-bit address refs
  for (let i = 1; i <= inst.len - 3; i++) {
    const a = r24(rom, inst.pc + i);
    if (known[a]) notes.push(known[a]);
  }
  if (inst.m.includes(hex6(NEARBY_A))) notes.push('ref 0x06029D');
  if (inst.m.includes(hex6(NEARBY_B))) notes.push('ref 0x061000');
  return notes.length ? '  ; ' + notes.join(', ') : '';
}

// ---------- pattern search ----------
function findAll(buf, pat) {
  const hits = [];
  for (let i = 0; i <= buf.length - pat.length; i++) {
    let ok = true;
    for (let j = 0; j < pat.length; j++) { if (buf[i+j] !== pat[j]) { ok = false; break; } }
    if (ok) hits.push(i);
  }
  return hits;
}

// ============================================================
// Part 1: Static disassembly
// ============================================================
console.log('=== Part 1: Static disassembly of 0x06023E ===');
const mainDis = disasmRange(rom, FUNC, 150);
for (const inst of mainDis) {
  console.log(`${hex6(inst.pc)}  ${inst.raw.padEnd(18)}  ${inst.m}${annotate(inst)}`);
}
console.log(`Total: ${mainDis.length} instructions, ${mainDis.reduce((s,i)=>s+i.len,0)} bytes`);

// Also disassemble the two called subroutines
for (const [label, addr] of [['0x0B4EE2 (called from 060256)', 0x0B4EE2], ['0x0A2718 (called from 06025A)', 0x0A2718]]) {
  console.log(`\n--- Sub-disassembly: ${label} ---`);
  const sub = disasmRange(rom, addr, 200);
  for (const inst of sub) {
    console.log(`${hex6(inst.pc)}  ${inst.raw.padEnd(18)}  ${inst.m}`);
  }
}

// ============================================================
// Part 2: Find all callers
// ============================================================
console.log('\n=== Part 2: All callers of 0x06023E ===');
// 0x06023E LE = 3E 02 06
const lo = 0x3E, mid = 0x02, hi = 0x06;
const calls = findAll(rom, [0xCD, lo, mid, hi]);
const jumps = findAll(rom, [0xC3, lo, mid, hi]);
console.log(`CALL (CD 3E 02 06): ${calls.length ? calls.map(hex6).join(', ') : '(none)'}`);
console.log(`JP   (C3 3E 02 06): ${jumps.length ? jumps.map(hex6).join(', ') : '(none)'}`);

for (const [pfx, name] of [[0x40,'SIS'],[0x49,'LIS'],[0x52,'SIL'],[0x5B,'LIL']]) {
  const pc = findAll(rom, [pfx, 0xCD, lo, mid, hi]);
  const pj = findAll(rom, [pfx, 0xC3, lo, mid, hi]);
  if (pc.length) console.log(`[${name}] CALL: ${pc.map(hex6).join(', ')}`);
  if (pj.length) console.log(`[${name}] JP:   ${pj.map(hex6).join(', ')}`);
}

// Context around each caller
for (const site of calls) {
  console.log(`\n--- Context around ${hex6(site)} ---`);
  const ctx = disasmRange(rom, Math.max(0, site - 16), 40);
  for (const inst of ctx) {
    const mark = inst.pc === site ? ' <<<' : '';
    console.log(`${hex6(inst.pc)}  ${inst.raw.padEnd(18)}  ${inst.m}${mark}`);
  }
}

// ============================================================
// Part 3: Dynamic test with 3 cursor positions
// ============================================================
console.log('\n=== Part 3: Dynamic test -- 3 cursor positions ===');

class SentinelHit extends Error {
  constructor(pc, steps) { super('sentinel'); this.pc = pc; this.steps = steps; }
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(rom);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Cold boot (same as golden probe)
console.log('Cold-booting...');
executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = SP_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

executor.runFrom(KERNEL_INIT, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = SP_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

executor.runFrom(POST_INIT, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
console.log(`Boot done. PC=${hex6(cpu.pc)}, SP=${hex6(cpu.sp)}`);

// Save post-boot state
const CPU_FIELDS = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];
function snapCpu() { return Object.fromEntries(CPU_FIELDS.map(f => [f, cpu[f]])); }
function restCpu(s) { for (const [k,v] of Object.entries(s)) cpu[k] = v; }

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = snapCpu();

const tests = [
  { label: 'Test A', row: 0, col: 0 },
  { label: 'Test B', row: 5, col: 13 },
  { label: 'Test C', row: 9, col: 25 },
];
const results = [];

for (const t of tests) {
  console.log(`\n--- ${t.label}: row=${t.row}, col=${t.col} ---`);

  // Restore clean state
  mem.set(ramSnap, 0x400000);
  restCpu(cpuSnap);

  // Set cursor position
  mem[CURSOR_ROW] = t.row;
  mem[CURSOR_COL] = t.col;

  // Fill VRAM with 0xFF so writes (likely 0x00 = black) are visible
  mem.fill(0xFF, VRAM, VRAM + VRAM_LEN);
  const vramBefore = new Uint8Array(mem.slice(VRAM, VRAM + VRAM_LEN));

  // Set up stack with sentinel return address
  cpu.sp = SP_TOP;
  cpu.sp -= 3;
  mem[cpu.sp] = SENTINEL & 0xFF;
  mem[cpu.sp + 1] = (SENTINEL >> 8) & 0xFF;
  mem[cpu.sp + 2] = (SENTINEL >> 16) & 0xFF;

  const read3 = (a) => mem[a] | (mem[a+1] << 8) | (mem[a+2] << 16);
  console.log(`Before: D0059C=${hex6(read3(VRAM_PTR))}, D008D2=${hex6(read3(LCD_X))}, D008D5=${hex6(read3(LCD_Y))}`);

  // Run function
  let result;
  try {
    result = executor.runFrom(FUNC, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 10000,
      onMissingBlock(pc, _mode, steps) {
        if (pc >= 0xD00000) throw new SentinelHit(pc, steps);
      },
    });
  } catch (err) {
    if (err instanceof SentinelHit) {
      result = { steps: err.steps, termination: 'sentinel', lastPc: err.pc };
    } else {
      console.log(`  EXECUTION ERROR: ${err.message}`);
      results.push({ ...t, error: true });
      continue;
    }
  }

  console.log(`Result: steps=${result.steps}, term=${result.termination}, lastPc=${hex6(result.lastPc)}`);
  console.log(`After:  D0059C=${hex6(read3(VRAM_PTR))}, D008D2=${hex6(read3(LCD_X))}, D008D5=${hex6(read3(LCD_Y))}`);

  // Analyze VRAM changes
  let nonFF = 0;
  let minX = 999, maxX = -1, minY = 999, maxY = -1;
  const valCounts = new Map();
  for (let i = 0; i < VRAM_LEN; i++) {
    const v = mem[VRAM + i];
    if (v !== 0xFF) {
      nonFF++;
      const x = i % W, y = Math.floor(i / W);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      valCounts.set(v, (valCounts.get(v) || 0) + 1);
    }
  }

  console.log(`Non-0xFF VRAM bytes: ${nonFF}`);
  if (nonFF > 0) {
    console.log(`Bounding box: x=${minX}-${maxX}, y=${minY}-${maxY}, size=${maxX-minX+1}x${maxY-minY+1}`);
    const top5 = [...valCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,5);
    console.log(`Value distribution: ${top5.map(([v,c])=>`${hex2(v)}=${c}`).join(', ')}`);

    // Per-row summary (first 30)
    const rows = new Map();
    for (let i = 0; i < VRAM_LEN; i++) {
      if (mem[VRAM + i] !== 0xFF) {
        const ry = Math.floor(i / W), rx = i % W;
        if (!rows.has(ry)) rows.set(ry, { mn: rx, mx: rx, c: 0 });
        const r = rows.get(ry);
        if (rx < r.mn) r.mn = rx;
        if (rx > r.mx) r.mx = rx;
        r.c++;
      }
    }
    let printed = 0;
    for (const [ry, r] of [...rows.entries()].sort((a,b) => a[0]-b[0])) {
      if (printed++ < 30) console.log(`  y=${ry}: x=${r.mn}-${r.mx}, count=${r.c}`);
    }
    if (rows.size > 30) console.log(`  ... (${rows.size - 30} more rows)`);
  }

  results.push({ ...t, nonFF, minX, maxX, minY, maxY, steps: result.steps, term: result.termination });
}

// ============================================================
// Part 4: Relationship to nearby functions
// ============================================================
console.log('\n=== Part 4: Relationship to nearby functions ===');
console.log(`0x06023E -> 0x06029D: ${NEARBY_A - FUNC} bytes`);
console.log(`0x06023E -> 0x061000: ${NEARBY_B - FUNC} bytes`);

// Check if 0x06023E references 0x06029D or 0x061000
console.log('\n0x06023E body refs:');
let found = false;
for (const inst of mainDis) {
  if (inst.m.includes(hex6(NEARBY_A))) { console.log(`  ${hex6(inst.pc)}: ${inst.m} -> 0x06029D`); found = true; }
  if (inst.m.includes(hex6(NEARBY_B))) { console.log(`  ${hex6(inst.pc)}: ${inst.m} -> 0x061000`); found = true; }
}
if (!found) console.log('  (none)');

// Reverse check
for (const [name, addr] of [['0x06029D', NEARBY_A], ['0x061000', NEARBY_B]]) {
  const sub = disasmRange(rom, addr, 200);
  const refs = sub.filter(i => i.m.includes(hex6(FUNC)));
  console.log(`${name} -> 0x06023E: ${refs.length ? refs.map(i => `${hex6(i.pc)}: ${i.m}`).join(', ') : '(none)'}`);
}

// ============================================================
// Summary
// ============================================================
console.log('\n=== Summary ===');
const valid = results.filter(r => !r.error);
if (valid.length >= 2) {
  const a = valid[0], b = valid[1];
  const same = a.minX === b.minX && a.maxX === b.maxX && a.minY === b.minY && a.maxY === b.maxY;
  console.log(`Region same across cursor positions: ${same}`);
  if (same) {
    console.log('CLASSIFICATION: CURSOR-INDEPENDENT -> screen-clear or region fill');
  } else {
    console.log('CLASSIFICATION: CURSOR-DEPENDENT -> cursor draw or cell operation');
  }
}
for (const r of valid) {
  const box = r.nonFF > 0 ? `${r.maxX-r.minX+1}x${r.maxY-r.minY+1} at (${r.minX},${r.minY})` : 'none';
  console.log(`${r.label} row=${r.row} col=${r.col}: ${r.nonFF} non-0xFF, bbox=${box}, steps=${r.steps}`);
}

console.log('\nProbe complete.');
process.exit(0);
