import { mock } from "@/lib/llm/provider";
import { greet, newSession, runTurn } from "@/lib/engine/turn";
import type { SessionState } from "@/lib/engine/types";

export const provider = mock();

export async function start(ageRange: SessionState["ageRange"] = "A18_21") {
  const s = newSession({ ageRange, guardianConsent: false, model: provider.model });
  await greet(provider, s);
  return s;
}

/** Corre una conversación y devuelve el estado y las respuestas del agente. */
export async function talk(s: SessionState, lines: string[]) {
  const replies: { text: string; action: string }[] = [];
  for (const l of lines) {
    const out = await runTurn(provider, s, l);
    replies.push({ text: out.reply, action: out.action.type });
  }
  return replies;
}
