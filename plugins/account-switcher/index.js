(() => {
  "use strict";

  const V = vendetta;
  if (!V?.metro?.common) return {};

  const B = globalThis.bunny ?? globalThis.window?.bunny;
  const { React, ReactNative: RN } = V.metro.common;
  const VERSION = "2.0.0-shiggy";
  const METRO_CACHE_PATH = "caches/metro_modules.json";

  // Deliberately inert at startup. Everything below runs only while the user is
  // inside this settings page or after they explicitly request an account switch.
  const runtime = {
    multiAccountStore: null,
    userStore: null,
    actions: null,
    cacheStatus: "not run",
  };

  const C = {
    bg: "#111214",
    card: "#1e1f22",
    card2: "#2b2d31",
    text: "#f2f3f5",
    muted: "#b5bac1",
    green: "#23a55a",
    red: "#f23f43",
  };

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function toast(text) {
    try { V.ui?.toasts?.showToast?.(String(text)); } catch {}
  }

  function find(...props) {
    try { return V.metro?.findByProps?.(...props); } catch { return undefined; }
  }

  function findStore(name) {
    try { return V.metro?.findByStoreName?.(name); } catch { return undefined; }
  }

  function resolveRuntime() {
    runtime.multiAccountStore ??= (
      findStore("MultiAccountStore")
      ?? find("getUsers", "getValidUsers", "getHasLoggedInAccounts")
      ?? find("getUsers", "getValidUsers")
    );
    runtime.userStore ??= findStore("UserStore") ?? find("getCurrentUser", "getUser");
    runtime.actions ??= (
      find("switchAccount", "removeAccount", "moveAccount")
      ?? find("switchAccount", "removeAccount")
      ?? find("switchAccount")
    );
    return runtime;
  }

  function currentId() {
    resolveRuntime();
    try { return String(runtime.userStore?.getCurrentUser?.()?.id ?? ""); }
    catch { return ""; }
  }

  function cacheRemover() {
    const fn = B?.api?.native?.fs?.removeFile;
    return typeof fn === "function" ? fn : null;
  }

  async function removeMetroCache() {
    const removeFile = cacheRemover();
    if (!removeFile) {
      runtime.cacheStatus = "Shiggy fs API unavailable";
      return false;
    }

    try {
      await removeFile(METRO_CACHE_PATH);
      runtime.cacheStatus = "deleted";
      return true;
    } catch (error) {
      runtime.cacheStatus = `delete error:${error?.message ?? error}`;
      return false;
    }
  }

  async function clearMetroCacheWhenReady(target) {
    const wanted = String(target);
    const deadline = Date.now() + 18000;

    while (Date.now() < deadline) {
      if (currentId() === wanted) {
        // Give Discord's account transition time to finish causing any normal
        // module lookups. Shiggy's Metro cache writer is debounced by 1 second,
        // so repeated deletes spaced beyond that window prevent a pending write
        // from simply recreating the file immediately after our first delete.
        await sleep(3000);

        let ok = false;
        for (let i = 0; i < 4; i++) {
          ok = await removeMetroCache() || ok;
          if (i < 3) await sleep(1250);
        }

        if (ok) {
          runtime.cacheStatus = "cleared after switch";
          toast("Shiggy Metro cache cleared — force-close now");
        } else {
          toast(`Metro cache cleanup failed: ${runtime.cacheStatus}`);
        }
        return ok;
      }
      await sleep(250);
    }

    runtime.cacheStatus = "new account never became current";
    toast("Account switched, but Metro cache cleanup never saw the new account");
    return false;
  }

  function normalizeAccount(entry) {
    const base = entry?.user ?? entry;
    if (!base?.id) return null;

    let user = base;
    try { user = runtime.userStore?.getUser?.(String(base.id)) ?? base; } catch {}

    return {
      id: String(base.id),
      username: String(user?.username ?? base?.username ?? base.id),
      displayName: String(
        user?.globalName
        ?? user?.global_name
        ?? user?.displayName
        ?? base?.globalName
        ?? base?.global_name
        ?? base?.username
        ?? base.id,
      ),
    };
  }

  function accountList() {
    resolveRuntime();
    const found = [];
    const store = runtime.multiAccountStore;

    for (const getter of ["getValidUsers", "getUsers"]) {
      try {
        const raw = store?.[getter]?.();
        const list = Array.isArray(raw)
          ? raw
          : raw && typeof raw === "object"
            ? Object.values(raw)
            : [];

        for (const entry of list) {
          const account = normalizeAccount(entry);
          if (account) found.push(account);
        }
      } catch {}
    }

    try {
      const current = normalizeAccount(runtime.userStore?.getCurrentUser?.());
      if (current) found.push(current);
    } catch {}

    const active = currentId();
    return [...new Map(found.map(account => [account.id, account])).values()]
      .sort((a, b) => {
        if (a.id === active) return -1;
        if (b.id === active) return 1;
        return a.displayName.localeCompare(b.displayName);
      });
  }

  async function switchAccount(id) {
    resolveRuntime();
    const target = String(id ?? "");
    if (!target || target === currentId()) return true;

    const fn = runtime.actions?.switchAccount;
    if (typeof fn !== "function") {
      throw new Error("Discord's multi-account switch action was not found");
    }

    runtime.cacheStatus = "waiting for new account";
    const cleanup = clearMetroCacheWhenReady(target);

    // Keep the same plain non-synchronous Discord switch from the earlier
    // isolation build. v2.0 changes one thing: Shiggy's persisted Metro cache.
    await Promise.resolve(fn(target, false));
    return await cleanup;
  }

  function Settings() {
    const [, refresh] = React.useReducer(value => value + 1, 0);
    const [switching, setSwitching] = React.useState("");

    const accounts = accountList();
    const active = currentId();
    const canSwitch = typeof runtime.actions?.switchAccount === "function";
    const hasCacheApi = !!cacheRemover();
    const Pressable = RN.Pressable ?? RN.TouchableOpacity;

    const children = [
      React.createElement(RN.View, {
        key: "intro",
        style: { backgroundColor: C.card, padding: 14, borderRadius: 12 },
      }, [
        React.createElement(RN.Text, {
          key: "title",
          style: { color: C.text, fontSize: 18, fontWeight: "700" },
        }, "Account Switcher"),
        React.createElement(RN.Text, {
          key: "desc",
          style: { color: C.muted, marginTop: 6, fontSize: 12, lineHeight: 17 },
        }, "Metro-cache isolation build. After the new account becomes active, this removes ShiggyCord's persisted Metro finder cache before the next cold launch."),
        React.createElement(RN.Text, {
          key: "diag",
          style: {
            color: hasCacheApi ? C.green : C.red,
            marginTop: 8,
            fontSize: 12,
            lineHeight: 17,
          },
        }, `Current: ${active || "unknown"}\nMetro cache API: ${hasCacheApi ? "available" : "unavailable"}\nCleanup: ${runtime.cacheStatus}`),
      ]),
      React.createElement(RN.Text, {
        key: "accounts-title",
        style: { color: C.text, fontSize: 16, fontWeight: "700" },
      }, "Accounts"),
    ];

    if (!accounts.length) {
      children.push(React.createElement(RN.View, {
        key: "empty",
        style: { backgroundColor: C.card2, padding: 13, borderRadius: 10 },
      }, React.createElement(RN.Text, {
        style: { color: C.muted, fontSize: 13, lineHeight: 18 },
      }, "No saved Discord accounts were found.")));
    } else {
      for (const account of accounts) {
        const isCurrent = account.id === active;
        const busy = switching === account.id;

        children.push(React.createElement(Pressable, {
          key: account.id,
          disabled: isCurrent || !!switching || !canSwitch,
          onPress: async () => {
            setSwitching(account.id);
            try {
              await switchAccount(account.id);
            } catch (error) {
              toast(`Account switch failed: ${error?.message ?? error}`);
              setSwitching("");
              refresh();
            }
          },
          style: {
            backgroundColor: C.card,
            padding: 13,
            borderRadius: 10,
            opacity: isCurrent ? 0.7 : 1,
          },
        }, [
          React.createElement(RN.Text, {
            key: "name",
            style: { color: C.text, fontSize: 15, fontWeight: "700" },
          }, account.displayName),
          React.createElement(RN.Text, {
            key: "user",
            style: { color: isCurrent ? C.green : C.muted, fontSize: 13, marginTop: 2 },
          }, `@${account.username}${isCurrent ? " • Current" : busy ? " • Switching…" : " • Tap to switch"}`),
        ]));
      }
    }

    children.push(React.createElement(Pressable, {
      key: "manual-cache",
      disabled: !hasCacheApi,
      onPress: async () => {
        const ok = await removeMetroCache();
        toast(ok ? "Shiggy Metro cache cleared" : `Metro cache cleanup failed: ${runtime.cacheStatus}`);
        refresh();
      },
      style: {
        backgroundColor: C.card2,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 9,
        alignItems: "center",
        opacity: hasCacheApi ? 1 : 0.5,
      },
    }, React.createElement(RN.Text, {
      style: { color: C.text, fontWeight: "700", fontSize: 14 },
    }, "Clear Shiggy Metro Cache Now")));

    children.push(React.createElement(Pressable, {
      key: "refresh",
      onPress: () => {
        runtime.multiAccountStore = null;
        runtime.userStore = null;
        runtime.actions = null;
        refresh();
      },
      style: {
        backgroundColor: C.card2,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 9,
        alignItems: "center",
      },
    }, React.createElement(RN.Text, {
      style: { color: C.text, fontWeight: "700", fontSize: 14 },
    }, "Refresh Accounts")));

    children.push(React.createElement(RN.Text, {
      key: "version",
      style: { color: C.muted, fontSize: 12, lineHeight: 17 },
    }, `v${VERSION} • switch:${canSwitch ? "yes" : "no"} • startup hooks:none`));

    return React.createElement(
      RN.ScrollView ?? RN.View,
      {
        style: { flex: 1, backgroundColor: C.bg },
        contentContainerStyle: { padding: 16, paddingBottom: 40, gap: 12 },
      },
      children,
    );
  }

  return {
    onLoad() {},
    onUnload() {},
    settings: Settings,
  };
})()
