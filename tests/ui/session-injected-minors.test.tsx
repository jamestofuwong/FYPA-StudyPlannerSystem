/** @jest-environment jsdom */
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { StudentSessionProvider, useStudentSession } from '@/components/providers/StudentSessionContext';

// The dashboard no longer offers minors, but the Student Pathway page still
// selects them through the shared session, so the provider must keep the state
// and keep clearing it when the planner changes.

let session: ReturnType<typeof useStudentSession>;

function Probe() {
  session = useStudentSession();
  return <div data-testid="minors">{[...session.injectedMinors].sort().join(',')}</div>;
}

const shown = () => screen.getByTestId('minors').textContent;

const renderProvider = () =>
  render(
    <StudentSessionProvider>
      <Probe />
    </StudentSessionProvider>,
  );

const plannerData = (units: object[]) => ({ planners: [{ id: 'p1', units }] });

describe('injectedMinors in the student session', () => {
  test('starts empty', () => {
    renderProvider();
    expect(shown()).toBe('');
  });

  test('a minor selected from the pathway page is readable from the session', () => {
    renderProvider();

    act(() => session.setInjectedMinors(new Set(['minor-a', 'minor-b'])));

    expect(shown()).toBe('minor-a,minor-b');
    expect(session.injectedMinors.has('minor-a')).toBe(true);
  });

  test('selecting and deselecting behaves as a set', () => {
    renderProvider();

    act(() => session.setInjectedMinors(new Set(['minor-a'])));
    act(() => session.setInjectedMinors((current) => new Set([...current, 'minor-b'])));
    act(() => session.setInjectedMinors((current) => new Set([...current].filter((id) => id !== 'minor-a'))));

    expect(shown()).toBe('minor-b');
  });

  test('a fresh planner clears the selection, as the reset in the provider always did', () => {
    renderProvider();
    act(() => session.setInjectedMinors(new Set(['minor-a'])));
    expect(shown()).toBe('minor-a');

    act(() => session.setDashboardData(plannerData([{ category: 'core', unit: { unit_code: 'C1' } }])));

    expect(shown()).toBe('');
  });

  test('the dashboard\'s own reset, an empty set, leaves it writable afterwards', () => {
    renderProvider();
    act(() => session.setInjectedMinors(new Set(['minor-a'])));

    act(() => session.setInjectedMinors(new Set()));
    expect(shown()).toBe('');

    act(() => session.setInjectedMinors(new Set(['minor-c'])));
    expect(shown()).toBe('minor-c');
  });
});