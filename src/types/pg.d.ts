declare module "pg" {
  export interface PoolConfig {
    connectionString?: string;
    [key: string]: unknown;
  }

  export class Pool {
    constructor(config?: PoolConfig);
  }
}
