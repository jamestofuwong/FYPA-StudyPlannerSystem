/** @jest-environment jsdom */
// @ts-nocheck
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ToastProvider, useToast } from '@/components/providers/ToastProvider';

const ToastTrigger = () => {
  const { showToast } = useToast();
  return (
    <div>
      <button onClick={() => showToast('Success Msg', 'success')}>S</button>
      <button onClick={() => showToast('Error Msg', 'error')}>E</button>
      <button onClick={() => showToast('Info Msg', 'info')}>I</button>
    </div>
  );
};

describe('ToastProvider Logic Coverage', () => {
  test('should trigger every toast type branch (Line coverage boost)', () => {
    render(<ToastProvider><ToastTrigger /></ToastProvider>);

    fireEvent.click(screen.getByText('S'));
    expect(screen.getByText('Success Msg')).toBeInTheDocument();

    fireEvent.click(screen.getByText('E'));
    expect(screen.getByText('Error Msg')).toBeInTheDocument();

    fireEvent.click(screen.getByText('I'));
    expect(screen.getByText('Info Msg')).toBeInTheDocument();
  });

  test('ToastProvider: automatic dismissal logic (Line 28)', async () => {
    jest.useFakeTimers();
    
    render(<ToastProvider><ToastTrigger /></ToastProvider>);

    fireEvent.click(screen.getByText('S'));
    expect(screen.getByText('Success Msg')).toBeInTheDocument();

    // Fast-forward 4 seconds (timeout is 3.5s)
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(screen.queryByText('Success Msg')).not.toBeInTheDocument();

    jest.useRealTimers();
  });
});

describe('ToastProvider Development Logs (Lines 31-38)', () => {
  test('logs to console by forcing development logic', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const logSpy = jest.spyOn(console, 'log').mockImplementation();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation();
    const infoSpy = jest.spyOn(console, 'info').mockImplementation();
    
    render(<ToastProvider><ToastTrigger /></ToastProvider>);

    // Click 'S' - should call console.log
    fireEvent.click(screen.getByText('S'));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('[Toast:success]'));

    // Click 'E' - should call console.error
    fireEvent.click(screen.getByText('E'));
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('[Toast:error]'));

    // Click 'I' - should call console.info
    fireEvent.click(screen.getByText('I'));
    expect(infoSpy).toHaveBeenCalledWith(expect.stringContaining('[Toast:info]'));
    
    process.env.NODE_ENV = originalEnv;
    logSpy.mockRestore();
    errorSpy.mockRestore();
    infoSpy.mockRestore();
  });
});