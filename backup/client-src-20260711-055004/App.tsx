import { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import TitleBar from './components/TitleBar'
import Home from './pages/Home'
import { initRecorder, cleanup } from './services/recorder'
import { initTheme } from './stores/theme'
import { initAiEnabled } from './stores/aiEnabled'
import { getSetting, setSetting } from './services/store'
import { runAutoUpdate } from './features/update/autoUpdate'
import * as bridge from './services/bridge'

const WelcomeGuide = lazy(() => import('./components/WelcomeGuide'))
const History = lazy(() => import('./pages/History'))
const Favorites = lazy(() => import('./pages/Favorites'))
const Dictionary = lazy(() => import('./pages/Dictionary'))
const Settings = lazy(() => import('./pages/Settings'))
const VoiceEnginePage = lazy(() => import('./features/settings/VoiceEnginePage'))
const AIServicePage = lazy(() => import('./features/settings/AIServicePage'))
const AIInstructionsPage = lazy(() => import('./features/settings/AIInstructionsPage'))
const About = lazy(() => import('./pages/About'))
const UpdateDialog = lazy(() => import('./features/update/UpdateDialog'))
const Meeting = lazy(() => import('./pages/Meeting'))
const KnowledgeBase = lazy(() => import('./pages/KnowledgeBase'))

function PageFallback() {
  return null
}

export default function App() {
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    void initTheme()
    void initAiEnabled()
    initRecorder()
    void runAutoUpdate()

    ;(async () => {
      const onboardedVersion = await getSetting('onboardingVersion', '')
      if (!onboardedVersion) {
        setShowWelcome(true)
      }
    })()

    return () => cleanup()
  }, [])

  const handleWelcomeComplete = () => {
    setShowWelcome(false)
    void setSetting('onboardingVersion', __APP_VERSION__)
    bridge.notifyShortcutsChanged()
  }

  return (
    <div className="flex h-screen flex-col">
      <TitleBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="custom-scrollbar flex-1 overflow-y-auto bg-background p-8">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/history" element={<Suspense fallback={<PageFallback />}><History /></Suspense>} />
            <Route path="/favorites" element={<Navigate to="/history" replace />} />
            <Route path="/hotwords" element={<Suspense fallback={<PageFallback />}><Dictionary /></Suspense>} />
            <Route path="/dictionary" element={<Navigate to="/hotwords" replace />} />
            <Route path="/voice-engine" element={<Suspense fallback={<PageFallback />}><VoiceEnginePage /></Suspense>} />
            <Route path="/ai-instructions" element={<Suspense fallback={<PageFallback />}><AIInstructionsPage /></Suspense>} />
            <Route path="/ai-service" element={<Suspense fallback={<PageFallback />}><AIServicePage /></Suspense>} />
            <Route path="/settings" element={<Suspense fallback={<PageFallback />}><Settings /></Suspense>} />
            <Route path="/about" element={<Suspense fallback={<PageFallback />}><About /></Suspense>} />
            <Route path="/meeting" element={<Suspense fallback={<PageFallback />}><Meeting /></Suspense>} />
            <Route path="/knowledge" element={<Suspense fallback={<PageFallback />}><KnowledgeBase /></Suspense>} />
          </Routes>
        </main>
      </div>
      {showWelcome && (
        <Suspense fallback={<PageFallback />}>
          <WelcomeGuide onComplete={handleWelcomeComplete} />
        </Suspense>
      )}
      <Suspense fallback={<PageFallback />}>
        <UpdateDialog />
      </Suspense>
    </div>
  )
}
