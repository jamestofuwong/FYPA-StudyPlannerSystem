import type { Metadata } from "next";
import React from "react";
import "./globals.css";
import { ThemeProvider } from "../theme/themeProvider";

export const metadata: Metadata = {
  title: "Study Planner System",
  description:
    "Locally deployed desktop application for academic progression tracking."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
