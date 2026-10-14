import type { CopilotLink } from '../../core/services/copilot/types';
import { PANEL_PATHS, isPanelId } from './navigation';

/**
 * URL a copilot button opens. The link target is a panel name, so the path comes
 * from the same table the sidebar uses. `section` travels in the query so the
 * destination can jump to it once its data is on screen.
 */
export function copilotLinkHref(link: CopilotLink): string {
  const path = isPanelId(link.target) ? PANEL_PATHS[link.target] : PANEL_PATHS.dashboard;
  const params = new URLSearchParams(link.query ?? {});
  if (link.section) params.set('section', link.section);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** Accepts only well-formed links, so old saved chats or odd payloads cannot break the page. */
export function parseCopilotLinks(value: unknown): CopilotLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (l): l is CopilotLink =>
      Boolean(l) &&
      typeof l.label === 'string' &&
      typeof l.target === 'string' &&
      isPanelId(l.target),
  );
}
