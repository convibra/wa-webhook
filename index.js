import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

// rota raiz
app.get("/", (req, res) => {
  res.send("ok");
});

// webhook GET (verificação da Meta)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WA_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// webhook POST (mensagens futuras)
app.post("/webhook", express.json(), (req, res) => {
  console.log("Mensagem recebida:", JSON.stringify(req.body, null, 2));
  res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});
