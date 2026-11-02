import {
  Bath,
  CalendarDays,
  Camera,
  Check,
  CheckCheck,
  Clock,
  PawPrint,
  Scissors,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* Mockups desenhados em HTML: leves, nítidos em qualquer tela e sempre nas
   cores da marca. Os nomes são ilustrativos. */

const AGENDA = [
  { hora: "09:00", pet: "Thor", servico: "Banho e tosa", cor: "#7c3aed", status: "Confirmado" },
  { hora: "10:30", pet: "Mel", servico: "Banho · plano", cor: "#3b82f6", status: "Agendado" },
  { hora: "11:15", pet: "Paçoca", servico: "Hidratação", cor: "#16a34a", status: "Concluído" },
];

export function AgendaCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-[28px] glass p-5", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-brand">
            <CalendarDays size={17} />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight">Agenda de hoje</p>
            <p className="text-xs text-muted-foreground">Terça, 8 atendimentos</p>
          </div>
        </div>
        <span className="rounded-full bg-secondary px-2.5 py-1 text-[11px] font-bold text-secondary-foreground">
          3 livres
        </span>
      </div>
      <ul className="mt-4 flex flex-col gap-2">
        {AGENDA.map((a) => (
          <li
            key={a.hora}
            className="flex items-center gap-3 rounded-2xl border-l-[3px] bg-white/80 px-3 py-2.5"
            style={{ borderLeftColor: a.cor }}
          >
            <span className="w-11 text-xs font-bold tabular-nums text-muted-foreground">{a.hora}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold">{a.pet}</p>
              <p className="truncate text-xs text-muted-foreground">{a.servico}</p>
            </div>
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ color: a.cor, backgroundColor: `color-mix(in srgb, ${a.cor} 12%, white)` }}
            >
              {a.status}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WhatsAppCard({ className }: { className?: string }) {
  return (
    <div className={cn("w-64 rounded-[24px] bg-[#e9fbe5] p-3.5 shadow-[0_20px_50px_-20px_rgb(22_101_52/0.45)]", className)}>
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-[#25d366] text-white">
          <PawPrint size={14} />
        </span>
        <p className="text-xs font-bold text-[#14532d]">Petshop · WhatsApp</p>
      </div>
      <div className="mt-2.5 rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-[13px] leading-snug text-[#1f2937] shadow-sm">
        Oi, Ana! 🐶 Lembrete: o banho do <b>Thor</b> é amanhã às <b>9h</b>. Responda <b>1</b> pra confirmar.
        <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#6b7280]">
          08:02 <CheckCheck size={12} className="text-[#34b7f1]" />
        </span>
      </div>
      <div className="mt-1.5 ml-auto w-fit rounded-2xl rounded-tr-sm bg-[#d9fdd3] px-3 py-1.5 text-[13px] font-semibold text-[#14532d]">
        1 ✅
      </div>
    </div>
  );
}

export function FidelidadeCard({ className, carimbos = 7 }: { className?: string; carimbos?: number }) {
  return (
    <div className={cn("w-60 rounded-[24px] bg-sun p-4", className)}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-extrabold">Cartão fidelidade</p>
        <Sparkles size={16} />
      </div>
      <p className="text-xs font-semibold opacity-75">10º banho é por nossa conta</p>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {Array.from({ length: 10 }, (_, i) => (
          <span
            key={i}
            className={cn(
              "flex aspect-square items-center justify-center rounded-full",
              i < carimbos ? "bg-[#3d2c00] text-[#ffd34d]" : "border-2 border-dashed border-[#3d2c00]/30"
            )}
          >
            {i < carimbos && <PawPrint size={12} />}
          </span>
        ))}
      </div>
    </div>
  );
}

export function ChegadaCard({ className }: { className?: string }) {
  return (
    <div className={cn("w-56 rounded-[24px] glass p-3.5", className)}>
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full bg-brand">
          <Camera size={13} />
        </span>
        <p className="text-xs font-bold">Chegada registrada</p>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {["#c4b5fd", "#ffdc6b", "#a78bfa"].map((c) => (
          <span
            key={c}
            className="flex aspect-square items-center justify-center rounded-xl"
            style={{ backgroundColor: c }}
          >
            <PawPrint size={16} className="text-white/90" />
          </span>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-success">
        <Check size={12} /> Tutor avisado com as fotos
      </p>
    </div>
  );
}

/** Celular com o link de agendamento do tutor. */
export function PhoneAgendar({ className }: { className?: string }) {
  const horarios = ["08:30", "09:00", "10:30", "13:00", "14:30", "16:00"];
  return (
    <div
      className={cn(
        "relative w-[270px] rounded-[44px] border-[10px] border-[#17121f] bg-[#f7f5fc] text-foreground shadow-[0_40px_80px_-30px_rgb(76_29_149/0.55)]",
        className
      )}
    >
      <span className="absolute top-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#17121f]" />
      <div className="flex flex-col gap-3 px-4 pt-10 pb-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-2xl bg-brand">
            <PawPrint size={16} />
          </span>
          <div>
            <p className="text-sm font-extrabold leading-tight">Agendar banho</p>
            <p className="text-[11px] text-muted-foreground">Escolha o serviço e o horário</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Bath, nome: "Banho", ativo: true },
            { icon: Scissors, nome: "Banho e tosa", ativo: false },
          ].map(({ icon: Icon, nome, ativo }) => (
            <span
              key={nome}
              className={cn(
                "flex flex-col gap-1.5 rounded-2xl p-2.5 text-xs font-bold",
                ativo ? "bg-brand" : "bg-white text-foreground"
              )}
            >
              <Icon size={16} />
              {nome}
            </span>
          ))}
        </div>
        <p className="mt-1 flex items-center gap-1 text-[11px] font-bold text-muted-foreground">
          <Clock size={12} /> Quinta, 14 de nov.
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          {horarios.map((h, i) => (
            <span
              key={h}
              className={cn(
                "rounded-full py-1.5 text-center text-xs font-bold tabular-nums",
                i === 2 ? "bg-sun" : "bg-white text-foreground"
              )}
            >
              {h}
            </span>
          ))}
        </div>
        <span className="mt-2 rounded-full bg-brand py-2.5 text-center text-sm font-bold">
          Confirmar agendamento
        </span>
      </div>
    </div>
  );
}
