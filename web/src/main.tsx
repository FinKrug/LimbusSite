import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { installDragScroll } from './lib/dragscroll'

// Click and drag to scroll anything that scrolls on its own (lib/dragscroll.ts).
installDragScroll()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
