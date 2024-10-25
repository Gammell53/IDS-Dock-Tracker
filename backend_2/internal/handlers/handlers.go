package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"

	"backend_2/internal/database"
	"backend_2/internal/models"
	ws "backend_2/internal/websocket" // Alias to avoid conflict

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

type Handler struct {
	db  *database.DB
	hub *ws.Hub // Use alias to avoid conflict
}

func NewHandler(db *database.DB, hub *ws.Hub) *Handler {
	return &Handler{db: db, hub: hub}
}

func (h *Handler) HandleToken(w http.ResponseWriter, r *http.Request) {
	// Get the origin from the request
	origin := r.Header.Get("Origin")

	// Allow both development and production origins
	allowedOrigins := map[string]bool{
		"http://localhost:3000": true,
		"https://idsdock.com":   true,
	}

	// If the origin is allowed, set it in the response header
	if allowedOrigins[origin] {
		w.Header().Set("Access-Control-Allow-Origin", origin)
	}

	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	// Handle preflight request
	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Set content type
	w.Header().Set("Content-Type", "application/json")

	var creds struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&creds); err != nil {
		log.Printf("Error decoding credentials: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	log.Printf("Login attempt for user: %s", creds.Username)

	// For now, just check if it matches our hardcoded admin user
	if creds.Username == "admin" && creds.Password == "admin" {
		response := map[string]interface{}{
			"success": true,
			"token":   "your_jwt_token_here", // In production, generate a real JWT
			"user": map[string]interface{}{
				"username": creds.Username,
				"role":     "admin",
			},
		}

		if err := json.NewEncoder(w).Encode(response); err != nil {
			log.Printf("Error encoding response: %v", err)
			http.Error(w, "Internal server error", http.StatusInternalServerError)
		}
		return
	}

	// Invalid credentials
	w.WriteHeader(http.StatusUnauthorized)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"success": false,
		"message": "Invalid credentials",
	})
}

func (h *Handler) AuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("Received request for %s", r.URL.Path)
		log.Printf("Authorization header: %s", r.Header.Get("Authorization"))

		// Get token from Authorization header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// Expected format: "Bearer <token>"
		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			http.Error(w, "Unauthorized", http.StatusUnauthorized)
			return
		}

		// For now, just check if token exists
		// In production, validate the JWT token

		next.ServeHTTP(w, r)
	})
}

func (h *Handler) GetAllDocks(w http.ResponseWriter, r *http.Request) {
	docks, err := h.db.GetAllDocks()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(docks)
}

func (h *Handler) UpdateDockStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid dock ID", http.StatusBadRequest)
		return
	}

	var payload struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	dock, err := h.db.UpdateDockStatus(id, models.DockStatus(payload.Status))
	if err != nil {
		if strings.Contains(err.Error(), "no dock found") {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	// Broadcast the update to all connected clients
	h.hub.BroadcastUpdate(*dock)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dock)
}

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // Adjust for your origin policy
	},
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Failed to upgrade WebSocket connection: %v", err)
		http.Error(w, "Failed to upgrade WebSocket connection", http.StatusInternalServerError)
		return
	}

	client := &ws.Client{ // Use alias to avoid conflict
		ID:   r.RemoteAddr,
		Conn: conn,
		Hub:  h.hub,
	}

	h.hub.Register <- client

	go client.ReadPump()
	go client.WritePump()
}

func CORSMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Get the origin from the request
		origin := r.Header.Get("Origin")

		// Allow both development and production origins
		allowedOrigins := map[string]bool{
			"http://localhost:3000": true,
			"https://idsdock.com":   true,
		}

		// If the origin is allowed, set it in the response header
		if allowedOrigins[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}

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

func (h *Handler) RegisterRoutes(router *mux.Router) {
	// Apply CORS middleware to all routes
	router.Use(CORSMiddleware)

	// Auth routes
	router.HandleFunc("/api/token", h.HandleToken).Methods("POST", "OPTIONS")
	router.HandleFunc("/ws", h.HandleWebSocket)

	// Protected routes
	api := router.PathPrefix("/api").Subrouter()
	api.Use(h.AuthMiddleware)

	api.HandleFunc("/docks", h.GetAllDocks).Methods("GET", "OPTIONS")
	api.HandleFunc("/docks/{id}/status", h.UpdateDockStatus).Methods("PUT", "OPTIONS")
	// Remove duplicate or conflicting routes
}
