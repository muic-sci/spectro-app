import { describe, it, expect } from "vitest";
import { zipSync, unzipSync, isZip } from "@/lib/store/zip";

const enc = (s: string) => new TextEncoder().encode(s);
const dec = (b: Uint8Array) => new TextDecoder().decode(b);

describe("zip (STORE)", () => {
  it("round-trips text and binary entries", () => {
    const binary = new Uint8Array([0, 255, 16, 128, 7, 7, 0, 1, 2, 254]);
    const archive = zipSync([
      { name: "experiment.spectro.json", data: enc('{"hello":"world"}') },
      { name: "blobs/abc.png", data: binary },
    ]);

    expect(isZip(archive)).toBe(true);

    const entries = unzipSync(archive);
    expect(entries.map((e) => e.name)).toEqual(["experiment.spectro.json", "blobs/abc.png"]);
    expect(dec(entries[0].data)).toBe('{"hello":"world"}');
    expect(Array.from(entries[1].data)).toEqual(Array.from(binary));
  });

  it("handles an empty-data entry", () => {
    const entries = unzipSync(zipSync([{ name: "blobs/empty.bin", data: new Uint8Array(0) }]));
    expect(entries).toHaveLength(1);
    expect(entries[0].data).toHaveLength(0);
  });

  it("writes a standard CRC-32 in the local header", () => {
    // CRC-32 of the ASCII "check" string "123456789" is the well-known 0xCBF43926.
    const archive = zipSync([{ name: "x", data: enc("123456789") }]);
    const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
    expect(view.getUint32(14, true) >>> 0).toBe(0xcbf43926);
  });

  it("rejects non-zip bytes", () => {
    expect(isZip(enc("{not a zip}"))).toBe(false);
  });
});
