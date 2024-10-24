package database

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"backend_2/internal/models"

	_ "github.com/lib/pq"
)

type DB struct {
	*sql.DB
}

func NewDB(connectionString string) (*DB, error) {
	var db *sql.DB
	var err error

	maxRetries := 5
	for i := 0; i < maxRetries; i++ {
		db, err = sql.Open("postgres", connectionString)
		if err != nil {
			fmt.Printf("Failed to open database connection, attempt %d/%d: %v\n", i+1, maxRetries, err)
			time.Sleep(time.Second * 2)
			continue
		}

		// Try to ping the database
		err = db.Ping()
		if err == nil {
			fmt.Printf("Successfully connected to database on attempt %d\n", i+1)
			break
		}

		fmt.Printf("Failed to ping database, attempt %d/%d: %v\n", i+1, maxRetries, err)
		db.Close() // Close the failed connection before retrying
		time.Sleep(time.Second * 2)
	}

	if err != nil {
		return nil, fmt.Errorf("failed to connect to database after %d attempts: %v", maxRetries, err)
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	return &DB{db}, nil
}

func (db *DB) InitializeDB() error {
	// Create users table first
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			username VARCHAR(50) UNIQUE NOT NULL,
			password_hash VARCHAR(255) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create users table: %v", err)
	}

	// Then create docks table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS docks (
			id SERIAL PRIMARY KEY,
			location VARCHAR(50) NOT NULL,
			number INTEGER NOT NULL,
			status VARCHAR(50) NOT NULL,
			name VARCHAR(50) NOT NULL,
			created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
			UNIQUE(location, number),
			UNIQUE(name)
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create docks table: %v", err)
	}

	// Insert default admin user if it doesn't exist
	_, err = db.Exec(`
		INSERT INTO users (username, password_hash)
		VALUES ($1, $2)
		ON CONFLICT (username) DO NOTHING
	`, "admin", "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy") // password: admin
	if err != nil {
		return fmt.Errorf("failed to create default admin user: %v", err)
	}

	// Insert default docks if they don't exist
	defaultDocks := []struct {
		Location string
		Number   int
		Status   string
		Name     string
	}{
		{"southeast", 1, "available", "SE-1"},
		{"southeast", 2, "available", "SE-2"},
		{"southeast", 3, "available", "SE-3"},
		{"southwest", 1, "available", "SW-1"},
		{"southwest", 2, "available", "SW-2"},
		{"southwest", 3, "available", "SW-3"},
	}

	for _, dock := range defaultDocks {
		_, err = db.Exec(`
			INSERT INTO docks (location, number, status, name)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (location, number) DO NOTHING
		`, dock.Location, dock.Number, dock.Status, dock.Name)
		if err != nil {
			return fmt.Errorf("failed to insert default dock %s: %v", dock.Name, err)
		}
	}

	return nil
}

func (db *DB) GetAllDocks() ([]models.Dock, error) {
	log.Printf("Fetching all docks from database")

	rows, err := db.Query("SELECT id, location, number, status, name FROM docks ORDER BY location, number")
	if err != nil {
		log.Printf("Error querying docks: %v", err)
		return nil, fmt.Errorf("failed to query docks: %v", err)
	}
	defer rows.Close()

	var docks []models.Dock
	for rows.Next() {
		var d models.Dock
		if err := rows.Scan(&d.ID, &d.Location, &d.Number, &d.Status, &d.Name); err != nil {
			log.Printf("Error scanning dock row: %v", err)
			return nil, fmt.Errorf("failed to scan dock: %v", err)
		}
		docks = append(docks, d)
	}

	if err = rows.Err(); err != nil {
		log.Printf("Error iterating rows: %v", err)
		return nil, fmt.Errorf("error iterating rows: %v", err)
	}

	log.Printf("Found %d docks", len(docks))
	return docks, nil
}

func (db *DB) UpdateDockStatus(id int, status models.DockStatus) (*models.Dock, error) {
	result, err := db.Exec(`
		UPDATE docks 
		SET status = $1 
		WHERE id = $2`,
		status, id)
	if err != nil {
		return nil, fmt.Errorf("failed to update dock status: %v", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return nil, fmt.Errorf("error checking rows affected: %v", err)
	}

	if rowsAffected == 0 {
		return nil, fmt.Errorf("no dock found with id: %d", id)
	}

	return db.GetDockByID(id)
}

func (db *DB) GetDockByID(id int) (*models.Dock, error) {
	var dock models.Dock
	err := db.QueryRow(`
		SELECT id, location, number, status, name 
		FROM docks 
		WHERE id = $1`,
		id).Scan(&dock.ID, &dock.Location, &dock.Number, &dock.Status, &dock.Name)
	if err != nil {
		return nil, fmt.Errorf("failed to get dock: %v", err)
	}
	return &dock, nil
}
