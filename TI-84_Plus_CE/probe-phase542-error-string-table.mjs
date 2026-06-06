import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const knownStrings = [
    { code: 0x84, name: 'DOMAIN', addr: 0x06244E },
    { code: 0x88, name: 'SYNTAX', addr: 0x06256F },
    { code: 0x8C, name: 'INVALID DIMENSION', addr: 0x0626F9 },
    { code: 0x8D, name: 'UNDEFINED', addr: 0x06278D },
    { code: 0x8E, name: 'MEMORY', addr: 0x0627C2 },
    { code: 0x8F, name: 'INVALID', addr: 0x06282E },
    { code: 0x93, name: 'WINDOW RANGE', addr: 0x062909 },
    { code: 0x94, name: 'ZOOM', addr: 0x06296B },
];

const sdkErrorCodes = new Map([
    [0x81, 'E_OVERFLOW'],
    [0x82, 'E_DIVBY0'],
    [0x83, 'E_SINGULAR_MAT'],
    [0x84, 'E_DOMAIN'],
    [0x85, 'E_INCREMENT'],
    [0x86, 'E_BREAK'],
    [0x87, 'E_NONREAL'],
    [0x88, 'E_SYNTAX'],
    [0x89, 'E_DATATYPE'],
    [0x8A, 'E_ARGUMENT'],
    [0x8B, 'E_DIMMISMATCH'],
    [0x8C, 'E_DIMENSION'],
    [0x8D, 'E_UNDEFINED'],
    [0x8E, 'E_MEMORY'],
    [0x8F, 'E_INVALID'],
    [0x91, 'E_ILLEGALNEST'],
    [0x92, 'E_BOUND'],
    [0x93, 'E_GRAPHRANGE'],
    [0x94, 'E_ZOOM'],
    [0x96, 'E_LABEL'],
    [0x97, 'E_STAT'],
]);

