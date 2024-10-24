package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
	_ "github.com/lib/pq"

	"backend_2/internal/database"
	"backend_2/internal/handlers"
	"backend_2/internal/websocket"
)

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Simple authentication for development
	if creds.Username == "deicer" && creds.Password == "deicer" {
		token := "dev_token" // Replace with proper JWT token generation
		json.NewEncoder(w).Encode(map[string]string{"token": token})
	} else {
		http.Error(w, "Invalid credentials", http.StatusUnauthorized)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Set CORS headers for all responses
		w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3000")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Credentials", "true")

		// Handle preflight requests
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func main() {
	// Get database connection details from environment variables
	dbHost := getEnv("DB_HOST", "localhost")
	dbPort := getEnv("DB_PORT", "5432")
	dbUser := getEnv("DB_USER", "postgres")
	dbPassword := getEnv("DB_PASSWORD", "postgres")
	dbName := getEnv("DB_NAME", "docktracker")

	log.Printf("Connecting to PostgreSQL at %s:%s...", dbHost, dbPort)

	// Construct database connection string
	connectionString := fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
		dbHost, dbPort, dbUser, dbPassword, dbName,
	)

	// Initialize database with retry logic
	var db *database.DB
	var err error
	maxRetries := 5
	for i := 0; i < maxRetries; i++ {
		db, err = database.NewDB(connectionString)
		if err == nil {
			break
		}
		log.Printf("Failed to connect to database (attempt %d/%d): %v", i+1, maxRetries, err)
		if i < maxRetries-1 {
			time.Sleep(time.Second * 5)
		}
	}
	if err != nil {
		log.Fatalf("Failed to connect to database after %d attempts: %v", maxRetries, err)
	}
	defer db.Close()

	log.Println("Successfully connected to database")

	// Initialize database schema and default data
	if err := db.InitializeDB(); err != nil {
		log.Fatal("Failed to initialize database:", err)
	}

	// Create and start WebSocket hub
	hub := websocket.NewHub()
	go hub.Run()

	// Initialize handlers
	handler := handlers.NewHandler(db, hub)

	// Create router
	r := mux.NewRouter()

	// Add login endpoint
	r.HandleFunc("/token", handleLogin).Methods("POST", "OPTIONS")

	// API routes
	api := r.PathPrefix("/api").Subrouter()
	api.HandleFunc("/docks", handler.HandleGetDocks).Methods("GET", "OPTIONS")
	api.HandleFunc("/docks/{id}", handler.HandleUpdateDock).Methods("PUT", "OPTIONS")

	// WebSocket endpoint
	r.HandleFunc("/ws", handler.HandleWebSocket)

	// Get port from environment variable or use default
	port := getEnv("PORT", "8080")

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, r); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
