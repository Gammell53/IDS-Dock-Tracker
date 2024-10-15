package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/dgrijalva/jwt-go"
	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
	_ "github.com/mattn/go-sqlite3"
)

const (
	maxConnections       = 1000
	heartbeatInterval    = 30 * time.Second
	heartbeatTimeout     = 5 * time.Second
	queueCleanupInterval = 1 * time.Hour
	maxQueueAge          = 24 * time.Hour
	fullSyncInterval     = 5 * time.Minute
)

type ConnectionManager struct {
	connections   map[string]*websocket.Conn
	messageQueues map[string][]string
	mu            sync.Mutex
	db            *sql.DB
}

type Dock struct {
	ID       int    `json:"id"`
	Location string `json:"location"`
	Number   int    `json:"number"`
	Status   string `json:"status"`
	Name     string `json:"name"`
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Implement your origin check logic here
		return true
	},
}

var jwtKey = []byte(os.Getenv("JWT_SECRET"))

func NewConnectionManager(db *sql.DB) *ConnectionManager {
	cm := &ConnectionManager{
		connections:   make(map[string]*websocket.Conn),
		messageQueues: make(map[string][]string),
		db:            db,
	}
	go cm.cleanupQueues()
	go cm.periodicFullSync()
	return cm
}

func (cm *ConnectionManager) connect(conn *websocket.Conn) string {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if len(cm.connections) >= maxConnections {
		return ""
	}

	id := generateUniqueID()
	cm.connections[id] = conn

	// Send queued messages if any
	if queue, ok := cm.messageQueues[id]; ok {
		for _, msg := range queue {
			conn.WriteMessage(websocket.TextMessage, []byte(msg))
		}
		delete(cm.messageQueues, id)
	}

	return id
}

func (cm *ConnectionManager) disconnect(id string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	if conn, ok := cm.connections[id]; ok {
		conn.Close()
		delete(cm.connections, id)
	}
}

func (cm *ConnectionManager) broadcast(message string) {
	cm.mu.Lock()
	defer cm.mu.Unlock()

	log.Printf("Broadcasting message to %d connections", len(cm.connections))
	for id, conn := range cm.connections {
		err := conn.WriteMessage(websocket.TextMessage, []byte(message))
		if err != nil {
			log.Printf("Error broadcasting message to %s: %v", id, err)
			cm.disconnect(id)
		} else {
			log.Printf("Message sent to connection %s", id)
		}
	}
}

func (cm *ConnectionManager) cleanupQueues() {
	ticker := time.NewTicker(queueCleanupInterval)
	defer ticker.Stop()

	for range ticker.C {
		cm.mu.Lock()
		now := time.Now()
		for id, queue := range cm.messageQueues {
			var newQueue []string
			for _, msg := range queue {
				var msgData map[string]interface{}
				if err := json.Unmarshal([]byte(msg), &msgData); err == nil {
					if timestamp, ok := msgData["timestamp"].(float64); ok {
						msgTime := time.Unix(int64(timestamp), 0)
						if now.Sub(msgTime) < maxQueueAge {
							newQueue = append(newQueue, msg)
						}
					}
				}
			}
			if len(newQueue) == 0 {
				delete(cm.messageQueues, id)
			} else {
				cm.messageQueues[id] = newQueue
			}
		}
		cm.mu.Unlock()
	}
}

func (cm *ConnectionManager) periodicFullSync() {
	ticker := time.NewTicker(fullSyncInterval)
	defer ticker.Stop()

	for range ticker.C {
		docks, err := cm.fetchAllDocks()
		if err != nil {
			log.Printf("Error during periodic full sync: %v", err)
			continue
		}

		fullSyncMessage, err := json.Marshal(map[string]interface{}{
			"type":      "full_sync",
			"docks":     docks,
			"timestamp": time.Now().Unix(),
		})
		if err != nil {
			log.Printf("Error marshaling full sync message: %v", err)
			continue
		}

		cm.broadcast(string(fullSyncMessage))
		log.Println("Periodic full sync completed")
	}
}

func (cm *ConnectionManager) fetchAllDocks() ([]Dock, error) {
	rows, err := cm.db.Query("SELECT id, location, number, status, name FROM docks")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docks []Dock
	for rows.Next() {
		var d Dock
		if err := rows.Scan(&d.ID, &d.Location, &d.Number, &d.Status, &d.Name); err != nil {
			return nil, err
		}
		docks = append(docks, d)
	}

	return docks, nil
}

func generateUniqueID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}

