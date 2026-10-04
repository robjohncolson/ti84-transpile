import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { scanCodeToKeyCode } from './scancode-translate.js';

const shell = fs.readFileSync(new URL('./browser-shell.html', import.meta.url), 'utf8');
const rom = fs.readFileSync(new URL('./ROM.rom', import.meta.url));
const functionSource = shell.match(/function getColdbootInternalKeyCode\(code, scanCode\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(functionSource, 'coldboot key translation function exists');
const scanTableSource = shell.match(/const GETCSC_SCAN_CODE_BY_PC_CODE = Object.freeze\(\{[\s\S]*?\n\}\);/)?.[0];
assert.ok(scanTableSource, 'OS scan-code table exists');
const context = vm.createContext({
  EOL_PC_CODE: 'Escape',
  cpu: { memory: new Uint8Array(1) },
  scanCodeToKeyCode,
  getKeyboardModifierIndex: memory => memory[0],
});
vm.runInContext(`${scanTableSource}\n${functionSource}`, context);

for (const code of ['Equal', 'NumpadAdd']) {
  test(`${code} translates the ROM key code into the addition token`, () => {
    context.cpu.memory[0] = 0;
    const scan = vm.runInContext(`GETCSC_SCAN_CODE_BY_PC_CODE.${code}`, context);
    assert.equal(scan, 0x0a, 'addition OS scan code');
    const internal = context.getColdbootInternalKeyCode(code, scan);
    assert.equal(internal, 0x80, 'addition internal key code');
    assert.equal(rom[0x05bf84 + internal - 0x5a], 0x70, 'ROM emits tAdd');
  });

  test(`${code} keeps the ROM modifier mappings`, () => {
    for (const [modifier, expected] of [[1, 0x36], [2, 0xcb], [3, 0xcb]]) {
      context.cpu.memory[0] = modifier;
      assert.equal(context.getColdbootInternalKeyCode(code, 0x0a), expected);
    }
  });
}
