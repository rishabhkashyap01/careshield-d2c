import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` (run on `npm install`) doesn't need a database, so a
// missing DATABASE_URL must not break installs. Commands that do talk to the
// DB (migrate, studio) will still fail loudly if it's unset.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
});
