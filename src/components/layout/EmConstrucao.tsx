export function EmConstrucao({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="text-muted-foreground">
        Este módulo ainda está em construção.
      </p>
    </div>
  );
}
