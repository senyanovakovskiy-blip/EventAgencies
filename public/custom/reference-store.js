export const REFERENCE_KEY='eventagencies-work-references-v1';
export function normalizeReferences(value){return Array.isArray(value)?[...new Set(value.filter(slug=>typeof slug==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)))].slice(0,200):[];}
