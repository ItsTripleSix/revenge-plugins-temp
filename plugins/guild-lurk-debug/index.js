(() => {
  "use strict";

  const TARGET = "544293509494996998";
  const { findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { storage } = vendetta.plugin;
  const Toasts = vendetta.ui?.toasts ?? findByProps("showToast");
  const Assets = vendetta.ui?.assets;

  storage.lastResult ??= "No search-context test run yet.";

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

  async function runTest() {
    storage.lastResult = `Guild: ${TARGET}\nRunning global-discovery context test...`;

    const Discovery =
      findByProps("startLurking", "getDiscoverableGuild") ??
      findByProps("startLurking");

    const DiscoveryUtils =
      findByProps("navigateToGuild", "makeAnalyticsID") ??
      findByProps("makeAnalyticsID");

    const SearchStore =
      findByProps("getGuild", "getGuildIds", "getIsFetching", "getTotal") ??
      findByProps("getGuild", "getGuildIds");

    const lines = [
      `Guild: ${TARGET}`,
      "",
      `Discovery module: ${Discovery?.startLurking ? "FOUND" : "NOT FOUND"}`,
      `Global discovery utils: ${DiscoveryUtils?.makeAnalyticsID ? "FOUND" : "NOT FOUND"}`,
      `Search results store: ${SearchStore?.getGuild ? "FOUND" : "NOT FOUND"}`,
      ""
    ];

    let cachedGuild = null;
    try {
      cachedGuild = SearchStore?.getGuild?.(TARGET) ?? null;
    } catch {}

    lines.push("SEARCH STORE CHECK");
    if (cachedGuild) {
      const features = featureList(cachedGuild);
      lines.push("Target is PRESENT in Discord's current global discovery/search result cache.");
      lines.push(`Name: ${cachedGuild?.name ?? "unknown"}`);
      lines.push(`Features (${features.length}): ${features.length ? features.join(", ") : "(none returned)"}`);
      lines.push(`DISCOVERABLE: ${features.includes("DISCOVERABLE") ? "YES" : "NO"}`);
      lines.push(`PREVIEW_ENABLED: ${features.includes("PREVIEW_ENABLED") ? "YES" : "NO"}`);
    } else {
      lines.push("Target is NOT currently present in Discord's global discovery/search result cache.");
      lines.push("Search for the server in Discord's normal server discovery first, then return here and run this test again.");
    }

    lines.push("");
    lines.push("SEARCH-CONTEXT LURK TEST");

    if (!Discovery?.startLurking) {
      lines.push("Result: unavailable — startLurking module not found.");
    } else {
      let loadId;
      try {
        loadId = DiscoveryUtils?.makeAnalyticsID?.();
      } catch {}
      loadId ||= `${Date.now()}${Math.random().toString(16).slice(2)}`;

      lines.push(`Generated loadId: ${loadId}`);
      lines.push("Note: Discord generates loadId client-side; it is analytics/search context, not an access token.");

      const analyticsLocation = { page: "GLOBAL_DISCOVERY" };
      const options = { loadId, shouldNavigate: false };

      try {
        if (DiscoveryUtils?.navigateToGuild) {
          await DiscoveryUtils.navigateToGuild({
            loadId,
            guildId: TARGET,
            index: 0,
            categoryId: null,
            analyticsLocation,
            options: { shouldNavigate: false }
          });
          lines.push("Result: SUCCESS via Discord navigateToGuild search flow.");
        } else {
          await Discovery.startLurking(TARGET, analyticsLocation, options);
          lines.push("Result: SUCCESS via startLurking with full search context.");
        }
      } catch (err) {
        lines.push("Result: FAILED");
        lines.push(...errorLines(err));
      }
    }

    lines.push("");
    lines.push("INTERPRETATION");
    if (cachedGuild) {
      lines.push("Discord itself currently has this guild in its global discovery/search cache.");
      lines.push("If the search-context lurk test still returns 10004 Unknown Guild, then being searchable does not make this guild lurkable for this account; Discord's membership/lurk backend is refusing it.");
    } else {
      lines.push("Run this again immediately after locating the server in Discord's own discovery search so we can prove whether the live search result cache contains it.");
    }

    storage.lastResult = lines.join("\n");
    console.log("GuildLurk Debug search-context result:\n" + storage.lastResult);
    toast("Search-context lurk test complete.", "Check");
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
      React.createElement(RN.Text, { style: { color: "#F2F3F5", fontSize: 20, fontWeight: "700", marginBottom: 8 } }, "GuildLurk Search-Context Test"),
      React.createElement(RN.Text, { style: { color: "#B5BAC1", lineHeight: 19, marginBottom: 12 } }, `Target: ${TARGET}\n\nFirst search for this server in Discord's normal server discovery/search. Once you can see it in the results, return here and run the test immediately.`),
      React.createElement(Button, {
        label: "Run Search-Context Test",
        onPress: async () => {
          await runTest();
          refresh();
        }
      }),
      React.createElement(RN.Text, { style: { color: "#F2F3F5", fontSize: 16, fontWeight: "700", marginBottom: 6 } }, "Last Result"),
      React.createElement(RN.Text, {
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
      }, String(storage.lastResult))
    );
  }

  return {
    onLoad() {},
    onUnload() {},
    settings: Settings
  };
})()