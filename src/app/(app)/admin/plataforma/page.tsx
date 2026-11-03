import { exigirAdminPagina } from "@/lib/admin-acesso";
import { carregarConfigPlataforma, statusDaPlataforma } from "@/lib/plataforma";
import { PlataformaView } from "./PlataformaView";

export const metadata = { title: "Plataforma · Admin · BubblePet" };
export const dynamic = "force-dynamic";

export default async function PlataformaPage() {
  await exigirAdminPagina();
  const config = await carregarConfigPlataforma();
  const status = await statusDaPlataforma(config);
  return (
    <PlataformaView
      inicial={{
        linkAssinatura: config.linkAssinatura ?? "",
        precoReais: config.precoMensalCentavos != null ? (config.precoMensalCentavos / 100).toFixed(2).replace(".", ",") : "",
        contatoWhatsapp: config.contatoWhatsapp ?? "",
        disparoUrl: config.disparoUrl ?? "",
        disparoPorHora: config.disparoPorHora,
      }}
      tokenSalvo={!!config.disparoToken}
      statusInicial={status}
    />
  );
}
