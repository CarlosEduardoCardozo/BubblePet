"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Camera, Minus, Package, Pencil, Plus, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatCentavos } from "@/lib/currency";
import { formatarQuantidade, rotuloCategoria, rotuloUnidade } from "@/lib/estoque";
import { cn } from "@/lib/utils";
import { movimentarEstoque } from "./actions";
import { ProdutoSheet, reduzirFoto } from "./ProdutoSheet";

export type Produto = {
  id: string;
  nome: string;
  marca: string | null;
  categoria: string;
  conteudo: string | null;
  quantidade: number;
  unidade: string;
  minimo: number;
  custo_centavos: number | null;
  preco_centavos: number | null;
  atualizado_em: string;
};

export function EstoqueView({ produtos, erro, iaDisponivel }: { produtos: Produto[]; erro: boolean; iaDisponivel: boolean }) {
  const [busca, setBusca] = useState("");
  const [soAcabando, setSoAcabando] = useState(false);
  const [aberto, setAberto] = useState<{ produto: Produto | null; foto: string | null } | null>(null);
  const [mexendo, setMexendo] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const camera = useRef<HTMLInputElement>(null);

  const acabando = produtos.filter((p) => p.quantidade <= p.minimo);
  const valorEstoque = produtos.reduce((s, p) => s + (p.custo_centavos ?? 0) * p.quantidade, 0);
  const termo = busca.trim().toLowerCase();
  const lista = (soAcabando ? acabando : produtos).filter(
    (p) => !termo || p.nome.toLowerCase().includes(termo) || (p.marca ?? "").toLowerCase().includes(termo)
  );

  async function fotoEscolhida(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = "";
    if (!arquivo) return;
    try {
      const foto = await reduzirFoto(arquivo);
      setAberto({ produto: null, foto });
    } catch {
      toast.error("Não deu para abrir essa foto. Tente outra.");
    }
  }

  function mexer(p: Produto, tipo: "entrada" | "saida") {
    setMexendo(p.id);
    startTransition(async () => {
      const r = await movimentarEstoque(p.id, tipo, 1, tipo === "saida" ? "Baixa rápida" : "Entrada rápida");
      setMexendo(null);
      if ("error" in r) toast.error(r.error);
      else if (tipo === "saida" && r.saldo <= p.minimo) toast.warning(`${p.nome} está acabando (${formatarQuantidade(r.saldo)} ${rotuloUnidade(p.unidade, r.saldo)}).`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Estoque"
        description="Tire uma foto do produto e a IA preenche o cadastro. Dê baixa com um toque."
        action={
          <>
            <Button variant="outline" onClick={() => setAberto({ produto: null, foto: null })}>
              <Plus size={16} /> Sem foto
            </Button>
            <Button onClick={() => camera.current?.click()} disabled={!iaDisponivel} title={iaDisponivel ? undefined : "Falta configurar a chave da OpenAI"}>
              <Camera size={16} /> Cadastrar pela foto
            </Button>
          </>
        }
      />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={fotoEscolhida} />
      {!iaDisponivel && (
        <p className="glass rounded-card px-5 py-3 text-sm text-muted-foreground">
          O cadastro pela foto usa a IA da OpenAI, que ainda não está configurada no servidor. Dá para cadastrar sem foto.
        </p>
      )}
      {erro && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">Não foi possível carregar o estoque.</p>}

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Numero titulo="Produtos" valor={String(produtos.length)} />
        <Numero titulo="Acabando" valor={String(acabando.length)} alerta={acabando.length > 0} />
        <Numero titulo="Valor em estoque" valor={valorEstoque ? formatCentavos(valorEstoque) : "—"} pequeno />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar produto ou marca..." className="max-w-xs" />
        <button
          type="button"
          onClick={() => setSoAcabando((v) => !v)}
          className={cn("rounded-full px-4 py-2 text-sm font-semibold", soAcabando ? "bg-sun" : "glass text-muted-foreground")}
        >
          Só os que estão acabando ({acabando.length})
        </button>
      </div>

      {lista.length === 0 ? (
        <EmptyState
          icon={Package}
          title={produtos.length === 0 ? "Nenhum produto ainda" : "Nada encontrado"}
          description={produtos.length === 0 ? "Tire uma foto do primeiro produto: shampoo, perfume, ração..." : "Tente outra busca."}
        />
      ) : (
        <div className="glass flex flex-col divide-y divide-border/70 overflow-hidden rounded-card">
          {lista.map((p) => {
            const baixo = p.quantidade <= p.minimo;
            return (
              <div key={p.id} className={cn("flex items-center gap-3 px-4 py-3 sm:px-5", mexendo === p.id && "opacity-60")}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-bold">{p.nome}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[p.marca, p.conteudo, rotuloCategoria(p.categoria)].filter(Boolean).join(" · ")}
                  </p>
                  {baixo && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sun/30 px-2 py-0.5 text-[11px] font-bold text-[#5c3d00]">
                      <TriangleAlert size={11} /> Acabando · mínimo {formatarQuantidade(p.minimo)}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button size="icon-sm" variant="outline" onClick={() => mexer(p, "saida")} disabled={p.quantidade <= 0 || mexendo === p.id} aria-label={`Dar baixa de 1 ${p.nome}`}>
                    <Minus size={14} />
                  </Button>
                  <div className="w-16 text-center">
                    <p className={cn("text-xl font-extrabold tabular-nums", baixo && "text-[#b45309]")}>{formatarQuantidade(p.quantidade)}</p>
                    <p className="text-[11px] text-muted-foreground">{rotuloUnidade(p.unidade, p.quantidade)}</p>
                  </div>
                  <Button size="icon-sm" variant="outline" onClick={() => mexer(p, "entrada")} disabled={mexendo === p.id} aria-label={`Entrada de 1 ${p.nome}`}>
                    <Plus size={14} />
                  </Button>
                  <Button size="icon-sm" variant="ghost" onClick={() => setAberto({ produto: p, foto: null })} aria-label={`Editar ${p.nome}`}>
                    <Pencil size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ProdutoSheet
        aberto={!!aberto}
        produto={aberto?.produto ?? null}
        foto={aberto?.foto ?? null}
        onClose={() => setAberto(null)}
      />
    </div>
  );
}

function Numero({ titulo, valor, alerta = false, pequeno = false }: { titulo: string; valor: string; alerta?: boolean; pequeno?: boolean }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-card p-4 sm:p-5", alerta ? "bg-sun" : "glass")}>
      <span className="text-xs font-bold sm:text-sm">{titulo}</span>
      <span className={cn("font-extrabold tracking-tight tabular-nums", pequeno ? "text-lg sm:text-2xl" : "text-3xl sm:text-4xl")}>{valor}</span>
    </div>
  );
}
