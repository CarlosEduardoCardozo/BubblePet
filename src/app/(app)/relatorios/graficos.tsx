"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/** Cores validadas (claro e escuro) para duas séries: roxo da marca e âmbar. */
export const COR_ROXO = "#7c3aed";
export const COR_AMBAR = "#d97706";
const COR_APAGADA = "#b6aecb";

export type Formato = "reais" | "numero" | "percentual";

/** R$ 1,2 mil / R$ 850 / 12 / 40%: curto o bastante para o eixo e os rótulos. */
function formatarValor(formato: Formato, n: number, exato = false): string {
  if (exato && formato === "reais") {
    return (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (formato === "percentual") return `${Math.round(n)}%`;
  if (formato === "numero") return String(Math.round(n));
  const reais = n / 100;
  if (reais >= 1000) return `R$ ${(reais / 1000).toFixed(1).replace(".", ",").replace(",0", "")} mil`;
  return `R$ ${Math.round(reais)}`;
}

export type Serie = { nome: string; cor: string };
export type PontoColuna = {
  rotulo: string;
  /** Um valor por série, na ordem de `series`. */
  valores: number[];
  /** Mês em andamento: aparece mais claro. */
  parcial?: boolean;
  /** Tira a série do destaque (usado no gráfico de ênfase). */
  apagado?: boolean;
  /** Texto extra na dica ao passar o mouse. */
  extra?: string;
  /** Linha da tabela alternativa. */
  tabela: string[];
};

/** Maior valor "redondo" (1, 2, 5 × 10ⁿ) para o topo do eixo. */
function topoDoEixo(maximo: number): number {
  if (maximo <= 0) return 1;
  const potencia = 10 ** Math.floor(Math.log10(maximo));
  const f = maximo / potencia;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * potencia;
}

function TabelaAlternativa({ cabecalho, linhas }: { cabecalho: string[]; linhas: string[][] }) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer font-semibold text-primary">Ver como tabela</summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="text-muted-foreground">
              {cabecalho.map((c, i) => (
                <th key={c} className={cn("py-1 font-semibold", i > 0 && "text-right")}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l[0]} className="border-t border-border/70">
                {l.map((c, i) => (
                  <td key={i} className={cn("py-1 tabular-nums", i > 0 && "text-right")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function Legenda({ series }: { series: Serie[] }) {
  return (
    <div className="mb-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
      {series.map((s) => (
        <span key={s.nome} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: s.cor }} />
          {s.nome}
        </span>
      ))}
    </div>
  );
}

/**
 * Colunas (uma ou mais séries empilhadas). Colunas finas com topo arredondado,
 * 2 px de espaço entre os segmentos, rótulo só no maior e no último, e uma dica
 * por coluna ao passar o mouse ou focar.
 */
export function GraficoColunas({
  titulo,
  series,
  pontos,
  formato,
  cabecalhoTabela,
  altura = 176,
  nota,
}: {
  titulo: string;
  series: Serie[];
  pontos: PontoColuna[];
  formato: Formato;
  cabecalhoTabela: string[];
  altura?: number;
  nota?: string;
}) {
  const [ativo, setAtivo] = useState<number | null>(null);
  const totais = pontos.map((p) => p.valores.reduce((s, v) => s + v, 0));
  const maximo = Math.max(...totais, 0);
  let topo = topoDoEixo(maximo);
  // Contagens pequenas: topo par, para a linha do meio cair num número inteiro.
  if (formato === "numero" && topo < 10) topo = Math.max(2, Math.ceil(maximo / 2) * 2);
  const indiceMaior = maximo > 0 ? totais.indexOf(maximo) : -1;
  const ultimo = pontos.length - 1;
  const formatar = (n: number) => formatarValor(formato, n);
  const formatarEixo = formatar;
  const exato = (n: number) => formatarValor(formato, n, true);
  const temParcial = pontos.some((p) => p.parcial);

  return (
    <div>
      {series.length > 1 && <Legenda series={series} />}
      <div role="img" aria-label={titulo} className="mt-4 flex gap-2">
        <div className="relative w-12 shrink-0 text-right text-[11px] text-muted-foreground" style={{ height: altura }}>
          {[0, 0.5, 1].map((t) => (
            <span key={t} className="absolute right-0 translate-y-1/2 tabular-nums" style={{ bottom: `${t * 100}%` }}>
              {formatarEixo(topo * t)}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: altura }}>
            {[0, 0.5, 1].map((t) => (
              <span key={t} className="absolute inset-x-0 h-px bg-border" style={{ bottom: `${t * 100}%` }} />
            ))}
            <div className="absolute inset-0 flex">
              {pontos.map((p, i) => {
                const total = totais[i];
                const alturaPct = topo > 0 ? (total / topo) * 100 : 0;
                // O segmento de cima (último com valor) leva o topo arredondado.
                let ultimoComValor = -1;
                p.valores.forEach((v, k) => v > 0 && (ultimoComValor = k));
                // Rótulo no maior e no último; se forem vizinhos, só no maior (senão se atropelam).
                const rotular = i === indiceMaior || (i === ultimo && ultimo - indiceMaior > 1);
                return (
                  <div
                    key={p.rotulo}
                    tabIndex={0}
                    onPointerEnter={() => setAtivo(i)}
                    onPointerLeave={() => setAtivo(null)}
                    onFocus={() => setAtivo(i)}
                    onBlur={() => setAtivo(null)}
                    className="relative flex h-full min-w-0 flex-1 cursor-default items-end justify-center outline-none"
                  >
                    <div
                      className="flex w-full max-w-6 flex-col-reverse gap-[2px] transition-opacity"
                      style={{ height: `${alturaPct}%`, opacity: p.parcial ? 0.55 : ativo !== null && ativo !== i ? 0.7 : 1 }}
                    >
                      {p.valores.map((v, k) =>
                        v > 0 ? (
                          <div
                            key={k}
                            className={cn(k === ultimoComValor && "rounded-t-[4px]")}
                            style={{ flex: v, background: p.apagado ? COR_APAGADA : series[k].cor }}
                          />
                        ) : null
                      )}
                    </div>
                    {rotular && total > 0 && (
                      <span
                        className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold tabular-nums"
                        style={{ bottom: `calc(${alturaPct}% + 4px)` }}
                      >
                        {formatar(total)}
                      </span>
                    )}
                    {ativo === i && (
                      <div
                        role="tooltip"
                        className={cn(
                          "pointer-events-none absolute z-20 w-max min-w-36 max-w-56 rounded-xl border border-border bg-popover px-3 py-2 text-xs shadow-lg",
                          i < 2 ? "left-0" : i > pontos.length - 3 ? "right-0" : "left-1/2"
                        )}
                        style={{ top: -8, transform: `translateY(-100%)${i < 2 || i > pontos.length - 3 ? "" : " translateX(-50%)"}` }}
                      >
                        <p className="mb-1 font-semibold">
                          {p.rotulo}
                          {p.parcial && <span className="font-normal text-muted-foreground"> · em andamento</span>}
                        </p>
                        {series.map((s, k) => (
                          <p key={s.nome} className="flex items-center gap-2">
                            <span className="h-[3px] w-3 rounded-full" style={{ background: p.apagado ? COR_APAGADA : s.cor }} />
                            <span className="font-semibold tabular-nums">{exato(p.valores[k])}</span>
                            <span className="text-muted-foreground">{s.nome}</span>
                          </p>
                        ))}
                        {series.length > 1 && (
                          <p className="mt-1 border-t border-border pt-1 font-semibold tabular-nums">Total {exato(total)}</p>
                        )}
                        {p.extra && <p className="mt-1 text-muted-foreground">{p.extra}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-1.5 flex">
            {pontos.map((p, i) => (
              <span
                key={p.rotulo}
                // Com muitos meses, em tela estreita aparece um rótulo sim, outro não.
                className={cn(
                  "min-w-0 flex-1 text-center text-[11px] text-muted-foreground sm:truncate",
                  pontos.length > 8 && i % 2 === 1 && "max-sm:invisible"
                )}
              >
                {pontos.length > 8 ? (
                  <>
                    <span className="sm:hidden">{p.rotulo.split("/")[0]}</span>
                    <span className="max-sm:hidden">{p.rotulo}</span>
                  </>
                ) : (
                  p.rotulo
                )}
              </span>
            ))}
          </div>
        </div>
      </div>
      {(temParcial || nota) && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {[temParcial ? "O mês em andamento aparece mais claro." : "", nota ?? ""].filter(Boolean).join(" ")}
        </p>
      )}
      <TabelaAlternativa cabecalho={cabecalhoTabela} linhas={pontos.map((p) => p.tabela)} />
    </div>
  );
}

/** Barras horizontais ordenadas, com o valor na ponta. Uma cor só: a ordem já mostra quem é maior. */
export function BarrasHorizontais({
  itens,
  cabecalhoTabela,
}: {
  itens: { nome: string; valor: number; texto: string; extra?: string }[];
  cabecalhoTabela: string[];
}) {
  const maximo = Math.max(...itens.map((i) => i.valor), 1);
  return (
    <div>
      <div className="flex flex-col gap-2.5">
        {itens.map((i) => (
          <div key={i.nome} className="grid grid-cols-[minmax(0,8rem)_1fr] items-center gap-3 text-sm" title={i.extra}>
            <span className="truncate text-muted-foreground">{i.nome}</span>
            <span className="flex items-center gap-2">
              <span
                className="h-3 rounded-r-[4px]"
                style={{ width: `${Math.max((i.valor / maximo) * 100, 2)}%`, maxWidth: "calc(100% - 4.5rem)", background: COR_ROXO }}
              />
              <span className="whitespace-nowrap text-xs font-semibold tabular-nums">{i.texto}</span>
            </span>
          </div>
        ))}
      </div>
      <TabelaAlternativa cabecalho={cabecalhoTabela} linhas={itens.map((i) => [i.nome, i.texto, i.extra ?? ""])} />
    </div>
  );
}
