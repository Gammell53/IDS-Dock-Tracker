package websocket

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"backend_2/internal/models"

	"github.com/gorilla/websocket"
)

type Hub struct {
	clients    map[string]*Client
	mu         sync.RWMutex
	Broadcast  chan []byte // Capital B
	Register   chan *Client
	Unregister chan *Client
}

type Client struct {
	ID   string
	Conn *websocket.Conn
	Hub  *Hub
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		Broadcast:  make(chan []byte), // Capital B
		Register:   make(chan *Client),
		Unregister: make(chan *Client),
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

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				client.Conn.Close()
			}
			h.mu.Unlock()
			log.Printf("Client %s disconnected. Total clients: %d", client.ID, len(h.clients))

		case message := <-h.Broadcast: // Capital B
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
