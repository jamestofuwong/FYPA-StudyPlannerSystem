#!/usr/bin/env node
/**
 * afterPack hook for electron-builder.
 *
 * electron-builder does not preserve symlinks when copying node_modules into
 * the app bundle. The embedded-postgres darwin-arm64 package ships versioned
 * dylibs (e.g. libzstd.1.5.7.dylib, libicudata.77.1.dylib) alongside
 * shorter-version symlinks (e.g. libzstd.1.dylib, libzstd.dylib).
 * When the symlinks are missing postgres fails at startup with:
 *   "Library not loaded: @loader_path/../lib/libzstd.1.dylib"
 *
 * This hook finds every fully-versioned .dylib (real file, not symlink) and
 * recreates all intermediate symlinks inside the packed .app bundle.
 *
 * Example: libzstd.1.5.7.dylib → creates libzstd.1.5.dylib, libzstd.1.dylib,
 *          libzstd.dylib if any of them are missing.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appOutDir   = context.appOutDir;
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

  const entries = fs.readdirSync(libDir);

  // Find real files (not symlinks) that look like libname.v1.v2...dylib
  const realFiles = entries.filter(f => {
    if (!f.endsWith('.dylib')) return false;
    const stat = fs.lstatSync(path.join(libDir, f));
    return stat.isFile() && !stat.isSymbolicLink();
  });

  let fixed = 0;

  for (const realFile of realFiles) {
    // Match: lib<name>.<d1>.<d2>[.<d3>...].dylib  (at least 2 version parts)
    const m = realFile.match(/^(lib[^.]+)\.(\d+(?:\.\d+)+)\.dylib$/);
    if (!m) continue;

    const baseName    = m[1];            // e.g. "libzstd"
    const versionStr  = m[2];            // e.g. "1.5.7"
    const parts       = versionStr.split('.');

    // Generate all shorter-version names, including the unversioned one.
    // For parts=[1,5,7]: create libzstd.1.5.dylib, libzstd.1.dylib, libzstd.dylib
    for (let i = parts.length - 1; i >= 0; i--) {
      const shortVersion = parts.slice(0, i).join('.');
      const symlinkName  = shortVersion
        ? `${baseName}.${shortVersion}.dylib`
        : `${baseName}.dylib`;
      const symlinkPath  = path.join(libDir, symlinkName);

      if (!fs.existsSync(symlinkPath)) {
        console.log(`[fix-embedded-postgres-dylibs] ${symlinkName} → ${realFile}`);
        fs.symlinkSync(realFile, symlinkPath);
        fixed++;
      }
    }
  }

  if (fixed === 0) {
    console.log('[fix-embedded-postgres-dylibs] all symlinks already present.');
  } else {
    console.log(`[fix-embedded-postgres-dylibs] created ${fixed} symlink(s).`);
  }
};
