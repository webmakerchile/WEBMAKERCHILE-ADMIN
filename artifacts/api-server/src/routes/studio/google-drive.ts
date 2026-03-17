import { ReplitConnectors } from "@replit/connectors-sdk";
import { randomUUID } from "crypto";
import { statSync } from "fs";
import { readFile, writeFile, unlink } from "fs/promises";
import path from "path";

const FOLDER_ID = "1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB";
const CHUNK_SIZE = 256 * 1024;

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function getConnectors() {
  return new ReplitConnectors();
}

function getChileDate(): Date {
  const now = new Date();
  const chile = new Date(now.toLocaleString("en-US", { timeZone: "America/Santiago" }));
  return chile;
}

function getWeekOfMonth(date: Date): number {
  let day = date.getDate();
  const dow = date.getDay();
  if (dow === 0 && day > 1) {
    day = day - 1;
  }
  return Math.ceil(day / 7);
}

const folderCache = new Map<string, { id: string; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;
let folderCreateLock: Promise<void> | null = null;

export function clearFolderCache() {
  folderCache.clear();
  console.log("[GoogleDrive] Folder cache cleared");
}

async function listAllFoldersInParent(
  connectors: ReplitConnectors,
  parentId: string
): Promise<Array<{ id: string; name: string; createdTime: string }>> {
  const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const res = await connectors.proxy(
    "google-drive",
    `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime)&orderBy=createdTime&pageSize=100`,
    { method: "GET" }
  );
  const data = await res.json() as any;
  return data.files || [];
}

async function trashFolder(connectors: ReplitConnectors, folderId: string): Promise<void> {
  try {
    await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${folderId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      }
    );
    console.log(`[GoogleDrive] Trashed duplicate folder: ${folderId}`);
  } catch (e: any) {
    console.warn(`[GoogleDrive] Could not trash folder ${folderId}: ${e.message}`);
  }
}

async function deduplicateFolders(
  connectors: ReplitConnectors,
  parentId: string,
  folderName: string
): Promise<string | null> {
  const allFolders = await listAllFoldersInParent(connectors, parentId);
  const matching = allFolders.filter(f => f.name === folderName);

  if (matching.length === 0) return null;

  const sorted = matching.sort((a, b) =>
    new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
  );

  const keeper = sorted[0];

  if (sorted.length > 1) {
    console.log(`[GoogleDrive] Found ${sorted.length} folders named "${folderName}" - keeping oldest ${keeper.id}, trashing ${sorted.length - 1} duplicates`);
    for (let i = 1; i < sorted.length; i++) {
      await trashFolder(connectors, sorted[i].id);
    }
  }

  return keeper.id;
}

async function findOrCreateFolder(
  connectors: ReplitConnectors,
  parentId: string,
  folderName: string
): Promise<string> {
  const cacheKey = `${parentId}:${folderName}`;

  const cached = folderCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) {
    return cached.id;
  }

  if (folderCreateLock) await folderCreateLock;

  const cachedAfterWait = folderCache.get(cacheKey);
  if (cachedAfterWait && (Date.now() - cachedAfterWait.ts) < CACHE_TTL) return cachedAfterWait.id;

  let resolvelock: () => void;
  folderCreateLock = new Promise(r => { resolvelock = r; });

  try {
    let foundId = await deduplicateFolders(connectors, parentId, folderName);

    if (foundId) {
      console.log(`[GoogleDrive] Using existing folder "${folderName}": ${foundId}`);
      folderCache.set(cacheKey, { id: foundId, ts: Date.now() });
      return foundId;
    }

    const createRes = await connectors.proxy(
      "google-drive",
      `/drive/v3/files`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: folderName,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentId],
        }),
      }
    );
    const createData = await createRes.json() as any;

    if (!createData.id) {
      console.error("[GoogleDrive] Failed to create folder:", JSON.stringify(createData));
      throw new Error(`Could not create folder "${folderName}"`);
    }

    console.log(`[GoogleDrive] Created folder "${folderName}": ${createData.id}`);

    await new Promise(r => setTimeout(r, 1500));
    const verifiedId = await deduplicateFolders(connectors, parentId, folderName);
    const finalId = verifiedId || createData.id;

    folderCache.set(cacheKey, { id: finalId, ts: Date.now() });
    return finalId;
  } finally {
    folderCreateLock = null;
    resolvelock!();
  }
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const DAY_ORDER = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
const MAX_VIDEOS_PER_DAY = 5;

