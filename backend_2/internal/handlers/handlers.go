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

func (h *Handler) HandleGetDocks(w http.ResponseWriter, r *http.Request) {
	log.Printf("Received request to get all docks")

	// Set content type header
	w.Header().Set("Content-Type", "application/json")

	docks, err := h.db.GetAllDocks()
	if err != nil {
		log.Printf("Error fetching docks: %v", err)
		http.Error(w, "Failed to fetch docks", http.StatusInternalServerError)
		return
	}

	log.Printf("Returning %d docks", len(docks))
	json.NewEncoder(w).Encode(docks)
}

func (h *Handler) HandleUpdateDock(w http.ResponseWriter, r *http.Request) {
	log.Printf("Received update request for dock: %s", r.URL.Path)

	// Set content type header
	w.Header().Set("Content-Type", "application/json")

	// Parse dock ID from URL
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		log.Printf("Error parsing dock ID: %v", err)
		http.Error(w, "Invalid dock ID", http.StatusBadRequest)
		return
	}

	// Parse request body
	var update struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		log.Printf("Error decoding request body: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Convert string to DockStatus
	dockStatus := models.DockStatus(update.Status)

	log.Printf("Updating dock %d to status: %s", id, dockStatus)

	// Update the dock
	dock, err := h.db.UpdateDockStatus(id, dockStatus)
	if err != nil {
		log.Printf("Error updating dock status: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Broadcast the update
	log.Printf("Broadcasting dock update to all clients")
	h.hub.BroadcastUpdate(*dock)

	// Return the updated dock
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

func (h *Handler) RegisterRoutes(router *mux.Router) {
	router.HandleFunc("/api/token", h.TokenHandler).Methods("POST")
	router.HandleFunc("/api/docks", h.HandleGetDocks).Methods("GET")
	router.HandleFunc("/api/docks/{id}", h.HandleUpdateDock).Methods("PUT")
	router.HandleFunc("/ws", h.HandleWebSocket)
}

func (h *Handler) TokenHandler(w http.ResponseWriter, r *http.Request) {
	// Implement your token generation logic here
	log.Printf("Received request for /api/token")

	// For example purposes, we'll return a simple JSON response
	response := map[string]string{"token": "your_generated_token"}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)
}
