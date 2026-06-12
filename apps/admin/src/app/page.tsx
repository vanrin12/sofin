import { Button } from '@/components/ui/button';

export default function Index() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-8 py-16">
      <div className="space-y-3 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Sofin · Admin
        </p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Welcome to the admin console
        </h1>
        <p className="mx-auto max-w-md text-muted-foreground">
          Next.js + Tailwind CSS + shadcn/ui. This page renders shadcn{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-sm">Button</code>{' '}
          variants to confirm the stack is wired up.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button>Primary</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="link">Link</Button>
      </div>
    </main>
  );
}
