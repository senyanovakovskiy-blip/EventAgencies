declare namespace Cloudflare {
  interface Env {
    ASSETS: Fetcher;
    DB?: D1Database;
    EA_ADMIN_EMAIL?: string;
    EA_INVITATION_HASH?: string;
    EA_INVITATION_EXPIRES?: string;
    BUCKET?: R2Bucket;
  }
}
