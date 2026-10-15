import { crc32, deflateRawSync } from "node:zlib";

// Minimal ZIP writer (no dependency): each file is deflate-compressed unless
// that doesn't help (already-compressed images are stored as they are).
// UTF-8 file names, no ZIP64 -- fine up to 4GB / 65k files, far beyond use here.

export type ZipEntry = { name: string; data: Buffer; date?: Date };

function dosDateTime(date: Date): { time: number; day: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

// Strips anything that could escape the archive root or break extraction.
export function safeZipName(name: string): string {
  const parts = name
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[<>:"|?*\u0000-\u001f]/g, "_").trim())
    .filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || "file";
}

export function createZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(safeZipName(entry.name), "utf8");
    const deflated = deflateRawSync(entry.data, { level: 6 });
    const useDeflate = deflated.byteLength < entry.data.byteLength;
    const body = useDeflate ? deflated : entry.data;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(entry.data) >>> 0;
    const { time, day } = dosDateTime(entry.date ?? new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.byteLength, 18);
    local.writeUInt32LE(entry.data.byteLength, 22);
    local.writeUInt16LE(name.byteLength, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, name, body);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4); // version made by
    header.writeUInt16LE(20, 6); // version needed
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(method, 10);
    header.writeUInt16LE(time, 12);
    header.writeUInt16LE(day, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(body.byteLength, 20);
    header.writeUInt32LE(entry.data.byteLength, 24);
    header.writeUInt16LE(name.byteLength, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);

    offset += local.byteLength + name.byteLength + body.byteLength;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.byteLength, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, centralBuf, end]);
}
