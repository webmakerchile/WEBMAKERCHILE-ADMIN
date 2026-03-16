import { Router, type IRouter } from "express";
import { google } from "googleapis";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

function getGoogleAuth(user: any) {
  const oauth2Client = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });
  return oauth2Client;
}

router.get("/drive/files", async (req, res) => {
  const folderId = (req.query.folderId as string) || undefined;
  const pageToken = (req.query.pageToken as string) || undefined;

  try {
    const user = req.user as any;
    const auth = getGoogleAuth(user);
    const drive = google.drive({ version: "v3", auth });

    let query = "trashed = false";
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: "nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,parents)",
      orderBy: "name",
      pageSize: 100,
      pageToken: pageToken || undefined,
    });

    res.json({
      files: response.data.files || [],
      nextPageToken: response.data.nextPageToken || undefined,
    });
  } catch (error: any) {
    console.error("[Drive] Error listing files:", error.message);
    res.status(500).json({ error: error.message || "Failed to list files" });
  }
});

router.get("/drive/folders", async (req, res) => {
  const parentId = (req.query.parentId as string) || undefined;

  try {
    const user = req.user as any;
    const auth = getGoogleAuth(user);
    const drive = google.drive({ version: "v3", auth });

    let query = "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    const response = await drive.files.list({
      q: query,
      fields: "files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents)",
      orderBy: "name",
      pageSize: 100,
    });

    res.json(response.data.files || []);
  } catch (error: any) {
    console.error("[Drive] Error listing folders:", error.message);
    res.status(500).json({ error: error.message || "Failed to list folders" });
  }
});

router.get("/drive/search", async (req, res) => {
  const searchQuery = (req.query.q as string) || "";

  try {
    const user = req.user as any;
    const auth = getGoogleAuth(user);
    const drive = google.drive({ version: "v3", auth });

    const query = `name contains '${searchQuery.replace(/'/g, "\\'")}' and trashed = false`;

    const response = await drive.files.list({
      q: query,
      fields: "files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,parents)",
      orderBy: "modifiedTime desc",
      pageSize: 50,
    });

    res.json(response.data.files || []);
  } catch (error: any) {
    console.error("[Drive] Error searching:", error.message);
    res.status(500).json({ error: error.message || "Failed to search" });
  }
});

export default router;
