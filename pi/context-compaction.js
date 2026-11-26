// Opt-in Pi project extension. Never changes global or project settings.
export default function contextCompaction(pi) {
  let attemptedFor;
  let compacting = false;

  const reset = () => { attemptedFor = undefined; };
  pi.on("session_start", reset);
  pi.on("session_tree", reset);
  pi.on("model_select", reset);

  pi.on("agent_settled", (_event, ctx) => {
    if (compacting || !ctx.isIdle() || pi.getSettings().compaction?.enabled === false) return;
    const model = ctx.model;
    const tokens = ctx.getContextUsage()?.tokens;
    const window = model?.contextWindow;
    if (!Number.isFinite(tokens) || tokens < 0 || !Number.isFinite(window) || window <= 0) return;

    const key = `${model.provider}/${model.id}:${window}`;
    if (tokens < window * 0.6) {
      reset();
      return;
    }
    if (attemptedFor === key) return;
    attemptedFor = key;
    compacting = true;
    try {
      ctx.compact({
        customInstructions: "Preserve the agreed goal, decisions, authorization scope, verification results, pending work, and one concrete next step. Do not treat tangents as approved work.",
        onComplete: () => { compacting = false; },
        onError: (error) => {
          compacting = false;
          if (ctx.hasUI) ctx.ui.notify(`gh-skill compaction failed: ${error.message}`, "warning");
        },
      });
    } catch (error) {
      compacting = false;
      if (ctx.hasUI) ctx.ui.notify(`gh-skill compaction failed: ${error.message}`, "warning");
    }
  });
}
