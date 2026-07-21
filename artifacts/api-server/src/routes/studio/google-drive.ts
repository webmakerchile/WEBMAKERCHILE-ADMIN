import { google } from "googleapis";
import { statSync } from "fs";
import { createReadStream } from "fs";
import { writeFile, unlink } from "fs/promises";
import path from "path";
import { db } from "@workspace/db";
import { users } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

const FOLDER_ID = process.env.STUDIO_DRIVE_FOLDER_ID || "1af5QA5n0uE1DH28nqVbSzBXZLM5bR_kB";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

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

type DriveClient = ReturnType<typeof google.drive>;

async function getDriveClient(userId: number): Promise<DriveClient> {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.googleAccessToken) {
    const err = new Error("driveAuthRequired");
    (err as any).driveAuthRequired = true;
    throw err;
  }

  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken ?? undefined,
  });

  oauth2Client.on("tokens", async (tokens) => {
    const updates: Record<string, string> = {};
    if (tokens.access_token) updates.googleAccessToken = tokens.access_token;
    if (tokens.refresh_token) updates.googleRefreshToken = tokens.refresh_token;
    if (Object.keys(updates).length > 0) {
      await db.update(users).set(updates).where(eq(users.id, userId)).catch(console.error);
      console.log("[GoogleDrive] Tokens refreshed for user", userId);
    }
  });

  return google.drive({ version: "v3", auth: oauth2Client });
}

