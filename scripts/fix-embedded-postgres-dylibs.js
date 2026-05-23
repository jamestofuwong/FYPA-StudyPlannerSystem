#!/usr/bin/env node
/**
 * afterPack hook for electron-builder.
 *
 * electron-builder does not preserve symlinks when copying node_modules into
 * the app bundle. The embedded-postgres darwin-arm64 package ships versioned
 * ICU dylibs (e.g. libicudata.77.1.dylib) and unversioned symlinks (e.g.
 * libicudata.77.dylib → libicudata.77.1.dylib).  When the symlinks are
 * missing the postgres binary fails at startup with:
 *   "Library not loaded: @loader_path/../lib/libicudata.77.dylib"
 *
 * This hook recreates the symlinks inside the packed .app bundle.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appOutDir  = context.appOutDir;
  const productName = context.packager.appInfo.productFilename;
  const libDir = path.join(
    appOutDir,
    `${productName}.app`,
    'Contents', 'Resources', 'app',
    'node_modules', '@embedded-postgres', 'darwin-arm64', 'native', 'lib'
  );

  if (!fs.existsSync(libDir)) {
    console.log('[fix-embedded-postgres-dylibs] lib dir not found, skipping:', libDir);
    return;
  }

  const files = fs.readdirSync(libDir);

  // Build a map: basename-without-patch → versioned filename
  // e.g. "libicudata.77" → "libicudata.77.1.dylib"
  const versionedMap = {};
  for (const f of files) {
    // Match files like libicudata.77.1.dylib  (name.major.minor.dylib)
    const m = f.match(/^(.+\.\d+)\.\d+\.dylib$/);
    if (m) {
      versionedMap[m[1]] = f; // key: "libicudata.77"
    }
  }

  let fixed = 0;
  for (const [base, target] of Object.entries(versionedMap)) {
    const symlinkName = `${base}.dylib`;
    const symlinkPath = path.join(libDir, symlinkName);

    if (!fs.existsSync(symlinkPath)) {
      console.log(`[fix-embedded-postgres-dylibs] creating symlink: ${symlinkName} → ${target}`);
      fs.symlinkSync(target, symlinkPath);
      fixed++;
    }
  }

  if (fixed === 0) {
    console.log('[fix-embedded-postgres-dylibs] all symlinks already present, nothing to do.');
  } else {
    console.log(`[fix-embedded-postgres-dylibs] created ${fixed} symlink(s).`);
  }
};
