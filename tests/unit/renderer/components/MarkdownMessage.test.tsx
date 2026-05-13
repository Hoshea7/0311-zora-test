import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";
import { MarkdownMessage } from "@/renderer/components/chat/MarkdownMessage";

describe("MarkdownMessage links", () => {
  it("opens absolute links through the external browser bridge", () => {
    render(<MarkdownMessage content="[Docs](https://example.com/path?q=1)" />);

    const link = screen.getByRole("link", { name: "Docs" });
    expect(link).toHaveAttribute("target", "_blank");

    fireEvent.click(link);

    expect(vi.mocked(window.zora.openExternal)).toHaveBeenCalledWith(
      "https://example.com/path?q=1"
    );
  });

  it("keeps anchor links inside the markdown document", () => {
    render(<MarkdownMessage content="[Jump](#section)" />);

    const link = screen.getByRole("link", { name: "Jump" });
    expect(link).not.toHaveAttribute("target");

    fireEvent.click(link);

    expect(vi.mocked(window.zora.openExternal)).not.toHaveBeenCalled();
  });
});
