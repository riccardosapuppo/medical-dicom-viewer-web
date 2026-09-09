// Readable names for the keys that are not a letter or a digit, so the Shortcuts
// tab in the Preferences dialog says which key it means.
//
// These were written in Italian, which is also why the modifier names here and
// the ones the operating system draws in the menu bar disagreed: "Maiusc" in one
// place and "Shift" in the other, on the same keyboard.
const KEY_LABELS = {
  space: 'Space',
  spacebar: 'Space',
  esc: 'Esc',
  escape: 'Esc',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backspace: 'Backspace',
  del: 'Delete',
  delete: 'Delete',
  ins: 'Insert',
  insert: 'Insert',
  up: 'Arrow up',
  down: 'Arrow down',
  left: 'Arrow left',
  right: 'Arrow right',
  pageup: 'Page up',
  pagedown: 'Page down',
  home: 'Home',
  end: 'End',
  // Modifiers
  shift: 'Shift',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  cmd: 'Cmd',
  command: 'Cmd',
  meta: 'Cmd',
  plus: '+',
};

/**
 * Turns one key token into something readable.
 * @param {string} token
 * @returns {string}
 */
const translateKey = token => {
  if (!token) {
    return '';
  }
  const lower = String(token).toLowerCase().trim();
  if (KEY_LABELS[lower]) {
    return KEY_LABELS[lower];
  }
  // A single letter, digit or symbol goes uppercase; anything else is capitalised.
  return token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
};

/**
 * Take the pressed key array and return the readable string for the keys
 *
 * @param {Array} [keys=[]]
 * @returns {string} string representation of an array of keys
 */
const formatKeysForInput = (keys = []) =>
  keys.map(key => String(key).split('+').map(translateKey).join('+')).join('+');

/**
 * formats given keys sequence to insert the modifier keys in the first index of the array
 * @param {string} sequence keys sequence from MouseTrap Record -> "shift+left"
 * @returns {Array} keys in array-format -> ['shift','left']
 */
const getKeys = ({ sequence, modifierKeys }) => {
  const keysArray = sequence.join(' ').split('+');
  let keys = [];
  let modifiers = [];
  keysArray.forEach(key => {
    if (modifierKeys && modifierKeys.includes(key)) {
      modifiers.push(key);
    } else {
      keys.push(key);
    }
  });
  return [...modifiers, ...keys];
};

export { getKeys, formatKeysForInput, translateKey, KEY_LABELS };
