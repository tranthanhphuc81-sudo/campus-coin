import { Component, type ErrorInfo, type PropsWithChildren, type ReactNode } from "react";

type WidgetErrorBoundaryProps = PropsWithChildren<{
  fallback: ReactNode;
}>;

type WidgetErrorBoundaryState = {
  hasError: boolean;
};

export default class WidgetErrorBoundary extends Component<
  WidgetErrorBoundaryProps,
  WidgetErrorBoundaryState
> {
  public override state: WidgetErrorBoundaryState = {
    hasError: false,
  };

  public static getDerivedStateFromError(): WidgetErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    void error;
    void errorInfo;
  }

  public override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}
