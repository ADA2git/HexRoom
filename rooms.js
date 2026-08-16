"use strict";

/* Hexroom rooms, usernames, and leaderboards. Firebase optional. */
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  var MY_ROOMS_KEY = "hexroom-my-rooms";
  var BEST_KEY = "hexroom-best";
  var NAME_RE = /^[A-Za-z0-9 _]+$/;
  var ROOM_RE = /^[A-Za-z0-9 _\-]+$/;

  var IMPERSONATE = [
    "admin", "administrator", "official", "moderator", "hexroom",
    "hexroomadmin", "hexadmin", "staff", "system", "support", "owner",
    "root", "sysadmin", "hexroomofficial", "officialhexroom"
  ];
  var BLOCK_EXACT = [
    "ass", "sex", "fag", "cum", "tit", "xxx", "kkk", "mod"
  ];
  var BLOCK_CONTAINS = [
    "porn", "pussy", "penis", "vagina", "fuck", "slut", "whore", "nudes",
    "hentai", "blowjob", "dildo", "orgasm", "rape", "rapist", "nipple",
    "nigger", "nigga", "faggot", "retard", "kike", "spastic", "tranny",
    "wetback", "chink", "spic", "nazi", "hitler", "boobs", "dicks",
    "cock", "tits", "anal", "niga"
  ];

  var api = {
    submitRun: function () {},
    open: function () {},
    close: function () {},
    validateUsername: validateUsername
  };
  window.HexroomRooms = api;

  var els = {};
  var db = null;
  var auth = null;
  var user = null;
  var profile = null;
  var myRooms = [];
  var openRoom = null;
  var lbTab = "players";
  var searchTimer = null;
  var busy = false;
  var ready = false;
  var bootError = "";

  function compact(s) {
    return String(s || "").toLowerCase().replace(/[ _]/g, "");
  }

  function tokens(s) {
    return String(s || "").toLowerCase().trim().split(/[ _]+/).filter(Boolean);
  }

  function blockedReason(name) {
    var c = compact(name);
    var toks = tokens(name);
    var i;
    for (i = 0; i < IMPERSONATE.length; i++) {
      if (c === IMPERSONATE[i] || toks.indexOf(IMPERSONATE[i]) !== -1) {
        return "That name is reserved.";
      }
    }
    for (i = 0; i < BLOCK_EXACT.length; i++) {
      if (c === BLOCK_EXACT[i] || toks.indexOf(BLOCK_EXACT[i]) !== -1) {
        return "Choose another name.";
      }
    }
    for (i = 0; i < BLOCK_CONTAINS.length; i++) {
      if (c.indexOf(BLOCK_CONTAINS[i]) !== -1) {
        return "Choose another name.";
      }
    }
    return "";
  }

  function validateUsername(raw) {
    var name = String(raw || "").replace(/\s+/g, " ").trim();
    if (name.length < 3 || name.length > 16) {
      return { ok: false, name: name, error: "Use 3–16 characters." };
    }
    if (!NAME_RE.test(name)) {
      return { ok: false, name: name, error: "Letters, numbers, spaces, underscores only." };
    }
    var bad = blockedReason(name);
    if (bad) return { ok: false, name: name, error: bad };
    return { ok: true, name: name, error: "" };
  }

  function validateRoomName(raw) {
    var name = String(raw || "").replace(/\s+/g, " ").trim();
    if (name.length < 2 || name.length > 32) {
      return { ok: false, name: name, error: "Room name: 2–32 characters." };
    }
    if (!ROOM_RE.test(name)) {
      return { ok: false, name: name, error: "Letters, numbers, spaces, - and _ only." };
    }
    var bad = blockedReason(name);
    if (bad) return { ok: false, name: name, error: bad };
    return { ok: true, name: name, error: "" };
  }

  function hasConfig() {
    var c = window.HEXROOM_FIREBASE;
    return !!(c && typeof c === "object" && c.apiKey && c.projectId && c.appId);
  }

  function firebaseReady() {
    return typeof firebase !== "undefined" && firebase.auth && firebase.firestore;
  }

  function $(id) {
    return document.getElementById(id);
  }

  function show(el, on) {
    if (!el) return;
    if (on) el.classList.remove("hidden");
    else el.classList.add("hidden");
  }

  function setError(msg) {
    if (!els.error) return;
    if (msg) {
      els.error.textContent = msg;
      show(els.error, true);
    } else {
      els.error.textContent = "";
      show(els.error, false);
    }
  }

  function setWho() {
    if (!els.who) return;
    if (profile && profile.username) {
      els.who.textContent = "Playing as " + profile.username;
      show(els.who, true);
    } else {
      els.who.textContent = "";
      show(els.who, false);
    }
  }

  function setBusy(on) {
    busy = !!on;
    var buttons = els.card ? els.card.querySelectorAll("button") : [];
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].id === "rooms-btn") continue;
      buttons[i].disabled = busy;
    }
  }

  function loadMyRoomsLocal() {
    try {
      var raw = localStorage.getItem(MY_ROOMS_KEY);
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (r) { return r && r.id; });
    } catch (e) {
      return [];
    }
  }

  function saveMyRoomsLocal() {
    try {
      localStorage.setItem(MY_ROOMS_KEY, JSON.stringify(myRooms.map(function (r) {
        return { id: r.id, name: r.name };
      })));
    } catch (e) {}
  }

  function inMyRooms(id) {
    for (var i = 0; i < myRooms.length; i++) {
      if (myRooms[i].id === id) return true;
    }
    return false;
  }

  function rememberRoom(room) {
    if (!room || !room.id) return;
    var next = [];
    next.push({ id: room.id, name: room.name, total: room.total, memberCount: room.memberCount });
    for (var i = 0; i < myRooms.length; i++) {
      if (myRooms[i].id !== room.id) next.push(myRooms[i]);
    }
    myRooms = next;
    saveMyRoomsLocal();
  }

  function forgetRoom(id) {
    myRooms = myRooms.filter(function (r) { return r.id !== id; });
    saveMyRoomsLocal();
    if (openRoom && openRoom.id === id) openRoom = null;
  }

  function localBest() {
    try {
      return parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
    } catch (e) {
      return 0;
    }
  }

  function ts() {
    return firebase.firestore.FieldValue.serverTimestamp();
  }

  function increment(n) {
    return firebase.firestore.FieldValue.increment(n);
  }

  function userRef(uid) {
    return db.collection("users").doc(uid);
  }

  function roomRef(id) {
    return db.collection("rooms").doc(id);
  }

  function memberRef(roomId, uid) {
    return roomRef(roomId).collection("members").doc(uid);
  }

  function panel(name) {
    show(els.noconfig, name === "noconfig");
    show(els.loading, name === "loading");
    show(els.nameForm, name === "name");
    show(els.main, name === "main");
  }

  function currentPanel() {
    if (!hasConfig()) return "noconfig";
    if (!firebaseReady()) return "noconfig";
    if (bootError && !user) return "noconfig";
    if (!ready || !user) return "loading";
    if (!profile || !profile.username) return "name";
    return "main";
  }

  function renderPanel() {
    var p = currentPanel();
    if (p === "noconfig" && bootError) {
      if (els.noconfigNote) {
        els.noconfigNote.textContent = bootError;
      }
    }
    panel(p);
    setWho();
    if (p === "main") {
      renderMine();
      renderOpen();
      renderTabs();
    }
  }

  function clearNode(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function roomMeta(d) {
    var parts = [];
    var n = d.memberCount != null ? d.memberCount : 0;
    parts.push(n + (n === 1 ? " member" : " members"));
    if (d.total != null) parts.push("total " + d.total);
    return parts.join(" · ");
  }

  function renderMine() {
    if (!els.mine) return;
    clearNode(els.mine);
    if (!myRooms.length) {
      els.mine.appendChild(el("div", "rooms-empty", "No rooms yet. Create one or search."));
      return;
    }
    for (var i = 0; i < myRooms.length; i++) {
      els.mine.appendChild(roomRow(myRooms[i], true));
    }
  }

  function roomRow(room, mine) {
    var row = el("div", "rooms-row");
    var main = el("button", "rooms-row-main");
    main.type = "button";
    main.appendChild(el("div", "rooms-row-title", room.name || "Room"));
    main.appendChild(el("div", "rooms-row-sub", roomMeta(room)));
    main.addEventListener("click", function () {
      openRoomDetail(room.id);
    });
    row.appendChild(main);
    var btn = el("button", "rooms-mini", mine ? "Leave" : "Join");
    btn.type = "button";
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      if (mine) leaveRoom(room.id);
      else joinRoom(room.id);
    });
    row.appendChild(btn);
    return row;
  }

  function renderSearch(list) {
    if (!els.searchResults) return;
    clearNode(els.searchResults);
    if (!list) return;
    if (!list.length) {
      els.searchResults.appendChild(el("div", "rooms-empty", "No rooms match."));
      return;
    }
    for (var i = 0; i < list.length; i++) {
      els.searchResults.appendChild(roomRow(list[i], inMyRooms(list[i].id)));
    }
  }

  function renderOpen() {
    if (!els.open) return;
    clearNode(els.open);
    if (!openRoom) {
      show(els.open, false);
      show(els.tabMembers, false);
      if (lbTab === "members") lbTab = "players";
      return;
    }
    show(els.open, true);
    show(els.tabMembers, true);
    var head = el("div", "rooms-open-head");
    head.appendChild(el("div", "rooms-open-name", openRoom.name || "Room"));
    head.appendChild(el("div", "rooms-row-sub", roomMeta(openRoom)));
    els.open.appendChild(head);
    var actions = el("div", "rooms-open-actions");
    var leave = el("button", "rooms-mini", "Leave room");
    leave.type = "button";
    leave.addEventListener("click", function () { leaveRoom(openRoom.id); });
    var close = el("button", "rooms-mini rooms-mini-ghost", "Close");
    close.type = "button";
    close.addEventListener("click", function () {
      openRoom = null;
      if (lbTab === "members") lbTab = "players";
      renderOpen();
      renderTabs();
      loadLeaderboard();
    });
    actions.appendChild(leave);
    actions.appendChild(close);
    els.open.appendChild(actions);
  }

  function renderTabs() {
    var tabs = els.card ? els.card.querySelectorAll(".rooms-tab") : [];
    for (var i = 0; i < tabs.length; i++) {
      var id = tabs[i].getAttribute("data-tab");
      var on = id === lbTab;
      tabs[i].classList.toggle("on", on);
      tabs[i].setAttribute("aria-selected", on ? "true" : "false");
    }
  }

  function renderLb(rows, emptyText) {
    if (!els.lb) return;
    clearNode(els.lb);
    if (!rows || !rows.length) {
      els.lb.appendChild(el("div", "rooms-empty", emptyText || "No scores yet."));
      return;
    }
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var row = el("div", "rooms-row rooms-row-lb");
      row.appendChild(el("div", "rooms-rank", String(i + 1)));
      var main = el("div", "rooms-row-main");
      main.appendChild(el("div", "rooms-row-title", r.title));
      if (r.sub) main.appendChild(el("div", "rooms-row-sub", r.sub));
      row.appendChild(main);
      row.appendChild(el("div", "rooms-row-score", String(r.score)));
      if (r.roomId) {
        row.classList.add("rooms-row-tap");
        row.addEventListener("click", function (id) {
          return function () { openRoomDetail(id); };
        }(r.roomId));
      }
      els.lb.appendChild(row);
    }
  }

  function closePaletteIfOpen() {
    var sheet = $("palette-sheet");
    var btn = $("palette-btn");
    if (sheet) sheet.classList.add("hidden");
    if (btn) btn.setAttribute("aria-expanded", "false");
  }

  function openSheet() {
    if (!els.sheet) return;
    closePaletteIfOpen();
    els.sheet.classList.remove("hidden");
    if (els.btn) els.btn.setAttribute("aria-expanded", "true");
    renderPanel();
    if (currentPanel() === "main") {
      refreshMyRooms().then(function () {
        renderMine();
        loadLeaderboard();
      });
    } else if (currentPanel() === "name" && els.nameInput) {
      setTimeout(function () { els.nameInput.focus(); }, 80);
    }
  }

  function closeSheet() {
    if (!els.sheet) return;
    els.sheet.classList.add("hidden");
    if (els.btn) els.btn.setAttribute("aria-expanded", "false");
    if (els.search) els.search.blur();
    if (els.createName) els.createName.blur();
    if (els.nameInput) els.nameInput.blur();
  }

  async function refreshMyRooms() {
    if (!db || !user || !profile) {
      myRooms = loadMyRoomsLocal();
      return;
    }
    var found = [];
    try {
      var qs = await db.collectionGroup("members").where("username", "==", profile.username).get();
      var jobs = [];
      qs.forEach(function (doc) {
        var parent = doc.ref.parent && doc.ref.parent.parent;
        if (parent) jobs.push(parent.get());
      });
      var snaps = await Promise.all(jobs);
      for (var i = 0; i < snaps.length; i++) {
        if (!snaps[i].exists) continue;
        var d = snaps[i].data() || {};
        found.push({
          id: snaps[i].id,
          name: d.name,
          total: d.total || 0,
          memberCount: d.memberCount || 0
        });
      }
    } catch (e) {
      var local = loadMyRoomsLocal();
      for (var j = 0; j < local.length; j++) {
        try {
          var mem = await memberRef(local[j].id, user.uid).get();
          if (!mem.exists) continue;
          var room = await roomRef(local[j].id).get();
          if (!room.exists) continue;
          var rd = room.data() || {};
          found.push({
            id: room.id,
            name: rd.name,
            total: rd.total || 0,
            memberCount: rd.memberCount || 0
          });
        } catch (err) {}
      }
    }
    myRooms = found;
    saveMyRoomsLocal();
  }

  async function searchRooms(q) {
    if (!db) return [];
    var needle = String(q || "").trim().toLowerCase();
    if (!needle) return [];
    var snap = await db.collection("rooms").orderBy("nameLower").limit(80).get();
    var out = [];
    snap.forEach(function (doc) {
      var d = doc.data() || {};
      var nl = String(d.nameLower || "");
      if (nl.indexOf(needle) !== -1) {
        out.push({
          id: doc.id,
          name: d.name,
          nameLower: nl,
          total: d.total || 0,
          memberCount: d.memberCount || 0
        });
      }
    });
    return out;
  }

  async function claimUsername() {
    if (busy || !db || !user) return;
    var v = validateUsername(els.nameInput ? els.nameInput.value : "");
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      var taken = await db.collection("users").where("usernameLower", "==", v.name.toLowerCase()).limit(2).get();
      var clash = false;
      taken.forEach(function (doc) {
        if (doc.id !== user.uid) clash = true;
      });
      if (clash) {
        setError("That name is taken.");
        return;
      }
      var best = localBest();
      var data = {
        username: v.name,
        usernameLower: v.name.toLowerCase(),
        best: best,
        total: 0,
        updatedAt: ts()
      };
      await userRef(user.uid).set(data);
      profile = { username: v.name, usernameLower: data.usernameLower, best: best, total: 0 };
      renderPanel();
      await refreshMyRooms();
      renderMine();
      loadLeaderboard();
    } catch (e) {
      setError("Could not save that name. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function createRoom() {
    if (busy || !db || !user || !profile) return;
    var v = validateRoomName(els.createName ? els.createName.value : "");
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setBusy(true);
    setError("");
    try {
      var ref = db.collection("rooms").doc();
      var batch = db.batch();
      batch.set(ref, {
        name: v.name,
        nameLower: v.name.toLowerCase(),
        createdBy: user.uid,
        createdAt: ts(),
        memberCount: 1,
        total: 0
      });
      batch.set(ref.collection("members").doc(user.uid), {
        username: profile.username,
        best: profile.best || 0,
        total: profile.total || 0,
        joinedAt: ts()
      });
      await batch.commit();
      if (els.createName) els.createName.value = "";
      rememberRoom({ id: ref.id, name: v.name, total: 0, memberCount: 1 });
      openRoom = { id: ref.id, name: v.name, total: 0, memberCount: 1 };
      lbTab = "members";
      renderMine();
      renderOpen();
      renderTabs();
      loadLeaderboard();
    } catch (e) {
      setError("Could not create that room.");
    } finally {
      setBusy(false);
    }
  }

  async function joinRoom(roomId) {
    if (busy || !db || !user || !profile || !roomId) return;
    setBusy(true);
    setError("");
    try {
      var room = await roomRef(roomId).get();
      if (!room.exists) {
        setError("That room is gone.");
        return;
      }
      var mem = await memberRef(roomId, user.uid).get();
      var d = room.data() || {};
      if (!mem.exists) {
        var batch = db.batch();
        batch.set(memberRef(roomId, user.uid), {
          username: profile.username,
          best: profile.best || 0,
          total: profile.total || 0,
          joinedAt: ts()
        });
        batch.update(roomRef(roomId), { memberCount: increment(1) });
        await batch.commit();
        d.memberCount = (d.memberCount || 0) + 1;
      }
      rememberRoom({
        id: room.id,
        name: d.name,
        total: d.total || 0,
        memberCount: d.memberCount || 0
      });
      openRoom = {
        id: room.id,
        name: d.name,
        total: d.total || 0,
        memberCount: d.memberCount || 0
      };
      lbTab = "members";
      if (els.search) els.search.value = "";
      renderSearch(null);
      renderMine();
      renderOpen();
      renderTabs();
      loadLeaderboard();
    } catch (e) {
      setError("Could not join that room.");
    } finally {
      setBusy(false);
    }
  }

  async function leaveRoom(roomId) {
    if (busy || !db || !user || !roomId) return;
    setBusy(true);
    setError("");
    try {
      var room = await roomRef(roomId).get();
      var mem = await memberRef(roomId, user.uid).get();
      var batch = db.batch();
      if (mem.exists) batch.delete(memberRef(roomId, user.uid));
      if (room.exists) {
        var count = (room.data().memberCount || 1) - 1;
        if (count < 0) count = 0;
        batch.update(roomRef(roomId), { memberCount: count });
      }
      await batch.commit();
      forgetRoom(roomId);
      renderMine();
      renderOpen();
      renderTabs();
      if (els.search && els.search.value.trim()) runSearch();
      loadLeaderboard();
    } catch (e) {
      setError("Could not leave that room.");
    } finally {
      setBusy(false);
    }
  }

  async function openRoomDetail(roomId) {
    if (!db || !roomId) return;
    try {
      var room = await roomRef(roomId).get();
      if (!room.exists) {
        setError("That room is gone.");
        forgetRoom(roomId);
        renderMine();
        return;
      }
      var d = room.data() || {};
      openRoom = {
        id: room.id,
        name: d.name,
        total: d.total || 0,
        memberCount: d.memberCount || 0
      };
      lbTab = "members";
      renderOpen();
      renderTabs();
      loadLeaderboard();
    } catch (e) {
      setError("Could not open that room.");
    }
  }

  async function loadLeaderboard() {
    if (!db || !els.lb) return;
    renderLb([], "Loading…");
    try {
      if (lbTab === "players") {
        var us = await db.collection("users").orderBy("best", "desc").limit(30).get();
        var players = [];
        us.forEach(function (doc) {
          var d = doc.data() || {};
          players.push({
            title: d.username || "Player",
            sub: "total " + (d.total || 0),
            score: d.best || 0
          });
        });
        renderLb(players, "No players yet.");
        return;
      }
      if (lbTab === "rooms") {
        var rs = await db.collection("rooms").orderBy("total", "desc").limit(30).get();
        var rooms = [];
        rs.forEach(function (doc) {
          var d = doc.data() || {};
          rooms.push({
            title: d.name || "Room",
            sub: roomMeta(d),
            score: d.total || 0,
            roomId: doc.id
          });
        });
        renderLb(rooms, "No rooms yet.");
        return;
      }
      if (lbTab === "members" && openRoom) {
        var ms = await roomRef(openRoom.id).collection("members").orderBy("best", "desc").limit(50).get();
        var members = [];
        ms.forEach(function (doc) {
          var d = doc.data() || {};
          members.push({
            title: d.username || "Player",
            sub: "total " + (d.total || 0),
            score: d.best || 0
          });
        });
        renderLb(members, "No members yet.");
        return;
      }
      renderLb([], "Open a room to see members.");
    } catch (e) {
      renderLb([], "Leaderboard unavailable.");
    }
  }

  async function submitRun(score) {
    score = Math.round(Number(score));
    if (!db || !user || !profile || !profile.username) return;
    if (!isFinite(score) || score < 0) return;
    if (score === 0 && myRooms.length === 0) return;
    try {
      var uid = user.uid;
      var uref = userRef(uid);
      var usnap = await uref.get();
      if (!usnap.exists) return;
      var u = usnap.data() || {};
      var newBest = Math.max(Number(u.best) || 0, score);
      var roomIds = myRooms.map(function (r) { return r.id; });
      var memSnaps = await Promise.all(roomIds.map(function (id) {
        return memberRef(id, uid).get();
      }));
      var batch = db.batch();
      batch.update(uref, {
        best: newBest,
        total: increment(score),
        updatedAt: ts()
      });
      for (var i = 0; i < roomIds.length; i++) {
        if (!memSnaps[i] || !memSnaps[i].exists) continue;
        var md = memSnaps[i].data() || {};
        var mBest = Math.max(Number(md.best) || 0, score);
        batch.update(memberRef(roomIds[i], uid), {
          username: u.username || profile.username,
          best: mBest,
          total: increment(score)
        });
        batch.update(roomRef(roomIds[i]), { total: increment(score) });
      }
      await batch.commit();
      profile.best = newBest;
      profile.total = (Number(u.total) || 0) + score;
    } catch (e) {
      try {
        await submitRunRetry(score);
      } catch (err) {}
    }
  }

  async function submitRunRetry(score) {
    if (!db || !user || !profile) return;
    var uid = user.uid;
    var uref = userRef(uid);
    var usnap = await uref.get();
    if (!usnap.exists) return;
    var u = usnap.data() || {};
    var newBest = Math.max(Number(u.best) || 0, score);
    var batch = db.batch();
    batch.update(uref, {
      best: newBest,
      total: increment(score),
      updatedAt: ts()
    });
    await batch.commit();
    profile.best = newBest;
    profile.total = (Number(u.total) || 0) + score;
  }

  function runSearch() {
    var q = els.search ? els.search.value : "";
    if (!String(q).trim()) {
      renderSearch(null);
      return;
    }
    searchRooms(q).then(function (list) {
      renderSearch(list);
    }).catch(function () {
      renderSearch([]);
    });
  }

  function scheduleSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 180);
  }

  async function loadProfile(uid) {
    var snap = await userRef(uid).get();
    if (!snap.exists) {
      profile = null;
      return;
    }
    var d = snap.data() || {};
    if (!d.username) {
      profile = null;
      return;
    }
    profile = {
      username: d.username,
      usernameLower: d.usernameLower || String(d.username).toLowerCase(),
      best: d.best || 0,
      total: d.total || 0
    };
  }

  async function bootFirebase() {
    if (!hasConfig()) {
      bootError = "Rooms need a Firebase project. Add your web config to firebase-config.js. You can still play offline.";
      ready = true;
      return;
    }
    if (!firebaseReady()) {
      bootError = "Rooms need a Firebase project. Add your web config to firebase-config.js. You can still play offline.";
      ready = true;
      return;
    }
    try {
      if (!firebase.apps || !firebase.apps.length) {
        firebase.initializeApp(window.HEXROOM_FIREBASE);
      }
      auth = firebase.auth();
      db = firebase.firestore();
      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch (e) {}
      await auth.signInAnonymously();
      auth.onAuthStateChanged(function (u) {
        user = u || null;
        if (!user) {
          profile = null;
          ready = true;
          renderPanel();
          return;
        }
        loadProfile(user.uid).then(function () {
          ready = true;
          renderPanel();
          if (profile) {
            return refreshMyRooms().then(function () {
              renderMine();
            });
          }
        }).catch(function () {
          ready = true;
          renderPanel();
        });
      });
    } catch (e) {
      db = null;
      auth = null;
      bootError = "Rooms need a Firebase project. Enable Anonymous Auth and Firestore, then add the web config.";
      ready = true;
    }
  }

  function bind() {
    els.btn = $("rooms-btn");
    els.sheet = $("rooms-sheet");
    els.backdrop = $("rooms-backdrop");
    els.card = $("rooms-card");
    els.who = $("rooms-who");
    els.error = $("rooms-error");
    els.noconfig = $("rooms-noconfig");
    els.noconfigNote = $("rooms-noconfig-note");
    els.loading = $("rooms-loading");
    els.nameForm = $("rooms-name-form");
    els.nameInput = $("rooms-name-input");
    els.nameGo = $("rooms-name-go");
    els.main = $("rooms-main");
    els.search = $("rooms-search");
    els.searchResults = $("rooms-search-results");
    els.createName = $("rooms-create-name");
    els.createBtn = $("rooms-create-btn");
    els.mine = $("rooms-mine");
    els.open = $("rooms-open");
    els.tabMembers = $("rooms-tab-members");
    els.lb = $("rooms-lb");

    api.open = openSheet;
    api.close = closeSheet;
    api.submitRun = function (score) {
      try {
        return submitRun(score);
      } catch (e) {
        return undefined;
      }
    };

    if (els.btn) {
      els.btn.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      els.btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (els.sheet && !els.sheet.classList.contains("hidden")) closeSheet();
        else openSheet();
      });
    }
    if (els.backdrop) {
      els.backdrop.addEventListener("click", function () { closeSheet(); });
    }
    if (els.card) {
      els.card.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
      els.card.addEventListener("touchmove", function (e) { e.stopPropagation(); }, { passive: true });
    }
    if (els.sheet) {
      els.sheet.addEventListener("pointerdown", function (e) { e.stopPropagation(); });
    }
    if (els.nameGo) els.nameGo.addEventListener("click", claimUsername);
    if (els.nameInput) {
      els.nameInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          claimUsername();
        }
      });
    }
    if (els.createBtn) els.createBtn.addEventListener("click", createRoom);
    if (els.createName) {
      els.createName.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          createRoom();
        }
      });
    }
    if (els.search) {
      els.search.addEventListener("input", scheduleSearch);
      els.search.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
          e.preventDefault();
          runSearch();
        }
      });
    }
    if (els.card) {
      els.card.addEventListener("click", function (e) {
        var tab = e.target.closest ? e.target.closest(".rooms-tab") : null;
        if (!tab) return;
        var id = tab.getAttribute("data-tab");
        if (!id || (id === "members" && !openRoom)) return;
        lbTab = id;
        renderTabs();
        loadLeaderboard();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && els.sheet && !els.sheet.classList.contains("hidden")) {
        closeSheet();
      }
    });
  }

  function start() {
    bind();
    myRooms = loadMyRoomsLocal();
    if (!hasConfig() || !firebaseReady()) {
      bootError = "Rooms need a Firebase project. Add your web config to firebase-config.js. You can still play offline.";
      ready = true;
      renderPanel();
      return;
    }
    bootFirebase().then(function () {
      renderPanel();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
