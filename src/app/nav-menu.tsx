"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Todas las zonas táctiles miden 44 px de alto (h-11); los botones verdes se ven más chicos por dentro.
const FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background";
const TEXT_LINK = `relative inline-flex h-11 items-center rounded-full px-3 text-sm text-muted transition hover:text-foreground aria-[current=page]:font-medium aria-[current=page]:text-foreground after:absolute after:inset-x-3 after:bottom-1.5 after:h-0.5 after:rounded-full after:bg-accent after:opacity-0 aria-[current=page]:after:opacity-100 ${FOCUS}`;
const PILL_LINK = `group inline-flex h-11 items-center rounded-full ${FOCUS}`;
const PILL = "rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-background transition group-hover:opacity-90 group-aria-[current=page]:ring-2 group-aria-[current=page]:ring-accent/30 group-aria-[current=page]:ring-offset-2 group-aria-[current=page]:ring-offset-background";
const MENU_ROW = `flex h-12 w-full items-center rounded-xl px-4 text-left text-base transition hover:bg-accent-soft aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-accent ${FOCUS}`;

function current(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined;
}

/** Lo que se ve mientras se lee la sesión: solo lo que comparten ambos estados, para que nada aparezca y desaparezca. */
export function NavFallback() {
  return (
    <div className="hidden sm:flex">
      <Link href="/#feed" className={TEXT_LINK}>Noticias</Link>
    </div>
  );
}

export function SiteNav({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  // Guardar en qué ruta se abrió cierra el menú solo al navegar (incluido atrás/adelante).
  const open = openOn === pathname;
  const close = () => setOpenOn(null);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenOn(null);
        button.current?.focus();
      }
    };
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpenOn(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (!signedIn) {
    return (
      <div className="flex items-center gap-1">
        <Link href="/#feed" className={`${TEXT_LINK} max-sm:hidden`}>Noticias</Link>
        <Link href="/resultado" aria-current={current(pathname, "/resultado")} className={`${TEXT_LINK} max-sm:hidden`}>Mi devolución</Link>
        <Link href="/login" aria-current={current(pathname, "/login")} className={TEXT_LINK}>Entrar</Link>
        <Link href="/chat" aria-current={current(pathname, "/chat")} className={PILL_LINK}>
          <span className={PILL}>Explorar</span>
        </Link>
      </div>
    );
  }

  return (
    <div ref={root} className="flex items-center gap-1">
      <div className="hidden items-center gap-1 sm:flex">
        <Link href="/#feed" className={TEXT_LINK}>Noticias</Link>
        <Link href="/resultado" aria-current={current(pathname, "/resultado")} className={TEXT_LINK}>Mi devolución</Link>
      </div>
      <Link href="/chat" aria-current={current(pathname, "/chat")} className={`${PILL_LINK} ml-1`}>
        <span className={PILL}>Explorar</span>
      </Link>
      <span aria-hidden className="mx-2 hidden h-5 w-px bg-border sm:block" />
      <form action="/auth/signout" method="post" className="hidden sm:block">
        <button className={TEXT_LINK}>Salir</button>
      </form>

      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="menu-movil"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        onClick={() => setOpenOn(open ? null : pathname)}
        className={`-mr-2 inline-flex h-11 w-11 items-center justify-center rounded-full transition hover:bg-accent-soft sm:hidden ${FOCUS}`}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {/* Panel superpuesto: no empuja el contenido ni cambia el alto del header. */}
      <div
        id="menu-movil"
        hidden={!open}
        className="absolute inset-x-0 top-full border-b border-border bg-background px-4 pb-4 pt-2 shadow-lg sm:hidden"
      >
        <ul className="space-y-1">
          <li><Link href="/#feed" onClick={close} className={MENU_ROW}>Noticias</Link></li>
          <li><Link href="/resultado" onClick={close} aria-current={current(pathname, "/resultado")} className={MENU_ROW}>Mi devolución</Link></li>
          <li><Link href="/chat" onClick={close} aria-current={current(pathname, "/chat")} className={MENU_ROW}>Explorar</Link></li>
        </ul>
        <form action="/auth/signout" method="post" className="mt-2 border-t border-border pt-2">
          <button className={`${MENU_ROW} text-muted`}>Salir</button>
        </form>
      </div>
    </div>
  );
}
