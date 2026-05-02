import { createRoot } from "react-dom/client";
import App from "./App";
import { bootstrapTheme } from "./hooks/use-theme";
import "./index.css";

bootstrapTheme();

createRoot(document.getElementById("root")!).render(<App />);
