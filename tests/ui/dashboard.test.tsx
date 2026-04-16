/** @jest-environment jsdom */
// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DashboardPage from '@/web/app/(pages)/dashboard/page';

// 1. Mock the Toast hook
const mockShowToast = jest.fn();
jest.mock('@/web/components/providers/ToastProvider', () => ({
  useToast: () => ({ showToast: mockShowToast })
}));

// 2. Mock the Scraper Context
// This provides the initial data needed for your fetchDashboardData function
jest.mock('@/web/components/providers/ScraperContext', () => ({
  useScraperContext: () => ({
    isBusy: false,
    studentLoaded: false,
    botStep: '',
    scrapeResult: { units: [{ code: 'COS10009' }] }, // Needed for fetch logic
    scrapeStudent: jest.fn(),
    isElectron: true,
  })
}));

describe('Dashboard Ultimate Coverage Booster', () => {
  // 3. Setup a robust fetch mock
  beforeAll(() => {
    global.fetch = jest.fn();
  });

  test('triggers search and transitions to results (UIT-04)', async () => {
    // Mock the specific API responses your code expects
    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url.includes('/api/match')) {
        return Promise.resolve({
          json: () => Promise.resolve({ success: true, data: { primaryMajor: { matchPct: 85 } } }),
        });
      }
      if (url.includes('/api/planners')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ 
            course: { name: 'Computer Science' },
            major: { name: 'AI' },
            units: [{ year_level: 1, semester: 1, category: 'core', unit: { unit_code: 'COS10009', unit_name: 'Test' } }] 
          }),
        });
      }
      return Promise.reject(new Error("Unknown API"));
    });

    render(<DashboardPage />);

    // Verify we start at the landing screen
    expect(screen.getByText(/Enter a Student ID to begin/i)).toBeInTheDocument();

    // 4. Perform the Search
    const input = screen.getByPlaceholderText(/Enter Student ID/i);
    fireEvent.change(input, { target: { value: 'BA-CS-2024-0001' } });
    fireEvent.click(screen.getByText('Search'));

    // 5. Wait for the "Identity Card" to appear (this proves studentLoaded is now true)
    await waitFor(() => {
      expect(screen.getByText('BA-CS-2024-0001')).toBeInTheDocument();
    }, { timeout: 2000 });

    // 6. Test the Year Toggle (Covers Branch logic)
    const yearHeader = screen.getByText(/YEAR 1/i);
    fireEvent.click(yearHeader); // Toggle closed
    fireEvent.click(yearHeader); // Toggle open

    // 7. Test the Clear button (Covers line 170 approx)
    const clearBtn = screen.getByText(/Clear/i);
    fireEvent.click(clearBtn);
    
    // Verify we are back at the landing screen
    expect(screen.getByText(/Enter a Student ID to begin/i)).toBeInTheDocument();
  });
});