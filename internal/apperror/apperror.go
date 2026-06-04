package apperror

import "fmt"

// Error is the Wails-facing error shape (docs/prd.md §8).
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	SQL     string `json:"sql"`
}

func (e Error) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("%s: %s", e.Code, e.Message)
	}
	return e.Message
}

func PlanRequired(message string) Error {
	return Error{Code: "PlanRequired", Message: message}
}

func ConfirmationRequired(sql string) Error {
	return Error{Code: "ConfirmationRequired", Message: "Destructive schema change requires confirmation", SQL: sql}
}

func LicenseRequired() Error {
	return Error{Code: "LicenseRequired", Message: "Activate a license to use Bigphant"}
}

func LicenseReadOnly() Error {
	return Error{Code: "LicenseReadOnly", Message: "License validation overdue — reconnect to continue editing"}
}

func LicenseRevoked() Error {
	return Error{Code: "LicenseRevoked", Message: "This license has been revoked"}
}

func FromLicense(err error) error {
	if err == nil {
		return nil
	}
	type coder interface{ Code() string }
	c, ok := err.(coder)
	if !ok {
		return err
	}
	switch c.Code() {
	case "PlanRequired":
		if pe, ok := err.(interface{ Error() string }); ok {
			return PlanRequired(pe.Error())
		}
	case "LicenseRequired":
		return LicenseRequired()
	case "LicenseReadOnly":
		return LicenseReadOnly()
	case "LicenseRevoked":
		return LicenseRevoked()
	}
	return err
}
