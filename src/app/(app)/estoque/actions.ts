"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { semPermissao } from "@/lib/acesso";
import { createClient } from "@/lib/supabase/server";
import { getCurrentPetshopId } from "@/lib/supabase/petshop";
import { mensagemErroBanco } from "@/lib/db-errors";
import { parseCentavos } from "@/lib/currency";
import { CATEGORIA_VALORES, UNIDADE_VALORES } from "@/lib/estoque";
import { IaIndisponivel } from "@/lib/ia/openai";
import { reconhecerProduto, type ProdutoReconhecido } from "@/lib/ia/produto-foto";

type ActionResult = { error: string } | { success: true };

/** Lê a foto (já reduzida no celular) e devolve o que a IA reconheceu. */
export async function reconhecerFotoAction(
  imagemDataUrl: string
): Promise<{ error: string } | { produto: ProdutoReconhecido }> {
  const bloqueio = await semPermissao("estoque");
  if (bloqueio) return bloqueio;
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(imagemDataUrl)) return { error: "Envie uma foto (JPG, PNG ou WebP)." };
  if (imagemDataUrl.length > 900_000) return { error: "Foto grande demais. Tente de novo mais de perto." };
  try {
    return { produto: await reconhecerProduto(imagemDataUrl) };
  } catch (error) {
    if (error instanceof IaIndisponivel) return { error: error.message };
    return { error: error instanceof Error ? error.message : "Não deu para reconhecer o produto." };
  }
}

const numero = (min: number) =>
  z
    .string()
    .trim()
    .transform((v) => (v === "" ? 0 : Number(v.replace(",", "."))))
    .refine((n) => Number.isFinite(n) && n >= min, "Quantidade inválida.");

const produtoSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(120),
  marca: z.string().trim().max(80).transform((v) => v || null),
  categoria: z.enum(CATEGORIA_VALORES as [string, ...string[]]),
  conteudo: z.string().trim().max(40).transform((v) => v || null),
  unidade: z.enum(UNIDADE_VALORES as [string, ...string[]]),
  quantidade: numero(0),
  minimo: numero(0),
  custo: z.string().trim(),
  preco: z.string().trim(),
});

export type ProdutoForm = z.input<typeof produtoSchema>;

function centavos(v: string): number | null | "erro" {
  if (!v) return null;
  const c = parseCentavos(v);
  return c == null ? "erro" : c;
}

/** Cria (sem id) ou edita. A quantidade inicial entra como movimento de entrada. */
export async function salvarProduto(id: string | null, form: ProdutoForm): Promise<ActionResult> {
  const bloqueio = await semPermissao("estoque");
  if (bloqueio) return bloqueio;
  const parsed = produtoSchema.safeParse(form);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  const { quantidade, custo, preco, ...dados } = parsed.data;
  const custoCentavos = centavos(custo);
  const precoCentavos = centavos(preco);
  if (custoCentavos === "erro" || precoCentavos === "erro") return { error: "Valor inválido. Ex.: 39,90" };

  const supabase = await createClient();
  const valores = { ...dados, custo_centavos: custoCentavos, preco_centavos: precoCentavos, atualizado_em: new Date().toISOString() };

  if (id) {
    const { error } = await supabase.from("produtos").update(valores).eq("id", id);
    if (error) return { error: mensagemErroBanco(error) };
  } else {
    const petshopId = await getCurrentPetshopId(supabase);
    const { data: novo, error } = await supabase
      .from("produtos")
      .insert({ ...valores, petshop_id: petshopId })
      .select("id")
      .single();
    if (error || !novo) return { error: mensagemErroBanco(error, { fallback: "Erro ao cadastrar o produto." }) };
    if (quantidade > 0) {
      const { error: erroMov } = await supabase.rpc("movimentar_estoque", {
        p_produto_id: novo.id,
        p_tipo: "entrada",
        p_quantidade: quantidade,
        p_motivo: "Cadastro do produto",
      });
      if (erroMov) return { error: mensagemErroBanco(erroMov) };
    }
  }
  revalidatePath("/estoque");
  return { success: true };
}

export async function movimentarEstoque(
  produtoId: string,
  tipo: "entrada" | "saida" | "ajuste",
  quantidade: number,
  motivo?: string
): Promise<{ error: string } | { saldo: number }> {
  const bloqueio = await semPermissao("estoque");
  if (bloqueio) return bloqueio;
  if (!Number.isFinite(quantidade) || quantidade < 0 || quantidade > 100_000) return { error: "Quantidade inválida." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("movimentar_estoque", {
    p_produto_id: produtoId,
    p_tipo: tipo,
    p_quantidade: quantidade,
    p_motivo: motivo ?? null,
  });
  if (error) return { error: mensagemErroBanco(error) };
  revalidatePath("/estoque");
  return { saldo: Number(data) };
}

/** Tira o produto da lista (o histórico fica). */
export async function arquivarProduto(id: string): Promise<ActionResult> {
  const bloqueio = await semPermissao("estoque");
  if (bloqueio) return bloqueio;
  const supabase = await createClient();
  const { error } = await supabase.from("produtos").update({ ativo: false }).eq("id", id);
  if (error) return { error: mensagemErroBanco(error) };
  revalidatePath("/estoque");
  return { success: true };
}
