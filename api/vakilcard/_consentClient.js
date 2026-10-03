// The consent card for the NFC activation page (api/vakilcard/nfc.js), written as ONE plain
// browser function so it can be unit-tested in Node and then embedded into the page as text
// (Function.prototype.toString). The page is server-rendered HTML with vanilla JS -- no React,
// no build step -- so this is the same card as Apps/Account/src/components/consent/ConsentCard.tsx,
// re-written without a framework. Keep the wording and the six rules in step with that card
// (Apps/Account/src/components/consent/README.md):
//
//   1. No scroll-to-end and no tick box. "Read" is always available, never required.
//   2. Not dismissible: no close button, no Escape, no click-outside. The only other exits are
//      the quiet "I don't accept" link and, for an OPTIONAL offer only (CourtQue), "Not now".
//   3. Acceptance is ONE call carrying document ids and the ids the browser opened. Version,
//      hash, IP and user agent are recorded server-side only (api/vakilcard/_legal.js).
//   4. After success the page carries on to the next step; the card never decides by itself.
//   5. Errors show the real reason (describeError), never a generic "try again".
//   6. If the account is awaiting approval the card is NOT shown: nothing is recorded and the
//      person is told so plainly.
//
// RULES FOR THIS FUNCTION: it is stringified and sent to the browser, so it must be completely
// self-contained (no outside variables), ES5 only (no arrow functions, no template literals,
// no async/await) and must never contain the text "</script". It talks to the page through
// the root element #consent-root and the options passed to start().

