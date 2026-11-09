//THIS MIGHT NOT FORMAT NICELY TO BE DIRECTLY COPY AND PASTED INTO BOOKMARK, PLEASE USE THE ONE PROVIDED IN THE README.md//

// ============================================================================
// 1. NUKE BATCH MACRO (Hold X + Left-Click -> 50x Atom Bomb)
// ============================================================================
(() => {
  const COUNT = 50,
    TYPE = "Atom Bomb",
    KEY = "__openfrontNukeBatch_v2";

  if (window[KEY]) {
    window[KEY].abort();
    delete window[KEY];
    alert("OpenFront nuke macro OFF");
    return;
  }

  const menu = document.querySelector("build-menu");
  if (
    !menu?.game ||
    !menu.eventBus ||
    !menu.transformHandler ||
    typeof menu.sendBuildOrUpgrade !== "function"
  ) {
    alert("Join a running game before activating this bookmark.");
    return;
  }

  let template;
  try {
    menu.sendBuildOrUpgrade.call(
      {
        eventBus: {
          emit(event) {
            template = event;
          },
        },
        uiState: { rocketDirectionUp: true },
        hideMenu() {},
      },
      { type: TYPE, canBuild: true, canUpgrade: false },
      0
    );
  } catch (error) {
    console.error("[OpenFront] Setup error:", error);
  }

  if (!template || template.unit !== TYPE) {
    alert("Could not locate the build event. The game interface may have changed.");
    return;
  }

  const BuildEvent = template.constructor,
    controller = new AbortController(),
    options = { capture: true, signal: controller.signal };

  let held = false,
    pressed = false;

  const editing = (event) =>
    event
      .composedPath()
      .some(
        (node) =>
          node?.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(node?.tagName)
      );

  const onMap = (event) =>
    event
      .composedPath()
      .some(
        (node) => node?.id === "game-input-overlay" || node?.tagName === "CANVAS"
      );

  const swallow = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.code === "KeyX" &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !editing(event)
      ) {
        held = true;
        swallow(event);
      }
    },
    options
  );

  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code === "KeyX") {
        held = false;
        if (!editing(event)) swallow(event);
      }
    },
    options
  );

  window.addEventListener(
    "blur",
    () => {
      held = false;
      pressed = false;
    },
    { signal: controller.signal }
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        held = false;
        pressed = false;
      }
    },
    { signal: controller.signal }
  );

  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !held || editing(event) || !onMap(event)) return;
      pressed = true;
      swallow(event);

      try {
        if (document.querySelector("build-menu") !== menu) {
          throw new Error("Game changed. Toggle the bookmark off and on again.");
        }

        const world = menu.transformHandler.screenToWorldCoordinates(
          event.clientX,
          event.clientY
        );
        if (!world || !menu.game.isValidCoord(world.x, world.y)) {
          throw new Error("Cursor is outside the map.");
        }

        const tile = menu.game.ref(world.x, world.y);
        const request = new BuildEvent(TYPE, tile);
        request.unit = TYPE;
        request.tile = tile;
        request.rocketDirectionUp =
          typeof menu.uiState?.rocketDirectionUp === "boolean"
            ? menu.uiState.rocketDirectionUp
            : true;
        request.amount = COUNT;

        console.info("[OpenFront] Sending nuke batch:", {
          unit: request.unit,
          tile: request.tile,
          rocketDirectionUp: request.rocketDirectionUp,
          amount: request.amount,
        });
        menu.eventBus.emit(request);
      } catch (error) {
        console.error("[OpenFront] Nuke macro error:", error);
        alert("Nuke macro error: " + error.message);
      }
    },
    options
  );

  for (const type of ["mousedown", "mouseup", "pointerup", "click", "pointercancel"]) {
    window.addEventListener(
      type,
      (event) => {
        if (!pressed || event.button > 0) return;
        swallow(event);
        if (type === "click" || type === "pointercancel") pressed = false;
      },
      options
    );
  }

  window[KEY] = controller;
  alert(
    "Hold a key + left-click the map\n\n" +
      "X - Nuke\n" +
      "Z - Port\n" +
      "V - SAM\n" +
      "B - Missile silo\n" +
      "N - City (build / up to 100 upgrades)\n\n" +
      "Press O once - Toggle SAM ranges + total enemy SAM levels by cursor"
  );
})();

