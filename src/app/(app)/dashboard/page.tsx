import { CalendarDays, Wallet, Receipt, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon size={18} className="text-primary" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { count: tutoresCount } = await supabase
    .from("tutores")
    .select("*", { count: "exact", head: true });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={CalendarDays}
          label="Agendamentos hoje"
          value="Em breve"
        />
        <MetricCard
          icon={Wallet}
          label="Faturamento do mês"
          value="Em breve"
        />
        <MetricCard icon={Receipt} label="Faturas em aberto" value="Em breve" />
        <MetricCard
          icon={Users}
          label="Tutores cadastrados"
          value={String(tutoresCount ?? 0)}
        />
      </div>
    </div>
  );
}
