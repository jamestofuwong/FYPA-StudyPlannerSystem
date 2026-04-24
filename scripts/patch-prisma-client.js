#!/usr/bin/env node
/**
 * Patches the generated Prisma client's package.json to use a stable package name.
 *
 * Prisma generates a random hash-based name (e.g. "prisma-client-abc123...").
 * Next.js's serverExternalPackages needs a stable name to exclude the client
 * from webpack bundling — otherwise __dirname is wrong and the native query
 * engine binary can't be found at runtime.
 */

'use strict';

const path = require('path');
const fs = require('fs');

const clientPkg = path.join(__dirname, '..', 'core', 'db', 'generated', 'client', 'package.json');

if (!fs.existsSync(clientPkg)) {
  console.error('[patch-prisma-client] package.json not found at:', clientPkg);
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(clientPkg, 'utf-8'));
pkg.name = '@local/prisma-client';
fs.writeFileSync(clientPkg, JSON.stringify(pkg, null, 2));

console.log('[patch-prisma-client] Set name to @local/prisma-client');
