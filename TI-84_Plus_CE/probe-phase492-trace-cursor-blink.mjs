#!/usr/bin/env node
// Phase 492: Trace the cursor blink mechanism through the OS event loop
// Entry: 0x03030E (blink entry in OS idle loop)
// Goal: Map which D00092 / IY+offset flag values cause execution to reach
//       cursor draw (0x06029D) or cursor erase (0x061000/0x061003)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const rom = new Uint8Array(romBytes);
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const ADDR_MASK = 0xFFFFFF;
const VRAM_START = 0xD40000;
const VRAM_SIZE = 320 * 240;
const CURSOR_FLAGS = 0xD00092;
const CURSOR_ROW = 0xD00595;
const CURSOR_COL = 0xD00596;
const STACK_TOP = 0xD1A87E;

const BLINK_ENTRY = 0x03030E;
const CURSOR_DRAW = 0x06029D;
const CURSOR_ERASE = 0x061000;
const CURSOR_ERASE2 = 0x061003;
const CURSOR_CALLER1 = 0x060FC3;
const CURSOR_CALLER2 = 0x06104E;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const TRACE_MAX_STEPS = 30000;

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function hexByte(value) {
  return '0x' + (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function bytesHex(buf, start, length) {
  const out = [];
  for (let i = 0; i < length; i++) {
    out.push((buf[start + i] ?? 0).toString(16).toUpperCase().padStart(2, '0'));
  }
  return out.join(' ');
}

function readLE(buf, pos, bytes) {
  let value = 0;
  for (let i = 0; i < bytes; i++) {
    value |= (buf[pos + i] ?? 0) << (i * 8);
  }
  return value >>> 0;
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

function dispText(value) {
  const signed = signed8(value);
  if (signed === 0) return '+0';
  return signed > 0 ? ('+' + signed) : String(signed);
}

// Minimal eZ80 disassembler (3-byte address mode)

const r = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
const rp = ['bc', 'de', 'hl', 'sp'];
const rp2 = ['bc', 'de', 'hl', 'af'];
const ccNames = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'];
const aluOps = ['add a,', 'adc a,', 'sub', 'sbc a,', 'and', 'xor', 'or', 'cp'];
const rotOps = ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'];

function relTarget(pc, length, disp) {
  return (pc + length + signed8(disp)) & ADDR_MASK;
}

function addrOp(buf, pos, bytes) {
  return hex(readLE(buf, pos, bytes), bytes * 2);
}

function ixRegName(code, index, disp) {
  if (code === 6) return '(' + index + dispText(disp) + ')';
  if (code === 4) return index + 'h';
  if (code === 5) return index + 'l';
  return r[code];
}

function decodeCB(op, target) {
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
  if (x === 0) return rotOps[y] + ' ' + (target ?? r[z]);
  if (x === 1) return 'bit ' + y + ',' + (target ?? r[z]);
  if (x === 2) return 'res ' + y + ',' + (target ?? r[z]);
  return 'set ' + y + ',' + (target ?? r[z]);
}

function decodeED(buf, pc, addrBytes) {
  const op = buf[pc + 1] ?? 0;
  const x = op >> 6, y = (op >> 3) & 7, z = op & 7;
  const p = y >> 1, q = y & 1;

  const leaIx = new Map([[0x02,'bc'],[0x12,'de'],[0x22,'hl'],[0x32,'ix']]);
  const leaIy = new Map([[0x03,'bc'],[0x13,'de'],[0x23,'hl'],[0x33,'iy']]);
  if (leaIx.has(op)) return { length: 3, mnemonic: 'lea ' + leaIx.get(op) + ',ix' + dispText(buf[pc+2]??0) };
  if (leaIy.has(op)) return { length: 3, mnemonic: 'lea ' + leaIy.get(op) + ',iy' + dispText(buf[pc+2]??0) };
  if (op === 0x65) return { length: 3, mnemonic: 'pea ix' + dispText(buf[pc+2]??0) };
  if (op === 0x66) return { length: 3, mnemonic: 'pea iy' + dispText(buf[pc+2]??0) };

  const mlt = new Map([[0x4C,'bc'],[0x5C,'de'],[0x6C,'hl'],[0x7C,'sp']]);
  if (mlt.has(op)) return { length: 2, mnemonic: 'mlt ' + mlt.get(op) };

  if (x === 1) {
    if (z === 0) return { length: 2, mnemonic: y===6 ? 'in (c)' : 'in '+r[y]+',(c)' };
    if (z === 1) return { length: 2, mnemonic: y===6 ? 'out (c),0' : 'out (c),'+r[y] };
    if (z === 2) return { length: 2, mnemonic: (q?'adc':'sbc')+' hl,'+rp[p] };
    if (z === 3) { const a=addrOp(buf,pc+2,addrBytes); return { length:2+addrBytes, mnemonic: q?('ld '+rp[p]+',('+a+')'):('ld ('+a+'),'+rp[p]) }; }
    if (z === 4) return { length: 2, mnemonic: 'neg' };
    if (z === 5) return { length: 2, mnemonic: y===1?'reti':'retn' };
    if (z === 6) return { length: 2, mnemonic: 'im '+[0,0,1,2,0,0,1,2][y] };
    return { length: 2, mnemonic: ['ld i,a','ld r,a','ld a,i','ld a,r','rrd','rld','nop','nop'][y] };
  }

  const blk = new Map([[0xA0,'ldi'],[0xA1,'cpi'],[0xA2,'ini'],[0xA3,'outi'],[0xA8,'ldd'],[0xA9,'cpd'],[0xAA,'ind'],[0xAB,'outd'],[0xB0,'ldir'],[0xB1,'cpir'],[0xB2,'inir'],[0xB3,'otir'],[0xB8,'lddr'],[0xB9,'cpdr'],[0xBA,'indr'],[0xBB,'otdr']]);
  if (blk.has(op)) return { length: 2, mnemonic: blk.get(op) };
  return { length: 2, mnemonic: 'ed ' + hex(op,2) };
}

function decodeBase(buf, pc, addrBytes) {
  if (addrBytes === undefined) addrBytes = 3;
  const op = buf[pc] ?? 0;

  if (op === 0xCB) return { length: 2, mnemonic: decodeCB(buf[pc+1]??0) };
  if (op === 0xED) return decodeED(buf, pc, addrBytes);
  if (op === 0xDD || op === 0xFD) return decodeIx(buf, pc, op===0xDD?'ix':'iy', addrBytes);

  const x = op >> 6, y = (op >> 3) & 7, z = op & 7, p = y >> 1, q = y & 1;

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { length: 1, mnemonic: 'nop' };
      if (y === 1) return { length: 1, mnemonic: "ex af,af'" };
      if (y === 2) return { length: 2, mnemonic: 'djnz ' + hex(relTarget(pc,2,buf[pc+1]??0)) };
      if (y === 3) return { length: 2, mnemonic: 'jr ' + hex(relTarget(pc,2,buf[pc+1]??0)) };
      return { length: 2, mnemonic: 'jr ' + ccNames[y-4] + ',' + hex(relTarget(pc,2,buf[pc+1]??0)) };
    }
    if (z === 1) { if (q===0) return { length:1+addrBytes, mnemonic:'ld '+rp[p]+','+addrOp(buf,pc+1,addrBytes) }; return { length:1, mnemonic:'add hl,'+rp[p] }; }
    if (z === 2) {
      if (p===0) return { length:1, mnemonic: q?'ld a,(bc)':'ld (bc),a' };
      if (p===1) return { length:1, mnemonic: q?'ld a,(de)':'ld (de),a' };
      if (p===2) return { length:1+addrBytes, mnemonic: q?('ld hl,('+addrOp(buf,pc+1,addrBytes)+')'):('ld ('+addrOp(buf,pc+1,addrBytes)+'),hl') };
      return { length:1+addrBytes, mnemonic: q?('ld a,('+addrOp(buf,pc+1,addrBytes)+')'):('ld ('+addrOp(buf,pc+1,addrBytes)+'),a') };
    }
    if (z === 3) return { length: 1, mnemonic: (q?'dec':'inc')+' '+rp[p] };
    if (z === 4) return { length: 1, mnemonic: 'inc '+r[y] };
    if (z === 5) return { length: 1, mnemonic: 'dec '+r[y] };
    if (z === 6) return { length: 2, mnemonic: 'ld '+r[y]+','+hex(buf[pc+1]??0,2) };
    return { length: 1, mnemonic: ['rlca','rrca','rla','rra','daa','cpl','scf','ccf'][y] };
  }
  if (x === 1) { if (op===0x76) return { length:1, mnemonic:'halt' }; return { length:1, mnemonic:'ld '+r[y]+','+r[z] }; }
  if (x === 2) return { length: 1, mnemonic: aluOps[y]+' '+r[z] };

  if (z === 0) return { length: 1, mnemonic: 'ret '+ccNames[y] };
  if (z === 1) { if (q===0) return { length:1, mnemonic:'pop '+rp2[p] }; if (p===0) return { length:1, mnemonic:'ret' }; if (p===1) return { length:1, mnemonic:'exx' }; if (p===2) return { length:1, mnemonic:'jp (hl)' }; return { length:1, mnemonic:'ld sp,hl' }; }
  if (z === 2) return { length:1+addrBytes, mnemonic:'jp '+ccNames[y]+','+addrOp(buf,pc+1,addrBytes) };
  if (z === 3) {
    if (y===0) return { length:1+addrBytes, mnemonic:'jp '+addrOp(buf,pc+1,addrBytes) };
    if (y===1) return { length:2, mnemonic:decodeCB(buf[pc+1]??0) };
    if (y===2) return { length:2, mnemonic:'out ('+hex(buf[pc+1]??0,2)+'),a' };
    if (y===3) return { length:2, mnemonic:'in a,('+hex(buf[pc+1]??0,2)+')' };
    if (y===4) return { length:1, mnemonic:'ex (sp),hl' };
    if (y===5) return { length:1, mnemonic:'ex de,hl' };
    if (y===6) return { length:1, mnemonic:'di' };
    return { length:1, mnemonic:'ei' };
  }
  if (z === 4) return { length:1+addrBytes, mnemonic:'call '+ccNames[y]+','+addrOp(buf,pc+1,addrBytes) };
  if (z === 5) { if (q===0) return { length:1, mnemonic:'push '+rp2[p] }; if (p===0) return { length:1+addrBytes, mnemonic:'call '+addrOp(buf,pc+1,addrBytes) }; }
  if (z === 6) return { length: 2, mnemonic: aluOps[y]+' '+hex(buf[pc+1]??0,2) };
  return { length: 1, mnemonic: 'rst '+hex(y*8,2) };
}

function decodeIx(buf, pc, index, addrBytes) {
  const op = buf[pc+1] ?? 0;
  if (op === 0xCB) { const d=buf[pc+2]??0, cb=buf[pc+3]??0, z2=cb&7, tgt='('+index+dispText(d)+')'; return { length:4, mnemonic: z2===6?decodeCB(cb,tgt):(decodeCB(cb,tgt)+','+r[z2]) }; }
  if (op === 0xED) return { length:2, mnemonic:index+'-prefix ed' };

  const x=op>>6, y=(op>>3)&7, z=op&7, p=y>>1, q=y&1;
  if (x===0) {
    if (z===1) { if (q===0&&p===2) return { length:2+addrBytes, mnemonic:'ld '+index+','+addrOp(buf,pc+2,addrBytes) }; if (q===1&&p===2) return { length:2, mnemonic:'add '+index+','+index }; if (q===1) return { length:2, mnemonic:'add '+index+','+rp[p] }; }
    if (z===2&&p===2) return { length:2+addrBytes, mnemonic: q?('ld '+index+',('+addrOp(buf,pc+2,addrBytes)+')'):('ld ('+addrOp(buf,pc+2,addrBytes)+'),'+index) };
    if (z===3&&p===2) return { length:2, mnemonic:(q?'dec':'inc')+' '+index };
    if ((z===4||z===5)&&y===6) return { length:3, mnemonic:(z===4?'inc':'dec')+' ('+index+dispText(buf[pc+2]??0)+')' };
    if (z===4||z===5) return { length:2, mnemonic:(z===4?'inc':'dec')+' '+ixRegName(y,index,0) };
    if (z===6&&y===6) return { length:4, mnemonic:'ld ('+index+dispText(buf[pc+2]??0)+'),'+hex(buf[pc+3]??0,2) };
    if (z===6) return { length:3, mnemonic:'ld '+ixRegName(y,index,0)+','+hex(buf[pc+2]??0,2) };
  }
  if (x===1) { if (op===0x76) return { length:2, mnemonic:'halt' }; if (y===6||z===6) { const d=buf[pc+2]??0; return { length:3, mnemonic:'ld '+ixRegName(y,index,d)+','+ixRegName(z,index,d) }; } return { length:2, mnemonic:'ld '+ixRegName(y,index,0)+','+ixRegName(z,index,0) }; }
  if (x===2) { if (z===6) return { length:3, mnemonic:aluOps[y]+' ('+index+dispText(buf[pc+2]??0)+')' }; return { length:2, mnemonic:aluOps[y]+' '+ixRegName(z,index,0) }; }
  if (op===0xE1) return { length:2, mnemonic:'pop '+index };
  if (op===0xE3) return { length:2, mnemonic:'ex (sp),'+index };
  if (op===0xE5) return { length:2, mnemonic:'push '+index };
  if (op===0xE9) return { length:2, mnemonic:'jp ('+index+')' };
  if (op===0xF9) return { length:2, mnemonic:'ld sp,'+index };
  const dec = decodeBase(buf, pc+1, addrBytes);
  return { length:1+dec.length, mnemonic:index+'-prefix '+dec.mnemonic };
}

// Pattern search in ROM

function findPattern(buf, pattern) {
  const hits = [];
  outer: for (let i = 0; i <= buf.length - pattern.length; i++) {
    for (let j = 0; j < pattern.length; j++) {
      if (buf[i + j] !== pattern[j]) continue outer;
    }
    hits.push(i);
  }
  return hits;
}

// Runtime setup

function buildRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom);
  const bus = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals: bus });
  const cpu = executor.cpu;
  return { mem, bus, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function snapshotVram(mem) {
  return new Uint8Array(mem.buffer, VRAM_START, VRAM_SIZE).slice();
}

function diffVram(before, after) {
  let count = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) count++;
  }
  return count;
}

