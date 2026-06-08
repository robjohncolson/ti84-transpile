#!/usr/bin/env node
// Phase 574: Decode the function at ~0x06F56F that writes font parameters
// D02A65/D02A68. Four known ROM refs:
//   0x06F56F = LD (D02A65),A (write)
//   0x06F58C = LD DE,D02A65 (load address for block copy)
//   0x06F59C = LD DE,D02A68 (load address for block copy)
//   0x09F238 = LD A,(D02A68) (read by graph plotter)
//
// Run: node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase574-decode-06F56F.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The task referenced 0x06F56F but the actual LD (D02A65),A lives at 0x06F6EF.
// Other refs: LD DE,D02A68 at 0x06F71F, LD DE,D02A65 at 0x06F72F.
const TARGET = 0x06f6ef;
const SCAN_START = 0x06f6b0;
const MIN_FORWARD_END = 0x06f740;
const MAX_FUNCTION_BYTES = 192;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;

// ── Load ROM + transpiled blocks ──────────────────────────────────────
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Boot CPU (same factory as golden regression) ──────────────────────
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
});

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

console.log('phase574 decode 0x06F56F font parameter writer');
console.log(`Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

// ── Formatting helpers ────────────────────────────────────────────────
function hex(value, width = 6) {
    if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
    return '0x' + (Number(value) >>> 0).toString(16).padStart(width, '0').toUpperCase();
}

function hexByte(value) {
    return hex(value & 0xff, 2);
}

function byteHex(address, length) {
    const bytes = [];
    for (let i = 0; i < length; i++) {
        bytes.push((romBytes[address + i] ?? 0).toString(16).toUpperCase().padStart(2, '0'));
    }
    return bytes.join(' ');
}

// Format a decoded instruction (tag-based) into human-readable text.
// Adapted from phase202c-classify.mjs formatInstruction.
function formatInstruction(inst) {
    const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
    const t = inst.tag;
    const disp = (d) => (d >= 0 ? `+${d}` : `${d}`);

    let text = t;
    switch (t) {
        case 'nop': text = 'nop'; break;
        case 'halt': text = 'halt'; break;
        case 'di': text = 'di'; break;
        case 'ei': text = 'ei'; break;
        case 'rlca': text = 'rlca'; break;
        case 'rrca': text = 'rrca'; break;
        case 'rla': text = 'rla'; break;
        case 'rra': text = 'rra'; break;
        case 'daa': text = 'daa'; break;
        case 'cpl': text = 'cpl'; break;
        case 'scf': text = 'scf'; break;
        case 'ccf': text = 'ccf'; break;
        case 'exx': text = 'exx'; break;
        case 'ex-af': text = "ex af, af'"; break;
        case 'ex-de-hl': text = 'ex de, hl'; break;
        case 'ex-sp-hl': text = 'ex (sp), hl'; break;
        case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
        case 'neg': text = 'neg'; break;
        case 'retn': text = 'retn'; break;
        case 'reti': text = 'reti'; break;
        case 'rrd': text = 'rrd'; break;
        case 'rld': text = 'rld'; break;
        case 'ldi': text = 'ldi'; break;
        case 'ldd': text = 'ldd'; break;
        case 'ldir': text = 'ldir'; break;
        case 'lddr': text = 'lddr'; break;
        case 'cpi': text = 'cpi'; break;
        case 'cpd': text = 'cpd'; break;
        case 'cpir': text = 'cpir'; break;
        case 'cpdr': text = 'cpdr'; break;
        case 'ini': text = 'ini'; break;
        case 'outi': text = 'outi'; break;
        case 'ind': text = 'ind'; break;
        case 'outd': text = 'outd'; break;
        case 'inir': text = 'inir'; break;
        case 'otir': text = 'otir'; break;
        case 'indr': text = 'indr'; break;
        case 'otdr': text = 'otdr'; break;
        case 'otimr': text = 'otimr'; break;
        case 'slp': text = 'slp'; break;
        case 'stmix': text = 'stmix'; break;
        case 'rsmix': text = 'rsmix'; break;
        case 'ld-mb-a': text = 'ld mb, a'; break;
        case 'ld-a-mb': text = 'ld a, mb'; break;
        case 'ld-sp-hl': text = 'ld sp, hl'; break;
        case 'ld-sp-pair': text = `ld sp, ${inst.pair}`; break;
        case 'im': text = `im ${inst.value}`; break;
        case 'ld-special': text = `ld ${inst.dest}, ${inst.src}`; break;
        case 'push': text = `push ${inst.pair}`; break;
        case 'pop': text = `pop ${inst.pair}`; break;
        case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
        case 'ld-pair-mem': text = `ld ${inst.pair}, (${hex(inst.addr)})`; break;
        case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
        case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
        case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
        case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
        case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
        case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
        case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
        case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
        case 'ld-reg-ixd':
            text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'ld-ixd-reg':
            text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
            break;
        case 'ld-ixd-imm':
            text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${hexByte(inst.value)}`;
            break;
        case 'inc-ixd':
            text = `inc (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'dec-ixd':
            text = `dec (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
        case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
        case 'alu-ixd':
            text = `${inst.op} (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'call': text = `call ${hex(inst.target)}`; break;
        case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
        case 'jp': text = `jp ${hex(inst.target)}`; break;
        case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
        case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
        case 'jr': text = `jr ${hex(inst.target)}`; break;
        case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
        case 'djnz': text = `djnz ${hex(inst.target)}`; break;
        case 'ret': text = 'ret'; break;
        case 'ret-conditional': text = `ret ${inst.condition}`; break;
        case 'rst': text = `rst ${hexByte(inst.target)}`; break;
        case 'inc-pair': text = `inc ${inst.pair}`; break;
        case 'dec-pair': text = `dec ${inst.pair}`; break;
        case 'inc-reg': text = `inc ${inst.reg}`; break;
        case 'dec-reg': text = `dec ${inst.reg}`; break;
        case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
        case 'adc-pair': text = `adc hl, ${inst.src}`; break;
        case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
        case 'mlt': text = `mlt ${inst.reg}`; break;
        case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
        case 'rotate-ind': text = `${inst.op} (hl)`; break;
        case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
        case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
        case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
        case 'bit-res-ind': text = `res ${inst.bit}, (hl)`; break;
        case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
        case 'bit-set-ind': text = `set ${inst.bit}, (hl)`; break;
        case 'indexed-cb-rotate':
            text = `${inst.operation} (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'indexed-cb-bit':
            text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'indexed-cb-res':
            text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'indexed-cb-set':
            text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'out-imm': text = `out (${hexByte(inst.port)}), a`; break;
        case 'in-imm': text = `in a, (${hexByte(inst.port)})`; break;
        case 'out-reg': text = `out (c), ${inst.reg}`; break;
        case 'in-reg': text = `in ${inst.reg}, (c)`; break;
        case 'in0': text = `in0 ${inst.reg}, (${hexByte(inst.port)})`; break;
        case 'out0': text = `out0 (${hexByte(inst.port)}), ${inst.reg}`; break;
        case 'tst-reg': text = `tst a, ${inst.reg}`; break;
        case 'tst-ind': text = 'tst a, (hl)'; break;
        case 'tst-imm': text = `tst a, ${hexByte(inst.value)}`; break;
        case 'tstio': text = `tstio ${hexByte(inst.value)}`; break;
        case 'lea':
            text = `lea ${inst.dest}, ${inst.base}${disp(inst.displacement)}`;
            break;
        case 'ld-pair-indexed':
            text = `ld ${inst.pair}, (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'ld-indexed-pair':
            text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.pair}`;
            break;
        case 'ld-ixiy-indexed':
            text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`;
            break;
        case 'ld-indexed-ixiy':
            text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`;
            break;
        case 'ld-pair-ind': text = `ld ${inst.pair}, (${inst.src})`; break;
        case 'ld-ind-pair': text = `ld (${inst.dest}), ${inst.pair}`; break;
        default: text = t; break;
    }
    return `${prefix}${text}`;
}

// Decode one instruction, returning { address, text, length, tag, inst }
function safeDecode(address) {
    try {
        const inst = decodeInstruction(romBytes, address, 'adl');
        const text = formatInstruction(inst);
        return { address, text, length: inst.length, tag: inst.tag, inst };
    } catch (error) {
        return {
            address,
            text: `DB ${(romBytes[address] ?? 0).toString(16).toUpperCase().padStart(2, '0')}h`,
            length: 1,
            tag: 'db',
            inst: null,
            error,
        };
    }
}

// Extract mnemonic from tag for classification
function getMnemonic(tag) {
    if (!tag) return 'DB';
    if (tag.startsWith('ld-')) return 'LD';
    if (tag.startsWith('call')) return 'CALL';
    if (tag.startsWith('jp')) return 'JP';
    if (tag.startsWith('jr')) return 'JR';
    if (tag.startsWith('ret')) return 'RET';
    if (tag.startsWith('alu-')) return 'ALU';
    if (tag === 'ldir') return 'LDIR';
    if (tag === 'ldi') return 'LDI';
    if (tag === 'djnz') return 'DJNZ';
    if (tag.startsWith('push')) return 'PUSH';
    if (tag.startsWith('pop')) return 'POP';
    if (tag.startsWith('inc')) return 'INC';
    if (tag.startsWith('dec')) return 'DEC';
    if (tag.startsWith('bit-test')) return 'BIT';
    if (tag.startsWith('bit-set')) return 'SET';
    if (tag.startsWith('bit-res')) return 'RES';
    return tag.toUpperCase();
}

function isFunctionTerminator(decoded) {
    const tag = decoded.tag;
    if (!tag) return false;
    if (tag === 'ret' || tag === 'retn' || tag === 'reti') return true;
    if (tag === 'jp') return true;  // unconditional JP to absolute = tail call / end
    return false;
}

function isReturn(decoded) {
    const tag = decoded.tag;
    return tag === 'ret' || tag === 'retn' || tag === 'reti';
}

// Extract RAM addresses from a decoded instruction
function extractRamAccesses(decoded) {
    const inst = decoded.inst;
    if (!inst) return [];
    const tag = inst.tag;
    const accesses = [];

    // Check for absolute addresses in addr/target fields
    if (inst.addr !== undefined && inst.addr >= 0xC00000) {
        let mode = 'reference';
        if (tag === 'ld-mem-reg' || tag === 'ld-mem-pair') mode = 'write';
        else if (tag === 'ld-reg-mem' || tag === 'ld-pair-mem') mode = 'read';
        accesses.push({ address: inst.addr, mode, text: decoded.text });
    }

    if (tag === 'ld-pair-imm' && inst.value >= 0xC00000) {
        accesses.push({ address: inst.value, mode: 'load-addr', text: decoded.text });
    }

    return accesses;
}

// Extract CALL/JP target from decoded instruction
function getControlTarget(decoded) {
    const inst = decoded.inst;
    if (!inst) return null;
    const tag = inst.tag;
    if (tag === 'call' || tag === 'call-conditional' || tag === 'jp' || tag === 'jp-conditional') {
        return inst.target;
    }
    return null;
}

// ── Analysis ──────────────────────────────────────────────────────────
function findFunctionEntry() {
    let address = SCAN_START;
    let entry = SCAN_START;
    let lastTerminator = null;
    const scanned = [];

    while (address < TARGET) {
        const decoded = safeDecode(address);
        scanned.push(decoded);
        const next = address + decoded.length;
        if (isFunctionTerminator(decoded) && next <= TARGET) {
            lastTerminator = decoded;
            entry = next;
        }
        address = next;
    }

    return { entry, lastTerminator, scanned };
}

function disassembleFunction(entry) {
    const instructions = [];
    let address = entry;
    const maxEnd = entry + MAX_FUNCTION_BYTES;

    while (address < maxEnd && address < romBytes.length) {
        const decoded = safeDecode(address);
        instructions.push(decoded);
        address += decoded.length;
        if (address >= MIN_FORWARD_END && isReturn(decoded)) break;
    }

    return instructions;
}

function readLe24(address) {
    return (romBytes[address] ?? 0) | ((romBytes[address + 1] ?? 0) << 8) | ((romBytes[address + 2] ?? 0) << 16);
}

function findRomCallers(target) {
    const callers = [];
    for (let address = 0; address < romBytes.length - 3; address++) {
        if (romBytes[address] === 0xcd && readLe24(address + 1) === target) {
            callers.push(address);
        }
    }
    return callers;
}

function analyzeInstructions(instructions) {
    const memory = [];
    const controlTargets = [];
    const ldirs = [];
    const registerState = new Map();
    let lastAWrite = null;

    for (const decoded of instructions) {
        // RAM accesses
        const accesses = extractRamAccesses(decoded);
        for (const acc of accesses) {
            memory.push({ ...acc, at: decoded.address });
        }

        // Control flow targets
        const target = getControlTarget(decoded);
        if (target !== null) {
            controlTargets.push({ at: decoded.address, mnemonic: getMnemonic(decoded.tag), target, text: decoded.text });
        }

        // Track register loads for LDIR context
        const inst = decoded.inst;
        if (inst) {
            const tag = inst.tag;
            if (tag === 'ld-pair-imm') {
                registerState.set(inst.pair.toUpperCase(), { at: decoded.address, value: hex(inst.value), text: decoded.text });
            }
            if (tag === 'ld-reg-mem' && inst.dest === 'a' && decoded.address < TARGET) {
                lastAWrite = { at: decoded.address, text: decoded.text };
            }
            if (tag === 'ld-reg-imm' && inst.dest === 'a' && decoded.address < TARGET) {
                lastAWrite = { at: decoded.address, text: decoded.text };
            }
            if (tag === 'ld-mem-reg' && inst.src === 'a' && decoded.address < TARGET) {
                // A is being stored, but its value was set earlier
            }
            if (tag === 'alu-imm' || tag === 'alu-reg') {
                if (decoded.address < TARGET) {
                    lastAWrite = { at: decoded.address, text: decoded.text };
                }
            }
            if (tag === 'ldir') {
                ldirs.push({
                    at: decoded.address,
                    hl: registerState.get('HL') ?? null,
                    de: registerState.get('DE') ?? null,
                    bc: registerState.get('BC') ?? null,
                });
            }
        }
    }

    return { memory, controlTargets, ldirs, lastAWrite };
}

// ── Run ───────────────────────────────────────────────────────────────
const { entry, lastTerminator, scanned } = findFunctionEntry();
const instructions = disassembleFunction(entry);
const analysis = analyzeInstructions(instructions);
const callers = findRomCallers(entry);

console.log(`Backward scan: ${hex(SCAN_START)}..${hex(TARGET)}`);
if (lastTerminator) {
    console.log(`Previous terminator: ${hex(lastTerminator.address)} ${lastTerminator.text}`);
} else {
    console.log('Previous terminator: not found in scan range');
}
console.log(`Function entry candidate: ${hex(entry)}`);
console.log('');

console.log('Backward scan disassembly:');
for (const decoded of scanned) {
    const marker = decoded.address === entry ? '<entry>' : decoded.address === TARGET ? '<target>' : '';
    console.log(`${hex(decoded.address)}  ${byteHex(decoded.address, decoded.length).padEnd(14)}  ${decoded.text.padEnd(30)} ${marker}`);
}
console.log('');

console.log('Function disassembly:');
for (const decoded of instructions) {
    const marker = decoded.address === entry ? '<entry>' : decoded.address === TARGET ? '<D02A65 write>' : '';
    console.log(`${hex(decoded.address)}  ${byteHex(decoded.address, decoded.length).padEnd(14)}  ${decoded.text.padEnd(30)} ${marker}`);
}
console.log('');

console.log('RAM reads/writes/references:');
if (analysis.memory.length === 0) {
    console.log('  none found');
} else {
    for (const access of analysis.memory) {
        const d02a = access.address >= 0xd02a00 && access.address <= 0xd02aff ? ' D02Axx' : '';
        console.log(`  ${hex(access.at)} ${access.mode.padEnd(9)} ${hex(access.address)}${d02a} via ${access.text}`);
    }
}
console.log('');

console.log('CALL/JP targets:');
if (analysis.controlTargets.length === 0) {
    console.log('  none found');
} else {
    for (const ct of analysis.controlTargets) {
        console.log(`  ${hex(ct.at)} ${ct.mnemonic.padEnd(6)} -> ${hex(ct.target)} via ${ct.text}`);
    }
}
console.log('');

console.log('LDIR block copies:');
if (analysis.ldirs.length === 0) {
    console.log('  none found');
} else {
    for (const ldir of analysis.ldirs) {
        const hl = ldir.hl ? `${ldir.hl.value} set at ${hex(ldir.hl.at)} (${ldir.hl.text})` : 'unknown';
        const de = ldir.de ? `${ldir.de.value} set at ${hex(ldir.de.at)} (${ldir.de.text})` : 'unknown';
        const bc = ldir.bc ? `${ldir.bc.value} set at ${hex(ldir.bc.at)} (${ldir.bc.text})` : 'unknown';
        console.log(`  ${hex(ldir.at)} LDIR`);
        console.log(`    HL/source: ${hl}`);
        console.log(`    DE/dest:   ${de}`);
        console.log(`    BC/count:  ${bc}`);
    }
}
console.log('');

console.log(`${hex(TARGET)} LD (D02A65),A provenance:`);
if (analysis.lastAWrite) {
    console.log(`  Last visible A assignment before target: ${hex(analysis.lastAWrite.at)} ${analysis.lastAWrite.text}`);
} else {
    console.log('  No visible A assignment found between entry and target');
}
console.log('');

console.log(`ROM CALL sites targeting entry ${hex(entry)}:`);
if (callers.length === 0) {
    console.log('  none found with opcode CD + 24-bit target scan');
} else {
    for (const caller of callers) {
        console.log(`  ${hex(caller)}  ${byteHex(caller, 4)}`);
    }
}
