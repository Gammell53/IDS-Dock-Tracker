package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"backend_2/internal/database"
	"backend_2/internal/handlers"
	ws "backend_2/internal/websocket"

	"github.com/gorilla/mux"
)

func main() {
	// Get port from environment variable
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // default port
	}

	// Get database connection string from environment variables
	dbConnStr := os.Getenv("DATABASE_URL")
	if dbConnStr == "" {
		log.Fatal("DATABASE_URL environment variable not set")
	}

	// Initialize the database with the connection string
	db, err := database.NewDB(dbConnStr)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	if err := db.InitializeDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// Initialize the WebSocket hub with the database
	hub := ws.NewHub(db)
	go hub.Run()

	// Create a new router
	router := mux.NewRouter()

	// Initialize handlers
	h := handlers.NewHandler(db, hub)

	// Register handlers
	h.RegisterRoutes(router)

	// Start the server with graceful shutdown
	srv := &http.Server{
		Handler:      router,
		Addr:         ":" + port,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start server: %v", err)
		}
	}()

	// Wait for interrupt signal to gracefully shut down the server
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*10)
	defer cancel()

	if err := srv.Shutdown(ctx); err != nil {
		log.Fatalf("Server forced to shutdown: %v", err)
	}

	log.Println("Server exiting")
}
