package license

import (
	"context"
	"log"
	"os"
	"strings"
	"sync"
	"time"
)

// State is the license state machine (§4).
type State string

const (
	StateUnactivated   State = "unactivated"
	StateActive        State = "active"
	StateGrace         State = "grace"
	StateReadOnly      State = "read_only"
	StateRevoked       State = "revoked"
)

// Info is the password-free license view for the frontend.
type Info struct {
	State             State      `json:"state"`
	Plan              string     `json:"plan"`
	Email             string     `json:"email"`
	KeyMasked         string     `json:"key_masked"`
	Features          FeatureSet `json:"features"`
	LastValidatedAt   int64      `json:"last_validated_at"`
	CanWrite          bool       `json:"can_write"`
	ShowCloseUpsell   bool       `json:"show_close_upsell"`
	CheckoutURL       string     `json:"checkout_url"`
	MaxConnections    int        `json:"max_connections"`
	ConnectionCount   int        `json:"connection_count"`
	DeviceID          string     `json:"device_id"`
}

// Service manages activation, validation, and feature gates.
type Service struct {
	store    *Store
	client   *Client
	mu       sync.RWMutex
	claims   *Claims
	token    string
	key      string
	deviceID string
	state    State
}

func NewService() (*Service, error) {
	store, err := NewStore()
	if err != nil {
		return nil, err
	}
	deviceID, meta, err := DeviceID(store.BaseDir())
	if err != nil {
		return nil, err
	}
	s := &Service{
		store:    store,
		client:   NewClient(deviceID, meta),
		deviceID: deviceID,
		state:    StateUnactivated,
	}
	claims, token, err := store.Load()
	if err != nil {
		return nil, err
	}
	if claims != nil {
		claims.NormalizeFeatures()
		s.claims = claims
		s.token = token
		s.key = claims.LicenseKey
		s.recomputeState(time.Now())
	} else if key := strings.ToLower(strings.TrimSpace(os.Getenv("BIGPHANT_DEV_LICENSE"))); key != "" {
		if devKey := DevLicenseKey(key); devKey != "" && strings.HasPrefix(APIBase, "http://127.0.0.1") {
			if _, _, err := s.Activate(devKey); err != nil {
				log.Printf("bigphant: dev license auto-activate (%s): %v — is mock-license-api running?", key, err)
			} else {
				log.Printf("bigphant: dev license activated (%s)", key)
			}
		}
	}
	return s, nil
}

// StartValidation kicks off a non-blocking validate on launch (§6.4).
func (s *Service) StartValidation(ctx context.Context) {
	go func() {
		if _, err := s.ForceValidate(); err != nil {
			log.Printf("bigphant: license validate: %v", err)
		}
	}()
}

func (s *Service) Info(connectionCount int) Info {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.infoLocked(connectionCount)
}

func (s *Service) infoLocked(connectionCount int) Info {
	feat := FreeFeatures()
	plan := ""
	email := ""
	masked := ""
	lastVal := int64(0)
	maxConn := 2
	if s.claims != nil {
		s.claims.NormalizeFeatures()
		feat = s.claims.Features
		plan = s.claims.Plan
		email = s.claims.Email
		lastVal = s.claims.LastValidatedAt
		if s.key != "" {
			masked = MaskKey(s.key)
		}
		maxConn = feat.MaxConnections
		if maxConn == 0 {
			maxConn = 2
		}
	}
	canWrite := s.state == StateActive || s.state == StateGrace
	return Info{
		State:           s.state,
		Plan:            plan,
		Email:           email,
		KeyMasked:       masked,
		Features:        feat,
		LastValidatedAt: lastVal,
		CanWrite:        canWrite,
		ShowCloseUpsell: plan == "free" && s.state != StateUnactivated && s.state != StateRevoked,
		CheckoutURL:     CheckoutURL,
		MaxConnections:  maxConn,
		ConnectionCount: connectionCount,
		DeviceID:        s.deviceID,
	}
}

func (s *Service) Activated() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.claims != nil && s.state != StateRevoked && s.state != StateUnactivated
}

func (s *Service) Require(f Feature) error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.claims == nil {
		return &ErrNotActivated{}
	}
	if s.state == StateRevoked {
		return &ErrRevoked{}
	}
	if s.state == StateReadOnly {
		return &ErrReadOnly{}
	}
	c := s.claims
	c.NormalizeFeatures()
	switch f {
	case FeatExport:
		if !c.Features.Export {
			return &ErrPlanRequired{Feature: f, Message: "Upgrade to Pro to export data"}
		}
	case FeatBackup:
		if !c.Features.Backup {
			return &ErrPlanRequired{Feature: f, Message: "Upgrade to Pro to use backup"}
		}
	case FeatModifySchema:
		if !c.Features.ModifySchema {
			return &ErrPlanRequired{Feature: f, Message: "Upgrade to Pro to modify table structure"}
		}
	case FeatAI:
		if !c.Features.AI {
			return &ErrPlanRequired{Feature: f, Message: "Upgrade to Pro for AI features"}
		}
	case FeatMaxConnections:
		// Checked separately with connection count.
	}
	return nil
}

