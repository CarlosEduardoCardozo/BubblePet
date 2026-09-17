"use client";

import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  renderizarModelo,
  validarModelo,
  valoresDeExemplo,
  type DefinicaoModelo,
  type TipoModelo,
} from "@/lib/mensagens/modelos";
import { salvarModelo } from "./actions";

/** *negrito* do WhatsApp na pré-visualização. */
function ComNegrito({ texto }: { texto: string }) {
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

export function ModeloEditor({
  tipo,
  definicao,
  textoSalvo,
}: {
  tipo: TipoModelo;
  definicao: DefinicaoModelo;
  textoSalvo: string | null;
}) {
  const [texto, setTexto] = useState(textoSalvo ?? definicao.padrao);
  const [salvo, setSalvo] = useState(textoSalvo ?? definicao.padrao);
  const [isPending, startTransition] = useTransition();
  const campo = useRef<HTMLTextAreaElement>(null);

  const alterado = texto !== salvo;
  const personalizado = salvo !== definicao.padrao;
  const erro = validarModelo(tipo, texto);
  const previa = renderizarModelo(texto, valoresDeExemplo(tipo));

  function inserir(chave: string) {
    const el = campo.current;
    const token = `{${chave}}`;
    if (!el) {
      setTexto((t) => t + token);
      return;
    }
    const inicio = el.selectionStart ?? texto.length;
    const fim = el.selectionEnd ?? texto.length;
    const novo = texto.slice(0, inicio) + token + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(inicio + token.length, inicio + token.length);
    });
  }

  function salvar(valor: string | null) {
    startTransition(async () => {
      const r = await salvarModelo(tipo, valor);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      const final = valor ?? definicao.padrao;
      setTexto(final);
      setSalvo(final);
      toast.success(valor === null ? "Mensagem voltou pro texto padrão." : "Mensagem salva.");
    });
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <CardTitle>{definicao.titulo}</CardTitle>
          {personalizado && <Badge variant="secondary">Personalizada</Badge>}
        </div>
        <CardDescription>{definicao.quando}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Textarea
          ref={campo}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={8}
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

        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Como o cliente vê (exemplo)</span>
          <div className="rounded-[12px] bg-[#e7f7ec] p-3">
            <div className="max-w-full whitespace-pre-wrap rounded-[10px] rounded-tl-none bg-white px-3 py-2 text-sm shadow-sm">
              <ComNegrito texto={previa} />
            </div>
          </div>
        </div>

        {erro && (
          <p role="alert" className="rounded-[12px] bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {erro}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          {personalizado && (
            <Button variant="ghost" size="sm" onClick={() => salvar(null)} disabled={isPending}>
              <RotateCcw size={14} /> Voltar ao padrão
            </Button>
          )}
          {alterado && (
            <Button variant="outline" size="sm" onClick={() => setTexto(salvo)} disabled={isPending}>
              Descartar
            </Button>
          )}
          <Button size="sm" onClick={() => salvar(texto)} disabled={isPending || !alterado || !!erro}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
