// Package sshtunnel opens an SSH connection and tunnels database traffic
// through it. The tunnel is established entirely on the Go backend; the SSH
// host, credentials, and private key never leave the process.
//
// KNOWN POC WEAKNESS: the SSH server's host key is not verified
// (ssh.InsecureIgnoreHostKey), so the tunnel is vulnerable to a
// man-in-the-middle on the SSH hop. This mirrors the static-AES-key weakness in
// internal/crypto and is slated for known_hosts verification in a later
// release. See docs/prd.md §5, §11.
package sshtunnel

import (
	"context"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"golang.org/x/crypto/ssh"

	"bigphant/internal/connections"
)

// Tunnel wraps an open SSH client. Its DialContext method produces net.Conns to
// the remote database, routed through the SSH server.
type Tunnel struct {
	client *ssh.Client
}

// Open dials the SSH server described by the connection and authenticates using
// either a password or a private key (optionally passphrase-protected).
func Open(c connections.Connection) (*Tunnel, error) {
	auth, err := authMethods(c)
	if err != nil {
		return nil, err
	}
	port := c.SSHPort
	if port == 0 {
		port = 22
	}
	cfg := &ssh.ClientConfig{
		User:            c.SSHUsername,
		Auth:            auth,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(), // KNOWN POC WEAKNESS — see package doc.
		Timeout:         10 * time.Second,
	}
	addr := net.JoinHostPort(c.SSHHost, strconv.Itoa(port))
	client, err := ssh.Dial("tcp", addr, cfg)
	if err != nil {
		return nil, fmt.Errorf("ssh dial %s: %w", addr, err)
	}
	return &Tunnel{client: client}, nil
}

// authMethods builds the SSH auth methods from the connection's chosen method.
func authMethods(c connections.Connection) ([]ssh.AuthMethod, error) {
	switch c.SSHAuthMethod {
	case "key":
		keyBytes, err := privateKeyBytes(c)
		if err != nil {
			return nil, err
		}
		var signer ssh.Signer
		if c.SSHPassphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyBytes, []byte(c.SSHPassphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(keyBytes)
		}
		if err != nil {
			return nil, fmt.Errorf("ssh: parse private key: %w", err)
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, nil
	case "password", "":
		return []ssh.AuthMethod{ssh.Password(c.SSHPassword)}, nil
	default:
		return nil, fmt.Errorf("ssh: unsupported auth method %q", c.SSHAuthMethod)
	}
}

// privateKeyBytes returns the private key material, read from SSHKeyPath when
// set (with ~ expanded to the user's home dir), otherwise the pasted PEM.
func privateKeyBytes(c connections.Connection) ([]byte, error) {
	if path := strings.TrimSpace(c.SSHKeyPath); path != "" {
		if strings.HasPrefix(path, "~/") {
			if home, err := os.UserHomeDir(); err == nil {
				path = filepath.Join(home, path[2:])
			}
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return nil, fmt.Errorf("ssh: read private key file: %w", err)
		}
		return b, nil
	}
	if c.SSHPrivateKey != "" {
		return []byte(c.SSHPrivateKey), nil
	}
	return nil, fmt.Errorf("ssh: a private key file path or pasted key is required for key authentication")
}

// DialContext dials addr through the SSH tunnel. It matches the signature
// expected by both go-sql-driver/mysql (RegisterDialContext) and pgx (DialFunc).
func (t *Tunnel) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	if t == nil || t.client == nil {
		return nil, fmt.Errorf("ssh tunnel is not open")
	}
	return t.client.DialContext(ctx, network, addr)
}

// Close tears down the SSH client.
func (t *Tunnel) Close() error {
	if t == nil || t.client == nil {
		return nil
	}
	return t.client.Close()
}
