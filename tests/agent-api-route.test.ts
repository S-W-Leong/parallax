import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/routes", () => {
  return {
    handleAgentRoute: vi.fn(),
    handleAgentRouteStream: vi.fn(),
  };
});

const { POST } = await import("@/app/api/agent/route");
const { handleAgentRoute, handleAgentRouteStream } = await import("@/lib/agent/routes");
const mockedHandleAgentRoute = vi.mocked(handleAgentRoute);
const mockedHandleAgentRouteStream = vi.mocked(handleAgentRouteStream);

describe("/api/agent route", () => {
  beforeEach(() => {
    mockedHandleAgentRoute.mockReset();
    mockedHandleAgentRouteStream.mockReset();
  });

  it("keeps returning JSON when streaming is not requested", async () => {
    mockedHandleAgentRoute.mockResolvedValueOnce({
      message: "JSON still works.",
      trace: [],
      artifact: null,
      error: null,
    });

    const response = await POST(new Request("http://localhost/api/agent", {
      method: "POST",
      body: JSON.stringify({ mode: "chat", message: "Hi", messages: [] }),
    }));

    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({
      message: "JSON still works.",
      trace: [],
      artifact: null,
      error: null,
    });
    expect(mockedHandleAgentRouteStream).not.toHaveBeenCalled();
  });

  it("returns an SSE response when requested with Accept", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("event: status\ndata: {\"type\":\"status\",\"message\":\"Thinking...\"}\n\n"));
        controller.close();
      },
    });
    mockedHandleAgentRouteStream.mockReturnValueOnce(stream);

    const response = await POST(new Request("http://localhost/api/agent", {
      method: "POST",
      headers: { accept: "text/event-stream" },
      body: JSON.stringify({ mode: "chat", message: "Hi", messages: [] }),
    }));

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain("event: status");
    expect(mockedHandleAgentRouteStream).toHaveBeenCalledWith(
      { mode: "chat", message: "Hi", messages: [] },
      { signal: expect.any(AbortSignal) },
    );
    expect(mockedHandleAgentRoute).not.toHaveBeenCalled();
  });

  it("returns an SSE response when requested with a stream body flag", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    mockedHandleAgentRouteStream.mockReturnValueOnce(stream);

    const response = await POST(new Request("http://localhost/api/agent", {
      method: "POST",
      body: JSON.stringify({ mode: "chat", message: "Hi", messages: [], stream: true }),
    }));

    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(mockedHandleAgentRouteStream).toHaveBeenCalledWith(
      { mode: "chat", message: "Hi", messages: [] },
      { signal: expect.any(AbortSignal) },
    );
  });
});
