import * as React from 'react';
import { Label } from '../Label';
import { Input } from '../Input';
import { cn } from '../../lib/utils';

// Etichette in italiano per i tasti speciali nel pannello scorciatoie. Brevi,
// perché l'input è stretto: per le frecce uso i simboli ↑↓←→.
const HOTKEY_KEY_LABELS: Record<string, string> = {
  space: 'Spazio',
  spacebar: 'Spazio',
  esc: 'Esc',
  escape: 'Esc',
  enter: 'Invio',
  return: 'Invio',
  tab: 'Tab',
  backspace: '⌫',
  del: 'Canc',
  delete: 'Canc',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  pageup: 'PgSu',
  pagedown: 'PgGiù',
  home: 'Inizio',
  end: 'Fine',
  shift: 'Maiusc',
  ctrl: 'Ctrl',
  control: 'Ctrl',
  alt: 'Alt',
  option: 'Alt',
  cmd: 'Cmd',
  command: 'Cmd',
  meta: 'Cmd',
};

function translateHotkeyToken(token: string): string {
  const lower = String(token).toLowerCase().trim();
  if (HOTKEY_KEY_LABELS[lower]) {
    return HOTKEY_KEY_LABELS[lower];
  }
  return token.length === 1 ? token.toUpperCase() : token;
}

// Converte i tasti (array o stringa, eventualmente con '+') nella forma italiana
// leggibile per la sola VISUALIZZAZIONE (il valore salvato resta il codice tasto).
function formatHotkeyValue(value?: string | string[]): string {
  if (value === undefined || value === null) {
    return '';
  }
  const arr = Array.isArray(value) ? value : [String(value)];
  return arr
    .map(k => String(k).split('+').map(translateHotkeyToken).join('+'))
    .join('+');
}

interface UserPreferencesModalProps {
  children: React.ReactNode;
  className?: string;
}

export function UserPreferencesModal({ children, className }: UserPreferencesModalProps) {
  return (
    <div className={cn('flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden', className)}>
      {children}
    </div>
  );
}

/** Body
 *  Automatically wraps content in a scrollable area.
 */
interface BodyProps {
  children: React.ReactNode;
  className?: string;
}
function Body({ children, className }: BodyProps) {
  return (
    <div className={cn('flex-1 overflow-y-auto', className)}>
      <div className={cn('mt-1 mb-4 flex flex-col space-y-4', className)}>{children}</div>
    </div>
  );
}

/** Subheading
 *  Section labels
 */
interface SubHeadingProps {
  children: React.ReactNode;
  className?: string;
}
function SubHeading({ children, className }: SubHeadingProps) {
  return <span className={cn('text-muted-foreground text-lg', className)}>{children}</span>;
}

/** Responsive 3-column grid for hotkeys, etc. */
interface HotkeysGridProps {
  children: React.ReactNode;
  className?: string;
}
function HotkeysGrid({ children, className }: HotkeysGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3 gap-x-8 pr-2 md:grid-cols-2 lg:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  );
}

/** A single hotkey row: label + input */
interface HotkeyProps {
  label: string;
  placeholder?: string | string[];
  className?: string;
  value?: string | string[];
  onChange?: (value: string) => void;
  hotkeys?: {
    record: (callback: (sequence: string[]) => void) => void;
    pause: () => void;
    unpause: () => void;
    startRecording: () => void;
  };
}

function Hotkey({ label, placeholder, className, value, onChange, hotkeys }: HotkeyProps) {
  const [isRecording, setIsRecording] = React.useState(false);

  // Sicurezza anti-"hotkey morte": se il campo viene smontato (modal chiuso)
  // mentre era a fuoco, onBlur potrebbe non scattare e mousetrap resterebbe in
  // PAUSA → nessuna scorciatoia funzionerebbe più finché non si ricarica. Allo
  // smontaggio ripristiniamo sempre mousetrap.
  React.useEffect(() => {
    return () => {
      hotkeys?.unpause?.();
    };
  }, [hotkeys]);

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    event.preventDefault();
    hotkeys?.record((sequence: string[]) => {
      const keys = sequence.join('+');
      hotkeys?.unpause();
      setIsRecording(false);
      onChange?.(keys);
    });
  };

  const onFocus = () => {
    setIsRecording(true);
    hotkeys?.pause();
    hotkeys?.startRecording();
  };

  const onBlur = () => {
    setIsRecording(false);
    hotkeys?.unpause();
  };

  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <Label className="min-w-0 flex-1 leading-tight">{label}</Label>
      <Input
        className={cn(
          'w-16 shrink-0 text-center transition-colors',
          isRecording && 'bg-accent text-accent-foreground caret-accent-foreground'
        )}
        placeholder={isRecording ? 'Premi i tasti...' : formatHotkeyValue(placeholder)}
        value={formatHotkeyValue(value)}
        onKeyDown={onInputKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        readOnly={!isRecording}
      />
    </div>
  );
}

/** Attach subcomponents as static properties for a nicer API */
UserPreferencesModal.Body = Body;
UserPreferencesModal.HotkeysGrid = HotkeysGrid;
UserPreferencesModal.Hotkey = Hotkey;
UserPreferencesModal.SubHeading = SubHeading;
