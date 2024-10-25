package models

type DockStatus string
type DockLocation string

const (
	StatusAvailable    DockStatus = "available"
	StatusOccupied     DockStatus = "occupied"
	StatusOutOfService DockStatus = "out-of-service"
	StatusDeiced       DockStatus = "deiced"

	LocationSoutheast DockLocation = "southeast"
	LocationSouthwest DockLocation = "southwest"
)

type Dock struct {
	ID       int          `json:"id"`
	Location DockLocation `json:"location"`
	Number   int          `json:"number"`
	Status   DockStatus   `json:"status"`
	Name     string       `json:"name"`
}

type DockUpdate struct {
	Type      string `json:"type"`
	Data      Dock   `json:"data"`
	Timestamp int64  `json:"timestamp"` // Add this field
}

type FullSync struct {
	Type      string `json:"type"`
	Docks     []Dock `json:"docks"`
	Timestamp int64  `json:"timestamp"`
}
