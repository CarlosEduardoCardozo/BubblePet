import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

// Um cookie por petshop. Depois do primeiro código, o celular fica lembrado
// por 180 dias: o tutor volta pelo link e já cai na tela de agendar. "Sair"
// apaga o cookie.
const PREFIXO = "bp_agendar_";
const DURACAO_SEG = 180 * 24 * 60 * 60;

function nomeCookie(slug: string): string {
  return PREFIXO + slug.replace(/[^a-z0-9-]/g, "");
}

export type SessaoTutor = { tutorId: string; petshopId: string; slug: string };

function segredo(): Uint8Array {
  const raw = process.env.AGENDAR_SESSION_SECRET;
  if (!raw) throw new Error("AGENDAR_SESSION_SECRET não configurado.");
  return new TextEncoder().encode(raw);
}

/** Só pode ser chamado de Server Action / Route Handler (cookies().set). */
export async function criarSessaoTutor(sessao: SessaoTutor): Promise<void> {
  const token = await new SignJWT(sessao)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SEG}s`)
    .sign(segredo());

  const store = await cookies();
  store.set({
    name: nomeCookie(sessao.slug),
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/agendar",
    maxAge: DURACAO_SEG,
  });
}

export async function encerrarSessaoTutor(slug: string): Promise<void> {
  const store = await cookies();
  store.set({ name: nomeCookie(slug), value: "", path: "/agendar", maxAge: 0 });
}

/**
 * Sessão do tutor pra este slug. Rejeita o cookie de outro petshop — é isso
 * que impede reuso entre tenants, já que o cookie vale pra todo /agendar.
 */
export const getSessaoTutor = cache(async (slug: string): Promise<SessaoTutor | null> => {
  const store = await cookies();
  const token = store.get(nomeCookie(slug))?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, segredo(), { algorithms: ["HS256"] });
    if (payload.slug !== slug) return null;
    if (typeof payload.tutorId !== "string" || typeof payload.petshopId !== "string") return null;
    return { tutorId: payload.tutorId, petshopId: payload.petshopId, slug };
  } catch {
    return null;
  }
});
