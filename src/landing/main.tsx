import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LocaleProvider } from "./i18n";
import { LandingPage } from "./LandingPage";
import "../app.css";
import "./landing.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LocaleProvider>
      <LandingPage />
    </LocaleProvider>
  </StrictMode>,
);
