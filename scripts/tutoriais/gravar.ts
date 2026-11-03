/**
 * Fábrica dos tutoriais em vídeo: narração + gravação de tela + montagem.
 *
 * Pra cada roteiro (roteiros.ts):
 *  1. recria o petshop de demonstração (demo.ts), pra começar sempre igual;
 *  2. gera a narração de cada cena com a voz da OpenAI (fica em cache);
 *  3. o robô do navegador entra no painel e faz os passos no ritmo da fala,
 *     com cursor visível, destaque no que importa e legenda;
 *  4. o ffmpeg junta tela e voz num .mp4;
 *  5. sobe pro Storage do Supabase e cadastra/atualiza em Admin › Tutoriais.
 *
 * Uso (com o app rodando em outro terminal: npm run dev):
 *   npm run tutoriais                         # todos os roteiros
 *   npm run tutoriais -- --so=agenda,planos   # só alguns
 *   npm run tutoriais -- --ver                # mostra o navegador gravando
 *   npm run tutoriais -- --sem-upload         # só gera os .mp4 em scripts/tutoriais/saida
 *   npm run tutoriais -- --sem-voz            # sem OpenAI: silêncio no lugar da fala (teste)
 *
 * Precisa: ffmpeg instalado (brew install ffmpeg), o Chromium do Playwright
 * (npx playwright install chromium) e, no .env.local, OPENAI_API_KEY,
 * NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.
 * Variáveis opcionais: TUTORIAL_URL (padrão http://localhost:3000),
 * TUTORIAL_VOZ (padrão "nova"), TUTORIAL_TTS_MODEL (padrão "gpt-4o-mini-tts"; sem acesso a ele,
 * tenta "tts-1-hd" e "tts-1").
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Locator, type Page } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { recriarDemo, type LoginDemo } from "./demo";
import { ROTEIROS, type Acoes, type Alvo, type Roteiro } from "./roteiros";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

const PASTA = __dirname;
const CACHE = join(PASTA, ".cache");
const SAIDA = join(PASTA, "saida");
const LARGURA = 1280;
const ALTURA = 720;

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const valor = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];

const BASE = (valor("url") ?? process.env.TUTORIAL_URL ?? "http://localhost:3000").replace(/\/$/, "");
const VOZ = process.env.TUTORIAL_VOZ ?? "nova";
const MODELO_TTS = process.env.TUTORIAL_TTS_MODEL ?? "gpt-4o-mini-tts";
const INSTRUCOES_VOZ =
  "Fale em português do Brasil, com sotaque brasileiro natural. Tom simpático, acolhedor e didático, " +
  "como uma atendente explicando com calma para o dono de um petshop. Ritmo tranquilo, sem pressa.";

/* ───────── Narração ───────── */

function duracaoDoAudio(arquivo: string): number {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", arquivo]);
  return Number(out.toString().trim());
}

// Modelos tentados em ordem: o configurado e, se o projeto da OpenAI não tiver
// acesso a ele, os clássicos (mesma voz, sem as instruções de tom).
const MODELOS_TTS = [...new Set([MODELO_TTS, "tts-1-hd", "tts-1"])];
let modeloLiberado: string | null = null;

