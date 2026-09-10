(() => {
  "use strict";

  const V = vendetta;
  if (!V?.metro || !V?.patcher) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const storage = V.plugin?.storage ?? {};
  const CORE_URL = "https://raw.githubusercontent.com/ItsTripleSix/revenge-plugins/main/plugins/purge-tools/index.js";

  let core = null;
  let coreError = null;
  let loadPromise = null;
  let started = false;
  const listeners = new Set();

  function toast(text) {
    try { V.ui?.toasts?.showToast?.(String(text)); } catch {}
  }

  function notify() {
    for (const fn of listeners) try { fn(); } catch {}
  }

  async function fetchCoreSource() {
    try {
      const response = await V.utils.safeFetch(CORE_URL, { cache: "no-store" });
      if (!response?.ok) throw new Error(`HTTP ${response?.status ?? "?"}`);
      const source = await response.text();
      if (!source?.includes("Purge Tools")) throw new Error("Invalid Purge Tools source");
      storage.shiggyPurgeSource = source;
      return source;
    } catch (error) {
      const cached = storage.shiggyPurgeSource;
      if (typeof cached === "string" && cached.length > 1000) return cached;
      throw error;
    }
  }

  function portSource(source) {
    let out = String(source);

    // The Shiggy build must use this plugin's per-plugin Vendetta context so
    // persistent storage, manifest data and logging belong to Purge Tools.
    out = out.replace(
      "const V = globalThis.vendetta;",
      "const V = vendetta;",
    );

    out = out.replace(
      'const PLUGIN_VERSION = "1.1.1";',
      'const PLUGIN_VERSION = "1.1.3-shiggy";',
    );

    // Purge Tools no longer owns or patches Shiggy's settings list. Settings
    // Pins is the single reusable owner of optional shortcuts.
    const shortcutStart = "  let settingsShortcutCleanup = null;\n\n  function installSettingsShortcut() {";
    const scheduleStart = "  function scheduleAutoResume() {";
    const startIndex = out.indexOf(shortcutStart);
    const scheduleIndex = out.indexOf(scheduleStart);

    if (startIndex < 0 || scheduleIndex < 0 || scheduleIndex <= startIndex) {
      throw new Error("Could not strip Purge Tools settings shortcut");
    }

    out = out.slice(0, startIndex) + out.slice(scheduleIndex);

    out = out.replace(
      "    try { settingsShortcutCleanup?.(); } catch {}\n    settingsShortcutCleanup = null;\n",
      "",
    );

    out = out.replace(
      "    onLoad() { installSettingsShortcut(); scheduleAutoResume(); },",
      "    onLoad() { scheduleAutoResume(); },",
    );

    if (out.includes("installSettingsShortcut") || out.includes("settingsShortcutCleanup")) {
      throw new Error("Purge Tools shortcut code was not fully removed");
    }

    return out;
  }

  async function loadCore() {
    const source = portSource(await fetchCoreSource());
    const factory = (0, eval)(`vendetta=>{return ${source}}\n//# sourceURL=purge-tools-shiggy-core.js`);
    const raw = factory(V);
    const resolved = typeof raw === "function" ? raw() : raw;
    return await Promise.resolve(resolved?.default ?? resolved ?? {});
  }

  function ensureCore() {
    if (core) return Promise.resolve(core);
    if (loadPromise) return loadPromise;

    coreError = null;
    loadPromise = loadCore()
      .then(plugin => {
        core = plugin;
        if (started) {
          try { core?.onLoad?.(); }
          catch (error) { throw new Error(`Core start failed: ${error?.message ?? error}`); }
        }
        notify();
        return core;
      })
      .catch(error => {
        coreError = error;
        core = null;
        loadPromise = null;
        notify();
        toast(`Purge Tools failed to load: ${error?.message ?? error}`);
        throw error;
      });

    loadPromise.catch(() => {});
    return loadPromise;
  }

  function hasInterruptedAutoResume() {
    try {
      return storage.autoResumeInterrupted === true && !!storage.activePurgeJob;
    } catch {
      return false;
    }
  }

  function SettingsBridge() {
    const [, render] = React.useReducer(value => value + 1, 0);

    React.useEffect(() => {
      const listener = () => render();
      listeners.add(listener);
      ensureCore();
      return () => listeners.delete(listener);
    }, []);

    if (typeof core?.settings === "function") {
      return React.createElement(core.settings);
    }

    const Pressable = RN.Pressable ?? RN.TouchableOpacity;
    return React.createElement(
      RN.View,
      { style: { flex: 1, padding: 16, backgroundColor: "#111214" } },
      React.createElement(
        RN.Text,
        { style: { color: "#F2F3F5", fontSize: 16 } },
        coreError
          ? `Could not load Purge Tools: ${coreError?.message ?? coreError}`
          : "Loading Purge Tools…",
      ),
      coreError ? React.createElement(
        Pressable,
        {
          onPress: () => {
            coreError = null;
            loadPromise = null;
            ensureCore();
            render();
          },
          style: {
            marginTop: 14,
            padding: 11,
            borderRadius: 8,
            backgroundColor: "#5865F2",
            alignItems: "center",
          },
        },
        React.createElement(
          RN.Text,
          { style: { color: "#F2F3F5", fontWeight: "700" } },
          "Retry",
        ),
      ) : null,
    );
  }

  return {
    onLoad() {
      started = true;

      // Normal startup does no network fetch, eval, Metro scan, or settings
      // injection. Load only if a real interrupted auto-resume job requires it.
      if (hasInterruptedAutoResume()) ensureCore();
    },
    onUnload() {
      started = false;
      try { core?.onUnload?.(); } catch {}
      listeners.clear();
    },
    settings: SettingsBridge,
  };
})()
