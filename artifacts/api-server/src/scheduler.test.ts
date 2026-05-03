import { describe, it, expect, vi, beforeEach } from "vitest";

const fakeRow: Record<string, unknown> = {
  id: 99,
  title: "demo",
  description: "base",
  linkedinDescription: "Hola LinkedIn",
  xDescription: "Hola X",
  videoFileDriveId: null,
  linkedinPostId: null,
  xPostId: null,
  facebookPostId: null,
  linkedinStatus: "pending",
  xStatus: "pending",
  facebookStatus: "skipped",
  linkedinRetries: 0,
  xRetries: 0,
  linkedinError: null,
  xError: null,
};

const dbState: { row: Record<string, unknown> | null } = { row: { ...fakeRow } };

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (dbState.row ? [dbState.row] : []),
        }),
        limit: async () => (dbState.row ? [dbState.row] : []),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({ values: async () => undefined }),
  },
}));
vi.mock("@workspace/db/schema", () => ({
  videos: {}, users: {}, publishAttempts: {},
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
vi.mock("googleapis", () => ({
  google: { auth: { OAuth2: class {} }, drive: () => ({ files: { get: vi.fn() } }) },
}));

describe("scheduler.retryPlatformForVideo (public dispatcher)", () => {
  beforeEach(() => {
    dbState.row = { ...fakeRow };
    linkedinPostMock.mockReset();
    xPostMock.mockReset();
    facebookPostMock.mockReset();
  });

  it("returns 'Video not found' when DB has no row", async () => {
    dbState.row = null;
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(404, "linkedin", { id: 1 });
    expect(r.success).toBe(false);
    expect(r.error).toBe("Video not found");
  });

  it("returns 'Unknown platform' for an unsupported value", async () => {
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(99, "myspace", { id: 1 });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/Unknown platform: myspace/);
  });

  it("dispatches to publishLinkedInPost when user has LinkedIn creds", async () => {
    linkedinPostMock.mockResolvedValueOnce({ success: true, postId: "urn:li:share:1" });
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(99, "linkedin", {
      id: 1, linkedinAccessToken: "tok", linkedinPersonUrn: "urn:li:person:abc",
    });
    expect(r.success).toBe(true);
    expect(linkedinPostMock).toHaveBeenCalledOnce();
    expect(xPostMock).not.toHaveBeenCalled();
    expect(facebookPostMock).not.toHaveBeenCalled();
  });

  it("returns 'X not connected' on x retry when user has no token", async () => {
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(99, "x", { id: 1 });
    expect(r.success).toBe(false);
    expect(r.error).toBe("X not connected");
    expect(xPostMock).not.toHaveBeenCalled();
  });

  it("dispatches to publishXPost and propagates a 'rate limited' error", async () => {
    xPostMock.mockResolvedValueOnce({ success: false, error: "rate limited" });
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(99, "x", {
      id: 1, xAccessToken: "tok", xUserId: "u1",
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe("rate limited");
    expect(xPostMock).toHaveBeenCalledOnce();
  });

  it("returns 'No Google tokens' on YouTube retry without google creds", async () => {
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(99, "youtube", { id: 1 });
    expect(r.success).toBe(false);
    expect(r.error).toBe("No Google tokens");
  });

  it("returns 'No video file in Drive' on YouTube retry when video has no driveId", async () => {
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(99, "youtube", {
      id: 1, googleAccessToken: "g", googleRefreshToken: "r",
    });
    expect(r.success).toBe(false);
    expect(r.error).toBe("No video file in Drive");
  });

  it("returns 'No TikTok token' on TikTok retry without tiktok creds", async () => {
    const { retryPlatformForVideo } = await import("./scheduler");
    const r = await retryPlatformForVideo(99, "tiktok", { id: 1 });
    expect(r.success).toBe(false);
    expect(r.error).toBe("No TikTok token");
  });

  it("returns 'Instagram not configured' on IG retry when env creds missing", async () => {
    const orig = {
      tok: process.env.INSTAGRAM_ACCESS_TOKEN,
      uid: process.env.INSTAGRAM_USER_ID,
    };
    delete process.env.INSTAGRAM_ACCESS_TOKEN;
    delete process.env.INSTAGRAM_USER_ID;
    vi.resetModules();
    try {
      const { retryPlatformForVideo } = await import("./scheduler");
      const r = await retryPlatformForVideo(99, "instagram", { id: 1 });
      expect(r.success).toBe(false);
      expect(r.error).toBe("Instagram not configured");
    } finally {
      if (orig.tok !== undefined) process.env.INSTAGRAM_ACCESS_TOKEN = orig.tok;
      if (orig.uid !== undefined) process.env.INSTAGRAM_USER_ID = orig.uid;
      vi.resetModules();
    }
  });

  it("returns 'Facebook not connected' on FB retry when neither env nor user has tokens", async () => {
    const orig = {
      pid: process.env.FACEBOOK_PAGE_ID,
      tok: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
    };
    delete process.env.FACEBOOK_PAGE_ID;
    delete process.env.FACEBOOK_PAGE_ACCESS_TOKEN;
    vi.resetModules();
    try {
      const { retryPlatformForVideo } = await import("./scheduler");
      const r = await retryPlatformForVideo(99, "facebook", { id: 1 });
      expect(r.success).toBe(false);
      expect(r.error).toBe("Facebook not connected");
      expect(facebookPostMock).not.toHaveBeenCalled();
    } finally {
      if (orig.pid !== undefined) process.env.FACEBOOK_PAGE_ID = orig.pid;
      if (orig.tok !== undefined) process.env.FACEBOOK_PAGE_ACCESS_TOKEN = orig.tok;
      vi.resetModules();
    }
  });
});

describe("scheduler.processScheduledVideos (selection + state transitions)", () => {
  beforeEach(() => {
    dbState.row = { ...fakeRow };
    linkedinPostMock.mockReset();
    xPostMock.mockReset();
    facebookPostMock.mockReset();
  });

  it("returns without error when there are no due videos to process", async () => {
    dbState.row = null;
    const { processScheduledVideos } = await import("./scheduler");
    await expect(processScheduledVideos()).resolves.toBeUndefined();
    expect(linkedinPostMock).not.toHaveBeenCalled();
    expect(xPostMock).not.toHaveBeenCalled();
    expect(facebookPostMock).not.toHaveBeenCalled();
  });
});
