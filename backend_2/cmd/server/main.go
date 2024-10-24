package main

import (
	"log"
	"net/http"

	"backend_2/internal/database"
	"backend_2/internal/handlers"
	ws "backend_2/internal/websocket"

	"github.com/gorilla/mux"
)

func main() {
	// Initialize the database
	db, err := database.NewDB()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Initialize the WebSocket hub
	hub := ws.NewHub()
	go hub.Run()

	// Create a new router
	router := mux.NewRouter()

	// Initialize handlers
	h := handlers.NewHandler(db, hub)

	// Register handlers
	h.RegisterRoutes(router)

	// Start the server
	log.Println("Starting server on :8080")
	if err := http.ListenAndServe(":8080", router); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