async function countSubfoldersInFolder(
  connectors: ReplitConnectors,
  folderId: string
): Promise<number> {
  const folders = await listAllFoldersInParent(connectors, folderId);
  if (folders.length === 0) return 0;

  let maxNum = 0;
  for (const f of folders) {
    const num = parseInt(f.name, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return maxNum > 0 ? maxNum : folders.length;
}

async function findAvailableDaySlot(
  connectors: ReplitConnectors,
  weekFolderId: string
): Promise<{ dayName: string; dayFolderId: string; slotNumber: number } | null> {
  for (const dayName of DAY_ORDER) {
    const dayFolderId = await findOrCreateFolder(connectors, weekFolderId, dayName);
    const usedSlots = await countSubfoldersInFolder(connectors, dayFolderId);
    if (usedSlots < MAX_VIDEOS_PER_DAY) {
      const slotNumber = usedSlots + 1;
      console.log(`[GoogleDrive] Found slot: ${dayName}/${slotNumber} (${usedSlots}/${MAX_VIDEOS_PER_DAY} used)`);
      return { dayName, dayFolderId, slotNumber };
    }
    console.log(`[GoogleDrive] ${dayName} full (${usedSlots}/${MAX_VIDEOS_PER_DAY})`);
  }
  return null;
}

async function getTargetFolderId(connectors: ReplitConnectors): Promise<{ folderId: string; fileNumber: number }> {
  const chile = getChileDate();
  let monthIndex = chile.getMonth();
  let year = chile.getFullYear();
  let weekNum = getWeekOfMonth(chile);

  for (let monthAttempt = 0; monthAttempt < 3; monthAttempt++) {
    const actualMonthIndex = (monthIndex + monthAttempt) % 12;
    if (monthAttempt > 0 && actualMonthIndex === 0) year++;
    const monthName = MONTH_NAMES[actualMonthIndex];
    const monthFolderId = await findOrCreateFolder(connectors, FOLDER_ID, monthName);

    const startWeek = monthAttempt === 0 ? weekNum : 1;
    for (let w = startWeek; w <= 5; w++) {
      const weekName = `Semana ${w}`;
      console.log(`[GoogleDrive] Checking: ${monthName} > ${weekName}`);
      const weekFolderId = await findOrCreateFolder(connectors, monthFolderId, weekName);

      const slot = await findAvailableDaySlot(connectors, weekFolderId);
      if (slot) {
        const videoFolderName = String(slot.slotNumber);
        const videoFolderId = await findOrCreateFolder(connectors, slot.dayFolderId, videoFolderName);
        const globalNumber = (w - 1) * MAX_VIDEOS_PER_DAY * 7 + DAY_ORDER.indexOf(slot.dayName) * MAX_VIDEOS_PER_DAY + slot.slotNumber;

        console.log(`[GoogleDrive] Target: ${monthName}/${weekName}/${slot.dayName}/${videoFolderName}`);
        return { folderId: videoFolderId, fileNumber: globalNumber };
      }
      console.log(`[GoogleDrive] ${monthName}/${weekName} completely full, checking next week...`);
    }
    console.log(`[GoogleDrive] ${monthName} completely full, checking next month...`);
  }

  throw new Error("[GoogleDrive] Could not find available slot in 3 months of weeks/days");
}

function buildFileName(fileNumber: number, ideaTitle: string, ext: string = "mp4"): string {
  const chile = getChileDate();
  const dd = String(chile.getDate()).padStart(2, "0");
  const mm = String(chile.getMonth() + 1).padStart(2, "0");
  const yyyy = chile.getFullYear();
  const dateStr = `${dd}-${mm}-${yyyy}`;

  const cleanTitle = ideaTitle
    .replace(/\*\*/g, "")
    .replace(/[^\w\s\-áéíóúñÁÉÍÓÚÑ]/g, "")
    .trim()
    .substring(0, 50);

  return `${fileNumber}_${dateStr}_${cleanTitle}.${ext}`;
}

async function readFileChunk(filePath: string, start: number, length: number): Promise<Buffer> {
  const { open } = await import("fs/promises");
  const fh = await open(filePath, "r");
  try {
    const buf = Buffer.alloc(length);
    const { bytesRead } = await fh.read(buf, 0, length, start);
    return bytesRead < length ? buf.subarray(0, bytesRead) : buf;
  } finally {
    await fh.close();
  }
}

async function uploadViaDriveResumableFromFile(
  filePath: string,
  fileName: string,
  targetFolderId: string,
  mimeType: string = "video/mp4"
): Promise<{ fileId: string; webViewLink: string }> {
  const connectors = getConnectors();
  const stats = statSync(filePath);
  const totalSize = stats.size;

  console.log(`[GoogleDrive] Initiating resumable upload: ${fileName} (${(totalSize / 1024 / 1024).toFixed(1)}MB)`);

  const initResponse = await connectors.proxy(
    "google-drive",
    `/upload/drive/v3/files?uploadType=resumable`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        name: fileName,
        parents: [targetFolderId],
        mimeType,
      }),
    }
  );

  const uploadUrl = initResponse.headers.get("location") || initResponse.headers.get("Location");

  if (!uploadUrl) {
    const bodyText = await initResponse.text();
    console.error("[GoogleDrive] Resumable init failed:", initResponse.status, bodyText.substring(0, 500));
    throw new Error(`Drive resumable init failed (status ${initResponse.status})`);
  }

  console.log(`[GoogleDrive] Got resumable URI, uploading ${Math.ceil(totalSize / CHUNK_SIZE)} chunks...`);

  let offset = 0;
  let lastResponseData: any = null;

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunkLength = end - offset;
    const chunk = await readFileChunk(filePath, offset, chunkLength);
    const contentRange = `bytes ${offset}-${end - 1}/${totalSize}`;

    let chunkRes: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        chunkRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Length": String(chunk.length),
            "Content-Range": contentRange,
            "Content-Type": mimeType,
          },
          body: chunk,
        });
        break;
      } catch (err: any) {
        console.warn(`[GoogleDrive] Chunk at ${offset} attempt ${attempt + 1} failed: ${err.message}`);
        if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        else throw err;
      }
    }

    if (!chunkRes) throw new Error("Chunk upload failed");

    const isLast = end >= totalSize;
    if (isLast && (chunkRes.status === 200 || chunkRes.status === 201)) {
      const text = await chunkRes.text();
      try { lastResponseData = JSON.parse(text); } catch {
        console.error("[GoogleDrive] Final chunk non-JSON:", text.substring(0, 300));
        throw new Error("Invalid response on final chunk");
      }
    } else if (!isLast && chunkRes.status !== 308 && chunkRes.status !== 200) {
      const errText = await chunkRes.text();
      console.error(`[GoogleDrive] Chunk error at ${offset}: ${chunkRes.status}`, errText.substring(0, 300));
      throw new Error(`Chunk upload failed (status ${chunkRes.status})`);
    }

    offset = end;
  }

  if (!lastResponseData?.id) {
    throw new Error("Drive upload completed but no file ID returned");
  }

  console.log(`[GoogleDrive] Uploaded: ${lastResponseData.name} (${lastResponseData.id})`);

  try {
    await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${lastResponseData.id}/permissions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "reader", type: "anyone" }),
      }
    );
  } catch (e) {
    console.warn("[GoogleDrive] Could not set permission:", e);
  }

  return {
    fileId: lastResponseData.id,
    webViewLink: lastResponseData.webViewLink || `https://drive.google.com/file/d/${lastResponseData.id}/view`,
  };
}

