import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  STATUS_BADGE_CLASS,
  STATUS_LABELS,
  type AgendamentoStatus,
} from "@/lib/agendamento";

export function StatusBadge({
  status,
  className,
}: {
  status: AgendamentoStatus;
  className?: string;
}) {
  return (
    <Badge variant="secondary" className={cn(STATUS_BADGE_CLASS[status], className)}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABELS[status]}
    </Badge>
  );
}
