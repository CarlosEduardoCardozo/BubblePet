import { DateTime } from "luxon";
import { Clock, PawPrint } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerTokenUpload } from "@/lib/upload-celular";
import { EnviarFlow } from "./EnviarFlow";

export const dynamic = "force-dynamic";

type Um<T> = T | T[] | null | undefined;
function um<T>(v: Um<T>): T | undefined {
  return Array.isArray(v) ? v[0] : (v ?? undefined);
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Clock size={26} />
      </span>
      <h1 className="text-xl font-semibold">{titulo}</h1>
      <p className="text-sm text-muted-foreground">{texto}</p>
    </main>
  );
}

export default async function EnviarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const perm = await lerTokenUpload(token);
  if (!perm) {
    return <Aviso titulo="Link vencido" texto="Este QR code já expirou. Peça para gerar outro na agenda do computador." />;
  }

  const admin = createAdminClient();
  const { data: ag } = await admin
    .from("agendamentos")
    .select("inicio, pets(nome), servicos(nome), petshops(nome)")
    .eq("id", perm.agendamentoId)
    .eq("petshop_id", perm.petshopId)
    .maybeSingle();
  const pet = um(ag?.pets as Um<{ nome: string }>);
  const servico = um(ag?.servicos as Um<{ nome: string }>);
  const petshop = um(ag?.petshops as Um<{ nome: string }>);
  if (!ag || !pet) {
    return <Aviso titulo="Atendimento não encontrado" texto="Esse atendimento não existe mais." />;
  }

  const quando = DateTime.fromISO(ag.inicio).setZone("America/Sao_Paulo").setLocale("pt-BR").toFormat("ccc, dd/LL 'às' HH:mm");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-5 px-4 pb-10 pt-6">
      <header className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-[14px] bg-primary text-primary-foreground shadow-sm">
          <PawPrint size={22} />
        </span>
        <div className="flex flex-col">
          <span className="text-xs font-medium uppercase tracking-wide text-primary">{petshop?.nome ?? "Petshop"}</span>
          <h1 className="text-xl font-semibold leading-tight">Fotos e vídeos de {pet.nome}</h1>
          <span className="text-xs text-muted-foreground">
            {servico?.nome ? `${servico.nome} · ` : ""}
            {quando}
          </span>
        </div>
      </header>
      <EnviarFlow token={token} />
    </main>
  );
}
