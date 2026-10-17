import type { Metadata } from "next";
import Chat from "./chat";

export const metadata: Metadata = { title: "Charla · Conectate con tu futuro" };

// Sin login: la sesión es anónima (cookie con id aleatorio). La cuenta es opcional y solo ordena el feed.
export default function ChatPage() {
  return <Chat />;
}
