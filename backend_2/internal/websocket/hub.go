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
		Broadcast:  make(chan []byte), // Capital B
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
			h.mu.RLock()
			log.Printf("Broadcasting message to %d clients", len(h.clients))
			for id, client := range h.clients {
				if err := client.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
					log.Printf("Error sending message to client %s: %v", id, err)
					client.Conn.Close()
					delete(h.clients, id)
				} else {
					log.Printf("Message sent successfully to client %s", id)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) BroadcastUpdate(dock models.Dock) {
	update := models.DockUpdate{
		Type: "dock_updated",
		Data: dock,
	}

	message, err := json.Marshal(update)
	if err != nil {
		log.Printf("Error marshaling dock update: %v", err)
		return
	}

	log.Printf("Broadcasting dock update to %d clients", len(h.clients))
	h.Broadcast <- message // Capital B
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

	h.Broadcast <- message // Capital B
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()
	c.Conn.SetReadLimit(512)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error { c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second)); return nil })
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("error: %v", err)
			}
			break
		}
		log.Printf("Received message from client %s: %s", c.ID, message)
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.Hub.Broadcast:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
