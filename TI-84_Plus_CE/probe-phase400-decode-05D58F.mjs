#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.emitWarning = () => {}
const { decodeInstruction } = await import('./ez80-decoder.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'))
const START = 0x05D58F, WINDOW = 0xC8, LIMIT = 5, MODE = 'adl'
const SKIP = new Set([0x0000A4, 0x000130, 0x000138, 0x05D5BD])
const hex = (v, w = 6) => `0x${(v >>> 0).toString(16).toUpperCase().padStart(w, '0')}`
const raw = (pc, len) => Array.from(rom.subarray(pc, pc + len), b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
const idx = (r, d) => `(${String(r).toUpperCase()}${d < 0 ? '-' : '+'}${hex(Math.abs(d), 2)})`

function safe(pc) {
  try { return decodeInstruction(rom, pc, MODE) }
  catch { return { pc, length: 1, nextPc: pc + 1, tag: 'db', value: rom[pc] ?? 0 } }
}

function fmt(i) {
  switch (i.tag) {
    case 'call': return `CALL ${hex(i.target)}`
    case 'call-conditional': return `CALL ${String(i.condition).toUpperCase()},${hex(i.target)}`
    case 'jp': return `JP ${hex(i.target)}`
    case 'jp-conditional': return `JP ${String(i.condition).toUpperCase()},${hex(i.target)}`
    case 'jr': return `JR ${hex(i.target)}`
    case 'jr-conditional': return `JR ${String(i.condition).toUpperCase()},${hex(i.target)}`
    case 'ret': return 'RET'
    case 'push': return `PUSH ${String(i.pair).toUpperCase()}`
    case 'pop': return `POP ${String(i.pair).toUpperCase()}`
    case 'ld-pair-imm': return `LD ${String(i.pair).toUpperCase()},${hex(i.value)}`
    case 'ld-reg-imm': return `LD ${String(i.dest).toUpperCase()},${hex(i.value, 2)}`
    case 'ld-pair-mem': return i.direction === 'to-mem' ? `LD (${hex(i.addr)}),${String(i.pair).toUpperCase()}` : `LD ${String(i.pair).toUpperCase()},(${hex(i.addr)})`
    case 'ld-mem-pair': return `LD (${hex(i.addr)}),${String(i.pair).toUpperCase()}`
    case 'ld-reg-reg': return `LD ${String(i.dest).toUpperCase()},${String(i.src).toUpperCase()}`
    case 'ld-reg-ind': return `LD ${String(i.dest).toUpperCase()},(${String(i.src).toUpperCase()})`
    case 'ld-ind-reg': return `LD (${String(i.dest).toUpperCase()}),${String(i.src).toUpperCase()}`
    case 'ld-reg-ixd': return `LD ${String(i.dest).toUpperCase()},${idx(i.indexRegister, i.displacement)}`
    case 'ld-pair-indexed': return `LD ${String(i.pair).toUpperCase()},${idx(i.indexRegister, i.displacement)}`
    case 'ld-sp-pair': return `LD SP,${String(i.pair).toUpperCase()}`
    case 'alu-reg': return `${String(i.op).toUpperCase()} ${String(i.src).toUpperCase()}`
    case 'alu-imm': return `${String(i.op).toUpperCase()} ${hex(i.value, 2)}`
    case 'add-pair': return `ADD ${String(i.dest).toUpperCase()},${String(i.src).toUpperCase()}`
    case 'sbc-pair': return `SBC HL,${String(i.src).toUpperCase()}`
    case 'indexed-cb-bit': return `BIT ${i.bit},${idx(i.indexRegister, i.displacement)}`
    case 'indexed-cb-set': return `SET ${i.bit},${idx(i.indexRegister, i.displacement)}`
    case 'indexed-cb-res': return `RES ${i.bit},${idx(i.indexRegister, i.displacement)}`
    case 'nop': return 'NOP'
    case 'db': return `DB ${hex(i.value, 2)}`
    default: return i.tag
  }
}

function preview(addr, count = 4) {
  const out = []
  for (let pc = addr, i = 0; i < count && pc < rom.length; i++) {
    const inst = safe(pc)
    out.push(`  ${hex(pc)}  ${raw(pc, inst.length).padEnd(14)} ${fmt(inst)}`)
    pc = inst.nextPc
  }
  return out
}

const list = [], targets = [], seen = new Set()
for (let pc = START; pc < START + WINDOW;) {
  const inst = safe(pc)
  list.push(inst)
  console.log(`${hex(pc)}  ${raw(pc, inst.length).padEnd(14)} ${fmt(inst)}`)
  if (typeof inst.target === 'number' && ['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional', 'djnz'].includes(inst.tag) && inst.target < rom.length && !seen.has(inst.target)) {
    seen.add(inst.target)
    targets.push({ from: pc, tag: inst.tag, target: inst.target })
  }
  pc = inst.nextPc
}

const cpCount = list.filter(i => (i.tag === 'alu-reg' || i.tag === 'alu-imm') && i.op === 'cp').length
const condCount = list.filter(i => /conditional/.test(i.tag) || i.tag === 'djnz').length
const callCount = list.filter(i => i.tag === 'call' || i.tag === 'call-conditional').length
const hasIndirect = list.some(i => i.tag === 'jp-indirect')
const tableLike = list.some(i => i.tag === 'ld-reg-ixd' && i.dest === 'a' && i.indexRegister === 'ix' && i.displacement === 6)
  && list.filter(i => i.tag === 'add-pair' && i.dest === 'hl' && i.src === 'hl').length >= 2
  && list.some(i => i.tag === 'ld-pair-mem' && i.pair === 'bc' && i.addr === 0xD1441D)
  && list.some(i => i.tag === 'call' && i.target === 0x0000A4)
const kind = hasIndirect ? 'jump-table/indirect-jump dispatch' : cpCount && condCount ? 'comparison cascade' : tableLike ? 'table-backed sub-dispatch' : 'call-heavy helper chain'
const firstRet = list.find(i => i.tag === 'ret')?.pc
const likely = targets.filter(t => t.target >= 0x200 && !SKIP.has(t.target)).slice(0, LIMIT)

console.log('\n=== First Raw Control Targets ===')
for (const t of targets.slice(0, LIMIT)) {
  console.log(`${hex(t.target)} from ${hex(t.from)} via ${t.tag}`)
  console.log(preview(t.target, 3).join('\n'))
}

console.log('\n=== First Likely Handler Targets ===')
for (const t of likely) {
  console.log(`${hex(t.target)} from ${hex(t.from)} via ${t.tag}`)
  console.log(preview(t.target).join('\n'))
}

console.log('\n=== Summary ===')
console.log(`Classification: ${kind}`)
console.log(`Window: ${hex(START)}..${hex(START + WINDOW - 1)} (${WINDOW} bytes)`)
console.log(`Entry stub first RET: ${firstRet ? hex(firstRet) : 'not found in window'}`)
console.log(`Calls: ${callCount}, conditional branches: ${condCount}, CP instructions: ${cpCount}, indirect JP: ${hasIndirect ? 'yes' : 'no'}`)
console.log(`Computed-table pattern: ${tableLike ? `yes; handler = [0xD1441D] + 4*(IX+6), then CALL 0x0000A4 with BC from (IX+9)` : 'no'}`)
console.log('Verdict: no CP/JP-Z ladder and no JP (HL) jump table appear in the first 0xC8 bytes.')
console.log('The entry at 0x05D58F looks like a small wrapper that computes an indirect handler slot, while the adjacent bytes at 0x05D5D8+ are a call-heavy helper chain with flag-based branches into other routines.')
