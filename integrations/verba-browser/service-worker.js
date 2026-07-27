const BRIDGE = "http://127.0.0.1:38471/context";

chrome.runtime.onMessage.addListener((context) => {
  fetch(BRIDGE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(context),
  }).catch(() => {}); // Verba is optional; never interfere with the website.
});
