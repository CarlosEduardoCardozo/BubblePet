import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DateTime } from "luxon";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  ExternalLink,
  Inbox,
  MessageCircle,
  PawPrint,
  Wallet,
} from "lucide-react";
import { appUrl } from "@/lib/app-url";
import { formatPhoneBR } from "@/lib/phone";
import { linkWhatsapp } from "@/lib/link-gratis/comum";
import { linkPorToken, pedidosDoLink, rotuloDia } from "@/lib/link-gratis/servidor";
import { CopiarBotao } from "@/components/link-gratis/CopiarBotao";
import { EditarLinkForm } from "./EditarLinkForm";

export const metadata: Metadata = {
  title: "Meus pedidos · BubblePet",
  robots: { index: false, follow: false },
};

const COMPLETO = [
  { icon: CalendarDays, t: "Agenda com horários de verdade, sem pedido solto" },
  { icon: Bell, t: "Lembrete e confirmação automáticos pro tutor" },
  { icon: Wallet, t: "Planos de banho e cartão fidelidade" },
  { icon: BarChart3, t: "Relatórios e controle do financeiro" },
];

function Cartao({ titulo, children, acao }: { titulo: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section className="rounded-[28px] glass p-5 sm:p-7">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold tracking-tight">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}

export default async function MeuLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await linkPorToken(token);
  if (!link) notFound();

  // Já virou conta completa: os pedidos agora são agendamentos no painel.
  if (link.petshopId) {
    return (
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="flex max-w-md flex-col items-center gap-4 rounded-[28px] glass p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand">
            <Check size={22} />
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight">{link.nomePetshop} já usa o BubblePet completo</h1>
          <p className="text-muted-foreground">Seu link continua o mesmo. Os pedidos agora entram direto na agenda do painel.</p>
          <Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-full bg-brand px-6 font-semibold">
            Entrar no painel <ArrowRight size={16} />
          </Link>
        </div>
      </main>
    );
  }

  const [pedidos, base] = await Promise.all([pedidosDoLink(link.id), appUrl()]);
  const linkPublico = `${base}/agendar/${link.slug}`;

  const cadastro = `/cadastro?${new URLSearchParams({
    link: token,
    nome: link.nomeDono,
    petshop: link.nomePetshop,
    telefone: formatPhoneBR(link.whatsapp),
  })}`;
  const comercial = process.env.NEXT_PUBLIC_WHATSAPP_COMERCIAL?.replace(/\D/g, "");
  const conversaComercial = comercial
    ? linkWhatsapp(
        `+${comercial}`,
        `Oi! Sou ${link.nomeDono}, do ${link.nomePetshop}. Uso o link grátis do BubblePet e quero saber mais sobre a agenda completa.`
      )
    : null;

  const hoje = DateTime.now().setZone("America/Sao_Paulo").toISODate()!;
  const proximos = pedidos.filter((p) => p.dia >= hoje).length;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="relative flex size-11 items-center justify-center rounded-2xl bg-brand">
            <PawPrint size={20} />
            <span className="absolute -top-0.5 -right-0.5 size-3 rounded-full bg-sun" />
          </span>
          <div>
            <p className="text-xs font-bold tracking-wide text-primary uppercase">Link grátis · BubblePet</p>
            <h1 className="text-2xl font-extrabold tracking-tight">{link.nomePetshop}</h1>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">Esta página é só sua. Não compartilhe o endereço dela.</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex min-w-0 flex-col gap-6">
          <Cartao titulo="Seu link de agendamento">
            <p className="truncate rounded-2xl bg-white/80 px-4 py-3 font-mono text-sm font-semibold">{linkPublico}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <CopiarBotao texto={linkPublico} />
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`Agende o banho do seu pet com a gente por aqui: ${linkPublico} 🐾`)}`}
                target="_blank"
                rel="noopener"
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#25d366] px-3.5 text-sm font-semibold text-white hover:brightness-105"
              >
                <MessageCircle size={15} /> Mandar no WhatsApp
              </a>
              <a
                href={linkPublico}
                target="_blank"
                rel="noopener"
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:bg-secondary"
              >
                <ExternalLink size={15} /> Ver como o cliente vê
              </a>
            </div>
          </Cartao>

          <Cartao
            titulo="Pedidos"
            acao={
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold text-secondary-foreground">
                {pedidos.length} no total · {proximos} a partir de hoje
              </span>
            }
          >
            {pedidos.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
                <Inbox size={28} />
                <p className="font-semibold text-foreground">Nenhum pedido ainda</p>
                <p className="max-w-xs text-sm">Coloque o link na bio do Instagram e mande pros clientes no WhatsApp.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {pedidos.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/80 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">
                        {p.petNome} · <span className="font-semibold text-primary">{p.servico}</span>
                      </p>
                      <p className="text-sm text-muted-foreground">
                        <span className="capitalize">{rotuloDia(p.dia)}</span>, {p.turno === "manha" ? "manhã" : "tarde"} ·{" "}
                        {p.tutorNome} · {formatPhoneBR(p.tutorTelefone)}
                      </p>
                      {p.observacao && <p className="mt-0.5 text-sm italic text-muted-foreground">“{p.observacao}”</p>}
                    </div>
                    <a
                      href={linkWhatsapp(
                        p.tutorTelefone,
                        `Oi, ${p.tutorNome.split(" ")[0]}! Aqui é do ${link.nomePetshop}. Recebemos o pedido de ${p.servico} pro ${p.petNome}.`
                      )}
                      target="_blank"
                      rel="noopener"
                      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#25d366] px-3.5 text-sm font-semibold text-white hover:brightness-105"
                    >
                      <MessageCircle size={15} /> Responder
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>

          <Cartao titulo="Editar sua página">
            <EditarLinkForm token={token} nomePetshop={link.nomePetshop} endereco={link.endereco} servicos={link.servicos} />
          </Cartao>
        </div>

        {/* Upgrade: as duas portas, sozinho ou com a equipe. */}
        <aside className="relative h-fit overflow-hidden rounded-[32px] bg-brand p-6 sm:p-8 lg:sticky lg:top-8">
          <div aria-hidden className="absolute -top-20 -right-16 size-64 rounded-full bg-[#ffd34d]/40 mix-blend-screen blur-3xl" />
          <div className="relative">
            <p className="text-xs font-extrabold tracking-widest text-[#ffd34d] uppercase">BubblePet completo</p>
            <h2 className="mt-2 text-2xl leading-tight font-black tracking-tight">
              {pedidos.length > 0
                ? `${pedidos.length === 1 ? "1 pedido já chegou" : `${pedidos.length} pedidos já chegaram`}. Que tal uma agenda de verdade?`
                : "Quando os pedidos começarem, tenha uma agenda de verdade."}
            </h2>
            <ul className="mt-5 flex flex-col gap-2.5">
              {COMPLETO.map(({ icon: Icon, t }) => (
                <li key={t} className="flex items-center gap-2.5 text-sm font-semibold">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sun">
                    <Icon size={14} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
            <p className="mt-5 text-sm text-white/80">O endereço do seu link continua o mesmo.</p>
            <div className="mt-6 flex flex-col gap-2.5">
              <Link
                href={cadastro}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-sun text-base font-bold"
              >
                Criar minha conta completa <ArrowRight size={17} />
              </Link>
              {conversaComercial && (
                <a
                  href={conversaComercial}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-white/40 bg-white/15 text-base font-bold backdrop-blur hover:bg-white/25"
                >
                  <MessageCircle size={17} /> Falar com a equipe
                </a>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
