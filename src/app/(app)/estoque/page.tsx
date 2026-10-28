import { createClient } from "@/lib/supabase/server";
import { iaDisponivel } from "@/lib/ia/openai";
import { EstoqueView, type Produto } from "./EstoqueView";

export const metadata = { title: "Estoque · BubblePet" };

export default async function EstoquePage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos")
    .select("id, nome, marca, categoria, conteudo, quantidade, unidade, minimo, custo_centavos, preco_centavos, atualizado_em")
    .eq("ativo", true)
    .order("nome");

  const produtos: Produto[] = (data ?? []).map((p) => ({
    ...p,
    quantidade: Number(p.quantidade),
    minimo: Number(p.minimo),
  }));

  return <EstoqueView produtos={produtos} erro={!!error} iaDisponivel={iaDisponivel()} />;
}
