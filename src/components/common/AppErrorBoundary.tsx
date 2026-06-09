import React from 'react';

import { AppErrorFallback } from './AppErrorFallback';
import { logError } from '../../utils/logger';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logError('AppErrorBoundary caught an error', error, {
      componentStack: errorInfo.componentStack,
    });
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: undefined,
    });
  };

  render() {
    if (this.state.hasError) {
      return (
        <AppErrorFallback
          title="We hit a temporary issue"
          message={this.state.error?.message || 'The app recovered into a safe mode. Try again to continue.'}
          onRetry={this.handleRetry}
        />
      );
    }

    return this.props.children;
  }
}
