(() => {
  "use strict";

  const V = vendetta;
  if (!V?.metro?.common) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const VERSION = "1.8.0-shiggy";

  // Nothing account-related runs at plugin startup. All Discord/native state is
  // resolved only after the user opens this settings page.
  const runtime = {
    multiAccountStore: null,
    userStore: null,
    actions: null,
    lastRepair: "not run",
  };

  const C = {
    bg: "#111214",
    card: "#1e1f22",
    card2: "#2b2d31",
    text: "#f2f3f5",
    muted: "#b5bac1",
    brand: "#5865f2",
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

  // Discord's StartupData.native.tsx writes this exact native value whenever
  // AuthenticationStore changes. We access the native module directly so this
  // repair does not require another Metro scan/finder.
  function nativeAppDatabase() {
    try {
      const direct = globalThis.nativeModuleProxy?.NativeAppDatabaseModule;
      if (direct) return direct;
    } catch {}

    try {
      if (typeof globalThis.__turboModuleProxy === "function") {
        return globalThis.__turboModuleProxy("NativeAppDatabaseModule") ?? null;
      }
    } catch {}

    return null;
  }

  function startupUserId() {
    try {
      const value = nativeAppDatabase()?.getConstants?.()?.userId;
      return value == null ? "" : String(value);
    } catch {
      return "";
    }
  }

  async function writeStartupUserId(id) {
    const mod = nativeAppDatabase();
    if (typeof mod?.setUserId !== "function") return false;
    await Promise.resolve(mod.setUserId(String(id)));
    return true;
  }

  async function repairStartupIdentityWhenReady(target) {
    const wanted = String(target);
    const deadline = Date.now() + 18000;

    // Never write the target ID until Discord itself reports that account as
    // current. This avoids leaving native startup data pointing at a failed switch.
    while (Date.now() < deadline) {
      if (currentId() === wanted) {
        try {
          if (!await writeStartupUserId(wanted)) {
            runtime.lastRepair = "native database module unavailable";
            return false;
          }

          // Repeat after Discord's own account-switch/database callbacks settle.
          // This guards against a late stale write without touching cache/data.
          await sleep(1000);
          if (currentId() === wanted) await writeStartupUserId(wanted);
          await sleep(2500);
          if (currentId() === wanted) await writeStartupUserId(wanted);

          runtime.lastRepair = `synced:${wanted}`;
          return true;
        } catch (error) {
          runtime.lastRepair = `repair error:${error?.message ?? error}`;
          return false;
        }
      }
      await sleep(250);
    }

    runtime.lastRepair = "new account never became current";
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
    if (typeof fn !== "function") throw new Error("Discord's multi-account switch action was not found");

    // Keep the same non-synchronous path from v1.7 so this test changes only
    // one variable: repairing Discord's persisted startup database identity.
    const repair = repairStartupIdentityWhenReady(target);
    await Promise.resolve(fn(target, false));
    return await repair;
  }

  function Settings() {
    const [, refresh] = React.useReducer(value => value + 1, 0);
    const [switching, setSwitching] = React.useState("");

    const accounts = accountList();
    const active = currentId();
    const startup = startupUserId();
    const canSwitch = typeof runtime.actions?.switchAccount === "function";
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
        }, "Startup-repair test. After Discord confirms the new account is active, this build re-syncs the same native startup database user ID that Discord's own DatabaseManager is supposed to persist."),
        React.createElement(RN.Text, {
          key: "diag",
          style: {
            color: !startup || startup === active ? C.green : C.red,
            marginTop: 8,
            fontSize: 12,
            lineHeight: 17,
          },
        }, `Current: ${active || "unknown"}\nStartup DB: ${startup || "unknown"}\nRepair: ${runtime.lastRepair}`),
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
              const repaired = await switchAccount(account.id);
              if (!repaired) toast(`Switched, but startup repair was not confirmed: ${runtime.lastRepair}`);
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
