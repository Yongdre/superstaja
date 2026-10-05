import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import PitcherApp from "./PitcherApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><PitcherApp /></StrictMode>);
