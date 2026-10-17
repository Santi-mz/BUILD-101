import { GoogleGenAI } from "@google/genai";
import { connectMcp, LOCAL_TOOLS } from "@/lib/agent/run";
import { LIVE_MODEL, liveInstruction } from "@/lib/agent/live";
import type { ProfileData } from "@/lib/profile";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Da al navegador un token temporal de un solo uso para Gemini Live (la clave nunca sale del servidor),
 * junto con las instrucciones y las herramientas del agente.
 */
export async function POST() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "No autorizado" }, { status: 401 });

  const admin = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY ?? process.env.keyvercel, httpOptions: { apiVersion: "v1alpha" } });
  const [token, mcp, { data: prof }] = await Promise.all([
    admin.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60_000).toISOString(),
        httpOptions: { apiVersion: "v1alpha" },
      },
    }),
    connectMcp(user.id, supabase),
    supabase.from("profiles").select("data").eq("user_id", user.id).maybeSingle(),
  ]);
  await mcp.close();
  const p = prof?.data as ProfileData | null;
  const summary = p?.riasec ? JSON.stringify({ riasec: p.riasec, resumen: p.summary, temas_cubiertos: p.covered ?? [] }) : "";

  return Response.json({
    token: token.name,
    model: LIVE_MODEL,
    systemInstruction: liveInstruction(summary),
    tools: [...mcp.declarations, ...LOCAL_TOOLS.filter((t) => t.name !== "offer_choices" && t.name !== "share_insight")],
  });
}
