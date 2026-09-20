import type { Metadata } from "next";
import { Orbitron, Space_Grotesk, Boogaloo } from "next/font/google";
import "./globals.css";

const orbitron = Orbitron({
  subsets: ["latin"],
  weight: ["600", "700", "800", "900"],
  variable: "--font-display"
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body"
});

const boogaloo = Boogaloo({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-tag"
});

export const metadata: Metadata = {
  title: "HIDZ BYPASS — Resolver Tautan Publik",
  description: "Telusuri rantai pengalihan dari tautan pendek atau wrapper apa pun, lalu temukan URL tujuan sebenarnya tanpa menyimpan riwayat di server.",
  robots: { index: false, follow: false }
};

// Terapkan tema tersimpan sebelum hydration agar tidak ada kedipan warna
// saat halaman pertama kali dimuat (light/dark flash).
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var saved = window.localStorage.getItem("hidz-theme");
    if (saved === "dark" || saved === "light") {
      document.documentElement.dataset.theme = saved;
    }
  } catch (err) {}
})();
`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${orbitron.variable} ${spaceGrotesk.variable} ${boogaloo.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
