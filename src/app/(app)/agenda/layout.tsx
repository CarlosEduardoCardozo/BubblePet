import { exigirModulo } from "@/lib/acesso";

export default async function Layout({ children }: { children: React.ReactNode }) {
  await exigirModulo("agenda");
  return children;
}
