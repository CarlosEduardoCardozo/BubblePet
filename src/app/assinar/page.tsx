import { redirect } from "next/navigation";
import Link from "next/link";
import { CalendarCheck, Check, Gift, MessageCircle, PawPrint, Sparkles, Users, Wallet } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { usuarioAtual } from "@/lib/supabase/usuario";
import { logout } from "@/app/(app)/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatCentavos } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { diasTexto, situacaoDaConta, TOLERANCIA_DIAS } from "@/lib/teste";

export const metadata = { title: "Assinar · BubblePet" };
export const dynamic = "force-dynamic";

const BENEFICIOS = [
  { icon: CalendarCheck, texto: "Agenda organizada, com lembretes automáticos no WhatsApp" },
  { icon: Users, texto: "Clientes, pets e histórico sempre à mão" },
  { icon: Wallet, texto: "Planos, fechamento do mês e relatórios sem planilha" },
  { icon: Gift, texto: "Fidelidade, retorno de clientes e link de agendamento próprio" },
];

export default async function AssinarPage() {
  const supabase = await createClient();
  const user = await usuarioAtual(supabase);
  if (!user) redirect("/login");

  const db = createAdminClient();
  const { data: perfil } = await db
    .from("perfis")
    .select("petshop_id, petshops(nome, plano_status, teste_ate)")
    .eq("id", user.id)
    .maybeSingle();
  const petshop = perfil?.petshops as unknown as { nome: string; plano_status: string; teste_ate: string | null } | null;
  if (!perfil || !petshop) redirect("/login");

  const situacao = situacaoDaConta(petshop.plano_status, petshop.teste_ate);

  const [{ data: config }, tutores, agendamentos] = await Promise.all([
    db.from("plataforma_config").select("link_assinatura, preco_mensal_centavos, contato_whatsapp").eq("id", 1).maybeSingle(),
    db.from("tutores").select("id", { count: "exact", head: true }).eq("petshop_id", perfil.petshop_id).eq("ativo", true),
    db.from("agendamentos").select("id", { count: "exact", head: true }).eq("petshop_id", perfil.petshop_id).neq("status", "cancelado"),
  ]);
  const clientes = tutores.count ?? 0;
  const atendimentos = agendamentos.count ?? 0;

  const link = config?.link_assinatura?.trim() || null;
  const whatsapp = config?.contato_whatsapp?.replace(/\D/g, "") || null;
  const linkWhatsapp = whatsapp
    ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Oi! Quero assinar o BubblePet para o ${petshop.nome}.`)}`
    : null;

  const expirado = situacao.tipo === "expirado";
  const titulo =
    situacao.tipo === "assinante"
      ? "Sua assinatura está ativa"
      : expirado
        ? "Seu teste grátis acabou"
        : situacao.tipo === "tolerancia"
          ? "Seu teste acabou, mas ainda dá tempo"
          : "Gostou? Continue com tudo organizado";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      <div className="flex items-center gap-3">
        <span className="flex size-11 items-center justify-center rounded-2xl bg-brand">
          <PawPrint size={22} />
        </span>
        <span className="text-lg font-extrabold tracking-tight">
          Bubble<span className="text-primary">Pet</span>
        </span>
      </div>

      <section className="glass flex flex-col gap-5 rounded-card p-6 shadow-[0_20px_60px_-24px_rgba(76,29,149,0.35)]">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight">{titulo}</h1>
          <p className="text-sm text-muted-foreground">
            {situacao.tipo === "assinante"
              ? `${petshop.nome} já é assinante. Obrigado por confiar no BubblePet!`
              : expirado
                ? `Os dados de ${petshop.nome} estão guardados e voltam exatamente como estavam assim que você assinar.`
                : situacao.tipo === "tolerancia"
                  ? `Você ainda tem acesso por mais ${diasTexto(situacao.diasRestantes)}. Depois disso, ${petshop.nome} fica bloqueado até a assinatura.`
                  : `Seu teste grátis termina em ${diasTexto(situacao.diasRestantes)}. Assine antes e não perca nada do que você já montou.`}
          </p>
        </div>

        {(clientes > 0 || atendimentos > 0) && situacao.tipo !== "assinante" && (
          <div className="flex items-start gap-3 rounded-2xl bg-sun/30 px-4 py-3 text-sm">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-[#8a5a00]" />
            <p className="text-[#5c3d00]">
              Em poucos dias você já cadastrou <strong>{clientes} {clientes === 1 ? "cliente" : "clientes"}</strong> e organizou{" "}
              <strong>{atendimentos} {atendimentos === 1 ? "atendimento" : "atendimentos"}</strong>. Seria uma pena perder isso.
            </p>
          </div>
        )}

        <ul className="flex flex-col gap-2.5">
          {BENEFICIOS.map(({ icon: Icon, texto }) => (
            <li key={texto} className="flex items-center gap-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                <Icon size={15} />
              </span>
              {texto}
            </li>
          ))}
        </ul>

        {config?.preco_mensal_centavos != null && situacao.tipo !== "assinante" && (
          <p className="flex items-baseline gap-1.5">
            <span className="text-3xl font-extrabold tracking-tight">{formatCentavos(config.preco_mensal_centavos)}</span>
            <span className="text-sm text-muted-foreground">por mês · sem fidelidade</span>
          </p>
        )}

        {situacao.tipo !== "assinante" && (
          <div className="flex flex-col gap-2.5">
            {link ? (
              <a href={link} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base")}>
                <Check size={18} /> Assinar agora
              </a>
            ) : linkWhatsapp ? (
              <a href={linkWhatsapp} target="_blank" rel="noreferrer" className={cn(buttonVariants({ size: "lg" }), "h-12 w-full text-base")}>
                <MessageCircle size={18} /> Assinar pelo WhatsApp
              </a>
            ) : (
              <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                Fale com o suporte do BubblePet para assinar.
              </p>
            )}
            {link && linkWhatsapp && (
              <a href={linkWhatsapp} target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
                <MessageCircle size={16} /> Tirar dúvidas no WhatsApp
              </a>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Depois de assinar, o acesso é liberado pelo BubblePet. {expirado ? "" : `Você tem ${TOLERANCIA_DIAS} dias de tolerância depois do teste.`}
            </p>
          </div>
        )}
      </section>

      <div className="flex items-center justify-between text-sm">
        {!expirado ? (
          <Link href="/dashboard" className="font-medium text-primary underline">
            Voltar ao painel
          </Link>
        ) : (
          <span />
        )}
        <form action={logout}>
          <Button type="submit" variant="ghost" size="sm">
            Sair
          </Button>
        </form>
      </div>
    </main>
  );
}
