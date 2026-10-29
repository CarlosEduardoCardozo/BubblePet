import { notFound, redirect } from "next/navigation";
import { PawPrint } from "lucide-react";
import { proximosDiasAbertos } from "@/lib/agenda/slots";
import { getSessaoTutor } from "@/lib/publico/session";
import { petshopPorSlug } from "@/lib/publico/dal";
import { carregarAreaDoTutor } from "@/lib/publico/area";
import { MinhaAreaView } from "./MinhaAreaView";

export const dynamic = "force-dynamic";

export default async function MinhaAreaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const petshop = await petshopPorSlug(slug);
  if (!petshop) notFound();

  const sessao = await getSessaoTutor(slug);
  if (!sessao || sessao.petshopId !== petshop.id) redirect(`/agendar/${slug}`);

  const area = await carregarAreaDoTutor(petshop.id, sessao.tutorId);
  if (!area) redirect(`/agendar/${slug}`);

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col px-4 pb-10 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-primary text-primary-foreground shadow-sm">
          <PawPrint size={22} />
        </span>
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-primary">Minha área</span>
          <h1 className="text-xl font-semibold leading-tight [font-family:var(--font-display)]">{petshop.nome}</h1>
        </div>
      </header>

      <MinhaAreaView
        slug={slug}
        area={area}
        petshop={{ nome: petshop.nome, telefone: petshop.telefone }}
        dias={proximosDiasAbertos(petshop.horario, 14)}
      />

      <footer className="mt-auto pt-10 text-center text-[11px] text-muted-foreground">Feito com BubblePet</footer>
    </main>
  );
}
