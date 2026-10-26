
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DRIVE_FOLDER_ID =
  Deno.env.get("DRIVE_FOLDER_ID") ??
  "1isCd2dafL7R15VYQMbLqGaXO-Wq1kIdF";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY =
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_SERVICE_ACCOUNT_JSON =
  Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON")!;
const DRIVE_SYNC_WEBHOOK_SECRET =
  Deno.env.get("DRIVE_SYNC_WEBHOOK_SECRET")!;

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

function base64Url(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function encodeJson(value: unknown): string {
  return base64Url(
    new TextEncoder().encode(JSON.stringify(value)),
  );
}

function pemToBytes(pem: string): Uint8Array {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  return Uint8Array.from(
    atob(base64),
    (character) => character.charCodeAt(0),
  );
}

async function getGoogleAccessToken(): Promise<string> {
  const serviceAccount = JSON.parse(
    GOOGLE_SERVICE_ACCOUNT_JSON,
  );

  const now = Math.floor(Date.now() / 1000);

  const header = encodeJson({
    alg: "RS256",
    typ: "JWT",
  });

  const claims = encodeJson({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  });

  const unsignedToken = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(serviceAccount.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(unsignedToken),
    ),
  );

  const assertion =
    `${unsignedToken}.${base64Url(signature)}`;

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type:
          "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(
      `Google token request failed: ${await response.text()}`,
    );
  }

  const tokenData = await response.json();

  if (!tokenData.access_token) {
    throw new Error(
      "Google did not return an access token.",
    );
  }

  return tokenData.access_token;
}

type DriveFile = {
  id: string;
  name: string;
  webViewLink?: string;
  createdTime?: string;
  mimeType?: string;
};

async function listDriveFiles(
  accessToken: string,
): Promise<DriveFile[]> {
  const files: DriveFile[] = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({
      q: `'${DRIVE_FOLDER_ID}' in parents and trashed = false`,
      pageSize: "1000",
      orderBy: "createdTime",
      fields:
        "nextPageToken,files(id,name,webViewLink,createdTime,mimeType)",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });

    if (pageToken) {
      params.set("pageToken", pageToken);
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!response.ok) {
      throw new Error(
        `Google Drive list failed: ${await response.text()}`,
      );
    }

    const page = await response.json();

    files.push(...(page.files ?? []));
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);

  return files;
}

/**
 * Supported examples:
 * N64SG.pdf             -> N64SG
 * N64SG scan.pdf        -> N64SG
 * N64SG_2026.pdf        -> N64SG
 * PO-2026-00125.pdf     -> PO-2026-00125
 *
 * The filename must start with the record code.
 */
function extractPresOfficeCode(
  filename: string,
): string | null {
  const stem = filename
    .replace(/\.[^.]+$/, "")
    .trim();

  // Preserve the full hyphenated code, if present.
  const match = stem.match(
    /^([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)/,
  );

  return match?.[1]?.toUpperCase() ?? null;
}

function normalizeCode(value: unknown): string {
  return typeof value === "string"
    ? value.trim().toUpperCase()
    : "";
}

function driveFileUrl(file: DriveFile): string {
  return (
    file.webViewLink ??
    `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return Response.json(
      { error: "Use POST." },
      { status: 405 },
    );
  }

  if (
    !DRIVE_SYNC_WEBHOOK_SECRET ||
    request.headers.get("x-sync-secret") !==
      DRIVE_SYNC_WEBHOOK_SECRET
  ) {
    return Response.json(
      { error: "Unauthorized." },
      { status: 401 },
    );
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !GOOGLE_SERVICE_ACCOUNT_JSON ||
    !DRIVE_FOLDER_ID
  ) {
    return Response.json(
      { error: "Required server secrets are missing." },
      { status: 500 },
    );
  }

  try {
    const googleToken = await getGoogleAccessToken();
    const files = await listDriveFiles(googleToken);

    const summary = {
      success: true,
      files_seen: files.length,
      matched: 0,
      unmatched: 0,
      ambiguous: 0,
      errors: 0,
      skipped: 0,
    };

    for (const file of files) {
      try {
        if (
          !file.id ||
          !file.name ||
          file.mimeType ===
            "application/vnd.google-apps.folder"
        ) {
          summary.skipped++;
          continue;
        }

        const code = extractPresOfficeCode(file.name);

        let matchStatus:
          | "matched"
          | "unmatched"
          | "ambiguous" = "unmatched";

        let matchNote: string | null = null;
        let receivingRecordId: string | null = null;

        if (!code) {
          matchNote =
            "Filename must begin with the PresOffice code.";
        } else {
          /*
           * Search the known code fields. ilike is used
           * without wildcards for a case-insensitive exact
           * match. The code parser restricts characters.
           */
          const { data: records, error: recordError } =
            await supabase
              .from("receiving_records")
              .select(
                "id,reference_number,system_code,document_code,serial_number",
              )
              .or(
                [
                  `reference_number.ilike.${code}`,
                  `system_code.ilike.${code}`,
                  `document_code.ilike.${code}`,
                  `serial_number.ilike.${code}`,
                ].join(","),
              );

          if (recordError) {
            throw recordError;
          }

          const uniqueRecords = new Map<
            string,
            (typeof records)[number]
          >();

          for (const record of records ?? []) {
            const values = [
              record.reference_number,
              record.system_code,
              record.document_code,
              record.serial_number,
            ].map(normalizeCode);

            if (values.includes(code)) {
              uniqueRecords.set(record.id, record);
            }
          }

          if (uniqueRecords.size === 1) {
            matchStatus = "matched";
            receivingRecordId =
              [...uniqueRecords.keys()][0];
            matchNote =
              "Unique exact PresOffice code match.";
          } else if (uniqueRecords.size > 1) {
            matchStatus = "ambiguous";
            matchNote =
              `Code matches ${uniqueRecords.size} receiving records; manual review required.`;
          } else {
            matchNote =
              `No exact match found for code ${code} in reference_number, system_code, document_code, or serial_number.`;
          }
        }

        const now = new Date().toISOString();
        const fileUrl = driveFileUrl(file);

        const { error: documentError } = await supabase
          .from("receiving_record_documents")
          .upsert(
            {
              google_file_id: file.id,
              google_file_name: file.name,
              google_web_view_link: fileUrl,
              presoffice_code: code,
              receiving_record_id: receivingRecordId,
              match_status: matchStatus,
              match_note: matchNote,
              drive_created_time:
                file.createdTime ?? null,
              last_checked_at: now,
              updated_at: now,
            },
            { onConflict: "google_file_id" },
          );

        if (documentError) {
          throw documentError;
        }

        if (
          matchStatus === "matched" &&
          receivingRecordId
        ) {
          const { error: updateError } = await supabase
            .from("receiving_records")
            .update({
              scan_file_url: fileUrl,
              updated_at: now,
            })
            .eq("id", receivingRecordId);

          if (updateError) {
            throw updateError;
          }

          summary.matched++;
        } else if (matchStatus === "ambiguous") {
          summary.ambiguous++;
        } else {
          summary.unmatched++;
        }
      } catch (error) {
        summary.errors++;

        console.error(
          `Failed to process Drive file "${file.name}":`,
          error,
        );
      }
    }

    return Response.json(summary);
  } catch (error) {
    console.error("Drive sync failed:", error);

    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Drive sync failed.",
      },
      { status: 500 },
    );
  }
});
