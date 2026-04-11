// ---------------------------------------------------------------------------
// JavaScript strings injected into the Electron webview at each scrape step.
// These are pure constants — no Electron or React dependencies.
// ---------------------------------------------------------------------------

export const FIND_IFRAME_POLLING_JS = `
  (async () => {
    const findSrc = () => {
      const iframes = Array.from(document.querySelectorAll("iframe"));
      for (const f of iframes) {
        const src = (f.getAttribute("src") || "").trim();
        if (!src || src === "about:blank" || src.startsWith("javascript:")) continue;
        try { return new URL(src, location.href).href; } catch { continue; }
      }
      return null;
    };
    const start = Date.now();
    while (Date.now() - start < 15000) {
      const src = findSrc();
      if (src) return src;
      await new Promise(r => setTimeout(r, 300));
    }
    return null;
  })()
`;

export const WAIT_FOR_KENDO_DROPDOWN_JS = `
  (async () => {
    const isVisible = (el) => {
      try {
        if (!el) return false;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      } catch { return false; }
    };
    const start = Date.now();
    while (Date.now() - start < 20000) {
      const el = document.querySelector('kendo-dropdownlist');
      if (el && isVisible(el)) return true;
      await new Promise(r => setTimeout(r, 300));
    }
    return false;
  })()
`;

export const CLICK_STUDENT_DROPDOWN_JS = `
  (async () => {
    const normalizeText = (t) => (t ?? "").replace(/\\s+/g, " ").trim();
    const isVisible = (el) => {
      try {
        if (!el || el.nodeType !== 1) return false;
        const style = getComputedStyle(el);
        if (!style) return false;
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (Number(style.opacity) === 0) return false;
        const r = el.getBoundingClientRect?.();
        if (!r) return true;
        return r.width > 0 && r.height > 0;
      } catch { return false; }
    };
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    const host = document.querySelector('kendo-dropdownlist') ?? null;

    if (!host) {
      return { url: location.href, found: false, clicked: false, expanded: false,
               listItemCount: 0, options: [], ariaExpanded: null };
    }

    try { host.scrollIntoView({ block: "center", inline: "center" }); } catch {}
    try { host.style.outline = "4px solid #00ff5a"; host.style.outlineOffset = "2px"; } catch {}

    const pickInteractive = (root) => {
      const selectors = [".k-input-button", ".k-select", "button",
                         "[role='combobox']", ".k-input", "span.k-input"];
      for (const s of selectors) {
        const el = root.querySelector?.(s);
        if (el && isVisible(el)) return el;
      }
      return root;
    };

    const trigger = pickInteractive(host);
    try { trigger.style.outline = "4px solid #00ff5a"; trigger.style.outlineOffset = "2px"; } catch {}

    const clickAtCenter = (el) => {
      try {
        const r = el.getBoundingClientRect();
        const clientX = r.left + r.width / 2;
        const clientY = r.top + r.height / 2;
        const mk = (type) =>
          new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX, clientY });
        el.dispatchEvent(mk("pointerover")); el.dispatchEvent(mk("mouseover"));
        el.dispatchEvent(mk("mousemove")); el.dispatchEvent(mk("pointerdown"));
        el.dispatchEvent(mk("mousedown")); el.dispatchEvent(mk("mouseup"));
        el.dispatchEvent(mk("pointerup")); el.dispatchEvent(mk("click"));
        return true;
      } catch { try { el.click?.(); return true; } catch { return false; } }
    };

    let clicked = false;
    try { trigger.focus?.(); } catch {}
    clicked = clickAtCenter(trigger);
    if (!clicked && trigger !== host) clicked = clickAtCenter(host);

    await delay(350);

    const combobox =
      trigger.closest?.("[role='combobox']") ??
      host.querySelector?.("[role='combobox']") ?? null;
    const ariaExpanded = combobox?.getAttribute?.("aria-expanded") ?? null;

    const listContainer =
      document.querySelector(".k-animation-container .k-list-container") ??
      document.querySelector(".k-list-container") ??
      document.querySelector(".k-popup") ?? null;

    const items = Array.from(
      document.querySelectorAll(".k-list-container .k-item, .k-popup .k-item, li.k-item")
    ).filter(el => isVisible(el));

    const expanded =
      ariaExpanded === "true" || (listContainer ? isVisible(listContainer) : false);

    const scope = listContainer ?? document;
    const optionLis = Array.from(scope.querySelectorAll("li")).filter(li => {
      try { return li.nodeType === 1 && isVisible(li); } catch { return false; }
    });

    const options = [];
    const seen = new Set();
    for (const li of optionLis) {
      const span =
        li.querySelector("div span") ??
        li.querySelector(".multidropdowncol-list span") ??
        li.querySelector("span");
      const text = normalizeText(span?.textContent);
      if (!text) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      const value =
        li.getAttribute("data-value") ??
        li.getAttribute("data-id") ??
        li.getAttribute("value") ?? null;
      options.push({ text, value });
    }

    return { url: location.href, found: true, clicked, expanded,
             listItemCount: items.length, options, ariaExpanded };
  })()
`;

