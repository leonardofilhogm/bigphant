// mock-license-api is a local dev server for license activation (§11).
//
//	go run ./tools/mock-license-api
package main

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const devPrivB64 = "7FJl75hZ2hN/pMTPv3Y8NxUyq0vQ5u6qL6+cUCcycTQQ0x14YZLBo6y2bav6q3t76SzOgFdG39YsPb6UydqfMw=="

type licenseRec struct {
	Plan   string
	Email  string
	MaxDev int
}

type deviceRec struct {
	LicenseID string
	DeviceID  string
	Name      string
	Platform  string
	LastSeen  int64
	Active    bool
}

var (
	mu       sync.Mutex
	licenses = map[string]licenseRec{
		// Canonical dev keys (see internal/license/devkeys.go)
		"BP-FREE-DEV00-DEV01-DEV02-DEV03": {Plan: "free", Email: "dev-free@bigphant.local", MaxDev: 2},
		"BP-PRO-DEV00-DEV01-DEV02-DEV03":  {Plan: "pro", Email: "dev-pro@bigphant.local", MaxDev: 2},
		// Legacy dev keys
		"BP-FREE-7H2KQ-9MZRX-4PNCV-8TJBW": {Plan: "free", Email: "free@example.com", MaxDev: 2},
		"BP-PRO-2GXAR-K5HQN-9VTYM-3PCFD":  {Plan: "pro", Email: "pro@example.com", MaxDev: 2},
	}
	devices []deviceRec
	issued  = map[string]string{} // email -> key
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8787"
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/licenses/activate", handleActivate)
	mux.HandleFunc("/v1/licenses/validate", handleValidate)
	mux.HandleFunc("/v1/licenses/deactivate", handleDeactivate)
	mux.HandleFunc("/v1/licenses/devices", handleDevices)
	mux.HandleFunc("/v1/free/register", handleRegister)
	log.Printf("mock license API on :%s", port)
	log.Printf("dev keys — Free: %s", "BP-FREE-DEV00-DEV01-DEV02-DEV03")
	log.Printf("dev keys — Pro:  %s", "BP-PRO-DEV00-DEV01-DEV02-DEV03")
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

func writeJSON(w http.ResponseWriter, status int, ok bool, data any, errCode, errMsg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	env := map[string]any{"ok": ok, "data": data}
	if !ok {
		env["error"] = map[string]string{"code": errCode, "message": errMsg}
	}
	_ = json.NewEncoder(w).Encode(env)
}

func handleRegister(w http.ResponseWriter, r *http.Request) {
	var req struct{ Email string `json:"email"` }
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Email == "" {
		writeJSON(w, 400, false, nil, "InvalidKey", "email required")
		return
	}
	mu.Lock()
	key, ok := issued[req.Email]
	if !ok {
		key = "BP-FREE-DEV01-DEV02-DEV03-DEV04"
		licenses[key] = licenseRec{Plan: "free", Email: req.Email, MaxDev: 2}
		issued[req.Email] = key
	}
	mu.Unlock()
	log.Printf("registered %s -> %s", req.Email, key)
	writeJSON(w, 200, true, map[string]string{"message": "check email (dev: use key " + key + ")"}, "", "")
}

func handleActivate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key        string `json:"key"`
		DeviceID   string `json:"device_id"`
		DeviceMeta struct {
			Name string `json:"name"`
		} `json:"device_meta"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	lic, ok := licenses[normalizeKey(req.Key)]
	if !ok {
		writeJSON(w, 400, false, nil, "InvalidKey", "unknown license key")
		return
	}
	mu.Lock()
	defer mu.Unlock()
	for i := range devices {
		if devices[i].LicenseID == req.Key && devices[i].DeviceID == req.DeviceID && devices[i].Active {
			tok, _ := signToken(req.Key, lic, req.DeviceID)
			writeJSON(w, 200, true, map[string]any{"token": tok}, "", "")
			return
		}
	}
	active := 0
	var activeList []deviceRec
	for _, d := range devices {
		if d.LicenseID == req.Key && d.Active {
			active++
			activeList = append(activeList, d)
		}
	}
	if active >= lic.MaxDev {
		devs := make([]map[string]any, 0, len(activeList))
		for _, d := range activeList {
			devs = append(devs, map[string]any{
				"device_id": d.DeviceID, "name": d.Name, "platform": d.Platform, "last_seen_at": d.LastSeen,
			})
		}
		writeJSON(w, 409, false, map[string]any{"devices": devs}, "DeviceLimitReached", "device limit reached")
		return
	}
	devices = append(devices, deviceRec{
		LicenseID: req.Key, DeviceID: req.DeviceID,
		Name: req.DeviceMeta.Name, Platform: "darwin", LastSeen: time.Now().Unix(), Active: true,
	})
	tok, err := signToken(req.Key, lic, req.DeviceID)
	if err != nil {
		writeJSON(w, 500, false, nil, "ServerError", err.Error())
		return
	}
	writeJSON(w, 200, true, map[string]string{"token": tok}, "", "")
}

func handleValidate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Token    string `json:"token"`
		DeviceID string `json:"device_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	claims, err := parseToken(req.Token)
	if err != nil {
		writeJSON(w, 400, false, nil, "Revoked", "invalid token")
		return
	}
	key := claims["license_key"].(string)
	lic, ok := licenses[normalizeKey(key)]
	if !ok {
		writeJSON(w, 400, false, nil, "Revoked", "license not found")
		return
	}
	tok, err := signToken(key, lic, req.DeviceID)
	if err != nil {
		writeJSON(w, 500, false, nil, "ServerError", err.Error())
		return
	}
	writeJSON(w, 200, true, map[string]string{"token": tok}, "", "")
}

