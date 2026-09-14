import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { chaveTelefoneBR } from "@/lib/phone";
import { appUrl } from "@/lib/app-url";
import { enviarMensagemWhatsapp } from "@/lib/whatsapp";
import { templateRespostaCancelado, templateRespostaConfirmado } from "@/lib/whatsapp-templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Acao = { tipo: "confirmar" | "cancelar"; agendamentoId: string | null };

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/**
 * Botão tocado ("confirmar:<id>") ou resposta digitada ("1", "2",
 * "confirmo", "cancelar"...). Qualquer outra mensagem é ignorada — o petshop
 * responde normalmente pelo WhatsApp.
 */
function interpretar(botaoId: unknown, texto: unknown): Acao | null {
  if (typeof botaoId === "string") {
    const m = botaoId.match(new RegExp(`^(confirmar|cancelar):(${UUID})$`, "i"));
    if (m) return { tipo: m[1].toLowerCase() as Acao["tipo"], agendamentoId: m[2].toLowerCase() };
  }
  if (typeof texto !== "string") return null;
  const t = texto
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
  if (t === "1" || t === "sim" || t.startsWith("confirm")) return { tipo: "confirmar", agendamentoId: null };
  if (t === "2" || t.startsWith("cancel")) return { tipo: "cancelar", agendamentoId: null };
  return null;
}

const ok = () => new Response("ok");

/**
 * Recebe as mensagens da UAZAPI desta instância. A URL carrega um segredo
 * por petshop (petshop_whatsapp.webhook_secret) — é o que autentica a
 * chamada. Responde 200 sempre que o segredo é válido, pra UAZAPI não
 * reenviar.
 */
export async function POST(request: Request, { params }: { params: Promise<{ segredo: string }> }) {
  const { segredo } = await params;
  if (!segredo || segredo.length < 20) return new Response("Não encontrado", { status: 404 });

  const admin = createAdminClient();
  const { data: instancia, error: erroBusca } = await admin
    .from("petshop_whatsapp")
    .select("petshop_id")
    .eq("webhook_secret", segredo)
    .maybeSingle();
  // Falha passageira do banco não pode virar "não existe": 503 faz a UAZAPI
  // tentar de novo e a resposta do cliente não se perde.
  if (erroBusca) return new Response("Indisponível", { status: 503 });
  if (!instancia) return new Response("Não encontrado", { status: 404 });
  const petshopId = instancia.petshop_id as string;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return ok();
  }

  const evento = body.EventType ?? body.event;
  if (evento && evento !== "messages") return ok();
  const msg = body.message as Record<string, unknown> | undefined;
  if (!msg || msg.fromMe || msg.wasSentByApi || msg.isGroup) return ok();

  const acao = interpretar(msg.buttonOrListid, msg.text);
  if (!acao) return ok();

  const chat = body.chat as Record<string, unknown> | undefined;
  const chave = chaveTelefoneBR(
    (chat?.phone as string) ?? (msg.sender_pn as string) ?? (msg.chatid as string) ?? (msg.sender as string)
  );
  if (!chave) return ok();

  // Tutores do petshop com esse número (com ou sem o 9º dígito).
  const { data: tutores } = await admin
    .from("tutores")
    .select("id, nome, telefone")
    .eq("petshop_id", petshopId)
    .eq("ativo", true);
  const donos = (tutores ?? []).filter((t) => chaveTelefoneBR(t.telefone) === chave);
  if (donos.length === 0) return ok();
  const idsDonos = donos.map((t) => t.id);

  const agora = new Date().toISOString();
  const select = "id, inicio, status, pets!inner(nome, tutor_id)";

  let query = admin
    .from("agendamentos")
    .select(select)
    .eq("petshop_id", petshopId)
    .in("pets.tutor_id", idsDonos)
    .gt("inicio", agora);
  if (acao.agendamentoId) {
    query = query.eq("id", acao.agendamentoId);
  } else {
    // Resposta digitada: vale pro próximo horário ainda em aberto.
    query = query.in("status", acao.tipo === "confirmar" ? ["agendado"] : ["agendado", "confirmado"]);
  }
  const { data: agendamentos } = await query.order("inicio").limit(1);
  const ag = agendamentos?.[0];
  if (!ag) return ok();

  const pet = um(ag.pets as Um<{ nome: string; tutor_id: string }>);
  const tutor = donos.find((t) => t.id === pet?.tutor_id) ?? donos[0];
  if (!pet) return ok();

  if (ag.status === "cancelado" || ag.status === "faltou" || ag.status === "concluido") {
    await enviarMensagemWhatsapp({
      petshopId,
      tutorId: tutor.id,
      numeroE164: tutor.telefone,
      tipo: "confirmacao",
      texto: "Esse horário não está mais ativo. Se precisar, é só chamar por aqui que a gente te ajuda. 🐾",
    });
    return ok();
  }

  if (acao.tipo === "confirmar") {
    if (ag.status === "agendado") {
      await admin.from("agendamentos").update({ status: "confirmado" }).eq("id", ag.id);
    }
    await enviarMensagemWhatsapp({
      petshopId,
      tutorId: tutor.id,
      numeroE164: tutor.telefone,
      tipo: "confirmacao",
      texto: templateRespostaConfirmado(pet.nome, ag.inicio),
    });
  } else {
    // O trigger estornar_credito_ao_cancelar devolve o crédito do plano.
    await admin.from("agendamentos").update({ status: "cancelado" }).eq("id", ag.id);
    const { data: petshop } = await admin.from("petshops").select("slug").eq("id", petshopId).maybeSingle();
    await enviarMensagemWhatsapp({
      petshopId,
      tutorId: tutor.id,
      numeroE164: tutor.telefone,
      tipo: "confirmacao",
      texto: templateRespostaCancelado(
        pet.nome,
        ag.inicio,
        petshop?.slug ? `${await appUrl()}/agendar/${petshop.slug}` : undefined
      ),
    });
  }

  revalidatePath("/agenda");
  revalidatePath("/dashboard");
  return ok();
}
