/**
 * Registro de eventos técnicos SIN PII ni texto de la persona (blueprint, sección 16).
 * Solo ids, tipos, contadores y estados.
 */
export type EventName =
  | "session.created"
  | "message.received"
  | "safety.stop"
  | "profile.updated"
  | "profile.corrected"
  | "level.summarized"
  | "level.confirmed"
  | "profile.closed"
  | "opportunity.task.started"
  | "opportunity.checked"
  | "recommendations.created"
  | "recommendations.rejected"
  | "path.selected"
  | "path.question"
  | "mentor.consent.required"
  | "mentor.consent.granted"
  | "mentor.search.demo"
  | "next_step.chosen"
  | "deletion.completed"
  | "agent.fallback";

const recent: { name: EventName; at: string; data: Record<string, unknown> }[] = [];

export function logEvent(name: EventName, data: Record<string, string | number | boolean | null | undefined> = {}) {
  const e = { name, at: new Date().toISOString(), data };
  recent.push(e);
  if (recent.length > 200) recent.shift();
  if (process.env.NODE_ENV !== "test") console.info(JSON.stringify({ event: name, ...data }));
}

export const recentEvents = () => [...recent];
