import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// =======================
// ROTA RAIZ
// =======================
app.get("/", (req, res) => {
  res.send("ok");
});

// =======================
// WEBHOOK GET (verificação Meta)
// =======================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// =======================
// BRAPI (sem token): cotação
// =======================
async function getQuoteBrapi(tickerRaw) {
  const ticker = (tickerRaw || "").trim().toUpperCase();
  if (!ticker) return null;

  const url = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}`;

  const resp = await axios.get(url, {
    timeout: 15000,
    headers: { Accept: "application/json" },
  });

  const item = resp.data?.results?.[0];
  if (!item || item.regularMarketPrice == null) return null;

  return {
    symbol: item.symbol,
    name: item.shortName || item.longName || item.symbol,
    price: item.regularMarketPrice,
    change: item.regularMarketChange,
    changePercent: item.regularMarketChangePercent,
    currency: item.currency || "BRL",
  };
}

// =======================
// Enviar mensagem WhatsApp
// =======================
async function sendWhatsAppMessage(to, text) {
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const token = process.env.WA_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("Faltou WA_PHONE_NUMBER_ID ou WA_TOKEN no Render.");
  }

  const url = `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`;

  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
}

// =======================
// WEBHOOK POST (receber mensagens)
// =======================
app.post("/webhook", async (req, res) => {
  // responde rápido pra Meta não dar timeout
  res.sendStatus(200);

  try {
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const msg = value?.messages?.[0];

    if (!msg || msg.type !== "text") return;

    const from = msg.from; // wa_id
    const text = msg?.text?.body?.trim();

    if (!text) {
      await sendWhatsAppMessage(from, "Envie um ticker. Ex: PETR4, VALE3, ITUB4.");
      return;
    }

    let ticker = text.toUpperCase().trim();

    // aceita só ticker básico (sem espaços)
    if (!/^[A-Z0-9]{3,10}$/.test(ticker)) {
      await sendWhatsAppMessage(from, "Envie só o ticker (sem espaços). Ex: PETR4");
      return;
    }

    const quote = await getQuoteBrapi(ticker);

    if (!quote) {
      await sendWhatsAppMessage(from, `Não encontrei cotação para ${ticker} na brapi.dev.`);
      return;
    }

    const chg = quote.change != null ? Number(quote.change).toFixed(2) : "0.00";
    const chgPct =
      quote.changePercent != null ? Number(quote.changePercent).toFixed(2) : "0.00";

    const reply =
      `📈 Cotação\n` +
      `Ticker: ${quote.symbol}\n` +
      `Ativo: ${quote.name}\n` +
      `Preço: ${quote.price} ${quote.currency}\n` +
      `Variação: ${chg} (${chgPct}%)`;

    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error("Erro no webhook:", err?.response?.data || err?.message || err);
  }
});

// =======================
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
