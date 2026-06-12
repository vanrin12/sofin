import './global.css';

export const metadata = {
  title: 'Sofin · Admin',
  description: 'Sofin admin console — Next.js + Tailwind + shadcn/ui',
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
