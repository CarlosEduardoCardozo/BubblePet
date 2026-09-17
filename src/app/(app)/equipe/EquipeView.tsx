"use client";

import { useState, useTransition } from "react";
import { DateTime } from "luxon";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Pencil, Plus, UserCog, UserX, UserCheck } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { MODULOS, PERFIS_PRONTOS, type Modulo } from "@/lib/permissoes";
import { cn } from "@/lib/utils";
import { alterarAtivoUsuario, atualizarUsuario, criarUsuario, redefinirSenhaUsuario } from "./actions";

export type Membro = {
  id: string;
  nome: string;
  email: string;
  dono: boolean;
  modulos: Modulo[];
  ativo: boolean;
  ultimoUso: string | null;
  voce: boolean;
};

function CampoSenha({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const [ver, setVer] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={ver ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="new-password"
        minLength={8}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVer((v) => !v)}
        aria-label={ver ? "Ocultar senha" : "Mostrar senha"}
        className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {ver ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function SeletorAreas({ valor, onChange }: { valor: Modulo[]; onChange: (m: Modulo[]) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {PERFIS_PRONTOS.map((p) => {
          const ativo = p.modulos.length === valor.length && p.modulos.every((m) => valor.includes(m));
          return (
            <button
              key={p.nome}
              type="button"
              onClick={() => onChange(p.modulos)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium",
                ativo ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary"
              )}
            >
              {p.nome}
            </button>
          );
        })}
      </div>
      <div className="flex flex-col divide-y divide-border rounded-[12px] border border-border">
        {MODULOS.map((m) => {
          const marcado = valor.includes(m.valor);
          return (
            <label key={m.valor} className="flex cursor-pointer items-start gap-3 px-3 py-2.5">
              <input
                type="checkbox"
                checked={marcado}
                onChange={() =>
                  onChange(marcado ? valor.filter((v) => v !== m.valor) : [...valor, m.valor])
                }
                className="mt-0.5 size-4 accent-primary"
              />
              <span className="flex flex-col">
                <span className="text-sm font-medium">{m.label}</span>
                <span className="text-xs text-muted-foreground">{m.descricao}</span>
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function ultimoUsoLabel(iso: string | null): string {
  if (!iso) return "ainda não entrou";
  return DateTime.fromISO(iso).setLocale("pt-BR").toRelative() ?? "—";
}

export function EquipeView({ membros }: { membros: Membro[] }) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<{ membro: Membro | null } | null>(null);
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [modulos, setModulos] = useState<Modulo[]>(PERFIS_PRONTOS[0].modulos);
  const [erro, setErro] = useState<string | null>(null);
  const [ativando, setAtivando] = useState<Membro | null>(null);
  const [senhaDe, setSenhaDe] = useState<Membro | null>(null);
  const [novaSenha, setNovaSenha] = useState("");

  function abrirNovo() {
    setNome("");
    setEmail("");
    setSenha("");
    setModulos(PERFIS_PRONTOS[0].modulos);
    setErro(null);
    setForm({ membro: null });
  }

  function abrirEdicao(m: Membro) {
    setNome(m.nome);
    setModulos(m.modulos);
    setErro(null);
    setForm({ membro: m });
  }

  function salvar(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setErro(null);
    startTransition(async () => {
      const r = form.membro
        ? await atualizarUsuario(form.membro.id, { nome, modulos })
        : await criarUsuario({ nome, email, senha, modulos });
      if ("error" in r) {
        setErro(r.error);
        return;
      }
      toast.success(form.membro ? "Usuário atualizado." : `Usuário criado. Passe o e-mail e a senha pra ${nome.split(" ")[0]}.`);
      setForm(null);
    });
  }

  function alternarAtivo() {
    if (!ativando) return;
    const m = ativando;
    startTransition(async () => {
      const r = await alterarAtivoUsuario(m.id, !m.ativo);
      setAtivando(null);
      if ("error" in r) toast.error(r.error);
      else toast.success(m.ativo ? `${m.nome} desativado.` : `${m.nome} reativado.`);
    });
  }

  function trocarSenha(event: React.FormEvent) {
    event.preventDefault();
    if (!senhaDe) return;
    const m = senhaDe;
    startTransition(async () => {
      const r = await redefinirSenhaUsuario(m.id, novaSenha);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(`Senha de ${m.nome} trocada.`);
      setSenhaDe(null);
      setNovaSenha("");
    });
  }

  const equipe = membros.filter((m) => !m.dono);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Equipe"
        description="Cada pessoa entra com o próprio e-mail e só vê as áreas que você liberar."
        action={
          <Button onClick={abrirNovo}>
            <Plus size={16} /> Novo usuário
          </Button>
        }
      />

      <div className="overflow-x-auto rounded-[12px] border border-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Usuário</TableHead>
              <TableHead>Acesso</TableHead>
              <TableHead className="hidden md:table-cell">Último uso</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {membros.map((m) => (
              <TableRow key={m.id} className={cn(!m.ativo && "opacity-60")}>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {m.nome} {m.voce && <span className="text-xs font-normal text-muted-foreground">(você)</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.email}</span>
                  </div>
                </TableCell>
                <TableCell>
                  {m.dono ? (
                    <Badge className="bg-primary/10 text-primary" variant="secondary">
                      Dono · tudo
                    </Badge>
                  ) : !m.ativo ? (
                    <Badge variant="secondary">Desativado</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {MODULOS.filter((x) => m.modulos.includes(x.valor)).map((x) => (
                        <Badge key={x.valor} variant="outline" className="font-normal">
                          {x.label}
                        </Badge>
                      ))}
                    </div>
                  )}
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                  {ultimoUsoLabel(m.ultimoUso)}
                </TableCell>
                <TableCell>
                  {!m.dono && (
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" title="Editar acesso" aria-label={`Editar ${m.nome}`} onClick={() => abrirEdicao(m)}>
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Trocar senha"
                        aria-label={`Trocar senha de ${m.nome}`}
                        onClick={() => {
                          setNovaSenha("");
                          setSenhaDe(m);
                        }}
                      >
                        <KeyRound size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={m.ativo ? "Desativar" : "Reativar"}
                        aria-label={`${m.ativo ? "Desativar" : "Reativar"} ${m.nome}`}
                        onClick={() => setAtivando(m)}
                      >
                        {m.ativo ? <UserX size={16} /> : <UserCheck size={16} />}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {equipe.length === 0 && (
        <EmptyState
          icon={UserCog}
          title="Só você por enquanto"
          description="Crie um usuário pra recepção: ela vê a agenda e os clientes, sem acesso ao financeiro, planos e serviços."
          action={
            <Button onClick={abrirNovo}>
              <Plus size={16} /> Criar usuário da recepção
            </Button>
          }
        />
      )}

      <Sheet open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{form?.membro ? `Editar ${form.membro.nome}` : "Novo usuário"}</SheetTitle>
            <SheetDescription>
              {form?.membro
                ? "Mudanças no acesso valem na próxima página que a pessoa abrir."
                : "A pessoa entra em bubblepets.vercel.app com esse e-mail e senha."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={salvar} className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-nome">Nome</Label>
              <Input id="eq-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ana (recepção)" required />
            </div>
            {!form?.membro && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="eq-email">E-mail</Label>
                  <Input
                    id="eq-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="off"
                    placeholder="recepcao@petshop.com"
                    required
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="eq-senha">Senha inicial</Label>
                  <CampoSenha id="eq-senha" value={senha} onChange={setSenha} />
                  <span className="text-xs text-muted-foreground">Pelo menos 8 caracteres. Você pode trocar depois.</span>
                </div>
              </>
            )}
            <div className="flex flex-col gap-1.5">
              <Label>O que essa pessoa pode acessar</Label>
              <SeletorAreas valor={modulos} onChange={setModulos} />
              <span className="text-xs text-muted-foreground">Equipe (esta tela) é sempre só sua.</span>
            </div>
            {erro && (
              <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {erro}
              </p>
            )}
            <SheetFooter className="flex-row justify-end px-0">
              <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || modulos.length === 0}>
                {isPending ? "Salvando..." : form?.membro ? "Salvar" : "Criar usuário"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={!!senhaDe} onOpenChange={(o) => !o && setSenhaDe(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Trocar senha de {senhaDe?.nome}</SheetTitle>
            <SheetDescription>Passe a senha nova pra pessoa. A antiga para de funcionar.</SheetDescription>
          </SheetHeader>
          <form onSubmit={trocarSenha} className="flex flex-col gap-4 px-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="eq-nova-senha">Nova senha</Label>
              <CampoSenha id="eq-nova-senha" value={novaSenha} onChange={setNovaSenha} />
            </div>
            <SheetFooter className="flex-row justify-end px-0">
              <Button type="button" variant="outline" onClick={() => setSenhaDe(null)} disabled={isPending}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending || novaSenha.length < 8}>
                {isPending ? "Salvando..." : "Trocar senha"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!ativando}
        onOpenChange={(o) => !o && setAtivando(null)}
        title={ativando?.ativo ? `Desativar ${ativando?.nome}?` : `Reativar ${ativando?.nome}?`}
        description={
          ativando?.ativo
            ? "A pessoa perde o acesso na hora. Nada do que ela cadastrou é apagado, e dá pra reativar depois."
            : "A pessoa volta a entrar com o mesmo e-mail e senha."
        }
        confirmLabel={ativando?.ativo ? "Desativar" : "Reativar"}
        pendingLabel="Salvando..."
        confirmVariant={ativando?.ativo ? "destructive" : "default"}
        onConfirm={alternarAtivo}
        pending={isPending}
      />
    </div>
  );
}
