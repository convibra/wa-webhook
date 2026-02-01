import express from "express";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// =======================
// CONFIG
// =======================
const ALPHAVANTAGE_API_KEY = "AU7VPMLH6ZI6SVZN";

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
// ALPHA VANTAGE: cotação
// =======================
async function getQuoteAlphaVantage(symbol) {
  const url = "https://www.alphavantage.co/query";

  const response = await axios.get(url, {
    params: {
      function: "GLOBAL_QUOTE",
      symbol: symbol,
      apikey: ALPHAVANTAGE_API_KEY,
    },
    timeout: 15000,
  });

  console.log("Alpha raw:", JSON.stringify(response.data));

  // Rate limit
  if (response.data?.Note || response.data?.Information) {
    return { rateLimited: true };
  }

  const q = response.data["Global Quote"];

  if (!q || !q["05. price"]) return null;

  return {
    symbol: q["01. symbol"],
    price: q["05. price"],
    change: q["09. change"],
    changePercent: q["10. change percent"],
  };
}

// =======================
// Enviar mensagem WhatsApp
// =======================
async function sendWhatsAppMessage(to, text) {
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID;
  const token = process.env.WA_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error("Faltou WA_PHONE_NUMBER_ID ou WA_TOKEN nas variáveis do Render.");
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
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const msg = value?.messages?.[0];
    if (!msg || msg.type !== "text") return;

    const from = msg.from;
    const text = msg?.text?.body?.trim();

    console.log("Mensagem recebida:", JSON.stringify(req.body, null, 2));

    if (!text) {
      await sendWhatsAppMessage(from, "Envie um ticker. Ex: PETR4 ou AAPL");
      return;
    }

    // Normalização do ticker
    let ticker = text.toUpperCase().trim();

    if (!/^[A-Z0-9.]{2,15}$/.test(ticker)) {
      await sendWhatsAppMessage(from, "Envie apenas o ticker. Ex: PETR4 ou AAPL");
      return;
    }

    // 🔑 REGRA IMPORTANTE: se não tiver sufixo, assume B3 (.SA)
    if (!ticker.includes(".")) {
      ticker = ticker + ".SA";
    }

    const quote = await getQuoteAlphaVantage(ticker);

    if (quote?.rateLimited) {
      await sendWhatsAppMessage(
        from,
        "Limite da Alpha Vantage atingido (5/min). Aguarde 1 minuto e tente novamente."
      );
      return;
    }

    if (!quote) {
      await sendWhatsAppMessage(from, `Não encontrei cotação para ${ticker}.`);
      return;
    }

    const reply =
      `📈 Cotação\n` +
      `Ticker: ${quote.symbol}\n` +
      `Preço: ${quote.price}\n` +
      `Variação: ${quote.change} (${quote.changePercent})`;

    await sendWhatsAppMessage(from, reply);
  } catch (err) {
    console.error("Erro no webhook:", err?.response?.data || err?.message || err);
  }
});

// =======================
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
