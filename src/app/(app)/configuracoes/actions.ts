"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { normalizePhoneBR } from "@/lib/phone";
import { slugValido } from "@/lib/slug";
import { mensagemErroBanco } from "@/lib/db-errors";
import {
  conectar,
  criarInstancia,
  desconectar,
  statusInstancia,
  UazapiError,
} from "@/lib/uazapi";
import { enviarMensagemWhatsapp, garantirWebhook, obterTokenWhatsapp } from "@/lib/whatsapp";
import { templateTeste } from "@/lib/whatsapp-templates";

type ActionResult = { error: string } | { success: true };

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const petshopFields = z.object({
  nome: z.string().trim().min(2, "Nome muito curto"),
  telefone: z.string().trim(),
  endereco: z.string().trim(),
  chave_pix: z.string().trim(),
  dia_fechamento: z.coerce.number().int().min(1).max(31),
  capacidade_por_horario: z.coerce
    .number()
    .int()
    .min(1, "Pelo menos 1 atendimento por horário")
    .max(20, "No máximo 20 atendimentos por horário"),
});

const NOME_DIA = ["", "segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

const horarioDia = z.object({
  abertura: z.string().regex(HORA_RE, "Horário inválido"),
  fechamento: z.string().regex(HORA_RE, "Horário inválido"),
  pausaInicio: z.string().regex(HORA_RE, "Horário inválido").optional(),
  pausaFim: z.string().regex(HORA_RE, "Horário inválido").optional(),
});

/** Valida o horário semanal vindo do formulário (JSON). */
function lerHorarioSemanaForm(
  raw: FormDataEntryValue | null
): { ok: true; semana: Record<string, z.infer<typeof horarioDia>> } | { ok: false; erro: string } {
  let valor: unknown;
  try {
    valor = JSON.parse(String(raw ?? "{}"));
  } catch {
    return { ok: false, erro: "Horário de funcionamento inválido." };
  }
  const parsed = z.record(z.string().regex(/^[1-7]$/), horarioDia).safeParse(valor);
  if (!parsed.success) return { ok: false, erro: "Confira os horários: use o formato 08:00." };
  const semana = parsed.data;
  if (Object.keys(semana).length === 0) return { ok: false, erro: "Deixe ao menos um dia aberto." };
  for (const [dia, h] of Object.entries(semana)) {
    const nome = NOME_DIA[Number(dia)];
    if (h.abertura >= h.fechamento) return { ok: false, erro: `Na ${nome}, a abertura precisa ser antes do fechamento.` };
    if (!!h.pausaInicio !== !!h.pausaFim) return { ok: false, erro: `Na ${nome}, informe início e fim do intervalo.` };
    if (h.pausaInicio && h.pausaFim) {
      if (h.pausaInicio >= h.pausaFim) return { ok: false, erro: `Na ${nome}, o intervalo termina antes de começar.` };
      if (h.pausaInicio <= h.abertura || h.pausaFim >= h.fechamento) {
        return { ok: false, erro: `Na ${nome}, o intervalo precisa ficar dentro do expediente.` };
      }
    }
  }
  return { ok: true, semana };
}

export async function updatePetshop(formData: FormData): Promise<ActionResult> {
  const parsed = petshopFields.safeParse({
    nome: formData.get("nome"),
    telefone: formData.get("telefone") ?? "",
    endereco: formData.get("endereco") ?? "",
    chave_pix: formData.get("chave_pix") ?? "",
    dia_fechamento: formData.get("dia_fechamento"),
    capacidade_por_horario: formData.get("capacidade_por_horario") ?? 1,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  let telefone: string | null = null;
  if (parsed.data.telefone) {
    telefone = normalizePhoneBR(parsed.data.telefone);
    if (!telefone) return { error: "Telefone inválido. Use DDD + número." };
  }

  const horario = lerHorarioSemanaForm(formData.get("horario_semana"));
  if (!horario.ok) return { error: horario.erro };
  const dias = Object.keys(horario.semana).map(Number).sort();
  const aberturas = Object.values(horario.semana).map((h) => h.abertura).sort();
  const fechamentos = Object.values(horario.semana).map((h) => h.fechamento).sort();

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);

  const { error } = await supabase
    .from("petshops")
    .update({
      nome: parsed.data.nome,
      telefone,
      endereco: parsed.data.endereco || null,
      chave_pix: parsed.data.chave_pix || null,
      dia_fechamento: parsed.data.dia_fechamento,
      horario_semana: horario.semana,
      // Resumo: limites da grade da agenda e dias abertos.
      horario_abertura: aberturas[0],
      horario_fechamento: fechamentos.at(-1),
      dias_funcionamento: dias,
      capacidade_por_horario: parsed.data.capacidade_por_horario,
    })
    .eq("id", petshopId);
  if (error) return { error: mensagemErroBanco(error) };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function updateSlug(slugRaw: string): Promise<ActionResult> {
  const slug = slugRaw.trim().toLowerCase();
  if (!slugValido(slug)) {
    return {
      error: "Use de 3 a 40 caracteres: letras minúsculas, números e hífens.",
    };
  }

  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { error } = await supabase
    .from("petshops")
    .update({ slug })
    .eq("id", petshopId);
  if (error) {
    return {
      error: mensagemErroBanco(error, {
        duplicado: "Esse endereço já está em uso por outro petshop.",
      }),
    };
  }

  revalidatePath("/configuracoes");
  return { success: true };
}

// ---------------------------------------------------------------------------
// WhatsApp
// ---------------------------------------------------------------------------

export type EstadoConexao =
  | { status: "conectando"; qrcode: string | null }
  | { status: "conectado"; numero: string | null; profileNome: string | null }
  | { status: "desconectado" }
  | { error: string };

function descreverErroUazapi(error: unknown): string {
  if (error instanceof UazapiError) {
    if (error.status === 401 || error.status === 403) {
      return "A UAZAPI recusou o token. Verifique o UAZAPI_ADMIN_TOKEN ou reconecte.";
    }
    return `A UAZAPI respondeu com erro ${error.status}. Tente de novo em instantes.`;
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return "A UAZAPI demorou demais para responder. Tente de novo.";
  }
  if (error instanceof Error) return error.message;
  return "Não foi possível falar com o WhatsApp agora.";
}

export async function conectarWhatsapp(): Promise<EstadoConexao> {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const admin = createAdminClient();

  try {
    let token = await obterTokenWhatsapp(petshopId);

    if (!token) {
      const { data: petshop } = await supabase
        .from("petshops")
        .select("slug")
        .eq("id", petshopId)
        .single();
      const criada = await criarInstancia(`bubblepet-${petshop?.slug ?? petshopId}`);
      const { error } = await admin.from("petshop_whatsapp").insert({
        petshop_id: petshopId,
        instance_id: criada.instanceId,
        token: criada.token,
      });
      if (error) return { error: mensagemErroBanco(error) };
      token = criada.token;
    }

    const resultado = await conectar(token);

    if (resultado.loggedIn) {
      return await sincronizarStatus(petshopId, token);
    }

    await supabase
      .from("petshops")
      .update({ whatsapp_status: "conectando" })
      .eq("id", petshopId);
    revalidatePath("/configuracoes");
    return { status: "conectando", qrcode: resultado.qrcode };
  } catch (error) {
    return { error: descreverErroUazapi(error) };
  }
}

async function sincronizarStatus(petshopId: string, token: string): Promise<EstadoConexao> {
  const supabase = await createClient();
  const st = await statusInstancia(token);

  if (st.loggedIn) {
    // Registra na UAZAPI pra onde mandar as respostas dos botões (só na
    // versão publicada — ver garantirWebhook).
    await garantirWebhook(petshopId);
    await supabase
      .from("petshops")
      .update({
        whatsapp_status: "conectado",
        whatsapp_numero: st.numero,
        whatsapp_profile_nome: st.profileNome,
      })
      .eq("id", petshopId);
    revalidatePath("/", "layout");
    return { status: "conectado", numero: st.numero, profileNome: st.profileNome };
  }

  return { status: "conectando", qrcode: st.qrcode };
}

export async function verificarWhatsapp(): Promise<EstadoConexao> {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const token = await obterTokenWhatsapp(petshopId);
  if (!token) return { status: "desconectado" };

  try {
    return await sincronizarStatus(petshopId, token);
  } catch (error) {
    return { error: descreverErroUazapi(error) };
  }
}

export async function desconectarWhatsapp(): Promise<ActionResult> {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const token = await obterTokenWhatsapp(petshopId);

  try {
    if (token) await desconectar(token);
  } catch (error) {
    // Se a instância já caiu do lado da UAZAPI, só limpamos o estado local.
    if (!(error instanceof UazapiError)) return { error: descreverErroUazapi(error) };
  }

  await supabase
    .from("petshops")
    .update({
      whatsapp_status: "desconectado",
      whatsapp_numero: null,
      whatsapp_profile_nome: null,
    })
    .eq("id", petshopId);
  revalidatePath("/", "layout");
  return { success: true };
}

export async function enviarMensagemTeste(): Promise<ActionResult> {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const { data: petshop } = await supabase
    .from("petshops")
    .select("nome, telefone")
    .eq("id", petshopId)
    .single();

  if (!petshop?.telefone) {
    return { error: "Cadastre o telefone do petshop para receber o teste." };
  }

  const resultado = await enviarMensagemWhatsapp({
    petshopId,
    numeroE164: petshop.telefone,
    tipo: "teste",
    texto: templateTeste(petshop.nome),
  });
  revalidatePath("/configuracoes");
  return resultado.ok ? { success: true } : { error: resultado.erro };
}
