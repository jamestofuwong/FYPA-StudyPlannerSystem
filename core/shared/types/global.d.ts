export {};

declare global {
  interface Window {
    themeAPI: {
      getSystemTheme: () => Promise<"light" | "dark">;
      onThemeChange: (callback: (theme: "light" | "dark") => void) => void;
    };
    native?: {
      versions?: {
        electron?: string;
      };
    };
    portalAPI?: {
      clearSession: () => Promise<void>;
    };

  }

  // Electron <webview> element type used in the renderer process.
  interface ElectronWebviewTag extends HTMLElement {
    src: string;
    partition?: string;
    loadURL(url: string): Promise<void>;
    getURL(): string;
    executeJavaScript<T = unknown>(code: string): Promise<T>;
    setAttribute(name: string, value: string): void;
  }

  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<
        React.HTMLAttributes<ElectronWebviewTag> & {
          src?: string;
          partition?: string;
          allowpopups?: string;
          nodeintegration?: string;
          webpreferences?: string;
          ref?: React.Ref<ElectronWebviewTag>;
        },
        ElectronWebviewTag
      >;
    }
  }
}