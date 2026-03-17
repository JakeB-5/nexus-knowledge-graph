import { WS_EVENTS } from "@nexus/shared";
import type { ConnectionManager } from "./connection-manager.js";
import type { WebSocketMessage, PresenceInfo } from "@nexus/shared";

export class MessageHandler {
  constructor(private connections: ConnectionManager) {}

  handle(connectionId: string, message: WebSocketMessage): void {
    switch (message.type) {
      case WS_EVENTS.PRESENCE_UPDATE:
        this.handlePresenceUpdate(connectionId, message.payload as PresenceInfo);
        break;
      case WS_EVENTS.PRESENCE_LEAVE:
        this.handlePresenceLeave(connectionId);
        break;
      case WS_EVENTS.CURSOR_MOVE:
        this.handleCursorMove(connectionId, message);
        break;
      case WS_EVENTS.NODE_UPDATED:
        this.handleNodeUpdate(connectionId, message);
        break;
      default:
        this.sendError(connectionId, `Unknown message type: ${message.type}`);
    }
  }

  private handlePresenceUpdate(connectionId: string, presence: PresenceInfo): void {
    this.connections.updatePresence(connectionId, presence);
    this.connections.broadcastToNode(
      presence.nodeId,
      {
        type: WS_EVENTS.PRESENCE_UPDATE,
        payload: presence,
        timestamp: Date.now(),
      },
      connectionId,
    );
  }

  private handlePresenceLeave(connectionId: string): void {
    const conn = this.connections.get(connectionId);
    if (conn?.presence) {
      this.connections.broadcastToNode(
        conn.presence.nodeId,
        {
          type: WS_EVENTS.PRESENCE_LEAVE,
          payload: { userId: conn.userId },
          timestamp: Date.now(),
        },
        connectionId,
      );
    }
  }

  private handleCursorMove(connectionId: string, message: WebSocketMessage): void {
    const conn = this.connections.get(connectionId);
    if (conn?.presence) {
      this.connections.broadcastToNode(
        conn.presence.nodeId,
        {
          type: WS_EVENTS.CURSOR_MOVE,
          payload: message.payload,
          timestamp: Date.now(),
          senderId: conn.userId,
        },
        connectionId,
      );
    }
  }

  private handleNodeUpdate(connectionId: string, message: WebSocketMessage): void {
    const payload = message.payload as { nodeId: string; changes: unknown };
    this.connections.broadcastToNode(
      payload.nodeId,
      {
        type: WS_EVENTS.NODE_UPDATED,
        payload: payload.changes,
        timestamp: Date.now(),
        senderId: this.connections.get(connectionId)?.userId,
      },
      connectionId,
    );
  }

  private sendError(connectionId: string, message: string): void {
    const conn = this.connections.get(connectionId);
    if (conn && conn.ws.readyState === 1) {
      conn.ws.send(JSON.stringify({ type: "error", payload: { message } }));
    }
  }
}