export const WAIT_FOR_KENDO_LIST_JS = `
  (async () => {
    const findList = () => {
      const listEl = document.querySelector('kendo-list');
      if (!listEl) return null;
      const div = listEl.querySelector('div');
      if (!div) return null;
      const ul = div.querySelector('ul');
      if (!ul) return null;
      return ul;
    };

    const check = () => {
      const ul = findList();
      if (!ul) return false;
      const lis = ul.querySelectorAll('li');
      return lis.length > 0;
    };

    const start = Date.now();
    while (Date.now() - start < 30000) {
      if (check()) {
        const ul = findList();
        const lis = Array.from(ul.querySelectorAll('li')).map(li => li.textContent.trim());
        return { success: true, listItems: lis, itemCount: lis.length };
      }
      await new Promise(r => setTimeout(r, 500));
    }
    return { success: false, error: "Timeout waiting for kendo-list to populate" };
  })()
`;

// Click a neutral area of the page to dismiss any open Kendo popup/dropdown.
export const DISMISS_DROPDOWN_JS = `
  (() => {
    // Try Escape first — cleanest way to close a Kendo popup
    document.activeElement?.dispatchEvent?.(
      new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Escape", code: "Escape", keyCode: 27 })
    );
    // Also click the page heading / a known-safe element so focus moves away
    const safe =
      document.querySelector("h1, h2, h3, h4, h5, app-root, .container, main, body") ?? document.body;
    try {
      const r = safe.getBoundingClientRect();
      const cx = r.left + 10;
      const cy = r.top + 10;
      const mk = (t) => new MouseEvent(t, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy });
      safe.dispatchEvent(mk("pointerdown"));
      safe.dispatchEvent(mk("mousedown"));
      safe.dispatchEvent(mk("mouseup"));
      safe.dispatchEvent(mk("pointerup"));
      safe.dispatchEvent(mk("click"));
    } catch {}
    return true;
  })()
`;

export function ENTER_STUDENT_ID_JS(studentId: string): string {
  return `
  (async () => {
    const targetId = ${JSON.stringify(studentId)};
    const norm = (t) => (t ?? "").replace(/\\s+/g, " ").trim();

    let popup = document.querySelector('.k-popup, .k-animation-container .k-list-container');
    let attempts = 0;
    while (!popup && attempts < 20) {
      await new Promise(r => setTimeout(r, 200));
      popup = document.querySelector('.k-popup, .k-animation-container .k-list-container');
      attempts++;
    }
    if (!popup) return { success: false, error: "Popup not found" };

    const input = popup.querySelector('input, [role="textbox"], .k-input');
    if (!input) return { success: false, error: "Input not found in popup" };

    input.focus();
    input.value = targetId;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    const listUl = document.querySelector('kendo-list ul');
    if (!listUl) return { success: false, error: "List not found" };

    let foundItem = null;
    let pollCount = 0;
    while (!foundItem && pollCount < 30) {
      await new Promise(r => setTimeout(r, 300));
      const items = listUl.querySelectorAll('li');
      for (const li of items) {
        const firstSpan = li.querySelector('div span:first-child, span:first-child');
        if (firstSpan && norm(firstSpan.textContent).includes(targetId)) {
          foundItem = li;
          break;
        }
      }
      pollCount++;
    }

    if (!foundItem) return { success: false, error: "No list item containing the ID found" };

    foundItem.click();
    await new Promise(r => setTimeout(r, 500));

    return { success: true, clickedText: norm(foundItem.textContent) };
  })()
`;
}

