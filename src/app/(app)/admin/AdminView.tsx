"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { LogIn, MessageCircle, Search, Snowflake, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { normalizarBusca } from "@/components/shared/Combobox";
import { cn } from "@/lib/utils";
import { alterarStatusPetshop, entrarComo } from "./actions";

export type SituacaoUso = "usando" | "pouco" | "parado" | "nunca";

export type UsuarioAdmin = {
  id: string;
  nome: string;
  email: string;
  dono: boolean;
  ativo: boolean;
  ultimoUso: string | null;
  admin: boolean;
};

export type ContaAdmin = {
  id: string;
  nome: string;
  slug: string | null;
  status: "ativo" | "congelado";
  criadoEm: string;
  whatsappConectado: boolean;
  usuarios: UsuarioAdmin[];
  ultimoUso: string | null;
  situacao: SituacaoUso;
  clientes: number;
  agendamentos30d: number;
  agendamentosCriados7d: number;
  mensagens30d: number;
  ultimoSuporte: string | null;
};

const SITUACAO: Record<SituacaoUso, { label: string; classe: string; dica: string }> = {
  usando: { label: "Usando", classe: "bg-success/10 text-success", dica: "Entrou nos últimos 3 dias ou marcou atendimento na semana" },
  pouco: { label: "Pouco uso", classe: "bg-warning/15 text-warning-foreground", dica: "Última vez entre 4 e 14 dias atrás" },
  parado: { label: "Parado", classe: "bg-destructive/10 text-destructive", dica: "Mais de 14 dias sem usar" },
  nunca: { label: "Nunca usou", classe: "bg-muted text-muted-foreground", dica: "Criou a conta e não voltou" },
};

function relativo(iso: string | null): string {
  if (!iso) return "nunca";
  return DateTime.fromISO(iso).setLocale("pt-BR").toRelative() ?? "—";
}

function Resumo({ rotulo, valor, destaque }: { rotulo: string; valor: number; destaque?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[12px] border border-border bg-white px-4 py-3">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <span className={cn("text-2xl font-semibold", destaque)}>{valor}</span>
    </div>
  );
}

