import * as service from '@core/services/scrapper/advisorScraperService';
import type { ScraperStepId } from '@shared/types/scraping';

describe('Scraper Service', () => {
  const steps: ScraperStepId[] = [
    'go-degree',
    'open-degree-iframe',
    'click-student-dropdown',
    'wait-for-kendo-list',
    'open-student-dropdown',
    'enter-student-id',
    'click-dropdown',
    'select-dropdown',
    'scrape-program-data',
  ];

  const mockAdapter = (success: boolean) => ({
    loadURL: jest.fn().mockResolvedValue(undefined),
    getURL: jest.fn().mockReturnValue('https://sisportal-100380.campusnexus.cloud'),
    executeJavaScript: jest.fn().mockResolvedValue({
      found: success,
      success,
      expanded: success,
      clicked: success,
      listItemCount: 5,
      options: success ? [{ text: 'A', value: '1' }] : [],
      data: success ? { program: 'CS' } : null,
      rows: success ? [{ courseId: '1' }] : [],
      itemCount: 5,
    }),
  });

  test.each(steps)('%s returns diagnostic logs on success', async (step) => {
    const adapter = mockAdapter(true);

    const result = await service.runScraperStep(step, adapter, { studentId: '123' });

    expect(result.logs.length).toBeGreaterThan(0);
    expect(result.logs.every((log) => typeof log === 'string')).toBe(true);
  });

  test.each(steps)('%s reports unsuccessful adapter results without throwing', async (step) => {
    const adapter = mockAdapter(false);

    const result = await service.runScraperStep(step, adapter, { studentId: '123' });

    expect(result.logs.length).toBeGreaterThan(0);
  });

  test.each([
    { input: "  'https://link.com'  ", expected: 'https://link.com' },
    { input: '"https://link.com/path"', expected: 'https://link.com/path' },
    { input: '', expected: null },
  ])('sanitizeUrl("$input") returns "$expected"', ({ input, expected }) => {
    expect(service.sanitizeUrl(input)).toBe(expected);
  });

  test('URL detection distinguishes the portal from Microsoft login', () => {
    expect(service.isLoggedInPortalUrl('https://sisportal-100380.campusnexus.cloud')).toBe(true);
    expect(service.isMicrosoftLoginUrl('https://login.microsoftonline.com/common/oauth2')).toBe(true);
    expect(service.isMicrosoftLoginUrl('https://sisportal-100380.campusnexus.cloud')).toBe(false);
  });

  test('runAllSteps executes the complete scraper workflow', async () => {
    const adapter = mockAdapter(true);

    const result = await service.runAllSteps(adapter, { studentId: '123' });

    expect(result.logs.length).toBeGreaterThanOrEqual(steps.length);
    expect(adapter.loadURL).toHaveBeenCalled();
    expect(adapter.executeJavaScript).toHaveBeenCalled();
    expect(result.loginDetected).toBeUndefined();
  });
});
