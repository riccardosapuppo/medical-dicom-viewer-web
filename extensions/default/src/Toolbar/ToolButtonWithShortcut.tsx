import React from 'react';
import { ToolButton } from '@ohif/ui-next';
import { useSystem } from '@ohif/core';

/**
 * A wrapper around ToolButton that appends the current keyboard shortcut to the tooltip
 * DYNAMICALLY, read from the hotkeysManager. So it also reflects the custom shortcuts a
 * reader has saved in Preferences, instead of showing fixed values.
 */

// Etichette leggibili per i tasti speciali.
const KEY_LABELS: Record<string, string> = {
  space: 'Spazio',
  esc: 'Esc',
  enter: 'Invio',
  backspace: '⌫',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  pageup: 'PgSu',
  pagedown: 'PgGiù',
  home: 'Inizio',
  end: 'Fine',
};

function formatKey(key: string): string {
  if (!key) {
    return '';
  }
  const lower = String(key).toLowerCase();
  if (KEY_LABELS[lower]) {
    return KEY_LABELS[lower];
  }
  return key.length === 1 ? key.toUpperCase() : key;
}

function normalizeCommand(commands: any): { commandName?: string; commandOptions?: any } {
  if (!commands) {
    return {};
  }
  if (typeof commands === 'string') {
    return { commandName: commands };
  }
  if (Array.isArray(commands)) {
    const first = commands[0];
    return typeof first === 'string' ? { commandName: first } : first || {};
  }
  return commands;
}

export function getShortcut(props: any, hotkeysManager: any): string | null {
  const defs = hotkeysManager?.hotkeyDefinitions;
  if (!defs) {
    return null;
  }
  const list: any[] = Object.values(defs);
  const { commandName, commandOptions } = normalizeCommand(props.commands);

  const isToolButton =
    commandName === 'setToolActiveToolbar' ||
    commandName === 'setToolActive' ||
    props.type === 'tool';

  let match: any;

  if (isToolButton) {
    // A tool button: its shortcut is the setToolActive(Toolbar) whose toolName is the
    // button's id ('Zoom' gives the hotkey with toolName 'Zoom'). Matched on toolName
    // ALONE: the tool buttons all share the SAME commandName
    // ('setToolActiveToolbar'), so matching on commandName alone would give every one of
    // them the first shortcut. That was the bug where they all showed "Z".
    match = list.find(
      d =>
        (d.commandName === 'setToolActiveToolbar' || d.commandName === 'setToolActive') &&
        d.commandOptions?.toolName === props.id
    );
  } else if (commandName) {
    // An action button: matched on commandName, and on toolName when there is one.
    //
    // One command can serve several buttons: toggleEnabledDisabledToolbar turns the
    // reference lines on and the scale as well, telling them apart by itemId. But the
    // button passes the command as a bare string with no options, so comparing on
    // commandName alone found the first shortcut in the list and showed it to both: the
    // scale claimed shift+l, which turns something else on.
    //
    // When the shortcut says which item it belongs to, that item has to be this button.
    const idBottone = commandOptions?.itemId ?? props.id;
    match = list.find(d => {
      if (d.commandName !== commandName) {
        return false;
      }
      const wantTool = commandOptions?.toolName;
      if (wantTool && d.commandOptions?.toolName !== wantTool) {
        return false;
      }
      const suQuale = d.commandOptions?.itemId;
      return !suQuale || suQuale === idBottone;
    });
  }

  const keys = match?.keys;
  if (!keys) {
    return null;
  }
  const arr = Array.isArray(keys) ? keys : [keys];
  const formatted = arr.map(formatKey).filter(Boolean).join('+');
  return formatted || null;
}

export default function ToolButtonWithShortcut(props: any) {
  const system = useSystem();
  const hotkeysManager = system?.hotkeysManager;

  let tooltip = props.tooltip;
  try {
    const shortcut = getShortcut(props, hotkeysManager);
    const base = props.tooltip || props.label;
    if (shortcut && base) {
      tooltip = `${base} (${shortcut})`;
    }
  } catch (e) {
    /* in caso di problemi, lascia il tooltip originale */
  }

  return <ToolButton {...props} tooltip={tooltip} />;
}
