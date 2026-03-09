package auth

import "context"

type Principal struct {
	User     string
	Role     Role
	Provider string
	Subject  string
	Claims   map[string]any
}

type principalContextKey struct{}

func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalContextKey{}, p)
}

func PrincipalFromContext(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalContextKey{}).(Principal)
	return p, ok
}
