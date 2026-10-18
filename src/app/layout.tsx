import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import { NavFallback, SiteNav } from "./nav-menu";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Conectate con tu futuro · Exploración vocacional con IA",
  description: "No elegimos tu futuro por vos. Te ayudamos a descubrir caminos, contrastarlos con información confiable y conversar con personas que los conocen.",
};

async function NavLinks() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return <SiteNav signedIn={!!user} />;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        {/* Fijo y fuera de la pantalla hasta recibir foco: no ocupa lugar ni cambia los 57 px del header. */}
        <a
          href="#contenido"
          className="fixed left-4 top-2 z-50 -translate-y-24 rounded-full bg-accent px-4 py-2.5 text-sm font-medium text-background shadow-lg outline-none focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Saltar al contenido
        </a>
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          {/* 56 px + 1 px de borde = 57 px: chat.tsx calcula su alto con ese valor. */}
          <nav aria-label="Principal" className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-4">
            <Link
              href="/"
              className="-ml-2 inline-flex h-11 items-center rounded-full px-2 text-lg font-semibold tracking-tight outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Rumbo<span className="text-accent">.</span>
            </Link>
            <Suspense fallback={<NavFallback />}>
              <NavLinks />
            </Suspense>
          </nav>
        </header>
        {/* tabIndex -1: Safari solo mueve el foco al destino del salto si el elemento es enfocable. */}
        <main id="contenido" tabIndex={-1} className="flex-1 outline-none">
          {children}
        </main>
        <footer className="border-t border-border py-6 text-center text-xs text-muted">
          Rumbo es una herramienta de exploración: no es un test ni reemplaza a un profesional de la orientación. Si estás pasando un momento difícil: Línea Vida 0800 0767 o *0767 (24 h). Hecho en Build 101 · Montevideo.
        </footer>
      </body>
    </html>
  );
}
