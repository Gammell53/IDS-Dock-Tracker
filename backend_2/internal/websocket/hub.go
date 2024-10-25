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
		Broadcast:  make(chan []byte, 256),  // Increased buffer size
		Register:   make(chan *Client, 256), // Added buffer
		Unregister: make(chan *Client, 256), // Added buffer
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

			// Send full sync to the new client only
			go client.SendFullSync()

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
	clients := make(map[string]*Client, len(h.clients))
	for id, client := range h.clients {
		clients[id] = client
	}
	h.mu.RUnlock()

	log.Printf("Broadcasting message to %d clients", len(clients))

	for id, client := range clients {
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
	// Removed unnecessary mutex lock
	// Database operations are generally thread-safe

	// Fetch the updated dock data
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

	// Send the update to all connected clients
	h.Broadcast <- message

	// Removed the call to BroadcastFullSync()
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

		if msgType, ok := msg["type"].(string); ok && msgType == "request_full_sync" {
			// Send full sync to this client only
			go c.SendFullSync()
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
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				log.Printf("Error sending ping to client %s: %v", c.ID, err)
				return
			}
		}
	}
}

func (c *Client) SendFullSync() {
	docks, err := c.Hub.db.GetAllDocks()
	if err != nil {
		log.Printf("Error fetching docks for full sync: %v", err)
		return
	}

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

	err = c.Conn.WriteMessage(websocket.TextMessage, message)
	if err != nil {
		log.Printf("Error sending full sync to client %s: %v", c.ID, err)
		c.Hub.Unregister <- c
	} else {
		log.Printf("Successfully sent full sync to client %s", c.ID)
	}
}
