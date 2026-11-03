/**
 * Roteiros dos tutoriais em vídeo. Cada cena é uma fala da narração (que
 * também vira legenda) e o que o robô faz na tela enquanto ela é dita.
 * A cena dura o tempo da fala: se as ações acabarem antes, a tela espera;
 * se demorarem mais, a próxima fala começa depois delas.
 *
 * Os nomes (Thor, Ana Souza, Banho...) são do petshop de demonstração
 * criado por demo.ts.
 */
import type { Locator, Page } from "playwright";

export type Alvo = string | ((page: Page) => Locator);

export type Acoes = {
  page: Page;
  ir(caminho: string): Promise<void>;
  clicar(alvo: Alvo): Promise<void>;
  digitar(alvo: Alvo, texto: string): Promise<void>;
  destacar(alvo: Alvo, ms?: number): Promise<void>;
  passarMouse(alvo: Alvo): Promise<void>;
  rolarAte(alvo: Alvo): Promise<void>;
  /** Abre um select (pelo gatilho) e escolhe a opção pelo texto. */
  escolher(gatilho: Alvo, opcao: string): Promise<void>;
  esperar(ms: number): Promise<void>;
};

export type Cena = { fala: string; acoes?: (a: Acoes) => Promise<void> };

export type Roteiro = {
  chave: string;
  topico: string; // chave em src/lib/tutoriais.ts
  titulo: string;
  descricao: string;
  ordem: number;
  inicio: string; // tela onde o vídeo abre
  cenas: Cena[];
};

const botao = (nome: string | RegExp) => (p: Page) => p.getByRole("button", { name: nome }).first();
const texto = (t: string | RegExp) => (p: Page) => p.getByText(t).first();
const menu = (rotulo: string) => (p: Page) => p.locator(`aside a[aria-label="${rotulo}"], nav a[aria-label="${rotulo}"]`).first();

