import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../.env") });

if (process.env.DATABASE_URL_TEST) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
}

if (process.env.MIGRATE_DATABASE_URL_TEST) {
  process.env.MIGRATE_DATABASE_URL = process.env.MIGRATE_DATABASE_URL_TEST;
}
