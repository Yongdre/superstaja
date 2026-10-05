import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import SuperstajaApp from "./SuperstajaApp";
import "./styles.css";

createRoot(document.getElementById("root")!).render(<StrictMode><SuperstajaApp /></StrictMode>);
