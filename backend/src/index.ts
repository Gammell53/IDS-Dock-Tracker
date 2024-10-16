import { dirname } from 'path';
import { fileURLToPath } from 'url';

// Add this at the top of your file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { swagger } from "@elysiajs/swagger";
import sqlite3 from "sqlite3";
import { config } from "dotenv";

// Load environment variables
config();

// Set up logging
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
};

// Secret key to sign JWT tokens
// const SECRET_KEY = process.env.SECRET_KEY;
// if (!SECRET_KEY) {
//   logger.error("SECRET_KEY is not set. Please set it in the environment variables.");
//   process.exit(1);
// }

const ACCESS_TOKEN_EXPIRE_MINUTES = 10080;  // 7 days * 24 hours * 60 mins

// Database setup
const db = new sqlite3.Database("docks.db");

// Simple in-memory cache
class SimpleCache {
  private cache: Map<string, { data: any; expiry: number }> = new Map();

  get(key: string): any | null {
    const item = this.cache.get(key);
    if (item && item.expiry > Date.now()) {
      return item.data;
    }
    return null;
  }

  set(key: string, data: any, ttlSeconds: number): void {
    this.cache.set(key, { data, expiry: Date.now() + ttlSeconds * 1000 });
  }
}

const cache = new SimpleCache();

// WebSocket connections store
class ConnectionManager {
  private connections: Map<string, WebSocket> = new Map();
  private messageQueues: Map<string, string[]> = new Map();
  private MAX_CONNECTIONS = 1000;
  private HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private HEARTBEAT_TIMEOUT = 5000; // 5 seconds
  private QUEUE_CLEANUP_INTERVAL = 3600000; // 1 hour
  private MAX_QUEUE_AGE = 86400000; // 24 hours
  private FULL_SYNC_INTERVAL = 300000; // 5 minutes

  constructor() {
    setInterval(() => this.cleanupQueues(), this.QUEUE_CLEANUP_INTERVAL);
    setInterval(() => this.periodicFullSync(), this.FULL_SYNC_INTERVAL);
  }

  connect(ws: WebSocket): string {
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      return '';
    }
    const id = this.generateUniqueId();
    this.connections.set(id, ws);
    this.setupHeartbeat(ws, id);
    
    // Send queued messages if any
    const queue = this.messageQueues.get(id) || [];
    queue.forEach(message => ws.send(message));
    this.messageQueues.delete(id);

    return id;
  }

  disconnect(id: string) {
    const ws = this.connections.get(id);
    if (ws) {
      // @ts-ignore
      clearInterval(ws.heartbeatInterval);
      // @ts-ignore
      clearTimeout(ws.heartbeatTimeout);
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    this.connections.delete(id);
    // Keep the message queue for potential reconnection
  }

  private setupHeartbeat(ws: WebSocket, id: string) {
    // @ts-ignore
    ws.isAlive = true;
    // @ts-ignore
    ws.heartbeatInterval = setInterval(() => {
      if (// @ts-ignore
          !ws.isAlive) {
        logger.warn(`WebSocket connection ${id} is not alive, terminating`);
        this.disconnect(id);
        return;
      }
      // @ts-ignore
      ws.isAlive = false;
      ws.send(JSON.stringify({ type: "heartbeat" }));
      // @ts-ignore
      ws.heartbeatTimeout = setTimeout(() => {
        logger.warn(`WebSocket heartbeat timeout for ${id}, terminating connection`);
        this.disconnect(id);
      }, this.HEARTBEAT_TIMEOUT);
    }, this.HEARTBEAT_INTERVAL);
  }

  broadcast(message: string) {
    logger.info(`Broadcasting message to ${this.connections.size} connections`);
    for (const [id, ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(message);
          logger.info(`Message sent to connection ${id}`);
        } catch (error) {
          logger.error(`Error broadcasting message to ${id}: ${error}`);
          this.disconnect(id);
        }
      } else {
        logger.warn(`Connection ${id} is not open, disconnecting`);
        this.disconnect(id);
      }
    }
  }

  private queueMessage(id: string, message: string, timestamp: number) {
    if (!this.messageQueues.has(id)) {
      this.messageQueues.set(id, []);
    }
    this.messageQueues.get(id)!.push(JSON.stringify({ message, timestamp }));
  }

  private cleanupQueues() {
    const now = Date.now();
    for (const [id, queue] of this.messageQueues) {
      const filteredQueue = queue.filter(item => {
        const { timestamp } = JSON.parse(item);
        return now - timestamp < this.MAX_QUEUE_AGE;
      });
      if (filteredQueue.length === 0) {
        this.messageQueues.delete(id);
      } else {
        this.messageQueues.set(id, filteredQueue);
      }
    }
  }

  async sendFullSync(ws: WebSocket) {
    try {
      const docks = await fetchAllDocks();
      const fullSyncMessage = JSON.stringify({
        type: "full_sync",
        docks: docks,
        timestamp: Date.now()
      });
      ws.send(fullSyncMessage);
      logger.info(`Full sync sent to a connection`);
    } catch (error) {
      logger.error(`Error sending full sync: ${error}`);
    }
  }

  private generateUniqueId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private async periodicFullSync() {
    try {
      const docks = await fetchAllDocks();
      const fullSyncMessage = JSON.stringify({
        type: "full_sync",
        docks: docks,
        timestamp: Date.now()
      });
      this.broadcast(fullSyncMessage);
      logger.info("Periodic full sync completed");
    } catch (error) {
      logger.error(`Error during periodic full sync: ${error}`);
    }
  }
}

const manager = new ConnectionManager();

