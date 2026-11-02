"use client";

import { useState } from "react";
import { BellRing, Calendar, ChevronRight, Gift, MessageSquareText, PawPrint, Receipt, Repeat, Undo2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { MODELOS, renderizarModelo, valoresDeExemplo, type TipoModelo } from "@/lib/mensagens/modelos";
import { horasAtivas, type AvisosConfig } from "@/lib/avisos";
import { cn } from "@/lib/utils";
import { ModeloPainel } from "./ModeloEditor";

type Grupo = { titulo: string; descricao: string; tipos: TipoModelo[] };

const GRUPOS: Grupo[] = [
  {
    titulo: "Agendamento",
    descricao: "O que o cliente recebe ao marcar, perto do horário e quando ele responde.",
    tipos: ["confirmacao", "lembrete", "resposta_confirmado", "resposta_cancelado", "dia_cancelado"],
  },
  {
    titulo: "No dia do atendimento",
    descricao: "Quando o pet fica pronto e o cartão fidelidade.",
    tipos: ["pet_pronto", "fidelidade"],
  },
  {
    titulo: "Financeiro e retorno",
    descricao: "Fechamento do mês e mensagens para trazer o cliente de volta.",
    tipos: ["fechamento", "retorno", "plano_sobrando"],
  },
];

const ICONES: Record<TipoModelo, React.ElementType> = {
  confirmacao: Calendar,
  lembrete: BellRing,
  dia_cancelado: Undo2,
  resposta_confirmado: MessageSquareText,
  resposta_cancelado: MessageSquareText,
  fechamento: Receipt,
  retorno: Repeat,
  plano_sobrando: Repeat,
  pet_pronto: PawPrint,
  fidelidade: Gift,
};

function Selo({ children, tom = "neutro" }: { children: React.ReactNode; tom?: "neutro" | "ativo" | "alerta" }) {
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tom === "ativo" && "bg-primary/10 text-primary",
        tom === "alerta" && "bg-sun/50 text-[#5c3d00]",
        tom === "neutro" && "bg-muted text-muted-foreground"
      )}
    >
      {children}
    </span>
  );
}

/** Uma linha de estado do cartão: o que está ligado, sem abrir a mensagem. */
function selosDoCartao(tipo: TipoModelo, personalizada: boolean, avisos: AvisosConfig) {
  const selos: { texto: string; tom?: "neutro" | "ativo" | "alerta" }[] = [];
  if (tipo === "confirmacao") {
    selos.push(avisos.confirmacao_ativa ? { texto: "Já vem ligada ao marcar", tom: "ativo" } : { texto: "Vem desligada ao marcar", tom: "alerta" });
  }
  if (tipo === "lembrete") {
    const horas = horasAtivas(avisos);
    if (horas.length === 0) selos.push({ texto: "Automático desligado", tom: "alerta" });
    else for (const h of horas) selos.push({ texto: `${h} h antes`, tom: "ativo" });
  }
  if (personalizada) selos.push({ texto: "Personalizada" });
  return selos;
}

export function MensagensView({
  personalizados,
  avisos,
}: {
  personalizados: Record<string, string>;
  avisos: AvisosConfig;
}) {
  const [aberto, setAberto] = useState<TipoModelo | null>(null);

  return (
    <div className="flex flex-col gap-8">
      {GRUPOS.map((grupo) => (
        <section key={grupo.titulo} className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-bold">{grupo.titulo}</h2>
            <p className="text-sm text-muted-foreground">{grupo.descricao}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {grupo.tipos.map((tipo) => {
              const definicao = MODELOS[tipo];
              const Icone = ICONES[tipo];
              const salvo = personalizados[tipo] ?? null;
              const previa = renderizarModelo(salvo ?? definicao.padrao, valoresDeExemplo(tipo));
              return (
                <button
                  key={tipo}
                  type="button"
                  onClick={() => setAberto(tipo)}
                  className="glass group flex flex-col gap-3 rounded-card p-5 text-left transition-shadow hover:shadow-[0_18px_40px_-20px_rgba(76,29,149,0.35)] focus-visible:outline-2 focus-visible:outline-primary"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
                      <Icone size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-[15px] font-bold leading-tight">{definicao.titulo}</h3>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{definicao.quando}</p>
                    </div>
                  </div>
                  <p className="line-clamp-3 whitespace-pre-line rounded-xl bg-[#e7f7ec]/70 px-3 py-2 text-xs text-foreground/80">
                    {previa.replace(/\*/g, "")}
                  </p>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div className="flex flex-wrap gap-1.5">
                      {selosDoCartao(tipo, salvo !== null, avisos).map((s) => (
                        <Selo key={s.texto} tom={s.tom}>
                          {s.texto}
                        </Selo>
                      ))}
                    </div>
                    <span className="flex shrink-0 items-center gap-0.5 text-xs font-semibold text-primary">
                      Editar <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <Sheet open={aberto !== null} onOpenChange={(v) => !v && setAberto(null)}>
        <SheetContent className="gap-0 sm:max-w-xl">
          {aberto && (
            <>
              <SheetHeader>
                <SheetTitle>{MODELOS[aberto].titulo}</SheetTitle>
                <SheetDescription>{MODELOS[aberto].quando}</SheetDescription>
              </SheetHeader>
              <ModeloPainel
                key={aberto + JSON.stringify(avisos) + (personalizados[aberto] ?? "")}
                tipo={aberto}
                definicao={MODELOS[aberto]}
                textoSalvo={personalizados[aberto] ?? null}
                avisos={avisos}
                onSalvo={() => setAberto(null)}
              />
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
