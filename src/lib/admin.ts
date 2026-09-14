import "server-only";

/**
 * Quem administra o BubblePet (vê todas as contas e pode congelar). Lista
 * em ADMIN_EMAILS, separada por vírgula; sem a variável, só o dono.
 */
const PADRAO = ["carloscardozo.dev@gmail.com"];

export function emailsAdmin(): string[] {
  const raw = process.env.ADMIN_EMAILS;
  const lista = raw
    ? raw.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : PADRAO;
  return lista;
}

export function ehAdmin(email: string | null | undefined): boolean {
  return !!email && emailsAdmin().includes(email.trim().toLowerCase());
}
