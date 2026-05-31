/**
 * L3.4 — Standards. Capture ≥2 solutions of known concentration; each is shown
 * with its measured absorbance at λmax (once a blank + calibration exist). The
 * Beer-Lambert curve itself is reviewed in the next step.
 */
import { CaptureControls } from "@/components/wizard/capture-controls";
import { Icon, StatusChip } from "@/components/ui/primitives";
import { deleteStandardAction } from "@/app/experiments/[id]/actions";
import type { StandardAnalysis } from "@/lib/experiment-analysis";
import type { CaptureRequest } from "@/lib/experiment-meta";

export function StandardsStep({
  experimentId,
  standards,
  lambdaMax,
  phoneOnline,
  pending,
}: {
  experimentId: string;
  standards: StandardAnalysis[];
  lambdaMax: number | null;
  phoneOnline: boolean;
  pending: CaptureRequest | null;
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
        <CaptureControls
          experimentId={experimentId}
          role="standard"
          cta="Capture standard"
          needsConcentration
          phoneOnline={phoneOnline}
          pending={pending}
        />
      </div>
    </div>
  );
}
