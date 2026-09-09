import * as React from 'react';
import { Label } from '../Label';
import { Input } from '../Input';
import { cn } from '../../lib/utils';

// Short names for the keys that are not a letter or a digit, kept short because
// the input is narrow; the arrows are drawn as symbols.
//
// This is the third copy of this list in the repository, and the three used to
// disagree: "PgSu" here, "Page up" in platform/ui, "PgUp" in the toolbar, for
// one key. They say the same thing now.
const HOTKEY_KEY_LABELS: Record<string, string> = {
  space: 'Space',
  spacebar: 'Space',
  esc: 'Esc',
  escape: 'Esc',
  enter: 'Enter',
  return: 'Enter',
  tab: 'Tab',
  backspace: '⌫',
  del: 'Del',
  delete: 'Del',
  up: '↑',
  down: '↓',
  left: '←',
  right: '→',
  pageup: 'PgUp',
  pagedown: 'PgDn',
  home: 'Home',
  end: 'End',
  shift: 'Shift',
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

// Turns the keys (an array, or a string that may carry '+') into a readable form for
// DISPLAY only. What is saved stays the key code.
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

  // A guard against dead hotkeys: if the field is unmounted while it has focus, because
  // the dialog was closed, onBlur may not fire and mousetrap would stay PAUSED, so no
  // shortcut would work at all until a reload. Unmounting always puts mousetrap back.
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
        placeholder={isRecording ? 'Press the keys...' : formatHotkeyValue(placeholder)}
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
