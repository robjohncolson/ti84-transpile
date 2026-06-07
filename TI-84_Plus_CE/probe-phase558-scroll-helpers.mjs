#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

const TARGETS = [
  { addr: 0x08dbe1, name: 'scroll helper callee 0x08DBE1' },
  { addr: 0x0ad455, name: 'scroll helper callee 0x0AD455' },
];

const MAX_SCAN = 0x200;
const RAM_BASE = 0xd00000;
const MMIO_BASE = 0xe00000;

const r8 = ['b', 'c', 'd', 'e', 'h', 'l', '(hl)', 'a'];
const r16 = ['bc', 'de', 'hl', 'sp'];
const rp2 = ['bc', 'de', 'hl', 'af'];
const cc = ['nz', 'z', 'nc', 'c', 'po', 'pe', 'p', 'm'];
const alu = ['add a,', 'adc a,', 'sub', 'sbc a,', 'and', 'xor', 'or', 'cp'];

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(value) {
  return '0x' + (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function signed8(value) {
  return value & 0x80 ? value - 0x100 : value;
}

function byteAt(addr) {
  return rom[addr] ?? 0;
}

function word16(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8);
}

function word24(addr) {
  return byteAt(addr) | (byteAt(addr + 1) << 8) | (byteAt(addr + 2) << 16);
}

function bytesAt(addr, len) {
  return Array.from({ length: len }, (_, i) => byteAt(addr + i));
}

function bytesText(bytes) {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(14);
}

function addMemoryRefs(bytes, refs) {
  for (let i = 0; i <= bytes.length - 3; i++) {
    const value = bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16);
    if (value >= MMIO_BASE) refs.mmio.add(value);
    else if (value >= RAM_BASE) refs.ram.add(value);
  }
}

function fmtDisp(d) {
  const s = signed8(d);
  return s < 0 ? `-${hexByte(-s)}` : `+${hexByte(s)}`;
}

function indexedReg(code, disp, indexName) {
  if (code === 6) return `(${indexName}${fmtDisp(disp)})`;
  if (indexName === 'iy') {
    if (code === 4) return 'iyh';
    if (code === 5) return 'iyl';
  } else {
    if (code === 4) return 'ixh';
    if (code === 5) return 'ixl';
  }
  return r8[code];
}

function decodeCb(addr, prefix, indexName) {
  if (prefix) {
    const disp = byteAt(addr + 2);
    const op = byteAt(addr + 3);
    const x = op >> 6;
    const y = (op >> 3) & 7;
    const z = op & 7;
    const mem = `(${indexName}${fmtDisp(disp)})`;
    const dst = indexedReg(z, disp, indexName);
    const base = x === 0
      ? ['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'][y]
      : x === 1
        ? `bit ${y},`
        : x === 2
          ? `res ${y},`
          : `set ${y},`;
    const text = x === 1 || z === 6 ? `${base} ${mem}` : `${base} ${mem} -> ${dst}`;
    return { len: 4, text, iy: indexName === 'iy' };
  }

  const op = byteAt(addr + 1);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  if (x === 0) return { len: 2, text: `${['rlc', 'rrc', 'rl', 'rr', 'sla', 'sra', 'sll', 'srl'][y]} ${r8[z]}` };
  if (x === 1) return { len: 2, text: `bit ${y}, ${r8[z]}` };
  if (x === 2) return { len: 2, text: `res ${y}, ${r8[z]}` };
  return { len: 2, text: `set ${y}, ${r8[z]}` };
}

