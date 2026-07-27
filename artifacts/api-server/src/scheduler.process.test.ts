import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = Record<string, unknown>;

const state: {
  dueVideos: Row[];
  videoById: Row | null;
  adminUser: Row | null;
  postRun: Row | null;
  updates: Array<Record<string, unknown>>;
  inserts: Array<Record<string, unknown>>;
} = {
  dueVideos: [],
  videoById: null,
  adminUser: null,
  postRun: null,
  updates: [],
  inserts: [],
};

function makeThenable<T>(value: T) {
  const arr = Array.isArray(value) ? value : [value];
  const obj: any = {
    then: (resolve: (v: unknown) => void) => Promise.resolve(arr).then(resolve),
    limit: async () => arr,
    where: () => makeThenable(arr),
    orderBy: () => makeThenable(arr),
  };
  return obj;
}

vi.mock("@workspace/db", () => ({
  db: {
    select: (_fields?: unknown) => ({
      from: (table: any) => {
        const tableName = table?._tableName ?? table?.name ?? "";
        return {
          where: (..._args: unknown[]) => {
            if (tableName === "users") {
              return makeThenable(state.adminUser ? [state.adminUser] : []);
            }
            if (_fields) {
              return makeThenable(state.postRun ? [state.postRun] : []);
            }
            if (state.videoById) return makeThenable([state.videoById]);
            return makeThenable(state.dueVideos);
          },
          limit: async () => {
            if (tableName === "users") return state.adminUser ? [state.adminUser] : [];
            return state.dueVideos;
          },
          orderBy: () =>
            makeThenable(
              tableName === "users" ? (state.adminUser ? [state.adminUser] : []) : state.dueVideos,
            ),
        };
      },
    }),
    update: () => ({
      set: (data: Record<string, unknown>) => ({
        where: async () => {
          state.updates.push(data);
          return undefined;
        },
      }),
    }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        state.inserts.push(v);
        return undefined;
      },
    }),
  },
}));

vi.mock("@workspace/db/schema", () => ({
  videos: { _tableName: "videos" },
  users: { _tableName: "users" },
  publishAttempts: { _tableName: "publishAttempts" },
}));

const linkedinPostMock = vi.fn();
const xPostMock = vi.fn();
const facebookPostMock = vi.fn();
vi.mock("./routes/linkedin", () => ({
  publishLinkedInPost: linkedinPostMock, publishLinkedInVideo: vi.fn(),
}));
vi.mock("./routes/x", () => ({ publishXPost: xPostMock, publishXTweetWithVideo: vi.fn() }));
vi.mock("./routes/facebook", () => ({ publishToFacebook: facebookPostMock }));
vi.mock("./lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("./lib/connections", () => ({
  checkConnectionsForAdmin: vi.fn(), markNetworkRevoked: vi.fn(),
}));
vi.mock("./routes/instagram/temp-serve", () => ({
  registerTempFile: vi.fn(), unregisterTempFile: vi.fn(),
}));

const driveGetMock = vi.fn();
const youtubeInsertMock = vi.fn();
const youtubeThumbsMock = vi.fn();
vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
        on() {}
      },
    },
    drive: () => ({ files: { get: driveGetMock } }),
    youtube: () => ({
      videos: { insert: youtubeInsertMock },
      thumbnails: { set: youtubeThumbsMock },
    }),
  },
}));

function videoRow(overrides: Partial<Row> = {}): Row {
  return {
    id: 1,
    title: "demo",
    description: "base desc",
    status: "scheduled",
    scheduledAt: new Date("2020-01-01T00:00:00Z"),
    nextRetryAt: null,
    videoFileDriveId: null,
    youtubeTitle: null, youtubeDescription: null, youtubeVideoId: null,
    tiktokDescription: null, tiktokPublishId: null,
    instagramDescription: null, instagramMediaId: null,
    linkedinDescription: null, linkedinPostId: null,
    xDescription: null, xPostId: null,
    facebookDescription: null, facebookPostId: null,
    facebookStatus: "skipped",
    youtubeStatus: "pending", tiktokStatus: "pending", instagramStatus: "pending",
    linkedinStatus: "pending", xStatus: "pending",
    youtubeRetries: 0, tiktokRetries: 0, instagramRetries: 0,
    linkedinRetries: 0, xRetries: 0, facebookRetries: 0,
    youtubeError: null, tiktokError: null, instagramError: null,
    linkedinError: null, xError: null, facebookError: null,
    youtubeNextRetryAt: null, tiktokNextRetryAt: null, instagramNextRetryAt: null,
    linkedinNextRetryAt: null, xNextRetryAt: null, facebookNextRetryAt: null,
    ...overrides,
  };
}

