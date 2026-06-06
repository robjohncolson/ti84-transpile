import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const START = 0x07fe8a;
const END = 0x07fe96;

const typeNames = new Map([
  [0x00, 'Real'],
  [0x01, 'List'],
  [0x02, 'Matrix'],
  [0x04, 'Equation/Y-Var'],
  [0x05, 'String'],
  [0x06, 'Program'],
  [0x07, 'Protected Program'],
  [0x08, 'Picture'],
  [0x0c, 'Complex'],
  [0x0d, 'Complex List'],
  [0x15, 'AppVar'],
  [0x17, 'Group'],
  [0x18, 'String variant'],
  [0x1c, 'Matrix (alt)'],
  [0x20, 'Equation (alt)'],
  [0x21, 'String (alt)'],
]);

const hex2 = (value) => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
const hex6 = (value) => `0x${value.toString(16).toUpperCase().padStart(6, '0')}`;
const typeLabel = (value) => `${hex2(value)} (${typeNames.get(value) ?? 'Unknown'})`;

function readBytes(rom, address, length) {
  return Array.from(rom.subarray(address, address + length));
}

function printBytes(title, address, bytes) {
  console.log(`${title} (${bytes.length} bytes at ${hex6(address)}):`);
  console.log(`  ${bytes.map(hex2).join(' ')}`);
  bytes.forEach((byte, index) => {
    console.log(`  [${index}] ${hex6(address + index)} = ${typeLabel(byte)}`);
  });
  console.log('');
}

function printMapping(title, inputs, outputs) {
  console.log(`${title}:`);
  inputs.forEach((input, index) => {
    console.log(`  ${typeLabel(input)} -> ${typeLabel(outputs[index])}`);
  });
  console.log('');
}

function verifyInverseOverlap(forwardInputs, forwardOutputs, reverseInputs, reverseOutputs) {
  console.log('Inverse overlap verification:');

  let ok = true;
  reverseInputs.forEach((reverseInput, index) => {
    const reverseOutput = reverseOutputs[index];
    const forwardIndex = forwardInputs.indexOf(reverseOutput);
    const forwardOutput = forwardIndex >= 0 ? forwardOutputs[forwardIndex] : undefined;
    const matches = forwardOutput === reverseInput;

    if (!matches) ok = false;

    const status = matches ? 'OK' : 'MISMATCH';
    const forwardText =
      forwardOutput === undefined
        ? 'not found in forward input table'
        : `${typeLabel(reverseOutput)} -> ${typeLabel(forwardOutput)}`;

    console.log(
      `  ${status}: reverse ${typeLabel(reverseInput)} -> ${typeLabel(reverseOutput)}; forward ${forwardText}`,
    );
  });

  console.log(`  Result: ${ok ? 'tables are inverse over the reverse table entries' : 'inverse check failed'}`);
}

const rom = readFileSync(ROM_PATH);
const raw = readBytes(rom, START, END - START + 1);
const forwardInputs = readBytes(rom, 0x07fe8a, 6);
const forwardOutputs = readBytes(rom, 0x07fe90, 6);
const reverseInputs = readBytes(rom, 0x07fe91, 5);
const reverseOutputs = forwardInputs.slice(0, reverseInputs.length);

console.log(`ROM: ${ROM_PATH}`);
console.log(`Raw bytes ${hex6(START)}-${hex6(END)} (${raw.length} bytes):`);
console.log(`  ${raw.map(hex2).join(' ')}`);
console.log('');

printBytes('Forward input table', 0x07fe8a, forwardInputs);
printBytes('Forward output table', 0x07fe90, forwardOutputs);
printBytes('Reverse input table', 0x07fe91, reverseInputs);
printMapping('Forward mapping table', forwardInputs, forwardOutputs);
printMapping('Reverse mapping table', reverseInputs, reverseOutputs);
verifyInverseOverlap(forwardInputs, forwardOutputs, reverseInputs, reverseOutputs);
