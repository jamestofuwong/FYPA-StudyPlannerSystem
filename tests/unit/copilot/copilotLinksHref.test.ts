import { copilotLinkHref, parseCopilotLinks } from '../../../web/lib/copilotLinks';

describe('copilotLinkHref', () => {
  it('uses the sidebar paths', () => {
    expect(copilotLinkHref({ label: 'x', target: 'planners' })).toBe('/planners');
    expect(copilotLinkHref({ label: 'x', target: 'scraping' })).toBe('/scraping');
  });

  it('adds the query and the section', () => {
    const href = copilotLinkHref({
      label: 'x',
      target: 'dashboard',
      section: 'graduation',
      query: { studentId: '102780123', enrollMode: 'latest', handoff: 'abc' },
    });
    const [path, query] = href.split('?');
    expect(path).toBe('/dashboard');
    const params = new URLSearchParams(query);
    expect(params.get('studentId')).toBe('102780123');
    expect(params.get('handoff')).toBe('abc');
    expect(params.get('section')).toBe('graduation');
  });

  it('encodes unsafe characters', () => {
    const href = copilotLinkHref({ label: 'x', target: 'units', query: { q: 'a b&c=d' } });
    expect(new URLSearchParams(href.split('?')[1]).get('q')).toBe('a b&c=d');
  });
});

describe('parseCopilotLinks', () => {
  it('keeps well-formed links and drops everything else', () => {
    expect(
      parseCopilotLinks([
        { label: 'ok', target: 'units' },
        { label: 'bad page', target: 'nowhere' },
        { target: 'units' },
        null,
        'text',
      ]),
    ).toEqual([{ label: 'ok', target: 'units' }]);
  });

  it('returns nothing for old messages that have no links', () => {
    expect(parseCopilotLinks(undefined)).toEqual([]);
    expect(parseCopilotLinks({})).toEqual([]);
  });
});
