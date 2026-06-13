/* fjord · TypeScript lessons — interactivity + tiny TS highlighter */
(function () {
  "use strict";

  /* ── sidebar collapse (persisted) ───────────────────────── */
  var KEY = "fjord-ts-nav-collapsed";
  try {
    if (localStorage.getItem(KEY) === "1") document.body.classList.add("nav-collapsed");
  } catch (e) {}

  function toggleNav() {
    document.body.classList.toggle("nav-collapsed");
    try {
      localStorage.setItem(KEY, document.body.classList.contains("nav-collapsed") ? "1" : "0");
    } catch (e) {}
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest("[data-toggle-nav]");
    if (t) { e.preventDefault(); toggleNav(); }
  });

  /* ── syntax highlighter ─────────────────────────────────── */
  var KEYWORDS = new Set([
    "abstract","any","as","asserts","async","await","boolean","break","case","catch",
    "class","const","continue","declare","default","delete","do","else","enum","export",
    "extends","false","finally","for","from","function","get","if","implements","import",
    "in","infer","instanceof","interface","is","keyof","let","namespace","never","new",
    "null","number","object","of","private","protected","public","readonly","return",
    "satisfies","set","static","string","super","switch","symbol","this","throw","true",
    "try","type","typeof","undefined","unknown","void","while","yield",
  ]);

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Ordered token patterns. Sticky regexes, matched at the cursor position.
  var RULES = [
    ["comment", /\/\/[^\n]*|\/\*[\s\S]*?\*\//y],
    ["string", /`(?:\\[\s\S]|\$\{[^}]*\}|[^`\\])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y],
    ["number", /\b0[xX][0-9a-fA-F]+\b|\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y],
    ["ident", /[A-Za-z_$][\w$]*/y],
    ["ws", /\s+/y],
    ["punct", /[^A-Za-z0-9_$\s]+/y],
  ];

  function highlight(code) {
    var out = "";
    var i = 0;
    var n = code.length;
    while (i < n) {
      var matched = false;
      for (var r = 0; r < RULES.length; r++) {
        var kind = RULES[r][0];
        var re = RULES[r][1];
        re.lastIndex = i;
        var m = re.exec(code);
        if (m && m.index === i) {
          var text = m[0];
          if (kind === "ws") {
            out += esc(text);
          } else if (kind === "ident") {
            if (KEYWORDS.has(text)) {
              out += '<span class="tok-keyword">' + esc(text) + "</span>";
            } else if (/^[A-Z]/.test(text)) {
              out += '<span class="tok-type">' + esc(text) + "</span>";
            } else {
              // function call if followed by "(" or "<"
              var after = code[i + text.length];
              if (after === "(" || after === "<") {
                out += '<span class="tok-fn">' + esc(text) + "</span>";
              } else {
                out += esc(text);
              }
            }
          } else {
            out += '<span class="tok-' + kind + '">' + esc(text) + "</span>";
          }
          i += text.length;
          matched = true;
          break;
        }
      }
      if (!matched) { out += esc(code[i]); i++; }
    }
    return out;
  }

  document.querySelectorAll("pre > code").forEach(function (el) {
    // Use textContent so author-written code is treated literally.
    el.innerHTML = highlight(el.textContent);
  });

  /* ── scroll-spy for the in-lesson sub-ToC ───────────────── */
  var subLinks = Array.prototype.slice.call(document.querySelectorAll(".subtoc a"));
  if (subLinks.length) {
    var targets = subLinks
      .map(function (a) {
        var id = a.getAttribute("href").split("#")[1];
        return id ? document.getElementById(id) : null;
      })
      .filter(Boolean);

    var spy = function () {
      var pos = window.scrollY + 120;
      var current = targets[0];
      for (var k = 0; k < targets.length; k++) {
        if (targets[k].offsetTop <= pos) current = targets[k];
      }
      subLinks.forEach(function (a) {
        var id = a.getAttribute("href").split("#")[1];
        a.classList.toggle("active", current && id === current.id);
      });
    };
    window.addEventListener("scroll", spy, { passive: true });
    spy();
  }
})();
