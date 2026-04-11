const key = (group, bit, label) => Object.freeze({ group, bit, label });

// Phase 24F verified keys marked with V. Others are best-guess from classic matrix.
export const KEY_MAP = Object.freeze({
  // Group 0: Arrow keys
  ArrowDown: key(0, 0, 'DOWN'),
  ArrowLeft: key(0, 1, 'LEFT'),
  ArrowRight: key(0, 2, 'RIGHT'),     // V
  ArrowUp: key(0, 3, 'UP'),
  // Group 1: Math operators
  Equal: key(1, 1, '+'),              // V
  NumpadAdd: key(1, 1, '+'),          // V
  Minus: key(1, 2, '-'),
  NumpadSubtract: key(1, 2, '-'),
  NumpadMultiply: key(1, 3, '*'),
  Slash: key(1, 4, '/'),
  NumpadDivide: key(1, 4, '/'),
  // Group 2: 3, 6, 9
  Digit3: key(2, 1, '3'),
  Numpad3: key(2, 1, '3'),
  Digit6: key(2, 2, '6'),
  Numpad6: key(2, 2, '6'),
  Digit9: key(2, 3, '9'),
  Numpad9: key(2, 3, '9'),
  // Group 3: 0 (verified), 2, 5, 8, period
  Digit0: key(3, 0, '0'),             // V
  Numpad0: key(3, 0, '0'),            // V
  Digit2: key(3, 1, '2'),
  Numpad2: key(3, 1, '2'),
  Digit5: key(3, 2, '5'),
  Numpad5: key(3, 2, '5'),
  Digit8: key(3, 3, '8'),
  Numpad8: key(3, 3, '8'),
  Period: key(3, 4, '.'),
  NumpadDecimal: key(3, 4, '.'),
  // Group 4: GRAPH (verified), function keys, 1, 4, 7, comma
  F5: key(4, 0, 'GRAPH'),             // V
  F4: key(4, 1, 'TRACE'),
  F3: key(4, 2, 'ZOOM'),
  F2: key(4, 3, 'WINDOW'),
  Digit1: key(4, 4, '1'),
  Numpad1: key(4, 4, '1'),
  Digit4: key(4, 5, '4'),
  Numpad4: key(4, 5, '4'),
  Digit7: key(4, 6, '7'),
  Numpad7: key(4, 6, '7'),
  Comma: key(4, 7, ','),
  NumpadComma: key(4, 7, ','),
  // Group 5: Y= (verified)
  F1: key(5, 4, 'Y='),                // V
  CapsLock: key(5, 7, 'ALPHA'),
  // Group 6: ENTER, CLEAR, 2ND (all verified)
  Enter: key(6, 0, 'ENTER'),          // V
  Escape: key(6, 1, 'CLEAR'),         // V
  Tab: key(6, 5, '2ND'),              // V
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
