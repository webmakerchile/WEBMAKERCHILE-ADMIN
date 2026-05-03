export type TikTokTokenJson = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  open_id?: string;
};

export type TikTokInitJson = {
  data?: { upload_url?: string; publish_id?: string };
  error?: { code?: string; message?: string };
};

export type IgContainerJson = {
  id?: string;
  error?: { message?: string };
};

export type IgStatusJson = {
  status_code?: "FINISHED" | "ERROR" | "IN_PROGRESS" | string;
  status?: string;
};

export type IgPublishJson = {
  id?: string;
  error?: { message?: string };
};
