#!/usr/bin/env node
/**
 * probe-phase565-decode-055191.mjs
 * Thorough re-decode of BPP sub-helper cluster:
 *   0x055191 = gate (BIT 1 D000C6, CALL Z 0x05519F) — claimed 14B
 *   0x05519F = BPP init (SET 1 D000C6, inits D005EC-D02FD9) — claimed 95B
 * Verify boundaries, decode full bodies, identify ROM LDIR source, RAM refs.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

process.emitWarning = () => {}
const { decodeInstruction } = await import('./ez80-decoder.js')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'))
const MODE = 'adl'

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
    case 'ret-conditional': return `RET ${String(i.condition).toUpperCase()}`
    case 'push': return `PUSH ${String(i.pair).toUpperCase()}`
    case 'pop': return `POP ${String(i.pair).toUpperCase()}`
    case 'ld-pair-imm': return `LD ${String(i.pair).toUpperCase()},${hex(i.value)}`
    case 'ld-reg-imm': return `LD ${String(i.dest).toUpperCase()},${hex(i.value, 2)}`
    case 'ld-pair-mem': return i.direction === 'to-mem'
      ? `LD (${hex(i.addr)}),${String(i.pair).toUpperCase()}`
      : `LD ${String(i.pair).toUpperCase()},(${hex(i.addr)})`
    case 'ld-mem-pair': return `LD (${hex(i.addr)}),${String(i.pair).toUpperCase()}`
    case 'ld-reg-reg': return `LD ${String(i.dest).toUpperCase()},${String(i.src).toUpperCase()}`
    case 'ld-reg-ind': return `LD ${String(i.dest).toUpperCase()},(${String(i.src).toUpperCase()})`
    case 'ld-ind-reg': return `LD (${String(i.dest).toUpperCase()}),${String(i.src).toUpperCase()}`
    case 'ld-reg-ixd': return `LD ${String(i.dest).toUpperCase()},${idx(i.indexRegister, i.displacement)}`
    case 'ld-ixd-reg': return `LD ${idx(i.indexRegister, i.displacement)},${String(i.src).toUpperCase()}`
    case 'ld-pair-indexed': return `LD ${String(i.pair).toUpperCase()},${idx(i.indexRegister, i.displacement)}`
    case 'ld-sp-pair': return `LD SP,${String(i.pair).toUpperCase()}`
    case 'ld-a-mem': return `LD A,(${hex(i.addr)})`
    case 'ld-mem-a': return `LD (${hex(i.addr)}),A`
    case 'alu-reg': return `${String(i.op).toUpperCase()} ${String(i.src).toUpperCase()}`
    case 'alu-imm': return `${String(i.op).toUpperCase()} ${hex(i.value, 2)}`
    case 'add-pair': return `ADD ${String(i.dest).toUpperCase()},${String(i.src).toUpperCase()}`
    case 'sbc-pair': return `SBC HL,${String(i.src).toUpperCase()}`
    case 'adc-pair': return `ADC HL,${String(i.src).toUpperCase()}`
    case 'inc-pair': return `INC ${String(i.pair).toUpperCase()}`
    case 'dec-pair': return `DEC ${String(i.pair).toUpperCase()}`
    case 'inc-reg': return `INC ${String(i.dest).toUpperCase()}`
    case 'dec-reg': return `DEC ${String(i.dest).toUpperCase()}`
    case 'bit-reg': return `BIT ${i.bit},${String(i.src).toUpperCase()}`
    case 'set-reg': return `SET ${i.bit},${String(i.dest).toUpperCase()}`
    case 'res-reg': return `RES ${i.bit},${String(i.dest).toUpperCase()}`
    case 'bit-mem': return `BIT ${i.bit},(HL)`
    case 'set-mem': return `SET ${i.bit},(HL)`
    case 'res-mem': return `RES ${i.bit},(HL)`
    case 'indexed-cb-bit': return `BIT ${i.bit},${idx(i.indexRegister, i.displacement)}`
    case 'indexed-cb-set': return `SET ${i.bit},${idx(i.indexRegister, i.displacement)}`
    case 'indexed-cb-res': return `RES ${i.bit},${idx(i.indexRegister, i.displacement)}`
    case 'ldir': return 'LDIR'
    case 'ldi': return 'LDI'
    case 'lddr': return 'LDDR'
    case 'ldd': return 'LDD'
    case 'di': return 'DI'
    case 'ei': return 'EI'
    case 'ex-af': return "EX AF,AF'"
    case 'exx': return 'EXX'
    case 'ex-sp-pair': return `EX (SP),${String(i.pair).toUpperCase()}`
    case 'nop': return 'NOP'
    case 'halt': return 'HALT'
    case 'rst': return `RST ${hex(i.target, 2)}`
    case 'djnz': return `DJNZ ${hex(i.target)}`
    case 'db': return `DB ${hex(i.value, 2)}`
    case 'rlca': return 'RLCA'
    case 'rrca': return 'RRCA'
    case 'rla': return 'RLA'
    case 'rra': return 'RRA'
    case 'cpl': return 'CPL'
    case 'scf': return 'SCF'
    case 'ccf': return 'CCF'
    case 'daa': return 'DAA'
    case 'neg': return 'NEG'
    case 'im': return `IM ${i.mode}`
    case 'out-port-a': return `OUT (${hex(i.port, 2)}),A`
    case 'in-a-port': return `IN A,(${hex(i.port, 2)})`
    case 'out-c-reg': return `OUT (C),${String(i.src).toUpperCase()}`
    case 'in-reg-c': return `IN ${String(i.dest).toUpperCase()},(C)`
    case 'reti': return 'RETI'
    case 'retn': return 'RETN'
    default: return `${i.tag} ${JSON.stringify(i).substring(0, 100)}`
  }
}

// ============================================================
// Section 1: Decode 0x055191 region (300 bytes)
// ============================================================
console.log('=== DISASSEMBLY: 0x055191 region (300 bytes) ===')
const WINDOW = 300
const instructions = []
const ramRefs = []
const callTargets = []
let retCount = 0

for (let pc = 0x055191; pc < 0x055191 + WINDOW;) {
  const inst = safe(pc)
  instructions.push(inst)
  const line = `${hex(pc)}  ${raw(pc, inst.length).padEnd(18)} ${fmt(inst)}`
  console.log(line)

  // Track RAM references (D0xxxx..DFxxxx addresses)
  if (inst.addr !== undefined && inst.addr >= 0xD00000 && inst.addr <= 0xDFFFFF) {
    ramRefs.push({ pc: inst.pc, addr: inst.addr, inst: fmt(inst) })
  }
  if (inst.value !== undefined && inst.value >= 0xD00000 && inst.value <= 0xDFFFFF) {
    ramRefs.push({ pc: inst.pc, addr: inst.value, inst: fmt(inst) })
  }
  if (inst.target !== undefined && inst.target >= 0xD00000 && inst.target <= 0xDFFFFF) {
    ramRefs.push({ pc: inst.pc, addr: inst.target, inst: fmt(inst) })
  }

  // Track CALL/JP/JR targets
  if (['call', 'call-conditional', 'jp', 'jp-conditional', 'jr', 'jr-conditional', 'djnz'].includes(inst.tag) && typeof inst.target === 'number') {
    callTargets.push({ from: inst.pc, tag: inst.tag, target: inst.target })
  }

  // Track RET for boundary detection
  if (inst.tag === 'ret' && !inst.condition) {
    retCount++
    console.log(`  ^^^ unconditional RET #${retCount} at ${hex(inst.pc)}`)
  }

  pc = inst.nextPc
}

// ============================================================
// Section 2: Boundary analysis
// ============================================================
console.log('\n=== BOUNDARY ANALYSIS ===')
const rets = instructions.filter(i => i.tag === 'ret' && !i.condition)
for (const r of rets) {
  console.log(`  RET at ${hex(r.pc)} — ${r.pc + r.length - 0x055191} bytes from 0x055191`)
}

// Gate boundary check: claimed 14B = 0x055191..0x05519E
console.log(`\n--- Gate (claimed 14B: 0x055191..0x05519E) ---`)
const gateInsts = instructions.filter(i => i.pc >= 0x055191 && i.pc < 0x05519F)
for (const i of gateInsts) {
  console.log(`  ${hex(i.pc)}  ${raw(i.pc, i.length).padEnd(18)} ${fmt(i)}`)
}
const gateRet = rets.find(r => r.pc >= 0x055191 && r.pc < 0x055200)
if (gateRet) {
  const gateSize = gateRet.pc + gateRet.length - 0x055191
  console.log(`Gate actual size to first RET: ${gateSize}B (ends at ${hex(gateRet.pc + gateRet.length - 1)})`)
}

// Init boundary check: claimed 95B = 0x05519F..0x0551FD
console.log(`\n--- Init (claimed 95B: 0x05519F..0x0551FD) ---`)
const initRet = rets.find(r => r.pc >= 0x05519F)
if (initRet) {
  const initSize = initRet.pc + initRet.length - 0x05519F
  console.log(`Init actual size to first RET after 0x05519F: ${initSize}B (RET at ${hex(initRet.pc)}, ends ${hex(initRet.pc + initRet.length - 1)})`)
}

// ============================================================
// Section 3: RAM references
// ============================================================
console.log('\n=== RAM REFERENCES ===')
const uniqueRam = [...new Set(ramRefs.map(r => r.addr))].sort((a, b) => a - b)
for (const addr of uniqueRam) {
  const refs = ramRefs.filter(r => r.addr === addr)
  console.log(`  ${hex(addr)}: ${refs.length} ref(s)`)
  for (const r of refs) console.log(`    at ${hex(r.pc)}: ${r.inst}`)
}

// ============================================================
// Section 4: CALL/JP/JR targets
// ============================================================
console.log('\n=== CONTROL FLOW TARGETS ===')
for (const t of callTargets) {
  console.log(`  ${hex(t.from)}: ${t.tag.padEnd(16)} -> ${hex(t.target)}`)
}

// ============================================================
// Section 5: LDIR detection
// ============================================================
console.log('\n=== LDIR DETECTION ===')
const ldirs = instructions.filter(i => i.tag === 'ldir')
if (ldirs.length === 0) {
  console.log('  No LDIR in window')
} else {
  for (const l of ldirs) {
    console.log(`  LDIR at ${hex(l.pc)}`)
    // Show preceding instructions to find HL/DE/BC setup
    const before = instructions.filter(i => i.pc < l.pc && i.pc >= l.pc - 40)
    console.log('  Preceding context:')
    for (const b of before) {
      console.log(`    ${hex(b.pc)}  ${raw(b.pc, b.length).padEnd(18)} ${fmt(b)}`)
    }
    // If HL was loaded with a ROM address, show the bytes there
    const hlLoad = before.find(i => i.tag === 'ld-pair-imm' && i.pair === 'hl' && i.value < 0x400000)
    if (hlLoad) {
      const src = hlLoad.value
      console.log(`  ROM source at ${hex(src)}: ${raw(src, 20)}`)
    }
    const deLoad = before.find(i => i.tag === 'ld-pair-imm' && i.pair === 'de')
    if (deLoad) console.log(`  DE destination: ${hex(deLoad.value)}`)
    const bcLoad = before.find(i => i.tag === 'ld-pair-imm' && i.pair === 'bc')
    if (bcLoad) console.log(`  BC count: ${hex(bcLoad.value)} (${bcLoad.value} bytes)`)
  }
}

// ============================================================
// Section 6: BIT/SET/RES on D000C6 check
// ============================================================
console.log('\n=== D000C6 BIT/SET/RES OPERATIONS ===')
// These might be done via LD HL,D000C6 then BIT n,(HL) / SET n,(HL)
// Walk instructions looking for HL loads followed by bit ops
for (let i = 0; i < instructions.length; i++) {
  const inst = instructions[i]
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl' && inst.value === 0xD000C6) {
    console.log(`  ${hex(inst.pc)}: LD HL,0xD000C6`)
    // Show next 5 instructions
    for (let j = i + 1; j < Math.min(i + 6, instructions.length); j++) {
      const next = instructions[j]
      console.log(`    ${hex(next.pc)}  ${raw(next.pc, next.length).padEnd(18)} ${fmt(next)}`)
    }
  }
}

// ============================================================
// Section 7: What follows the init function
// ============================================================
console.log('\n=== POST-INIT REGION ===')
const postStart = initRet ? initRet.pc + initRet.length : 0x0551FE
console.log(`Starting from ${hex(postStart)}:`)
for (let pc = postStart, i = 0; i < 15; i++) {
  const inst = safe(pc)
  console.log(`${hex(pc)}  ${raw(pc, inst.length).padEnd(18)} ${fmt(inst)}`)
  if (inst.tag === 'ret' && !inst.condition) break
  pc = inst.nextPc
}

console.log('\n=== DONE ===')
