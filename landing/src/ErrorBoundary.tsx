import { Component, type ReactNode } from 'react'

/**
 * Minimal error boundary for optional, decorative subtrees (e.g. the WebGL
 * hero). If the child throws, render the fallback (default: nothing) so a
 * failure in a non-essential visual never takes down the page.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  render(): ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null
    return this.props.children
  }
}
