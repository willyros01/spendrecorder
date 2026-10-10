// SpendRecorder — the React library, bundled into www/lib/react.bundle.js
// (one self-contained file inside the app; nothing loads from the internet).
import React from "react";
import { createRoot } from "react-dom/client";
window.React = React;
window.ReactDOM = { createRoot };
