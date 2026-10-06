import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import GameHub from "./GameHub";

createRoot(document.getElementById("root")!).render(<StrictMode><GameHub /></StrictMode>);
