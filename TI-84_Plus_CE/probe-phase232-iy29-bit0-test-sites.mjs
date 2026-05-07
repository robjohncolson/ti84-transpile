#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const SITES = [0x030300, 0x03DDC4, 0x03DEE9, 0x06CCA0, 0x085AFB, 0x085BEB, 0x0AB8D4, 0x0ABB19, 0x0ABCA2, 0x0B63AE];
const CLUSTERS = {
  0x030300: '030300',
  0x03DDC4: '03DDC4-03DEE9',
  0x03DEE9: '03DDC4-03DEE9',
  0x06CCA0: '06CCA0',
  0x085AFB: '085AFB-085BEB',
  0x085BEB: '085AFB-085BEB',
  0x0AB8D4: '0AB8D4-0ABB19-0ABCA2',
  0x0ABB19: '0AB8D4-0ABB19-0ABCA2',
  0x0ABCA2: '0AB8D4-0ABB19-0ABCA2',
  0x0B63AE: '0B63AE',
};
const HYP = {
  '030300': 'Small helper that suppresses timer re-arm on repeated keys, then clears IY+8 bit 3 and calls 0x040D11.',
  '03DDC4-03DEE9': 'MoveUp/MoveDown style browser or menu handler: it uses winTop/curRow/varType/varClass and repeat-gates held-key motion.',
  '06CCA0': 'Graph-style or key-event state updater keyed by curGStyle; on repeats it marks IY+78 bit 5 and bumps the D02A85 counter before dispatch.',
  '085AFB-085BEB': 'Submenu navigation handler using menuSelected/menuNumItems/userMenuSA/pagedPutPtr; the repeat gate skips wrap/re-entry logic on held keys.',
  '0AB8D4-0ABB19-0ABCA2': 'Home/editor dispatch cluster that edits cxMain/cxErrorEP and D024xx cursor-state words; the repeat gate blocks re-entrant cursor/menu edits.',
  '0B63AE': 'Mode-setting helper for float/angle state (D02049/D0204A); the repeat gate suppresses auto-repeat before applying a +1 change.',
};
const NAMES = {
  0xD00595: 'curRow', 0xD007CA: 'cxMain', 0xD007D0: 'cxPutAway', 0xD007D6: 'cxErrorEP',
  0xD00813: 'varType', 0xD0081C: 'varClass', 0xD00826: 'menuSelected', 0xD00828: 'menuNumItems',
  0xD00838: 'userMenuSA', 0xD0146D: 'curGStyle', 0xD02049: 'floatMode', 0xD0204A: 'angleMode',
  0xD02258: 'editorDelta', 0xD02443: 'editorA', 0xD02445: 'editorPtr', 0xD0244A: 'editorCount',
  0xD02454: 'editorMode', 0xD02455: 'editorIndex', 0xD02456: 'editorLimit', 0xD02504: 'winTop',
  0xD025A6: 'pagedPutPtr', 0xD02A85: 'repeatCounter',
};

const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;
const s8 = (v) => (v & 0x80 ? v - 0x100 : v);
const off = (v) => `${s8(v) < 0 ? '-' : '+'}0x${Math.abs(s8(v)).toString(16).toUpperCase()}`;
const dec = (pc) => { try { return decodeInstruction(rom, pc, 'adl'); } catch { return null; } };
const isRet = (i) => i && i.tag === 'ret';
const resolveAddr = (i) => !Number.isInteger(i?.addr) ? null : i.modePrefix === 'sis' && i.addr < 0x10000 ? 0xD00000 | i.addr : i.addr;
const label = (a) => NAMES[a] ? `${hex(a)} ${NAMES[a]}` : hex(a);

function prevInst(pc) {
  let best = null;
  for (let s = Math.max(0, pc - 8); s < pc; s++) {
    const i = dec(s);
    if (i?.nextPc === pc) best = i;
  }
  return best;
}

function uniqueRows(rows) {
  return [...new Map(rows.filter(Boolean).map((r) => [r.pc, r])).values()].sort((a, b) => a.pc - b.pc);
}

function localRows(site) {
  const out = [];
  for (let pc = Math.max(0, site - 32); pc < Math.min(rom.length, site + 40) && out.length < 24;) {
    const i = dec(pc);
    if (!i?.length) { pc++; continue; }
    out.push(i);
    pc = i.nextPc;
  }
  return out.filter((r) => r.pc >= site - 32 && r.pc < site + 40);
}

function parent(site) {
  let cur = site;
  let start = site;
  for (let n = 0; n < 64; n++) {
    const p = prevInst(cur);
    if (!p) break;
    start = p.pc;
    if (isRet(p)) { start = p.nextPc; break; }
    cur = p.pc;
  }
  const rows = [];
  let pc = start;
  let seenSite = false;
  for (let n = 0; n < 128 && pc < rom.length; n++) {
    const i = dec(pc);
    if (!i?.length) break;
    rows.push(i);
    if (i.pc === site) seenSite = true;
    pc = i.nextPc;
    if (seenSite && isRet(i)) break;
  }
  return { start, end: rows.at(-1)?.nextPc ?? (site + 1), rows: uniqueRows([...localRows(site), ...rows]) };
}

function gateType(rows, site) {
  const i = rows.findIndex((r) => r.pc === site);
  const n = rows[i + 1];
  if (!n) return 'other';
  const c = (n.condition ?? '').toUpperCase();
  if (n.tag === 'jr-conditional') return `JR ${c}`;
  if (n.tag === 'jp-conditional') return `JP ${c}`;
  if (n.tag === 'ret-conditional') return `RET ${c}`;
  return 'other';
}

function calls(rows) {
  return [...new Set(rows.filter((r) => r.tag === 'call' || r.tag === 'call-conditional').map((r) => (
    r.tag === 'call' ? hex(r.target) : `${r.condition.toUpperCase()} ${hex(r.target)}`
  )))];
}

function iyFlags(rows, site) {
  return [...new Set(rows
    .filter((r) => r.indexRegister === 'iy' && !(r.pc === site && r.tag === 'indexed-cb-bit' && r.displacement === 29))
    .map((r) => `${r.tag}${r.bit === undefined ? '' : ` bit${r.bit}`} IY${off(r.displacement)}`))];
}

function ramRefs(rows) {
  return [...new Set(rows.map(resolveAddr).filter((a) => a !== null && (a & 0xF00000) === 0xD00000).map(label))];
}

const sites = SITES.map((site) => {
  const p = parent(site);
  return {
    address: hex(site),
    parentFunctionStart: hex(p.start),
    parentFunctionEnd: hex(p.end),
    gateType: gateType(p.rows, site),
    surroundingCalls: calls(p.rows),
    otherIYFlags: iyFlags(p.rows, site),
    ramAddresses: ramRefs(p.rows),
    cluster: CLUSTERS[site],
    hypothesis: HYP[CLUSTERS[site]],
  };
});

const groups = Object.fromEntries(Object.values(CLUSTERS).filter((v, i, a) => a.indexOf(v) === i).map((name) => [
  name,
  sites.filter((s) => s.cluster === name).map((s) => s.address),
]));

console.log(JSON.stringify({
  iyBase: hex(0xD00080),
  targetByte: hex(0xD0009D),
  groups,
  sites,
}, null, 2));
