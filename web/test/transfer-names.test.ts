import { describe, it, expect } from "vitest";
import { imageBlobBaseNames } from "@/lib/store/transfer";
import type { Experiment } from "@/lib/domain-types";

/** Build an Experiment carrying only the fields imageBlobBaseNames reads. */
function exp(partial: {
  unit: string;
  images: { id: string; role: string; laserWavelength?: number }[];
  standards?: { imageId: string; concentration: number }[];
  unknowns?: { imageId: string }[];
}): Experiment {
  return {
    unit: partial.unit,
    images: partial.images.map((i) => ({ laserWavelength: null, ...i })),
    standards: partial.standards ?? [],
    unknowns: partial.unknowns ?? [],
  } as unknown as Experiment;
}

describe("imageBlobBaseNames", () => {
  it("names each blob for the step it belongs to", () => {
    const names = imageBlobBaseNames(
      exp({
        unit: "mg/L",
        images: [
          { id: "cal", role: "calibration" },
          { id: "blk", role: "blank" },
          { id: "s1", role: "standard" },
          { id: "u1", role: "unknown" },
        ],
        standards: [{ imageId: "s1", concentration: 0.1 }],
        unknowns: [{ imageId: "u1" }],
      }),
    );
    expect(names.get("cal")).toBe("calibration");
    expect(names.get("blk")).toBe("blank");
    expect(names.get("s1")).toBe("standard-0.1mgL");
    expect(names.get("u1")).toBe("unknown-1");
  });

  it("formats laser wavelength and µM/percent units", () => {
    const names = imageBlobBaseNames(
      exp({
        unit: "µM",
        images: [
          { id: "l1", role: "laser", laserWavelength: 650 },
          { id: "s1", role: "standard" },
        ],
        standards: [{ imageId: "s1", concentration: 5 }],
      }),
    );
    expect(names.get("l1")).toBe("laser-650nm");
    expect(names.get("s1")).toBe("standard-5uM");
  });

  it("de-duplicates colliding names (same concentration, multiple unknowns)", () => {
    const names = imageBlobBaseNames(
      exp({
        unit: "mg/L",
        images: [
          { id: "s1", role: "standard" },
          { id: "s2", role: "standard" },
          { id: "u1", role: "unknown" },
          { id: "u2", role: "unknown" },
        ],
        standards: [
          { imageId: "s1", concentration: 0.1 },
          { imageId: "s2", concentration: 0.1 },
        ],
        unknowns: [{ imageId: "u1" }, { imageId: "u2" }],
      }),
    );
    expect(names.get("s1")).toBe("standard-0.1mgL");
    expect(names.get("s2")).toBe("standard-0.1mgL-2");
    expect(names.get("u1")).toBe("unknown-1");
    expect(names.get("u2")).toBe("unknown-2");
  });
});