export const CLICK_DROPDOWN_JS = `
  (async () => {
    const hostSelector = 'kendo-dropdownlist[formcontrolname="enroll"]';

    const normalizeText = (t) => (t ?? "").replace(/\\s+/g, " ").trim();
    const isVisible = (el) => {
      try {
        if (!el || el.nodeType !== 1) return false;
        const style = getComputedStyle(el);
        if (!style) return false;
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (Number(style.opacity) === 0) return false;
        const r = el.getBoundingClientRect?.();
        if (!r) return true;
        return r.width > 0 && r.height > 0;
      } catch { return false; }
    };
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    const host =
      document.querySelector(hostSelector) ??
      document.querySelector('[formcontrolname="enroll"]') ??
      null;

    if (!host) {
      return { url: location.href, found: false, clicked: false, expanded: false,
               listItemCount: 0, options: [], ariaExpanded: null };
    }

    try { host.scrollIntoView({ block: "center", inline: "center" }); } catch {}
    try { host.style.outline = "4px solid #00ff5a"; host.style.outlineOffset = "2px"; } catch {}

    const pickInteractive = (root) => {
      const selectors = [".k-input-button", ".k-select", "button",
                         "[role='combobox']", ".k-input", "span.k-input"];
      for (const s of selectors) {
        const el = root.querySelector?.(s);
        if (el && isVisible(el)) return el;
      }
      return root;
    };

    const trigger = pickInteractive(host);
    try { trigger.style.outline = "4px solid #00ff5a"; trigger.style.outlineOffset = "2px"; } catch {}

    const clickAtCenter = (el) => {
      try {
        const r = el.getBoundingClientRect();
        const clientX = r.left + r.width / 2;
        const clientY = r.top + r.height / 2;
        const mk = (type) =>
          new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX, clientY });
        el.dispatchEvent(mk("pointerover")); el.dispatchEvent(mk("mouseover"));
        el.dispatchEvent(mk("mousemove")); el.dispatchEvent(mk("pointerdown"));
        el.dispatchEvent(mk("mousedown")); el.dispatchEvent(mk("mouseup"));
        el.dispatchEvent(mk("pointerup")); el.dispatchEvent(mk("click"));
        return true;
      } catch { try { el.click?.(); return true; } catch { return false; } }
    };

    let clicked = false;
    try { trigger.focus?.(); } catch {}
    clicked = clickAtCenter(trigger);
    if (!clicked && trigger !== host) clicked = clickAtCenter(host);

    await delay(350);

    const combobox =
      trigger.closest?.("[role='combobox']") ??
      host.querySelector?.("[role='combobox']") ?? null;
    const ariaExpanded = combobox?.getAttribute?.("aria-expanded") ?? null;

    const listContainer =
      document.querySelector(".k-animation-container .k-list-container") ??
      document.querySelector(".k-list-container") ??
      document.querySelector(".k-popup") ?? null;

    const items = Array.from(
      document.querySelectorAll(".k-list-container .k-item, .k-popup .k-item, li.k-item")
    ).filter(el => isVisible(el));

    const expanded =
      ariaExpanded === "true" || (listContainer ? isVisible(listContainer) : false);

    const scope = listContainer ?? document;
    const optionLis = Array.from(scope.querySelectorAll("li")).filter(li => {
      try { return li.nodeType === 1 && isVisible(li); } catch { return false; }
    });

    const options = [];
    const seen = new Set();
    for (const li of optionLis) {
      const span =
        li.querySelector("div span") ??
        li.querySelector(".multidropdowncol-list span") ??
        li.querySelector("span");
      const text = normalizeText(span?.textContent);
      if (!text) continue;
      if (seen.has(text)) continue;
      seen.add(text);
      const value =
        li.getAttribute("data-value") ??
        li.getAttribute("data-id") ??
        li.getAttribute("value") ?? null;
      options.push({ text, value });
    }

    return { url: location.href, found: true, clicked, expanded,
             listItemCount: items.length, options, ariaExpanded };
  })()
`;

