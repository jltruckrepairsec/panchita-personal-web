"use strict";
/*
 * Secret hygiene.
 *
 * "No secrets in prompts, source code, logs or repositories" only holds if
 * something checks. Every value that enters a task record, an audit entry, an
 * evidence envelope or a prompt passes through here first.
 *
 * Two severities:
 *   block  -- a credential-shaped value. Refuse the whole record.
 *   redact -- a field whose *name* means it may carry a secret. Mask it.
 */

const BLOCKING_PATTERNS = [
  { id: "anthropic_key", re: /\bsk-ant-[A-Za-z0-9_\-]{16,}/ },
  { id: "openai_key", re: /\bsk-[A-Za-z0-9]{32,}/ },
  { id: "aws_access_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "private_key_block", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/ },
  { id: "json_web_token", re: /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}/ },
  { id: "bearer_token", re: /\bBearer\s+[A-Za-z0-9._\-]{20,}/i },
  { id: "url_with_credentials", re: /\b[a-z][a-z0-9+.\-]*:\/\/[^\s/@:]+:[^\s/@]+@/i },
  { id: "n8n_api_key", re: /\bn8n_api_[A-Za-z0-9]{16,}/ },
  { id: "github_token", re: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { id: "google_api_key", re: /\bAIza[0-9A-Za-z_\-]{30,}/ },
  /* "password: hunter2", "factor_provided=..." written into free text. */
  {
    id: "inline_credential_assignment",
    re: /\b(password|passwd|factor_provided|api[_-]?key|secret|session_token|access[_-]?token|client[_-]?secret)\b\s*[:=]\s*["']?[^\s"',;]{4,}/i
  }
];

/* Field names that are masked wherever they appear, at any depth. */
const SENSITIVE_KEYS = [
  "password",
  "passwd",
  "pass",
  "factor_provided",
  "auth_factor",
  "secret",
  "client_secret",
  "api_key",
  "apikey",
  "token",
  "access_token",
  "refresh_token",
  "session_token",
  "session_id",
  "authorization",
  "credential",
  "credentials",
  "private_key"
];

const MASK = "[REDACTED]";
const MAX_SCAN_DEPTH = 12;

class SecretError extends Error {
  constructor(findings) {
    super(
      "Refusing to store or forward a value that looks like a credential: " +
        findings.map((f) => f.pattern + " at " + f.path).join(", ")
    );
    this.name = "SecretError";
    this.code = "secret_detected";
    this.findings = findings;
  }
}

function isSensitiveKey(key) {
  const k = String(key || "").toLowerCase();
  return SENSITIVE_KEYS.some((s) => k === s || k.endsWith("_" + s) || k.startsWith(s + "_"));
}

function scanString(text, path, out) {
  const s = String(text);
  BLOCKING_PATTERNS.forEach((p) => {
    if (p.re.test(s)) out.push({ severity: "block", pattern: p.id, path });
  });
}

/* Walk any value, collecting findings. Cycles and excessive depth are
   reported rather than followed. */
function scan(value, path, out, depth, seen) {
  path = path || "$";
  out = out || [];
  depth = depth || 0;
  seen = seen || new Set();

  if (depth > MAX_SCAN_DEPTH) {
    out.push({ severity: "block", pattern: "scan_depth_exceeded", path });
    return out;
  }
  if (value === null || value === undefined) return out;

  const t = typeof value;
  if (t === "string") {
    scanString(value, path, out);
    return out;
  }
  if (t === "number" || t === "boolean") return out;
  if (t === "function" || t === "symbol") {
    out.push({ severity: "block", pattern: "non_serializable_value", path });
    return out;
  }
  if (seen.has(value)) {
    out.push({ severity: "block", pattern: "circular_reference", path });
    return out;
  }
  seen.add(value);

  if (Array.isArray(value)) {
    value.forEach((v, i) => scan(v, path + "[" + i + "]", out, depth + 1, seen));
    return out;
  }
  Object.keys(value).forEach((k) => {
    const childPath = path + "." + k;
    if (isSensitiveKey(k)) {
      const v = value[k];
      const empty = v === null || v === undefined || v === "";
      if (!empty) out.push({ severity: "redact", pattern: "sensitive_key:" + k, path: childPath });
      return; /* do not scan the value itself -- it never gets copied anywhere */
    }
    scan(value[k], childPath, out, depth + 1, seen);
  });
  return out;
}

function findings(value) {
  return scan(value, "$", [], 0, new Set());
}

function blockingFindings(value) {
  return findings(value).filter((f) => f.severity === "block");
}

/* Deep copy with sensitive fields masked and credential-shaped strings
   replaced. Never mutates the input. */
function redact(value, depth, seen) {
  depth = depth || 0;
  seen = seen || new Set();
  if (depth > MAX_SCAN_DEPTH) return MASK;
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === "string") {
    let s = value;
    BLOCKING_PATTERNS.forEach((p) => {
      if (p.re.test(s)) s = s.replace(new RegExp(p.re.source, p.re.flags.replace("g", "") + "g"), MASK);
    });
    return s;
  }
  if (t === "number" || t === "boolean") return value;
  if (t === "function" || t === "symbol") return MASK;
  if (seen.has(value)) return MASK;
  seen.add(value);

  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1, seen));

  const out = {};
  Object.keys(value).forEach((k) => {
    out[k] = isSensitiveKey(k) ? MASK : redact(value[k], depth + 1, seen);
  });
  return out;
}

/* Throws on anything credential-shaped. Sensitive *field names* are not an
   error -- redact() handles those -- so callers get a usable record. */
function assertClean(value) {
  const blocking = blockingFindings(value);
  if (blocking.length > 0) throw new SecretError(blocking);
  return true;
}

module.exports = {
  MASK,
  SENSITIVE_KEYS,
  BLOCKING_PATTERNS,
  SecretError,
  isSensitiveKey,
  findings,
  blockingFindings,
  redact,
  assertClean
};
