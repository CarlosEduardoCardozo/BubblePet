import { exigirAdminPagina } from "@/lib/admin-acesso";
import { AdminTabs } from "./AdminTabs";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await exigirAdminPagina();
  return (
    <div className="flex flex-col gap-6">
      <AdminTabs />
      {children}
    </div>
  );
}
