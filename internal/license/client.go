package license

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Device describes an activated device returned by the API.
type Device struct {
	DeviceID   string `json:"device_id"`
	Name       string `json:"name"`
	Platform   string `json:"platform"`
	LastSeenAt int64  `json:"last_seen_at"`
}

// Client calls the license HTTPS API (black box per §7).
type Client struct {
	base    string
	http    *http.Client
	device  string
	meta    DeviceMeta
}

func NewClient(deviceID string, meta DeviceMeta) *Client {
	return &Client{
		base: APIBase,
		http: &http.Client{Timeout: 30 * time.Second},
		device: deviceID,
		meta:   meta,
	}
}

type apiEnvelope struct {
	OK    bool            `json:"ok"`
	Data  json.RawMessage `json:"data"`
	Error *apiError       `json:"error"`
}

type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type activateReq struct {
	Key        string     `json:"key"`
	DeviceID   string     `json:"device_id"`
	DeviceMeta DeviceMeta `json:"device_meta"`
}

type activateData struct {
	Token   string   `json:"token"`
	Devices []Device `json:"devices,omitempty"`
}

type validateReq struct {
	Token    string `json:"token"`
	DeviceID string `json:"device_id"`
}

type validateData struct {
	Token string `json:"token"`
}

type registerReq struct {
	Email string `json:"email"`
}

type deactivateReq struct {
	Key              string `json:"key"`
	DeviceID         string `json:"device_id"`
	TargetDeviceID   string `json:"target_device_id,omitempty"`
}

type devicesReq struct {
	Key string `json:"key"`
}

// APIError is a license API failure with a machine code.
type APIError struct {
	Code    string
	Message string
	Devices []Device
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return e.Code
}

func (c *Client) Activate(key string) (token string, devices []Device, err error) {
	body, _ := json.Marshal(activateReq{Key: key, DeviceID: c.device, DeviceMeta: c.meta})
	var env apiEnvelope
	if err := c.post("/v1/bigphant/activate", body, &env); err != nil {
		return "", nil, err
	}
	if !env.OK {
		return "", nil, mapAPIError(env.Error)
	}
	var data activateData
	if err := json.Unmarshal(env.Data, &data); err != nil {
		return "", nil, err
	}
	return data.Token, data.Devices, nil
}

func (c *Client) Validate(token string) (string, error) {
	body, _ := json.Marshal(validateReq{Token: token, DeviceID: c.device})
	var env apiEnvelope
	if err := c.post("/v1/bigphant/validate", body, &env); err != nil {
		return "", &APIError{Code: "NetworkError", Message: err.Error()}
	}
	if !env.OK {
		return "", mapAPIError(env.Error)
	}
	var data validateData
	if err := json.Unmarshal(env.Data, &data); err != nil {
		return "", err
	}
	return data.Token, nil
}

func (c *Client) RequestFreeKey(email string) error {
	body, _ := json.Marshal(registerReq{Email: email})
	var env apiEnvelope
	if err := c.post("/v1/bigphant/register", body, &env); err != nil {
		return err
	}
	if !env.OK {
		return mapAPIError(env.Error)
	}
	return nil
}

func (c *Client) Deactivate(key string, targetDeviceID string) error {
	target := targetDeviceID
	if target == "" {
		target = c.device
	}
	body, _ := json.Marshal(deactivateReq{Key: key, DeviceID: c.device, TargetDeviceID: target})
	var env apiEnvelope
	if err := c.post("/v1/bigphant/deactivate", body, &env); err != nil {
		return err
	}
	if !env.OK {
		return mapAPIError(env.Error)
	}
	return nil
}

func (c *Client) ListDevices(key string) ([]Device, error) {
	body, _ := json.Marshal(devicesReq{Key: key})
	var env apiEnvelope
	if err := c.post("/v1/bigphant/devices", body, &env); err != nil {
		return nil, err
	}
	if !env.OK {
		return nil, mapAPIError(env.Error)
	}
	var list []Device
	if err := json.Unmarshal(env.Data, &list); err != nil {
		return nil, err
	}
	return list, nil
}

func (c *Client) post(path string, body []byte, out *apiEnvelope) error {
	req, err := http.NewRequest(http.MethodPost, c.base+path, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return &APIError{Code: "NetworkError", Message: err.Error()}
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 500 {
		return &APIError{Code: "ServerError", Message: string(raw)}
	}
	if err := json.Unmarshal(raw, out); err != nil {
		return fmt.Errorf("license api: %w", err)
	}
	if resp.StatusCode == 409 && out.Error != nil && out.Error.Code == "DeviceLimitReached" {
		var data activateData
		_ = json.Unmarshal(out.Data, &data)
		return &APIError{Code: out.Error.Code, Message: out.Error.Message, Devices: data.Devices}
	}
	return nil
}

func mapAPIError(e *apiError) error {
	if e == nil {
		return &APIError{Code: "ServerError", Message: "unknown error"}
	}
	return &APIError{Code: e.Code, Message: e.Message}
}
