export interface EnvConfig {
  superadminPassword?: string;
  metricsToken?: string;
  attachmentStorageDirectory: string;
  env: string;
  host: string;
  port: number;
  db: {
    client: string;
    connection: string;
  };
  log?: {
    level?: string;
    dir?: string;
    fileName?: string;
    enableFile?: boolean;
    prettyPrint?: boolean;
  };
  auth?: {
    /** Persistent HMAC secret for access tokens; required in every environment (>= 32 chars). */
    jwtSecret?: string;
    accessTtlSeconds: number;
    refreshTtlSeconds: number;
    /** Max login attempts per IP per minute. */
    loginRateMax: number;
  };
}
