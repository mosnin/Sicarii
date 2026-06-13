// The live arcade.so product walkthrough, as its own section under the hero.
// No hooks, so this stays a server component. demo.arcade.software is allow
// -listed in the CSP frame-src.
export function ProductDemo() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-5xl px-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-primary">See it in action</p>
          <h2 className="font-brand mt-4 text-3xl tracking-tight text-foreground sm:text-4xl">
            Watch your agent set up a market scan
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            A real walkthrough: your agent configures an automated market scan with
            Radar, no setup call required.
          </p>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-border bg-background p-2 shadow-lg shadow-black/10 sm:p-4">
          <div className="overflow-hidden rounded-xl border border-border/60">
            <div style={{ position: "relative", paddingBottom: "calc(49.26605504587156% + 41px)", height: 0, width: "100%" }}>
              <iframe
                src="https://demo.arcade.software/yzXGKtd6gmfShw2bUbEA?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true"
                title="Set Up Automated Market Scans with Radar"
                frameBorder="0"
                loading="lazy"
                allowFullScreen
                allow="clipboard-write"
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", colorScheme: "light" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
