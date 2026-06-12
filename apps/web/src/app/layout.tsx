import './global.css';

export const metadata = {
  title: 'Sofin · User',
  description: 'Sofin user portal — Next.js + Tailwind + shadcn/ui',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
