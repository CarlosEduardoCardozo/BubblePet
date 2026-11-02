"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alternar } from "@/components/shared/Alternar";
import { FormSelect } from "@/components/shared/FormSelect";
import {
  renderizarModelo,
  validarModelo,
  valoresDeExemplo,
  type DefinicaoModelo,
  type TipoModelo,
} from "@/lib/mensagens/modelos";
import {
  LIMITE_BOTAO,
  MAX_HORAS_ANTES,
  MAX_LEMBRETES,
  RODAPE_PADRAO,
  rotuloHoras,
  type AvisosConfig,
  type LembreteConfig,
} from "@/lib/avisos";
import { salvarAvisosConfig, salvarModelo } from "./actions";

/** *negrito* do WhatsApp na pré-visualização. */
export function ComNegrito({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*)/g);
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  );
}

const SUGESTOES_HORAS = [24, 4, 2, 48, 12, 1];

function Secao({ titulo, descricao, children }: { titulo: string; descricao?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border bg-white/50 p-4">
      <div>
        <h3 className="text-sm font-bold">{titulo}</h3>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </section>
  );
}

/** Edição de uma mensagem: texto, e (confirmação e lembrete) o envio, os botões e os horários. */
export function ModeloPainel({
  tipo,
  definicao,
  textoSalvo,
  avisos,
  onSalvo,
}: {
  tipo: TipoModelo;
  definicao: DefinicaoModelo;
  textoSalvo: string | null;
  avisos: AvisosConfig;
  onSalvo: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState(textoSalvo ?? definicao.padrao);
  const [config, setConfig] = useState<AvisosConfig>(avisos);
  const [isPending, startTransition] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);

  const comAjustes = tipo === "confirmacao" || tipo === "lembrete";
  const textoMudou = texto !== (textoSalvo ?? definicao.padrao);
  const configMudou = comAjustes && JSON.stringify(config) !== JSON.stringify(avisos);
  const personalizado = (textoSalvo ?? definicao.padrao) !== definicao.padrao;
  const erroTexto = validarModelo(tipo, texto);
  const previa = renderizarModelo(texto, valoresDeExemplo(tipo));

  const horasRepetidas = new Set(config.lembretes.map((l) => l.horas)).size !== config.lembretes.length;
  const erroConfig = !comAjustes
    ? null
    : horasRepetidas
      ? "Tem dois lembretes no mesmo horário."
      : config.lembretes.some((l) => !Number.isInteger(l.horas) || l.horas < 1 || l.horas > MAX_HORAS_ANTES)
        ? `Cada lembrete é de 1 a ${MAX_HORAS_ANTES} horas antes.`
        : config.janela_fim <= config.janela_inicio
          ? "A janela de envio precisa terminar depois de começar."
          : !config.botao_confirmar.trim() || !config.botao_cancelar.trim()
            ? "Os botões precisam ter texto."
            : null;

  function inserir(chave: string) {
    const el = campo.current;
    const token = `{${chave}}`;
    if (!el) {
      setTexto((t) => t + token);
      return;
    }
    const inicio = el.selectionStart ?? texto.length;
    const fim = el.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, inicio) + token + texto.slice(fim));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(inicio + token.length, inicio + token.length);
    });
  }

  function mudarLembrete(i: number, parte: Partial<LembreteConfig>) {
    setConfig((c) => ({ ...c, lembretes: c.lembretes.map((l, k) => (k === i ? { ...l, ...parte } : l)) }));
  }

  function adicionarLembrete() {
    setConfig((c) => {
      const usadas = new Set(c.lembretes.map((l) => l.horas));
      const horas = SUGESTOES_HORAS.find((h) => !usadas.has(h)) ?? 3;
      return { ...c, lembretes: [...c.lembretes, { horas, ativo: true }].sort((a, b) => b.horas - a.horas) };
    });
  }

  function salvar(voltarAoPadrao = false) {
    startTransition(async () => {
      if (textoMudou || voltarAoPadrao) {
        const r = await salvarModelo(tipo, voltarAoPadrao ? null : texto);
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
      }
      if (configMudou) {
        const r = await salvarAvisosConfig({
          ...config,
          botao_confirmar: config.botao_confirmar.trim(),
          botao_cancelar: config.botao_cancelar.trim(),
          rodape: config.rodape?.trim() ? config.rodape.trim() : null,
          lembretes: [...config.lembretes].sort((a, b) => b.horas - a.horas),
        });
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
      }
      toast.success(voltarAoPadrao ? "Mensagem voltou pro texto padrão." : "Salvo.");
      router.refresh();
      onSalvo();
    });
  }

  const botaoConfirmar = config.botao_confirmar.trim() || "Confirmar";
  const botaoCancelar = config.botao_cancelar.trim() || "Cancelar";
  const mostrarBotoes = comAjustes;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        <Secao titulo="Texto da mensagem" descricao="Toque numa palavra entre chaves para colocá-la no texto.">
          <Textarea
            ref={campo}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={9}
            className="font-mono text-xs leading-relaxed"
            aria-label={`Texto da mensagem: ${definicao.titulo}`}
          />
          <div className="flex flex-wrap gap-1.5">
            {definicao.variaveis.map((v) => (
              <button
                key={v.chave}
                type="button"
                onClick={() => inserir(v.chave)}
                title={v.descricao}
                className="rounded-full border border-border bg-white px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-primary hover:text-primary"
              >
                {`{${v.chave}}`}
              </button>
            ))}
          </div>
          {erroTexto && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {erroTexto}
            </p>
          )}
        </Secao>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Como o cliente vê (exemplo)</span>
          <div className="rounded-xl bg-[#e7f7ec] p-3">
            <div className="max-w-full whitespace-pre-wrap rounded-lg rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm">
              <ComNegrito texto={previa} />
              {mostrarBotoes && <p className="mt-2 text-xs text-muted-foreground">{config.rodape?.trim() || RODAPE_PADRAO}</p>}
            </div>
            {mostrarBotoes && (
              <div className="mt-1.5 grid grid-cols-2 gap-1.5">
                {[botaoConfirmar, botaoCancelar].map((b, i) => (
                  <span key={i} className="truncate rounded-lg bg-white px-3 py-2 text-center text-sm font-medium text-[#1a73e8] shadow-sm">
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {tipo === "confirmacao" && (
          <Secao titulo="Envio" descricao="Ao marcar um horário pela agenda, o aviso já vem ligado. Em cada agendamento você pode desligar.">
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium">Avisar o cliente ao marcar</span>
              <Alternar
                ligado={config.confirmacao_ativa}
                onChange={(v) => setConfig((c) => ({ ...c, confirmacao_ativa: v }))}
                rotulo="Avisar o cliente ao marcar"
              />
            </label>
          </Secao>
        )}

        {comAjustes && (
          <Secao
            titulo="Botões de resposta"
            descricao="Valem para a confirmação e para o lembrete. Escreva do seu jeito, com ou sem emoji."
          >
            <div className="grid grid-cols-2 gap-3">
              {(
                [
                  ["botao_confirmar", "Botão de confirmar"],
                  ["botao_cancelar", "Botão de cancelar"],
                ] as const
              ).map(([campoNome, rotulo]) => (
                <div key={campoNome} className="flex flex-col gap-1">
                  <label htmlFor={campoNome} className="text-xs font-medium text-muted-foreground">
                    {rotulo}
                  </label>
                  <Input
                    id={campoNome}
                    value={config[campoNome]}
                    maxLength={LIMITE_BOTAO}
                    onChange={(e) => setConfig((c) => ({ ...c, [campoNome]: e.target.value }))}
                  />
                  <span className="text-right text-[11px] text-muted-foreground">
                    {config[campoNome].length}/{LIMITE_BOTAO}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="rodape" className="text-xs font-medium text-muted-foreground">
                Linha embaixo dos botões
              </label>
              <Input
                id="rodape"
                value={config.rodape ?? ""}
                maxLength={120}
                placeholder={RODAPE_PADRAO}
                onChange={(e) => setConfig((c) => ({ ...c, rodape: e.target.value }))}
              />
              <span className="text-[11px] text-muted-foreground">
                Ajuda quem não vê os botões a responder digitando 1 ou 2. Deixe em branco para usar a linha padrão.
              </span>
            </div>
          </Secao>
        )}

        {tipo === "lembrete" && (
          <Secao
            titulo="Lembretes automáticos"
            descricao="Cada atendimento marcado recebe estes lembretes sozinho. Em cada agendamento você liga ou desliga os que quiser."
          >
            <div className="flex flex-col gap-2">
              {config.lembretes.map((l, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-2">
                  <Alternar ligado={l.ativo} onChange={(v) => mudarLembrete(i, { ativo: v })} rotulo={`Lembrete ${rotuloHoras(l.horas)}`} />
                  <Input
                    type="number"
                    min={1}
                    max={MAX_HORAS_ANTES}
                    value={Number.isFinite(l.horas) ? l.horas : ""}
                    onChange={(e) => mudarLembrete(i, { horas: Number(e.target.value) })}
                    className="h-9 w-20"
                    aria-label="Horas antes do atendimento"
                  />
                  <span className="flex-1 text-sm text-muted-foreground">horas antes</span>
                  <button
                    type="button"
                    onClick={() => setConfig((c) => ({ ...c, lembretes: c.lembretes.filter((_, k) => k !== i) }))}
                    aria-label="Remover lembrete"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {config.lembretes.length === 0 && <p className="text-xs text-muted-foreground">Nenhum lembrete automático.</p>}
              {config.lembretes.length < MAX_LEMBRETES && (
                <Button type="button" variant="outline" size="sm" className="self-start" onClick={adicionarLembrete}>
                  <Plus size={14} /> Adicionar lembrete
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Enviar a partir das</span>
                <FormSelect
                  value={String(config.janela_inicio)}
                  onValueChange={(v) => setConfig((c) => ({ ...c, janela_inicio: Number(v) }))}
                  options={Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, "0")}:00` }))}
                />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground">Enviar até as</span>
                <FormSelect
                  value={String(config.janela_fim)}
                  onValueChange={(v) => setConfig((c) => ({ ...c, janela_fim: Number(v) }))}
                  options={Array.from({ length: 24 }, (_, h) => ({ value: String(h + 1), label: `${String(h + 1).padStart(2, "0")}:00` }))}
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Nada sai de madrugada: o lembrete que cair fora desse horário espera a janela abrir. Quem marcar depois da hora do
              lembrete não recebe o mesmo aviso de novo.
            </p>
          </Secao>
        )}

        {erroConfig && (
          <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {erroConfig}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-3">
        {personalizado && (
          <Button variant="ghost" size="sm" onClick={() => salvar(true)} disabled={isPending}>
            <RotateCcw size={14} /> Voltar o texto ao padrão
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => salvar()}
          disabled={isPending || (!textoMudou && !configMudou) || !!erroTexto || !!erroConfig}
        >
          {isPending ? "Salvando..." : "Salvar"}
        </Button>
      </div>
    </div>
  );
}
