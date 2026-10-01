// VakilCard side of the ONE Vakilpedia consent system (founder decision, 1 Oct 2026).
//
// Two authenticated actions, wired up in auth.js (no new serverless function -- this
// deployment sits at Vercel's 12-function ceiling, and files starting with "_" are
// helpers, not functions):
//
//   legal_outstanding  -> which agreements this account still owes for a product
//   legal_accept       -> record acceptance of those agreements, ONE all-or-nothing call
//
// Both call the live SupraCore RPCs (supracore_legal_outstanding / supracore_legal_accept).
// Rules, the same as the Account's /api/legal/accept route:
//   * The account always comes from the signed-in token, never from the request body.
//   * Only document ids travel. Version, fingerprint, IP and user agent are fixed
//     server-side (IP and user agent are read from the request here, not from the browser).
//   * The product comes from a FIXED allow-list, never free text.
//   * Apps are switched on (p_activate_product_ids) only when the documents being accepted
//     include that product's own agreement.
//   * The old eula_*_accepted_at columns are written ONLY as a result of a real accept that
//     succeeded and included that product's agreement. A flag sent by the browser can never
//     cause a write -- this file does not read one.
//
// `db` is injected so tests never touch the network.

// product id -> the legacy "accepted the app agreement" column on vakilpedia_accounts.
const PRODUCTS = Object.freeze({
  vakilcard: { eulaColumn: "eula_vakilcard_accepted_at" },
  courtque: { eulaColumn: "eula_courtque_accepted_at" },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_DOCUMENT_IDS = 20;

/** Allow-listed product id, or null. A missing value means VakilCard. */
function resolveProduct(raw) {
  if (raw === undefined || raw === null || raw === "") return "vakilcard";
  if (typeof raw !== "string") return null;
  return Object.prototype.hasOwnProperty.call(PRODUCTS, raw) ? raw : null;
}

function isUuidArray(v) {
  return (
    Array.isArray(v) &&
    v.length > 0 &&
    v.length <= MAX_DOCUMENT_IDS &&
    v.every((x) => typeof x === "string" && UUID_RE.test(x))
  );
}

// Same status mapping as the Account's accept route, so the page can treat both alike.
function statusForRpcError(error) {
  if (error === "document_not_current") return 409;
  if (error === "account_not_found") return 403;
  if (error === "accept_failed") return 500;
  return 400;
}

async function callRpc(db, name, args) {
  const r = await db("rpc/" + name, { method: "POST", body: args });
  return Array.isArray(r) ? r[0] : r;
}

function unavailable(e) {
  const detail = String((e && (e.message || e)) || "no_payload").slice(0, 200);
  return { status: 503, body: { ok: false, error: "unavailable", detail } };
}

/** What this account still owes for `product`. Returns { status, body }. */
async function outstanding({ db, accountId, product }) {
  if (!accountId) return { status: 401, body: { ok: false, error: "not_signed_in" } };
  const productId = resolveProduct(product);
  if (!productId) return { status: 400, body: { ok: false, error: "unknown_product" } };

  let data;
  try {
    data = await callRpc(db, "supracore_legal_outstanding", {
      p_account_id: accountId,
      p_product_id: productId,
    });
  } catch (e) {
    return unavailable(e);
  }
  if (!data || typeof data !== "object") return unavailable(null);
  if (data.ok !== true) return { status: statusForRpcError(data.error), body: data };
  return {
    status: 200,
    body: {
      ok: true,
      product: productId,
      outstanding: Array.isArray(data.outstanding) ? data.outstanding : [],
      satisfied: data.satisfied === true,
    },
  };
}

/**
 * Legacy column write: best-effort, first acceptance only (the is.null filter), and only ever
 * called after a real accept succeeded. A failure here must never undo or hide the real consent.
 */
async function stampEulaAcceptance(db, accountId, column) {
  if (!accountId || !column) return;
  try {
    await db("vakilpedia_accounts?id=eq." + accountId + "&" + column + "=is.null", {
      method: "PATCH",
      body: { [column]: new Date().toISOString() },
      prefer: "return=minimal",
    });
  } catch {
    /* non-fatal: the real record lives in SupraCore */
  }
}

/**
 * Record acceptance. `body` is the parsed request body: { documentIds, viewedDocumentIds?, product }.
 * Returns { status, body }; on failure `body` is the RPC's own answer (error + detail +
 * accountStatus ...) so the page can say what really went wrong.
 */
async function accept({ db, accountId, body, ip, userAgent }) {
  if (!accountId) return { status: 401, body: { ok: false, error: "not_signed_in" } };
  const input = body && typeof body === "object" ? body : {};

  const productId = resolveProduct(input.product);
  if (!productId) return { status: 400, body: { ok: false, error: "unknown_product" } };

  const { documentIds, viewedDocumentIds } = input;
  if (!isUuidArray(documentIds)) {
    return { status: 400, body: { ok: false, error: "documentIds_required" } };
  }
  if (viewedDocumentIds !== undefined && viewedDocumentIds !== null) {
    if (!Array.isArray(viewedDocumentIds) || viewedDocumentIds.length > MAX_DOCUMENT_IDS) {
      return { status: 400, body: { ok: false, error: "viewedDocumentIds_invalid" } };
    }
    if (viewedDocumentIds.length && !isUuidArray(viewedDocumentIds)) {
      return { status: 400, body: { ok: false, error: "viewedDocumentIds_invalid" } };
    }
  }

  // Which document is this product's own agreement? Taken from the database's list of what is
  // owed, never from the browser, so a client cannot claim "this one is the EULA".
  const owed = await outstanding({ db, accountId, product: productId });
  if (owed.status !== 200) return owed; // includes account_not_found + accountStatus
  const productEula = owed.body.outstanding.find(
    (d) => d && d.scope === "product" && d.productId === productId && d.kind === "eula"
  );
  const includesProductEula = Boolean(productEula && documentIds.includes(productEula.id));

  let data;
  try {
    data = await callRpc(db, "supracore_legal_accept", {
      p_account_id: accountId,
      p_document_ids: documentIds,
      p_ip: ip || null,
      p_user_agent: userAgent ? String(userAgent).slice(0, 300) : null,
      p_viewed_document_ids: viewedDocumentIds && viewedDocumentIds.length ? viewedDocumentIds : null,
      p_activate_product_ids: includesProductEula ? [productId] : null,
    });
  } catch (e) {
    return unavailable(e);
  }
  if (!data || typeof data !== "object") return unavailable(null);
  if (data.ok !== true) return { status: statusForRpcError(data.error), body: data };

  if (includesProductEula) {
    await stampEulaAcceptance(db, accountId, PRODUCTS[productId].eulaColumn);
  }
  return {
    status: 200,
    body: {
      ok: true,
      product: productId,
      consentRecordIds: data.consentRecordIds || [],
      alreadyAccepted: data.alreadyAccepted || [],
      activated: data.activated || [],
    },
  };
}

module.exports = { PRODUCTS, resolveProduct, outstanding, accept, stampEulaAcceptance };
