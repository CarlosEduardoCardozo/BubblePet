"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTime } from "luxon";
import { Check, ChevronLeft, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatCentavos } from "@/lib/currency";
import { precoParaPorte } from "@/lib/servico-preco";
import type { DadosAgendamento } from "@/lib/publico/dal";
import {
  confirmarAgendamento,
  confirmarCodigo,
  listarHorarios,
  sairSessao,
  solicitarCodigo,
} from "./actions";

const ZONE = "America/Sao_Paulo";

type Petshop = {
  nome: string;
  telefone: string | null;
  endereco: string | null;
  whatsappConectado: boolean;
};

type Sucesso = {
  petNome: string;
  servicoNome: string;
  inicioISO: string;
  coberto: boolean;
  planoNome: string | null;
  valorCentavos: number;
};

function Cartao({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-[20px] border border-primary/10 bg-white p-5 shadow-[0_8px_30px_-12px_rgba(13,148,136,0.25)]",
        className
      )}
    >
      {children}
    </section>
  );
}

function Titulo({ children, passo }: { children: React.ReactNode; passo?: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      {passo && (
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">{passo}</span>
      )}
      <h2 className="text-lg font-semibold [font-family:var(--font-display)]">{children}</h2>
    </div>
  );
}

function Erro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <p role="alert" className="mt-3 rounded-[12px] bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {mensagem}
    </p>
  );
}

