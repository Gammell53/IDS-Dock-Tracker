package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"

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
	// Set CORS headers
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

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
		// Get token from Authorization header
		token := r.Header.Get("Authorization")
		if token == "" {
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

	var update struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	dock, err := h.db.UpdateDockStatus(id, models.DockStatus(update.Status))
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Broadcast the update to all connected clients
	go h.hub.BroadcastUpdate(*dock)

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

func (h *Handler) RegisterRoutes(r *mux.Router) {
	// Auth routes
	r.HandleFunc("/token", h.HandleToken).Methods("POST")
	r.HandleFunc("/ws", h.HandleWebSocket)

	// Protected routes
	api := r.PathPrefix("/").Subrouter()
	api.Use(h.AuthMiddleware)

	api.HandleFunc("/docks", h.GetAllDocks).Methods("GET")
	api.HandleFunc("/docks/{id}", h.UpdateDockStatus).Methods("PUT")
	// Add other routes as needed
}