func handleWebSocket(cm *ConnectionManager, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Error upgrading to WebSocket:", err)
		return
	}

	id := cm.connect(conn)
	if id == "" {
		conn.Close()
		return
	}

	log.Printf("New WebSocket connection established with ID: %s", id)

	// Send initial full sync
	docks, err := cm.fetchAllDocks()
	if err != nil {
		log.Printf("Error fetching docks for full sync: %v", err)
	} else {
		fullSyncMessage, _ := json.Marshal(map[string]interface{}{
			"type":      "full_sync",
			"docks":     docks,
			"timestamp": time.Now().Unix(),
		})
		conn.WriteMessage(websocket.TextMessage, fullSyncMessage)
	}

	defer cm.disconnect(id)

	for {
		_, message, err := conn.ReadMessage()
		if err != nil {
			log.Printf("Error reading message: %v", err)
			break
		}

		var data map[string]interface{}
		if err := json.Unmarshal(message, &data); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		switch data["type"] {
		case "ping":
			conn.WriteMessage(websocket.TextMessage, []byte(`{"type":"pong"}`))
		case "request_full_sync":
			docks, err := cm.fetchAllDocks()
			if err != nil {
				log.Printf("Error fetching docks for full sync: %v", err)
			} else {
				fullSyncMessage, _ := json.Marshal(map[string]interface{}{
					"type":      "full_sync",
					"docks":     docks,
					"timestamp": time.Now().Unix(),
				})
				conn.WriteMessage(websocket.TextMessage, fullSyncMessage)
			}
		}
	}
}

func (cm *ConnectionManager) updateDockStatus(id int, status string) error {
	_, err := cm.db.Exec("UPDATE docks SET status = ? WHERE id = ?", status, id)
	if err != nil {
		return err
	}

	dock, err := cm.fetchDock(id)
	if err != nil {
		return err
	}

	updateMessage, err := json.Marshal(map[string]interface{}{
		"type": "dock_updated",
		"data": dock,
	})
	if err != nil {
		return err
	}

	cm.broadcast(string(updateMessage))
	return nil
}

func (cm *ConnectionManager) fetchDock(id int) (*Dock, error) {
	var dock Dock
	err := cm.db.QueryRow("SELECT id, location, number, status, name FROM docks WHERE id = ?", id).Scan(
		&dock.ID, &dock.Location, &dock.Number, &dock.Status, &dock.Name)
	if err != nil {
		return nil, err
	}
	return &dock, nil
}

func generateToken(username string) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"username": username,
		"exp":      time.Now().Add(time.Hour * 24 * 7).Unix(), // Token expires in 7 days
	})
	return token.SignedString(jwtKey)
}

func authenticateMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		tokenString := r.Header.Get("Authorization")
		if tokenString == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return jwtKey, nil
		})

		if err != nil || !token.Valid {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	}
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	err := json.NewDecoder(r.Body).Decode(&creds)
	if err != nil {
		http.Error(w, "Bad request", http.StatusBadRequest)
		return
	}

	// TODO: Implement proper authentication logic
	if creds.Username == "deicer" && creds.Password == "deicer" {
		token, err := generateToken(creds.Username)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(map[string]string{"token": token})
	} else {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
	}
}

func handleGetDocks(cm *ConnectionManager) http.HandlerFunc {
	return authenticateMiddleware(func(w http.ResponseWriter, r *http.Request) {
		docks, err := cm.fetchAllDocks()
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(docks)
	})
}

func handleUpdateDockStatus(cm *ConnectionManager) http.HandlerFunc {
	return authenticateMiddleware(func(w http.ResponseWriter, r *http.Request) {
		vars := mux.Vars(r)
		id, err := strconv.Atoi(vars["id"])
		if err != nil {
			http.Error(w, "Invalid dock ID", http.StatusBadRequest)
			return
		}

		var update struct {
			Status string `json:"status"`
		}
		err = json.NewDecoder(r.Body).Decode(&update)
		if err != nil {
			http.Error(w, "Bad request", http.StatusBadRequest)
			return
		}

		err = cm.updateDockStatus(id, update.Status)
		if err != nil {
			http.Error(w, "Internal server error", http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
	})
}

func main() {
	db, err := sql.Open("sqlite3", "docks.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	cm := NewConnectionManager(db)

	r := mux.NewRouter()

	r.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		handleWebSocket(cm, w, r)
	})

	r.HandleFunc("/api/login", handleLogin).Methods("POST")
	r.HandleFunc("/api/docks", handleGetDocks(cm)).Methods("GET")
	r.HandleFunc("/api/docks/{id}", handleUpdateDockStatus(cm)).Methods("PUT")

	// Add CORS middleware
	corsMiddleware := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
			next.ServeHTTP(w, r)
		})
	}

	http.Handle("/", corsMiddleware(r))

	log.Println("Server starting on :8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
