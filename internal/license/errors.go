package license

import "fmt"

// ErrPlanRequired is returned when a gated feature is not on the current plan.
type ErrPlanRequired struct {
	Feature Feature
	Message string
}

func (e *ErrPlanRequired) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return fmt.Sprintf("upgrade required for %s", e.Feature)
}

// Code matches docs/prd.md AppError codes consumed by the frontend.
func (e *ErrPlanRequired) Code() string { return "PlanRequired" }

// ErrNotActivated is returned when no valid license blob is on disk.
type ErrNotActivated struct{}

func (e *ErrNotActivated) Error() string { return "license not activated" }
func (e *ErrNotActivated) Code() string  { return "LicenseRequired" }

// ErrReadOnly is returned when grace has expired and writes are blocked.
type ErrReadOnly struct{}

func (e *ErrReadOnly) Error() string {
	return "license validation overdue — app is read-only until you reconnect"
}
func (e *ErrReadOnly) Code() string { return "LicenseReadOnly" }

// ErrRevoked is returned when the license was revoked server-side.
type ErrRevoked struct{}

func (e *ErrRevoked) Error() string { return "license has been revoked" }
func (e *ErrRevoked) Code() string  { return "LicenseRevoked" }
