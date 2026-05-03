import { describe, it, expect, vi, beforeEach } from "vitest";

const dbState = { found: true as boolean };

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (dbState.found ? [{ id: 99, title: "demo" }] : []),
        }),
        limit: async () => (dbState.found ? [{ id: 99, title: "demo" }] : []),
      }),
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
    insert: () => ({ values: async () => undefined }),
  },
}));
vi.mock("@workspace/db/schema", () => ({
  videos: {}, users: {}, publishAttempts: {},
}));
vi.mock("./routes/linkedin", () => ({
  publishLinkedInPost: vi.fn(), publishLinkedInVideo: vi.fn(),
}));
vi.mock("./routes/x", () => ({ publishXPost: vi.fn(), publishXTweetWithVideo: vi.fn() }));
vi.mock("./routes/facebook", () => ({ publishToFacebook: vi.fn() }));
vi.mock("./lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("./lib/connections", () => ({
  checkConnectionsForAdmin: vi.fn(), markNetworkRevoked: vi.fn(),
}));
vi.mock("./routes/instagram/temp-serve", () => ({
  registerTempFile: vi.fn(), unregisterTempFile: vi.fn(),
}));
vi.mock("googleapis", () => ({ google: {} }));

describe("scheduler.retryPlatformForVideo (public dispatcher)", () => {
  beforeEach(() => { dbState.found = true; });

  it("returns 'Video not found' when DB has no row", async () => {
    dbState.found = false;
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
});
