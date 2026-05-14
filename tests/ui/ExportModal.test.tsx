/** @jest-environment jsdom */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExportModal from '@/components/ExportModal';
import { ToastProvider } from '@/components/providers/ToastProvider';

const styles = { overlay: 'overlay' };
const mockShowToast = jest.fn();

jest.mock('@/components/providers/ToastProvider', () => ({
  ToastProvider: ({ children }: any) => <>{children}</>,
  useToast: () => ({ showToast: mockShowToast })
}));

global.URL.createObjectURL = jest.fn();
global.URL.revokeObjectURL = jest.fn();

describe('ExportModal Component Deep Coverage', () => {
  const mockInput = {
    studentId: '123',
    student: { studentName: 'Test Student' },
    planner: { 
      course: { name: 'Computer Science' }, 
      major: { name: 'AI' },
      intakeMonth: 2 
    },
    intakeYear: 2024,
    match: {},
    completedCodes: []
  } as any;

  const mockOnClose = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'error').mockImplementation((msg) => {
        const message = typeof msg === 'string' ? msg : msg?.message || String(msg);
        
        if (!message.includes('Not implemented: navigation')) {
          console.log(msg); 
        }
    });
});

    test('toggles sections and handles "Select All" logic', () => {
        render(
        <ToastProvider>
            <ExportModal exportInput={mockInput} onClose={mockOnClose} />
        </ToastProvider>
        );

        // Default state: all selected, so "Deselect All" button should exist
        const toggleBtn = screen.getByRole('button', { name: /Deselect All|Select All/i });
        expect(toggleBtn).toHaveTextContent(/Deselect All/i);

        // Click Deselect All -> Changes to Select All
        fireEvent.click(toggleBtn);
        expect(toggleBtn).toHaveTextContent(/Select All/i);
        
        // Check if Export button is disabled when nothing is selected
        const exportBtn = screen.getByRole('button', { name: /Export/i });
        expect(exportBtn).toBeDisabled();
    });

    test('handles API export failure (Targets catch block / Line 86)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'Database Export Error' })
        });

        render(
        <ToastProvider>
            <ExportModal exportInput={mockInput} onClose={mockOnClose} />
        </ToastProvider>
        );

        // Trigger the export
        const exportBtn = screen.getByRole('button', { name: /Export/i });
        fireEvent.click(exportBtn);

        // Verify the catch block logic triggers the Toast
        await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Database Export Error', 'error');
        });
    });

    test('handles unexpected network crash (Targets deep catch block)', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network Crash'));

        render(
        <ToastProvider>
            <ExportModal exportInput={mockInput} onClose={mockOnClose} />
        </ToastProvider>
        );

        fireEvent.click(screen.getByRole('button', { name: /Export/i }));

        await waitFor(() => {
            expect(mockShowToast).toHaveBeenCalledWith('Network Crash', 'error');
        });
    });
    test('ExportModal Helper: handles various intake months (Line 6-57 coverage)', () => {
        const months = [
        { name: 'July', expected: 'July' },
        { name: 'February', expected: 'February' }
        ];

        months.forEach(({ name }) => {
        const inputWithMonth = { ...mockInput, planner: { ...mockInput.planner, intakeMonth: name === 'July' ? 7 : 2 } };
        render(
            <ToastProvider>
            <ExportModal exportInput={inputWithMonth} onClose={mockOnClose} />
            </ToastProvider>
        );
        expect(screen.getByText(new RegExp(name, 'i'))).toBeInTheDocument();
        });
    });

    test('ExportModal: Correctly handles null planner fields in subtext (Line 42+)', () => {
    const minimalInput = { ...mockInput, planner: { course: null, major: null } };
    render(<ToastProvider><ExportModal exportInput={minimalInput} onClose={jest.fn()} /></ToastProvider>);
    expect(screen.getByText(/Export Report/i)).toBeInTheDocument();
    });

    test('ExportModal: Simulates successful blob download trigger (Line 74-83)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(new Blob(['data'], { type: 'application/vnd.ms-excel' }))
        });
        
        render(<ToastProvider><ExportModal exportInput={mockInput} onClose={jest.fn()} /></ToastProvider>);
        fireEvent.click(screen.getByRole('button', { name: /Export/i }));
        
        await waitFor(() => expect(global.URL.createObjectURL).toHaveBeenCalled());
        });

    test('ExportModal: Complete download lifecycle (Lines 74-83)', async () => {
        const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            blob: () => Promise.resolve(new Blob(['mock_data'], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
        });

        render(<ToastProvider><ExportModal exportInput={mockInput} onClose={jest.fn()} /></ToastProvider>);
        
        const exportBtn = screen.getByRole('button', { name: /Export \(/i });
        fireEvent.click(exportBtn);

        await waitFor(() => {
            expect(clickSpy).toHaveBeenCalled();
        });
        
        clickSpy.mockRestore();
        });

    test('ExportModal: Handles API crash (Line 83 catch block)', async () => {
        // Force a network-level rejection
        global.fetch = jest.fn().mockRejectedValue(new Error('Network Crash'));

        render(<ToastProvider><ExportModal exportInput={mockInput} onClose={mockOnClose} /></ToastProvider>);
        
        const exportBtn = screen.getByRole('button', { name: /Export \(/i });
        fireEvent.click(exportBtn);

        await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Network Crash', 'error');
        });
    });

    test('ExportModal: respects availableSections prop (Line 15+)', () => {
        const restrictedSections: any[] = ['student_profile'];
        render(
            <ToastProvider>
            <ExportModal 
                exportInput={mockInput} 
                onClose={jest.fn()} 
                availableSections={restrictedSections} 
            />
            </ToastProvider>
        );
        
        // Should see Student Profile
        expect(screen.getByText(/Student Profile/i)).toBeInTheDocument();
        // Should NOT see Major Matching
        expect(screen.queryByText(/Major Matching/i)).not.toBeInTheDocument();
    });

    test('ExportModal: handles JSON parsing failure (Line 57)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.reject(new Error('Invalid JSON'))
        });

        render(<ToastProvider><ExportModal exportInput={mockInput} onClose={jest.fn()} /></ToastProvider>);
        fireEvent.click(screen.getByRole('button', { name: /Export/i }));

        await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith(expect.stringContaining('Export failed'), 'error');
        });
    });

    test('ExportModal: closes on overlay click (Line 114)', () => {
        const mockOnClose = jest.fn();
        render(<ToastProvider><ExportModal exportInput={mockInput} onClose={mockOnClose} /></ToastProvider>);
        
        const overlay = document.querySelector(`.${styles.overlay}`);
    
        if (overlay) {
        fireEvent.click(overlay);
        } else {
            // Fallback: search for the first div in the body if the class mock fails
            const firstDiv = document.body.querySelector('div');
            if (firstDiv) fireEvent.click(firstDiv);
        }
        
        expect(mockOnClose).toHaveBeenCalled();
    });

  test('ExportModal: toggles individual sections (Line 29-32)', () => {
    render(<ToastProvider><ExportModal exportInput={mockInput} onClose={jest.fn()} /></ToastProvider>);
    
    const checkbox = screen.getByLabelText(/Student Profile/i);
    // 1. Uncheck
    fireEvent.click(checkbox);
    expect(screen.getByRole('button', { name: /Export \(3\)/i })).toBeInTheDocument();
    
    // 2. Re-check (Hits the 'else' branch of toggleSection)
    fireEvent.click(checkbox);
    expect(screen.getByRole('button', { name: /Export \(4\)/i })).toBeInTheDocument();
  });

  test('ExportModal: handles server error with invalid JSON body (Lines 56-57)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      // Simulate a server crash that returns HTML instead of JSON
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON'))
    });

    render(<ToastProvider><ExportModal exportInput={mockInput} onClose={jest.fn()} /></ToastProvider>);
    
    fireEvent.click(screen.getByRole('button', { name: /Export/i }));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Export failed.', 'error');
    });
  });

  test('ExportModal: handles malformed JSON error from server (Lines 56-57)', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.reject(new SyntaxError('Unexpected token < in JSON'))
    });

    render(<ToastProvider><ExportModal exportInput={mockInput} onClose={jest.fn()} /></ToastProvider>);
    
    fireEvent.click(screen.getByRole('button', { name: /Export/i }));

    // Verify the .catch(() => ({})) logic on line 57 triggers the default error toast
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Export failed.', 'error');
    });
  });
});