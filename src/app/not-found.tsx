import Link from "next/link";
import { PawPrint } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-gray-50 px-4 text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-primary/10 text-primary">
        <PawPrint size={28} />
      </div>
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        O endereço que você abriu não existe ou foi movido.
      </p>
      <Button nativeButton={false} render={<Link href="/dashboard" />}>
        Voltar ao início
      </Button>
    </div>
  );
}
