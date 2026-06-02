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

console.log('=== PROBE: Decode 0x0994DC (Mode Setup) ===\n');

console.log('=== HEX DUMP: 0x0994DC - 0x099600 ===');
hexDump(0x0994DC, 0x099600 - 0x0994DC);

console.log('\n=== HEX DUMP: 0x0979A1 - 0x097A10 ===');
hexDump(0x0979A1, 0x097A10 - 0x0979A1);

searchPattern(0x000000, 0x400000, [0xCD, 0xDC, 0x94, 0x09], 'CALL 0x0994DC entire ROM');
searchPattern(0x000000, 0x400000, [0xC3, 0xDC, 0x94, 0x09], 'JP 0x0994DC entire ROM');
searchPattern(0x000000, 0x400000, [0xCD, 0xA1, 0x79, 0x09], 'CALL 0x0979A1 entire ROM');

console.log('\n=== CALL/JP targets inside 0x0994DC-0x099580 ===');
for (let addr = 0x0994DC; addr < 0x099580; addr++) {
    if (rom[addr] === 0xCD || rom[addr] === 0xC3) {
        const target = rom[addr+1] | (rom[addr+2] << 8) | (rom[addr+3] << 16);
        if (target >= 0x000100 && target < 0x400000) {
            const op = rom[addr] === 0xCD ? 'CALL' : 'JP  ';
            console.log('  0x' + addr.toString(16).padStart(6, '0') + ': ' + op + ' 0x' + target.toString(16).padStart(6, '0'));
        }
    }
}

console.log('\n=== DONE ===');
