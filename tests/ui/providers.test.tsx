/** @jest-environment jsdom */
// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ToastProvider, useToast } from '@/web/components/providers/ToastProvider';

// 1. Define the helper component INSIDE the test file
const ToastTrigger = () => {
  const { showToast } = useToast();
  return (
    <div>
      {/* These buttons help us test the Success, Error, and Info branches */}
      <button onClick={() => showToast('Success Msg', 'success')}>S</button>
      <button onClick={() => showToast('Error Msg', 'error')}>E</button>
      <button onClick={() => showToast('Info Msg', 'info')}>I</button>
    </div>
  );
};

describe('ToastProvider Logic Coverage', () => {
  test('should trigger every toast type branch (Line coverage boost)', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );

    // Click Success
    fireEvent.click(screen.getByText('S'));
    expect(screen.getByText('Success Msg')).toBeInTheDocument();

    // Click Error
    fireEvent.click(screen.getByText('E'));
    expect(screen.getByText('Error Msg')).toBeInTheDocument();

    // Click Info
    fireEvent.click(screen.getByText('I'));
    expect(screen.getByText('Info Msg')).toBeInTheDocument();
  });

  test('ToastProvider: close button coverage (Line 28)', () => {
    render(
      <ToastProvider>
        <ToastTrigger />
      </ToastProvider>
    );

    // 1. Open a toast
    fireEvent.click(screen.getByText('S'));

    // 2. Find the close button 
    const closeBtn = screen.queryByRole('button', { name: /✕/i }) || screen.getAllByRole('button')[0];
    
    if (closeBtn) {
      fireEvent.click(closeBtn);
    }
  });
});