// Initialize database
function initDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(`
      CREATE TABLE IF NOT EXISTS docks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location TEXT NOT NULL,
        number INTEGER NOT NULL,
        status TEXT NOT NULL,
        name TEXT
      )
    `, (err) => {
      if (err) {
        logger.error(`Error creating table: ${err}`);
        reject(err);
        return;
      }

      db.get("SELECT COUNT(*) as count FROM docks", (err, row: { count: number }) => {
        if (err) {
          logger.error(`Error counting docks: ${err}`);
          reject(err);
          return;
        }

        if (row.count === 0) {
          logger.info("No existing docks found. Initializing docks...");
          const southeastDocks = Array.from({ length: 13 }, (_, i) => 
            ({ location: 'southeast', number: i + 1, status: 'available' })
          );
          const southwestDockNames = ['H84', 'H86', 'H87', 'H89', 'H90', 'H92', 'H93', 'H95', 'H96', 'H98', 'H99'];
          const southwestDocks = southwestDockNames.map((name, i) => 
            ({ location: 'southwest', number: i + 1, status: 'available', name: name })
          );
          
          const stmt = db.prepare("INSERT INTO docks (location, number, status, name) VALUES (?, ?, ?, ?)");
          db.serialize(() => {
            [...southeastDocks, ...southwestDocks].forEach(dock => {
              stmt.run(dock.location, dock.number, dock.status, dock.name);
            });
            stmt.finalize();
            logger.info(`Initialized ${southeastDocks.length + southwestDocks.length} docks.`);
            resolve();
          });
        } else {
          logger.info(`Found ${row.count} existing docks in the database.`);
          resolve();
        }
      });
    });
  });
}

function fetchAllDocks(): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all("SELECT * FROM docks", (err, rows) => {
      if (err) {
        reject(err);
      } else {
        cache.set('all_docks', rows, 60); // Cache for 60 seconds
        resolve(rows);
      }
    });
  });
}

// Elysia app
const app = new Elysia()
  .use(cors({
    origin: (origin) => {
      logger.info(`Received request with origin: ${JSON.stringify(origin)}`);
      if (origin === null || origin === undefined) {
        logger.warn('Origin is null or undefined');
        return true;
      }
      if (typeof origin !== 'string') {
        logger.warn(`Origin is not a string: ${typeof origin}`);
        return false;
      }
      const allowed = origin.includes('idsdock.com') || origin.includes('localhost');
      logger.info(`Origin ${origin} is ${allowed ? 'allowed' : 'not allowed'}`);
      return allowed;
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  }))
  .use(swagger())
  .use(jwt({
    name: 'jwt',
    secret: SECRET_KEY,
  }))
  .onStart(async () => {
    await initDb();
    logger.info("Application startup: Database initialized");
  })
  .post("/api/token", async ({ body, jwt }) => {
    const { username, password } = body;
    
    logger.info(`Login attempt for user: ${username}`);
    
    // TODO: Implement actual user authentication logic
    if (username === "deicer" && password === "deicer") {
      const token = await jwt.sign({ username });
      logger.info(`Login successful for user: ${username}`);
      return { access_token: token };
    } else {
      logger.warn(`Login failed for user: ${username}`);
      throw new Error("Invalid username or password");
    }
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    })
  })
  .get("/api/docks", async ({ set }) => {
    try {
      const cachedDocks = cache.get('all_docks');
      if (cachedDocks) return cachedDocks;

      return await fetchAllDocks();
    } catch (error) {
      logger.error(`Error fetching docks: ${error}`);
      set.status = 500;
      return { error: "Internal server error", details: (error as Error).message };
    }
  })
  .put("/api/docks/:id", async ({ params, body, jwt }) => {
    const { id } = params;
    const { status } = body;
    
    return new Promise((resolve, reject) => {
      db.run("UPDATE docks SET status = ? WHERE id = ?", [status, id], function(err) {
        if (err) {
          reject(err);
        } else if (this.changes === 0) {
          reject(new Error("Dock not found"));
        } else {
          db.get("SELECT * FROM docks WHERE id = ?", [id], (err, row) => {
            if (err) {
              reject(err);
            } else {
              const updateMessage = JSON.stringify({
                type: "dock_updated",
                data: row
              });
              
              logger.info(`Broadcasting dock update for dock ${id}`);
              manager.broadcast(updateMessage);
              cache.set('all_docks', null, 0); // Invalidate cache
              
              resolve(row);
            }
          });
        }
      });
    });
  }, {
    params: t.Object({
      id: t.Numeric(),
    }),
    body: t.Object({
      status: t.String(),
    })
  })
  .ws("/ws", {
    open: (ws) => {
      const id = manager.connect(ws);
      if (id) {
        logger.info(`New WebSocket connection established with ID: ${id}`);
        // @ts-ignore
        ws.id = id;
        manager.sendFullSync(ws);
      } else {
        ws.close(1013, "Maximum connections reached");
      }
    },
    message: (ws, message) => {
      try {
        if (typeof message !== 'string') {
          throw new Error('Received non-string message');
        }
        const data = JSON.parse(message);
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
          // @ts-ignore
          ws.isAlive = true;
        } else if (data.type === "heartbeat-ack") {
          // @ts-ignore
          ws.isAlive = true;
          // @ts-ignore
          clearTimeout(ws.heartbeatTimeout);
        } else if (data.type === "request_full_sync") {
          logger.info("Received request for full sync");
          manager.sendFullSync(ws);
        }
      } catch (error) {
        logger.error(`Error processing WebSocket message: ${error}`);
      }
    },
    close: (ws) => {
      // @ts-ignore
      manager.disconnect(ws.id);
      logger.info(`WebSocket connection closed for ID: ${ws.id}`);
    },
  })
  .get("/api/debug", () => ({ status: "OK", message: "API is running" }))
  .listen(3001);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);