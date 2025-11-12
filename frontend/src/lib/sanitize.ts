import DOMPurify from "dompurify";

export function sanitizeHtml(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return DOMPurify.sanitize(value);
}

export function htmlToPlainText(value: string | null | undefined): string {
  const sanitized = sanitizeHtml(value);
  if (!sanitized) {
    return "";
  }
  if (typeof window === "undefined") {
    return sanitized
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00A0/g, " ")
      .replace(/\s+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  const container = document.createElement("div");
  container.innerHTML = sanitized;
  const text = container.innerText || container.textContent || "";
  return text
    .replace(/\u00A0/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
