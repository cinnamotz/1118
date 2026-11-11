/* ==========================================================================
   presentation.js — audience screen (presentation.html)
   Receives "public state" from the Game Master window over BroadcastChannel
   and renders it. This page never loads questions.js, so unrevealed answers
   do not exist anywhere in this window — not in the DOM, not in memory.
   ========================================================================== */
(function () {
  'use strict';

  var CHANNEL_NAME = 'birthday-game';
  var CONFETTI_COLORS = ['#ff9ec4', '#8ec5ff', '#ffe08a', '#c9a8ff', '#a8f0d1', '#ffffff'];

  new Vue({
    el: '#app',

    data: function () {
      return {
        state: null, // last public state from the Game Master
        flash: null, // { team, count } while a big strike X is on screen
        badAvatars: {}, // avatar image paths that failed to load (fall back to emoji)
        badImg: null, // category image path that failed to load (falls back to emoji)
        unsupported: typeof BroadcastChannel === 'undefined'
      };
    },

    computed: {
      slotCount: function () {
        return this.state ? this.state.slots.length : 0;
      },
      // Team in the lead (0 or 1), or null for a tie.
      winnerIndex: function () {
        if (!this.state) return null;
        var t = this.state.teams;
        return t[0].score === t[1].score ? null : (t[0].score > t[1].score ? 0 : 1);
      },
      winnerAvatar: function () {
        return this.winnerIndex === null ? null : this.state.teams[this.winnerIndex].avatar;
      },
      showBoard: function () {
        return !!(this.state && this.state.category);
      }
    },

    created: function () {
      var self = this;
      this.initialised = false;
      this.lastEventId = null;
      this.flashTimer = null;

      if (this.unsupported) return;

      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = function (e) {
        var msg = e.data || {};
        if (msg.type === 'state') self.applyState(msg.payload);
      };

      // Ask the dashboard for the current state, then keep saying hi so it
      // knows this window is alive (and can resend if it was reloaded).
      this.channel.postMessage({ type: 'hello' });
      this.pingTimer = setInterval(function () {
        self.channel.postMessage({ type: 'ping', hasState: !!self.state });
      }, 3000);

      window.addEventListener('beforeunload', function () {
        self.channel.postMessage({ type: 'bye' });
      });
    },

    mounted: function () {
      var self = this;
      // Handy shortcut: press F to toggle fullscreen (F11 works too).
      window.addEventListener('keydown', function (e) {
        if (e.key === 'f' || e.key === 'F') self.toggleFullscreen();
      });
    },

    methods: {
      applyState: function (s) {
        this.state = s;
        if (s.title) document.title = s.title;

        var ev = s.event;
        if (!this.initialised) {
          // First state after (re)load: remember the event, don't replay it.
          this.initialised = true;
          this.lastEventId = ev ? ev.id : null;
          return;
        }
        if (ev && ev.id !== this.lastEventId) {
          this.lastEventId = ev.id;
          this.playEvent(ev);
        }
      },

      playEvent: function (ev) {
        if (ev.type === 'strike') {
          var self = this;
          this.flash = { team: ev.team, count: ev.count };
          clearTimeout(this.flashTimer);
          this.flashTimer = setTimeout(function () { self.flash = null; }, 1500);
        } else if (ev.type === 'roundEnd' && ev.points > 0) {
          this.confetti();
        } else if (ev.type === 'gameStart') {
          this.confetti();
        } else if (ev.type === 'gameOver') {
          // A few bursts for the finale.
          var me = this;
          this.confetti();
          setTimeout(function () { me.confetti(); }, 1400);
          setTimeout(function () { me.confetti(); }, 2800);
        }
      },

      confetti: function () {
        var box = document.getElementById('confetti');
        if (!box) return;
        for (var i = 0; i < 80; i++) {
          var bit = document.createElement('i');
          bit.style.left = Math.random() * 100 + 'vw';
          bit.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
          bit.style.setProperty('--drift', (Math.random() * 20 - 10) + 'vw');
          bit.style.setProperty('--spin', (Math.random() * 900 - 450) + 'deg');
          bit.style.animationDuration = 2.6 + Math.random() * 2.4 + 's';
          bit.style.animationDelay = Math.random() * 0.7 + 's';
          box.appendChild(bit);
          (function (el) { setTimeout(function () { el.remove(); }, 6500); })(bit);
        }
      },

      // Image helpers shared by the avatar grid and the category menu.
      imgOk: function (src) {
        return !!src && !this.badAvatars[src];
      },

      markBroken: function (src) {
        this.$set(this.badAvatars, src, true);
      },

      // How many columns a grid of n cards should use (8 -> 4 x 2).
      cols: function (n) {
        return n <= 4 ? Math.max(n, 1) : n <= 8 ? 4 : n <= 10 ? 5 : 6;
      },

      toggleFullscreen: function () {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen();
        }
      }
    },

    beforeDestroy: function () {
      clearInterval(this.pingTimer);
      clearTimeout(this.flashTimer);
      if (this.channel) this.channel.close();
    }
  });
})();