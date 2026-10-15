// file: src/lib/admin/__tests__/zip.test.ts
import assert from "node:assert/strict";
import { inflateRawSync } from "node:zlib";
import { createZip, safeZipName } from "../../zip";
import { runSuite } from "../../../testing/test-harness";

export async function runAll() {
  return runSuite("lib/zip", {
    "safeZipName blocks path traversal and bad characters"() {
      assert.equal(safeZipName("../../etc/passwd"), "etc/passwd");
      assert.equal(safeZipName("a\\b\\c.png"), "a/b/c.png");
      assert.equal(safeZipName('we?ird:na"me.png'), "we_ird_na_me.png");
      assert.equal(safeZipName(".."), "file");
    },
    "createZip writes a readable archive with every file"() {
      const text = Buffer.from("hello hello hello hello hello hello hello hello");
      const bin = Buffer.from([1, 2, 3, 4, 5]);
      const zip = createZip([
        { name: "a/readme.txt", data: text },
        { name: "b.bin", data: bin },
      ]);
      // end of central directory: 2 entries
      const end = zip.subarray(zip.length - 22);
      assert.equal(end.readUInt32LE(0), 0x06054b50);
      assert.equal(end.readUInt16LE(10), 2);
      // first local header: deflated text, round-trips
      assert.equal(zip.readUInt32LE(0), 0x04034b50);
      assert.equal(zip.readUInt16LE(8), 8);
      const nameLen = zip.readUInt16LE(26);
      assert.equal(zip.subarray(30, 30 + nameLen).toString(), "a/readme.txt");
      const size = zip.readUInt32LE(18);
      const inflated = inflateRawSync(zip.subarray(30 + nameLen, 30 + nameLen + size));
      assert.equal(inflated.toString(), text.toString());
    },
    "incompressible data is stored, not deflated"() {
      const zip = createZip([{ name: "x.bin", data: Buffer.from([9]) }]);
      assert.equal(zip.readUInt16LE(8), 0);
    },
  });
}
