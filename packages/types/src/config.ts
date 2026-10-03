export interface EnvConfig {
  env: string;
  host: string;
  port: number;
  db: {
    client: string;
    connection: string;
  };
}
