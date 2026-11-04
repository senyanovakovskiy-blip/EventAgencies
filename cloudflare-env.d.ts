declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB?: D1Database;
    EA_ADMIN_EMAIL?: string;
    BUCKET?: R2Bucket;
  }
}
