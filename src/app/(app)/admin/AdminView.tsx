"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { MessageCircle, Search, Snowflake, Sun } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { normalizarBusca } from "@/components/shared/Combobox";
import { cn } from "@/lib/utils";
import { alterarStatusPetshop } from "./actions";

export type ContaAdmin = {
  id: string;
  nome: string;
  slug: string | null;
  telefone: string | null;
  status: "ativo" | "congelado";
  congeladoEm: string | null;
  criadoEm: string;
  whatsappConectado: boolean;
  donoNome: string;
  donoEmail: string;
  usuarios: number;
  ultimoAcesso: string | null;
  clientes: number;
  agendamentos30d: number;
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
  const [alvo, setAlvo] = useState<ContaAdmin | null>(null);
  const [isPending, startTransition] = useTransition();

  const termo = normalizarBusca(busca);
  const filtradas = termo
    ? contas.filter((c) => normalizarBusca(`${c.nome} ${c.donoNome} ${c.donoEmail}`).includes(termo))
    : contas;

  const semana = DateTime.now().minus({ days: 7 });
  const novas = contas.filter((c) => DateTime.fromISO(c.criadoEm) >= semana).length;
  const congeladas = contas.filter((c) => c.status === "congelado").length;

  function confirmar() {
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Admin" description="Contas de petshop usando o BubblePet." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Resumo rotulo="Contas" valor={contas.length} />
        <Resumo rotulo="Ativas" valor={contas.length - congeladas} destaque="text-primary" />
        <Resumo rotulo="Congeladas" valor={congeladas} destaque={congeladas ? "text-sky-700" : undefined} />
        <Resumo rotulo="Novas (7 dias)" valor={novas} />
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar petshop, dono ou e-mail..."
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-[12px] border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Petshop</TableHead>
              <TableHead>Dono</TableHead>
              <TableHead className="hidden md:table-cell">Uso</TableHead>
              <TableHead className="hidden lg:table-cell">Último acesso</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  Nenhuma conta encontrada.
                </TableCell>
              </TableRow>
            )}
            {filtradas.map((c) => (
              <TableRow key={c.id} className={cn(c.status === "congelado" && "bg-sky-50/50")}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="flex items-center gap-1.5 font-medium">
                      {c.nome}
                      {c.whatsappConectado && (
                        <MessageCircle size={13} className="text-success" aria-label="WhatsApp conectado" />
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      desde {DateTime.fromISO(c.criadoEm).setLocale("pt-BR").toFormat("dd/LL/yyyy")}
                      {c.slug ? ` · /agendar/${c.slug}` : ""}
                    </span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span>{c.donoNome}</span>
                    <span className="text-xs text-muted-foreground">{c.donoEmail}</span>
                  </div>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {c.clientes} cliente{c.clientes === 1 ? "" : "s"}
                  <span className="block text-xs text-muted-foreground">
                    {c.agendamentos30d} agendamento{c.agendamentos30d === 1 ? "" : "s"} em 30 dias
                  </span>
                </TableCell>
                <TableCell className="hidden text-sm lg:table-cell">{relativo(c.ultimoAcesso)}</TableCell>
                <TableCell>
                  {c.status === "ativo" ? (
                    <Badge variant="secondary" className="bg-primary/10 text-primary">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary" className="bg-sky-100 text-sky-700">
                      Congelado
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
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
        onConfirm={confirmar}
        pending={isPending}
      />
    </div>
  );
}
