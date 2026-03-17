import { WebSocketServer } from "ws";
import { ConnectionManager } from "./connection-manager.js";
import { MessageHandler } from "./message-handler.js";

const PORT = Number(process.env["WS_PORT"] ?? 3002);

const wss = new WebSocketServer({ port: PORT });
const connectionManager = new ConnectionManager();
const messageHandler = new MessageHandler(connectionManager);

wss.on("connection", (ws, req) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const token = url.searchParams.get("token");

  if (!token) {
    ws.close(4001, "Authentication required");
    return;
  }

  const connectionId = connectionManager.add(ws, token);

  ws.on("message", (data) => {
    try {
      const message = JSON.parse(data.toString());
      messageHandler.handle(connectionId, message);
    } catch {
      ws.send(JSON.stringify({ type: "error", payload: { message: "Invalid JSON" } }));
    }
  });

  ws.on("close", () => {
    connectionManager.remove(connectionId);
  });

  ws.on("error", (err) => {
    console.error(`WebSocket error [${connectionId}]:`, err.message);
    connectionManager.remove(connectionId);
  });

  ws.send(
    JSON.stringify({
      type: "connected",
      payload: { connectionId, timestamp: Date.now() },
    }),
  );
});

console.log(`Nexus WebSocket server running on ws://localhost:${PORT}`);
