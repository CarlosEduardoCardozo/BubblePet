"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { enviarLembrete } from "@/app/(app)/agenda/actions";

export function LembreteButton({
  agendamentoId,
  size = "sm",
  variant = "outline",
  label = "Enviar lembrete",
}: {
  agendamentoId: string;
  size?: "sm" | "xs" | "default";
  variant?: "outline" | "ghost" | "default";
  label?: string;
}) {
  const [isPending, startTransition] = useTransition();

  function enviar() {
    startTransition(async () => {
      const result = await enviarLembrete(agendamentoId);
      if ("error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Lembrete enviado pelo WhatsApp.");
      }
    });
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={isPending}
      onClick={enviar}
      title="Envia uma mensagem de lembrete no WhatsApp do tutor"
    >
      <MessageCircle size={14} />
      {isPending ? "Enviando..." : label}
    </Button>
  );
}