function linkWhatsapp(telefone: string | null, texto: string): string | null {
  if (!telefone) return null;
  return `https://wa.me/${telefone.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

export function AgendarFlow({
  slug,
  petshop,
  dados,
  dias,
}: {
  slug: string;
  petshop: Petshop;
  dados: DadosAgendamento | null;
  dias: string[];
}) {
  if (!petshop.whatsappConectado) {
    const wa = linkWhatsapp(petshop.telefone, `Oi! Quero agendar um banho pelo ${petshop.nome}.`);
    return (
      <Cartao>
        <Titulo>Agendamento online em pausa</Titulo>
        <p className="text-sm text-muted-foreground">
          O {petshop.nome} ainda não ativou o agendamento pelo link. Chame no WhatsApp
          e a equipe marca pra você.
        </p>
        {wa && (
          <Button className="mt-4 w-full" nativeButton={false} render={<a href={wa} />}>
            <MessageCircle size={16} /> Falar com o petshop
          </Button>
        )}
      </Cartao>
    );
  }

  if (dados) {
    return <PassoAgendar slug={slug} petshop={petshop} dados={dados} dias={dias} />;
  }

  return <PassoIdentificacao slug={slug} petshop={petshop} />;
}

function PassoIdentificacao({ slug, petshop }: { slug: string; petshop: Petshop }) {
  const router = useRouter();
  const [telefone, setTelefone] = useState("");
  const [codigo, setCodigo] = useState("");
  const [etapa, setEtapa] = useState<"telefone" | "codigo">("telefone");
  const [erro, setErro] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const wa = linkWhatsapp(petshop.telefone, `Oi! Não consegui agendar pelo link do ${petshop.nome}.`);

  function pedirCodigo(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await solicitarCodigo(slug, telefone);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setEtapa("codigo");
    });
  }

  function confirmar(event: React.FormEvent) {
    event.preventDefault();
    setErro(null);
    startTransition(async () => {
      const r = await confirmarCodigo(slug, telefone, codigo);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.refresh();
    });
  }

  if (etapa === "codigo") {
    return (
      <Cartao>
        <button
          type="button"
          onClick={() => {
            setEtapa("telefone");
            setCodigo("");
            setErro(null);
          }}
          className="mb-3 flex items-center gap-1 text-xs text-muted-foreground"
        >
          <ChevronLeft size={14} /> Trocar número
        </button>
        <Titulo>Digite o código</Titulo>
        <p className="text-sm text-muted-foreground">
          Se <span className="font-medium text-foreground">{telefone}</span> estiver cadastrado no{" "}
          {petshop.nome}, o código de 6 dígitos chega pelo WhatsApp em instantes. Vale por 5 minutos — é só dessa vez: depois este celular fica lembrado.
        </p>
        <form onSubmit={confirmar} className="mt-4 flex flex-col gap-3">
          <Input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            placeholder="••••••"
            aria-label="Código de 6 dígitos"
            className="h-14 text-center text-2xl tracking-[0.5em] [font-family:var(--font-display)]"
          />
          <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isPending || codigo.length !== 6}>
            {isPending ? <Loader2 size={18} className="animate-spin" /> : "Entrar"}
          </Button>
        </form>
        <Erro mensagem={erro} />
        <div className="mt-4 flex flex-col gap-1 text-center text-xs text-muted-foreground">
          <button type="button" className="underline" disabled={isPending} onClick={pedirCodigo}>
            Não recebi — enviar de novo
          </button>
          {wa && (
            <a href={wa} className="underline">
              Não tenho cadastro / preciso de ajuda
            </a>
          )}
        </div>
      </Cartao>
    );
  }

  return (
    <Cartao>
      <Titulo>Agende o banho do seu pet</Titulo>
      <p className="text-sm text-muted-foreground">
        Digite o celular cadastrado no {petshop.nome}. Na primeira vez, você recebe um
        código pelo WhatsApp; depois este celular fica lembrado e é só escolher o horário.
      </p>
      <form onSubmit={pedirCodigo} className="mt-4 flex flex-col gap-3">
        <Input
          value={telefone}
          onChange={(e) => setTelefone(e.target.value)}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          autoFocus
          placeholder="(47) 99999-9999"
          aria-label="Celular com DDD"
          className="h-12 text-lg"
        />
        <Button type="submit" size="lg" className="h-12 w-full text-base" disabled={isPending || telefone.replace(/\D/g, "").length < 10}>
          {isPending ? <Loader2 size={18} className="animate-spin" /> : <><MessageCircle size={18} /> Receber código no WhatsApp</>}
        </Button>
      </form>
      <Erro mensagem={erro} />
      {wa && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Ainda não é cliente?{" "}
          <a href={wa} className="underline">
            Fale com o petshop
          </a>
        </p>
      )}
    </Cartao>
  );
}

function PassoAgendar({
  slug,
  petshop,
  dados,
  dias,
}: {
  slug: string;
  petshop: Petshop;
  dados: DadosAgendamento;
  dias: string[];
}) {
  const router = useRouter();
  const [petId, setPetId] = useState(dados.pets.length === 1 ? dados.pets[0].id : "");
  const [servicoId, setServicoId] = useState("");
  const [dataISO, setDataISO] = useState("");
  const [hora, setHora] = useState("");
  const [horarios, setHorarios] = useState<string[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<Sucesso | null>(null);
  const [isPending, startTransition] = useTransition();
  const [carregandoHorarios, startHorarios] = useTransition();

  const servico = dados.servicos.find((s) => s.id === servicoId) ?? null;
  const cobertura = petId && servicoId ? dados.coberturas[petId]?.[servicoId] : undefined;
  const porteDoPet = dados.pets.find((p) => p.id === petId)?.porte ?? null;
  const precoDe = (s: DadosAgendamento["servicos"][number]) => precoParaPorte(s.precos, porteDoPet);
  const coberto = !!cobertura && cobertura.saldo > 0;
  const primeiroNome = dados.tutorNome.split(" ")[0];

  function escolherDia(dia: string) {
    setDataISO(dia);
    setHora("");
    setHorarios(null);
    if (!servico) return;
    startHorarios(async () => {
      setHorarios(await listarHorarios(slug, servico.id, dia, servico.duracaoMin));
    });
  }

  function escolherServico(id: string) {
    setServicoId(id);
    setHora("");
    setHorarios(null);
    const s = dados.servicos.find((x) => x.id === id);
    if (dataISO && s) {
      startHorarios(async () => {
        setHorarios(await listarHorarios(slug, s.id, dataISO, s.duracaoMin));
      });
    }
  }

  function confirmar() {
    setErro(null);
    startTransition(async () => {
      const r = await confirmarAgendamento(slug, { petId, servicoId, dataISO, hora });
      if (!r.ok) {
        setErro(r.erro);
        if (dataISO && servico) {
          setHorarios(await listarHorarios(slug, servico.id, dataISO, servico.duracaoMin));
          setHora("");
        }
        return;
      }
      setSucesso(r);
    });
  }

  if (sucesso) {
    const dt = DateTime.fromISO(sucesso.inicioISO).setZone(ZONE).setLocale("pt-BR");
    return (
      <Cartao className="text-center">
        <span className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
          <Check size={28} />
        </span>
        <h2 className="text-2xl font-semibold [font-family:var(--font-display)]">Agendado!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {sucesso.petNome} · {sucesso.servicoNome}
        </p>
        <p className="mt-3 text-lg font-medium">
          {(() => {
            const d = dt.toFormat("cccc, dd/LL");
            return d.charAt(0).toUpperCase() + d.slice(1);
          })()}{" "}
          <span className="text-muted-foreground">às</span> {dt.toFormat("HH:mm")}
        </p>
        <div className={cn("mt-4 rounded-[14px] px-4 py-3 text-sm", sucesso.coberto ? "bg-primary/10 text-primary" : "bg-muted")}>
          {sucesso.coberto
            ? `Coberto pelo ${sucesso.planoNome} — sem custo.`
            : `${formatCentavos(sucesso.valorCentavos)} — pagamento no petshop.`}
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          A confirmação chega no seu WhatsApp. Qualquer imprevisto, é só responder por lá.
        </p>
        <Button
          variant="outline"
          className="mt-5 w-full"
          onClick={() => {
            setSucesso(null);
            setServicoId("");
            setDataISO("");
            setHora("");
            setHorarios(null);
            router.refresh();
          }}
        >
          Agendar outro
        </Button>
      </Cartao>
    );
  }

  if (dados.pets.length === 0) {
    const wa = linkWhatsapp(petshop.telefone, `Oi! Sou ${dados.tutorNome} e quero cadastrar meu pet para agendar pelo link.`);
    return (
      <Cartao>
        <Titulo>Oi, {primeiroNome}!</Titulo>
        <p className="text-sm text-muted-foreground">
          Ainda não tem nenhum pet no seu cadastro. Peça pro petshop incluir e volte aqui.
        </p>
        {wa && (
          <Button className="mt-4 w-full" nativeButton={false} render={<a href={wa} />}>
            <MessageCircle size={16} /> Falar com o petshop
          </Button>
        )}
      </Cartao>
    );
  }

  const podeConfirmar = !!petId && !!servicoId && !!dataISO && !!hora && !isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          Oi, <span className="font-medium text-foreground">{primeiroNome}</span> 👋
        </p>
        <button
          type="button"
          className="text-xs text-muted-foreground underline"
          onClick={() =>
            startTransition(async () => {
              await sairSessao(slug);
              router.refresh();
            })
          }
        >
          Não sou eu
        </button>
      </div>

      <Cartao>
        <Titulo passo="1">Quem vai?</Titulo>
        <div className="flex flex-wrap gap-2">
          {dados.pets.map((pet) => {
            const ativo = pet.id === petId;
            return (
              <button
                key={pet.id}
                type="button"
                onClick={() => setPetId(pet.id)}
                aria-pressed={ativo}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors",
                  ativo
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-white hover:border-primary/50"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                    ativo ? "bg-white/20" : "bg-primary/10 text-primary"
                  )}
                >
                  {pet.nome.charAt(0).toUpperCase()}
                </span>
                {pet.nome}
                {pet.planoNome && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      ativo ? "bg-white/20" : "bg-primary/10 text-primary"
                    )}
                  >
                    plano
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </Cartao>

      <Cartao>
        <Titulo passo="2">O que vai fazer?</Titulo>
        <div className="flex flex-col gap-2">
          {dados.servicos.map((s) => {
            const ativo = s.id === servicoId;
            const cob = petId ? dados.coberturas[petId]?.[s.id] : undefined;
            const incluso = !!cob && cob.saldo > 0;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => escolherServico(s.id)}
                aria-pressed={ativo}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors",
                  ativo ? "border-primary bg-primary/5" : "border-border bg-white hover:border-primary/50"
                )}
              >
                <span className="flex flex-col">
                  <span className="font-medium">{s.nome}</span>
                  <span className="text-xs text-muted-foreground">{s.duracaoMin} min</span>
                </span>
                {incluso ? (
                  <span className="flex flex-col items-end">
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
                      incluso no plano
                    </span>
                    <span className="text-xs text-muted-foreground line-through">
                      {formatCentavos(precoDe(s))}
                    </span>
                  </span>
                ) : (
                  <span className="font-medium">{formatCentavos(precoDe(s))}</span>
                )}
              </button>
            );
          })}
        </div>
      </Cartao>

      {servico && petId && (
        <div
          className={cn(
            "relative overflow-hidden rounded-[20px] px-5 py-4 text-primary-foreground",
            coberto ? "bg-primary" : "bg-foreground"
          )}
        >
          <Sparkles size={80} className="pointer-events-none absolute -right-4 -top-4 opacity-10" />
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">
            {coberto ? "Você paga" : "Valor"}
          </p>
          <p className="text-4xl font-semibold leading-tight [font-family:var(--font-display)]">
            {formatCentavos(coberto ? 0 : precoDe(servico))}
          </p>
          <p className="mt-1 text-sm opacity-90">
            {coberto
              ? `Coberto pelo ${cobertura.planoNome} · ${cobertura.saldo} de ${cobertura.creditosMes} banhos restantes este mês`
              : cobertura
                ? `Os ${cobertura.creditosMes} banhos do ${cobertura.planoNome} deste mês já foram usados`
                : "Pagamento direto no petshop"}
          </p>
        </div>
      )}

      <Cartao>
        <Titulo passo="3">Quando?</Titulo>
        {!servico && (
          <p className="mb-3 text-xs text-muted-foreground">Escolha o serviço primeiro — a duração define os horários.</p>
        )}
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {dias.map((dia) => {
            const dt = DateTime.fromISO(dia, { zone: ZONE }).setLocale("pt-BR");
            const ativo = dia === dataISO;
            const hoje = dt.hasSame(DateTime.now().setZone(ZONE), "day");
            return (
              <button
                key={dia}
                type="button"
                disabled={!servico}
                onClick={() => escolherDia(dia)}
                aria-pressed={ativo}
                className={cn(
                  "flex w-14 shrink-0 flex-col items-center rounded-[14px] border py-2 transition-colors disabled:opacity-50",
                  ativo ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white hover:border-primary/50"
                )}
              >
                <span className="text-[10px] font-medium uppercase">{hoje ? "hoje" : dt.toFormat("ccc").replace(".", "")}</span>
                <span className="text-lg font-semibold [font-family:var(--font-display)]">{dt.day}</span>
                <span className="text-[10px] opacity-70">{dt.toFormat("LLL").replace(".", "")}</span>
              </button>
            );
          })}
        </div>

        {dataISO && (
          <div className="mt-4">
            {carregandoHorarios || horarios === null ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 size={14} className="animate-spin" /> Buscando horários livres...
              </p>
            ) : horarios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum horário livre nesse dia. Tente outro.</p>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {horarios.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHora(h)}
                    aria-pressed={h === hora}
                    className={cn(
                      "rounded-[10px] border py-2 text-sm font-medium transition-colors",
                      h === hora ? "border-primary bg-primary text-primary-foreground" : "border-border bg-white hover:border-primary/50"
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </Cartao>

      <Erro mensagem={erro} />

      <Button size="lg" className="h-12 w-full text-base" disabled={!podeConfirmar} onClick={confirmar}>
        {isPending ? <Loader2 size={18} className="animate-spin" /> : "Confirmar agendamento"}
      </Button>
      {petshop.endereco && (
        <p className="text-center text-xs text-muted-foreground">{petshop.endereco}</p>
      )}
    </div>
  );
}
