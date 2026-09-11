(() => {
  "use strict";

  const TARGET = "544293509494996998";
  const { findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { storage } = vendetta.plugin;
  const Toasts = vendetta.ui?.toasts ?? findByProps("showToast");
  const Assets = vendetta.ui?.assets;

  storage.lastResult ??= storage.lastError ?? "No test run yet.";

  function toast(text, iconName = "Small") {
    try {
      const icon = Assets?.getAssetIDByName?.(iconName);
      Toasts?.showToast?.(text, icon);
    } catch {}
  }

  function errorLines(prefix, err) {
    const lines = [prefix];
    const add = (label, value) => {
      if (value !== undefined && value !== null && value !== "")
        lines.push(`${label}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
    };

    try {
      add("Name", err?.name);
      add("Message", err?.message);
      add("Code", err?.code);
      add("Status", err?.status);
      add("Body code", err?.body?.code);
      add("Body message", err?.body?.message);
      add("Response status", err?.response?.status);
      add("Response code", err?.response?.body?.code);
      add("Response message", err?.response?.body?.message);
    } catch {}

    return lines;
  }

  async function testPreview() {
    const HTTP =
      findByProps("get", "post", "put", "patch", "delete") ??
      findByProps("get", "post", "put", "patch", "del");

    if (!HTTP?.get) {
      return {
        ok: false,
        lines: [
          "PREVIEW TEST",
          "Result: unavailable",
          "Message: Discord HTTP module not found"
        ]
      };
    }

    try {
      const response = await HTTP.get(`/guilds/${TARGET}/preview`);
      const body = response?.body ?? response ?? {};
      const features = Array.isArray(body?.features) ? body.features : [];

      return {
        ok: true,
        body,
        lines: [
          "PREVIEW TEST",
          "Result: SUCCESS",
          `HTTP status: ${response?.status ?? "unknown"}`,
          `Guild ID: ${body?.id ?? "unknown"}`,
          `Guild name: ${body?.name ?? "unknown"}`,
          `Approx members: ${body?.approximate_member_count ?? "unknown"}`,
          `Approx online: ${body?.approximate_presence_count ?? "unknown"}`,
          `Features (${features.length}): ${features.length ? features.join(", ") : "(none returned)"}`,
          `DISCOVERABLE: ${features.includes("DISCOVERABLE") ? "YES" : "NO"}`,
          `PREVIEW_ENABLED: ${features.includes("PREVIEW_ENABLED") ? "YES" : "NO"}`
        ]
      };
    } catch (err) {
      return {
        ok: false,
        error: err,
        lines: errorLines("PREVIEW TEST\nResult: FAILED", err)
      };
    }
  }

  async function testLurk() {
    const GuildActions = findByProps("joinGuild");
    if (!GuildActions?.joinGuild) {
      return {
        ok: false,
        lines: [
          "LURK TEST",
          "Result: unavailable",
          "Message: joinGuild module not found"
        ]
      };
    }

    try {
      await GuildActions.joinGuild(TARGET, { lurker: true });
      return {
        ok: true,
        lines: [
          "LURK TEST",
          "Result: SUCCESS",
          "Discord accepted the lurk request."
        ]
      };
    } catch (err) {
      return {
        ok: false,
        error: err,
        lines: errorLines("LURK TEST\nResult: FAILED", err)
      };
    }
  }

  async function runDiagnostic() {
    storage.lastResult = `Guild: ${TARGET}\nRunning preview test...`;

    const preview = await testPreview();
    const lurk = await testLurk();

    const interpretation = [];
    if (preview.ok && !lurk.ok) {
      interpretation.push("INTERPRETATION");
      interpretation.push("Preview endpoint works, but lurk membership request fails.");
      if (preview.body?.features) {
        const features = preview.body.features;
        if (features.includes("DISCOVERABLE") && !features.includes("PREVIEW_ENABLED")) {
          interpretation.push("Guild is DISCOVERABLE but PREVIEW_ENABLED is absent.");
        } else if (features.includes("PREVIEW_ENABLED")) {
          interpretation.push("PREVIEW_ENABLED is present, so the lurk failure is caused by something more specific than the preview flag.");
        }
      }
    } else if (!preview.ok && !lurk.ok) {
      interpretation.push("INTERPRETATION");
      interpretation.push("Both preview and lurk requests failed for this guild/account.");
    } else if (preview.ok && lurk.ok) {
      interpretation.push("INTERPRETATION");
      interpretation.push("Both preview and lurk requests succeeded.");
    }

    const result = [
      `Guild: ${TARGET}`,
      "",
      ...preview.lines,
      "",
      ...lurk.lines,
      "",
      ...interpretation
    ].join("\n");

    storage.lastResult = result;
    storage.lastError = result;
    console.log("GuildLurk Debug result:\n" + result);

    if (preview.ok && !lurk.ok) {
      toast("Preview works; lurk still fails. Open GuildLurk Debug settings.");
    } else if (!preview.ok) {
      toast("Preview test failed. Open GuildLurk Debug settings.");
    } else {
      toast("GuildLurk diagnostic complete.", "Check");
    }

    return result;
  }

  function Settings() {
    const [, refresh] = React.useReducer(x => x + 1, 0);

    return React.createElement(
      RN.ScrollView,
      { style: { flex: 1 }, contentContainerStyle: { padding: 16, gap: 12 } },
      React.createElement(
        RN.Text,
        { style: { color: "#F2F3F5", fontSize: 20, fontWeight: "700" } },
        "GuildLurk Debug"
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#B5BAC1" } },
        `Tests Discord's guild preview endpoint and lurk request for ${TARGET}.`
      ),
      React.createElement(
        RN.Pressable,
        {
          onPress: async () => {
            await runDiagnostic();
            refresh();
          },
          style: {
            minHeight: 44,
            paddingHorizontal: 14,
            borderRadius: 8,
            backgroundColor: "#4E5058",
            alignItems: "center",
            justifyContent: "center"
          }
        },
        React.createElement(
          RN.Text,
          { style: { color: "#FFFFFF", fontWeight: "700" } },
          "Run Preview + Lurk Test"
        )
      ),
      React.createElement(
        RN.Text,
        { style: { color: "#F2F3F5", fontSize: 16, fontWeight: "700", marginTop: 6 } },
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
    onLoad() {
      setTimeout(runDiagnostic, 800);
    },
    onUnload() {},
    settings: Settings
  };
})()