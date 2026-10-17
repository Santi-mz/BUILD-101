import { redirect } from "next/navigation";

// El perfil ahora vive en /resultado (devolución de la Parte 1 + caminos de la Parte 2).
export default function Perfil() {
  redirect("/resultado");
}
