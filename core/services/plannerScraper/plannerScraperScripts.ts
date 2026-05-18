/**
 * plannerScraperScripts.ts
 *
 * All browser-side JavaScript is kept here as IIFE template strings, mirroring
 * the pattern in advisorScraperScripts.ts. Each function returns a string that
 * is passed to BrowserAdapter.evaluate(). Scripts run in the page context and
 * must be self-contained — no imports, no external references.
 *
 * Return shape convention (always an object):
 *   { success: true,  ...payload }
 *   { success: false, error: string }
 */

// ---------------------------------------------------------------------------
// Helper used inside injected scripts (inlined at injection time)
// ---------------------------------------------------------------------------

const HELPERS = /* js */ `
  const norm = (s) => (s ?? '').replace(/\\s+/g, ' ').trim();
`;

// ---------------------------------------------------------------------------
// Script 1: Wait for page content
// ---------------------------------------------------------------------------

/**
 * Polls for the presence of at least one .tab_container element.
 * Returns once found, or times out and returns failure.
 */
export function WAIT_FOR_CONTENT_JS(timeoutMs = 15_000): string {
  return `
  (async () => {
    const deadline = Date.now() + ${JSON.stringify(timeoutMs)};
    while (Date.now() < deadline) {
      const tabs = document.querySelectorAll('.tab_container');
      if (tabs.length > 0) {
        return { success: true, tabCount: tabs.length };
      }
      await new Promise(r => setTimeout(r, 400));
    }
    return { success: false, error: 'Timed out waiting for .tab_container elements (${timeoutMs}ms)' };
  })()
  `;
}

// ---------------------------------------------------------------------------
// Script 2: Detect year tabs
// ---------------------------------------------------------------------------

/**
 * Reads all .tab_container elements and extracts the year label from each
 * child h3. Returns the count and the list of year strings.
 */
export const DETECT_YEAR_TABS_JS = /* js */ `
(async () => {
  try {
    ${HELPERS}
    const tabs = document.querySelectorAll('.tab_container');
    if (!tabs.length) {
      return { success: false, error: 'No .tab_container elements found on page' };
    }

    const years = Array.from(tabs).map((tab, i) => {
      const h3 = tab.querySelector('h3');
      return h3 ? norm(h3.textContent) : 'Unknown Year ' + (i + 1);
    });

    return { success: true, tabCount: tabs.length, years };
  } catch (e) {
    return { success: false, error: String(e) };
  }
})()
`;

// ---------------------------------------------------------------------------
// Script 3: Scrape the full planner index
// ---------------------------------------------------------------------------

/**
 * Iterates every .tab_container → table → tbody row and extracts:
 *   - year (from the container's h3)
 *   - unitCode   (td[0] > p)
 *   - courseName (td[1] > p, text before the em, without surrounding quotes)
 *   - intakeMonth (td[1] > p > em)
 *   - programLevel (td[2] > p)
 *   - pdfUrl     (td[3] > p > a[href])
 *   - lastUpdated (td[3] > h6, stripped of "Last updated:" prefix)
 *
 * The first <tr> of each tbody is the header row and is always skipped.
 */
