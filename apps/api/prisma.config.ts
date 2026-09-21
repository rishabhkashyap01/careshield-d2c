import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// `prisma generate` (run on `npm install`) doesn't need a database, so a
// missing DATABASE_URL must not break installs. Commands that do talk to the
// DB (migrate, studio) will still fail loudly if it's unset.
//
// Migrations prefer DATABASE_URL_UNPOOLED: on Neon (as set up by its Vercel
// integration) DATABASE_URL goes through a connection pooler, and migrations
// should use a direct connection.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? '',
  },
});
