import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rom = readFileSync(join(__dirname, 'ROM.rom'));

function hexDump(offset, length) {
    for (let addr = offset; addr < offset + length; addr += 16) {
        const len = Math.min(16, offset + length - addr);
        const bytes = [];
        for (let i = 0; i < len; i++) bytes.push(rom[addr + i].toString(16).padStart(2, '0'));
        console.log('0x' + addr.toString(16).padStart(6, '0') + ': ' + bytes.join(' '));
    }
}

function searchPattern(startAddr, endAddr, pattern, label) {
    const results = [];
    for (let addr = startAddr; addr <= endAddr - pattern.length; addr++) {
        let match = true;
        for (let i = 0; i < pattern.length; i++) {
            if (rom[addr + i] !== pattern[i]) { match = false; break; }
        }
        if (match) results.push(addr);
    }
    console.log('\n=== ' + label + ' ===');
    if (!results.length) console.log('NO MATCHES');
    else { console.log('  ' + results.length + ' matches:'); results.forEach(a => console.log('  0x' + a.toString(16).padStart(6, '0'))); }
    return results;
}

console.log('=== PROBE: Decode 0x026789 + 0x09EF20 ===\n');

console.log('=== HEX DUMP: 0x026789 - 0x0268B0 ===');
hexDump(0x026789, 0x0268B0 - 0x026789);

console.log('\n=== HEX DUMP: 0x09EF20 - 0x09EF90 ===');
hexDump(0x09EF20, 0x09EF90 - 0x09EF20);

searchPattern(0x000000, 0x400000, [0xCD, 0x89, 0x67, 0x02], 'CALL 0x026789 entire ROM');
searchPattern(0x000000, 0x400000, [0xC3, 0x89, 0x67, 0x02], 'JP 0x026789 entire ROM');
searchPattern(0x000000, 0x400000, [0xCD, 0x20, 0xEF, 0x09], 'CALL 0x09EF20 entire ROM');
searchPattern(0x000000, 0x400000, [0x32, 0xC0, 0x2A, 0xD0], 'LD (D02AC0),A entire ROM');
searchPattern(0x000000, 0x400000, [0x22, 0xC0, 0x2A, 0xD0], 'LD (D02AC0),HL entire ROM');
searchPattern(0x000000, 0x400000, [0x3A, 0xC0, 0x2A, 0xD0], 'LD A,(D02AC0) entire ROM');
searchPattern(0x000000, 0x400000, [0xFD, 0xCB, 0x4C, 0xC6], 'SET 0,(IY+0x4C) entire ROM');

console.log('\n=== CALL/JP targets inside 0x026789-0x026880 ===');
for (let addr = 0x026789; addr < 0x026880; addr++) {
    if (rom[addr] === 0xCD || rom[addr] === 0xC3) {
        const target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
        if (target >= 0x000100 && target < 0x400000) {
            const op = rom[addr] === 0xCD ? 'CALL' : 'JP  ';
            console.log('  0x' + addr.toString(16).padStart(6, '0') + ': ' + op + ' 0x' + target.toString(16).padStart(6, '0'));
        }
    }
}

console.log('\n=== CALL/JP targets inside 0x09EF20-0x09EF80 ===');
for (let addr = 0x09EF20; addr < 0x09EF80; addr++) {
    if (rom[addr] === 0xCD || rom[addr] === 0xC3) {
        const target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
        if (target >= 0x000100 && target < 0x400000) {
            const op = rom[addr] === 0xCD ? 'CALL' : 'JP  ';
            console.log('  0x' + addr.toString(16).padStart(6, '0') + ': ' + op + ' 0x' + target.toString(16).padStart(6, '0'));
        }
    }
}

console.log('\n=== DONE ===');
