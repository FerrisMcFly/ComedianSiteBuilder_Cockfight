(() => {
  "use strict";
  const CFG = window.COMICTABLE_CONFIG || {};
  const root = document.getElementById("root");
  const $ = (id) => document.getElementById(id);

  // Leaving a piece out (null, undefined or false) never prints "null" on the page.
  for (const m of ["replaceChildren", "append", "prepend"]) {
    const orig = Element.prototype[m];
    Element.prototype[m] = function (...kids) { return orig.apply(this, kids.filter((k) => k !== null && k !== undefined && k !== false)); };
  }
