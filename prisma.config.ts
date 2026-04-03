import { config as loadEnvFile } from 'dotenv';
import { defineConfig, env } from 'prisma/config';
import { rootEnvFilePath } from './src/config/root-env-path';

loadEnvFile({ path: rootEnvFilePath });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
