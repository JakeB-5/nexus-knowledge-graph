import type { WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import type { PresenceInfo } from "@nexus/shared";

interface Connection {
  id: string;
  ws: WebSocket;
  token: string;
  userId?: string;
  presence?: PresenceInfo;
  joinedAt: number;
}

export class ConnectionManager {
  private connections = new Map<string, Connection>();
  private userConnections = new Map<string, Set<string>>();

  add(ws: WebSocket, token: string): string {
    const id = randomUUID();
    this.connections.set(id, {
      id,
      ws,
      token,
      joinedAt: Date.now(),
    });
    return id;
  }

  remove(id: string): void {
    const conn = this.connections.get(id);
    if (!conn) return;

    if (conn.userId) {
      const userConns = this.userConnections.get(conn.userId);
      if (userConns) {
        userConns.delete(id);
        if (userConns.size === 0) {
          this.userConnections.delete(conn.userId);
        }
      }
    }

    this.connections.delete(id);
  }

  get(id: string): Connection | undefined {
    return this.connections.get(id);
  }

  setUserId(connectionId: string, userId: string): void {
    const conn = this.connections.get(connectionId);
    if (!conn) return;

    conn.userId = userId;
    const userConns = this.userConnections.get(userId) ?? new Set();
    userConns.add(connectionId);
    this.userConnections.set(userId, userConns);
  }

  updatePresence(connectionId: string, presence: PresenceInfo): void {
    const conn = this.connections.get(connectionId);
    if (conn) {
      conn.presence = presence;
    }
  }

  getPresenceForNode(nodeId: string): PresenceInfo[] {
    const result: PresenceInfo[] = [];
    for (const conn of this.connections.values()) {
      if (conn.presence?.nodeId === nodeId) {
        result.push(conn.presence);
      }
    }
    return result;
  }

  broadcast(message: unknown, exclude?: string): void {
    const data = JSON.stringify(message);
    for (const [id, conn] of this.connections) {
      if (id !== exclude && conn.ws.readyState === 1) {
        conn.ws.send(data);
      }
    }
  }

  broadcastToNode(nodeId: string, message: unknown, exclude?: string): void {
    const data = JSON.stringify(message);
    for (const [id, conn] of this.connections) {
      if (id !== exclude && conn.presence?.nodeId === nodeId && conn.ws.readyState === 1) {
        conn.ws.send(data);
      }
    }
  }

  get connectionCount(): number {
    return this.connections.size;
  }
}
