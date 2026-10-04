// Static analysis only. No CPU executor, emulator, GUI, or ROM runtime dependency.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { decodeInstruction } from '../ez80-decoder.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const hex = value => '0x' + value.toString(16).toUpperCase().padStart(6, '0');

export function extractStatMenuContract(rom, sdk) {
  assert.equal(rom.length, 4 * 1024 * 1024, 'Expected the local CE ROM image');
  const constants = new Map();
  for (const match of sdk.matchAll(/^\?(\w+)\s*:=\s*([0-9][0-9a-f]*)h\b/gmi)) {
    constants.set(match[1], parseInt(match[2], 16));
  }
  const instructions = [];
  function verify(address, expected) {
    const decoded = decodeInstruction(rom, address, 'adl');
    for (const [field, value] of Object.entries(expected)) {
      assert.equal(decoded[field], value, `${hex(address)} ${field}: different ROM or decoder`);
    }
    instructions.push({ address: hex(address), ...expected });
    return decoded;
  }

  // LoadMenu's unhooked descriptor lookup: menuCurrent * 3 + table, load u24.
  verify(0x08505b, { tag: 'ld-pair-imm', pair: 'hl', value: 0x086c73 });
  verify(0x085060, { tag: 'rotate-reg', op: 'sla', reg: 'a' });
  verify(0x085062, { tag: 'alu-reg', op: 'add', src: 'd' });
  verify(0x085069, { tag: 'ld-pair-ind', pair: 'hl', src: 'hl' });
  // Tab change resets menuSelected, independently of the previous cursor.
  verify(0x084f04, { tag: 'alu-reg', op: 'sub', src: 'a' });
  verify(0x084f05, { tag: 'ld-mem-reg', addr: constants.get('menuSelected'), src: 'a' });
  for (const [key, address] of Object.entries({
    kRight: 0x08588b, kLeft: 0x0858c3, kUp: 0x085aed,
    kDown: 0x085bc9, kEnter: 0x085c13, kClear: 0x08582a,
  })) {
    assert.ok(constants.has(key), `Missing SDK symbol ${key}`);
    verify(address, { tag: 'alu-imm', op: 'cp', value: constants.get(key) });
  }
  // ENTER translates menuSelected to a command; RIGHT has its own tab branch.
  verify(0x085c19, { tag: 'ld-reg-mem', dest: 'a', addr: constants.get('menuSelected') });
  verify(0x085c1d, { tag: 'call', target: 0x0866e7 });
  // Direct selection bounds-checks against menuNumItems before reading a token.
  verify(0x0866e8, { tag: 'ld-pair-imm', pair: 'hl', value: constants.get('menuNumItems') });
  verify(0x0866ec, { tag: 'alu-reg', op: 'cp', src: '(hl)' });
  verify(0x0866ed, { tag: 'ret-conditional', condition: 'nc' });
  verify(0x085f4d, { tag: 'ld-reg-imm', dest: 'b', value: constants.get('k1') });
  verify(0x085f59, { tag: 'alu-imm', op: 'cp', value: constants.get('k0') });
  verify(0x085f6d, { tag: 'alu-reg', op: 'sub', src: 'b' });
  verify(0x085f6e, { tag: 'call', target: 0x0866e7 });

  function descriptor(symbol) {
    const menuId = constants.get(symbol);
    assert.ok(Number.isInteger(menuId), `Missing ${symbol}`);
    const pointerAddress = 0x086c73 + menuId * 3;
    const address = rom.readUIntLE(pointerAddress, 3);
    const tabCount = rom[address];
    assert.equal(tabCount, 3, `${symbol} tab count`);
    const counts = Array.from(rom.subarray(address + 1, address + 1 + tabCount));
    // Descriptor layout established by 0x08532E..0x08535A: count bytes,
    // one title identifier per tab, then two-byte command pairs per entry.
    let position = address + 1 + tabCount * 2;
    const tabs = counts.map((count, index) => {
      const commands = [];
      for (let item = 0; item < count; item++, position += 2) {
        commands.push({ prefix: '1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ'[item],
          address: hex(position), bytes: Array.from(rom.subarray(position, position + 2)) });
      }
      return { name: ['EDIT', 'CALC', 'TESTS'][index], count, commands };
    });
    return { menuId, pointerAddress: hex(pointerAddress), address: hex(address), tabs };
  }
  const normal = descriptor('mStat');
  const program = descriptor('mPrgmStat');
  assert.deepEqual(normal.tabs.map(tab => tab.count), [5, 15, 18]);
  assert.deepEqual(program.tabs.map(tab => tab.count), [5, 14, 18]);
  assert.deepEqual(normal.tabs[1].commands.at(-1).bytes, [0xfb, 0xf8]);
  assert.equal(rom[0x0a15c6], 0xf8);
  const quickPlotTitle = rom.subarray(0x0a15c8, 0x0a15c8 + rom[0x0a15c7]).toString('ascii');
  assert.equal(quickPlotTitle, 'QuickPlot&Fit-EQ');
  const romSha256 = hash(rom);
  assert.equal(romSha256, '11e5dae8cb21eb04e612ef54f4f1cfad3bea1f1a55126168240c4e1d19b874f1',
    'Unknown ROM revision; review addresses before assigning an OS version');
  const ranges = [
    [0x084ed3, 0x084f13], [0x085023, 0x08506c], [0x08532e, 0x08535b],
    [0x0856a8, 0x086000], [0x0866e7, 0x08673f],
  ].map(([start, end]) => ({ start: hex(start), endExclusive: hex(end),
    sha256: hash(rom.subarray(start, end)) }));
  return {
    schemaVersion: 1, source: { model: 'TI-84 Plus CE', os: '5.8.2.0029',
      romSha256, sdkSha256: hash(sdk), mode: 'adl' },
    scope: 'Static evidence for the unhooked built-in STAT menu, not whole-ROM parity',
    descriptors: { normal, program }, instructions, ranges,
    quickPlot: { commandBytes: [0xfb, 0xf8], titleAddress: '0x0A15C8', title: quickPlotTitle },
    rules: {
      tabRight: ['0x08588B', '0x0858AE', '0x0858BF'],
      tabLeft: ['0x0858C3', '0x0858E6', '0x0858F7'],
      resetCursorOnTabChange: ['0x0858F8', '0x084F04'],
      upAndWrap: ['0x085AED', '0x085AFB', '0x085B14', '0x085B47'],
      downAndWrap: ['0x085BC9', '0x085BEB', '0x085A04'],
      enter: ['0x085C13', '0x085C19', '0x085C1D'],
      prefixAndBounds: ['0x085F43', '0x085F6D', '0x0866E7'],
    },
    assumptions: ['No menu hooks', 'Ordinary menu context', 'Menu wrap-disable flag is clear'],
    unresolved: [
      'Selected command handlers, including QuickPlot & Fit-EQ',
      '2ND arrow paging and cursor viewport state',
      'CLEAR return contexts, application switching, and modifier translation',
      'List header editing, formulas, named lists, insertion, deletion and errors',
      '1-Var Stats wizard editing and error recovery',
      'TI decimal arithmetic, weighted quartiles and numeric formatting',
    ],
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const contract = extractStatMenuContract(
    readFileSync(new URL('../ROM.rom', import.meta.url)),
    readFileSync(new URL('../references/ti84pceg.inc', import.meta.url), 'utf8'));
  const output = new URL('./stat-menu-contract.json', import.meta.url);
  const serialized = JSON.stringify(contract, null, 2) + '\n';
  if (process.argv.includes('--check')) assert.equal(readFileSync(output, 'utf8'), serialized);
  else writeFileSync(output, serialized);
  console.log(JSON.stringify({ verifiedInstructions: contract.instructions.length,
    normalCounts: contract.descriptors.normal.tabs.map(tab => tab.count),
    programCounts: contract.descriptors.program.tabs.map(tab => tab.count),
    romSha256: contract.source.romSha256, unresolved: contract.unresolved.length }));
}
