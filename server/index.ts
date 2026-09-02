import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { attachWebSocketServer } from "./ws-handler";

const port = parseInt(process.env.PORT ?? "3000", 10);
const dev = process.env.NODE_ENV !== "production";
const app = next({ dev, turbopack: dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const parsedUrl = parse(req.url ?? "", true);
    handle(req, res, parsedUrl);
  });

  attachWebSocketServer(server);

  server.listen(port, () => {
    if (dev) {
      console.log("");
      console.log("  ╔══════════════════════════════════════════════════╗");
      console.log("  ║  DEV MODE — live reload enabled                  ║");
      console.log("  ║  UI updates automatically · no refresh needed    ║");
      console.log("  ║  Use npm run dev (not npm run start) while coding ║");
      console.log("  ╚══════════════════════════════════════════════════╝");
      console.log("");
    } else {
      console.log("");
      console.log("  ⚠  PRODUCTION mode — code changes need: npm run build");
      console.log("");
    }
    console.log(`> Typing Race ready on http://localhost:${port}`);
    console.log(`> WebSocket: ws://localhost:${port}/ws/{room_id}`);
  });
});
