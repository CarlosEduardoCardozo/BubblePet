import QRCode from "qrcode";
import { appUrl } from "@/lib/app-url";
import { garantirWebhook } from "@/lib/whatsapp";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { PetshopForm } from "./PetshopForm";
import { LinkPublicoCard } from "./LinkPublicoCard";
import { WhatsappCard, type MensagemLog } from "./WhatsappCard";

export default async function ConfiguracoesPage() {
  const supabase = await createClient();

  const [{ data: petshop, error }, { data: mensagens }] = await Promise.all([
    supabase
      .from("petshops")
      .select(
        "id, nome, telefone, endereco, chave_pix, dia_fechamento, slug, horario_abertura, horario_fechamento, dias_funcionamento, whatsapp_status, whatsapp_numero, whatsapp_profile_nome"
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
  const qrDataUrl = await QRCode.toDataURL(linkPublico, {
    margin: 1,
    width: 220,
    color: { dark: "#0f172a", light: "#ffffff" },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configurações"
        description="Dados do petshop, horário de funcionamento, link de agendamento e WhatsApp."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PetshopForm
            petshop={{
              nome: petshop.nome,
              telefone: petshop.telefone,
              endereco: petshop.endereco,
              chave_pix: petshop.chave_pix,
              dia_fechamento: petshop.dia_fechamento,
              horario_abertura: String(petshop.horario_abertura).slice(0, 5),
              horario_fechamento: String(petshop.horario_fechamento).slice(0, 5),
              dias_funcionamento: petshop.dias_funcionamento ?? [1, 2, 3, 4, 5, 6],
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
          <LinkPublicoCard
            slug={petshop.slug}
            baseUrl={baseUrl}
            qrDataUrl={qrDataUrl}
          />
        </div>
      </div>
    </div>
  );
}
