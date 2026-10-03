export interface EnvConfig {
  superadminPassword?: string;
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
}
