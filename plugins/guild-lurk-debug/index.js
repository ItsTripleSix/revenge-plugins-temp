(() => {
  "use strict";

  const TARGET = "544293509494996998";
  const { findByProps } = vendetta.metro;
  const { React, ReactNative: RN } = vendetta.metro.common;
  const { storage } = vendetta.plugin;
  const Toasts = vendetta.ui?.toasts ?? findByProps("showToast");
  const Assets = vendetta.ui?.assets;

  storage.lastError ??= "No test run yet.";

  function toast(text, iconName = "Small") {
    try {
      const icon = Assets?.getAssetIDByName?.(iconName);
      Toasts?.showToast?.(text, icon);
    } catch {}
  }

  function stringifyError(err) {
    const lines = [`Guild: ${TARGET}`];
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

      const seen = new WeakSet();
      let raw;
      try {
        raw = JSON.stringify(err, (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (seen.has(value)) return "[Circular]";
            seen.add(value);
          }
          if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`;
          return value;
        }, 2);
      } catch {
        raw = String(err);
      }
      if (raw && raw !== "{}") {
        lines.push("Raw:");
        lines.push(raw);
      }
    } catch (formatError) {
      lines.push(`Formatting error: ${String(formatError)}`);
      lines.push(`Original: ${String(err)}`);
    }

    return lines.join("\n");
  }

  async function testLurk() {
    const GuildActions = findByProps("joinGuild");
    if (!GuildActions?.joinGuild) {
      storage.lastError = `Guild: ${TARGET}\nMessage: joinGuild module not found`;
      toast("GuildLurk Debug: joinGuild not found");
      return false;
    }

    storage.lastError = `Testing ${TARGET}...`;

    try {
      await GuildActions.joinGuild(TARGET, { lurker: true });
      storage.lastError = `Guild: ${TARGET}\nSUCCESS: Discord accepted the lurk request.`;
      toast("GuildLurk Debug: lurk succeeded", "Check");
      return true;
    } catch (err) {
      const details = stringifyError(err);
      storage.lastError = details;
      console.error("GuildLurk Debug failure:", details, err);

      const short =
        err?.body?.message ??
        err?.response?.body?.message ??
        err?.message ??
        String(err);

      toast(`Lurk failed: ${String(short).slice(0, 110)}`);
      return false;
    }
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
        `Testing guild ${TARGET}. Tap Retry, then copy the complete result below.`
      ),
      React.createElement(
        RN.Pressable,
        {
          onPress: async () => {
            await testLurk();
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
          "Retry Lurk Test"
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
        String(storage.lastError)
      )
    );
  }

  return {
    onLoad() {
      setTimeout(testLurk, 800);
    },
    onUnload() {},
    settings: Settings
  };
})()