export const SCRAPE_PLANNER_INDEX_JS = /* js */ `
(async () => {
  try {
    ${HELPERS}

    const tabs = document.querySelectorAll('.tab_container');
    if (!tabs.length) {
      return { success: false, error: 'No .tab_container elements found' };
    }

    const entries = [];
    const skippedRows = [];

    for (const tab of Array.from(tabs)) {
      const h3 = tab.querySelector('h3');
      const year = h3 ? norm(h3.textContent) : 'Unknown';

      const tbody = tab.querySelector('.table-responsive table tbody');
      if (!tbody) {
        skippedRows.push({ year, reason: 'No tbody found inside .table-responsive' });
        continue;
      }

      const rows = Array.from(tbody.querySelectorAll('tr'));

      // First row is always the header — skip it
      for (const row of rows.slice(1)) {
        const tds = row.querySelectorAll('td');
        if (tds.length < 4) {
          skippedRows.push({ year, reason: 'Row has fewer than 4 <td> elements (' + tds.length + ')' });
          continue;
        }

        // td[0]: unit code
        const unitCode = norm(tds[0].querySelector('p')?.textContent);

        // td[1]: course name (in curly/straight quotes) + intake (em)
        // Some rows have two <em> tags: one for the major specialisation and
        // one for the intake month. e.g.:
        //   <p>"Diploma of IT"<em>Data Science</em><em>March intake</em></p>
        // We identify the intake em by checking for month keywords or "intake".
        const courseP = tds[1].querySelector('p');
        // Extract only the direct text nodes, not any em children
        let courseRaw = '';
        if (courseP) {
          for (const node of Array.from(courseP.childNodes)) {
            if (node.nodeType === Node.TEXT_NODE) {
              courseRaw += node.textContent;
            }
          }
        }
        // Strip any surrounding quotation marks (", ", ", ')
        const courseName = norm(courseRaw).replace(/^["""'']+|["""'']+$/g, '');

        // Identify intake month and major from <em> elements.
        // Three portal row formats observed:
        //   (A) Single <em>March intake</em>
        //   (B) Two <em>: <em>Data Science</em><em>March intake</em>
        //   (C) Single <em> with <br>: <em>Data Science<br>March intake</em>
        const monthKeywords = [
          'january','february','march','april','may','june','july','august',
          'september','october','november','december','intake',
          'jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec',
        ];
        const isIntakeText = (t) => monthKeywords.some(k => t.toLowerCase().includes(k));

        // Extract text segments from an <em>, splitting on <br> into separate parts.
        const emSegments = (em) => {
          const parts = [];
          let current = '';
          for (const node of Array.from(em.childNodes)) {
            if (node.nodeName === 'BR') {
              const t = norm(current);
              if (t) parts.push(t);
              current = '';
            } else {
              current += node.textContent;
            }
          }
          const t = norm(current);
          if (t) parts.push(t);
          return parts;
        };

        const ems = Array.from(courseP?.querySelectorAll('em') ?? []);
        let intakeMonth = '';
        let majorName = '';

        // Collect all text segments across all ems, preserving per-em <br> splits
        const allSegments = ems.flatMap(em => emSegments(em));

        const intakeParts = allSegments.filter(s => isIntakeText(s));
        const majorParts  = allSegments.filter(s => !isIntakeText(s));

        intakeMonth = intakeParts.join(' / ');
        majorName   = majorParts.join(', ');

        // td[2]: program level
        const programLevel = norm(tds[2].querySelector('p')?.textContent);

        // td[3]: PDF link + last updated
        const td3p = tds[3].querySelector('p');
        const anchor = td3p?.querySelector('a');
        const pdfUrl = anchor?.href ?? anchor?.getAttribute('href') ?? '';
        const lastUpdatedRaw = norm(tds[3].querySelector('h6')?.textContent);
        const lastUpdated = lastUpdatedRaw.replace(/^Last updated:\\s*/i, '');

        // Skip rows that have no useful data
        if (!unitCode && !pdfUrl) {
          skippedRows.push({ year, reason: 'Row has no unitCode and no pdfUrl — likely a blank row' });
          continue;
        }

        entries.push({
          year,
          unitCode,
          courseName,
          majorName,
          intakeMonth,
          programLevel,
          pdfUrl,
          lastUpdated,
        });
      }
    }

    return {
      success: true,
      entries,
      totalRows: entries.length,
      tabCount: tabs.length,
      skippedRows,
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
})()
`;

// ---------------------------------------------------------------------------
// Script 4: Verify a PDF link is reachable (HEAD request from page context)
// ---------------------------------------------------------------------------

/**
 * Sends a HEAD request to the given URL from within the page context (inherits
 * the page's cookies/session). Returns the HTTP status and content-type.
 * Useful to detect broken or login-gated PDF links before committing to a
 * full download.
 */
export function VERIFY_PDF_LINK_JS(url: string): string {
  return `
  (async () => {
    try {
      const res = await fetch(${JSON.stringify(url)}, { method: 'HEAD', redirect: 'follow' });
      return {
        success: res.ok,
        status: res.status,
        contentType: res.headers.get('content-type') ?? '',
        finalUrl: res.url,
      };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  })()
  `;
}
