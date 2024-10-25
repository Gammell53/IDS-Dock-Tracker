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
	Send chan []byte // Add this line
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
			client.Send = make(chan []byte, 256) // Initialize Send channel
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
				close(client.Send)
				delete(h.clients, client.ID)
				client.Conn.Close()
			}
			h.mu.Unlock()
			log.Printf("Client %s disconnected. Total clients: %d", client.ID, len(h.clients))

		case message := <-h.Broadcast:
			h.mu.RLock()
			log.Printf("Broadcasting message to %d clients", len(h.clients))
			for id, client := range h.clients {
				select {
				case client.Send <- message:
					log.Printf("Message queued for client %s", id)
				default:
					log.Printf("Client %s message buffer full, closing connection", id)
					close(client.Send)
					delete(h.clients, id)
					client.Conn.Close()
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) BroadcastUpdate(dock models.Dock) {
	update := models.DockUpdate{
		Type:      "dock_updated",
		Data:      dock,
		Timestamp: time.Now().Unix(), // Add timestamp
	}

	message, err := json.Marshal(update)
	if err != nil {
		log.Printf("Error marshaling dock update: %v", err)
		return
	}

	h.Broadcast <- message
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
		c.Hub.Unregister <- c
	}()

	for {
		select {
		case message, ok := <-c.Send:
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}

			w.Write(message)

			// Add queued messages
			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write([]byte{'\n'})
				w.Write(<-c.Send)
			}

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
