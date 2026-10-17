import { Suspense } from "react";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Chat from "./chat";

async function ChatPageInner() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <Chat />;
}

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="p-10 text-center text-sm text-muted">Cargando…</p>}>
      <ChatPageInner />
    </Suspense>
  );
}
