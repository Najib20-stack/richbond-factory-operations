import { createServer } from "./src/app.js";
import { PORT } from "./src/config/env.js";

const server = createServer();

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("");
    console.error(`Le port ${PORT} est déjà utilisé.`);
    console.error(`Le site est probablement déjà ouvert ici : http://localhost:${PORT}`);
    console.error("");
    process.exit(1);
  }

  console.error(error);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log("");
  console.log("Serveur démarré avec succès.");
  console.log(`Site web : http://localhost:${PORT}`);
  console.log(`API      : http://localhost:${PORT}/api/health`);
  console.log("");
});
