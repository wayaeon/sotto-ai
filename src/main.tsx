import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import App from "./App";
import Pill from "./components/Pill";

const isPill = window.location.hash === "#pill";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isPill ? <Pill /> : <App />}
  </React.StrictMode>
);