function purgeRamBlocks(executor) {
  const blocks = executor.compiledBlocks;
  for (const key of Object.keys(blocks)) {
    const addr = parseInt(key.split(':')[0], 16);
    if (addr >= 0xD00000) delete blocks[key];
  }
}

// Part 1: Static disassembly of 0x03030E

function disassembleBlink() {
  console.log('========================================');
  console.log('PART 1: Static disassembly of 0x03030E');
  console.log('========================================');
  let pc = BLINK_ENTRY;
  let count = 0;
  const maxInstr = 50;
  while (pc < rom.length && count < maxInstr) {
    const decoded = decodeBase(rom, pc, 3);
    console.log(hex(pc) + '  ' + bytesHex(rom, pc, decoded.length).padEnd(16) + '  ' + decoded.mnemonic);
    pc += decoded.length;
    count++;
    if (decoded.mnemonic === 'ret' && count > 5) {
      console.log('Stopped at unconditional RET after ' + count + ' instructions.');
      break;
    }
  }
  if (count >= maxInstr) console.log('Stopped after ' + maxInstr + ' instructions.');
}

// Part 2: Find callers of cursor functions

function findCursorCallers() {
  console.log('\n========================================');
  console.log('PART 2: ROM references to cursor functions');
  console.log('========================================');

  const targets = [
    { addr: 0x06029D, label: '0x06029D (cursor draw)' },
    { addr: 0x061000, label: '0x061000 (cursor erase)' },
    { addr: 0x061003, label: '0x061003 (cursor erase+3)' },
    { addr: 0x060FC3, label: '0x060FC3 (caller1)' },
    { addr: 0x06104E, label: '0x06104E (caller2)' },
  ];

  const prefixes = [null, 0x40, 0x49, 0x52, 0x5B];
  const blinkStart = 0x030000;
  const blinkEnd = 0x031000;

  for (const target of targets) {
    const lo = target.addr & 0xFF;
    const mid = (target.addr >> 8) & 0xFF;
    const hi = (target.addr >> 16) & 0xFF;
    const sites = [];

    for (const prefix of prefixes) {
      for (const opcode of [0xCD, 0xC3]) {
        const pattern = prefix != null ? [prefix, opcode, lo, mid, hi] : [opcode, lo, mid, hi];
        const hits = findPattern(rom, pattern);
        const opcName = opcode === 0xCD ? 'CALL' : 'JP';
        const pfx = prefix != null ? (hexByte(prefix) + ' ') : '';
        for (const hit of hits) {
          sites.push({ addr: hit, desc: pfx + opcName, inBlink: hit >= blinkStart && hit < blinkEnd });
        }
      }
    }

    console.log('\n' + target.label + ': ' + sites.length + ' call/jump site(s)');
    for (const site of sites) {
      const tag = site.inBlink ? ' ** IN BLINK RANGE **' : '';
      console.log('  ' + hex(site.addr) + '  ' + site.desc + tag);
    }
  }
}

