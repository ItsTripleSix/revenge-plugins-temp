(() => {
  "use strict";

  // Use Shiggy's per-plugin Vendetta object, not window.vendetta. This keeps
  // plugin storage/context intact and lets the plugin toggle behave normally.
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

    out = out.replace(
      'const PLUGIN_VERSION = "1.1.1";',
      'const PLUGIN_VERSION = "1.1.2-shiggy";',
    );

    out = out.replace(
      'const shortcutKey = "ITS_TRIPLE_SIX_PURGE_TOOLS";',
      'const shortcutKey = "ITS_TRIPLE_SIX_PURGE_TOOLS_SHIGGY";',
    );

    out = out.replace(
      'toast("Purge Tools shortcut unavailable on this Revenge build");',
      'toast("Purge Tools shortcut unavailable on this ShiggyCord build");',
    );

    const revengeSection = `const section = sections.find(item =>\n          Array.isArray(item?.settings) && item.settings.includes("BUNNY")\n        ) ?? sections.find(item => item?.label === "Revenge" || item?.title === "Revenge");`;
    const shiggySection = `const section = sections.find(item =>\n          Array.isArray(item?.settings)\n          && (item.settings.includes("SHIGGYCORD") || item.settings.includes("BUNNY_PLUGINS"))\n        ) ?? sections.find(item => item?.label === "ShiggyCord" || item?.title === "ShiggyCord");`;

    if (!out.includes(revengeSection)) {
      throw new Error("Could not port Purge Tools settings section");
    }
    out = out.replace(revengeSection, shiggySection);

    const revengeInsert = `const fontsIndex = section.settings.indexOf("BUNNY_FONTS");\n        const pluginsIndex = section.settings.indexOf("BUNNY_PLUGINS");\n        const insertAt = fontsIndex >= 0\n          ? fontsIndex + 1\n          : pluginsIndex >= 0\n            ? pluginsIndex + 1\n            : section.settings.length;`;
    const shiggyInsert = `const pluginsIndex = section.settings.indexOf("BUNNY_PLUGINS");\n        const shiggyIndex = section.settings.indexOf("SHIGGYCORD");\n        const insertAt = pluginsIndex >= 0\n          ? pluginsIndex + 1\n          : shiggyIndex >= 0\n            ? shiggyIndex + 1\n            : section.settings.length;`;

    if (!out.includes(revengeInsert)) {
      throw new Error("Could not port Purge Tools shortcut position");
    }
    out = out.replace(revengeInsert, shiggyInsert);

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
      ensureCore();
    },
    onUnload() {
      started = false;
      try { core?.onUnload?.(); } catch {}
      listeners.clear();
    },
    settings: SettingsBridge,
  };
})()
