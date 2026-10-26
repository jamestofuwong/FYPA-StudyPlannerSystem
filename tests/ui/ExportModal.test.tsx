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

describe('ExportModal', () => {
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

    test('handles API export failure', async () => {
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

        // The error message shows in a toast
        await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Database Export Error', 'error');
        });
    });

    test('handles unexpected network crash', async () => {
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
    test('ExportModal: shows the intake month of the planner', () => {
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

    test('ExportModal: Complete download lifecycle', async () => {
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

    test('ExportModal: respects availableSections prop', () => {
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

    test('ExportModal: closes on overlay click', () => {
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

  test('ExportModal: toggles individual sections', () => {
    render(<ToastProvider><ExportModal exportInput={mockInput} onClose={jest.fn()} /></ToastProvider>);
    
    const checkbox = screen.getByLabelText(/Student Profile/i);
    // 1. Uncheck
    fireEvent.click(checkbox);
    expect(screen.getByRole('button', { name: /Export \(3\)/i })).toBeInTheDocument();
    
    // 2. Re-check
    fireEvent.click(checkbox);
    expect(screen.getByRole('button', { name: /Export \(4\)/i })).toBeInTheDocument();
  });

  test('ExportModal: handles server error with invalid JSON body', async () => {
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

});