function consentClient(cfg) {
  var root = document.getElementById("consent-root");
  var ACCOUNT = String((cfg && cfg.accountOrigin) || "").replace(/\/+$/, "");

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function clear() {
    while (root.firstChild) root.removeChild(root.firstChild);
  }
  function btn(label, cls, onClick) {
    var b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  // Same wording as Account's describeAcceptError.ts. The code stays in brackets so a
  // screenshot is enough for support.
  function describeError(status, body) {
    var code = body && body.error ? String(body.error) : "";
    var tag = code ? " (" + code + ")" : status ? " (HTTP " + status + ")" : "";
    var detail = body && body.detail ? String(body.detail) : "";
    switch (code) {
      case "not_signed_in":
        return "You are signed out, so nothing was recorded. Sign in again and retry." + tag;
      case "account_not_found":
        return body && body.accountStatus && body.accountStatus !== "active"
          ? "You’re on the Vakilpedia waitlist, awaiting approval, so agreements cannot be accepted yet. Nothing was recorded." + tag
          : "We could not find your account, so nothing was recorded." + tag;
      case "document_not_current":
        return "One of these agreements was updated while this screen was open. Nothing was recorded. Reload the page to see the current version." + tag;
      case "unknown_document_id":
        return "One of these agreements no longer exists. Nothing was recorded. Reload the page." + tag;
      case "document_has_no_fingerprint":
        return "One of these agreements is not ready to be accepted yet. Nothing was recorded." + tag;
      case "no_documents":
      case "documentIds_required":
      case "productIds_required":
        return "Nothing was selected to accept." + tag;
      case "product_not_found":
      case "unknown_product":
        return "This app is not recognised. Nothing was recorded." + tag;
      case "product_has_no_published_eula":
        return "This app has no published agreement yet, so it cannot be activated. Nothing was recorded." + tag;
      case "product_eula_not_accepted":
        return "An app cannot be activated before its agreement is accepted. Nothing was recorded." + tag;
      case "already_accepted_or_unavailable":
        return "One of the selected agreements was already accepted or is no longer available. Nothing was recorded. Reload the page." + tag;
      case "accept_failed":
        return "The database refused the request" + (detail ? ": " + detail : "") + ". Nothing was recorded." + tag;
      case "unavailable":
        return "The agreements service could not be reached" + (detail ? " (" + detail + ")" : "") + ". Nothing was recorded.";
      default:
        return code
          ? 'The server refused this with "' + code + '". Nothing was recorded.' + tag
          : "The server answered with an unexpected response (HTTP " + status + "). Nothing was recorded.";
    }
  }

  function call(token, payload, cb) {
    fetch("/api/vakilcard/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify(payload),
    })
      .then(function (r) {
        return r.json().then(
          function (d) { return { status: r.status, body: d }; },
          function () { return { status: r.status, body: null }; }
        );
      })
      .then(function (res) { cb(null, res.status, res.body); })
      .catch(function (e) { cb(String((e && e.message) || "network error")); });
  }

  function titleOf(d) {
    if (d.title) return d.title;
    if (d.kind === "terms") return "Vakilpedia Terms of Service";
    if (d.kind === "privacy") return "Vakilpedia Privacy Notice";
    if (d.kind === "eula") return "App agreement";
    return "Legal document";
  }
  function slugOf(url) {
    var m = /\/legal\/documents\/([^\/?#]+)/.exec(url || "");
    return m ? m[1] : null;
  }

  // Presentation only (never changes the stored text): re-flows hard-wrapped paragraphs so they
  // fit a phone, keeps short-line blocks (addresses) as written, picks out headings and lists.
  // A trimmed-down copy of Account's LegalDocumentBody.tsx.
  function renderText(container, raw) {
    var chunks = String(raw || "").replace(/\r\n?/g, "\n").trim().split(/\n{2,}/);
    var LIST = /^\s*(\(?(?:[a-z]|[ivxl]+|\d{1,2})\)|[-–•*])\s+/i;
    var ORDERED = /^\s*\d{1,2}\.\s+\S/;
    chunks.forEach(function (chunk) {
      var lines = chunk
        .split("\n")
        .map(function (l) { return l.trim(); })
        .filter(function (l) { return l.length > 0; });
      if (!lines.length) return;
      if (lines.length === 1) {
        var line = lines[0];
        var letters = line.replace(/[^A-Za-z]/g, "");
        var caps = letters.length >= 3 && letters === letters.toUpperCase();
        if (line.length <= 90 && !/[.;:,]$/.test(line) && /^\d{1,2}\.\d{1,2}\.?\s+\S/.test(line)) {
          container.appendChild(el("h5", "cs-h2", line));
          return;
        }
        if ((line.length <= 90 && !/[.;:,]$/.test(line) && ORDERED.test(line)) || (caps && line.length <= 90)) {
          container.appendChild(el("h4", "cs-h1", line));
          return;
        }
      }
      if (lines.length > 1 && lines.every(function (l) { return LIST.test(l); })) {
        lines.forEach(function (l) { container.appendChild(el("div", "cs-li", l)); });
        return;
      }
      if (lines.length > 1 && lines.every(function (l) { return ORDERED.test(l); })) {
        lines.forEach(function (l) { container.appendChild(el("div", "cs-li", l)); });
        return;
      }
      if (lines.length > 1) {
        var widths = lines.map(function (l) { return l.length; }).sort(function (a, b) { return a - b; });
        if (widths[Math.floor(widths.length / 2)] < 55) {
          container.appendChild(el("div", "cs-lines", lines.join("\n")));
          return;
        }
      }
      container.appendChild(el("p", "cs-p", lines.join(" ")));
    });
  }

  function start(opts) {
    var state = { opts: opts, docs: [], viewed: [], saving: false };

    // What the page's onDone() gets, to show progress or a failure in the same place.
    var helpers = {
      busy: function (text) {
        clear();
        root.appendChild(el("div", "cs-status", text));
      },
      fail: function (message, retry) {
        clear();
        var box = el("div", "cs-error", message);
        box.setAttribute("role", "alert");
        root.appendChild(box);
        if (retry) root.appendChild(btn("Try again", "cs-accept", retry));
        if (opts.onBack) root.appendChild(btn("Back", "cs-ghost", opts.onBack));
      },
    };

    function stop(message) {
      clear();
      root.appendChild(el("div", "cs-h", "Awaiting approval"));
      root.appendChild(el("div", "cs-intro", message));
    }

    // account_not_found with a real status = awaiting approval: say so, record nothing, stop.
    function awaiting(status, body) {
      return (
        body &&
        body.error === "account_not_found" &&
        body.accountStatus &&
        body.accountStatus !== "active"
      );
    }
    var AWAITING_TEXT =
      "You’re on the Vakilpedia waitlist, awaiting approval — nothing was recorded. We’ll let you know on WhatsApp as soon as you’re approved.";

    function renderList() {
      clear();
      var docs = state.docs;
      root.appendChild(el("div", "cs-h", opts.heading || "Before you continue"));
      var intro = el("div", "cs-intro");
      intro.appendChild(document.createTextNode("By tapping "));
      intro.appendChild(el("b", null, "Accept all & continue"));
      intro.appendChild(
        document.createTextNode(
          " you agree to the " + (docs.length === 1 ? "document" : "documents") + " below. Tap Read to open any of them in full first."
        )
      );
      root.appendChild(intro);

      var ul = el("ul", "cs-list");
      docs.forEach(function (d) {
        var li = el("li", "cs-row");
        var t = el("div", "cs-title", titleOf(d));
        if (d.version) t.appendChild(el("span", "cs-ver", "Version " + d.version));
        li.appendChild(t);
        li.appendChild(btn("Read ›", "cs-read", function () { renderReader(d); }));
        ul.appendChild(li);
      });
      root.appendChild(ul);

      var errBox = el("div", "cs-error");
      errBox.setAttribute("role", "alert");
      errBox.style.display = "none";
      root.appendChild(errBox);

      var accept = btn("Accept all & continue", "cs-accept", function () {
        if (state.saving) return;
        state.saving = true;
        accept.disabled = true;
        accept.textContent = "Recording…";
        errBox.style.display = "none";
        call(
          opts.token,
          {
            action: "legal_accept",
            product: opts.product,
            documentIds: docs.map(function (d) { return d.id; }),
            viewedDocumentIds: state.viewed,
          },
          function (err, status, body) {
            state.saving = false;
            if (err) {
              errBox.textContent = "We could not reach the server (" + err + "). Nothing was recorded.";
            } else if (status === 200 && body && body.ok === true) {
              opts.onDone(helpers);
              return;
            } else if (awaiting(status, body)) {
              stop(AWAITING_TEXT);
              return;
            } else {
              errBox.textContent = describeError(status, body);
            }
            errBox.style.display = "block";
            accept.disabled = false;
            accept.textContent = "Accept all & continue";
          }
        );
      });
      root.appendChild(accept);

      if (opts.optional && opts.onBack) {
        // An OPTIONAL offer (CourtQue): declining it must not mean deleting the account.
        root.appendChild(btn("Not now", "cs-ghost", opts.onBack));
      } else {
        var decl = el("div", "cs-decline");
        decl.appendChild(document.createTextNode("Don’t agree? "));
        var a = el("a", null, "I don’t accept — delete my account");
        a.href = ACCOUNT + "/decline";
        decl.appendChild(a);
        decl.appendChild(document.createTextNode(". You can’t use the apps without accepting."));
        root.appendChild(decl);
      }
    }

    function renderReader(d) {
      clear();
      var head = el("div", "cs-readhead");
      head.appendChild(btn("‹ Back", "cs-read", renderList));
      var titleBox = el("div", "cs-readtitle", titleOf(d));
      var meta = el("span", "cs-ver", "");
      titleBox.appendChild(meta);
      head.appendChild(titleBox);
      root.appendChild(head);
      var body = el("div", "cs-body");
      body.appendChild(el("div", "cs-status", "Loading the agreement…"));
      root.appendChild(body);

      var slug = slugOf(d.url);
      if (!slug) {
        body.textContent = "This agreement has no readable copy on file. Please contact support.";
        body.className = "cs-body cs-bad";
        return;
      }
      fetch(ACCOUNT + "/api/legal/" + slug, { credentials: "omit" })
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (doc) {
          // The reader may have been left (Back) before the text arrived.
          if (!body.parentNode) return;
          body.textContent = "";
          if (doc.title) titleBox.firstChild.nodeValue = doc.title;
          var bits = [];
          if (doc.version) bits.push("Version " + doc.version);
          if (doc.effectiveDate) {
            var when = new Date(doc.effectiveDate);
            if (!isNaN(when.getTime())) {
              bits.push(
                "Effective " + when.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
              );
            }
          }
          meta.textContent = bits.join(" · ");
          renderText(body, doc.text);
          // Counts as "opened" only once the text was really shown (a hint, never proof).
          if (state.viewed.indexOf(d.id) === -1) state.viewed.push(d.id);
        })
        .catch(function (e) {
          if (!body.parentNode) return;
          body.className = "cs-body cs-bad";
          body.textContent =
            "We could not load this agreement (" + String((e && e.message) || "network error") + "). Go back and try Read again.";
        });
    }

    function check() {
      helpers.busy("Checking what you need to accept…");
      call(opts.token, { action: "legal_outstanding", product: opts.product }, function (err, status, body) {
        if (err) {
          helpers.fail("We could not reach the server (" + err + "). Nothing was recorded.", check);
          return;
        }
        if (status === 200 && body && body.ok === true) {
          state.docs = body.outstanding || [];
          if (!state.docs.length) {
            opts.onDone(helpers); // nothing is owed: carry on
            return;
          }
          renderList();
          return;
        }
        if (awaiting(status, body)) {
          stop(AWAITING_TEXT);
          return;
        }
        helpers.fail(describeError(status, body), check);
      });
    }

    if (opts.show) opts.show();
    check();
  }

  return { start: start, describeError: describeError };
}

function consentClientSource(cfg) {
  // "<" is escaped so the config can never close the surrounding <script> tag.
  var safe = JSON.stringify(cfg || {}).replace(/</g, "\\u003c");
  return "(" + consentClient.toString() + ")(" + safe + ")";
}

module.exports = { consentClient, consentClientSource };
