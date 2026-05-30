import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { decodeInstruction } from './ez80-decoder.js';

const probeDir = dirname(fileURLToPath(import.meta.url));
const romPaths = [
    join(process.cwd(), 'TI-84_Plus_CE', 'ROM.rom'),
    join(process.cwd(), 'ROM.rom'),
    join(probeDir, 'ROM.rom'),
];

const romPath = romPaths.find(path => existsSync(path));
if (!romPath) {
    throw new Error('Unable to find ROM.rom. Run from repo root or TI-84_Plus_CE/.');
}

const rom = readFileSync(romPath);

const targets = [
    { startAddr: 0x001296, length: 128, label: 'event-loop gate at 0x001296' },
    { startAddr: 0x001778, length: 32, label: 'EI/HALT countdown helper at 0x001778' },
    { startAddr: 0x001783, length: 32, label: 'EI/HALT countdown helper at 0x001783' },
];

function hex6(value) {
    return value.toString(16).padStart(6, '0');
}

function hex2(value) {
    return value.toString(16).padStart(2, '0');
}

function assertRange(startAddr, length) {
    if (startAddr < 0 || startAddr + length > rom.length) {
        throw new RangeError(
            `Range 0x${hex6(startAddr)}..0x${hex6(startAddr + length)} exceeds ROM length 0x${rom.length.toString(16)}`,
        );
    }
}

function printHexDump(startAddr, length) {
    console.log('--- Hex dump ---');

    let hexLine = '';
    for (let i = 0; i < length; i++) {
        if (i % 16 === 0) {
            if (hexLine) console.log(hexLine);
            hexLine = `0x${hex6(startAddr + i)}: `;
        }
        hexLine += `${hex2(rom[startAddr + i])} `;
    }

    if (hexLine) console.log(hexLine);
}

function instructionLength(instr) {
    return instr.length ?? instr.size ?? instr.bytes?.length ?? 1;
}

function formatInstruction(instr) {
    const mnemonic = instr.mnemonic ?? instr.opcode ?? instr.name ?? instr.instruction ?? '???';
    const operands = Array.isArray(instr.operands)
        ? instr.operands.join(', ')
        : (instr.operands ?? instr.operand ?? '');

    return operands ? `${mnemonic} ${operands}` : mnemonic;
}

function isLikelyFunctionEnd(byte, instr) {
    const mnemonic = (instr.mnemonic ?? '').toUpperCase();

    return (
        byte === 0xc9 ||
        byte === 0xed ||
        mnemonic === 'RET' ||
        mnemonic === 'RETI' ||
        mnemonic === 'RETN' ||
        mnemonic === 'JP' ||
        mnemonic === 'JR'
    );
}

function printDisassembly(startAddr, length) {
    console.log('\n--- Disassembly ---');

    let offset = 0;
    while (offset < length) {
        const addr = startAddr + offset;

        try {
            const instr = decodeInstruction(rom, addr, 'adl');
            const length = instr ? instructionLength(instr) : 0;

            if (!instr || length <= 0) {
                console.log(`0x${hex6(addr)}: DB 0x${hex2(rom[addr])}`);
                offset++;
                continue;
            }

            const bytes = Array.from(rom.slice(addr, addr + length))
                .map(byte => hex2(byte))
                .join(' ');
            console.log(`0x${hex6(addr)}: ${bytes.padEnd(20)} ${formatInstruction(instr)}`);

            offset += length;

            if (offset > 4 && isLikelyFunctionEnd(rom[addr], instr)) {
                break;
            }
        } catch (error) {
            console.log(`0x${hex6(addr)}: DB 0x${hex2(rom[addr])} (decode error: ${error.message})`);
            offset++;
        }
    }
}

for (const target of targets) {
    const { startAddr, length, label } = target;

    assertRange(startAddr, length);
    console.log(`\n=== Decoding ${label} ===\n`);
    printHexDump(startAddr, length);
    printDisassembly(startAddr, length);
}