async function vozDaOpenAI(fala: string): Promise<Buffer> {
  const chaveApi = process.env.OPENAI_API_KEY;
  if (!chaveApi) throw new Error("Configure OPENAI_API_KEY no .env.local (ou use --sem-voz pra testar).");
  // O que já funcionou vem primeiro, mas os outros continuam de reserva: a
  // liberação de modelos da OpenAI demora a valer e pode oscilar no começo.
  const candidatos = modeloLiberado ? [modeloLiberado, ...MODELOS_TTS.filter((m) => m !== modeloLiberado)] : MODELOS_TTS;
  let ultimoErro = "";
  for (const modelo of candidatos) {
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { authorization: `Bearer ${chaveApi}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: modelo,
          voice: VOZ,
          input: fala,
          // Só os modelos gpt-*-tts aceitam instruções de tom.
          ...(modelo.startsWith("tts-1") ? {} : { instructions: INSTRUCOES_VOZ }),
          response_format: "mp3",
        }),
      });
      if (r.ok) {
        if (modeloLiberado !== modelo) console.log(`  voz: modelo ${modelo}, voz ${VOZ}`);
        modeloLiberado = modelo;
        return Buffer.from(await r.arrayBuffer());
      }
      ultimoErro = `OpenAI respondeu ${r.status}: ${(await r.text()).slice(0, 300)}`;
      const semAcesso = (r.status === 403 || r.status === 404) && /model/i.test(ultimoErro);
      // Outro erro (chave, saldo, texto): para aqui.
      if (!semAcesso) throw new Error(ultimoErro);
      // Sem acesso: espera um pouco e tenta de novo; na segunda, vai pro próximo modelo.
      if (tentativa === 1) await new Promise((res) => setTimeout(res, 2500));
    }
  }
  throw new Error(
    `${ultimoErro}\nSe nenhum modelo de voz estiver liberado, libere "tts-1" no projeto da OpenAI ` +
      `(platform.openai.com › Settings › Project › Limits › Model access).`
  );
}

async function narrar(fala: string): Promise<{ arquivo: string; segundos: number }> {
  mkdirSync(CACHE, { recursive: true });
  const semVoz = flag("sem-voz");
  const chave = createHash("sha1").update(`${semVoz ? "silencio" : `${MODELO_TTS}|${VOZ}|${INSTRUCOES_VOZ}`}|${fala}`).digest("hex");
  const arquivo = join(CACHE, `${chave}.mp3`);
  if (!existsSync(arquivo)) {
    if (semVoz) {
      // ~2,6 palavras por segundo, o ritmo de uma narração calma.
      const segundos = Math.max(2, fala.split(/\s+/).length / 2.6);
      execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono", "-t", segundos.toFixed(2), "-q:a", "9", arquivo]);
    } else {
      writeFileSync(arquivo, await vozDaOpenAI(fala));
    }
  }
  return { arquivo, segundos: duracaoDoAudio(arquivo) };
}

/* ───────── Camada visual (cursor, destaque, legenda, cartões) ───────── */

const OVERLAY = `(() => {
  if (window.__tutorial) return;
  window.__tutorial = true;
  const css = \`
    nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }
    #tut-cursor { position: fixed; z-index: 2147483647; width: 26px; height: 26px; margin: -4px 0 0 -4px; pointer-events: none;
      transition: transform .12s ease; filter: drop-shadow(0 3px 6px rgba(28,11,61,.35)); }
    #tut-cursor.clique { transform: scale(.82); }
    .tut-onda { position: fixed; z-index: 2147483646; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%;
      border: 3px solid #ffc21a; pointer-events: none; animation: tut-onda .6s ease-out forwards; }
    @keyframes tut-onda { from { transform: scale(.3); opacity: 1 } to { transform: scale(1.6); opacity: 0 } }
    .tut-destaque { position: fixed; z-index: 2147483645; pointer-events: none; border-radius: 16px;
      border: 3px solid #ffc21a; box-shadow: 0 0 0 9999px rgba(28,11,61,.28), 0 0 24px 4px rgba(255,194,26,.55);
      animation: tut-pulso 1.2s ease-in-out infinite; transition: opacity .3s; }
    @keyframes tut-pulso { 50% { box-shadow: 0 0 0 9999px rgba(28,11,61,.28), 0 0 36px 10px rgba(255,194,26,.75) } }
    #tut-legenda { position: fixed; z-index: 2147483646; left: 50%; bottom: 28px; transform: translateX(-50%); max-width: 78%;
      padding: 12px 22px; border-radius: 18px; background: rgba(28,11,61,.86); color: #fff; text-align: center;
      font: 600 19px/1.4 "Red Hat Display", system-ui, sans-serif; pointer-events: none; backdrop-filter: blur(8px);
      box-shadow: 0 12px 30px -10px rgba(28,11,61,.5); transition: opacity .25s; }
    #tut-legenda:empty { opacity: 0; }
    #tut-cartao { position: fixed; inset: 0; z-index: 2147483647; display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 14px; color: #fff; text-align: center; padding: 40px;
      background: radial-gradient(60% 60% at 85% 10%, rgba(255,211,77,.55), transparent 60%), linear-gradient(155deg,#a47bff 0%,#7c3aed 55%,#5b21b6 100%);
      font-family: "Red Hat Display", system-ui, sans-serif; transition: opacity .4s; }
    #tut-cartao[hidden] { display: flex !important; opacity: 0; pointer-events: none; }
    #tut-cartao .marca { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 22px; opacity: .95; }
    #tut-cartao .marca span { width: 40px; height: 40px; border-radius: 13px; background: rgba(255,255,255,.22); display: grid; place-items: center; }
    #tut-cartao h1 { margin: 0; font-size: 54px; line-height: 1.05; font-weight: 900; letter-spacing: -.03em; max-width: 900px; }
    #tut-cartao p { margin: 0; font-size: 22px; font-weight: 600; opacity: .85; max-width: 760px; }
  \`;
  const montar = () => {
    if (document.getElementById("tut-cursor")) return;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    const c = document.createElement("div"); c.id = "tut-cursor";
    c.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M4 2l16 9.5-7 1.6-3.6 6.9z" fill="#1c0b3d" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const pos = JSON.parse(sessionStorage.getItem("tut-pos") || "[640,360]");
    c.style.left = pos[0] + "px"; c.style.top = pos[1] + "px";
    document.body.appendChild(c);
    const l = document.createElement("div"); l.id = "tut-legenda"; l.textContent = sessionStorage.getItem("tut-legenda") || "";
    document.body.appendChild(l);
    const k = document.createElement("div"); k.id = "tut-cartao"; k.hidden = true;
    document.body.appendChild(k);
  };
  addEventListener("mousemove", (e) => {
    const c = document.getElementById("tut-cursor"); if (!c) return;
    c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px";
    sessionStorage.setItem("tut-pos", JSON.stringify([e.clientX, e.clientY]));
  }, true);
  addEventListener("mousedown", (e) => {
    const c = document.getElementById("tut-cursor"); c && c.classList.add("clique");
    const o = document.createElement("div"); o.className = "tut-onda"; o.style.left = e.clientX + "px"; o.style.top = e.clientY + "px";
    document.body.appendChild(o); setTimeout(() => o.remove(), 700);
  }, true);
  addEventListener("mouseup", () => { const c = document.getElementById("tut-cursor"); c && c.classList.remove("clique"); }, true);
  window.__legenda = (t) => { sessionStorage.setItem("tut-legenda", t || ""); montar(); document.getElementById("tut-legenda").textContent = t || ""; };
  window.__destacar = (x, y, w, h, ms) => {
    montar(); const d = document.createElement("div"); d.className = "tut-destaque";
    Object.assign(d.style, { left: (x - 6) + "px", top: (y - 6) + "px", width: (w + 12) + "px", height: (h + 12) + "px" });
    document.body.appendChild(d); setTimeout(() => { d.style.opacity = "0"; setTimeout(() => d.remove(), 300); }, ms);
  };
  window.__cartao = (titulo, sub) => {
    montar(); const k = document.getElementById("tut-cartao");
    if (!titulo) { k.hidden = true; return; }
    k.innerHTML = '<div class="marca"><span>🐾</span>BubblePet · Tutorial</div><h1></h1>' + (sub ? '<p></p>' : '');
    k.querySelector("h1").textContent = titulo; if (sub) k.querySelector("p").textContent = sub;
    k.hidden = false;
  };
  if (document.readyState === "loading") addEventListener("DOMContentLoaded", montar); else montar();
})();`;

/* ───────── Ações do robô ───────── */

const esperar = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function criarAcoes(page: Page, avisos: string[]): Acoes {
  const resolver = (alvo: Alvo): Locator => (typeof alvo === "string" ? page.locator(alvo).first() : alvo(page));
  let mouse = { x: LARGURA / 2, y: ALTURA / 2 };

  async function pronto(alvo: Alvo, oQue: string): Promise<Locator | null> {
    const el = resolver(alvo);
    try {
      await el.waitFor({ state: "visible", timeout: 7000 });
      await el.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
      return el;
    } catch {
      avisos.push(`${oQue}: não encontrei ${typeof alvo === "string" ? alvo : "o elemento"}`);
      return null;
    }
  }

  async function moverPara(el: Locator) {
    const box = await el.boundingBox();
    if (!box) return null;
    const alvo = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const distancia = Math.hypot(alvo.x - mouse.x, alvo.y - mouse.y);
    await page.mouse.move(alvo.x, alvo.y, { steps: Math.max(8, Math.round(distancia / 18)) });
    mouse = alvo;
    return box;
  }

  const acoes: Acoes = {
    page,
    esperar,
    async ir(caminho) {
      await page.goto(`${BASE}${caminho}`, { waitUntil: "networkidle" }).catch(() => {});
      await esperar(400);
    },
    async passarMouse(alvo) {
      const el = await pronto(alvo, "passar o mouse");
      if (el) await moverPara(el);
      await esperar(250);
    },
    async clicar(alvo) {
      const el = await pronto(alvo, "clicar");
      if (!el) return;
      await moverPara(el);
      await esperar(180);
      await el.click({ timeout: 5000 }).catch((e) => avisos.push(`clicar: ${String(e).slice(0, 120)}`));
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
      await esperar(350);
    },
    async digitar(alvo, texto) {
      const el = await pronto(alvo, "digitar");
      if (!el) return;
      await moverPara(el);
      await el.click({ timeout: 5000 }).catch(() => {});
      await page.keyboard.type(texto, { delay: 65 });
      await esperar(250);
    },
    async destacar(alvo, ms = 1600) {
      const el = await pronto(alvo, "destacar");
      if (!el) return;
      const box = await el.boundingBox();
      if (!box) return;
      await page.evaluate(([x, y, w, h, t]) => (window as unknown as { __destacar: (...a: number[]) => void }).__destacar(x, y, w, h, t), [
        box.x, box.y, Math.min(box.width, LARGURA - box.x - 12), Math.min(box.height, ALTURA - box.y - 12), ms,
      ]);
      await esperar(ms);
    },
    async rolarAte(alvo) {
      const el = resolver(alvo);
      await el.waitFor({ state: "attached", timeout: 7000 }).catch(() => avisos.push("rolar: alvo não encontrado"));
      await el.evaluate((n) => n.scrollIntoView({ behavior: "smooth", block: "center" })).catch(() => {});
      await esperar(900);
    },
    async escolher(gatilho, opcao) {
      await acoes.clicar(gatilho);
      const opcoes = page.getByRole("option");
      try {
        await opcoes.first().waitFor({ state: "visible", timeout: 5000 });
      } catch {
        avisos.push(`escolher "${opcao}": a lista não abriu`);
        return;
      }
      // Pega a opção cujo texto começa exatamente com o nome ("Banho" ≠ "Banho e tosa").
      const textos = await opcoes.allInnerTexts();
      const primeiraLinha = (t: string) => t.split("\n")[0].trim();
      let i = textos.findIndex((t) => primeiraLinha(t) === opcao);
      if (i < 0) i = textos.findIndex((t) => t.trim().startsWith(opcao));
      if (i < 0) {
        avisos.push(`escolher: não achei a opção "${opcao}"`);
        await page.keyboard.press("Escape");
        return;
      }
      await acoes.clicar(() => opcoes.nth(i));
    },
  };
  return acoes;
}

/* ───────── Gravação ───────── */

type Marca = { arquivo: string; inicioMs: number };

async function entrar(browser: Browser, login: LoginDemo) {
  const ctx = await browser.newContext({ viewport: { width: LARGURA, height: ALTURA }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill("#email", login.email);
  await page.fill("#senha", login.senha);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(dashboard|configuracoes|hoje)/, { timeout: 30000 });
  const estado = await ctx.storageState();
  await ctx.close();
  return estado;
}

async function gravar(browser: Browser, roteiro: Roteiro, estado: Awaited<ReturnType<typeof entrar>> | undefined) {
  console.log(`\n▶ ${roteiro.titulo}`);
  const falas = [];
  for (const cena of roteiro.cenas) falas.push(await narrar(cena.fala));
  const totalFala = falas.reduce((s, f) => s + f.segundos, 0);
  console.log(`  narração: ${falas.length} falas, ${totalFala.toFixed(1)} s`);

  const pastaVideo = join(SAIDA, "bruto", roteiro.chave);
  mkdirSync(pastaVideo, { recursive: true });
  const ctx = await browser.newContext({
    storageState: estado,
    viewport: { width: LARGURA, height: ALTURA },
    deviceScaleFactor: 1,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    recordVideo: { dir: pastaVideo, size: { width: LARGURA, height: ALTURA } },
  });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  // A gravação começa quando a página é criada: é o zero do vídeo.
  const t0 = Date.now();
  const avisos: string[] = [];
  const a = criarAcoes(page, avisos);
  const chamar = (fn: string, ...p: (string | null)[]) =>
    page.evaluate(([f, ...x]) => (window as unknown as Record<string, (...a: unknown[]) => void>)[f as string]?.(...x), [fn, ...p]).catch(() => {});

  await page.goto(`${BASE}${roteiro.inicio}`, { waitUntil: "networkidle" });
  await esperar(800);

  // Abertura: cartão com o título por cima da tela já carregada.
  await chamar("__cartao", roteiro.titulo, roteiro.descricao);
  const corteMs = Date.now() - t0;
  await esperar(3000);
  await chamar("__cartao", null);
  await esperar(500);

  const marcas: Marca[] = [];
  for (const [i, cena] of roteiro.cenas.entries()) {
    const inicio = Date.now();
    marcas.push({ arquivo: falas[i].arquivo, inicioMs: inicio - t0 - corteMs });
    await chamar("__legenda", cena.fala);
    if (cena.acoes) {
      try {
        await cena.acoes(a);
      } catch (e) {
        avisos.push(`cena ${i + 1}: ${String(e).slice(0, 160)}`);
      }
    }
    const resta = falas[i].segundos * 1000 + 450 - (Date.now() - inicio);
    if (resta > 0) await esperar(resta);
  }
  await chamar("__legenda", "");
  await chamar("__cartao", "Pronto!", "Mais tutoriais no menu Tutoriais do BubblePet.");
  await esperar(2500);
  const fimMs = Date.now() - t0 - corteMs;

  const video = page.video();
  await ctx.close();
  const bruto = await video!.path();

  for (const aviso of avisos) console.warn(`  ⚠ ${aviso}`);
  return { bruto, marcas, fimMs, corteMs, avisos };
}

function montar(roteiro: Roteiro, g: { bruto: string; marcas: Marca[]; fimMs: number; corteMs: number }): string {
  const destino = join(SAIDA, `${roteiro.chave}.mp4`);
  const entradas = g.marcas.flatMap((m) => ["-i", m.arquivo]);
  const filtros = g.marcas.map((m, i) => `[${i + 1}:a]aresample=48000,adelay=${Math.max(0, Math.round(m.inicioMs))}:all=1[a${i}]`);
  const mix = `${g.marcas.map((_, i) => `[a${i}]`).join("")}amix=inputs=${g.marcas.length}:normalize=0:dropout_transition=0[voz]`;
  execFileSync(
    "ffmpeg",
    [
      "-y", "-v", "error",
      "-ss", (g.corteMs / 1000).toFixed(3), "-i", g.bruto,
      ...entradas,
      "-filter_complex", [...filtros, mix].join(";"),
      "-map", "0:v", "-map", "[voz]",
      "-t", (g.fimMs / 1000).toFixed(3),
      "-r", "30", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
      destino,
    ],
    { stdio: "inherit" }
  );
  return destino;
}

/* ───────── Publicação ───────── */

function mmss(segundos: number) {
  const s = Math.round(segundos);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

async function publicar(roteiro: Roteiro, arquivo: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local.");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: bucket } = await db.storage.getBucket("tutoriais");
  if (!bucket) {
    const { error } = await db.storage.createBucket("tutoriais", { public: true, allowedMimeTypes: ["video/mp4"] });
    if (error) throw new Error(`Não consegui criar o bucket "tutoriais": ${error.message}`);
  }
  const caminho = `${roteiro.chave}.mp4`;
  const { error: erroUpload } = await db.storage
    .from("tutoriais")
    .upload(caminho, readFileSync(arquivo), { contentType: "video/mp4", upsert: true, cacheControl: "3600" });
  if (erroUpload) throw new Error(`Falhou ao subir o vídeo: ${erroUpload.message}`);
  // ?v= força o navegador a buscar a versão nova quando o vídeo é regravado.
  const videoUrl = `${db.storage.from("tutoriais").getPublicUrl(caminho).data.publicUrl}?v=${Date.now()}`;

  const campos = {
    topico: roteiro.topico,
    titulo: roteiro.titulo,
    descricao: roteiro.descricao,
    video_url: videoUrl,
    duracao: mmss(duracaoDoAudio(arquivo)),
    ordem: roteiro.ordem,
    ativo: true,
    atualizado_em: new Date().toISOString(),
  };
  const { data: existente } = await db
    .from("tutoriais")
    .select("id")
    .eq("topico", roteiro.topico)
    .eq("titulo", roteiro.titulo)
    .maybeSingle();
  const { error } = existente
    ? await db.from("tutoriais").update(campos).eq("id", existente.id)
    : await db.from("tutoriais").insert(campos);
  if (error) throw new Error(`Falhou ao cadastrar em Admin › Tutoriais: ${error.message}`);
  console.log(`  ✔ publicado (${campos.duracao}) em Admin › Tutoriais`);
}

/* ───────── Principal ───────── */

export async function rodar(roteiros: Roteiro[], opcoes: { login: boolean; demo: boolean; publicar: boolean }) {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("Instale o ffmpeg (no Mac: brew install ffmpeg).");
  }
  mkdirSync(SAIDA, { recursive: true });
  const browser = await chromium.launch({
    headless: !flag("ver"),
    executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  });
  const resumo: string[] = [];
  try {
    for (const roteiro of roteiros) {
      let estado;
      if (opcoes.login) {
        const login = opcoes.demo ? await recriarDemo() : JSON.parse(readFileSync(join(PASTA, ".demo.json"), "utf8"));
        estado = await entrar(browser, login);
      }
      const g = await gravar(browser, roteiro, estado);
      const arquivo = montar(roteiro, g);
      // A gravação crua (sem som) só servia pra montagem: some pra não confundir.
      rmSync(join(SAIDA, "bruto", roteiro.chave), { recursive: true, force: true });
      console.log(`  ✔ vídeo com narração: ${resolve(arquivo)}`);
      if (opcoes.publicar) await publicar(roteiro, arquivo);
      resumo.push(`${g.avisos.length ? "⚠" : "✔"} ${roteiro.titulo}${g.avisos.length ? ` (${g.avisos.length} passos com aviso)` : ""}`);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n${resumo.join("\n")}`);
}

if (require.main === module) {
  const so = valor("so")?.split(",");
  const escolhidos = so ? ROTEIROS.filter((r) => so.includes(r.chave)) : ROTEIROS;
  if (!escolhidos.length) {
    console.error(`Nenhum roteiro com esse nome. Disponíveis: ${ROTEIROS.map((r) => r.chave).join(", ")}`);
    process.exit(1);
  }
  rodar(escolhidos, { login: true, demo: !flag("sem-demo"), publicar: !flag("sem-upload") }).catch((e) => {
    console.error(`\n✖ ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
