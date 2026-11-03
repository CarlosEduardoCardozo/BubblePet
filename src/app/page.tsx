import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  Camera,
  Gift,
  Link2,
  MessageCircle,
  Package,
  PawPrint,
  Plus,
  Smartphone,
  Sparkles,
  TrendingUp,
  UserCog,
  Wallet,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Reveal } from "@/components/landing/Reveal";
import { EntrarLink } from "@/components/landing/EntrarLink";
import { LinkGratisForm } from "@/components/landing/LinkGratisForm";
import { LeadForm } from "@/components/landing/LeadForm";
import {
  AgendaCard,
  ChegadaCard,
  FidelidadeCard,
  PhoneAgendar,
  WhatsAppCard,
} from "@/components/landing/Mockups";

export const metadata: Metadata = {
  title: "BubblePet · Gestão de petshop com agenda, planos e WhatsApp",
  description:
    "Agenda com lembretes no WhatsApp, planos de banho, cartão fidelidade, link de agendamento para o tutor e relatórios. Tudo do seu petshop em um só lugar.",
};

const NAV = [
  { href: "#recursos", label: "Recursos" },
  { href: "#link-gratis", label: "Link grátis" },
  { href: "#tutor", label: "Para o tutor" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#duvidas", label: "Dúvidas" },
];

const MARQUEE = [
  "Agenda inteligente",
  "Lembretes no WhatsApp",
  "Planos de banho",
  "Cartão fidelidade",
  "Fotos na chegada",
  "Link de agendamento",
  "Relatórios",
  "Estoque pela foto",
];

const RECURSOS_MENORES = [
  {
    icon: TrendingUp,
    titulo: "Oportunidades de retorno",
    texto: "Veja quem está sumido e mande uma mensagem de volta, escrita com ajuda da IA.",
  },
  {
    icon: Package,
    titulo: "Estoque pela foto",
    texto: "Fotografe a nota ou a prateleira e a IA preenche os produtos pra você.",
  },
  {
    icon: BarChart3,
    titulo: "Relatórios que fazem sentido",
    texto: "Faturamento, mensalidades, melhores clientes e retenção, mês a mês.",
  },
  {
    icon: UserCog,
    titulo: "Equipe com permissões",
    texto: "Cada banhista e atendente vê só o que precisa. O dono vê tudo.",
  },
];

const PASSOS = [
  {
    n: "01",
    titulo: "Crie a conta do petshop",
    texto: "Leva um minuto. Sem instalar nada: funciona no navegador do computador e do celular.",
  },
  {
    n: "02",
    titulo: "Conecte o WhatsApp",
    texto: "Lendo um QR code, o número do petshop passa a enviar lembretes e avisos sozinho.",
  },
  {
    n: "03",
    titulo: "Cadastre serviços e compartilhe o link",
    texto: "Monte banho, tosa e adicionais, crie seus planos e mande o link de agendamento pros clientes.",
  },
];

const FAQ = [
  {
    p: "Meus clientes precisam baixar algum aplicativo?",
    r: "Não. O tutor agenda por um link do seu petshop e recebe tudo pelo WhatsApp. Ele ainda tem uma área própria pra ver banhos, plano e histórico do pet.",
  },
  {
    p: "Funciona com o WhatsApp que eu já uso?",
    r: "Sim. Você conecta o número do petshop lendo um QR code e as mensagens saem dele: lembretes, confirmações e avisos de chegada.",
  },
  {
    p: "Como funcionam os planos de banho?",
    r: "Você define quantos banhos por mês e o valor da mensalidade. O BubblePet controla os créditos de cada pet e gera o fechamento do mês em PDF.",
  },
  {
    p: "Dá pra minha equipe usar sem ver o financeiro?",
    r: "Dá. O dono cadastra a equipe e escolhe quais áreas cada pessoa acessa: agenda, clientes, estoque, financeiro e assim por diante.",
  },
  {
    p: "Preciso instalar alguma coisa no computador?",
    r: "Não. O BubblePet roda no navegador. Abra no computador do balcão, no tablet ou no celular.",
  },
];

/** Bolhas decorativas: o "Bubble" do nome. Só enfeite, escondidas do leitor de tela. */
function Bolhas({ className }: { className?: string }) {
  const bolhas = [
    "left-[6%] top-[18%] size-5 [animation-delay:0s]",
    "left-[2%] top-[78%] size-9 [animation-delay:1.2s]",
    "right-[8%] top-[12%] size-7 [animation-delay:.6s]",
    "right-[4%] top-[70%] size-4 [animation-delay:2s]",
    "left-[46%] top-[6%] size-3 [animation-delay:1.6s]",
  ];
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {bolhas.map((b) => (
        <span key={b} className={cn("lp-bubble absolute", b)} />
      ))}
    </div>
  );
}

