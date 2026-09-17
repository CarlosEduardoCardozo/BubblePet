import QRCode from "qrcode";
import Link from "next/link";
import { ChevronRight, MessageSquareText } from "lucide-react";
import { appUrl } from "@/lib/app-url";
import { horarioDoDia, horarioDoPetshop } from "@/lib/agenda/slots";
import { garantirWebhook } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { PetshopForm } from "./PetshopForm";
import { LinkPublicoCard } from "./LinkPublicoCard";
import { WhatsappCard, type MensagemLog } from "./WhatsappCard";

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ bemvindo?: string }>;
}) {
  const { bemvindo } = await searchParams;
  const supabase = await createClient();

  const [{ data: petshop, error }, { data: mensagens }] = await Promise.all([
    supabase
      .from("petshops")
      .select(
        "id, nome, telefone, endereco, chave_pix, dia_fechamento, slug, horario_abertura, horario_fechamento, dias_funcionamento, horario_semana, capacidade_por_horario, whatsapp_status, whatsapp_numero, whatsapp_profile_nome"
      )
      .single(),
    supabase
      .from("mensagens_whatsapp")
      .select("id, numero, tipo, status, erro, criado_em")
      .order("criado_em", { ascending: false })
      .limit(10),
  ]);

  if (error || !petshop) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title="Configurações" />
        <p className="text-sm text-destructive">
          Não foi possível carregar os dados do petshop. Recarregue a página.
        </p>
      </div>
    );
  }

  // Instância conectada: garante que a UAZAPI manda as respostas dos botões
  // Confirmar/Cancelar pra cá (só age na versão publicada e só se mudou).
  if (petshop.whatsapp_status === "conectado") {
    await garantirWebhook(petshop.id);
  }

  const baseUrl = await appUrl();
  const linkPublico = `${baseUrl}/agendar/${petshop.slug}`;
  const [qrDataUrl, qrImpressao] = await Promise.all([
    QRCode.toDataURL(linkPublico, { margin: 1, width: 220, color: { dark: "#0f172a", light: "#ffffff" } }),
    // Versão grande pra imprimir no balcão.
    QRCode.toDataURL(linkPublico, { margin: 2, width: 1000, color: { dark: "#0f172a", light: "#ffffff" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Dados do petshop, horário de funcionamento, link de agendamento e WhatsApp."
      />

      {bemvindo && (
        <div className="rounded-[12px] border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-semibold text-primary">Conta criada! Bem-vindo ao BubblePet 🐾</p>
          <ol className="mt-1 list-decimal pl-5 text-muted-foreground">
            <li>Confira o horário de funcionamento e a chave PIX aqui embaixo.</li>
            <li>Conecte o WhatsApp do petshop lendo o QR code.</li>
            <li>
              Cadastre os serviços em <Link href="/servicos" className="text-primary underline">Serviços</Link>{" "}
              e os clientes em <Link href="/tutores-pets" className="text-primary underline">Clientes e pets</Link>.
            </li>
          </ol>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PetshopForm
            petshop={{
              nome: petshop.nome,
              telefone: petshop.telefone,
              endereco: petshop.endereco,
              chave_pix: petshop.chave_pix,
              dia_fechamento: petshop.dia_fechamento,
              horario_semana: (() => {
                // Sem horário por dia salvo ainda: parte do horário único antigo.
                const h = horarioDoPetshop(petshop);
                return Object.fromEntries(
                  [1, 2, 3, 4, 5, 6, 7].flatMap((d) => {
                    const exp = horarioDoDia(h, d);
                    return exp ? [[d, exp]] : [];
                  })
                );
              })(),
              capacidade_por_horario: petshop.capacidade_por_horario ?? 1,
            }}
          />
        </div>

        <div className="flex flex-col gap-6">
          <WhatsappCard
            status={petshop.whatsapp_status}
            numero={petshop.whatsapp_numero}
            profileNome={petshop.whatsapp_profile_nome}
            telefonePetshop={petshop.telefone}
            mensagens={(mensagens ?? []) as MensagemLog[]}
          />
          <Link
            href="/configuracoes/mensagens"
            className="group flex items-center gap-3 rounded-[12px] border border-border bg-white px-4 py-3 transition-colors hover:border-primary/50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary/10 text-primary">
              <MessageSquareText size={18} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="text-sm font-medium">Mensagens do WhatsApp</span>
              <span className="text-xs text-muted-foreground">
                Personalize confirmação, lembrete, respostas e fechamento.
              </span>
            </span>
            <ChevronRight size={16} className="text-muted-foreground group-hover:text-primary" />
          </Link>
          <LinkPublicoCard
            slug={petshop.slug}
            baseUrl={baseUrl}
            qrDataUrl={qrDataUrl}
            qrImpressao={qrImpressao}
            petshopNome={petshop.nome}
            whatsappConectado={petshop.whatsapp_status === "conectado"}
          />
        </div>
      </div>
    </div>
  );
}
