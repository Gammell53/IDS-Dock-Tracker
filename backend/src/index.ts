import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { swagger } from "@elysiajs/swagger";
import Database from "better-sqlite3";
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
const SECRET_KEY = process.env.SECRET_KEY;
if (!SECRET_KEY) {
  logger.error("SECRET_KEY is not set. Please set it in the environment variables.");
  process.exit(1);
}

const ACCESS_TOKEN_EXPIRE_MINUTES = 10080;  // 7 days * 24 hours * 60 mins

// Database setup with connection pooling
class DatabasePool {
  private pool: Database[];
  private maxConnections: number;

  constructor(dbPath: string, maxConnections: number) {
    this.maxConnections = maxConnections;
    this.pool = Array.from({ length: maxConnections }, () => {
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      return db;
    });
  }

  getConnection(): Database {
    return this.pool[Math.floor(Math.random() * this.maxConnections)];
  }
}

const dbPool = new DatabasePool("docks.db", 10);

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
  private connections: Set<WebSocket> = new Set();
  private MAX_CONNECTIONS = 1000; // Increased max connections

  connect(ws: WebSocket): boolean {
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      return false;
    }
    this.connections.add(ws);
    return true;
  }

  disconnect(ws: WebSocket) {
    this.connections.delete(ws);
  }

  broadcast(message: string) {
    const messageBuffer = Buffer.from(message);
    for (const ws of this.connections) {
      try {
        ws.send(messageBuffer);
      } catch (error) {
        logger.error(`Error broadcasting message: ${error}`);
        this.disconnect(ws);
      }
    }
  }

  async sendFullSync(ws: WebSocket) {
    try {
      const docks = cache.get('all_docks') || await fetchAllDocks();
      ws.send(JSON.stringify({
        type: "full_sync",
        docks: docks
      }));
    } catch (error) {
      logger.error(`Error sending full sync: ${error}`);
    }
  }
}

const manager = new ConnectionManager();

// Initialize database
async function initDb() {
  const db = dbPool.getConnection();
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS docks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location TEXT NOT NULL,
        number INTEGER NOT NULL,
        status TEXT NOT NULL,
        name TEXT
      )
    `);

    const existingDocks = db.prepare("SELECT COUNT(*) as count FROM docks").get() as { count: number };
    if (existingDocks.count === 0) {
      logger.info("No existing docks found. Initializing docks...");
      const southeastDocks = Array.from({ length: 13 }, (_, i) => 
        ({ location: 'southeast', number: i + 1, status: 'available' })
      );
      const southwestDockNames = ['H84', 'H86', 'H87', 'H89', 'H90', 'H92', 'H93', 'H95', 'H96', 'H98', 'H99'];
      const southwestDocks = southwestDockNames.map((name, i) => 
        ({ location: 'southwest', number: i + 1, status: 'available', name: name })
      );
      
      const stmt = db.prepare("INSERT INTO docks (location, number, status, name) VALUES (?, ?, ?, ?)");
      db.transaction(() => {
        [...southeastDocks, ...southwestDocks].forEach(dock => {
          stmt.run(dock.location, dock.number, dock.status, dock.name);
        });
      })();
      logger.info(`Initialized ${southeastDocks.length + southwestDocks.length} docks.`);
    } else {
      logger.info(`Found ${existingDocks.count} existing docks in the database.`);
    }
  } catch (error) {
    logger.error(`Error initializing database: ${error}`);
  }
}

async function fetchAllDocks() {
  const db = dbPool.getConnection();
  const docks = db.prepare("SELECT * FROM docks").all();
  cache.set('all_docks', docks, 60); // Cache for 60 seconds
  return docks;
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
  .onStart(() => {
    initDb();
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
      return { error: "Internal server error" };
    }
  })
  .put("/api/docks/:id", async ({ params, body, jwt }) => {
    const { id } = params;
    const { status } = body;
    
    const db = dbPool.getConnection();
    const result = db.transaction(() => {
      return db.prepare("UPDATE docks SET status = ? WHERE id = ? RETURNING *")
        .get(status, id);
    })() as Dock | undefined;
    
    if (!result) throw new Error("Dock not found");
    
    const updateMessage = JSON.stringify({
      type: "dock_updated",
      data: result
    });
    
    manager.broadcast(updateMessage);
    cache.set('all_docks', null, 0); // Invalidate cache
    
    return result;
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
      if (manager.connect(ws)) {
        manager.sendFullSync(ws);
      } else {
        ws.close(1013, "Maximum connections reached");
      }
    },
    message: (ws, message) => {
      try {
        const data = JSON.parse(message as string);
        if (data.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        } else if (data.type === "request_full_sync") {
          manager.sendFullSync(ws);
        }
      } catch (error) {
        logger.error(`Error processing WebSocket message: ${error}`);
      }
    },
    close: (ws) => {
      manager.disconnect(ws);
    },
  })
  .get("/api/debug", () => ({ status: "OK", message: "API is running" }))
  .listen(3001);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);