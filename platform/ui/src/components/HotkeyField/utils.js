// Etichette in italiano per i tasti "speciali" (non alfanumerici), così nel
// pannello Preferenze → Scorciatoie l'utente capisce a quale tasto si riferisce
// (es. "home" → "Inizio", "pageup" → "Pagina su", "space" → "Spazio").
const KEY_LABELS = {
  space: 'Spazio',
  spacebar: 'Spazio',
  esc: 'Esc',
  escape: 'Esc',
  enter: 'Invio',
  return: 'Invio',
  tab: 'Tab',
  backspace: 'Backspace',
  del: 'Canc',
  delete: 'Canc',
  ins: 'Ins',
  insert: 'Ins',
  up: 'Freccia su',
  down: 'Freccia giù',
  left: 'Freccia sinistra',
  right: 'Freccia destra',
  pageup: 'Pagina su',
  pagedown: 'Pagina giù',
  home: 'Inizio',
  end: 'Fine',
  // Modificatori
  shift: 'Maiusc',
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
 * Traduce un singolo token-tasto in etichetta leggibile (italiano).
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
  // Tasto singolo (lettera/numero/simbolo) → maiuscolo; altrimenti capitalizza.
  return token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
};

/**
 * Take the pressed key array and return the readable string for the keys
 *
 * @param {Array} [keys=[]]
 * @returns {string} string representation of an array of keys (in italiano)
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
