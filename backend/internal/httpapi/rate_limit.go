package httpapi

import (
	"net"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	rateLimiterCompactThreshold = 2048
	rateLimiterHardBucketLimit  = 4096
)

type RateLimitConfig struct {
	Enabled  bool
	Requests int
	Window   time.Duration
}

type rateLimiter struct {
	enabled  bool
	requests int
	window   time.Duration

	mu      sync.Mutex
	buckets map[string]rateBucket
}

type rateBucket struct {
	count     int
	resetTime time.Time
	lastSeen  time.Time
}

func WithRateLimit(config RateLimitConfig) Option {
	return func(s *Server) {
		s.limiter.configure(config)
	}
}

func (l *rateLimiter) configure(config RateLimitConfig) {
	l.enabled = config.Enabled
	l.requests = config.Requests
	l.window = config.Window
	if l.requests <= 0 {
		l.requests = 120
	}
	if l.window <= 0 {
		l.window = time.Minute
	}
	if l.buckets == nil {
		l.buckets = make(map[string]rateBucket, 512)
	}
}

func (l *rateLimiter) middleware(now func() time.Time) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !l.enabled || !strings.HasPrefix(r.URL.Path, "/api") {
				next.ServeHTTP(w, r)
				return
			}

			key := rateLimitKey(r)
			if key == "" {
				key = "unknown"
			}

			current := now()
			allowed, retryAfterSeconds := l.allow(key, current)
			if !allowed {
				w.Header().Set("Retry-After", strconv.Itoa(retryAfterSeconds))
				writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func rateLimitKey(r *http.Request) string {
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil && host != "" {
		return host
	}
	return strings.TrimSpace(r.RemoteAddr)
}

func (l *rateLimiter) allow(key string, now time.Time) (bool, int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	bucket, ok := l.buckets[key]
	if !ok || now.After(bucket.resetTime) {
		bucket = rateBucket{
			count:     1,
			resetTime: now.Add(l.window),
			lastSeen:  now,
		}
		l.buckets[key] = bucket
		l.compact(now)
		return true, 0
	}

	if bucket.count >= l.requests {
		retry := int(bucket.resetTime.Sub(now).Seconds())
		if retry < 1 {
			retry = 1
		}
		return false, retry
	}

	bucket.count++
	bucket.lastSeen = now
	l.buckets[key] = bucket
	return true, 0
}

func (l *rateLimiter) compact(now time.Time) {
	if len(l.buckets) < rateLimiterCompactThreshold {
		return
	}
	for key, bucket := range l.buckets {
		if now.After(bucket.resetTime) {
			delete(l.buckets, key)
		}
	}
	if len(l.buckets) <= rateLimiterHardBucketLimit {
		return
	}

	type seenBucket struct {
		key      string
		lastSeen time.Time
	}
	candidates := make([]seenBucket, 0, len(l.buckets))
	for key, bucket := range l.buckets {
		candidates = append(candidates, seenBucket{key: key, lastSeen: bucket.lastSeen})
	}
	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].lastSeen.Before(candidates[j].lastSeen)
	})

	for i := 0; i < len(candidates) && len(l.buckets) > rateLimiterHardBucketLimit; i++ {
		delete(l.buckets, candidates[i].key)
	}
}
