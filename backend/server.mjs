import { createServer } from "./src/app.js";
import { HOST, PORT } from "./src/config/env.js";
import { closeDatabase, databaseEngine, ensureDatabase } from "./src/database/database.js";

const server = createServer();

try {
  await ensureDatabase();
} catch (error) {
  console.error("Impossible d'initialiser la base de données.");
  console.error(error);
  process.exit(1);
}

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

server.listen(PORT, HOST, () => {
  console.log("");
  console.log("Serveur démarré avec succès.");
  console.log(`Base     : ${databaseEngine}`);
  console.log(`Site web : http://localhost:${PORT}`);
  console.log(`API      : http://localhost:${PORT}/api/health`);
  console.log("");
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} reçu, arrêt du serveur...`);
  server.close(async (error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
    await closeDatabase().catch((closeError) => console.error(closeError));
    process.exit();
  });
  setTimeout(() => process.exit(1), 15000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
