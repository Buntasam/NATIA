import React from "react";
import ReactDOM from "react-dom/client";
import "./debug/logger"; // installe les intercepteurs console + window.onerror dès le boot
import App from "./App";
import "./index.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", color: "#f87171", background: "#0a0a0a", minHeight: "100vh" }}>
          <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Erreur de rendu</p>
          <pre style={{ fontSize: 11, whiteSpace: "pre-wrap", color: "#fca5a5" }}>{this.state.error.message}</pre>
          <pre style={{ fontSize: 10, color: "#6b7280", marginTop: 8, whiteSpace: "pre-wrap" }}>{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
