// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, afterEach } from "vitest";
import Pagination from "@/components/admin/Pagination";

afterEach(cleanup);

describe("Pagination", () => {
  it("shows correct range text", () => {
    render(<Pagination page={1} limit={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText("Showing 1-20 of 50")).toBeInTheDocument();
  });

  it("shows correct range on page 2", () => {
    render(<Pagination page={2} limit={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText("Showing 21-40 of 50")).toBeInTheDocument();
  });

  it("caps 'to' at total on last page", () => {
    render(<Pagination page={3} limit={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByText("Showing 41-50 of 50")).toBeInTheDocument();
  });

  it("returns null when total is 0", () => {
    const { container } = render(
      <Pagination page={1} limit={20} total={0} onPageChange={vi.fn()} />
    );
    expect(container.innerHTML).toBe("");
  });

  it("prev button disabled on page 1", () => {
    render(<Pagination page={1} limit={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
  });

  it("next button disabled on last page", () => {
    render(<Pagination page={3} limit={20} total={50} onPageChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
  });

  it("prev button calls onPageChange with page - 1", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={2} limit={20} total={50} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("next button calls onPageChange with page + 1", async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();
    render(<Pagination page={1} limit={20} total={50} onPageChange={onPageChange} />);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
