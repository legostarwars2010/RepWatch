import type { JsonObject, PipelineV2Db, QueryResult } from "../types";

type PgLikeClient = {
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;
};

function getEnv(name: string): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

function requirePgClient(): Promise<PgLikeClient> {
  return import("pg")
    .then((pkg) => {
      const PoolCtor = (pkg as unknown as { Pool?: new (options: JsonObject) => PgLikeClient }).Pool;
      if (!PoolCtor) {
        throw new Error("pg.Pool is unavailable for pipeline_v2 database adapter.");
      }
      const databaseUrl = getEnv("DATABASE_URL");
      if (!databaseUrl) {
        throw new Error("DATABASE_URL is required for pipeline_v2 database adapter.");
      }
      return new PoolCtor({ connectionString: databaseUrl });
    })
    .catch((error) => {
      throw new Error(`Unable to initialize pipeline_v2 DB adapter: ${(error as Error).message}`);
    });
}

export async function createPipelineV2Db(): Promise<PipelineV2Db> {
  const client = await requirePgClient();
  return {
    async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
      const result = await client.query(sql, params);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount ?? result.rows.length
      };
    }
  };
}
