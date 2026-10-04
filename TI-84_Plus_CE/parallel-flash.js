// Parallel NOR command protocol used by the copied ROM erase/program routines.
// Cross-reference: https://github.com/CE-Programming/CEmu/blob/master/core/mem.c
// This models command completion, not electrical timing or ASIC privilege gates.
export function createParallelFlash(memory, { size = 0x400000, writable = address => address >= 0x20000 } = {}) {
  let phase = 'idle';
  let statusReads = 0;
  let protectionRead = false;
  const operations = [];

  function read8(address) {
    if (statusReads > 0) {
      statusReads--;
      return 0x80;
    }
    if (protectionRead) return writable(address) ? 0 : 1;
    return memory[address];
  }

  function write8(address, value) {
    if (address < 0 || address >= size) return;
    const byte = value & 0xFF;
    const low = address & 0xFFF;
    if (phase === 'program') {
      if (writable(address)) memory[address] &= byte;
      operations.push({ kind: 'program', address, value: byte });
      phase = 'idle';
      return;
    }
    if (byte === 0xF0) {
      phase = 'idle';
      protectionRead = false;
      statusReads = 0;
      return;
    }
    if (phase === 'idle') {
      if (low === 0xAAA && byte === 0xAA) phase = 'unlock';
      return;
    }
    if (phase === 'unlock') {
      phase = low === 0x555 && byte === 0x55 ? 'command' : 'idle';
      return;
    }
    if (phase === 'command') {
      phase = 'idle';
      if (low !== 0xAAA) return;
      if (byte === 0xA0) phase = 'program';
      if (byte === 0x80) phase = 'erase-unlock';
      if (byte === 0x90) protectionRead = true;
      return;
    }
    if (phase === 'erase-unlock') {
      phase = low === 0xAAA && byte === 0xAA ? 'erase-confirm' : 'idle';
      return;
    }
    if (phase === 'erase-confirm') {
      phase = low === 0x555 && byte === 0x55 ? 'erase' : 'idle';
      return;
    }
    phase = 'idle';
    if (byte !== 0x30) return;
    const sectorSize = address < 0x10000 ? 0x2000 : 0x10000;
    const start = Math.floor(address / sectorSize) * sectorSize;
    if (writable(address)) memory.fill(0xFF, start, Math.min(start + sectorSize, size));
    operations.push({ kind: 'erase', address: start, size: sectorSize });
    statusReads = 3;
  }

  return { read8, write8, operations };
}
