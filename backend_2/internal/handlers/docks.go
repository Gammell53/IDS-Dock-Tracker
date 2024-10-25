package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/IDS-Dock-Tracker/backend_2/internal/models"
	"github.com/gorilla/mux"
)

func (h *Handler) UpdateDockStatus(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	dockID, err := strconv.Atoi(vars["id"])
	if err != nil {
		http.Error(w, "Invalid dock ID", http.StatusBadRequest)
		return
	}

	var payload struct {
		Status models.DockStatus `json:"status"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	updatedDock, err := h.db.UpdateDockStatus(dockID, payload.Status)
	if err != nil {
		if strings.Contains(err.Error(), "no dock found") {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updatedDock)
}