func handleDeactivate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Key            string `json:"key"`
		DeviceID       string `json:"device_id"`
		TargetDeviceID string `json:"target_device_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	mu.Lock()
	defer mu.Unlock()
	target := req.DeviceID
	if req.TargetDeviceID != "" {
		target = req.TargetDeviceID
	}
	for i := range devices {
		if devices[i].LicenseID == req.Key && devices[i].DeviceID == target {
			devices[i].Active = false
		}
	}
	writeJSON(w, 200, true, nil, "", "")
}

func handleDevices(w http.ResponseWriter, r *http.Request) {
	var req struct{ Key string `json:"key"` }
	_ = json.NewDecoder(r.Body).Decode(&req)
	mu.Lock()
	defer mu.Unlock()
	var list []map[string]any
	for _, d := range devices {
		if d.LicenseID == req.Key && d.Active {
			list = append(list, map[string]any{
				"device_id": d.DeviceID, "name": d.Name, "platform": d.Platform, "last_seen_at": d.LastSeen,
			})
		}
	}
	writeJSON(w, 200, true, list, "", "")
}

func normalizeKey(k string) string { return strings.ToUpper(strings.TrimSpace(k)) }

func featuresFor(plan string) map[string]any {
	if plan == "pro" {
		return map[string]any{"max_connections": -1, "export": true, "backup": true, "modify_schema": true, "ai": true}
	}
	return map[string]any{"max_connections": 2, "export": false, "backup": false, "modify_schema": false, "ai": false}
}

func signToken(key string, lic licenseRec, deviceID string) (string, error) {
	privBytes, _ := base64.StdEncoding.DecodeString(devPrivB64)
	priv := ed25519.PrivateKey(privBytes)
	now := time.Now()
	exp := now.Add(365 * 24 * time.Hour)
	if lic.Plan == "free" {
		exp = now.Add(10 * 365 * 24 * time.Hour)
	}
	claims := jwt.MapClaims{
		"sub":               "lic_dev",
		"plan":              lic.Plan,
		"email":             lic.Email,
		"device_id":         deviceID,
		"issued_at":         now.Unix(),
		"iat":               now.Unix(),
		"exp":               exp.Unix(),
		"features":          featuresFor(lic.Plan),
		"max_devices":       lic.MaxDev,
		"last_validated_at": now.Unix(),
		"license_key":       key,
	}
	return jwt.NewWithClaims(jwt.SigningMethodEdDSA, claims).SignedString(priv)
}

func parseToken(tok string) (jwt.MapClaims, error) {
	pubBytes, _ := base64.StdEncoding.DecodeString("ENMdeGGSwaOstm2r+qt7e+kszoBXRt/WLD2+lMnanzM=")
	pub := ed25519.PublicKey(pubBytes)
	parsed, err := jwt.Parse(tok, func(t *jwt.Token) (any, error) { return pub, nil })
	if err != nil {
		return nil, err
	}
	return parsed.Claims.(jwt.MapClaims), nil
}
