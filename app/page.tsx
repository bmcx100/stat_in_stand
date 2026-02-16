export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-zinc-50 to-zinc-100 dark:from-zinc-950 dark:to-black">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-12">
        {/* Header */}
        <div className="flex flex-col gap-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 text-2xl font-bold text-white shadow-lg">
              BMC
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Reactest Template
            </h1>
          </div>
          <p className="text-lg text-zinc-600 dark:text-zinc-400">
            A modern Next.js starter with TypeScript, Tailwind CSS, and
            shadcn/ui
          </p>
        </div>

        {/* Setup Instructions Card */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Quick Start Guide
          </h2>

          <div className="flex flex-col gap-4">
            {/* Step 1 */}
            <div className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-500 text-sm font-semibold text-white">
                1
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
                  Navigate to your project
                </h3>
                <code className="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-mono text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  cd new_proj
                </code>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-purple-500 text-sm font-semibold text-white">
                2
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
                  Install dependencies
                </h3>
                <code className="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-mono text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  npm install
                </code>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex gap-4">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-green-500 text-sm font-semibold text-white">
                3
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
                  Start development server
                </h3>
                <code className="rounded-lg bg-zinc-100 px-4 py-3 text-sm font-mono text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                  npm run dev
                </code>
              </div>
            </div>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 text-2xl">⚡</div>
            <h3 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">
              Next.js 16
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              App Router with React 19 and Server Components
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 text-2xl">🎨</div>
            <h3 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">
              Tailwind CSS v4
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Modern styling with shadcn/ui components
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 text-2xl">📘</div>
            <h3 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">
              TypeScript
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Fully typed codebase with strict mode
            </p>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 text-2xl">🌙</div>
            <h3 className="mb-1 font-semibold text-zinc-900 dark:text-zinc-50">
              Dark Mode
            </h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Built-in dark mode with OKLCH colors
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-zinc-500 dark:text-zinc-500">
          Edit{" "}
          <code className="rounded bg-zinc-200 px-2 py-1 font-mono text-xs dark:bg-zinc-800">
            app/page.tsx
          </code>{" "}
          to get started
        </p>
      </main>
    </div>
  );
}
