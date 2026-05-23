import { useState } from "react"

import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"
import { ConnectionList } from "@/pages/ConnectionList"
import { Workspace } from "@/pages/Workspace"
import type { ConnectionMeta } from "@/lib/types"

function App() {
  const [connection, setConnection] = useState<ConnectionMeta | null>(null)

  return (
    <ThemeProvider>
      {connection ? (
        <Workspace connection={connection} onClose={() => setConnection(null)} />
      ) : (
        <ConnectionList onOpen={setConnection} />
      )}
      <Toaster position="bottom-right" />
    </ThemeProvider>
  )
}

export default App
