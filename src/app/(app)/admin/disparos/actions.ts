"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { exigirAdminAcao } from "@/lib/admin-acesso";
import { ETAPAS, ORIGENS } from "@/lib/leads";
import { leadsDoFiltro, lerFiltro, type FiltroDisparo } from "@/lib/disparos";

type Resultado = { error: string } | { success: true };

const LIMITE_POR_DISPARO = 1000;

export async function contarPublico(filtro: FiltroDisparo): Promise<{ total: number } | { error: string }> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const leads = await leadsDoFiltro(lerFiltro(filtro));
  return { total: leads.length };
}

const criarSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao disparo.").max(80),
  texto: z.string().trim().min(5, "Escreva a mensagem.").max(1500, "A mensagem passou de 1500 letras."),
  filtro: z.object({ etapas: z.array(z.enum(ETAPAS)), origens: z.array(z.enum(ORIGENS)) }),
});
export type NovoDisparo = z.input<typeof criarSchema>;

/** Cria a campanha e coloca cada lead na fila; a rotina de 5 minutos manda aos poucos. */
export async function criarDisparo(dados: NovoDisparo): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const p = criarSchema.safeParse(dados);
  if (!p.success) return { error: p.error.issues[0]?.message ?? "Dados inválidos." };
  const filtro = lerFiltro(p.data.filtro);
  if (filtro.etapas.length === 0 || filtro.origens.length === 0) return { error: "Escolha pelo menos uma etapa e uma origem." };

  const db = createAdminClient();
  const { data: config } = await db.from("plataforma_config").select("disparo_url, disparo_token").eq("id", 1).maybeSingle();
  if (!config?.disparo_url || !config?.disparo_token) return { error: "Configure o servidor e o token em Admin › Plataforma antes de disparar." };

  const leads = await leadsDoFiltro(filtro);
  if (leads.length === 0) return { error: "Nenhum lead recebe com esses filtros." };
  if (leads.length > LIMITE_POR_DISPARO) return { error: `São ${leads.length} leads: o máximo por disparo é ${LIMITE_POR_DISPARO}. Refine os filtros.` };

  const { data: disparo, error } = await db
    .from("disparos")
    .insert({ nome: p.data.nome, texto: p.data.texto, filtro, total: leads.length })
    .select("id")
    .single();
  if (error || !disparo) return { error: "Não foi possível criar o disparo." };

  for (let i = 0; i < leads.length; i += 200) {
    const { error: erroFila } = await db
      .from("disparo_envios")
      .insert(leads.slice(i, i + 200).map((l) => ({ disparo_id: disparo.id, lead_id: l.id, telefone: l.telefone })));
    if (erroFila) {
      await db.from("disparos").delete().eq("id", disparo.id);
      return { error: "Não foi possível montar a fila de envio." };
    }
  }
  revalidatePath("/admin/disparos");
  return { success: true };
}

export async function pausarDisparo(id: string, pausar: boolean): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const { error } = await createAdminClient()
    .from("disparos")
    .update({ status: pausar ? "pausado" : "enviando" })
    .eq("id", id)
    .in("status", ["enviando", "pausado"]);
  if (error) return { error: "Não foi possível alterar o disparo." };
  revalidatePath("/admin/disparos");
  return { success: true };
}

/** Para de vez: quem ainda estava na fila não recebe. */
export async function cancelarDisparo(id: string): Promise<Resultado> {
  if (!(await exigirAdminAcao())) return { error: "Sem permissão." };
  const db = createAdminClient();
  await db.from("disparo_envios").update({ status: "ignorado", erro: "Disparo cancelado." }).eq("disparo_id", id).eq("status", "pendente");
  const { error } = await db
    .from("disparos")
    .update({ status: "cancelado", concluido_em: new Date().toISOString() })
    .eq("id", id)
    .in("status", ["enviando", "pausado"]);
  if (error) return { error: "Não foi possível cancelar." };
  revalidatePath("/admin/disparos");
  return { success: true };
}
