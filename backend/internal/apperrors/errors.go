package apperrors

import "errors"

// ErrNotFound marks an expected "resource does not exist" condition.
var ErrNotFound = errors.New("resource not found")
