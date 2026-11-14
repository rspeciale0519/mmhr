/* Shared gallery helpers. No build step. */
(function () {
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  var toggle = qs("[data-nav-toggle]");
  var panel = qs("[data-nav-panel]");
  if (toggle && panel) {
    toggle.addEventListener("click", function () {
      var open = panel.getAttribute("data-open") === "true";
      panel.setAttribute("data-open", open ? "false" : "true");
      toggle.setAttribute("aria-expanded", open ? "false" : "true");
    });
  }

  var MAX = 5;
  var selected = new Set();
  var countEl = qs("[data-pick-count]");
  var barEl = qs("[data-pick-bar]");

  function renderPicks() {
    qsa("[data-vendor]").forEach(function (btn) {
      var id = btn.getAttribute("data-vendor");
      var on = selected.has(id);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      qsa('[data-col="' + id + '"]').forEach(function (col) {
        col.setAttribute("data-picked", on ? "true" : "false");
      });
    });
    if (countEl) countEl.textContent = String(selected.size);
    if (barEl) barEl.setAttribute("data-full", selected.size >= MAX ? "true" : "false");
  }

  qsa("[data-vendor]").forEach(function (btn) {
    if (btn.getAttribute("data-start") === "true") {
      selected.add(btn.getAttribute("data-vendor"));
    }
    btn.addEventListener("click", function () {
      var id = btn.getAttribute("data-vendor");
      if (selected.has(id)) selected.delete(id);
      else if (selected.size < MAX) selected.add(id);
      renderPicks();
    });
  });
  renderPicks();

  qsa("[data-needs-form]").forEach(function (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var status = qs("[data-save-status]", form);
      if (status) {
        status.hidden = false;
        status.textContent = "Draft saved in this browser preview. Sample only.";
      }
    });
  });
})();
