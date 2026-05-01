import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile, copyFile } from "fs/promises";

const require = createRequire(import.meta.url);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times without risking some
// packages that are not bundle compatible
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) =>
      !allowlist.includes(dep) &&
      !(pkg.dependencies?.[dep]?.startsWith("workspace:")),
  );

  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "index.cjs"),
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // connect-pg-simple loads ./table.sql at runtime via fs.readFile relative
  // to its own __dirname. esbuild bundles the JS but not the SQL data file,
  // so the bundle ends up looking for `<distDir>/table.sql`. Copy it.
  // This MUST succeed: without it, session table bootstrap throws ENOENT
  // in production and login redirects fail with a 500. Fail the build.
  const tableSqlPath = require.resolve("connect-pg-simple/table.sql");
  await copyFile(tableSqlPath, path.resolve(distDir, "table.sql"));
  console.log("copied connect-pg-simple/table.sql -> dist/table.sql");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
