const VEHICLE_KEYS = ["car", "cargoVan", "tempConVan", "truck"];
const PRICE_FIELDS = [
  "base",
  "mileage",
  "international",
  "amPm",
  "weekend",
  "holiday",
  "additionalStop",
  "waitMinute",
  "palletJack",
  "secondManMile",
  "pickHold",
  "hazmat"
];
const MAX_RATE = 100000;
const MAX_PERCENT = 1000;

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin"
    }
  });
}

async function sha256Bytes(value) {
  const encoder = new TextEncoder();
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

async function securePinMatch(providedPin, expectedPin) {
  const providedHash = await sha256Bytes(providedPin);
  const expectedHash = await sha256Bytes(expectedPin);

  let difference = providedHash.length ^ expectedHash.length;
  const length = Math.max(providedHash.length, expectedHash.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (providedHash[index] || 0) ^ (expectedHash[index] || 0);
  }
  return difference === 0;
}

async function clientRateLimitKey(request) {
  const address = request.headers.get("CF-Connecting-IP") || "unknown";
  const digest = await sha256Bytes(address);
  return Array.from(digest).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function isUpdateBlocked(database, clientKey) {
  const row = await database.prepare(
    "SELECT blocked_until FROM admin_attempts WHERE client_key = ?"
  ).bind(clientKey).first();
  return Boolean(row && Number(row.blocked_until) > Date.now());
}

async function recordFailedPin(database, clientKey) {
  const now = Date.now();
  const windowLength = 10 * 60 * 1000;
  const blockLength = 15 * 60 * 1000;
  const row = await database.prepare(
    "SELECT failures, window_start FROM admin_attempts WHERE client_key = ?"
  ).bind(clientKey).first();

  const withinWindow = row && now - Number(row.window_start) < windowLength;
  const failures = withinWindow ? Number(row.failures) + 1 : 1;
  const windowStart = withinWindow ? Number(row.window_start) : now;
  const blockedUntil = failures >= 5 ? now + blockLength : 0;

  await database.prepare(
    `INSERT INTO admin_attempts (client_key, failures, window_start, blocked_until)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(client_key) DO UPDATE SET
       failures = excluded.failures,
       window_start = excluded.window_start,
       blocked_until = excluded.blocked_until`
  ).bind(clientKey, failures, windowStart, blockedUntil).run();
}

function normalizePricingPayload(payload) {
  if (!payload || typeof payload !== "object" || !payload.vehicles) {
    throw new Error("Missing vehicle pricing.");
  }

  const suppliedKeys = Object.keys(payload.vehicles).sort();
  const expectedKeys = VEHICLE_KEYS.slice().sort();
  if (JSON.stringify(suppliedKeys) !== JSON.stringify(expectedKeys)) {
    throw new Error("The vehicle list is invalid.");
  }

  const normalized = {};
  VEHICLE_KEYS.forEach((vehicleKey) => {
    const vehicle = payload.vehicles[vehicleKey];
    if (!vehicle || typeof vehicle !== "object") {
      throw new Error("Missing pricing for " + vehicleKey + ".");
    }

    normalized[vehicleKey] = {};
    PRICE_FIELDS.forEach((field) => {
      const value = Number(vehicle[field]);
      if (!Number.isFinite(value) || value < 0 || value > MAX_RATE) {
        throw new Error("Invalid " + field + " rate for " + vehicleKey + ".");
      }
      normalized[vehicleKey][field] = Math.round(value * 100) / 100;
    });
  });

  const fuelSurchargePercent = Number(payload.fuelSurchargePercent);
  if (!Number.isFinite(fuelSurchargePercent) || fuelSurchargePercent < 0 || fuelSurchargePercent > MAX_PERCENT) {
    throw new Error("Invalid fuel surcharge percentage.");
  }

  // TCV always follows the complete Truck price schedule.
  normalized.tempConVan = { ...normalized.truck };

  return {
    vehicles: normalized,
    fuelSurchargePercent: Math.round(fuelSurchargePercent * 100) / 100
  };
}

async function readPricing(database) {
  const result = await database.prepare(
    `SELECT vehicle_key, label, base, mileage, international, am_pm, weekend, holiday,
            additional_stop, wait_minute, pallet_jack, second_man_mile, pick_hold, hazmat,
            updated_at
     FROM vehicle_pricing
     ORDER BY vehicle_key`
  ).all();

  const fuelSetting = await database.prepare(
    `SELECT setting_value, updated_at
     FROM pricing_settings
     WHERE setting_key = 'fuel_surcharge_percent'`
  ).first();

  if (!result.results || result.results.length !== VEHICLE_KEYS.length || !fuelSetting) {
    throw new Error("Vehicle pricing has not been initialized.");
  }

  const vehicles = {};
  let updatedAt = null;
  result.results.forEach((row) => {
    vehicles[row.vehicle_key] = {
      label: row.label,
      base: Number(row.base),
      mileage: Number(row.mileage),
      international: Number(row.international),
      amPm: Number(row.am_pm),
      weekend: Number(row.weekend),
      holiday: Number(row.holiday),
      additionalStop: Number(row.additional_stop),
      waitMinute: Number(row.wait_minute),
      palletJack: Number(row.pallet_jack),
      secondManMile: Number(row.second_man_mile),
      pickHold: Number(row.pick_hold),
      hazmat: Number(row.hazmat)
    };
    if (!updatedAt || row.updated_at > updatedAt) updatedAt = row.updated_at;
  });

  if (!updatedAt || fuelSetting.updated_at > updatedAt) updatedAt = fuelSetting.updated_at;

  return {
    version: 23,
    updatedAt,
    fuelSurchargePercent: Number(fuelSetting.setting_value),
    vehicles
  };
}

async function handleGetPricing(env) {
  if (!env.DB) {
    return jsonResponse({ error: "The pricing database is not configured." }, 503);
  }
  return jsonResponse(await readPricing(env.DB), 200);
}

async function handleUpdatePricing(request, env) {
  if (!env.DB || !env.ADMIN_PIN) {
    return jsonResponse({ error: "The pricing service is not fully configured." }, 503);
  }

  const requestUrl = new URL(request.url);
  const origin = request.headers.get("Origin");
  if (origin && origin !== requestUrl.origin) {
    return jsonResponse({ error: "Cross-site pricing updates are not allowed." }, 403);
  }

  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > 32768) {
    return jsonResponse({ error: "The pricing request is too large." }, 413);
  }

  const clientKey = await clientRateLimitKey(request);
  if (await isUpdateBlocked(env.DB, clientKey)) {
    return jsonResponse({ error: "Too many incorrect PIN attempts. Try again in 15 minutes." }, 429);
  }

  const suppliedPin = request.headers.get("X-Admin-Pin") || "";
  if (!await securePinMatch(suppliedPin, String(env.ADMIN_PIN))) {
    await recordFailedPin(env.DB, clientKey);
    return jsonResponse({ error: "The administrator PIN is incorrect." }, 401);
  }

  await env.DB.prepare("DELETE FROM admin_attempts WHERE client_key = ?").bind(clientKey).run();

  let payload;
  try {
    payload = await request.json();
  } catch (error) {
    return jsonResponse({ error: "The pricing request is not valid JSON." }, 400);
  }

  let normalized;
  try {
    normalized = normalizePricingPayload(payload);
  } catch (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  const previous = await readPricing(env.DB);
  const changedAt = new Date().toISOString();
  const statements = [];

  VEHICLE_KEYS.forEach((vehicleKey) => {
    const next = normalized.vehicles[vehicleKey];
    statements.push(
      env.DB.prepare(
        `UPDATE vehicle_pricing
         SET base = ?, mileage = ?, international = ?, am_pm = ?, weekend = ?, holiday = ?,
             additional_stop = ?, wait_minute = ?, pallet_jack = ?, second_man_mile = ?,
             pick_hold = ?, hazmat = ?, updated_at = ?
         WHERE vehicle_key = ?`
      ).bind(
        next.base,
        next.mileage,
        next.international,
        next.amPm,
        next.weekend,
        next.holiday,
        next.additionalStop,
        next.waitMinute,
        next.palletJack,
        next.secondManMile,
        next.pickHold,
        next.hazmat,
        changedAt,
        vehicleKey
      )
    );
    statements.push(
      env.DB.prepare(
        `INSERT INTO pricing_audit (vehicle_key, previous_values, new_values, changed_at)
         VALUES (?, ?, ?, ?)`
      ).bind(
        vehicleKey,
        JSON.stringify(previous.vehicles[vehicleKey]),
        JSON.stringify(next),
        changedAt
      )
    );
  });

  statements.push(
    env.DB.prepare(
      `INSERT INTO pricing_settings (setting_key, setting_value, updated_at)
       VALUES ('fuel_surcharge_percent', ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET
         setting_value = excluded.setting_value,
         updated_at = excluded.updated_at`
    ).bind(normalized.fuelSurchargePercent, changedAt)
  );
  statements.push(
    env.DB.prepare(
      `INSERT INTO pricing_audit (vehicle_key, previous_values, new_values, changed_at)
       VALUES ('__global__', ?, ?, ?)`
    ).bind(
      JSON.stringify({ fuelSurchargePercent: previous.fuelSurchargePercent }),
      JSON.stringify({ fuelSurchargePercent: normalized.fuelSurchargePercent }),
      changedAt
    )
  );

  await env.DB.batch(statements);
  return jsonResponse(await readPricing(env.DB), 200);
}

async function serveStaticAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "same-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if ((headers.get("Content-Type") || "").includes("text/html")) {
    headers.set("Cache-Control", "no-cache");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/pricing") {
        if (request.method === "GET") return await handleGetPricing(env);
        if (request.method === "PUT") return await handleUpdatePricing(request, env);
        return jsonResponse({ error: "Method not allowed." }, 405);
      }

      return await serveStaticAsset(request, env);
    } catch (error) {
      console.error("Pricing service error:", error.message);
      return jsonResponse({ error: "The pricing service encountered an error." }, 500);
    }
  }
};
