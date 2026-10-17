import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Una sesión anónima no se puede recuperar después de salir: primero se avisa en /salir.
  const form = await req.formData().catch(() => null);
  if (user?.is_anonymous && form?.get("confirm") !== "1") {
    return NextResponse.redirect(new URL("/salir", req.url), { status: 303 });
  }
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", req.url), { status: 303 });
}
