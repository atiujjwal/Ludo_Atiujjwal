import { createFileRoute, Link } from "@tanstack/react-router";

import { HOUSE_RULE_COPY } from "./setup";

export const Route = createFileRoute("/rules")({
  head: () => ({
    meta: [
      { title: "How to Play Ludo — Rules & House Rules" },
      {
        name: "description",
        content:
          "The standard Ludo rules plus all four optional house rules: Exit on 1, Second Lap, Cut Reward and the Three 6s variant.",
      },
      { property: "og:title", content: "How to Play Ludo — Rules & House Rules" },
      {
        property: "og:description",
        content: "Standard Ludo rules and the four optional house rules, explained simply.",
      },
    ],
  }),
  component: RulesGuide,
});

function RulesGuide() {
  return (
    <main className="mx-auto w-full max-w-md px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-3xl">How to play</h1>
        <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Back
        </Link>
      </div>

      <section className="rounded-2xl bg-card p-5 shadow-sm">
        <h2 className="font-display text-xl">Standard rules</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Roll a 6 to bring a token out. Move your tokens around the board toward home. Land on an
          opponent to send them back to base — unless they're on a star square, which is safe. Get
          all 4 tokens home first (or your whole team, in 2v2) to win. Roll a 6 and you get another
          turn. No legal move? Your turn is skipped automatically. You need the exact roll to land a
          token in its final home square.
        </p>
      </section>

      <section className="mt-6 space-y-3">
        <h2 className="font-display text-xl">House rules</h2>
        {HOUSE_RULE_COPY.map((rule) => (
          <article key={rule.key} className="rounded-2xl bg-card p-4 shadow-sm">
            <h3 className="font-semibold">{rule.title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{rule.text}</p>
          </article>
        ))}
      </section>

      <section className="mt-6 rounded-2xl bg-card p-5 shadow-sm">
        <h2 className="font-display text-xl">2v2 teams</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Red and Yellow play against Green and Blue. Teammates can never cut each other. If all of
          your tokens are already home, you keep rolling and move your teammate's tokens instead.
          The first team to get all eight tokens home wins.
        </p>
      </section>
    </main>
  );
}
