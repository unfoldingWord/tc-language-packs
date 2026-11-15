export type Env = {
  ASSETS: Fetcher;
  PACKS: R2Bucket;
  REQUESTS: KVNamespace;
  STAGING: Fetcher;
  PARTS_COMPAT: string;
  TURNSTILE_SITE_KEY: string;
  TURNSTILE_SECRET: string;
};
