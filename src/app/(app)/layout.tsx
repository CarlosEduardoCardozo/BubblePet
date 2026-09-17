import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { SuporteBanner } from "@/components/layout/SuporteBanner";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("perfis")
    .select("nome, petshop_id, role, permissoes, ativo, ultimo_uso_em, petshops(nome, whatsapp_status)")
    .eq("id", user.id)
    .single();

  if (perfil && !perfil.ativo) redirect("/suspenso");

  const petshop = perfil?.petshops as unknown as {
    nome: string;
    whatsapp_status: string;
  } | null;

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
    <div className="flex min-h-screen flex-col bg-gray-50">
      {suporte && <SuporteBanner usuario={suporte.alvoNome} petshop={suporte.petshopNome} />}
      <div className="flex min-h-0 flex-1">
        <Sidebar menu={menu} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar
            petshopNome={petshop?.nome ?? "BubblePet"}
            donoNome={perfil?.nome ?? user.email ?? ""}
            whatsappConectado={petshop?.whatsapp_status === "conectado"}
            menu={menu}
          />
          <main className="flex-1 p-4 md:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
