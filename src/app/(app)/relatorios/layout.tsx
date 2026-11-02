import { exigirModulo } from "@/lib/acesso";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModulo("financeiro");
  return children;
}
