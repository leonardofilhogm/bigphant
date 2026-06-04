import { useCallback, useEffect, useState } from "react"

import { api } from "@/lib/api"
import type { LicenseInfo } from "@/lib/license-types"

export function useLicense() {
  const [license, setLicense] = useState<LicenseInfo | null>(null)
  const [activated, setActivated] = useState(false)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [info, ok] = await Promise.all([api.getLicense(), api.licenseActivated()])
      setLicense(info)
      setActivated(ok)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    license,
    activated,
    loading,
    refresh,
    features: license?.features,
    isPro: license?.plan === "pro",
  }
}
