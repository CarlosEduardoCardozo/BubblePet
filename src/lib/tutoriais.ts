/**
 * Tutoriais em vídeo: catálogo de funcionalidades (tópicos) e conversão do
 * link do vídeo em player. Puro: roda no servidor e no navegador.
 */

export type Topico = {
  chave: string;
  titulo: string;
  /** Telas do painel que mostram o ícone de dúvida deste tópico. */
  rotas: string[];
};

/** Ordem em que aparecem na página de tutoriais. */
export const TOPICOS: Topico[] = [
  { chave: "primeiros-passos", titulo: "Primeiros passos", rotas: [] },
  { chave: "inicio", titulo: "Início", rotas: ["/dashboard"] },
  { chave: "hoje", titulo: "Hoje", rotas: ["/hoje"] },
  { chave: "agenda", titulo: "Agenda", rotas: ["/agenda"] },
  { chave: "clientes", titulo: "Clientes e pets", rotas: ["/tutores-pets"] },
  { chave: "oportunidades", titulo: "Oportunidades", rotas: ["/oportunidades"] },
  { chave: "fidelidade", titulo: "Fidelidade", rotas: ["/fidelidade"] },
  { chave: "planos", titulo: "Planos", rotas: ["/planos"] },
  { chave: "servicos", titulo: "Serviços", rotas: ["/servicos"] },
  { chave: "estoque", titulo: "Estoque", rotas: ["/estoque"] },
  { chave: "financeiro", titulo: "Financeiro", rotas: ["/financeiro"] },
  { chave: "relatorios", titulo: "Relatórios", rotas: ["/relatorios"] },
  { chave: "mensagens", titulo: "Mensagens do WhatsApp", rotas: ["/configuracoes/mensagens"] },
  { chave: "configuracoes", titulo: "Configurações e WhatsApp", rotas: ["/configuracoes"] },
  { chave: "equipe", titulo: "Equipe e permissões", rotas: ["/equipe"] },
  { chave: "link-agendamento", titulo: "Link de agendamento do tutor", rotas: [] },
];

export const CHAVES_TOPICO = TOPICOS.map((t) => t.chave);

export function tituloDoTopico(chave: string): string {
  return TOPICOS.find((t) => t.chave === chave)?.titulo ?? chave;
}

/** Tópico da tela atual: a rota mais específica que bate com o endereço. */
export function topicoDaRota(pathname: string): string | null {
  let melhor: { chave: string; tamanho: number } | null = null;
  for (const t of TOPICOS) {
    for (const r of t.rotas) {
      if ((pathname === r || pathname.startsWith(`${r}/`)) && (!melhor || r.length > melhor.tamanho)) {
        melhor = { chave: t.chave, tamanho: r.length };
      }
    }
  }
  return melhor?.chave ?? null;
}

export type Tutorial = {
  id: string;
  topico: string;
  titulo: string;
  descricao: string | null;
  videoUrl: string;
  duracao: string | null;
  ordem: number;
};

export type Player =
  | { tipo: "iframe"; src: string; miniatura: string | null }
  | { tipo: "video"; src: string; miniatura: null };

/**
 * Converte o link colado pelo admin no player embutido. Aceita YouTube
 * (watch, youtu.be, shorts, embed), Vimeo, Loom, Google Drive e arquivo de
 * vídeo direto (.mp4/.webm). Link desconhecido → null.
 */
export function playerDoVideo(url: string): Player | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] || null;
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,})/);
      id = m?.[1] ?? null;
    }
    if (!id || !/^[\w-]{6,20}$/.test(id)) return null;
    return {
      tipo: "iframe",
      src: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`,
      miniatura: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }

  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(\d{6,})(?:\/([\da-f]+))?/);
    if (!m) return null;
    const hash = m[2] ?? u.searchParams.get("h");
    return {
      tipo: "iframe",
      src: `https://player.vimeo.com/video/${m[1]}?autoplay=1${hash ? `&h=${hash}` : ""}`,
      miniatura: null,
    };
  }

  if (host === "loom.com") {
    const m = u.pathname.match(/\/(?:share|embed)\/([\da-f]{20,})/);
    if (!m) return null;
    return { tipo: "iframe", src: `https://www.loom.com/embed/${m[1]}?autoplay=1`, miniatura: null };
  }

  if (host === "drive.google.com") {
    const m = u.pathname.match(/\/file\/d\/([\w-]{10,})/) ?? [null, u.searchParams.get("id")];
    if (!m[1]) return null;
    return { tipo: "iframe", src: `https://drive.google.com/file/d/${m[1]}/preview`, miniatura: null };
  }

  if (/\.(mp4|webm|mov)$/i.test(u.pathname)) return { tipo: "video", src: u.toString(), miniatura: null };

  return null;
}

/** Lê as linhas do banco no formato da tela, descartando links que não tocam. */
export function lerTutoriais(
  rows: {
    id: string;
    topico: string;
    titulo: string;
    descricao: string | null;
    video_url: string;
    duracao: string | null;
    ordem: number;
  }[]
): Tutorial[] {
  return rows
    .filter((r) => playerDoVideo(r.video_url))
    .map((r) => ({
      id: r.id,
      topico: r.topico,
      titulo: r.titulo,
      descricao: r.descricao,
      videoUrl: r.video_url,
      duracao: r.duracao,
      ordem: r.ordem,
    }))
    .sort((a, b) => a.ordem - b.ordem || a.titulo.localeCompare(b.titulo, "pt-BR"));
}
