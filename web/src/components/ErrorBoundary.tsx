import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg)",
            padding: "24px",
          }}
        >
          <div
            style={{
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              padding: "48px",
              textAlign: "center",
              maxWidth: "480px",
              width: "100%",
            }}
          >
            <h1
              style={{
                fontSize: "20px",
                fontWeight: 700,
                color: "var(--accent)",
                marginBottom: "24px",
              }}
            >
              ClawChain
            </h1>
            <h2
              style={{
                fontSize: "24px",
                fontWeight: 700,
                color: "var(--red)",
                marginBottom: "12px",
              }}
            >
              Something went wrong
            </h2>
            <p
              style={{
                color: "var(--text2)",
                fontSize: "14px",
                marginBottom: "28px",
              }}
            >
              An unexpected error occurred. Please reload the page and try again.
            </p>
            <button onClick={this.handleReload}>Reload</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
