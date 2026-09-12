"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/EmptyState";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      icon={AlertTriangle}
      title="Algo deu errado por aqui"
      description="Não conseguimos carregar esta tela. Tente de novo; se continuar, recarregue a página."
      action={
        <Button onClick={reset}>Tentar de novo</Button>
      }
    />
  );
}
