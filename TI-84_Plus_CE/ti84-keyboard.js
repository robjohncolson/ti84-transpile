const key = (group, bit, label) => Object.freeze({ group, bit, label });

// CE C SDK keypadc.h (ce-programming/toolchain) + reversed group mapping.
// MMIO at 0xE00810 uses reversed groups vs SDK kb_Data at 0xF50010:
//   keyMatrix[N] = SDK Group (7-N)
// Verified: keyMatrix[0]:B2 = RIGHT (SDK G7:B2 ✓), keyMatrix[1]:B1 = + (SDK G6:B1 ✓)
export const KEY_MAP = Object.freeze({
  // keyMatrix[0] = SDK Group 7: DOWN LEFT RIGHT UP
  ArrowDown: key(0, 0, 'DOWN'),
  ArrowLeft: key(0, 1, 'LEFT'),
  ArrowRight: key(0, 2, 'RIGHT'),
  ArrowUp: key(0, 3, 'UP'),
  // keyMatrix[1] = SDK Group 6: ENTER + - × ÷ ^ CLEAR
  Enter: key(1, 0, 'ENTER'),
  Equal: key(1, 1, '+'),
  NumpadAdd: key(1, 1, '+'),
  Minus: key(1, 2, '-'),
  NumpadSubtract: key(1, 2, '-'),
  NumpadMultiply: key(1, 3, '×'),
  Slash: key(1, 4, '÷'),
  NumpadDivide: key(1, 4, '÷'),
  KeyE: key(1, 5, '^'),               // Exponent
  Escape: key(1, 6, 'CLEAR'),
  // keyMatrix[2] = SDK Group 5: (-) 3 6 9 ) TAN VARS
  KeyN: key(2, 0, '(-)'),             // N for negate
  Digit3: key(2, 1, '3'),
  Numpad3: key(2, 1, '3'),
  Digit6: key(2, 2, '6'),
  Numpad6: key(2, 2, '6'),
  Digit9: key(2, 3, '9'),
  Numpad9: key(2, 3, '9'),
  BracketRight: key(2, 4, ')'),
  KeyT: key(2, 5, 'TAN'),
  KeyV: key(2, 6, 'VARS'),
  // keyMatrix[3] = SDK Group 4: . 2 5 8 ( COS PRGM STAT
  Period: key(3, 0, '.'),
  NumpadDecimal: key(3, 0, '.'),
  Digit2: key(3, 1, '2'),
  Numpad2: key(3, 1, '2'),
  Digit5: key(3, 2, '5'),
  Numpad5: key(3, 2, '5'),
  Digit8: key(3, 3, '8'),
  Numpad8: key(3, 3, '8'),
  BracketLeft: key(3, 4, '('),
  KeyC: key(3, 5, 'COS'),
  KeyP: key(3, 6, 'PRGM'),
  // keyMatrix[4] = SDK Group 3: 0 1 4 7 , SIN APPS XTθn
  Digit0: key(4, 0, '0'),
  Numpad0: key(4, 0, '0'),
  Digit1: key(4, 1, '1'),
  Numpad1: key(4, 1, '1'),
  Digit4: key(4, 2, '4'),
  Numpad4: key(4, 2, '4'),
  Digit7: key(4, 3, '7'),
  Numpad7: key(4, 3, '7'),
  Comma: key(4, 4, ','),
  NumpadComma: key(4, 4, ','),
  KeyS: key(4, 5, 'SIN'),
  KeyA: key(4, 6, 'APPS'),
  KeyX: key(4, 7, 'XTθn'),
  // keyMatrix[5] = SDK Group 2: _ STO LN LOG x² x⁻¹ MATH ALPHA
  KeyO: key(5, 1, 'STO→'),            // stOre
  KeyL: key(5, 2, 'LN'),
  KeyG: key(5, 3, 'LOG'),             // loG
  KeyQ: key(5, 4, 'x²'),             // sQuare
  KeyI: key(5, 5, 'x⁻¹'),            // Inverse
  KeyM: key(5, 6, 'MATH'),
  CapsLock: key(5, 7, 'ALPHA'),
  // keyMatrix[6] = SDK Group 1: GRAPH TRACE ZOOM WINDOW Y= 2ND MODE DEL
  F5: key(6, 0, 'GRAPH'),
  F4: key(6, 1, 'TRACE'),
  F3: key(6, 2, 'ZOOM'),
  F2: key(6, 3, 'WINDOW'),
  F1: key(6, 4, 'Y='),
  Tab: key(6, 5, '2ND'),
  Home: key(6, 6, 'MODE'),
  Backspace: key(6, 7, 'DEL'),
});

export function createKeyboardManager(peripherals) {
  const keyMatrix = peripherals.keyboard.keyMatrix;
  const pressedKeys = new Set();
  const setKeyboardIRQ =
    typeof peripherals?.setKeyboardIRQ === 'function'
      ? peripherals.setKeyboardIRQ.bind(peripherals)
      : null;

  function handleKeyDown(event) {
    const mapping = KEY_MAP[event.code];
    if (!mapping) return;

    event.preventDefault();
    keyMatrix[mapping.group] &= ~(1 << mapping.bit);
    pressedKeys.add(event.code);
    if (setKeyboardIRQ) setKeyboardIRQ(true);
  }

  function handleKeyUp(event) {
    const mapping = KEY_MAP[event.code];
    if (!mapping) return;

    event.preventDefault();
    keyMatrix[mapping.group] |= 1 << mapping.bit;
    pressedKeys.delete(event.code);
    if (setKeyboardIRQ && pressedKeys.size === 0) setKeyboardIRQ(false);
  }

  function getKeyState() {
    const activeCodes = [...pressedKeys];
    return {
      pressedKeys: activeCodes,
      tiKeys: activeCodes.map((code) => KEY_MAP[code]),
    };
  }

  return { handleKeyDown, handleKeyUp, getKeyState };
}
