package httpapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

const maxAssistantRequestBody = 1 << 20 // 1 MiB

// decodeJSONBody decodes and validates a JSON payload against the destination struct.
func decodeJSONBody(r *http.Request, dst any) error {
	return decodeJSONBodyWithDebug(r, dst, false)
}

// decodeJSONBodyWithDebug decodes strict JSON and optionally returns detailed decode errors.
func decodeJSONBodyWithDebug(r *http.Request, dst any, debug bool) error {
	limited := io.LimitReader(r.Body, maxAssistantRequestBody)
	decoder := json.NewDecoder(limited)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return invalidJSONError(err, debug)
	}

	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); err != io.EOF {
		return invalidJSONError(err, debug)
	}
	return nil
}

// invalidJSONError normalizes decode failures for public API responses.
func invalidJSONError(err error, debug bool) error {
	if !debug {
		return errors.New("invalid JSON body")
	}
	return fmt.Errorf("invalid JSON body: %w", err)
}

// decodeJSONBody decodes JSON using verbosity based on the current runtime mode.
func (s *Server) decodeJSONBody(r *http.Request, dst any) error {
	return decodeJSONBodyWithDebug(r, dst, s.runtime.Mode != "prod")
}

// writeJSON writes a JSON response with a stable content type.
func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	encoder := json.NewEncoder(w)
	encoder.SetEscapeHTML(false)
	_ = encoder.Encode(payload)
}

// writeError writes API errors using the canonical {"error": "..."} shape.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// attachStatic serves dist assets and SPA fallback when a built frontend exists.
func attachStatic(r chi.Router, distDir string) {
	indexFile := filepath.Join(distDir, "index.html")
	if _, err := os.Stat(indexFile); err != nil {
		return
	}

	fileServer := http.FileServer(http.Dir(distDir))
	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		if isAPIPath(req.URL.Path) {
			writeError(w, http.StatusNotFound, "Not found")
			return
		}

		trimmed := strings.TrimPrefix(req.URL.Path, "/")
		if trimmed == "" {
			http.ServeFile(w, req, indexFile)
			return
		}

		candidate := filepath.Join(distDir, filepath.Clean(trimmed))
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, req)
			return
		}

		http.ServeFile(w, req, indexFile)
	})
}
