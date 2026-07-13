import { createHash, randomUUID } from "node:crypto";

export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function newId(prefix: string): string {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  return `${prefix}_${stamp}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export function slugify(text: string): string {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug.slice(0, 64) || "skill";
}

export function slugifySkillName(text: string): string {
  const normalized = text.normalize("NFKC").trim();
  const slug = normalized.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (slug) return slug.slice(0, 64);
  if (!normalized) return "skill";

  const suffix = createHash("sha256").update(normalized).digest("hex").slice(0, 12);
  return `skill-${suffix}`;
}
