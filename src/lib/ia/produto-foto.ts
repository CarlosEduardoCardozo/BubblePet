import "server-only";

import { CATEGORIA_VALORES, UNIDADE_VALORES, type Categoria, type Unidade } from "@/lib/estoque";
import { gerarJson } from "./openai";

export type ProdutoReconhecido = {
  nome: string;
  marca: string | null;
  categoria: Categoria;
  /** Tamanho da embalagem no rótulo ("5 L", "500 ml"). */
  conteudo: string | null;
  /** Quantas embalagens aparecem na foto. */
  quantidade: number;
  unidade: Unidade;
  /** 0–1: quão certa a IA está. */
  confianca: number;
  observacao: string | null;
};

const INSTRUCOES = `Você ajuda um petshop brasileiro a cadastrar produtos do estoque a partir de uma foto tirada no celular.
Leia o rótulo e responda com os dados do produto:
- nome: nome comercial curto, como aparece no rótulo (ex.: "Shampoo Neutro Pelos Claros"). Não repita a marca no nome.
- marca: fabricante, se legível; senão null.
- categoria: uma das opções da lista.
- conteudo: volume ou peso da embalagem como no rótulo (ex.: "5 L", "500 ml", "15 kg"); null se não der para ler.
- quantidade: quantas embalagens iguais aparecem na foto (mínimo 1).
- unidade: "frasco" para líquidos em frasco/galão, "pacote" para sacos de ração/petisco, "caixa" para caixas, senão "un".
- confianca: de 0 a 1, o quanto você tem certeza do nome e da marca.
- observacao: um aviso curto se algo estiver ilegível ou se a foto não for de um produto; senão null.
Nunca invente marca ou tamanho que não estejam visíveis.`;

export async function reconhecerProduto(imagemDataUrl: string): Promise<ProdutoReconhecido> {
  const r = await gerarJson<ProdutoReconhecido>({
    instrucoes: INSTRUCOES,
    texto: "Identifique o produto desta foto.",
    imagem: imagemDataUrl,
    nomeSchema: "produto_estoque",
    temperatura: 0.1,
    schema: {
      type: "object",
      properties: {
        nome: { type: "string" },
        marca: { type: ["string", "null"] },
        categoria: { type: "string", enum: CATEGORIA_VALORES },
        conteudo: { type: ["string", "null"] },
        quantidade: { type: "number" },
        unidade: { type: "string", enum: UNIDADE_VALORES },
        confianca: { type: "number" },
        observacao: { type: ["string", "null"] },
      },
      required: ["nome", "marca", "categoria", "conteudo", "quantidade", "unidade", "confianca", "observacao"],
      additionalProperties: false,
    },
  });
  return {
    ...r,
    nome: r.nome.trim().slice(0, 120),
    quantidade: Math.max(1, Math.round(r.quantidade || 1)),
    confianca: Math.min(1, Math.max(0, r.confianca)),
  };
}
