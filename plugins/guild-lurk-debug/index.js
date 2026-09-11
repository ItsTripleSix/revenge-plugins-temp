(() => {
  "use strict";

  const TARGET = "544293509494996998";
  const { findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { storage } = vendetta.plugin;
  const Toasts = vendetta.ui?.toasts ?? findByProps("showToast");
  const Assets = vendetta.ui?.assets;

  storage.lastResult ??= "No ID-resolution test run yet.";

  function toast(text, iconName = "Small") {
    try {
      Toasts?.showToast?.(text, Assets?.getAssetIDByName?.(iconName));
    } catch {}
  }

  function errorLines(err) {
    const lines = [];
    const add = (label, value) => {
      if (value !== undefined && value !== null && value !== "") {
        lines.push(`${label}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
      }
    };
    add("Name", err?.name);
    add("Message", err?.message);
    add("Code", err?.code);
    add("Status", err?.status);
    add("Body code", err?.body?.code);
    add("Body message", err?.body?.message);
    add("Response status", err?.response?.status);
    add("Response code", err?.response?.body?.code);
    add("Response message", err?.response?.body?.message);
    return lines;
  }

  function featuresOf(guild) {
    const raw = guild?.features;
    if (Array.isArray(raw)) return raw;
    if (raw instanceof Set) return Array.from(raw);
    return [];
  }

  async function resolveById() {
    const HTTP =
      findByProps("get", "post", "put", "patch", "delete") ??
      findByProps("get", "post", "put", "patch", "del");

    const Discovery =
      findByProps("startLurking", "getDiscoverableGuild") ??
      findByProps("startLurking");

    const lines = [
      `Guild: ${TARGET}`,
      "",
      "RESOLVE NAME BY ID"
    ];

    let resolved = null;

    if (Discovery?.getDiscoverableGuild) {
      try {
        const result = await Discovery.getDiscoverableGuild([TARGET]);
        if (result) {
          resolved = result;
          lines.push("Native discovery lookup: SUCCESS");
        } else {
          lines.push("Native discovery lookup: no result");
        }
      } catch (err) {
        lines.push("Native discovery lookup: FAILED");
        lines.push(...errorLines(err));
      }
    } else {
      lines.push("Native discovery lookup: unavailable");
    }

    if (!resolved && HTTP?.get) {
      try {
        const response = await HTTP.get({
          url: `/guilds/${TARGET}/preview`,
          oldFormErrors: true,
          rejectWithError: true
        });
        const body = response?.body ?? response;
        if (body?.id) {
          resolved = body;
          lines.push("Guild preview lookup: SUCCESS");
        } else {
          lines.push("Guild preview lookup: no guild returned");
        }
      } catch (err) {
        lines.push("Guild preview lookup: FAILED");
        lines.push(...errorLines(err));
      }
    }

    if (!resolved && HTTP?.get) {
      try {
        const response = await HTTP.get({
          url: "/discoverable-guilds",
          query: `guild_ids=${encodeURIComponent(TARGET)}`,
          oldFormErrors: true,
          rejectWithError: true
        });
        const body = response?.body ?? response ?? {};
        const guilds = Array.isArray(body?.guilds) ? body.guilds : [];
        const found = guilds.find(g => String(g?.id) === TARGET);
        if (found) {
          resolved = found;
          lines.push("Direct /discoverable-guilds lookup: SUCCESS");
        } else {
          lines.push(`Direct /discoverable-guilds lookup: no target returned (${guilds.length} guilds)`);
        }
      } catch (err) {
        lines.push("Direct /discoverable-guilds lookup: FAILED");
        lines.push(...errorLines(err));
      }
    }

    lines.push("");
    if (resolved) {
      const features = featuresOf(resolved);
      lines.push("TARGET RESOLVED: YES");
      lines.push(`Name: ${resolved?.name ?? "unknown"}`);
      lines.push(`Features (${features.length}): ${features.length ? features.join(", ") : "(none returned)"}`);
      lines.push(`DISCOVERABLE: ${features.includes("DISCOVERABLE") ? "YES" : "NO"}`);
      lines.push(`PREVIEW_ENABLED: ${features.includes("PREVIEW_ENABLED") ? "YES" : "NO"}`);
    } else {
      lines.push("TARGET RESOLVED: NO");
      lines.push("Discord did not expose a name for this guild through any tested discovery/preview path.");
    }

    storage.lastResult = lines.join("\n");
    console.log("GuildLurk Debug ID resolution:\n" + storage.lastResult);
    toast(resolved ? `Resolved: ${resolved?.name ?? TARGET}` : "Could not resolve guild name");
  }

  function Button({ label, onPress }) {
    return React.createElement(
      RN.Pressable,
      {
        onPress,
        style: {
          minHeight: 44,
          paddingHorizontal: 14,
          borderRadius: 8,
          backgroundColor: "#4E5058",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12
        }
      },
      React.createElement(RN.Text, { style: { color: "#FFFFFF", fontWeight: "700" } }, label)
    );
  }

  function Settings() {
    const [, refresh] = React.useReducer(x => x + 1, 0);

    return React.createElement(
      RN.ScrollView,
      { style: { flex: 1 }, contentContainerStyle: { padding: 16 } },
      React.createElement(
        RN.Text,
        { style: { color: "#F2F3F5", fontSize: 20, fontWeight: "700", marginBottom: 8 } },
        "GuildLurk ID Resolver"
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#B5BAC1", lineHeight: 19, marginBottom: 12 } },
        `Target: ${TARGET}\n\nNo server name needed. This asks Discord directly for the guild metadata using the ID.`
      ),
      React.createElement(Button, {
        label: "Resolve Server Name by ID",
        onPress: async () => {
          await resolveById();
          refresh();
        }
      }),
      React.createElement(
        RN.Text,
        { style: { color: "#F2F3F5", fontSize: 16, fontWeight: "700", marginBottom: 6 } },
        "Last Result"
      ),
      React.createElement(
        RN.Text,
        {
          selectable: true,
          style: {
            color: "#DCDDDE",
            backgroundColor: "#111214",
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            lineHeight: 17,
            fontFamily: "monospace"
          }
        },
        String(storage.lastResult)
      )
    );
  }

  return {
    onLoad() {},
    onUnload() {},
    settings: Settings
  };
})()