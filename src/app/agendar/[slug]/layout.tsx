import type { Metadata } from "next";
import { Fredoka } from "next/font/google";

const fredoka = Fredoka({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600"],
});

export const metadata: Metadata = {
  title: "Agendar banho",
  robots: { index: false },
};

export default function AgendarLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${fredoka.variable} flex min-h-screen flex-1 flex-col bg-[#f0faf8] text-foreground`}
    >
      {children}
    </div>
  );
}
