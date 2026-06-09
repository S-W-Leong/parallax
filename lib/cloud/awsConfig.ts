export type AwsStorageConfig = {
  region: string;
  tableName: string;
  bucketName: string;
};

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is required for Parallax AWS storage.`);
  return value;
}

export function readAwsStorageConfig(env: Env = process.env): AwsStorageConfig {
  return {
    region: required(env, "AWS_REGION"),
    tableName: required(env, "PARALLAX_THREADS_TABLE"),
    bucketName: required(env, "PARALLAX_ARTIFACT_BUCKET"),
  };
}
