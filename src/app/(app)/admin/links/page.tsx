import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import { ArrowLeft, MessageCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";
import { lerSuporte } from "@/lib/suporte";
import { formatPhoneBR } from "@/lib/phone";
import { linkWhatsapp } from "@/lib/link-gratis/comum";
import { lerServicos } from "@/lib/link-gratis/servidor";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Links grátis · Admin · BubblePet" };

/** Leads do freemium: quem criou link grátis, quantos pedidos recebeu e quem já virou conta. */
export default async function AdminLinksPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !ehAdmin(user.email) || (await lerSuporte(user.id))) notFound();

  const db = createAdminClient();
  const desde30 = DateTime.now().minus({ days: 30 }).toISO()!;
  const [{ data: links }, { data: pedidos }] = await Promise.all([
    db
      .from("links_gratis")
      .select("id, slug, nome_petshop, nome_dono, whatsapp, servicos, petshop_id, convertido_em, criado_em")
      .order("criado_em", { ascending: false })
      .limit(500),
    db.from("pedidos_link_gratis").select("link_id, criado_em").limit(20000),
  ]);

  const total = new Map<string, number>();
  const recentes = new Map<string, number>();
  for (const p of pedidos ?? []) {
    total.set(p.link_id, (total.get(p.link_id) ?? 0) + 1);
    if (p.criado_em >= desde30) recentes.set(p.link_id, (recentes.get(p.link_id) ?? 0) + 1);
  }

  const lista = links ?? [];
  const convertidos = lista.filter((l) => l.petshop_id).length;
  const comPedido = lista.filter((l) => (total.get(l.id) ?? 0) > 0).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Links grátis"
        description="Petshops que criaram o link de agendamento grátis pela landing page."
        action={
          <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
            <ArrowLeft /> Admin
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          { rotulo: "Links criados", valor: lista.length },
          { rotulo: "Receberam pedido", valor: comPedido },
          { rotulo: "Viraram conta", valor: convertidos },
        ].map((r) => (
          <div key={r.rotulo} className="flex flex-col gap-1 rounded-card glass px-4 py-3">
            <span className="text-xs text-muted-foreground">{r.rotulo}</span>
            <span className="text-2xl font-semibold">{r.valor}</span>
          </div>
        ))}
      </div>

      {lista.length === 0 ? (
        <p className="rounded-card glass p-8 text-center text-muted-foreground">Nenhum link grátis criado ainda.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((l) => {
            const servicos = lerServicos(l.servicos);
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 rounded-card glass px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {l.nome_petshop}
                    {l.petshop_id ? <Badge variant="secondary">Virou conta</Badge> : null}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {l.nome_dono} · {formatPhoneBR(l.whatsapp)} ·{" "}
                    <a href={`/agendar/${l.slug}`} target="_blank" rel="noopener" className="text-primary hover:underline">
                      /agendar/{l.slug}
                    </a>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Criado {DateTime.fromISO(l.criado_em).setLocale("pt-BR").toRelative()} ·{" "}
                    {servicos.map((s) => s.nome).join(", ")}
                  </p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{total.get(l.id) ?? 0} pedidos</p>
                  <p className="text-xs text-muted-foreground">{recentes.get(l.id) ?? 0} nos últimos 30 dias</p>
                </div>
                <a
                  href={linkWhatsapp(l.whatsapp, `Oi, ${l.nome_dono.split(" ")[0]}! Aqui é do BubblePet.`)}
                  target="_blank"
                  rel="noopener"
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <MessageCircle /> Conversar
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
