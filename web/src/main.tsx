import React from "react";
import { createRoot } from "react-dom/client";

import { ChatApp } from "./app";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing React root element");

createRoot(root).render(
  <React.StrictMode>
    <ChatApp />
  </React.StrictMode>,
);
