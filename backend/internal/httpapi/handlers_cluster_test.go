package httpapi

import (
	"testing"

	"kubelens-backend/internal/model"
)

func TestClusterCapacityFromNodesMockDefaults(t *testing.T) {
	got := clusterCapacityFromNodes(nil, false)
	if got.CPU != "34%" || got.Memory != "58%" || got.Storage != "22%" {
		t.Fatalf("unexpected mock defaults: %+v", got)
	}
}

func TestClusterCapacityFromNodesRealAverages(t *testing.T) {
	nodes := []model.NodeSummary{
		{CPUUsage: "25%", MemUsage: "45%"},
		{CPUUsage: "35%", MemUsage: "55%"},
		{CPUUsage: "N/A", MemUsage: "N/A"},
	}

	got := clusterCapacityFromNodes(nodes, true)
	if got.CPU != "30%" {
		t.Fatalf("cpu = %s, want 30%%", got.CPU)
	}
	if got.Memory != "50%" {
		t.Fatalf("memory = %s, want 50%%", got.Memory)
	}
	if got.Storage != "N/A" {
		t.Fatalf("storage = %s, want N/A", got.Storage)
	}
}

func TestParsePercent(t *testing.T) {
	tests := []struct {
		name   string
		input  string
		want   float64
		wantOK bool
	}{
		{name: "normal", input: "42%", want: 42, wantOK: true},
		{name: "trimmed", input: " 17 ", want: 17, wantOK: true},
		{name: "clamped high", input: "150%", want: 100, wantOK: true},
		{name: "empty", input: "", want: 0, wantOK: false},
		{name: "na", input: "N/A", want: 0, wantOK: false},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := parsePercent(tc.input)
			if ok != tc.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tc.wantOK)
			}
			if ok && got != tc.want {
				t.Fatalf("value = %v, want %v", got, tc.want)
			}
		})
	}
}
