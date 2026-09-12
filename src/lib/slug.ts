export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Pet Shop do João" -> "pet-shop-do-joao" */
export function slugify(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}

export function slugValido(slug: string): boolean {
  return slug.length >= 3 && slug.length <= 40 && SLUG_RE.test(slug);
}
