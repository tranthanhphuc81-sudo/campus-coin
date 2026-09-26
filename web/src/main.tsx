import { StrictMode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import AppErrorBoundary from "@/app/AppErrorBoundary";
import { AuthProvider } from "@/app/AuthProvider";
import { ThemeProvider } from "@/app/ThemeProvider";
import App from "@/App";

import "@fontsource/inter/latin.css";
import "@fontsource/inter/vietnamese.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "@/styles/main.scss";

const root = document.getElementById("root");
const queryClient = new QueryClient();

if (!root) {
  throw new Error("Root element not found.");
}

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ThemeProvider>
              <App />
            </ThemeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);
