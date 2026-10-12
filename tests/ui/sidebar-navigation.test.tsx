/** @jest-environment jsdom */
import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '@/components/layout/Sidebar';
import { NAV_SECTIONS, type PanelId } from '@/lib/navigation';
import PathwayPage from '@/app/(pages)/pathway/page';
import { StudentSessionProvider } from '@/components/providers/StudentSessionContext';
import { ToastProvider } from '@/components/providers/ToastProvider';

// Confirms the Student Pathway entry Kelvin's commit 3238148 removed from
// NAV_SECTIONS is back: present in the sidebar, navigable the same way as
// any other item, and reachable from a fresh (no student loaded) state.

describe('Sidebar renders Student Pathway', () => {
  test('the sidebar shows a "Student Pathway" item', () => {
    render(<Sidebar activePanel="dashboard" onNavigate={() => {}} isCollapsed={false} onToggleCollapse={() => {}} />);
    expect(screen.getByText('Student Pathway')).toBeTruthy();
  });

  test('clicking "Student Pathway" calls onNavigate with \'pathway\', the same mechanism every other item uses', () => {
    const onNavigate = jest.fn();
    render(<Sidebar activePanel="dashboard" onNavigate={onNavigate} isCollapsed={false} onToggleCollapse={() => {}} />);

    fireEvent.click(screen.getByText('Student Pathway'));
    expect(onNavigate).toHaveBeenCalledWith('pathway');

    // Same click mechanism as another item in the same section.
    onNavigate.mockClear();
    fireEvent.click(screen.getByText('Major Detection', { selector: 'span.itemLabel, span' }));
    expect(onNavigate).toHaveBeenCalledWith('dashboard');
  });

  test('"Student Pathway" shows the active state when the pathway tab is the active panel', () => {
    render(<Sidebar activePanel="pathway" onNavigate={() => {}} isCollapsed={false} onToggleCollapse={() => {}} />);
    const button = screen.getByText('Student Pathway').closest('button') as HTMLElement;
    expect(button.className).toMatch(/active/);
  });

  test('"Student Pathway" is in the same section and position NAV_SECTIONS had before it was removed: right after Major Detection in the "main" section', () => {
    const mainSection = NAV_SECTIONS.find((s) => s.id === 'main')!;
    expect(mainSection.items.map((i) => i.id)).toEqual(['dashboard', 'pathway']);
    const pathwayItem = mainSection.items.find((i) => i.id === 'pathway')!;
    expect(pathwayItem).toEqual({ id: 'pathway', icon: '🧭', label: 'Student Pathway' });
  });

  test('no existing nav item regressed: every panel still renders exactly once across NAV_SECTIONS', () => {
    const allIds = NAV_SECTIONS.flatMap((s) => s.items.map((i) => i.id));
    expect(new Set(allIds).size).toBe(allIds.length); // no duplicates
    expect(allIds).toContain('pathway');
  });
});

describe('opening Student Pathway from the sidebar, with no student loaded', () => {
  function Shell() {
    const [activePanel, setActivePanel] = useState<PanelId>('dashboard');
    return (
      <ToastProvider>
        <StudentSessionProvider>
          <Sidebar activePanel={activePanel} onNavigate={setActivePanel} isCollapsed={false} onToggleCollapse={() => {}} />
          {activePanel === 'pathway' && <PathwayPage />}
        </StudentSessionProvider>
      </ToastProvider>
    );
  }

  test('shows the empty state with both the "Go to Major Detection" action and the import control', () => {
    render(<Shell />);
    fireEvent.click(screen.getByText('Student Pathway'));

    expect(screen.getByText('No student loaded')).toBeTruthy();
    expect(screen.getByText('Go to Major Detection')).toBeTruthy();
    expect(screen.getByText(/Import plan \(Excel or PDF\)/i)).toBeTruthy();
  });
});
