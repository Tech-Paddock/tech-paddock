// TEC-164: a stored photo never changes (RULES.md, Never 6). A retry of the same photo is a success.
import { describe, expect, it } from "vitest";
import { PhotoConflict, StorageError, uploadPhoto } from "@/lib/storage";

const PATH = "health/11111111-1111-4111-8111-111111111111.jpg";
const bytes = (...n: number[]) => new Uint8Array(n).buffer;

/** A bucket that refuses a taken path like Supabase does, and records every call. */
function fakeDb(initial: Record<string, ArrayBuffer> = {}, failWith?: { statusCode?: string; message: string }) {
  const objects = new Map(Object.entries(initial));
  const calls: string[] = [];
  const bucket = {
    upload: async (path: string, body: ArrayBuffer, opts: { upsert?: boolean }) => {
      calls.push(`upload upsert=${opts.upsert}`);
      if (failWith) return { error: failWith };
      if (objects.has(path) && !opts.upsert) return { error: { statusCode: "409", message: "The resource already exists" } };
      objects.set(path, body);
      return { error: null };
    },
    download: async (path: string) => {
      calls.push("download");
      const o = objects.get(path);
      return o ? { data: new Blob([o]), error: null } : { data: null, error: { message: "not found" } };
    },
    remove: async () => {
      calls.push("remove");
      return { error: null };
    },
  };
  return { db: { storage: { from: () => bucket } } as never, objects, calls };
}

describe("uploadPhoto", () => {
  it("stores a new photo, without upsert", async () => {
    const { db, objects, calls } = fakeDb();
    await uploadPhoto(db, PATH, bytes(1, 2, 3), "image/jpeg");
    expect(objects.get(PATH)).toEqual(bytes(1, 2, 3));
    expect(calls).toEqual(["upload upsert=false"]);
  });
  it("a retry of the same photo is a success and changes nothing", async () => {
    const { db, objects, calls } = fakeDb({ [PATH]: bytes(1, 2, 3) });
    await expect(uploadPhoto(db, PATH, Buffer.from([1, 2, 3]), "image/jpeg")).resolves.toBeUndefined();
    expect(objects.get(PATH)).toEqual(bytes(1, 2, 3));
    expect(calls).toEqual(["upload upsert=false", "download"]);
  });
  it("a different photo under a stored path is refused, and the stored one stays", async () => {
    const { db, objects } = fakeDb({ [PATH]: bytes(1, 2, 3) });
    await expect(uploadPhoto(db, PATH, bytes(9, 9, 9), "image/jpeg")).rejects.toBeInstanceOf(PhotoConflict);
    await expect(uploadPhoto(db, PATH, bytes(1, 2), "image/jpeg")).rejects.toBeInstanceOf(PhotoConflict);
    expect(objects.get(PATH)).toEqual(bytes(1, 2, 3));
  });
  it("never removes anything", async () => {
    const { db, calls } = fakeDb({ [PATH]: bytes(1) });
    await uploadPhoto(db, PATH, bytes(1), "image/jpeg");
    await uploadPhoto(db, PATH, bytes(2), "image/jpeg").catch(() => undefined);
    expect(calls).not.toContain("remove");
  });
  it("any other storage failure is a StorageError, not a conflict", async () => {
    const { db } = fakeDb({}, { statusCode: "500", message: "boom" });
    await expect(uploadPhoto(db, PATH, bytes(1), "image/jpeg")).rejects.toBeInstanceOf(StorageError);
  });
});
