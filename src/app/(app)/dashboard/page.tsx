import { CalendarDays, Wallet, Receipt, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function MetricCard({
  icon: Icon,
  label,
  value,
  live = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  live?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <Icon
          size={18}
          className={live ? "text-primary" : "text-muted-foreground/50"}
        />
      </CardHeader>
      <CardContent>
        <div
          className={
            live
              ? "text-2xl font-semibold"
              : "text-2xl font-semibold text-muted-foreground/70"
          }
        >
          {value}
        </div>
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
          live
        />
      </div>
    </div>
  );
}
