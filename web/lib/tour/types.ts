/** How to find an element on the page. The user-guide screenshots and the walkthroughs use the same finder. */
export type Find =
  | { css: string; nth?: number }
  | {
      /** Visible text of the element. Exact match unless `startsWith` or `contains` is set. */
      text: string;
      startsWith?: boolean;
      contains?: boolean;
      /** Restrict to a kind of element, as a CSS selector. */
      tag?: string;
      nth?: number;
      /** Only elements to the right of this x (the sidebar ends at 240 in Classic and 256 in Easy). */
      xMin?: number;
      /** Only elements to the left of this x (252 keeps to the sidebar). */
      xMax?: number;
      /** Only elements above this y (60 keeps to the tab bar). */
      yMax?: number;
    };

/** A different target for each design, for the places where Easy and Classic do not show the same thing. */
export interface DesignTarget {
  meadow: Find | Find[];
  classic: Find | Find[];
}

export type TourPlacement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

export interface TourStep {
  /** Unique inside its walkthrough. */
  id: string;
  /** The page of this step (for example '/dashboard'). The walkthrough opens it when it moves to this step. */
  path: string;
  /**
   * What to highlight. A list means "the first one that is on the screen" (a button that has two names).
   * Null shows the card alone, with no highlight.
   */
  target: Find | Find[] | DesignTarget | null;
  title: string;
  text: string;
  placement?: TourPlacement;
  /**
   * Shown when the highlighted thing is not on the screen. It says what to do to make it appear
   * (for example "Load a student first"). The walkthrough waits and picks it up when it shows.
   */
  missing?: string;
  /** The step moves on by itself when the person clicks the highlighted thing. */
  advanceOnClick?: boolean;
}

export interface Tour {
  id: string;
  /** The title of the job in the user guide. */
  title: string;
  steps: TourStep[];
}
