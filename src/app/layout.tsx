import type { Metadata } from "next";
import { Space_Grotesk, Righteous } from "next/font/google";

import "./globals.css";
import { MobileSidebarProvider } from "@/components/MobileSidebarContext";
import { TopNav } from "@/components/TopNav";
import { Sidebar } from "@/components/Sidebar";
import { auth } from "@/lib/auth";
import {
  STALE_SESSION_SIGN_OUT_URL,
  ensureChannelForUser,
} from "@/lib/slug";
import { redirect } from "next/navigation";

const bodyFont = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const displayFont = Righteous({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "TESIL — Streaming powered by Tesil Video Player",
  description:
    "TESIL — a Twitch/YouTube-style streaming site for VOD and live streams, powered by the Tesil Video Player.",
  icons: { icon: "/video-player/icons/favicon.ico" },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  let channelNav: {
    name: string;
    avatarUrl: string | null;
  } | null = null;
  if (session?.user?.id) {
    const ch = await ensureChannelForUser(session.user.id);
    if (!ch) {
      redirect(STALE_SESSION_SIGN_OUT_URL);
    }
    channelNav = {
      name: ch.name,
      avatarUrl: ch.avatarUrl,
    };
  }

  return (
    <html
      lang="en"
      className={`dark ${bodyFont.variable} ${displayFont.variable}`}
    >
      <body className="bg-bg text-text">
        <MobileSidebarProvider>
          <div className="flex h-dvh max-h-dvh min-h-0 flex-col">
            <TopNav user={session?.user ?? null} channel={channelNav} />
            <div className="flex min-h-0 flex-1 overflow-hidden">
              <Sidebar />
              <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">
                {children}
              </main>
            </div>
          </div>
        </MobileSidebarProvider>
      </body>
    </html>
  );
}
