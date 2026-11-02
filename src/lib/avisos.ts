import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Avisos modulares do WhatsApp de cada petshop: confirmação pré-ativada,
 * lembretes automáticos em quantos horários ele quiser e texto dos botões.
 * Puro: roda no servidor (envio) e no navegador (telas).
 */

export type LembreteConfig = { horas: number; ativo: boolean };

export type AvisosConfig = {
  confirmacao_ativa: boolean;
  lembretes: LembreteConfig[];
  botao_confirmar: string;
  botao_cancelar: string;
  /** null = texto padrão do BubblePet. */
  rodape: string | null;
  janela_inicio: number;
  janela_fim: number;
};

export const RODAPE_PADRAO = "Ou responda 1 para confirmar, 2 para cancelar.";
export const MAX_LEMBRETES = 4;
export const MAX_HORAS_ANTES = 72;
export const LIMITE_BOTAO = 20;

export const AVISOS_PADRAO: AvisosConfig = {
  confirmacao_ativa: true,
  lembretes: [
    { horas: 24, ativo: true },
    { horas: 4, ativo: false },
  ],
  botao_confirmar: "Confirmar",
  botao_cancelar: "Cancelar",
  rodape: null,
  janela_inicio: 8,
  janela_fim: 20,
};

/** Lista de lembretes limpa: horas inteiras de 1 a 72, sem repetir, no máximo 4, do mais longe pro mais perto. */
export function lerLembretes(raw: unknown): LembreteConfig[] {
  if (!Array.isArray(raw)) return AVISOS_PADRAO.lembretes;
  const vistos = new Set<number>();
  const lista: LembreteConfig[] = [];
  for (const item of raw) {
    const horas = Number((item as { horas?: unknown })?.horas);
    if (!Number.isInteger(horas) || horas < 1 || horas > MAX_HORAS_ANTES || vistos.has(horas)) continue;
    vistos.add(horas);
    lista.push({ horas, ativo: (item as { ativo?: unknown }).ativo === true });
  }
  return lista.sort((a, b) => b.horas - a.horas).slice(0, MAX_LEMBRETES);
}

/** Horas dos lembretes ligados, ex.: [24, 4]. */
export function horasAtivas(config: Pick<AvisosConfig, "lembretes">): number[] {
  return config.lembretes.filter((l) => l.ativo).map((l) => l.horas);
}

/** Lembretes guardados no agendamento ({"lembretes":[24,4]}); null = agendamento antigo, sem automático. */
export function lembretesDoAgendamento(avisos: unknown): number[] | null {
  if (!avisos || typeof avisos !== "object") return null;
  const lista = (avisos as { lembretes?: unknown }).lembretes;
  if (!Array.isArray(lista)) return null;
  return lista.map(Number).filter((h) => Number.isInteger(h) && h >= 1 && h <= MAX_HORAS_ANTES);
}

export function rotuloHoras(horas: number): string {
  if (horas % 24 === 0) {
    const dias = horas / 24;
    return dias === 1 ? "1 dia antes" : `${dias} dias antes`;
  }
  return horas === 1 ? "1 hora antes" : `${horas} horas antes`;
}

export async function carregarAvisosConfig(supabase: SupabaseClient, petshopId: string): Promise<AvisosConfig> {
  const { data } = await supabase.from("avisos_config").select("*").eq("petshop_id", petshopId).maybeSingle();
  if (!data) return AVISOS_PADRAO;
  return {
    confirmacao_ativa: data.confirmacao_ativa ?? true,
    lembretes: lerLembretes(data.lembretes),
    botao_confirmar: data.botao_confirmar || AVISOS_PADRAO.botao_confirmar,
    botao_cancelar: data.botao_cancelar || AVISOS_PADRAO.botao_cancelar,
    rodape: data.rodape ?? null,
    janela_inicio: data.janela_inicio ?? AVISOS_PADRAO.janela_inicio,
    janela_fim: data.janela_fim ?? AVISOS_PADRAO.janela_fim,
  };
}
