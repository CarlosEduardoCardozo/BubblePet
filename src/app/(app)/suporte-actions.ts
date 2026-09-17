"use server";

import { redirect } from "next/navigation";
import { encerrarSuporte } from "@/lib/suporte";

export async function sairDoModoSuporte() {
  const destino = await encerrarSuporte();
  redirect(destino === "admin" ? "/admin" : "/login");
}
