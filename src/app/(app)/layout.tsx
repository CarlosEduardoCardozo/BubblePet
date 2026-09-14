import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { createAdminClient } from "@/lib/supabase/admin";
import { ehAdmin } from "@/lib/admin";

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
    .select("nome, petshop_id, petshops(nome, whatsapp_status)")
    .eq("id", user.id)
    .single();

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
  const admin = ehAdmin(user.email);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar admin={admin} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          petshopNome={petshop?.nome ?? "BubblePet"}
          donoNome={perfil?.nome ?? user.email ?? ""}
          whatsappConectado={petshop?.whatsapp_status === "conectado"}
          admin={admin}
        />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
