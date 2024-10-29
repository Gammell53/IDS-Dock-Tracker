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

// Add version control for database schema
func (db *DB) migrateDatabase() error {
	// Create schema_version table if it doesn't exist
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_version (
			version INTEGER PRIMARY KEY,
			applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`)
	if err != nil {
		return fmt.Errorf("failed to create schema_version table: %v", err)
	}

	// Check current version
	var currentVersion int
	err = db.QueryRow("SELECT COALESCE(MAX(version), 0) FROM schema_version").Scan(&currentVersion)
	if err != nil {
		return fmt.Errorf("failed to get schema version: %v", err)
	}

	// Define migrations
	migrations := []struct {
		version int
		up      string
	}{
		{
			version: 1,
			up: `
				DROP TABLE IF EXISTS docks CASCADE;
				DROP TABLE IF EXISTS users CASCADE;
				
				CREATE TABLE users (
					id SERIAL PRIMARY KEY,
					username VARCHAR(50) UNIQUE NOT NULL,
					password_hash VARCHAR(255) NOT NULL,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
				);

				CREATE TABLE docks (
					id SERIAL PRIMARY KEY,
					location VARCHAR(50) NOT NULL,
					number INTEGER NOT NULL,
					status VARCHAR(50) NOT NULL,
					name VARCHAR(50) NOT NULL,
					created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
					updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
					UNIQUE(location, number),
					UNIQUE(name)
				);
			`,
		},
		{
			version: 2,
			up: `
				INSERT INTO users (username, password_hash)
				VALUES ('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy')
				ON CONFLICT (username) DO NOTHING;
			`,
		},
		{
			version: 3,
			up: `
				-- Clear existing docks
				TRUNCATE TABLE docks RESTART IDENTITY;
				
				-- Insert updated dock configurations
				INSERT INTO docks (location, number, status, name) VALUES
				-- Southwest docks
				('southwest', 1, 'available', 'H84'),
				('southwest', 2, 'available', 'H85X'),
				('southwest', 3, 'available', 'H86'),
				('southwest', 4, 'available', 'H87'),
				('southwest', 5, 'available', 'H88X'),
				('southwest', 6, 'available', 'H89'),
				('southwest', 7, 'available', 'H90'),
				('southwest', 8, 'available', 'H91X'),
				('southwest', 9, 'available', 'H92'),
				('southwest', 10, 'available', 'H93'),
				('southwest', 11, 'available', 'H94X'),
				('southwest', 12, 'available', 'H95'),
				('southwest', 13, 'available', 'H96'),
				('southwest', 14, 'available', 'H97X'),
				('southwest', 15, 'available', 'H98'),
				('southwest', 16, 'available', 'H99'),

				-- Southeast docks
				('southeast', 1, 'available', 'Q99'),
				('southeast', 2, 'available', 'Q98'),
				('southeast', 3, 'available', 'Q97'),
				('southeast', 4, 'available', 'Q96'),
				('southeast', 5, 'available', 'Q95'),
				('southeast', 6, 'available', 'Q94'),
				('southeast', 7, 'available', 'Q93'),
				('southeast', 8, 'available', 'Q92'),
				('southeast', 9, 'available', 'Q91X'),
				('southeast', 10, 'available', 'Q90'),
				('southeast', 11, 'available', 'Q89'),
				('southeast', 12, 'available', 'Q88X'),
				('southeast', 13, 'available', 'Q87'),
				('southeast', 14, 'available', 'Q86X');
			`,
		},
	}

	// Apply migrations
	for _, migration := range migrations {
		if migration.version > currentVersion {
			// Start transaction
			tx, err := db.Begin()
			if err != nil {
				return fmt.Errorf("failed to start transaction for version %d: %v", migration.version, err)
			}

			// Apply migration
			_, err = tx.Exec(migration.up)
			if err != nil {
				tx.Rollback()
				return fmt.Errorf("failed to apply migration version %d: %v", migration.version, err)
			}

			// Record migration
			_, err = tx.Exec("INSERT INTO schema_version (version) VALUES ($1)", migration.version)
			if err != nil {
				tx.Rollback()
				return fmt.Errorf("failed to record migration version %d: %v", migration.version, err)
			}

			// Commit transaction
			err = tx.Commit()
			if err != nil {
				return fmt.Errorf("failed to commit migration version %d: %v", migration.version, err)
			}

			log.Printf("Applied migration version %d", migration.version)
		}
	}

	return nil
}

// Update InitializeDB to use migrations
func (db *DB) InitializeDB() error {
	return db.migrateDatabase()
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