function postRunSnapshot(overrides: Partial<Row> = {}): Row {
  return {
    youtubeStatus: "pending", tiktokStatus: "pending", instagramStatus: "pending",
    linkedinStatus: "pending", xStatus: "pending", facebookStatus: "skipped",
    nextRetryAt: null,
    youtubeNextRetryAt: null, tiktokNextRetryAt: null, instagramNextRetryAt: null,
    linkedinNextRetryAt: null, xNextRetryAt: null, facebookNextRetryAt: null,
    ...overrides,
  };
}

beforeEach(() => {
  state.dueVideos = [];
  state.videoById = null;
  state.adminUser = {
    id: 7,
    googleAccessToken: "g-tok", googleRefreshToken: "g-ref",
    linkedinAccessToken: "li-tok", linkedinPersonUrn: "urn:li:person:abc",
    xAccessToken: "x-tok", xUserId: "x-u1",
    tiktokAccessToken: "tk-tok",
    tiktokTokenExpiresAt: new Date(Date.now() + 3_600_000),
  };
  state.postRun = postRunSnapshot();
  state.updates = [];
  state.inserts = [];
  linkedinPostMock.mockReset();
  xPostMock.mockReset();
  facebookPostMock.mockReset();
  driveGetMock.mockReset();
  youtubeInsertMock.mockReset();
  youtubeThumbsMock.mockReset();
  vi.resetModules();
});

describe("processScheduledVideos: ninguna red se salta en silencio", () => {
  it("sin archivo, YouTube/TikTok/Instagram quedan 'skipped' CON el motivo", async () => {
    // Antes estas tres se resolvían con { success: true } y un console.log: la
    // publicación quedaba en verde y el usuario no tenía forma de saber que
    // nunca se intentaron. Un salto invisible es indistinguible de un éxito.
    state.dueVideos = [videoRow({ id: 40, videoFileDriveId: null, linkedinDescription: "hola" })];
    linkedinPostMock.mockResolvedValueOnce({ success: true, postId: "urn:1" });
    const { processScheduledVideos } = await import("./scheduler");
    await processScheduledVideos();

    for (const campo of ["youtubeStatus", "tiktokStatus", "instagramStatus"] as const) {
      const u = state.updates.find((x) => x[campo] === "skipped");
      expect(u, `${campo} no quedó marcado como omitido`).toBeTruthy();
    }
    const conMotivo = state.updates.find((u) => u.instagramStatus === "skipped");
    expect(String(conMotivo!.instagramError)).toContain("imagen ni video");
  });

  it("una red pedida sin su descripción dice qué falta", async () => {
    state.dueVideos = [videoRow({ id: 41, videoFileDriveId: "drive-id", xStatus: "pending" })];
    driveGetMock.mockResolvedValue({ data: new ArrayBuffer(8) });
    const { processScheduledVideos } = await import("./scheduler");
    await processScheduledVideos();
    const u = state.updates.find((x) => x.xStatus === "skipped");
    expect(u).toBeTruthy();
    expect(String(u!.xError)).toContain("descripción de X");
  });

  it("NO publica en una red que el usuario no eligió aunque haya descripción general", async () => {
    // El esquema deja los estados por red en "pending" por defecto, así que
    // ese estado no prueba intención: el texto propio de la red sí. Caer al
    // `description` general publicaría en cuentas reales que nadie eligió.
    state.dueVideos = [videoRow({ id: 42, description: "texto general", xDescription: null })];
    const { processScheduledVideos } = await import("./scheduler");
    await processScheduledVideos();
    expect(xPostMock).not.toHaveBeenCalled();
    expect(linkedinPostMock).not.toHaveBeenCalled();
  });
});

