(() => {
  "use strict";

  const TARGET = "544293509494996998";
  const { findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { storage } = vendetta.plugin;
  const Toasts = vendetta.ui?.toasts ?? findByProps("showToast");
  const Assets = vendetta.ui?.assets;

  storage.lastResult ??= "No corrected ID-resolution test run yet.";

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

  function guildFromResponse(response) {
    const body = response?.body ?? response ?? {};
    if (body?.id) return body;
    if (body?.guild?.id) return body.guild;
    const guilds = Array.isArray(body?.guilds) ? body.guilds : [];
    return guilds.find(g => String(g?.id) === TARGET) ?? null;
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
      "CORRECTED RESOLVE NAME BY ID"
    ];

    let resolved = null;

    if (Discovery?.getDiscoverableGuild) {
      for (const [label, arg] of [
        ["array", [TARGET]],
        ["string", TARGET]
      ]) {
        if (resolved) break;
        try {
          const result = await Discovery.getDiscoverableGuild(arg);
          if (result) {
            resolved = result;
            lines.push(`Native discovery lookup (${label}): SUCCESS`);
          } else {
            lines.push(`Native discovery lookup (${label}): no result`);
          }
        } catch (err) {
          lines.push(`Native discovery lookup (${label}): FAILED`);
          lines.push(...errorLines(err));
        }
      }
    } else {
      lines.push("Native discovery lookup: unavailable");
    }

    if (!HTTP?.get) {
      lines.push("Discord HTTP module: unavailable");
    } else {
      const attempts = [
        ["Guild preview", `/guilds/${TARGET}/preview`],
        ["Discovery guild_ids=ID", `/discoverable-guilds?guild_ids=${TARGET}`],
        ["Discovery guild_ids[]=ID", `/discoverable-guilds?guild_ids%5B%5D=${TARGET}`],
        ["Discovery guild_ids JSON array", `/discoverable-guilds?guild_ids=${encodeURIComponent(JSON.stringify([TARGET]))}`]
      ];

      for (const [label, url] of attempts) {
        if (resolved) break;
        try {
          const response = await HTTP.get(url);
          const found = guildFromResponse(response);
          if (found) {
            resolved = found;
            lines.push(`${label}: SUCCESS`);
          } else {
            const body = response?.body ?? response ?? {};
            const count = Array.isArray(body?.guilds) ? body.guilds.length : 0;
            lines.push(`${label}: request succeeded, target not returned (${count} guilds)`);
          }
        } catch (err) {
          lines.push(`${label}: FAILED`);
          lines.push(...errorLines(err));
        }
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
      lines.push("All corrected string-URL lookups completed without resolving the guild.");
    }

    storage.lastResult = lines.join("\n");
    console.log("GuildLurk Debug corrected ID resolution:\n" + storage.lastResult);
    toast(resolved ? `Resolved: ${resolved?.name ?? TARGET}` : "Guild ID still unresolved");
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
        `Target: ${TARGET}\n\nCorrected for ShiggyCord's HTTP wrapper. The earlier object-form requests never reached Discord.`
      ),
      React.createElement(Button, {
        label: "Run Corrected ID Test",
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