import express from "express";
import axios from "axios";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ===== Helpers =====
function normalizeTicker(input) {
  const t = (input || "").trim().toUpperCase();
  if (!t) return null;

  // Se o usuário já mandar com sufixo (AAPL, PETR4.SA), mantém.
  if (t.includes(".")) return t;

  // Heurística simples: tickers BR geralmente terminam com 3/4 e não têm letras após.
  // Se quiser sempre BR, setar YF_SUFFIX_DEFAULT=.SA no Render
  const defaultSuffix = process.env.YF_SUFFIX_DEFAULT; // ex: ".SA"
  if (defaultSuffix) return `${t}${defaultSuffix}`;

  // Sem default, tenta como veio (AAPL funciona, PETR4 sem .SA pode falhar)
  return t;
}

async function getQuoteFromYahoo(tickerRaw) {
  const ticker = normalizeTicker(tickerRaw);
  if (!ticker) throw new Error("Ticker vazio.");

  // Endpoint público do Yahoo (rápido e simples)
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(
    ticker
  )}`;

  const resp = await axios.get(url, {
    timeout: 10000,
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    },
  });

  const result = resp?.data?.quoteResponse?.result?.[0];
  if (!result) {
    throw new Error(`Não achei esse ticker no Yahoo: ${ticker}`);
  }

  const price = result.regularMarketPrice;
  const currency = result.currency || "";
  const name = result.shortName || result.longName || ticker;

  if (price == null) {
    throw new Error(`Ticker encontrado (${ticker}), mas sem preço agora.`);
  }

  return { ticker, name, price, currency };
}

async function sendWhatsAppText(to, message) {
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const token = process.env.WA_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("Faltou WA_PHONE_NUMBER_ID ou WA_TOKEN nas env vars do Render.");
  }

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: message },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );
}

// ===== Rotas =====

// rota raiz
app.get("/", (req, res) => {
  res.send("ok");
});

// Verificação do webhook (Meta chama via GET)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Recebe mensagens (Meta manda via POST)
app.post("/webhook", async (req, res) => {
  try {
    // Responde 200 rápido para a Meta (evita timeout)
    res.sendStatus(200);

    const body = req.body;

    const change = body?.entry?.[0]?.changes?.[0];
    const value = change?.value;

    const msg = value?.messages?.[0];
    if (!msg || msg.type !== "text") return;

    const from = msg.from; // wa_id do usuário
    const text = msg?.text?.body || "";

    const tickerInput = text.trim();
    if (!tickerInput) return;

    // Busca cotação
    const q = await getQuoteFromYahoo(tickerInput);

    const reply =
      `📈 *Cotação*\n` +
      `Ticker: *${q.ticker}*\n` +
      `Ativo: ${q.name}\n` +
      `Preço: *${q.price}* ${q.currency}\n\n` +
      `Envie outro ticker (ex: AAPL, VALE3, PETR4).`;

    await sendWhatsAppText(from, reply);
  } catch (err) {
    console.error("Erro no webhook:", err?.response?.data || err?.message || err);

    // Se der erro, tenta avisar o usuário (se der pra identificar)
    try {
      const msg = req?.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = msg?.from;
      if (from) {
        await sendWhatsAppText(from, "Deu erro ao consultar a cotação. Tente novamente em instantes.");
      }
    } catch (e) {
      // ignora
    }
  }
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
