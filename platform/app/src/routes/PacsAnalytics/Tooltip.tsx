import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Layer UNICO per i tooltip moderni della dashboard PACS Analytics.
 *
 * Sostituisce i tooltip nativi del browser (attributo `title` HTML e `<title>` SVG),
 * che hanno stile di sistema, comparsa lenta e vengono tagliati dagli `overflow`.
 *
 * Uso: mettere `data-tip="testo"` (o `data-tip={espressione}`) su QUALSIASI elemento,
 * HTML o SVG. Il layer, montato una sola volta alla radice, intercetta il movimento del
 * mouse, trova l'elemento con `data-tip` più vicino e mostra un tooltip flottante
 * (portal su <body>, `position: fixed`) che segue il cursore e si ribalta ai bordi.
 */
export function TooltipLayer() {
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const place = (x: number, y: number) => {
      const t = tipRef.current;
      if (!t) {
        return;
      }
      const r = t.getBoundingClientRect();
      const pad = 12;
      let left = x + 16;
      let top = y + 18;
      // Ribalta se sborda a destra / in basso, poi clampa dentro il viewport.
      if (left + r.width + pad > window.innerWidth) {
        left = x - r.width - 16;
      }
      if (top + r.height + pad > window.innerHeight) {
        top = y - r.height - 18;
      }
      t.style.left = `${Math.max(pad, left)}px`;
      t.style.top = `${Math.max(pad, top)}px`;
    };

    // Un solo listener mousemove gestisce comparsa, aggiornamento posizione e scomparsa:
    // ad ogni movimento cerca l'elemento con data-tip sotto il cursore.
    const onMove = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const el = target && target.closest ? target.closest('[data-tip]') : null;
      const txt = el ? el.getAttribute('data-tip') || '' : '';
      if (!txt) {
        setText(prev => (prev == null ? prev : null));
        return;
      }
      setText(prev => (prev === txt ? prev : txt));
      place(e.clientX, e.clientY);
    };
    const hide = () => setText(null);

    document.addEventListener('mousemove', onMove);
    // Nasconde su scroll (evita posizioni "congelate") e quando la finestra perde il focus.
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('blur', hide);
    };
  }, []);

  if (typeof document === 'undefined' || !document.body) {
    return null;
  }
  return createPortal(
    <div
      ref={tipRef}
      className="pa-tip"
      style={{ opacity: text ? 1 : 0 }}
      aria-hidden="true"
    >
      {text}
    </div>,
    document.body
  );
}
