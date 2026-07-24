import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MafiaCity } from "../src/components/mafia/MafiaCity";
import "../src/styles.css";

// This is the entire "app" for the Capacitor build -- MafiaCity has no
// routes and no server functions, so there is nothing TanStack Router or
// TanStack Start would meaningfully add here. Mounting it directly like a
// plain React app removes the whole class of SSR/nitro/wrapper uncertainty
// that kept breaking the previous approach.

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element (#root) not found in mobile/index.html");
}

createRoot(container).render(
  <StrictMode>
    <MafiaCity />
  </StrictMode>,
);
