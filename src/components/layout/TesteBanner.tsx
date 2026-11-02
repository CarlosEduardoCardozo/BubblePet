import Link from "next/link";
import { Clock, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { diasTexto, TESTE_DIAS, type SituacaoConta } from "@/lib/teste";

/** Faixa no topo do painel enquanto a conta está em teste grátis (ou na tolerância). */
export function TesteBanner({ situacao }: { situacao: SituacaoConta }) {
  if (situacao.tipo !== "teste" && situacao.tipo !== "tolerancia") return null;
  const tolerancia = situacao.tipo === "tolerancia";
  const ultimoDia = situacao.tipo === "teste" && situacao.diasRestantes <= 1;

  return (
    <div
      role="status"
      className={cn(
        "relative z-40 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm text-white",
        tolerancia ? "bg-gradient-to-r from-[#b45309] to-[#dc2626]" : ultimoDia ? "bg-gradient-to-r from-[#6d28d9] to-[#db2777]" : "bg-brand"
      )}
    >
      <span className="flex min-w-0 items-center gap-2 text-center">
        {tolerancia ? <Clock size={16} className="shrink-0" /> : <Sparkles size={16} className="shrink-0" />}
        {tolerancia ? (
          <span>
            <strong className="font-extrabold">Seu teste grátis acabou.</strong> Assine em até{" "}
            <strong className="font-extrabold">{diasTexto(situacao.diasRestantes)}</strong> para não perder o acesso à sua agenda.
          </span>
        ) : (
          <span>
            <strong className="font-extrabold">
              {ultimoDia ? "Último dia de teste grátis" : `${TESTE_DIAS} dias grátis`}
            </strong>
            {" · "}
            {ultimoDia ? "Sua agenda organizada: assine hoje e continue de onde parou." : "Sua agenda organizada. Não espere essa chance passar."}
          </span>
        )}
      </span>

      {situacao.tipo === "teste" && (
        <span className="hidden items-center gap-1 sm:flex" aria-label={`Dia ${situacao.diaDoTeste} de ${TESTE_DIAS}`}>
          {Array.from({ length: TESTE_DIAS }, (_, i) => (
            <span key={i} className={cn("h-1.5 w-5 rounded-full", i < situacao.diaDoTeste ? "bg-white" : "bg-white/30")} />
          ))}
          <span className="ml-1.5 text-xs font-semibold text-white/90">
            {situacao.diasRestantes === 1 ? "falta 1 dia" : `faltam ${situacao.diasRestantes} dias`}
          </span>
        </span>
      )}

      <Link
        href="/assinar"
        className="rounded-full bg-white px-4 py-1.5 text-xs font-extrabold text-[#4c1d95] shadow-sm transition-transform hover:scale-[1.03]"
      >
        Assinar agora
      </Link>
    </div>
  );
}