async function listAllFoldersInParent(
  drive: DriveClient,
  parentId: string
): Promise<Array<{ id: string; name: string; createdTime: string }>> {
  const query = `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const resp = await drive.files.list({
    q: query,
    fields: "files(id,name,createdTime)",
    orderBy: "createdTime",
    pageSize: 100,
  });
  return (resp.data.files || []) as Array<{ id: string; name: string; createdTime: string }>;
}

async function trashFolder(drive: DriveClient, folderId: string): Promise<void> {
  try {
    await drive.files.update({ fileId: folderId, requestBody: { trashed: true } });
    console.log(`[GoogleDrive] Trashed duplicate folder: ${folderId}`);
  } catch (e: any) {
    console.warn(`[GoogleDrive] Could not trash folder ${folderId}: ${e.message}`);
  }
}

async function deduplicateFolders(
  drive: DriveClient,
  parentId: string,
  folderName: string
): Promise<string | null> {
  const allFolders = await listAllFoldersInParent(drive, parentId);
  const matching = allFolders.filter(f => f.name === folderName);

  if (matching.length === 0) return null;

  const sorted = matching.sort((a, b) =>
    new Date(a.createdTime).getTime() - new Date(b.createdTime).getTime()
  );

  const keeper = sorted[0];

  if (sorted.length > 1) {
    console.log(`[GoogleDrive] Found ${sorted.length} folders named "${folderName}" - keeping oldest ${keeper.id}, trashing ${sorted.length - 1} duplicates`);
    for (let i = 1; i < sorted.length; i++) {
      await trashFolder(drive, sorted[i].id);
    }
  }

  return keeper.id;
}

async function findOrCreateFolder(
  drive: DriveClient,
  parentId: string,
  folderName: string
): Promise<string> {
  const cacheKey = `${parentId}:${folderName}`;

  const cached = folderCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < CACHE_TTL) return cached.id;

  if (folderCreateLock) await folderCreateLock;

  const cachedAfterWait = folderCache.get(cacheKey);
  if (cachedAfterWait && (Date.now() - cachedAfterWait.ts) < CACHE_TTL) return cachedAfterWait.id;

  let resolvelock!: () => void;
  folderCreateLock = new Promise(r => { resolvelock = r; });

  try {
    let foundId = await deduplicateFolders(drive, parentId, folderName);

    if (foundId) {
      console.log(`[GoogleDrive] Using existing folder "${folderName}": ${foundId}`);
      folderCache.set(cacheKey, { id: foundId, ts: Date.now() });
      return foundId;
    }

    const createResp = await drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      },
      fields: "id",
    });

    const createdId = createResp.data.id;
    if (!createdId) {
      console.error("[GoogleDrive] Failed to create folder:", JSON.stringify(createResp.data));
      throw new Error(`Could not create folder "${folderName}"`);
    }

    console.log(`[GoogleDrive] Created folder "${folderName}": ${createdId}`);

    await new Promise(r => setTimeout(r, 1500));
    const verifiedId = await deduplicateFolders(drive, parentId, folderName);
    const finalId = verifiedId || createdId;

    folderCache.set(cacheKey, { id: finalId, ts: Date.now() });
    return finalId;
  } finally {
    folderCreateLock = null;
    resolvelock();
  }
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const DAY_ORDER = ["Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado", "Domingo"];
const MAX_VIDEOS_PER_DAY = 5;

function getSmartStartDay(): string {
  const chile = getChileDate();
  const hour = chile.getHours();
  const currentDayIndex = chile.getDay();
  const currentDayName = DAY_NAMES[currentDayIndex];

  if (hour < 10) {
    const yesterdayIndex = currentDayIndex === 0 ? 6 : currentDayIndex - 1;
    const yesterdayName = DAY_NAMES[yesterdayIndex];
    console.log(`[GoogleDrive] Before 10 AM (${hour}:xx) - allowing yesterday (${yesterdayName}) as start day`);
    return yesterdayName;
  }

  console.log(`[GoogleDrive] After 10 AM (${hour}:xx) - start day: ${currentDayName}`);
  return currentDayName;
}

export function getSuggestedDay(): { suggestedDay: string; currentDay: string; hour: number; availableDays: string[] } {
  const chile = getChileDate();
  const hour = chile.getHours();
  const currentDayIndex = chile.getDay();
  const currentDayName = DAY_NAMES[currentDayIndex];
  const smartStart = getSmartStartDay();

  const smartStartOrderIdx = DAY_ORDER.indexOf(smartStart);
  const availableDays = smartStartOrderIdx >= 0
    ? DAY_ORDER.slice(smartStartOrderIdx)
    : DAY_ORDER;

  return { suggestedDay: smartStart, currentDay: currentDayName, hour, availableDays };
}

async function countSubfoldersInFolder(drive: DriveClient, folderId: string): Promise<number> {
  const folders = await listAllFoldersInParent(drive, folderId);
  if (folders.length === 0) return 0;

  let maxNum = 0;
  for (const f of folders) {
    const num = parseInt(f.name, 10);
    if (!isNaN(num) && num > maxNum) maxNum = num;
  }
  return maxNum > 0 ? maxNum : folders.length;
}

async function findAvailableDaySlot(
  drive: DriveClient,
  weekFolderId: string,
  startFromDay?: string
): Promise<{ dayName: string; dayFolderId: string; slotNumber: number } | null> {
  let startIdx = 0;
  if (startFromDay) {
    const idx = DAY_ORDER.indexOf(startFromDay);
    if (idx >= 0) startIdx = idx;
  }

  for (let i = startIdx; i < DAY_ORDER.length; i++) {
    const dayName = DAY_ORDER[i];
    const dayFolderId = await findOrCreateFolder(drive, weekFolderId, dayName);
    const usedSlots = await countSubfoldersInFolder(drive, dayFolderId);
    if (usedSlots < MAX_VIDEOS_PER_DAY) {
      const slotNumber = usedSlots + 1;
      console.log(`[GoogleDrive] Found slot: ${dayName}/${slotNumber} (${usedSlots}/${MAX_VIDEOS_PER_DAY} used)`);
      return { dayName, dayFolderId, slotNumber };
    }
    console.log(`[GoogleDrive] ${dayName} full (${usedSlots}/${MAX_VIDEOS_PER_DAY})`);
  }
  return null;
}

async function getTargetFolderId(drive: DriveClient, targetDay?: string): Promise<{ folderId: string; fileNumber: number; dayName: string }> {
  const chile = getChileDate();
  const monthIndex = chile.getMonth();
  let year = chile.getFullYear();
  const weekNum = getWeekOfMonth(chile);

  const startFromDay = targetDay && DAY_ORDER.includes(targetDay)
    ? targetDay
    : getSmartStartDay();

  console.log(`[GoogleDrive] Target day logic: requested=${targetDay || "auto"}, resolved=${startFromDay}`);

  for (let monthAttempt = 0; monthAttempt < 3; monthAttempt++) {
    const actualMonthIndex = (monthIndex + monthAttempt) % 12;
    if (monthAttempt > 0 && actualMonthIndex === 0) year++;
    const monthName = MONTH_NAMES[actualMonthIndex];
    const monthFolderId = await findOrCreateFolder(drive, FOLDER_ID, monthName);

    const startWeek = monthAttempt === 0 ? weekNum : 1;
    for (let w = startWeek; w <= 5; w++) {
      const weekName = `Semana ${w}`;
      console.log(`[GoogleDrive] Checking: ${monthName} > ${weekName}`);
      const weekFolderId = await findOrCreateFolder(drive, monthFolderId, weekName);

      const dayFilter = (monthAttempt === 0 && w === weekNum) ? startFromDay : undefined;
      const slot = await findAvailableDaySlot(drive, weekFolderId, dayFilter);
      if (slot) {
        const videoFolderName = String(slot.slotNumber);
        const videoFolderId = await findOrCreateFolder(drive, slot.dayFolderId, videoFolderName);
        const globalNumber = (w - 1) * MAX_VIDEOS_PER_DAY * 7 + DAY_ORDER.indexOf(slot.dayName) * MAX_VIDEOS_PER_DAY + slot.slotNumber;

        console.log(`[GoogleDrive] Target: ${monthName}/${weekName}/${slot.dayName}/${videoFolderName}`);
        return { folderId: videoFolderId, fileNumber: globalNumber, dayName: slot.dayName };
      }
      console.log(`[GoogleDrive] ${monthName}/${weekName} completely full, checking next week...`);
    }
    console.log(`[GoogleDrive] ${monthName} completely full, checking next month...`);
  }

  throw new Error("[GoogleDrive] Could not find available slot in 3 months of weeks/days");
}

function buildFileName(fileNumber: number, ideaTitle: string, ext: string = "mp4", targetTime?: string): string {
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

  const timeTag = targetTime ? `_${targetTime.replace(":", "h")}` : "";
  return `${fileNumber}_${dateStr}${timeTag}_${cleanTitle}.${ext}`;
}

async function uploadFileFromPath(
  drive: DriveClient,
  filePath: string,
  fileName: string,
  targetFolderId: string,
  mimeType: string = "video/mp4"
): Promise<{ fileId: string; webViewLink: string }> {
  const stats = statSync(filePath);
  const totalSize = stats.size;

  console.log(`[GoogleDrive] Uploading: ${fileName} (${(totalSize / 1024 / 1024).toFixed(1)}MB)`);

  const resp = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [targetFolderId],
      mimeType,
    },
    media: {
      mimeType,
      body: createReadStream(filePath),
    },
    fields: "id,name,webViewLink",
  });

  const fileId = resp.data.id;
  if (!fileId) {
    throw new Error("Drive upload completed but no file ID returned");
  }

  console.log(`[GoogleDrive] Uploaded: ${resp.data.name} (${fileId})`);

  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch (e) {
    console.warn("[GoogleDrive] Could not set permission:", e);
  }

  return {
    fileId,
    webViewLink: resp.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`,
  };
}

