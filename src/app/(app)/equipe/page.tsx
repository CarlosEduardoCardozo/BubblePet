import { exigirDono } from "@/lib/acesso";
import { createAdminClient } from "@/lib/supabase/admin";
import { lerModulos } from "@/lib/permissoes";
import { EquipeView, type Membro } from "./EquipeView";

export const metadata = { title: "Equipe · BubblePet" };

export default async function EquipePage() {
  const acesso = await exigirDono();
  const admin = createAdminClient();

  // Service role: o e-mail mora no auth.users. Filtro explícito pelo petshop do dono.
  const { data: perfis } = await admin
    .from("perfis")
    .select("id, nome, role, permissoes, ativo, ultimo_uso_em, criado_em")
    .eq("petshop_id", acesso.petshopId)
    .order("criado_em");

  const membros: Membro[] = await Promise.all(
    (perfis ?? []).map(async (p) => {
      const { data } = await admin.auth.admin.getUserById(p.id);
      return {
        id: p.id,
        nome: p.nome,
        email: data?.user?.email ?? "",
        dono: p.role === "dono",
        modulos: lerModulos(p.permissoes),
        ativo: p.ativo,
        ultimoUso: p.ultimo_uso_em,
        voce: p.id === acesso.userId,
      };
    })
  );

  return <EquipeView membros={membros} />;
}
