(() => {
  "use strict";

  const TARGET = "544293509494996998";
  const { findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { storage } = vendetta.plugin;
  const Toasts = vendetta.ui?.toasts ?? findByProps("showToast");
  const Assets = vendetta.ui?.assets;

  storage.lastResult ??= "No internal discovery search run yet.";
  storage.searchTerm ??= "";

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

  function featureList(guild) {
    const raw = guild?.features;
    if (Array.isArray(raw)) return raw;
    if (raw instanceof Set) return Array.from(raw);
    return [];
  }

  function makeLoadId(DiscoveryUtils) {
    try {
      const id = DiscoveryUtils?.makeAnalyticsID?.();
      if (id) return id;
    } catch {}
    return `${Date.now()}${Math.random().toString(16).slice(2)}`;
  }

  async function runInternalSearch() {
    const term = String(storage.searchTerm ?? "").trim();
    if (!term) {
      storage.lastResult = "Enter the server name first, then tap Search Discord Discovery.";
      return;
    }

    const HTTP =
      findByProps("get", "post", "put", "patch", "delete") ??
      findByProps("get", "post", "put", "patch", "del");

    const Discovery =
      findByProps("startLurking", "getDiscoverableGuild") ??
      findByProps("startLurking");

    const DiscoveryUtils =
      findByProps("navigateToGuild", "makeAnalyticsID") ??
      findByProps("makeAnalyticsID");

    const lines = [
      `Target guild: ${TARGET}`,
      `Search term: ${term}`,
      "",
      "INTERNAL DISCOVERY SEARCH"
    ];

    if (!HTTP?.get) {
      lines.push("Result: unavailable — Discord HTTP module not found.");
      storage.lastResult = lines.join("\n");
      return;
    }

    try {
      const query = `query=${encodeURIComponent(term)}&offset=0&limit=48`;
      const response = await HTTP.get({
        url: "/discoverable-guilds",
        query,
        oldFormErrors: true,
        rejectWithError: true
      });
      const body = response?.body ?? response ?? {};
      const guilds = Array.isArray(body?.guilds) ? body.guilds : [];

      lines.push("Result: SUCCESS");
      lines.push(`Returned guilds: ${guilds.length}`);
      if (body?.total !== undefined) lines.push(`Total matches: ${body.total}`);

      const target = guilds.find(g => String(g?.id) === TARGET);
      if (target) {
        const features = featureList(target);
        lines.push("TARGET FOUND: YES");
        lines.push(`Name: ${target?.name ?? "unknown"}`);
        lines.push(`Features (${features.length}): ${features.length ? features.join(", ") : "(none returned)"}`);
        lines.push(`DISCOVERABLE: ${features.includes("DISCOVERABLE") ? "YES" : "NO"}`);
        lines.push(`PREVIEW_ENABLED: ${features.includes("PREVIEW_ENABLED") ? "YES" : "NO"}`);

        lines.push("");
        lines.push("SEARCH-RESULT LURK TEST");

        if (!Discovery?.startLurking) {
          lines.push("Result: unavailable — startLurking module not found.");
        } else {
          const loadId = makeLoadId(DiscoveryUtils);
          const analyticsLocation = { page: "GLOBAL_DISCOVERY" };

          try {
            await Discovery.startLurking(
              TARGET,
              analyticsLocation,
              { loadId, shouldNavigate: false }
            );
            lines.push("Result: SUCCESS");
            lines.push("Discord accepted native startLurking after the guild was returned by discovery search.");
          } catch (err) {
            lines.push("Result: FAILED");
            lines.push(...errorLines(err));
          }
        }
      } else {
        lines.push("TARGET FOUND: NO");
        if (guilds.length) {
          lines.push("First returned results:");
          for (const g of guilds.slice(0, 10)) {
            lines.push(`- ${g?.name ?? "unknown"} (${g?.id ?? "no id"})`);
          }
        }
        lines.push("");
        lines.push("Try the exact server name as it appears in Discord desktop Discovery.");
      }
    } catch (err) {
      lines.push("Result: FAILED");
      lines.push(...errorLines(err));
      lines.push("");
      lines.push("The request used Discord's current /discoverable-guilds endpoint.");
    }

    storage.lastResult = lines.join("\n");
    console.log("GuildLurk Debug internal discovery result:\n" + storage.lastResult);
    toast("Internal discovery search complete.", "Check");
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
      React.createElement(
        RN.Text,
        { style: { color: "#FFFFFF", fontWeight: "700" } },
        label
      )
    );
  }

  function Settings() {
    const [, refresh] = React.useReducer(x => x + 1, 0);
    const [term, setTerm] = React.useState(String(storage.searchTerm ?? ""));

    return React.createElement(
      RN.ScrollView,
      { style: { flex: 1 }, contentContainerStyle: { padding: 16 } },
      React.createElement(
        RN.Text,
        { style: { color: "#F2F3F5", fontSize: 20, fontWeight: "700", marginBottom: 8 } },
        "GuildLurk Internal Discovery Test"
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#B5BAC1", lineHeight: 19, marginBottom: 12 } },
        `Target: ${TARGET}\n\nDiscord mobile currently does not expose server-name search. Enter the server's exact name here and this plugin will query Discord's discovery endpoint directly.`
      ),
      React.createElement(RN.TextInput, {
        value: term,
        placeholder: "Exact server name",
        placeholderTextColor: "#6D6F78",
        autoCapitalize: "none",
        autoCorrect: false,
        onChangeText: value => {
          setTerm(value);
          storage.searchTerm = value;
        },
        style: {
          color: "#F2F3F5",
          backgroundColor: "#1E1F22",
          minHeight: 44,
          borderRadius: 8,
          paddingHorizontal: 12,
          marginBottom: 12
        }
      }),
      React.createElement(Button, {
        label: "Search Discord Discovery",
        onPress: async () => {
          storage.searchTerm = term;
          await runInternalSearch();
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