describe("processScheduledVideos: state transitions", () => {
  it("marks status='published' when LinkedIn-only video succeeds", async () => {
    state.dueVideos = [videoRow({ id: 11, linkedinDescription: "hola" })];
    linkedinPostMock.mockResolvedValueOnce({ success: true, postId: "urn:1" });
    const { processScheduledVideos } = await import("./scheduler");
    await processScheduledVideos();
    expect(linkedinPostMock).toHaveBeenCalledOnce();
    const lastUpdate = state.updates.at(-1)!;
    expect(lastUpdate.status).toBe("published");
    expect(lastUpdate.publishedAt).toBeInstanceOf(Date);
  });

  it("marks status='partial' when LinkedIn succeeds but X fails (no retries)", async () => {
    state.dueVideos = [videoRow({
      id: 12,
      linkedinDescription: "hola li",
      xDescription: "hola x",
    })];
    linkedinPostMock.mockResolvedValueOnce({ success: true, postId: "urn:2" });
    xPostMock.mockResolvedValueOnce({ success: false, error: "boom" });
    state.postRun = postRunSnapshot({
      linkedinStatus: "uploaded",
      xStatus: "error",
    });
    const { processScheduledVideos } = await import("./scheduler");
    await processScheduledVideos();
    const lastUpdate = state.updates.at(-1)!;
    expect(lastUpdate.status).toBe("partial");
    expect(lastUpdate.publishedAt).toBeInstanceOf(Date);
  });

  it("marks status='error' when X-only video fails terminally", async () => {
    state.dueVideos = [videoRow({ id: 13, description: null, xDescription: "hola x" })];
    xPostMock.mockResolvedValueOnce({ success: false, error: "kaboom" });
    state.postRun = postRunSnapshot({ xStatus: "error" });
    const { processScheduledVideos } = await import("./scheduler");
    await processScheduledVideos();
    const lastUpdate = state.updates.at(-1)!;
    expect(lastUpdate.status).toBe("error");
  });

  it("logs a successful publish attempt to publishAttempts on LinkedIn success", async () => {
    state.dueVideos = [videoRow({ id: 14, linkedinDescription: "hola" })];
    linkedinPostMock.mockResolvedValueOnce({ success: true, postId: "urn:3" });
    const { processScheduledVideos } = await import("./scheduler");
    await processScheduledVideos();
    const successLogs = state.inserts.filter((i) => i.outcome === "success" && i.platform === "linkedin");
    expect(successLogs.length).toBe(1);
    expect(successLogs[0].videoId).toBe(14);
  });

  it("exits early when no admin user exists", async () => {
    state.dueVideos = [videoRow({ id: 15, linkedinDescription: "hola" })];
    state.adminUser = null;
    const { processScheduledVideos } = await import("./scheduler");
    await processScheduledVideos();
    expect(linkedinPostMock).not.toHaveBeenCalled();
    expect(state.updates.length).toBe(0);
  });
});

