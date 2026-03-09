package events

import "sync"

const defaultStreamBufferSize = 32

// Event represents a streamable cluster or system event.
type Event struct {
	Type      string `json:"type"`
	Timestamp string `json:"timestamp"`
	Payload   any    `json:"payload"`
}

// Bus provides a lightweight pub/sub fan-out for stream events.
// It drops events when subscribers are slow to avoid backpressure
// on request paths or watcher handlers.
type Bus struct {
	mu     sync.RWMutex
	nextID int
	subs   map[int]chan Event
	buffer int
}

// NewBus constructs a new event bus with a bounded per-subscriber buffer.
func NewBus(buffer int) *Bus {
	if buffer <= 0 {
		// 32 balances burst tolerance and memory use:
		// smaller buffers drop events during short spikes, larger buffers increase per-subscriber footprint.
		buffer = defaultStreamBufferSize
	}
	return &Bus{
		subs:   make(map[int]chan Event),
		buffer: buffer,
	}
}

// Subscribe registers a subscriber and returns its ID plus a receive-only channel.
func (b *Bus) Subscribe() (int, <-chan Event) {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.nextID++
	id := b.nextID
	ch := make(chan Event, b.buffer)
	b.subs[id] = ch
	return id, ch
}

// Unsubscribe removes a subscriber by ID.
func (b *Bus) Unsubscribe(id int) {
	b.mu.Lock()
	defer b.mu.Unlock()

	ch, ok := b.subs[id]
	if !ok {
		return
	}
	delete(b.subs, id)
	close(ch)
}

// Publish sends an event to all subscribers.
// Slow subscribers are skipped to avoid blocking.
func (b *Bus) Publish(event Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for _, ch := range b.subs {
		select {
		case ch <- event:
		default:
			// Drop on slow subscribers.
		}
	}
}

// SubscriberCount returns the current subscriber count.
func (b *Bus) SubscriberCount() int {
	b.mu.RLock()
	defer b.mu.RUnlock()
	return len(b.subs)
}
