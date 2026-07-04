const CONFIG_MARK = "<!--PORTAL_CONFIG:";
const CONFIG_END = ":END-->";

export function parsePortalConfig(
  notesOrConfig: string | Record<string, unknown> | null | undefined,
): {
  assigned_cases: string[];
  permissions: string[];
  username: string | null;
  user_notes: string;
} {
  // Support both the legacy `notes` embedded config and a new structured `portal_config` object.
  if (!notesOrConfig)
    return { assigned_cases: [], permissions: [], username: null, user_notes: "" };
  if (typeof notesOrConfig === "object") {
    const cfg = notesOrConfig as any;
    return {
      assigned_cases: Array.isArray(cfg.assigned_cases) ? cfg.assigned_cases : [],
      permissions: Array.isArray(cfg.permissions) ? cfg.permissions : [],
      username: typeof cfg.username === "string" ? cfg.username : null,
      user_notes: typeof cfg.user_notes === "string" ? cfg.user_notes : "",
    };
  }

  const notes = notesOrConfig as string;
  const m = notes.match(new RegExp(`${CONFIG_MARK}([\s\S]*?)${CONFIG_END}`));
  const user_notes = notes
    .replace(new RegExp(`${CONFIG_MARK}[\s\S]*?${CONFIG_END}`, "g"), "")
    .trim();
  if (!m) return { assigned_cases: [], permissions: [], username: null, user_notes };
  try {
    const cfg = JSON.parse(m[1]);
    return {
      assigned_cases: Array.isArray(cfg.assigned_cases) ? cfg.assigned_cases : [],
      permissions: Array.isArray(cfg.permissions) ? cfg.permissions : [],
      username: cfg.username ?? null,
      user_notes,
    };
  } catch {
    return { assigned_cases: [], permissions: [], username: null, user_notes };
  }
}
