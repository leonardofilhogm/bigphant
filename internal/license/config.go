package license

// Build-time overrides via -ldflags -X (docs/specs/plans-and-licensing.md §11).
var (
	APIBase     = "https://automate.trato.site/webhook"
	PublicKeyB64 = devPublicKeyB64
	CheckoutURL = "https://bigphant.app/checkout"
)

// Dev Ed25519 public key — pair is generated once and shared with tools/mock-license-api.
const devPublicKeyB64 = "ENMdeGGSwaOstm2r+qt7e+kszoBXRt/WLD2+lMnanzM="