function decodeEd(addr) {
  const op = byteAt(addr + 1);
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;
  const block = {
    0xa0: 'ldi', 0xa1: 'cpi', 0xa2: 'ini', 0xa3: 'outi',
    0xa8: 'ldd', 0xa9: 'cpd', 0xaa: 'ind', 0xab: 'outd',
    0xb0: 'ldir', 0xb1: 'cpir', 0xb2: 'inir', 0xb3: 'otir',
    0xb8: 'lddr', 0xb9: 'cpdr', 0xba: 'indr', 0xbb: 'otdr',
  }[op];
  if (block) return { len: 2, text: block };
  if (op >= 0x40 && op <= 0x7f) {
    if (z === 0) return { len: 2, text: `in ${r8[y]}, (c)` };
    if (z === 1) return { len: 2, text: `out (c), ${r8[y]}` };
    if (z === 2) return { len: 2, text: `${q ? 'adc' : 'sbc'} hl, ${r16[p]}` };
    if (z === 3) return { len: 4, text: `${q ? 'ld ' + r16[p] + ', ' : 'ld '}(${hex(word16(addr + 2), 4)})${q ? '' : ', ' + r16[p]}` };
    if (z === 4) return { len: 2, text: 'neg' };
    if (z === 5) return { len: 2, text: op === 0x4d ? 'reti' : 'retn', ret: true };
    if (z === 6) return { len: 2, text: `im ${[0, 0, 1, 2][y & 3]}` };
    if (z === 7) return { len: 2, text: ['ld i, a', 'ld r, a', 'ld a, i', 'ld a, r', 'rrd', 'rld', 'nop', 'nop'][y] };
  }
  return { len: 2, text: `ed ${hexByte(op)}` };
}

function decodeIndexed(addr, indexName) {
  const op = byteAt(addr + 1);
  if (op === 0xcb) return decodeCb(addr, true, indexName);
  if (op === 0x21) return { len: 5, text: `ld ${indexName}, ${hex(word24(addr + 2))}`, iy: indexName === 'iy' };
  if (op === 0x22) return { len: 5, text: `ld (${hex(word24(addr + 2))}), ${indexName}`, iy: indexName === 'iy' };
  if (op === 0x2a) return { len: 5, text: `ld ${indexName}, (${hex(word24(addr + 2))})`, iy: indexName === 'iy' };
  if (op === 0x23) return { len: 2, text: `inc ${indexName}`, iy: indexName === 'iy' };
  if (op === 0x2b) return { len: 2, text: `dec ${indexName}`, iy: indexName === 'iy' };
  if (op === 0x34 || op === 0x35) return { len: 3, text: `${op === 0x34 ? 'inc' : 'dec'} (${indexName}${fmtDisp(byteAt(addr + 2))})`, iy: indexName === 'iy' };
  if (op === 0x36) return { len: 4, text: `ld (${indexName}${fmtDisp(byteAt(addr + 2))}), ${hexByte(byteAt(addr + 3))}`, iy: indexName === 'iy' };
  if ((op & 0xc7) === 0x46) return { len: 3, text: `ld ${r8[(op >> 3) & 7]}, (${indexName}${fmtDisp(byteAt(addr + 2))})`, iy: indexName === 'iy' };
  if ((op & 0xf8) === 0x70) return { len: 3, text: `ld (${indexName}${fmtDisp(byteAt(addr + 2))}), ${r8[op & 7]}`, iy: indexName === 'iy' };
  if ((op & 0xc7) === 0x86) return { len: 3, text: `${alu[(op >> 3) & 7]} (${indexName}${fmtDisp(byteAt(addr + 2))})`, iy: indexName === 'iy' };
  if (op === 0xe5 || op === 0xe1) return { len: 2, text: `${op === 0xe5 ? 'push' : 'pop'} ${indexName}`, iy: indexName === 'iy' };
  if (op === 0xe9) return { len: 2, text: `jp (${indexName})`, branch: true, iy: indexName === 'iy' };
  if (op === 0xf9) return { len: 2, text: `ld sp, ${indexName}`, iy: indexName === 'iy' };
  return { len: 2, text: `${indexName} prefix ${hexByte(op)}`, iy: indexName === 'iy' };
}