// ============================================================================
// 2. PORT MACRO (Hold Z + Left-Click -> Build / Up to 100 Upgrades)
// ============================================================================
(() => {
  const KEY = "__of_port_macro__",
    old = window[KEY];

  if (old) {
    old.stop();
    delete window[KEY];
    console.log("[OpenFront] Port macro OFF");
    return;
  }

  const menu = document.querySelector("build-menu"),
    bus = menu?.eventBus,
    game = menu?.game,
    transform = menu?.transformHandler;

  if (!menu || !bus || !game || !transform) {
    console.error(
      "[OpenFront] Could not find the active game's BuildMenu/EventBus. Run this inside a match."
    );
    return;
  }

  let upgradeCtor = null,
    buildCtor = null,
    busy = false,
    zHeld = false,
    macroPointer = false;

  const captureEvent = (bu, tile) => {
    let captured = null;
    const originalEmit = bus.emit;
    const originalHide = menu.hideMenu;
    try {
      bus.emit = function (ev) {
        captured = ev;
      };
      menu.hideMenu = function () {};
      menu.sendBuildOrUpgrade(bu, tile);
    } catch (e) {
      console.error("[OpenFront] Could not discover event type:", e);
    } finally {
      bus.emit = originalEmit;
      menu.hideMenu = originalHide;
    }
    return captured?.constructor || null;
  };

  const typing = (e) => {
    const t = e.target;
    return !!(
      t &&
      (t.closest?.("input,textarea,select,[contenteditable='true']") ||
        t.isContentEditable)
    );
  };

  const keydown = (e) => {
    if (e.code !== "KeyZ" || typing(e)) return;
    zHeld = true;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const keyup = (e) => {
    if (e.code !== "KeyZ") return;
    zHeld = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const blur = () => {
    zHeld = false;
    macroPointer = false;
    busy = false;
  };

  const pointerdown = async (e) => {
    if (e.button !== 0 || !zHeld || typing(e)) return;
    if (!document.body.classList.contains("in-game")) return;
    if (!e.target?.closest?.("#game-input-overlay")) return;

    macroPointer = true;
    e.preventDefault();
    e.stopImmediatePropagation();

    if (busy) return;
    busy = true;

    try {
      if (game.inSpawnPhase?.()) return;
      const cell = transform.screenToWorldCoordinates(e.clientX, e.clientY);
      if (!game.isValidCoord(cell.x, cell.y)) return;

      const tile = game.ref(cell.x, cell.y);
      const player = game.myPlayer?.();
      if (!player) return;

      const list = await player.buildables(tile, ["Port"]);
      const bu = list.find((x) => x.type === "Port");
      if (!bu) return;

      if (bu.canUpgrade !== false) {
        upgradeCtor ??= captureEvent(bu, tile);
        if (!upgradeCtor) {
          console.error("[OpenFront] Could not locate UpgradeStructureIntentEvent");
          return;
        }
        const id = bu.canUpgrade;
        bus.emit(new upgradeCtor(id, bu.type, 50));
        bus.emit(new upgradeCtor(id, bu.type, 50));
        console.log("[OpenFront] Port upgrade: up to 100 levels");
      } else if (bu.canBuild !== false) {
        buildCtor ??= captureEvent(bu, tile);
        if (!buildCtor) {
          console.error("[OpenFront] Could not locate BuildUnitIntentEvent");
          return;
        }
        bus.emit(new buildCtor(bu.type, tile));
        console.log("[OpenFront] Built Port");
      } else {
        console.log("[OpenFront] No valid Port build/upgrade here");
      }
    } catch (err) {
      console.error("[OpenFront] Port macro error:", err);
    } finally {
      busy = false;
    }
  };

  const pointerup = (e) => {
    if (!macroPointer) return;
    macroPointer = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  window.addEventListener("keydown", keydown, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("blur", blur, true);
  window.addEventListener("pointerdown", pointerdown, true);
  window.addEventListener("pointerup", pointerup, true);
  window.addEventListener("pointercancel", pointerup, true);

  window[KEY] = {
    stop() {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur, true);
      window.removeEventListener("pointerdown", pointerdown, true);
      window.removeEventListener("pointerup", pointerup, true);
      window.removeEventListener("pointercancel", pointerup, true);
    },
  };

  console.log("[OpenFront] Port macro ON — hold Z + left click");
})();

// ============================================================================
// 3. SAM LAUNCHER MACRO (Hold V + Left-Click -> Build / Up to 100 Upgrades)
// ============================================================================
(() => {
  const KEY = "__of_sam_macro__",
    old = window[KEY];

  if (old) {
    old.stop();
    delete window[KEY];
    console.log("[OpenFront] SAM macro OFF");
    return;
  }

  const menu = document.querySelector("build-menu"),
    bus = menu?.eventBus,
    game = menu?.game,
    transform = menu?.transformHandler;

  if (!menu || !bus || !game || !transform) {
    console.error(
      "[OpenFront] Could not find the active game's BuildMenu/EventBus. Run this inside a match."
    );
    return;
  }

  let upgradeCtor = null,
    buildCtor = null,
    busy = false,
    vHeld = false,
    macroPointer = false;

  const captureEvent = (bu, tile) => {
    let captured = null;
    const originalEmit = bus.emit;
    const originalHide = menu.hideMenu;
    try {
      bus.emit = function (ev) {
        captured = ev;
      };
      menu.hideMenu = function () {};
      menu.sendBuildOrUpgrade(bu, tile);
    } catch (e) {
      console.error("[OpenFront] Could not discover event type:", e);
    } finally {
      bus.emit = originalEmit;
      menu.hideMenu = originalHide;
    }
    return captured?.constructor || null;
  };

  const typing = (e) => {
    const t = e.target;
    return !!(
      t &&
      (t.closest?.("input,textarea,select,[contenteditable='true']") ||
        t.isContentEditable)
    );
  };

  const keydown = (e) => {
    if (e.code !== "KeyV" || typing(e)) return;
    vHeld = true;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const keyup = (e) => {
    if (e.code !== "KeyV") return;
    vHeld = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const blur = () => {
    vHeld = false;
    macroPointer = false;
    busy = false;
  };

  const pointerdown = async (e) => {
    if (e.button !== 0 || !vHeld || typing(e)) return;
    if (!document.body.classList.contains("in-game")) return;
    if (!e.target?.closest?.("#game-input-overlay")) return;

    macroPointer = true;
    e.preventDefault();
    e.stopImmediatePropagation();

    if (busy) return;
    busy = true;

    try {
      if (game.inSpawnPhase?.()) return;
      const cell = transform.screenToWorldCoordinates(e.clientX, e.clientY);
      if (!game.isValidCoord(cell.x, cell.y)) return;

      const tile = game.ref(cell.x, cell.y);
      const player = game.myPlayer?.();
      if (!player) return;

      const list = await player.buildables(tile, ["SAM Launcher"]);
      const bu = list.find((x) => x.type === "SAM Launcher");
      if (!bu) return;

      if (bu.canUpgrade !== false) {
        upgradeCtor ??= captureEvent(bu, tile);
        if (!upgradeCtor) {
          console.error("[OpenFront] Could not locate UpgradeStructureIntentEvent");
          return;
        }
        const id = bu.canUpgrade;
        bus.emit(new upgradeCtor(id, bu.type, 50));
        bus.emit(new upgradeCtor(id, bu.type, 50));
        console.log("[OpenFront] SAM upgrade: up to 100 levels");
      } else if (bu.canBuild !== false) {
        buildCtor ??= captureEvent(bu, tile);
        if (!buildCtor) {
          console.error("[OpenFront] Could not locate BuildUnitIntentEvent");
          return;
        }
        bus.emit(new buildCtor(bu.type, tile));
        console.log("[OpenFront] Built SAM Launcher");
      } else {
        console.log("[OpenFront] No valid SAM build/upgrade here");
      }
    } catch (err) {
      console.error("[OpenFront] SAM macro error:", err);
    } finally {
      busy = false;
    }
  };

  const pointerup = (e) => {
    if (!macroPointer) return;
    macroPointer = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  window.addEventListener("keydown", keydown, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("blur", blur, true);
  window.addEventListener("pointerdown", pointerdown, true);
  window.addEventListener("pointerup", pointerup, true);
  window.addEventListener("pointercancel", pointerup, true);

  window[KEY] = {
    stop() {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur, true);
      window.removeEventListener("pointerdown", pointerdown, true);
      window.removeEventListener("pointerup", pointerup, true);
      window.removeEventListener("pointercancel", pointerup, true);
    },
  };

  console.log("[OpenFront] SAM macro ON — hold V + left click");
})();

// ============================================================================
// 4. MISSILE SILO MACRO (Hold B + Left-Click -> Build / Up to 100 Upgrades)
// ============================================================================
(() => {
  const KEY = "__of_missile_silo_macro__",
    old = window[KEY];

  if (old) {
    old.stop();
    delete window[KEY];
    console.log("[OpenFront] Missile Silo macro OFF");
    return;
  }

  const menu = document.querySelector("build-menu"),
    bus = menu?.eventBus,
    game = menu?.game,
    transform = menu?.transformHandler;

  if (!menu || !bus || !game || !transform) {
    console.error(
      "[OpenFront] Could not find the active game's BuildMenu/EventBus. Run this inside a match."
    );
    return;
  }

  let upgradeCtor = null,
    buildCtor = null,
    busy = false,
    bHeld = false,
    macroPointer = false;

  const captureEvent = (bu, tile) => {
    let captured = null;
    const originalEmit = bus.emit;
    const originalHide = menu.hideMenu;
    try {
      bus.emit = function (ev) {
        captured = ev;
      };
      menu.hideMenu = function () {};
      menu.sendBuildOrUpgrade(bu, tile);
    } catch (e) {
      console.error("[OpenFront] Could not discover event type:", e);
    } finally {
      bus.emit = originalEmit;
      menu.hideMenu = originalHide;
    }
    return captured?.constructor || null;
  };

  const typing = (e) => {
    const t = e.target;
    return !!(
      t &&
      (t.closest?.("input,textarea,select,[contenteditable='true']") ||
        t.isContentEditable)
    );
  };

  const keydown = (e) => {
    if (e.code !== "KeyB" || typing(e)) return;
    bHeld = true;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const keyup = (e) => {
    if (e.code !== "KeyB") return;
    bHeld = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const blur = () => {
    bHeld = false;
    macroPointer = false;
    busy = false;
  };

  const pointerdown = async (e) => {
    if (e.button !== 0 || !bHeld || typing(e)) return;
    if (!document.body.classList.contains("in-game")) return;
    if (!e.target?.closest?.("#game-input-overlay")) return;

    macroPointer = true;
    e.preventDefault();
    e.stopImmediatePropagation();

    if (busy) return;
    busy = true;

    try {
      if (game.inSpawnPhase?.()) return;
      const cell = transform.screenToWorldCoordinates(e.clientX, e.clientY);
      if (!game.isValidCoord(cell.x, cell.y)) return;

      const tile = game.ref(cell.x, cell.y);
      const player = game.myPlayer?.();
      if (!player) return;

      const list = await player.buildables(tile);
      const bu = list.find((x) => x.type === "Missile Silo");
      if (!bu) {
        console.log("[OpenFront] Missile Silo is not available at this tile");
        return;
      }

      if (bu.canUpgrade !== false) {
        upgradeCtor ??= captureEvent(bu, tile);
        if (!upgradeCtor) {
          console.error("[OpenFront] Could not locate UpgradeStructureIntentEvent");
          return;
        }
        const id = bu.canUpgrade;
        bus.emit(new upgradeCtor(id, bu.type, 50));
        bus.emit(new upgradeCtor(id, bu.type, 50));
        console.log("[OpenFront] Missile Silo upgrade: up to 100 levels");
      } else if (bu.canBuild !== false) {
        buildCtor ??= captureEvent(bu, tile);
        if (!buildCtor) {
          console.error("[OpenFront] Could not locate BuildUnitIntentEvent");
          return;
        }
        bus.emit(new buildCtor(bu.type, tile));
        console.log("[OpenFront] Built Missile Silo");
      } else {
        console.log("[OpenFront] Cannot build or upgrade Missile Silo here");
      }
    } catch (err) {
      console.error("[OpenFront] Missile Silo macro error:", err);
    } finally {
      busy = false;
    }
  };

  const pointerup = (e) => {
    if (!macroPointer) return;
    macroPointer = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  window.addEventListener("keydown", keydown, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("blur", blur, true);
  window.addEventListener("pointerdown", pointerdown, true);
  window.addEventListener("pointerup", pointerup, true);
  window.addEventListener("pointercancel", pointerup, true);

  window[KEY] = {
    stop() {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur, true);
      window.removeEventListener("pointerdown", pointerdown, true);
      window.removeEventListener("pointerup", pointerup, true);
      window.removeEventListener("pointercancel", pointerup, true);
    },
  };

  console.log("[OpenFront] Missile Silo macro ON — hold B + left click");
})();

// ============================================================================
// 5. CITY MACRO (Hold N + Left-Click -> Build / Up to 100 Upgrades)
// ============================================================================
(() => {
  const KEY = "__of_city_macro__",
    old = window[KEY];

  if (old) {
    old.stop();
    delete window[KEY];
    console.log("[OpenFront] City macro OFF");
    return;
  }

  const menu = document.querySelector("build-menu"),
    bus = menu?.eventBus,
    game = menu?.game,
    transform = menu?.transformHandler;

  if (!menu || !bus || !game || !transform) {
    console.error(
      "[OpenFront] Could not find the active game's BuildMenu/EventBus. Run this inside a match."
    );
    return;
  }

  let upgradeCtor = null,
    buildCtor = null,
    busy = false,
    nHeld = false,
    macroPointer = false;

  const captureEvent = (bu, tile) => {
    let captured = null;
    const originalEmit = bus.emit;
    const originalHide = menu.hideMenu;
    try {
      bus.emit = function (ev) {
        captured = ev;
      };
      menu.hideMenu = function () {};
      menu.sendBuildOrUpgrade(bu, tile);
    } catch (e) {
      console.error("[OpenFront] Could not discover event type:", e);
    } finally {
      bus.emit = originalEmit;
      menu.hideMenu = originalHide;
    }
    return captured?.constructor || null;
  };

  const typing = (e) => {
    const t = e.target;
    return !!(
      t &&
      (t.closest?.("input,textarea,select,[contenteditable='true']") ||
        t.isContentEditable)
    );
  };

  const keydown = (e) => {
    if (e.code !== "KeyN" || typing(e)) return;
    nHeld = true;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const keyup = (e) => {
    if (e.code !== "KeyN") return;
    nHeld = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  const blur = () => {
    nHeld = false;
    macroPointer = false;
    busy = false;
  };

  const pointerdown = async (e) => {
    if (e.button !== 0 || !nHeld || typing(e)) return;
    if (!document.body.classList.contains("in-game")) return;
    if (!e.target?.closest?.("#game-input-overlay")) return;

    macroPointer = true;
    e.preventDefault();
    e.stopImmediatePropagation();

    if (busy) return;
    busy = true;

    try {
      if (game.inSpawnPhase?.()) return;
      const cell = transform.screenToWorldCoordinates(e.clientX, e.clientY);
      if (!game.isValidCoord(cell.x, cell.y)) return;

      const tile = game.ref(cell.x, cell.y);
      const player = game.myPlayer?.();
      if (!player) return;

      const list = await player.buildables(tile, ["City"]);
      const bu = list.find((x) => x.type === "City");
      if (!bu) return;

      if (bu.canUpgrade !== false) {
        upgradeCtor ??= captureEvent(bu, tile);
        if (!upgradeCtor) {
          console.error("[OpenFront] Could not locate UpgradeStructureIntentEvent");
          return;
        }
        const id = bu.canUpgrade;
        bus.emit(new upgradeCtor(id, bu.type, 50));
        bus.emit(new upgradeCtor(id, bu.type, 50));
        console.log("[OpenFront] City upgrade: up to 100 levels");
      } else if (bu.canBuild !== false) {
        buildCtor ??= captureEvent(bu, tile);
        if (!buildCtor) {
          console.error("[OpenFront] Could not locate BuildUnitIntentEvent");
          return;
        }
        bus.emit(new buildCtor(bu.type, tile));
        console.log("[OpenFront] Built City");
      } else {
        console.log("[OpenFront] No valid City build/upgrade here");
      }
    } catch (err) {
      console.error("[OpenFront] City macro error:", err);
    } finally {
      busy = false;
    }
  };

  const pointerup = (e) => {
    if (!macroPointer) return;
    macroPointer = false;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  window.addEventListener("keydown", keydown, true);
  window.addEventListener("keyup", keyup, true);
  window.addEventListener("blur", blur, true);
  window.addEventListener("pointerdown", pointerdown, true);
  window.addEventListener("pointerup", pointerup, true);
  window.addEventListener("pointercancel", pointerup, true);

  window[KEY] = {
    stop() {
      window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", keyup, true);
      window.removeEventListener("blur", blur, true);
      window.removeEventListener("pointerdown", pointerdown, true);
      window.removeEventListener("pointerup", pointerup, true);
      window.removeEventListener("pointercancel", pointerup, true);
    },
  };

  console.log("[OpenFront] City macro ON — hold N + left click");
})();

// ============================================================================
// 6. SAM RANGE OVERLAY & CURSOR LEVEL COUNTER (Press O to Toggle)
// ============================================================================
(() => {
  const KEY = "__of_sam_range_overlay__";
  const old = window[KEY];
  if (old) {
    old.stop();
    return;
  }

  if (!window.__openfrontNukeBatch_v2) return;

  const menu = document.querySelector("build-menu");
  const game = menu?.game;
  const transform = menu?.transformHandler;
  const config = game?.config?.();

  if (
    !game ||
    typeof game.units !== "function" ||
    typeof game.ticks !== "function" ||
    typeof game.isValidCoord !== "function" ||
    typeof config?.samRange !== "function" ||
    typeof transform?.worldToScreenCoordinates !== "function" ||
    typeof transform?.screenToWorldCoordinates !== "function" ||
    typeof transform?.boundingRect !== "function"
  ) {
    console.error(
      "[OpenFront] SAM overlay could not find the game's range or camera API."
    );
    return;
  }

  const controller = new AbortController();
  const options = { capture: true, signal: controller.signal };

  let enabled = false;
  let stopped = false;
  let oPressed = false;
  let frame = 0;
  let canvas = null;
  let context = null;
  let cursorBadge = null;
  let cursor = null;
  let hasPlayer = false;
  let lastCountKey = "";
  let enemyLevels = 0;
  let sams = [];
  let lastTick = null;
  let lastView = "";

  const editing = (event) =>
    event
      .composedPath()
      .some(
        (node) =>
          node?.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(node?.tagName)
      );

  const inThisGame = () =>
    document.body.classList.contains("in-game") &&
    document.querySelector("build-menu") === menu &&
    menu.game === game &&
    menu.transformHandler === transform;

  const swallow = (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  function hide() {
    enabled = false;
    cancelAnimationFrame(frame);
    frame = 0;
    canvas?.remove();
    cursorBadge?.remove();
    canvas = null;
    context = null;
    cursorBadge = null;
    lastCountKey = "";
    sams = [];
    lastTick = null;
    lastView = "";
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    hide();
    controller.abort();
    if (window[KEY] === api) delete window[KEY];
    console.info("[OpenFront] SAM range overlay removed");
  }

  function colorFor(sam, me) {
    const owner = sam.owner();
    if (!me) return owner.borderColor?.()?.toHex?.() || "#67e8f9";
    if (owner.id() === me.id()) return "#4ade80";
    if (
      me.isFriendly?.(owner) ||
      me.isAlliedWith?.(owner) ||
      me.isOnSameTeam?.(owner)
    ) {
      return "#fde047";
    }
    return "#fb7185";
  }

  function isEnemy(sam, me) {
    if (!me) return false;
    const owner = sam.owner();
    return (
      owner.id() !== me.id() &&
      !(
        me.isFriendly?.(owner) ||
        me.isAlliedWith?.(owner) ||
        me.isOnSameTeam?.(owner)
      )
    );
  }

  function clearCursor() {
    cursor = null;
    if (cursorBadge) cursorBadge.hidden = true;
  }

  function updateCursorLevels(rect, tick) {
    if (!cursorBadge) return;
    if (
      !cursor ||
      !hasPlayer ||
      cursor.x < rect.left ||
      cursor.y < rect.top ||
      cursor.x >= rect.left + rect.width ||
      cursor.y >= rect.top + rect.height
    ) {
      cursorBadge.hidden = true;
      return;
    }

    const hit = document.elementFromPoint(cursor.x, cursor.y);
    if (!hit?.closest?.("#game-input-overlay") && hit?.tagName !== "CANVAS") {
      cursorBadge.hidden = true;
      return;
    }

    const tile = transform.screenToWorldCoordinates(cursor.x, cursor.y);
    if (!game.isValidCoord(tile.x, tile.y)) {
      cursorBadge.hidden = true;
      return;
    }

    const key = [tick, tile.x, tile.y].join(",");
    if (key !== lastCountKey) {
      lastCountKey = key;
      enemyLevels = 0;
      for (const sam of sams) {
        if (!sam.enemy || !sam.completed || !(sam.current > 0)) continue;
        const dx = tile.x - sam.x;
        const dy = tile.y - sam.y;
        if (dx * dx + dy * dy <= sam.current * sam.current) {
          enemyLevels += sam.level;
        }
      }
      cursorBadge.textContent = String(enemyLevels);
    }

    const width = Math.max(22, 10 + String(enemyLevels).length * 8);
    let left = cursor.x + 14;
    let top = cursor.y + 18;
    if (left + width > window.innerWidth - 6) left = cursor.x - width - 14;
    if (top + 20 > window.innerHeight - 6) top = cursor.y - 32;

    cursorBadge.style.left = Math.max(6, left) + "px";
    cursorBadge.style.top = Math.max(6, top) + "px";
    cursorBadge.hidden = false;
  }

  function rangesFor(sam, tick) {
    const level = sam.level();
    const upgrade = sam.samLauncherState?.();
    const state = sam.state;
    const startTick = upgrade?.upgradeStartTick ?? state?.samUpgradeStartTick;
    const duration =
      upgrade?.duration ??
      state?.samUpgradeDuration ??
      config.samUpgradeDuration?.();
    const startRange = upgrade?.startRange ?? state?.samUpgradeStartRange;
    const targetLevel =
      upgrade?.targetLevel ?? state?.samUpgradeTargetLevel ?? level;
    const target = config.samRange(targetLevel);

    if (
      Number.isFinite(startTick) &&
      Number.isFinite(duration) &&
      duration > 0 &&
      Number.isFinite(startRange)
    ) {
      const progress = Math.max(0, Math.min(1, (tick - startTick) / duration));
      const current = startRange + (target - startRange) * progress;
      return {
        current,
        preview: progress < 1 && target > current ? target : 0,
      };
    }

    if (sam.isUnderConstruction?.()) {
      return { current: 0, preview: target };
    }
    return { current: config.samRange(level), preview: 0 };
  }

  function circle(x, y, radius, color, preview, width, height) {
    if (
      !Number.isFinite(radius) ||
      radius <= 0 ||
      x + radius < 0 ||
      y + radius < 0 ||
      x - radius > width ||
      y - radius > height
    ) {
      return;
    }

    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.setLineDash(preview ? [6, 4] : []);
    context.globalAlpha = preview ? 0.55 : 0.9;
    context.lineWidth = 3.5;
    context.strokeStyle = "rgba(0,0,0,0.65)";
    context.stroke();
    context.lineWidth = 1.5;
    context.strokeStyle = color;
    context.stroke();
  }

  function paint() {
    const rect = transform.boundingRect();
    const scale = transform.scale;
    const dpr = window.devicePixelRatio || 1;

    if (rect.width <= 0 || rect.height <= 0 || !(scale > 0)) {
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (cursorBadge) cursorBadge.hidden = true;
      lastView = "";
      return;
    }

    const tick = game.ticks();
    if (tick !== lastTick) {
      const me = game.myPlayer?.();
      hasPlayer = !!me;
      sams = game
        .units("SAM Launcher")
        .filter((sam) => sam.isActive())
        .map((sam) => {
          const tile = sam.tile();
          return {
            x: game.x(tile),
            y: game.y(tile),
            color: colorFor(sam, me),
            level: sam.level(),
            enemy: isEnemy(sam, me),
            completed: !sam.isUnderConstruction?.(),
            ...rangesFor(sam, tick),
          };
        });
      lastTick = tick;
      lastCountKey = "";
    }

    updateCursorLevels(rect, tick);

    const origin = transform.worldToScreenCoordinates({ x: 0, y: 0 });
    const view = [
      tick,
      origin.x,
      origin.y,
      scale,
      rect.left,
      rect.top,
      rect.width,
      rect.height,
      dpr,
    ].join(",");

    if (view === lastView) return;
    lastView = view;

    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

    Object.assign(canvas.style, {
      left: rect.left + "px",
      top: rect.top + "px",
      width: rect.width + "px",
      height: rect.height + "px",
    });

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, rect.width, rect.height);

    for (const sam of sams) {
      const x = origin.x - rect.left + sam.x * scale;
      const y = origin.y - rect.top + sam.y * scale;
      circle(x, y, sam.current * scale, sam.color, false, rect.width, rect.height);
      circle(x, y, sam.preview * scale, sam.color, true, rect.width, rect.height);
    }
  }

  function draw() {
    frame = 0;
    if (!enabled || stopped) return;
    if (!inThisGame()) {
      stop();
      return;
    }
    if (document.hidden) return;

    try {
      paint();
    } catch (error) {
      hide();
      console.error("[OpenFront] SAM overlay stopped:", error);
      return;
    }
    frame = requestAnimationFrame(draw);
  }

  function toggle() {
    if (stopped) return;
    if (enabled) {
      hide();
      console.info("[OpenFront] Individual SAM ranges OFF");
      return;
    }
    if (!inThisGame()) {
      stop();
      return;
    }

    canvas = document.createElement("canvas");
    canvas.id = "of-individual-sam-ranges";
    canvas.setAttribute("aria-hidden", "true");
    Object.assign(canvas.style, {
      position: "fixed",
      pointerEvents: "none",
      zIndex: "1",
    });

    context = canvas.getContext("2d");
    if (!context) {
      hide();
      console.error("[OpenFront] Could not create the SAM overlay canvas.");
      return;
    }

    const input = document.getElementById("game-input-overlay");
    if (input?.parentElement === document.body) input.before(canvas);
    else document.body.appendChild(canvas);

    cursorBadge = document.createElement("span");
    cursorBadge.id = "of-enemy-sam-count";
    cursorBadge.setAttribute("aria-hidden", "true");
    cursorBadge.textContent = "0";
    cursorBadge.hidden = true;
    Object.assign(cursorBadge.style, {
      position: "fixed",
      pointerEvents: "none",
      userSelect: "none",
      zIndex: "10000",
      color: "#fff",
      background: "rgba(15,23,42,0.9)",
      font: "600 12px/16px ui-monospace, SFMono-Regular, Consolas, monospace",
      padding: "1px 4px",
      border: "1px solid rgba(255,255,255,0.35)",
      borderRadius: "3px",
      boxSizing: "border-box",
      whiteSpace: "nowrap",
    });
    document.body.appendChild(cursorBadge);

    enabled = true;
    lastTick = null;
    lastView = "";
    draw();
    if (enabled) console.info("[OpenFront] Individual SAM ranges ON");
  }

  const api = {
    stop,
    toggle,
    get enabled() {
      return enabled;
    },
  };
  window[KEY] = api;

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") {
        clearCursor();
        return;
      }
      cursor = { x: event.clientX, y: event.clientY };
    },
    { ...options, passive: true }
  );

  window.addEventListener(
    "pointerout",
    (event) => {
      if (!event.relatedTarget) clearCursor();
    },
    options
  );

  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.code !== "KeyO" ||
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        event.isComposing ||
        editing(event)
      ) {
        return;
      }
      swallow(event);
      if (event.repeat || oPressed) return;
      oPressed = true;
      toggle();
    },
    options
  );

  window.addEventListener(
    "keyup",
    (event) => {
      if (event.code !== "KeyO" || !oPressed) return;
      oPressed = false;
      swallow(event);
    },
    options
  );

  window.addEventListener(
    "blur",
    () => {
      oPressed = false;
      clearCursor();
    },
    options
  );

  document.addEventListener(
    "visibilitychange",
    () => {
      oPressed = false;
      clearCursor();
      if (!enabled) return;
      cancelAnimationFrame(frame);
      frame = 0;
      if (!document.hidden) {
        lastTick = null;
        lastView = "";
        draw();
      }
    },
    { signal: controller.signal }
  );

  console.info(
    "[OpenFront] Press O for SAM ranges and total enemy SAM levels by the cursor"
  );
})();