function Logo({ claro = false }: { claro?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight">
      <span
        className={cn(
          "relative flex size-9 items-center justify-center rounded-xl",
          claro ? "border border-white/40 bg-white/20" : "bg-brand"
        )}
      >
        <PawPrint size={17} />
        <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-sun" />
      </span>
      BubblePet
    </span>
  );
}

export default function LandingPage() {
  return (
    <div className="flex-1 overflow-x-clip">
      {/* ───────── Navegação ───────── */}
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 rounded-full glass pr-2 pl-5">
          <Link href="/" aria-label="BubblePet, início">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="rounded-full px-3.5 py-2 text-sm font-semibold text-muted-foreground transition-colors hover:bg-white/80 hover:text-foreground"
              >
                {n.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            <EntrarLink className={cn(buttonVariants({ variant: "ghost" }), "max-sm:px-3")} />
            <Link href="/cadastro" className={cn(buttonVariants({ size: "lg" }), "max-sm:h-10 max-sm:px-4")}>
              Criar conta
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ───────── Hero ───────── */}
        <section className="relative px-4 pt-14 pb-20 sm:pt-20 lg:pb-28">
          <Bolhas />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1.05fr_1fr]">
            <div className="flex flex-col items-start">
              <span className="lp-fade-up inline-flex items-center gap-2 rounded-full border border-white bg-white/70 py-1.5 pr-4 pl-1.5 text-sm font-semibold shadow-sm backdrop-blur">
                <span className="flex size-6 items-center justify-center rounded-full bg-sun">
                  <Sparkles size={13} />
                </span>
                Gestão de petshop, banho e tosa
              </span>
              <h1 className="lp-fade-up mt-6 text-[2.75rem] leading-[1.06] font-black tracking-[-0.035em] [animation-delay:80ms] sm:text-6xl lg:text-[4.4rem]">
                Seu petshop{" "}
                <span className="relative whitespace-nowrap text-primary">
                  organizado
                  <svg
                    aria-hidden
                    viewBox="0 0 300 18"
                    preserveAspectRatio="none"
                    className="absolute -bottom-1 left-0 h-2.5 w-full text-sun"
                  >
                    <path d="M3 13 C 70 3, 180 3, 297 11" stroke="currentColor" strokeWidth="7" fill="none" strokeLinecap="round" />
                  </svg>
                </span>
                .
                <br />
                Seus clientes{" "}
                <span className="bg-gradient-to-r from-[#7c3aed] to-[#c084fc] bg-clip-text text-transparent">
                  encantados.
                </span>
              </h1>
              <p className="lp-fade-up mt-6 max-w-xl text-lg leading-relaxed font-medium text-muted-foreground [animation-delay:160ms]">
                Agenda com lembretes automáticos no WhatsApp, planos de banho, cartão fidelidade e um link pro
                tutor agendar sozinho. Menos caderno, menos falta, mais pet cheiroso saindo pela porta.
              </p>
              <div className="lp-fade-up mt-8 flex flex-wrap items-center gap-3 [animation-delay:240ms]">
                <Link href="/cadastro" className={cn(buttonVariants({ size: "lg" }), "h-13 px-7 text-base")}>
                  Criar conta do petshop <ArrowRight />
                </Link>
                <a
                  href="#link-gratis"
                  className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-13 px-7 text-base")}
                >
                  Criar link grátis
                </a>
              </div>
              <ul className="lp-fade-up mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-muted-foreground [animation-delay:320ms]">
                {["Sem app pro cliente", "Funciona no celular", "Pronto em minutos"].map((t) => (
                  <li key={t} className="flex items-center gap-1.5">
                    <span className="flex size-4 items-center justify-center rounded-full bg-primary/12 text-primary">
                      <PawPrint size={10} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Composição do produto */}
            <div className="relative mx-auto w-full max-w-[520px] lg:mx-0">
              <div aria-hidden className="absolute inset-6 -z-10 rounded-[48px] bg-brand opacity-90 blur-[2px] lg:rotate-3" />
              <div aria-hidden className="absolute -top-10 -right-6 -z-10 size-48 rounded-full bg-[#ffd34d]/60 blur-3xl" />
              <div className="lp-fade-up relative px-3 pt-16 pb-28 [animation-delay:200ms] sm:px-6 sm:pt-24 sm:pb-32">
                <AgendaCard className="relative z-10 shadow-[0_30px_60px_-30px_rgb(76_29_149/0.5)] sm:mr-16" />
                <WhatsAppCard className="lp-float absolute -top-16 -right-4 z-20 hidden rotate-3 sm:block" />
                <FidelidadeCard className="lp-float absolute -bottom-10 -left-2 z-20 rotate-[-4deg] [animation-delay:1.5s] sm:-left-6" />
                <ChegadaCard className="lp-float absolute -right-4 -bottom-16 z-20 hidden rotate-3 [animation-delay:.8s] sm:block" />
              </div>
            </div>
          </div>
        </section>

        {/* ───────── Faixa ───────── */}
        <section aria-label="Destaques" className="relative -rotate-1 bg-brand py-4">
          <div className="flex overflow-hidden">
            {[0, 1].map((k) => (
              <ul key={k} aria-hidden={k === 1} className="lp-marquee flex shrink-0 items-center gap-8 pr-8">
                {MARQUEE.map((m) => (
                  <li key={m} className="flex items-center gap-8 text-lg font-extrabold whitespace-nowrap sm:text-xl">
                    {m}
                    <PawPrint size={18} className="text-[#ffd34d]" />
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        {/* ───────── Recursos (bento) ───────── */}
        <section id="recursos" className="scroll-mt-28 px-4 py-24 sm:py-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="mx-auto max-w-2xl text-center">
              <p className="text-sm font-extrabold tracking-widest text-primary uppercase">Recursos</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Tudo que o banho e tosa precisa, <span className="text-primary">num lugar só.</span>
              </h2>
              <p className="mt-4 text-lg font-medium text-muted-foreground">
                Do agendamento ao fechamento do mês, sem planilha e sem caderninho.
              </p>
            </Reveal>

            <div className="mt-14 grid gap-5 md:grid-cols-6">
              {/* Agenda — grande */}
              <Reveal className="group relative overflow-hidden rounded-[32px] glass p-8 md:col-span-4 md:row-span-2">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-brand">
                  <CalendarDays size={22} />
                </span>
                <h3 className="mt-5 text-2xl font-extrabold tracking-tight">Agenda que trabalha por você</h3>
                <p className="mt-2 max-w-md font-medium text-muted-foreground">
                  Arraste pra remarcar, veja os horários livres na hora e acompanhe cada pet do check-in à entrega.
                  Feriados e horário de funcionamento já entram no cálculo.
                </p>
                <AgendaCard className="mt-8 max-w-md transition-transform duration-500 group-hover:-translate-y-1 md:absolute md:right-[-2rem] md:bottom-[-2rem] md:mt-0 md:w-[400px] md:rotate-[-3deg]" />
                <div className="h-0 md:h-56" />
              </Reveal>

              {/* WhatsApp */}
              <Reveal delay={80} className="relative overflow-hidden rounded-[32px] bg-[#0f2e1d] p-8 text-white md:col-span-2">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-[#25d366]">
                  <MessageCircle size={22} />
                </span>
                <h3 className="mt-5 text-xl font-extrabold tracking-tight">Lembretes no WhatsApp</h3>
                <p className="mt-2 text-sm font-medium text-white/70">
                  Confirmação na véspera, aviso de chegada e de “pode buscar”. Pelo número do seu petshop.
                </p>
                <div aria-hidden className="absolute -right-10 -bottom-10 size-40 rounded-full bg-[#25d366]/20 blur-2xl" />
              </Reveal>

              {/* Planos */}
              <Reveal delay={160} className="relative overflow-hidden rounded-[32px] bg-sun p-8 md:col-span-2">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-[#3d2c00] text-[#ffd34d]">
                  <Wallet size={22} />
                </span>
                <h3 className="mt-5 text-xl font-extrabold tracking-tight">Planos de banho</h3>
                <p className="mt-2 text-sm font-semibold opacity-75">
                  Mensalidade fixa, créditos por pet e fechamento do mês em PDF. Receita previsível.
                </p>
              </Reveal>

              {/* Fidelidade */}
              <Reveal delay={0} className="relative flex flex-col overflow-hidden rounded-[32px] glass p-8 md:col-span-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="flex size-12 items-center justify-center rounded-2xl bg-sun">
                      <Gift size={22} />
                    </span>
                    <h3 className="mt-5 text-xl font-extrabold tracking-tight">Cartão fidelidade digital</h3>
                    <p className="mt-2 max-w-xs text-sm font-medium text-muted-foreground">
                      Carimbo automático a cada banho. Você escolhe o prêmio e o desconto.
                    </p>
                  </div>
                  <FidelidadeCard carimbos={9} className="hidden shrink-0 rotate-3 scale-90 lg:block" />
                </div>
              </Reveal>

              {/* Chegada */}
              <Reveal delay={80} className="relative overflow-hidden rounded-[32px] bg-[#1c0b3d] p-8 text-white md:col-span-3">
                <div aria-hidden className="absolute -top-16 -right-16 size-56 rounded-full bg-[#7c3aed]/50 blur-3xl" />
                <span className="relative flex size-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                  <Camera size={22} />
                </span>
                <h3 className="relative mt-5 text-xl font-extrabold tracking-tight">Fotos e vídeos na chegada</h3>
                <p className="relative mt-2 max-w-sm text-sm font-medium text-white/70">
                  Registre como o pet chegou e mande pro tutor. Transparência que gera confiança e evita discussão.
                </p>
              </Reveal>

              {/* Menores */}
              {RECURSOS_MENORES.map(({ icon: Icon, titulo, texto }, i) => (
                <Reveal
                  key={titulo}
                  delay={i * 70}
                  className="rounded-[28px] border border-white/80 bg-white/55 p-6 backdrop-blur md:col-span-3 lg:col-span-3 xl:col-span-3"
                >
                  <div className="flex items-start gap-4">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Icon size={20} />
                    </span>
                    <div>
                      <h3 className="font-extrabold tracking-tight">{titulo}</h3>
                      <p className="mt-1 text-sm font-medium text-muted-foreground">{texto}</p>
                    </div>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── Para o tutor ───────── */}
        <section id="tutor" className="scroll-mt-28 px-4 pb-24 sm:pb-32">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[44px] bg-brand px-6 py-16 sm:px-14 lg:py-20">
            <div aria-hidden className="absolute -top-32 -left-24 size-96 rounded-full bg-[#c4b5fd]/40 blur-3xl" />
            <div aria-hidden className="absolute -right-20 -bottom-40 size-[28rem] rounded-full bg-[#ffd34d]/35 mix-blend-screen blur-3xl" />
            <Bolhas className="opacity-60 max-sm:hidden [&>span:nth-child(-n+2)]:hidden" />
            <div className="relative grid items-center gap-14 lg:grid-cols-2">
              <Reveal>
                <p className="text-sm font-extrabold tracking-widest text-[#ffd34d] uppercase">Para o tutor</p>
                <h2 className="mt-3 text-4xl leading-[1.05] font-black tracking-[-0.03em] sm:text-5xl">
                  Seu cliente agenda sozinho. Até de madrugada.
                </h2>
                <p className="mt-5 max-w-lg text-lg font-medium text-white/80">
                  Um link com a cara do seu petshop. O tutor escolhe o serviço, vê os horários livres e confirma em
                  segundos. Depois acompanha tudo numa área só dele.
                </p>
                <ul className="mt-8 flex flex-col gap-3">
                  {[
                    { icon: Link2, t: "Link próprio pra bio do Instagram e pro WhatsApp" },
                    { icon: Smartphone, t: "Área do tutor com banhos, plano, histórico e extratos" },
                    { icon: PawPrint, t: "Cadastro do tutor e do pet direto pelo link" },
                  ].map(({ icon: Icon, t }) => (
                    <li
                      key={t}
                      className="flex max-w-md items-center gap-3 rounded-full border border-white/25 bg-white/12 py-2 pr-5 pl-2 text-sm font-semibold backdrop-blur-md"
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-sun">
                        <Icon size={15} />
                      </span>
                      {t}
                    </li>
                  ))}
                </ul>
              </Reveal>
              <Reveal delay={120} className="flex justify-center">
                <div className="relative">
                  <PhoneAgendar className="relative z-10 rotate-[4deg]" />
                  <WhatsAppCard className="lp-float absolute -bottom-10 -left-36 z-20 hidden -rotate-6 sm:block" />
                </div>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ───────── Link grátis (freemium) ───────── */}
        <section id="link-gratis" className="scroll-mt-28 px-4 pb-24 sm:pb-32">
          <div className="mx-auto grid max-w-6xl items-start gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
            <Reveal className="lg:sticky lg:top-28">
              <span className="inline-flex items-center gap-2 rounded-full bg-sun px-3.5 py-1.5 text-sm font-extrabold">
                <Sparkles size={14} /> Grátis, sem cartão e sem senha
              </span>
              <h2 className="mt-5 text-4xl leading-[1.05] font-black tracking-[-0.03em] sm:text-5xl">
                Seu link de agendamento <span className="text-primary">em 30 segundos.</span>
              </h2>
              <p className="mt-5 max-w-lg text-lg font-medium text-muted-foreground">
                Informe o nome do petshop, seu WhatsApp e os serviços. Você recebe um link pra colocar na bio do
                Instagram e mandar pros clientes. Cada pedido chega no seu WhatsApp, avisado pelo BubblePet.
              </p>
              <ul className="mt-8 flex flex-col gap-3">
                {[
                  { icon: Link2, t: "Link com o nome do seu petshop" },
                  { icon: MessageCircle, t: "Pedidos avisados no seu WhatsApp, na hora" },
                  { icon: Smartphone, t: "Página com todos os pedidos, pra consultar quando quiser" },
                  { icon: CalendarDays, t: "Quando quiser agenda completa, o link continua o mesmo" },
                ].map(({ icon: Icon, t }) => (
                  <li key={t} className="flex items-center gap-3 font-semibold">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                      <Icon size={17} />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100} className="relative">
              <div aria-hidden className="absolute -inset-3 -z-10 rotate-2 rounded-[40px] bg-brand opacity-90" />
              <div className="rounded-[32px] glass p-6 sm:p-8">
                <LinkGratisForm />
              </div>
            </Reveal>
          </div>
        </section>

        {/* ───────── Como funciona ───────── */}
        <section id="como-funciona" className="scroll-mt-28 px-4 pb-24 sm:pb-32">
          <div className="mx-auto max-w-6xl">
            <Reveal className="max-w-2xl">
              <p className="text-sm font-extrabold tracking-widest text-primary uppercase">Como funciona</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.03em] sm:text-5xl">
                Do cadastro ao primeiro banho agendado em <span className="text-primary">três passos.</span>
              </h2>
            </Reveal>
            <ol className="mt-14 grid gap-5 md:grid-cols-3">
              {PASSOS.map((p, i) => (
                <Reveal as="li" key={p.n} delay={i * 100} className="relative rounded-[32px] glass p-8">
                  <span className="text-6xl font-black tracking-tighter text-primary/15">{p.n}</span>
                  <h3 className="mt-4 text-xl font-extrabold tracking-tight">{p.titulo}</h3>
                  <p className="mt-2 font-medium text-muted-foreground">{p.texto}</p>
                  {i < PASSOS.length - 1 && (
                    <span className="absolute top-1/2 -right-4 z-10 hidden size-8 -translate-y-1/2 items-center justify-center rounded-full bg-sun md:flex">
                      <ArrowRight size={15} />
                    </span>
                  )}
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        {/* ───────── Dúvidas ───────── */}
        <section id="duvidas" className="scroll-mt-28 px-4 pb-24 sm:pb-32">
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[1fr_1.4fr]">
            <Reveal>
              <p className="text-sm font-extrabold tracking-widest text-primary uppercase">Dúvidas</p>
              <h2 className="mt-3 text-4xl font-black tracking-[-0.03em] sm:text-5xl">Perguntas frequentes</h2>
              <p className="mt-4 max-w-sm text-lg font-medium text-muted-foreground">
                Ficou alguma dúvida? Crie a conta e explore: dá pra conhecer tudo antes de mandar o link pros clientes.
              </p>
            </Reveal>
            <div className="flex flex-col gap-3">
              {FAQ.map((f, i) => (
                <Reveal key={f.p} delay={i * 60}>
                  <details className="group rounded-[24px] glass px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-bold tracking-tight">
                      {f.p}
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary transition-transform duration-300 group-open:rotate-45 group-open:bg-brand">
                        <Plus size={16} />
                      </span>
                    </summary>
                    <p className="mt-3 pr-10 font-medium text-muted-foreground">{f.r}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ───────── Prefere conversar? ───────── */}
        <section id="contato" className="scroll-mt-28 px-4 pb-24 sm:pb-28">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-black tracking-[-0.03em] sm:text-4xl">
              Prefere conversar <span className="text-primary">antes?</span>
            </h2>
            <p className="mx-auto mt-3 mb-8 max-w-xl text-base font-semibold text-muted-foreground">
              Deixe seu WhatsApp e a gente te mostra o BubblePet funcionando, sem pressa.
            </p>
            <LeadForm />
          </div>
        </section>

        {/* ───────── CTA final ───────── */}
        <section className="px-4 pb-16">
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-[44px] bg-sun px-6 py-16 text-center sm:px-14 sm:py-20">
            <div aria-hidden className="absolute -top-24 -left-16 size-72 rounded-full bg-white/40 blur-3xl" />
            <div aria-hidden className="absolute -right-10 -bottom-24 size-80 rounded-full bg-[#f59e0b]/40 blur-3xl" />
            <PawPrint aria-hidden size={140} className="absolute -bottom-6 left-6 rotate-[-18deg] opacity-[0.08]" />
            <PawPrint aria-hidden size={90} className="absolute top-6 right-10 rotate-[22deg] opacity-[0.08]" />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="text-4xl leading-[1.05] font-black tracking-[-0.03em] sm:text-6xl">
                Bora deixar o petshop no ritmo certo?
              </h2>
              <p className="mt-5 text-lg font-semibold opacity-80">
                <strong>5 dias grátis</strong>, sem cartão: crie a conta, conecte o WhatsApp e compartilhe seu link de agendamento ainda hoje.
              </p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href="/cadastro" className={cn(buttonVariants({ size: "lg" }), "h-13 px-8 text-base")}>
                  Criar conta do petshop <ArrowRight />
                </Link>
                <EntrarLink className="inline-flex h-13 items-center rounded-full border-2 border-[#3d2c00]/20 px-8 text-base font-bold transition-colors hover:bg-white/40">
                  Já tenho conta
                </EntrarLink>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      {/* ───────── Rodapé ───────── */}
      <footer className="px-4 pb-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 border-t border-border pt-8 sm:flex-row">
          <Logo />
          <nav className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm font-semibold text-muted-foreground">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} className="hover:text-foreground">
                {n.label}
              </a>
            ))}
            <EntrarLink className="hover:text-foreground" />
          </nav>
          <p className="text-sm text-muted-foreground">© {new Date().getFullYear()} BubblePet</p>
        </div>
      </footer>
    </div>
  );
}
