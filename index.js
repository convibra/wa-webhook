app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.Cebola_#197a!hfdcjufpg$w) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});
