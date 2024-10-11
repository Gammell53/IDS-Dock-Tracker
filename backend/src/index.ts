import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { swagger } from "@elysiajs/swagger";
import { Database } from "bun:sqlite";
import { config } from "dotenv";
import { rateLimit } from '@elysiajs/rate-limit';

// Load environment variables
config();

// Set up logging
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  warn: (message: string) => console.warn(`[WARN] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
};

// Secret key to sign JWT tokens
const SECRET_KEY = process.env.SECRET_KEY || "your_secret_key_here";
if (SECRET_KEY === "your_secret_key_here") {
  logger.warn("Using default SECRET_KEY. This is not secure for production.");
}

const ACCESS_TOKEN_EXPIRE_MINUTES = 10080;  // 7 days * 24 hours * 60 mins

// Database setup
const db = new Database("docks.db");
db.exec(`
  CREATE TABLE IF NOT EXISTS docks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    location TEXT,
    number INTEGER,
    status TEXT,
    name TEXT
  )
`);

// Models
interface Dock {
  id: number;
  location: string;
  number: number;
  status: string;
  name: string;
}

interface DockUpdate {
  status: string;
}

interface User {
  username: string;
}

// WebSocket connections store
class ConnectionManager {
  private connections: Set<WebSocket> = new Set();
  private MAX_CONNECTIONS = 100; // Adjust as needed

  async connect(ws: WebSocket): Promise<boolean> {
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      return false;
    }
    this.connections.add(ws);
    return true;
  }

  disconnect(ws: WebSocket) {
    this.connections.delete(ws);
  }

  async broadcast(message: string) {
    for (const ws of this.connections) {
      try {
        ws.send(message);
      } catch (error) {
        logger.error(`Error broadcasting message: ${error}`);
        this.disconnect(ws);
      }
    }
  }

  async sendFullSync(ws: WebSocket) {
    const docks = db.query("SELECT * FROM docks").all() as Dock[];
    ws.send(JSON.stringify({
      type: "full_sync",
      docks: docks
    }));
  }
}

const manager = new ConnectionManager();

// Initialize database
function initDb() {
  const existingDocks = db.query("SELECT COUNT(*) as count FROM docks").get() as { count: number };
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
}

// Elysia app
const app = new Elysia()
  .use(cors({
    origin: (origin) => {
      logger.info(`Received request with origin: ${JSON.stringify(origin)}`);
      if (origin === null || origin === undefined) {
        logger.warn('Origin is null or undefined');
        return false;
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
  .use(rateLimit({
    duration: 60000, // 1 minute
    max: 100 // max 100 requests per minute
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
      const cachedDocks = await cache.get('all_docks');
      if (cachedDocks) return cachedDocks;

      const conn = await dbPool.getConnection();
      const docks = conn.query("SELECT * FROM docks").all();
      await cache.set('all_docks', docks, 60); // Cache for 60 seconds
      return docks;
    } catch (error) {
      console.error("Error fetching docks:", error);
      set.status = 500;
      return { error: "Internal server error" };
    }
  })
  .put("/api/docks/:id", async ({ params, body, jwt }) => {
    // const payload = await jwt.verify();
    // console.log('put payload - ', payload)
    // if (!payload) throw new Error("Unauthorized");
    
    const { id } = params;
    const { status } = body;
    
    const result = db.query("UPDATE docks SET status = ? WHERE id = ? RETURNING *")
      .get(status, id) as Dock | undefined;
    
    if (!result) throw new Error("Dock not found");
    
    const updateMessage = JSON.stringify({
      type: "dock_updated",
      data: result
    });
    
    await manager.broadcast(updateMessage);
    
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
    open: async (ws) => {
      console.log('ws - open', ws);
      if (await manager.connect(ws)) {
        manager.sendFullSync(ws);
      } else {
        ws.close(1013, "Maximum connections reached");
      }
    },
    message: (ws, message) => {
      console.log('ws - message', ws)
      const data = JSON.parse(message as string);
      if (data.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      } else if (data.type === "request_full_sync") {
        manager.sendFullSync(ws);
      }
    },
    close: (ws) => {
      console.log('ws - close', ws)
      manager.disconnect(ws);
    },
  })
  .get("/api/debug", () => ({ status: "OK", message: "API is running" }))
  .listen(3001);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
