import express from "express";

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.send("ok");
});

app.get("/webhook", (req, res) => {
  res.status(200).send("webhook get ok");
});

app.post("/webhook", (req, res) => {
  console.log("Mensagem recebida:", JSON.stringify(req.body));
  res.sendStatus(200);
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log("Servidor rodando na porta", port);
});
