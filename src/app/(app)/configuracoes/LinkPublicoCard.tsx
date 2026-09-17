"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Download, ExternalLink, Link2, MessageCircle, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSlug } from "./actions";

export function LinkPublicoCard({
  slug,
  baseUrl,
  qrDataUrl,
  qrImpressao,
  petshopNome,
  whatsappConectado,
}: {
  slug: string;
  baseUrl: string;
  qrDataUrl: string;
  qrImpressao: string;
  petshopNome: string;
  whatsappConectado: boolean;
}) {
  const [editando, setEditando] = useState(false);
  const [novoSlug, setNovoSlug] = useState(slug);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const url = `${baseUrl}/agendar/${slug}`;
  const host = baseUrl.replace(/^https?:\/\//, "");

  async function copiar() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      // Sem a API de área de transferência (http na rede local, navegador
      // antigo): copia pelo jeito antigo.
      const campo = document.createElement("textarea");
      campo.value = url;
      campo.setAttribute("readonly", "");
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      ok = document.execCommand("copy");
      campo.remove();
    }
    if (ok) {
      setCopiado(true);
      toast.success("Link copiado.");
      setTimeout(() => setCopiado(false), 2000);
    } else {
      toast.error("Não foi possível copiar. Selecione o link e copie manualmente.");
    }
  }

  const textoWhatsapp = encodeURIComponent(
    `Agora dá pra agendar o banho do seu pet na ${petshopNome} pelo celular: ${url}`
  );

  function salvarSlug(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateSlug(novoSlug);
      if ("error" in result) {
        setError(result.error);
      } else {
        toast.success("Endereço do link atualizado.");
        setEditando(false);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 size={18} className="text-primary" />
          Link de agendamento
        </CardTitle>
        <CardDescription>
          Compartilhe com os tutores ou imprima o QR code no balcão. Eles agendam
          sozinhos e, se tiverem plano, o banho aparece sem custo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!whatsappConectado && (
          <p className="flex items-start gap-2 rounded-[12px] border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <span>
              <strong>Link em pausa.</strong> O tutor entra com um código que chega pelo WhatsApp do
              petshop — conecte o WhatsApp acima pra liberar o agendamento online.
            </span>
          </p>
        )}
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no servidor */}
          <img
            src={qrDataUrl}
            alt={`QR code do link ${url}`}
            width={110}
            height={110}
            className="shrink-0 rounded-[8px] border border-border"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {editando ? (
              <form onSubmit={salvarSlug} className="flex flex-col gap-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="truncate">{host}/agendar/</span>
                </div>
                <Input
                  value={novoSlug}
                  onChange={(e) => setNovoSlug(e.target.value.toLowerCase())}
                  autoFocus
                  className="font-mono text-sm"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={isPending}>
                    {isPending ? "Salvando..." : "Salvar"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditando(false);
                      setNovoSlug(slug);
                      setError(null);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </form>
            ) : (
              <>
                <code
                  className="select-all break-all rounded-[8px] bg-muted px-2 py-1.5 font-mono text-xs"
                  title="Clique pra selecionar"
                >
                  {url}
                </code>
                <div className="flex flex-wrap gap-1.5">
                  <Button type="button" size="sm" variant="outline" onClick={copiar}>
                    {copiado ? <Check size={14} /> : <Copy size={14} />}
                    {copiado ? "Copiado" : "Copiar"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
                    <Pencil size={14} />
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    nativeButton={false}
                    render={<a href={url} target="_blank" rel="noreferrer" />}
                  >
                    <ExternalLink size={14} />
                    Abrir
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    nativeButton={false}
                    render={<a href={`https://wa.me/?text=${textoWhatsapp}`} target="_blank" rel="noreferrer" />}
                  >
                    <MessageCircle size={14} />
                    Enviar no WhatsApp
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    nativeButton={false}
                    render={<a href={qrImpressao} download={`qrcode-agendamento-${slug}.png`} />}
                  >
                    <Download size={14} />
                    Baixar QR
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
