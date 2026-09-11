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

  async function testDiscoveryLookup(Discovery) {
    if (!Discovery?.getDiscoverableGuild) {
      return {
        ok: false,
        lines: [
          "NATIVE DISCOVERY LOOKUP",
          "Result: unavailable",
          "Message: getDiscoverableGuild not found"
        ]
      };
    }

    const attempts = [
      ["string ID", TARGET],
      ["ID array", [TARGET]]
    ];

    const failures = [];

    for (const [label, value] of attempts) {
      try {
        const result = await Discovery.getDiscoverableGuild(value);
        if (result) {
          const featuresRaw = result?.features;
          const features = Array.isArray(featuresRaw)
            ? featuresRaw
            : featuresRaw instanceof Set
              ? Array.from(featuresRaw)
              : [];
          return {
            ok: true,
            result,
            lines: [
              "NATIVE DISCOVERY LOOKUP",
              `Result: SUCCESS (${label})`,
              `Guild ID: ${result?.id ?? "unknown"}`,
              `Guild name: ${result?.name ?? "unknown"}`,
              `Features (${features.length}): ${features.length ? features.join(", ") : "(none returned)"}`,
              `DISCOVERABLE: ${features.includes("DISCOVERABLE") ? "YES" : "NO"}`,
              `PREVIEW_ENABLED: ${features.includes("PREVIEW_ENABLED") ? "YES" : "NO"}`
            ]
          };
        }
        failures.push(`${label}: returned null/undefined`);
      } catch (err) {
        const msg =
          err?.body?.message ??
          err?.response?.body?.message ??
          err?.message ??
          String(err);
        failures.push(`${label}: ${msg}`);
      }
    }

    return {
      ok: false,
      lines: [
        "NATIVE DISCOVERY LOOKUP",
        "Result: FAILED",
        ...failures
      ]
    };
  }

  async function testNativeLurk(Discovery) {
    if (!Discovery?.startLurking) {
      return {
        ok: false,
        lines: [
          "NATIVE startLurking TEST",
          "Result: unavailable",
          "Message: startLurking not found"
        ]
      };
    }

    try {
      const result = await Discovery.startLurking(
        TARGET,
        {},
        { shouldNavigate: false }
      );

      return {
        ok: true,
        result,
        lines: [
          "NATIVE startLurking TEST",
          "Result: SUCCESS",
          "Discord's own current lurk flow accepted the guild."
        ]
      };
    } catch (err) {
      return {
        ok: false,
        error: err,
        lines: errorLines("NATIVE startLurking TEST\nResult: FAILED", err)
      };
    }
  }

  async function testOriginalGuildLurkCall() {
    const GuildActions = findByProps("joinGuild");
    if (!GuildActions?.joinGuild) {
      return {
        ok: false,
        lines: [
          "ORIGINAL GuildLurk CALL",
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
          "ORIGINAL GuildLurk CALL",
          "Result: SUCCESS",
          "joinGuild(id, { lurker: true }) succeeded."
        ]
      };
    } catch (err) {
      return {
        ok: false,
        error: err,
        lines: errorLines("ORIGINAL GuildLurk CALL\nResult: FAILED", err)
      };
    }
  }

  async function runDiagnostic() {
    storage.lastResult = `Guild: ${TARGET}\nRunning native Discord lurk diagnostics...`;

    const Discovery =
      findByProps("startLurking", "getDiscoverableGuild") ??
      findByProps("startLurking");

    const discovery = await testDiscoveryLookup(Discovery);
    const nativeLurk = await testNativeLurk(Discovery);
    const original = await testOriginalGuildLurkCall();

    const interpretation = ["INTERPRETATION"];

    if (nativeLurk.ok && !original.ok) {
      interpretation.push(
        "Discord native startLurking works while GuildLurk's direct joinGuild call fails."
      );
      interpretation.push(
        "Conclusion: the third-party GuildLurk implementation is outdated/incomplete for this guild."
      );
    } else if (!nativeLurk.ok && !original.ok) {
      interpretation.push(
        "Both Discord native startLurking and GuildLurk's direct call failed."
      );
      interpretation.push(
        "Conclusion: this is not just GuildLurk's shortcut; Discord is rejecting lurk for this guild/account."
      );
    } else if (nativeLurk.ok && original.ok) {
      interpretation.push("Both lurk paths succeeded.");
    } else if (!nativeLurk.ok && original.ok) {
      interpretation.push(
        "The direct joinGuild shortcut succeeded while native startLurking failed; this is unusual and may indicate a changed internal module."
      );
    }

    if (discovery.ok) {
      interpretation.push("Discord's native discovery lookup can resolve the guild.");
    } else {
      interpretation.push(
        "Discord's native discovery lookup could not resolve the guild with either tested argument shape."
      );
    }

    const result = [
      `Guild: ${TARGET}`,
      "",
      `Discovery module found: ${Discovery?.startLurking ? "YES" : "NO"}`,
      "",
      ...discovery.lines,
      "",
      ...nativeLurk.lines,
      "",
      ...original.lines,
      "",
      ...interpretation
    ].join("\n");

    storage.lastResult = result;
    storage.lastError = result;
    console.log("GuildLurk Debug result:\n" + result);

    if (nativeLurk.ok && !original.ok) {
      toast("Native lurk works: GuildLurk itself is the problem.", "Check");
    } else if (!nativeLurk.ok && !original.ok) {
      toast("Both lurk paths failed. Open GuildLurk Debug settings.");
    } else {
      toast("Native lurk diagnostic complete.", "Check");
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
        `Compares Discord's native startLurking flow against GuildLurk's direct joinGuild call for ${TARGET}.`
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
          "Run Native Lurk Test"
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
    onLoad() {},
    onUnload() {},
    settings: Settings
  };
})()