describe("retryPlatformForVideo: publish success paths (YouTube/TikTok/Instagram)", () => {
  it("uploads to YouTube successfully and persists youtubeVideoId", async () => {
    state.videoById = videoRow({
      id: 21, videoFileDriveId: "drive-id-xyz", youtubeTitle: "Mi Video",
      youtubeDescription: "desc",
    });
    driveGetMock.mockResolvedValueOnce({ data: new ArrayBuffer(8) });
    youtubeInsertMock.mockResolvedValueOnce({ data: { id: "yt-abc-123" } });
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(21, "youtube", {
      id: 7, googleAccessToken: "g", googleRefreshToken: "r",
    });
    expect(r.success).toBe(true);
    expect(youtubeInsertMock).toHaveBeenCalledOnce();
    const persistedVideoId = state.updates.find((u) => u.youtubeVideoId === "yt-abc-123");
    expect(persistedVideoId).toBeTruthy();
    expect(persistedVideoId!.youtubeStatus).toBe("uploaded");
  });

  it("returns failure when YouTube insert throws (network error)", async () => {
    state.videoById = videoRow({
      id: 22, videoFileDriveId: "drive-id-xyz",
      youtubeTitle: "Mi Video", youtubeDescription: "desc",
    });
    driveGetMock.mockResolvedValueOnce({ data: new ArrayBuffer(4) });
    youtubeInsertMock.mockRejectedValueOnce(new Error("quotaExceeded"));
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(22, "youtube", {
      id: 7, googleAccessToken: "g", googleRefreshToken: "r",
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe("quotaExceeded");
  });

  it("uploads to TikTok happy path: init returns publish_id and chunks succeed", async () => {
    state.videoById = videoRow({
      id: 23, videoFileDriveId: "drive-id", tiktokDescription: "hola tt",
    });
    driveGetMock.mockResolvedValueOnce({ data: new ArrayBuffer(16) });
    const realFetch = globalThis.fetch;
    const fetchSpy = vi.fn(async (url: any, init?: any) => {
      const u = String(url);
      if (u.includes("/v2/post/publish/inbox/video/init/")) {
        return new Response(JSON.stringify({
          data: { upload_url: "https://upload.tiktok.example/u/1", publish_id: "tt-pub-555" },
          error: { code: "ok", message: "" },
        }), { status: 200 });
      }
      if (u.includes("upload.tiktok.example")) {
        return new Response("", { status: 200 });
      }
      return realFetch(url, init);
    });
    globalThis.fetch = fetchSpy as any;
    try {
      const { retryPlatformForVideo } = await import("./scheduler");
      const r = await retryPlatformForVideo(23, "tiktok", {
        id: 7, googleAccessToken: "g", googleRefreshToken: "r",
        tiktokAccessToken: "tk-tok",
        tiktokTokenExpiresAt: new Date(Date.now() + 3_600_000),
      });
      expect(r.success).toBe(true);
      const persisted = state.updates.find((u) => u.tiktokPublishId === "tt-pub-555");
      expect(persisted).toBeTruthy();
      expect(persisted!.tiktokStatus).toBe("uploaded");
    } finally {
      globalThis.fetch = realFetch;
      vi.unstubAllEnvs();
    }
  });

  it("returns failure when TikTok init returns a non-ok error code", async () => {
    state.videoById = videoRow({
      id: 24, videoFileDriveId: "drive-id", tiktokDescription: "hola tt",
    });
    driveGetMock.mockResolvedValueOnce({ data: new ArrayBuffer(16) });
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/v2/post/publish/inbox/video/init/")) {
        return new Response(JSON.stringify({
          data: null,
          error: { code: "bad_request", message: "invalid" },
        }), { status: 200 });
      }
      return new Response("", { status: 500 });
    }) as any;
    try {
      const { retryPlatformForVideo } = await import("./scheduler");
      const r = await retryPlatformForVideo(24, "tiktok", {
        id: 7, googleAccessToken: "g", googleRefreshToken: "r",
        tiktokAccessToken: "tk-tok",
        tiktokTokenExpiresAt: new Date(Date.now() + 3_600_000),
      });
      expect(r.success).toBe(false);
      expect(r.error).toMatch(/TikTok init failed/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("uploads to Instagram happy path: container FINISHED then publish returns mediaId", async () => {
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "ig-tok");
    vi.stubEnv("INSTAGRAM_USER_ID", "ig-user-1");
    state.videoById = videoRow({
      id: 25, videoFileDriveId: "drive-id", instagramDescription: "hola ig",
    });
    driveGetMock.mockResolvedValueOnce({ data: new ArrayBuffer(8) });
    const realFetch = globalThis.fetch;
    let publishCalls = 0;
    globalThis.fetch = vi.fn(async (url: any) => {
      const u = String(url);
      if (u.includes("/ig-user-1/media") && !u.includes("media_publish")) {
        return new Response(JSON.stringify({ id: "container-1" }), { status: 200 });
      }
      if (u.includes("/container-1") && u.includes("status_code")) {
        return new Response(JSON.stringify({ status_code: "FINISHED" }), { status: 200 });
      }
      if (u.includes("/ig-user-1/media_publish")) {
        publishCalls++;
        return new Response(JSON.stringify({ id: "ig-media-999" }), { status: 200 });
      }
      return new Response("", { status: 500 });
    }) as any;
    try {
      const { retryPlatformForVideo } = await import("./scheduler");
      const r = await retryPlatformForVideo(25, "instagram", {
        id: 7, googleAccessToken: "g", googleRefreshToken: "r",
      });
      expect(r.success).toBe(true);
      expect(publishCalls).toBe(1);
      const persisted = state.updates.find((u) => u.instagramMediaId === "ig-media-999");
      expect(persisted).toBeTruthy();
      expect(persisted!.instagramStatus).toBe("published");
    } finally {
      globalThis.fetch = realFetch;
      vi.unstubAllEnvs();
    }
  });

  it("returns failure when Instagram container creation returns an error", async () => {
    vi.stubEnv("INSTAGRAM_ACCESS_TOKEN", "ig-tok");
    vi.stubEnv("INSTAGRAM_USER_ID", "ig-user-1");
    state.videoById = videoRow({
      id: 26, videoFileDriveId: "drive-id", instagramDescription: "hola ig",
    });
    driveGetMock.mockResolvedValueOnce({ data: new ArrayBuffer(8) });
    const realFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: { message: "video too long" } }), { status: 400 }),
    ) as any;
    try {
      const { retryPlatformForVideo } = await import("./scheduler");
      const r = await retryPlatformForVideo(26, "instagram", {
        id: 7, googleAccessToken: "g", googleRefreshToken: "r",
      });
      expect(r.success).toBe(false);
      expect(r.error).toBe("video too long");
    } finally {
      globalThis.fetch = realFetch;
      vi.unstubAllEnvs();
    }
  });
});
