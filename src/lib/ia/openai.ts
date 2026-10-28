import "server-only";

/**
 * Conexão com a OpenAI. A chave fica em OPENAI_API_KEY (servidor; nunca vai
 * pro navegador). OPENAI_MODEL troca o modelo sem mexer no código. Sem a
 * chave, `iaDisponivel()` é false e quem chama cai no caminho sem IA.
 */
const MODELO_PADRAO = "gpt-4.1-mini";

export function iaDisponivel(): boolean {
  return !!process.env.OPENAI_API_KEY;
}

export class IaIndisponivel extends Error {
  constructor(motivo = "A IA não está configurada (falta a chave OPENAI_API_KEY).") {
    super(motivo);
    this.name = "IaIndisponivel";
  }
}

type Conteudo = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };

/**
 * Pede uma resposta em JSON que segue `schema` (structured outputs). Lança
 * IaIndisponivel sem chave, e Error em falha da API.
 */
export async function gerarJson<T>(params: {
  instrucoes: string;
  texto: string;
  /** data URL (data:image/jpeg;base64,...) */
  imagem?: string;
  nomeSchema: string;
  schema: Record<string, unknown>;
  temperatura?: number;
}): Promise<T> {
  const chave = process.env.OPENAI_API_KEY;
  if (!chave) throw new IaIndisponivel();

  const conteudo: Conteudo[] = [{ type: "text", text: params.texto }];
  if (params.imagem) conteudo.push({ type: "image_url", image_url: { url: params.imagem, detail: "high" } });

  const resposta = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || MODELO_PADRAO,
      temperature: params.temperatura ?? 0.7,
      messages: [
        { role: "system", content: params.instrucoes },
        { role: "user", content: conteudo },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: params.nomeSchema, strict: true, schema: params.schema },
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text().catch(() => "");
    console.error("OpenAI respondeu", resposta.status, corpo.slice(0, 500));
    if (resposta.status === 401) throw new IaIndisponivel("A chave da OpenAI foi recusada. Confira OPENAI_API_KEY.");
    if (resposta.status === 429) throw new Error("A IA está sem crédito ou com muitos pedidos agora. Tente de novo em instantes.");
    throw new Error("A IA não respondeu. Tente de novo.");
  }

  const json = (await resposta.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const mensagem = json.choices?.[0]?.message;
  if (!mensagem?.content) throw new Error(mensagem?.refusal || "A IA não conseguiu responder.");
  return JSON.parse(mensagem.content) as T;
}
