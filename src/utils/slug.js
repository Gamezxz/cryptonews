import { NewsItem } from "../db/models.js";

// Generate URL-friendly slug from title
export function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

// Ensure slug is unique by appending a counter if needed
export async function ensureUniqueSlug(baseSlug) {
  let slug = baseSlug;
  let counter = 0;

  while (true) {
    const existing = await NewsItem.findOne({ slug }).select("_id").lean();
    if (!existing) return slug;
    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

// Generate and ensure unique slug from title
export async function createSlug(title) {
  const base = generateSlug(title);
  if (!base) return null;
  return ensureUniqueSlug(base);
}
