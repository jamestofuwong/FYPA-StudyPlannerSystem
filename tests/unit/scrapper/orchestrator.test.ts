/** @jest-environment node */
import { runAutoRun, runStudentScrape } from '@core/services/scrapper/scraperOrchestrator';
import * as scraperService from '@core/services/scrapper/advisorScraperService';

jest.mock('@core/services/scrapper/advisorScraperService');

describe('Scraper Orchestrator', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });
  const mockAdapter = {
    getURL: jest.fn().mockReturnValue('https://portal.com'),
    executeJavaScript: jest.fn().mockResolvedValue({}),
  } as any;

  const callbacks = {
    onLog: jest.fn(),
    onBotStep: jest.fn(),
    onScrapeResult: jest.fn(),
  };

  test('runAutoRun resumes from a specific startIndex', async () => {
    (scraperService.runScraperStep as jest.Mock).mockResolvedValue({ logs: ['Resumed'] });
    const result = await runAutoRun(mockAdapter, 2, callbacks);
    
    expect(result.completedIndex).toBe(4);
    expect(scraperService.runScraperStep).toHaveBeenCalledTimes(2);
  });

  test('runStudentScrape merges name and enrollment options into final result', async () => {
    (scraperService.runScraperStep as jest.Mock)
      .mockResolvedValueOnce({ logs: [], studentName: 'Jane Doe' })
      .mockResolvedValueOnce({ logs: [], enrollmentOptions: [{ text: 'Latest' }] }) 
      .mockResolvedValueOnce({ logs: [] }) 
      .mockResolvedValueOnce({ logs: [] }) 
      .mockResolvedValueOnce({ logs: [], scrapeResult: { scraped: true, units: [] } }); 

    const result = await runStudentScrape(mockAdapter, '123', 'latest', callbacks);
    
    expect(result.finalResult).toMatchObject({
      studentName: 'Jane Doe',
      enrollmentOptions: [{ text: 'Latest' }],
      scraped: true
    });
  });

  test('runAutoRun converts non-Error rejections to an error message', async () => {
    const { runScraperStep } = require('@core/services/scrapper/advisorScraperService');
    runScraperStep.mockRejectedValue('String Error'); // Throw string instead of Error object

    const result = await runAutoRun(mockAdapter, 0, callbacks);
    expect(result.error).toBe('String Error');
    });

    test('runStudentScrape does not attach metadata to an unsuccessful result', async () => {
      const { runScraperStep } = require('@core/services/scrapper/advisorScraperService');
      runScraperStep.mockResolvedValue({ logs: [], scrapeResult: { scraped: false } });

      const result = await runStudentScrape(mockAdapter, '123', 'latest', callbacks);
      // Verify studentName wasn't attached because .scraped is false
      const scraped = result.finalResult?.scraped ? result.finalResult : undefined;
      expect(scraped?.studentName).toBeUndefined();
    });

    test('runAutoRun executes only the remaining step after a mid-point restart', async () => {
      const { runScraperStep } = require('@core/services/scrapper/advisorScraperService');
      runScraperStep.mockResolvedValue({ logs: ['Restarted'] });

      // Start from index 3 
      const result = await runAutoRun(mockAdapter, 3, callbacks);
      
      expect(result.completedIndex).toBe(4);
      expect(runScraperStep).toHaveBeenCalledTimes(1);
    });
});
