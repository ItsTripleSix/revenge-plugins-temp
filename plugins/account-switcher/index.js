(() => {
  "use strict";

  const V = globalThis.vendetta;
  if (!V?.metro || !V?.patcher) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const { findByProps, findByName, findByStoreName } = V.metro;

  const VERSION = "1.1.0-shiggy";
  const RUNTIME_KEY = "__itsTripleSixAccountSwitcherRuntime";

  try { globalThis[RUNTIME_KEY]?.cleanup?.(); } catch {}

  const runtime = {
    capabilityModule: null,
    multiAccountStore: null,
    userStore: null,
    multiAccountActions: null,
    openManageAccountsModal: null,
    capabilityUnpatch: null,
    nativeEnabled: false,
    retryTimer: null,
    cleanup: null,
  };
  globalThis[RUNTIME_KEY] = runtime;

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

  function find(...props) {
    try { return findByProps?.(...props); } catch { return undefined; }
  }

  function findName(name) {
    try { return findByName?.(name); } catch { return undefined; }
  }

  function findStore(name) {
    try { return findByStoreName?.(name); } catch { return undefined; }
  }

  function toast(text) {
    try { V.ui?.toasts?.showToast?.(String(text)); } catch {}
  }

  function resolveNative() {
    const capability = find("getCanUseMultiAccountMobile");
    const store = findStore("MultiAccountStore")
      ?? find("getUsers", "getValidUsers", "getHasLoggedInAccounts")
      ?? capability;
    const users = findStore("UserStore") ?? find("getCurrentUser");
    const actions = find("switchAccount", "removeAccount", "moveAccount")
      ?? find("switchAccount", "removeAccount");
    const manager = findName("openManageAccountsModal");

    if (capability?.getCanUseMultiAccountMobile) runtime.capabilityModule = capability;
    if (store) runtime.multiAccountStore = store;
    if (users?.getCurrentUser) runtime.userStore = users;
    if (actions?.switchAccount) runtime.multiAccountActions = actions;
    if (typeof manager === "function") runtime.openManageAccountsModal = manager;
  }

  function enableNativeSwitcher() {
    resolveNative();
    if (!runtime.capabilityModule?.getCanUseMultiAccountMobile || !runtime.multiAccountStore) return false;

    if (!runtime.capabilityUnpatch) {
      try {
        runtime.capabilityUnpatch = V.patcher.after(
          "getCanUseMultiAccountMobile",
          runtime.capabilityModule,
          () => true,
        );
      } catch {}
    }

    runtime.nativeEnabled = !!runtime.capabilityUnpatch;
    return runtime.nativeEnabled;
  }

  function normalizeAccount(entry) {
    const user = entry?.user ?? entry;
    if (!user?.id) return null;
    return {
      id: String(user.id),
      username: String(user.username ?? user.id),
      displayName: String(
        user.globalName
        ?? user.global_name
        ?? user.displayName
        ?? user.username
        ?? user.id,
      ),
    };
  }

  function currentId() {
    try { return String(runtime.userStore?.getCurrentUser?.()?.id ?? ""); }
    catch { return ""; }
  }

  function accountList() {
    resolveNative();
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

  function openNativeAccountManager() {
    resolveNative();
    if (typeof runtime.openManageAccountsModal !== "function") {
      toast("Discord's native account manager was not found on this build");
      return false;
    }

    try {
      runtime.openManageAccountsModal();
      return true;
    } catch (error) {
      toast(`Could not open native account manager: ${error?.message ?? error}`);
      return false;
    }
  }

  async function switchNativeAccount(userId) {
    resolveNative();
    const target = String(userId ?? "");
    if (!target || target === currentId()) return;

    if (typeof runtime.multiAccountActions?.switchAccount !== "function") {
      throw new Error("Discord's native switch action was not found");
    }

    await Promise.resolve(runtime.multiAccountActions.switchAccount(target));
  }

  function Button({ text, onPress, secondary = false, disabled = false }) {
    const Pressable = RN.Pressable ?? RN.TouchableOpacity;
    return React.createElement(Pressable, {
      onPress,
      disabled,
      style: {
        backgroundColor: secondary ? C.card2 : C.brand,
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderRadius: 9,
        alignItems: "center",
        opacity: disabled ? 0.45 : 1,
      },
    }, React.createElement(RN.Text, {
      style: { color: C.text, fontWeight: "700", fontSize: 14 },
    }, text));
  }

  function Settings() {
    const [, refresh] = React.useReducer(x => x + 1, 0);
    const [switching, setSwitching] = React.useState("");

    enableNativeSwitcher();
    const accounts = accountList();
    const active = currentId();
    const available = !!runtime.capabilityModule?.getCanUseMultiAccountMobile && !!runtime.multiAccountStore;
    const managerAvailable = typeof runtime.openManageAccountsModal === "function";

    const children = [
      React.createElement(RN.View, {
        key: "status",
        style: { backgroundColor: C.card, padding: 14, borderRadius: 12 },
      }, [
        React.createElement(RN.Text, {
          key: "title",
          style: { color: C.text, fontSize: 18, fontWeight: "700" },
        }, "Account Switcher"),
        React.createElement(RN.Text, {
          key: "state",
          style: {
            color: available && runtime.nativeEnabled ? C.green : C.red,
            marginTop: 6,
            fontSize: 13,
            fontWeight: "700",
          },
        }, available && runtime.nativeEnabled
          ? "Discord native multi-account enabled"
          : "Native multi-account module not found yet"),
        React.createElement(RN.Text, {
          key: "notify",
          style: { color: C.muted, marginTop: 7, fontSize: 12, lineHeight: 17 },
        }, "Inactive-account notifications are not forced on in the Shiggy port."),
      ]),
      React.createElement(Button, {
        key: "manage",
        text: "+ Add / Manage Accounts",
        onPress: () => openNativeAccountManager(),
        disabled: !managerAvailable,
      }),
      React.createElement(RN.Text, {
        key: "saved-title",
        style: { color: C.text, fontSize: 16, fontWeight: "700", marginTop: 4 },
      }, "Accounts"),
    ];

    if (!accounts.length) {
      children.push(React.createElement(RN.View, {
        key: "empty",
        style: { backgroundColor: C.card2, padding: 12, borderRadius: 10 },
      }, React.createElement(RN.Text, {
        style: { color: C.muted, fontSize: 13, lineHeight: 18 },
      }, "No accounts are available yet. Tap Add / Manage Accounts and sign into another account once.")));
    } else {
      const Pressable = RN.Pressable ?? RN.TouchableOpacity;
      for (const account of accounts) {
        const isCurrent = account.id === active;
        const busy = switching === account.id;

        children.push(React.createElement(Pressable, {
          key: account.id,
          disabled: isCurrent || !!switching,
          onPress: async () => {
            setSwitching(account.id);
            try {
              await switchNativeAccount(account.id);
              toast(`Switching to ${account.displayName}`);
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
            opacity: isCurrent ? 0.72 : 1,
          },
        }, [
          React.createElement(RN.Text, {
            key: "name",
            style: { color: C.text, fontSize: 15, fontWeight: "700" },
          }, account.displayName),
          React.createElement(RN.Text, {
            key: "user",
            style: { color: C.muted, fontSize: 13, marginTop: 2 },
          }, `@${account.username}${isCurrent ? " • Current" : busy ? " • Switching…" : " • Tap to switch"}`),
        ]));
      }
    }

    children.push(React.createElement(Button, {
      key: "refresh",
      text: "Refresh",
      secondary: true,
      onPress: () => { enableNativeSwitcher(); refresh(); },
    }));

    children.push(React.createElement(RN.Text, {
      key: "diag",
      style: { color: C.muted, fontSize: 12, lineHeight: 17 },
    }, `v${VERSION} • native:${runtime.nativeEnabled ? "yes" : "no"} • manager:${managerAvailable ? "yes" : "no"} • switch:${runtime.multiAccountActions?.switchAccount ? "yes" : "no"}`));

    const Scroll = RN.ScrollView ?? RN.View;
    return React.createElement(Scroll, {
      style: { flex: 1, backgroundColor: C.bg },
      contentContainerStyle: { padding: 16, paddingBottom: 40, gap: 12 },
    }, children);
  }

  function retrySetup() {
    enableNativeSwitcher();
    resolveNative();

    if (
      runtime.nativeEnabled
      && runtime.multiAccountActions?.switchAccount
      && runtime.openManageAccountsModal
    ) {
      if (runtime.retryTimer) clearInterval(runtime.retryTimer);
      runtime.retryTimer = null;
    }
  }

  function cleanup() {
    if (runtime.retryTimer) clearInterval(runtime.retryTimer);
    runtime.retryTimer = null;

    try { runtime.capabilityUnpatch?.(); } catch {}
    runtime.capabilityUnpatch = null;

    runtime.nativeEnabled = false;
    try { delete globalThis[RUNTIME_KEY]; }
    catch { globalThis[RUNTIME_KEY] = null; }
  }

  runtime.cleanup = cleanup;

  return {
    onLoad() {
      retrySetup();
      runtime.retryTimer = setInterval(retrySetup, 750);
      setTimeout(() => {
        if (runtime.retryTimer) clearInterval(runtime.retryTimer);
        runtime.retryTimer = null;
      }, 30000);
    },
    onUnload() { cleanup(); },
    settings: Settings,
  };
})()
