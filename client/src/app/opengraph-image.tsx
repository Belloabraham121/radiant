import { ImageResponse } from "next/og";
import { siteName, siteShareDescription, siteTitle } from "@/lib/site-metadata";

export const alt = siteName;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "#faf6ec",
          color: "#1b1610",
          border: "12px solid #1b1610",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          <div
            style={{
              width: 120,
              height: 120,
              borderRadius: 32,
              background: "#ffb01f",
              border: "6px solid #1b1610",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#1b1610",
              fontSize: 64,
              fontWeight: 800,
            }}
          >
            R
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: "-0.04em" }}>
              {siteName}
            </div>
            <div style={{ fontSize: 28, fontWeight: 600, color: "#ffb01f" }}>
              Acts · remembers · builds · earns
            </div>
          </div>
        </div>

        <div
          style={{
            fontSize: 34,
            lineHeight: 1.45,
            fontWeight: 500,
            maxWidth: 980,
          }}
        >
          {siteShareDescription}
        </div>

        <div style={{ fontSize: 24, fontWeight: 700, color: "#1b1610" }}>
          {siteTitle}
        </div>
      </div>
    ),
    size,
  );
}
