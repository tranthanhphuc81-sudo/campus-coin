import { Component, type ErrorInfo, type PropsWithChildren } from "react";

import { en } from "@/content/en";
import ErrorPage from "@/pages/errors/ErrorPage";

type State = {
  hasError: boolean;
};

export default class AppErrorBoundary extends Component<PropsWithChildren, State> {
  public override state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    void error;
    void errorInfo;
    // Keep side effects out for now; monitoring hook can be added later.
  }

  public override render() {
    if (this.state.hasError) {
      return (
        <ErrorPage
          title={en.common.genericErrorTitle}
          detail={en.common.genericErrorDetail}
          actionLabel={en.errorPage.reloadAction}
          onAction={() => window.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}
