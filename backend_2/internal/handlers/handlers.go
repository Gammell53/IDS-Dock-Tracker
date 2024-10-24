package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"backend_2/internal/database"
	"backend_2/internal/models"
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
	// Set content type header
	w.Header().Set("Content-Type", "application/json")

	docks, err := h.db.GetAllDocks()
	if err != nil {
		// Return proper JSON error response
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Failed to fetch docks",
		})
		return
	}

	// Return JSON response
	if err := json.NewEncoder(w).Encode(docks); err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "Error encoding response",
		})
		return
	}
}

func (h *Handler) HandleUpdateDock(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	id, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid dock ID", http.StatusBadRequest)
		return
	}

	var update struct {
		Status models.DockStatus `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	dock, err := h.db.UpdateDockStatus(id, update.Status)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Send response
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(dock)

	// Broadcast update
	if h.hub != nil {
		h.hub.BroadcastUpdate(*dock)
	}
}
