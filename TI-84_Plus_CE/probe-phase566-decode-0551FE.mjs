#!/usr/bin/env node
/**
 * probe-phase566-decode-0551FE.mjs
 * Disassemble and document THREE adjacent BPP display cluster functions:
 *   0x0551FE (63B) -- VRAM fill: fills D40000 with 0xFF (153598B), tests/resets bit 2 D000C6
 *   0x05523D (67B) -- BPP mode activate: fills VRAM, copies 512B ROM palette 0x055777->E30200, sets bit 2 D000C6
 *   0x05529B (23B) -- BPP framebuffer restore: copies 76800B D52C00->D40000
 *
 * Known constants:
 *   D40000 = VRAM base
 *   D52C00 = back buffer
 *   76800  = 320x240 bytes (8bpp frame)
 *   153600 = 320x240x2 (16bpp frame)
 *   E30200 = palette registers
 *   D000C6 bit 2 = BPP mode flag
 *   0x055777 = 512B ROM palette data
 *   0x055280 (27B) = LCD DMA trigger (decoded session 556)
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
    case 'ld-ixd-imm': return `LD ${idx(i.indexRegister, i.displacement)},${hex(i.value, 2)}`
    case 'ld-ind-imm': return `LD (HL),${hex(i.value, 2)}`
    case 'ld-pair-indexed': return `LD ${String(i.pair).toUpperCase()},${idx(i.indexRegister, i.displacement)}`
    case 'ld-sp-pair': return `LD SP,${String(i.pair).toUpperCase()}`
    case 'ld-reg-mem': return `LD ${String(i.dest).toUpperCase()},(${hex(i.addr)})`
    case 'ld-mem-reg': return `LD (${hex(i.addr)}),${String(i.src).toUpperCase()}`
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
    case 'bit-test': return `BIT ${i.bit},${String(i.reg).toUpperCase()}`
    case 'bit-set-ind': return `SET ${i.bit},(HL)`
    case 'bit-test-ind': return `BIT ${i.bit},(HL)`
    case 'lea': return `LEA ${String(i.dest).toUpperCase()},${idx(i.base, i.displacement)}`
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

// Known address annotations
const KNOWN = {
  0xD40000: 'VRAM base',
  0xD40001: 'VRAM base+1 (fill seed)',
  0xD52C00: 'back buffer',
  0xD000C6: 'BPP mode flags',
  0xE30200: 'palette registers',
  0x055777: 'ROM palette data (512B)',
  0x055280: 'LCD DMA trigger (27B)',
}

function annotate(addr) {
  if (KNOWN[addr]) return ` ; ${KNOWN[addr]}`
  if (addr >= 0xE30000 && addr <= 0xE3FFFF) return ' ; LCD MMIO'
  if (addr >= 0xD00000 && addr <= 0xD00FFF) return ' ; OS flags area'
  if (addr >= 0xD40000 && addr <= 0xD65800) return ' ; VRAM region'
  return ''
}

// ============================================================
// Full disassembly: 0x0551FE through ~0x0552B2 (180 bytes)
// ============================================================
const START = 0x0551FE
const WINDOW = 180

console.log(`=== DISASSEMBLY: ${hex(START)} region (${WINDOW} bytes) ===`)
console.log(`=== Covers 3 functions: VRAM fill, BPP activate, framebuffer restore ===\n`)

const instructions = []
const ramRefs = []
const mmioRefs = []
const callTargets = []
let retCount = 0

for (let pc = START; pc < START + WINDOW;) {
  const inst = safe(pc)
  instructions.push(inst)

  // Build annotation from addresses in the instruction
  let ann = ''
  for (const field of ['addr', 'value', 'target']) {
    if (typeof inst[field] === 'number' && inst[field] >= 0x010000) {
      const a = annotate(inst[field])
      if (a) ann = a
    }
  }

  const line = `${hex(pc)}  ${raw(pc, inst.length).padEnd(18)} ${fmt(inst)}${ann}`
  console.log(line)

  // Track RAM references (D0xxxx..DFxxxx)
  for (const field of ['addr', 'value', 'target']) {
    if (typeof inst[field] === 'number' && inst[field] >= 0xD00000 && inst[field] <= 0xDFFFFF) {
      ramRefs.push({ pc: inst.pc, addr: inst[field], inst: fmt(inst) })
    }
  }

  // Track MMIO references (E30xxx)
  for (const field of ['addr', 'value', 'target']) {
    if (typeof inst[field] === 'number' && inst[field] >= 0xE30000 && inst[field] <= 0xE3FFFF) {
      mmioRefs.push({ pc: inst.pc, addr: inst[field], inst: fmt(inst) })
    }
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
// Function boundary analysis
// ============================================================
console.log('\n=== FUNCTION BOUNDARY ANALYSIS ===')

const rets = instructions.filter(i => i.tag === 'ret' && !i.condition)
for (const r of rets) {
  const endAddr = r.pc + r.length
  console.log(`  RET at ${hex(r.pc)} -- function ending at ${hex(endAddr - 1)} (${r.pc + r.length - START} bytes from ${hex(START)})`)
}

// Function 1: 0x0551FE -- VRAM fill (claimed 63B = 0x0551FE..0x05523C)
const FN1_START = 0x0551FE
const FN1_CLAIMED_END = 0x05523D
console.log(`\n--- Function 1: VRAM FILL (claimed 63B: ${hex(FN1_START)}..${hex(FN1_CLAIMED_END - 1)}) ---`)
const fn1Insts = instructions.filter(i => i.pc >= FN1_START && i.pc < FN1_CLAIMED_END)
for (const i of fn1Insts) {
  console.log(`  ${hex(i.pc)}  ${raw(i.pc, i.length).padEnd(18)} ${fmt(i)}`)
}
const fn1Ret = rets.find(r => r.pc >= FN1_START && r.pc < FN1_CLAIMED_END)
if (fn1Ret) {
  const actualSize = fn1Ret.pc + fn1Ret.length - FN1_START
  console.log(`  Actual size: ${actualSize}B (${hex(FN1_START)}..${hex(fn1Ret.pc + fn1Ret.length - 1)})`)
  console.log(`  Claimed: 63B, Actual: ${actualSize}B -- ${actualSize === 63 ? 'MATCH' : 'MISMATCH'}`)
}

// Function 2: 0x05523D -- BPP mode activate (claimed 67B = 0x05523D..0x05527F)
const FN2_START = 0x05523D
const FN2_CLAIMED_END = 0x055280
console.log(`\n--- Function 2: BPP MODE ACTIVATE (claimed 67B: ${hex(FN2_START)}..${hex(FN2_CLAIMED_END - 1)}) ---`)
const fn2Insts = instructions.filter(i => i.pc >= FN2_START && i.pc < FN2_CLAIMED_END)
for (const i of fn2Insts) {
  console.log(`  ${hex(i.pc)}  ${raw(i.pc, i.length).padEnd(18)} ${fmt(i)}`)
}
const fn2Ret = rets.find(r => r.pc >= FN2_START && r.pc < FN2_CLAIMED_END)
if (fn2Ret) {
  const actualSize = fn2Ret.pc + fn2Ret.length - FN2_START
  console.log(`  Actual size: ${actualSize}B (${hex(FN2_START)}..${hex(fn2Ret.pc + fn2Ret.length - 1)})`)
  console.log(`  Claimed: 67B, Actual: ${actualSize}B -- ${actualSize === 67 ? 'MATCH' : 'MISMATCH'}`)
}

// Function 3: 0x05529B -- BPP framebuffer restore (claimed 23B = 0x05529B..0x0552B1)
const FN3_START = 0x05529B
const FN3_CLAIMED_END = 0x0552B2
console.log(`\n--- Function 3: BPP FRAMEBUFFER RESTORE (claimed 23B: ${hex(FN3_START)}..${hex(FN3_CLAIMED_END - 1)}) ---`)
const fn3Insts = instructions.filter(i => i.pc >= FN3_START && i.pc < FN3_CLAIMED_END)
for (const i of fn3Insts) {
  console.log(`  ${hex(i.pc)}  ${raw(i.pc, i.length).padEnd(18)} ${fmt(i)}`)
}
const fn3Ret = rets.find(r => r.pc >= FN3_START && r.pc < FN3_CLAIMED_END)
if (fn3Ret) {
  const actualSize = fn3Ret.pc + fn3Ret.length - FN3_START
  console.log(`  Actual size: ${actualSize}B (${hex(FN3_START)}..${hex(fn3Ret.pc + fn3Ret.length - 1)})`)
  console.log(`  Claimed: 23B, Actual: ${actualSize}B -- ${actualSize === 23 ? 'MATCH' : 'MISMATCH'}`)
}

// ============================================================
// LDIR analysis -- find all LDIR and trace their HL/DE/BC setup
// ============================================================
console.log('\n=== LDIR ANALYSIS ===')
const ldirs = instructions.filter(i => i.tag === 'ldir')
if (ldirs.length === 0) {
  console.log('  No LDIR in window')
} else {
  for (const l of ldirs) {
    // Determine which function this LDIR belongs to
    let fnName = 'unknown'
    if (l.pc >= FN1_START && l.pc < FN2_START) fnName = 'VRAM fill'
    else if (l.pc >= FN2_START && l.pc < FN3_START) fnName = 'BPP activate'
    else if (l.pc >= FN3_START && l.pc < FN3_CLAIMED_END) fnName = 'framebuffer restore'

    console.log(`\n  LDIR at ${hex(l.pc)} [${fnName}]`)

    // Show preceding instructions to find HL/DE/BC setup
    const before = instructions.filter(i => i.pc < l.pc && i.pc >= l.pc - 50)
    console.log('  Preceding register setup:')
    for (const b of before) {
      const m = fmt(b)
      // Only show register loads relevant to LDIR
      if (m.startsWith('LD HL,') || m.startsWith('LD DE,') || m.startsWith('LD BC,') ||
          m.startsWith('LD (HL)') || m.startsWith('LD A,') || m.startsWith('INC ') ||
          m.startsWith('PUSH') || m.startsWith('POP') || m.startsWith('CALL') ||
          m.startsWith('LD (DE)') || m.startsWith('LD (') || m === 'LDIR') {
        console.log(`    ${hex(b.pc)}  ${raw(b.pc, b.length).padEnd(18)} ${m}`)
      }
    }

    // Extract specific register values
    const hlLoad = [...before].reverse().find(i => i.tag === 'ld-pair-imm' && i.pair === 'hl')
    const deLoad = [...before].reverse().find(i => i.tag === 'ld-pair-imm' && i.pair === 'de')
    const bcLoad = [...before].reverse().find(i => i.tag === 'ld-pair-imm' && i.pair === 'bc')

    if (hlLoad) {
      console.log(`  HL (source) = ${hex(hlLoad.value)}${annotate(hlLoad.value)}`)
      // If ROM address, show first 16 bytes
      if (hlLoad.value < 0x400000) {
        console.log(`    ROM data at ${hex(hlLoad.value)}: ${raw(hlLoad.value, 16)}`)
      }
    }
    if (deLoad) console.log(`  DE (dest)   = ${hex(deLoad.value)}${annotate(deLoad.value)}`)
    if (bcLoad) console.log(`  BC (count)  = ${hex(bcLoad.value)} (${bcLoad.value} decimal)`)

    // Interpret the transfer
    if (hlLoad && deLoad && bcLoad) {
      console.log(`  => COPIES ${bcLoad.value} bytes from ${hex(hlLoad.value)} to ${hex(deLoad.value)}`)
    }
  }
}

// ============================================================
// D000C6 bit operations -- BPP mode flag manipulation
// ============================================================
console.log('\n=== D000C6 BIT/SET/RES OPERATIONS (BPP mode flag) ===')
for (let i = 0; i < instructions.length; i++) {
  const inst = instructions[i]
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl' && inst.value === 0xD000C6) {
    // Determine which function
    let fnName = 'unknown'
    if (inst.pc >= FN1_START && inst.pc < FN2_START) fnName = 'VRAM fill'
    else if (inst.pc >= FN2_START && inst.pc < FN3_START) fnName = 'BPP activate'
    else if (inst.pc >= FN3_START && inst.pc < FN3_CLAIMED_END) fnName = 'framebuffer restore'

    console.log(`  [${fnName}] ${hex(inst.pc)}: LD HL,0xD000C6`)
    // Show next several instructions for bit ops
    for (let j = i + 1; j < Math.min(i + 8, instructions.length); j++) {
      const next = instructions[j]
      const m = fmt(next)
      console.log(`    ${hex(next.pc)}  ${raw(next.pc, next.length).padEnd(18)} ${m}`)
      // Stop at RET or another LD HL
      if (next.tag === 'ret' || (next.tag === 'ld-pair-imm' && next.pair === 'hl')) break
    }
  }
}

// ============================================================
// MMIO register writes (E300xx LCD controller)
// ============================================================
console.log('\n=== MMIO REFERENCES (E30xxx LCD controller) ===')
if (mmioRefs.length === 0) {
  console.log('  No direct MMIO references found in addr fields')
}
// Also check for E3xxxx loaded into registers
const e3Loads = instructions.filter(i =>
  (i.tag === 'ld-pair-imm' && typeof i.value === 'number' && i.value >= 0xE30000 && i.value <= 0xE3FFFF)
)
if (e3Loads.length > 0) {
  console.log('  Register loads with MMIO addresses:')
  for (const l of e3Loads) {
    let fnName = 'unknown'
    if (l.pc >= FN1_START && l.pc < FN2_START) fnName = 'fn1:VRAM-fill'
    else if (l.pc >= FN2_START && l.pc < FN3_START) fnName = 'fn2:BPP-activate'
    else if (l.pc >= FN3_START && l.pc < FN3_CLAIMED_END) fnName = 'fn3:fb-restore'
    console.log(`    [${fnName}] ${hex(l.pc)}  ${raw(l.pc, l.length).padEnd(18)} ${fmt(l)}${annotate(l.value)}`)
  }
}
if (mmioRefs.length > 0) {
  console.log('  Direct MMIO references:')
  for (const r of mmioRefs) {
    console.log(`    ${hex(r.pc)}: ${r.inst} ; addr=${hex(r.addr)}`)
  }
}

// ============================================================
// RAM references summary
// ============================================================
console.log('\n=== RAM REFERENCES SUMMARY ===')
const uniqueRam = [...new Set(ramRefs.map(r => r.addr))].sort((a, b) => a - b)
for (const addr of uniqueRam) {
  const refs = ramRefs.filter(r => r.addr === addr)
  console.log(`  ${hex(addr)}${annotate(addr)}: ${refs.length} ref(s)`)
  for (const r of refs) {
    let fnName = 'unknown'
    if (r.pc >= FN1_START && r.pc < FN2_START) fnName = 'fn1:VRAM-fill'
    else if (r.pc >= FN2_START && r.pc < FN3_START) fnName = 'fn2:BPP-activate'
    else if (r.pc >= FN3_START && r.pc < FN3_CLAIMED_END) fnName = 'fn3:fb-restore'
    console.log(`    [${fnName}] at ${hex(r.pc)}: ${r.inst}`)
  }
}

// ============================================================
// Control flow targets summary
// ============================================================
console.log('\n=== CONTROL FLOW TARGETS ===')
for (const t of callTargets) {
  let fnName = 'unknown'
  if (t.from >= FN1_START && t.from < FN2_START) fnName = 'fn1:VRAM-fill'
  else if (t.from >= FN2_START && t.from < FN3_START) fnName = 'fn2:BPP-activate'
  else if (t.from >= FN3_START && t.from < FN3_CLAIMED_END) fnName = 'fn3:fb-restore'
  console.log(`  [${fnName}] ${hex(t.from)}: ${t.tag.padEnd(16)} -> ${hex(t.target)}`)
}

// ============================================================
// Structured summary
// ============================================================
console.log('\n' + '='.repeat(60))
console.log('=== STRUCTURED SUMMARY ===')
console.log('='.repeat(60))

console.log(`
FUNCTION 1: VRAM FILL
  Address:  ${hex(FN1_START)}`)
if (fn1Ret) {
  const sz = fn1Ret.pc + fn1Ret.length - FN1_START
  console.log(`  End:      ${hex(fn1Ret.pc + fn1Ret.length - 1)}
  Size:     ${sz}B (claimed 63B)
  Purpose:  Fills VRAM at D40000 with 0xFF (153598B = 16bpp frame minus 2)
            Tests bit 2 of D000C6 (BPP mode flag)
            Resets bit 2 of D000C6 (exits BPP mode)`)
}

console.log(`
FUNCTION 2: BPP MODE ACTIVATE
  Address:  ${hex(FN2_START)}`)
if (fn2Ret) {
  const sz = fn2Ret.pc + fn2Ret.length - FN2_START
  console.log(`  End:      ${hex(fn2Ret.pc + fn2Ret.length - 1)}
  Size:     ${sz}B (claimed 67B)
  Purpose:  Fills VRAM via CALL to fn1
            Copies 512B palette from ROM 0x055777 to E30200
            Sets bit 2 of D000C6 (enters BPP mode)`)
}

console.log(`
FUNCTION 3: BPP FRAMEBUFFER RESTORE
  Address:  ${hex(FN3_START)}`)
if (fn3Ret) {
  const sz = fn3Ret.pc + fn3Ret.length - FN3_START
  console.log(`  End:      ${hex(fn3Ret.pc + fn3Ret.length - 1)}
  Size:     ${sz}B (claimed 23B)
  Purpose:  Copies 76800B from back buffer D52C00 to VRAM D40000
            (restores 8bpp framebuffer from saved copy)`)
}

// ROM palette data peek
console.log('\n=== ROM PALETTE DATA PEEK (0x055777, first 32 bytes) ===')
console.log(`  ${raw(0x055777, 32)}`)

console.log('\n=== DONE ===')
