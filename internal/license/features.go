package license

// Feature names gates enforced server-side (docs/specs/plans-and-licensing.md §3.3).
type Feature string

const (
	FeatMaxConnections Feature = "max_connections"
	FeatExport         Feature = "export"
	FeatBackup         Feature = "backup"
	FeatModifySchema   Feature = "modify_schema"
	FeatAI             Feature = "ai"
)

// FeatureSet holds plan capabilities decoded from a signed license blob.
type FeatureSet struct {
	MaxConnections int  `json:"max_connections"` // -1 = unlimited
	Export         bool `json:"export"`
	Backup         bool `json:"backup"`
	ModifySchema   bool `json:"modify_schema"`
	AI             bool `json:"ai"`
}

// FreeFeatures is the canonical Free plan matrix.
func FreeFeatures() FeatureSet {
	return FeatureSet{
		MaxConnections: 2,
		Export:         false,
		Backup:         false,
		ModifySchema:   false,
		AI:             false,
	}
}

// ProFeatures is the canonical Pro plan matrix.
func ProFeatures() FeatureSet {
	return FeatureSet{
		MaxConnections: -1,
		Export:         true,
		Backup:         true,
		ModifySchema:   true,
		AI:             true,
	}
}

// FeaturesForPlan returns the matrix for a plan token when the API omits features.
func FeaturesForPlan(plan string) FeatureSet {
	if plan == "pro" {
		return ProFeatures()
	}
	return FreeFeatures()
}
