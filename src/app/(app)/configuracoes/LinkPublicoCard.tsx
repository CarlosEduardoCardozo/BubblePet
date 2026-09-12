"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Link2, Pencil } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSlug } from "./actions";

export function LinkPublicoCard({
  slug,
  baseUrl,
  qrDataUrl,
}: {
  slug: string;
  baseUrl: string;
  qrDataUrl: string;
}) {
  const [editando, setEditando] = useState(false);
  const [novoSlug, setNovoSlug] = useState(slug);
  const [copiado, setCopiado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const url = `${baseUrl}/agendar/${slug}`;
  const host = baseUrl.replace(/^https?:\/\//, "");

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  }

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
                <code className="truncate rounded-[8px] bg-muted px-2 py-1.5 font-mono text-xs">
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
                </div>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
