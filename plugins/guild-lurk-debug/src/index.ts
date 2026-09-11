import { findByProps } from "@vendetta/metro";
import { showToast } from "@vendetta/ui/toasts";
import { storage } from "@vendetta/plugin";
import Settings from "./settings";

const GuildActions = findByProps("joinGuild");

storage.lurkGuildIds ??= [];
storage.lastLurkError ??= "";

function formatLurkError(error: any) {
  const status = error?.status ?? error?.statusCode ?? error?.response?.status;
  const body = error?.body ?? error?.data ?? error?.response?.body ?? error?.response?.data;
  const code = body?.code ?? error?.code;
  const message = body?.message ?? error?.message ?? (typeof body === "string" ? body : undefined);

  const parts = [
    status != null ? `HTTP ${status}` : null,
    code != null ? `code ${code}` : null,
    message || null,
  ].filter(Boolean);

  if (parts.length) return parts.join(" • ");

  try {
    return JSON.stringify(body ?? error);
  } catch {
    return String(error);
  }
}

function lurk(id: string) {
  if (!GuildActions?.joinGuild) {
    const detail = "joinGuild not found";
    storage.lastLurkError = `${new Date().toISOString()} | ${id} | ${detail}`;
    showToast(`Failed: ${detail}`, "Small");
    return;
  }

  GuildActions.joinGuild(id, { lurker: true })
    .then(() => {
      storage.lastLurkError = "";
      setTimeout(() => patchGuild(id), 100);
      showToast(`Lurking in guild ${id}`, "Check");
    })
    .catch((error: any) => {
      const detail = formatLurkError(error);
      storage.lastLurkError = `${new Date().toISOString()} | ${id} | ${detail}`;
      console.error("GuildLurk joinGuild failed:", id, error);
      showToast(`Lurk failed: ${detail.slice(0, 180)}`, "Small");
    });
}

function patchGuild(id: string) {
  const guildsTree = findByProps("getGuildsTree");
  const guilds = findByProps("getGuildCount");
  const lurkingIds = findByProps("lurkingGuildIds");
  const joinGuild = findByProps("joinGuild");

  try {
    if (guildsTree?.getGuildsTree?.()?.root?.children) {
      guildsTree.getGuildsTree().root.children.unshift({
        type: "guild",
        id,
        unavailable: false,
        children: []
      });
    }

    if (guilds?.getGuild) {
      const guild = guilds.getGuild(id);
      if (guild) guild.joinedAt = new Date();
    }

    lurkingIds?.lurkingGuildIds?.()?.pop();
    joinGuild?.transitionToGuildSync?.(id);
  } catch (e) {
    console.error("Lurker patch failed:", e);
  }
}

function lurkAllStored() {
  for (const guildId of storage.lurkGuildIds) {
    if (guildId && guildId.trim()) {
      lurk(guildId.trim());
    }
  }
}

export default {
  onLoad() {
    setTimeout(() => lurkAllStored(), 500);
  },

  onUnload() {},

  settings: Settings,
};
