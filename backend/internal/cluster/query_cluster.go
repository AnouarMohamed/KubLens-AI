package cluster

import (
	"context"

	"kubelens-backend/internal/model"
)

func (s *Service) ListResources(ctx context.Context, kind string) ([]model.ResourceRecord, error) {
	if s.inMockMode() {
		return s.listMockResources(kind), nil
	}
	return s.listRealResources(ctx, kind)
}
