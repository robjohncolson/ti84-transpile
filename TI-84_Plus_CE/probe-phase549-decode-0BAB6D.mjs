import fs from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const ENTRY = 0x0BAB6D;
const RENDERER = 0x0BAB88;
const DUMP_LEN = 0x40;

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexBytes(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function read24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function read16(offset) {
  return rom[offset] | (rom[offset + 1] << 8);
}

function disassembleWindow(start, length) {
  const end = Math.min(rom.length, start + length);
  const rows = [];
  let pc = start;

  while (pc < end) {
    const op = rom[pc];
    const at = pc;
    let size = 1;
    let text = `DB ${hex(op, 2)}`;
    let note = '';

    if (op === 0x40 && pc + 1 < end) {
      const next = rom[pc + 1];
      if (next === 0x52 && pc + 3 < end) {
        size = 4;
        text = `SIS LD (${hex(read16(pc + 2), 4)}),HL`;
        note = 'short 16-bit store; saves x-position';
      } else {
        size = 2;
        text = `SIS prefix; next opcode ${hex(next, 2)}`;
      }
    } else if (op === 0x21 && pc + 3 < end) {
      size = 4;
      text = `LD HL,${hex(read24(pc + 1))}`;
    } else if (op === 0x3A && pc + 3 < end) {
      size = 4;
      text = `LD A,(${hex(read24(pc + 1))})`;
      if (read24(pc + 1) === 0xD02A78) note = 'reads y-position byte from D02A76+2';
    } else if (op === 0x32 && pc + 3 < end) {
      size = 4;
      text = `LD (${hex(read24(pc + 1))}),A`;
      if (read24(pc + 1) === 0xD008D5) note = 'stores display y-position';
    } else if (op === 0xCD && pc + 3 < end) {
      size = 4;
      text = `CALL ${hex(read24(pc + 1))}`;
    } else if (op === 0xC3 && pc + 3 < end) {
      size = 4;
      text = `JP ${hex(read24(pc + 1))}`;
    } else if (op === 0xC9) {
      text = 'RET';
    } else if (op === 0xED && pc + 1 < end && rom[pc + 1] === 0x27) {
      size = 2;
      text = 'LD HL,(HL)';
      note = 'eZ80-specific 24-bit indirect load';
    }

    rows.push({
      address: at,
      bytes: rom.slice(at, Math.min(end, at + size)),
      text,
      note,
    });
    pc += size;
  }

  return rows;
}

function findXrefs(target) {
  const lo = target & 0xFF;
  const mid = (target >> 8) & 0xFF;
  const hi = (target >> 16) & 0xFF;
  const refs = [];

  for (let i = 0; i <= rom.length - 4; i += 1) {
    const opcode = rom[i];
    if ((opcode === 0xCD || opcode === 0xC3) && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      refs.push({
        address: i,
        type: opcode === 0xCD ? 'CALL' : 'JP',
      });
    }
  }

  return refs;
}

function printRows(rows) {
  for (const row of rows) {
    const marker = row.address === ENTRY ? ' <entry>' : row.address === RENDERER ? ' <fall-through renderer>' : '';
    const note = row.note ? ` ; ${row.note}` : '';
    console.log(`${hex(row.address)}: ${hexBytes(row.bytes).padEnd(14)} ${row.text}${marker}${note}`);
  }
}

function printXrefs(label, target) {
  const refs = findXrefs(target);
  const calls = refs.filter((ref) => ref.type === 'CALL').length;
  const jumps = refs.filter((ref) => ref.type === 'JP').length;

  console.log('');
  console.log(`${label} xrefs to ${hex(target)}: ${refs.length} total (${calls} CALL, ${jumps} JP)`);
  if (refs.length === 0) {
    console.log('  none found via direct CD/C3 absolute 24-bit target scan');
    return refs;
  }

  for (const ref of refs) {
    const contextStart = Math.max(0, ref.address - 4);
    const contextEnd = Math.min(rom.length, ref.address + 8);
    console.log(`  ${hex(ref.address)} ${ref.type} ${hex(target)} ; context ${hexBytes(rom.slice(contextStart, contextEnd))}`);
  }

  return refs;
}

const bytes = rom.slice(ENTRY, ENTRY + DUMP_LEN);

console.log('Phase 549 probe: decode display coordinate setup entry');
console.log(`ROM: ${ROM_PATH} (${rom.length} bytes)`);
console.log(`Raw bytes at ${hex(ENTRY)} (+${DUMP_LEN}):`);
console.log(hexBytes(bytes));
console.log('');
console.log('Disassembly annotations:');
printRows(disassembleWindow(ENTRY, DUMP_LEN));

const entryRefs = printXrefs('Entry function', ENTRY);
const rendererRefs = printXrefs('Renderer function', RENDERER);
const directRendererRefs = rendererRefs.filter((ref) => ref.address !== ENTRY);

console.log('');
console.log('Function boundary:');
console.log(`  ${hex(ENTRY)}..${hex(RENDERER - 1)} is the coordinate setup entry block.`);
console.log(`  ${hex(RENDERER)} is the fall-through point into the previously decoded token template renderer.`);
console.log('  No RET or JP terminates the setup block before the renderer; control falls through directly.');

console.log('');
console.log('Summary:');
console.log('  Inputs: HL is expected to hold the x-position before entry.');
console.log('  Setup: SIS LD (0x08D2),HL stores the 16-bit x-position display state.');
console.log('  Setup: LD HL,0xD02A76 followed by LD HL,(HL) loads the pointer/value context used for y-position lookup.');
console.log('  Setup: LD A,(0xD02A78) and LD (0xD008D5),A copy the y-position byte from D02A76+2 into display state.');
console.log(`  Callers of setup entry: ${entryRefs.length === 0 ? 'none found by direct CALL/JP scan' : entryRefs.map((ref) => `${ref.type}@${hex(ref.address)}`).join(', ')}`);
console.log(`  Direct callers/jumpers to renderer: ${directRendererRefs.length === 0 ? 'none found by direct CALL/JP scan; renderer appears reached by fall-through from setup entry' : directRendererRefs.map((ref) => `${ref.type}@${hex(ref.address)}`).join(', ')}`);
