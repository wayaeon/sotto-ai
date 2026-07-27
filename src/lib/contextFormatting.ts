export type FormatProfile = "plain" | "email" | "code";

export interface FormattingTarget {
  name: string;
  kind: "app" | "site";
}

const EMAIL_CONTEXTS = ["gmail", "outlook", "protonmail", "thunderbird", "mail"];
const CODE_CONTEXTS = ["cursor", "windsurf", "code", "visual studio"];
const EMAIL_LOCAL_PART_STOP_WORDS = new Set(["i", "me", "we", "you", "he", "she", "it", "they", "there", "here"]);

export function resolveContextProfile(target: FormattingTarget | null): FormatProfile {
  const name = target?.name.toLowerCase() ?? "";
  if (CODE_CONTEXTS.some((context) => name.includes(context))) return "code";
  if (EMAIL_CONTEXTS.some((context) => name.includes(context))) return "email";
  return "plain";
}

export function formatForContext(text: string, profile: FormatProfile): string {
  if (profile === "email") return formatEmail(text);
  if (profile === "code") return formatCode(text);
  return text;
}

function formatEmail(text: string): string {
  const withParagraphs = text.replace(/\bnew paragraph\b/gi, "\n\n");
  const withAddresses = withParagraphs.replace(
    /\b([a-z0-9]+(?:\s+(?:dot|dash|hyphen|underscore)\s+[a-z0-9]+)*)\s+at\s+([a-z0-9]+(?:\s+dot\s+[a-z]{2,})+)\b/gi,
    (match, localPart: string, domain: string) => {
      if (EMAIL_LOCAL_PART_STOP_WORDS.has(localPart.toLowerCase())) return match;
      return `${spokenAddressPart(localPart)}@${spokenAddressPart(domain)}`;
    }
  );
  return withAddresses
    .replace(/\b(regards|thanks|sincerely)\s+comma\s+/gi, "$1, ")
    .replace(/ *\n */g, "\n");
}

function spokenAddressPart(value: string): string {
  return value
    .replace(/\s+dot\s+/gi, ".")
    .replace(/\s+(?:dash|hyphen)\s+/gi, "-")
    .replace(/\s+underscore\s+/gi, "_")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function formatCode(text: string): string {
  const marked = text
    .replace(/\b(?:new line|newline)\b/gi, "\n")
    .replace(/\bopen paren\b/gi, "(")
    .replace(/\bclose paren\b/gi, ")")
    .replace(/\bopen brace\b/gi, "{")
    .replace(/\bclose brace\b/gi, "}")
    .replace(/\bopen bracket\b/gi, "[")
    .replace(/\bclose bracket\b/gi, "]")
    .replace(/\bsemicolon\b/gi, ";")
    .replace(/\bequals\b/gi, "=");

  let indent = 0;
  return marked.split("\n").map((line) => {
    let value = line.trim();
    while (/^outdent\b/i.test(value)) {
      indent = Math.max(0, indent - 1);
      value = value.replace(/^outdent\b\s*/i, "");
    }
    while (/^indent\b/i.test(value)) {
      indent += 1;
      value = value.replace(/^indent\b\s*/i, "");
    }
    value = value
      .replace(/\s+([,;\)\]\}])/g, "$1")
      .replace(/\s+\(/g, "(")
      .replace(/([\(\[\{])\s+/g, "$1")
      .replace(/\s*=\s*/g, " = ");
    return value ? `${"  ".repeat(indent)}${value}` : "";
  }).join("\n");
}
