import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";

const router: IRouter = Router();

function getConnectors() {
  return new ReplitConnectors();
}

router.get("/drive/files", async (req, res) => {
  const folderId = (req.query.folderId as string) || undefined;
  const pageToken = (req.query.pageToken as string) || undefined;

  try {
    const connectors = getConnectors();
    let query = "trashed = false";
    if (folderId) {
      query += ` and '${folderId}' in parents`;
    }

    let url = `/drive/v3/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,size,createdTime,modifiedTime,webViewLink,thumbnailLink,parents)&orderBy=name&pageSize=100`;
    if (pageToken) {
      url += `&pageToken=${encodeURIComponent(pageToken)}`;
    }

    const response = await connectors.proxy("google-drive", url, {
      method: "GET",
    });
    const data = await response.json();
    res.json({
      files: data.files || [],
      nextPageToken: data.nextPageToken || undefined,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list files" });
  }
});

router.get("/drive/folders", async (req, res) => {
  const parentId = (req.query.parentId as string) || undefined;

  try {
    const connectors = getConnectors();
    let query =
      "mimeType = 'application/vnd.google-apps.folder' and trashed = false";
    if (parentId) {
      query += ` and '${parentId}' in parents`;
    }

    const url = `/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink,parents)&orderBy=name&pageSize=100`;

    const response = await connectors.proxy("google-drive", url, {
      method: "GET",
    });
    const data = await response.json();
    res.json(data.files || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to list folders" });
  }
});

router.post("/drive/upload", async (req, res) => {
  const { name, folderId, base64Data, mimeType } = req.body;

  try {
    const connectors = getConnectors();

    const metadata = {
      name,
      parents: [folderId],
    };

    const boundary = "foo_bar_baz";
    const binaryData = Buffer.from(base64Data, "base64");

    const multipartBody =
      `--${boundary}\r\n` +
      `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${mimeType}\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      `${base64Data}\r\n` +
      `--${boundary}--`;

    const response = await connectors.proxy(
      "google-drive",
      "/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink",
      {
        method: "POST",
        headers: {
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to upload file" });
  }
});

export default router;
