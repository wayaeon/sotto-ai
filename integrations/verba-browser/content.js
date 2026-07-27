function fieldType(element) {
  const label = `${element?.getAttribute("aria-label") ?? ""} ${element?.getAttribute("name") ?? ""} ${element?.getAttribute("type") ?? ""}`.toLowerCase();
  if (label.includes("email") || label.includes("recipient") || label === "to") return "email";
  if (isEditable(element) && isEmailSite(location.hostname)) return "compose";
  return "text";
}

function isEditable(element) {
  return Boolean(element && (element.isContentEditable || element.tagName === "TEXTAREA" || element.tagName === "INPUT"));
}

function isEmailSite(site) {
  return ["mail.google.com", "outlook.live.com", "outlook.office.com", "proton.me"].some((domain) => site === domain || site.endsWith(`.${domain}`));
}

function publish(element) {
  chrome.runtime.sendMessage({
    source: "browser",
    app: "Browser",
    site: location.hostname,
    field: fieldType(element),
  });
}

document.addEventListener("focusin", (event) => publish(event.target), true);
publish(document.activeElement);
