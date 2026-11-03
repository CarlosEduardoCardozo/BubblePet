import { PageHeader } from "@/components/shared/PageHeader";
import { GaleriaTutoriais } from "@/components/tutoriais/GaleriaTutoriais";

export const metadata = { title: "Tutoriais · BubblePet" };

/** Todos os vídeos de "como usar", por funcionalidade. Os vídeos vêm do layout (contexto). */
export default function TutoriaisPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Tutoriais" description="Vídeos curtos mostrando como usar cada parte do BubblePet." />
      <GaleriaTutoriais />
    </div>
  );
}
