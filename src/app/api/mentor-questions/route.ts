import { fail } from "@/lib/api";
import { MENTOR_MESSAGING_ENABLED } from "@/lib/agents/mentors";

/**
 * submit_moderated_question: deshabilitado en el MVP hasta tener verificación de mentores,
 * moderación y revisión de privacidad. Nunca se transmite una pregunta sin revisión.
 */
export async function POST() {
  if (!MENTOR_MESSAGING_ENABLED) return fail(403, "disabled", "Las preguntas a personas reales todavía no están habilitadas.");
  return fail(501, "not_implemented", "Moderación pendiente.");
}
