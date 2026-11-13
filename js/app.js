/* ==========================================================================
   app.js — Game Master dashboard (index.html)
   Owns ALL game state and rules. The presentation window only ever receives
   a "public state" snapshot that contains revealed answers and nothing else.
   ========================================================================== */
(function () {
  'use strict';

  var CFG = window.GAME_CONFIG || {};
  var CHANNEL_NAME = 'birthday-game';
  var STORAGE_KEY = 'birthday-game-gm-v1';
  var MAX_STRIKES = 3;
  var DEFAULT_POINTS = CFG.defaultPoints || [100, 80, 60, 40, 20];
  var STEAL_COUNTS = CFG.stealAnswerCountsTowardPoints !== false;
  var DEFAULT_TEAMS = CFG.teamNames || ['Team Pink', 'Team Blue'];

  /* ---- Avatars teams can pick from (edit the list in questions.js) ---- */
  var FALLBACK_AVATARS = [
    { id: 'avatar-1', name: 'Avatar 1', image: 'images/avatars/avatar-1.png', emoji: '🐱' },
    { id: 'avatar-2', name: 'Avatar 2', image: 'images/avatars/avatar-2.png', emoji: '🐶' },
    { id: 'avatar-3', name: 'Avatar 3', image: 'images/avatars/avatar-3.png', emoji: '🦊' },
    { id: 'avatar-4', name: 'Avatar 4', image: 'images/avatars/avatar-4.png', emoji: '🐼' },
    { id: 'avatar-5', name: 'Avatar 5', image: 'images/avatars/avatar-5.png', emoji: '🐰' },
    { id: 'avatar-6', name: 'Avatar 6', image: 'images/avatars/avatar-6.png', emoji: '🐸' },
    { id: 'avatar-7', name: 'Avatar 7', image: 'images/avatars/avatar-7.png', emoji: '🦄' },
    { id: 'avatar-8', name: 'Avatar 8', image: 'images/avatars/avatar-8.png', emoji: '🐙' }
  ];
  var AVATARS = (CFG.avatars && CFG.avatars.length ? CFG.avatars : FALLBACK_AVATARS)
    .map(function (a, i) {
      return {
        id: String(a.id || 'avatar-' + (i + 1)),
        name: a.name || 'Avatar ' + (i + 1),
        image: a.image || '',
        emoji: a.emoji || '🎈'
      };
    });

  /* ---- Turn the raw data in questions.js into a clean, predictable shape -- */
  function normalizeCategories(raw) {
    return (raw || []).map(function (c, ci) {
      var answers = (c.answers || []).map(function (a, ai) {
        var obj = typeof a === 'string' ? { text: a } : a;
        // Past the end of defaultPoints, keep using the last value (never 0).
        var pts = typeof obj.points === 'number'
          ? obj.points
          : DEFAULT_POINTS[Math.min(ai, DEFAULT_POINTS.length - 1)];
        return { text: String(obj.text), points: pts || 0 };
      });
      return {
        id: String(c.id || 'category-' + ci),
        name: c.name || 'Category ' + (ci + 1),
        emoji: c.emoji || '🎉',
        image: c.image || '',
        question: c.question || '',
        answers: answers
      };
    });
  }

  // Optional GAME_BONUS in questions.js -> one extra round played after the others.
  function normalizeBonus(raw) {
    if (!raw) return null;
    var b = normalizeCategories([raw])[0];
    b.id = 'bonus-round';
    b.name = raw.name || 'Bonus Round';
    b.emoji = raw.emoji || '⭐';
    return b;
  }

  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function newEventId() {
    return Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  }

  new Vue({
    el: '#app',

    data: function () {
      return {
        title: CFG.title || 'Birthday Game',
        categories: normalizeCategories(window.GAME_CATEGORIES),
        bonus: normalizeBonus(window.GAME_BONUS),
        bonusSkipped: false, // game ended during the bonus round
        loadErrors: (window.__loadErrors || []).concat(
          window.GAME_CATEGORIES ? [] : ['questions.js did not load, so there are no categories.']
        ),
        maxStrikes: MAX_STRIKES,

        teams: [
          { name: DEFAULT_TEAMS[0] || 'Team 1', score: 0, avatar: null },
          { name: DEFAULT_TEAMS[1] || 'Team 2', score: 0, avatar: null }
        ],
        avatars: AVATARS,
        brokenAvatars: {}, // avatar ids whose image file failed to load
        endedEarly: false, // GM pressed "End game now"
        gameStarted: false, // false = starting screen (avatars), true = category menu + rounds

        // Round state
        categoryId: null,
        // idle | ready | faceoff | faceoff2 | decide | control | steal | ended
        phase: 'idle',
        pendingStarter: null, // "who buzzed in first" choice before the round starts
        starter: null, // team that buzzed in first and answers first in the face-off
        challenger: null, // other team, answering second in the face-off
        faceoffRank: null, // board index of the first team's answer (null = they missed)
        faceoffWinner: null, // team that won the face-off (chooses to play or pass)
        retry: false, // both teams missed the face-off → buzz in again
        controller: null, // team playing the board (the one that can get strikes)
        stealer: null, // team making the steal attempt
        strikes: [0, 0],
        revealed: [],
        pot: 0, // points accumulated this round
        endInfo: null, // { winner, points, reason }
        playedIds: [],
        brokenImages: {}, // category ids whose image file failed to load
        event: null, // one-shot animation cue for the presentation

        history: [], // snapshots for Undo
        adjust: [10, 10],

        // Presentation window tracking
        presenceAt: 0,
        now: Date.now(),
        hasBroadcastChannel: typeof BroadcastChannel !== 'undefined'
      };
    },

    computed: {
      category: function () {
        var id = this.categoryId;
        return this.allCats.filter(function (c) { return c.id === id; })[0] || null;
      },
      answers: function () {
        return this.category ? this.category.answers : [];
      },
      inRound: function () {
        return ['faceoff', 'faceoff2', 'decide', 'control', 'steal'].indexOf(this.phase) !== -1;
      },
      connected: function () {
        return this.now - this.presenceAt < 6000;
      },
      // Every category has been played and we're back at the menu.
      allPlayed: function () {
        var ids = this.playedIds;
        return this.categories.length > 0 && this.categories.every(function (c) {
          return ids.indexOf(c.id) !== -1;
        });
      },
      allCats: function () {
        return this.bonus ? this.categories.concat([this.bonus]) : this.categories;
      },
      regularDone: function () { return this.allPlayed || this.endedEarly; },
      bonusPending: function () {
        return !!this.bonus && !this.bonusSkipped && this.playedIds.indexOf(this.bonus.id) === -1;
      },
      inBonus: function () { return !!this.bonus && this.categoryId === this.bonus.id; },
      // Regular rounds are finished and the bonus round is still waiting.
      bonusDue: function () {
        return this.gameStarted && this.phase === 'idle' && this.regularDone && this.bonusPending;
      },
      gameOver: function () {
        return this.gameStarted && this.phase === 'idle' && this.regularDone && !this.bonusPending;
      },
      backLabel: function () {
        if (this.inBonus) return '🏆 Finish game';
        if (this.regularDone && this.bonusPending) return '⭐ On to the Bonus Round';
        return '⬅ Back to categories';
      },
      // 0 / 1 for the team in the lead, null for a tie.
      winner: function () {
        var a = this.teams[0].score, b = this.teams[1].score;
        return a === b ? null : (a > b ? 0 : 1);
      },
      missingAvatars: function () {
        return this.teams.filter(function (t) { return !t.avatar; })
          .map(function (t) { return t.name; });
      },
      revealedCount: function () {
        return this.revealed.filter(Boolean).length;
      },

      /* The team currently "on the spot" — drives highlights on both screens */
      activeTeam: function () {
        switch (this.phase) {
          case 'faceoff': return this.starter;
          case 'faceoff2': return this.challenger;
          case 'decide': return this.faceoffWinner;
          case 'control': return this.controller;
          case 'steal': return this.stealer;
          case 'ended': return this.endInfo ? this.endInfo.winner : null;
          default: return this.gameOver ? this.winner : null; // highlight the champion
        }
      },

      teamBadges: function () {
        var badges = [null, null];
        var t = this.activeTeam;
        if (t === null) return badges;
        badges[t] = this.phase === 'idle' ? 'Winner!' : {
          faceoff: 'Face-off',
          faceoff2: 'Your answer!',
          decide: 'Face-off winner',
          control: 'In control',
          steal: 'Steal chance!',
          ended: 'Round winner'
        }[this.phase];
        return badges;
      },

      /* Headline + sub-line shown to the audience (and on the dashboard) */
      status: function () {
        var n = this.teams.map(function (t) { return t.name; });
        switch (this.phase) {
          case 'idle':
            return this.gameStarted
              ? { headline: 'Pick a category!', sub: 'Get ready to play' }
              : { headline: 'Welcome! Pick your avatar', sub: 'Each team chooses one, then we play!' };
          case 'ready':
            return this.retry
              ? { headline: 'Nothing on the board!', sub: 'Buzz in again for the face-off' }
              : { headline: 'Get ready!', sub: 'Face-off time — buzz in!' };
          case 'faceoff':
            return {
              headline: 'Face-off! ' + n[this.starter] + ' buzzed in first',
              sub: 'Give your answer — the #1 answer wins control'
            };
          case 'faceoff2':
            return this.faceoffRank === null
              ? {
                  headline: n[this.challenger] + ': your turn to answer!',
                  sub: 'Get an answer on the board to win the face-off'
                }
              : {
                  headline: n[this.challenger] + ': can you beat that answer?',
                  sub: 'A higher-ranking answer wins the face-off'
                };
          case 'decide':
            return {
              headline: n[this.faceoffWinner] + ' won the face-off!',
              sub: 'Play or pass?'
            };
          case 'control':
            return {
              headline: n[this.controller] + ' has control!',
              sub: 'Keep guessing — ' + MAX_STRIKES + ' strikes and the other team can steal'
            };
          case 'steal':
            return {
              headline: n[this.stealer] + ': one chance to steal!',
              sub: this.pot + ' points are on the line'
            };
          case 'ended':
            if (!this.endInfo) return { headline: 'Round over', sub: '' };
            var w = n[this.endInfo.winner];
            var pts = '+' + this.endInfo.points + ' points';
            if (this.endInfo.reason === 'cleared') {
              return { headline: w + ' cleared the board!', sub: pts };
            }
            if (this.endInfo.reason === 'steal') {
              return { headline: w + ' stole the round!', sub: pts };
            }
            return { headline: 'Steal missed! ' + w + ' keeps the points', sub: pts };
        }
        return { headline: '', sub: '' };
      },

      /* ---------------------------------------------------------------
         THE ONLY THING SENT TO THE PRESENTATION WINDOW.
         Unrevealed answers are reduced to { revealed: false } — their
         text and points are never included in the message.
         --------------------------------------------------------------- */
      publicState: function () {
        var self = this;
        var cat = this.category;
        return {
          title: this.title,
          teams: this.teams.map(function (t) {
            return { name: t.name, score: t.score, avatar: self.avatarPublic(t.avatar) };
          }),
          strikes: this.strikes.slice(),
          maxStrikes: MAX_STRIKES,
          gameStarted: this.gameStarted,
          gameOver: this.gameOver,
          // Category names are only sent once the game has started, so the
          // surprise isn't sitting in the TV window's memory during the lobby.
          categories: this.gameStarted
            ? this.categories.map(function (c) {
                return { id: c.id, name: c.name, emoji: c.emoji, image: c.image, played: self.isPlayed(c.id) };
              })
            : [],
          avatars: this.avatars.map(function (a) {
            return { id: a.id, name: a.name, image: a.image, emoji: a.emoji, team: self.avatarOwner(a.id) };
          }),
          phase: this.phase,
          activeTeam: this.activeTeam,
          badges: this.teamBadges,
          category: cat
            ? {
                name: cat.name, emoji: cat.emoji, image: cat.image, question: cat.question,
                bonus: !!this.bonus && cat.id === this.bonus.id,
                round: this.playedIds.indexOf(cat.id) !== -1 ? this.playedIds.indexOf(cat.id) + 1 : this.playedIds.length + 1,
                total: this.categories.length
              }
            : null,
          slots: cat
            ? cat.answers.map(function (a, i) {
                return self.revealed[i]
                  ? { revealed: true, text: a.text, points: a.points }
                  : { revealed: false };
              })
            : [],
          pot: this.pot,
          headline: this.status.headline,
          sub: this.status.sub,
          event: this.event
        };
      },

      persisted: function () {
        return JSON.stringify({
          gameStarted: this.gameStarted,
          endedEarly: this.endedEarly,
          bonusSkipped: this.bonusSkipped,
          teams: this.teams,
          categoryId: this.categoryId,
          phase: this.phase,
          pendingStarter: this.pendingStarter,
          starter: this.starter,
          challenger: this.challenger,
          faceoffRank: this.faceoffRank,
          faceoffWinner: this.faceoffWinner,
          retry: this.retry,
          controller: this.controller,
          stealer: this.stealer,
          strikes: this.strikes,
          revealed: this.revealed,
          pot: this.pot,
          endInfo: this.endInfo,
          playedIds: this.playedIds
        });
      }
    },

    watch: {
      publicState: function () {
        this.broadcast();
      },
      persisted: function (json) {
        try { localStorage.setItem(STORAGE_KEY, json); } catch (e) { /* ignore */ }
      }
    },

    created: function () {
      this.restore();

      if (this.hasBroadcastChannel) {
        var self = this;
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = function (e) {
          var msg = e.data || {};
          if (msg.type === 'hello') {
            self.presenceAt = Date.now();
            self.broadcast();
          } else if (msg.type === 'ping') {
            self.presenceAt = Date.now();
            if (!msg.hasState) self.broadcast();
          } else if (msg.type === 'bye') {
            self.presenceAt = 0;
          }
        };
      }

      var tick = this;
      this.timer = setInterval(function () { tick.now = Date.now(); }, 1000);
      this.broadcast();
    },

    methods: {
      /* ---------- plumbing ---------- */
      broadcast: function () {
        if (!this.channel) return;
        // JSON round-trip guarantees a plain object — no Vue internals travel.
        this.channel.postMessage({
          type: 'state',
          payload: JSON.parse(JSON.stringify(this.publicState))
        });
      },

      restore: function () {
        var s = loadSaved();
        if (!s) return;
        try {
          if (s.teams && s.teams.length === 2) {
            var self = this;
            this.teams = s.teams.map(function (t, i) {
              return {
                name: String(t.name || DEFAULT_TEAMS[i]),
                score: Number(t.score) || 0,
                avatar: self.avatarExists(t.avatar) ? t.avatar : null
              };
            });
          }
          this.playedIds = (s.playedIds || []).filter(this.categoryExists);
          this.endedEarly = !!s.endedEarly;
          this.bonusSkipped = !!s.bonusSkipped;
          // Saves from before the start screen existed: treat as already started.
          this.gameStarted = s.gameStarted !== undefined
            ? !!s.gameStarted
            : !!((s.phase && s.phase !== 'idle') || this.playedIds.length);
          if (s.categoryId && this.categoryExists(s.categoryId)) {
            var cat = this.allCats.filter(function (c) { return c.id === s.categoryId; })[0];
            if (s.revealed && s.revealed.length === cat.answers.length) {
              this.categoryId = s.categoryId;
              this.phase = s.phase || 'ready';
              this.pendingStarter = s.pendingStarter;
              this.starter = s.starter;
              this.challenger = s.challenger === undefined ? null : s.challenger;
              this.faceoffRank = s.faceoffRank === undefined ? null : s.faceoffRank;
              this.faceoffWinner = s.faceoffWinner === undefined ? null : s.faceoffWinner;
              this.retry = !!s.retry;
              this.controller = s.controller;
              this.stealer = s.stealer;
              this.strikes = s.strikes || [0, 0];
              this.revealed = s.revealed;
              this.pot = s.pot || 0;
              this.endInfo = s.endInfo || null;
            }
          }
        } catch (e) { /* a bad save must never stop the game from loading */ }
      },

      categoryExists: function (id) {
        return this.allCats.some(function (c) { return c.id === id; });
      },

      fire: function (type, extra) {
        var ev = { id: newEventId(), type: type };
        for (var k in extra) ev[k] = extra[k];
        this.event = ev;
      },

      snapshot: function () {
        return JSON.stringify({
          scores: this.teams.map(function (t) { return t.score; }),
          categoryId: this.categoryId,
          phase: this.phase,
          pendingStarter: this.pendingStarter,
          starter: this.starter,
          challenger: this.challenger,
          faceoffRank: this.faceoffRank,
          faceoffWinner: this.faceoffWinner,
          retry: this.retry,
          controller: this.controller,
          stealer: this.stealer,
          strikes: this.strikes,
          revealed: this.revealed,
          pot: this.pot,
          endInfo: this.endInfo,
          playedIds: this.playedIds
        });
      },

      pushHistory: function () {
        this.history.push(this.snapshot());
        if (this.history.length > 60) this.history.shift();
      },

      undo: function () {
        if (!this.history.length) return;
        var s = JSON.parse(this.history.pop());
        for (var i = 0; i < 2; i++) this.teams[i].score = s.scores[i];
        this.categoryId = s.categoryId;
        this.phase = s.phase;
        this.pendingStarter = s.pendingStarter;
        this.starter = s.starter;
        this.challenger = s.challenger;
        this.faceoffRank = s.faceoffRank;
        this.faceoffWinner = s.faceoffWinner;
        this.retry = s.retry;
        this.controller = s.controller;
        this.stealer = s.stealer;
        this.strikes = s.strikes;
        this.revealed = s.revealed;
        this.pot = s.pot;
        this.endInfo = s.endInfo;
        this.playedIds = s.playedIds;
        this.event = null;
      },

      clearRound: function () {
        this.categoryId = null;
        this.phase = 'idle';
        this.pendingStarter = null;
        this.starter = null;
        this.challenger = null;
        this.faceoffRank = null;
        this.faceoffWinner = null;
        this.retry = false;
        this.controller = null;
        this.stealer = null;
        this.strikes = [0, 0];
        this.revealed = [];
        this.pot = 0;
        this.endInfo = null;
      },

      /* ---------- presentation window ---------- */
      openPresentation: function () {
        var w = window.open(
          'presentation.html',
          'birthday-presentation',
          'popup=yes,width=1280,height=720'
        );
        if (!w) {
          alert('Your browser blocked the popup. Allow popups for this page and click the button again.');
        }
      },

      /* ---------- round flow ---------- */
      selectCategory: function (id) {
        if (!this.gameStarted) return;
        this.endedEarly = false; // picking a category resumes play
        if (this.category && this.category.id === id && this.phase === 'ready') return;
        if (this.inRound &&
            !confirm('A round is still in progress. Abandon it (no points awarded) and open this category?')) {
          return;
        }
        this.pushHistory();
        this.clearRound();
        var cat = this.allCats.filter(function (c) { return c.id === id; })[0];
        if (!cat) return;
        this.openRound(cat, 'category');
      },

      openRound: function (cat, eventType) {
        this.categoryId = cat.id;
        this.revealed = cat.answers.map(function () { return false; });
        this.phase = 'ready';
        this.fire(eventType, {});
      },

      startBonus: function () {
        if (!this.bonus || this.inRound) return;
        this.pushHistory();
        this.clearRound();
        this.openRound(this.bonus, 'bonus');
      },

      chooseStarter: function (i) {
        if (this.phase !== 'ready') return;
        this.pendingStarter = i;
      },

      startRound: function () {
        if (this.phase !== 'ready' || this.pendingStarter === null) return;
        this.pushHistory();
        this.starter = this.pendingStarter;
        this.challenger = 1 - this.starter;
        this.faceoffRank = null;
        this.faceoffWinner = null;
        this.retry = false;
        this.controller = null;
        this.stealer = null;
        this.strikes = [0, 0];
        this.pot = 0;
        this.endInfo = null;
        this.revealed = this.answers.map(function () { return false; });
        this.phase = 'faceoff';
        this.fire('start', { team: this.starter });
      },

      /* Face-off is decided → winner chooses to play or pass. */
      winFaceoff: function (team) {
        this.faceoffWinner = team;
        if (this.revealed.every(Boolean)) {
          // The face-off itself uncovered the whole board.
          this.controller = team;
          this.endRound(team, 'cleared');
          return;
        }
        this.phase = 'decide';
      },

      /* GM decision after the face-off: the winner plays or passes. */
      decide: function (play) {
        if (this.phase !== 'decide') return;
        this.pushHistory();
        this.controller = play ? this.faceoffWinner : 1 - this.faceoffWinner;
        this.phase = 'control';
        this.fire('decision', { team: this.controller, passed: !play });
      },

      /* A face-off answer that is not on the board. */
      faceoffMiss: function () {
        if (this.phase !== 'faceoff' && this.phase !== 'faceoff2') return;
        this.pushHistory();
        if (this.phase === 'faceoff') {
          // First buzzer missed → the other team gets an answer.
          this.fire('strike', { team: this.starter, count: 1 });
          this.faceoffRank = null;
          this.phase = 'faceoff2';
        } else if (this.faceoffRank === null) {
          // Both teams missed → nobody got one on the board; buzz in again.
          this.fire('strike', { team: this.challenger, count: 1 });
          this.pendingStarter = null;
          this.starter = null;
          this.challenger = null;
          this.retry = true;
          this.phase = 'ready';
        } else {
          // Second team missed against an on-board answer → first team wins.
          this.fire('strike', { team: this.challenger, count: 1 });
          this.winFaceoff(this.starter);
        }
      },

      reveal: function (i) {
        var phase = this.phase;
        if (!this.category || this.revealed[i]) return;
        if (['faceoff', 'faceoff2', 'control', 'steal', 'ended'].indexOf(phase) === -1) return;

        this.pushHistory();
        this.$set(this.revealed, i, true);
        var pts = this.answers[i].points;

        if (phase === 'faceoff') {
          this.pot += pts;
          this.fire('reveal', { index: i });
          if (i === 0) {
            // #1 answer → automatic face-off win.
            this.winFaceoff(this.starter);
          } else {
            // On the board but not #1 → the other team tries to beat it.
            this.faceoffRank = i;
            this.phase = 'faceoff2';
          }
        } else if (phase === 'faceoff2') {
          this.pot += pts;
          this.fire('reveal', { index: i });
          // Second team wins with a higher-ranking answer (or any answer if
          // the first team missed); otherwise the first team keeps the win.
          var challengerWins = this.faceoffRank === null || i < this.faceoffRank;
          this.winFaceoff(challengerWins ? this.challenger : this.starter);
        } else if (phase === 'control') {
          this.pot += pts;
          this.fire('reveal', { index: i });
          this.checkCleared();
        } else if (phase === 'steal') {
          // Correct steal → stealing team takes the whole pot.
          if (STEAL_COUNTS) this.pot += pts;
          this.fire('reveal', { index: i });
          this.endRound(this.stealer, 'steal');
        } else {
          // Round already over: just show it to the room, no scoring.
          this.fire('reveal', { index: i });
        }
      },

      checkCleared: function () {
        if (this.revealed.length && this.revealed.every(Boolean)) {
          this.endRound(this.controller, 'cleared');
        }
      },

      addStrike: function () {
        if (this.phase !== 'control') return;
        this.pushHistory();
        var t = this.controller;
        this.$set(this.strikes, t, this.strikes[t] + 1);
        this.fire('strike', { team: t, count: this.strikes[t] });
        if (this.strikes[t] >= MAX_STRIKES) {
          // Three strikes → the other team gets one chance to steal.
          this.stealer = 1 - t;
          this.phase = 'steal';
        }
      },

      stealFailed: function () {
        if (this.phase !== 'steal') return;
        this.pushHistory();
        // Failed steal → the playing team keeps all the points.
        this.endRound(this.controller, 'steal-failed');
      },

      endRound: function (winner, reason) {
        this.teams[winner].score += this.pot;
        this.endInfo = { winner: winner, points: this.pot, reason: reason };
        this.phase = 'ended';
        if (this.playedIds.indexOf(this.categoryId) === -1) this.playedIds.push(this.categoryId);
        this.fire('roundEnd', { winner: winner, points: this.pot, reason: reason });
      },

      backToCategories: function () {
        this.pushHistory();
        this.clearRound();
        // Regular rounds done: bonus round next, then the finale.
        if (this.bonusDue) { this.openRound(this.bonus, 'bonus'); return; }
        this.fire(this.gameOver ? 'gameOver' : 'category', {});
      },

      // End the whole game now: drops any unfinished round (no points) and shows the finale.
      endGameEarly: function () {
        if (!this.gameStarted) return;
        var wasBonus = this.inBonus;
        var toBonus = this.bonusPending && !wasBonus;
        var msg = toBonus
          ? 'End the regular rounds and go to the Bonus Round?' + (this.inRound ? ' The round in progress is dropped (no points).' : '')
          : (this.inRound
              ? 'End the game now? The round in progress is dropped (no points) and the TV shows the winner.'
              : 'End the game now and show the winner on the TV?');
        if (!confirm(msg)) return;
        this.clearRound();
        this.endedEarly = true;
        if (toBonus) {
          this.openRound(this.bonus, 'bonus');
        } else {
          if (wasBonus) this.bonusSkipped = true;
          this.fire('gameOver', {});
        }
      },
      resumeGame: function () {
        this.endedEarly = false;
        this.bonusSkipped = false;
        this.fire('category', {});
      },

      abandonRound: function () {
        if (!confirm('Abandon this round? No points will be awarded.')) return;
        this.pushHistory();
        this.clearRound();
        this.fire('category', {});
      },

      /* ---------- scores ---------- */
      adjustScore: function (i, sign) {
        var amount = Number(this.adjust[i]) || 0;
        if (!amount) return;
        this.pushHistory();
        this.teams[i].score += sign * amount;
      },

      resetScores: function () {
        if (!confirm('Reset both team scores to 0?')) return;
        this.pushHistory();
        this.teams.forEach(function (t) { t.score = 0; });
      },

      resetEverything: function () {
        if (!confirm('Start a brand-new game? Scores, round progress and "played" markers will be cleared.')) return;
        this.clearRound();
        this.teams.forEach(function (t) { t.score = 0; });
        this.playedIds = [];
        this.history = [];
        this.endedEarly = false;
        this.bonusSkipped = false;
        this.gameStarted = false; // back to the starting screen
        this.fire('category', {});
      },

      /* ---------- helpers for the template ---------- */
      /* ---------- start screen ---------- */
      startGame: function () {
        if (this.gameStarted) return;
        this.gameStarted = true;
        this.fire('gameStart', {});
      },

      backToLobby: function () {
        if (this.category) return; // only from the category menu
        this.gameStarted = false;
        this.fire('lobby', {});
      },

      avatarOwner: function (id) {
        for (var i = 0; i < this.teams.length; i++) {
          if (this.teams[i].avatar === id) return i;
        }
        return null;
      },

      avatarById: function (id) {
        return this.avatars.filter(function (a) { return a.id === id; })[0] || null;
      },

      avatarExists: function (id) {
        return !!this.avatarById(id);
      },

      /* What the TV receives: just the picture + emoji fallback (nothing secret). */
      avatarPublic: function (id) {
        var a = this.avatarById(id);
        return a ? { image: a.image, emoji: a.emoji } : null;
      },

      // Each avatar can only belong to one team at a time.
      avatarTaken: function (team, id) {
        return this.teams[1 - team].avatar === id;
      },

      chooseAvatar: function (team, id) {
        if (this.avatarTaken(team, id)) return;
        // Clicking the selected avatar again clears it.
        this.teams[team].avatar = this.teams[team].avatar === id ? null : id;
      },

      avatarFailed: function (id) {
        this.$set(this.brokenAvatars, id, true);
      },

      imgFailed: function (id) {
        this.$set(this.brokenImages, id, true);
      },

      hasImage: function (c) {
        return !!c.image && !this.brokenImages[c.id];
      },

      isPlayed: function (id) {
        return this.playedIds.indexOf(id) !== -1;
      },

      rowAction: function (i) {
        if (this.revealed[i]) return { label: 'Shown', enabled: false, cls: 'is-done' };
        switch (this.phase) {
          case 'faceoff':
            return i === 0
              ? { label: '✔ #1 — wins!', enabled: true, cls: 'is-go' }
              : { label: 'On the board', enabled: true, cls: 'is-go' };
          case 'faceoff2':
            return { label: 'On the board', enabled: true, cls: 'is-go' };
          case 'decide':
            return { label: '—', enabled: false, cls: '' };
          case 'control':
            return { label: 'Reveal ✔', enabled: true, cls: 'is-go' };
          case 'steal':
            return { label: '🏴‍☠️ Steal!', enabled: true, cls: 'is-steal' };
          case 'ended':
            return { label: 'Show (no points)', enabled: true, cls: 'is-soft' };
          default:
            return { label: '—', enabled: false, cls: '' };
        }
      }
    },

    beforeDestroy: function () {
      clearInterval(this.timer);
      if (this.channel) this.channel.close();
    }
  });
})();