// Part 3: Dynamic trace with D00092 flag values

function runDynamicTraceD00092(executor, cpu, mem) {
  console.log('\n========================================');
  console.log('PART 3: Dynamic trace from 0x03030E with varying D00092');
  console.log('========================================');

  const flagValues = [0x00, 0x01, 0x02, 0x04, 0x08, 0x0F, 0x10, 0x20, 0x40, 0x80, 0xFF];
  const results = [];

  for (const flagVal of flagValues) {
    mem[CURSOR_ROW] = 3;
    mem[CURSOR_COL] = 10;
    mem[CURSOR_FLAGS] = flagVal;

    const vramBefore = snapshotVram(mem);

    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_TOP - 3;
    mem.fill(0xFF, cpu.sp, cpu.sp + 3);
    cpu._iy = 0xD00080;
    cpu.mbase = 0xD0;

    const cursorBlocks = new Set();
    let hitDraw = false;
    let hitErase = false;
    let hitErase2 = false;
    let hitCaller1 = false;
    let hitCaller2 = false;
    let blockCount = 0;

    purgeRamBlocks(executor);

    let termination = 'unknown';
    try {
      const result = executor.runFrom(BLINK_ENTRY, 'adl', {
        maxSteps: TRACE_MAX_STEPS,
        maxLoopIterations: 500,
        onBlock: function(pc) {
          blockCount++;
          if (pc >= 0x060000 && pc < 0x062000) cursorBlocks.add(pc);
          if (pc === CURSOR_DRAW) hitDraw = true;
          if (pc === CURSOR_ERASE) hitErase = true;
          if (pc === CURSOR_ERASE2) hitErase2 = true;
          if (pc === CURSOR_CALLER1) hitCaller1 = true;
          if (pc === CURSOR_CALLER2) hitCaller2 = true;
        },
      });
      termination = result.termination ?? 'completed';
    } catch (err) {
      termination = 'error: ' + err.message;
    }

    const vramAfter = snapshotVram(mem);
    const vramChanges = diffVram(vramBefore, vramAfter);

    const cursorList = [...cursorBlocks].sort(function(a, b) { return a - b; });
    console.log('\nD00092=' + hexByte(flagVal) + ': ' + blockCount + ' blocks, term=' + termination);
    console.log('  060xxx blocks: ' + (cursorList.length > 0 ? cursorList.map(function(v) { return hex(v); }).join(', ') : '(none)'));
    console.log('  Draw(06029D)=' + hitDraw + '  Erase(061000)=' + hitErase + '  Erase+3(061003)=' + hitErase2 + '  Caller1(060FC3)=' + hitCaller1 + '  Caller2(06104E)=' + hitCaller2);
    console.log('  VRAM byte changes: ' + vramChanges);

    results.push({ flagVal: flagVal, blockCount: blockCount, termination: termination, cursorBlocks: cursorList, hitDraw: hitDraw, hitErase: hitErase, hitErase2: hitErase2, vramChanges: vramChanges });
  }

  console.log('\n--- D00092 flag value summary ---');
  console.log('Flag  | Blocks | 060xxx | Draw | Erase | VRAM chg | Termination');
  console.log('------+--------+--------+------+-------+----------+------------');
  for (const row of results) {
    console.log(
      hexByte(row.flagVal).padEnd(6) + '| ' +
      String(row.blockCount).padEnd(7) + '| ' +
      String(row.cursorBlocks.length).padEnd(7) + '| ' +
      (row.hitDraw ? 'Y' : 'N') + '    | ' +
      (row.hitErase ? 'Y' : 'N') + '     | ' +
      String(row.vramChanges).padEnd(9) + '| ' +
      row.termination
    );
  }

  return results;
}

