package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sort"
	"time"
)

const (
	openRouterBase = "https://openrouter.ai/api/v1"
	// Sent on every request per OpenRouter etiquette so usage is attributable.
	refererHeader = "https://bigphant.app"
	titleHeader   = "Bigphant"
)

// Client is a thin OpenAI-compatible client targeting OpenRouter. It uses the
// stdlib net/http — no third-party SDK.
type Client struct {
	apiKey string
	http   *http.Client
}

// NewClient builds a client for the given OpenRouter API key.
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 120 * time.Second},
	}
}

// --- Chat completions ------------------------------------------------------

// Message is one entry in the chat history. Role is "system" | "user" |
// "assistant" | "tool". For assistant turns that call a tool, ToolCalls is set;
// for tool results, ToolCallID references the call being answered.
type Message struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"tool_calls,omitempty"`
	ToolCallID string     `json:"tool_call_id,omitempty"`
	Name       string     `json:"name,omitempty"`
}

// Tool describes a function the model may call (OpenAI tool schema).
type Tool struct {
	Type     string       `json:"type"` // "function"
	Function ToolFunction `json:"function"`
}

type ToolFunction struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	Parameters  map[string]any `json:"parameters"`
}

// ToolCall is a model-issued request to invoke a tool.
type ToolCall struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"` // "function"
	Function ToolCallFunction `json:"function"`
}

type ToolCallFunction struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"` // JSON string
}

type chatRequest struct {
	Model    string    `json:"model"`
	Messages []Message `json:"messages"`
	Tools    []Tool    `json:"tools,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message Message `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

// ChatCompletion sends one round-trip to the model and returns its message.
func (c *Client) ChatCompletion(ctx context.Context, model string, messages []Message, tools []Tool) (Message, error) {
	body, err := json.Marshal(chatRequest{Model: model, Messages: messages, Tools: tools})
	if err != nil {
		return Message{}, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, openRouterBase+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return Message{}, err
	}
	c.setHeaders(req)
	resp, err := c.http.Do(req)
	if err != nil {
		return Message{}, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return Message{}, fmt.Errorf("openrouter: %s: %s", resp.Status, string(data))
	}
	var out chatResponse
	if err := json.Unmarshal(data, &out); err != nil {
		return Message{}, err
	}
	if out.Error != nil {
		return Message{}, fmt.Errorf("openrouter: %s", out.Error.Message)
	}
	if len(out.Choices) == 0 {
		return Message{}, fmt.Errorf("openrouter: empty response")
	}
	return out.Choices[0].Message, nil
}

// --- Models ----------------------------------------------------------------

// Model is a single OpenRouter model offering (subset of fields we surface).
type Model struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	ContextLength int    `json:"context_length"`
}

// ListModels fetches the available models from OpenRouter, sorted by id.
func (c *Client) ListModels(ctx context.Context) ([]Model, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, openRouterBase+"/models", nil)
	if err != nil {
		return nil, err
	}
	c.setHeaders(req)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("openrouter: %s: %s", resp.Status, string(data))
	}
	var out struct {
		Data []Model `json:"data"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	sort.Slice(out.Data, func(i, j int) bool { return out.Data[i].ID < out.Data[j].ID })
	return out.Data, nil
}

func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("HTTP-Referer", refererHeader)
	req.Header.Set("X-Title", titleHeader)
}
