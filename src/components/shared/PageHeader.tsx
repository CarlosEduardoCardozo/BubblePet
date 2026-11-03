import type { ReactNode } from "react";
import { AjudaVideo } from "@/components/tutoriais/Tutoriais";

export function PageHeader({
  title,
  description,
  action,
  ajuda,
}: {
  title: string;
  /** Tópico do vídeo de ajuda; sem ele, vale o da tela atual (pelo endereço). */
  ajuda?: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-[34px] md:leading-tight">{title}</h1>
          {/* Vídeo de "como usar" desta tela, se o admin cadastrou um. */}
          <AjudaVideo topico={ajuda} />
        </div>
        {description && (
          <p className="text-[15px] font-medium text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