async function verifyDriveFile(drive: DriveClient, fileId: string): Promise<{ exists: boolean; name?: string; size?: number }> {
  try {
    const resp = await drive.files.get({ fileId, fields: "id,name,size,trashed" });
    const data = resp.data as any;
    if (data.trashed) {
      console.error("[GoogleDrive] Verify failed: file is trashed");
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
  userId: number,
  actualMimeType: string = "video/mp4",
  targetDay?: string,
  targetTime?: string
): Promise<{ fileId: string; webViewLink: string; driveFolderId: string; verified: boolean; dayName: string }> {
  const ext = actualMimeType.includes("mp4") ? "mp4" : "webm";
  const MAX_ATTEMPTS = 3;
  const errors: string[] = [];

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      if (attempt > 0) {
        folderCache.clear();
        await new Promise(r => setTimeout(r, 3000 * attempt));
      }

      const drive = await getDriveClient(userId);
      const { folderId, fileNumber, dayName } = await getTargetFolderId(drive, targetDay);
      const fileName = buildFileName(fileNumber, ideaTitle, ext, targetTime);

      console.log(`[VideoUpload] Attempt ${attempt + 1}/${MAX_ATTEMPTS}: ${fileName} (${actualMimeType})`);

      const result = await uploadFileFromPath(drive, filePath, fileName, folderId, actualMimeType);

      console.log(`[VideoUpload] Upload returned fileId=${result.fileId}, verifying...`);
      const verification = await verifyDriveFile(drive, result.fileId);

      if (!verification.exists) {
        const msg = `File ${result.fileId} uploaded but NOT found in Drive verification`;
        console.error(`[VideoUpload] ${msg}`);
        errors.push(msg);
        continue;
      }

      console.log(`[VideoUpload] VERIFIED in Drive: "${verification.name}" (${((verification.size || 0) / 1024 / 1024).toFixed(1)}MB) -> ${dayName}`);
      return { ...result, driveFolderId: folderId, verified: true, dayName };
    } catch (driveErr: any) {
      const msg = driveErr.message || "Unknown error";
      console.error(`[VideoUpload] Attempt ${attempt + 1} failed: ${msg}`);
      if ((driveErr as any).driveAuthRequired) throw driveErr;
      errors.push(msg);
    }
  }

  throw new Error(`Google Drive upload failed after ${MAX_ATTEMPTS} attempts: ${errors.join(" | ")}`);
}