function hex(value, width = 6) {
    return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(offset) {
    if (offset < 0 || offset + 2 >= rom.length) return undefined;
    return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function pointerBytes(addr) {
    return [addr & 0xFF, (addr >> 8) & 0xFF, (addr >> 16) & 0xFF];
}

function findByteSequence(bytes) {
    const hits = [];
    for (let i = 0; i <= rom.length - bytes.length; i++) {
        let matches = true;
        for (let j = 0; j < bytes.length; j++) {
            if (rom[i + j] !== bytes[j]) {
                matches = false;
                break;
            }
        }
        if (matches) hits.push(i);
    }
    return hits;
}

function stringNameForAddress(addr) {
    return knownStrings.find((s) => s.addr === addr)?.name;
}

function scorePointerTable(start, entries = 48) {
    let hits = 0;
    const matched = [];
    for (let i = 0; i < entries; i++) {
        const ptr = read24(start + i * 3);
        const name = stringNameForAddress(ptr);
        if (name) {
            hits++;
            matched.push({ index: i, ptr, name });
        }
    }
    return { start, entries, hits, matched };
}

function printCandidateTable(candidate, entries = 44, baseCode = 0x81) {
    console.log(`\nCandidate table at ${hex(candidate.start)} (${candidate.hits} known pointers in first ${candidate.entries} entries)`);
    for (let i = 0; i < entries; i++) {
        const off = candidate.start + i * 3;
        const ptr = read24(off);
        const code = baseCode + i;
        const knownName = stringNameForAddress(ptr);
        const sdkName = sdkErrorCodes.get(code) ?? '';
        const marker = knownName ? ` <= ${knownName}` : '';
        const codeLabel = sdkName ? `${hex(code, 2)} ${sdkName}` : hex(code, 2);
        console.log(`  [${i.toString().padStart(2, ' ')}] ${hex(off)}: ${hex(ptr)}  code ${codeLabel}${marker}`);
    }
}

console.log('=== Searching for error string pointer table ===');
const individualHits = new Map();
for (const s of knownStrings) {
    const hits = findByteSequence(pointerBytes(s.addr));
    individualHits.set(s.addr, hits);
    for (const hit of hits) {
        if (hit < 0x060000 || hit > 0x065000) {
            console.log(`  Found pointer to ${s.name} (${hex(s.addr)}) at ROM offset ${hex(hit)}`);
        }
    }
}

console.log('\n=== Searching for consecutive known pointer runs ===');
const tableStarts = new Map();
for (const s of knownStrings) {
    for (const hit of individualHits.get(s.addr) ?? []) {
        for (let index = 0; index < 44; index++) {
            const start = hit - index * 3;
            if (start >= 0 && start + 44 * 3 <= rom.length) {
                const scored = scorePointerTable(start, 44);
                if (scored.hits >= 3) tableStarts.set(start, scored);
            }
        }
    }
}

const candidates = [...tableStarts.values()].sort((a, b) => b.hits - a.hits || a.start - b.start);
if (candidates.length === 0) {
    console.log('  No 44-entry 24-bit pointer table candidates with 3+ known string pointers found.');
} else {
    for (const candidate of candidates.slice(0, 12)) {
        const matches = candidate.matched
            .map((m) => `[${m.index}] ${m.name}->${hex(m.ptr)}`)
            .join(', ');
        console.log(`  ${hex(candidate.start)}: ${candidate.hits} hits (${matches})`);
    }
}

console.log('\n=== Searching 0x03EA5E-0x03ECFE for known pointers and offsets ===');
const displayStart = 0x03EA5E;
const displayEnd = 0x03ECFE;
for (const s of knownStrings) {
    const bytes = pointerBytes(s.addr);
    for (let i = displayStart; i <= displayEnd - 2; i++) {
        if (rom[i] === bytes[0] && rom[i + 1] === bytes[1] && rom[i + 2] === bytes[2]) {
            console.log(`  Direct pointer to ${s.name} at ${hex(i)}`);
        }
    }

    const offsetFromEf50 = s.addr - 0x06EF50;
    const offsetFromStringBase = s.addr - 0x06244E;
    const offsetBytes = [
        offsetFromEf50 & 0xFF,
        offsetFromStringBase & 0xFF,
        (offsetFromStringBase >> 8) & 0xFF,
    ];
    for (const byte of offsetBytes) {
        for (let i = displayStart; i <= displayEnd; i++) {
            if (rom[i] === byte) {
                console.log(`  Byte offset candidate for ${s.name} (${hex(byte, 2)}) at ${hex(i)}`);
            }
        }
    }
}

console.log('\n=== Decoding 0x08356A (error offset calc) ===');
let pc = 0x08356A;
for (let i = 0; i < 30 && pc < rom.length; i++) {
    const instr = decodeInstruction(rom, pc, 'adl');
    if (!instr) {
        console.log(`  ${hex(pc)}: ???`);
        pc++;
        continue;
    }
    console.log(`  ${hex(pc)}: ${instr.asm}`);
    pc += instr.length;
    if (instr.asm === 'RET') break;
}

console.log('\n=== Error-code mapping hypotheses ===');
if (candidates.length > 0) {
    const best = candidates[0];
    printCandidateTable(best, 44, 0x81);

    console.log('\nKnown SDK codes in best candidate using code-base 0x81:');
    for (const s of knownStrings) {
        const index = s.code - 0x81;
        const ptr = read24(best.start + index * 3);
        const verdict = ptr === s.addr ? 'MATCH' : 'mismatch';
        console.log(`  ${hex(s.code, 2)} ${sdkErrorCodes.get(s.code)} index ${index}: table=${hex(ptr)} expected=${hex(s.addr)} ${verdict}`);
    }

    console.log('\nKnown SDK codes if SUB 0x0F is the immediate index conversion:');
    for (const s of knownStrings) {
        const index = s.code - 0x0F;
        const off = best.start + index * 3;
        const ptr = read24(off);
        const ptrText = ptr === undefined ? 'out of range' : hex(ptr);
        const verdict = ptr === s.addr ? 'MATCH' : 'mismatch';
        console.log(`  ${hex(s.code, 2)} ${sdkErrorCodes.get(s.code)} index ${index}: table@${hex(off)}=${ptrText} expected=${hex(s.addr)} ${verdict}`);
    }
}
