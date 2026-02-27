import { Component, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="max-w-3xl mx-auto px-6 py-12 text-oled-text">
          <h1 className="text-xl font-medium text-red-400 mb-2">Something went wrong</h1>
          <pre className="text-sm text-oled-secondary whitespace-pre-wrap break-all mb-4 p-4 bg-oled-card border border-oled-border rounded">
            {this.state.error.message}
          </pre>
          <Link to="/" className="text-oled-secondary hover:text-oled-text underline">← Back to search</Link>
        </div>
      )
    }
    return this.props.children
  }
}