export function AdminView({ contas }: { contas: ContaAdmin[] }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<SituacaoUso | "todas">("todas");
  const [alvo, setAlvo] = useState<ContaAdmin | null>(null);
  const [entrando, setEntrando] = useState<{ usuario: UsuarioAdmin; conta: ContaAdmin } | null>(null);
  const [isPending, startTransition] = useTransition();

  const termo = normalizarBusca(busca);
  const filtradas = contas.filter(
    (c) =>
      (filtro === "todas" || c.situacao === filtro) &&
      (!termo ||
        normalizarBusca(`${c.nome} ${c.usuarios.map((u) => `${u.nome} ${u.email}`).join(" ")}`).includes(termo))
  );

  const porSituacao = (s: SituacaoUso) => contas.filter((c) => c.situacao === s && c.status === "ativo").length;
  const congeladas = contas.filter((c) => c.status === "congelado").length;

  function confirmarStatus() {
    if (!alvo) return;
    const conta = alvo;
    const novo = conta.status === "ativo" ? "congelado" : "ativo";
    startTransition(async () => {
      const r = await alterarStatusPetshop(conta.id, novo);
      if ("error" in r) {
        toast.error(r.error);
      } else {
        toast.success(novo === "congelado" ? `${conta.nome} congelado.` : `${conta.nome} reativado.`);
        setAlvo(null);
      }
    });
  }

  function confirmarEntrar() {
    if (!entrando) return;
    const { usuario } = entrando;
    startTransition(async () => {
      // Sucesso redireciona pro painel do usuário; só volta aqui se der erro.
      const r = await entrarComo(usuario.id);
      if (r && "error" in r) toast.error(r.error);
      setEntrando(null);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Admin" description="Quem está usando o BubblePet e como." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Resumo rotulo="Contas" valor={contas.length} />
        <Resumo rotulo="Usando" valor={porSituacao("usando")} destaque="text-success" />
        <Resumo rotulo="Pouco uso" valor={porSituacao("pouco")} destaque="text-warning-foreground" />
        <Resumo rotulo="Parado / nunca usou" valor={porSituacao("parado") + porSituacao("nunca")} destaque="text-destructive" />
        <Resumo rotulo="Congeladas" valor={congeladas} destaque={congeladas ? "text-sky-700" : undefined} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar petshop, usuário ou e-mail..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {(["todas", "usando", "pouco", "parado", "nunca"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setFiltro(s)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                filtro === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white hover:border-primary"
              )}
            >
              {s === "todas" ? "Todas" : SITUACAO[s].label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {filtradas.length === 0 && (
          <p className="rounded-[12px] border border-border bg-white py-8 text-center text-sm text-muted-foreground">
            Nenhuma conta encontrada.
          </p>
        )}
        {filtradas.map((c) => (
          <div
            key={c.id}
            className={cn(
              "flex flex-col gap-3 rounded-[12px] border border-border bg-white p-4",
              c.status === "congelado" && "bg-sky-50/60"
            )}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col">
                <span className="flex items-center gap-2 font-semibold">
                  {c.nome}
                  {c.whatsappConectado && <MessageCircle size={14} className="text-success" aria-label="WhatsApp conectado" />}
                </span>
                <span className="text-xs text-muted-foreground">
                  desde {DateTime.fromISO(c.criadoEm).setLocale("pt-BR").toFormat("dd/LL/yyyy")}
                  {c.slug ? ` · /agendar/${c.slug}` : ""}
                  {c.ultimoSuporte ? ` · seu último suporte ${relativo(c.ultimoSuporte)}` : ""}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {c.status === "congelado" ? (
                  <Badge variant="secondary" className="bg-sky-100 text-sky-700">Congelado</Badge>
                ) : (
                  <Badge variant="secondary" className={SITUACAO[c.situacao].classe} title={SITUACAO[c.situacao].dica}>
                    {SITUACAO[c.situacao].label}
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAlvo(c)}
                  className={cn(c.status === "ativo" ? "text-sky-700" : "text-primary")}
                >
                  {c.status === "ativo" ? (
                    <>
                      <Snowflake size={14} /> Congelar
                    </>
                  ) : (
                    <>
                      <Sun size={14} /> Reativar
                    </>
                  )}
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              <div><div className="text-xs text-muted-foreground">Último uso</div>{relativo(c.ultimoUso)}</div>
              <div><div className="text-xs text-muted-foreground">Clientes</div>{c.clientes}</div>
              <div><div className="text-xs text-muted-foreground">Marcados na semana</div>{c.agendamentosCriados7d}</div>
              <div><div className="text-xs text-muted-foreground">Atendimentos 30 dias</div>{c.agendamentos30d}</div>
              <div><div className="text-xs text-muted-foreground">WhatsApp 30 dias</div>{c.mensagens30d} msgs</div>
            </div>

            <div className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
              {c.usuarios.map((u) => (
                <div key={u.id} className={cn("flex flex-wrap items-center gap-2 px-3 py-2", !u.ativo && "opacity-60")}>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium">
                      {u.nome}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        {u.dono ? "· dono" : "· equipe"}
                        {!u.ativo ? " · desativado" : ""}
                      </span>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {u.email} · usou {relativo(u.ultimoUso)}
                    </span>
                  </div>
                  {!u.admin && u.ativo && c.status === "ativo" && (
                    <Button variant="ghost" size="sm" onClick={() => setEntrando({ usuario: u, conta: c })}>
                      <LogIn size={14} /> Entrar como
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={!!alvo}
        onOpenChange={(o) => !o && setAlvo(null)}
        title={alvo?.status === "ativo" ? `Congelar ${alvo?.nome}?` : `Reativar ${alvo?.nome}?`}
        description={
          alvo?.status === "ativo"
            ? "A equipe perde o acesso ao painel na hora, o link de agendamento sai do ar e as respostas pelo WhatsApp param de mudar a agenda. Nenhum dado é apagado."
            : "O acesso volta na hora, com todos os dados como estavam."
        }
        confirmLabel={alvo?.status === "ativo" ? "Congelar" : "Reativar"}
        pendingLabel="Salvando..."
        confirmVariant={alvo?.status === "ativo" ? "destructive" : "default"}
        onConfirm={confirmarStatus}
        pending={isPending}
      />

      <ConfirmDialog
        open={!!entrando}
        onOpenChange={(o) => !o && setEntrando(null)}
        title={`Entrar como ${entrando?.usuario.nome}?`}
        description={`Você vai ver o painel de ${entrando?.conta.nome} exatamente como ${entrando?.usuario.nome} vê. Tudo que você alterar fica como se fosse essa pessoa. Uma faixa amarela no topo mostra o modo suporte e o botão pra voltar pro admin. O acesso fica registrado.`}
        confirmLabel="Entrar"
        pendingLabel="Entrando..."
        confirmVariant="default"
        onConfirm={confirmarEntrar}
        pending={isPending}
      />
    </div>
  );
}
