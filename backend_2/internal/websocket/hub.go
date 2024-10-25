package websocket

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"backend_2/internal/database" // Import the correct package for DB
	"backend_2/internal/models"

	"github.com/gorilla/websocket"
)

type Hub struct {
	clients    map[string]*Client
	mu         sync.RWMutex
	Broadcast  chan []byte // Capital B
	Register   chan *Client
	Unregister chan *Client
	db         *database.DB // Use the correct package for DB
}

type Client struct {
	ID   string
	Conn *websocket.Conn
	Hub  *Hub
}

func NewHub(db *database.DB) *Hub { // Use the correct package for DB
	return &Hub{
		clients:    make(map[string]*Client),
		Broadcast:  make(chan []byte, 256), // Add buffer to channel
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
		db:         db,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.Register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("Client %s connected. Total clients: %d", client.ID, len(h.clients))

			// Send full sync on new connection
			docks, err := h.db.GetAllDocks()
			if err != nil {
				log.Printf("Error fetching docks for full sync: %v", err)
				continue
			}
			h.BroadcastFullSync(docks)

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				client.Conn.Close()
			}
			h.mu.Unlock()
			log.Printf("Client %s disconnected. Total clients: %d", client.ID, len(h.clients))

		case message := <-h.Broadcast:
			h.broadcastMessage(message)
		}
	}
}

func (h *Hub) broadcastMessage(message []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()

	log.Printf("Broadcasting message to %d clients: %s", len(h.clients), string(message))

	for id, client := range h.clients {
		go func(clientID string, c *Client, msg []byte) {
			err := c.Conn.WriteMessage(websocket.TextMessage, msg)
			if err != nil {
				log.Printf("Error sending message to client %s: %v", clientID, err)
				h.Unregister <- c
			} else {
				log.Printf("Successfully sent message to client %s", clientID)
			}
		}(id, client, message)
	}
}

func (h *Hub) BroadcastUpdate(dock models.Dock) {
	h.mu.Lock() // Add mutex lock
	defer h.mu.Unlock()

	// First update the database
	updatedDock, err := h.db.GetDockByID(dock.ID)
	if err != nil {
		log.Printf("Error getting updated dock: %v", err)
		return
	}

	update := models.DockUpdate{
		Type:      "dock_updated",
		Data:      *updatedDock,
		Timestamp: time.Now().Unix(),
	}

	message, err := json.Marshal(update)
	if err != nil {
		log.Printf("Error marshaling dock update: %v", err)
		return
	}

	log.Printf("Broadcasting dock update: %s", string(message))
	select {
	case h.Broadcast <- message:
		log.Printf("Successfully queued broadcast message")
	default:
		log.Printf("Warning: Broadcast channel full, message dropped")
	}

	// Send a full sync after update to ensure consistency
	docks, err := h.db.GetAllDocks()
	if err != nil {
		log.Printf("Error fetching docks for full sync: %v", err)
		return
	}
	h.BroadcastFullSync(docks)
}

func (h *Hub) BroadcastFullSync(docks []models.Dock) {
	fullSync := models.FullSync{
		Type:      "full_sync",
		Docks:     docks,
		Timestamp: time.Now().Unix(),
	}

	message, err := json.Marshal(fullSync)
	if err != nil {
		log.Printf("Error marshaling full sync: %v", err)
		return
	}

	log.Printf("Broadcasting full sync: %s", string(message))
	h.Broadcast <- message // Capital B
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
	}()

	c.Conn.SetReadLimit(512)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}

		// Handle incoming messages
		var msg map[string]interface{}
		if err := json.Unmarshal(message, &msg); err != nil {
			log.Printf("Error unmarshaling message: %v", err)
			continue
		}

		// If client requests full sync, send it
		if msgType, ok := msg["type"].(string); ok && msgType == "request_full_sync" {
			docks, err := c.Hub.db.GetAllDocks()
			if err != nil {
				log.Printf("Error fetching docks for full sync: %v", err)
				continue
			}
			c.Hub.BroadcastFullSync(docks)
		}

		log.Printf("Received message from client %s: %s", c.ID, string(message))
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Hub.Unregister <- c
	}()

	for {
		select {
		case <-ticker.C:
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
