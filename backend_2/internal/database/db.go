package database

import (
	"database/sql"
	"fmt"

	"backend_2/internal/models"

	_ "github.com/lib/pq"
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

func (db *DB) InitializeDB() error {
	_, err := db.Exec(`
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

	return nil
}

func (db *DB) GetAllDocks() ([]models.Dock, error) {
	rows, err := db.Query("SELECT id, location, number, status, name FROM docks")
	if err != nil {
		return nil, fmt.Errorf("failed to query docks: %v", err)
	}
	defer rows.Close()

	var docks []models.Dock
	for rows.Next() {
		var d models.Dock
		if err := rows.Scan(&d.ID, &d.Location, &d.Number, &d.Status, &d.Name); err != nil {
			return nil, fmt.Errorf("failed to scan dock: %v", err)
		}
		docks = append(docks, d)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating rows: %v", err)
	}

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