async function verifyDriveFile(fileId: string): Promise<{ exists: boolean; name?: string; size?: number }> {
  try {
    const connectors = getConnectors();
    const res = await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${fileId}?fields=id,name,size,trashed`,
      { method: "GET" }
    );
    const data = await res.json() as any;
    if (data.error || data.trashed) {
      console.error(`[GoogleDrive] Verify failed: ${JSON.stringify(data.error || "trashed")}`);
      return { exists: false };
    }
    return { exists: !!data.id, name: data.name, size: parseInt(data.size || "0") };
  } catch (e: any) {
    console.error(`[GoogleDrive] Verify error: ${e.message}`);
    return { exists: false };
  }
}

export async function uploadVideoToDriveFromFile(
  filePath: string,
  ideaTitle: string,
  actualMimeType: string = "video/mp4"
): Promise<{ fileId: string; webViewLink: string; driveFolderId: string; verified: boolean }> {
  const ext = actualMimeType.includes("mp4") ? "mp4" : "webm";
  const MAX_ATTEMPTS = 3;
  const errors: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 0) {
        folderCache.clear();
        await new Promise(r => setTimeout(r, 3000 * attempt));
      }

      const connectors = getConnectors();
      const { folderId, fileNumber } = await getTargetFolderId(connectors);
      const fileName = buildFileName(fileNumber, ideaTitle, ext);

      console.log(`[VideoUpload] Attempt ${attempt + 1}/${MAX_ATTEMPTS}: ${fileName} (${actualMimeType})`);

      const result = await uploadViaDriveResumableFromFile(filePath, fileName, folderId, actualMimeType);

      console.log(`[VideoUpload] Upload returned fileId=${result.fileId}, verifying...`);
      const verification = await verifyDriveFile(result.fileId);

      if (!verification.exists) {
        const msg = `File ${result.fileId} uploaded but NOT found in Drive verification`;
        console.error(`[VideoUpload] ${msg}`);
        errors.push(msg);
        continue;
      }

      console.log(`[VideoUpload] VERIFIED in Drive: "${verification.name}" (${((verification.size || 0) / 1024 / 1024).toFixed(1)}MB)`);
      return { ...result, driveFolderId: folderId, verified: true };
    } catch (driveErr: any) {
      const msg = driveErr.message || "Unknown error";
      console.error(`[VideoUpload] Attempt ${attempt + 1} failed: ${msg}`);
      errors.push(msg);
    }
  }

  throw new Error(`Google Drive upload failed after ${MAX_ATTEMPTS} attempts: ${errors.join(" | ")}`);
}

export async function uploadVideoToDrive(
  videoBuffer: Buffer,
  ideaTitle: string,
  actualMimeType: string = "video/mp4"
): Promise<{ fileId: string; webViewLink: string; driveFolderId: string; verified: boolean }> {
  const tmpPath = path.join("/tmp", `drive-upload-${Date.now()}.tmp`);
  await writeFile(tmpPath, videoBuffer);
  try {
    return await uploadVideoToDriveFromFile(tmpPath, ideaTitle, actualMimeType);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

export async function uploadCoverToDriveFromBuffer(
  imageBuffer: Buffer,
  videoFileName: string,
  mimeType: string = "image/png",
  targetFolderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const numMatch = videoFileName.match(/^(\d+)[_\-]/);
  const seqNum = numMatch ? numMatch[1] : "0";
  const coverName = `${seqNum}_${Date.now()}.${ext}`;

  try {
    let folderId = targetFolderId;
    if (!folderId) {
      const connectors = getConnectors();
      const target = await getTargetFolderId(connectors);
      folderId = target.folderId;
    }

    console.log(`[GoogleDrive] Uploading cover: ${coverName} to folder ${folderId}`);

    const tmpPath = path.join("/tmp", `cover-upload-${Date.now()}.${ext}`);
    await writeFile(tmpPath, imageBuffer);

    try {
      const result = await uploadViaDriveResumableFromFile(tmpPath, coverName, folderId, mimeType);
      console.log(`[GoogleDrive] Cover uploaded: ${result.webViewLink}`);
      return result;
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  } catch (err: any) {
    console.warn(`[GoogleDrive] Cover upload to Drive failed: ${err.message}`);
    throw err;
  }
}

export async function uploadDescriptionsToDrive(
  descriptionsText: string,
  videoFileName: string,
  targetFolderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const numMatch = videoFileName.match(/^(\d+)[_\-]/);
  const seqNum = numMatch ? numMatch[1] : "0";
  const descName = `${seqNum}_${Date.now()}_DESCRIPCIONES.txt`;

  try {
    let folderId = targetFolderId;
    if (!folderId) {
      const connectors = getConnectors();
      const target = await getTargetFolderId(connectors);
      folderId = target.folderId;
    }

    console.log(`[GoogleDrive] Uploading descriptions: ${descName} to folder ${folderId}`);

    const tmpPath = path.join("/tmp", `desc-upload-${Date.now()}.txt`);
    await writeFile(tmpPath, descriptionsText, "utf-8");

    try {
      const result = await uploadViaDriveResumableFromFile(tmpPath, descName, folderId, "text/plain");
      console.log(`[GoogleDrive] Descriptions uploaded: ${result.webViewLink}`);
      return result;
    } finally {
      await unlink(tmpPath).catch(() => {});
    }
  } catch (err: any) {
    console.warn(`[GoogleDrive] Descriptions upload to Drive failed: ${err.message}`);
    throw err;
  }
}

export async function testDriveConnection(): Promise<boolean> {
  try {
    const connectors = getConnectors();
    const response = await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${FOLDER_ID}?fields=id,name`,
      { method: "GET" }
    );
    const data = await response.json() as any;
    return !!data.id;
  } catch (e) {
    console.error("[GoogleDrive] Connection test failed:", e);
    return false;
  }
}

