import { ImageResponse } from "next/og";

export const runtime = "edge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ size: string }> },
) {
  const { size: rawSize } = await params;
  const size = rawSize === "192" ? 192 : rawSize === "512" ? 512 : null;
  if (!size) return new Response("Not found", { status: 404 });
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#18332d",
        color: "#fffaf0",
        display: "flex",
        fontFamily: "sans-serif",
        fontSize: size * 0.5,
        fontWeight: 800,
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      R
    </div>,
    { height: size, width: size },
  );
}
