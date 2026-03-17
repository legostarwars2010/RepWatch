export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

export interface PipelineV2Db {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}

export interface PipelineRunMetadata {
  pipelineVersion: string;
  promptVersion: string;
  modelName: string;
}

export interface PipelineRunRecord {
  id: number;
  runType: string;
  status: string;
  validationStatus: string;
}
