"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Send, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { enviarAgoraAction, previaMensagemAction } from "./actions";

export type AlvoMensagem = { petId: string; petNome: string; tutorNome: string; tipo: "retorno" | "plano_sobrando" };

/** Mostra a mensagem antes de mandar: dá pra pedir à IA, editar e enviar. */
export function EnviarMensagemDialog({
  alvo,
  onClose,
  iaDisponivel,
  iaPadrao,
  whatsappConectado,
}: {
  alvo: AlvoMensagem | null;
  onClose: () => void;
  iaDisponivel: boolean;
  /** Abre já escrito pela IA (quando o petshop usa IA nas automáticas). */
  iaPadrao: boolean;
  whatsappConectado: boolean;
}) {
  const [texto, setTexto] = useState("");
  const [porIa, setPorIa] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [enviando, startEnvio] = useTransition();

  async function gerar(comIa: boolean) {
    if (!alvo) return;
    setCarregando(true);
    const r = await previaMensagemAction(alvo.petId, alvo.tipo, comIa);
    setCarregando(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    setTexto(r.texto);
    setPorIa(r.porIa);
    if (comIa && !r.porIa && r.erroIa) toast.error(`${r.erroIa} Mostrando o texto padrão.`);
  }

  useEffect(() => {
    if (!alvo) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpa a mensagem do pet anterior antes de gerar a nova
    setTexto("");
    void gerar(iaPadrao && iaDisponivel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alvo?.petId, alvo?.tipo]);

  function enviar() {
    if (!alvo) return;
    startEnvio(async () => {
      const r = await enviarAgoraAction(alvo.petId, alvo.tipo, texto);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      toast.success(`Mensagem enviada para ${alvo.tutorNome.split(" ")[0]}.`);
      onClose();
    });
  }

  return (
    <Dialog open={!!alvo} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Mensagem para o tutor do {alvo?.petNome}</DialogTitle>
          <DialogDescription>
            Revise antes de enviar. Você pode editar o texto à vontade.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Textarea
            value={carregando ? "" : texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPorIa(false);
            }}
            placeholder={carregando ? "Escrevendo a mensagem..." : ""}
            className="min-h-44 text-[15px] leading-relaxed"
            disabled={carregando}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {carregando ? "Escrevendo..." : porIa ? "✨ Escrita pela IA — revise antes de enviar" : "Texto padrão do petshop"}
              {!carregando && ` · ${texto.length} caracteres`}
            </span>
            <span className="flex gap-1">
              <Button type="button" size="xs" variant="ghost" onClick={() => gerar(false)} disabled={carregando || enviando}>
                Texto padrão
              </Button>
              <Button
                type="button"
                size="xs"
                variant="outline"
                onClick={() => gerar(true)}
                disabled={carregando || enviando || !iaDisponivel}
                title={iaDisponivel ? "Pedir uma versão nova à IA" : "Configure a chave da OpenAI para usar a IA"}
              >
                <Sparkles size={12} /> {porIa ? "Outra versão" : "Escrever com IA"}
              </Button>
            </span>
          </div>
          {!iaDisponivel && (
            <p className="text-xs text-muted-foreground">A IA ainda não está configurada (falta a chave da OpenAI no servidor).</p>
          )}
        </div>

        {!whatsappConectado && (
          <p className="text-xs font-medium text-destructive">O WhatsApp está desconectado: dá para revisar o texto, mas o envio só funciona depois de conectar.</p>
        )}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="button" onClick={enviar} disabled={enviando || carregando || texto.trim().length < 10 || !whatsappConectado}>
            <Send size={14} /> {enviando ? "Enviando..." : "Enviar no WhatsApp"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