// Part 4: IY+offset flag exploration

function runIYOffsetTrace(executor, cpu, mem) {
  console.log('\n========================================');
  console.log('PART 4: IY+offset flag exploration');
  console.log('========================================');

  const iy = cpu._iy;
  console.log('IY = ' + hex(iy));
  console.log('IY+0x12 = ' + hex(iy + 0x12) + ' (expected D00092 if IY=D00080)');

  console.log('\nFlag block IY+0x00 through IY+0x20:');
  for (let off = 0; off <= 0x20; off++) {
    const addr = (iy + off) & ADDR_MASK;
    console.log('  IY+' + hex(off, 2) + ' = ' + hex(addr) + ' = ' + hexByte(mem[addr]));
  }

  // Save original
  const origBlock = new Uint8Array(0x21);
  for (let i = 0; i <= 0x20; i++) origBlock[i] = mem[(iy + i) & ADDR_MASK];

  const offsets = [0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x08, 0x09, 0x0C, 0x0D, 0x12, 0x13, 0x14, 0x15, 0x18, 0x1C, 0x20];
  const bitPatterns = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80];

  console.log('\n--- IY+offset trace results (only hits reaching 060xxx) ---');
  console.log('Offset | Bits | Blocks | 060xxx | Draw | Erase | VRAM chg');
  console.log('-------+------+--------+--------+------+-------+---------');

  let anyHit = false;
  for (const offset of offsets) {
    for (const bits of bitPatterns) {
      // Restore original
      for (let i = 0; i <= 0x20; i++) mem[(iy + i) & ADDR_MASK] = origBlock[i];

      mem[(iy + offset) & ADDR_MASK] = bits;
      mem[CURSOR_ROW] = 3;
      mem[CURSOR_COL] = 10;

      const vramBefore = snapshotVram(mem);

      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.sp = STACK_TOP - 3;
      mem.fill(0xFF, cpu.sp, cpu.sp + 3);
      cpu._iy = iy;
      cpu.mbase = 0xD0;

      const cursorBlocks = new Set();
      let hitDraw = false;
      let hitErase = false;
      let bCount = 0;

      purgeRamBlocks(executor);

      try {
        executor.runFrom(BLINK_ENTRY, 'adl', {
          maxSteps: TRACE_MAX_STEPS,
          maxLoopIterations: 500,
          onBlock: function(pc) {
            bCount++;
            if (pc >= 0x060000 && pc < 0x062000) cursorBlocks.add(pc);
            if (pc === CURSOR_DRAW) hitDraw = true;
            if (pc === CURSOR_ERASE || pc === CURSOR_ERASE2) hitErase = true;
          },
        });
      } catch (_e) {
        // ignore
      }

      const vramAfter = snapshotVram(mem);
      const vramChanges = diffVram(vramBefore, vramAfter);

      if (cursorBlocks.size > 0 || hitDraw || hitErase) {
        anyHit = true;
        console.log(
          hex(offset, 2).padEnd(7) + '| ' +
          hexByte(bits).padEnd(5) + '| ' +
          String(bCount).padEnd(7) + '| ' +
          String(cursorBlocks.size).padEnd(7) + '| ' +
          (hitDraw ? 'Y' : 'N') + '    | ' +
          (hitErase ? 'Y' : 'N') + '     | ' +
          vramChanges
        );
        if (cursorBlocks.size > 0) {
          const sorted = [...cursorBlocks].sort(function(a,b){return a-b;});
          console.log('         -> 060xxx: ' + sorted.map(function(v){return hex(v);}).join(', '));
        }
      }
    }
  }

  if (!anyHit) {
    console.log('(no IY+offset / bit combination reached 060xxx cursor functions)');
  }

  // Restore original
  for (let i = 0; i <= 0x20; i++) mem[(iy + i) & ADDR_MASK] = origBlock[i];

  // All-flags-set baseline
  console.log('\n--- All-flags-set baseline ---');
  for (let i = 0; i <= 0x20; i++) mem[(iy + i) & ADDR_MASK] = 0xFF;
  mem[CURSOR_ROW] = 3;
  mem[CURSOR_COL] = 10;

  const vramBefore = snapshotVram(mem);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  cpu._iy = iy;
  cpu.mbase = 0xD0;

  const allSetBlocks = new Set();
  let allSetDraw = false;
  let allSetErase = false;
  let allSetCount = 0;

  purgeRamBlocks(executor);

  try {
    executor.runFrom(BLINK_ENTRY, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: 500,
      onBlock: function(pc) {
        allSetCount++;
        if (pc >= 0x060000 && pc < 0x062000) allSetBlocks.add(pc);
        if (pc === CURSOR_DRAW) allSetDraw = true;
        if (pc === CURSOR_ERASE || pc === CURSOR_ERASE2) allSetErase = true;
      },
    });
  } catch (_e) {
    // ignore
  }

  const vramAfter = snapshotVram(mem);
  const allSetVramChanges = diffVram(vramBefore, vramAfter);
  const allSetList = [...allSetBlocks].sort(function(a,b){return a-b;});

  console.log('All IY flags=0xFF: ' + allSetCount + ' blocks, 060xxx=' + (allSetList.length > 0 ? allSetList.map(function(v){return hex(v);}).join(', ') : '(none)'));
  console.log('  Draw=' + allSetDraw + '  Erase=' + allSetErase + '  VRAM changes=' + allSetVramChanges);

  // Restore original
  for (let i = 0; i <= 0x20; i++) mem[(iy + i) & ADDR_MASK] = origBlock[i];
}

// Main

try {
  disassembleBlink();
  findCursorCallers();

  console.log('\n--- Building runtime and cold-booting ---');
  const { mem, bus, executor, cpu } = buildRuntime();
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete. PC=' + hex(cpu.pc) + ', SP=' + hex(cpu.sp) + ', IY=' + hex(cpu._iy));
  console.log('D00092 (cursor flags) after boot: ' + hexByte(mem[CURSOR_FLAGS]));
  console.log('D00595 (row) after boot: ' + mem[CURSOR_ROW]);
  console.log('D00596 (col) after boot: ' + mem[CURSOR_COL]);

  runDynamicTraceD00092(executor, cpu, mem);
  runIYOffsetTrace(executor, cpu, mem);

  console.log('\n========================================');
  console.log('PROBE COMPLETE');
  console.log('========================================');
} catch (error) {
  console.log('\n=== PROBE FAILED ===');
  console.log(error && error.stack ? error.stack : (error && error.message ? error.message : String(error)));
}

process.exit(0);
