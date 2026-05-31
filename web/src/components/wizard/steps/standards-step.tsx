/**
 * L3.4 — Standards. Capture ≥2 solutions of known concentration; each is shown
 * with its measured absorbance at λmax (once a blank + calibration exist). The
 * Beer-Lambert curve itself is reviewed in the next step.
 */
import { CapturePanel } from "@/components/wizard/capture-panel";
import { Icon, StatusChip } from "@/components/ui/primitives";
import { deleteStandardAction } from "@/app/experiments/[id]/actions";
import type { StandardAnalysis } from "@/lib/experiment-analysis";

function ConcentrationFields() {
  return (
    <div className="flex gap-3">
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-t3">Concentration</span>
        <input
          type="number"
          name="concentration"
          step="any"
          min={0}
          required
          placeholder="e.g. 5"
          className="rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-t1 outline-none focus:border-accent"
        />
      </label>
      <label className="flex w-28 flex-col gap-1">
        <span className="text-xs uppercase tracking-wide text-t3">Unit</span>
        <input
          type="text"
          name="unit"
          defaultValue="mg/L"
          maxLength={12}
          className="rounded-md border border-line bg-panel-2 px-2.5 py-2 text-sm text-t1 outline-none focus:border-accent"
        />
      </label>
    </div>
  );
}

export function StandardsStep({
  experimentId,
  standards,
  lambdaMax,
}: {
  experimentId: string;
  standards: StandardAnalysis[];
  lambdaMax: number | null;
}) {
  const enough = standards.length >= 2;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <StatusChip tone={enough ? "ok" : "warn"}>
          {enough ? <Icon name="check" size={12} /> : <Icon name="warn" size={12} />}
          {standards.length} standard{standards.length === 1 ? "" : "s"}
        </StatusChip>
        {!enough && <span className="text-xs text-t3">Add at least 2 to build a curve.</span>}
        {lambdaMax != null && (
          <StatusChip tone="accent" mono>
            λmax {Math.round(lambdaMax)} nm
          </StatusChip>
        )}
      </div>

      {standards.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel-2 text-left text-xs uppercase tracking-wide text-t3">
                <th className="px-3 py-2 font-semibold">Standard</th>
                <th className="px-3 py-2 font-semibold">Concentration</th>
                <th className="px-3 py-2 font-semibold">A @ λmax</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {standards.map((s, i) => (
                <tr key={s.id} className="border-t border-line-soft">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      {s.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- dynamic owner-scoped blob
                        <img src={s.imageUrl} alt="" className="h-6 w-10 rounded border border-line object-cover" />
                      )}
                      <span className="text-t2">#{i + 1}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 mono text-t1">
                    {s.concentration} <span className="text-t3">{s.unit}</span>
                  </td>
                  <td className="px-3 py-2 mono text-t1">
                    {s.absorbanceAtLambdaMax != null ? s.absorbanceAtLambdaMax.toFixed(3) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <form action={deleteStandardAction}>
                      <input type="hidden" name="experimentId" value={experimentId} />
                      <input type="hidden" name="standardId" value={s.id} />
                      <button
                        type="submit"
                        className="text-xs text-t4 hover:text-danger"
                        aria-label={`Delete standard ${i + 1}`}
                      >
                        Delete
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-t1">Add a standard</h3>
        <CapturePanel
          experimentId={experimentId}
          role="standard"
          cta="Capture standard"
          extraFields={<ConcentrationFields />}
        />
      </div>
    </div>
  );
}
