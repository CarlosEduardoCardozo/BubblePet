import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { usuarioAtual } from "@/lib/supabase/usuario";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { SuporteBanner } from "@/components/layout/SuporteBanner";
import { TesteBanner } from "@/components/layout/TesteBanner";
import { PrimeirosPassos } from "@/components/onboarding/PrimeirosPassos";
import { situacaoDaConta } from "@/lib/teste";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";
import { lerModulos, TODOS_MODULOS } from "@/lib/permissoes";
import { lerSuporte } from "@/lib/suporte";
import { registrarUso } from "@/lib/uso";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const user = await usuarioAtual(supabase);

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome, petshop_id, role, permissoes, ativo, ultimo_uso_em, petshops(nome, whatsapp_status, plano_status, teste_ate, onboarding)")
    .eq("id", user.id)
    .single();

  if (perfil && !perfil.ativo) redirect("/suspenso");

  const petshop = perfil?.petshops as unknown as {
    nome: string;
    whatsapp_status: string;
    plano_status: string;
    teste_ate: string | null;
    onboarding: Record<string, unknown> | null;
  } | null;
  const situacao = situacaoDaConta(petshop?.plano_status, petshop?.teste_ate);

  // Com a conta congelada, current_petshop_id() devolve null e as RLS
  // escondem o petshop — aí confere o status direto e manda pra tela de
  // acesso suspenso em vez de quebrar em cada página.
  if (perfil && !petshop) {
    const { data: status } = await createAdminClient()
      .from("petshops")
      .select("status")
      .eq("id", perfil.petshop_id)
      .maybeSingle();
    if (status?.status === "congelado") redirect("/suspenso");
  }

  const suporte = await lerSuporte(user.id);
  // Teste e tolerância acabaram: bloqueia até assinar (o admin em modo suporte passa).
  if (situacao.tipo === "expirado" && !suporte && !ehAdmin(user.email)) redirect("/assinar");
  const dono = perfil?.role === "dono";
  const menu = {
    // No modo suporte o admin vê exatamente o que o usuário vê.
    admin: !suporte && ehAdmin(user.email),
    dono,
    modulos: dono ? TODOS_MODULOS : lerModulos(perfil?.permissoes),
  };

  // "Está usando?" do painel admin: marca o uso no máximo a cada 5 min, e
  // nunca enquanto o admin está vendo a conta pelo suporte.
  if (perfil && !suporte) {
    const ultimoUso = perfil.ultimo_uso_em as string | null;
    after(() => registrarUso(user.id, ultimoUso));
  }

  return (
    <div className="flex min-h-screen flex-col">
      {suporte && <SuporteBanner usuario={suporte.alvoNome} petshop={suporte.petshopNome} />}
      {!suporte && <TesteBanner situacao={situacao} />}
      <div className="flex min-h-0 flex-1">
        <Sidebar menu={menu} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            petshopNome={petshop?.nome ?? "BubblePet"}
            donoNome={perfil?.nome ?? user.email ?? ""}
            whatsappConectado={petshop?.whatsapp_status === "conectado"}
            menu={menu}
          />
          <main className="flex-1 px-4 pt-2 pb-10 md:px-8 lg:pr-10 lg:pl-4">{children}</main>
        </div>
      </div>
      {!suporte && petshop?.plano_status === "teste" && (
        <PrimeirosPassos diasDeTeste={situacao.tipo === "teste" ? situacao.diasRestantes : null} />
      )}
    </div>
  );
}