export async function listDriveStudioStructure(): Promise<any> {
  const connectors = getConnectors();
  const result: any = { rootId: FOLDER_ID, months: [] };

  const months = await listAllFoldersInParent(connectors, FOLDER_ID);
  for (const month of months) {
    const monthData: any = { name: month.name, id: month.id, weeks: [] };
    const weeks = await listAllFoldersInParent(connectors, month.id);
    for (const week of weeks) {
      const weekData: any = { name: week.name, id: week.id, days: [] };
      const days = await listAllFoldersInParent(connectors, week.id);
      for (const day of days) {
        const slots = await listAllFoldersInParent(connectors, day.id);
        const dayData: any = { name: day.name, id: day.id, slots: slots.length, slotIds: slots.map(s => ({ name: s.name, id: s.id })) };
        weekData.days.push(dayData);
      }
      monthData.weeks.push(weekData);
    }
    result.months.push(monthData);
  }
  return result;
}

export async function listFilesInDriveFolder(folderId: string): Promise<Array<{ id: string; name: string; mimeType: string; size: string; createdTime: string }>> {
  const connectors = getConnectors();
  const query = `'${folderId}' in parents and trashed=false`;
  const res = await connectors.proxy(
    "google-drive",
    `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,createdTime)&orderBy=createdTime&pageSize=100`,
    { method: "GET" }
  );
  const data = await res.json() as any;
  return data.files || [];
}

export async function deleteDriveFile(fileId: string): Promise<boolean> {
  try {
    const connectors = getConnectors();
    await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${fileId}`,
      { method: "DELETE" }
    );
    console.log(`[GoogleDrive] Deleted file: ${fileId}`);
    return true;
  } catch (e: any) {
    console.error(`[GoogleDrive] Delete failed for ${fileId}: ${e.message}`);
    return false;
  }
}

export async function trashDriveFile(fileId: string): Promise<boolean> {
  try {
    const connectors = getConnectors();
    await connectors.proxy(
      "google-drive",
      `/drive/v3/files/${fileId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trashed: true }),
      }
    );
    console.log(`[GoogleDrive] Trashed file: ${fileId}`);
    return true;
  } catch (e: any) {
    console.error(`[GoogleDrive] Trash failed for ${fileId}: ${e.message}`);
    return false;
  }
}
