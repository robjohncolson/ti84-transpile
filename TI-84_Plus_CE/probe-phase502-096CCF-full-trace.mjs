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
    else results.forEach(a => console.log('  0x' + a.toString(16).padStart(6, '0')));
    return results;
}

console.log('=== PROBE: 0x096CCF Full Trace ===\n');
console.log('=== HEX DUMP: 0x096B65 - 0x096D20 ===');
hexDump(0x096B65, 0x096D20 - 0x096B65);

searchPattern(0x096B00, 0x096E00, [0xCD, 0x61, 0x10, 0x06], 'CALL 0x061061 in 0x096B00-0x096E00');
searchPattern(0x096B00, 0x096E00, [0xCD, 0x03, 0x10, 0x06], 'CALL 0x061003 in 0x096B00-0x096E00');
searchPattern(0x096B00, 0x096E00, [0xC3, 0x61, 0x10, 0x06], 'JP 0x061061 in 0x096B00-0x096E00');
searchPattern(0x096B00, 0x096E00, [0xC3, 0x03, 0x10, 0x06], 'JP 0x061003 in 0x096B00-0x096E00');
searchPattern(0x096000, 0x09A000, [0xCD, 0x61, 0x10, 0x06], 'CALL 0x061061 in 0x096000-0x09A000');
searchPattern(0x096000, 0x09A000, [0xC3, 0x61, 0x10, 0x06], 'JP 0x061061 in 0x096000-0x09A000');
searchPattern(0x096000, 0x09A000, [0xCD, 0x03, 0x10, 0x06], 'CALL 0x061003 in 0x096000-0x09A000');
searchPattern(0x096000, 0x09A000, [0xC3, 0x03, 0x10, 0x06], 'JP 0x061003 in 0x096000-0x09A000');
searchPattern(0x096B00, 0x096E00, [0xCD, 0x80, 0x19, 0x06], 'CALL 0x061980 in 0x096B00-0x096E00');
searchPattern(0x096000, 0x09A000, [0xCD, 0x80, 0x19, 0x06], 'CALL 0x061980 in 0x096000-0x09A000');
searchPattern(0x000000, 0x400000, [0xCD, 0xEE, 0x6B, 0x09], 'CALL 0x096BEE entire ROM');
searchPattern(0x000000, 0x400000, [0xC3, 0xEE, 0x6B, 0x09], 'JP 0x096BEE entire ROM');
searchPattern(0x000000, 0x400000, [0xCD, 0x65, 0x6B, 0x09], 'CALL 0x096B65 entire ROM');
searchPattern(0x000000, 0x400000, [0xC3, 0x65, 0x6B, 0x09], 'JP 0x096B65 entire ROM');
console.log('\n=== DONE ===');
