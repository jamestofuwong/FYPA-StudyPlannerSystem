import { defineConfig } from "@prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    // This tells Prisma to use the environment variable
    url: process.env.DATABASE_URL ?? "",
  },
});