export const ROTEIROS: Roteiro[] = [
  {
    chave: "primeiros-passos",
    topico: "primeiros-passos",
    titulo: "Conhecendo o BubblePet",
    descricao: "Um tour rápido pelo painel: a tela de início, o menu, o dia de hoje e onde pedir ajuda.",
    ordem: 0,
    inicio: "/dashboard",
    cenas: [
      {
        fala: "Oi! Que bom ter você aqui. Esse é o BubblePet, o painel do seu petshop.",
        acoes: async (a) => a.esperar(600),
      },
      {
        fala: "Na tela de início você vê como está o dia: os banhos de hoje, o que já foi entregue e o movimento do mês.",
        acoes: async (a) => {
          await a.destacar((p) => p.locator("main").locator(".glass, [data-slot=card]").first(), 2200);
          await a.page.mouse.wheel(0, 300);
        },
      },
      {
        fala: "Aqui do lado fica o menu. Passe o mouse para ver todas as áreas: agenda, clientes, planos, financeiro e muito mais.",
        acoes: async (a) => {
          await a.page.mouse.wheel(0, -600);
          await a.passarMouse(menu("Agenda"));
          await a.esperar(1200);
          await a.passarMouse(menu("Planos"));
          await a.esperar(900);
          await a.passarMouse(menu("Financeiro"));
        },
      },
      {
        fala: "Em Hoje você acompanha cada pet do dia, da chegada até a entrega para o tutor.",
        acoes: async (a) => {
          await a.clicar(menu("Hoje"));
          await a.esperar(1200);
        },
      },
      {
        fala: "E sempre que bater uma dúvida, procure o botão Como usar no topo da tela, ou abra os Tutoriais no menu. Bora começar!",
        acoes: async (a) => {
          await a.clicar(menu("Tutoriais"));
          await a.esperar(1500);
        },
      },
    ],
  },
  {
    chave: "clientes",
    topico: "clientes",
    titulo: "Cadastrando clientes e pets",
    descricao: "Como cadastrar um cliente com o WhatsApp dele e adicionar os pets.",
    ordem: 0,
    inicio: "/tutores-pets",
    cenas: [
      {
        fala: "Em Clientes e pets ficam todos os tutores e os bichinhos deles. Vamos cadastrar uma cliente nova.",
        acoes: async (a) => a.destacar((p) => p.locator("table").first(), 1800),
      },
      {
        fala: "Clique em Novo cliente e preencha o nome e o WhatsApp. É por esse número que ela vai receber os lembretes e as confirmações.",
        acoes: async (a) => {
          await a.clicar(botao("Novo cliente"));
          await a.digitar("#nome", "Mariana Costa");
          await a.digitar("#telefone", "47998765432");
        },
      },
      {
        fala: "Depois é só cadastrar.",
        acoes: async (a) => {
          await a.clicar(botao("Cadastrar"));
          await a.esperar(1200);
        },
      },
      {
        fala: "Para adicionar o pet, clique na cliente. Informe o nome, o porte e a raça. O porte define o preço de cada serviço.",
        acoes: async (a) => {
          await a.digitar((p) => p.getByPlaceholder("Buscar por nome ou telefone..."), "Mariana");
          await a.esperar(900);
          await a.clicar(texto("Mariana Costa"));
          await a.clicar(botao("Adicionar pet"));
          await a.digitar("#pet-nome", "Pipoca");
          await a.escolher("#pet-porte", "Pequeno");
          await a.digitar("#pet-raca", "Shih-tzu");
        },
      },
      {
        fala: "Pronto! A Pipoca já pode ser agendada. Para achar alguém depois, é só usar a busca por nome ou telefone.",
        acoes: async (a) => {
          await a.clicar((p) => p.getByRole("button", { name: "Adicionar pet" }).last());
          await a.esperar(1500);
        },
      },
    ],
  },
  {
    chave: "servicos",
    topico: "servicos",
    titulo: "Cadastrando seus serviços e preços",
    descricao: "Monte os serviços do petshop com duração e preço, inclusive por porte.",
    ordem: 0,
    inicio: "/servicos",
    cenas: [
      {
        fala: "Em Serviços você monta tudo o que o petshop oferece e quanto custa.",
        acoes: async (a) => a.destacar((p) => p.locator("table").first(), 1800),
      },
      {
        fala: "Clique em Novo serviço e dê um nome. A duração é usada na agenda para saber quanto tempo reservar.",
        acoes: async (a) => {
          await a.clicar(botao("Novo serviço"));
          await a.digitar("#nome", "Tosa higiênica");
          await a.page.locator("#duracao_min").fill("");
          await a.digitar("#duracao_min", "30");
        },
      },
      {
        fala: "Coloque o preço. Se quiser, defina um valor diferente para cada porte: pequeno, médio e grande.",
        acoes: async (a) => {
          await a.digitar("#preco", "35,00");
          await a.digitar("#preco_pequeno", "30,00");
          await a.digitar("#preco_medio", "35,00");
          await a.digitar("#preco_grande", "45,00");
        },
      },
      {
        fala: "Cadastre, e pronto: o serviço já aparece na agenda e no seu link de agendamento.",
        acoes: async (a) => {
          await a.clicar(botao("Cadastrar"));
          await a.esperar(1200);
          await a.destacar(texto("Tosa higiênica"), 1500);
        },
      },
    ],
  },
  {
    chave: "agenda",
    topico: "agenda",
    titulo: "Marcando um banho na agenda",
    descricao: "Como marcar um atendimento e acompanhar cada banho pela agenda.",
    ordem: 0,
    inicio: "/agenda",
    cenas: [
      {
        fala: "Essa é a agenda do petshop. Cada cor mostra a situação do banho: agendado, confirmado ou concluído.",
        acoes: async (a) => a.esperar(800),
      },
      {
        fala: "Para marcar, clique em Novo agendamento, ou direto num horário livre da agenda.",
        acoes: async (a) => a.clicar(botao("Novo agendamento")),
      },
      {
        fala: "Busque o pet pelo nome dele ou do tutor, e escolha o serviço.",
        acoes: async (a) => {
          await a.clicar("#pet_id");
          await a.digitar((p) => p.getByPlaceholder("Nome do pet ou do tutor"), "Thor");
          await a.clicar((p) => p.getByRole("option", { name: /Thor/ }).first());
          await a.escolher("#servico_id", "Banho");
        },
      },
      {
        fala: "Confira o dia e o horário, e clique em Agendar. Se o WhatsApp estiver conectado, o tutor recebe a confirmação na hora.",
        acoes: async (a) => {
          await a.destacar("#hora", 1200);
          await a.clicar((p) => p.locator('[data-slot=sheet-content] button[type="submit"], form button[type="submit"]').last());
          await a.esperar(1500);
        },
      },
      {
        fala: "Clicando num agendamento, você confirma, conclui, remarca ou registra a chegada do pet com fotos para o tutor.",
        acoes: async (a) => {
          await a.clicar((p) => p.locator(".fc-timegrid-event").first());
          await a.esperar(2200);
          await a.page.keyboard.press("Escape");
        },
      },
    ],
  },
  {
    chave: "planos",
    topico: "planos",
    titulo: "Criando planos de banho mensais",
    descricao: "Crie pacotes com mensalidade fixa e um número de banhos por mês.",
    ordem: 0,
    inicio: "/planos",
    cenas: [
      {
        fala: "Planos são pacotes mensais: o cliente paga uma mensalidade fixa e tem direito a um número de banhos por mês. É receita garantida para o petshop.",
        acoes: async (a) => a.destacar((p) => p.locator("table").first(), 2000),
      },
      {
        fala: "Clique em Novo plano. Dê um nome, escolha o serviço que ele cobre e quantos banhos por mês.",
        acoes: async (a) => {
          await a.clicar(botao("Novo plano"));
          await a.digitar("#nome", "Plano Mensal 4 banhos");
          await a.escolher("#servico_id", "Banho");
          await a.page.locator("#creditos_mes").fill("");
          await a.digitar("#creditos_mes", "4");
        },
      },
      {
        fala: "Coloque o valor da mensalidade e crie o plano.",
        acoes: async (a) => {
          await a.digitar("#preco", "180,00");
          await a.clicar(botao("Criar plano"));
          await a.esperar(1200);
        },
      },
      {
        fala: "Depois, no cadastro do pet, é só escolher o plano. O BubblePet controla os banhos de cada mês e gera o fechamento em PDF.",
        acoes: async (a) => {
          await a.ir("/tutores-pets");
          await a.clicar(texto("Ana Souza"));
          await a.esperar(1200);
          await a.destacar((p) => p.locator("[data-slot=sheet-content]").first(), 2500);
        },
      },
    ],
  },
  {
    chave: "whatsapp",
    topico: "configuracoes",
    titulo: "Conectando o WhatsApp do petshop",
    descricao: "Conecte o número do petshop para enviar confirmações e lembretes automáticos.",
    ordem: 0,
    inicio: "/configuracoes",
    cenas: [
      {
        fala: "Conectar o WhatsApp é o que faz a mágica acontecer: confirmações, lembretes e avisos saem direto do número do seu petshop.",
        acoes: async (a) => {
          await a.rolarAte(texto("Conectar com QR code"));
          await a.destacar((p) => p.getByText("WhatsApp", { exact: false }).first(), 1500);
        },
      },
      {
        fala: "Clique em Conectar com QR code. No celular, abra o WhatsApp, vá em Aparelhos conectados, toque em Conectar aparelho e aponte para o QR.",
        // Só aponta: conectar de verdade criaria uma instância no servidor.
        acoes: async (a) => {
          await a.passarMouse(botao("Conectar com QR code"));
          await a.destacar(botao("Conectar com QR code"), 3000);
        },
      },
      {
        fala: "Se preferir, use a opção com código, e digite no celular o código que aparece aqui.",
        acoes: async (a) => {
          await a.passarMouse(botao("Conectar com código"));
          await a.destacar(botao("Conectar com código"), 2000);
        },
      },
      {
        fala: "Logo abaixo fica o seu link de agendamento: mande para os clientes e coloque na bio do Instagram.",
        acoes: async (a) => {
          await a.rolarAte(texto("Link de agendamento"));
          await a.destacar(texto("Link de agendamento"), 2000);
        },
      },
      {
        fala: "E em Mensagens você ajusta os textos e os lembretes automáticos do jeito do seu petshop.",
        acoes: async (a) => {
          await a.ir("/configuracoes/mensagens");
          await a.esperar(1500);
        },
      },
    ],
  },
];
