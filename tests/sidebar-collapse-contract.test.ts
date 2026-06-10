import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");
const sidebarComponent = readFileSync("components/chat/ThreadSidebar.tsx", "utf8");

describe("sidebar collapse contract", () => {
  it("does not keep the desktop sidebar expanded because a child control has focus", () => {
    const mobileBlockStart = css.indexOf("@media (max-width: 680px)");
    const desktopAndTabletCss = mobileBlockStart === -1 ? css : css.slice(0, mobileBlockStart);

    expect(desktopAndTabletCss).not.toContain(".thread-sidebar:focus-within");
    expect(desktopAndTabletCss).not.toContain(":not(:focus-within)");
    expect(sidebarComponent).not.toContain("onFocus=");
    expect(sidebarComponent).not.toContain("onBlur=");
  });
});
