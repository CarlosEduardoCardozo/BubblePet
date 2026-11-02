import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Enviar fotos e vídeos",
  robots: { index: false },
};

export default function EnviarLayout({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-screen flex-1 flex-col bg-[#f0faf8] text-foreground">{children}</div>;
}