export async function uploadCoverToDriveFromBuffer(
  imageBuffer: Buffer,
  videoFileName: string,
  userId: number,
  mimeType: string = "image/png",
  targetFolderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const ext = mimeType.includes("png") ? "png" : "jpg";
  const numMatch = videoFileName.match(/^(\d+)[_\-]/);
  const seqNum = numMatch ? numMatch[1] : "0";
  const coverName = `${seqNum}_${Date.now()}.${ext}`;

  const drive = await getDriveClient(userId);

  let folderId = targetFolderId;
  if (!folderId) {
    const target = await getTargetFolderId(drive);
    folderId = target.folderId;
  }

  console.log(`[GoogleDrive] Uploading cover: ${coverName} to folder ${folderId}`);

  const tmpPath = path.join("/tmp", `cover-upload-${Date.now()}.${ext}`);
  await writeFile(tmpPath, imageBuffer);

  try {
    const result = await uploadFileFromPath(drive, tmpPath, coverName, folderId, mimeType);
    console.log(`[GoogleDrive] Cover uploaded: ${result.webViewLink}`);
    return result;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

export async function uploadDescriptionsToDrive(
  descriptionsText: string,
  videoFileName: string,
  userId: number,
  targetFolderId?: string
): Promise<{ fileId: string; webViewLink: string }> {
  const numMatch = videoFileName.match(/^(\d+)[_\-]/);
  const seqNum = numMatch ? numMatch[1] : "0";
  const descName = `${seqNum}_${Date.now()}_DESCRIPCIONES.txt`;

  const drive = await getDriveClient(userId);

  let folderId = targetFolderId;
  if (!folderId) {
    const target = await getTargetFolderId(drive);
    folderId = target.folderId;
  }

  console.log(`[GoogleDrive] Uploading descriptions: ${descName} to folder ${folderId}`);

  const tmpPath = path.join("/tmp", `desc-upload-${Date.now()}.txt`);
  await writeFile(tmpPath, descriptionsText, "utf-8");

  try {
    const result = await uploadFileFromPath(drive, tmpPath, descName, folderId, "text/plain");
    console.log(`[GoogleDrive] Descriptions uploaded: ${result.webViewLink}`);
    return result;
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}
