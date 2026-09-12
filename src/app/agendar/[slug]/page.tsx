import { notFound } from "next/navigation";
import { PawPrint } from "lucide-react";
import { proximosDiasAbertos } from "@/lib/agenda/slots";
import { getSessaoTutor } from "@/lib/publico/session";
import { dadosAgendamento, petshopPorSlug } from "@/lib/publico/dal";
import { AgendarFlow } from "./AgendarFlow";

export default async function AgendarPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const petshop = await petshopPorSlug(slug);
  if (!petshop) notFound();

  const sessao = await getSessaoTutor(slug);
  const dados = sessao && sessao.petshopId === petshop.id
    ? await dadosAgendamento(petshop.id, sessao.tutorId)
    : null;

  const dias = proximosDiasAbertos(petshop.horario, 14);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-primary text-primary-foreground shadow-sm">
          <PawPrint size={22} />
        </span>
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-primary">
            Agendamento online
          </span>
          <h1 className="text-xl font-semibold leading-tight [font-family:var(--font-display)]">
            {petshop.nome}
          </h1>
        </div>
      </header>

      <AgendarFlow
        slug={slug}
        petshop={{
          nome: petshop.nome,
          telefone: petshop.telefone,
          endereco: petshop.endereco,
          whatsappConectado: petshop.whatsappConectado,
        }}
        dados={dados}
        dias={dias}
      />

      <footer className="mt-auto pt-10 text-center text-[11px] text-muted-foreground">
        Feito com BubblePet
      </footer>
    </main>
  );
}
