package httpapi

import (
	"strconv"
	"testing"
	"time"
)

func TestRateLimiterHardBucketBound(t *testing.T) {
	var limiter rateLimiter
	limiter.configure(RateLimitConfig{
		Enabled:  true,
		Requests: 10,
		Window:   time.Minute,
	})

	now := time.Now()
	for i := 0; i < rateLimiterHardBucketLimit+800; i++ {
		key := "10.0.0." + strconv.Itoa(i)
		allowed, _ := limiter.allow(key, now)
		if !allowed {
			t.Fatalf("unexpected rate limit rejection at bucket index %d", i)
		}
	}

	limiter.mu.Lock()
	size := len(limiter.buckets)
	limiter.mu.Unlock()

	if size > rateLimiterHardBucketLimit {
		t.Fatalf("bucket size = %d, want <= %d", size, rateLimiterHardBucketLimit)
	}
}
