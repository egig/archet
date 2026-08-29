import Link from 'next/link';
import Image from 'next/image';

const features = [
  {
    title: 'Model once, ship the backend',
    details:
      'Define a model and Ratchet generates Postgres schema, validation, REST API, and admin console. Features in hours, not weeks.',
  },
  {
    title: 'Console your team can use',
    details: 'Searchable, sortable tables with inline editing — no admin screens to build.',
  },
  {
    title: 'Secure by default',
    details: 'Auth, roles, and permissions apply to every route automatically, down to individual fields.',
  },
  {
    title: 'Fits real workflows',
    details:
      'Custom actions like lock or approve, plus custom forms and inputs — no framework forks or hand-wired routes.',
  },
  {
    title: 'Real data shapes, handled',
    details: 'Hierarchies, multi-column sorting, and case-insensitive search work out of the box.',
  },
  {
    title: 'Ship anywhere',
    details: 'Develop on Bun, deploy to any Node host or container. No lock-in.',
  },
];

export default function HomePage() {
  return (
    <>
      <div className="flex flex-col items-center text-center gap-6 px-4 py-24">
        <Image src="/logo.png" alt="Ratchet" width={96} height={96} className="block dark:hidden" priority />
        <Image
          src="/logo-dark.png"
          alt="Ratchet"
          width={96}
          height={96}
          className="hidden dark:block"
          priority
        />
        <h1 className="text-4xl font-bold">Ratchet</h1>
        <p className="text-xl text-fd-muted-foreground">Models in, App out.</p>
        <p className="max-w-xl text-fd-muted-foreground">
          RATher an arCHEType, you build something out of.
        </p>
        <div className="flex gap-4">
          <Link
            href="/docs/getting-started"
            className="rounded-md bg-fd-primary px-4 py-2 font-medium text-fd-primary-foreground"
          >
            Get Started
          </Link>
          <Link
            href="https://github.com/egig/ratchet"
            className="rounded-md border px-4 py-2 font-medium"
          >
            View on GitHub
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-px bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature) => (
          <div key={feature.title} className="flex flex-col gap-2 bg-fd-background p-8">
            <h2 className="font-semibold">{feature.title}</h2>
            <p className="text-sm text-fd-muted-foreground">{feature.details}</p>
          </div>
        ))}
      </div>
    </>
  );
}
