import { createExecutor } from './cpu-runtime.js';

const VRAM_BASE = 0xD40000;
const ROW_STRIDE = 640;
const CHAR_CELL_WIDTH = 12;
const CHAR_CELL_HEIGHT = 16;
const BYTES_PER_PIXEL = 2;
const CELL_ROW_BYTES = CHAR_CELL_WIDTH * BYTES_PER_PIXEL;
const CELL_START = VRAM_BASE + 37 * ROW_STRIDE + 2 * BYTES_PER_PIXEL;
const CHAR_OUT = 0x0059C6;
const TEXT_FLAGS = 0xD00085;
const CURSOR_ROW = 0xD00595;
const CURSOR_COL = 0xD00596;

const { cpu, mem, runFrom } = createExecutor({
  romPath: './ROM.rom',
  peripherals: { timerInterrupt: false }
});

function bootRom() {
  runFrom(0x000000, { maxSteps: 50000, stopOnRet: false, stopAt: [0x02FDBE] });
  runFrom(0x02FDBE, { maxSteps: 20000, stopOnRet: false, stopAt: [0x02FDBE] });
  runFrom(0x02FDBE, { maxSteps: 20000, stopOnRet: false, stopAt: [0x02FDBE] });
}

function resetTextState() {
  mem[CURSOR_ROW] = 0;
  mem[CURSOR_COL] = 0;
  mem[TEXT_FLAGS] &= 0xF7;
}

function clearCell() {
  for (let r = 0; r < CHAR_CELL_HEIGHT; r++) {
    const rowBase = CELL_START + r * ROW_STRIDE;
    for (let c = 0; c < CELL_ROW_BYTES; c++) {
      mem[rowBase + c] = 0;
    }
  }
}

function snapshotCell() {
  const snapshot = new Uint8Array(CHAR_CELL_HEIGHT * CELL_ROW_BYTES);

  for (let r = 0; r < CHAR_CELL_HEIGHT; r++) {
    const rowBase = CELL_START + r * ROW_STRIDE;
    const snapshotBase = r * CELL_ROW_BYTES;
    for (let c = 0; c < CELL_ROW_BYTES; c++) {
      snapshot[snapshotBase + c] = mem[rowBase + c];
    }
  }

  return snapshot;
}

function renderChar(charCode) {
  resetTextState();
  cpu.a = charCode;
  return runFrom(CHAR_OUT, { maxSteps: 500, stopOnRet: true });
}

function captureGlyph(charCode) {
  clearCell();
  resetTextState();

  const before = snapshotCell();
  const runResult = renderChar(charCode);
  const pixels = [];
  const positions = [];
  let changedBytes = 0;

  for (let r = 0; r < CHAR_CELL_HEIGHT; r++) {
    let row = '';
    const snapshotBase = r * CELL_ROW_BYTES;
    const rowBase = CELL_START + r * ROW_STRIDE;

    for (let x = 0; x < CHAR_CELL_WIDTH; x++) {
      const cellOffset = x * BYTES_PER_PIXEL;
      const addr = rowBase + cellOffset;
      const beforeLo = before[snapshotBase + cellOffset];
      const beforeHi = before[snapshotBase + cellOffset + 1];
      const afterLo = mem[addr];
      const afterHi = mem[addr + 1];
      const loChanged = afterLo !== beforeLo;
      const hiChanged = afterHi !== beforeHi;

      if (loChanged) changedBytes++;
      if (hiChanged) changedBytes++;

      if (loChanged || hiChanged) {
        row += '#';
        positions.push({ x, y: r, value: (afterHi << 8) | afterLo });
      } else {
        row += '.';
      }
    }

    pixels.push(row);
  }

  return {
    charCode,
    changedBytes,
    changedPixels: positions.length,
    pixels,
    positions,
    steps: runResult?.steps
  };
}

function printableChar(charCode) {
  return charCode >= 0x20 && charCode <= 0x7E
    ? ` ${String.fromCharCode(charCode)}`
    : '';
}

bootRom();

const results = [];

for (let charCode = 0; charCode <= 0xFF; charCode++) {
  results.push(captureGlyph(charCode));
}

for (const result of results) {
  const hex = result.charCode.toString(16).padStart(2, '0');
  console.log(
    `\n=== Char 0x${hex}${printableChar(result.charCode)} ` +
      `(${result.changedBytes} bytes, ${result.changedPixels} pixels) ===`
  );

  if (result.changedPixels > 0) {
    for (const row of result.pixels) {
      console.log(row);
    }
  }
}

const visibleCount = results.filter(result => result.changedPixels > 0).length;
const blankCount = results.length - visibleCount;
const totalChangedBytes = results.reduce((sum, result) => sum + result.changedBytes, 0);

console.log('\n=== SUMMARY ===');
console.log(`Total characters rendered: ${results.length}`);
console.log(`Characters with pixels: ${visibleCount}`);
console.log(`Characters with 0 pixels: ${blankCount}`);
console.log(`Total changed VRAM bytes: ${totalChangedBytes}`);
