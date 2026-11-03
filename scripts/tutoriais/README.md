# Tutoriais em vídeo

Gera os vídeos de "como usar" do painel com narração, grava a tela com um
robô de navegador e publica em **Admin › Tutoriais**.

## Uma vez só (no Mac)

```bash
brew install ffmpeg
npx playwright install chromium
```

No `.env.local` precisam estar: `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY`.

## Gerar os vídeos

Em um terminal, deixe o app rodando:

```bash
npm run dev
```

Em outro terminal:

```bash
npm run tutoriais
```

Para cada roteiro, o comando:

1. recria o petshop de demonstração **Bolhinha Banho & Tosa** (dados fictícios,
   escondido do Admin);
2. gera a narração com a voz da OpenAI (`nova`, em cache em `.cache/`);
3. grava a tela fazendo os passos no ritmo da fala, com cursor, destaque e legenda;
4. junta tela e voz em `scripts/tutoriais/saida/<roteiro>.mp4`;
5. sobe o vídeo no Storage do Supabase (bucket `tutoriais`) e cadastra ou
   atualiza o vídeo em Admin › Tutoriais.

Opções:

| Opção | O que faz |
|---|---|
| `--so=agenda,planos` | só esses roteiros (`primeiros-passos`, `clientes`, `servicos`, `agenda`, `planos`, `whatsapp`) |
| `--ver` | mostra o navegador enquanto grava |
| `--sem-upload` | só gera os `.mp4`, sem publicar |
| `--sem-voz` | sem OpenAI: silêncio no lugar da fala (pra testar os passos) |
| `--url=http://localhost:3001` | outro endereço do app |

Exemplo (testar a agenda vendo o navegador, sem publicar):

```bash
npm run tutoriais -- --so=agenda --ver --sem-upload
```

Se algum passo não achar o botão ou campo, o terminal mostra um ⚠ com o
passo; o vídeo sai mesmo assim. Ajuste o roteiro em `roteiros.ts` e rode de novo.

## Mudar textos ou passos

Os roteiros ficam em `roteiros.ts`: cada cena é uma fala (que também vira
legenda) e as ações do robô. Mudou a fala, a narração é gerada de novo; o
resto vem do cache.

## Apagar o petshop de demonstração

```bash
npm run tutoriais:demo -- --apagar
```
