// Isolated behind its own module because jest cannot parse pdfjs-dist's
// legacy build directly: it uses `import.meta` (confirmed empirically —
// "Cannot use 'import.meta' outside a module" — when jest tries to load
// web/app/api/plan-file/read-pdf/route.ts with the import inline). Unit
// tests mock this module instead; the real read is proven by a standalone
// Node script outside the repo, and separately by a real Next.js build.

export interface PdfKeywordsResult {
  keywords: string | null;
}

/** Throws on an encrypted, corrupt or truncated PDF; the caller turns that into a clear user-facing message. */
export async function readPdfKeywords(buffer: Buffer): Promise<PdfKeywordsResult> {
  let loadingTask: any = null;
  try {
    const pdfjsLib: any = await import('pdfjs-dist/legacy/build/pdf.mjs');
    loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    });

    const doc = await loadingTask.promise;
    try {
      const metadata = await doc.getMetadata();
      const rawKeywords = metadata?.info?.Keywords;
      return { keywords: typeof rawKeywords === 'string' && rawKeywords.length > 0 ? rawKeywords : null };
    } finally {
      // Confirmed empirically against the installed pdfjs-dist version: the
      // document proxy has cleanup(), not destroy() — an earlier scratch
      // test on pdfjs 6.x hit exactly "destroy is not a function" calling
      // the wrong one. loadingTask.destroy() below is the real teardown.
      if (doc && typeof doc.cleanup === 'function') {
        await doc.cleanup();
      }
    }
  } finally {
    if (loadingTask && typeof loadingTask.destroy === 'function') {
      try {
        await loadingTask.destroy();
      } catch {
        // Already failed to load; nothing more to release.
      }
    }
  }
}