// CanAddConnection reports whether another saved connection is allowed.
func (s *Service) CanAddConnection(currentCount int) error {
	if err := s.Require(FeatMaxConnections); err != nil {
		return err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.claims == nil {
		return &ErrNotActivated{}
	}
	max := s.claims.Features.MaxConnections
	if max < 0 {
		return nil
	}
	if currentCount >= max {
		return &ErrPlanRequired{
			Feature: FeatMaxConnections,
			Message: "Free plan allows up to 2 saved connections — upgrade to Pro for unlimited",
		}
	}
	return nil
}

// ConnectionAllowed implements v0.1 migration: over-cap Free users may keep extras on disk but only the oldest N are usable.
func (s *Service) ConnectionAllowed(id string, orderedIDs []string) error {
	if err := s.Require(FeatMaxConnections); err != nil {
		return err
	}
	s.mu.RLock()
	max := s.claims.Features.MaxConnections
	s.mu.RUnlock()
	if max < 0 {
		return nil
	}
	for i, oid := range orderedIDs {
		if i >= max {
			break
		}
		if oid == id {
			return nil
		}
	}
	return &ErrPlanRequired{
		Feature: FeatMaxConnections,
		Message: "This connection is locked on the Free plan — open one of your first 2 connections or upgrade to Pro",
	}
}

func (s *Service) Activate(key string) (Info, []Device, error) {
	token, _, err := s.client.Activate(key)
	if err != nil {
		if api, ok := err.(*APIError); ok && api.Code == "DeviceLimitReached" {
			return Info{}, api.Devices, err
		}
		return Info{}, nil, err
	}
	return s.applyToken(key, token, 0)
}

func (s *Service) applyToken(key, token string, connectionCount int) (Info, []Device, error) {
	claims, err := s.store.VerifyAndSave(token)
	if err != nil {
		return Info{}, nil, err
	}
	claims.NormalizeFeatures()
	now := time.Now().Unix()
	if claims.LastValidatedAt == 0 {
		claims.LastValidatedAt = now
	}
	claims.LicenseKey = key
	s.mu.Lock()
	s.claims = claims
	s.token = token
	s.key = key
	s.recomputeStateLocked(time.Now())
	info := s.infoLocked(connectionCount)
	s.mu.Unlock()
	return info, nil, nil
}

func (s *Service) RequestFreeLicense(email string) error {
	return s.client.RequestFreeKey(email)
}

func (s *Service) ForceValidate() (Info, error) {
	s.mu.RLock()
	token := s.token
	s.mu.RUnlock()
	if token == "" {
		return Info{}, &ErrNotActivated{}
	}
	newToken, err := s.client.Validate(token)
	if err != nil {
		if api, ok := err.(*APIError); ok {
			switch api.Code {
			case "Revoked":
				_ = s.store.Clear()
				s.mu.Lock()
				s.claims = nil
				s.token = ""
				s.state = StateRevoked
				s.mu.Unlock()
				return Info{}, &ErrRevoked{}
			case "Expired":
				s.mu.Lock()
				s.state = StateReadOnly
				s.mu.Unlock()
				return s.Info(0), &APIError{Code: api.Code, Message: api.Message}
			case "NetworkError", "ServerError":
				s.mu.Lock()
				s.recomputeStateLocked(time.Now())
				info := s.infoLocked(0)
				s.mu.Unlock()
				return info, nil
			}
		}
		return Info{}, err
	}
	s.mu.Lock()
	claims, err := s.store.parseJWT(newToken)
	if err != nil {
		s.mu.Unlock()
		return Info{}, err
	}
	claims.NormalizeFeatures()
	claims.LastValidatedAt = time.Now().Unix()
	claims.LicenseKey = s.key
	_ = s.store.Save(newToken)
	s.claims = claims
	s.token = newToken
	s.recomputeStateLocked(time.Now())
	info := s.infoLocked(0)
	s.mu.Unlock()
	return info, nil
}

// RemoveLicense clears the local license blob without contacting the API.
func (s *Service) RemoveLicense() error {
	_ = s.store.Clear()
	s.mu.Lock()
	s.claims = nil
	s.token = ""
	s.key = ""
	s.state = StateUnactivated
	s.mu.Unlock()
	return nil
}

func (s *Service) DeactivateThisDevice() error {
	s.mu.RLock()
	key := s.key
	s.mu.RUnlock()
	if key == "" {
		return &ErrNotActivated{}
	}
	if err := s.client.Deactivate(key, ""); err != nil {
		return err
	}
	_ = s.store.Clear()
	s.mu.Lock()
	s.claims = nil
	s.token = ""
	s.key = ""
	s.state = StateUnactivated
	s.mu.Unlock()
	return nil
}

func (s *Service) ListDevices() ([]Device, error) {
	s.mu.RLock()
	key := s.key
	s.mu.RUnlock()
	if key == "" {
		return nil, &ErrNotActivated{}
	}
	return s.client.ListDevices(key)
}

func (s *Service) DeactivateDevice(deviceID string) error {
	s.mu.RLock()
	key := s.key
	s.mu.RUnlock()
	if key == "" {
		return &ErrNotActivated{}
	}
	return s.client.Deactivate(key, deviceID)
}

func (s *Service) CheckoutURL() string { return CheckoutURL }

func (s *Service) recomputeState(now time.Time) {
	s.mu.Lock()
	s.recomputeStateLocked(now)
	s.mu.Unlock()
}

func (s *Service) recomputeStateLocked(now time.Time) {
	if s.claims == nil {
		s.state = StateUnactivated
		return
	}
	if s.claims.SubscriptionExpired(now) {
		s.state = StateReadOnly
		return
	}
	if s.claims.GraceExceeded(now) {
		s.state = StateReadOnly
		return
	}
	if s.claims.LastValidatedAt > 0 && now.Sub(time.Unix(s.claims.LastValidatedAt, 0)) > 24*time.Hour {
		s.state = StateGrace
		return
	}
	s.state = StateActive
}

// PendingCloseUpsell is set when the user tries to quit on Free.
var pendingCloseUpsell bool

func SetPendingCloseUpsell(v bool) { pendingCloseUpsell = v }
func PendingCloseUpsell() bool     { return pendingCloseUpsell }