function decode(addr) {
  const op = byteAt(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;
  const p = y >> 1;
  const q = y & 1;

  if (op === 0xfd) return decodeIndexed(addr, 'iy');
  if (op === 0xdd) return decodeIndexed(addr, 'ix');
  if (op === 0xcb) return decodeCb(addr, false);
  if (op === 0xed) return decodeEd(addr);

  if (x === 0) {
    if (z === 0) {
      if (y === 0) return { len: 1, text: 'nop' };
      if (y === 1) return { len: 4, text: `ex af, af'` };
      if (y === 2) return { len: 3, text: `djnz ${hex(addr + 2 + signed8(byteAt(addr + 1)))}`, branch: true };
      if (y === 3) return { len: 3, text: `jr ${hex(addr + 2 + signed8(byteAt(addr + 1)))}`, branch: true };
      return { len: 3, text: `jr ${cc[y - 4]}, ${hex(addr + 2 + signed8(byteAt(addr + 1)))}`, branch: true };
    }
    if (z === 1) return q ? { len: 1, text: `add hl, ${r16[p]}` } : { len: 4, text: `ld ${r16[p]}, ${hex(word24(addr + 1))}` };
    if (z === 2) {
      if (!q && p === 0) return { len: 1, text: 'ld (bc), a' };
      if (!q && p === 1) return { len: 1, text: 'ld (de), a' };
      if (!q && p === 2) return { len: 4, text: `ld (${hex(word24(addr + 1))}), hl` };
      if (!q && p === 3) return { len: 4, text: `ld (${hex(word24(addr + 1))}), a` };
      if (q && p === 0) return { len: 1, text: 'ld a, (bc)' };
      if (q && p === 1) return { len: 1, text: 'ld a, (de)' };
      if (q && p === 2) return { len: 4, text: `ld hl, (${hex(word24(addr + 1))})` };
      return { len: 4, text: `ld a, (${hex(word24(addr + 1))})` };
    }
    if (z === 3) return { len: 1, text: `${q ? 'dec' : 'inc'} ${r16[p]}` };
    if (z === 4) return { len: 1, text: `inc ${r8[y]}` };
    if (z === 5) return { len: 1, text: `dec ${r8[y]}` };
    if (z === 6) return { len: 2, text: `ld ${r8[y]}, ${hexByte(byteAt(addr + 1))}` };
    return { len: 1, text: ['rlca', 'rrca', 'rla', 'rra', 'daa', 'cpl', 'scf', 'ccf'][y] };
  }

  if (x === 1) {
    if (op === 0x76) return { len: 1, text: 'halt' };
    return { len: 1, text: `ld ${r8[y]}, ${r8[z]}` };
  }

  if (x === 2) return { len: 1, text: `${alu[y]} ${r8[z]}` };

  if (z === 0) return { len: 1, text: `ret ${cc[y]}`, ret: false };
  if (z === 1) return q ? { len: 1, text: ['ret', 'exx', 'jp (hl)', 'ld sp, hl'][p], ret: p === 0, branch: p === 2 } : { len: 1, text: `pop ${rp2[p]}` };
  if (z === 2) return { len: 4, text: `jp ${cc[y]}, ${hex(word24(addr + 1))}`, branch: true, branchTarget: word24(addr + 1) };
  if (z === 3) {
    if (y === 0) return { len: 4, text: `jp ${hex(word24(addr + 1))}`, branch: true, branchTarget: word24(addr + 1) };
    if (y === 2) return { len: 2, text: `out (${hexByte(byteAt(addr + 1))}), a` };
    if (y === 3) return { len: 2, text: `in a, (${hexByte(byteAt(addr + 1))})` };
    if (y === 4) return { len: 1, text: 'ex (sp), hl' };
    if (y === 5) return { len: 1, text: 'ex de, hl' };
    if (y === 6) return { len: 1, text: 'di' };
    if (y === 7) return { len: 1, text: 'ei' };
  }
  if (z === 4) return { len: 4, text: `call ${cc[y]}, ${hex(word24(addr + 1))}`, callTarget: word24(addr + 1) };
  if (z === 5) return q ? { len: 4, text: `call ${hex(word24(addr + 1))}`, callTarget: word24(addr + 1) } : { len: 1, text: `push ${rp2[p]}` };
  if (z === 6) return { len: 2, text: `${alu[y]} ${hexByte(byteAt(addr + 1))}` };
  if (z === 7) return { len: 1, text: `rst ${hexByte(y * 8)}` };

  return { len: 1, text: `db ${hexByte(op)}` };
}

function analyzeFunction(target) {
  const refs = {
    calls: new Set(),
    ram: new Set(),
    mmio: new Set(),
    branches: [],
    iyOps: [],
  };
  const lines = [];
  let pc = target.addr;
  let ended = false;

  while (pc < target.addr + MAX_SCAN && pc < rom.length) {
    const ins = decode(pc);
    const bytes = bytesAt(pc, ins.len);
    addMemoryRefs(bytes, refs);

    if (ins.callTarget !== undefined) refs.calls.add(ins.callTarget);
    if (ins.branch) refs.branches.push({ from: pc, to: ins.branchTarget, text: ins.text });
    if (ins.iy) refs.iyOps.push(pc);

    lines.push(`${hex(pc)}  ${bytesText(bytes)}  ${ins.text}`);
    pc += ins.len;
    if (ins.ret) {
      ended = true;
      break;
    }
  }

  return {
    target,
    start: target.addr,
    end: pc,
    size: pc - target.addr,
    ended,
    lines,
    refs,
  };
}

function sortedHex(set) {
  return [...set].sort((a, b) => a - b).map((v) => hex(v));
}

function likelyPurpose(result) {
  const calls = sortedHex(result.refs.calls);
  const ram = sortedHex(result.refs.ram);
  const mmio = sortedHex(result.refs.mmio);
  const hasBlockCopy = result.lines.some((line) => /\bldir\b|\blddr\b/.test(line));
  const hasFillLoop = result.lines.some((line) => /\bld \(.*\), a\b|\bld \(.*\), 0x00\b/.test(line))
    && result.refs.branches.length > 0;
  const hasDisplayIo = mmio.length > 0;
  const hasIY = result.refs.iyOps.length > 0;

  if (hasBlockCopy) return 'likely row/rectangle copy or scroll buffer move helper (block transfer present)';
  if (hasFillLoop && hasDisplayIo) return 'likely display row/area clear or fill helper touching display MMIO';
  if (hasFillLoop) return 'likely RAM-backed row/area clear or fill helper';
  if (calls.length && hasIY) return 'likely display state wrapper that dispatches through font/UI flags';
  if (ram.length || mmio.length) return 'display memory helper; inspect refs above for exact buffer/register role';
  return 'unclear from opcode shape; no obvious RAM/MMIO/block-transfer signature';
}

for (const target of TARGETS) {
  const result = analyzeFunction(target);
  console.log(`\n=== ${target.name} ===`);
  console.log(`Start: ${hex(result.start)}  End: ${hex(result.end)}  Size: ${hex(result.size, 4)} (${result.size} bytes)  Terminated: ${result.ended ? 'RET' : 'max scan'}`);
  console.log('');
  for (const line of result.lines) console.log(line);
  console.log('');
  console.log(`Summary for ${hex(target.addr)}:`);
  console.log(`  size: ${result.size} bytes`);
  console.log(`  calls made: ${sortedHex(result.refs.calls).join(', ') || '(none)'}`);
  console.log(`  RAM touched: ${sortedHex(result.refs.ram).join(', ') || '(none)'}`);
  console.log(`  MMIO touched: ${sortedHex(result.refs.mmio).join(', ') || '(none)'}`);
  console.log(`  IY-relative ops: ${result.refs.iyOps.map((v) => hex(v)).join(', ') || '(none)'}`);
  console.log(`  JP/JR branches: ${result.refs.branches.map((b) => `${hex(b.from)} ${b.text}`).join('; ') || '(none)'}`);
  console.log(`  likely purpose: ${likelyPurpose(result)}`);
}
