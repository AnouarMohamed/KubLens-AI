package httpapi

import (
	"bytes"
	"context"
	"errors"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"net/http"

	"kubelens-backend/internal/model"
)

const (
	defaultTerminalTimeout = 10 * time.Second
	maxTerminalTimeout     = 30 * time.Second
	maxTerminalCommandLen  = 2000
)

func (s *Server) handleTerminalExec(w http.ResponseWriter, r *http.Request) {
	var req model.TerminalExecRequest
	if err := decodeJSONBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	command := strings.TrimSpace(req.Command)
	if len(command) > maxTerminalCommandLen {
		writeError(w, http.StatusBadRequest, "command is too long")
		return
	}
	if err := s.terminal.validateCommand(command); err != nil {
		if err.Error() == "terminal execution is disabled" {
			writeError(w, http.StatusForbidden, err.Error())
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	cwd, err := resolveTerminalCwd(req.Cwd)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	timeout := toTerminalTimeout(req.TimeoutSeconds)
	result := executeTerminalCommand(r.Context(), command, cwd, timeout)
	result.Stdout = truncateOutput(result.Stdout, s.terminal.maxOutputBytes)
	result.Stderr = truncateOutput(result.Stderr, s.terminal.maxOutputBytes)
	result.Timestamp = s.now().UTC().Format(time.RFC3339)

	writeJSON(w, http.StatusOK, result)
}

func resolveTerminalCwd(input string) (string, error) {
	if strings.TrimSpace(input) == "" {
		return os.Getwd()
	}

	info, err := os.Stat(input)
	if err != nil {
		return "", errors.New("cwd does not exist")
	}
	if !info.IsDir() {
		return "", errors.New("cwd must be a directory")
	}
	return input, nil
}

func toTerminalTimeout(seconds int) time.Duration {
	if seconds <= 0 {
		return defaultTerminalTimeout
	}
	timeout := time.Duration(seconds) * time.Second
	if timeout > maxTerminalTimeout {
		return maxTerminalTimeout
	}
	return timeout
}

func executeTerminalCommand(parent context.Context, command, cwd string, timeout time.Duration) model.TerminalExecResponse {
	ctx, cancel := context.WithTimeout(parent, timeout)
	defer cancel()

	shell, args := shellCommand(command)
	cmd := exec.CommandContext(ctx, shell, args...)
	cmd.Dir = cwd

	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	start := time.Now()
	runErr := cmd.Run()
	duration := time.Since(start)

	exitCode := 0
	if runErr != nil {
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			exitCode = -1
			if stderr.Len() > 0 {
				stderr.WriteString("\n")
			}
			stderr.WriteString("command timed out")
		} else if exitErr, ok := runErr.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			exitCode = -1
			if stderr.Len() > 0 {
				stderr.WriteString("\n")
			}
			stderr.WriteString(runErr.Error())
		}
	}

	return model.TerminalExecResponse{
		Command:    command,
		Cwd:        cwd,
		Stdout:     stdout.String(),
		Stderr:     stderr.String(),
		ExitCode:   exitCode,
		DurationMs: duration.Milliseconds(),
	}
}

func shellCommand(command string) (string, []string) {
	if runtime.GOOS == "windows" {
		return "powershell.exe", []string{"-NoProfile", "-NonInteractive", "-Command", command}
	}
	return "sh", []string{"-lc", command}
}

func truncateOutput(value string, maxBytes int) string {
	if maxBytes <= 0 {
		return value
	}
	if len(value) <= maxBytes {
		return value
	}
	const marker = "\n...output truncated...\n"
	if maxBytes <= len(marker) {
		return marker
	}
	return value[:maxBytes-len(marker)] + marker
}
