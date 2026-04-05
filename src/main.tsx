import React from "react"
import ReactDOM from "react-dom/client"
import { BrowserRouter } from "react-router-dom"
import "./index.css"
import App from "./App"
import { AuthProvider } from "./state/auth"

function initializeTheme() {
  const saved = window.localStorage.getItem("theme")
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches
  const preference = saved === "dark" || saved === "light" || saved === "system" ? saved : "system"
  const resolved = preference === "system" ? (prefersDark ? "dark" : "light") : preference
  document.documentElement.classList.toggle("dark", resolved === "dark")
}

initializeTheme()

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
)