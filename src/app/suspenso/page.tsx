import { redirect } from "next/navigation";
import { Snowflake } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logout } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Acesso suspenso · BubblePet" };

export default async function SuspensoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Só fica aqui quem está de fato congelado; o resto volta pro painel.
  const admin = createAdminClient();
  const { data: perfil } = await admin
    .from("perfis")
    .select("petshop_id, ativo, petshops(nome, status, congelado_em)")
    .eq("id", user.id)
    .maybeSingle();
  const petshop = perfil?.petshops as unknown as
    | { nome: string; status: string; congelado_em: string | null }
    | null;
  const usuarioDesativado = !!perfil && !perfil.ativo;
  if (!petshop || (petshop.status !== "congelado" && !usuarioDesativado)) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-gray-50 px-4 py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-4 rounded-[12px] border border-border bg-white p-8 text-center shadow-sm">
        <span className="flex size-12 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <Snowflake size={24} />
        </span>
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-semibold">Acesso suspenso</h1>
          <p className="text-sm text-muted-foreground">
            {petshop.status === "congelado" ? (
              <>
                O acesso de <span className="font-medium text-foreground">{petshop.nome}</span> ao
                BubblePet está pausado. Os dados continuam guardados — assim que for liberado, tudo
                volta como estava.
              </>
            ) : (
              <>
                Seu usuário em <span className="font-medium text-foreground">{petshop.nome}</span> foi
                desativado.
              </>
            )}
          </p>
        </div>
        <p className="text-sm text-muted-foreground">
          {petshop.status === "congelado"
            ? "Fale com o suporte do BubblePet para reativar."
            : "Se foi engano, peça pro dono do petshop reativar seu acesso em Equipe."}
        </p>
        <form action={logout}>
          <Button type="submit" variant="outline">
            Sair
          </Button>
        </form>
      </div>
    </main>
  );
}
