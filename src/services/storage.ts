// Derives the Supabase project URL from either SUPABASE_URL directly,
// or by parsing it out of DATABASE_URL (e.g. postgresql://...@db.<project-ref>.supabase.co:5432/postgres).
export function getSupabaseUrl(): string {
  const envUrl = process.env.SUPABASE_URL;
  if (envUrl && envUrl.trim() !== '' && (envUrl.startsWith('http://') || envUrl.startsWith('https://'))) {
    return envUrl.trim();
  }
  const dbUrl = process.env.DATABASE_URL || '';
  const match = dbUrl.match(/@db\.(.*?)\.supabase\.co/);
  if (match && match[1]) {
    return `https://${match[1]}.supabase.co`;
  }
  throw new Error(
    'Could not determine Supabase URL. Set SUPABASE_URL or DATABASE_URL in your .env file.'
  );
}
