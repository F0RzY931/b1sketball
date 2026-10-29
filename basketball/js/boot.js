/* FULL COURT — boot */
(function () {
  "use strict";

  function showFatal(message) {
    try {
      const loading = document.getElementById("loading");
      const fill = document.getElementById("loading-fill");
      const note = document.getElementById("loading-note");
      if (loading) loading.classList.remove("is-hidden");
      if (fill) {
        fill.style.width = "100%";
        fill.style.background = "#ff3b4f";
      }
      if (note) {
        note.textContent = "ОШИБКА · " + message;
        note.style.color = "#ff8a96";
      }
    } catch (e) {
      /* nothing else we can do */
    }
    console.error("[FULL COURT]", message);
  }

  function boot() {
    try {
      if (!window.THREE) throw new Error("Three.js не загрузился");
      const BB = window.BB;
      if (!BB || !BB.Game || !BB.Player || !BB.Ball || !BB.Arena) {
        throw new Error("игровые модули не загрузились");
      }
      const game = new BB.Game();
      BB.game = game;
      window.game = game;
      console.info("[FULL COURT] ready · r149 · 5x5");
    } catch (err) {
      showFatal((err && err.message) || String(err));
      if (err && err.stack) console.error(err.stack);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
