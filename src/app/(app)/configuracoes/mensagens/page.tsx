import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { MODELOS, TIPOS_MODELO } from "@/lib/mensagens/modelos";
import { ModeloEditor } from "./ModeloEditor";

export const metadata = { title: "Mensagens · BubblePet" };

export default async function MensagensPage() {
  const supabase = await createClient();
  const { data: petshop } = await supabase.from("petshops").select("modelos_mensagem").single();
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
        description="Escreva do jeito do seu petshop. As palavras entre chaves, como {tutor} e {data}, são trocadas pelos dados de cada cliente na hora do envio."
      />
      <div className="grid gap-4 xl:grid-cols-2">
        {TIPOS_MODELO.map((tipo) => (
          <ModeloEditor
            key={tipo}
            tipo={tipo}
            definicao={MODELOS[tipo]}
            textoSalvo={personalizados[tipo] ?? null}
          />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        O código de acesso do link de agendamento tem texto fixo, pra funcionar sempre do mesmo jeito.
      </p>
    </div>
  );
}
