import React from 'react';
import { ToolButton } from '@ohif/ui-next';
import { useSystem } from '@ohif/core';

/**
 * Wrapper di ToolButton che accoda DINAMICAMENTE al tooltip la scorciatoia da
 * tastiera corrente (letta dall'hotkeysManager). Così riflette anche le
 * scorciatoie personalizzate salvate dall'utente in Preferenze, invece di
 * mostrare valori fissi.
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
    // Bottone-strumento: la scorciatoia è il setToolActive(Toolbar) con
    // toolName === id del bottone (es. id 'Zoom' → hotkey toolName 'Zoom').
    // Si matcha SOLO per toolName: i tool button condividono lo STESSO
    // commandName ('setToolActiveToolbar'), quindi un match per solo-commandName
    // darebbe a TUTTI la prima scorciatoia (era il bug: tutti mostravano "Z").
    match = list.find(
      d =>
        (d.commandName === 'setToolActiveToolbar' || d.commandName === 'setToolActive') &&
        d.commandOptions?.toolName === props.id
    );
  } else if (commandName) {
    // Bottone-azione: match per commandName (e toolName se specificato).
    match = list.find(d => {
      if (d.commandName !== commandName) {
        return false;
      }
      const wantTool = commandOptions?.toolName;
      return !wantTool || d.commandOptions?.toolName === wantTool;
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
