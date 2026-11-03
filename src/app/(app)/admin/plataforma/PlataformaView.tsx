"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, KeyRound, Link2, Loader2, PlugZap, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/shared/PageHeader";
import type { StatusPlataforma } from "@/lib/plataforma";
import { salvarPlataforma, testarPlataforma } from "./actions";

type Inicial = {
  linkAssinatura: string;
  precoReais: string;
  contatoWhatsapp: string;
  disparoUrl: string;
  disparoPorHora: number;
};

function Secao({ titulo, descricao, icon: Icon, children }: { titulo: string; descricao: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <section className="glass flex flex-col gap-4 rounded-card p-5">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-secondary text-primary">
          <Icon size={19} />
        </span>
        <div>
          <h2 className="text-[15px] font-bold">{titulo}</h2>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {rotulo}
      {children}
      {dica && <span className="text-xs font-normal text-muted-foreground">{dica}</span>}
    </label>
  );
}

export function PlataformaView({ inicial, tokenSalvo, statusInicial }: { inicial: Inicial; tokenSalvo: boolean; statusInicial: StatusPlataforma }) {
  const [form, setForm] = useState(inicial);
  const [token, setToken] = useState("");
  const [temToken, setTemToken] = useState(tokenSalvo);
  const [status, setStatus] = useState<StatusPlataforma>(statusInicial);
  const [isPending, startTransition] = useTransition();
  const [testando, startTestar] = useTransition();

  const set = (k: keyof Inicial) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "disparoPorHora" ? Number(e.target.value) : e.target.value }));

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const r = await salvarPlataforma({ ...form, disparoToken: token });
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success("Configurações salvas.");
      if (token) setTemToken(true);
      setToken("");
      const s = await testarPlataforma();
      if (!("error" in s)) setStatus(s);
    });
  }

  function testar() {
    startTestar(async () => {
      const s = await testarPlataforma();
      if ("error" in s) toast.error(s.error);
      else setStatus(s);
    });
  }

  return (
    <form onSubmit={salvar} className="flex max-w-3xl flex-col gap-6">
      <PageHeader title="Plataforma" description="Como o BubblePet cobra e fala com os leads. Valem para todas as contas." />

      <Secao titulo="Assinatura" descricao="O que a pessoa vê quando o teste grátis está acabando." icon={Link2}>
        <Campo rotulo="Link de pagamento" dica="O botão “Assinar agora” leva para este endereço. Sem link, o botão abre o WhatsApp de contato.">
          <Input value={form.linkAssinatura} onChange={set("linkAssinatura")} placeholder="https://..." inputMode="url" />
        </Campo>
        <div className="grid gap-4 sm:grid-cols-2">
          <Campo rotulo="Preço por mês (R$)" dica="Aparece na página de assinatura. Deixe em branco para não mostrar.">
            <Input value={form.precoReais} onChange={set("precoReais")} placeholder="180,00" inputMode="decimal" />
          </Campo>
          <Campo rotulo="WhatsApp de contato" dica="Para tirar dúvidas e assinar, se não houver link.">
            <Input value={form.contatoWhatsapp} onChange={set("contatoWhatsapp")} placeholder="(47) 99999-9999" type="tel" />
          </Campo>
        </div>
      </Secao>

      <Secao titulo="WhatsApp dos disparos" descricao="O número da plataforma, usado nos disparos em massa e nas mensagens aos leads. É uma instância da UazAPI só do BubblePet." icon={KeyRound}>
        <Campo rotulo="Endereço do servidor (server URL)" dica="Ex.: https://seuservidor.uazapi.com">
          <Input value={form.disparoUrl} onChange={set("disparoUrl")} placeholder="https://..." inputMode="url" autoComplete="off" />
        </Campo>
        <Campo rotulo="Token da instância" dica={temToken ? "Já existe um token salvo. Digite outro só se quiser trocar." : "Cole o token da instância. Ele fica guardado no servidor e nunca aparece de novo."}>
          <Input value={token} onChange={(e) => setToken(e.target.value)} type="password" placeholder={temToken ? "•••••••• (salvo)" : "Token"} autoComplete="new-password" />
        </Campo>
        <Campo rotulo="Máximo de mensagens por hora" dica="Segurança contra bloqueio do número. De 1 a 72; o envio acontece aos poucos, das 8h às 20h.">
          <Input value={form.disparoPorHora} onChange={set("disparoPorHora")} type="number" min={1} max={72} className="w-28" />
        </Campo>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-white/60 px-4 py-3">
          {!status.configurado ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <XCircle size={16} /> Ainda não configurado.
            </span>
          ) : status.conectado ? (
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <CheckCircle2 size={16} /> Conectado{status.numero ? ` · ${status.numero}` : ""}
              {status.nome ? ` · ${status.nome}` : ""}
            </span>
          ) : (
            <span className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <XCircle size={16} /> {status.erro ?? "Instância desconectada. Abra o WhatsApp no aparelho e conecte pela UazAPI."}
            </span>
          )}
          <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={testar} disabled={testando}>
            {testando ? <Loader2 size={14} className="animate-spin" /> : <PlugZap size={14} />} Testar conexão
          </Button>
        </div>
      </Secao>

      <div className="flex justify-end">
        <Button type="submit" size="lg" disabled={isPending}>
          {isPending ? "Salvando..." : "Salvar configurações"}
        </Button>
      </div>
    </form>
  );
}
