#!/usr/bin/env tsx
/**
 * Uploads a backup file to Google Drive via the Replit `google-drive` connector.
 *
 * Usage:
 *   tsx scripts/src/upload-backup-drive.ts <localFile> <folderId>
 *
 * The connector handles OAuth (no extra secrets required); it must be
 * installed in the same Replit account that runs the Scheduled Deployment.
 *
 * Uses Google Drive's resumable upload protocol with 256 KiB chunks so very
 * large dumps stream without buffering the whole file in memory.
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import { open, stat } from "node:fs/promises";
import path from "node:path";

const CHUNK_SIZE = 256 * 1024;

type DriveFile = { id: string; name: string; webViewLink?: string };

async function readChunk(filePath: string, start: number, length: number): Promise<Buffer> {
  const fh = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return bytesRead < length ? buf.subarray(0, bytesRead) : buf;
  } finally {
    await fh.close();
  }
}

async function uploadResumable(
  filePath: string,
  fileName: string,
  folderId: string,
): Promise<DriveFile> {
  const connectors = new ReplitConnectors();
  const totalSize = (await stat(filePath)).size;

  const init = await connectors.proxy(
    "google-drive",
    "/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({
        name: fileName,
        parents: [folderId],
        mimeType: "application/gzip",
      }),
    },
  );

  const uploadUrl = init.headers.get("location") || init.headers.get("Location");
  if (!uploadUrl) {
    const text = await init.text();
    throw new Error(
      `Drive resumable init failed (status ${init.status}): ${text.slice(0, 300)}`,
    );
  }

  let offset = 0;
  let last: DriveFile | null = null;
  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = await readChunk(filePath, offset, end - offset);
    const range = `bytes ${offset}-${end - 1}/${totalSize}`;

    let res: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        res = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": String(chunk.length),
            "Content-Range": range,
            "Content-Type": "application/gzip",
          },
          body: chunk,
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[backup-drive] chunk @${offset} attempt ${attempt + 1} failed: ${msg}`);
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
    }
    if (!res) throw new Error("chunk upload failed (no response)");

    const isLast = end >= totalSize;
    if (isLast && (res.status === 200 || res.status === 201)) {
      const text = await res.text();
      try {
        last = JSON.parse(text) as DriveFile;
      } catch {
        throw new Error(`final chunk returned non-JSON: ${text.slice(0, 200)}`);
      }
    } else if (!isLast && res.status !== 308 && res.status !== 200) {
      const text = await res.text();
      throw new Error(`chunk upload failed (status ${res.status}): ${text.slice(0, 200)}`);
    }
    offset = end;
  }

  if (!last?.id) throw new Error("upload completed but Drive returned no file id");
  return last;
}

async function pruneOldBackups(folderId: string, retentionDays: number): Promise<number> {
  const connectors = new ReplitConnectors();
  const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000).toISOString();
  const q =
    `'${folderId}' in parents and trashed=false and ` +
    `name contains 'webmaker-' and createdTime < '${cutoff}'`;
  const res = await connectors.proxy(
    "google-drive",
    `/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&pageSize=100`,
    { method: "GET" },
  );
  const data = (await res.json()) as { files?: Array<{ id: string; name: string }> };
  const files = data.files ?? [];
  let trashed = 0;
  for (const f of files) {
    try {
      await connectors.proxy("google-drive", `/drive/v3/files/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      });
      console.log(`[backup-drive] pruned ${f.name} (${f.id})`);
      trashed++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[backup-drive] could not trash ${f.name}: ${msg}`);
    }
  }
  return trashed;
}

async function main() {
  const [, , localFile, folderId] = process.argv;
  if (!localFile || !folderId) {
    console.error("usage: tsx scripts/src/upload-backup-drive.ts <localFile> <folderId>");
    process.exit(2);
  }
  const fileName = path.basename(localFile);
  const retention = Number(process.env.BACKUP_RETENTION_DAYS ?? "7");

  console.log(`[backup-drive] uploading ${fileName} → folder ${folderId}`);
  const uploaded = await uploadResumable(localFile, fileName, folderId);
  console.log(
    `[backup-drive] uploaded id=${uploaded.id} name=${uploaded.name}` +
      (uploaded.webViewLink ? ` link=${uploaded.webViewLink}` : ""),
  );

  if (Number.isFinite(retention) && retention > 0) {
    const n = await pruneOldBackups(folderId, retention);
    console.log(`[backup-drive] retention=${retention}d, trashed ${n} old dump(s)`);
  }
}

main().catch((err) => {
  console.error("[backup-drive] FATAL:", err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
