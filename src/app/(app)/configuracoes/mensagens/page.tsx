import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { carregarAvisosConfig } from "@/lib/avisos";
import { MensagensView } from "./MensagensView";

export const metadata = { title: "Mensagens · BubblePet" };

export default async function MensagensPage() {
  const supabase = await createClient();
  const petshopId = await getCurrentPetshopId(supabase);
  const [{ data: petshop }, avisos] = await Promise.all([
    supabase.from("petshops").select("modelos_mensagem").single(),
    carregarAvisosConfig(supabase, petshopId),
  ]);
  const personalizados = (petshop?.modelos_mensagem as Record<string, string> | null) ?? {};

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/configuracoes"
        className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft size={14} /> Configurações
      </Link>
      <PageHeader
        title="Mensagens do WhatsApp"
        description="Toque numa mensagem para editar. Lá você escreve do seu jeito, escolhe os horários dos lembretes e personaliza os botões."
      />
      <MensagensView personalizados={personalizados} avisos={avisos} />
      <p className="text-xs text-muted-foreground">
        O código de acesso do link de agendamento tem texto fixo, pra funcionar sempre do mesmo jeito.
      </p>
    </div>
  );
}
