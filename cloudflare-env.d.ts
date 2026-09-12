declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    IFM_API_KEY?: string;
    XAI_API_KEY?: string;
    IFM_MODEL?: string;
  }
}
