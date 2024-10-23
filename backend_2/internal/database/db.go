package database

import (
	"backend_2/internal/models"
	"database/sql"
	"fmt"
	"log"
)

type DB struct {
	*sql.DB
}

func NewDB(connectionString string) (*DB, error) {
	db, err := sql.Open("postgres", connectionString)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	return &DB{db}, nil
}

func (db *DB) GetAllDocks() ([]models.Dock, error) {
	rows, err := db.Query("SELECT id, location, number, status, name FROM docks")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var docks []models.Dock
	for rows.Next() {
		var d models.Dock
		if err := rows.Scan(&d.ID, &d.Location, &d.Number, &d.Status, &d.Name); err != nil {
			return nil, err
		}
		docks = append(docks, d)
	}

	return docks, nil
}

func (db *DB) UpdateDockStatus(id int, status models.DockStatus) (*models.Dock, error) {
	// Validate status
	validStatuses := map[models.DockStatus]bool{
		models.StatusAvailable:    true,
		models.StatusOccupied:     true,
		models.StatusOutOfService: true,
		models.StatusDeiced:       true,
	}

	if !validStatuses[status] {
		return nil, fmt.Errorf("invalid status: %s", status)
	}

	// Update the dock status
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

	// Get the updated dock
	var dock models.Dock
	err = db.QueryRow(`
		SELECT id, location, number, status, name 
		FROM docks 
		WHERE id = $1`,
		id).Scan(&dock.ID, &dock.Location, &dock.Number, &dock.Status, &dock.Name)
	if err != nil {
		return nil, fmt.Errorf("failed to get updated dock: %v", err)
	}

	return &dock, nil
}

func (db *DB) InitializeDB() error {
	// Drop existing table if it exists
	_, err := db.Exec(`DROP TABLE IF EXISTS docks`)
	if err != nil {
		return fmt.Errorf("failed to drop table: %v", err)
	}

	// Create table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS docks (
			id SERIAL PRIMARY KEY,
			location VARCHAR(50) NOT NULL,
			number INTEGER NOT NULL,
			status VARCHAR(50) NOT NULL,
			name VARCHAR(50) NOT NULL,
			UNIQUE(location, number),
			UNIQUE(name)
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create docks table: %v", err)
	}

	// Initialize with southwest docks
	southwestDocks := []string{"H84", "H86", "H87", "H89", "H90", "H92", "H93", "H95", "H96", "H98", "H99"}
	for i, name := range southwestDocks {
		_, err := db.Exec(`
			INSERT INTO docks (location, number, status, name) 
			VALUES ($1, $2, $3, $4)`,
			"southwest", i+1, "available", name)
		if err != nil {
			return fmt.Errorf("failed to insert southwest dock %s: %v", name, err)
		}
	}

	// Initialize southeast docks
	for i := 1; i <= 13; i++ {
		_, err := db.Exec(`
			INSERT INTO docks (location, number, status, name) 
			VALUES ($1, $2, $3, $4)`,
			"southeast", i, "available", fmt.Sprintf("Dock %d", i))
		if err != nil {
			return fmt.Errorf("failed to insert southeast dock %d: %v", i, err)
		}
	}

	log.Printf("Successfully initialized database with %d southwest docks and 13 southeast docks", len(southwestDocks))
	return nil
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
