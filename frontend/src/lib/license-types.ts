export type LicenseState =
  | "unactivated"
  | "active"
  | "grace"
  | "read_only"
  | "revoked"

export interface FeatureSet {
  max_connections: number
  export: boolean
  backup: boolean
  modify_schema: boolean
  ai: boolean
}

export interface LicenseInfo {
  state: LicenseState
  plan: string
  email: string
  key_masked: string
  features: FeatureSet
  last_validated_at: number
  can_write: boolean
  show_close_upsell: boolean
  checkout_url: string
  max_connections: number
  connection_count: number
  device_id: string
}

export interface LicenseDevice {
  device_id: string
  name: string
  platform: string
  last_seen_at: number
}
