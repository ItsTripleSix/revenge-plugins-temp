(() => {
  "use strict";

  const V = vendetta;
  if (!V?.metro?.common) return {};

  const { React, ReactNative: RN } = V.metro.common;
  const { instead } = V.patcher;
  const { storage } = V.plugin;
  const VERSION = "2.2.0-shiggy";

  storage.onlyActiveNotifications ??= true;

  const runtime = {
    multiAccountStore: null,
    userStore: null,
    actions: null,
    pushActions: null,
    notificationTokenManager: null,
    receiveNotificationModule: null,
    patches: [],
    pushPatched: false,
    receivePatched: false,
    notificationStatus: "starting",
    blockedNotifications: 0,
    startupTimer: null,
  };

  const C = {
    bg: "#111214",
    card: "#1e1f22",
    card2: "#2b2d31",
    text: "#f2f3f5",
    muted: "#b5bac1",
    green: "#23a55a",
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

  function findModule(predicate) {
    try { return V.metro?.find?.(predicate); } catch { return undefined; }
  }

  function unwrapDefault(value) {
    if (value?.default && (typeof value.default === "object" || typeof value.default === "function")) {
      return value.default;
    }
    return value;
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

  function resolveNotifications() {
    resolveRuntime();

    runtime.pushActions ??= unwrapDefault(
      find("registerDevice", "syncDevice", "unregisterDevice")
    );

    runtime.notificationTokenManager ??= unwrapDefault(
      find("registerToken", "getToken", "handleSyncWithMultiAccount")
      ?? findModule(module => {
        const value = unwrapDefault(module);
        return !!value
          && typeof value.getToken === "function"
          && typeof value.registerToken === "function"
          && typeof value.handleSyncWithMultiAccount === "function";
      })
    );

    if (!runtime.receiveNotificationModule) {
      const module = findModule(candidate => {
        const fn = candidate?.default;
        if (typeof fn !== "function") return false;
        if (fn.name === "receiveNotification") return true;
        try { return String(fn).includes("receiving_user_id"); } catch { return false; }
      });
      if (module?.default && typeof module.default === "function") {
        runtime.receiveNotificationModule = module;
      }
    }

    return runtime;
  }

  function currentId() {
    resolveRuntime();
    try { return String(runtime.userStore?.getCurrentUser?.()?.id ?? ""); }
    catch { return ""; }
  }

  function entryId(entry) {
    return String(entry?.id ?? entry?.user?.id ?? "");
  }

  function installPushSyncPatch() {
    resolveNotifications();
    if (runtime.pushPatched) return true;

    const pushActions = runtime.pushActions;
    const store = runtime.multiAccountStore;
    if (typeof pushActions?.syncDevice !== "function" || typeof store?.getValidUsers !== "function") {
      return false;
    }

    runtime.patches.push(
      instead("syncDevice", pushActions, (args, original) => {
        if (storage.onlyActiveNotifications !== true) {
          return original(...args);
        }

        const active = currentId();
        if (!active) return original(...args);

        const originalGetter = store.getValidUsers;
        const ownDescriptor = Object.getOwnPropertyDescriptor(store, "getValidUsers");

        try {
          Object.defineProperty(store, "getValidUsers", {
            configurable: true,
            writable: true,
            value: function getOnlyActiveUser() {
              const users = originalGetter.call(store);
              return Array.isArray(users)
                ? users.filter(user => entryId(user) === active)
                : users;
            },
          });

          return original(...args);
        } finally {
          try {
            if (ownDescriptor) Object.defineProperty(store, "getValidUsers", ownDescriptor);
            else delete store.getValidUsers;
          } catch {}
        }
      }),
    );

    runtime.pushPatched = true;
    return true;
  }

  function installReceiveFilter() {
    resolveNotifications();
    if (runtime.receivePatched) return true;

    const module = runtime.receiveNotificationModule;
    if (!module || typeof module.default !== "function") return false;

    runtime.patches.push(
      instead("default", module, (args, original) => {
        if (storage.onlyActiveNotifications !== true) {
          return original(...args);
        }

        const source = args?.[0];
        const getter = source?.getData;
        if (typeof getter !== "function") return original(...args);

        let data;
        try { data = getter.call(source); }
        catch { return original(...args); }

        const receivingId = data?.receiving_user_id;
        const active = currentId();

        if (receivingId != null && active && String(receivingId) !== active) {
          runtime.blockedNotifications += 1;
          return false;
        }

        return original(...args);
      }),
    );

    runtime.receivePatched = true;
    return true;
  }

  function installNotificationProtection() {
    const push = installPushSyncPatch();
    const receive = installReceiveFilter();

    if (push && receive) runtime.notificationStatus = "active-account filter ready";
    else if (push) runtime.notificationStatus = "push filter ready";
    else if (receive) runtime.notificationStatus = "local filter ready";
    else runtime.notificationStatus = "notification modules not ready";

    return push || receive;
  }

  async function syncNotificationRegistration() {
    resolveNotifications();
    installPushSyncPatch();

    const manager = runtime.notificationTokenManager;
    const pushActions = runtime.pushActions;
    let token = null;
    try { token = manager?.getToken?.() ?? null; } catch {}

    if (!token) {
      runtime.notificationStatus = "waiting for Android push token";
      return false;
    }

    try {
      if (
        typeof pushActions?.syncDevice === "function"
        && runtime.multiAccountStore?.canUseMultiAccountNotifications
      ) {
        await Promise.resolve(pushActions.syncDevice(token, false));
      } else if (typeof manager?.registerToken === "function") {
        await Promise.resolve(manager.registerToken());
      } else {
        runtime.notificationStatus = "push registration unavailable";
        return false;
      }

      runtime.notificationStatus = storage.onlyActiveNotifications === true
        ? "active account only"
        : "Discord default";
      return true;
    } catch (error) {
      runtime.notificationStatus = `sync failed: ${error?.message ?? error}`;
      return false;
    }
  }

  async function initializeNotificationProtection() {
    for (let attempt = 0; attempt < 5; attempt++) {
      installNotificationProtection();
      if (runtime.pushPatched && runtime.receivePatched) break;
      await sleep(700);
    }

    await syncNotificationRegistration();
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
    if (!target || target === currentId()) return;

    const fn = runtime.actions?.switchAccount;
    if (typeof fn !== "function") {
      throw new Error("Discord's multi-account switch action was not found");
    }

    await Promise.resolve(fn(target, undefined));

    if (storage.onlyActiveNotifications === true) {
      setTimeout(() => {
        syncNotificationRegistration().catch(() => {});
      }, 1200);
    }
  }

  function NotificationToggle({ refresh }) {
    const enabled = storage.onlyActiveNotifications === true;

    return React.createElement(RN.View, {
      style: {
        backgroundColor: C.card,
        padding: 14,
        borderRadius: 12,
        flexDirection: "row",
        alignItems: "center",
      },
    }, [
      React.createElement(RN.View, { key: "copy", style: { flex: 1, paddingRight: 12 } }, [
        React.createElement(RN.Text, {
          key: "title",
          style: { color: C.text, fontSize: 15, fontWeight: "700" },
        }, "Only notify active account"),
        React.createElement(RN.Text, {
          key: "desc",
          style: { color: C.muted, marginTop: 4, fontSize: 12, lineHeight: 17 },
        }, "Blocks notifications for saved accounts that are not currently active, including Android push notifications."),
        React.createElement(RN.Text, {
          key: "status",
          style: {
            color: enabled ? C.green : C.muted,
            marginTop: 5,
            fontSize: 11,
            lineHeight: 16,
          },
        }, `Status: ${runtime.notificationStatus}${runtime.blockedNotifications ? ` • blocked ${runtime.blockedNotifications}` : ""}`),
      ]),
      React.createElement(RN.Switch, {
        key: "switch",
        value: enabled,
        onValueChange: value => {
          storage.onlyActiveNotifications = value;
          refresh();
          installNotificationProtection();
          syncNotificationRegistration()
            .then(ok => {
              toast(ok
                ? (value ? "Only active account will notify" : "Multi-account notifications restored")
                : "Notification sync is still waiting for Discord");
              refresh();
            })
            .catch(() => {});
        },
      }),
    ]);
  }

  function Settings() {
    const [, refresh] = React.useReducer(value => value + 1, 0);
    const [switching, setSwitching] = React.useState("");

    React.useEffect(() => {
      initializeNotificationProtection()
        .then(() => refresh())
        .catch(() => {});
    }, []);

    const accounts = accountList();
    const active = currentId();
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
        }, "Uses Discord's saved accounts and native switch action. Active-account notification filtering is enabled by default."),
      ]),
      React.createElement(NotificationToggle, { key: "notifications", refresh }),
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
    }, `v${VERSION} • switch:${canSwitch ? "yes" : "no"} • notifications:${storage.onlyActiveNotifications === true ? "active-only" : "default"}`));

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
    onLoad() {
      runtime.startupTimer = setTimeout(() => {
        initializeNotificationProtection().catch(() => {});
      }, 1000);
    },
    onUnload() {
      if (runtime.startupTimer) clearTimeout(runtime.startupTimer);
      for (const unpatch of runtime.patches.splice(0).reverse()) {
        try { unpatch(); } catch {}
      }
      runtime.pushPatched = false;
      runtime.receivePatched = false;
    },
    settings: Settings,
  };
})()
