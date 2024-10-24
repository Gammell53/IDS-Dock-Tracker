package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"backend_2/internal/database"
	ws "backend_2/internal/websocket" // Aliased to avoid naming conflict

	"github.com/gorilla/mux"
	"github.com/gorilla/websocket"
)

type Handler struct {
	db  *database.DB
	hub *ws.Hub // Using aliased import
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins in development
	},
}

func NewHandler(db *database.DB, hub *ws.Hub) *Handler {
	return &Handler{
		db:  db,
		hub: hub,
	}
}

func (h *Handler) HandleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("Error upgrading connection: %v", err)
		return
	}

	client := &ws.Client{
		ID:   strconv.FormatInt(time.Now().UnixNano(), 10),
		Conn: conn,
		Hub:  h.hub,
	}

	h.hub.Register <- client

	// Send initial full sync
	docks, err := h.db.GetAllDocks()
	if err != nil {
		log.Printf("Error fetching docks for full sync: %v", err)
		return
	}
	h.hub.BroadcastFullSync(docks)

	// Start reading messages
	for {
		_, _, err := conn.ReadMessage()
		if err != nil {
			h.hub.Unregister <- client
			break
		}
	}
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

	log.Printf("Updating dock %d to status: %s", id, update.Status)

	// Update the dock
	dock, err := h.db.UpdateDockStatus(id, update.Status)
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
