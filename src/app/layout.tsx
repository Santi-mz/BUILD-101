import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { supabaseServer } from "@/lib/supabase/server";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Rumbo · Orientación vocacional con IA",
  description: "Un agente que te entrevista, se respalda en evidencia de PubMed y te arma un perfil vocacional con oportunidades reales.",
};

async function NavLinks() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? (
    <>
      <Link href="/perfil" className="text-muted hover:text-foreground">Mi perfil</Link>
      <Link href="/chat" className="rounded-full bg-accent px-4 py-1.5 font-medium text-background">Chat</Link>
      <form action="/auth/signout" method="post">
        <button className="text-muted hover:text-foreground">Salir</button>
      </form>
    </>
  ) : (
    <Link href="/login" className="rounded-full bg-accent px-4 py-1.5 font-medium text-background">Entrar</Link>
  );
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">
        <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur">
          <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-semibold tracking-tight">
              Rumbo<span className="text-accent">.</span>
            </Link>
            <div className="flex items-center gap-4 text-sm">
              <Link href="/#feed" className="text-muted hover:text-foreground">Noticias</Link>
              <Suspense><NavLinks /></Suspense>
            </div>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-border py-6 text-center text-xs text-muted">
          Rumbo no reemplaza a un profesional de la orientación. Evidencia: PubMed (NCBI). Hecho en Build 101 · Montevideo.
        </footer>
      </body>
    </html>
  );
}
