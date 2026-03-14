package auth

import "testing"

func TestParseRoleClaimStrictMatching(t *testing.T) {
	tests := []struct {
		name string
		raw  any
		want Role
	}{
		{name: "admin exact", raw: "admin", want: RoleAdmin},
		{name: "operator exact", raw: "operator", want: RoleOperator},
		{name: "viewer exact", raw: "viewer", want: RoleViewer},
		{name: "unknown role defaults viewer", raw: "cluster-admin", want: RoleViewer},
		{name: "substring does not escalate", raw: "team-admin-assistant", want: RoleViewer},
		{name: "array takes highest exact role", raw: []any{"viewer", "operator"}, want: RoleOperator},
		{name: "array with mixed unknown and admin", raw: []string{"readers", "admin"}, want: RoleAdmin},
		{name: "empty value defaults viewer", raw: "", want: RoleViewer},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := parseRoleClaim(tc.raw)
			if got != tc.want {
				t.Fatalf("parseRoleClaim(%v) = %v, want %v", tc.raw, got, tc.want)
			}
		})
	}
}
