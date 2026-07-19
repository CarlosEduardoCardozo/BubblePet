"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pagination({
  page,
  totalPages,
}: {
  page: number;
  totalPages: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  function goTo(nextPage: number) {
    const params = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      params.delete("page");
    } else {
      params.set("page", String(nextPage));
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <span className="text-sm text-muted-foreground">
        Página {page} de {totalPages}
      </span>
      <Button
        variant="outline"
        size="icon"
        disabled={page <= 1}
        onClick={() => goTo(page - 1)}
        aria-label="Página anterior"
      >
        <ChevronLeft size={16} />
      </Button>
      <Button
        variant="outline"
        size="icon"
        disabled={page >= totalPages}
        onClick={() => goTo(page + 1)}
        aria-label="Próxima página"
      >
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