export const FIND_AND_SELECT_JS = `
  (async () => {
    const norm = (t) => (t ?? "").replace(/\\s+/g, " ").trim();
    const isVisible = (el) => {
      try {
        if (!el || el.nodeType !== 1) return false;
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        if (Number(s.opacity) === 0) return false;
        return true;
      } catch { return false; }
    };
    const delay = (ms) => new Promise((r) => setTimeout(r, ms));

    const host =
      document.querySelector('kendo-dropdownlist[formcontrolname="enroll"]') ??
      document.querySelector('[formcontrolname="enroll"]') ?? null;
    if (!host) return { found: false, error: "dropdown host not found" };

    const trigger =
      host.querySelector(".k-input-button") ??
      host.querySelector(".k-select") ??
      host.querySelector("button") ??
      host.querySelector("[role='combobox']") ??
      host;

    const getItems = () =>
      Array.from(document.querySelectorAll(
        ".k-list-container .k-item, .k-popup .k-item, li.k-item"
      )).filter(el => isVisible(el));

    const clickTrigger = () => {
      try { host.scrollIntoView({ block: "center" }); } catch {}
      try { trigger.focus?.(); } catch {}
      const r = trigger.getBoundingClientRect?.() ?? {};
      const cx = (r.left ?? 0) + (r.width ?? 0) / 2;
      const cy = (r.top ?? 0) + (r.height ?? 0) / 2;
      const mk = (type) =>
        new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy });
      trigger.dispatchEvent(mk("pointerover"));
      trigger.dispatchEvent(mk("mouseover"));
      trigger.dispatchEvent(mk("mousemove"));
      trigger.dispatchEvent(mk("pointerdown"));
      trigger.dispatchEvent(mk("mousedown"));
      trigger.dispatchEvent(mk("mouseup"));
      trigger.dispatchEvent(mk("pointerup"));
      trigger.dispatchEvent(mk("click"));
    };

    let items = getItems();
    if (items.length === 0) {
      clickTrigger();
      await delay(400);
      items = getItems();
    }
    if (items.length === 0) {
      await delay(600);
      items = getItems();
    }
    if (items.length === 0) {
      clickTrigger();
      await delay(600);
      items = getItems();
    }
    if (items.length === 0) {
      return { found: true, expanded: false, error: "dropdown did not open", allOptions: [] };
    }

    const allOptions = [];
    const seen = new Set();
    for (const li of items) {
      const span =
        li.querySelector("div span") ??
        li.querySelector(".multidropdowncol-list span") ??
        li.querySelector("span");
      const text = norm(span?.textContent);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      const value =
        li.getAttribute("data-value") ??
        li.getAttribute("data-id") ??
        li.getAttribute("value") ?? null;
      allOptions.push({ text, value, _el: li });
    }

    const filtered = allOptions.filter(o => !o.text.includes("Mata Pelajaran Umum"));

    const extractCode = (text) => { const m = text.match(/\\(([^)]+)\\)\\s*$/); return m ? m[1] : null; };

    let best = null, bestCode = null;
    for (const opt of filtered) {
      const code = extractCode(opt.text);
      if (!code) continue;
      if (!bestCode || code > bestCode) { bestCode = code; best = opt; }
    }

    const clean = (arr) => arr.map(({ text, value }) => ({ text, value }));

    if (!best) {
      return { found: true, expanded: true,
               allOptions: clean(allOptions), filteredOptions: clean(filtered),
               selectedOption: null, clicked: false,
               error: "no option remaining after filtering" };
    }

    const item = best._el;
    item.dispatchEvent(new MouseEvent("pointerover", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("mouseover",   { bubbles: true }));
    item.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    item.dispatchEvent(new MouseEvent("mousedown",   { bubbles: true }));
    item.dispatchEvent(new MouseEvent("mouseup",     { bubbles: true }));
    item.dispatchEvent(new MouseEvent("pointerup",   { bubbles: true }));
    item.dispatchEvent(new MouseEvent("click",       { bubbles: true }));

    await delay(200);

    return {
      found: true, expanded: true,
      allOptions: clean(allOptions),
      filteredOptions: clean(filtered),
      selectedOption: { text: best.text, value: best.value },
      clicked: true,
    };
  })()
`;

export const WAIT_FOR_PROGRAM_SECTION_JS = `
  (async () => {
    const norm = (t) => (t ?? "").replace(/\\s+/g, " ").trim();
    const start = Date.now();
    while (Date.now() - start < 30000) {
      const header = Array.from(document.querySelectorAll("h5"))
        .find(el => norm(el.textContent) === "Current Program");
      if (header) return true;
      await new Promise(r => setTimeout(r, 400));
    }
    return false;
  })()
`;

