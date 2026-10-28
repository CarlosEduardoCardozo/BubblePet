"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormSelect } from "@/components/shared/FormSelect";
import { CurrencyInput } from "@/components/shared/CurrencyInput";
import { formatCentavos } from "@/lib/currency";
import { CATEGORIAS, UNIDADES, formatarQuantidade } from "@/lib/estoque";
import { arquivarProduto, movimentarEstoque, reconhecerFotoAction, salvarProduto, type ProdutoForm } from "./actions";
import type { Produto } from "./EstoqueView";

/** Reduz a foto no aparelho (máx. 1280 px, JPEG) antes de mandar pro servidor. */
export async function reduzirFoto(arquivo: File): Promise<string> {
  const bitmap = await createImageBitmap(arquivo);
  const escala = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let url = canvas.toDataURL("image/jpeg", 0.82);
  if (url.length > 850_000) url = canvas.toDataURL("image/jpeg", 0.6);
  return url;
}

const vazio: ProdutoForm = {
  nome: "",
  marca: "",
  categoria: "outro",
  conteudo: "",
  unidade: "un",
  quantidade: "1",
  minimo: "1",
  custo: "",
  preco: "",
};

function paraInput(centavos: number | null): string {
  return centavos == null ? "" : formatCentavos(centavos).replace("R$", "").trim();
}

export function ProdutoSheet({
  aberto,
  produto,
  foto,
  onClose,
}: {
  aberto: boolean;
  produto: Produto | null;
  foto: string | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ProdutoForm>(vazio);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Abriu: preenche com o produto (edição), ou lê a foto com a IA.
  useEffect(() => {
    if (!aberto) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carrega o produto (ou limpa) ao abrir
    setAviso(null);
    if (produto) {
      setForm({
        nome: produto.nome,
        marca: produto.marca ?? "",
        categoria: produto.categoria,
        conteudo: produto.conteudo ?? "",
        unidade: produto.unidade,
        quantidade: formatarQuantidade(produto.quantidade),
        minimo: formatarQuantidade(produto.minimo),
        custo: paraInput(produto.custo_centavos),
        preco: paraInput(produto.preco_centavos),
      });
      return;
    }
    setForm(vazio);
    if (!foto) return;
    let cancelado = false;
    setLendo(true);
    reconhecerFotoAction(foto).then((r) => {
      if (cancelado) return;
      setLendo(false);
      if ("error" in r) {
        toast.error(r.error);
        setAviso("Não deu para ler o rótulo. Preencha à mão.");
        return;
      }
      const p = r.produto;
      setForm((f) => ({
        ...f,
        nome: p.nome,
        marca: p.marca ?? "",
        categoria: p.categoria,
        conteudo: p.conteudo ?? "",
        unidade: p.unidade,
        quantidade: String(p.quantidade),
      }));
      setAviso(
        p.observacao ??
          (p.confianca < 0.6 ? "A IA não tem certeza desse produto. Confira o nome e a marca." : "Confira os dados e complete o mínimo e os valores.")
      );
    });
    return () => {
      cancelado = true;
    };
  }, [aberto, produto, foto]);

  const set = (campo: keyof ProdutoForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [campo]: e.target.value }));

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await salvarProduto(produto?.id ?? null, form);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      // Edição: a quantidade nova vira um ajuste no histórico.
      if (produto) {
        const nova = Number(String(form.quantidade).replace(",", "."));
        if (Number.isFinite(nova) && nova !== produto.quantidade) {
          const m = await movimentarEstoque(produto.id, "ajuste", nova, "Ajuste na edição");
          if ("error" in m) {
            toast.error(m.error);
            return;
          }
        }
      }
      toast.success(produto ? "Produto atualizado." : `${form.nome} cadastrado no estoque.`);
      onClose();
    });
  }

  function arquivar() {
    if (!produto) return;
    startTransition(async () => {
      const r = await arquivarProduto(produto.id);
      if ("error" in r) toast.error(r.error);
      else {
        toast.success(`${produto.nome} saiu da lista.`);
        onClose();
      }
    });
  }

  return (
    <Sheet open={aberto} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{produto ? "Editar produto" : foto ? "Produto pela foto" : "Novo produto"}</SheetTitle>
          <SheetDescription>
            {foto && !produto ? "A IA lê o rótulo e preenche para você. Confira antes de salvar." : "Os produtos que acabam aparecem destacados na lista."}
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={salvar} className="flex flex-col gap-4 px-4 pb-4">
          {foto && !produto && (
            <div className="relative overflow-hidden rounded-2xl border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- prévia local da foto (data URL) */}
              <img src={foto} alt="Foto do produto" className="max-h-56 w-full object-contain" />
              {lendo && (
                <div className="absolute inset-0 flex items-center justify-center gap-2 bg-white/70 text-sm font-semibold text-primary backdrop-blur-sm">
                  <Sparkles size={16} className="animate-pulse" /> Lendo o rótulo...
                </div>
              )}
            </div>
          )}
          {aviso && <p className="rounded-xl bg-secondary px-3 py-2 text-xs font-medium text-primary">{aviso}</p>}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" value={form.nome} onChange={set("nome")} required disabled={lendo} placeholder="Ex.: Shampoo Neutro" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="marca">Marca</Label>
              <Input id="marca" value={form.marca} onChange={set("marca")} disabled={lendo} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="conteudo">Tamanho</Label>
              <Input id="conteudo" value={form.conteudo} onChange={set("conteudo")} disabled={lendo} placeholder="5 L, 500 ml..." />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="categoria">Categoria</Label>
            <FormSelect
              id="categoria"
              value={form.categoria}
              onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}
              options={CATEGORIAS.map((c) => ({ value: c.valor, label: c.label }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="quantidade">{produto ? "Tem hoje" : "Quantidade"}</Label>
              <Input id="quantidade" inputMode="decimal" value={form.quantidade} onChange={set("quantidade")} disabled={lendo} />
            </div>
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label htmlFor="unidade">Em</Label>
              <FormSelect
                id="unidade"
                value={form.unidade}
                onValueChange={(v) => setForm((f) => ({ ...f, unidade: v }))}
                options={UNIDADES.map((u) => ({ value: u.valor, label: u.label }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="minimo">Avisar quando tiver só</Label>
            <Input id="minimo" inputMode="decimal" value={form.minimo} onChange={set("minimo")} className="w-28" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="custo">Custo (opcional)</Label>
              <CurrencyInput id="custo" value={form.custo} onChange={(e) => setForm((f) => ({ ...f, custo: e.target.value }))} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="preco">Preço de venda (opcional)</Label>
              <CurrencyInput id="preco" value={form.preco} onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))} />
            </div>
          </div>

          <SheetFooter className="flex-row items-center justify-between px-0">
            {produto ? (
              <Button type="button" variant="ghost" className="text-muted-foreground" onClick={arquivar} disabled={isPending}>
                Tirar da lista
              </Button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || lendo}>
                {isPending ? "Salvando..." : "Salvar"}
              </Button>
            </span>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
