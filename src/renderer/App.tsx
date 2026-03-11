import { useEffect } from "react";
import { atom, useAtom } from "jotai";

const appVersionAtom = atom("Loading...");

declare global {
  interface Window {
    zora?: {
      getAppVersion: () => Promise<string>;
    };
  }
}

export default function App() {
  const [version, setVersion] = useAtom(appVersionAtom);

  useEffect(() => {
    let cancelled = false;

    window.zora
      ?.getAppVersion()
      .then((value) => {
        if (!cancelled) {
          setVersion(value);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setVersion("Unavailable");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [setVersion]);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12 text-slate-50">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.3),_transparent_40%),linear-gradient(135deg,_#020617_0%,_#0f172a_45%,_#111827_100%)]" />
      <div className="absolute left-1/2 top-1/2 h-[28rem] w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl" />

      <section className="relative w-full max-w-3xl rounded-[28px] border border-white/10 bg-white/8 p-8 shadow-2xl shadow-slate-950/40 backdrop-blur-xl sm:p-12">
        <div className="mb-6 inline-flex items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.24em] text-cyan-100">
          Minimal Desktop Shell
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-6xl">
          Hello ZoraAgent
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-slate-200 sm:text-lg">
          Electron, React, Tailwind v4, Jotai, and preload IPC are wired up in a
          single-package starter that is ready for Claude Agent SDK in Step 2.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
          <div className="rounded-2xl border border-white/10 bg-slate-950/35 px-5 py-4">
            <div className="text-sm uppercase tracking-[0.2em] text-slate-400">
              App Version
            </div>
            <div className="mt-2 text-2xl font-semibold text-cyan-100">
              {version}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/6 px-5 py-4 text-sm leading-6 text-slate-200">
            <span className="font-medium text-white">Bridge check:</span>{" "}
            <code className="rounded bg-black/20 px-2 py-1 text-cyan-100">
              window.zora.getAppVersion()
            </code>
          </div>
        </div>
      </section>
    </main>
  );
}