export const SCRAPE_PROGRAM_DATA_JS = `
  (() => {
    const norm = (t) => (t ?? "").replace(/\\s+/g, " ").trim();

    const header = Array.from(document.querySelectorAll("h5")).find(
      el => norm(el.textContent) === "Current Program"
    );
    if (!header) return { found: false, error: "Current Program header not found" };

    let container = header.parentElement;
    let rows = [];
    for (let depth = 0; container && depth < 8; depth++) {
      rows = Array.from(container.querySelectorAll(".row"));
      rows = rows.filter(r => r.querySelector(".col-3"));
      if (rows.length) break;
      container = container.parentElement;
    }

    if (rows.length === 0) {
      let node = header.previousElementSibling;
      while (node) {
        if (node.classList && node.classList.contains("row") && node.querySelector(".col-3")) {
          rows.push(node);
        } else {
          const inner = Array.from(node.querySelectorAll(".row")).filter(
            r => r.querySelector(".col-3")
          );
          rows.push(...inner);
        }
        node = node.previousElementSibling;
      }
      node = header.nextElementSibling;
      while (node) {
        if (node.classList && node.classList.contains("row") && node.querySelector(".col-3")) {
          rows.push(node);
        } else {
          const inner = Array.from(node.querySelectorAll(".row")).filter(
            r => r.querySelector(".col-3")
          );
          rows.push(...inner);
        }
        node = node.nextElementSibling;
      }
    }

    if (rows.length === 0) {
      const table = header.closest("table");
      if (table) {
        const trs = Array.from(table.querySelectorAll("tr"));
        for (const tr of trs) {
          const tds = Array.from(tr.querySelectorAll("td"));
          if (tds.length) rows.push(tr);
        }
      }
    }

    if (rows.length === 0) return { found: true, error: "data rows not found" };

    const grid = rows.map(row => {
      const cols = Array.from(row.querySelectorAll(".col-3"));
      if (cols.length) return cols.map(col => norm(col.textContent));
      const tds = Array.from(row.querySelectorAll("td"));
      return tds.map(td => norm(td.textContent));
    });

    const cell = (r, c) => (grid[r] && grid[r][c] !== undefined) ? grid[r][c] : null;
    const data = {
      program:                       cell(0, 1),
      campus:                        cell(0, 3),
      status:                        cell(1, 1),
      areasOfStudies:                cell(1, 3),
      enrollmentCumGPA:              cell(2, 1),
      enrollDate:                    cell(2, 3),
      creditsRequiredFromEnrolment:  cell(3, 1),
      expGradDate:                   cell(3, 3),
      creditsCompletedFromEnrolment: cell(4, 1),
      creditsCurrentScheduled:       cell(4, 3),
      gradeLevel:                    cell(5, 1),
    };

    return { found: true, data, rawGrid: grid, rowCount: rows.length };
  })()
`;

export const EXTRACT_GRID_JS = `
  (() => {
    const norm = (t) => (t ?? "").replace(/\\s+/g, " ").trim();

    const gridHost = document.querySelector('kendo-grid-list');
    if (!gridHost) return { found: false, error: "Grid element not found" };

    let container = gridHost;
    for (let i = 0; i < 2; i++) {
      if (!container) break;
      container = container.querySelector('div');
    }
    if (!container) return { found: false, error: "Could not find table container" };

    const table = container.querySelector('table');
    if (!table) return { found: false, error: "Table not found" };

    const tbody = table.querySelector('tbody');
    if (!tbody) return { found: false, error: "tbody not found" };

    const rows = Array.from(tbody.querySelectorAll('tr'));
    if (rows.length === 0) return { found: true, rows: [], message: "No rows found" };

    const firstRowCells = rows[0].querySelectorAll('td');
    const isHeaderRow = firstRowCells.length > 0 &&
      (firstRowCells[0].innerText.includes("Course ID") ||
       firstRowCells[0].innerText.includes("ID") ||
       firstRowCells[0].innerText.includes("Code"));

    const startIdx = isHeaderRow ? 1 : 0;

    const courseData = [];
    for (let i = startIdx; i < rows.length; i++) {
      const cells = rows[i].querySelectorAll('td');
      if (cells.length < 7) continue;

      const getCellText = (cell) => {
        const div = cell.querySelector('div');
        return norm(div ? div.textContent : cell.textContent);
      };

      courseData.push({
        courseId:    getCellText(cells[0]),
        courseTitle: getCellText(cells[1]),
        credits:     getCellText(cells[2]),
        earned:      getCellText(cells[3]),
        status:      getCellText(cells[4]),
        grade:       getCellText(cells[5]),
        term:        getCellText(cells[6]),
      });
    }

    return { found: true, rows: courseData, rowCount: courseData.length };
  })()
`;
