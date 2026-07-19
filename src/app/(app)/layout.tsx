import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";

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
    .select("nome, petshops(nome)")
    .eq("id", user.id)
    .single();

  const petshop = perfil?.petshops as unknown as { nome: string } | null;

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Topbar
          petshopNome={petshop?.nome ?? "BubblePet"}
          donoNome={perfil?.nome ?? user.email ?? ""}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
