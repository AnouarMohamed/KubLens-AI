package auth

import "context"

// Principal is the authenticated caller identity resolved from a request.
type Principal struct {
	User     string
	Role     Role
	Provider string
	Subject  string
	Claims   map[string]any
}

type principalContextKey struct{}

// WithPrincipal stores the authenticated principal in a context.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, p)
}

// PrincipalFromContext returns the principal stored in the context, if present.
func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalContextKey{}).(Principal)
	return p, ok
}
