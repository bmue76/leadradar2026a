// src/types/pg-augment.d.ts
import "pg";

declare module "pg" {
  // Merge into exported class instance type
  interface Pool {
    end(): Promise<void>;
    end(callback: (err?: Error) => void): void;
  }
}

export {};
