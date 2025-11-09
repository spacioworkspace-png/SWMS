import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navigation from '@/components/Navigation'
import { AuthProvider } from '@/components/AuthProvider'

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

    export const metadata: Metadata = {
      title: "Spacio Workspace - Management System",
      description: "Manage your coworking space effectively with Spacio Workspace",
    };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
      return (
        <html lang="en">
          <body
            className={`${geistSans.variable} ${geistMono.variable} antialiased bg-gradient-to-br from-orange-50 via-white to-green-50`}
          >
            <AuthProvider>
              <Navigation />
              {children}
            </AuthProvider>
          </body>
        </html>
      );
}
