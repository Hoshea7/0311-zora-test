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

describe("MarkdownMessage lists", () => {
  it("reserves internal marker space for ordered lists with two-digit numbers", () => {
    const items = Array.from({ length: 12 }, (_, index) => `${index + 1}. 项目 ${index + 1}`);

    render(<MarkdownMessage content={items.join("\n")} />);

    const orderedList = screen.getByRole("list");
    expect(orderedList).toHaveClass("list-outside", "list-decimal", "pl-8");
    expect(orderedList).not.toHaveClass("ml-5");
    expect(screen.getByText("项目 12")).toBeInTheDocument();
  });

  it("keeps task lists unindented when marker spacing is disabled", () => {
    render(<MarkdownMessage content="- [ ] 待处理\n- [x] 已完成" />);

    const taskList = screen.getByRole("list");
    expect(taskList).toHaveClass("list-none", "pl-0");
    expect(taskList).not.toHaveClass("pl-6");
  });
});
